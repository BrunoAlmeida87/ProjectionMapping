// Renders the app icons, shortcut icons and iOS launch screens from
// assets/icons/icon.svg. Usage: node tools/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'assets', 'icons');
const SPLASH = path.join(ROOT, 'assets', 'splash');
fs.mkdirSync(SPLASH, { recursive: true });
const svg = fs.readFileSync(path.join(ICONS, 'icon.svg'), 'utf8');

// iOS launch screens: [cssWidth, cssHeight, devicePixelRatio, devices]
export const IOS_SPLASH = [
  [440, 956, 3, 'iPhone 16 Pro Max'],
  [402, 874, 3, 'iPhone 16 Pro'],
  [430, 932, 3, 'iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus'],
  [393, 852, 3, 'iPhone 14 Pro / 15 / 15 Pro / 16'],
  [428, 926, 3, 'iPhone 12–13 Pro Max / 14 Plus'],
  [390, 844, 3, 'iPhone 12 / 13 / 14'],
  [375, 812, 3, 'iPhone X / XS / 11 Pro / 12–13 mini'],
  [414, 896, 3, 'iPhone XS Max / 11 Pro Max'],
  [414, 896, 2, 'iPhone XR / 11'],
  [414, 736, 3, 'iPhone 6–8 Plus'],
  [375, 667, 2, 'iPhone 6–8 / SE 2–3'],
  [744, 1133, 2, 'iPad mini 6'],
  [768, 1024, 2, 'iPad 9.7"'],
  [820, 1180, 2, 'iPad Air 4–5 / iPad 10'],
  [834, 1194, 2, 'iPad Pro 11"'],
  [1024, 1366, 2, 'iPad Pro 12.9"'],
];

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(file, w, h, drawFn, arg = {}) {
  const dataUrl = await page.evaluate(
    async ({ svg, w, h, fn, arg }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      // eslint-disable-next-line no-new-func
      await new Function('ctx', 'img', 'w', 'h', 'arg', fn)(ctx, img, w, h, arg);
      return c.toDataURL('image/png');
    },
    { svg, w, h, fn: drawFn, arg },
  );
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', path.relative(ROOT, file));
}

const ICON = `
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, w, h);
  const p = w * arg.pad; ctx.drawImage(img, p, p, w - 2 * p, h - 2 * p);`;

for (const [name, size, pad] of [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.12],
  ['icon-maskable-192.png', 192, 0.12],
  ['apple-touch-icon.png', 180, 0.06],
]) {
  await render(path.join(ICONS, name), size, size, ICON, { pad });
}

// Shortcut icons (96x96): rounded dark tile + a glyph.
const SHORTCUT = `
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#22d3ee'); g.addColorStop(0.55, '#7c5cff'); g.addColorStop(1, '#ff2bd6');
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = g; ctx.fillStyle = g; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const c = w / 2;
  if (arg.kind === 'demo') {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 4; const r = i % 2 ? 12 : 32; ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
  } else if (arg.kind === 'new') {
    ctx.beginPath(); ctx.moveTo(c, 22); ctx.lineTo(c, 74); ctx.moveTo(22, c); ctx.lineTo(74, c); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.roundRect(16, 32, 64, 34, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(60, 49, 9, 0, Math.PI * 2); ctx.stroke();
  }`;
for (const kind of ['demo', 'new', 'output']) await render(path.join(ICONS, `shortcut-${kind}.png`), 96, 96, SHORTCUT, { kind });

// iOS launch screens (portrait): dark background, logo and name.
const SPLASH_FN = `
  // Flat colour keeps each PNG small (gradients compress badly).
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, w, h);
  const s = Math.min(w, h) * 0.26;
  ctx.drawImage(img, (w - s) / 2, h * 0.42 - s / 2, s, s);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = '700 ' + Math.round(s * 0.26) + 'px Inter, Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  const t1 = 'Luz', t2 = 'Map';
  const w1 = ctx.measureText(t1).width, w2 = ctx.measureText(t2).width;
  const x0 = w / 2 - (w1 + w2) / 2, y = h * 0.42 + s * 0.62;
  ctx.textAlign = 'left'; ctx.fillText(t1, x0, y); ctx.fillStyle = '#67e8f9'; ctx.fillText(t2, x0 + w1, y);
  ctx.textAlign = 'center'; ctx.fillStyle = '#8b93a7'; ctx.font = '500 ' + Math.round(s * 0.09) + 'px Inter, Arial, sans-serif';
  ctx.fillText('Projection mapping no navegador', w / 2, y + s * 0.36);`;
for (const [cw, ch, dpr] of IOS_SPLASH) {
  await render(path.join(SPLASH, `splash-${cw * dpr}x${ch * dpr}.png`), cw * dpr, ch * dpr, SPLASH_FN);
}
await browser.close();

// Shrink the launch screens (flat colours -> small palette PNGs).
try {
  execFileSync('python3', ['-c', `import glob
from PIL import Image
for f in glob.glob('${SPLASH}/*.png'):
    Image.open(f).convert('RGB').quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(f, optimize=True)`]);
} catch (err) {
  console.warn('PIL indisponível: telas de abertura ficam sem compactação', err.message);
}

// Print the <link> tags for index.html
console.log('\n<!-- iOS launch screens -->');
for (const [cw, ch, dpr, name] of IOS_SPLASH) {
  console.log(
    `<link rel="apple-touch-startup-image" media="(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" href="assets/splash/splash-${cw * dpr}x${ch * dpr}.png"><!-- ${name} -->`,
  );
}
