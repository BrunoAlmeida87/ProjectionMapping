// Viewport interaction: drawing surfaces, dragging vertices, moving shapes,
// pan / zoom (mouse wheel, pinch), snapping, magnifier loupe and the 2D
// overlay with handles. Works with mouse, pen and touch (Pointer Events).

import { Emitter, clamp } from './utils.js';
import {
  surfaceOutline,
  pointInPolygon,
  distToSegment,
  rectPoints,
  trianglePoints,
  orderQuad,
  orderTriangle,
  meshFromQuad,
  bbox,
  validPoints,
} from './mapping.js';
import { createSurface, evaluateSurface, hasAnimation } from './state.js';

export const TOOLS = [
  { id: 'select', label: 'Selecionar / editar', icon: 'select', key: 'V' },
  { id: 'pan', label: 'Mover a vista', icon: 'hand', key: 'H' },
  { id: 'quad', label: 'Quadrilátero (toque nos 4 cantos ou arraste)', icon: 'quad', key: 'Q' },
  { id: 'rect', label: 'Retângulo (arraste)', icon: 'rect', key: 'R' },
  { id: 'triangle', label: 'Triângulo (3 pontos ou arraste)', icon: 'triangle', key: 'T' },
  { id: 'polygon', label: 'Polígono (toque nos pontos, feche no 1º)', icon: 'polygon', key: 'P' },
  { id: 'circle', label: 'Círculo (arraste)', icon: 'circle', key: 'C' },
  { id: 'ellipse', label: 'Elipse (arraste)', icon: 'ellipse', key: 'E' },
  { id: 'mesh', label: 'Malha deformável — superfícies curvas (arraste)', icon: 'mesh', key: 'W' },
  { id: 'mask', label: 'Máscara — oculta áreas (toque nos pontos)', icon: 'mask', key: 'M' },
];

const ACCENT = '#22d3ee';
const MASK = '#ff4d6d';
const SEL_VERTEX = '#fbbf24';

export class Editor extends Emitter {
  constructor({ store, viewport, glCanvas, overlay, getRenderScale }) {
    super();
    this.store = store;
    this.viewport = viewport;
    this.glCanvas = glCanvas;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.getRenderScale = getRenderScale || (() => 1);
    this.tool = 'select';
    this.view = { zoom: 1, panX: 0, panY: 0 };
    this.viewAnim = null;
    this.options = { snap: true, grid: false, labels: true, handles: true, loupe: true };
    this.cleanMode = false;
    this.presentation = false;
    this.insets = { right: 0, bottom: 0, top: 0 };
    this.cleanFit = 'fit';
    this.pointers = new Map();
    this.action = null;
    this.gesture = null;
    this.draft = null;
    this.snapPoint = null;
    this.hover = null;
    this.spaceDown = false;
    this.lastTap = { time: 0, x: 0, y: 0 };
    this.cssW = 1;
    this.cssH = 1;
    this.dpr = 1;
    this.timeState = { t: 0, clock: 0 };
    this._bind();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(viewport);
    this.resize();
  }

  // ------------------------------------------------------------------ layout

  resize() {
    const r = this.viewport.getBoundingClientRect();
    this.cssW = Math.max(1, r.width);
    this.cssH = Math.max(1, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ow = Math.round(this.cssW * this.dpr);
    const oh = Math.round(this.cssH * this.dpr);
    if (this.overlay.width !== ow) this.overlay.width = ow;
    if (this.overlay.height !== oh) this.overlay.height = oh;
    this.emit('resize');
  }

  glSize() {
    const s = this.getRenderScale();
    return [Math.round(this.cssW * s), Math.round(this.cssH * s)];
  }

  /** Stage rectangle (output area) in CSS pixels. */
  stage() {
    const { width, height } = this.store.project.output;
    const ar = width / height;
    if (this.cleanMode) {
      if (this.cleanFit === 'stretch') return { x: 0, y: 0, w: this.cssW, h: this.cssH };
      let w = this.cssW;
      let h = w / ar;
      if (h > this.cssH) {
        h = this.cssH;
        w = h * ar;
      }
      return { x: (this.cssW - w) / 2, y: (this.cssH - h) / 2, w, h };
    }
    const m = this.cssW < 600 ? 12 : 36;
    const aw = Math.max(40, this.cssW - this.insets.right);
    const top = this.insets.top || 0;
    const ah = Math.max(40, this.cssH - this.insets.bottom - top);
    let w = aw - m * 2;
    let h = w / ar;
    if (h > ah - m * 2) {
      h = ah - m * 2;
      w = h * ar;
    }
    w = Math.max(10, w) * this.view.zoom;
    h = Math.max(10, h) * this.view.zoom;
    return { x: (aw - w) / 2 + this.view.panX, y: top + (ah - h) / 2 + this.view.panY, w, h };
  }

  stageGL() {
    const s = this.stage();
    const k = this.getRenderScale();
    return { x: s.x * k, y: s.y * k, w: s.w * k, h: s.h * k };
  }

  toWorld(x, y) {
    const s = this.stage();
    return [(x - s.x) / s.w, (y - s.y) / s.h];
  }
  toScreen(p) {
    const s = this.stage();
    return [s.x + p[0] * s.w, s.y + p[1] * s.h];
  }

  zoomAt(factor, sx, sy) {
    const before = this.toWorld(sx, sy);
    this.view.zoom = clamp(this.view.zoom * factor, 0.15, 24);
    const after = this.toScreen(before);
    this.view.panX += sx - after[0];
    this.view.panY += sy - after[1];
    this.viewAnim = null;
    this.changed();
  }

  fitView() {
    this.animateView({ zoom: 1, panX: 0, panY: 0 }, 0.35);
  }

  /** Smoothly frames a world rectangle (used by the demo and "focus" button). */
  focusOn(rect, duration = 1.2, margin = 0.15) {
    const base = this.stageAt(1);
    const zw = 1 / Math.max(0.05, rect.w * (1 + margin));
    const zh = 1 / Math.max(0.05, rect.h * (1 + margin));
    const zoom = clamp(Math.min(zw, zh), 1, 6);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const panX = -(cx - 0.5) * base.w * zoom;
    const panY = -(cy - 0.5) * base.h * zoom;
    this.animateView({ zoom, panX, panY }, duration);
  }

  stageAt(zoom) {
    const v = this.view.zoom;
    const px = this.view.panX;
    const py = this.view.panY;
    this.view.zoom = zoom;
    this.view.panX = 0;
    this.view.panY = 0;
    const s = this.stage();
    this.view.zoom = v;
    this.view.panX = px;
    this.view.panY = py;
    return s;
  }

  animateView(target, duration = 0.6) {
    this.viewAnim = { from: { ...this.view }, to: target, t: 0, d: Math.max(0.01, duration) };
    this.changed();
  }

  update(dt) {
    if (!this.viewAnim) return false;
    const a = this.viewAnim;
    a.t += dt;
    const k = clamp(a.t / a.d, 0, 1);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    for (const key of ['zoom', 'panX', 'panY']) this.view[key] = a.from[key] + (a.to[key] - a.from[key]) * e;
    if (k >= 1) this.viewAnim = null;
    return true;
  }

  changed() {
    this.emit('change');
  }

  setTool(tool) {
    if (this.draft && this.draft.points?.length >= 3 && (this.draft.tool === 'polygon' || this.draft.tool === 'mask')) this._finishPolygon();
    this.draft = null;
    this.tool = tool;
    this.viewport.dataset.tool = tool;
    this.emit('tool', tool);
    this.changed();
  }

  // ------------------------------------------------------------------ hit testing

  _handleRadius(pointerType) {
    return pointerType === 'touch' ? 20 : pointerType === 'pen' ? 12 : 9;
  }

  hitVertex(sx, sy, pointerType) {
    const s = this.store.selected;
    if (!s || !this.options.handles) return -1;
    const r = this._handleRadius(pointerType);
    let best = -1;
    let bd = Infinity;
    s.points.forEach((p, i) => {
      const [x, y] = this.toScreen(p);
      const d = Math.hypot(x - sx, y - sy);
      if (d < r && d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  hitMidpoint(sx, sy, pointerType) {
    const s = this.store.selected;
    if (!s || s.locked || s.type !== 'polygon') return -1;
    const r = this._handleRadius(pointerType) * 0.9;
    for (let i = 0; i < s.points.length; i++) {
      const a = this.toScreen(s.points[i]);
      const b = this.toScreen(s.points[(i + 1) % s.points.length]);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 36) continue;
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (Math.hypot(m[0] - sx, m[1] - sy) < r) return i;
    }
    return -1;
  }

  hitSurface(sx, sy) {
    const w = this.toWorld(sx, sy);
    const list = this.store.surfaces;
    const sel = this.store.selected;
    if (sel && sel.visible && pointInPolygon(w, surfaceOutline(sel))) return sel;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (!s.visible) continue;
      if (pointInPolygon(w, surfaceOutline(s))) return s;
    }
    return null;
  }

  // ------------------------------------------------------------------ events

  _bind() {
    const v = this.viewport;
    v.addEventListener('pointerdown', (e) => this._down(e));
    v.addEventListener('pointermove', (e) => this._move(e));
    v.addEventListener('pointerup', (e) => this._up(e));
    v.addEventListener('pointercancel', (e) => this._up(e, true));
    v.addEventListener('lostpointercapture', (e) => {
      if (this.pointers.has(e.pointerId)) this._up(e, true);
    });
    v.addEventListener(
      'wheel',
      (e) => {
        if (this.cleanMode) return;
        e.preventDefault();
        const r = v.getBoundingClientRect();
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        if (!e.ctrlKey && e.shiftKey) {
          this.view.panX -= dy;
          this.changed();
          return;
        }
        this.zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false },
    );
    v.addEventListener('contextmenu', (e) => e.preventDefault());
    v.addEventListener('dblclick', (e) => this._dbl(e));
  }

  _pos(e) {
    const r = this.viewport.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  _down(e) {
    if (this.cleanMode) {
      this.emit('cleantap');
      return;
    }
    if (e.target !== this.overlay && e.target !== this.glCanvas && e.target !== this.viewport) return;
    this.viewport.setPointerCapture?.(e.pointerId);
    const [x, y] = this._pos(e);
    this.pointers.set(e.pointerId, { x, y, sx: x, sy: y, type: e.pointerType });
    if (this.pointers.size === 2) {
      // Two fingers always navigate: cancel any single-finger edit.
      if (this.action && (this.action.kind === 'vertex' || this.action.kind === 'move')) this.store.cancel();
      this.action = null;
      const [a, b] = [...this.pointers.values()];
      this.gesture = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: [(a.x + b.x) / 2, (a.y + b.y) / 2], zoom0: this.view.zoom, pan0: [this.view.panX, this.view.panY], world: this.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2) };
      this.changed();
      return;
    }
    if (this.pointers.size > 2) return;
    const type = e.pointerType;
    const panRequest = e.button === 1 || this.spaceDown || this.tool === 'pan' || (e.button === 2 && this.tool === 'select');
    if (panRequest) {
      this.action = { kind: 'pan', x0: x, y0: y, pan0: [this.view.panX, this.view.panY], moved: false };
      this.viewport.classList.add('panning');
      return;
    }
    if (e.button !== 0 && type === 'mouse') return;

    if (this.tool === 'select') {
      const sel = this.store.selected;
      const vi = this.hitVertex(x, y, type);
      if (vi >= 0 && sel) {
        this.store.select(sel.id, { vertex: vi });
        if (!sel.locked) {
          this.store.begin();
          this.action = { kind: 'vertex', index: vi, start: sel.points[vi].slice(), w0: this.toWorld(x, y), type, moved: false, shift: e.shiftKey, alt: e.altKey };
        } else this.emit('locked', sel);
        this.changed();
        return;
      }
      const mi = this.hitMidpoint(x, y, type);
      if (mi >= 0 && sel) {
        this.store.begin();
        const a = sel.points[mi];
        const b = sel.points[(mi + 1) % sel.points.length];
        const np = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        sel.points.splice(mi + 1, 0, np);
        this.store.select(sel.id, { vertex: mi + 1 });
        this.store.changed('geometry');
        this.action = { kind: 'vertex', index: mi + 1, start: np.slice(), w0: this.toWorld(x, y), type, moved: true };
        return;
      }
      const hit = this.hitSurface(x, y);
      if (hit) {
        if (hit.id !== this.store.sel.surfaceId) this.store.select(hit.id);
        else if (this.store.sel.vertex >= 0) this.store.select(hit.id);
        if (!hit.locked) {
          this.store.begin();
          this.action = { kind: 'move', id: hit.id, orig: hit.points.map((p) => p.slice()), w0: this.toWorld(x, y), moved: false };
        } else this.emit('locked', hit);
        this.changed();
        return;
      }
      this.action = { kind: 'pan', x0: x, y0: y, pan0: [this.view.panX, this.view.panY], moved: false, deselect: true };
      return;
    }

    // Drawing tools
    const w = this._snap(this.toWorld(x, y), null, -1);
    this.action = { kind: 'draw', x0: x, y0: y, w0: w, w1: w, moved: false };
    this.changed();
  }

  _move(e) {
    const [x, y] = this._pos(e);
    const p = this.pointers.get(e.pointerId);
    if (p) {
      p.x = x;
      p.y = y;
    }
    if (this.gesture && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const m = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      this.view.zoom = clamp(this.gesture.zoom0 * (d / this.gesture.d0), 0.15, 24);
      this.view.panX = this.gesture.pan0[0];
      this.view.panY = this.gesture.pan0[1];
      const sc = this.toScreen(this.gesture.world);
      this.view.panX += m[0] - sc[0];
      this.view.panY += m[1] - sc[1];
      this.viewAnim = null;
      this.changed();
      return;
    }
    const act = this.action;
    if (!act) {
      this._hover(x, y, e.pointerType);
      if (this.draft) {
        this.draft.cursor = this._snap(this.toWorld(x, y), null, -1);
        this.changed();
      }
      return;
    }
    const s = this.store;
    if (act.kind === 'pan') {
      const dx = x - act.x0;
      const dy = y - act.y0;
      if (Math.hypot(dx, dy) > 3) act.moved = true;
      this.view.panX = act.pan0[0] + dx;
      this.view.panY = act.pan0[1] + dy;
      this.viewAnim = null;
      this.changed();
    } else if (act.kind === 'vertex') {
      const sel = s.selected;
      if (!sel) return;
      const w = this.toWorld(x, y);
      let np = [act.start[0] + (w[0] - act.w0[0]), act.start[1] + (w[1] - act.w0[1])];
      if (!act.moved && Math.hypot(...this._toPx(w[0] - act.w0[0], w[1] - act.w0[1])) < 0.5) return;
      act.moved = true;
      np = e.altKey ? np : this._snap(np, sel.id, act.index);
      this.cursorPos = [x, y];
      this._setVertex(sel, act.index, np, e.shiftKey);
      s.changed('geometry');
    } else if (act.kind === 'move') {
      const sel = s.surface(act.id);
      if (!sel) return;
      const w = this.toWorld(x, y);
      let dx = w[0] - act.w0[0];
      let dy = w[1] - act.w0[1];
      if (!act.moved && Math.hypot(...this._screenDelta(dx, dy)) < 4) return;
      act.moved = true;
      if (e.shiftKey) {
        if (Math.abs(dx * this.stage().w) > Math.abs(dy * this.stage().h)) dy = 0;
        else dx = 0;
      }
      sel.points = act.orig.map((p) => [p[0] + dx, p[1] + dy]);
      s.changed('geometry');
    } else if (act.kind === 'draw') {
      act.w1 = this._snap(this.toWorld(x, y), null, -1);
      if (Math.hypot(x - act.x0, y - act.y0) > 6) act.moved = true;
      this.changed();
    }
  }

  _up(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    try {
      this.viewport.releasePointerCapture?.(e.pointerId);
    } catch (_) {
      /* ignored */
    }
    if (this.gesture) {
      if (this.pointers.size < 2) this.gesture = null;
      this.action = null;
      return;
    }
    const act = this.action;
    this.action = null;
    this.snapPoint = null;
    this.viewport.classList.remove('panning');
    if (!act) return;
    const [x, y] = p ? [p.x, p.y] : this._pos(e);
    if (act.kind === 'pan') {
      if (act.deselect && !act.moved && !cancelled) this.store.select(null);
      this.changed();
    } else if (act.kind === 'vertex' || act.kind === 'move') {
      if (cancelled) this.store.cancel();
      else if (this.store.end()) this.store.changed('geometry', { final: true });
      this.changed();
    } else if (act.kind === 'draw' && !cancelled) {
      this._finishDraw(act, x, y, e);
    }
  }

  _dbl(e) {
    if (this.cleanMode) return;
    const [x, y] = this._pos(e);
    if (this.draft && (this.tool === 'polygon' || this.tool === 'mask')) {
      if (this.draft.points.length > 3) this.draft.points.pop();
      this._finishPolygon();
      return;
    }
    if (this.tool !== 'select') return;
    const sel = this.store.selected;
    if (!sel || sel.locked) return;
    const vi = this.hitVertex(x, y, 'mouse');
    if (vi >= 0 && sel.type === 'polygon' && sel.points.length > 3) {
      this.store.checkpoint();
      sel.points.splice(vi, 1);
      this.store.select(sel.id);
      this.store.changed('geometry', { final: true });
      return;
    }
    if (sel.type === 'polygon') this.insertPointNear(sel, this.toWorld(x, y));
  }

  insertPointNear(sel, w) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < sel.points.length; i++) {
      const r = distToSegment(this._toPx(...w), this._toPx(...sel.points[i]), this._toPx(...sel.points[(i + 1) % sel.points.length]));
      if (r.d < bd) {
        bd = r.d;
        best = i;
      }
    }
    if (best < 0 || sel.points.length >= 48) return;
    this.store.checkpoint();
    sel.points.splice(best + 1, 0, [w[0], w[1]]);
    this.store.select(sel.id, { vertex: best + 1 });
    this.store.changed('geometry', { final: true });
  }

  _hover(x, y, type) {
    if (this.tool !== 'select') {
      this.viewport.style.cursor = this.tool === 'pan' ? 'grab' : 'crosshair';
      return;
    }
    let cursor = 'default';
    let hover = null;
    if (this.hitVertex(x, y, type) >= 0 || this.hitMidpoint(x, y, type) >= 0) cursor = 'pointer';
    else {
      const s = this.hitSurface(x, y);
      if (s) {
        cursor = s.locked ? 'not-allowed' : 'move';
        hover = s.id;
      } else cursor = 'grab';
    }
    this.viewport.style.cursor = cursor;
    if (hover !== this.hover) {
      this.hover = hover;
      this.changed();
    }
  }

  _toPx(dx, dy) {
    const { width, height } = this.store.project.output;
    return [dx * width, dy * height];
  }
  _screenDelta(dx, dy) {
    const s = this.stage();
    return [dx * s.w, dy * s.h];
  }

  _setVertex(sel, i, np, keepRect) {
    if (sel.type === 'rect' && keepRect) {
      // Shift keeps a rectangle: opposite corner stays fixed.
      const opp = sel.points[(i + 2) % 4];
      const x0 = Math.min(opp[0], np[0]);
      const y0 = Math.min(opp[1], np[1]);
      sel.points = rectPoints(x0, y0, Math.abs(np[0] - opp[0]), Math.abs(np[1] - opp[1]));
      return;
    }
    if (sel.type === 'rect') sel.type = 'quad';
    sel.points[i] = np;
  }

  _snap(w, surfaceId, index) {
    this.snapPoint = null;
    if (!this.options.snap) return w;
    const s = this.stage();
    const r = 10;
    let best = null;
    let bd = r;
    const test = (p) => {
      const d = Math.hypot((p[0] - w[0]) * s.w, (p[1] - w[1]) * s.h);
      if (d < bd) {
        bd = d;
        best = p;
      }
    };
    for (const sf of this.store.surfaces) {
      if (!sf.visible) continue;
      sf.points.forEach((p, i) => {
        if (sf.id === surfaceId && i === index) return;
        test(p);
      });
    }
    for (const p of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.5, 0.5],
      [0.5, 0],
      [0.5, 1],
      [0, 0.5],
      [1, 0.5],
    ])
      test(p);
    if (best) {
      this.snapPoint = best;
      return [best[0], best[1]];
    }
    // Edges of the stage snap on a single axis.
    const ex = [0, 1].find((v) => Math.abs((v - w[0]) * s.w) < 6);
    const ey = [0, 1].find((v) => Math.abs((v - w[1]) * s.h) < 6);
    if (ex !== undefined || ey !== undefined) {
      const p = [ex ?? w[0], ey ?? w[1]];
      this.snapPoint = p;
      return p;
    }
    return w;
  }

  // ------------------------------------------------------------------ drawing

  _defaultSize() {
    const { width, height } = this.store.project.output;
    const w = 0.22;
    return [w, (w * width) / height * 0.7];
  }

  _finishDraw(act, x, y) {
    const tool = this.tool;
    const tapped = !act.moved;
    const w0 = act.w0;
    const w1 = act.w1;
    const { width, height } = this.store.project.output;
    if (['polygon', 'mask', 'quad', 'triangle'].includes(tool) && (tapped || this.draft)) {
      // point-by-point mode
      if (!this.draft) this.draft = { tool, points: [], cursor: w0 };
      const pts = this.draft.points;
      const first = pts[0];
      if (first && pts.length >= 3 && (tool === 'polygon' || tool === 'mask')) {
        const sp = this.toScreen(first);
        if (Math.hypot(sp[0] - x, sp[1] - y) < 18) {
          this._finishPolygon();
          return;
        }
      }
      pts.push(w0);
      if (tool === 'quad' && pts.length === 4) this._create('quad', orderQuad(pts));
      else if (tool === 'triangle' && pts.length === 3) this._create('triangle', orderTriangle(pts));
      else if ((tool === 'polygon' || tool === 'mask') && pts.length >= 48) this._finishPolygon();
      this.emit('draft', this.draft);
      this.changed();
      return;
    }
    let x0 = Math.min(w0[0], w1[0]);
    let y0 = Math.min(w0[1], w1[1]);
    let w = Math.abs(w1[0] - w0[0]);
    let h = Math.abs(w1[1] - w0[1]);
    if (tapped || w * width < 8 || h * height < 8) {
      const [dw, dh] = this._defaultSize();
      w = dw;
      h = tool === 'circle' ? (dw * width) / height : dh;
      x0 = w0[0] - w / 2;
      y0 = w0[1] - h / 2;
    } else if (tool === 'circle') {
      const side = Math.max(w * width, h * height);
      const sx = Math.sign(w1[0] - w0[0]) || 1;
      const sy = Math.sign(w1[1] - w0[1]) || 1;
      w = side / width;
      h = side / height;
      x0 = sx > 0 ? w0[0] : w0[0] - w;
      y0 = sy > 0 ? w0[1] : w0[1] - h;
    }
    const rp = rectPoints(x0, y0, w, h);
    if (tool === 'triangle') this._create('triangle', trianglePoints(x0, y0, w, h));
    else if (tool === 'mesh') this._create('mesh', meshFromQuad(rp, 3, 3), { cols: 3, rows: 3 });
    else if (tool === 'mask') this._create('rect', rp, { role: 'mask' });
    else if (tool === 'polygon') this._create('polygon', rp);
    else this._create(tool, rp);
  }

  _finishPolygon() {
    const d = this.draft;
    if (!d || d.points.length < 3) {
      this.draft = null;
      this.changed();
      return;
    }
    this._create('polygon', d.points, d.tool === 'mask' ? { role: 'mask' } : {});
  }

  cancelDraft() {
    if (!this.draft) return false;
    this.draft = null;
    this.emit('draft', null);
    this.changed();
    return true;
  }

  undoDraftPoint() {
    if (!this.draft?.points.length) return false;
    this.draft.points.pop();
    if (!this.draft.points.length) this.draft = null;
    this.emit('draft', this.draft);
    this.changed();
    return true;
  }

  finishDraft() {
    if (!this.draft) return;
    if (this.draft.tool === 'quad' && this.draft.points.length === 4) this._create('quad', orderQuad(this.draft.points));
    else this._finishPolygon();
  }

  _create(type, points, opts = {}) {
    this.draft = null;
    this.emit('draft', null);
    if (!validPoints(points)) return;
    const s = createSurface(type, points, opts);
    if (opts.role === 'mask') s.feather = 0;
    this.emit('beforecreate', s);
    this.store.addSurface(s);
    this.emit('created', s);
    this.setTool('select');
  }

  // ------------------------------------------------------------------ precise editing

  nudge(dxPx, dyPx) {
    const sel = this.store.selected;
    if (!sel || sel.locked) return;
    const { width, height } = this.store.project.output;
    const dx = dxPx / width;
    const dy = dyPx / height;
    this.store.checkpoint('nudge');
    const v = this.store.sel.vertex;
    if (v >= 0 && v < sel.points.length) {
      if (sel.type === 'rect') sel.type = 'quad';
      sel.points[v] = [sel.points[v][0] + dx, sel.points[v][1] + dy];
    } else sel.points = sel.points.map((p) => [p[0] + dx, p[1] + dy]);
    this.store.changed('geometry', { final: true });
  }

  selectNextVertex(dir = 1) {
    const sel = this.store.selected;
    if (!sel) return;
    const n = sel.points.length;
    const v = this.store.sel.vertex;
    this.store.select(sel.id, { vertex: v < 0 ? 0 : (v + dir + n) % n });
    this.changed();
  }

  // ------------------------------------------------------------------ overlay

  drawOverlay() {
    const ctx = this.octx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (this.cleanMode) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const st = this.stage();
    const { width, height } = this.store.project.output;

    // stage frame + resolution label
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(st.x) + 0.5, Math.round(st.y) + 0.5, Math.round(st.w) - 1, Math.round(st.h) - 1);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${width} × ${height}`, st.x + st.w, st.y + st.h + 4);
    ctx.textAlign = 'left';

    if (this.options.grid) this._drawGrid(ctx, st);

    const sel = this.store.selected;
    const { t, clock } = this.timeState;
    for (const s of this.store.surfaces) {
      const outline = surfaceOutline(s).map((p) => this.toScreen(p));
      const isSel = sel && s.id === sel.id;
      const isMask = s.role === 'mask';
      if (this.presentation && !isSel) continue;
      const tracePath = () => {
        ctx.beginPath();
        outline.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
      };
      ctx.save();
      if (isMask && s.visible) {
        tracePath();
        ctx.save();
        ctx.clip();
        this._hatch(ctx, outline, s.invert);
        ctx.restore();
      }
      tracePath();
      if (!s.visible) ctx.setLineDash([4, 4]);
      else if (isMask) ctx.setLineDash([6, 4]);
      ctx.lineWidth = isSel ? 2 : this.hover === s.id ? 1.5 : 1;
      ctx.strokeStyle = !s.visible ? 'rgba(255,255,255,0.25)' : isMask ? MASK : isSel ? ACCENT : this.hover === s.id ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.42)';
      ctx.stroke();
      ctx.restore();
      if (s.type === 'mesh' && isSel) this._drawMeshLines(ctx, s);
      if ((s.type === 'circle' || s.type === 'ellipse') && isSel) {
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(34,211,238,0.55)';
        ctx.beginPath();
        s.points.forEach((p, i) => {
          const q = this.toScreen(p);
          i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      if (hasAnimation(s) && s.visible) {
        const ev = evaluateSurface(s, t, clock, [width, height]);
        if (ev && ev.points !== s.points) {
          const o2 = surfaceOutline({ ...s, points: ev.points }, ev.points).map((p) => this.toScreen(p));
          ctx.save();
          ctx.setLineDash([2, 5]);
          ctx.strokeStyle = 'rgba(251,191,36,0.7)';
          ctx.beginPath();
          o2.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }
      }
      if (this.options.labels && (st.w > 260 || isSel)) this._label(ctx, s, outline, isSel);
    }

    if (sel && this.options.handles) this._drawHandles(ctx, sel);
    if (this.draft || (this.action && this.action.kind === 'draw')) this._drawDraft(ctx);
    if (this.snapPoint && this.action) {
      const [x, y] = this.toScreen(this.snapPoint);
      ctx.strokeStyle = '#f0abfc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 9, y);
      ctx.lineTo(x + 9, y);
      ctx.moveTo(x, y - 9);
      ctx.lineTo(x, y + 9);
      ctx.stroke();
    }
    if (this.action && this.action.kind === 'vertex' && this.action.moved && this.options.loupe && (this.action.type === 'touch' || this.action.type === 'pen')) {
      this._drawLoupe(ctx, sel);
    }
  }

  _drawGrid(ctx, st) {
    const { width } = this.store.project.output;
    const stepPx = width >= 1600 ? 120 : 80;
    const n = Math.round(width / stepPx);
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const x = Math.round(st.x + (i / n) * st.w) + 0.5;
      ctx.moveTo(x, st.y);
      ctx.lineTo(x, st.y + st.h);
    }
    const ar = this.store.project.output.height / width;
    const m = Math.round(n * ar);
    for (let j = 1; j < m; j++) {
      const y = Math.round(st.y + (j / m) * st.h) + 0.5;
      ctx.moveTo(st.x, y);
      ctx.lineTo(st.x + st.w, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.beginPath();
    ctx.moveTo(st.x + st.w / 2, st.y);
    ctx.lineTo(st.x + st.w / 2, st.y + st.h);
    ctx.moveTo(st.x, st.y + st.h / 2);
    ctx.lineTo(st.x + st.w, st.y + st.h / 2);
    ctx.stroke();
    ctx.restore();
  }

  _hatch(ctx, outline, invert) {
    const b = bbox(outline);
    ctx.strokeStyle = 'rgba(255,77,109,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let d = -b.h; d < b.w; d += 10) {
      ctx.moveTo(b.minX + d, b.minY);
      ctx.lineTo(b.minX + d + b.h, b.maxY);
    }
    ctx.stroke();
    if (invert) {
      ctx.fillStyle = 'rgba(255,77,109,0.10)';
      ctx.fillRect(b.minX, b.minY, b.w, b.h);
    }
  }

  _drawMeshLines(ctx, s) {
    const { cols, rows } = s.mesh;
    const at = (i, j) => this.toScreen(s.points[j * (cols + 1) + i]);
    ctx.save();
    ctx.strokeStyle = 'rgba(34,211,238,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const p = at(i, j);
        if (i < cols) {
          const q = at(i + 1, j);
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(q[0], q[1]);
        }
        if (j < rows) {
          const q = at(i, j + 1);
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(q[0], q[1]);
        }
      }
    ctx.stroke();
    ctx.restore();
  }

  _label(ctx, s, outline, isSel) {
    const b = bbox(outline);
    const txt = (s.locked ? '🔒 ' : '') + s.name;
    ctx.font = `${isSel ? 600 : 500} 11px system-ui, sans-serif`;
    const w = ctx.measureText(txt).width + 10;
    const x = clamp(b.minX, 2, this.cssW - w - 2);
    const y = clamp(s.role === 'mask' ? b.maxY + 3 : b.minY - 20, 2, this.cssH - 20);
    ctx.fillStyle = isSel ? 'rgba(34,211,238,0.92)' : s.role === 'mask' ? 'rgba(255,77,109,0.8)' : 'rgba(15,17,24,0.72)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, 17, 5) : ctx.rect(x, y, w, 17);
    ctx.fill();
    ctx.fillStyle = isSel ? '#0b0d12' : '#e5e7eb';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + 5, y + 9);
  }

  _drawHandles(ctx, s) {
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    const r = touch ? 9 : 6;
    const vSel = this.store.sel.vertex;
    if (s.type === 'polygon' && !s.locked) {
      for (let i = 0; i < s.points.length; i++) {
        const a = this.toScreen(s.points[i]);
        const b = this.toScreen(s.points[(i + 1) % s.points.length]);
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 36) continue;
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        ctx.fillStyle = 'rgba(15,17,24,0.75)';
        ctx.strokeStyle = 'rgba(34,211,238,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(m[0], m[1], r * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#e5e7eb';
        ctx.beginPath();
        ctx.moveTo(m[0] - 3, m[1]);
        ctx.lineTo(m[0] + 3, m[1]);
        ctx.moveTo(m[0], m[1] - 3);
        ctx.lineTo(m[0], m[1] + 3);
        ctx.stroke();
      }
    }
    const showIdx = s.points.length <= 12;
    s.points.forEach((p, i) => {
      const [x, y] = this.toScreen(p);
      const on = i === vSel;
      ctx.beginPath();
      ctx.arc(x, y, on ? r + 2 : r, 0, Math.PI * 2);
      ctx.fillStyle = s.locked ? 'rgba(120,120,120,0.9)' : on ? SEL_VERTEX : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = s.role === 'mask' ? MASK : ACCENT;
      ctx.stroke();
      if (showIdx) {
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.fillStyle = '#0b0d12';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), x, y + 0.5);
        ctx.textAlign = 'left';
      }
    });
  }

  _drawDraft(ctx) {
    ctx.save();
    ctx.strokeStyle = this.tool === 'mask' ? MASK : ACCENT;
    ctx.fillStyle = this.tool === 'mask' ? 'rgba(255,77,109,0.12)' : 'rgba(34,211,238,0.12)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    const act = this.action;
    if (act && act.kind === 'draw' && act.moved && !this.draft) {
      const a = this.toScreen(act.w0);
      const b = this.toScreen(act.w1);
      if (this.tool === 'circle' || this.tool === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
      } else if (this.tool === 'triangle') {
        ctx.beginPath();
        ctx.moveTo((a[0] + b[0]) / 2, Math.min(a[1], b[1]));
        ctx.lineTo(Math.max(a[0], b[0]), Math.max(a[1], b[1]));
        ctx.lineTo(Math.min(a[0], b[0]), Math.max(a[1], b[1]));
        ctx.closePath();
      } else {
        ctx.beginPath();
        ctx.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      }
      ctx.fill();
      ctx.stroke();
    }
    const d = this.draft;
    if (d && d.points.length) {
      const pts = d.points.map((p) => this.toScreen(p));
      const cur = d.cursor ? this.toScreen(d.cursor) : null;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      if (cur) ctx.lineTo(cur[0], cur[1]);
      if (pts.length >= 2) ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      pts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p[0], p[1], i === 0 && pts.length >= 3 ? 9 : 5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? SEL_VERTEX : '#fff';
        ctx.fill();
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  _drawLoupe(ctx, sel) {
    if (!sel || !this.cursorPos) return;
    const p = this.toScreen(sel.points[this.action.index]);
    const R = 62;
    const zoom = 3;
    let cx = p[0] - 80;
    let cy = p[1] - 110;
    if (cy - R < 4) cy = p[1] + 110;
    cx = clamp(cx, R + 4, this.cssW - R - 4);
    const k = this.glCanvas.width / this.cssW;
    const src = (R / zoom) * k;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    try {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.glCanvas, p[0] * k - src, p[1] * k - src, src * 2, src * 2, cx - R, cy - R, R * 2, R * 2);
    } catch (_) {
      /* ignored */
    }
    // outline of the surface inside the loupe
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-p[0], -p[1]);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    surfaceOutline(sel)
      .map((q) => this.toScreen(q))
      .forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = SEL_VERTEX;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy);
    ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();
  }
}
