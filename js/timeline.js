// Timeline panel: transport controls, ruler with scrubbing, one track per
// surface with clips (drag / resize, fades) and keyframe diamonds.

import { el, clamp, formatTime, uid } from './utils.js';
import { icon, btn } from './ui.js';
import { EFFECT_MAP } from './effects.js';

const NAME_W_DEFAULT = 150;

export class TimelinePanel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.pps = 30;
    this.autoFit = true;
    const { transport } = app;

    this.playBtn = btn('play', '', () => app.togglePlay(), { iconOnly: true, title: 'Reproduzir / pausar (Espaço)', cls: 'primary round' });
    this.timeEl = el('span.tl-time', '00:00.0');
    this.durEl = el('span.tl-dur', '/ 00:30.0');
    this.speedSel = el('select.select.small', { 'aria-label': 'Velocidade' });
    [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].forEach((v) => this.speedSel.appendChild(el('option', { value: v }, `${v}×`)));
    this.speedSel.value = '1';
    this.speedSel.addEventListener('change', () => transport.setRate(+this.speedSel.value));
    this.loopBtn = btn('loop', '', () => app.toggleLoop(), { iconOnly: true, title: 'Repetir (loop)' });
    const bar = el(
      'div.tl-transport',
      btn('restart', '', () => app.restart(), { iconOnly: true, title: 'Voltar ao início (Home)' }),
      this.playBtn,
      el('div.tl-clock', this.timeEl, this.durEl),
      el('label.tl-speed', icon('right'), this.speedSel),
      this.loopBtn,
      el('span.spacer'),
      btn('zoomOut', '', () => this.zoom(1 / 1.4), { iconOnly: true, title: 'Diminuir zoom da timeline' }),
      btn('zoomIn', '', () => this.zoom(1.4), { iconOnly: true, title: 'Aumentar zoom da timeline' }),
      btn('record', 'Gravar', () => app.openRecorder(), { cls: 'rec-btn', title: 'Gravar a saída em vídeo' }),
    );
    this.scroll = el('div.tl-scroll');
    this.grid = el('div.tl-grid');
    this.ruler = el('div.tl-ruler');
    this.rows = el('div.tl-rows');
    this.playhead = el('div.tl-playhead', el('span.tl-head'));
    this.corner = el('div.tl-corner', 'Camadas');
    this.grid.append(el('div.tl-ruler-row', this.corner, this.ruler), this.rows, this.playhead);
    this.scroll.appendChild(this.grid);
    root.append(bar, this.scroll);

    this._bindScrub();
    this.scroll.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.zoom(Math.exp(-e.deltaY * 0.002));
        }
      },
      { passive: false },
    );
    app.store.on('change', ({ kind }) => {
      if (kind !== 'geometry') this.render();
    });
    app.store.on('selection', () => this.render());
    transport.on('state', () => this.updateTransport());
    new ResizeObserver(() => {
      if (this.autoFit) this.fit();
    }).observe(this.scroll);
    this.render();
    this.updateTransport();
  }

  get nameW() {
    return this.corner?.offsetWidth || NAME_W_DEFAULT;
  }

  get duration() {
    return this.app.store.project.timeline.duration;
  }

  fit() {
    this.render();
  }

  zoom(f) {
    this.autoFit = false;
    const center = this.scroll.scrollLeft + this.scroll.clientWidth / 2 - this.nameW;
    const t = center / this.pps;
    this.pps = clamp(this.pps * f, 2, 400);
    this.render();
    this.scroll.scrollLeft = t * this.pps - this.scroll.clientWidth / 2 + this.nameW;
  }

  xToTime(clientX) {
    const r = this.grid.getBoundingClientRect();
    return clamp((clientX - r.left - this.nameW) / this.pps, 0, this.duration);
  }

  updateTransport() {
    const { transport, store } = this.app;
    this.playBtn.replaceChildren(icon(transport.playing ? 'pause' : 'play'));
    this.playBtn.title = transport.playing ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)';
    this.loopBtn.classList.toggle('on', store.project.timeline.loop);
    this.speedSel.value = String(transport.rate);
    this.durEl.textContent = `/ ${formatTime(this.duration)}`;
    this.tick();
  }

  tick() {
    const t = this.app.transport.time;
    this.timeEl.textContent = formatTime(t);
    this.playhead.style.transform = `translateX(${this.nameW + t * this.pps}px)`;
  }

  _bindScrub() {
    this.ruler.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.ruler.setPointerCapture(e.pointerId);
      const seek = (ev) => this.app.seek(this.xToTime(ev.clientX));
      seek(e);
      const up = () => {
        this.ruler.removeEventListener('pointermove', seek);
        this.ruler.removeEventListener('pointerup', up);
        this.ruler.removeEventListener('pointercancel', up);
      };
      this.ruler.addEventListener('pointermove', seek);
      this.ruler.addEventListener('pointerup', up);
      this.ruler.addEventListener('pointercancel', up);
    });
  }

  render() {
    const { store } = this.app;
    const dur = this.duration;
    if (this.autoFit) {
      const w = this.scroll.clientWidth - this.nameW - 16;
      if (w > 40) this.pps = clamp(w / dur, 2, 400);
    }
    const width = this.nameW + dur * this.pps + 24;
    this.grid.style.width = `${width}px`;
    // ruler ticks
    this.ruler.replaceChildren();
    const step = this.pps > 80 ? 1 : this.pps > 30 ? 2 : this.pps > 12 ? 5 : this.pps > 5 ? 10 : 30;
    for (let t = 0; t <= dur + 1e-6; t += step) {
      this.ruler.appendChild(el('span.tick', { style: { left: `${t * this.pps}px` } }, formatTime(t, false)));
    }
    // tracks (top layer first)
    this.rows.replaceChildren();
    const surfaces = store.surfaces;
    if (!surfaces.length) this.rows.appendChild(el('div.tl-empty', 'Crie superfícies para animá-las aqui. Dica: selecione uma superfície e use "Clipe na agulha" ou os ◆ no painel de propriedades.'));
    for (let i = surfaces.length - 1; i >= 0; i--) this.rows.appendChild(this._row(surfaces[i]));
    this.playhead.style.height = `${this.grid.scrollHeight}px`;
    this.updateTransport();
  }

  _row(s) {
    const { store } = this.app;
    const sel = store.sel.surfaceId === s.id;
    const name = el(
      `div.tl-name${sel ? '.on' : ''}`,
      el('button.icon-btn', { type: 'button', title: s.visible ? 'Desativar camada' : 'Ativar camada', 'aria-label': 'Visibilidade', onclick: () => {
        store.checkpoint();
        s.visible = !s.visible;
        store.changed('props');
      } }, icon(s.visible ? 'eye' : 'eyeOff')),
      el('span', { title: s.name }, s.name),
    );
    name.addEventListener('click', (e) => {
      if (!e.target.closest('button')) store.select(s.id);
    });
    const lane = el(`div.tl-lane${s.role === 'mask' ? '.mask' : ''}`, { style: { width: `${this.duration * this.pps}px` } });
    if (!s.clips.length && s.role !== 'mask') lane.appendChild(el('div.tl-base', { title: 'Conteúdo base (sempre visível enquanto não houver clipes)' }));
    for (const c of s.clips) lane.appendChild(this._clip(s, c));
    const times = [...new Set(Object.values(s.keys).flatMap((tr) => tr.map((k) => Math.round(k.t * 1000) / 1000)))];
    for (const t of times) lane.appendChild(this._key(s, t));
    lane.addEventListener('pointerdown', (e) => {
      if (e.target !== lane && !e.target.classList.contains('tl-base')) return;
      store.select(s.id);
    });
    lane.addEventListener('dblclick', (e) => {
      if (e.target !== lane && !e.target.classList.contains('tl-base')) return;
      if (s.role === 'mask') return;
      const t = this.xToTime(e.clientX);
      store.checkpoint();
      const c = { id: uid('c'), start: t, end: Math.min(this.duration, t + 5), fadeIn: 0.5, fadeOut: 0.5, content: JSON.parse(JSON.stringify(s.content)) };
      if (c.end - c.start < 0.5) c.start = Math.max(0, c.end - 5);
      s.clips.push(c);
      store.changed('timeline');
      store.select(s.id, { clipId: c.id });
    });
    return el(`div.tl-row${sel ? '.on' : ''}`, name, lane);
  }

  _clip(s, c) {
    const { store } = this.app;
    const on = store.sel.clipId === c.id;
    const label = c.content.type === 'effect' ? EFFECT_MAP[c.content.effect]?.name : c.content.type === 'media' ? store.project.media[c.content.mediaId]?.name : 'Vazio';
    const elc = el(
      `div.tl-clip${on ? '.on' : ''}`,
      { style: { left: `${c.start * this.pps}px`, width: `${Math.max(4, (c.end - c.start) * this.pps)}px` }, title: `${label} · ${formatTime(c.start)}–${formatTime(c.end)}` },
      el('span.fade.in', { style: { width: `${Math.min(c.end - c.start, c.fadeIn) * this.pps}px` } }),
      el('span.fade.out', { style: { width: `${Math.min(c.end - c.start, c.fadeOut) * this.pps}px` } }),
      el('span.clip-label', label || '—'),
      el('span.edge.l'),
      el('span.edge.r'),
    );
    elc.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      store.select(s.id, { clipId: c.id });
      const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
      const x0 = e.clientX;
      const s0 = c.start;
      const e0 = c.end;
      let begun = false;
      const target = e.currentTarget;
      target.setPointerCapture?.(e.pointerId);
      const snap = (t) => {
        const ph = this.app.transport.time;
        if (Math.abs(t - ph) * this.pps < 6) return ph;
        return Math.round(t * 10) / 10;
      };
      const move = (ev) => {
        const dt = (ev.clientX - x0) / this.pps;
        if (!begun && Math.abs(ev.clientX - x0) < 3) return;
        if (!begun) {
          store.begin();
          begun = true;
        }
        if (mode === 'move') {
          const len = e0 - s0;
          c.start = clamp(snap(s0 + dt), 0, this.duration - len);
          c.end = c.start + len;
        } else if (mode === 'l') c.start = clamp(snap(s0 + dt), 0, c.end - 0.1);
        else c.end = clamp(snap(e0 + dt), c.start + 0.1, this.duration);
        target.style.left = `${c.start * this.pps}px`;
        target.style.width = `${(c.end - c.start) * this.pps}px`;
        this.app.requestRender();
      };
      const up = () => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', up);
        if (begun && store.end()) store.changed('timeline');
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
    });
    return elc;
  }

  _key(s, t) {
    const { store } = this.app;
    const on = store.sel.key && store.sel.key.surfaceId === s.id && Math.abs(store.sel.key.t - t) < 1e-3;
    const k = el(`button.tl-key${on ? '.on' : ''}`, { type: 'button', style: { left: `${t * this.pps}px` }, title: `Keyframe em ${formatTime(t)} — arraste para mover, Delete para excluir` }, icon('diamondFill'));
    k.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      store.select(s.id);
      store.sel.key = { surfaceId: s.id, t };
      this.app.seek(t);
      const x0 = e.clientX;
      let cur = t;
      let begun = false;
      k.setPointerCapture?.(e.pointerId);
      const move = (ev) => {
        if (!begun && Math.abs(ev.clientX - x0) < 3) return;
        if (!begun) {
          store.begin();
          begun = true;
        }
        const nt = clamp(Math.round((t + (ev.clientX - x0) / this.pps) * 20) / 20, 0, this.duration);
        for (const tr of Object.values(s.keys)) for (const kf of tr) if (Math.abs(kf.t - cur) < 1e-3) kf.t = nt;
        Object.values(s.keys).forEach((tr) => tr.sort((a, b) => a.t - b.t));
        cur = nt;
        store.sel.key = { surfaceId: s.id, t: nt };
        k.style.left = `${nt * this.pps}px`;
        this.app.seek(nt);
      };
      const up = () => {
        k.removeEventListener('pointermove', move);
        k.removeEventListener('pointerup', up);
        k.removeEventListener('pointercancel', up);
        if (begun && store.end()) store.changed('timeline');
        else this.render();
      };
      k.addEventListener('pointermove', move);
      k.addEventListener('pointerup', up);
      k.addEventListener('pointercancel', up);
    });
    return k;
  }
}
