// Christmas content library: ready-to-use original artwork (WebP), animated
// GPU effects, presets, public-domain songs and a complete "Natal na sala"
// template mapped on the demo room. Library items are imported into the
// normal media store (IndexedDB) the first time they are used, so projects,
// export, projector sync and offline use work exactly like user media.

import { el, formatBytes, formatTime, uid } from './utils.js';
import { icon, btn, toast } from './ui.js';
import { XMAS_ITEMS, XMAS_CATEGORIES } from './christmas-catalog.js';
import { EFFECTS } from './effects.js';
import { PRESETS, fireInFireplace } from './presets.js';
import { createProject, createSurface, effectContent, mediaContent, setKey } from './state.js';
import { OBJ, P, cabinetFront, shelfFront, tableTop, silhouette } from './room.js';
import { subQuad } from './mapping.js';

export { XMAS_ITEMS, XMAS_CATEGORIES };
export const XMAS_MAP = Object.fromEntries(XMAS_ITEMS.map((i) => [i.id, i]));
export const libraryKey = (id) => `natal:${id}`;
export const itemFromSource = (source) => (typeof source === 'string' && source.startsWith('natal:') ? XMAS_MAP[source.slice(6)] || null : null);

const EXT_MIME = { webp: 'image/webp', mp3: 'audio/mpeg', png: 'image/png', jpg: 'image/jpeg' };

/** Downloads a library file (same origin, relative path — works under any GitHub Pages sub-folder). */
export async function fetchLibraryFile(item) {
  const res = await fetch(item.file, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Não foi possível baixar "${item.name}" (HTTP ${res.status}).`);
  const blob = await res.blob();
  const ext = item.file.split('.').pop().toLowerCase();
  const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : EXT_MIME[ext] || '';
  return new File([blob], `${item.name}.${ext}`, { type });
}

/** Rectangle (normalized output coords) that keeps the artwork's aspect ratio. */
export function itemRect(item, project, n = 0) {
  const W = project.output.width;
  const H = project.output.height;
  const aspect = (item.w || 1) / (item.h || 1);
  let h = Math.min(0.92, item.size || 0.4);
  let w = (h * H * aspect) / W;
  if (w > 0.96) {
    h *= 0.96 / w;
    w = 0.96;
  }
  if (item.size >= 1) {
    w = Math.min(1, w);
    h = Math.min(1, h);
  }
  const off = item.size >= 1 ? 0 : ((n % 6) - 2.5) * 0.025;
  const x = Math.max(0, Math.min(1 - w, 0.5 - w / 2 + off));
  const y = Math.max(0, Math.min(1 - h, 0.5 - h / 2 + off * 0.6));
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** Content placement defaults for an artwork applied to a surface. */
export function styleForItem(surface, item) {
  surface.transform.fit = item.tile ? 'cover' : item.opaque ? 'cover' : 'contain';
  surface.transform.tile = !!item.tile;
  surface.transform.scale = item.tile ? 0.5 : 1;
}

// ---------------------------------------------------------------------------
// Template: the demo living room decorated for Christmas
// ---------------------------------------------------------------------------

export const XMAS_TEMPLATE_NEEDS = ['lareira', 'feliz-natal', 'xadrez', 'jingle-bells'];

const clip = (start, end, effect, params = {}, fadeIn = 1, fadeOut = 1) => ({ id: uid('c'), start, end, fadeIn, fadeOut, content: effectContent(effect, params) });

/** Wall sub-rectangle in meters (x: -2.6..2.6, y: 0..2.7 from the floor). */
function wallRect(x0, x1, y0, y1) {
  const W2 = 2.6;
  const HGT = 2.7;
  return subQuad(P(OBJ.wall), (x0 + W2) / (2 * W2), (HGT - y1) / HGT, (x1 + W2) / (2 * W2), (HGT - y0) / HGT);
}

export function buildChristmasRoom(m, duration = 68) {
  const p = createProject({ name: 'Natal na sala', output: { width: 1920, height: 1080 } });
  p.timeline = { duration, loop: true };
  p.background = { mediaId: 'builtin:room', opacity: 0.85, visible: true };
  const half = duration / 2;

  const wall = createSurface('quad', P(OBJ.wall), { name: 'Parede — céu de Natal' });
  wall.clips = [clip(0, half + 0.6, 'xmasnight', { amplitude: 0.6, density: 1.1 }, 1.5, 1.2), clip(half, duration, 'snowflakes', { density: 0.8, scale: 1.2 }, 1.2, 1.5)];

  const snow = createSurface('quad', P(OBJ.wall), { name: 'Neve caindo (camada)', content: effectContent('snow', { amplitude: 0, density: 0.75 }) });

  const lights = createSurface('quad', wallRect(-2.6, 2.6, 2.5, 2.7), { name: 'Pisca-pisca', content: effectContent('xmaslights', { frequency: 0.5, amplitude: 0.6, scale: 1.25, density: 1.2 }) });

  const sign = createSurface('quad', wallRect(-1.2, 0.9, 2.1, 2.52), { name: 'Letreiro Feliz Natal', content: mediaContent(m['feliz-natal']) });
  sign.transform.fit = 'contain';
  setKey(sign, 'opacity', 0, 0);
  setKey(sign, 'opacity', 3, 1);
  const shine = createSurface('quad', wallRect(-1.2, 0.9, 2.1, 2.52), { name: 'Brilhos do letreiro', content: effectContent('glitter', { density: 0.9 }) });
  shine.blend = 'add';

  const floor = createSurface('quad', P(OBJ.floor), { name: 'Piso — flocos', content: effectContent('snowflakes', { amplitude: 0.45, density: 0.7, colorB: '#071634' }) });
  floor.feather = 40;

  const maskCab = createSurface('polygon', silhouette('cabinet'), { role: 'mask', name: 'Máscara do armário' });
  const maskShelf = createSurface('polygon', silhouette('shelf'), { role: 'mask', name: 'Máscara da estante' });

  const door = createSurface('quad', P(OBJ.door), { name: 'Porta-presente' });
  door.clips = [clip(0, half + 0.6, 'giftwrap', {}, 1, 1), clip(half, duration, 'giftwrap', { colorA: '#0f6b3a', colorB: '#e3263b' }, 1, 1)];

  const cab = createSurface('quad', cabinetFront(), { name: 'Armário — lareira', content: mediaContent(m.lareira) });
  cab.transform.fit = 'stretch';
  const fire = fireInFireplace(cab.points, 'Fogo da lareira');

  const shelf = createSurface('quad', shelfFront(), { name: 'Estante — árvore de luzes', content: effectContent('xmastree', { amplitude: 0.9 }) });

  const maskTable = createSurface('polygon', silhouette('table'), { role: 'mask', name: 'Máscara da mesa' });
  const table = createSurface('quad', tableTop(), { name: 'Mesa — toalha xadrez', content: mediaContent(m.xadrez) });
  table.transform.tile = true;
  table.transform.scale = 0.34;

  p.surfaces = [wall, snow, lights, sign, shine, floor, maskCab, maskShelf, door, cab, fire, shelf, maskTable, table];
  if (m['jingle-bells']) p.audio = { mediaId: m['jingle-bells'], volume: 0.8 };
  return p;
}

// ---------------------------------------------------------------------------
// Panel ("Natal" tab)
// ---------------------------------------------------------------------------

export class ChristmasPanel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.cat = 'enfeites';
    this.preview = null;
    this.previewBtn = null;

    const hero = el(
      'div.xmas-hero',
      el('div.xmas-hero-text', el('h3', icon('tree'), 'Natal'), el('p', 'Arte original, efeitos animados, músicas e um modelo completo para decorar parede, porta e móveis.')),
      btn('room', 'Abrir modelo: Natal na sala', () => app.openChristmasTemplate(), { cls: 'primary wide', title: 'Sala de demonstração decorada: lareira, porta-presente, árvore de luzes, pisca-pisca, neve e trilha sonora' }),
    );

    const presetRow = el('div.preset-row');
    for (const p of PRESETS.filter((x) => x.group === 'natal')) {
      presetRow.appendChild(el('button.preset', { type: 'button', title: p.desc, onclick: () => app.applyPreset(p.id) }, icon(p.icon), el('span', p.name)));
    }

    const fxRow = el('div.xmas-fx');
    for (const fx of EFFECTS.filter((e) => e.cat === 'natal')) {
      const sw = el('span.xmas-swatch', { style: { background: `linear-gradient(135deg, ${fx.params.colorA?.d || '#fff'}, ${fx.params.colorB?.d || '#0b1f4d'})` } });
      fxRow.appendChild(el('button.xmas-fx-btn', { type: 'button', title: fx.desc, dataset: { fx: fx.id }, onclick: () => app.applyEffect(fx.id) }, sw, el('span', fx.name)));
    }

    this.chips = el('div.chips', { role: 'tablist' });
    for (const c of XMAS_CATEGORIES) {
      const n = XMAS_ITEMS.filter((i) => i.cat === c.id).length;
      this.chips.appendChild(el('button.chip', { type: 'button', role: 'tab', dataset: { cat: c.id }, onclick: () => this.setCat(c.id) }, `${c.name} `, el('small', String(n))));
    }
    this.grid = el('div.xmas-grid');
    this.hint = el('p.muted.small.xmas-hint', 'Toque numa imagem para adicioná-la como nova superfície. Use ✓ para aplicá-la na superfície selecionada.');
    root.append(
      hero,
      el('h3.panel-sub', 'Montagens prontas'),
      presetRow,
      el('h3.panel-sub', 'Efeitos animados de Natal', el('small.muted', ' — aplicam na superfície selecionada (ou criam uma)')),
      fxRow,
      el('h3.panel-sub', 'Biblioteca de Natal', el('small.muted', ` — ${XMAS_ITEMS.length} itens`)),
      this.chips,
      this.hint,
      this.grid,
      el(
        'p.muted.small.xmas-credit',
        'Imagens: arte original do LuzMap (licença MIT, livre para uso). Músicas: melodias de domínio público (Jingle Bells, Noite Feliz, We Wish You a Merry Christmas) com arranjos sintetizados pelo LuzMap. Os arquivos são baixados só quando usados e ficam salvos neste dispositivo.',
      ),
    );
    this.render();
    this.setCat(this.cat);
  }

  setCat(cat) {
    this.cat = cat;
    [...this.chips.children].forEach((c) => c.classList.toggle('on', c.dataset.cat === cat));
    [...this.grid.children].forEach((card) => (card.hidden = card.dataset.cat !== cat));
    this.hint.textContent =
      cat === 'musicas'
        ? 'Toque em ▶ para ouvir uma prévia e em "Usar" para tocar a música junto com a timeline (também alimenta o áudio reativo).'
        : cat === 'texturas'
          ? 'Texturas se repetem sem emenda: ótimas para toalhas, portas e paredes. Toque para criar uma superfície ou use ✓ na selecionada.'
          : 'Toque numa imagem para adicioná-la como nova superfície. Use ✓ para aplicá-la na superfície selecionada.';
  }

  render() {
    this.grid.replaceChildren();
    for (const item of XMAS_ITEMS) {
      const card = item.kind === 'audio' ? this._musicCard(item) : this._imageCard(item);
      card.dataset.cat = item.cat;
      card.dataset.item = item.id;
      this.grid.appendChild(card);
    }
  }

  _busy(card, on) {
    card.classList.toggle('busy', on);
    card.querySelectorAll('button').forEach((b) => (b.disabled = on));
  }

  _imageCard(item) {
    const card = el(`div.xmas-card${item.opaque ? '.opaque' : ''}`);
    const run = async (target) => {
      this._busy(card, true);
      try {
        await this.app.addLibraryItem(item.id, { target });
      } finally {
        this._busy(card, false);
      }
    };
    card.append(
      el(
        'button.xmas-thumb',
        { type: 'button', title: `Adicionar "${item.name}" como nova superfície`, 'aria-label': `Adicionar ${item.name}`, onclick: () => run('new') },
        el('img', { src: item.thumb, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }),
      ),
      el(
        'div.xmas-info',
        el('span.xmas-name', item.name),
        el(
          'div.xmas-actions',
          el('small.muted', `${item.w}×${item.h}`),
          btn('check', '', () => run('selected'), { iconOnly: true, title: 'Aplicar à superfície selecionada', cls: 'small' }),
        ),
      ),
    );
    return card;
  }

  _musicCard(item) {
    const card = el('div.xmas-card.music');
    const play = btn('play', 'Ouvir', () => this.togglePreview(item, play), { cls: 'small', title: 'Ouvir prévia' });
    const use = btn('music', 'Usar', async () => {
      this.stopPreview();
      this._busy(card, true);
      try {
        await this.app.addLibraryItem(item.id);
      } finally {
        this._busy(card, false);
      }
    }, { cls: 'small primary', title: 'Usar como trilha sonora do projeto' });
    card.append(
      el('div.xmas-music-ic', icon('music')),
      el('div.xmas-info', el('span.xmas-name', item.name), el('small.muted', `${formatTime(item.duration, false)} · ${formatBytes(item.bytes)}`), el('small.muted.xmas-credit-line', item.credit || '')),
      el('div.xmas-actions', play, use),
    );
    return card;
  }

  togglePreview(item, button) {
    if (this.preview && this.preview.dataset.item === item.id) {
      this.stopPreview();
      return;
    }
    this.stopPreview();
    const a = new Audio(item.file);
    a.dataset.item = item.id;
    a.volume = 0.8;
    a.addEventListener('ended', () => this.stopPreview());
    a.play().catch(() => toast('Não foi possível tocar a prévia neste navegador.', { type: 'warn' }));
    this.preview = a;
    this.previewBtn = button;
    button.replaceChildren(icon('stop'), el('span.lbl', 'Parar'));
  }

  stopPreview() {
    if (this.preview) {
      this.preview.pause();
      this.preview.removeAttribute('src');
      this.preview.load();
    }
    if (this.previewBtn) this.previewBtn.replaceChildren(icon('play'), el('span.lbl', 'Ouvir'));
    this.preview = null;
    this.previewBtn = null;
  }
}
