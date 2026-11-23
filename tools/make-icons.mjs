// Renders assets/icons/icon.svg into the PNG sizes required by the PWA manifest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(ROOT, 'assets/icons/icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const out = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.12],
  ['apple-touch-icon.png', 180, 0.06],
];
for (const [name, size, pad] of out) {
  const dataUrl = await page.evaluate(
    async ({ svg, size, pad }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(svg);
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(0, 0, size, size);
      const p = size * pad;
      ctx.drawImage(img, p, p, size - 2 * p, size - 2 * p);
      return c.toDataURL('image/png');
    },
    { svg, size, pad },
  );
  fs.writeFileSync(path.join(ROOT, 'assets/icons', name), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', name);
}
await browser.close();
