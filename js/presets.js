// Ready-made looks. If a surface is selected the preset restyles it;
// otherwise it creates surfaces positioned for a typical room.

import { createSurface, effectContent, mediaContent, setKey } from './state.js';
import { rectPoints, trianglePoints, subQuad } from './mapping.js';
import { XMAS_ITEMS } from './christmas-catalog.js';

export const PRESETS = [
  {
    id: 'parede',
    name: 'Parede animada',
    icon: 'room',
    desc: 'Ondas coloridas suaves com bordas esfumadas — para uma parede inteira.',
    build: () => {
      const s = createSurface('quad', rectPoints(0.06, 0.06, 0.88, 0.88), { name: 'Parede animada', content: effectContent('waves', { speed: 0.7 }) });
      s.feather = 40;
      return [s];
    },
    style: (s) => {
      s.content = effectContent('waves', { speed: 0.7 });
      s.feather = Math.max(s.feather, 30);
    },
  },
  {
    id: 'porta',
    name: 'Porta dimensional',
    icon: 'link',
    desc: 'Portal espacial girando dentro de uma porta.',
    build: () => [createSurface('quad', rectPoints(0.4, 0.1, 0.2, 0.82), { name: 'Porta dimensional', content: effectContent('portal') })],
    style: (s) => {
      s.content = effectContent('portal');
    },
  },
  {
    id: 'armario',
    name: 'Armário iluminado',
    icon: 'cube',
    desc: 'Contorno neon pulsante que destaca o móvel.',
    build: () => [createSurface('quad', rectPoints(0.3, 0.25, 0.4, 0.55), { name: 'Armário iluminado', content: effectContent('neon') })],
    style: (s) => {
      s.content = effectContent('neon');
    },
  },
  {
    id: 'estante',
    name: 'Estante futurista',
    icon: 'grid',
    desc: 'Linhas geométricas e feixes de luz em uma estante.',
    build: () => [createSurface('quad', rectPoints(0.35, 0.12, 0.3, 0.78), { name: 'Estante futurista', content: effectContent('lines', { frequency: 1.4 }) })],
    style: (s) => {
      s.content = effectContent('lines', { frequency: 1.4 });
    },
  },
  {
    id: 'espacial',
    name: 'Ambiente espacial',
    icon: 'sparkles',
    desc: 'Galáxia cobrindo a parede inteira, com bordas suaves.',
    build: () => {
      const s = createSurface('quad', rectPoints(0, 0, 1, 1), { name: 'Ambiente espacial', content: effectContent('galaxy') });
      s.feather = 60;
      return [s];
    },
    style: (s) => {
      s.content = effectContent('galaxy');
    },
  },
  {
    id: 'geometrica',
    name: 'Projeção geométrica',
    icon: 'triangle',
    desc: 'Composição de triângulos e quadrados com túnel 3D, colmeia e linhas.',
    build: () => [
      createSurface('triangle', trianglePoints(0.08, 0.2, 0.26, 0.6), { name: 'Triângulo A', content: effectContent('hexgrid') }),
      createSurface('quad', rectPoints(0.38, 0.22, 0.24, 0.56), { name: 'Quadrado 3D', content: effectContent('depth3d') }),
      createSurface('triangle', trianglePoints(0.66, 0.2, 0.26, 0.6), { name: 'Triângulo B', content: effectContent('lines') }),
    ],
    multi: true,
  },
];

// Christmas presets. `needs` lists library items (js/christmas-catalog.js)
// that are downloaded/imported before build()/style() run; `m` maps each
// item id to the media id in the project.
const fireOpening = () => XMAS_ITEMS.find((i) => i.id === 'lareira')?.fireOpening || [0.208, 0.593, 0.792, 0.893];

/** Fire surface covering the opening of the fireplace image on `quad`. */
export function fireInFireplace(quad, name = 'Fogo da lareira') {
  const [u0, v0, u1, v1] = fireOpening();
  const pad = (u1 - u0) * 0.08;
  const fire = createSurface('quad', subQuad(quad, u0 + pad, v0 + (v1 - v0) * 0.08, u1 - pad, v1 - (v1 - v0) * 0.04), {
    name,
    content: effectContent('fire', { amplitude: 0.85, intensity: 1.15, scale: 0.8 }),
  });
  fire.blend = 'screen';
  return fire;
}

function quadOf(s) {
  return s.points.length === 4 && ['quad', 'rect'].includes(s.type) ? s.points : null;
}

PRESETS.push(
  {
    id: 'natal-arvore',
    group: 'natal',
    name: 'Árvore de luzes',
    icon: 'tree',
    desc: 'Árvore de Natal feita de luzes em espiral, com estrela no topo — fundo transparente.',
    build: () => [createSurface('quad', rectPoints(0.33, 0.06, 0.34, 0.88), { name: 'Árvore de luzes', content: effectContent('xmastree') })],
    style: (s) => {
      s.content = effectContent('xmastree');
    },
  },
  {
    id: 'natal-porta',
    group: 'natal',
    name: 'Porta-presente',
    icon: 'gift',
    desc: 'Embrulha a porta (ou um armário) como um presente, com fita, laço e brilhos.',
    build: () => [createSurface('quad', rectPoints(0.4, 0.1, 0.2, 0.82), { name: 'Porta-presente', content: effectContent('giftwrap') })],
    style: (s) => {
      s.content = effectContent('giftwrap');
    },
  },
  {
    id: 'natal-lareira',
    group: 'natal',
    name: 'Lareira virtual',
    icon: 'flame',
    needs: ['lareira'],
    desc: 'Lareira com meias e guirlanda, e fogo animado na abertura. Com uma superfície selecionada, ela vira a lareira.',
    build: (m) => {
      const img = createSurface('quad', rectPoints(0.36, 0.08, 0.28, 0.84), { name: 'Lareira', content: mediaContent(m.lareira) });
      img.transform.fit = 'stretch';
      return [img, fireInFireplace(img.points)];
    },
    style: (s, m, store) => {
      s.content = mediaContent(m.lareira);
      s.transform.fit = 'stretch';
      const q = quadOf(s);
      if (!q) return [];
      const fire = fireInFireplace(q);
      const i = store.project.surfaces.indexOf(s);
      store.project.surfaces.splice(i + 1, 0, fire);
      return [fire];
    },
  },
  {
    id: 'natal-neve',
    group: 'natal',
    name: 'Janela com neve',
    icon: 'snow',
    desc: 'Neve caindo sobre um céu noturno, com bordas suaves — para janelas e quadros.',
    build: () => {
      const s = createSurface('quad', rectPoints(0.3, 0.15, 0.4, 0.6), { name: 'Janela com neve', content: effectContent('snow') });
      s.feather = 24;
      return [s];
    },
    style: (s) => {
      s.content = effectContent('snow');
    },
  },
  {
    id: 'natal-parede',
    group: 'natal',
    name: 'Parede "Feliz Natal"',
    icon: 'star',
    needs: ['feliz-natal'],
    desc: 'Noite de Natal na parede inteira, neve caindo por cima e o letreiro "Feliz Natal" com brilhos.',
    multi: true,
    build: (m) => {
      const sky = createSurface('quad', rectPoints(0, 0, 1, 1), { name: 'Céu de Natal', content: effectContent('xmasnight') });
      sky.feather = 50;
      const snow = createSurface('quad', rectPoints(0, 0, 1, 1), { name: 'Neve (camada)', content: effectContent('snow', { amplitude: 0, density: 0.7 }) });
      const sign = createSurface('quad', rectPoints(0.2, 0.3, 0.6, 0.3), { name: 'Letreiro Feliz Natal', content: mediaContent(m['feliz-natal']) });
      sign.transform.fit = 'contain';
      setKey(sign, 'opacity', 0, 0);
      setKey(sign, 'opacity', 2.5, 1);
      const shine = createSurface('quad', rectPoints(0.2, 0.3, 0.6, 0.3), { name: 'Brilhos', content: effectContent('glitter', { density: 0.8 }) });
      shine.blend = 'add';
      return [sky, snow, sign, shine];
    },
  },
  {
    id: 'natal-pisca',
    group: 'natal',
    name: 'Pisca-pisca no teto',
    icon: 'sparkles',
    desc: 'Um cordão de lâmpadas coloridas ao longo do topo da parede.',
    build: () => [createSurface('quad', rectPoints(0.02, 0.02, 0.96, 0.2), { name: 'Pisca-pisca', content: effectContent('xmaslights', { frequency: 0.5, amplitude: 0.7 }) })],
    style: (s) => {
      s.content = effectContent('xmaslights');
    },
  },
  {
    id: 'natal-bengala',
    group: 'natal',
    name: 'Coluna de bengala',
    icon: 'candy',
    desc: 'Listras de bengala doce deslizando — para colunas, batentes e pés de mesa.',
    build: () => [createSurface('quad', rectPoints(0.46, 0.05, 0.08, 0.9), { name: 'Coluna de bengala', content: effectContent('candycane') })],
    style: (s) => {
      s.content = effectContent('candycane');
    },
  },
);

export const PRESET_MAP = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
