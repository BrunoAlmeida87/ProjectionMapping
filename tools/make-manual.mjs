// Builds docs/manual/Manual-LuzMap.pdf from docs/manual/MANUAL.md.
// Requires pandoc (Markdown -> HTML), Chromium via Playwright (HTML -> PDF),
// pdftotext (page numbers for the table of contents) and python3 + pypdf (merge).
// Usage: node tools/make-manual.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANUAL_DIR = path.join(ROOT, 'docs', 'manual');
const SRC = path.join(MANUAL_DIR, 'MANUAL.md');
const OUT = path.join(MANUAL_DIR, 'Manual-LuzMap.pdf');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luzmap-manual-'));
const VERSION = '1.0';
const DATE = 'Novembro de 2026';

// ---------------------------------------------------------------- Markdown -> HTML
let html = execFileSync('pandoc', ['-f', 'gfm', '-t', 'html5', '--wrap=none', SRC], { encoding: 'utf8' });

// Intro (before the first horizontal rule) becomes "Sobre este manual".
const firstHr = html.indexOf('<hr />');
let intro = html.slice(0, firstHr);
html = html.slice(firstHr);
intro = intro.replace(/<h1[^>]*>.*?<\/h1>\s*/, '').replace(/<p><strong>Projection mapping no navegador[^<]*<\/strong><\/p>\s*/, '');
html = html.replace(/<hr \/>\s*/g, '');

// GitHub-style alerts -> callout boxes
const LABELS = { NOTE: 'Observação', TIP: 'Dica', IMPORTANT: 'Importante', WARNING: 'Atenção', CAUTION: 'Cuidado' };
const callouts = (s) =>
  s.replace(/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/g, (_, t) => `<blockquote class="callout ${t.toLowerCase()}"><p class="callout-title">${LABELS[t]}</p><p>`);
// Image paragraph + italic caption -> figure
const figures = (s) =>
  s.replace(/<p>(<img [^>]+\/>)<\/p>\s*<p><em>(Figura[^<]*(?:<[^/][^>]*>[^<]*<\/[^>]+>[^<]*)*)<\/em><\/p>/g, (_, img, cap) => `<figure>${img}<figcaption>${cap}</figcaption></figure>`);
// Tables of images -> image grid; following italic caption attached
const grids = (s) =>
  s.replace(/<table>([\s\S]*?)<\/table>\s*(?:<p><em>(Figura[^<]*)<\/em><\/p>)?/g, (m, inner, cap) => {
    if (!inner.includes('<img')) return m;
    return `<figure class="grid"><table class="imgrid">${inner}</table>${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
  });
// Wide tables get a compact style
const compact = (s) => s.replace(/<table>/g, '<table class="data">');

html = compact(grids(figures(callouts(html))));
intro = callouts(intro);

// Parts (h1) and chapters (h2) for the table of contents
const headings = [];
html = html.replace(/<h([12]) id="([^"]+)">(.*?)<\/h\1>/g, (m, lvl, id, text) => {
  const plain = text.replace(/<[^>]+>/g, '');
  headings.push({ lvl: +lvl, id, text: plain });
  if (lvl === '1') {
    const mm = /^Parte (\d+) — (.*)$/.exec(plain);
    return `<h1 id="${id}" class="part"><span class="part-num">Parte ${mm ? mm[1] : ''}</span><span class="part-title">${mm ? mm[2] : plain}</span></h1>`;
  }
  return m;
});

function tocHtml(pages) {
  const rows = headings
    .map((h, i) => {
      const pg = pages ? pages[i] ?? '' : '00';
      return `<li class="toc-${h.lvl}"><a href="#${h.id}"><span class="toc-text">${h.text}</span><span class="toc-dots"></span><span class="toc-page">${pg}</span></a></li>`;
    })
    .join('\n');
  return `<section class="toc"><h1 class="toc-title">Sumário</h1><ol>${rows}</ol><span class="toc-end">§TOCEND§</span></section>`;
}

const CSS = `
@page { size: A4; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: Inter, 'Segoe UI', Arial, sans-serif; font-size: 10.2pt; line-height: 1.55; color: #1f2430; }
h1, h2, h3 { color: #0f1222; line-height: 1.25; break-after: avoid; }
h1.part { break-before: page; margin: 0 0 18pt; padding: 26mm 0 10mm; border-bottom: 3px solid; border-image: linear-gradient(90deg, #22d3ee, #7c5cff, #ff2bd6) 1; display: flex; flex-direction: column; gap: 6pt; }
.part-num { font-size: 12pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #7c5cff; }
.part-title { font-size: 28pt; font-weight: 800; }
h2 { font-size: 16pt; margin: 22pt 0 8pt; padding-top: 6pt; border-top: 1px solid #e5e7eb; }
h1.part + h2 { border-top: 0; margin-top: 6pt; }
h3 { font-size: 12pt; margin: 14pt 0 6pt; color: #4c1d95; }
p { margin: 0 0 7pt; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 8pt; padding-left: 18pt; }
li { margin: 2pt 0; }
a { color: #6d28d9; text-decoration: none; }
strong { color: #0f1222; }
code { font-family: 'DejaVu Sans Mono', Consolas, monospace; font-size: 8.6pt; background: #f3f0ff; color: #4c1d95; padding: 0.5pt 3pt; border-radius: 3pt; }
pre { background: #0f1222; color: #e5e7eb; padding: 8pt 10pt; border-radius: 6pt; font-size: 7.3pt; line-height: 1.38; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; color: inherit; padding: 0; font-size: inherit; }
table.data { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 9pt; break-inside: auto; }
table.data th { background: #1f1645; color: #fff; text-align: left; padding: 5pt 7pt; font-weight: 700; }
table.data td { padding: 4.5pt 7pt; border-bottom: 1px solid #e7e5f0; vertical-align: top; }
table.data tr:nth-child(even) td { background: #f8f7fc; }
table.data tr { break-inside: avoid; }
figure { margin: 8pt 0 12pt; text-align: center; break-inside: avoid; }
figure img { max-width: 100%; max-height: 118mm; border-radius: 6pt; box-shadow: 0 1pt 5pt rgba(15,18,34,.25); }
figure img[src$=".svg"] { box-shadow: none; border-radius: 0; max-height: none; }
figure img[src*="03-ferramentas"] { max-height: 58mm; }
figure img[src*="09-camadas"], figure img[src*="26-projeto-saida"] { max-height: 88mm; }
figcaption { font-size: 8.6pt; color: #6b7280; font-style: italic; margin-top: 5pt; }
figure.grid table { width: 100%; border-collapse: separate; border-spacing: 6pt 0; table-layout: fixed; }
figure.grid th { font-size: 8.6pt; color: #4c1d95; font-weight: 700; padding: 0 0 4pt; }
figure.grid td { vertical-align: top; padding: 0; text-align: center; }
figure.grid img { width: 100%; max-height: 105mm; object-fit: contain; border-radius: 5pt; box-shadow: 0 1pt 4pt rgba(15,18,34,.25); }
.callout { margin: 8pt 0 11pt; padding: 8pt 11pt 6pt; border-radius: 6pt; border-left: 4pt solid; break-inside: avoid; }
.callout p:last-child { margin-bottom: 2pt; }
.callout-title { font-weight: 800; font-size: 8.6pt; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 3pt; }
.callout.tip { background: #ecfeff; border-color: #0891b2; } .callout.tip .callout-title { color: #0e7490; }
.callout.note { background: #f5f3ff; border-color: #7c5cff; } .callout.note .callout-title { color: #5b21b6; }
.callout.important { background: #fdf4ff; border-color: #c026d3; } .callout.important .callout-title { color: #a21caf; }
.callout.warning, .callout.caution { background: #fffbeb; border-color: #d97706; } .callout.warning .callout-title, .callout.caution .callout-title { color: #b45309; }
blockquote:not(.callout) { margin: 8pt 0; padding: 6pt 10pt; border-left: 3pt solid #c4b5fd; color: #4b5563; }
.toc { break-after: page; }
.toc-title { font-size: 24pt; font-weight: 800; margin: 0 0 8pt; padding-bottom: 6pt; border-bottom: 3px solid; border-image: linear-gradient(90deg, #22d3ee, #7c5cff, #ff2bd6) 1; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li { margin: 0; }
.toc a { display: flex; align-items: baseline; color: #1f2430; padding: 0.8pt 0; }
.toc-1 a { font-weight: 800; color: #4c1d95; margin-top: 5pt; font-size: 10.3pt; }
.toc-2 a { padding-left: 12pt; font-size: 9.3pt; }
.toc-dots { flex: 1; border-bottom: 1px dotted #b8b4c8; margin: 0 5pt; transform: translateY(-3pt); }
.toc-page { font-variant-numeric: tabular-nums; min-width: 14pt; text-align: right; }
.toc-end { font-size: 1px; color: #fff; }
.about { break-after: page; }
.about h1 { font-size: 22pt; font-weight: 800; margin: 6mm 0 10pt; }
`;

const COVER = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><base href="${pathToFileURL(MANUAL_DIR).href}/">
<style>
@page { size: A4; margin: 0; }
html, body { margin: 0; height: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Inter, Arial, sans-serif; color: #fff; background: #0b0d12; }
.cover { position: relative; width: 210mm; height: 297mm; overflow: hidden; background: radial-gradient(ellipse at 20% 10%, #2a1a5e 0%, #0b0d12 55%), #0b0d12; }
.hero { position: absolute; left: 0; right: 0; top: 112mm; height: 132mm; background: url('img/capa.jpg') center / cover; opacity: .9; mask-image: linear-gradient(180deg, transparent, #000 18%, #000 75%, transparent); -webkit-mask-image: linear-gradient(180deg, transparent, #000 18%, #000 75%, transparent); }
.top { position: absolute; left: 20mm; right: 20mm; top: 24mm; }
.logo { display: flex; align-items: center; gap: 10pt; font-size: 18pt; font-weight: 700; }
.logo img { width: 34pt; height: 34pt; }
.logo b { color: #67e8f9; }
h1 { font-size: 44pt; line-height: 1.05; margin: 22mm 0 6mm; font-weight: 800; letter-spacing: -.01em; }
h1 span { color: #67e8f9; }
.sub { font-size: 15pt; color: #cbd2e1; max-width: 150mm; line-height: 1.4; }
.bottom { position: absolute; left: 20mm; right: 20mm; bottom: 20mm; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10.5pt; color: #aab2c5; }
.bottom strong { color: #fff; display: block; font-size: 12pt; margin-bottom: 2pt; }
.pill { display: inline-block; margin-top: 8mm; padding: 4pt 11pt; border-radius: 99pt; border: 1px solid #7c5cff; color: #ddd6fe; font-size: 10pt; }
</style></head><body><div class="cover">
<div class="hero"></div>
<div class="top">
  <div class="logo"><img src="../../assets/icons/icon.svg" alt=""><span>Luz<b>Map</b></span></div>
  <h1>Manual do<br><span>LuzMap</span></h1>
  <div class="sub">Projection mapping no navegador, explicado do zero — do primeiro quadrilátero ao funcionamento interno do sistema.</div>
  <div class="pill">Guia do usuário · computador e celular</div>
</div>
<div class="bottom">
  <div><strong>brunoalmeida87.github.io/ProjectionMapping</strong>Software livre · sem cadastro · seus arquivos ficam no seu aparelho</div>
  <div style="text-align:right"><strong>Versão ${VERSION}</strong>${DATE}</div>
</div>
</div></body></html>`;

function bodyDoc(toc) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><base href="${pathToFileURL(MANUAL_DIR).href}/"><title>Manual do LuzMap</title><style>${CSS}</style></head><body>
${toc}
<section class="about"><h1>Sobre este manual</h1>${intro}</section>
${html}
</body></html>`;
}

const FOOTER = `<div style="width:100%;font-family:Inter,Arial,sans-serif;font-size:8px;color:#8b8fa3;padding:0 18mm;display:flex;justify-content:space-between;">
<span>LuzMap — Manual do usuário</span><span><span class="pageNumber"></span></span></div>`;

const browser = await chromium.launch();
const page = await browser.newPage();

async function renderBody(toc, file) {
  const htmlFile = path.join(tmp, 'body.html');
  fs.writeFileSync(htmlFile, bodyDoc(toc));
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: file,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: FOOTER,
    margin: { top: '16mm', bottom: '18mm', left: '18mm', right: '18mm' },
  });
}

// Pass 1: find on which page each heading lands.
const pass1 = path.join(tmp, 'pass1.pdf');
await renderBody(tocHtml(null), pass1);
const text = execFileSync('pdftotext', ['-layout', pass1, '-'], { encoding: 'utf8' });
const pagesText = text.split('\f').map((t) => t.replace(/\s+/g, ' '));
const tocEnd = pagesText.findIndex((t) => t.includes('§TOCEND§'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const pages = headings.map((h) => {
  const needle = norm(h.lvl === 1 ? h.text.replace(/^Parte (\d+) — /, '') : h.text).slice(0, 38);
  for (let i = tocEnd + 1; i < pagesText.length; i++) if (pagesText[i].includes(needle)) return i + 1;
  return '';
});
const missing = headings.filter((h, i) => !pages[i]);
if (missing.length) console.warn('Sem número de página para:', missing.map((h) => h.text).join(' | '));

// Pass 2 with page numbers (same layout, so numbers stay valid).
const bodyPdf = path.join(tmp, 'body.pdf');
await renderBody(tocHtml(pages).replace('<span class="toc-end">§TOCEND§</span>', '<span class="toc-end"></span>'), bodyPdf);

// Cover (no footer)
const coverHtml = path.join(tmp, 'cover.html');
const coverPdf = path.join(tmp, 'cover.pdf');
fs.writeFileSync(coverHtml, COVER);
await page.goto(pathToFileURL(coverHtml).href, { waitUntil: 'load' });
await page.pdf({ path: coverPdf, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
await browser.close();

// Merge cover + body, add metadata and PDF bookmarks (parts > chapters).
const outline = path.join(tmp, 'outline.json');
fs.writeFileSync(outline, JSON.stringify(headings.map((h, i) => ({ lvl: h.lvl, text: h.text, page: pages[i] || null }))));
execFileSync('python3', [
  '-c',
  `import sys, json
from pypdf import PdfWriter, PdfReader
w = PdfWriter()
w.append(PdfReader(sys.argv[1]))
w.append(PdfReader(sys.argv[2]))
w.add_metadata({'/Title': 'Manual do LuzMap', '/Author': 'LuzMap', '/Subject': 'Projection mapping no navegador - guia do usuario', '/Keywords': 'projection mapping, LuzMap, WebGL, projetor, manual'})
items = json.load(open(sys.argv[4], encoding='utf-8'))
w.add_outline_item('Capa', 0)
w.add_outline_item('Sumário', 1)
parent = None
for it in items:
    if not it['page']:
        continue
    idx = it['page']  # body page n (1-based) == merged index n (cover is index 0)
    if it['lvl'] == 1:
        parent = w.add_outline_item(it['text'], idx)
    else:
        w.add_outline_item(it['text'], idx, parent=parent)
w.page_mode = '/UseOutlines'
with open(sys.argv[3], 'wb') as fh:
    w.write(fh)`,
  coverPdf,
  bodyPdf,
  OUT,
  outline,
]);
fs.rmSync(tmp, { recursive: true, force: true });
const n = execFileSync('python3', ['-c', `from pypdf import PdfReader; print(len(PdfReader('${OUT}').pages))`], { encoding: 'utf8' }).trim();
console.log(`${path.relative(ROOT, OUT)}: ${n} páginas, ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB`);
