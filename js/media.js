// Media manager: imports user files (images, GIFs, videos, audio), keeps the
// blobs in IndexedDB, exposes frames to the renderer and keeps video playback
// synchronised with the timeline.

import { uid, Emitter } from './utils.js';
import { storage } from './storage.js';

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv|ogg)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|oga|flac|opus)$/i;

export function mediaKind(file) {
  const t = file.type || '';
  if (t === 'image/gif' || /\.gif$/i.test(file.name)) return 'gif';
  if (t.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image';
  if (t.startsWith('video/') || VIDEO_EXT.test(file.name)) return 'video';
  if (t.startsWith('audio/') || AUDIO_EXT.test(file.name)) return 'audio';
  return null;
}

const MAX_GIF_FRAMES = 300;

export class MediaManager extends Emitter {
  constructor({ maxTexture = 4096 } = {}) {
    super();
    this.items = new Map();
    this.builtins = new Map();
    this.maxTexture = Math.min(4096, maxTexture);
    this.supportsRVFC = typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    this.audioUnlocked = false;
    this.audioEngine = null;
  }

  registerBuiltin(key, source) {
    const prev = this.builtins.get(key);
    this.builtins.set(key, {
      source,
      version: (prev?.version || 0) + 1,
      width: source.width,
      height: source.height,
    });
  }

  has(id) {
    return this.items.has(id);
  }
  get(id) {
    return this.items.get(id) || null;
  }
  status(id) {
    if (this.builtins.has(id)) return 'ready';
    return this.items.get(id)?.status || 'missing';
  }

  /** Imports a File, stores it locally and returns the project-level metadata. */
  async importFile(file) {
    const kind = mediaKind(file);
    if (!kind) throw new Error(`Formato não suportado: ${file.name}`);
    const id = uid('m');
    const rec = { id, name: file.name, kind, mime: file.type, size: file.size, blob: file, createdAt: Date.now() };
    let stored = true;
    try {
      await storage.putMedia(rec);
    } catch (err) {
      stored = false;
      console.warn('Mídia mantida apenas na memória:', err);
      this.emit('warning', err.code === 'quota' ? err.message : 'Não foi possível salvar a mídia no navegador; ela ficará disponível só nesta sessão.');
    }
    const item = await this._createItem(id, file, { name: file.name, kind, mime: file.type, size: file.size });
    item.stored = stored;
    return this.meta(id);
  }

  /** Adds a blob received from another window (projector output) or an imported JSON. */
  async addBlob(id, blob, info) {
    if (this.items.has(id) && this.items.get(id).status === 'ready') return this.items.get(id);
    return this._createItem(id, blob, info);
  }

  /** Ensures a media referenced by a project is loaded (from IndexedDB). */
  async ensure(id) {
    if (!id || this.builtins.has(id)) return true;
    const existing = this.items.get(id);
    if (existing && existing.status !== 'missing') return existing.status === 'ready' || existing.ready;
    try {
      const rec = await storage.getMedia(id);
      if (!rec || !rec.blob) {
        this.items.set(id, { id, status: 'missing' });
        this.emit('change', id);
        return false;
      }
      await this._createItem(id, rec.blob, rec);
      return true;
    } catch (err) {
      console.warn('Falha ao carregar mídia', id, err);
      this.items.set(id, { id, status: 'missing' });
      this.emit('change', id);
      return false;
    }
  }

  meta(id) {
    const it = this.items.get(id);
    if (!it) return null;
    return {
      id,
      name: it.name,
      kind: it.kind,
      mime: it.mime,
      size: it.size,
      width: it.width || 0,
      height: it.height || 0,
      duration: it.duration || 0,
      animated: !!(it.frames && it.frames.length > 1),
    };
  }

  async _createItem(id, blob, info) {
    const old = this.items.get(id);
    if (old) this._disposeItem(old);
    const item = {
      id,
      name: info.name || 'mídia',
      kind: info.kind,
      mime: info.mime || blob.type,
      size: info.size || blob.size,
      blob,
      url: URL.createObjectURL(blob),
      status: 'loading',
      version: 1,
      thumb: null,
    };
    this.items.set(id, item);
    try {
      if (item.kind === 'image' || item.kind === 'gif') await this._loadImage(item);
      else if (item.kind === 'video') await this._loadVideo(item);
      else if (item.kind === 'audio') await this._loadAudio(item);
      item.status = 'ready';
    } catch (err) {
      console.warn('Erro ao decodificar mídia', item.name, err);
      item.status = 'error';
      item.error = err.message || String(err);
    }
    this.emit('change', id);
    return item;
  }

  async _loadImage(item) {
    const img = new Image();
    img.decoding = 'async';
    img.src = item.url;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('Imagem inválida ou formato não suportado por este navegador.'));
    });
    let source = img;
    let w = img.naturalWidth || 512;
    let h = img.naturalHeight || 512;
    if (w > this.maxTexture || h > this.maxTexture || item.mime === 'image/svg+xml') {
      const k = Math.min(1, this.maxTexture / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      source = c;
      w = c.width;
      h = c.height;
    }
    item.el = source;
    item.width = w;
    item.height = h;
    item.thumb = item.url;
    if (item.kind === 'gif' && typeof window.ImageDecoder !== 'undefined') {
      try {
        await this._decodeGif(item);
      } catch (err) {
        console.warn('GIF exibido como imagem estática:', err);
      }
    }
  }

  async _decodeGif(item) {
    const data = await item.blob.arrayBuffer();
    const dec = new window.ImageDecoder({ data, type: 'image/gif' });
    await dec.tracks.ready;
    const track = dec.tracks.selectedTrack;
    try {
      await dec.completed;
    } catch (_) {
      /* partial data is fine */
    }
    const count = Math.min(track.frameCount || 1, MAX_GIF_FRAMES);
    if (count < 2) return;
    const frames = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      const bmp = await createImageBitmap(image);
      const dur = Math.max(0.02, (image.duration || 100000) / 1e6);
      image.close();
      frames.push({ bmp, start: total, dur });
      total += dur;
    }
    dec.close?.();
    item.frames = frames;
    item.duration = total;
    item.frameIndex = -1;
  }

  async _loadVideo(item) {
    const v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.loop = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.src = item.url;
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('Tempo esgotado ao carregar o vídeo.')), 20000);
      v.onloadeddata = () => {
        clearTimeout(t);
        res();
      };
      v.onerror = () => {
        clearTimeout(t);
        rej(new Error('Vídeo não suportado por este navegador (tente MP4 H.264 ou WebM).'));
      };
    });
    item.el = v;
    item.width = v.videoWidth || 640;
    item.height = v.videoHeight || 360;
    item.duration = isFinite(v.duration) ? v.duration : 0;
    item.frameVersion = 1;
    if (this.supportsRVFC) {
      const tick = () => {
        item.frameVersion++;
        if (this.items.get(item.id) === item) v.requestVideoFrameCallback(tick);
      };
      v.requestVideoFrameCallback(tick);
    }
    v.addEventListener('seeked', () => item.frameVersion++);
    item.thumb = await this._videoThumb(v).catch(() => null);
    this.audioEngine?.attachMediaElement(v);
  }

  async _loadAudio(item) {
    const a = document.createElement('audio');
    a.preload = 'auto';
    a.loop = true;
    a.src = item.url;
    await new Promise((res, rej) => {
      const t = setTimeout(res, 8000);
      a.onloadedmetadata = () => {
        clearTimeout(t);
        res();
      };
      a.onerror = () => {
        clearTimeout(t);
        rej(new Error('Áudio não suportado por este navegador.'));
      };
    });
    item.el = a;
    item.duration = isFinite(a.duration) ? a.duration : 0;
    this.audioEngine?.attachMediaElement(a);
  }

  _videoThumb(v) {
    return new Promise((resolve) => {
      try {
        const c = document.createElement('canvas');
        const k = 160 / Math.max(1, v.videoWidth);
        c.width = 160;
        c.height = Math.max(1, Math.round(v.videoHeight * k));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.7));
      } catch (_) {
        resolve(null);
      }
    });
  }

  /** Frame source for the renderer: {source, version, width, height}. */
  frame(key, time = null) {
    const b = this.builtins.get(key);
    if (b) return b;
    const it = this.items.get(key);
    if (!it || it.status !== 'ready' || !it.el) return null;
    if (it.kind === 'video') {
      const v = it.el;
      if (v.readyState < 2) return it.lastFrame || null;
      const version = this.supportsRVFC ? it.frameVersion : v.paused ? it.frameVersion : performance.now();
      it.lastFrame = { source: v, version, width: v.videoWidth || it.width, height: v.videoHeight || it.height };
      return it.lastFrame;
    }
    if (it.frames) {
      const t = it.gifTime || 0;
      const local = ((t % it.duration) + it.duration) % it.duration;
      let idx = it.frames.findIndex((f) => local >= f.start && local < f.start + f.dur);
      if (idx < 0) idx = 0;
      const f = it.frames[idx];
      return { source: f.bmp, version: idx + 1, width: f.bmp.width, height: f.bmp.height };
    }
    return { source: it.el, version: 1, width: it.width, height: it.height };
  }

  /**
   * Called every frame with the media currently on screen: Map(id -> mediaTime).
   * Keeps videos/GIFs at the expected time so editor, projector and recorder agree.
   */
  sync(active, project, transport, { forceMute = false } = {}) {
    const playing = transport.playing;
    const rate = transport.rate || 1;
    for (const [id, it] of this.items) {
      if (it.status !== 'ready') continue;
      const settings = project.media?.[id] || {};
      const speed = settings.speed ?? 1;
      const loop = settings.loop ?? true;
      if (it.frames) {
        if (active.has(id)) it.gifTime = settings.paused ? it.gifTime || 0 : active.get(id) * speed;
        continue;
      }
      if (it.kind !== 'video' && it.kind !== 'audio') continue;
      const el = it.el;
      let wanted = active.has(id) ? active.get(id) : null;
      if (it.kind === 'audio' && project.audio?.mediaId === id) wanted = transport.time;
      if (wanted === null) {
        if (!el.paused) el.pause();
        continue;
      }
      const dur = it.duration || el.duration || 0;
      let target = wanted * speed;
      if (dur > 0) target = loop ? ((target % dur) + dur) % dur : Math.min(Math.max(0, target), Math.max(0, dur - 0.04));
      el.loop = loop;
      const muted = forceMute || (it.kind === 'video' ? settings.muted ?? true : false);
      if (el.muted !== muted) el.muted = muted;
      const vol = Math.max(0, Math.min(1, (it.kind === 'audio' ? project.audio?.volume : settings.volume) ?? 1));
      if (Math.abs(el.volume - vol) > 0.01) el.volume = vol;
      let diff = Math.abs(el.currentTime - target);
      if (loop && dur > 0) diff = Math.min(diff, dur - diff);
      const shouldPlay = playing && !settings.paused && !(dur > 0 && !loop && target >= dur - 0.05);
      if (shouldPlay) {
        const r = Math.max(0.0625, Math.min(16, speed * rate));
        if (Math.abs(el.playbackRate - r) > 0.001) el.playbackRate = r;
        if (diff > 0.35 && !el.seeking) el.currentTime = target;
        if (el.paused) this._play(el, it);
      } else {
        if (!el.paused) el.pause();
        if (diff > 0.05 && !el.seeking) el.currentTime = target;
      }
    }
  }

  _play(el, it) {
    const p = el.play();
    if (p && p.catch) {
      p.catch((err) => {
        if (err && err.name === 'NotAllowedError' && !el.muted) {
          el.muted = true;
          if (!it.warnedAudio) {
            it.warnedAudio = true;
            this.emit('warning', 'O navegador bloqueou o som automático. Toque em ▶ para ativar o áudio.');
          }
          el.play().catch(() => {});
        }
      });
    }
  }

  /** Called from a user gesture so iOS/Android allow playback with sound later. */
  unlock() {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    for (const it of this.items.values()) {
      if ((it.kind === 'video' || it.kind === 'audio') && it.el && it.el.paused) {
        const p = it.el.play();
        if (p && p.then) p.then(() => it.el.pause()).catch(() => {});
      }
    }
  }

  _disposeItem(it) {
    if (it.el && (it.kind === 'video' || it.kind === 'audio')) {
      try {
        it.el.pause();
        it.el.removeAttribute('src');
        it.el.load();
      } catch (_) {
        /* ignored */
      }
    }
    if (it.frames) it.frames.forEach((f) => f.bmp.close?.());
    if (it.url) URL.revokeObjectURL(it.url);
  }

  remove(id) {
    const it = this.items.get(id);
    if (it) this._disposeItem(it);
    this.items.delete(id);
    this.emit('change', id);
  }

  async deleteForever(id) {
    this.remove(id);
    await storage.deleteMedia(id);
  }
}
