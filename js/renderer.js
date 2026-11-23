// WebGL compositor. Renders a project (surfaces with perspective-correct
// mapping, masks, effects, media, calibration) into any canvas: the editor,
// the projector output window, the recorder and the thumbnail generator.

import { createContext, createProgram, createTexture, uploadTexture, createFramebuffer, stageMatrix, gpuInfo } from './gl.js';
import {
  VERT_SURFACE,
  VERT_SIMPLE,
  header,
  NOISE,
  EFFECT_UNIFORMS,
  PIPELINE,
  MEDIA_CONTENT,
  MASK_CONTENT,
  FRAG_SOLID,
  FRAG_CALIB,
  FRAG_SIMULATE,
  FRAG_TEXTURE,
} from '../shaders/common.js';
import { effectSource, EFFECT_MAP, NEUTRAL, PARAM_DEFS } from './effects.js';
import { buildGeometry, surfaceOutline } from './mapping.js';
import { evaluateSurface } from './state.js';
import { hexToRgb } from './utils.js';

export const PATTERNS = {
  none: 0,
  grid: 1,
  checker: 2,
  white: 3,
  black: 4,
  red: 5,
  green: 6,
  blue: 7,
  bars: 8,
  ramp: 9,
};

const BLEND = {
  normal: (gl) => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA),
  add: (gl) => gl.blendFunc(gl.ONE, gl.ONE),
  screen: (gl) => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR),
  multiply: (gl) => gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA),
};

export class Renderer {
  constructor(canvas, { media = null, quality = 1, preserveDrawingBuffer = false, antialias = true, onLost = null, onRestored = null } = {}) {
    this.canvas = canvas;
    this.media = media;
    this.quality = quality;
    this.onLost = onLost;
    this.onRestored = onRestored;
    const { gl, isWebGL2 } = createContext(canvas, { preserveDrawingBuffer, antialias });
    this.gl = gl;
    this.isWebGL2 = isWebGL2;
    this.ok = !!gl;
    this.lost = false;
    this.errors = new Map();
    this.stats = { draws: 0, surfaces: 0 };
    if (!gl) return;
    this.info = gpuInfo(gl);
    this.maxTexture = this.info.maxTexture || 4096;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this._resetResources();
      this.onLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this._initResources();
      this.onRestored?.();
    });
    this._initResources();
  }

  _resetResources() {
    this.programs = new Map();
    this.textures = new Map();
    this.fbo = null;
  }

  _initResources() {
    const gl = this.gl;
    this._resetResources();
    this.vbo = gl.createBuffer();
    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    this.lineBuf = gl.createBuffer();
    this.polyArr = new Float32Array(96);
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    if (!this.gl) return;
    for (const p of this.programs.values()) if (p) this.gl.deleteProgram(p.prog);
    this.programs.clear();
    this.errors.clear();
  }

  resize(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  // ------------------------------------------------------------------ programs

  _program(key) {
    if (this.programs.has(key)) return this.programs.get(key);
    const gl = this.gl;
    let prog = null;
    try {
      const [kind, id] = key.split(':');
      const H = header(this.quality);
      if (kind === 'fx') {
        prog = createProgram(gl, VERT_SURFACE, H + NOISE + EFFECT_UNIFORMS + effectSource(id) + `\nvec4 content(vec2 uv) { return effect(uv); }\n` + PIPELINE);
      } else if (kind === 'media') {
        prog = createProgram(gl, VERT_SURFACE, H + NOISE + EFFECT_UNIFORMS + MEDIA_CONTENT + PIPELINE);
      } else if (kind === 'mask') {
        prog = createProgram(gl, VERT_SURFACE, H + NOISE + EFFECT_UNIFORMS + MASK_CONTENT + PIPELINE);
      } else if (kind === 'solid') {
        prog = createProgram(gl, VERT_SIMPLE, FRAG_SOLID);
      } else if (kind === 'calib') {
        prog = createProgram(gl, VERT_SIMPLE, FRAG_CALIB);
      } else if (kind === 'sim') {
        prog = createProgram(gl, VERT_SIMPLE, FRAG_SIMULATE);
      } else if (kind === 'tex') {
        prog = createProgram(gl, VERT_SIMPLE, FRAG_TEXTURE);
      }
    } catch (err) {
      if (!this.errors.has(key)) {
        console.error(err);
        this.errors.set(key, err.message);
      }
      prog = null;
    }
    this.programs.set(key, prog);
    return prog;
  }

  /** Pre-compiles programs so the first frame of a demo does not stutter. */
  warmup(effectIds = Object.keys(EFFECT_MAP)) {
    if (!this.ok || this.lost) return;
    for (const id of effectIds) this._program(`fx:${id}`);
    ['media', 'mask', 'solid', 'calib', 'sim', 'tex'].forEach((k) => this._program(`${k}:`));
  }

  // ------------------------------------------------------------------ textures

  _texture(key) {
    if (!this.media || !key) return null;
    const frame = this.media.frame(key);
    if (!frame || !frame.source) return null;
    const gl = this.gl;
    let entry = this.textures.get(key);
    if (!entry) {
      entry = { tex: createTexture(gl), version: -1, w: 1, h: 1, used: 0 };
      this.textures.set(key, entry);
    }
    entry.used = performance.now();
    if (entry.version !== frame.version) {
      try {
        uploadTexture(gl, entry.tex, frame.source);
        entry.version = frame.version;
        entry.w = frame.width;
        entry.h = frame.height;
      } catch (err) {
        // Video not ready yet / decode error: keep the last frame.
        if (!entry.warned) {
          console.warn('Falha ao enviar textura', key, err);
          entry.warned = true;
        }
      }
    }
    return entry;
  }

  /** Deletes GPU textures that have not been used for a while. */
  collectGarbage(maxIdleMs = 15000) {
    if (!this.gl || this.lost) return;
    const now = performance.now();
    for (const [k, e] of this.textures) {
      if (now - e.used > maxIdleMs) {
        this.gl.deleteTexture(e.tex);
        this.textures.delete(k);
      }
    }
  }

  dropTexture(key) {
    const e = this.textures.get(key);
    if (e && this.gl) this.gl.deleteTexture(e.tex);
    this.textures.delete(key);
  }

  // ------------------------------------------------------------------ drawing

  _bindGeometry(verts) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
  }

  _bindQuad() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.disableVertexAttribArray(1);
  }

  _setSurfaceUniforms(p, geo, surface, ctx, layerAlpha, isMask) {
    const gl = this.gl;
    gl.uniformMatrix3fv(p.u('uView'), false, ctx.view);
    gl.uniform1f(p.u('uTime'), ctx.clock % 3600);
    gl.uniform2f(p.u('uRes'), ctx.res[0], ctx.res[1]);
    gl.uniform2f(p.u('uSizePx'), Math.max(1, geo.sizePx[0]), Math.max(1, geo.sizePx[1]));
    gl.uniform1f(p.u('uAspect'), geo.aspect || 1);
    gl.uniform1f(p.u('uOpacity'), layerAlpha);
    gl.uniform1i(p.u('uShape'), geo.shape);
    gl.uniform1f(p.u('uFeather'), Math.max(0, surface.feather || 0) * ctx.featherScale);
    if (geo.shape === 3 && geo.poly) {
      const arr = this.polyArr;
      arr.fill(0);
      geo.poly.forEach((pt, i) => {
        arr[i * 2] = pt[0];
        arr[i * 2 + 1] = pt[1];
      });
      gl.uniform4fv(p.u('uPoly'), arr);
      gl.uniform1f(p.u('uPolyN'), geo.poly.length);
    } else {
      gl.uniform1f(p.u('uPolyN'), 0);
    }
    const adj = surface.adjust || {};
    gl.uniform4f(p.u('uAdjust'), adj.brightness || 0, adj.contrast ?? 1, adj.saturation ?? 1, ((adj.hue || 0) * Math.PI) / 180);
    gl.uniform1f(p.u('uIsMask'), isMask ? 1 : 0);
    gl.uniform4f(p.u('uAudio'), ctx.audio[0], ctx.audio[1], ctx.audio[2], ctx.audio[3]);
    gl.uniform1f(p.u('uReact'), surface.audioReact || 0);
  }

  _setEffectParams(p, content, intensityMul) {
    const gl = this.gl;
    const fx = EFFECT_MAP[content.effect];
    const params = content.params || {};
    for (const key of Object.keys(PARAM_DEFS)) {
      const def = PARAM_DEFS[key];
      const exposed = fx && fx.params[key];
      let v = params[key] ?? (exposed ? exposed.d : NEUTRAL[key]);
      if (def.type === 'color') {
        const c = hexToRgb(v);
        gl.uniform3f(p.u(def.uniform), c[0], c[1], c[2]);
      } else {
        if (key === 'direction') v = (v * Math.PI) / 180;
        if (key === 'intensity') v *= intensityMul;
        gl.uniform1f(p.u(def.uniform), +v || 0);
      }
    }
  }

  _setXform(p, surface, geo, mediaAspect) {
    const gl = this.gl;
    const tr = surface.transform || {};
    let sx = 1;
    let sy = 1;
    if (mediaAspect && tr.fit !== 'stretch') {
      const sa = geo.aspect || 1;
      const wider = mediaAspect > sa;
      if (tr.fit === 'contain') {
        if (wider) sy = sa / mediaAspect;
        else sx = mediaAspect / sa;
      } else if (wider) sx = mediaAspect / sa;
      else sy = sa / mediaAspect;
    }
    const k = tr.scale || 1;
    gl.uniform4f(p.u('uXform'), sx * k, sy * k, tr.x || 0, tr.y || 0);
    gl.uniform3f(p.u('uXform2'), ((tr.rotation || 0) * Math.PI) / 180, tr.flipX ? 1 : 0, tr.flipY ? 1 : 0);
  }

  _drawSurfaceLayer(surface, geo, layer, ctx, opacity, intensityMul) {
    const gl = this.gl;
    const isMask = surface.role === 'mask';
    let p;
    let texEntry = null;
    let mediaAspect = null;
    if (isMask) p = this._program('mask:');
    else if (layer.content.type === 'effect') p = this._program(`fx:${layer.content.effect}`);
    else if (layer.content.type === 'media') {
      texEntry = this._texture(layer.content.mediaId);
      if (!texEntry) return;
      mediaAspect = texEntry.w / Math.max(1, texEntry.h);
      p = this._program('media:');
    }
    if (!p) return;
    gl.useProgram(p.prog);
    this._setSurfaceUniforms(p, geo, surface, ctx, opacity * layer.alpha, isMask);
    if (!isMask && layer.content.type === 'effect') this._setEffectParams(p, layer.content, intensityMul);
    this._setXform(p, surface, geo, mediaAspect);
    if (texEntry) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texEntry.tex);
      gl.uniform1i(p.u('uTex'), 0);
      gl.uniform1f(p.u('uTile'), surface.transform?.tile ? 1 : 0);
    }
    (BLEND[isMask ? 'normal' : surface.blend] || BLEND.normal)(gl);
    gl.drawArrays(gl.TRIANGLES, 0, geo.count);
    this.stats.draws++;
  }

  _drawInvertedMask(surface, geo, ctx, opacity) {
    const gl = this.gl;
    const p = this._program('mask:');
    const solid = this._program('solid:');
    if (!p || !solid) return;
    gl.enable(gl.STENCIL_TEST);
    gl.clearStencil(0);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.colorMask(false, false, false, false);
    gl.useProgram(p.prog);
    this._setSurfaceUniforms(p, geo, { ...surface, feather: 0 }, ctx, 1, true);
    this._setXform(p, surface, geo, null);
    gl.drawArrays(gl.TRIANGLES, 0, geo.count);
    gl.colorMask(true, true, true, true);
    gl.stencilFunc(gl.EQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.useProgram(solid.prog);
    this._bindQuad();
    gl.uniformMatrix3fv(solid.u('uView'), false, ctx.view);
    gl.uniform4f(solid.u('uColor'), 0, 0, 0, opacity);
    BLEND.normal(gl);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.STENCIL_TEST);
    this.stats.draws += 2;
  }

  _drawSurfaces(project, ctx) {
    const res = ctx.res;
    for (const surface of project.surfaces) {
      if (ctx.solo && surface.id !== ctx.solo) continue;
      const ev = evaluateSurface(surface, ctx.t, ctx.clock, res);
      if (!ev) continue;
      const geo = buildGeometry(surface, ev.points, res);
      if (!geo || !geo.count) continue;
      this._bindGeometry(geo.verts);
      this.stats.surfaces++;
      if (surface.role === 'mask' && surface.invert) {
        this._drawInvertedMask(surface, geo, ctx, ev.opacity);
        continue;
      }
      for (const layer of ev.layers) this._drawSurfaceLayer(surface, geo, layer, ctx, ev.opacity, ev.intensity);
    }
  }

  _drawLines(segments, color, widthPx, ctx) {
    if (!segments.length) return;
    const gl = this.gl;
    const p = this._program('solid:');
    if (!p) return;
    const [W, H] = ctx.res;
    const hw = widthPx / 2;
    const data = [];
    for (const [a, b] of segments) {
      const ax = a[0] * W;
      const ay = a[1] * H;
      const bx = b[0] * W;
      const by = b[1] * H;
      let nx = -(by - ay);
      let ny = bx - ax;
      const l = Math.hypot(nx, ny) || 1;
      nx = (nx / l) * hw;
      ny = (ny / l) * hw;
      const ex = ((bx - ax) / l) * hw;
      const ey = ((by - ay) / l) * hw;
      const q = [
        [ax + nx - ex, ay + ny - ey],
        [bx + nx + ex, by + ny + ey],
        [bx - nx + ex, by - ny + ey],
        [ax - nx - ex, ay - ny - ey],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) data.push(q[i][0] / W, q[i][1] / H);
    }
    gl.useProgram(p.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.disableVertexAttribArray(1);
    gl.uniformMatrix3fv(p.u('uView'), false, ctx.view);
    gl.uniform4f(p.u('uColor'), color[0], color[1], color[2], color[3] ?? 1);
    BLEND.normal(gl);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 2);
    this.stats.draws++;
  }

  _drawCalibration(project, ctx, cal) {
    const gl = this.gl;
    const pattern = PATTERNS[cal.pattern] || 0;
    if (pattern) {
      const p = this._program('calib:');
      if (p) {
        gl.useProgram(p.prog);
        this._bindQuad();
        gl.uniformMatrix3fv(p.u('uView'), false, ctx.view);
        gl.uniform2f(p.u('uRes'), ctx.res[0], ctx.res[1]);
        gl.uniform1i(p.u('uPattern'), pattern);
        gl.uniform1f(p.u('uGridPx'), Math.max(8, cal.gridPx || 80));
        const c = hexToRgb(cal.color || '#00e5ff');
        gl.uniform3f(p.u('uLineColor'), c[0], c[1], c[2]);
        BLEND.normal(gl);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.stats.draws++;
      }
    }
    if (cal.outlines || cal.vertices) {
      const lw = Math.max(1.5, ctx.res[0] / 900);
      for (const s of project.surfaces) {
        if (!s.visible) continue;
        const outline = surfaceOutline(s, s.points, 64);
        const isSel = s.id === cal.selectedId;
        const color = isSel ? [1, 0.85, 0.1, 1] : s.role === 'mask' ? [1, 0.3, 0.4, 1] : hexToRgb(cal.color || '#00e5ff').concat(1);
        if (cal.outlines) {
          const segs = outline.map((p, i) => [p, outline[(i + 1) % outline.length]]);
          this._drawLines(segs, color, isSel ? lw * 2 : lw, ctx);
        }
        if (cal.vertices) {
          const r = Math.max(10, ctx.res[0] / 90);
          const segs = [];
          const [W, H] = ctx.res;
          s.points.forEach((p) => {
            segs.push([[p[0] - r / W, p[1]], [p[0] + r / W, p[1]]]);
            segs.push([[p[0], p[1] - r / H], [p[0], p[1] + r / H]]);
            const n = 16;
            for (let i = 0; i < n; i++) {
              const a0 = (i / n) * Math.PI * 2;
              const a1 = ((i + 1) / n) * Math.PI * 2;
              segs.push([
                [p[0] + (Math.cos(a0) * r * 0.6) / W, p[1] + (Math.sin(a0) * r * 0.6) / H],
                [p[0] + (Math.cos(a1) * r * 0.6) / W, p[1] + (Math.sin(a1) * r * 0.6) / H],
              ]);
            }
          });
          this._drawLines(segs, color, lw, ctx);
        }
      }
    }
  }

  _drawTexturedStage(key, view, alpha) {
    const tex = this._texture(key);
    const p = this._program('tex:');
    if (!tex || !p) return;
    const gl = this.gl;
    gl.useProgram(p.prog);
    this._bindQuad();
    gl.uniformMatrix3fv(p.u('uView'), false, view);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex.tex);
    gl.uniform1i(p.u('uTex'), 0);
    gl.uniform1f(p.u('uAlpha'), alpha);
    gl.uniform1f(p.u('uFlipY'), 0);
    BLEND.normal(gl);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * frame = { project, t, clock, stage:{x,y,w,h} (canvas px, top-left origin),
   *           outsideColor, background:{key, opacity}, simulation:{albedoKey, ambient, gain},
   *           calibration:{pattern, outlines, vertices, gridPx, color, selectedId}, blackout, audio, solo, featherScale }
   */
  render(frame) {
    if (!this.ok || this.lost) return false;
    const gl = this.gl;
    if (gl.isContextLost()) return false;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const project = frame.project;
    const res = [project.output.width, project.output.height];
    const stage = frame.stage || { x: 0, y: 0, w: cw, h: ch };
    this.stats.draws = 0;
    this.stats.surfaces = 0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    const oc = frame.outsideColor || [0, 0, 0];
    gl.clearColor(oc[0], oc[1], oc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    // Stage rect in GL (bottom-left origin) for scissoring.
    const sx = Math.floor(Math.max(0, stage.x));
    const sy = Math.floor(Math.max(0, ch - (stage.y + stage.h)));
    const sw = Math.ceil(Math.min(cw, stage.x + stage.w) - sx);
    const sh = Math.ceil(Math.min(ch, ch - stage.y) - sy);
    if (sw <= 0 || sh <= 0) return true;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(sx, sy, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (frame.blackout) {
      gl.disable(gl.SCISSOR_TEST);
      return true;
    }

    const view = stageMatrix(stage, cw, ch);
    const ctx = {
      view,
      res,
      t: frame.t || 0,
      clock: frame.clock || 0,
      audio: frame.audio || [0, 0, 0, 0],
      solo: frame.solo || null,
      featherScale: 1,
    };
    const cal = frame.calibration || null;

    if (frame.simulation) {
      // 1) render the projector image into an offscreen buffer
      const q = this.quality >= 2 ? 1 : this.quality === 1 ? 0.75 : 0.5;
      const fw = Math.min(this.maxTexture, Math.max(64, Math.round(res[0] * q)));
      const fh = Math.min(this.maxTexture, Math.max(64, Math.round(res[1] * q)));
      if (!this.fbo || this.fbo.w !== fw || this.fbo.h !== fh) {
        this.fbo?.dispose();
        this.fbo = createFramebuffer(gl, fw, fh);
      }
      if (this.fbo.ok) {
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.fb);
        gl.viewport(0, 0, fw, fh);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        const fctx = { ...ctx, view: stageMatrix({ x: 0, y: 0, w: fw, h: fh }, fw, fh) };
        this._drawSurfaces(project, fctx);
        if (cal) this._drawCalibration(project, fctx, cal);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, cw, ch);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(sx, sy, sw, sh);
        // 2) composite with the room albedo
        const p = this._program('sim:');
        if (p) {
          const alb = frame.simulation.albedoKey ? this._texture(frame.simulation.albedoKey) : null;
          gl.useProgram(p.prog);
          this._bindQuad();
          gl.uniformMatrix3fv(p.u('uView'), false, view);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.fbo.tex);
          gl.uniform1i(p.u('uLight'), 0);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, alb ? alb.tex : this.fbo.tex);
          gl.uniform1i(p.u('uAlbedo'), 1);
          gl.uniform1f(p.u('uHasAlbedo'), alb ? 1 : 0);
          gl.uniform1f(p.u('uAmbient'), frame.simulation.ambient ?? 0.14);
          gl.uniform1f(p.u('uGain'), frame.simulation.gain ?? 1.25);
          gl.disable(gl.BLEND);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          gl.enable(gl.BLEND);
          gl.activeTexture(gl.TEXTURE0);
        }
        gl.disable(gl.SCISSOR_TEST);
        return true;
      }
    }

    if (frame.background && frame.background.key && frame.background.opacity > 0) {
      this._drawTexturedStage(frame.background.key, view, frame.background.opacity);
    }
    this._drawSurfaces(project, ctx);
    if (cal) this._drawCalibration(project, ctx, cal);
    gl.disable(gl.SCISSOR_TEST);
    return true;
  }

  dispose() {
    if (!this.gl) return;
    const gl = this.gl;
    for (const p of this.programs.values()) if (p) gl.deleteProgram(p.prog);
    for (const e of this.textures.values()) gl.deleteTexture(e.tex);
    this.fbo?.dispose();
    gl.deleteBuffer(this.vbo);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteBuffer(this.lineBuf);
    this.programs.clear();
    this.textures.clear();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.ok = false;
  }
}
