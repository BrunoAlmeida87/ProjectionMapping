// Playback clock. `time` is the timeline position (wraps when looping);
// `clock` is a monotonic "playing time" that drives effect animation so that
// loops never cause visual jumps.

import { Emitter, clamp } from './utils.js';

export class Transport extends Emitter {
  constructor() {
    super();
    this.playing = true;
    this.time = 0;
    this.clock = 0;
    this.rate = 1;
    this.duration = 30;
    this.loop = true;
  }

  configure({ duration, loop }) {
    if (duration) this.duration = Math.max(0.5, duration);
    if (loop !== undefined) this.loop = !!loop;
    if (this.time > this.duration) this.time = this.loop ? this.time % this.duration : this.duration;
  }

  update(dt) {
    if (!this.playing) return false;
    const d = dt * this.rate;
    this.clock += d;
    this.time += d;
    if (this.time >= this.duration) {
      if (this.loop) {
        this.time %= this.duration;
        this.emit('loop');
      } else {
        this.time = this.duration;
        this.pause();
        this.emit('end');
      }
    }
    return true;
  }

  play() {
    if (this.playing) return;
    if (!this.loop && this.time >= this.duration - 1e-3) this.time = 0;
    this.playing = true;
    this.emit('state');
  }
  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.emit('state');
  }
  toggle() {
    this.playing ? this.pause() : this.play();
  }
  seek(t) {
    this.time = clamp(t, 0, this.duration);
    this.emit('seek');
    this.emit('state');
  }
  restart() {
    this.seek(0);
    this.play();
  }
  setRate(r) {
    this.rate = clamp(r, 0.05, 8);
    this.emit('state');
  }

  snapshot() {
    return { playing: this.playing, time: this.time, clock: this.clock, rate: this.rate, duration: this.duration, loop: this.loop, at: Date.now() };
  }

  /** Follow a remote transport (projector window), extrapolating from its timestamp. */
  follow(s) {
    const lag = s.playing ? Math.max(0, (Date.now() - s.at) / 1000) * s.rate : 0;
    this.rate = s.rate;
    this.duration = s.duration;
    this.loop = s.loop;
    const t = s.time + lag;
    const c = s.clock + lag;
    // Only correct when drifting, to avoid micro-jitter.
    if (Math.abs(this.clock - c) > 0.08 || !s.playing) this.clock = c;
    let target = this.loop ? t % this.duration : Math.min(t, this.duration);
    if (Math.abs(this.time - target) > 0.08 || !s.playing) this.time = target;
    this.playing = s.playing;
  }
}
