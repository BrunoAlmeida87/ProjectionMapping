// Produces the real demo video (demos/luzmap-demo.mp4 + .webm + poster) by
// driving the actual app in Chromium and capturing it frame by frame with a
// deterministic clock (the app's manual mode), then encoding with ffmpeg.
//
// Usage: node tools/make-demo-video.mjs [--fps 30] [--keep-frames]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from './pw.mjs';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = +(process.argv[process.argv.indexOf('--fps') + 1] || 30) || 30;
const W = 1280;
const H = 720;
const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luzmap-frames-'));
let frame = 0;

const server = await startServer({ port: 8211 });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  localStorage.setItem('luzmap.welcomed', 'true');
  localStorage.setItem('luzmap.quality', '"2"');
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto('http://localhost:8211/index.html?nosw');
await page.waitForFunction(() => window.__luzmap && window.__luzmap.editor);
await page.waitForTimeout(800);

// ----------------------------------------------------------------- overlay (cursor, captions, cards)
await page.addStyleTag({
  content: `
  #vcur { position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 99999; pointer-events: none; transform: translate(-3px,-2px); filter: drop-shadow(0 2px 3px #000a); }
  #vring { position: fixed; z-index: 99998; pointer-events: none; border: 3px solid #22d3ee; border-radius: 50%; opacity: 0; }
  #vcap { position: fixed; left: 50%; bottom: 236px; transform: translateX(-50%); z-index: 99997; pointer-events: none; padding: 9px 18px; border-radius: 12px;
    background: linear-gradient(135deg,#0b0d12f2,#1a1033f2); border: 1px solid #ff2bd666; color: #fff; font: 600 17px system-ui, sans-serif; box-shadow: 0 10px 30px #000c; white-space: nowrap; opacity: 0; }
  #vcap b { color: #22d3ee; margin-right: 8px; }
  #vcard { position: fixed; inset: 0; z-index: 99996; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 14px;
    background: radial-gradient(ellipse at center, #1b1240f0, #05060af8 70%); color: #fff; font-family: system-ui, sans-serif; text-align: center; }
  #vcard h1 { margin: 0; font-size: 54px; letter-spacing: .01em; }
  #vcard h1 span { background: linear-gradient(90deg,#22d3ee,#ff2bd6); -webkit-background-clip: text; background-clip: text; color: transparent; }
  #vcard p { margin: 0; font-size: 22px; color: #cbd2e1; max-width: 900px; }
  #vcard small { font-size: 16px; color: #8b93a7; }`,
});
await page.evaluate(() => {
  const cur = document.createElement('div');
  cur.id = 'vcur';
  cur.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 2l17 10-7 2-3 7z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const ring = document.createElement('div');
  ring.id = 'vring';
  const cap = document.createElement('div');
  cap.id = 'vcap';
  const card = document.createElement('div');
  card.id = 'vcard';
  document.body.append(cur, ring, cap, card);
  window.__vid = { x: 640, y: 360 };
  window.__luzmap.manual = true;
});

const cursor = { x: 640, y: 360 };

async function capture(n = 1, target = page) {
  for (let i = 0; i < n; i++) {
    await page.evaluate((dt) => window.__luzmap.advance(dt), 1 / FPS);
    const file = path.join(framesDir, `${String(frame).padStart(5, '0')}.jpg`);
    if (target === page) await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
    else await target.screenshot({ path: file, type: 'jpeg', quality: 90 });
    frame++;
  }
}
const sec = (s) => Math.round(s * FPS);
const wait = (s, target) => capture(sec(s), target);

async function setCursor(x, y) {
  cursor.x = x;
  cursor.y = y;
  await page.evaluate(([x, y]) => {
    const c = document.getElementById('vcur');
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
  }, [x, y]);
}

async function ring(x, y, k) {
  await page.evaluate(([x, y, k]) => {
    const r = document.getElementById('vring');
    const s = 10 + k * 34;
    Object.assign(r.style, { left: `${x - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px`, opacity: String(1 - k) });
  }, [x, y, k]);
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

async function moveTo(x, y, seconds = 0.6, { drag = false } = {}) {
  const n = Math.max(1, sec(seconds));
  const x0 = cursor.x;
  const y0 = cursor.y;
  for (let i = 1; i <= n; i++) {
    const k = ease(i / n);
    const px = x0 + (x - x0) * k;
    const py = y0 + (y - y0) * k;
    await page.mouse.move(px, py);
    await setCursor(px, py);
    await capture(1);
  }
  void drag;
}

async function click(x, y, seconds = 0.5) {
  if (x !== undefined) await moveTo(x, y, seconds);
  await page.mouse.down();
  await page.mouse.up();
  for (let i = 0; i < 6; i++) {
    await ring(cursor.x, cursor.y, i / 6);
    await capture(1);
  }
  await ring(0, 0, 1);
}

async function clickSel(selector, seconds = 0.6) {
  const b = await page.locator(selector).first().boundingBox();
  await click(b.x + b.width / 2, b.y + b.height / 2, seconds);
}

async function drag(x0, y0, x1, y1, seconds = 0.8) {
  await moveTo(x0, y0, 0.4);
  await page.mouse.down();
  await capture(2);
  await moveTo(x1, y1, seconds);
  await page.mouse.up();
  await capture(2);
}

async function caption(html) {
  await page.evaluate((h) => {
    const c = document.getElementById('vcap');
    c.innerHTML = h || '';
    c.style.opacity = h ? '1' : '0';
  }, html);
}

async function card(html, seconds) {
  await page.evaluate((h) => {
    const c = document.getElementById('vcard');
    c.innerHTML = h;
    c.style.display = 'flex';
  }, html);
  await wait(seconds);
  await page.evaluate(() => (document.getElementById('vcard').style.display = 'none'));
}

const vp = await page.locator('#viewport').boundingBox();
const toPage = async (p) => {
  const s = await page.evaluate((pt) => window.__luzmap.editor.toScreen(pt), p);
  return [vp.x + s[0], vp.y + s[1]];
};
const roomPoints = (what) =>
  page.evaluate(async (w) => {
    const room = await import('./js/room.js');
    if (w === 'door') return room.P(room.OBJ.door);
    if (w === 'table') return room.tableTop();
    if (w === 'cabinet') return room.cabinetFront();
    if (w === 'shelf') return room.shelfFront();
    return null;
  }, what);

// ----------------------------------------------------------------- storyboard
console.log('Gravando quadros…');
await page.evaluate(() => {
  const a = window.__luzmap;
  a.newProject({ silent: true });
  a.store.project.name = 'Minha sala';
  a._updateProjectName();
});
await setCursor(640, 360);

// 0. Title
await card('<h1>Luz<span>Map</span></h1><p>Projection mapping gratuito no navegador — no computador e no celular</p><small>Vídeo real do aplicativo · HTML5 + WebGL · sem cadastro</small>', 3);

// 1. Interface
await caption('<b>1</b> A interface: ferramentas, camadas, efeitos, propriedades e timeline');
await moveTo(vp.x + 28, vp.y + 80, 0.8);
await wait(0.5);
await moveTo(150, 74, 0.6);
await wait(0.4);
await moveTo(1180, 120, 0.8);
await wait(0.4);
await moveTo(640, 660, 0.7);
await wait(0.5);

// Reference photo of the room (planning without the projector)
await caption('<b>2</b> Foto de referência do ambiente para planejar o mapping');
await page.evaluate(() => window.__luzmap.setBackground('builtin:room'));
await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
await wait(1.6);

// 2. Create a surface (4 taps)
await caption('<b>3</b> Criando uma superfície: ferramenta Quadrilátero, um toque em cada canto da porta');
await clickSel('#toolbar [data-tool="quad"]');
const door = await roomPoints('door');
const offs = [[-18, -14], [16, -20], [22, 12], [-15, 18]];
for (let i = 0; i < 4; i++) {
  const [x, y] = await toPage(door[i]);
  await click(x + offs[i][0], y + offs[i][1], 0.45);
}
await wait(0.8);

// 3. Adjust the vertices
await caption('<b>4</b> Ajuste dos vértices: arraste cada canto até o canto real');
const sel = await page.evaluate(() => window.__luzmap.store.selected.points.map((p) => p.slice()));
for (let i = 0; i < 4; i++) {
  const [x0, y0] = await toPage(sel[i]);
  const [x1, y1] = await toPage(door[i]);
  await drag(x0, y0, x1, y1, 0.45);
}
await page.evaluate(() => {
  const a = window.__luzmap;
  a.store.selected.name = 'Porta';
  a.store.changed('props');
});
await wait(0.6);

// 4. Apply an effect
await caption('<b>5</b> Aplicando um efeito da biblioteca com um clique');
await clickSel('.left-tabs [data-tab="effects"]', 0.6);
await wait(0.4);
await page.evaluate(() => document.querySelector('.fx-card[data-fx="portal"]').scrollIntoView({ block: 'center' }));
await clickSel('.fx-card[data-fx="portal"]', 0.7);
await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
await wait(1.6);

// 5. Perspective correction on the table top
await caption('<b>6</b> Correção de perspectiva real (homografia) — o tampo da mesa');
await clickSel('#toolbar [data-tool="quad"]');
const table = await roomPoints('table');
for (let i = 0; i < 4; i++) {
  const [x, y] = await toPage(table[i]);
  await click(x, y, 0.35);
}
await page.evaluate(async () => {
  const a = window.__luzmap;
  const { effectContent } = await import('./js/state.js');
  a.store.selected.name = 'Mesa';
  a.store.selected.content = effectContent('checker', { frequency: 1.2 });
  a.store.changed('content');
});
await wait(1.8);
await caption('<b>6</b> As linhas convergem com a perspectiva real do objeto');
await page.evaluate(() => document.querySelector('.fx-card[data-fx="waves"]').scrollIntoView({ block: 'center' }));
await clickSel('.fx-card[data-fx="waves"]', 0.6);
await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
await wait(1.0);

// 6. Several surfaces at once
await caption('<b>7</b> Várias superfícies ao mesmo tempo, cada uma com seu conteúdo');
await clickSel('#toolbar [data-tool="rect"]');
const cab = await roomPoints('cabinet');
{
  const [x0, y0] = await toPage(cab[0]);
  const [x1, y1] = await toPage(cab[2]);
  await drag(x0, y0, x1, y1, 0.6);
}
await page.evaluate(() => document.querySelector('.fx-card[data-fx="water"]').scrollIntoView({ block: 'center' }));
await clickSel('.fx-card[data-fx="water"]', 0.6);
await clickSel('#toolbar [data-tool="rect"]');
const shelf = await roomPoints('shelf');
{
  const [x0, y0] = await toPage(shelf[0]);
  const [x1, y1] = await toPage(shelf[2]);
  await drag(x0, y0, x1, y1, 0.6);
}
await page.evaluate(() => document.querySelector('.fx-card[data-fx="particles"]').scrollIntoView({ block: 'center' }));
await clickSel('.fx-card[data-fx="particles"]', 0.6);
await page.evaluate(() => {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const a = window.__luzmap;
  a.store.surfaces[2].name = 'Armário';
  a.store.surfaces[3].name = 'Estante';
  a.store.changed('props');
});
await wait(0.6);
await caption('<b>7</b> Modo simulação: a luz projetada sobre a foto do ambiente');
await clickSel('#btn-sim', 0.6);
await page.evaluate(() => {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  window.__luzmap.store.select(null);
});
await wait(2.4);

// 7. Clean projector output
await caption('<b>8</b> Saída limpa para o projetor: só a composição, fundo preto, sem interface');
await clickSel('#btn-output', 0.6);
await wait(0.6);
const optBox = await page.locator('.output-menu .big-option').first().boundingBox();
await moveTo(optBox.x + optBox.width / 2, optBox.y + optBox.height / 2, 0.5);
const [popup] = await Promise.all([page.waitForEvent('popup'), page.mouse.down().then(() => page.mouse.up())]);
await popup.setViewportSize({ width: W, height: H });
await popup.waitForFunction(() => window.__luzmapOutput && window.__luzmapOutput.connected && window.__luzmapOutput.project);
await popup.evaluate(() => {
  document.getElementById('hint').hidden = true;
  document.body.classList.remove('show-hud');
});
await popup.waitForTimeout(600);
await caption('');
await wait(3.2, popup);
await popup.close();
await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
await caption('<b>8</b> …ou "Saída limpa" na própria tela (celular + espelhamento)');
await wait(0.8);
await page.evaluate(() => window.__luzmap.enterCleanOutput());
await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
await caption('');
await wait(2.2);
await page.evaluate(() => window.__luzmap.exitCleanOutput());
await wait(0.3);

// 8. Automatic residential demo
await caption('<b>9</b> DEMO — Experimentar projection mapping: mapping residencial automático');
await clickSel('#btn-demo', 0.6);
await caption('');
await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
await setCursor(W + 40, H + 40);
const scenes = [
  [0.5, 3.4],
  [8.3, 3.4],
  [16.3, 3.6],
  [24.3, 3.6],
  [32.5, 3.6],
  [40.5, 4.0],
  [50.5, 5.0],
];
for (const [t, d] of scenes) {
  await page.evaluate((tt) => window.__luzmap.seek(tt), t);
  await wait(d);
}

// End card
await card('<h1>Luz<span>Map</span></h1><p>Grátis · sem cadastro · funciona no GitHub Pages · computador e celular</p><small>Projetos e mídias ficam só no seu dispositivo · projetor por HDMI, espelhamento ou janela separada</small>', 3.2);

await browser.close();
server.close();
console.log(`${frame} quadros (${(frame / FPS).toFixed(1)} s). Codificando…`);

fs.mkdirSync(path.join(ROOT, 'demos'), { recursive: true });
const mp4 = path.join(ROOT, 'demos', 'luzmap-demo.mp4');
const webm = path.join(ROOT, 'demos', 'luzmap-demo.webm');
const poster = path.join(ROOT, 'demos', 'luzmap-demo-poster.jpg');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(framesDir, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-profile:v', 'high', '-level', '4.0', mp4], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(framesDir, '%05d.jpg'), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', webm], { stdio: 'inherit' });
const posterFrame = String(Math.min(frame - 1, sec(3) + sec(48))).padStart(5, '0');
fs.copyFileSync(path.join(framesDir, `${posterFrame}.jpg`), poster);
if (!process.argv.includes('--keep-frames')) fs.rmSync(framesDir, { recursive: true, force: true });
for (const f of [mp4, webm, poster]) console.log(`${path.relative(ROOT, f)}: ${(fs.statSync(f).size / 1e6).toFixed(2)} MB`);
