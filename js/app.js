// LuzMap — application bootstrap and glue between modules.

import { el, $, $$, debounce, clamp, formatTime, formatBytes, downloadBlob, blobToDataURL, dataURLToBlob, timestampName, uid, sleep } from './utils.js';
import { icon, btn, toast, modal, confirmDialog, promptDialog, closeTopModal, hasOpenModal, segmented, selectRow, toggleRow } from './ui.js';
import { Store, createProject, createSurface, effectContent, mediaContent, normalizeProject, collectActiveMedia, referencedMedia, removeKey, defaultSurfaceRect, PROJECT_VERSION } from './state.js';
import { Renderer } from './renderer.js';
import { MediaManager } from './media.js';
import { storage, prefs } from './storage.js';
import { Editor, TOOLS } from './editor.js';
import { LayersPanel, EffectsPanel, MediaPanel, bindDropTarget } from './panels.js';
import { Inspector } from './inspector.js';
import { TimelinePanel } from './timeline.js';
import { Transport } from './transport.js';
import { Projector } from './projector.js';
import { CalibrationDock } from './calibration.js';
import { Recorder, recordingFormats, canRecordCanvas, canRecordScreen } from './recorder.js';
import { AudioEngine } from './audio.js';
import { DemoController, DEMO_DURATION } from './demo.js';
import { renderRoom } from './room.js';
import { PRESET_MAP } from './presets.js';
import { EFFECT_MAP } from './effects.js';
import { detectCapabilities, autoQuality, isMobile, isIOS, fullscreenSupported, screenInfo, isStandalone } from './capabilities.js';
import { surfaceOutline, pointInPolygon, rectPoints } from './mapping.js';

const DEMO_VIDEO = 'demos/luzmap-demo.mp4';
const DEMO_POSTER = 'demos/luzmap-demo-poster.jpg';

class App {
  constructor() {
    this.store = new Store();
    this.transport = new Transport();
    this.media = new MediaManager({});
    this.audio = new AudioEngine();
    this.media.audioEngine = this.audio;
    this.view = { simulation: false, showBackground: true };
    this.calibration = { pattern: 'none', outlines: false, vertices: false, gridPx: 80, color: '#00e5ff' };
    this.blackout = false;
    this.qualityPref = prefs.get('quality', 'auto');
    this.dirty = true;
    this.manual = false;
    this.cleanOutput = false;
    this.fps = 0;
    this.saveState = 'saved';
    this.thumbWaiters = [];
    this._lowFpsSince = 0;
    this._gcTick = 0;
  }

  // ---------------------------------------------------------------- init

  async init() {
    this.viewport = $('#viewport');
    this.glCanvas = $('#gl');
    this.overlay = $('#overlay');
    hydrateIcons(document);

    this.renderer = new Renderer(this.glCanvas, {
      media: this.media,
      quality: 1,
      onLost: () => toast('A GPU reiniciou o contexto gráfico. Recuperando…', { type: 'warn' }),
      onRestored: () => {
        toast('Renderização recuperada.', { type: 'ok' });
        this.requestRender();
      },
    });
    if (!this.renderer.ok) {
      modal({ title: 'WebGL indisponível', content: el('p', 'Este navegador não conseguiu iniciar a renderização por GPU (WebGL). Atualize o navegador, ative a aceleração de hardware ou tente outro navegador (Chrome, Edge, Firefox ou Safari recentes).') });
    }
    this.media.maxTexture = Math.min(4096, this.renderer.maxTexture || 4096);
    this.quality = this.qualityPref === 'auto' ? autoQuality(this.renderer) : +this.qualityPref;
    this.renderer.setQuality(this.quality);

    this.editor = new Editor({
      store: this.store,
      viewport: this.viewport,
      glCanvas: this.glCanvas,
      overlay: this.overlay,
      getRenderScale: () => this.renderScale(),
    });
    this.editor.options.snap = prefs.get('snap', true);
    this.editor.options.grid = prefs.get('grid', false);
    this.editor.options.labels = prefs.get('labels', true);
    this.projector = new Projector(this);
    this.recorder = new Recorder(this);
    this.perfInfoEl = el('p.muted.small.perf-info');

    this.layers = new LayersPanel(this, $('#panel-layers'));
    this.effects = new EffectsPanel(this, $('#panel-effects'));
    this.mediaPanel = new MediaPanel(this, $('#panel-media'));
    this.inspector = new Inspector(this, $('#inspector-body'));
    this.timeline = new TimelinePanel(this, $('#panel-timeline'));
    this.calDock = new CalibrationDock(this);
    this.demo = new DemoController(this);

    this._buildToolbar();
    this._bindHeader();
    this._bindStore();
    this._bindKeyboard();
    this._bindMobile();
    bindDropTarget(this, document.body);
    this.media.on('warning', (m) => toast(m, { type: 'warn', duration: 6000 }));
    this.media.on('change', () => this.requestRender());
    this.editor.on('change', () => this.requestRender());
    this.editor.on('tool', (t) => this._syncToolbar(t));
    this.editor.on('draft', () => this._syncDraftBar());
    this.editor.on('locked', (s) => toast(`"${s.name}" está bloqueada. Desbloqueie para editar.`, { duration: 2000 }));
    this.editor.on('cleantap', () => this._showCleanExit());
    this.transport.on('state', () => {
      this.projector.transportChanged();
      this.requestRender();
    });
    this.transport.on('seek', () => this.projector.transportChanged());
    this.projector.on('outputs', () => this._updateStatus());
    this.recorder.on('start', () => document.body.classList.add('recording'));
    this.recorder.on('done', (r) => this._recordingDone(r));
    this.recorder.on('error', (e) => toast(`Gravação interrompida: ${e.message}`, { type: 'error' }));
    window.addEventListener('beforeunload', () => this.saveNow(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveNow(false);
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && this.cleanOutput && !isIOS()) this.exitCleanOutput();
    });

    await this._restoreSession();
    this.renderer.warmup(['grid', 'waves', 'neon']);
    requestAnimationFrame((t) => this._frame(t));
    setTimeout(() => this.effects.generateThumbnails(), 300);
    this._registerSW();
    this._updateStatus();
    this._handleUrl();
    window.__luzmap = this;
  }

  renderScale() {
    const dpr = window.devicePixelRatio || 1;
    return this.quality >= 2 ? Math.min(dpr, 2) : this.quality === 1 ? Math.min(dpr, 1.5) : Math.min(dpr, 1) * 0.7;
  }

  setQualityPref(v) {
    this.qualityPref = v;
    prefs.set('quality', v);
    this.quality = v === 'auto' ? autoQuality(this.renderer) : +v;
    this.renderer.setQuality(this.quality);
    this.editor.resize();
    this.requestRender();
    this._updateStatus();
    toast(`Qualidade: ${['baixa', 'média', 'alta'][this.quality]}${v === 'auto' ? ' (automática)' : ''}.`);
  }

  requestRender() {
    this.dirty = true;
  }

  // ---------------------------------------------------------------- frame loop

  _frame(now) {
    const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 0.016;
    this._last = now;
    if (!this.manual) this._step(dt, now);
    else if (this.dirty) this._draw();
    requestAnimationFrame((t) => this._frame(t));
  }

  /** Advances the app by dt seconds and draws (used by the deterministic video capture). */
  advance(dt) {
    this._step(dt, performance.now());
  }

  _step(dt, now) {
    const playing = this.transport.update(dt);
    const anim = this.editor.update(dt);
    if (this.demo.active) this.demo.tick();
    if (this.audio.ctx) this.audio.update();
    const project = this.store.project;
    const active = collectActiveMedia(project, this.transport.time, this.transport.clock);
    this.media.sync(active, project, this.transport);
    const needs = this.dirty || anim || (playing && (project.surfaces.length > 0 || this.calibration.pattern !== 'none')) || this.recorder.active;
    if (needs) this._draw();
    this.timeline.tick();
    if (this.recorder.active) this.recorder.renderFrame();
    this.projector.tick(now);
    this._measure(now, needs, playing);
  }

  _draw() {
    this.dirty = false;
    const [w, h] = this.editor.glSize();
    this.renderer.resize(w, h);
    const p = this.store.project;
    const bg = p.background;
    const bgKey = bg.mediaId && bg.visible !== false && this.view.showBackground ? bg.mediaId : null;
    if (bgKey === 'builtin:room') this.ensureRoom();
    this.renderer.render({
      project: p,
      t: this.transport.time,
      clock: this.transport.clock,
      stage: this.editor.stageGL(),
      outsideColor: this.cleanOutput ? [0, 0, 0] : [0.055, 0.063, 0.082],
      background: !this.cleanOutput && !this.view.simulation && bgKey ? { key: bgKey, opacity: bg.opacity } : null,
      simulation: !this.cleanOutput && this.view.simulation ? this.simulationParams() : null,
      calibration: this.calibrationForRender(),
      blackout: this.cleanOutput && this.blackout,
      audio: this.audio.levels,
    });
    this.editor.timeState = { t: this.transport.time, clock: this.transport.clock };
    this.editor.drawOverlay();
    if (this.thumbWaiters.length) {
      const url = this._captureThumb();
      this.thumbWaiters.splice(0).forEach((r) => r(url));
    }
  }

  _measure(now, rendered, playing) {
    this._frames = (this._frames || 0) + (rendered ? 1 : 0);
    if (!this._fpsT) this._fpsT = now;
    if (now - this._fpsT >= 1000) {
      this.fps = Math.round((this._frames * 1000) / (now - this._fpsT));
      this._frames = 0;
      this._fpsT = now;
      this._updateStatus();
      if (++this._gcTick % 10 === 0) this.renderer.collectGarbage(30000);
      // Adaptive quality: drop a level if we keep rendering slowly.
      if (this.qualityPref === 'auto' && playing && rendered && this.fps > 0 && this.fps < 28 && this.quality > 0 && !this.recorder.active && !this.manual) {
        if (!this._lowFpsSince) this._lowFpsSince = now;
        else if (now - this._lowFpsSince > 4000) {
          this.quality--;
          this.renderer.setQuality(this.quality);
          this._lowFpsSince = 0;
          toast(`Qualidade reduzida para "${['baixa', 'média', 'alta'][this.quality]}" para manter a fluidez.`, { duration: 3000 });
        }
      } else this._lowFpsSince = 0;
    }
  }

  simulationParams() {
    const bg = this.store.project.background;
    return { albedoKey: bg.mediaId || null, ambient: 0.2, gain: 1.25 };
  }

  calibrationForRender() {
    const c = this.calibration;
    if (c.pattern === 'none' && !c.outlines && !c.vertices) return null;
    return { ...c, selectedId: this.store.sel.surfaceId };
  }

  outputSession() {
    return { calibration: this.calibrationForRender(), blackout: this.blackout, solo: null };
  }

  sessionChanged() {
    this.projector.sendSession();
    this.requestRender();
  }

  setBlackout(v) {
    this.blackout = !!v;
    $('#btn-blackout')?.classList.toggle('on', this.blackout);
    this.sessionChanged();
    toast(this.blackout ? 'Blackout ativado: a saída do projetor está preta.' : 'Blackout desativado.', { duration: 1800 });
  }

  ensureRoom() {
    if (this._room) return;
    this._room = renderRoom(1920, 1080);
    this.media.registerBuiltin('builtin:room', this._room);
  }

  setSimulation(on) {
    this.view.simulation = !!on;
    if (on && !this.store.project.background.mediaId) toast('Simulação sem foto de referência: importe uma foto do ambiente (aba Mídia) para um resultado realista.', { duration: 4500 });
    $('#btn-sim')?.classList.toggle('on', this.view.simulation);
    this.requestRender();
    this.inspector.refresh();
  }

  // ---------------------------------------------------------------- store wiring

  _bindStore() {
    const s = this.store;
    this._autosave = debounce(() => this.saveNow(false), 1500);
    s.on('change', ({ kind, detail }) => {
      this.requestRender();
      this.projector.sendProject();
      if (kind === 'project' || kind === 'timeline' || kind === 'structure') this.transport.configure(s.project.timeline);
      if (kind === 'project' || kind === 'project-meta') this._updateProjectName();
      this._markDirty();
    });
    s.on('selection', () => {
      this.requestRender();
      this.sessionChanged();
      this._syncNudgePad();
      document.body.classList.toggle('has-selection', !!s.selected);
    });
    s.on('history', () => {
      $('#btn-undo').disabled = !s.past.length;
      $('#btn-redo').disabled = !s.future.length;
      $$('.m-undo').forEach((b) => (b.disabled = !s.past.length));
      $$('.m-redo').forEach((b) => (b.disabled = !s.future.length));
    });
  }

  _markDirty() {
    if (this.demo?.active) return;
    this.saveState = 'pending';
    this._updateSaveBadge();
    this._autosave();
  }

  _updateProjectName() {
    $$('.project-name').forEach((n) => (n.textContent = this.store.project.name));
    document.title = `${this.store.project.name} — LuzMap`;
  }

  _updateSaveBadge() {
    const b = $('#save-state');
    if (!b) return;
    const map = { saved: ['Salvo', 'ok'], pending: ['Alterações…', 'pending'], saving: ['Salvando…', 'pending'], error: ['Erro ao salvar', 'error'], demo: ['Demo', 'pending'] };
    const [txt, cls] = map[this.demo?.active ? 'demo' : this.saveState];
    b.textContent = txt;
    b.className = `save-state ${cls}`;
  }

  _updateStatus() {
    const st = $('#status');
    if (!st) return;
    const outs = this.projector.connectedCount;
    const o = this.store.project.output;
    st.replaceChildren(
      el('span', `${this.fps} fps`),
      el('span', `Qualidade ${['baixa', 'média', 'alta'][this.quality]}`),
      el('span', `Saída ${o.width}×${o.height}`),
      el(`span${outs ? '.ok' : ''}`, outs ? `${outs} projetor(es) conectado(s)` : 'Sem saída aberta'),
      el('span.muted', this.renderer.isWebGL2 ? 'WebGL 2' : this.renderer.ok ? 'WebGL 1' : 'sem WebGL'),
    );
    const outBtn = $('#btn-output');
    outBtn?.classList.toggle('live', outs > 0);
    if (this.perfInfoEl) this.perfInfoEl.textContent = `GPU: ${this.renderer.info?.renderer || '—'} · ${this.fps} fps · escala ${this.renderScale().toFixed(2)}×`;
  }

  // ---------------------------------------------------------------- persistence

  async _restoreSession() {
    await storage.ready();
    const lastId = prefs.get('lastProjectId');
    let restored = false;
    if (lastId) {
      try {
        const rec = await storage.getProject(lastId);
        if (rec) {
          await this.loadProject(rec.data, { silent: true });
          restored = true;
          if (rec.data.surfaces?.length)
            toast(`Sessão anterior restaurada: "${rec.name}".`, { action: { label: 'Novo projeto', run: () => this.newProject() }, duration: 5000 });
        }
      } catch (err) {
        console.warn('Falha ao restaurar sessão', err);
      }
    }
    if (!restored) this.newProject({ silent: true });
    this.saveState = 'saved';
    this._updateSaveBadge();
    if (!prefs.get('welcomed', false) && !new URLSearchParams(location.search).has('demo')) this.showWelcome();
    storage.requestPersistence();
  }

  async loadProject(data, { silent = false } = {}) {
    const p = normalizeProject(data);
    this.store.setProject(p);
    this.transport.configure(p.timeline);
    this.transport.seek(0);
    prefs.set('lastProjectId', p.id);
    if (p.background.mediaId === 'builtin:room') this.ensureRoom();
    const missing = [];
    const ids = new Set([...referencedMedia(p), ...Object.keys(p.media || {})]);
    for (const id of ids) {
      if (id.startsWith('builtin:')) continue;
      const ok = await this.media.ensure(id);
      if (!ok) missing.push(p.media[id]?.name || id);
    }
    this.requestRender();
    this.projector.sendProject();
    if (missing.length && !silent)
      toast(`${missing.length} mídia(s) não encontrada(s) neste dispositivo: ${missing.slice(0, 3).join(', ')}. Importe-as novamente.`, { type: 'warn', duration: 8000 });
    else if (missing.length) toast(`Atenção: ${missing.length} mídia(s) do projeto precisam ser importadas novamente.`, { type: 'warn', duration: 6000 });
    this.mediaPanel?.render();
  }

  newProject({ silent = false } = {}) {
    if (this.demo?.active) this.demo.stop({ restore: false });
    const p = createProject();
    this.store.setProject(p);
    this.transport.configure(p.timeline);
    this.transport.seek(0);
    this.transport.play();
    prefs.set('lastProjectId', p.id);
    this.editor.fitView();
    if (!silent) toast('Novo projeto criado.');
  }

  _captureThumb() {
    try {
      const st = this.editor.stageGL();
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = Math.round((320 * st.h) / st.w) || 180;
      c.getContext('2d').drawImage(this.glCanvas, st.x, st.y, st.w, st.h, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    } catch (_) {
      return null;
    }
  }

  thumbnail() {
    return new Promise((resolve) => {
      this.thumbWaiters.push(resolve);
      this.requestRender();
      if (this.manual) this._draw();
      setTimeout(() => resolve(null), 1500);
    });
  }

  async saveNow(explicit = false) {
    if (this.demo?.active && !explicit) return;
    if (this.demo?.active && explicit) this.demo.keepAsProject();
    const p = this.store.project;
    this.saveState = 'saving';
    this._updateSaveBadge();
    try {
      const thumb = explicit || !this._lastThumbAt || Date.now() - this._lastThumbAt > 20000 ? await this.thumbnail() : this._lastThumb;
      if (thumb) {
        this._lastThumb = thumb;
        this._lastThumbAt = Date.now();
      }
      await storage.saveProject(p, thumb);
      prefs.set('lastProjectId', p.id);
      this.saveState = 'saved';
      if (explicit) toast(`Projeto "${p.name}" salvo neste dispositivo.`, { type: 'ok', duration: 2200 });
    } catch (err) {
      this.saveState = 'error';
      toast(err.message || 'Erro ao salvar o projeto.', { type: 'error', duration: 7000 });
    }
    this._updateSaveBadge();
  }

  async exportProject({ embed = false } = {}) {
    const p = JSON.parse(JSON.stringify(this.store.project));
    const out = { format: 'luzmap-project', version: PROJECT_VERSION, exportedAt: new Date().toISOString(), project: p };
    if (embed) {
      out.embeddedMedia = {};
      for (const id of referencedMedia(p)) {
        const it = this.media.get(id);
        if (it && it.blob) out.embeddedMedia[id] = { name: it.name, kind: it.kind, mime: it.mime, size: it.size, data: await blobToDataURL(it.blob) };
      }
    }
    const blob = new Blob([JSON.stringify(out, null, embed ? 0 : 2)], { type: 'application/json' });
    const safe = p.name.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'projeto';
    downloadBlob(blob, `${safe}.luzmap.json`);
    toast(`Projeto exportado (${formatBytes(blob.size)}).`, { type: 'ok' });
  }

  async importProjectFile(file) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const data = json.format === 'luzmap-project' ? json.project : json;
      if (!data || !Array.isArray(data.surfaces)) throw new Error('Arquivo não é um projeto LuzMap válido.');
      const existing = data.id ? await storage.getProject(data.id) : null;
      if (existing) data.id = uid('p');
      if (json.embeddedMedia) {
        for (const [id, m] of Object.entries(json.embeddedMedia)) {
          const blob = await dataURLToBlob(m.data);
          await storage.putMedia({ id, name: m.name, kind: m.kind, mime: m.mime, size: m.size, blob, createdAt: Date.now() }).catch(() => {});
          await this.media.addBlob(id, blob, m);
        }
      }
      await this.loadProject(data);
      await this.saveNow(false);
      toast(`Projeto "${this.store.project.name}" importado.`, { type: 'ok' });
    } catch (err) {
      toast(`Falha ao importar: ${err.message}`, { type: 'error', duration: 6000 });
    }
  }

  async listLibrary() {
    const all = await storage.listMedia();
    return all.map(({ blob, ...rest }) => rest);
  }

  storageEstimate() {
    return storage.estimate();
  }

  // ---------------------------------------------------------------- surface actions

  addDefaultSurface(kind = 'quad') {
    const p = this.store.project;
    const n = p.surfaces.length;
    const off = (n % 5) * 0.03;
    const pts = defaultSurfaceRect(p, 0.32).map(([x, y]) => [x + off, y + off]);
    const s = kind === 'mask' ? createSurface('rect', pts, { role: 'mask' }) : createSurface('quad', pts);
    this.store.addSurface(s);
    this.editor.setTool('select');
    return s;
  }

  duplicateSelected() {
    const s = this.store.selected;
    if (s) this.store.duplicateSurface(s.id);
  }

  async deleteSelected() {
    const s = this.store.selected;
    if (!s) return;
    this.store.removeSurface(s.id);
    toast(`"${s.name}" excluída.`, { action: { label: 'Desfazer', run: () => this.store.undo() }, duration: 4000 });
  }

  applyEffect(fxId, surface = null) {
    const fx = EFFECT_MAP[fxId];
    let s = surface || this.store.selected;
    if (s && s.role === 'mask') s = null;
    if (!s) {
      s = this.addDefaultSurface();
      s.name = fx.name;
    }
    this.store.checkpoint();
    const content = effectContent(fxId);
    const clipId = this.store.sel.clipId;
    const clip = clipId && s.clips.find((c) => c.id === clipId);
    if (clip) clip.content = content;
    else s.content = content;
    this.store.select(s.id, { clipId: clip ? clip.id : null });
    this.store.changed('content');
    if (!this.transport.playing) this.transport.play();
    toast(`${fx.name} aplicado em "${s.name}".`, { duration: 1600 });
    if (isMobile()) this.showPanel(null);
  }

  dropEffectAt(fxId, clientX, clientY) {
    const r = this.viewport.getBoundingClientRect();
    const hit = this.editor.hitSurface(clientX - r.left, clientY - r.top);
    this.applyEffect(fxId, hit && hit.role !== 'mask' ? hit : null);
  }

  applyPreset(id) {
    const preset = PRESET_MAP[id];
    if (!preset) return;
    const sel = this.store.selected;
    if (sel && sel.role !== 'mask' && preset.style) {
      this.store.checkpoint();
      preset.style(sel);
      sel.clips = [];
      this.store.changed('content');
      toast(`Preset "${preset.name}" aplicado em "${sel.name}".`, { duration: 1800 });
    } else {
      const list = preset.build();
      this.store.checkpoint();
      this.store.project.surfaces.push(...list);
      this.store.changed('structure');
      this.store.select(list[list.length - 1].id);
      toast(`Preset "${preset.name}" adicionado. Arraste os cantos para encaixar no objeto real.`, { duration: 3500 });
    }
    if (!this.transport.playing) this.transport.play();
    if (isMobile()) this.showPanel(null);
  }

  async importFiles(files, at = null) {
    const projectFiles = files.filter((f) => /\.json$/i.test(f.name));
    for (const f of projectFiles) await this.importProjectFile(f);
    const mediaFiles = files.filter((f) => !/\.json$/i.test(f.name));
    let lastVisual = null;
    for (const f of mediaFiles) {
      const t = toast(`Importando ${f.name}…`, { duration: 0 });
      try {
        const meta = await this.media.importFile(f);
        this.store.project.media[meta.id] = { ...meta, loop: true, speed: 1, paused: false, muted: true, volume: 1 };
        this.store.changed('media');
        if (meta.kind !== 'audio') lastVisual = meta;
        const item = this.media.get(meta.id);
        if (item?.status === 'error') toast(`${f.name}: ${item.error}`, { type: 'error', duration: 6000 });
        else toast(`${f.name} importado (${formatBytes(f.size)}).`, { type: 'ok', duration: 2000 });
      } catch (err) {
        toast(err.message, { type: 'error', duration: 6000 });
      }
      t.remove();
    }
    if (lastVisual && at) {
      const r = this.viewport.getBoundingClientRect();
      const hit = this.editor.hitSurface(at.clientX - r.left, at.clientY - r.top);
      if (hit) this.applyMedia(lastVisual.id, hit);
    } else if (lastVisual && this.store.selected && this.store.selected.role !== 'mask') this.applyMedia(lastVisual.id);
    this.mediaPanel.render();
  }

  async applyMedia(id, surface = null) {
    const ok = await this.media.ensure(id);
    if (!ok) {
      toast('Mídia indisponível neste dispositivo. Importe o arquivo novamente.', { type: 'warn' });
      return;
    }
    const p = this.store.project;
    if (!p.media[id]) {
      const meta = this.media.meta(id);
      p.media[id] = { ...meta, loop: true, speed: 1, paused: false, muted: true, volume: 1 };
    }
    let s = surface || this.store.selected;
    if (s && s.role === 'mask') s = null;
    if (!s) {
      s = this.addDefaultSurface();
      s.name = p.media[id].name;
    }
    this.store.checkpoint();
    const clipId = this.store.sel.clipId;
    const clip = clipId && s.clips.find((c) => c.id === clipId);
    if (clip) clip.content = mediaContent(id);
    else s.content = mediaContent(id);
    this.store.select(s.id, { clipId: clip ? clip.id : null });
    this.store.changed('content');
    this.media.unlock();
    if (!this.transport.playing) this.transport.play();
    if (isMobile()) this.showPanel(null);
  }

  async setBackground(id) {
    const p = this.store.project;
    this.store.checkpoint();
    if (id && id !== 'builtin:room') {
      await this.media.ensure(id);
      if (!p.media[id]) p.media[id] = { ...this.media.meta(id), loop: true, speed: 1 };
    }
    if (id === 'builtin:room') this.ensureRoom();
    p.background.mediaId = id || null;
    p.background.visible = true;
    this.store.changed('project-meta');
    if (id) toast('Foto de referência definida (aparece só no editor). Ative "Simulação" para ver a luz sobre ela.', { duration: 3500 });
  }

  async setSoundtrack(id) {
    const p = this.store.project;
    this.store.checkpoint();
    if (!p.media[id]) p.media[id] = { ...this.media.meta(id), loop: true, speed: 1 };
    p.audio.mediaId = p.audio.mediaId === id ? null : id;
    this.store.changed('media');
    this.audio.ensure();
    this.media.unlock();
    toast(p.audio.mediaId ? 'Trilha sonora definida: toca sincronizada com a timeline e alimenta o áudio reativo.' : 'Trilha sonora removida.');
  }

  async deleteMedia(id) {
    const p = this.store.project;
    for (const s of p.surfaces) {
      if (s.content.type === 'media' && s.content.mediaId === id) s.content = { type: 'none' };
      for (const c of s.clips) if (c.content.type === 'media' && c.content.mediaId === id) c.content = { type: 'none' };
    }
    if (p.background.mediaId === id) p.background.mediaId = null;
    if (p.audio.mediaId === id) p.audio.mediaId = null;
    delete p.media[id];
    this.renderer.dropTexture(id);
    await this.media.deleteForever(id).catch(() => {});
    this.store.changed('media');
  }

  setResolution(w, h) {
    w = clamp(Math.round(w) || 1920, 64, 8192);
    h = clamp(Math.round(h) || 1080, 64, 8192);
    const o = this.store.project.output;
    if (o.width === w && o.height === h) return;
    this.store.checkpoint();
    o.width = w;
    o.height = h;
    this.store.changed('project-meta');
    this.editor.fitView();
    this._updateStatus();
    toast(`Resolução de saída: ${w} × ${h}.`, { duration: 1800 });
  }

  useScreenResolution() {
    const s = screenInfo();
    this.setResolution(s.w, s.h);
  }

  // ---------------------------------------------------------------- transport

  togglePlay() {
    this.media.unlock();
    this.audio.ctx?.resume?.();
    this.transport.toggle();
  }
  restart() {
    this.transport.restart();
  }
  seek(t) {
    this.transport.seek(t);
    this.requestRender();
    this.inspector.refresh();
  }
  toggleLoop() {
    this.store.checkpoint();
    this.store.project.timeline.loop = !this.store.project.timeline.loop;
    this.store.changed('timeline');
    this.timeline.updateTransport();
  }
  jumpKey(dir) {
    const s = this.store.selected;
    if (!s) return;
    const t = this.transport.time;
    const times = [...new Set(Object.values(s.keys).flatMap((tr) => tr.map((k) => k.t)))].sort((a, b) => a - b);
    const next = dir > 0 ? times.find((x) => x > t + 1e-3) : [...times].reverse().find((x) => x < t - 1e-3);
    if (next !== undefined) this.seek(next);
  }

  // ---------------------------------------------------------------- projector output

  async openOutput(opts = {}) {
    if (isMobile() && !opts.forceWindow) {
      this._outputMenu(true);
      return;
    }
    const r = this.projector.openWindow(opts);
    if (!r.ok) {
      modal({
        title: 'Janela bloqueada',
        content: el('div', el('p', 'O navegador bloqueou a abertura da janela de projeção. Permita pop-ups para este site e tente novamente.'), el('p.muted', 'Alternativa: use "Saída limpa nesta tela" e espelhe/estenda a tela para o projetor.')),
        actions: [{ label: 'Saída limpa nesta tela', run: () => this.enterCleanOutput() }, { label: 'OK', primary: true }],
      });
      return;
    }
    toast(r.placed ? 'Saída aberta na tela do projetor. Clique nela para ativar a tela cheia.' : 'Saída aberta: arraste a janela para a tela do projetor e pressione F (ou dê duplo clique) para tela cheia.', { duration: 6000 });
  }

  _outputMenu(mobile = false) {
    const caps = {
      fs: fullscreenSupported(),
      wm: 'getScreenDetails' in window,
      present: this.projector.presentationSupported,
    };
    const body = el(
      'div.output-menu',
      el('button.big-option', { type: 'button', onclick: () => {
        m.close();
        this.openOutput({ forceWindow: true });
      } }, icon('projector'), el('span', el('strong', 'Abrir janela do projetor'), el('small', 'Computador com projetor por HDMI (área de trabalho estendida). Você continua editando nesta tela.'))),
      el('button.big-option', { type: 'button', onclick: () => {
        m.close();
        this.enterCleanOutput();
      } }, icon('fullscreen'), el('span', el('strong', 'Saída limpa nesta tela'), el('small', mobile ? 'Para celulares: espelhe a tela (USB-C → HDMI, Miracast, AirPlay) e mostre apenas a projeção.' : 'Mostra só a composição nesta janela, em tela cheia.'))),
      caps.wm
        ? el('button.big-option', { type: 'button', onclick: async () => {
            const sd = await this.projector.detectScreens();
            const ext = this.projector.externalScreen();
            m.close();
            if (!sd) toast('Permissão negada ou indisponível.', { type: 'warn' });
            else if (ext) {
              toast(`Tela externa detectada: ${ext.label || `${ext.width}×${ext.height}`}.`, { type: 'ok' });
              this.openOutput({ forceWindow: true, screen: ext });
            } else toast('Nenhuma segunda tela detectada. Conecte o projetor e escolha "Estender" nas configurações de vídeo.', { type: 'warn', duration: 6000 });
          } }, icon('monitor'), el('span', el('strong', 'Detectar o projetor e abrir nele'), el('small', 'Chrome/Edge: posiciona a saída automaticamente na segunda tela.')))
        : null,
      caps.present
        ? el('button.big-option', { type: 'button', onclick: async () => {
            m.close();
            try {
              await this.projector.startPresentation();
              toast('Transmissão iniciada.', { type: 'ok' });
            } catch (err) {
              toast(err.name === 'NotFoundError' ? 'Nenhum dispositivo de apresentação encontrado. Use o espelhamento de tela do sistema.' : `Transmissão indisponível: ${err.message}`, { type: 'warn', duration: 6000 });
            }
          } }, icon('cast'), el('span', el('strong', 'Transmitir para outra tela (experimental)'), el('small', 'Presentation API — depende do navegador e do receptor (ex.: Chromecast).')))
        : null,
      el('p.muted.small', isIOS() ? 'iPhone/iPad: o Safari não controla telas externas de forma independente. Use o Espelhamento de Tela (AirPlay) ou um adaptador HDMI e a "Saída limpa". Para ocupar a tela toda, adicione o site à Tela de Início.' : 'Celulares não permitem controlar duas telas de forma independente pelo navegador: a saída limpa + espelhamento é o caminho mais compatível.'),
    );
    const m = modal({ title: 'Saída para projetor', content: body });
  }

  async enterCleanOutput() {
    this.cleanOutput = true;
    this.editor.cleanMode = true;
    document.body.classList.add('clean-output');
    this.showPanel(null);
    this.editor.resize();
    this.requestRender();
    try {
      if (fullscreenSupported()) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    } catch (_) {
      /* ignored: still clean */
    }
    try {
      if ('wakeLock' in navigator) this._wake = await navigator.wakeLock.request('screen');
    } catch (_) {
      /* ignored */
    }
    toast(fullscreenSupported() ? 'Saída limpa. Toque na tela para sair (Esc no teclado).' : 'Saída limpa. Toque na tela para mostrar o botão de sair. Dica: adicione à Tela de Início para tela cheia.', { duration: 3500 });
  }

  exitCleanOutput() {
    if (!this.cleanOutput) return;
    this.cleanOutput = false;
    this.editor.cleanMode = false;
    document.body.classList.remove('clean-output');
    $('#clean-exit').hidden = true;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    this._wake?.release?.().catch(() => {});
    this.editor.resize();
    this.requestRender();
  }

  _showCleanExit() {
    const b = $('#clean-exit');
    b.hidden = false;
    clearTimeout(this._cleanTimer);
    this._cleanTimer = setTimeout(() => (b.hidden = true), 3000);
  }

  // ---------------------------------------------------------------- recording

  openRecorder() {
    if (!canRecordCanvas()) {
      modal({ title: 'Gravação indisponível', content: el('p', 'Este navegador não oferece MediaRecorder + captureStream para gravar o canvas. Use Chrome, Edge ou Firefox no computador, ou Safari 14.1+.') });
      return;
    }
    if (this.recorder.active) {
      this.recorder.stop();
      return;
    }
    const formats = recordingFormats();
    const o = this.store.project.output;
    const opts = {
      source: this.view.simulation ? 'simulation' : 'output',
      res: '1280x720',
      fps: 30,
      bitrate: 8,
      mime: formats[0].mime,
      duration: 0,
      fromStart: true,
      audio: false,
    };
    const resOpts = [
      { value: '854x480', label: '854 × 480 (leve)' },
      { value: '1280x720', label: '1280 × 720 (HD)' },
      { value: '1920x1080', label: '1920 × 1080 (Full HD)' },
      { value: `${o.width}x${o.height}`, label: `${o.width} × ${o.height} (saída do projeto)` },
    ].filter((v, i, a) => a.findIndex((x) => x.value === v.value) === i);
    const body = el(
      'div.rec-form',
      selectRow({ label: 'O que gravar', options: [{ value: 'output', label: 'Saída do projetor (composição limpa)' }, { value: 'simulation', label: 'Simulação no ambiente (foto/sala + luz)' }], get: () => opts.source, set: (v) => (opts.source = v) }),
      selectRow({ label: 'Resolução', options: resOpts, get: () => opts.res, set: (v) => (opts.res = v) }),
      selectRow({ label: 'Quadros por segundo', options: [24, 30, 60].map((v) => ({ value: String(v), label: `${v} fps` })), get: () => String(opts.fps), set: (v) => (opts.fps = +v) }),
      selectRow({ label: 'Qualidade', options: [{ value: '4', label: 'Padrão (4 Mbps)' }, { value: '8', label: 'Alta (8 Mbps)' }, { value: '16', label: 'Máxima (16 Mbps)' }], get: () => String(opts.bitrate), set: (v) => (opts.bitrate = +v) }),
      selectRow({ label: 'Formato', options: formats.map((f) => ({ value: f.mime, label: f.label })), get: () => opts.mime, set: (v) => (opts.mime = v) }),
      selectRow({
        label: 'Duração',
        options: [{ value: '0', label: 'Até eu parar' }, { value: '10', label: '10 s' }, { value: '30', label: '30 s' }, { value: '60', label: '60 s' }, { value: String(this.store.project.timeline.duration), label: `Timeline inteira (${formatTime(this.store.project.timeline.duration, false)})` }],
        get: () => String(opts.duration),
        set: (v) => (opts.duration = +v),
      }),
      toggleRow({ label: 'Começar do início da timeline', get: () => opts.fromStart, set: (v) => (opts.fromStart = v) }),
      this.audio.supported ? toggleRow({ label: 'Incluir áudio (vídeos com som / trilha)', get: () => opts.audio, set: (v) => (opts.audio = v) }) : null,
      el('p.muted.small', `Formatos disponíveis neste navegador: ${formats.map((f) => f.label).join(', ')}. ${formats.some((f) => f.ext === 'mp4') ? '' : 'MP4 não é suportado aqui para gravação — use WebM ou converta depois.'}`),
      canRecordScreen() ? el('p.muted.small', 'Para gravar também a interface do editor, use "Gravar a tela".') : null,
    );
    modal({
      title: 'Gravar vídeo da composição',
      content: body,
      actions: [
        canRecordScreen() ? { label: 'Gravar a tela (com interface)', icon: 'monitor', run: () => this.recordScreen() } : null,
        {
          label: 'Iniciar gravação',
          icon: 'record',
          primary: true,
          run: () => {
            const [w, h] = opts.res.split('x').map(Number);
            if (opts.fromStart) this.transport.seek(0);
            this.transport.play();
            this.audio.ensure();
            try {
              this.recorder.start({ width: w, height: h, fps: opts.fps, bitrate: opts.bitrate, mime: opts.mime, duration: opts.duration, source: opts.source, audio: opts.audio });
              toast('Gravando… clique em ■ para parar.', { duration: 2500 });
            } catch (err) {
              toast(err.message, { type: 'error' });
            }
          },
        },
      ].filter(Boolean),
    });
  }

  async recordScreen() {
    try {
      document.body.classList.add('recording');
      const r = await this.recorder.startScreen();
      this._recordingDone(r);
    } catch (err) {
      document.body.classList.remove('recording');
      if (err.name !== 'NotAllowedError') toast(`Não foi possível gravar a tela: ${err.message}`, { type: 'error' });
    }
  }

  stopRecording() {
    if (this.recorder.screenRecorder) this.recorder.stopScreen();
    else this.recorder.stop();
  }

  async recordDemo() {
    if (!canRecordCanvas()) {
      toast('Gravação não suportada neste navegador.', { type: 'error' });
      return;
    }
    if (!this.demo.active) await this.demo.start();
    const formats = recordingFormats();
    this.transport.configure({ duration: DEMO_DURATION, loop: false });
    this.transport.seek(0);
    this.transport.play();
    this.recorder.start({ width: 1280, height: 720, fps: 30, bitrate: 8, mime: formats[0].mime, duration: DEMO_DURATION, source: 'simulation', name: 'luzmap-demo' });
    toast('Gravando a demonstração completa (60 s)… o arquivo será baixado ao final.', { duration: 5000 });
  }

  _recordingDone({ blob, name, format, duration }) {
    document.body.classList.remove('recording');
    const url = URL.createObjectURL(blob);
    const video = el('video.rec-preview', { src: url, controls: true, playsinline: true, muted: true });
    modal({
      title: 'Gravação concluída',
      content: el('div', video, el('p.muted', `${format.label} · ${formatTime(duration, false)} · ${formatBytes(blob.size)}`), format.ext === 'webm' ? el('p.muted.small', 'Arquivos WebM gravados pelo navegador podem não mostrar a duração em alguns players; eles reproduzem normalmente.') : null),
      actions: [{ label: 'Baixar vídeo', icon: 'download', primary: true, run: () => downloadBlob(blob, name) }],
      onClose: () => setTimeout(() => URL.revokeObjectURL(url), 60000),
    });
    if (this.demo.active) this.transport.configure({ loop: true });
  }

  // ---------------------------------------------------------------- misc actions

  async useMicrophone() {
    try {
      await this.audio.useMicrophone();
      toast('Microfone ativo: superfícies com "Reação ao som" vão responder ao áudio.', { type: 'ok' });
      this.inspector.refresh();
    } catch (err) {
      toast(`Microfone indisponível: ${err.message}`, { type: 'error', duration: 5000 });
    }
  }

  openCalibrationWizard() {
    this.calDock.open('wizard');
    if (isMobile()) this.showPanel(null);
  }

  showPanel(name) {
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    if (['layers', 'effects', 'media'].includes(name)) {
      $$('.left-tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
      $$('#left-panel .tab-pane').forEach((p) => (p.hidden = p.dataset.pane !== name));
    }
    if (mobile) {
      const cur = document.body.dataset.sheet || '';
      const next = name && cur !== name ? name : '';
      document.body.dataset.sheet = next;
      $$('.mobile-tabbar [data-sheet]').forEach((b) => b.classList.toggle('on', b.dataset.sheet === next));
      setTimeout(() => this._updateInsets(), 280);
    } else if (name === 'props') $('#inspector')?.scrollIntoView?.({ block: 'nearest' });
  }

  _selectLeftTab(name) {
    $$('.left-tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    $$('#left-panel .tab-pane').forEach((p) => (p.hidden = p.dataset.pane !== name));
  }

  /** On phones the sheets cover part of the editor: fit the stage in the visible area. */
  _updateInsets() {
    const sheetName = document.body.dataset.sheet || '';
    const phone = window.matchMedia('(max-width: 900px)').matches;
    const insets = { right: 0, bottom: 0, top: phone && sheetName && !window.matchMedia('(orientation: landscape)').matches ? 50 : 0 };
    if (sheetName && phone) {
      const sheet = sheetName === 'props' ? $('#inspector') : sheetName === 'timeline' ? $('#panel-timeline') : $('#left-panel');
      const r = sheet.getBoundingClientRect();
      const v = this.viewport.getBoundingClientRect();
      if (r.left > v.left + 20 && r.height > v.height * 0.8) insets.right = Math.max(0, v.right - r.left);
      else insets.bottom = Math.max(0, v.bottom - r.top);
    }
    const changed = insets.right !== this.editor.insets.right || insets.bottom !== this.editor.insets.bottom || insets.top !== this.editor.insets.top;
    this.editor.insets = insets;
    this.editor.resize();
    if (changed) {
      this.editor.view.panX = 0;
      this.editor.view.panY = 0;
      this.editor.view.zoom = 1;
    }
    this.requestRender();
  }

  async openProjects() {
    const list = el('div.project-list');
    const refresh = async () => {
      const items = await storage.listProjects();
      list.replaceChildren();
      if (!items.length) list.appendChild(el('p.muted', 'Nenhum projeto salvo ainda.'));
      for (const it of items) {
        const current = it.id === this.store.project.id;
        list.appendChild(
          el(
            `div.project-card${current ? '.current' : ''}`,
            el('div.project-thumb', it.thumb ? el('img', { src: it.thumb, alt: '' }) : icon('projector')),
            el('div.project-meta', el('strong', it.name), el('small.muted', `${it.surfaces} superfície(s) · ${new Date(it.updatedAt).toLocaleString('pt-BR')}`), current ? el('small.ok', 'Aberto agora') : null),
            el(
              'div.project-actions',
              btn('folder', 'Abrir', async () => {
                const rec = await storage.getProject(it.id);
                if (rec) {
                  if (this.demo.active) this.demo.stop({ restore: false });
                  await this.loadProject(rec.data);
                  m.close();
                }
              }, { cls: 'primary' }),
              btn('copy', '', async () => {
                const rec = await storage.getProject(it.id);
                const d = { ...rec.data, id: uid('p'), name: `${rec.name} (cópia)`, createdAt: Date.now(), updatedAt: Date.now() };
                await storage.saveProject(d, rec.thumb);
                refresh();
              }, { iconOnly: true, title: 'Duplicar' }),
              btn('sliders', '', async () => {
                const name = await promptDialog('Renomear projeto', 'Novo nome', it.name);
                if (!name) return;
                const rec = await storage.getProject(it.id);
                rec.data.name = name;
                await storage.saveProject(rec.data, rec.thumb);
                if (current) {
                  this.store.project.name = name;
                  this._updateProjectName();
                }
                refresh();
              }, { iconOnly: true, title: 'Renomear' }),
              btn('download', '', async () => {
                const rec = await storage.getProject(it.id);
                downloadBlob(new Blob([JSON.stringify({ format: 'luzmap-project', version: PROJECT_VERSION, project: rec.data }, null, 2)], { type: 'application/json' }), `${rec.name.replace(/[^\w\-]+/g, '_')}.luzmap.json`);
              }, { iconOnly: true, title: 'Exportar JSON' }),
              btn('trash', '', async () => {
                if (!(await confirmDialog('Excluir projeto', `Excluir "${it.name}" permanentemente deste dispositivo?`, { okLabel: 'Excluir', danger: true }))) return;
                await storage.deleteProject(it.id);
                refresh();
              }, { iconOnly: true, title: 'Excluir', cls: 'danger-ghost' }),
            ),
          ),
        );
      }
    };
    const fileIn = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    fileIn.addEventListener('change', async () => {
      if (fileIn.files[0]) {
        await this.importProjectFile(fileIn.files[0]);
        m.close();
      }
    });
    const head = el(
      'div.row-btns.wrap',
      btn('plus', 'Novo projeto', () => {
        this.saveNow(false);
        this.newProject();
        m.close();
      }, { cls: 'primary' }),
      btn('save', 'Salvar atual', async () => {
        await this.saveNow(true);
        refresh();
      }),
      btn('upload', 'Importar JSON', () => fileIn.click()),
      btn('download', 'Exportar atual', () => this.exportProject()),
      btn('download', 'Exportar com mídias', () => this.exportProject({ embed: true }), { title: 'Inclui imagens/vídeos dentro do JSON (arquivo maior, abre em qualquer dispositivo)' }),
      fileIn,
    );
    const m = modal({ title: 'Projetos', content: el('div', head, list), wide: true });
    refresh();
  }

  showWelcome() {
    const opt = (iconName, title, text, run, cls = '') =>
      el(`button.big-option${cls ? '.' + cls : ''}`, { type: 'button', onclick: () => {
        m.close();
        run();
      } }, icon(iconName), el('span', el('strong', title), el('small', text)));
    const m = modal({
      title: 'Bem-vindo ao LuzMap',
      cls: 'welcome',
      content: el(
        'div',
        el('p.lead', 'Projection mapping gratuito no navegador: transforme paredes, portas, armários e objetos em superfícies animadas — no computador ou no celular, sem cadastro e sem enviar seus arquivos para servidores.'),
        el(
          'div.welcome-grid',
          opt('sparkles', 'DEMO — Experimentar projection mapping', 'Uma sala virtual é mapeada automaticamente em 7 cenas.', () => this.demo.start(), 'hero'),
          opt('film', 'Assistir demonstração', 'Vídeo real do aplicativo em uso.', () => this.watchDemoVideo()),
          opt('wand', 'Assistente de calibração', 'Passo a passo para alinhar com o seu projetor.', () => this.openCalibrationWizard()),
          opt('plus', 'Começar em branco', 'Desenhe superfícies e aplique efeitos.', () => {}),
        ),
        el('p.muted.small', 'Dica: conecte o projetor por HDMI, abra a "Saída do projetor" e arraste-a para a tela do projetor.'),
      ),
      onClose: () => prefs.set('welcomed', true),
    });
  }

  watchDemoVideo() {
    const v = el('video.demo-video', { controls: true, playsinline: true, preload: 'metadata', poster: DEMO_POSTER });
    v.appendChild(el('source', { src: DEMO_VIDEO, type: 'video/mp4' }));
    v.appendChild(el('source', { src: DEMO_VIDEO.replace('.mp4', '.webm'), type: 'video/webm' }));
    const err = el('p.warnbox', { hidden: true }, icon('info'), el('span', 'Não foi possível carregar o vídeo de demonstração. Você pode gerar o seu com o botão "GRAVAR DEMONSTRAÇÃO".'));
    v.addEventListener('error', () => (err.hidden = false), true);
    v.querySelectorAll('source')[1].addEventListener('error', () => (err.hidden = false));
    modal({
      title: 'Demonstração em vídeo',
      wide: true,
      content: el('div', v, err, el('p.muted.small', 'Vídeo gerado a partir do próprio aplicativo (interface, criação de superfícies, ajuste de vértices, efeitos, perspectiva, saída limpa e a demo residencial).')),
      actions: [{ label: 'Experimentar ao vivo', icon: 'sparkles', primary: true, run: () => this.demo.start() }],
      onClose: () => v.pause(),
    });
    v.play().catch(() => {});
  }

  showHelp() {
    const keys = [
      ['V', 'Selecionar / editar'],
      ['H ou Espaço + arrastar', 'Mover a vista'],
      ['Q R T P C E W M', 'Quadrilátero, retângulo, triângulo, polígono, círculo, elipse, malha, máscara'],
      ['Roda do mouse / pinça', 'Zoom'],
      ['0', 'Enquadrar a vista'],
      ['Setas (Shift = 10 px)', 'Mover vértice ou superfície'],
      ['Tab / Shift+Tab', 'Próximo / anterior vértice'],
      ['Duplo clique na aresta', 'Adicionar ponto ao polígono'],
      ['Delete', 'Excluir seleção (vértice de polígono, clipe, keyframe ou superfície)'],
      ['Ctrl+Z / Ctrl+Shift+Z', 'Desfazer / refazer'],
      ['Ctrl+D', 'Duplicar superfície'],
      ['Ctrl+S', 'Salvar'],
      ['Espaço', 'Reproduzir / pausar'],
      ['Home', 'Voltar ao início'],
      ['[ e ]', 'Descer / subir camada'],
      ['G / S / L', 'Grade / ímã / rótulos'],
      ['O', 'Abrir saída do projetor'],
      ['F', 'Saída limpa nesta tela'],
      ['B', 'Blackout'],
      ['Esc', 'Cancelar / desselecionar'],
    ];
    const caps = detectCapabilities(this.renderer);
    modal({
      title: 'Ajuda, atalhos e compatibilidade',
      wide: true,
      content: el(
        'div.help',
        el('h3', 'Como usar'),
        el(
          'ol',
          el('li', 'Desenhe uma superfície (ferramenta Quadrilátero: toque nos 4 cantos do objeto).'),
          el('li', 'Abra a saída do projetor e arraste cada vértice até o canto físico real.'),
          el('li', 'Escolha um efeito ou importe uma imagem/vídeo e aplique à superfície.'),
          el('li', 'Use máscaras para não projetar onde não deve. Anime com clipes e keyframes.'),
        ),
        el('h3', 'Atalhos de teclado'),
        el('table.keys', keys.map(([k, d]) => el('tr', el('td', el('kbd', k)), el('td', d)))),
        el('h3', 'Recursos deste navegador'),
        el('ul.caps', caps.map((c) => el(`li.${c.ok ? 'ok' : 'no'}`, el('b', c.ok ? '✓' : '✗'), el('span', el('strong', c.label), el('small', c.note))))),
        el('p.muted.small', 'LuzMap é software livre (MIT). Tudo roda no seu navegador; projetos e mídias ficam salvos apenas neste dispositivo (IndexedDB).'),
      ),
    });
  }

  _handleUrl() {
    const q = new URLSearchParams(location.search);
    if (q.has('demo')) setTimeout(() => this.demo.start(), 200);
    if (q.has('video')) setTimeout(() => this.watchDemoVideo(), 200);
  }

  _registerSW() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') return;
    if (new URLSearchParams(location.search).has('nosw')) return;
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw?.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller)
              toast('Nova versão do LuzMap disponível.', { action: { label: 'Atualizar', run: () => location.reload() }, duration: 0 });
          });
        });
      })
      .catch((err) => console.warn('Service worker não registrado', err));
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this._installPrompt = e;
      $('#btn-install')?.removeAttribute('hidden');
    });
  }

  async installApp() {
    if (this._installPrompt) {
      this._installPrompt.prompt();
      this._installPrompt = null;
    } else if (isIOS()) {
      modal({ title: 'Instalar no iPhone/iPad', content: el('p', 'No Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início". O LuzMap abrirá em tela cheia, sem as barras do navegador.') });
    } else {
      modal({ title: 'Instalar como aplicativo', content: el('p', isStandalone() ? 'O LuzMap já está instalado.' : 'Use o menu do navegador → "Instalar aplicativo" / "Adicionar à tela inicial".') });
    }
  }

  // ---------------------------------------------------------------- UI wiring

  _buildToolbar() {
    const bar = $('#toolbar');
    for (const t of TOOLS) {
      const b = el('button.tool', { type: 'button', title: `${t.label} (${t.key})`, 'aria-label': t.label, dataset: { tool: t.id } }, icon(t.icon), el('span.tool-key', t.key));
      b.addEventListener('click', () => this.editor.setTool(t.id));
      bar.appendChild(b);
    }
    bar.appendChild(el('span.sep'));
    const toggle = (iconName, title, key, prop) => {
      const b = el('button.tool.toggle', { type: 'button', title, 'aria-label': title, 'aria-pressed': this.editor.options[prop] }, icon(iconName));
      b.classList.toggle('on', this.editor.options[prop]);
      b.addEventListener('click', () => this._toggleOption(prop));
      b.dataset.opt = prop;
      return b;
    };
    bar.append(toggle('magnet', 'Ímã: encaixar nos vértices e bordas (S)', 'S', 'snap'), toggle('grid', 'Grade do editor (G)', 'G', 'grid'));
    this._syncToolbar('select');
    // draft bar
    $('#draft-undo').addEventListener('click', () => this.editor.undoDraftPoint());
    $('#draft-done').addEventListener('click', () => this.editor.finishDraft());
    $('#draft-cancel').addEventListener('click', () => this.editor.cancelDraft());
    // view controls
    $('#btn-zoom-in').addEventListener('click', () => this.editor.zoomAt(1.25, this.editor.cssW / 2, this.editor.cssH / 2));
    $('#btn-zoom-out').addEventListener('click', () => this.editor.zoomAt(0.8, this.editor.cssW / 2, this.editor.cssH / 2));
    $('#btn-fit').addEventListener('click', () => this.editor.fitView());
    $('#btn-sim').addEventListener('click', () => this.setSimulation(!this.view.simulation));
    $('#btn-labels').addEventListener('click', () => this._toggleOption('labels'));
    $('#btn-labels').classList.toggle('on', this.editor.options.labels);
    $('#clean-exit').addEventListener('click', () => this.exitCleanOutput());
    // mobile nudge pad
    $$('#nudge-pad [data-nudge]').forEach((b) =>
      b.addEventListener('click', () => {
        const [dx, dy] = b.dataset.nudge.split(',').map(Number);
        this.editor.nudge(dx, dy);
      }),
    );
    $('#nudge-next').addEventListener('click', () => this.editor.selectNextVertex(1));
    $('#nudge-close').addEventListener('click', () => {
      const s = this.store.selected;
      if (s) this.store.select(s.id);
    });
  }

  _toggleOption(prop) {
    this.editor.options[prop] = !this.editor.options[prop];
    prefs.set(prop, this.editor.options[prop]);
    $$(`[data-opt="${prop}"]`).forEach((b) => {
      b.classList.toggle('on', this.editor.options[prop]);
      b.setAttribute('aria-pressed', this.editor.options[prop]);
    });
    if (prop === 'labels') $('#btn-labels').classList.toggle('on', this.editor.options.labels);
    this.requestRender();
  }

  _syncToolbar(tool) {
    $$('#toolbar [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    const hint = $('#tool-hint');
    const t = TOOLS.find((x) => x.id === tool);
    if (hint) {
      hint.textContent = tool === 'select' || tool === 'pan' ? '' : t.label;
      hint.hidden = !hint.textContent;
    }
    this._syncDraftBar();
  }

  _syncDraftBar() {
    const d = this.editor.draft;
    const bar = $('#draft-bar');
    bar.hidden = !d;
    if (d) {
      const need = d.tool === 'quad' ? 4 : d.tool === 'triangle' ? 3 : 3;
      $('#draft-text').textContent = `${d.points.length} ponto(s) — ${d.tool === 'quad' ? 'toque nos 4 cantos' : d.tool === 'triangle' ? 'toque nos 3 cantos' : 'toque no 1º ponto ou em Concluir para fechar'}`;
      $('#draft-done').disabled = d.points.length < need;
    }
  }

  _syncNudgePad() {
    const pad = $('#nudge-pad');
    const s = this.store.selected;
    pad.hidden = !(s && this.store.sel.vertex >= 0 && window.matchMedia('(pointer: coarse)').matches);
  }

  _bindHeader() {
    const on = (id, fn) => $(id)?.addEventListener('click', fn);
    on('#btn-undo', () => this.store.undo());
    on('#btn-redo', () => this.store.redo());
    on('#btn-demo', () => (this.demo.active ? this.demo.stop() : this.demo.start()));
    on('#btn-rec-demo', () => this.recordDemo());
    on('#btn-watch', () => this.watchDemoVideo());
    on('#btn-calibrate', () => (this.calDock.visible ? this.calDock.close() : this.openCalibrationWizard()));
    on('#btn-output', () => this._outputMenu(isMobile()));
    on('#btn-blackout', () => this.setBlackout(!this.blackout));
    on('#btn-record', () => this.openRecorder());
    on('#btn-rec-stop', () => this.stopRecording());
    on('#btn-projects', () => this.openProjects());
    on('#btn-help', () => this.showHelp());
    on('#btn-install', () => this.installApp());
    on('#btn-menu', () => this._menu());
    on('#project-title', () => this.openProjects());
    $$('.left-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => this.showPanel(b.dataset.tab)));
    this._selectLeftTab('layers');
    this._updateProjectName();
  }

  _menu() {
    const item = (iconName, label, run) => el('button.menu-item', { type: 'button', onclick: () => {
      m.close();
      run();
    } }, icon(iconName), el('span', label));
    const m = modal({
      title: 'Menu',
      cls: 'menu-modal',
      content: el(
        'div.menu-list',
        item('sparkles', 'DEMO — Experimentar projection mapping', () => this.demo.start()),
        item('record', 'GRAVAR DEMONSTRAÇÃO', () => this.recordDemo()),
        item('film', 'Assistir demonstração', () => this.watchDemoVideo()),
        item('plus', 'Novo projeto', () => {
          this.saveNow(false);
          this.newProject();
        }),
        item('folder', 'Projetos salvos', () => this.openProjects()),
        item('save', 'Salvar agora', () => this.saveNow(true)),
        item('download', 'Exportar projeto (JSON)', () => this.exportProject()),
        item('wand', 'Assistente de calibração', () => this.openCalibrationWizard()),
        item('projector', 'Saída para projetor', () => this._outputMenu(isMobile())),
        item('video', 'Gravar vídeo', () => this.openRecorder()),
        item('mic', 'Áudio reativo: usar microfone', () => this.useMicrophone()),
        item('phone', 'Instalar como app', () => this.installApp()),
        item('help', 'Ajuda, atalhos e compatibilidade', () => this.showHelp()),
      ),
    });
  }

  _bindMobile() {
    $$('.mobile-tabbar [data-sheet]').forEach((b) =>
      b.addEventListener('click', () => {
        const name = b.dataset.sheet;
        if (['layers', 'effects', 'media'].includes(name)) {
          $$('#left-panel .tab-pane').forEach((p) => (p.hidden = p.dataset.pane !== name));
          $$('.left-tabs [data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === name));
        }
        this.showPanel(name);
      }),
    );
    $$('.sheet-close').forEach((b) => b.addEventListener('click', () => this.showPanel(null)));
    $$('.m-undo').forEach((b) => b.addEventListener('click', () => this.store.undo()));
    $$('.m-redo').forEach((b) => b.addEventListener('click', () => this.store.redo()));
    $$('.m-play').forEach((b) => b.addEventListener('click', () => this.togglePlay()));
    this.transport.on('state', () => $$('.m-play').forEach((b) => b.replaceChildren(icon(this.transport.playing ? 'pause' : 'play'))));
    this.onLayerPicked = () => {
      if (window.matchMedia('(max-width: 900px)').matches) this.showPanel('props');
    };
    // Sheet handle: drag down to close.
    $$('.sheet-handle').forEach((h) => {
      let y0 = null;
      h.addEventListener('pointerdown', (e) => {
        y0 = e.clientY;
        h.setPointerCapture(e.pointerId);
      });
      h.addEventListener('pointerup', (e) => {
        if (y0 !== null && e.clientY - y0 > 40) this.showPanel(null);
        else if (y0 !== null && y0 - e.clientY > 40) document.body.classList.toggle('sheet-full', true);
        y0 = null;
      });
    });
    window.addEventListener('resize', () => {
      this._syncNudgePad();
      clearTimeout(this._insetT);
      this._insetT = setTimeout(() => this._updateInsets(), 200);
    });
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;
      if (key === 'Escape') {
        if (closeTopModal()) return;
        if (this.cleanOutput) return this.exitCleanOutput();
        if (this.editor.cancelDraft()) return;
        if (this.calDock.visible) return this.calDock.close();
        if (this.editor.tool !== 'select') return this.editor.setTool('select');
        if (this.store.sel.vertex >= 0 || this.store.sel.clipId) return this.store.select(this.store.sel.surfaceId);
        this.store.select(null);
        this.showPanel(null);
        return;
      }
      if (typing) return;
      if (hasOpenModal()) return;
      if (mod && (key === 'z' || key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) this.store.redo();
        else this.store.undo();
        return;
      }
      if (mod && (key === 'y' || key === 'Y')) {
        e.preventDefault();
        this.store.redo();
        return;
      }
      if (mod && (key === 'd' || key === 'D')) {
        e.preventDefault();
        this.duplicateSelected();
        return;
      }
      if (mod && (key === 's' || key === 'S')) {
        e.preventDefault();
        this.saveNow(true);
        return;
      }
      if (mod && (key === 'o' || key === 'O')) {
        e.preventDefault();
        this.openProjects();
        return;
      }
      if (mod) return;
      if (key === ' ') {
        e.preventDefault();
        if (!this.editor.spaceDown) {
          this.editor.spaceDown = true;
          this._spacePan = false;
          this._spaceAt = performance.now();
        }
        return;
      }
      if (key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : e.altKey ? 0.25 : 1;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key];
        this.editor.nudge(d[0], d[1]);
        return;
      }
      if (key === 'Tab' && this.store.selected) {
        e.preventDefault();
        this.editor.selectNextVertex(e.shiftKey ? -1 : 1);
        return;
      }
      if (key === 'Enter') {
        this.editor.finishDraft();
        return;
      }
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        this._deleteContextual();
        return;
      }
      if (key === 'Home') {
        this.restart();
        return;
      }
      const k = key.toLowerCase();
      const tool = TOOLS.find((t) => t.key.toLowerCase() === k);
      if (tool && !e.altKey) {
        this.editor.setTool(tool.id);
        return;
      }
      if (k === 'g') this._toggleOption('grid');
      else if (k === 's') this._toggleOption('snap');
      else if (k === 'l') this._toggleOption('labels');
      else if (k === '0') this.editor.fitView();
      else if (k === '+' || k === '=') this.editor.zoomAt(1.25, this.editor.cssW / 2, this.editor.cssH / 2);
      else if (k === '-') this.editor.zoomAt(0.8, this.editor.cssW / 2, this.editor.cssH / 2);
      else if (k === 'o') this.openOutput({ forceWindow: true });
      else if (k === 'f') (this.cleanOutput ? this.exitCleanOutput() : this.enterCleanOutput());
      else if (k === 'b') this.setBlackout(!this.blackout);
      else if (k === ']' && this.store.selected) this.store.moveSurface(this.store.selected.id, 1);
      else if (k === '[' && this.store.selected) this.store.moveSurface(this.store.selected.id, -1);
      else if (k === '?') this.showHelp();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') {
        const wasPan = this.editor.viewport.classList.contains('panning') || this._spacePan;
        this.editor.spaceDown = false;
        const tag = (e.target.tagName || '').toLowerCase();
        if (!wasPan && performance.now() - (this._spaceAt || 0) < 400 && tag !== 'input' && tag !== 'button' && !hasOpenModal()) this.togglePlay();
      }
    });
    this.viewport.addEventListener('pointerdown', () => {
      if (this.editor.spaceDown) this._spacePan = true;
    });
  }

  _deleteContextual() {
    if (this.editor.undoDraftPoint()) return;
    const s = this.store.selected;
    if (!s) return;
    const { clipId, key, vertex } = this.store.sel;
    if (clipId) {
      this.store.checkpoint();
      s.clips = s.clips.filter((c) => c.id !== clipId);
      this.store.select(s.id);
      this.store.changed('timeline');
      return;
    }
    if (key && key.surfaceId === s.id) {
      this.store.checkpoint();
      for (const prop of Object.keys(s.keys)) removeKey(s, prop, key.t);
      this.store.sel.key = null;
      this.store.changed('timeline');
      return;
    }
    if (vertex >= 0 && s.type === 'polygon' && s.points.length > 3) {
      this.store.checkpoint();
      s.points.splice(vertex, 1);
      this.store.select(s.id);
      this.store.changed('geometry', { final: true });
      return;
    }
    this.deleteSelected();
  }
}

function hydrateIcons(root) {
  $$('[data-icon]', root).forEach((n) => {
    n.prepend(icon(n.dataset.icon));
    n.removeAttribute('data-icon');
  });
}

const app = new App();
app.init().catch((err) => {
  console.error(err);
  const box = document.getElementById('fatal');
  if (box) {
    box.hidden = false;
    box.querySelector('pre').textContent = String(err && err.stack ? err.stack : err);
  }
});
