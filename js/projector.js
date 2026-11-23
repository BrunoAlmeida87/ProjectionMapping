// Editor-side projector management: opens the clean output window (placing it
// on the external screen when the Window Management API is available),
// streams project/transport/session state, serves media blobs, and supports
// the Presentation API for wireless second screens.

import { Emitter, throttle } from './utils.js';
import { Link } from './sync.js';

export class Projector extends Emitter {
  constructor(app) {
    super();
    this.app = app;
    this.outputs = new Map();
    this.win = null;
    this.screens = null;
    this.presentation = null;
    this.link = new Link((msg) => this._onMessage(msg));
    this.sendProject = throttle(() => this._sendProject(), 33);
    this.sendSession = throttle(() => this._sendSession(), 33);
    this._lastBeat = 0;
    this._lastAudio = 0;
  }

  get connectedCount() {
    return this.outputs.size;
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'hello':
        this.outputs.set(msg.id, { ...(this.outputs.get(msg.id) || {}), id: msg.id, last: Date.now(), w: msg.w, h: msg.h, kind: msg.kind });
        this._sendProject();
        this._sendTransport();
        this._sendSession();
        this.emit('outputs');
        break;
      case 'status': {
        const prev = this.outputs.get(msg.id);
        this.outputs.set(msg.id, { ...(prev || {}), ...msg, last: Date.now() });
        if (!prev || prev.w !== msg.w || prev.h !== msg.h || prev.fullscreen !== msg.fullscreen) this.emit('outputs');
        break;
      }
      case 'bye':
        this.outputs.delete(msg.id);
        this.emit('outputs');
        break;
      case 'needMedia':
        for (const id of msg.ids || []) this._sendMedia(id);
        break;
      default:
        break;
    }
  }

  _sendProject() {
    this.link.send({ type: 'project', project: JSON.parse(JSON.stringify(this.app.store.project)) });
  }

  _sendTransport() {
    this.link.send({ type: 'transport', state: this.app.transport.snapshot() });
  }

  _sendSession() {
    this.link.send({ type: 'session', session: this.app.outputSession() });
  }

  _sendMedia(id) {
    const it = this.app.media.get(id);
    if (!it || !it.blob) return;
    this.link.send({ type: 'media', id, blob: it.blob, info: { name: it.name, kind: it.kind, mime: it.mime, size: it.size } });
  }

  /** Called every frame by the app. */
  tick(now) {
    if (now - this._lastBeat > 500) {
      this._lastBeat = now;
      if (this.outputs.size || this.link.connections.size) this._sendTransport();
      let changed = false;
      for (const [id, o] of this.outputs) {
        if (Date.now() - o.last > 4500) {
          this.outputs.delete(id);
          changed = true;
        }
      }
      if (changed) this.emit('outputs');
    }
    if (this.outputs.size && this.app.audio?.active && now - this._lastAudio > 33) {
      this._lastAudio = now;
      this.link.send({ type: 'audio', levels: this.app.audio.levels });
    }
  }

  transportChanged() {
    this._sendTransport();
  }

  // ------------------------------------------------------------------ windows

  async detectScreens() {
    if (!('getScreenDetails' in window)) return null;
    try {
      this.screens = await window.getScreenDetails();
      this.screens.addEventListener?.('screenschange', () => this.emit('screens'));
      this.emit('screens');
      return this.screens;
    } catch (err) {
      console.warn('Permissão de gerenciamento de janelas negada', err);
      return null;
    }
  }

  externalScreen() {
    if (!this.screens) return null;
    const list = this.screens.screens || [];
    return list.find((s) => !s.isPrimary && s !== this.screens.currentScreen) || list.find((s) => s !== this.screens.currentScreen) || null;
  }

  /** Must be called from a user gesture (click/tap). */
  openWindow({ screen = null } = {}) {
    const target = screen || this.externalScreen();
    let features = 'popup=yes,width=1280,height=720';
    if (target) features = `popup=yes,left=${target.availLeft},top=${target.availTop},width=${target.availWidth},height=${target.availHeight}`;
    const url = new URL('output.html', location.href);
    if (target) url.hash = 'auto-fullscreen';
    const w = window.open(url.href, 'luzmap-output', features);
    if (!w) return { ok: false, reason: 'blocked' };
    this.win = w;
    this.link.addPeer(w);
    try {
      w.focus();
    } catch (_) {
      /* ignored */
    }
    return { ok: true, placed: !!target };
  }

  closeWindow() {
    try {
      this.win?.close();
    } catch (_) {
      /* ignored */
    }
    this.win = null;
  }

  // ------------------------------------------------------------------ presentation API

  get presentationSupported() {
    return typeof window.PresentationRequest !== 'undefined';
  }

  async startPresentation() {
    if (!this.presentationSupported) throw new Error('Este navegador não suporta a Presentation API.');
    const url = new URL('output.html', location.href).href;
    const req = new window.PresentationRequest([url]);
    const conn = await req.start();
    this.presentation = conn;
    const onConnect = () => {
      this.link.attachConnection(conn);
      this._sendProject();
      this._sendTransport();
      this._sendSession();
      for (const id of Object.keys(this.app.store.project.media)) this._sendMedia(id);
      this.emit('outputs');
    };
    if (conn.state === 'connected') onConnect();
    else conn.addEventListener('connect', onConnect, { once: true });
    conn.addEventListener('terminate', () => {
      this.presentation = null;
      this.emit('outputs');
    });
    return conn;
  }

  stopPresentation() {
    try {
      this.presentation?.terminate();
    } catch (_) {
      /* ignored */
    }
    this.presentation = null;
  }
}
