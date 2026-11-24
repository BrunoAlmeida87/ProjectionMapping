// Captures the screenshots used by the user manual (docs/manual/img/),
// straight from the real app. Usage: node tools/manual-shots.mjs
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from './pw.mjs';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'manual', 'img');
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer({ port: 8213 });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const URL0 = 'http://localhost:8213/index.html?nosw';

async function open(ctxOpts = {}, { welcomed = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...ctxOpts });
  await ctx.addInitScript((w) => {
    if (w) localStorage.setItem('luzmap.welcomed', 'true');
    localStorage.setItem('luzmap.quality', '"2"');
    localStorage.setItem('luzmap.installBannerUntil', '9000000000000000');
  }, welcomed);
  const page = await ctx.newPage();
  await page.goto(URL0);
  await page.waitForFunction(() => window.__luzmap && window.__luzmap.editor);
  await page.waitForTimeout(500);
  await page.evaluate(() => (window.__luzmap.manual = true));
  return { ctx, page };
}
const settle = (page, t = 1) =>
  page.evaluate((n) => {
    for (let i = 0; i < n; i++) window.__luzmap.advance(1 / 30);
  }, Math.round(t * 30));
const clean = (page) => page.evaluate(() => document.querySelectorAll('.toast, .mk').forEach((t) => t.remove()));
async function shot(page, name, { clip = null, el = null, keepMarks = false } = {}) {
  if (!keepMarks) await page.evaluate(() => document.querySelectorAll('.mk').forEach((t) => t.remove()));
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  const file = path.join(OUT, name);
  if (el) await page.locator(el).first().screenshot({ path: file, type: 'jpeg', quality: 86 });
  else await page.screenshot({ path: file, type: 'jpeg', quality: 86, clip: clip || undefined });
  console.log('wrote', name);
}

/** Numbered badges next to UI elements (for annotated screenshots). */
async function annotate(page, marks) {
  await page.addStyleTag({
    content: `.mk{position:fixed;z-index:99999;width:34px;height:34px;border-radius:50%;background:#ff2bd6;color:#fff;font:800 19px Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px #fff,0 4px 12px #000a;pointer-events:none}
    .mk-box{position:fixed;z-index:99998;border:2.5px solid #ff2bd6;border-radius:8px;pointer-events:none;box-shadow:0 0 0 2px #0008}`,
  });
  await page.evaluate((marks) => {
    for (const m of marks) {
      let r;
      if (m.rect) r = { left: m.rect[0], top: m.rect[1], width: m.rect[2], height: m.rect[3] };
      else {
        const e = document.querySelector(m.sel);
        if (!e) continue;
        r = e.getBoundingClientRect();
      }
      if (m.box) {
        const b = document.createElement('div');
        b.className = 'mk mk-box';
        Object.assign(b.style, { left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px`, borderRadius: '8px', background: 'transparent', boxShadow: '0 0 0 2px #0008' });
        b.style.width = `${r.width + 4}px`;
        b.style.height = `${r.height + 4}px`;
        document.body.appendChild(b);
      }
      const d = document.createElement('div');
      d.className = 'mk';
      d.textContent = m.n;
      const pos = m.pos || 'tl';
      const x = pos.includes('r') ? r.left + r.width - 8 : pos.includes('c') ? r.left + r.width / 2 - 13 : r.left - 10;
      const y = pos.includes('b') ? r.top + r.height - 10 : pos.includes('m') ? r.top + r.height / 2 - 13 : r.top - 10;
      d.style.left = `${Math.max(2, x)}px`;
      d.style.top = `${Math.max(2, y)}px`;
      document.body.appendChild(d);
    }
  }, marks);
}

const roomPts = (page, what) =>
  page.evaluate(async (w) => {
    const room = await import('./js/room.js');
    if (w === 'door') return room.P(room.OBJ.door);
    if (w === 'cabinet') return room.cabinetFront();
    return null;
  }, what);

// ------------------------------------------------------------------ welcome
{
  const { ctx, page } = await open({}, { welcomed: false });
  await page.waitForSelector('.modal.welcome');
  await page.waitForTimeout(300);
  await shot(page, '01-boas-vindas.jpg');
  await ctx.close();
}

// ------------------------------------------------------------------ annotated interface + panels (demo room as project)
{
  const { ctx, page } = await open();
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.demo.start();
    a.seek(44);
    a.demo.editHere();
    a.transport.pause();
    a.seek(44);
    a.setSimulation(true);
    const s = a.store.surfaces.find((x) => x.name === 'Porta');
    a.store.select(s.id);
  });
  await page.waitForTimeout(400);
  await settle(page, 0.5);
  await clean(page);
  await annotate(page, [
    { n: 1, sel: '#project-title', pos: 'tl' },
    { n: 2, sel: '#btn-undo', pos: 'tl' },
    { n: 3, sel: '#btn-demo', pos: 'tl' },
    { n: 4, sel: '#btn-calibrate', pos: 'tl' },
    { n: 5, sel: '#btn-output', pos: 'tl' },
    { n: 6, sel: '#btn-menu', pos: 'bl' },
    { n: 7, sel: '.left-tabs', pos: 'ml' },
    { n: 8, sel: '#toolbar', pos: 'tr' },
    { n: 9, sel: '.view-controls', pos: 'tl' },
    { n: 10, rect: await page.evaluate(() => {
      const v = document.querySelector('#viewport').getBoundingClientRect();
      return [v.left + v.width * 0.5, v.top + v.height * 0.12, 10, 10];
    }), pos: 'tl' },
    { n: 11, sel: '#inspector .panel-title', pos: 'ml' },
    { n: 12, sel: '.tl-transport', pos: 'ml' },
    { n: 13, sel: '.tl-rows', pos: 'tl' },
    { n: 14, sel: '#status', pos: 'ml' },
  ]);
  await shot(page, '02-interface-anotada.jpg', { keepMarks: true });
  await page.evaluate(() => document.querySelectorAll('.mk').forEach((m) => m.remove()));

  // panels at 2x for crisp crops
  await ctx.close();
}

// ------------------------------------------------------------------ crisp crops (2x)
{
  const { ctx, page } = await open({ deviceScaleFactor: 2 });
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.demo.start();
    a.seek(44);
    a.demo.editHere();
    a.transport.pause();
    a.seek(44);
    a.setSimulation(true);
  });
  await page.waitForTimeout(400);
  await settle(page, 0.3);
  await shot(page, '03-ferramentas.jpg', { el: '#toolbar' });
  await shot(page, '09-camadas.jpg', { el: '#left-panel' });
  await page.evaluate(() => {
    const a = window.__luzmap;
    const s = a.store.surfaces.find((x) => x.name === 'Armário');
    a.store.select(s.id);
  });
  await page.waitForTimeout(300);
  await shot(page, '10-propriedades-topo.jpg', { el: '#inspector' });
  await page.evaluate(() => {
    const body = document.querySelector('#inspector-body');
    const secs = [...body.querySelectorAll('.section > summary')];
    const vert = secs.find((s) => /Vértices/.test(s.textContent));
    body.scrollTop = vert.parentElement.offsetTop - 4;
  });
  await page.waitForTimeout(200);
  await shot(page, '10b-propriedades-vertices.jpg', { el: '#inspector' });
  // content of a selected clip with effect params
  await page.evaluate(() => {
    const a = window.__luzmap;
    const s = a.store.surfaces.find((x) => x.name === 'Armário');
    const clip = s.clips.find((c) => c.content.effect === 'water' && c.start >= 40);
    a.store.select(s.id, { clipId: clip.id });
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const body = document.querySelector('#inspector-body');
    const secs = [...body.querySelectorAll('.section > summary')];
    const c = secs.find((s) => /Conteúdo/.test(s.textContent));
    body.scrollTop = c.parentElement.offsetTop - 4;
  });
  await page.waitForTimeout(200);
  await shot(page, '11-propriedades-conteudo.jpg', { el: '#inspector' });
  await page.evaluate(() => {
    const body = document.querySelector('#inspector-body');
    const secs = [...body.querySelectorAll('.section > summary')];
    const c = secs.find((s) => /Animação/.test(s.textContent));
    c.parentElement.open = true;
    body.scrollTop = c.parentElement.offsetTop - 4;
  });
  await page.waitForTimeout(200);
  await shot(page, '12-propriedades-animacao.jpg', { el: '#inspector' });
  await shot(page, '15-timeline.jpg', { el: '#panel-timeline' });
  // project settings (nothing selected)
  await page.evaluate(() => window.__luzmap.store.select(null));
  await page.waitForTimeout(300);
  await shot(page, '26-projeto-saida.jpg', { el: '#inspector' });
  // calibration docks
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.setSimulation(false);
    a.calDock.open('wizard');
    a.calDock.step = 3;
    a.calDock.render();
    a.calibration.pattern = 'grid';
    a.calibration.outlines = true;
    a.calibration.vertices = true;
    const s = a.store.surfaces.find((x) => x.name === 'Porta');
    a.store.select(s.id, { vertex: 1 });
    a.sessionChanged();
  });
  await page.waitForTimeout(300);
  await settle(page, 0.3);
  await shot(page, '16-calibracao-assistente.jpg', { el: '.cal-dock' });
  await page.evaluate(() => window.__luzmap.calDock.open('advanced'));
  await page.waitForTimeout(200);
  await shot(page, '17-calibracao-avancado.jpg', { el: '.cal-dock' });
  await ctx.close();
}

// ------------------------------------------------------------------ calibration full view + masks + simulation
{
  const { ctx, page } = await open();
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.demo.start();
    a.seek(44);
    a.demo.editHere();
    a.transport.pause();
    a.seek(36);
    a.calDock.open('advanced');
    a.calibration.pattern = 'grid';
    a.calibration.outlines = true;
    a.calibration.vertices = true;
    const s = a.store.surfaces.find((x) => x.name === 'Porta');
    a.store.select(s.id, { vertex: 1 });
    a.sessionChanged();
  });
  await page.waitForTimeout(300);
  await settle(page, 0.3);
  await shot(page, '18-calibracao-tela.jpg');
  await page.evaluate(() => window.__luzmap.calDock.close());
  // masks: editor view (mask selected) and pure output
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.seek(36);
    const m = a.store.surfaces.find((x) => x.name === 'Máscara do armário');
    a.store.select(m.id);
    a.view.showBackground = true;
    a.setSimulation(false);
  });
  await page.waitForTimeout(300);
  await settle(page, 0.3);
  const vp = await page.locator('#viewport').boundingBox();
  await shot(page, '13-mascara-editor.jpg', { clip: vp });
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.store.select(null);
    a.enterCleanOutput();
  });
  await page.waitForTimeout(400);
  await settle(page, 0.2);
  await shot(page, '14-mascara-saida.jpg');
  await page.evaluate(() => window.__luzmap.exitCleanOutput());
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.view.showBackground = true;
    a.seek(44);
    a.setSimulation(true);
  });
  await settle(page, 0.3);
  await shot(page, '20-simulacao.jpg', { clip: vp });
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.setSimulation(false);
    a.enterCleanOutput();
  });
  await page.waitForTimeout(400);
  await settle(page, 0.2);
  await shot(page, '20b-saida-pura.jpg');
  await page.evaluate(() => window.__luzmap.exitCleanOutput());
  await page.waitForTimeout(300);
  // output menu + projects + recorder modals
  await page.evaluate(() => window.__luzmap._outputMenu(false));
  await page.waitForTimeout(300);
  await shot(page, '19-menu-saida.jpg', { el: '.modal' });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__luzmap.saveNow(true));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__luzmap.openProjects());
  await page.waitForTimeout(600);
  await shot(page, '21-projetos.jpg', { el: '.modal' });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__luzmap.openRecorder());
  await page.waitForTimeout(300);
  await shot(page, '22-gravador.jpg', { el: '.modal' });
  await page.keyboard.press('Escape');
  await ctx.close();
}

// ------------------------------------------------------------------ tutorial steps (reference photo, drawing)
{
  const { ctx, page } = await open();
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.newProject({ silent: true });
    a.setBackground('builtin:room');
    a.store.project.background.opacity = 0.8;
  });
  await settle(page, 0.3);
  await shot(page, '04-passo-foto.jpg');
  const vp = await page.locator('#viewport').boundingBox();
  const toPage = async (p) => {
    const s = await page.evaluate((pt) => window.__luzmap.editor.toScreen(pt), p);
    return [vp.x + s[0], vp.y + s[1]];
  };
  const door = await roomPts(page, 'door');
  await page.keyboard.press('q');
  const offs = [[-16, -12], [14, -18], [20, 12], [-14, 16]];
  for (let i = 0; i < 3; i++) {
    const [x, y] = await toPage(door[i]);
    await page.mouse.click(x + offs[i][0], y + offs[i][1]);
  }
  const [x3, y3] = await toPage(door[3]);
  await page.mouse.move(x3 + offs[3][0], y3 + offs[3][1]);
  await settle(page, 0.1);
  await shot(page, '05-passo-desenhando.jpg');
  await page.mouse.click(x3 + offs[3][0], y3 + offs[3][1]);
  await settle(page, 0.2);
  await shot(page, '06-passo-quad-criado.jpg');
  // fix vertices
  const pts = await page.evaluate(() => window.__luzmap.store.selected.points.map((p) => p.slice()));
  for (let i = 0; i < 4; i++) {
    const [a0, b0] = await toPage(pts[i]);
    const [a1, b1] = await toPage(door[i]);
    await page.mouse.move(a0, b0);
    await page.mouse.down();
    await page.mouse.move(a1, b1, { steps: 4 });
    await page.mouse.up();
  }
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.store.selected.name = 'Porta';
    a.store.select(a.store.selected.id, { vertex: 2 });
    a.store.changed('props');
    const body = document.querySelector('#inspector-body');
    const secs = [...body.querySelectorAll('.section > summary')];
    const v = secs.find((s) => /Vértices/.test(s.textContent));
    body.scrollTop = v.parentElement.offsetTop - 4;
  });
  await settle(page, 0.2);
  await shot(page, '07-passo-vertice.jpg');
  await page.click('.left-tabs [data-tab="effects"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.fx-card[data-fx="portal"]').scrollIntoView({ block: 'center' }));
  await page.click('.fx-card[data-fx="portal"]');
  await page.evaluate(() => window.__luzmap.seek(3));
  await settle(page, 0.6);
  await shot(page, '08-passo-efeito.jpg');
  await ctx.close();
}

// ------------------------------------------------------------------ demo scenes contact sheet
{
  const { ctx, page } = await open({ viewport: { width: 1280, height: 720 } });
  await page.evaluate(() => window.__luzmap.demo.start());
  await page.waitForTimeout(600);
  const tmp = [];
  for (const [i, t] of [3, 11, 19, 27, 36, 45, 55].entries()) {
    await page.evaluate((tt) => window.__luzmap.seek(tt), t);
    await settle(page, 1.2);
    const vp = await page.locator('#viewport').boundingBox();
    const f = path.join(OUT, `_scene${i}.jpg`);
    await page.screenshot({ path: f, type: 'jpeg', quality: 88, clip: { x: vp.x, y: vp.y + 50, width: vp.width, height: vp.height - 50 } });
    tmp.push(f);
  }
  await ctx.close();
  const inputs = tmp.flatMap((f) => ['-i', f]);
  const blank = path.join(OUT, '_blank.jpg');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x0b0d12:s=1280x620', '-frames:v', '1', blank]);
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', ...inputs, '-i', blank,
    '-filter_complex',
    '[0]scale=480:252,setsar=1[a];[1]scale=480:252,setsar=1[b];[2]scale=480:252,setsar=1[c];[3]scale=480:252,setsar=1[d];[4]scale=480:252,setsar=1[e];[5]scale=480:252,setsar=1[f];[6]scale=480:252,setsar=1[g];[7]scale=480:252,setsar=1[h];[a][b]hstack[r1];[c][d]hstack[r2];[e][f]hstack[r3];[g][h]hstack[r4];[r1][r2][r3][r4]vstack=4',
    '-q:v', '3', path.join(OUT, '23-demo-cenas.jpg'),
  ]);
  for (const f of [...tmp, blank]) fs.unlinkSync(f);
  console.log('wrote 23-demo-cenas.jpg');
}

// ------------------------------------------------------------------ cover image (stage only, simulated room)
{
  const { ctx, page } = await open({ viewport: { width: 1600, height: 1000 } });
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.demo.start();
    a.seek(44);
  });
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: '.toolbar,.view-controls,.demo-hud,.demo-caption{display:none!important}' });
  await settle(page, 1.2);
  const r = await page.evaluate(() => {
    const v = document.querySelector('#viewport').getBoundingClientRect();
    const s = window.__luzmap.editor.stage();
    return { x: v.left + s.x + 2, y: v.top + s.y + 2, width: s.w - 4, height: s.h - 4 };
  });
  await shot(page, 'capa.jpg', { clip: r });
  await ctx.close();
}

// ------------------------------------------------------------------ mobile
{
  const d = { ...devices['iPhone 13'] };
  const { ctx, page } = await open({ ...d, deviceScaleFactor: 2 });
  await page.evaluate(() => {
    const a = window.__luzmap;
    a.demo.start();
    a.seek(44);
    a.demo.editHere();
    a.setSimulation(true);
  });
  await page.tap('.mobile-tabbar [data-sheet="layers"]');
  await page.waitForTimeout(500);
  await settle(page, 0.4);
  await shot(page, '24-celular-camadas.jpg');
  await page.tap('.mobile-tabbar [data-sheet="layers"]');
  await page.waitForTimeout(400);
  await page.tap('.mobile-tabbar [data-sheet="props"]');
  await page.evaluate(() => {
    const a = window.__luzmap;
    const s = a.store.surfaces.find((x) => x.name === 'Porta');
    a.store.select(s.id);
  });
  await page.waitForTimeout(500);
  await settle(page, 0.4);
  await shot(page, '25-celular-propriedades.jpg');
  await ctx.close();
}

// ------------------------------------------------------------------ installing as an app
{
  const { ctx, page } = await open({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  await page.evaluate(() => {
    localStorage.removeItem('luzmap.installBannerUntil');
    window.__luzmap.installer.maybeShowBanner();
  });
  await page.waitForTimeout(500);
  await shot(page, '27-instalar-banner.jpg');
  await page.evaluate(() => window.__luzmap.installer.hideBanner());
  await page.evaluate(() => window.__luzmap.installer.showGuide('ios'));
  await page.waitForTimeout(400);
  await shot(page, '28-instalar-iphone.jpg', { el: '.modal' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__luzmap.installer.showGuide('android'));
  await page.waitForTimeout(400);
  await shot(page, '29-instalar-android.jpg', { el: '.modal' });
  await ctx.close();
}

await browser.close();
server.close();
