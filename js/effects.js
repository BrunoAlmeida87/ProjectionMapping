// Effect registry: metadata, parameter schema and default values for every
// GPU effect. GLSL bodies live in shaders/effects.js.

import { EFFECT_GLSL } from '../shaders/effects.js';

export const PARAM_DEFS = {
  speed: { label: 'Velocidade', min: 0, max: 4, step: 0.01, uniform: 'uSpeed' },
  intensity: { label: 'Intensidade', min: 0, max: 3, step: 0.01, uniform: 'uIntensity' },
  scale: { label: 'Escala', min: 0.2, max: 4, step: 0.01, uniform: 'uScale' },
  density: { label: 'Densidade', min: 0.05, max: 3, step: 0.01, uniform: 'uDensity' },
  direction: { label: 'Direção', min: -180, max: 180, step: 1, unit: '°', uniform: 'uDir' },
  frequency: { label: 'Frequência', min: 0.1, max: 5, step: 0.01, uniform: 'uFreq' },
  amplitude: { label: 'Amplitude', min: 0, max: 3, step: 0.01, uniform: 'uAmp' },
  colorA: { label: 'Cor 1', type: 'color', uniform: 'uColorA' },
  colorB: { label: 'Cor 2', type: 'color', uniform: 'uColorB' },
};

// Values used for parameters an effect does not expose.
export const NEUTRAL = {
  speed: 1,
  intensity: 1,
  scale: 1,
  density: 1,
  direction: 0,
  frequency: 1,
  amplitude: 1,
  colorA: '#ffffff',
  colorB: '#000000',
};

export const CATEGORIES = [
  { id: 'natal', name: 'Natal' },
  { id: 'natureza', name: 'Natureza' },
  { id: 'cosmos', name: 'Cósmico' },
  { id: 'geo', name: 'Geométrico' },
  { id: 'luz', name: 'Luz & cor' },
  { id: 'teste', name: 'Calibração' },
];

const P = (d, extra = {}) => ({ d, ...extra });

export const EFFECTS = [
  {
    id: 'water',
    name: 'Água em movimento',
    cat: 'natureza',
    desc: 'Cáusticas e filetes de água escorrendo pela superfície.',
    params: {
      speed: P(1),
      intensity: P(1),
      scale: P(1),
      direction: P(0, { label: 'Direção do fluxo' }),
      amplitude: P(1, { label: 'Ondulação' }),
      colorA: P('#04305e', { label: 'Cor profunda' }),
      colorB: P('#57d6ff', { label: 'Cor do brilho' }),
    },
  },
  {
    id: 'fire',
    name: 'Fogo',
    cat: 'natureza',
    desc: 'Chamas subindo da base, com faíscas.',
    params: {
      speed: P(1),
      intensity: P(1.1),
      scale: P(1),
      amplitude: P(0.9, { label: 'Altura das chamas' }),
      colorA: P('#d42a00', { label: 'Cor da base' }),
      colorB: P('#ffb000', { label: 'Cor do topo' }),
    },
  },
  {
    id: 'rain',
    name: 'Chuva',
    cat: 'natureza',
    desc: 'Gotas caindo em camadas com névoa e respingos.',
    params: {
      speed: P(1),
      intensity: P(1),
      density: P(1, { label: 'Densidade de gotas' }),
      scale: P(1, { label: 'Espessura' }),
      direction: P(-10, { label: 'Inclinação', min: -60, max: 60 }),
      colorA: P('#bfe6ff', { label: 'Cor das gotas' }),
      colorB: P('#1b3550', { label: 'Cor da névoa' }),
    },
  },
  {
    id: 'particles',
    name: 'Partículas luminosas',
    cat: 'luz',
    desc: 'Vagalumes / bokeh flutuando em profundidade.',
    params: {
      speed: P(0.8),
      intensity: P(1),
      density: P(1, { label: 'Densidade de partículas' }),
      scale: P(1, { label: 'Tamanho' }),
      colorA: P('#ffd36b'),
      colorB: P('#7af7ff'),
    },
  },
  {
    id: 'lines',
    name: 'Linhas geométricas',
    cat: 'geo',
    desc: 'Quadrados concêntricos, feixes diagonais e grade.',
    params: {
      speed: P(1),
      intensity: P(1),
      frequency: P(1),
      scale: P(1, { label: 'Espessura' }),
      colorA: P('#00e5ff'),
      colorB: P('#ff2bd6'),
    },
  },
  {
    id: 'portal',
    name: 'Portal espacial',
    cat: 'cosmos',
    desc: 'Vórtice dimensional com anel de energia.',
    params: {
      speed: P(1),
      intensity: P(1.1),
      scale: P(1),
      frequency: P(1, { label: 'Braços da espiral' }),
      amplitude: P(1, { label: 'Torção' }),
      colorA: P('#5b2bff'),
      colorB: P('#20f2ff'),
    },
  },
  {
    id: 'galaxy',
    name: 'Galáxia',
    cat: 'cosmos',
    desc: 'Galáxia espiral, nebulosa e campo de estrelas.',
    params: {
      speed: P(0.6),
      intensity: P(1),
      scale: P(1),
      density: P(1, { label: 'Estrelas' }),
      colorA: P('#4d7dff', { label: 'Braços' }),
      colorB: P('#ffcf8a', { label: 'Núcleo' }),
    },
  },
  {
    id: 'neon',
    name: 'Neon / contorno',
    cat: 'luz',
    desc: 'Contorno luminoso animado nas bordas — ideal para destacar móveis.',
    params: {
      speed: P(1),
      intensity: P(1.2),
      scale: P(1, { label: 'Espessura' }),
      frequency: P(1, { label: 'Pulsos' }),
      colorA: P('#ff2bd6'),
      colorB: P('#00e5ff'),
    },
  },
  {
    id: 'matrix',
    name: 'Matrix digital',
    cat: 'geo',
    desc: 'Chuva de caracteres digitais.',
    params: {
      speed: P(1),
      intensity: P(1),
      density: P(1, { label: 'Colunas ativas' }),
      scale: P(1, { label: 'Tamanho do caractere' }),
      colorA: P('#22ff66'),
      colorB: P('#002b0f', { label: 'Fundo' }),
    },
  },
  {
    id: 'lava',
    name: 'Lava',
    cat: 'natureza',
    desc: 'Lava derretida com crosta escura em movimento.',
    params: {
      speed: P(1),
      intensity: P(1),
      scale: P(1),
      colorA: P('#ff5a00', { label: 'Cor quente' }),
      colorB: P('#250400', { label: 'Crosta' }),
    },
  },
  {
    id: 'depth3d',
    name: 'Ilusão 3D (túnel)',
    cat: 'geo',
    desc: 'Túnel em perspectiva que "afunda" a superfície.',
    params: {
      speed: P(1),
      intensity: P(1),
      scale: P(1, { label: 'Espaçamento' }),
      frequency: P(1, { label: 'Anéis' }),
      amplitude: P(1, { label: 'Profundidade' }),
      colorA: P('#00e5ff'),
      colorB: P('#ff2bd6'),
    },
  },
  {
    id: 'waves',
    name: 'Ondas coloridas',
    cat: 'luz',
    desc: 'Ondas luminosas multicoloridas.',
    params: {
      speed: P(1),
      intensity: P(1),
      frequency: P(1),
      amplitude: P(1),
      scale: P(1, { label: 'Espaçamento' }),
      direction: P(0),
      colorA: P('#ff2bd6'),
      colorB: P('#00e5ff'),
    },
  },
  {
    id: 'plasma',
    name: 'Plasma',
    cat: 'luz',
    desc: 'Plasma psicodélico clássico.',
    params: { speed: P(1), intensity: P(1), frequency: P(1), scale: P(1), colorA: P('#ff3d7f'), colorB: P('#3dffd0') },
  },
  {
    id: 'aurora',
    name: 'Aurora boreal',
    cat: 'cosmos',
    desc: 'Cortinas de luz dançando no céu.',
    params: { speed: P(0.7), intensity: P(1), scale: P(1), amplitude: P(1), colorA: P('#2bff9c'), colorB: P('#a04dff') },
  },
  {
    id: 'starfield',
    name: 'Viagem estelar',
    cat: 'cosmos',
    desc: 'Estrelas vindo em sua direção (warp).',
    params: { speed: P(1), intensity: P(1), density: P(1), scale: P(1), colorA: P('#ffffff'), colorB: P('#7ab8ff') },
  },
  {
    id: 'kaleido',
    name: 'Caleidoscópio',
    cat: 'geo',
    desc: 'Simetria radial colorida.',
    params: { speed: P(1), intensity: P(1), frequency: P(1, { label: 'Segmentos' }), scale: P(1), colorA: P('#ffb000'), colorB: P('#7a2bff') },
  },
  {
    id: 'hexgrid',
    name: 'Colmeia hexagonal',
    cat: 'geo',
    desc: 'Grade hexagonal com ondas de luz.',
    params: { speed: P(1), intensity: P(1), frequency: P(1), scale: P(1), colorA: P('#00e5ff'), colorB: P('#ffd36b') },
  },
  {
    id: 'gradient',
    name: 'Gradiente animado',
    cat: 'luz',
    desc: 'Transição suave entre duas cores — ótima luz ambiente.',
    params: { speed: P(0.6), intensity: P(1), frequency: P(0.6), direction: P(0), colorA: P('#ff2bd6'), colorB: P('#1b3cff') },
  },
  {
    id: 'pulse',
    name: 'Pulso / estrobo',
    cat: 'luz',
    desc: 'Pulsação rítmica (reage ao áudio).',
    params: { speed: P(1), intensity: P(1), frequency: P(1, { label: 'Batidas' }), amplitude: P(1, { label: 'Dureza' }), colorA: P('#ffffff'), colorB: P('#ff2bd6') },
  },
  {
    id: 'snow',
    name: 'Neve caindo',
    cat: 'natal',
    desc: 'Flocos de neve em camadas, com vento. Com o fundo em 0 vira uma camada transparente por cima de outras superfícies.',
    params: {
      speed: P(1),
      intensity: P(1),
      density: P(1, { label: 'Quantidade de flocos' }),
      scale: P(1, { label: 'Tamanho dos flocos' }),
      direction: P(12, { label: 'Vento', min: -60, max: 60 }),
      amplitude: P(1, { label: 'Fundo (opacidade)', min: 0, max: 1 }),
      colorA: P('#ffffff', { label: 'Cor dos flocos' }),
      colorB: P('#0b1f4d', { label: 'Cor do fundo' }),
    },
  },
  {
    id: 'xmaslights',
    name: 'Pisca-pisca',
    cat: 'natal',
    desc: 'Cordões de lâmpadas coloridas que piscam em sequência, com fundo transparente.',
    params: {
      speed: P(1),
      intensity: P(1.1),
      frequency: P(1, { label: 'Cordões', min: 0.5, max: 3 }),
      density: P(1, { label: 'Lâmpadas por cordão' }),
      scale: P(1, { label: 'Tamanho das lâmpadas', max: 2 }),
      amplitude: P(1, { label: 'Curvatura do fio', max: 2 }),
      colorA: P('#16331b', { label: 'Cor do fio' }),
    },
  },
  {
    id: 'candycane',
    name: 'Listras de bengala',
    cat: 'natal',
    desc: 'Listras diagonais de bengala doce deslizando — ótimo em colunas, batentes e portas.',
    params: {
      speed: P(0.6),
      intensity: P(1),
      scale: P(1, { label: 'Largura das listras' }),
      direction: P(35, { label: 'Inclinação' }),
      amplitude: P(1, { label: 'Filete fino', max: 2 }),
      colorA: P('#d3122f', { label: 'Cor da listra' }),
      colorB: P('#fbfbfb', { label: 'Cor de fundo' }),
    },
  },
  {
    id: 'giftwrap',
    name: 'Papel de presente',
    cat: 'natal',
    desc: 'Embrulho estampado com fita, laço e brilhos — transforma uma porta ou armário em presente.',
    params: {
      speed: P(1),
      intensity: P(1),
      scale: P(1, { label: 'Tamanho da estampa' }),
      amplitude: P(1, { label: 'Fita e laço', max: 2 }),
      density: P(1, { label: 'Brilhos', min: 0, max: 3 }),
      colorA: P('#b80f25', { label: 'Cor do papel' }),
      colorB: P('#f2c14e', { label: 'Cor da fita' }),
    },
  },
  {
    id: 'xmasnight',
    name: 'Noite de Natal',
    cat: 'natal',
    desc: 'Céu estrelado com a estrela-guia, estrelas cadentes e colinas de neve.',
    params: {
      speed: P(1),
      intensity: P(1),
      density: P(1, { label: 'Estrelas' }),
      amplitude: P(1, { label: 'Colinas de neve', max: 2 }),
      colorA: P('#fff1b0', { label: 'Estrela-guia' }),
      colorB: P('#13285e', { label: 'Céu' }),
    },
  },
  {
    id: 'snowflakes',
    name: 'Flocos gigantes',
    cat: 'natal',
    desc: 'Cristais de neve grandes girando devagar. Fundo ajustável (0 = transparente).',
    params: {
      speed: P(0.8),
      intensity: P(1),
      density: P(1, { label: 'Quantidade' }),
      scale: P(1, { label: 'Tamanho' }),
      amplitude: P(1, { label: 'Fundo (opacidade)', min: 0, max: 1 }),
      colorA: P('#cfeaff', { label: 'Cor dos flocos' }),
      colorB: P('#0b2350', { label: 'Cor do fundo' }),
    },
  },
  {
    id: 'xmastree',
    name: 'Árvore de luzes',
    cat: 'natal',
    desc: 'Árvore de Natal feita de luzes em espiral com estrela no topo (fundo transparente).',
    params: {
      speed: P(1),
      intensity: P(1.1),
      frequency: P(1, { label: 'Voltas da espiral', min: 0.4, max: 2.5 }),
      density: P(1, { label: 'Lâmpadas' }),
      amplitude: P(1, { label: 'Preenchimento verde', max: 2 }),
      colorA: P('#ffe9a6', { label: 'Cor das luzes' }),
      colorB: P('#0f6b33', { label: 'Cor da árvore' }),
    },
  },
  {
    id: 'glitter',
    name: 'Brilho dourado',
    cat: 'natal',
    desc: 'Cintilações que acendem e apagam — camada transparente para dar brilho a letreiros e enfeites.',
    params: {
      speed: P(1),
      intensity: P(1),
      density: P(1, { label: 'Quantidade' }),
      scale: P(1, { label: 'Tamanho' }),
      colorA: P('#ffd36b', { label: 'Cor 1' }),
      colorB: P('#ffffff', { label: 'Cor 2' }),
    },
  },
  {
    id: 'grid',
    name: 'Grade de calibração',
    cat: 'teste',
    desc: 'Grade, diagonais e marcadores de canto (vermelho = superior esquerdo).',
    params: { intensity: P(1, { label: 'Brilho' }), frequency: P(1, { label: 'Divisões', min: 0.2, max: 4 }), colorA: P('#00e5ff', { label: 'Linhas' }), colorB: P('#ffd36b', { label: 'Círculo' }) },
  },
  {
    id: 'checker',
    name: 'Xadrez',
    cat: 'teste',
    desc: 'Padrão quadriculado para checar a perspectiva.',
    params: { intensity: P(1, { label: 'Brilho' }), frequency: P(1, { label: 'Casas' }), colorA: P('#ffffff'), colorB: P('#000000') },
  },
  {
    id: 'bars',
    name: 'Barras de cor',
    cat: 'teste',
    desc: 'Barras de cor e rampa de cinza.',
    params: { intensity: P(1, { label: 'Brilho' }) },
  },
  {
    id: 'solid',
    name: 'Cor sólida',
    cat: 'teste',
    desc: 'Preenche a superfície com uma cor (branco = luz pura).',
    params: { intensity: P(1, { label: 'Brilho' }), colorA: P('#ffffff', { label: 'Cor' }) },
  },
];

export const EFFECT_MAP = Object.fromEntries(EFFECTS.map((e) => [e.id, e]));

export function effectParams(effectId) {
  const fx = EFFECT_MAP[effectId];
  if (!fx) return [];
  return Object.entries(fx.params).map(([key, cfg]) => ({ key, ...PARAM_DEFS[key], ...cfg }));
}

export function defaultParams(effectId) {
  const fx = EFFECT_MAP[effectId];
  if (!fx) return {};
  const out = {};
  for (const [k, cfg] of Object.entries(fx.params)) out[k] = cfg.d;
  return out;
}

export function effectSource(effectId) {
  return EFFECT_GLSL[effectId] || EFFECT_GLSL.solid;
}

export const ANIMATABLE = [
  { key: 'opacity', label: 'Opacidade', min: 0, max: 1, step: 0.01 },
  { key: 'x', label: 'Deslocamento X', min: -1, max: 1, step: 0.001, px: 'w' },
  { key: 'y', label: 'Deslocamento Y', min: -1, max: 1, step: 0.001, px: 'h' },
  { key: 'scale', label: 'Escala', min: 0.05, max: 4, step: 0.01 },
  { key: 'rotation', label: 'Rotação', min: -360, max: 360, step: 0.5, unit: '°' },
  { key: 'intensity', label: 'Intensidade do efeito', min: 0, max: 3, step: 0.01 },
];
