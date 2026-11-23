// Audio analysis for audio-reactive effects (microphone and/or the media that
// is playing) and an audio track for recordings.

import { Emitter } from './utils.js';

export class AudioEngine extends Emitter {
  constructor() {
    super();
    this.ctx = null;
    this.analyser = null;
    this.levels = [0, 0, 0, 0];
    this.connected = new WeakSet();
    this.pending = new Set();
    this.mic = null;
    this.sourceLabel = '';
  }

  get supported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  get active() {
    return !!this.ctx && (!!this.mic || this.mediaCount > 0);
  }

  /** Creates/resumes the AudioContext. Call from a user gesture. */
  ensure() {
    if (!this.supported) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.75;
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.master.connect(this.analyser);
      this.recDest = this.ctx.createMediaStreamDestination ? this.ctx.createMediaStreamDestination() : null;
      if (this.recDest) this.master.connect(this.recDest);
      this.mediaCount = 0;
      for (const el of this.pending) this._connect(el);
      this.pending.clear();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  attachMediaElement(el) {
    if (!this.ctx) {
      this.pending.add(el);
      return;
    }
    this._connect(el);
  }

  _connect(el) {
    if (this.connected.has(el)) return;
    try {
      const src = this.ctx.createMediaElementSource(el);
      src.connect(this.master);
      this.connected.add(el);
      this.mediaCount++;
      if (!this.mic) this.sourceLabel = 'Áudio das mídias / trilha sonora';
    } catch (err) {
      console.warn('Não foi possível analisar o áudio desta mídia', err);
    }
  }

  async useMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microfone não disponível neste navegador (é preciso HTTPS).');
    this.ensure();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
    this.stopMicrophone();
    this.mic = { stream, node: this.ctx.createMediaStreamSource(stream) };
    this.mic.node.connect(this.analyser);
    this.sourceLabel = 'Microfone';
    this.emit('change');
  }

  stopMicrophone() {
    if (!this.mic) return;
    this.mic.stream.getTracks().forEach((t) => t.stop());
    try {
      this.mic.node.disconnect();
    } catch (_) {
      /* ignored */
    }
    this.mic = null;
    this.sourceLabel = this.mediaCount ? 'Áudio das mídias / trilha sonora' : '';
    this.emit('change');
  }

  update() {
    if (!this.analyser) return this.levels;
    this.analyser.getByteFrequencyData(this.data);
    const n = this.data.length;
    const hzPerBin = this.ctx.sampleRate / 2 / n;
    const band = (lo, hi) => {
      const a = Math.max(0, Math.floor(lo / hzPerBin));
      const b = Math.min(n - 1, Math.ceil(hi / hzPerBin));
      let s = 0;
      for (let i = a; i <= b; i++) s += this.data[i];
      return s / Math.max(1, b - a + 1) / 255;
    };
    const bass = band(20, 200);
    const mid = band(200, 2000);
    const treble = band(2000, 10000);
    const level = Math.min(1, bass * 0.5 + mid * 0.35 + treble * 0.15) * 1.3;
    const k = 0.35;
    const next = [level, bass, mid, treble];
    this.levels = this.levels.map((v, i) => v + (next[i] - v) * k);
    return this.levels;
  }

  recordStream() {
    this.ensure();
    return this.recDest ? this.recDest.stream : null;
  }
}
