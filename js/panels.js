// Left-side panels: layers (surfaces), effect library with live GPU
// thumbnails, presets and the media library.

import { el, formatBytes, formatTime, $ } from './utils.js';
import { icon, btn, toast, confirmDialog } from './ui.js';
import { EFFECTS, CATEGORIES } from './effects.js';
import { Renderer } from './renderer.js';
import { createProject, createSurface, effectContent, SHAPE_LABELS, hasAnimation } from './state.js';
import { rectPoints } from './mapping.js';
import { PRESETS } from './presets.js';

const TYPE_ICON = { rect: 'rect', quad: 'quad', triangle: 'triangle', polygon: 'polygon', circle: 'circle', ellipse: 'ellipse', mesh: 'mesh' };

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export class LayersPanel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.list = el('ul.layer-list', { role: 'listbox', 'aria-label': 'Superfícies' });
    const add = el(
      'div.panel-actions',
      btn('plus', 'Superfície', () => app.addDefaultSurface(), { title: 'Adicionar quadrilátero no centro' }),
      btn('mask', 'Máscara', () => app.addDefaultSurface('mask'), { title: 'Adicionar máscara' }),
      btn('copy', '', () => app.duplicateSelected(), { iconOnly: true, title: 'Duplicar (Ctrl+D)' }),
      btn('trash', '', () => app.deleteSelected(), { iconOnly: true, title: 'Excluir (Delete)', cls: 'danger-ghost' }),
    );
    this.empty = el(
      'div.empty',
      el('p', 'Nenhuma superfície ainda.'),
      el('p.muted', 'Escolha uma ferramenta de forma na barra do editor e desenhe sobre a área de projeção, ou aplique um efeito da biblioteca.'),
    );
    root.append(add, this.list, this.empty);
    app.store.on('change', ({ kind }) => {
      if (kind !== 'geometry') this.render();
    });
    app.store.on('selection', () => this.render());
    this.render();
  }

  render() {
    const { store } = this.app;
    const surfaces = store.surfaces;
    this.empty.hidden = surfaces.length > 0;
    this.list.replaceChildren();
    for (let i = surfaces.length - 1; i >= 0; i--) {
      const s = surfaces[i];
      const sel = s.id === store.sel.surfaceId;
      const content = s.role === 'mask' ? 'Máscara' : s.clips.length ? `${s.clips.length} clipe(s)` : s.content.type === 'effect' ? EFFECTS.find((e) => e.id === s.content.effect)?.name : s.content.type === 'media' ? store.project.media[s.content.mediaId]?.name || 'Mídia' : 'Vazio';
      const row = el(
        `li.layer${sel ? '.selected' : ''}${s.visible ? '' : '.hidden-layer'}${s.role === 'mask' ? '.is-mask' : ''}`,
        { role: 'option', 'aria-selected': sel, dataset: { id: s.id }, tabindex: 0 },
        el('span.grip', { title: 'Arraste para reordenar' }, icon('menu')),
        icon(s.role === 'mask' ? 'mask' : TYPE_ICON[s.type] || 'polygon', 'type-ic'),
        el('span.layer-text', el('span.layer-name', s.name), el('small.layer-sub', `${SHAPE_LABELS[s.type] || s.type} · ${content || ''}`)),
        hasAnimation(s) ? el('span.badge', { title: 'Possui keyframes' }, icon('diamondFill')) : null,
        el('button.icon-btn', { type: 'button', title: s.visible ? 'Ocultar' : 'Mostrar', 'aria-label': s.visible ? 'Ocultar' : 'Mostrar', dataset: { act: 'vis' } }, icon(s.visible ? 'eye' : 'eyeOff')),
        el('button.icon-btn', { type: 'button', title: s.locked ? 'Desbloquear' : 'Bloquear edição', 'aria-label': s.locked ? 'Desbloquear' : 'Bloquear', dataset: { act: 'lock' } }, icon(s.locked ? 'lock' : 'unlock')),
      );
      row.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'vis') {
          store.checkpoint();
          s.visible = !s.visible;
          store.changed('props');
        } else if (act === 'lock') {
          store.checkpoint();
          s.locked = !s.locked;
          store.changed('props');
        } else {
          store.select(s.id);
          this.app.onLayerPicked?.(s);
        }
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          store.select(s.id);
        }
      });
      this._dragReorder(row.querySelector('.grip'), s.id);
      this.list.appendChild(row);
    }
  }

  _dragReorder(grip, id) {
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rowEl = grip.closest('.layer');
      const rows = [...this.list.children];
      const startY = e.clientY;
      const h = rowEl.getBoundingClientRect().height;
      grip.setPointerCapture(e.pointerId);
      rowEl.classList.add('dragging');
      let offset = 0;
      const move = (ev) => {
        offset = ev.clientY - startY;
        rowEl.style.transform = `translateY(${offset}px)`;
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        rowEl.classList.remove('dragging');
        rowEl.style.transform = '';
        const steps = Math.round(offset / h);
        if (steps) {
          const visualIndex = rows.indexOf(rowEl) + steps;
          const n = this.app.store.surfaces.length;
          const target = n - 1 - Math.max(0, Math.min(n - 1, visualIndex));
          this.app.store.reorder(id, target);
        }
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  }
}

// ---------------------------------------------------------------------------
// Effects library (GPU thumbnails)
// ---------------------------------------------------------------------------

export class EffectsPanel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.cat = 'all';
    this.thumbs = new Map();
    this.canvas = document.createElement('canvas');
    this.canvas.width = 192;
    this.canvas.height = 108;
    this.renderer = null;
    this.anim = null;

    const presetRow = el('div.preset-row');
    for (const p of PRESETS) {
      presetRow.appendChild(
        el('button.preset', { type: 'button', title: p.desc, onclick: () => app.applyPreset(p.id) }, icon(p.icon), el('span', p.name)),
      );
    }
    const chips = el('div.chips', { role: 'tablist' });
    const addChip = (id, name) => {
      const c = el('button.chip', { type: 'button', role: 'tab', onclick: () => this.setCat(id) }, name);
      c.dataset.cat = id;
      chips.appendChild(c);
    };
    addChip('all', 'Todos');
    CATEGORIES.forEach((c) => addChip(c.id, c.name));
    this.chips = chips;
    this.grid = el('div.fx-grid');
    root.append(
      el('h3.panel-sub', 'Presets prontos'),
      presetRow,
      el('h3.panel-sub', 'Biblioteca de efeitos', el('small.muted', ' — toque para aplicar à superfície selecionada (ou criar uma)')),
      chips,
      this.grid,
    );
    this.renderGrid();
    this.setCat('all');
  }

  setCat(cat) {
    this.cat = cat;
    [...this.chips.children].forEach((c) => c.classList.toggle('on', c.dataset.cat === cat));
    [...this.grid.children].forEach((card) => {
      card.hidden = cat !== 'all' && card.dataset.cat !== cat;
    });
  }

  renderGrid() {
    this.grid.replaceChildren();
    for (const fx of EFFECTS) {
      const cv = el('canvas.fx-thumb', { width: 192, height: 108, 'aria-hidden': 'true' });
      const card = el(
        'button.fx-card',
        { type: 'button', title: fx.desc, dataset: { fx: fx.id, cat: fx.cat }, draggable: 'true' },
        cv,
        el('span.fx-name', fx.name),
      );
      card.addEventListener('click', () => this.app.applyEffect(fx.id));
      card.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') this.startAnim(fx.id, cv);
      });
      card.addEventListener('pointerleave', () => this.stopAnim());
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-luzmap-effect', fx.id);
        e.dataTransfer.setData('text/plain', fx.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      this.grid.appendChild(card);
    }
  }

  _ensureRenderer() {
    if (this.renderer) return this.renderer;
    this.renderer = new Renderer(this.canvas, { quality: 1, preserveDrawingBuffer: true, antialias: false });
    if (!this.renderer.ok) this.renderer = null;
    return this.renderer;
  }

  _thumbProject(fxId) {
    const p = createProject({ output: { width: 192, height: 108 } });
    p.surfaces.push(createSurface('quad', rectPoints(0, 0, 1, 1), { content: effectContent(fxId) }));
    return p;
  }

  _renderInto(fxId, target, t) {
    const r = this._ensureRenderer();
    if (!r) return;
    r.render({ project: this._thumbProject(fxId), t, clock: t });
    const ctx = target.getContext('2d');
    ctx.drawImage(this.canvas, 0, 0, target.width, target.height);
  }

  /** Generates thumbnails progressively so start-up stays responsive. */
  generateThumbnails() {
    const cards = [...this.grid.querySelectorAll('.fx-card')];
    let i = 0;
    const step = () => {
      if (i >= cards.length) return;
      const card = cards[i++];
      try {
        this._renderInto(card.dataset.fx, card.querySelector('canvas'), 2.5);
      } catch (err) {
        console.warn(err);
      }
      (window.requestIdleCallback || ((f) => setTimeout(f, 16)))(step);
    };
    step();
  }

  startAnim(fxId, cv) {
    this.stopAnim();
    const t0 = performance.now();
    const loop = () => {
      this._renderInto(fxId, cv, 2.5 + (performance.now() - t0) / 1000);
      this.anim = requestAnimationFrame(loop);
    };
    this.anim = requestAnimationFrame(loop);
  }

  stopAnim() {
    if (this.anim) cancelAnimationFrame(this.anim);
    this.anim = null;
  }
}

// ---------------------------------------------------------------------------
// Media library
// ---------------------------------------------------------------------------

export class MediaPanel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.fileInput = el('input', { type: 'file', multiple: true, accept: 'image/*,video/*,audio/*,.gif,.mp4,.webm,.mov,.mp3,.wav,.m4a', hidden: true });
    this.fileInput.addEventListener('change', () => {
      if (this.fileInput.files.length) app.importFiles([...this.fileInput.files]);
      this.fileInput.value = '';
    });
    const importBtn = btn('upload', 'Importar arquivos', () => this.fileInput.click(), { cls: 'primary wide' });
    this.drop = el('div.dropzone', icon('upload'), el('span', 'Arraste imagens, GIFs, vídeos ou áudio para cá'), el('small.muted', 'JPG · PNG · WebP · GIF · MP4 · WebM · MP3 — os arquivos ficam só neste dispositivo'));
    this.drop.addEventListener('click', () => this.fileInput.click());
    this.list = el('div.media-list');
    this.usage = el('div.storage-usage');
    root.append(importBtn, this.fileInput, this.drop, this.list, this.usage);
    app.media.on('change', () => this.render());
    app.store.on('change', ({ kind }) => {
      if (kind === 'project' || kind === 'media' || kind === 'structure') this.render();
    });
    this.render();
  }

  async render() {
    const { store, media } = this.app;
    let records = [];
    try {
      records = await this.app.listLibrary();
    } catch (_) {
      records = [];
    }
    const projectMedia = store.project.media || {};
    const ids = new Set([...records.map((r) => r.id), ...Object.keys(projectMedia)]);
    this.list.replaceChildren();
    if (!ids.size) this.list.appendChild(el('p.muted.center', 'Nenhuma mídia importada ainda.'));
    for (const id of ids) {
      const rec = records.find((r) => r.id === id);
      const meta = projectMedia[id] || media.meta(id) || rec || {};
      const status = media.status(id);
      const item = media.get(id);
      const kind = meta.kind || rec?.kind;
      const thumb = item?.thumb;
      const usedHere = !!projectMedia[id];
      const missing = !rec && status !== 'ready';
      const card = el(
        `div.media-item${missing ? '.missing' : ''}`,
        el('div.media-thumb', thumb && kind !== 'audio' ? el('img', { src: thumb, alt: '' }) : icon(kind === 'video' ? 'video' : kind === 'audio' ? 'music' : 'image')),
        el(
          'div.media-info',
          el('span.media-name', meta.name || id),
          el('small.muted', [kind === 'gif' ? (item?.frames ? 'GIF animado' : 'GIF') : kind, meta.width ? `${meta.width}×${meta.height}` : '', meta.duration ? formatTime(meta.duration, false) : '', formatBytes(meta.size || rec?.size)].filter(Boolean).join(' · ')),
          missing ? el('small.warn', 'Arquivo ausente — importe novamente') : status === 'error' ? el('small.warn', item?.error || 'Erro ao decodificar') : usedHere ? el('small.ok', 'Usada neste projeto') : null,
        ),
        el(
          'div.media-actions',
          kind === 'audio'
            ? btn('music', '', () => this.app.setSoundtrack(id), { iconOnly: true, title: 'Usar como trilha sonora (sincronizada à timeline)' })
            : btn('check', '', () => this.app.applyMedia(id), { iconOnly: true, title: 'Aplicar à superfície selecionada', cls: 'primary' }),
          kind === 'image' || kind === 'gif' ? btn('room', '', () => this.app.setBackground(id), { iconOnly: true, title: 'Usar como foto de referência do ambiente (fundo do editor)' }) : null,
          btn('trash', '', () => this.remove(id, meta.name), { iconOnly: true, title: 'Excluir da biblioteca', cls: 'danger-ghost' }),
        ),
      );
      this.list.appendChild(card);
    }
    const est = await this.app.storageEstimate();
    this.usage.replaceChildren();
    if (est && est.quota) {
      const pct = Math.min(100, (est.usage / est.quota) * 100);
      this.usage.append(
        el('div.bar', el('span', { style: { width: `${pct.toFixed(1)}%` } })),
        el('small.muted', `Armazenamento local: ${formatBytes(est.usage)} de ${formatBytes(est.quota)}`),
      );
    }
  }

  async remove(id, name) {
    const ok = await confirmDialog('Excluir mídia', `Excluir "${name || id}" deste dispositivo? Superfícies que a usam ficarão vazias.`, { okLabel: 'Excluir', danger: true });
    if (!ok) return;
    await this.app.deleteMedia(id);
    toast('Mídia excluída.');
  }
}

export function bindDropTarget(app, target) {
  let depth = 0;
  target.addEventListener('dragenter', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    depth++;
    document.body.classList.add('drag-files');
  });
  target.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) document.body.classList.remove('drag-files');
  });
  target.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('drag-files');
    const fxId = e.dataTransfer.getData('application/x-luzmap-effect');
    if (fxId) {
      app.dropEffectAt(fxId, e.clientX, e.clientY);
      return;
    }
    const files = [...(e.dataTransfer.files || [])];
    if (files.length) app.importFiles(files, { clientX: e.clientX, clientY: e.clientY });
  });
}

export { $ };
