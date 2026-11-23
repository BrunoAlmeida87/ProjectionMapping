// Automatic demonstration: a residential room (wall, door, cabinet, bookshelf,
// table and floor) mapped with real surfaces, masks, clips and keyframes.
// It runs on the same engine as user projects — nothing here is faked.

import { el, uid, formatTime } from './utils.js';
import { icon, btn } from './ui.js';
import { createProject, createSurface, effectContent, setKey } from './state.js';
import { OBJ, P, cabinetFront, shelfFront, tableTop, silhouette } from './room.js';
import { bbox } from './mapping.js';

export const DEMO_DURATION = 60;

export const SCENES = [
  { t: 0, title: 'Calibração', text: 'Grade de teste e contorno de cada superfície: parede, porta, armário, estante, mesa e piso.', focus: null, cal: true },
  { t: 8, title: 'Mapping geométrico', text: 'Linhas luminosas animadas destacam as bordas de móveis e paredes.', focus: null },
  { t: 16, title: 'Água', text: 'Água escorrendo pela frente do armário — a textura segue a perspectiva real do móvel.', focus: 'Armário' },
  { t: 24, title: 'Portal', text: 'Um portal espacial se abre na porta.', focus: 'Porta' },
  { t: 32, title: 'Galáxia', text: 'A parede vira uma janela para o espaço. Máscaras impedem que a luz caia sobre os móveis.', focus: 'Parede' },
  { t: 40, title: 'Projeção simultânea', text: 'Efeitos diferentes em todas as superfícies ao mesmo tempo.', focus: null },
  { t: 50, title: 'Finalização', text: 'Composição final combinando os efeitos — tudo gerado em tempo real pela GPU.', focus: null },
];

const clip = (start, end, effect, params = {}, fadeIn = 0.7, fadeOut = 0.7) => ({
  id: uid('c'),
  start,
  end,
  fadeIn,
  fadeOut,
  content: effectContent(effect, params),
});

export function buildDemoProject() {
  const p = createProject({ name: 'Demonstração — Sala de estar', output: { width: 1920, height: 1080 } });
  p.timeline = { duration: DEMO_DURATION, loop: true };
  p.background = { mediaId: 'builtin:room', opacity: 0.85, visible: true };
  const grid = (extra = {}) => ({ frequency: 1.2, ...extra });

  const wall = createSurface('quad', P(OBJ.wall), { name: 'Parede' });
  wall.clips = [
    clip(0, 8.6, 'grid', grid({ frequency: 2 }), 0.6, 0.8),
    clip(8, 16.6, 'neon', { colorA: '#22d3ee', colorB: '#7c5cff', scale: 2.2, frequency: 1.5 }),
    clip(32, 50.8, 'galaxy', { speed: 0.5, scale: 1.1 }, 1.6, 1.0),
    clip(50, 60, 'aurora', { intensity: 1.2 }, 1.2, 2.0),
  ];
  setKey(wall, 'intensity', 50, 1);
  setKey(wall, 'intensity', 54, 1.35);
  setKey(wall, 'intensity', 58, 1);

  const floor = createSurface('quad', P(OBJ.floor), { name: 'Piso' });
  floor.feather = 40;
  floor.clips = [clip(0, 8.6, 'grid', grid({ frequency: 1.5 }), 0.6, 0.8), clip(40, 50.8, 'waves', { speed: 0.8 }, 1.2), clip(50, 60, 'hexgrid', { scale: 1.4 }, 1.0, 2.0)];

  const maskCab = createSurface('polygon', silhouette('cabinet'), { role: 'mask', name: 'Máscara do armário' });
  const maskShelf = createSurface('polygon', silhouette('shelf'), { role: 'mask', name: 'Máscara da estante' });

  const door = createSurface('quad', P(OBJ.door), { name: 'Porta' });
  door.clips = [
    clip(0, 8.6, 'grid', grid(), 0.6, 0.8),
    clip(8, 24.8, 'neon', { colorA: '#ff2bd6', colorB: '#22d3ee' }),
    clip(24, 50.8, 'portal', {}, 1.4, 1.0),
    clip(50, 60, 'depth3d', { speed: 1.4 }, 1.0, 2.0),
  ];

  const cab = createSurface('quad', cabinetFront(), { name: 'Armário' });
  cab.clips = [
    clip(0, 8.6, 'grid', grid(), 0.6, 0.8),
    clip(8, 16.6, 'neon', { colorA: '#fbbf24', colorB: '#ff2bd6' }),
    clip(16, 31, 'water', { colorA: '#0a4a86', colorB: '#8ff0ff', intensity: 1.25 }, 1.2, 1.2),
    clip(40, 50.8, 'water', { colorA: '#062a52', colorB: '#7af7ff' }, 1.2),
    clip(50, 60, 'lava', {}, 1.0, 2.0),
  ];

  const shelf = createSurface('quad', shelfFront(), { name: 'Estante' });
  shelf.clips = [
    clip(0, 8.6, 'grid', grid(), 0.6, 0.8),
    clip(8, 16.6, 'neon', { colorA: '#22ff88', colorB: '#22d3ee' }),
    clip(40, 50.8, 'particles', { density: 1.3 }, 1.2),
    clip(50, 60, 'matrix', {}, 1.0, 2.0),
  ];

  const maskTable = createSurface('polygon', silhouette('table'), { role: 'mask', name: 'Máscara da mesa' });
  const table = createSurface('quad', tableTop(), { name: 'Mesa' });
  table.clips = [
    clip(0, 8.6, 'grid', grid(), 0.6, 0.8),
    clip(8, 16.6, 'neon', { colorA: '#7c5cff', colorB: '#ff2bd6', scale: 0.8 }),
    clip(40, 50.8, 'plasma', {}, 1.2),
    clip(50, 60, 'fire', { amplitude: 0.7 }, 1.0, 2.0),
  ];

  p.surfaces = [wall, floor, maskCab, maskShelf, door, cab, shelf, maskTable, table];
  return p;
}

export class DemoController {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.scene = -1;
    this.prevProject = null;
    this.caption = el('div.demo-caption', { 'aria-live': 'polite' });
    this.hud = this._buildHud();
    app.viewport.append(this.caption, this.hud);
  }

  _buildHud() {
    const app = this.app;
    this.progress = el('div.demo-progress', el('span.fill'));
    this.dots = el('div.demo-dots');
    SCENES.forEach((s, i) => {
      const d = el('button.dot', { type: 'button', title: `${i + 1}. ${s.title}`, onclick: () => this.goto(i) }, String(i + 1));
      this.dots.appendChild(d);
    });
    this.viewBtn = btn('room', 'Sala', () => this.toggleView(), { title: 'Alternar entre a simulação da sala e a saída pura do projetor' });
    this.playBtn = btn('pause', '', () => app.togglePlay(), { iconOnly: true, title: 'Pausar / continuar' });
    return el(
      'div.demo-hud',
      el('span.demo-badge', icon('sparkles'), 'DEMO'),
      this.dots,
      this.progress,
      this.playBtn,
      this.viewBtn,
      btn('projector', 'Projetor', () => app.openOutput(), { title: 'Enviar a demonstração para a saída do projetor' }),
      btn('record', 'Gravar demonstração', () => app.recordDemo(), { title: 'GRAVAR DEMONSTRAÇÃO — grava os 60 s da demo em vídeo' }),
      btn('sliders', 'Editar', () => this.editHere(), { title: 'Sair da demo mantendo a sala como um projeto editável' }),
      btn('close', 'Sair', () => this.stop(), { cls: 'ghost', title: 'Sair da demonstração' }),
    );
  }

  async start({ record = false } = {}) {
    const app = this.app;
    if (!this.active) {
      this.prevProject = app.store.surfaces.length ? JSON.parse(JSON.stringify(app.store.project)) : null;
      this.prevSim = app.view.simulation;
    }
    this.active = true;
    app.ensureRoom();
    app.store.setProject(buildDemoProject());
    app.store.select(null);
    app.setSimulation(true);
    document.body.classList.add('demo-on');
    this.scene = -1;
    app.transport.configure({ duration: DEMO_DURATION, loop: !record });
    app.transport.setRate(1);
    app.transport.seek(0);
    app.transport.play();
    app.editor.fitView();
    app.editor.presentation = true;
    this.tick();
    if (record) await app.recordDemo();
  }

  stop({ restore = true } = {}) {
    if (!this.active) return;
    const app = this.app;
    this.active = false;
    document.body.classList.remove('demo-on');
    this.caption.classList.remove('show');
    app.editor.presentation = false;
    app.calibration.outlines = false;
    app.calibration.vertices = false;
    app.setSimulation(!!this.prevSim);
    app.editor.fitView();
    if (restore) {
      if (this.prevProject) app.store.setProject(this.prevProject);
      else app.newProject({ silent: true });
    }
    app.sessionChanged();
  }

  editHere() {
    this.keepAsProject();
    const app = this.app;
    app.calibration.outlines = false;
    app.calibration.vertices = false;
    app.transport.configure({ loop: true });
    app.sessionChanged();
    app.editor.fitView();
    app.saveNow(false);
  }

  keepAsProject() {
    this.active = false;
    this.app.editor.presentation = false;
    document.body.classList.remove('demo-on');
    this.caption.classList.remove('show');
    const p = this.app.store.project;
    p.id = uid('p');
    p.name = 'Minha sala (a partir da demo)';
  }

  goto(i) {
    const s = SCENES[i];
    if (!s) return;
    this.app.seek(s.t + 0.01);
    this.app.transport.play();
  }

  toggleView() {
    this.app.setSimulation(!this.app.view.simulation);
    this.viewBtn.querySelector('.lbl').textContent = this.app.view.simulation ? 'Sala' : 'Saída';
  }

  tick() {
    if (!this.active) return;
    const app = this.app;
    const t = app.transport.time;
    let idx = 0;
    for (let i = 0; i < SCENES.length; i++) if (t >= SCENES[i].t) idx = i;
    this.progress.firstChild.style.width = `${(t / DEMO_DURATION) * 100}%`;
    this.playBtn.replaceChildren(icon(app.transport.playing ? 'pause' : 'play'));
    if (idx !== this.scene) {
      this.scene = idx;
      const sc = SCENES[idx];
      [...this.dots.children].forEach((d, i) => d.classList.toggle('on', i === idx));
      this.caption.replaceChildren(
        el('span.scene-num', `Cena ${idx + 1} de ${SCENES.length} · ${formatTime(sc.t, false)}`),
        el('h3', sc.title),
        el('p', sc.text),
      );
      this.caption.classList.remove('show');
      void this.caption.offsetWidth;
      this.caption.classList.add('show');
      app.calibration.outlines = !!sc.cal;
      app.calibration.vertices = !!sc.cal;
      app.sessionChanged();
      if (sc.focus) {
        const s = app.store.surfaces.find((x) => x.name === sc.focus);
        if (s) {
          const b = bbox(s.points);
          app.editor.focusOn({ x: b.minX, y: b.minY, w: b.w, h: b.h }, 1.4, sc.focus === 'Parede' ? 0.05 : 0.55);
        }
      } else app.editor.fitView();
    }
  }
}
