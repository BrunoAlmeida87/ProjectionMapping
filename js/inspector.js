// Right panel: properties of the selected surface (geometry, vertices with
// numeric fine tuning, content, effect parameters, appearance, audio,
// keyframes and clips) or of the project when nothing is selected.

import { el, clamp, formatTime, uid } from './utils.js';
import { icon, btn, sliderRow, colorRow, selectRow, toggleRow, segmented, section, toast } from './ui.js';
import { EFFECTS, CATEGORIES, EFFECT_MAP, effectParams, defaultParams, ANIMATABLE } from './effects.js';
import { SHAPE_LABELS, animatedValue, setKey, keyAt, removeKey, effectContent } from './state.js';
import { centroid, bbox, transformPoints, surfaceOutline, rectPoints, meshFromQuad, resampleMesh, meshCorners } from './mapping.js';

export const RESOLUTIONS = [
  { w: 1920, h: 1080, label: '1920 × 1080 — Full HD (Formovie S5, maioria dos projetores)' },
  { w: 1280, h: 720, label: '1280 × 720 — HD' },
  { w: 3840, h: 2160, label: '3840 × 2160 — 4K UHD' },
  { w: 1280, h: 800, label: '1280 × 800 — WXGA' },
  { w: 1024, h: 768, label: '1024 × 768 — XGA (4:3)' },
  { w: 1920, h: 1200, label: '1920 × 1200 — WUXGA' },
  { w: 854, h: 480, label: '854 × 480 — FWVGA (mini projetores)' },
];

export class Inspector {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.controls = [];
    this.signature = '';
    this.nudgeStep = 1;
    const { store } = app;
    store.on('selection', () => this.update(true));
    store.on('change', () => this.update());
    app.transport.on('seek', () => this.refresh());
    this.update(true);
  }

  get s() {
    return this.app.store.selected;
  }

  _sig() {
    const { store } = this.app;
    const s = store.selected;
    if (!s) return `none|${store.project.id}|${store.project.background.mediaId}|${Object.keys(store.project.media).length}`;
    const c = this._targetContent(s);
    return [s.id, s.type, s.role, s.points.length, s.mesh?.cols, s.mesh?.rows, c?.type, c?.effect, c?.mediaId, store.sel.clipId, s.clips.length, store.sel.vertex >= 0, Object.keys(store.project.media).length].join('|');
  }

  update(force = false) {
    const sig = this._sig();
    if (force || sig !== this.signature) {
      this.signature = sig;
      this.build();
    } else this.refresh();
  }

  refresh() {
    for (const c of this.controls) c.refresh?.();
  }

  _reg(ctrl) {
    this.controls.push(ctrl);
    return ctrl;
  }

  /** Mutation helper: undo checkpoint (merged while dragging) + change event. */
  _mut(key, fn, kind = 'props') {
    return (v, final) => {
      const { store } = this.app;
      store.checkpoint(`${key}:${store.sel.surfaceId}`);
      fn(v, final);
      store.changed(kind, { final });
    };
  }

  build() {
    this.controls = [];
    const scroll = this.root.scrollTop;
    this.root.replaceChildren();
    const s = this.s;
    if (!s) this._buildProject();
    else this._buildSurface(s);
    this.root.scrollTop = scroll;
  }

  // ---------------------------------------------------------------- project

  _buildProject() {
    const { store, app } = { store: this.app.store, app: this.app };
    const p = () => store.project;
    const name = el('input.input', { type: 'text', value: p().name, 'aria-label': 'Nome do projeto' });
    name.addEventListener('change', () => {
      store.checkpoint();
      p().name = name.value.trim() || 'Projeto sem título';
      store.changed('project-meta');
    });
    this._reg({ refresh: () => document.activeElement !== name && (name.value = p().name) });

    const resSel = el('select.select', { 'aria-label': 'Resolução de saída' });
    RESOLUTIONS.forEach((r) => resSel.appendChild(el('option', { value: `${r.w}x${r.h}` }, r.label)));
    resSel.appendChild(el('option', { value: 'custom' }, 'Personalizada…'));
    const wIn = el('input.num', { type: 'number', min: 64, max: 8192, step: 1, 'aria-label': 'Largura' });
    const hIn = el('input.num', { type: 'number', min: 64, max: 8192, step: 1, 'aria-label': 'Altura' });
    const refreshRes = () => {
      const o = p().output;
      const key = `${o.width}x${o.height}`;
      resSel.value = RESOLUTIONS.some((r) => `${r.w}x${r.h}` === key) ? key : 'custom';
      if (document.activeElement !== wIn) wIn.value = o.width;
      if (document.activeElement !== hIn) hIn.value = o.height;
    };
    const applyRes = (w, h) => app.setResolution(w, h);
    resSel.addEventListener('change', () => {
      if (resSel.value === 'custom') return;
      const [w, h] = resSel.value.split('x').map(Number);
      applyRes(w, h);
    });
    wIn.addEventListener('change', () => applyRes(+wIn.value, +hIn.value));
    hIn.addEventListener('change', () => applyRes(+wIn.value, +hIn.value));
    this._reg({ refresh: refreshRes });
    refreshRes();

    const bgOpts = [{ value: '', label: 'Nenhuma' }, { value: 'builtin:room', label: 'Sala de demonstração' }];
    for (const [id, m] of Object.entries(p().media)) if (m.kind === 'image' || m.kind === 'gif') bgOpts.push({ value: id, label: m.name });

    this.root.append(
      el('div.insp-head', el('h2', 'Projeto'), el('p.muted', 'Nenhuma superfície selecionada. Toque em uma superfície no editor ou na lista de camadas para editar suas propriedades.')),
      section(
        'Projeto',
        el('div', el('label.field', el('span', 'Nome'), name), el('div.row-btns', btn('folder', 'Projetos', () => app.openProjects()), btn('save', 'Salvar', () => app.saveNow(true)))),
        { iconName: 'folder' },
      ),
      section(
        'Saída (projetor)',
        el(
          'div',
          el('label.field', el('span', 'Resolução'), resSel),
          el('div.field-row', el('label.field', el('span', 'Largura'), wIn), el('label.field', el('span', 'Altura'), hIn)),
          el('div.row-btns', btn('monitor', 'Usar a resolução desta tela', () => app.useScreenResolution()), btn('wand', 'Assistente', () => app.openCalibrationWizard())),
          el('p.muted.small', 'Dica: use a resolução nativa do projetor. O Formovie S5 trabalha em 1920 × 1080.'),
        ),
        { iconName: 'projector' },
      ),
      section(
        'Foto de referência / simulação',
        el(
          'div',
          this._reg(
            selectRow({
              label: 'Imagem de fundo (só no editor)',
              options: bgOpts,
              get: () => p().background.mediaId || '',
              set: (v) => app.setBackground(v || null),
            }),
          ),
          this._reg(
            sliderRow({
              label: 'Opacidade do fundo',
              min: 0,
              max: 1,
              step: 0.01,
              get: () => p().background.opacity,
              set: this._mut('bgop', (v) => (p().background.opacity = v), 'project-meta'),
            }),
          ),
          this._reg(toggleRow({ label: 'Modo simulação (luz projetada sobre a foto)', get: () => app.view.simulation, set: (v) => app.setSimulation(v) })),
          el('p.muted.small', 'Tire uma foto do ambiente a partir da posição do projetor e importe-a para planejar o mapping antes de ligar o equipamento. O fundo nunca é enviado para a saída do projetor.'),
        ),
        { iconName: 'image', open: false },
      ),
      section(
        'Timeline',
        el(
          'div',
          this._reg(
            sliderRow({
              label: 'Duração',
              unit: 's',
              min: 2,
              max: 600,
              step: 1,
              get: () => p().timeline.duration,
              set: this._mut('dur', (v) => (p().timeline.duration = clamp(v, 1, 3600)), 'timeline'),
            }),
          ),
          this._reg(toggleRow({ label: 'Repetir (loop)', get: () => p().timeline.loop, set: this._mut('loop', (v) => (p().timeline.loop = v), 'timeline') })),
        ),
        { iconName: 'film', open: false },
      ),
      section(
        'Desempenho',
        el(
          'div',
          this._reg(
            selectRow({
              label: 'Perfil de qualidade',
              options: [
                { value: 'auto', label: 'Automático (recomendado)' },
                { value: '0', label: 'Baixa — celulares menos potentes' },
                { value: '1', label: 'Média — celulares modernos e notebooks' },
                { value: '2', label: 'Alta — computadores com GPU dedicada' },
              ],
              get: () => app.qualityPref,
              set: (v) => app.setQualityPref(v),
            }),
          ),
          this.app.perfInfoEl || null,
        ),
        { iconName: 'settings', open: false },
      ),
    );
  }

  // ---------------------------------------------------------------- surface

  _targetContent(s) {
    const clipId = this.app.store.sel.clipId;
    if (clipId) {
      const clip = s.clips.find((c) => c.id === clipId);
      if (clip) return clip.content;
    }
    return s.content;
  }

  _setTargetContent(s, content) {
    const clipId = this.app.store.sel.clipId;
    const clip = clipId && s.clips.find((c) => c.id === clipId);
    if (clip) clip.content = content;
    else s.content = content;
  }

  _buildSurface(s) {
    const { store } = this.app;
    const app = this.app;
    const res = () => store.res();
    const W = () => store.project.output.width;
    const H = () => store.project.output.height;

    // ---- header
    const name = el('input.input.name-input', { type: 'text', value: s.name, 'aria-label': 'Nome da superfície' });
    name.addEventListener('change', () => {
      store.checkpoint();
      s.name = name.value.trim() || s.name;
      store.changed('props');
    });
    const header = el(
      'div.insp-head',
      el('div.insp-title', icon(s.role === 'mask' ? 'mask' : s.type === 'mesh' ? 'mesh' : s.type), name),
      el('small.muted', `${SHAPE_LABELS[s.type] || s.type} · ${s.points.length} vértices · id ${s.id.slice(-6)}`),
      el(
        'div.row-btns.compact',
        btn(s.visible ? 'eye' : 'eyeOff', '', this._mutClick(() => (s.visible = !s.visible)), { iconOnly: true, title: s.visible ? 'Ocultar' : 'Mostrar' }),
        btn(s.locked ? 'lock' : 'unlock', '', this._mutClick(() => (s.locked = !s.locked)), { iconOnly: true, title: s.locked ? 'Desbloquear' : 'Bloquear edição' }),
        btn('up', '', () => store.moveSurface(s.id, 1), { iconOnly: true, title: 'Subir camada (])' }),
        btn('down', '', () => store.moveSurface(s.id, -1), { iconOnly: true, title: 'Descer camada ([)' }),
        btn('copy', '', () => app.duplicateSelected(), { iconOnly: true, title: 'Duplicar (Ctrl+D)' }),
        btn('trash', '', () => app.deleteSelected(), { iconOnly: true, title: 'Excluir (Delete)', cls: 'danger-ghost' }),
        btn('close', '', () => store.select(null), { iconOnly: true, title: 'Desselecionar (Esc)' }),
      ),
    );
    const roleSeg = this._reg(
      segmented({
        label: 'Função',
        options: [
          { value: 'content', label: 'Conteúdo', icon: 'sparkles' },
          { value: 'mask', label: 'Máscara', icon: 'mask' },
        ],
        get: () => s.role,
        set: this._mut('role', (v) => (s.role = v), 'structure'),
      }),
    );
    header.appendChild(roleSeg);
    this.root.appendChild(header);

    // ---- geometry
    const geo = el('div');
    const center = () => centroid(surfaceOutline(s, s.points, 16));
    const bb = () => bbox(s.points);
    geo.append(
      el(
        'div.field-row',
        this._num('X centro', () => center()[0] * W(), (v) => {
          const c = center();
          const dx = v / W() - c[0];
          s.points = s.points.map((p) => [p[0] + dx, p[1]]);
        }),
        this._num('Y centro', () => center()[1] * H(), (v) => {
          const c = center();
          const dy = v / H() - c[1];
          s.points = s.points.map((p) => [p[0], p[1] + dy]);
        }),
      ),
      el(
        'div.field-row',
        this._num('Largura', () => bb().w * W(), (v) => {
          const b = bb();
          if (b.w <= 0 || v <= 0) return;
          s.points = transformPoints(s.points, { sx: v / W() / b.w, sy: 1 }, res(), [b.cx, b.cy]);
        }),
        this._num('Altura', () => bb().h * H(), (v) => {
          const b = bb();
          if (b.h <= 0 || v <= 0) return;
          s.points = transformPoints(s.points, { sx: 1, sy: v / H() / b.h }, res(), [b.cx, b.cy]);
        }),
      ),
      this._reg(
        sliderRow({
          label: 'Rotação',
          unit: '°',
          min: -180,
          max: 180,
          step: 0.5,
          get: () => s.rotation || 0,
          set: this._mut(
            'rot',
            (v) => {
              const d = v - (s.rotation || 0);
              s.points = transformPoints(s.points, { rotation: d }, res(), center());
              s.rotation = v;
            },
            'geometry',
          ),
        }),
      ),
      el(
        'div.row-btns.wrap',
        btn('target', 'Centralizar', this._mutClick(() => {
          const c = center();
          s.points = s.points.map((p) => [p[0] + 0.5 - c[0], p[1] + 0.5 - c[1]]);
        }, 'geometry')),
        btn('fullscreen', 'Preencher saída', this._mutClick(() => {
          this._resetShape(s, rectPoints(0, 0, 1, 1));
        }, 'geometry')),
        btn('rect', 'Retificar', this._mutClick(() => {
          const b = bb();
          this._resetShape(s, rectPoints(b.minX, b.minY, b.w, b.h));
        }, 'geometry'), { title: 'Remove a deformação: volta a um retângulo alinhado' }),
        s.type === 'quad' || s.type === 'rect'
          ? btn('mesh', 'Converter em malha', this._mutClick(() => {
              s.points = meshFromQuad(s.points, 3, 3);
              s.type = 'mesh';
              s.mesh = { cols: 3, rows: 3 };
            }, 'structure'), { title: 'Malha com pontos internos para superfícies curvas ou irregulares' })
          : null,
      ),
    );
    if (s.type === 'mesh') {
      const meshRes = (cols, rows) =>
        this._mutClick(() => {
          s.points = resampleMesh(s.points, s.mesh.cols, s.mesh.rows, cols, rows);
          s.mesh = { cols, rows };
        }, 'structure')();
      geo.append(
        el(
          'div.field-row',
          this._num('Colunas', () => s.mesh.cols, (v) => meshRes(clamp(Math.round(v), 1, 12), s.mesh.rows), { step: 1, direct: true }),
          this._num('Linhas', () => s.mesh.rows, (v) => meshRes(s.mesh.cols, clamp(Math.round(v), 1, 12)), { step: 1, direct: true }),
        ),
        btn('restart', 'Reiniciar malha (manter cantos)', this._mutClick(() => {
          s.points = meshFromQuad(meshCorners(s.points, s.mesh.cols, s.mesh.rows), s.mesh.cols, s.mesh.rows);
        }, 'geometry')),
      );
    }
    this.root.appendChild(section('Posição, tamanho e rotação', geo, { iconName: 'move' }));

    // ---- vertices
    this.root.appendChild(section('Vértices e ajuste fino', this._buildVertices(s), { iconName: 'target' }));

    // ---- content / mask
    if (s.role === 'mask') {
      this.root.appendChild(
        section(
          'Máscara',
          el(
            'div',
            el('p.muted.small', 'Máscaras pintam de preto (sem luz) tudo o que estiver ABAIXO delas na lista de camadas. Use para não projetar em paredes vizinhas, objetos ou fora de um móvel.'),
            this._reg(toggleRow({ label: 'Inverter (ocultar tudo FORA da forma)', get: () => s.invert, set: this._mut('inv', (v) => (s.invert = v)) })),
            this._reg(sliderRow({ label: 'Opacidade da máscara', min: 0, max: 1, step: 0.01, get: () => s.opacity, set: this._mut('op', (v) => (s.opacity = v)) })),
            this._reg(sliderRow({ label: 'Borda suave (feather)', unit: 'px', min: 0, max: 200, step: 1, get: () => s.feather, set: this._mut('fe', (v) => (s.feather = v)) })),
          ),
          { iconName: 'mask' },
        ),
      );
    } else {
      this.root.appendChild(this._buildContent(s));
      this.root.appendChild(this._buildAppearance(s));
      this.root.appendChild(this._buildAudio(s));
    }
    this.root.appendChild(this._buildAnimation(s));
  }

  _resetShape(s, rect) {
    if (s.type === 'mesh') s.points = meshFromQuad(rect, s.mesh.cols, s.mesh.rows);
    else if (s.type === 'triangle') s.points = [[(rect[0][0] + rect[1][0]) / 2, rect[0][1]], rect[2], rect[3]];
    else if (s.type === 'polygon') {
      const b = bbox(s.points);
      const nb = bbox(rect);
      s.points = s.points.map((p) => [nb.minX + ((p[0] - b.minX) / (b.w || 1)) * nb.w, nb.minY + ((p[1] - b.minY) / (b.h || 1)) * nb.h]);
    } else s.points = rect;
    s.rotation = 0;
  }

  _mutClick(fn, kind = 'props') {
    return () => {
      const { store } = this.app;
      store.checkpoint();
      fn();
      store.changed(kind, { final: true });
      this.update(true);
    };
  }

  _num(label, get, set, { step = 1, direct = false } = {}) {
    const input = el('input.num', { type: 'number', step, 'aria-label': label });
    const refresh = () => {
      if (document.activeElement !== input) input.value = Math.round(get() * 10) / 10;
    };
    input.addEventListener('change', () => {
      const v = +input.value;
      if (!Number.isFinite(v)) return refresh();
      if (direct) set(v);
      else {
        this.app.store.checkpoint();
        set(v);
        this.app.store.changed('geometry', { final: true });
      }
      refresh();
    });
    this._reg({ refresh });
    refresh();
    return el('label.field', el('span', label), input);
  }

  _buildVertices(s) {
    const { store } = this.app;
    const app = this.app;
    const W = () => store.project.output.width;
    const H = () => store.project.output.height;
    const wrap = el('div.vertices');
    const vi = () => store.sel.vertex;
    const selInfo = el('div.vsel');
    const xIn = el('input.num', { type: 'number', step: 1, 'aria-label': 'X do vértice (px)' });
    const yIn = el('input.num', { type: 'number', step: 1, 'aria-label': 'Y do vértice (px)' });
    const refresh = () => {
      const i = vi();
      const has = i >= 0 && i < s.points.length;
      selInfo.textContent = has ? `Vértice ${i + 1} de ${s.points.length}` : 'Nenhum vértice selecionado — os botões movem a superfície inteira.';
      xIn.disabled = yIn.disabled = !has;
      if (has) {
        if (document.activeElement !== xIn) xIn.value = (s.points[i][0] * W()).toFixed(1);
        if (document.activeElement !== yIn) yIn.value = (s.points[i][1] * H()).toFixed(1);
      } else {
        xIn.value = '';
        yIn.value = '';
      }
      list.querySelectorAll('.vrow').forEach((r) => r.classList.toggle('on', +r.dataset.i === i));
    };
    const setXY = () => {
      const i = vi();
      if (i < 0 || s.locked) return;
      store.checkpoint();
      if (s.type === 'rect') s.type = 'quad';
      s.points[i] = [+xIn.value / W(), +yIn.value / H()];
      store.changed('geometry', { final: true });
    };
    xIn.addEventListener('change', setXY);
    yIn.addEventListener('change', setXY);
    const step = segmented({
      label: 'Passo do ajuste fino',
      options: [1, 5, 20].map((v) => ({ value: String(v), label: `${v}px` })),
      get: () => String(this.nudgeStep),
      set: (v) => {
        this.nudgeStep = +v;
        step.refresh();
      },
    });
    const n = (dx, dy) => () => app.editor.nudge(dx * this.nudgeStep, dy * this.nudgeStep);
    const pad = el(
      'div.nudge-pad',
      el('span'),
      btn('up', '', n(0, -1), { iconOnly: true, title: 'Mover para cima (↑)' }),
      el('span'),
      btn('left', '', n(-1, 0), { iconOnly: true, title: 'Mover para a esquerda (←)' }),
      btn('target', '', () => app.editor.selectNextVertex(1), { iconOnly: true, title: 'Próximo vértice (Tab)' }),
      btn('right', '', n(1, 0), { iconOnly: true, title: 'Mover para a direita (→)' }),
      el('span'),
      btn('down', '', n(0, 1), { iconOnly: true, title: 'Mover para baixo (↓)' }),
      el('span'),
    );
    const list = el('div.vlist');
    if (s.points.length <= 16) {
      s.points.forEach((p, i) => {
        const r = el('button.vrow', { type: 'button', dataset: { i } }, el('b', `${i + 1}`), el('span'));
        r.addEventListener('click', () => {
          store.select(s.id, { vertex: i });
          app.editor.changed();
        });
        list.appendChild(r);
      });
      const refreshList = () =>
        list.querySelectorAll('.vrow').forEach((r) => {
          const p = s.points[+r.dataset.i];
          if (p) r.querySelector('span').textContent = `${Math.round(p[0] * W())}, ${Math.round(p[1] * H())}`;
        });
      this._reg({ refresh: refreshList });
      refreshList();
    }
    const polyBtns =
      s.type === 'polygon'
        ? el(
            'div.row-btns',
            btn('plus', 'Adicionar ponto', this._mutClick(() => {
              const i = vi() >= 0 ? vi() : s.points.length - 1;
              const a = s.points[i];
              const b = s.points[(i + 1) % s.points.length];
              if (s.points.length < 48) s.points.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
            }, 'geometry'), { title: 'Insere um ponto após o vértice selecionado (ou dê duplo clique numa aresta)' }),
            btn('minus', 'Remover ponto', this._mutClick(() => {
              const i = vi();
              if (i >= 0 && s.points.length > 3) {
                s.points.splice(i, 1);
                store.select(s.id);
              }
            }, 'geometry')),
          )
        : null;
    wrap.append(
      el('p.muted.small', 'Arraste os vértices no editor (toque também). Para precisão: selecione um vértice e use os campos, as setas do teclado (Shift = 10px) ou os botões abaixo.'),
      selInfo,
      el('div.field-row', el('label.field', el('span', 'X (px)'), xIn), el('label.field', el('span', 'Y (px)'), yIn)),
      el('div.nudge-wrap', pad, el('div', el('small.muted', 'Passo'), step)),
      list,
    );
    if (polyBtns) wrap.appendChild(polyBtns);
    this._reg({ refresh });
    refresh();
    return wrap;
  }

  _buildContent(s) {
    const { store } = this.app;
    const app = this.app;
    const wrap = el('div');
    const clipId = store.sel.clipId;
    const clip = clipId && s.clips.find((c) => c.id === clipId);
    if (clip) {
      wrap.appendChild(
        el(
          'div.clip-banner',
          icon('film'),
          el('span', `Editando o conteúdo do clipe (${formatTime(clip.start)} → ${formatTime(clip.end)})`),
          btn('close', 'Voltar', () => store.select(s.id), { cls: 'ghost' }),
        ),
      );
    }
    const content = () => this._targetContent(s);
    const typeSeg = this._reg(
      segmented({
        label: 'Tipo de conteúdo',
        options: [
          { value: 'effect', label: 'Efeito', icon: 'sparkles' },
          { value: 'media', label: 'Mídia', icon: 'image' },
          { value: 'none', label: 'Nenhum', icon: 'close' },
        ],
        get: () => content().type,
        set: this._mut('ctype', (v) => {
          if (v === content().type) return;
          if (v === 'effect') this._setTargetContent(s, effectContent('waves'));
          else if (v === 'media') {
            const first = Object.keys(store.project.media).find((id) => ['image', 'gif', 'video'].includes(store.project.media[id].kind));
            if (!first) {
              toast('Importe uma imagem ou vídeo na aba Mídia primeiro.', { type: 'warn' });
              app.showPanel('media');
              return;
            }
            this._setTargetContent(s, { type: 'media', mediaId: first });
          } else this._setTargetContent(s, { type: 'none' });
        }, 'content'),
      }),
    );
    wrap.appendChild(typeSeg);
    const c = content();
    if (c.type === 'effect') {
      const sel = el('select.select', { 'aria-label': 'Efeito' });
      for (const cat of CATEGORIES) {
        const g = el('optgroup', { label: cat.name });
        EFFECTS.filter((e) => e.cat === cat.id).forEach((e) => g.appendChild(el('option', { value: e.id }, e.name)));
        sel.appendChild(g);
      }
      sel.value = c.effect;
      sel.addEventListener('change', () => {
        store.checkpoint();
        this._setTargetContent(s, effectContent(sel.value));
        store.changed('content', { final: true });
      });
      wrap.append(
        el('label.field', el('span', 'Efeito'), sel),
        el('p.muted.small', EFFECT_MAP[c.effect]?.desc || ''),
      );
      const params = effectParams(c.effect);
      const pbox = el('div.params');
      for (const prm of params) {
        const get = () => content().params?.[prm.key] ?? prm.d;
        const set = this._mut(`p-${prm.key}`, (v) => {
          const cc = content();
          cc.params = cc.params || {};
          cc.params[prm.key] = v;
        });
        if (prm.type === 'color') pbox.appendChild(this._reg(colorRow({ label: prm.label, get, set })));
        else pbox.appendChild(this._reg(sliderRow({ label: prm.label, unit: prm.unit || '', min: prm.min, max: prm.max, step: prm.step, get, set })));
      }
      wrap.append(
        pbox,
        el(
          'div.row-btns',
          btn('restart', 'Restaurar padrões', this._mutClick(() => {
            content().params = defaultParams(content().effect);
          }, 'content')),
          btn('sparkles', 'Biblioteca', () => app.showPanel('effects')),
        ),
      );
    } else if (c.type === 'media') {
      const opts = Object.entries(store.project.media)
        .filter(([, m]) => m.kind !== 'audio')
        .map(([id, m]) => ({ value: id, label: `${m.name}${app.media.status(id) === 'missing' ? ' (ausente)' : ''}` }));
      wrap.appendChild(
        this._reg(
          selectRow({
            label: 'Arquivo',
            options: opts,
            get: () => content().mediaId,
            set: this._mut('mid', (v) => (content().mediaId = v), 'content'),
          }),
        ),
      );
      const status = app.media.status(c.mediaId);
      if (status === 'missing')
        wrap.appendChild(el('div.warnbox', icon('info'), el('span', 'Este arquivo não está neste dispositivo. Importe-o novamente na aba Mídia (o projeto guarda só a referência).')));
      const mm = store.project.media[c.mediaId];
      if (mm && (mm.kind === 'video' || mm.kind === 'gif')) {
        const ms = () => store.project.media[content().mediaId] || {};
        wrap.append(
          el('h4.sub', 'Reprodução'),
          this._reg(toggleRow({ label: 'Pausar esta mídia', get: () => ms().paused, set: this._mut('mpause', (v) => (ms().paused = v)) })),
          this._reg(toggleRow({ label: 'Repetir (loop)', get: () => ms().loop ?? true, set: this._mut('mloop', (v) => (ms().loop = v)) })),
          this._reg(sliderRow({ label: 'Velocidade', unit: '×', min: 0.1, max: 4, step: 0.05, get: () => ms().speed ?? 1, set: this._mut('mspeed', (v) => (ms().speed = v)) })),
        );
        if (mm.kind === 'video') {
          wrap.append(
            this._reg(toggleRow({ label: 'Som do vídeo', get: () => ms().muted === false, set: this._mut('mmute', (v) => {
              ms().muted = !v;
              app.media.unlock();
              app.audio?.ensure();
            }) })),
            this._reg(sliderRow({ label: 'Volume', min: 0, max: 1, step: 0.01, get: () => ms().volume ?? 1, set: this._mut('mvol', (v) => (ms().volume = v)) })),
          );
        }
      }
    }
    if (c.type !== 'none') {
      const tr = () => s.transform;
      const frame = el(
        'div',
        c.type === 'media'
          ? this._reg(
              segmented({
                label: 'Enquadramento',
                options: [
                  { value: 'cover', label: 'Cobrir' },
                  { value: 'contain', label: 'Conter' },
                  { value: 'stretch', label: 'Esticar' },
                ],
                get: () => tr().fit,
                set: this._mut('fit', (v) => (tr().fit = v)),
              }),
            )
          : null,
        this._reg(sliderRow({ label: 'Zoom do conteúdo', unit: '×', min: 0.1, max: 6, step: 0.01, get: () => tr().scale, set: this._mut('tsc', (v) => (tr().scale = v)) })),
        this._reg(sliderRow({ label: 'Deslocar X', min: -1, max: 1, step: 0.001, get: () => tr().x, set: this._mut('tx', (v) => (tr().x = v)) })),
        this._reg(sliderRow({ label: 'Deslocar Y', min: -1, max: 1, step: 0.001, get: () => tr().y, set: this._mut('ty', (v) => (tr().y = v)) })),
        this._reg(sliderRow({ label: 'Girar conteúdo', unit: '°', min: -180, max: 180, step: 0.5, get: () => tr().rotation, set: this._mut('trot', (v) => (tr().rotation = v)) })),
        el(
          'div.toggles-inline',
          this._reg(toggleRow({ label: 'Espelhar H', get: () => tr().flipX, set: this._mut('fx', (v) => (tr().flipX = v)) })),
          this._reg(toggleRow({ label: 'Espelhar V', get: () => tr().flipY, set: this._mut('fy', (v) => (tr().flipY = v)) })),
          c.type === 'media' ? this._reg(toggleRow({ label: 'Repetir (lado a lado)', get: () => tr().tile, set: this._mut('tile', (v) => (tr().tile = v)) })) : null,
        ),
        btn('restart', 'Redefinir enquadramento', this._mutClick(() => {
          Object.assign(s.transform, { scale: 1, x: 0, y: 0, rotation: 0, flipX: false, flipY: false, tile: false });
        })),
      );
      wrap.appendChild(section('Enquadramento do conteúdo', frame, { open: false, iconName: 'fit' }));
    }
    return section(clip ? 'Conteúdo do clipe' : 'Conteúdo', wrap, { iconName: 'sparkles' });
  }

  _buildAppearance(s) {
    const adj = () => s.adjust;
    return section(
      'Aparência e cor',
      el(
        'div',
        this._animSlider(s, ANIMATABLE[0]),
        this._reg(
          selectRow({
            label: 'Mistura',
            options: [
              { value: 'normal', label: 'Normal' },
              { value: 'add', label: 'Adicionar (luz)' },
              { value: 'screen', label: 'Tela (screen)' },
              { value: 'multiply', label: 'Multiplicar' },
            ],
            get: () => s.blend,
            set: this._mut('blend', (v) => (s.blend = v)),
          }),
        ),
        this._reg(sliderRow({ label: 'Borda suave (feather)', unit: 'px', min: 0, max: 200, step: 1, get: () => s.feather, set: this._mut('feather', (v) => (s.feather = v)) })),
        this._reg(sliderRow({ label: 'Brilho', min: -1, max: 1, step: 0.01, get: () => adj().brightness, set: this._mut('br', (v) => (adj().brightness = v)) })),
        this._reg(sliderRow({ label: 'Contraste', min: 0, max: 3, step: 0.01, get: () => adj().contrast, set: this._mut('co', (v) => (adj().contrast = v)) })),
        this._reg(sliderRow({ label: 'Saturação', min: 0, max: 3, step: 0.01, get: () => adj().saturation, set: this._mut('sa', (v) => (adj().saturation = v)) })),
        this._reg(sliderRow({ label: 'Matiz', unit: '°', min: -180, max: 180, step: 1, get: () => adj().hue, set: this._mut('hu', (v) => (adj().hue = v)) })),
        btn('restart', 'Redefinir cores', this._mutClick(() => Object.assign(s.adjust, { brightness: 0, contrast: 1, saturation: 1, hue: 0 }))),
      ),
      { iconName: 'palette', open: false },
    );
  }

  _buildAudio(s) {
    const app = this.app;
    const status = el('p.muted.small');
    const refresh = () => {
      status.textContent = app.audio?.sourceLabel ? `Fonte ativa: ${app.audio.sourceLabel}` : 'Nenhuma fonte de áudio ativa.';
    };
    this._reg({ refresh });
    refresh();
    return section(
      'Áudio reativo',
      el(
        'div',
        this._reg(sliderRow({ label: 'Reação ao som', min: 0, max: 2, step: 0.01, get: () => s.audioReact, set: this._mut('ar', (v) => (s.audioReact = v)) })),
        status,
        el('div.row-btns', btn('mic', 'Usar microfone', () => app.useMicrophone()), btn('music', 'Trilha sonora', () => app.showPanel('media'))),
        el('p.muted.small', 'A intensidade do efeito acompanha o volume da música ou do ambiente (requer permissão do navegador para o microfone).'),
      ),
      { iconName: 'mic', open: false },
    );
  }

  _animSlider(s, prop) {
    const { store, transport } = this.app;
    const t = () => transport.time;
    const W = store.project.output.width;
    const H = store.project.output.height;
    const isPx = prop.px;
    const scale = prop.px === 'w' ? W : prop.px === 'h' ? H : 1;
    const keyBtn = el('button.key-btn', { type: 'button', title: 'Adicionar/remover keyframe no tempo atual' }, icon('diamond'));
    const refreshKey = () => {
      const on = !!keyAt(s, prop.key, t());
      const has = !!(s.keys[prop.key] && s.keys[prop.key].length);
      keyBtn.classList.toggle('on', on);
      keyBtn.classList.toggle('has', has);
      keyBtn.replaceChildren(icon(on ? 'diamondFill' : 'diamond'));
    };
    keyBtn.addEventListener('click', () => {
      store.checkpoint();
      if (keyAt(s, prop.key, t())) removeKey(s, prop.key, t());
      else setKey(s, prop.key, t(), animatedValue(s, prop.key, t()));
      store.changed('timeline', { final: true });
    });
    const row = sliderRow({
      label: prop.label,
      unit: isPx ? 'px' : prop.unit || '',
      min: isPx ? prop.min * scale : prop.min,
      max: isPx ? prop.max * scale : prop.max,
      step: isPx ? 1 : prop.step,
      get: () => animatedValue(s, prop.key, t()) * scale,
      set: this._mut(`k-${prop.key}`, (v) => {
        const val = v / scale;
        const hasTrack = s.keys[prop.key] && s.keys[prop.key].length;
        if (prop.key === 'opacity' && !hasTrack) s.opacity = val;
        else setKey(s, prop.key, t(), val);
      }, 'timeline'),
      keyBtn,
    });
    const r0 = row.refresh;
    row.refresh = () => {
      r0();
      refreshKey();
    };
    refreshKey();
    return this._reg(row);
  }

  _buildAnimation(s) {
    const { store, transport } = this.app;
    const app = this.app;
    const wrap = el('div');
    wrap.appendChild(el('p.muted.small', 'Mova a agulha da timeline, ajuste um valor e clique no ◆ para gravar um keyframe. Valores entre keyframes são interpolados.'));
    for (const prop of ANIMATABLE.slice(1)) {
      if (prop.key === 'intensity' && s.role === 'mask') continue;
      wrap.appendChild(this._animSlider(s, prop));
    }
    const hasKeys = Object.keys(s.keys).length > 0;
    wrap.appendChild(
      el(
        'div.row-btns',
        btn('left', '', () => app.jumpKey(-1), { iconOnly: true, title: 'Keyframe anterior' }),
        btn('right', '', () => app.jumpKey(1), { iconOnly: true, title: 'Próximo keyframe' }),
        hasKeys ? btn('trash', 'Apagar keyframes', this._mutClick(() => (s.keys = {}), 'timeline'), { cls: 'danger-ghost' }) : null,
      ),
    );
    if (s.role !== 'mask') {
      wrap.appendChild(el('h4.sub', 'Clipes (troca de conteúdo no tempo)'));
      wrap.appendChild(el('p.muted.small', 'Sem clipes, a superfície mostra sempre o conteúdo base. Com clipes, ela mostra o conteúdo de cada clipe só no intervalo dele, com fade de entrada/saída. Clipes sobrepostos fazem transição cruzada.'));
      const list = el('div.clip-list');
      s.clips
        .slice()
        .sort((a, b) => a.start - b.start)
        .forEach((c, i) => {
          const isSel = store.sel.clipId === c.id;
          const name = c.content.type === 'effect' ? EFFECT_MAP[c.content.effect]?.name : c.content.type === 'media' ? store.project.media[c.content.mediaId]?.name : 'Vazio';
          const row = el(
            `div.clip-row${isSel ? '.on' : ''}`,
            el('button.clip-pick', { type: 'button', onclick: () => store.select(s.id, { clipId: isSel ? null : c.id }) }, el('b', `${i + 1}`), el('span', name || '—'), el('small', `${formatTime(c.start)}–${formatTime(c.end)}`)),
            btn('trash', '', this._mutClick(() => {
              s.clips = s.clips.filter((x) => x.id !== c.id);
              if (store.sel.clipId === c.id) store.sel.clipId = null;
            }, 'timeline'), { iconOnly: true, title: 'Excluir clipe', cls: 'danger-ghost' }),
          );
          list.appendChild(row);
        });
      wrap.appendChild(list);
      const clip = store.sel.clipId && s.clips.find((c) => c.id === store.sel.clipId);
      if (clip) {
        const dur = () => store.project.timeline.duration;
        wrap.append(
          this._reg(sliderRow({ label: 'Início', unit: 's', min: 0, max: dur(), step: 0.1, get: () => clip.start, set: this._mut('cs', (v) => {
            const len = clip.end - clip.start;
            clip.start = clamp(v, 0, dur());
            clip.end = clip.start + len;
          }, 'timeline') })),
          this._reg(sliderRow({ label: 'Duração', unit: 's', min: 0.2, max: dur(), step: 0.1, get: () => clip.end - clip.start, set: this._mut('cd', (v) => (clip.end = clip.start + Math.max(0.1, v)), 'timeline') })),
          this._reg(sliderRow({ label: 'Fade de entrada', unit: 's', min: 0, max: 10, step: 0.1, get: () => clip.fadeIn, set: this._mut('cfi', (v) => (clip.fadeIn = v), 'timeline') })),
          this._reg(sliderRow({ label: 'Fade de saída', unit: 's', min: 0, max: 10, step: 0.1, get: () => clip.fadeOut, set: this._mut('cfo', (v) => (clip.fadeOut = v), 'timeline') })),
        );
      }
      wrap.appendChild(
        el(
          'div.row-btns',
          btn('plus', 'Clipe na agulha', this._mutClick(() => {
            const t0 = transport.time;
            const c = { id: uid('c'), start: t0, end: Math.min(store.project.timeline.duration, t0 + 5) || t0 + 5, fadeIn: 0.5, fadeOut: 0.5, content: JSON.parse(JSON.stringify(this._targetContent(s))) };
            if (c.end - c.start < 0.5) c.end = c.start + 5;
            s.clips.push(c);
            store.sel.clipId = c.id;
          }, 'timeline'), { title: 'Cria um clipe de 5 s a partir do tempo atual com o conteúdo atual' }),
          s.clips.length ? btn('trash', 'Remover clipes', this._mutClick(() => {
            s.clips = [];
            store.sel.clipId = null;
          }, 'timeline'), { cls: 'danger-ghost' }) : null,
        ),
      );
    }
    return section('Animação e timeline', wrap, { iconName: 'diamond', open: hasKeys || s.clips.length > 0 });
  }
}
