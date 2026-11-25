// Captures the README screenshots from the real app (desktop + mobile).
// Usage: node tools/screenshots.mjs [desktop] [effects] [mobile] [natal]
//        (no argument = everything)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from './pw.mjs';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer({ port: 8212 });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const URL0 = 'http://localhost:8212/index.html?nosw';
const only = process.argv.slice(2);
const want = (name) => !only.length || only.includes(name);

async function open(ctxOpts) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...ctxOpts });
  await ctx.addInitScript(() => {
    localStorage.setItem('luzmap.welcomed', 'true');
    localStorage.setItem('luzmap.quality', '"2"');
    localStorage.setItem('luzmap.installBannerUntil', '9000000000000000');
  });
  const page = await ctx.newPage();
  await page.goto(URL0);
  await page.waitForFunction(() => window.__luzmap && window.__luzmap.editor);
  await page.evaluate(() => (window.__luzmap.manual = true));
  return { ctx, page };
}
const settle = (page, t = 1.2) => page.evaluate((n) => {
  for (let i = 0; i < n; i++) window.__luzmap.advance(1 / 30);
}, Math.round(t * 30));
const clearToasts = (page) => page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
const shot = async (page, name) => {
  await clearToasts(page);
  await page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 84 });
  console.log('wrote', name);
};

// Desktop — demo in the simulated room
if (want('desktop')) {
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 } });
  await page.evaluate(() => window.__luzmap.demo.start());
  await page.evaluate(() => window.__luzmap.seek(43));
  await settle(page, 1.5);
  await shot(page, 'desktop-demo.jpg');
  await page.evaluate(() => window.__luzmap.seek(26));
  await settle(page, 1.5);
  await shot(page, 'desktop-demo-portal.jpg');
  // Editor with the demo room kept as a project, a surface selected
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.demo.editHere();
    a.seek(44);
    a.setSimulation(true);
    const s = a.store.surfaces.find((x) => x.name === 'Porta');
    a.store.select(s.id, { vertex: 1 });
    a.showPanel('effects');
  });
  await page.waitForTimeout(400);
  await settle(page, 1);
  await shot(page, 'desktop-editor.jpg');
  // Calibration
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.setSimulation(false);
    a.calDock.open('advanced');
    a.calibration.pattern = 'grid';
    a.calibration.outlines = true;
    a.calibration.vertices = true;
    a.sessionChanged();
    a.showPanel('layers');
  });
  await settle(page, 0.5);
  await shot(page, 'desktop-calibration.jpg');
  await page.evaluate(() => window.__luzmap.calDock.close());
  // Clean projector output window
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.evaluate(() => window.__luzmap.openOutput({ forceWindow: true }))]);
  await popup.setViewportSize({ width: 1280, height: 720 });
  await popup.waitForFunction(() => window.__luzmapOutput && window.__luzmapOutput.project);
  await popup.evaluate(() => {
    document.getElementById('hint').hidden = true;
    document.body.classList.remove('show-hud');
  });
  await popup.waitForTimeout(1500);
  await popup.screenshot({ path: path.join(OUT, 'projector-output.jpg'), type: 'jpeg', quality: 84 });
  console.log('wrote projector-output.jpg');
  await ctx.close();
}

// Effects library grid (rendered by the app's own renderer)
if (want('effects')) {
  const { ctx, page } = await open({ viewport: { width: 1200, height: 675 } });
  await page.evaluate(async () => {
    const a = window.__luzmap;
    const { createProject, createSurface, effectContent } = await import('./js/state.js');
    const { EFFECTS } = await import('./js/effects.js');
    const { rectPoints } = await import('./js/mapping.js');
    const p = createProject({ output: { width: 1920, height: 1080 } });
    const cols = 6;
    const rows = Math.ceil(EFFECTS.length / cols);
    EFFECTS.forEach((fx, i) => {
      const s = createSurface('quad', rectPoints((i % cols) / cols + 0.003, Math.floor(i / cols) / rows + 0.005, 1 / cols - 0.006, 1 / rows - 0.01), { content: effectContent(fx.id), name: fx.name });
      p.surfaces.push(s);
    });
    a.store.setProject(p);
    a.enterCleanOutput();
  });
  await page.evaluate(() => window.__luzmap.seek(3));
  await settle(page, 0.6);
  await shot(page, 'effects-library.jpg');
  await ctx.close();
}

// Mobile portrait + landscape
for (const [name, landscape, setup] of !want('mobile') ? [] : [
  ['mobile-portrait-demo.jpg', false, 'demo'],
  ['mobile-portrait-edit.jpg', false, 'edit'],
  ['mobile-landscape.jpg', true, 'effects'],
]) {
  const d = { ...devices['iPhone 13'] };
  if (landscape) d.viewport = { width: d.viewport.height, height: d.viewport.width };
  const { ctx, page } = await open({ ...d, deviceScaleFactor: 2 });
  await page.evaluate((mode) => {
    const a = window.__luzmap;
    a.demo.start();
    a.seek(mode === 'demo' ? 41 : 44);
    if (mode !== 'demo') {
      a.demo.editHere();
      a.setSimulation(true);
      const s = a.store.surfaces.find((x) => x.name === 'Armário');
      a.store.select(s.id, { vertex: 2 });
      a._syncNudgePad();
    }
  }, setup);
  if (setup === 'effects') {
    await page.tap('.mobile-tabbar [data-sheet="effects"]');
    await page.waitForTimeout(600);
  }
  await settle(page, 1.2);
  await shot(page, name);
  await ctx.close();
}

// Christmas: template room, library tab, effects and artwork catalogue
if (want('natal')) {
  {
    const { ctx, page } = await open({ viewport: { width: 1440, height: 900 } });
    await page.evaluate(() => window.__luzmap.openChristmasTemplate());
    await page.waitForFunction(() => window.__luzmap.store.project.name === 'Natal na sala', null, { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const a = window.__luzmap;
      a.manual = true;
      a.editor.presentation = true;
      a.store.select(null);
      a.showPanel('natal');
      a.seek(8);
    });
    await settle(page, 1.5);
    await shot(page, 'natal-sala.jpg');
    await page.evaluate(() => window.__luzmap.seek(44));
    await settle(page, 1.5);
    await shot(page, 'natal-sala-2.jpg');
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ viewport: { width: 1200, height: 675 } });
    await page.evaluate(async () => {
      const a = window.__luzmap;
      const { createProject, createSurface, effectContent } = await import('./js/state.js');
      const { EFFECTS } = await import('./js/effects.js');
      const { rectPoints } = await import('./js/mapping.js');
      const p = createProject({ output: { width: 1920, height: 1080 } });
      EFFECTS.filter((fx) => fx.cat === 'natal').forEach((fx, i) => {
        p.surfaces.push(createSurface('quad', rectPoints((i % 4) / 4 + 0.003, Math.floor(i / 4) / 2 + 0.005, 0.25 - 0.006, 0.5 - 0.01), { content: effectContent(fx.id), name: fx.name }));
      });
      a.store.setProject(p);
      a.enterCleanOutput();
      a.seek(5.5);
    });
    await settle(page, 1);
    await shot(page, 'natal-efeitos.jpg');
    await ctx.close();
  }
  {
    // Artwork catalogue rendered from the shipped WebP files.
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto('http://localhost:8212/manifest.webmanifest');
    const { XMAS_ITEMS } = await import('../js/christmas-catalog.js');
    const cells = XMAS_ITEMS.filter((i) => i.kind === 'image')
      .map((i) => `<figure class="${i.opaque ? 'op' : ''}"><div><img src="/${i.file}"></div><figcaption>${i.name}</figcaption></figure>`)
      .join('');
    await page.setContent(`<html><head><style>
      body{margin:0;background:#0f1219;font:600 15px Inter,sans-serif;color:#d7dbe6;display:grid;grid-template-columns:repeat(7,1fr);gap:10px;padding:14px}
      figure{margin:0;background:#171b26;border-radius:10px;overflow:hidden}
      figure div{height:150px;display:flex;align-items:center;justify-content:center;padding:8px;background:repeating-conic-gradient(#20263a 0 25%,#1a1f2e 0 50%) 0 0/18px 18px}
      figure.op div{padding:0} figure.op img{width:100%;height:100%;object-fit:cover}
      img{max-width:100%;max-height:100%} figcaption{padding:7px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    </style></head><body>${cells}</body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    await page.screenshot({ path: path.join(OUT, 'natal-arte.jpg'), type: 'jpeg', quality: 84, fullPage: true });
    console.log('wrote natal-arte.jpg');
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
    await page.tap('.mobile-tabbar [data-sheet="natal"]');
    await page.waitForTimeout(700);
    await shot(page, 'natal-celular.jpg');
    await ctx.close();
  }
}

await browser.close();
server.close();
