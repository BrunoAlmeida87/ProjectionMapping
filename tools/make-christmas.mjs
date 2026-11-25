// Builds the Christmas content library: rasterizes the SVG artwork from
// tools/christmas-art.mjs to WebP (full size + thumbnail), measures the music
// made by tools/make-christmas-music.py and writes js/christmas-catalog.js.
// Usage: node tools/make-christmas.mjs [--only id,id] [--sheet]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from './pw.mjs';
import { ART } from './christmas-art.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'natal');
const THUMBS = path.join(OUT, 'thumbs');
const MUSIC = path.join(OUT, 'musicas');
fs.mkdirSync(THUMBS, { recursive: true });
fs.mkdirSync(MUSIC, { recursive: true });

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const sheet = args.includes('--sheet');

export const MUSIC_LIST = [
  { id: 'jingle-bells', name: 'Jingle Bells (sinos e guizos)', file: 'jingle-bells.mp3', credit: 'J. L. Pierpont, 1857 — domínio público. Arranjo sintetizado pelo LuzMap.' },
  { id: 'noite-feliz', name: 'Noite Feliz (caixinha de música)', file: 'noite-feliz.mp3', credit: 'F. X. Gruber, 1818 — domínio público. Arranjo sintetizado pelo LuzMap.' },
  { id: 'we-wish', name: 'We Wish You a Merry Christmas', file: 'we-wish.mp3', credit: 'Canção tradicional inglesa — domínio público. Arranjo sintetizado pelo LuzMap.' },
];

const browser = await chromium.launch();
const page = await browser.newPage();

async function raster(svgText, maxThumb = 240) {
  return page.evaluate(
    async ({ svgText, maxThumb }) => {
      const blob = new Blob([svgText], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      await img.decode();
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const full = c.toDataURL('image/webp', 0.9);
      const k = Math.min(1, maxThumb / Math.max(w, h));
      const t = document.createElement('canvas');
      t.width = Math.round(w * k);
      t.height = Math.round(h * k);
      const tx = t.getContext('2d');
      tx.imageSmoothingQuality = 'high';
      tx.drawImage(c, 0, 0, t.width, t.height);
      const thumb = t.toDataURL('image/webp', 0.85);
      URL.revokeObjectURL(url);
      return { w, h, full, thumb };
    },
    { svgText, maxThumb },
  );
}

const save = (file, dataUrl) => {
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(file, buf);
  return buf.length;
};

const items = [];
for (const a of ART) {
  const file = path.join(OUT, `${a.id}.webp`);
  const thumb = path.join(THUMBS, `${a.id}.webp`);
  let w;
  let h;
  if (!only || only.includes(a.id)) {
    const r = await raster(a.draw());
    w = r.w;
    h = r.h;
    const bytes = save(file, r.full);
    save(thumb, r.thumb);
    console.log(`${a.id.padEnd(18)} ${w}x${h}  ${(bytes / 1024).toFixed(0)} KB`);
  } else {
    const r = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return { w: img.naturalWidth, h: img.naturalHeight };
    }, `data:image/webp;base64,${fs.readFileSync(file).toString('base64')}`);
    w = r.w;
    h = r.h;
  }
  const entry = { id: a.id, name: a.name, cat: a.cat, kind: 'image', file: `assets/natal/${a.id}.webp`, thumb: `assets/natal/thumbs/${a.id}.webp`, w, h, size: a.size, bytes: fs.statSync(file).size };
  if (a.opaque) entry.opaque = true;
  if (a.tile) entry.tile = true;
  if (a.fireOpening) entry.fireOpening = a.fireOpening.map((v) => Math.round(v * 1000) / 1000);
  items.push(entry);
}

for (const m of MUSIC_LIST) {
  const file = path.join(MUSIC, m.file);
  if (!fs.existsSync(file)) {
    console.warn('música ausente (rode tools/make-christmas-music.py):', m.file);
    continue;
  }
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
  items.push({ id: m.id, name: m.name, cat: 'musicas', kind: 'audio', file: `assets/natal/musicas/${m.file}`, duration: Math.round(dur * 10) / 10, bytes: fs.statSync(file).size, credit: m.credit });
}

if (sheet) {
  // Contact sheet for visual review (not shipped).
  const cells = items
    .filter((i) => i.kind === 'image')
    .map((i) => `<figure><img src="data:image/webp;base64,${fs.readFileSync(path.join(ROOT, i.file)).toString('base64')}"><figcaption>${i.id}</figcaption></figure>`)
    .join('');
  const html = `<html><body style="margin:0;background:#1b2030;font:14px sans-serif;color:#ddd;display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:8px">
    <style>figure{margin:0;background:repeating-conic-gradient(#2a3042 0 25%,#232838 0 50%) 0 0/20px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px}img{max-width:100%;max-height:270px}</style>${cells}</body></html>`;
  await page.setViewportSize({ width: 1800, height: 1400 });
  await page.setContent(html);
  await page.waitForTimeout(500);
  const dir = process.env.SHEET_DIR || OUT;
  await page.screenshot({ path: path.join(dir, 'contact-sheet.png'), fullPage: true });
  console.log('contact sheet:', path.join(dir, 'contact-sheet.png'));
}

// App shortcut icon ("Natal" in the installed app's long-press menu).
{
  const tree = ART.find((a) => a.id === 'arvore').draw();
  const png = await page.evaluate(async (svgText) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b0d12';
    ctx.beginPath();
    ctx.roundRect(0, 0, 96, 96, 22);
    ctx.fill();
    const h = 80;
    const w = (img.naturalWidth / img.naturalHeight) * h;
    ctx.drawImage(img, (96 - w) / 2, 8, w, h);
    return c.toDataURL('image/png');
  }, tree);
  fs.writeFileSync(path.join(ROOT, 'assets', 'icons', 'shortcut-natal.png'), Buffer.from(png.split(',')[1], 'base64'));
}

await browser.close();

const CATS = [
  { id: 'enfeites', name: 'Enfeites' },
  { id: 'faixas', name: 'Faixas e molduras' },
  { id: 'letreiros', name: 'Letreiros' },
  { id: 'cenarios', name: 'Cenários' },
  { id: 'texturas', name: 'Texturas' },
  { id: 'musicas', name: 'Músicas' },
];
const js = `// GERADO por tools/make-christmas.mjs — não edite à mão.
// Biblioteca de conteúdo natalino: arte original do LuzMap (imagens WebP) e
// músicas de domínio público com arranjo sintetizado.
export const XMAS_CATEGORIES = ${JSON.stringify(CATS, null, 2)};

export const XMAS_ITEMS = ${JSON.stringify(items, null, 2)};
`;
fs.writeFileSync(path.join(ROOT, 'js', 'christmas-catalog.js'), js);
// Pre-cache the thumbnails in the service worker so the library browses offline.
const swPath = path.join(ROOT, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8');
const thumbs = items.filter((i) => i.thumb).map((i) => `  './${i.thumb}',`).join('\n');
fs.writeFileSync(swPath, sw.replace(/(\/\/ <natal-thumbs>[^\n]*\n)[\s\S]*?([ \t]*\/\/ <\/natal-thumbs>)/, `$1${thumbs}\n$2`));
const total = items.reduce((s, i) => s + i.bytes, 0);
console.log(`catálogo: ${items.length} itens, ${(total / 1024 / 1024).toFixed(2)} MB`);
