// Video recording of the composition with canvas.captureStream() +
// MediaRecorder. Only formats the current browser really supports are offered.

import { Emitter, timestampName } from './utils.js';
import { Renderer } from './renderer.js';

const CANDIDATES = [
  { mime: 'video/mp4;codecs=avc1.42E01F', label: 'MP4 (H.264)', ext: 'mp4' },
  { mime: 'video/mp4;codecs=avc1', label: 'MP4 (H.264)', ext: 'mp4' },
  { mime: 'video/mp4', label: 'MP4', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9', label: 'WebM (VP9)', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8', label: 'WebM (VP8)', ext: 'webm' },
  { mime: 'video/webm', label: 'WebM', ext: 'webm' },
];

export function recordingFormats() {
  if (typeof window.MediaRecorder === 'undefined' || !window.MediaRecorder.isTypeSupported) return [];
  const seen = new Set();
  const out = [];
  for (const c of CANDIDATES) {
    try {
      if (window.MediaRecorder.isTypeSupported(c.mime) && !seen.has(c.label)) {
        seen.add(c.label);
        out.push(c);
      }
    } catch (_) {
      /* ignored */
    }
  }
  return out;
}

export function canRecordCanvas() {
  return typeof window.MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype && recordingFormats().length > 0;
}

export function canRecordScreen() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && typeof window.MediaRecorder !== 'undefined';
}

export class Recorder extends Emitter {
  constructor(app) {
    super();
    this.app = app;
    this.active = false;
    this.renderer = null;
    this.canvas = null;
    this.chunks = [];
    this.startedAt = 0;
    this.opts = null;
  }

  start(opts) {
    if (this.active) return;
    const formats = recordingFormats();
    const fmt = formats.find((f) => f.mime === opts.mime) || formats[0];
    if (!fmt) throw new Error('Este navegador não suporta gravação de vídeo (MediaRecorder).');
    this.opts = { width: 1280, height: 720, fps: 30, bitrate: 8, duration: 0, source: 'output', audio: false, ...opts, format: fmt };
    const c = document.createElement('canvas');
    c.width = this.opts.width;
    c.height = this.opts.height;
    c.className = 'rec-canvas';
    document.body.appendChild(c);
    this.canvas = c;
    this.renderer = new Renderer(c, { media: this.app.media, quality: 2, antialias: true });
    if (!this.renderer.ok) {
      c.remove();
      throw new Error('Não foi possível criar o contexto WebGL de gravação.');
    }
    const stream = c.captureStream(this.opts.fps);
    if (this.opts.audio) {
      const as = this.app.audio?.recordStream();
      as?.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
    this.chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: Math.round(this.opts.bitrate * 1e6) });
    rec.ondataavailable = (e) => e.data && e.data.size && this.chunks.push(e.data);
    rec.onstop = () => this._finish();
    rec.onerror = (e) => {
      this.emit('error', e.error || new Error('Erro na gravação'));
      this._cleanup();
    };
    this.mr = rec;
    this.stream = stream;
    this.active = true;
    this.startedAt = performance.now();
    this.renderFrame();
    rec.start(1000);
    this.emit('start', this.opts);
  }

  /** Called by the app every animation frame while recording. */
  renderFrame() {
    if (!this.active || !this.renderer) return;
    const app = this.app;
    const sim = this.opts.source === 'simulation';
    this.renderer.render({
      project: app.store.project,
      t: app.transport.time,
      clock: app.transport.clock,
      stage: { x: 0, y: 0, w: this.canvas.width, h: this.canvas.height },
      simulation: sim ? app.simulationParams() : null,
      calibration: app.calibrationForRender(),
      audio: app.audio?.levels,
    });
    const elapsed = (performance.now() - this.startedAt) / 1000;
    this.emit('progress', elapsed);
    if (this.opts.duration > 0 && elapsed >= this.opts.duration) this.stop();
  }

  get elapsed() {
    return this.active ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    try {
      if (this.mr && this.mr.state !== 'inactive') this.mr.stop();
      else this._finish();
    } catch (_) {
      this._finish();
    }
  }

  _finish() {
    const fmt = this.opts.format;
    const blob = new Blob(this.chunks, { type: fmt.mime.split(';')[0] });
    const name = timestampName(this.opts.name || 'luzmap', fmt.ext);
    this._cleanup();
    this.emit('done', { blob, name, format: fmt, duration: (performance.now() - this.startedAt) / 1000 });
  }

  _cleanup() {
    this.active = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.renderer?.dispose();
    this.canvas?.remove();
    this.renderer = null;
    this.canvas = null;
    this.mr = null;
  }

  /** Records the whole browser tab/screen (includes the interface). */
  async startScreen() {
    const formats = recordingFormats();
    if (!formats.length) throw new Error('Gravação não suportada neste navegador.');
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include' });
    const fmt = formats[0];
    const chunks = [];
    const mr = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 8e6 });
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const t0 = performance.now();
    return new Promise((resolve) => {
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        resolve({ blob: new Blob(chunks, { type: fmt.mime.split(';')[0] }), name: timestampName('luzmap-tela', fmt.ext), format: fmt, duration: (performance.now() - t0) / 1000 });
      };
      stream.getVideoTracks()[0].addEventListener('ended', () => mr.state !== 'inactive' && mr.stop());
      mr.start(1000);
      this.screenRecorder = mr;
      this.emit('screenstart');
    });
  }

  stopScreen() {
    if (this.screenRecorder && this.screenRecorder.state !== 'inactive') this.screenRecorder.stop();
    this.screenRecorder = null;
  }
}
