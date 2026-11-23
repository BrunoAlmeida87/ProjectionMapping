// Project data model, timeline evaluation (keyframes + clips) and the store
// with undo/redo history.

import { uid, Emitter, clamp, deepClone } from './utils.js';
import { defaultParams, EFFECT_MAP } from './effects.js';
import { transformPoints, centroid, surfaceOutline, rectPoints, validPoints, meshFromQuad } from './mapping.js';

export const PROJECT_VERSION = 1;

export const SHAPE_LABELS = {
  rect: 'Retângulo',
  quad: 'Quadrilátero',
  triangle: 'Triângulo',
  polygon: 'Polígono',
  circle: 'Círculo',
  ellipse: 'Elipse',
  mesh: 'Malha (warp)',
};

export function createProject(opts = {}) {
  const now = Date.now();
  return {
    version: PROJECT_VERSION,
    id: opts.id || uid('p'),
    name: opts.name || 'Projeto sem título',
    createdAt: now,
    updatedAt: now,
    output: { width: 1920, height: 1080, ...(opts.output || {}) },
    surfaces: [],
    media: {},
    background: { mediaId: null, opacity: 0.55, visible: true },
    audio: { mediaId: null, volume: 1 },
    timeline: { duration: 30, loop: true },
    ...opts.extra,
  };
}

let nameCounter = 0;
export function createSurface(type, points, opts = {}) {
  nameCounter++;
  const role = opts.role || 'content';
  const s = {
    id: uid('s'),
    name: opts.name || `${role === 'mask' ? 'Máscara' : SHAPE_LABELS[type] || 'Superfície'} ${nameCounter}`,
    type,
    role,
    points: points.map((p) => [p[0], p[1]]),
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'normal',
    feather: 0,
    rotation: 0,
    content: opts.content || { type: 'effect', effect: 'grid', params: defaultParams('grid') },
    transform: { fit: 'cover', scale: 1, x: 0, y: 0, rotation: 0, flipX: false, flipY: false, tile: false },
    adjust: { brightness: 0, contrast: 1, saturation: 1, hue: 0 },
    audioReact: 0,
    invert: false,
    clips: [],
    keys: {},
  };
  if (type === 'mesh') s.mesh = { cols: opts.cols || 3, rows: opts.rows || 3 };
  return s;
}

export function effectContent(effectId, params = {}) {
  return { type: 'effect', effect: effectId, params: { ...defaultParams(effectId), ...params } };
}

export function mediaContent(mediaId) {
  return { type: 'media', mediaId };
}

/** Fills missing fields so imported / older projects always render. */
export function normalizeProject(p) {
  const base = createProject({ id: p.id, name: p.name });
  const out = { ...base, ...p };
  out.output = { ...base.output, ...(p.output || {}) };
  out.output.width = clamp(Math.round(+out.output.width || 1920), 64, 8192);
  out.output.height = clamp(Math.round(+out.output.height || 1080), 64, 8192);
  out.background = { ...base.background, ...(p.background || {}) };
  out.audio = { ...base.audio, ...(p.audio || {}) };
  out.timeline = { ...base.timeline, ...(p.timeline || {}) };
  out.media = p.media && typeof p.media === 'object' ? p.media : {};
  out.surfaces = (Array.isArray(p.surfaces) ? p.surfaces : [])
    .filter((s) => s && validPoints(s.points))
    .map((s) => {
      const d = createSurface(s.type || 'polygon', s.points, { role: s.role });
      const n = { ...d, ...s };
      n.transform = { ...d.transform, ...(s.transform || {}) };
      n.adjust = { ...d.adjust, ...(s.adjust || {}) };
      n.clips = Array.isArray(s.clips) ? s.clips : [];
      n.keys = s.keys && typeof s.keys === 'object' ? s.keys : {};
      if (n.type === 'mesh') {
        n.mesh = { cols: 3, rows: 3, ...(s.mesh || {}) };
        if (n.points.length !== (n.mesh.cols + 1) * (n.mesh.rows + 1)) {
          n.mesh = { cols: 1, rows: 1 };
          n.points = meshFromQuad(n.points.slice(0, 4), 1, 1);
        }
      }
      if (!n.content || !n.content.type) n.content = effectContent('grid');
      if (n.content.type === 'effect' && !EFFECT_MAP[n.content.effect]) n.content = effectContent('grid');
      return n;
    });
  return out;
}

// ---------------------------------------------------------------------------
// Timeline evaluation
// ---------------------------------------------------------------------------

const EASE = {
  linear: (t) => t,
  ease: (t) => t * t * (3 - 2 * t),
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  hold: () => 0,
};

export function evalTrack(track, t, fallback) {
  if (!track || !track.length) return fallback;
  if (t <= track[0].t) return track[0].v;
  const last = track[track.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = b.t - a.t > 1e-9 ? (t - a.t) / (b.t - a.t) : 1;
      const e = (EASE[a.e] || EASE.ease)(k);
      return a.v + (b.v - a.v) * e;
    }
  }
  return fallback;
}

export function setKey(surface, prop, t, v, ease = 'ease') {
  const track = (surface.keys[prop] = surface.keys[prop] || []);
  const existing = track.find((k) => Math.abs(k.t - t) < 1 / 120);
  if (existing) existing.v = v;
  else track.push({ t, v, e: ease });
  track.sort((a, b) => a.t - b.t);
}

export function keyAt(surface, prop, t) {
  return (surface.keys[prop] || []).find((k) => Math.abs(k.t - t) < 1 / 120) || null;
}

export function removeKey(surface, prop, t) {
  const track = surface.keys[prop];
  if (!track) return;
  surface.keys[prop] = track.filter((k) => Math.abs(k.t - t) >= 1 / 120);
  if (!surface.keys[prop].length) delete surface.keys[prop];
}

export function animatedValue(surface, prop, t) {
  const base = { opacity: surface.opacity, x: 0, y: 0, scale: 1, rotation: 0, intensity: 1 }[prop];
  return evalTrack(surface.keys?.[prop], t, base);
}

export function hasAnimation(surface) {
  return Object.values(surface.keys || {}).some((tr) => tr && tr.length);
}

export function clipAlpha(clip, t) {
  if (t < clip.start || t >= clip.end) return 0;
  let a = 1;
  if (clip.fadeIn > 0) a = Math.min(a, (t - clip.start) / clip.fadeIn);
  if (clip.fadeOut > 0) a = Math.min(a, (clip.end - t) / clip.fadeOut);
  return clamp(a, 0, 1);
}

/**
 * Resolves what a surface shows at timeline time `t` (seconds) and effect clock `clock`.
 * Returns null when nothing should be drawn.
 */
export function evaluateSurface(surface, t, clock, res) {
  if (!surface.visible) return null;
  const opacity = clamp(animatedValue(surface, 'opacity', t), 0, 1);
  const dx = animatedValue(surface, 'x', t);
  const dy = animatedValue(surface, 'y', t);
  const scale = animatedValue(surface, 'scale', t);
  const rotation = animatedValue(surface, 'rotation', t);
  const intensity = animatedValue(surface, 'intensity', t);
  let points = surface.points;
  if (dx || dy || scale !== 1 || rotation) {
    const c = centroid(surfaceOutline(surface, surface.points, 16));
    points = transformPoints(surface.points, { dx, dy, scale, rotation }, res, c);
  }
  const layers = [];
  if (surface.role === 'mask') {
    layers.push({ content: null, alpha: 1 });
  } else if (surface.clips && surface.clips.length) {
    for (const clip of surface.clips) {
      const a = clipAlpha(clip, t);
      if (a > 0.001) layers.push({ content: clip.content, alpha: a, mediaTime: t - clip.start, clipId: clip.id });
    }
  } else if (surface.content && surface.content.type !== 'none') {
    layers.push({ content: surface.content, alpha: 1, mediaTime: clock });
  }
  if (!layers.length || opacity <= 0.001) return null;
  return { points, opacity, layers, intensity };
}

// ---------------------------------------------------------------------------
// Store with undo/redo
// ---------------------------------------------------------------------------

export class Store extends Emitter {
  constructor() {
    super();
    this.project = createProject();
    this.sel = { surfaceId: null, vertex: -1, clipId: null, key: null };
    this.past = [];
    this.future = [];
    this._tx = null;
    this._cp = { key: null, time: 0 };
    this.maxHistory = 120;
  }

  get surfaces() {
    return this.project.surfaces;
  }
  get selected() {
    return this.surface(this.sel.surfaceId);
  }
  surface(id) {
    return id ? this.project.surfaces.find((s) => s.id === id) || null : null;
  }
  res() {
    return [this.project.output.width, this.project.output.height];
  }

  snapshot() {
    return JSON.stringify(this.project);
  }

  /** Push an undo point. Calls with the same key within 800 ms are merged (sliders). */
  checkpoint(key = null) {
    const now = performance.now();
    if (key && this._cp.key === key && now - this._cp.time < 800) {
      this._cp.time = now;
      return;
    }
    this._cp = { key, time: now };
    this._push(this.snapshot());
  }

  _push(snap) {
    if (this.past.length && this.past[this.past.length - 1] === snap) return;
    this.past.push(snap);
    if (this.past.length > this.maxHistory) this.past.shift();
    this.future.length = 0;
    this.emit('history');
  }

  begin() {
    this._tx = this.snapshot();
  }
  end() {
    if (this._tx === null) return false;
    const before = this._tx;
    this._tx = null;
    if (before !== this.snapshot()) {
      this._push(before);
      return true;
    }
    return false;
  }
  cancel() {
    if (this._tx === null) return;
    this._restore(this._tx);
    this._tx = null;
  }

  undo() {
    if (!this.past.length) return false;
    this.future.push(this.snapshot());
    this._restore(this.past.pop());
    this.emit('history');
    return true;
  }
  redo() {
    if (!this.future.length) return false;
    this.past.push(this.snapshot());
    this._restore(this.future.pop());
    this.emit('history');
    return true;
  }
  _restore(snap) {
    this.project = JSON.parse(snap);
    if (!this.surface(this.sel.surfaceId)) this.sel = { surfaceId: null, vertex: -1, clipId: null, key: null };
    this.changed('structure');
    this.emit('selection', this.sel);
  }

  setProject(project, { keepHistory = false } = {}) {
    this.project = normalizeProject(deepClone(project));
    if (!keepHistory) {
      this.past = [];
      this.future = [];
    }
    this.sel = { surfaceId: null, vertex: -1, clipId: null, key: null };
    this.changed('project');
    this.emit('selection', this.sel);
    this.emit('history');
  }

  changed(kind = 'props', detail = null) {
    this.project.updatedAt = Date.now();
    this.emit('change', { kind, detail });
  }

  select(surfaceId, { vertex = -1, clipId = null } = {}) {
    const same = this.sel.surfaceId === surfaceId && this.sel.vertex === vertex && this.sel.clipId === clipId;
    this.sel = { surfaceId: surfaceId || null, vertex, clipId, key: null };
    if (!same) this.emit('selection', this.sel);
  }

  addSurface(surface, { select = true, index = null } = {}) {
    this.checkpoint();
    if (index === null) this.project.surfaces.push(surface);
    else this.project.surfaces.splice(index, 0, surface);
    this.changed('structure');
    if (select) this.select(surface.id);
    return surface;
  }

  removeSurface(id) {
    const i = this.project.surfaces.findIndex((s) => s.id === id);
    if (i < 0) return;
    this.checkpoint();
    this.project.surfaces.splice(i, 1);
    if (this.sel.surfaceId === id) this.select(null);
    this.changed('structure');
  }

  duplicateSurface(id) {
    const s = this.surface(id);
    if (!s) return null;
    const copy = deepClone(s);
    copy.id = uid('s');
    copy.name = `${s.name} (cópia)`;
    copy.points = copy.points.map(([x, y]) => [x + 0.02, y + 0.02]);
    copy.clips = copy.clips.map((c) => ({ ...c, id: uid('c') }));
    const i = this.project.surfaces.indexOf(s);
    return this.addSurface(copy, { index: i + 1 });
  }

  moveSurface(id, delta) {
    const arr = this.project.surfaces;
    const i = arr.findIndex((s) => s.id === id);
    const j = clamp(i + delta, 0, arr.length - 1);
    if (i < 0 || i === j) return;
    this.checkpoint();
    const [s] = arr.splice(i, 1);
    arr.splice(j, 0, s);
    this.changed('structure');
  }

  reorder(id, newIndex) {
    const arr = this.project.surfaces;
    const i = arr.findIndex((s) => s.id === id);
    if (i < 0) return;
    newIndex = clamp(newIndex, 0, arr.length - 1);
    if (i === newIndex) return;
    this.checkpoint();
    const [s] = arr.splice(i, 1);
    arr.splice(newIndex, 0, s);
    this.changed('structure');
  }
}

export function defaultSurfaceRect(project, w = 0.3, h = null) {
  const ar = project.output.width / project.output.height;
  const hh = h ?? w * ar * 0.75;
  return rectPoints(0.5 - w / 2, 0.5 - hh / 2, w, hh);
}

/** Media visible at time t, with the playback time each should be at. */
export function collectActiveMedia(project, t, clock, res = [project.output.width, project.output.height]) {
  const out = new Map();
  for (const s of project.surfaces) {
    if (!s.visible || s.role === 'mask') continue;
    const ev = evaluateSurface(s, t, clock, res);
    if (!ev) continue;
    for (const l of ev.layers) {
      if (l.content && l.content.type === 'media' && !out.has(l.content.mediaId)) out.set(l.content.mediaId, Math.max(0, l.mediaTime || 0));
    }
  }
  if (project.audio?.mediaId) out.set(project.audio.mediaId, t);
  return out;
}

/** Every media id referenced by the project (surfaces, clips, background, soundtrack). */
export function referencedMedia(project) {
  const ids = new Set();
  for (const s of project.surfaces) {
    if (s.content?.type === 'media') ids.add(s.content.mediaId);
    for (const c of s.clips || []) if (c.content?.type === 'media') ids.add(c.content.mediaId);
  }
  if (project.background?.mediaId && !project.background.mediaId.startsWith('builtin:')) ids.add(project.background.mediaId);
  if (project.audio?.mediaId) ids.add(project.audio.mediaId);
  return ids;
}
