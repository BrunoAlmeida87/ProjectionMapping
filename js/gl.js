// Thin WebGL helpers (context creation, shader compilation, textures, FBOs).

export function createContext(canvas, { preserveDrawingBuffer = false, antialias = true, alpha = false } = {}) {
  const attrs = {
    alpha,
    antialias,
    stencil: true,
    depth: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer,
    powerPreference: 'high-performance',
    desynchronized: false,
  };
  let gl = null;
  let isWebGL2 = false;
  try {
    gl = canvas.getContext('webgl2', attrs);
    isWebGL2 = !!gl;
  } catch (_) {
    gl = null;
  }
  if (!gl) {
    try {
      gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    } catch (_) {
      gl = null;
    }
  }
  return { gl, isWebGL2 };
}

function annotate(src, log) {
  const lines = src.split('\n');
  const m = /ERROR:\s*\d+:(\d+)/.exec(log);
  if (!m) return log;
  const n = +m[1];
  const ctx = lines
    .slice(Math.max(0, n - 3), n + 2)
    .map((l, i) => `${Math.max(1, n - 2) + i}: ${l}`)
    .join('\n');
  return `${log}\n${ctx}`;
}

export function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh) || 'erro desconhecido';
    gl.deleteShader(sh);
    throw new Error(`Falha ao compilar shader:\n${annotate(src, log)}`);
  }
  return sh;
}

export function createProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.bindAttribLocation(prog, 1, 'aUVW');
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Falha ao linkar programa: ${log}`);
  }
  const locs = new Map();
  return {
    prog,
    u(name) {
      if (!locs.has(name)) locs.set(name, gl.getUniformLocation(prog, name));
      return locs.get(name);
    },
  };
}

export function createTexture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  return tex;
}

export function uploadTexture(gl, tex, source) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

export function createFramebuffer(gl, w, h) {
  const tex = createTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, rb);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return {
    fb,
    tex,
    rb,
    w,
    h,
    ok,
    dispose() {
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      gl.deleteRenderbuffer(rb);
    },
  };
}

/** Column-major mat3 mapping output coords (0..1, y down) onto a pixel rect of the target. */
export function stageMatrix(stage, targetW, targetH) {
  const a = (2 * stage.w) / targetW;
  const d = (-2 * stage.h) / targetH;
  const tx = (2 * stage.x) / targetW - 1;
  const ty = 1 - (2 * stage.y) / targetH;
  return new Float32Array([a, 0, 0, 0, d, 0, tx, ty, 1]);
}

export function gpuInfo(gl) {
  if (!gl) return { renderer: 'indisponível', vendor: '' };
  let renderer = gl.getParameter(gl.RENDERER);
  let vendor = gl.getParameter(gl.VENDOR);
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || renderer;
      vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || vendor;
    }
  } catch (_) {
    /* ignored */
  }
  return { renderer: String(renderer), vendor: String(vendor), maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE) };
}
