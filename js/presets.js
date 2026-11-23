// Ready-made looks. If a surface is selected the preset restyles it;
// otherwise it creates surfaces positioned for a typical room.

import { createSurface, effectContent } from './state.js';
import { rectPoints, trianglePoints } from './mapping.js';

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

export const PRESET_MAP = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
