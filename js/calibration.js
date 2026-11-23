// Calibration: test patterns on the projector, surface outlines / vertex
// markers on the output, and a guided 6-step wizard. Shown as a floating dock
// so the editor stays usable while aligning corners.

import { el } from './utils.js';
import { icon, btn, segmented, sliderRow, toggleRow, colorRow } from './ui.js';
import { RESOLUTIONS } from './inspector.js';
import { effectContent } from './state.js';

export const PATTERN_LIST = [
  { id: 'none', label: 'Nenhum' },
  { id: 'grid', label: 'Grade' },
  { id: 'checker', label: 'Xadrez' },
  { id: 'white', label: 'Branco' },
  { id: 'black', label: 'Preto' },
  { id: 'red', label: 'R' },
  { id: 'green', label: 'G' },
  { id: 'blue', label: 'B' },
  { id: 'bars', label: 'Barras' },
  { id: 'ramp', label: 'Rampa' },
];

export class CalibrationDock {
  constructor(app) {
    this.app = app;
    this.mode = 'wizard';
    this.step = 0;
    this.root = el('div.cal-dock', { role: 'dialog', 'aria-label': 'Calibração', hidden: true });
    app.viewport.appendChild(this.root);
    app.store.on('selection', () => this.visible && this.render());
    app.projector.on('outputs', () => this.visible && this.render());
  }

  get visible() {
    return !this.root.hidden;
  }

  open(mode = 'wizard') {
    this.mode = mode;
    if (mode === 'wizard') this.step = 0;
    this.root.hidden = false;
    document.body.classList.add('cal-open');
    this.render();
  }

  close() {
    this.root.hidden = true;
    document.body.classList.remove('cal-open');
    const c = this.app.calibration;
    c.pattern = 'none';
    c.outlines = false;
    c.vertices = false;
    this.app.sessionChanged();
  }

  setPattern(p) {
    this.app.calibration.pattern = p;
    this.app.sessionChanged();
    this.render();
  }

  render() {
    const app = this.app;
    const cal = app.calibration;
    const head = el(
      'div.cal-head',
      icon('wand'),
      el('strong', 'Calibração'),
      segmented({
        label: 'Modo',
        options: [
          { value: 'wizard', label: 'Assistente' },
          { value: 'advanced', label: 'Avançado' },
        ],
        get: () => this.mode,
        set: (v) => {
          this.mode = v;
          this.render();
        },
      }),
      btn('close', '', () => this.close(), { iconOnly: true, cls: 'ghost', title: 'Fechar calibração' }),
    );
    const body = this.mode === 'wizard' ? this._wizard() : this._advanced();
    const out = app.projector.connectedCount;
    const status = el('div.cal-status', icon(out ? 'check' : 'info'), out ? `${out} saída(s) de projeção conectada(s)` : 'Nenhuma janela de projeção aberta — o padrão aparece apenas no editor.');
    this.root.replaceChildren(head, body, status);
  }

  _advanced() {
    const app = this.app;
    const cal = app.calibration;
    const pats = el('div.pattern-grid');
    for (const p of PATTERN_LIST) {
      const b = el(`button.pat.pat-${p.id}${cal.pattern === p.id ? '.on' : ''}`, { type: 'button', onclick: () => this.setPattern(p.id) }, el('span.sw'), el('span', p.label));
      pats.appendChild(b);
    }
    const upd = (fn) => (v) => {
      fn(v);
      app.sessionChanged();
    };
    return el(
      'div.cal-body',
      el('h4.sub', 'Padrão de teste (tela inteira)'),
      pats,
      sliderRow({ label: 'Espaçamento da grade', unit: 'px', min: 10, max: 400, step: 1, get: () => cal.gridPx, set: upd((v) => (cal.gridPx = v)) }),
      colorRow({ label: 'Cor das linhas', get: () => cal.color, set: upd((v) => (cal.color = v)) }),
      toggleRow({ label: 'Contorno das superfícies na saída', get: () => cal.outlines, set: upd((v) => (cal.outlines = v)) }),
      toggleRow({ label: 'Marcadores de vértices na saída', get: () => cal.vertices, set: upd((v) => (cal.vertices = v)) }),
      toggleRow({ label: 'Blackout (saída toda preta)', get: () => app.blackout, set: (v) => app.setBlackout(v) }),
      el('div.row-btns', btn('projector', 'Abrir saída do projetor', () => app.openOutput()), btn('fullscreen', 'Saída limpa nesta tela', () => app.enterCleanOutput())),
      el('p.muted.small', 'A superfície selecionada aparece em amarelo na saída. Use as setas do teclado (Shift = 10 px) ou o painel de vértices para o ajuste fino.'),
    );
  }

  _wizard() {
    const app = this.app;
    const cal = app.calibration;
    const steps = [
      {
        title: 'Escolha a resolução da projeção',
        body: () => {
          const sel = el('select.select', { 'aria-label': 'Resolução' });
          RESOLUTIONS.forEach((r) => sel.appendChild(el('option', { value: `${r.w}x${r.h}` }, r.label)));
          const o = app.store.project.output;
          sel.value = `${o.width}x${o.height}`;
          sel.addEventListener('change', () => {
            const [w, h] = sel.value.split('x').map(Number);
            app.setResolution(w, h);
          });
          return el(
            'div',
            el('p', 'Use a resolução nativa do projetor. Para o Formovie S5 (e a maioria dos projetores HDMI), escolha 1920 × 1080.'),
            sel,
            el('div.row-btns', btn('monitor', 'Detectar desta tela', () => app.useScreenResolution())),
          );
        },
      },
      {
        title: 'Exiba a grade no projetor',
        enter: () => {
          cal.pattern = 'grid';
          app.sessionChanged();
        },
        body: () =>
          el(
            'div',
            el('p', 'Conecte o projetor (HDMI) e estenda a área de trabalho. Abra a saída, arraste a janela para a tela do projetor e ative a tela cheia (tecla F ou duplo clique).'),
            el('p.muted.small', 'No celular: use o espelhamento de tela/adaptador USB-C → HDMI e toque em "Saída limpa".'),
            el('div.row-btns', btn('projector', 'Abrir saída do projetor', () => app.openOutput(), { cls: 'primary' }), btn('fullscreen', 'Saída limpa', () => app.enterCleanOutput())),
          ),
      },
      {
        title: 'Adicione uma superfície',
        enter: () => {
          cal.outlines = true;
          cal.vertices = true;
          app.sessionChanged();
        },
        body: () => {
          const has = !!app.store.selected;
          return el(
            'div',
            el('p', 'Crie um quadrilátero para cada face plana (parede, porta, frente de armário…). Você também pode tocar nos 4 cantos com a ferramenta Quadrilátero.'),
            el('div.row-btns', btn('quad', 'Adicionar quadrilátero', () => {
              app.addDefaultSurface();
              this.render();
            }, { cls: 'primary' }), btn('quad', 'Desenhar tocando nos cantos', () => app.editor.setTool('quad'))),
            has ? el('p.ok.small', `✓ Selecionada: ${app.store.selected.name}`) : null,
          );
        },
      },
      {
        title: 'Ajuste os cantos',
        body: () =>
          el(
            'div',
            el('p', 'Olhando para a parede real, arraste cada vértice até o canto físico do objeto. A superfície selecionada aparece em amarelo na projeção.'),
            el('p.muted.small', 'Precisão: toque num vértice e use as setas (Shift = 10 px) ou os botões abaixo. No celular aparece uma lupa enquanto você arrasta.'),
            el(
              'div.row-btns',
              btn('target', 'Próximo vértice', () => app.editor.selectNextVertex(1)),
              btn('up', '', () => app.editor.nudge(0, -1), { iconOnly: true, title: 'Cima' }),
              btn('down', '', () => app.editor.nudge(0, 1), { iconOnly: true, title: 'Baixo' }),
              btn('left', '', () => app.editor.nudge(-1, 0), { iconOnly: true, title: 'Esquerda' }),
              btn('right', '', () => app.editor.nudge(1, 0), { iconOnly: true, title: 'Direita' }),
            ),
          ),
      },
      {
        title: 'Aplique um conteúdo de teste',
        enter: () => {
          cal.pattern = 'none';
          app.sessionChanged();
        },
        body: () =>
          el(
            'div',
            el('p', 'Projete a grade de teste dentro da superfície: as linhas devem ficar retas e paralelas às bordas do objeto. O quadrado VERMELHO marca o canto superior esquerdo.'),
            el(
              'div.row-btns',
              btn('grid', 'Grade de teste', () => this._applyTest('grid'), { cls: 'primary' }),
              btn('grid', 'Xadrez', () => this._applyTest('checker')),
              btn('sun', 'Branco', () => this._applyTest('solid')),
            ),
          ),
      },
      {
        title: 'Salve a configuração',
        body: () =>
          el(
            'div',
            el('p', 'Pronto! Salve o projeto — ele fica guardado neste navegador e é recuperado automaticamente. Depois, escolha um efeito na biblioteca.'),
            el(
              'div.row-btns',
              btn('save', 'Salvar e concluir', async () => {
                await app.saveNow(true);
                this.close();
              }, { cls: 'primary' }),
              btn('sparkles', 'Escolher efeito', () => {
                this.close();
                app.showPanel('effects');
              }),
            ),
          ),
      },
    ];
    const s = steps[this.step];
    if (s.enter && !s._entered) s.enter();
    const dots = el('div.steps', steps.map((st, i) => el(`span.step${i === this.step ? '.on' : i < this.step ? '.done' : ''}`, { title: st.title }, String(i + 1))));
    return el(
      'div.cal-body',
      dots,
      el('h4', `${this.step + 1}. ${s.title}`),
      s.body(),
      el(
        'div.cal-nav',
        btn('left', 'Voltar', () => {
          this.step = Math.max(0, this.step - 1);
          this.render();
        }, { cls: 'ghost' }),
        this.step < steps.length - 1
          ? btn('right', 'Próximo', () => {
              this.step++;
              this.render();
            }, { cls: 'primary' })
          : null,
      ),
    );
  }

  _applyTest(effect) {
    const { store } = this.app;
    let s = store.selected;
    if (!s) s = this.app.addDefaultSurface();
    store.checkpoint();
    s.content = effectContent(effect);
    s.clips = [];
    store.changed('content');
  }
}
