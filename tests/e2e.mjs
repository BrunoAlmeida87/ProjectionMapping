// End-to-end tests with Playwright (pre-installed Chromium).
// Run: node tests/e2e.mjs   — serves the site under a GitHub-Pages-like
// sub-path (/ProjectionMapping/) and exercises desktop + mobile flows.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, devices } from '../tools/pw.mjs';
import { startServer } from '../tools/serve.mjs';

const BASE = '/ProjectionMapping/';
const PORT = 8190;
const URL0 = `http://localhost:${PORT}${BASE}index.html?nosw`;
const results = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luzmap-e2e-'));

function makeFixtures() {
  const out = {};
  // 64x64 PNG: left half red, right half blue (written by a tiny encoder via ffmpeg if available)
  try {
    out.png = path.join(tmp, 'teste.png');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=32x64,format=rgb24', '-f', 'lavfi', '-i', 'color=c=blue:s=32x64,format=rgb24', '-filter_complex', '[0][1]hstack', '-frames:v', '1', out.png]);
    out.webm = path.join(tmp, 'teste.webm');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=3', '-c:v', 'libvpx', '-b:v', '400k', out.webm]);
    out.mp4 = path.join(tmp, 'teste.mp4');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out.mp4]);
    out.gif = path.join(tmp, 'teste.gif');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=96x64:r=10:d=1', out.gif]);
  } catch (err) {
    console.warn('ffmpeg indisponível — testes de mídia limitados', err.message);
  }
  return out;
}

async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: err.message });
    console.log(`  ✗ ${name}\n      ${String(err.message).split('\n').join('\n      ')}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function openApp(browser, ctxOpts = {}, { welcomed = true, url = URL0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...ctxOpts });
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => failed.push(`failed ${r.url()} ${r.failure()?.errorText}`));
  if (welcomed) await ctx.addInitScript(() => localStorage.setItem('luzmap.welcomed', 'true'));
  await page.goto(url);
  await page.waitForFunction(() => window.__luzmap && window.__luzmap.editor && window.__luzmap.store, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  return { ctx, page, errors, failed };
}

const vpBox = (page) => page.locator('#viewport').boundingBox();
const world2page = async (page, p) => {
  const vp = await vpBox(page);
  const s = await page.evaluate((pt) => window.__luzmap.editor.toScreen(pt), p);
  return [vp.x + s[0], vp.y + s[1]];
};

/** Renders the current project offscreen and samples pixels at output-normalized points. */
async function samplePixels(page, points, { t = 1, w = 640, h = 360 } = {}) {
  return page.evaluate(
    async ({ points, t, w, h }) => {
      const { Renderer } = await import('./js/renderer.js');
      const app = window.__luzmap;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const r = new Renderer(c, { media: app.media, quality: 1, preserveDrawingBuffer: true, antialias: false });
      r.render({ project: app.store.project, t, clock: t, stage: { x: 0, y: 0, w, h } });
      const gl = r.gl;
      const out = points.map(([x, y]) => {
        const px = new Uint8Array(4);
        gl.readPixels(Math.floor(x * w), Math.floor((1 - y) * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return [...px];
      });
      const stats = { ...r.stats };
      r.dispose();
      return { out, stats };
    },
    { points, t, w, h },
  );
}

const cdpSessions = new WeakMap();
async function cdpTouch(page, type, points) {
  let client = cdpSessions.get(page);
  if (!client) {
    client = await page.context().newCDPSession(page);
    cdpSessions.set(page, client);
  }
  await client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i + 1 })) });
}

const main = async () => {
  const fx = makeFixtures();
  const server = await startServer({ port: PORT, base: BASE });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

  console.log('\nDesktop (1440×900) — servido em sub-caminho ' + BASE);
  let { ctx, page, errors, failed } = await openApp(browser);

  await test('carrega sem backend, sem erros no console e sem recursos 404', async () => {
    await page.waitForTimeout(800);
    assert(errors.length === 0, `erros: ${errors.join(' | ')}`);
    assert(failed.length === 0, `falhas: ${failed.join(' | ')}`);
    const ok = await page.evaluate(() => window.__luzmap.renderer.ok);
    assert(ok, 'WebGL não iniciou');
  });

  await test('todos os caminhos são relativos (funciona sob /ProjectionMapping/)', async () => {
    const abs = await page.evaluate(() => [...document.querySelectorAll('[src],[href]')].map((n) => n.getAttribute('src') || n.getAttribute('href')).filter((u) => u && u.startsWith('/')));
    assert(abs.length === 0, `caminhos absolutos: ${abs.join(', ')}`);
  });

  await test('cria superfícies: retângulo, quadrilátero, triângulo, polígono, círculo, elipse, malha e máscara', async () => {
    const vp = await vpBox(page);
    const P = (x, y) => [vp.x + vp.width * x, vp.y + vp.height * y];
    const drag = async (tool, a, b) => {
      await page.keyboard.press(tool);
      await page.mouse.move(...P(...a));
      await page.mouse.down();
      await page.mouse.move(...P(...b), { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(60);
    };
    const clicks = async (tool, pts, close = false) => {
      await page.keyboard.press(tool);
      for (const p of pts) {
        await page.mouse.click(...P(...p));
        await page.waitForTimeout(40);
      }
      if (close) await page.mouse.click(...P(...pts[0]));
      await page.waitForTimeout(60);
    };
    await drag('r', [0.3, 0.2], [0.42, 0.35]);
    await clicks('q', [[0.5, 0.2], [0.62, 0.22], [0.6, 0.36], [0.48, 0.34]]);
    await clicks('t', [[0.7, 0.2], [0.78, 0.36], [0.64, 0.36]]);
    await clicks('p', [[0.3, 0.45], [0.38, 0.42], [0.42, 0.52], [0.34, 0.58], [0.28, 0.53]], true);
    await drag('c', [0.48, 0.45], [0.56, 0.55]);
    await drag('e', [0.62, 0.45], [0.75, 0.55]);
    await drag('w', [0.3, 0.62], [0.45, 0.75]);
    await clicks('m', [[0.55, 0.62], [0.65, 0.62], [0.62, 0.74]], true);
    const types = await page.evaluate(() => window.__luzmap.store.surfaces.map((s) => `${s.type}:${s.role}`));
    const expect = ['rect:content', 'quad:content', 'triangle:content', 'polygon:content', 'circle:content', 'ellipse:content', 'mesh:content', 'polygon:mask'];
    assert(JSON.stringify(types) === JSON.stringify(expect), `tipos: ${types.join(', ')}`);
  });

  await test('arrasta um vértice sem mover os outros', async () => {
    await page.keyboard.press('v');
    await page.evaluate(() => window.__luzmap.store.select(window.__luzmap.store.surfaces[1].id));
    const before = await page.evaluate(() => JSON.parse(JSON.stringify(window.__luzmap.store.surfaces[1].points)));
    const [x, y] = await world2page(page, before[2]);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 37, y + 23, { steps: 6 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__luzmap.store.surfaces[1].points);
    assert(Math.abs(after[2][0] - before[2][0]) > 0.005, 'vértice não se moveu');
    for (const i of [0, 1, 3]) assert(after[i][0] === before[i][0] && after[i][1] === before[i][1], `vértice ${i} mudou`);
  });

  await test('ajuste fino por teclado (setas) e campos numéricos', async () => {
    await page.evaluate(() => {
      const a = window.__luzmap;
      a.store.select(a.store.surfaces[1].id, { vertex: 0 });
    });
    const x0 = await page.evaluate(() => window.__luzmap.store.surfaces[1].points[0][0] * 1920);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    const x1 = await page.evaluate(() => window.__luzmap.store.surfaces[1].points[0][0] * 1920);
    assert(Math.abs(x1 - x0 - 11) < 1e-6, `deslocamento ${x1 - x0}px (esperado 11px)`);
  });

  await test('desfazer / refazer', async () => {
    const n = await page.evaluate(() => window.__luzmap.store.surfaces.length);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(50);
    const n1 = await page.evaluate(() => window.__luzmap.store.surfaces.length);
    await page.keyboard.press('Control+z');
    const n2 = await page.evaluate(() => window.__luzmap.store.surfaces.length);
    await page.keyboard.press('Control+Shift+z');
    const n3 = await page.evaluate(() => window.__luzmap.store.surfaces.length);
    await page.keyboard.press('Control+z');
    assert(n1 === n - 1 && n2 === n && n3 === n - 1, `${n} ${n1} ${n2} ${n3}`);
  });

  await test('correção de perspectiva real (homografia): marcadores seguem a projeção', async () => {
    await page.evaluate(async () => {
      const a = window.__luzmap;
      const { createProject, createSurface, effectContent } = await import('./js/state.js');
      const p = createProject();
      p.surfaces.push(createSurface('quad', [[0.1, 0.1], [0.9, 0.3], [0.85, 0.7], [0.15, 0.95]], { content: effectContent('grid') }));
      a.store.setProject(p);
    });
    const pts = await page.evaluate(async () => {
      const { squareToQuad, applyH } = await import('./js/mapping.js');
      const H = squareToQuad(window.__luzmap.store.surfaces[0].points);
      return { tl: applyH(H, 0.04, 0.04), br: applyH(H, 0.96, 0.96), tr: applyH(H, 0.96, 0.04), center: applyH(H, 0.5, 0.5) };
    });
    const { out } = await samplePixels(page, [pts.tl, pts.br, pts.tr, pts.center]);
    const [tl, br, tr, c] = out;
    assert(tl[0] > 180 && tl[1] < 120 && tl[2] < 120, `canto superior esquerdo deveria ser vermelho: ${tl}`);
    assert(br[2] > 180 && br[0] < 150, `canto inferior direito deveria ser azul: ${br}`);
    assert(tr[1] > 180 && tr[0] < 150, `canto superior direito deveria ser verde: ${tr}`);
    assert(c[0] > 200 && c[1] > 200 && c[2] > 200, `centro projetivo (cruzamento das diagonais) deveria ser branco: ${c}`);
  });

  await test('máscaras ocultam o que está abaixo (normal e invertida)', async () => {
    await page.evaluate(async () => {
      const { createProject, createSurface, effectContent } = await import('./js/state.js');
      const { rectPoints } = await import('./js/mapping.js');
      const p = createProject();
      p.surfaces.push(createSurface('quad', rectPoints(0, 0, 1, 1), { content: effectContent('solid') }));
      p.surfaces.push(createSurface('rect', rectPoints(0.4, 0.4, 0.2, 0.2), { role: 'mask' }));
      window.__luzmap.store.setProject(p);
    });
    let { out } = await samplePixels(page, [[0.5, 0.5], [0.2, 0.2]]);
    assert(out[0][0] < 10 && out[1][0] > 240, `máscara normal: dentro ${out[0]} fora ${out[1]}`);
    await page.evaluate(() => {
      window.__luzmap.store.surfaces[1].invert = true;
      window.__luzmap.store.changed('props');
    });
    ({ out } = await samplePixels(page, [[0.5, 0.5], [0.2, 0.2]]));
    assert(out[0][0] > 240 && out[1][0] < 10, `máscara invertida: dentro ${out[0]} fora ${out[1]}`);
  });

  await test('efeitos animados na GPU (frames diferentes ao longo do tempo) e múltiplas superfícies simultâneas', async () => {
    await page.evaluate(async () => {
      const { createProject, createSurface, effectContent } = await import('./js/state.js');
      const { rectPoints } = await import('./js/mapping.js');
      const p = createProject();
      ['water', 'fire', 'galaxy', 'portal'].forEach((fx, i) => p.surfaces.push(createSurface('quad', rectPoints((i % 2) * 0.5, Math.floor(i / 2) * 0.5, 0.5, 0.5), { content: effectContent(fx) })));
      window.__luzmap.store.setProject(p);
    });
    const pts = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
    const a = await samplePixels(page, pts, { t: 1 });
    const b = await samplePixels(page, pts, { t: 2.3 });
    assert(a.stats.surfaces === 4, `superfícies desenhadas: ${a.stats.surfaces}`);
    const diff = a.out.filter((px, i) => px.some((v, k) => Math.abs(v - b.out[i][k]) > 3)).length;
    assert(diff >= 3, `apenas ${diff} efeitos mudaram entre t=1 e t=2.3`);
  });

  await test('todos os 23 efeitos compilam (WebGL)', async () => {
    const errs = await page.evaluate(async () => {
      const { Renderer } = await import('./js/renderer.js');
      const c = document.createElement('canvas');
      const r = new Renderer(c, { quality: 2 });
      r.warmup();
      const e = [...r.errors.keys()];
      r.dispose();
      return e;
    });
    assert(errs.length === 0, `falharam: ${errs.join(', ')}`);
  });

  if (fx.png) {
    await test('importa imagem (PNG) e projeta na superfície', async () => {
      await page.evaluate(() => window.__luzmap.newProject({ silent: true }));
      await page.evaluate(() => window.__luzmap.addDefaultSurface());
      await page.evaluate(() => {
        const s = window.__luzmap.store.selected;
        s.points = [[0, 0], [1, 0], [1, 1], [0, 1]];
        s.transform.fit = 'stretch';
      });
      await page.click('[data-tab="media"]');
      await page.setInputFiles('#panel-media input[type=file]', fx.png);
      await page.waitForFunction(() => Object.values(window.__luzmap.store.project.media).some((m) => m.kind === 'image'), null, { timeout: 8000 });
      await page.waitForTimeout(300);
      const s = await page.evaluate(() => window.__luzmap.store.selected.content);
      assert(s.type === 'media', `conteúdo: ${JSON.stringify(s)}`);
      const { out } = await samplePixels(page, [[0.25, 0.5], [0.75, 0.5]]);
      assert(out[0][0] > 200 && out[0][2] < 60, `metade esquerda deveria ser vermelha: ${out[0]}`);
      assert(out[1][2] > 200 && out[1][0] < 60, `metade direita deveria ser azul: ${out[1]}`);
    });
  }

  if (fx.webm) {
    await test('importa vídeo (WebM) e reproduz em loop sincronizado à timeline', async () => {
      await page.setInputFiles('#panel-media input[type=file]', fx.webm);
      await page.waitForFunction(() => Object.values(window.__luzmap.store.project.media).some((m) => m.kind === 'video'), null, { timeout: 15000 });
      const id = await page.evaluate(() => Object.values(window.__luzmap.store.project.media).find((m) => m.kind === 'video').id);
      await page.evaluate((mid) => window.__luzmap.applyMedia(mid), id);
      await page.evaluate(() => window.__luzmap.transport.play());
      const t0 = await page.evaluate((mid) => window.__luzmap.media.get(mid).el.currentTime, id);
      await page.waitForTimeout(1200);
      const st = await page.evaluate((mid) => {
        const it = window.__luzmap.media.get(mid);
        return { t: it.el.currentTime, paused: it.el.paused, status: it.status, w: it.width };
      }, id);
      assert(st.status === 'ready' && st.w === 320, `status ${JSON.stringify(st)}`);
      assert(st.t !== t0 && !st.paused, `vídeo não avançou: ${t0} -> ${st.t}`);
    });
  }

  if (fx.mp4) {
    await test('MP4 H.264: suporte depende do navegador (informado, sem falha silenciosa)', async () => {
      await page.setInputFiles('#panel-media input[type=file]', fx.mp4);
      await page.waitForFunction(() => Object.values(window.__luzmap.store.project.media).filter((m) => m.kind === 'video').length >= 2, null, { timeout: 15000 });
      const st = await page.evaluate(() => {
        const ms = Object.values(window.__luzmap.store.project.media).filter((m) => m.kind === 'video');
        const it = window.__luzmap.media.get(ms[ms.length - 1].id);
        return { status: it.status, error: it.error || '' };
      });
      console.log(`      (MP4 neste Chromium de teste: ${st.status}${st.error ? ' — ' + st.error : ''})`);
      assert(st.status === 'ready' || (st.status === 'error' && st.error.length > 0), 'estado inconsistente');
    });
  }

  if (fx.gif) {
    await test('importa GIF (animado quando o navegador tem ImageDecoder)', async () => {
      await page.setInputFiles('#panel-media input[type=file]', fx.gif);
      await page.waitForFunction(() => Object.values(window.__luzmap.store.project.media).some((m) => m.kind === 'gif'), null, { timeout: 10000 });
      const st = await page.evaluate(() => {
        const m = Object.values(window.__luzmap.store.project.media).find((x) => x.kind === 'gif');
        const it = window.__luzmap.media.get(m.id);
        return { status: it.status, frames: it.frames ? it.frames.length : 1, hasDecoder: typeof ImageDecoder !== 'undefined' };
      });
      assert(st.status === 'ready', JSON.stringify(st));
      if (st.hasDecoder) assert(st.frames > 1, `GIF deveria ter vários quadros: ${st.frames}`);
    });
  }

  await test('salva no IndexedDB e recupera a sessão após recarregar', async () => {
    await page.evaluate(async () => {
      const a = window.__luzmap;
      a.store.project.name = 'Projeto E2E';
      await a.saveNow(true);
    });
    const id = await page.evaluate(() => window.__luzmap.store.project.id);
    const n = await page.evaluate(() => window.__luzmap.store.surfaces.length);
    await page.reload();
    await page.waitForFunction(() => window.__luzmap && window.__luzmap.store);
    await page.waitForTimeout(1500);
    const st = await page.evaluate(() => ({ id: window.__luzmap.store.project.id, name: window.__luzmap.store.project.name, n: window.__luzmap.store.surfaces.length, media: Object.keys(window.__luzmap.store.project.media).map((m) => window.__luzmap.media.status(m)) }));
    assert(st.id === id && st.name === 'Projeto E2E' && st.n === n, JSON.stringify(st));
    assert(st.media.every((s) => s === 'ready' || s === 'error'), `mídias: ${st.media}`);
  });

  await test('exporta e importa projeto em JSON', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.__luzmap.exportProject())]);
    const file = path.join(tmp, 'export.luzmap.json');
    await download.saveAs(file);
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert(json.format === 'luzmap-project' && json.project.surfaces.length >= 1, 'JSON inválido');
    await page.evaluate(() => window.__luzmap.newProject({ silent: true }));
    await page.click('#btn-projects');
    await page.setInputFiles('.modal input[type=file]', file);
    await page.waitForFunction((n) => window.__luzmap.store.surfaces.length === n, json.project.surfaces.length, { timeout: 5000 });
  });

  await test('projeto importado sem a mídia indica que é preciso reimportar', async () => {
    const msg = await page.evaluate(async () => {
      const { createProject, createSurface } = await import('./js/state.js');
      const p = createProject({ name: 'Sem mídia' });
      p.media.m_fake = { id: 'm_fake', name: 'video-sumido.mp4', kind: 'video' };
      const s = createSurface('quad', [[0.1, 0.1], [0.4, 0.1], [0.4, 0.4], [0.1, 0.4]]);
      s.content = { type: 'media', mediaId: 'm_fake' };
      p.surfaces.push(s);
      await window.__luzmap.loadProject(p);
      return [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' ');
    });
    assert(/importe/i.test(msg), `aviso não encontrado: ${msg}`);
  });

  await test('janela de saída do projetor abre, sincroniza e não mostra interface', async () => {
    await page.evaluate(async () => {
      const { createProject, createSurface, effectContent } = await import('./js/state.js');
      const p = createProject();
      p.surfaces.push(createSurface('quad', [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]], { content: effectContent('solid') }));
      window.__luzmap.store.setProject(p);
    });
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.evaluate(() => window.__luzmap.openOutput({ forceWindow: true }))]);
    await popup.waitForFunction(() => window.__luzmapOutput && window.__luzmapOutput.connected && window.__luzmapOutput.project, null, { timeout: 10000 });
    const n = await popup.evaluate(() => window.__luzmapOutput.project.surfaces.length);
    assert(n === 1, `superfícies na saída: ${n}`);
    const t0 = Date.now();
    await page.evaluate(() => {
      const s = window.__luzmap.store.surfaces[0];
      s.points = s.points.map(([x, y]) => [x + 0.1, y]);
      window.__luzmap.store.changed('geometry');
    });
    await popup.waitForFunction(() => Math.abs(window.__luzmapOutput.project.surfaces[0].points[0][0] - 0.3) < 1e-6, null, { timeout: 3000 });
    const latency = Date.now() - t0;
    console.log(`      (latência editor → saída: ${latency} ms)`);
    const uiCount = await popup.evaluate(() => document.querySelectorAll('.toolbar, .panel, .topbar').length);
    assert(uiCount === 0, 'saída contém elementos de interface');
    await popup.close();
  });

  await test('saída limpa na mesma tela esconde toda a interface', async () => {
    await page.evaluate(() => window.__luzmap.enterCleanOutput());
    await page.waitForTimeout(300);
    const vis = await page.evaluate(() => ['.topbar', '.toolbar', '#inspector', '.timeline'].map((s) => getComputedStyle(document.querySelector(s)).display));
    assert(vis.every((d) => d === 'none'), `visíveis: ${vis}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert(!(await page.evaluate(() => document.body.classList.contains('clean-output'))), 'não saiu do modo limpo');
  });

  await test('calibração: padrões de teste, contornos e assistente de 6 passos', async () => {
    await page.click('#btn-calibrate');
    await page.waitForSelector('.cal-dock:not([hidden])');
    for (let i = 0; i < 5; i++) await page.click('.cal-nav .btn.primary');
    const step = await page.evaluate(() => document.querySelector('.cal-body h4').textContent);
    assert(/^6\./.test(step), `passo final: ${step}`);
    await page.evaluate(() => {
      window.__luzmap.calibration.pattern = 'white';
      window.__luzmap.sessionChanged();
    });
    const { out } = await samplePixels(page, [[0.05, 0.05]]).catch(() => ({ out: [[0]] }));
    // samplePixels renders without calibration (offscreen); check the live renderer instead:
    const cal = await page.evaluate(() => window.__luzmap.calibrationForRender());
    assert(cal && cal.pattern === 'white', 'padrão não aplicado');
    await page.evaluate(() => window.__luzmap.calDock.close());
    void out;
  });

  await test('modo DEMO executa as 7 cenas residenciais', async () => {
    await page.click('#btn-demo');
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => ({ active: window.__luzmap.demo.active, n: window.__luzmap.store.surfaces.length, caption: document.querySelector('.demo-caption h3')?.textContent }));
    assert(info.active && info.n === 9 && info.caption === 'Calibração', JSON.stringify(info));
    const scenes = [];
    for (const t of [9, 17, 25, 33, 41, 51]) {
      await page.evaluate((tt) => window.__luzmap.seek(tt), t);
      await page.waitForTimeout(250);
      scenes.push(await page.evaluate(() => document.querySelector('.demo-caption h3').textContent));
    }
    assert(scenes.join('|') === 'Mapping geométrico|Água|Portal|Galáxia|Projeção simultânea|Finalização', scenes.join('|'));
    const { stats } = await samplePixels(page, [[0.5, 0.5]], { t: 45 });
    assert(stats.surfaces >= 6, `superfícies simultâneas: ${stats.surfaces}`);
  });

  await test('grava a saída em vídeo (MediaRecorder) quando suportado', async () => {
    const res = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const a = window.__luzmap;
          const fmts = a.recorder.constructor.name && window.MediaRecorder ? MediaRecorder.isTypeSupported('video/webm') : false;
          if (!fmts) return resolve({ skipped: true });
          const off = a.recorder.on('done', (r) => {
            off();
            resolve({ size: r.blob.size, type: r.blob.type, label: r.format.label });
          });
          a.recorder.start({ width: 320, height: 180, fps: 24, duration: 1.5, source: 'simulation' });
        }),
    );
    if (res.skipped) {
      console.log('      (MediaRecorder indisponível — pulado)');
      return;
    }
    assert(res.size > 1000, `arquivo vazio: ${JSON.stringify(res)}`);
    console.log(`      (${res.label}, ${res.size} bytes)`);
    await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove()));
  });

  await test('sai da demo e restaura o projeto anterior', async () => {
    await page.evaluate(() => window.__luzmap.demo.stop());
    const n = await page.evaluate(() => window.__luzmap.store.surfaces.length);
    assert(n === 1, `superfícies após sair: ${n}`);
  });

  await test('sem erros críticos no console durante toda a sessão desktop', async () => {
    const crit = errors.filter((e) => !/NotSupportedError|no supported source|MEDIA_ERR/i.test(e));
    assert(crit.length === 0, crit.join(' | '));
  });
  await ctx.close();

  // ------------------------------------------------------------------ other screen sizes
  console.log('\nNotebook, monitor Full HD e tablets (layout)');
  for (const [label, opts] of [
    ['Notebook 1366×768', { viewport: { width: 1366, height: 768 } }],
    ['Monitor Full HD 1920×1080', { viewport: { width: 1920, height: 1080 } }],
    ['iPad Pro 11 vertical', { ...devices['iPad Pro 11'], deviceScaleFactor: 1 }],
    ['iPad Pro 11 horizontal', { ...devices['iPad Pro 11 landscape'], deviceScaleFactor: 1 }],
    ['Galaxy Tab S4', { ...devices['Galaxy Tab S4'], deviceScaleFactor: 1 }],
  ]) {
    const o = await openApp(browser, opts);
    await test(`${label}: sem sobreposição/rolagem e controles principais visíveis`, async () => {
      await o.page.evaluate(() => window.__luzmap.addDefaultSurface());
      await o.page.waitForTimeout(300);
      const m = await o.page.evaluate(() => {
        const vis = (s) => {
          const e = document.querySelector(s);
          if (!e) return false;
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.top >= -1;
        };
        const v = document.querySelector('#viewport').getBoundingClientRect();
        return { sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight, viewport: v.width > 200 && v.height > 150, demo: vis('#btn-demo'), out: vis('#btn-output'), tools: vis('.toolbar') };
      });
      assert(m.sw <= m.iw && m.sh <= m.ih, `rolagem ${m.sw}x${m.sh} > ${m.iw}x${m.ih}`);
      assert(m.viewport && m.demo && m.out && m.tools, JSON.stringify(m));
      assert(o.errors.length === 0, o.errors.join(' | '));
    });
    await o.ctx.close();
  }

  // ------------------------------------------------------------------ mobile
  for (const [devName, landscape] of [
    ['iPhone 13', false],
    ['Pixel 7', false],
    ['iPhone 13', true],
  ]) {
    console.log(`\n${devName} ${landscape ? 'horizontal' : 'vertical'} (toque)`);
    const d = { ...devices[devName] };
    if (landscape) d.viewport = { width: d.viewport.height, height: d.viewport.width };
    ({ ctx, page, errors } = await openApp(browser, { ...d, deviceScaleFactor: 1 }));

    await test('layout responsivo sem rolagem horizontal e com controles acessíveis', async () => {
      const m = await page.evaluate(() => {
        const vis = (s) => {
          const e = document.querySelector(s);
          if (!e) return false;
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.left >= -1;
        };
        return { sw: document.documentElement.scrollWidth, iw: innerWidth, tabbar: vis('.mobile-tabbar'), toolbar: vis('.toolbar'), demo: vis('#btn-demo'), out: vis('#btn-output') };
      });
      assert(m.sw <= m.iw, `rolagem horizontal ${m.sw} > ${m.iw}`);
      assert(m.tabbar && m.toolbar && m.demo && m.out, JSON.stringify(m));
    });

    await test('toque seleciona superfície e arrasta o vértice com o dedo', async () => {
      await page.evaluate(() => {
        const a = window.__luzmap;
        const s = a.addDefaultSurface();
        a.store.select(null);
        return s.id;
      });
      const c = await page.evaluate(() => {
        const s = window.__luzmap.store.surfaces[0];
        return [(s.points[0][0] + s.points[2][0]) / 2, (s.points[0][1] + s.points[2][1]) / 2];
      });
      const [cx, cy] = await world2page(page, c);
      await page.touchscreen.tap(cx, cy);
      await page.waitForTimeout(150);
      const sel = await page.evaluate(() => !!window.__luzmap.store.selected);
      assert(sel, 'toque não selecionou');
      const p0 = await page.evaluate(() => window.__luzmap.store.selected.points[1].slice());
      const [x, y] = await world2page(page, p0);
      await cdpTouch(page, 'touchStart', [[x, y]]);
      for (let i = 1; i <= 6; i++) await cdpTouch(page, 'touchMove', [[x + i * 5, y + i * 4]]);
      await cdpTouch(page, 'touchEnd', []);
      const p1 = await page.evaluate(() => window.__luzmap.store.selected.points[1]);
      assert(Math.abs(p1[0] - p0[0]) > 0.003, `vértice não se moveu: ${p0} -> ${p1}`);
    });

    await test('pinça faz zoom sem editar a geometria', async () => {
      const before = await page.evaluate(() => ({ z: window.__luzmap.editor.view.zoom, pts: JSON.stringify(window.__luzmap.store.surfaces[0].points) }));
      const vp = await vpBox(page);
      const cx = vp.x + vp.width / 2;
      const cy = vp.y + vp.height * 0.3;
      await cdpTouch(page, 'touchStart', [[cx - 30, cy], [cx + 30, cy]]);
      for (let i = 1; i <= 6; i++) await cdpTouch(page, 'touchMove', [[cx - 30 - i * 12, cy], [cx + 30 + i * 12, cy]]);
      await cdpTouch(page, 'touchEnd', []);
      const after = await page.evaluate(() => ({ z: window.__luzmap.editor.view.zoom, pts: JSON.stringify(window.__luzmap.store.surfaces[0].points) }));
      assert(after.z > before.z * 1.5, `zoom ${before.z} -> ${after.z}`);
      assert(after.pts === before.pts, 'pinça alterou a geometria');
      await page.evaluate(() => window.__luzmap.editor.fitView());
    });

    await test('painéis deslizantes abrem e fecham', async () => {
      for (const s of ['effects', 'props', 'timeline', 'media', 'layers']) {
        await page.tap(`.mobile-tabbar [data-sheet="${s}"]`);
        await page.waitForTimeout(320);
        const open = await page.evaluate((name) => document.body.dataset.sheet === name, s);
        assert(open, `painel ${s} não abriu`);
      }
      await page.tap('.mobile-tabbar [data-sheet="layers"]');
      await page.waitForTimeout(320);
      assert(await page.evaluate(() => !document.body.dataset.sheet), 'painel não fechou');
    });

    await test('demo funciona no celular', async () => {
      await page.tap('#btn-demo');
      await page.waitForTimeout(800);
      await page.evaluate(() => window.__luzmap.seek(41));
      await page.waitForTimeout(300);
      const cap = await page.evaluate(() => window.__luzmap.demo.active && document.querySelector('.demo-caption h3').textContent);
      assert(cap === 'Projeção simultânea', String(cap));
      await page.evaluate(() => window.__luzmap.demo.stop());
    });

    await test('saída limpa no celular + limitações informadas', async () => {
      await page.tap('#btn-output');
      await page.waitForSelector('.output-menu');
      const txt = await page.evaluate(() => document.querySelector('.output-menu').textContent);
      assert(/espelh/i.test(txt), 'aviso sobre espelhamento ausente');
      await page.evaluate(() => [...document.querySelectorAll('.output-menu .big-option')].find((b) => /Saída limpa/.test(b.textContent)).click());
      await page.waitForTimeout(300);
      assert(await page.evaluate(() => document.body.classList.contains('clean-output')), 'não entrou na saída limpa');
      await page.evaluate(() => window.__luzmap.exitCleanOutput());
    });

    await test('sem erros no console', async () => {
      assert(errors.length === 0, errors.join(' | '));
    });
    await ctx.close();
  }

  await browser.close();
  server.close();
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} testes passaram.`);
  fs.mkdirSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'results'), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'results', 'e2e-results.json'), JSON.stringify({ date: new Date().toISOString(), browser: 'Chromium (Playwright, headless, SwiftShader)', results }, null, 2));
  process.exit(ok === results.length ? 0 : 1);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
