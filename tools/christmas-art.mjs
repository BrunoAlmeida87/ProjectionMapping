// Original Christmas artwork for the LuzMap content library, written as SVG
// (vector) and rasterized by tools/make-christmas.mjs. Everything here is
// drawn from scratch — no third-party images — so the files can be shipped
// under the project's license.

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => Math.round(n * 10) / 10;
const pts = (list) => list.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export const PAL = {
  red: ['#ff8080', '#d3122f', '#5e0410'],
  gold: ['#fff3b8', '#e3a72a', '#6e4404'],
  blue: ['#a8ceff', '#2062e6', '#081a57'],
  green: ['#8ff0a4', '#1d9a45', '#073d18'],
  silver: ['#ffffff', '#c9d1dc', '#4e5864'],
  purple: ['#e7c2ff', '#8a2be2', '#300857'],
  pink: ['#ffc2e2', '#e8418f', '#5c0a33'],
};

const svg = (w, h, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;

function commonDefs() {
  let d = '';
  for (const [k, [l, b, dk]] of Object.entries(PAL)) {
    d += `<radialGradient id="orn-${k}" cx="0.5" cy="0.5" r="0.6" fx="0.33" fy="0.28"><stop offset="0" stop-color="${l}"/><stop offset="0.42" stop-color="${b}"/><stop offset="1" stop-color="${dk}"/></radialGradient>`;
    d += `<radialGradient id="halo-${k}"><stop offset="0" stop-color="${l}" stop-opacity="0.85"/><stop offset="0.35" stop-color="${b}" stop-opacity="0.45"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>`;
    d += `<linearGradient id="sat-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l}"/><stop offset="0.35" stop-color="${b}"/><stop offset="1" stop-color="${dk}"/></linearGradient>`;
    d += `<linearGradient id="side-${k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${mix(b, l, 0.25)}"/><stop offset="0.6" stop-color="${b}"/><stop offset="1" stop-color="${mix(b, dk, 0.55)}"/></linearGradient>`;
  }
  d += `<linearGradient id="metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e4404"/><stop offset="0.28" stop-color="#ffe9a0"/><stop offset="0.55" stop-color="#c9962b"/><stop offset="0.8" stop-color="#fff1b8"/><stop offset="1" stop-color="#7a4d05"/></linearGradient>`;
  d += `<linearGradient id="metalv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset="0.45" stop-color="#e3a72a"/><stop offset="1" stop-color="#7a4d05"/></linearGradient>`;
  d += `<linearGradient id="silverm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b6573"/><stop offset="0.3" stop-color="#ffffff"/><stop offset="0.6" stop-color="#b8c2cf"/><stop offset="0.85" stop-color="#f4f7fb"/><stop offset="1" stop-color="#5b6573"/></linearGradient>`;
  d += `<radialGradient id="halo-warm"><stop offset="0" stop-color="#fff6c8" stop-opacity="0.95"/><stop offset="0.3" stop-color="#ffc94d" stop-opacity="0.5"/><stop offset="1" stop-color="#ff9d00" stop-opacity="0"/></radialGradient>`;
  d += `<radialGradient id="snowball" cx="0.5" cy="0.5" r="0.55" fx="0.36" fy="0.3"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#eef4ff"/><stop offset="1" stop-color="#9fb7d8"/></radialGradient>`;
  d += `<linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3fbf63"/><stop offset="0.5" stop-color="#16803a"/><stop offset="1" stop-color="#07401a"/></linearGradient>`;
  d += `<linearGradient id="wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a2a12"/><stop offset="0.4" stop-color="#8a5328"/><stop offset="1" stop-color="#3b200c"/></linearGradient>`;
  d += `<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  d += `<filter id="glowBig" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="26" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  d += `<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>`;
  d += `<filter id="blur12" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>`;
  return d;
}

/** Star polygon points. */
function starPts(cx, cy, R, r, n = 5, rot = -90) {
  const out = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const rr = i % 2 ? r : R;
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return out;
}

/** Beveled (faceted) golden star. */
function facetStar(cx, cy, R, r, light = '#fff3b8', dark = '#b97a0c', n = 5) {
  const p = starPts(cx, cy, R, r, n);
  let s = '';
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const mx = (a[0] + b[0]) / 2 - cx;
    const my = (a[1] + b[1]) / 2 - cy;
    const ang = Math.atan2(my, mx);
    const lit = 0.5 + 0.5 * Math.cos(ang - (-2.3));
    const t = Math.min(1, Math.max(0, lit * 0.85 + (i % 2 ? 0 : 0.15)));
    s += `<polygon points="${pts([[cx, cy], a, b])}" fill="${mix(dark, light, t)}" stroke="${mix(dark, light, t)}" stroke-width="0.8"/>`;
  }
  return s;
}

/** Hanging Christmas ball (local origin = sphere center). */
function ball(cx, cy, r, color = 'red', { band = true, string = 0 } = {}) {
  const [l] = PAL[color];
  const capW = r * 0.42;
  const capH = r * 0.24;
  let s = '';
  if (string) s += `<line x1="${f(cx)}" y1="${f(cy - r - capH - string)}" x2="${f(cx)}" y2="${f(cy - r - capH * 0.6)}" stroke="#d9b45a" stroke-width="${f(Math.max(1.5, r * 0.025))}"/>`;
  s += `<circle cx="${f(cx)}" cy="${f(cy - r - capH * 0.75)}" r="${f(r * 0.09)}" fill="none" stroke="url(#metal)" stroke-width="${f(r * 0.035)}"/>`;
  s += `<rect x="${f(cx - capW / 2)}" y="${f(cy - r - capH * 0.55)}" width="${f(capW)}" height="${f(capH)}" rx="${f(capH * 0.2)}" fill="url(#metal)"/>`;
  for (let i = 1; i < 5; i++) s += `<line x1="${f(cx - capW / 2 + (capW * i) / 5)}" y1="${f(cy - r - capH * 0.5)}" x2="${f(cx - capW / 2 + (capW * i) / 5)}" y2="${f(cy - r + capH * 0.38)}" stroke="#7a4d05" stroke-opacity="0.45" stroke-width="${f(r * 0.012 + 0.5)}"/>`;
  s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#orn-${color})"/>`;
  if (band) {
    const id = `cl${Math.round(cx)}x${Math.round(cy)}`;
    s += `<clipPath id="${id}"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/></clipPath><g clip-path="url(#${id})">`;
    s += `<path d="M${f(cx - r * 1.02)},${f(cy + r * 0.08)} A${f(r * 1.02)},${f(r * 0.24)} 0 0 0 ${f(cx + r * 1.02)},${f(cy + r * 0.08)}" fill="none" stroke="${color === 'gold' ? '#fff8dc' : '#ffe08a'}" stroke-opacity="0.9" stroke-width="${f(r * 0.1)}"/>`;
    for (let k = -3; k <= 3; k++) {
      const x = cx + (k * r) / 3.6;
      const yy = cy + r * 0.08 + Math.sqrt(Math.max(0, 1 - ((x - cx) / (r * 1.02)) ** 2)) * r * 0.24;
      s += `<circle cx="${f(x)}" cy="${f(yy)}" r="${f(r * 0.045 * (1 - Math.abs(k) * 0.12))}" fill="#ffffff" fill-opacity="0.9"/>`;
    }
    s += `<path d="M${f(cx - r)},${f(cy - r * 0.42)} Q${f(cx)},${f(cy - r * 0.2)} ${f(cx + r)},${f(cy - r * 0.42)}" fill="none" stroke="${l}" stroke-opacity="0.55" stroke-width="${f(r * 0.035)}" stroke-dasharray="${f(r * 0.05)} ${f(r * 0.07)}" stroke-linecap="round"/>`;
    s += `</g>`;
  }
  s += `<ellipse cx="${f(cx - r * 0.36)}" cy="${f(cy - r * 0.4)}" rx="${f(r * 0.26)}" ry="${f(r * 0.15)}" transform="rotate(-35 ${f(cx - r * 0.36)} ${f(cy - r * 0.4)})" fill="#ffffff" fill-opacity="0.55" filter="url(#soft)"/>`;
  s += `<circle cx="${f(cx - r * 0.42)}" cy="${f(cy - r * 0.44)}" r="${f(r * 0.07)}" fill="#ffffff" fill-opacity="0.9"/>`;
  return s;
}

/** Small tree ornament (no cap detail). */
function bauble(cx, cy, r, color) {
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#orn-${color})"/><rect x="${f(cx - r * 0.25)}" y="${f(cy - r * 1.18)}" width="${f(r * 0.5)}" height="${f(r * 0.3)}" fill="url(#metal)"/><circle cx="${f(cx - r * 0.35)}" cy="${f(cy - r * 0.38)}" r="${f(r * 0.22)}" fill="#fff" fill-opacity="0.75" filter="url(#soft)"/>`;
}

/** Glowing light dot. */
function light(cx, cy, r, color = 'gold') {
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 3.4)}" fill="url(#halo-${color})"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${PAL[color][0]}"/>`;
}

/** Satin ribbon bow centered at (cx, cy). */
function bow(cx, cy, s = 1, color = 'red') {
  const g = `sat-${color}`;
  const dk = PAL[color][2];
  const loopR = 'M0,0 C 30,-78 150,-102 168,-28 C 180,30 82,44 0,0 Z';
  const innerR = 'M14,-4 C 44,-54 118,-68 132,-24 C 140,12 82,22 14,-4 Z';
  const tailR = 'M6,10 C 34,62 62,122 92,186 L 66,172 L 50,200 C 34,136 12,74 -4,14 Z';
  return `<g transform="translate(${f(cx)} ${f(cy)}) scale(${s})">
    <path d="${tailR}" fill="url(#${g})"/><path d="${tailR}" transform="scale(-1 1)" fill="url(#${g})"/>
    <path d="${loopR}" fill="url(#${g})"/><path d="${loopR}" transform="scale(-1 1)" fill="url(#${g})"/>
    <path d="${innerR}" fill="${dk}" fill-opacity="0.45"/><path d="${innerR}" transform="scale(-1 1)" fill="${dk}" fill-opacity="0.45"/>
    <path d="M30,-46 C 70,-80 130,-84 150,-40" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="7" stroke-linecap="round"/>
    <path d="M-30,-46 C -70,-80 -130,-84 -150,-40" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="0" cy="0" rx="30" ry="32" fill="url(#${g})" stroke="${dk}" stroke-opacity="0.5" stroke-width="3"/>
    <ellipse cx="-8" cy="-10" rx="10" ry="8" fill="#fff" fill-opacity="0.35"/>
  </g>`;
}

/** Spiky holly leaf along +x of length L. */
function hollyLeafPath(L, W) {
  const spikes = 4;
  const half = (x) => Math.sin(Math.PI * Math.min(1, Math.max(0, x / L))) ** 0.8 * W;
  const up = [];
  const lo = [];
  for (let i = 0; i <= spikes; i++) {
    const x = (L * (i + 0.5)) / (spikes + 1);
    up.push([x, -half(x) * 1.08]);
    lo.push([x, half(x) * 1.08]);
  }
  let d = `M0,0`;
  let prev = [0, 0];
  for (const p of up) {
    const mx = (prev[0] + p[0]) / 2;
    d += ` Q${f(mx)},${f(-half(mx) * 0.55)} ${f(p[0])},${f(p[1])}`;
    prev = p;
  }
  d += ` Q${f((prev[0] + L) / 2)},${f(-half((prev[0] + L) / 2) * 0.5)} ${L},0`;
  prev = [L, 0];
  for (const p of [...lo].reverse()) {
    const mx = (prev[0] + p[0]) / 2;
    d += ` Q${f(mx)},${f(half(mx) * 0.55)} ${f(p[0])},${f(p[1])}`;
    prev = p;
  }
  d += ` Q${f(prev[0] / 2)},${f(half(prev[0] / 2) * 0.5)} 0,0 Z`;
  return d;
}

function hollySprig(cx, cy, s = 1, angles = [-150, -30, 90]) {
  const L = 230;
  const W = 58;
  const leaf = hollyLeafPath(L, W);
  let g = `<g transform="translate(${f(cx)} ${f(cy)}) scale(${s})">`;
  for (const a of angles) {
    g += `<g transform="rotate(${a})"><path d="${leaf}" fill="url(#leaf)" stroke="#063a16" stroke-width="3"/><path d="M8,0 Q${L * 0.5},${-6} ${L - 18},0" fill="none" stroke="#9ff0b0" stroke-opacity="0.6" stroke-width="4" stroke-linecap="round"/></g>`;
  }
  for (const [x, y] of [
    [-18, -14],
    [20, -10],
    [0, 18],
  ])
    g += `<circle cx="${x}" cy="${y}" r="27" fill="url(#orn-red)"/><circle cx="${x - 8}" cy="${y - 9}" r="6" fill="#fff" fill-opacity="0.85"/>`;
  return `${g}</g>`;
}

/** Cluster of pine needles around (x, y). */
function needles(r, x, y, len = 34, n = 7, shades = ['#0c4d22', '#13652d', '#1d7f3a', '#2b9a4a']) {
  let s = '';
  const base = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = base + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const l = len * (0.6 + r() * 0.55);
    s += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + Math.cos(a) * l)}" y2="${f(y + Math.sin(a) * l)}" stroke="${shades[Math.floor(r() * shades.length)]}" stroke-width="${f(5 + r() * 3)}" stroke-linecap="round"/>`;
  }
  return s;
}

const quadPt = (p0, p1, p2, t) => [
  (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
  (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
];

/** Pine garland following a quadratic curve. */
function garlandSwag(r, p0, p1, p2, thick = 60, density = 1) {
  let s = '';
  const steps = Math.round(90 * density);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = quadPt(p0, p1, p2, t);
    for (let k = 0; k < 3; k++) s += needles(r, x + (r() - 0.5) * thick * 0.5, y + (r() - 0.5) * thick * 0.5, thick * 0.55, 6);
  }
  return s;
}

/** Wreath ring. */
function wreath(r, cx, cy, R, thick, { bowColor = 'red', berries = true } = {}) {
  let s = '';
  const N = Math.round(R * 1.3);
  for (let layer = 0; layer < 3; layer++) {
    const shades = [
      ['#06361a', '#0a4720'],
      ['#0f5a2a', '#167034'],
      ['#1f8a42', '#2fa553', '#46bd66'],
    ][layer];
    for (let i = 0; i < N; i++) {
      const a = r() * Math.PI * 2;
      const rr = R + (r() - 0.5) * thick * (1 - layer * 0.25);
      s += needles(r, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, thick * 0.32, 5, shades);
    }
  }
  if (berries) {
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + 0.3;
      const bx = cx + Math.cos(a) * R;
      const by = cy + Math.sin(a) * R;
      if (by > cy + R * 0.7) continue;
      for (const [dx, dy] of [
        [-1, -0.6],
        [1, -0.4],
        [0, 0.9],
      ])
        s += `<circle cx="${f(bx + dx * thick * 0.09)}" cy="${f(by + dy * thick * 0.09)}" r="${f(thick * 0.075)}" fill="url(#orn-red)"/>`;
    }
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.75;
      const bx = cx + Math.cos(a) * (R + thick * 0.15);
      const by = cy + Math.sin(a) * (R + thick * 0.15);
      if (by > cy + R * 0.7) continue;
      s += bauble(bx, by, thick * 0.12, ['gold', 'silver', 'red'][k % 3]);
    }
  }
  if (bowColor) s += bow(cx, cy + R + thick * 0.08, thick / 200, bowColor);
  return s;
}

/** Gift box (front view). */
function giftBox(x, y, w, h, paper, ribbon, { bowScale = null, pattern = 'dots', id = 'g' } = {}) {
  const lidH = h * 0.2;
  const rw = w * 0.11;
  const [pl, pb, pd] = PAL[paper];
  const ribbonFill = ribbon === 'gold' ? 'url(#metal)' : ribbon === 'silver' ? 'url(#silverm)' : `url(#side-${ribbon})`;
  let s = `<pattern id="pat-${id}" width="${f(w / 6)}" height="${f(w / 6)}" patternUnits="userSpaceOnUse">`;
  s +=
    pattern === 'dots'
      ? `<circle cx="${f(w / 24)}" cy="${f(w / 24)}" r="${f(w / 90)}" fill="${pl}" fill-opacity="0.55"/><circle cx="${f(w / 8)}" cy="${f(w / 8)}" r="${f(w / 130)}" fill="#fff" fill-opacity="0.45"/>`
      : `<polygon points="${pts(starPts(w / 12, w / 12, w / 40, w / 95))}" fill="${pl}" fill-opacity="0.5"/>`;
  s += `</pattern>`;
  // body
  s += `<rect x="${f(x)}" y="${f(y + lidH * 0.6)}" width="${f(w)}" height="${f(h - lidH * 0.6)}" fill="url(#side-${paper})"/>`;
  s += `<rect x="${f(x)}" y="${f(y + lidH * 0.6)}" width="${f(w)}" height="${f(h - lidH * 0.6)}" fill="url(#pat-${id})"/>`;
  s += `<rect x="${f(x)}" y="${f(y + lidH)}" width="${f(w)}" height="${f(h * 0.05)}" fill="#000" fill-opacity="0.22"/>`;
  // ribbons on body
  s += `<rect x="${f(x + w / 2 - rw / 2)}" y="${f(y)}" width="${f(rw)}" height="${f(h)}" fill="${ribbonFill}"/>`;
  s += `<rect x="${f(x)}" y="${f(y + lidH + (h - lidH) * 0.45)}" width="${f(w)}" height="${f(rw * 0.9)}" fill="${ribbon === 'gold' ? 'url(#metalv)' : ribbonFill}"/>`;
  // lid
  const lx = x - w * 0.035;
  const lw = w * 1.07;
  s += `<rect x="${f(lx)}" y="${f(y)}" width="${f(lw)}" height="${f(lidH)}" rx="${f(w * 0.012)}" fill="url(#side-${paper})"/>`;
  s += `<rect x="${f(lx)}" y="${f(y)}" width="${f(lw)}" height="${f(lidH)}" rx="${f(w * 0.012)}" fill="url(#pat-${id})"/>`;
  s += `<rect x="${f(lx)}" y="${f(y)}" width="${f(lw)}" height="${f(lidH * 0.18)}" fill="#fff" fill-opacity="0.18"/>`;
  s += `<rect x="${f(x + w / 2 - rw / 2)}" y="${f(y)}" width="${f(rw)}" height="${f(lidH)}" fill="${ribbonFill}"/>`;
  s += `<rect x="${f(lx)}" y="${f(y + lidH - 4)}" width="${f(lw)}" height="5" fill="${pd}" fill-opacity="0.6"/>`;
  void pb;
  if (bowScale) s += bow(x + w / 2, y + 4, bowScale, ribbon === 'silver' ? 'silver' : ribbon === 'gold' ? 'gold' : ribbon);
  return s;
}

/** Stocking (local, fits ~ 460x780 box at scale 1). */
function stocking(x, y, s = 1, color = 'red', accent = 'green') {
  const body = 'M60,120 L330,120 L330,470 C 330,540 365,575 430,590 C 505,610 520,730 440,762 C 360,792 210,790 130,712 C 72,655 60,575 60,480 Z';
  const id = `st${Math.round(x)}${Math.round(y)}${color}`;
  let g = `<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><clipPath id="${id}"><path d="${body}"/></clipPath>`;
  g += `<path d="${body}" fill="url(#side-${color})"/>`;
  g += `<g clip-path="url(#${id})">`;
  for (let k = 0; k < 4; k++) g += `<rect x="0" y="${300 + k * 46}" width="600" height="16" fill="${PAL[accent][1]}" fill-opacity="0.9"/>`;
  for (let k = 0; k < 4; k++) g += `<rect x="0" y="${316 + k * 46}" width="600" height="6" fill="#fff" fill-opacity="0.85"/>`;
  g += `<circle cx="480" cy="700" r="120" fill="#f3f6fb"/><circle cx="480" cy="700" r="120" fill="url(#snowball)" fill-opacity="0.6"/>`;
  g += `<path d="M60,610 C 120,600 200,640 220,720 C 230,780 120,790 60,760 Z" fill="#f3f6fb"/>`;
  g += `</g>`;
  g += `<rect x="30" y="20" width="330" height="128" rx="56" fill="#f7f9fc"/>`;
  const r0 = rng(Math.round(x * 7 + y));
  for (let k = 0; k < 26; k++) g += `<circle cx="${f(40 + r0() * 310)}" cy="${f(30 + r0() * 108)}" r="${f(16 + r0() * 14)}" fill="#ffffff"/>`;
  g += `<rect x="30" y="100" width="330" height="48" rx="24" fill="#a8bfdc" fill-opacity="0.35"/>`;
  g += `<path d="M70,30 C 40,-30 120,-40 120,20" fill="none" stroke="#e8e8e8" stroke-width="12" stroke-linecap="round"/>`;
  return `${g}</g>`;
}

function snowflakeArm(len) {
  const br = [
    [0.32, 0.3],
    [0.56, 0.24],
    [0.78, 0.15],
  ];
  let d = `M0,0 L0,${-len}`;
  for (const [t, l] of br) {
    const y = -len * t;
    const L = len * l;
    d += ` M0,${f(y)} L${f(L * 0.87)},${f(y - L * 0.5)} M0,${f(y)} L${f(-L * 0.87)},${f(y - L * 0.5)}`;
  }
  return d;
}

function snowflake(cx, cy, R, { color = '#ffffff', glowColor = '#9fd4ff', w = 0.06 } = {}) {
  const arm = snowflakeArm(R);
  let base = '';
  for (let i = 0; i < 6; i++) base += `<path d="${arm}" transform="rotate(${i * 60})"/>`;
  base += `<polygon points="${pts(starPts(0, 0, R * 0.16, R * 0.16, 3, -90).filter((_, i) => true))}"/>`;
  return `<g transform="translate(${f(cx)} ${f(cy)})" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <g stroke="${glowColor}" stroke-width="${f(R * w * 1.9)}" opacity="0.65" filter="url(#soft)">${base}</g>
    <g stroke="${color}" stroke-width="${f(R * w)}">${base}</g></g>`;
}

function textBlock(text, x, y, size, fill, { stroke = '#4a1400', sw = 10, family = 'FreeSerif', weight = 'bold', style = 'italic', glow = '#ffcf5a', anchor = 'middle', spacing = 0 } = {}) {
  const common = `x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-weight="${weight}" font-style="${style}" font-size="${size}" letter-spacing="${spacing}"`;
  return `<text ${common} fill="${glow}" opacity="0.75" filter="url(#glowBig)">${text}</text>
  <text ${common} fill="none" stroke="${stroke}" stroke-width="${sw * 2}" stroke-linejoin="round">${text}</text>
  <text ${common} fill="${fill}">${text}</text>
  <text ${common} fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2">${text}</text>`;
}

function sparkle(cx, cy, R, color = '#fff8dc', op = 1) {
  return `<g opacity="${op}"><polygon points="${pts(starPts(cx, cy, R, R * 0.14, 4, -90))}" fill="${color}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.5)}" fill="url(#halo-gold)"/></g>`;
}

/** Pine tree silhouette (stacked triangles), base center at (x, y). */
function pineSil(x, y, h, color, snow = true) {
  const w = h * 0.55;
  let s = '';
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const top = y - h + (h * i) / (tiers + 0.6);
    const bot = top + h * 0.42;
    const ww = (w * (i + 1.4)) / (tiers + 0.4);
    s += `<polygon points="${pts([
      [x, top],
      [x + ww / 2, bot],
      [x - ww / 2, bot],
    ])}" fill="${color}"/>`;
    if (snow)
      s += `<path d="M${f(x - ww * 0.42)},${f(bot - 2)} Q${f(x - ww * 0.2)},${f(bot - h * 0.06)} ${f(x)},${f(bot - 3)} Q${f(x + ww * 0.2)},${f(bot - h * 0.06)} ${f(x + ww * 0.42)},${f(bot - 2)} L${f(x + ww * 0.5)},${f(bot)} L${f(x - ww * 0.5)},${f(bot)} Z" fill="#eaf2ff" fill-opacity="0.9"/>`;
  }
  s += `<rect x="${f(x - h * 0.04)}" y="${f(y - h * 0.05)}" width="${f(h * 0.08)}" height="${f(h * 0.08)}" fill="${color}"/>`;
  return s;
}

// ---------------------------------------------------------------------------
// artwork
// ---------------------------------------------------------------------------

function tierPath(cx, top, bottom, w, n, droop) {
  const R = cx + w / 2;
  let d = `M${cx},${top} Q${f(cx + w * 0.17)},${f(top + (bottom - top) * 0.58)} ${f(R)},${bottom}`;
  const step = w / n;
  for (let i = 0; i < n; i++) {
    const x0 = R - i * step;
    const x1 = R - (i + 1) * step;
    d += ` Q${f((x0 + x1) / 2)},${f(bottom + droop)} ${f(x1)},${bottom}`;
  }
  d += ` Q${f(cx - w * 0.17)},${f(top + (bottom - top) * 0.58)} ${cx},${top} Z`;
  return d;
}

function tree() {
  const W = 768;
  const H = 1024;
  const cx = 384;
  const r = rng(11);
  const tiers = [
    [150, 395, 320, 4],
    [255, 575, 470, 5],
    [380, 755, 610, 6],
    [520, 915, 736, 7],
  ];
  let defs = commonDefs();
  defs += `<linearGradient id="pine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2fae5f"/><stop offset="0.5" stop-color="#16793b"/><stop offset="1" stop-color="#083d1d"/></linearGradient>`;
  defs += `<linearGradient id="tierShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.7" stop-color="#000" stop-opacity="0.05"/><stop offset="1" stop-color="#000" stop-opacity="0.32"/></linearGradient>`;
  defs += `<clipPath id="treeClip">${tiers.map(([t, b, w, n]) => `<path d="${tierPath(cx, t, b, w, n, 26)}"/>`).join('')}</clipPath>`;
  let body = '';
  // pot + trunk
  body += `<rect x="350" y="900" width="68" height="70" fill="url(#wood)"/>`;
  body += `<path d="M292,948 L476,948 L456,1016 L312,1016 Z" fill="url(#side-red)"/><rect x="284" y="940" width="200" height="22" rx="6" fill="url(#metal)"/>`;
  for (let i = tiers.length - 1; i >= 0; i--) {
    const [t, b, w, n] = tiers[i];
    const d = tierPath(cx, t, b, w, n, 26);
    body += `<path d="${d}" fill="url(#pine)"/><path d="${d}" fill="url(#tierShade)"/>`;
  }
  // needle texture
  body += `<g clip-path="url(#treeClip)">`;
  for (let i = 0; i < 520; i++) {
    const y = 160 + r() * 760;
    const x = cx + (r() - 0.5) * 760;
    const a = Math.PI / 2 + (x > cx ? -0.5 : 0.5) + (r() - 0.5) * 0.6;
    const l = 14 + r() * 22;
    body += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + Math.cos(a) * l)}" y2="${f(y + Math.sin(a) * l)}" stroke="${r() > 0.5 ? '#3cc46e' : '#06341a'}" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>`;
  }
  body += `</g>`;
  // bead garlands
  const swags = [
    [
      [300, 330],
      [400, 395],
      [470, 315],
    ],
    [
      [252, 500],
      [380, 590],
      [548, 470],
    ],
    [
      [196, 680],
      [390, 790],
      [606, 650],
    ],
    [
      [130, 855],
      [380, 975],
      [668, 830],
    ],
  ];
  for (const [a, c, b] of swags) {
    for (let i = 0; i <= 44; i++) {
      const [x, y] = quadPt(a, c, b, i / 44);
      body += `<circle cx="${f(x)}" cy="${f(y)}" r="5.5" fill="url(#orn-gold)"/>`;
    }
  }
  // lights
  const lightCols = ['gold', 'gold', 'red', 'blue', 'gold', 'pink'];
  const inTree = (x, y) => tiers.some(([t, b, w]) => y > t + 40 && y < b - 6 && Math.abs(x - cx) < ((y - t) / (b - t)) * (w / 2) * 0.86);
  let placed = 0;
  let guard = 0;
  while (placed < 46 && guard++ < 4000) {
    const x = cx + (r() - 0.5) * 700;
    const y = 190 + r() * 720;
    if (!inTree(x, y)) continue;
    body += light(x, y, 5.5, lightCols[placed % lightCols.length]);
    placed++;
  }
  // ornaments
  const orn = [
    [345, 300, 20, 'red'],
    [425, 360, 18, 'blue'],
    [330, 450, 22, 'gold'],
    [455, 520, 24, 'red'],
    [270, 560, 22, 'silver'],
    [395, 640, 26, 'purple'],
    [530, 640, 24, 'gold'],
    [245, 735, 26, 'blue'],
    [340, 720, 22, 'red'],
    [480, 760, 28, 'silver'],
    [585, 820, 26, 'red'],
    [180, 860, 26, 'gold'],
    [300, 880, 28, 'blue'],
    [430, 905, 26, 'gold'],
    [380, 470, 18, 'pink'],
  ];
  for (const [x, y, rr, c] of orn) body += bauble(x, y, rr, c);
  // star
  body += `<circle cx="${cx}" cy="140" r="150" fill="url(#halo-warm)"/>`;
  body += `<g filter="url(#glow)">${facetStar(cx, 140, 78, 33)}</g>`;
  return svg(W, H, defs, body);
}

function star() {
  const W = 1024;
  const H = 1024;
  let defs = commonDefs();
  let body = `<circle cx="512" cy="530" r="480" fill="url(#halo-warm)" opacity="0.8"/>`;
  for (const a of [0, 90, 45, 135]) {
    const L = a % 90 ? 360 : 500;
    body += `<polygon transform="rotate(${a} 512 530)" points="${pts([
      [512, 530 - L],
      [526, 530],
      [512, 530 + L],
      [498, 530],
    ])}" fill="#fff8dc" opacity="${a % 90 ? 0.45 : 0.75}" filter="url(#soft)"/>`;
  }
  body += `<polygon points="${pts(starPts(512, 545, 380, 158))}" fill="#ffbf2e" filter="url(#blur12)" opacity="0.9"/>`;
  body += facetStar(512, 545, 380, 158);
  body += `<polygon points="${pts(starPts(512, 545, 380, 158))}" fill="none" stroke="#fff5c4" stroke-width="6" stroke-linejoin="round" stroke-opacity="0.7"/>`;
  body += sparkle(330, 300, 46) + sparkle(760, 720, 34, '#fff8dc', 0.9) + sparkle(780, 330, 26);
  return svg(W, H, defs, body);
}

function guideStar() {
  const W = 800;
  const H = 1200;
  const cx = 400;
  const cy = 340;
  let defs = commonDefs();
  defs += `<linearGradient id="tail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="0.25" stop-color="#fff1b0" stop-opacity="0.7"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></linearGradient>`;
  defs += `<radialGradient id="core"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#fff6d0"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>`;
  let body = `<circle cx="${cx}" cy="${cy}" r="360" fill="url(#halo-warm)" opacity="0.7"/>`;
  body += `<polygon points="${pts([
    [cx - 34, cy],
    [cx + 34, cy],
    [cx + 3, 1190],
    [cx - 3, 1190],
  ])}" fill="url(#tail)" filter="url(#soft)"/>`;
  body += `<polygon points="${pts([
    [cx - 12, cy],
    [cx + 12, cy],
    [cx + 1, 1100],
    [cx - 1, 1100],
  ])}" fill="#ffffff" opacity="0.8"/>`;
  body += `<g filter="url(#glow)"><polygon points="${pts(starPts(cx, cy, 330, 34, 4, -90))}" fill="#fff8e0"/><polygon points="${pts(starPts(cx, cy, 170, 30, 4, -45))}" fill="#ffe9a6" opacity="0.9"/></g>`;
  body += `<circle cx="${cx}" cy="${cy}" r="90" fill="url(#core)"/>`;
  const r = rng(5);
  for (let i = 0; i < 9; i++) body += sparkle(80 + r() * 640, 60 + r() * 700, 10 + r() * 22, '#fff8dc', 0.6 + r() * 0.4);
  return svg(W, H, defs, body);
}

function ornamentArt(color) {
  return () => svg(1024, 1024, commonDefs(), ball(512, 610, 345, color, { string: 150 }));
}

function wreathArt() {
  const r = rng(21);
  return svg(1024, 1024, commonDefs(), wreath(r, 512, 470, 300, 190));
}

function bowArt() {
  return svg(1024, 820, commonDefs(), bow(512, 300, 2.7, 'red'));
}

function bells() {
  let defs = commonDefs();
  const bellPath = 'M0,0 C 52,0 84,40 88,112 C 92,192 106,232 142,262 C 154,274 142,288 120,288 L -120,288 C -142,288 -154,274 -142,262 C -106,232 -92,192 -88,112 C -84,40 -52,0 0,0 Z';
  const one = (x, y, a) => `<g transform="translate(${x} ${y}) rotate(${a})">
    <circle cx="0" cy="316" r="30" fill="url(#orn-gold)"/>
    <path d="${bellPath}" fill="url(#metal)"/>
    <path d="M-46,40 C -60,90 -66,170 -92,236" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="16" stroke-linecap="round"/>
    <ellipse cx="0" cy="284" rx="138" ry="16" fill="#7a4d05" fill-opacity="0.55"/>
    <rect x="-130" y="232" width="260" height="14" rx="7" fill="#fff1b8" fill-opacity="0.5"/>
    <circle cx="0" cy="-12" r="20" fill="none" stroke="url(#metal)" stroke-width="10"/></g>`;
  let body = one(392, 330, 18) + one(632, 330, -18);
  body += hollySprig(512, 300, 0.75, [-160, -20, -90]);
  body += bow(512, 290, 1.15, 'red');
  return svg(1024, 1024, defs, body);
}

function candyCane() {
  let defs = commonDefs();
  const d = 'M330,975 L330,330 A125,125 0 0 0 80,330 L80,372';
  defs += `<pattern id="stripes" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><rect width="120" height="120" fill="#fbfbfb"/><rect x="0" width="46" height="120" fill="#d3122f"/><rect x="66" width="12" height="120" fill="#1d9a45"/></pattern>`;
  defs += `<mask id="cane"><path d="${d}" stroke="#fff" stroke-width="92" stroke-linecap="round" fill="none"/></mask>`;
  let body = `<g mask="url(#cane)"><rect width="512" height="1024" fill="url(#stripes)"/>
    <path d="${d}" transform="translate(24 20)" stroke="#000" stroke-opacity="0.22" stroke-width="44" fill="none" filter="url(#soft)"/>
    <path d="${d}" transform="translate(-20 -16)" stroke="#fff" stroke-opacity="0.6" stroke-width="16" fill="none" filter="url(#soft)"/></g>`;
  return svg(512, 1024, defs, body);
}

function giftArt(paper, ribbon, pattern) {
  return () => svg(1024, 1024, commonDefs(), giftBox(222, 400, 580, 560, paper, ribbon, { bowScale: 1.55, pattern, id: paper }));
}

function giftPile() {
  let body = '';
  body += giftBox(120, 420, 560, 540, 'red', 'gold', { bowScale: 1.25, pattern: 'stars', id: 'a' });
  body += giftBox(760, 560, 480, 400, 'green', 'red', { bowScale: 1.05, pattern: 'dots', id: 'b' });
  body += giftBox(560, 720, 300, 240, 'blue', 'silver', { bowScale: 0.75, pattern: 'stars', id: 'c' });
  return svg(1400, 1000, commonDefs(), body);
}

function snowman() {
  let defs = commonDefs();
  defs += `<linearGradient id="carrot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#e2620c"/></linearGradient>`;
  let body = `<ellipse cx="384" cy="975" rx="340" ry="42" fill="url(#snowball)"/>`;
  // arms
  body += `<g stroke="#5a3417" stroke-width="14" stroke-linecap="round" fill="none"><path d="M260,520 L80,400 M140,440 L110,370 M150,447 L80,445"/><path d="M508,520 L690,390 M630,432 L660,362 M622,438 L700,440"/></g>`;
  body += `<circle cx="384" cy="790" r="195" fill="url(#snowball)"/><circle cx="384" cy="520" r="145" fill="url(#snowball)"/><circle cx="384" cy="300" r="104" fill="url(#snowball)"/>`;
  // buttons
  for (const y of [470, 535, 600]) body += `<circle cx="384" cy="${y}" r="13" fill="#20252b"/>`;
  // scarf
  body += `<path d="M285,378 C 330,410 440,410 484,378 L 492,418 C 440,446 330,446 278,418 Z" fill="url(#sat-red)"/>`;
  body += `<path d="M440,410 C 470,470 470,540 455,600 L 410,592 C 420,540 415,480 396,428 Z" fill="url(#sat-red)"/>`;
  body += `<g stroke="#fff" stroke-width="10" stroke-opacity="0.85"><line x1="320" y1="402" x2="316" y2="438"/><line x1="370" y1="410" x2="368" y2="446"/><line x1="420" y1="580" x2="458" y2="584"/><line x1="426" y1="545" x2="462" y2="548"/></g>`;
  // face
  body += `<circle cx="350" cy="282" r="12" fill="#20252b"/><circle cx="418" cy="282" r="12" fill="#20252b"/><circle cx="346" cy="278" r="3.5" fill="#fff"/><circle cx="414" cy="278" r="3.5" fill="#fff"/>`;
  body += `<path d="M384,302 L478,322 L384,326 Z" fill="url(#carrot)"/>`;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.25 + (i / 5) * 0.5);
    body += `<circle cx="${f(384 + Math.cos(a) * 50)}" cy="${f(318 + Math.sin(a) * 34)}" r="6.5" fill="#20252b"/>`;
  }
  body += `<circle cx="330" cy="318" r="16" fill="#ff8fa3" fill-opacity="0.35"/><circle cx="438" cy="318" r="16" fill="#ff8fa3" fill-opacity="0.35"/>`;
  // hat
  body += `<path d="M318,212 L326,92 C 360,80 410,80 444,92 L452,212 Z" fill="#1e2228"/><rect x="320" y="170" width="130" height="26" fill="#c8102e"/>`;
  body += `<ellipse cx="385" cy="214" rx="122" ry="20" fill="#2b3038"/>`;
  body += hollySprig(430, 176, 0.18, [-160, -40]);
  return svg(768, 1024, defs, body);
}

function snowflakeArt() {
  return svg(1024, 1024, commonDefs(), snowflake(512, 512, 440, { w: 0.065 }));
}

function santaHat() {
  let defs = commonDefs();
  defs += `<linearGradient id="hat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4d5e"/><stop offset="0.55" stop-color="#c8102e"/><stop offset="1" stop-color="#6a0514"/></linearGradient>`;
  let body = `<path d="M175,690 C 190,450 330,215 560,170 C 720,140 850,210 880,330 C 820,300 735,305 690,345 C 740,450 800,560 850,690 Z" fill="url(#hat)"/>`;
  body += `<path d="M300,620 C 330,450 430,300 560,230" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="40" stroke-linecap="round"/>`;
  body += `<path d="M690,345 C 740,450 800,560 850,690 L 760,690 C 730,560 700,450 690,345 Z" fill="#000" fill-opacity="0.18"/>`;
  const r = rng(3);
  let fur = `<rect x="120" y="650" width="790" height="150" rx="75" fill="#f4f7fb"/>`;
  for (let i = 0; i < 70; i++) fur += `<circle cx="${f(150 + r() * 730)}" cy="${f(665 + r() * 120)}" r="${f(22 + r() * 22)}" fill="#ffffff"/>`;
  fur += `<rect x="130" y="750" width="770" height="50" rx="25" fill="#9fb4d4" fill-opacity="0.35"/>`;
  body += fur;
  let pom = '';
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const rr = r() * 55;
    pom += `<circle cx="${f(880 + Math.cos(a) * rr)}" cy="${f(360 + Math.sin(a) * rr)}" r="${f(34 + r() * 18)}" fill="#ffffff"/>`;
  }
  body += pom + `<circle cx="900" cy="385" r="70" fill="#a8bfdc" fill-opacity="0.25"/>`;
  return svg(1024, 900, defs, body);
}

function stockingArt() {
  return svg(640, 1024, commonDefs(), stocking(70, 100, 1.08, 'red', 'green'));
}

function hollyArt() {
  return svg(1024, 800, commonDefs(), hollySprig(512, 400, 1.55, [-155, -25, 95]));
}

function candle() {
  let defs = commonDefs();
  defs += `<radialGradient id="flame" cx="0.5" cy="0.7" r="0.6"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#fff2a8"/><stop offset="0.7" stop-color="#ffb000"/><stop offset="1" stop-color="#ff5a00" stop-opacity="0.9"/></radialGradient>`;
  let body = `<circle cx="256" cy="330" r="230" fill="url(#halo-warm)"/>`;
  body += `<rect x="172" y="420" width="168" height="520" fill="url(#side-red)"/>`;
  body += `<ellipse cx="256" cy="420" rx="84" ry="18" fill="#ff6b7a"/>`;
  body += `<path d="M172,420 L172,520 C 172,540 196,540 196,520 L196,440 L 230,440 L230,600 C 230,622 256,622 256,600 L256,440 L300,440 L300,500 C 300,520 322,520 322,500 L322,440 L340,420 Z" fill="#e8283f"/>`;
  body += `<line x1="256" y1="380" x2="256" y2="422" stroke="#222" stroke-width="7" stroke-linecap="round"/>`;
  body += `<path d="M256,228 C 306,310 304,372 256,392 C 208,372 206,310 256,228 Z" fill="url(#flame)" filter="url(#glow)"/>`;
  body += `<path d="M256,318 C 272,350 270,372 256,382 C 242,372 240,350 256,318 Z" fill="#7ab8ff" fill-opacity="0.6"/>`;
  body += `<ellipse cx="256" cy="948" rx="200" ry="42" fill="url(#metalv)"/>`;
  body += hollySprig(256, 925, 0.55, [-175, -5, 200, -20]);
  return svg(512, 1024, defs, body);
}

function gingerHouse() {
  let defs = commonDefs();
  defs += `<linearGradient id="ginger" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d0843d"/><stop offset="0.6" stop-color="#b8692b"/><stop offset="1" stop-color="#7d4217"/></linearGradient>`;
  defs += `<radialGradient id="win"><stop offset="0" stop-color="#fff4c2"/><stop offset="0.6" stop-color="#ffc94d"/><stop offset="1" stop-color="#e0891a"/></radialGradient>`;
  const r = rng(8);
  let body = `<ellipse cx="512" cy="930" rx="470" ry="60" fill="url(#snowball)"/>`;
  body += `<rect x="680" y="230" width="80" height="190" fill="url(#ginger)"/><path d="M668,236 Q720,190 772,236 Q760,256 720,248 Q690,256 668,236Z" fill="#fff"/>`;
  body += `<rect x="225" y="470" width="574" height="440" fill="url(#ginger)"/>`;
  for (let i = 0; i < 160; i++) body += `<circle cx="${f(235 + r() * 554)}" cy="${f(480 + r() * 420)}" r="${f(1.5 + r() * 2.5)}" fill="#6b3510" fill-opacity="0.5"/>`;
  // roof
  body += `<path d="M140,515 L512,185 L884,515 Z" fill="#8a4a1c"/>`;
  let scal = 'M140,512 L512,178 L884,512';
  for (let i = 0; i < 12; i++) {
    const xa = 884 - (744 * i) / 12;
    const xb = 884 - (744 * (i + 1)) / 12;
    scal += ` Q${f((xa + xb) / 2)},${f(560)} ${f(xb)},512`;
  }
  body += `<path d="${scal} Z" fill="#fdfdff"/>`;
  body += `<path d="${scal} Z" fill="url(#snowball)" fill-opacity="0.35"/>`;
  const gum = ['red', 'green', 'gold', 'pink', 'blue'];
  for (let i = 0; i < 12; i++) {
    const x = 884 - (744 * (i + 0.5)) / 12;
    body += `<circle cx="${f(x)}" cy="548" r="15" fill="url(#orn-${gum[i % gum.length]})"/>`;
  }
  // windows
  for (const x of [290, 614]) {
    body += `<rect x="${x}" y="590" width="120" height="110" rx="12" fill="url(#win)" filter="url(#glow)"/>`;
    body += `<path d="M${x + 60},590 V700 M${x},645 H${x + 120}" stroke="#fff" stroke-width="10"/>`;
    body += `<rect x="${x}" y="590" width="120" height="110" rx="12" fill="none" stroke="#fff" stroke-width="12" stroke-dasharray="14 8"/>`;
  }
  // door
  body += `<path d="M452,910 L452,770 Q452,705 512,705 Q572,705 572,770 L572,910 Z" fill="#5b2c0d"/>`;
  body += `<path d="M452,910 L452,770 Q452,705 512,705 Q572,705 572,770 L572,910" fill="none" stroke="#fff" stroke-width="10" stroke-dasharray="16 9"/>`;
  body += `<circle cx="550" cy="820" r="10" fill="url(#orn-gold)"/>`;
  // candy canes beside the door
  for (const x of [420, 604]) {
    body += `<line x1="${x}" y1="910" x2="${x}" y2="760" stroke="#fff" stroke-width="18" stroke-linecap="round"/>`;
    for (let k = 0; k < 6; k++) body += `<line x1="${x - 9}" y1="${900 - k * 25}" x2="${x + 9}" y2="${888 - k * 25}" stroke="#d3122f" stroke-width="8"/>`;
  }
  // icing trim on the base
  let trim = 'M225,470';
  for (let i = 0; i < 14; i++) trim += ` q${f(574 / 28)},28 ${f(574 / 14)},0`;
  body += `<path d="${trim}" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>`;
  body += `<rect x="225" y="895" width="574" height="16" fill="#fff"/>`;
  return svg(1024, 1024, defs, body);
}

function gingerMan() {
  let defs = commonDefs();
  defs += `<radialGradient id="gm" cx="384" cy="520" r="520" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#d48a42"/><stop offset="0.75" stop-color="#b0632a"/><stop offset="1" stop-color="#7d4217"/></radialGradient>`;
  const shape = (fill, extra) => `<g fill="${fill}" stroke="${fill}" stroke-linecap="round">
    <circle cx="384" cy="225" r="${135 + extra}" stroke="none"/>
    <ellipse cx="384" cy="560" rx="${150 + extra}" ry="${205 + extra}" stroke="none"/>
    <line x1="272" y1="465" x2="110" y2="570" stroke-width="${124 + extra * 2}"/>
    <line x1="496" y1="465" x2="658" y2="570" stroke-width="${124 + extra * 2}"/>
    <line x1="320" y1="700" x2="235" y2="905" stroke-width="${136 + extra * 2}"/>
    <line x1="448" y1="700" x2="533" y2="905" stroke-width="${136 + extra * 2}"/></g>`;
  let body = shape('#6b3510', 10) + shape('url(#gm)', 0);
  const r = rng(4);
  for (let i = 0; i < 120; i++) body += `<circle cx="${f(130 + r() * 510)}" cy="${f(110 + r() * 820)}" r="${f(1.5 + r() * 2)}" fill="#5a2a0c" fill-opacity="0.35"/>`;
  const zig = (x, y, a, n = 5, w = 92) => {
    let d = `M${f(-w / 2)},0`;
    for (let i = 0; i < n; i++) d += ` l${f(w / n / 2)},-14 l${f(w / n / 2)},14`;
    return `<path d="${d}" transform="translate(${x} ${y}) rotate(${a})" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
  };
  body += zig(150, 546, -57) + zig(618, 546, 57) + zig(252, 860, 22) + zig(516, 860, -22);
  body += `<circle cx="340" cy="205" r="17" fill="#fff"/><circle cx="428" cy="205" r="17" fill="#fff"/><circle cx="342" cy="208" r="8" fill="#2a1406"/><circle cx="430" cy="208" r="8" fill="#2a1406"/>`;
  body += `<path d="M322,262 Q384,318 446,262" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/>`;
  body += `<circle cx="312" cy="250" r="16" fill="#ff6b81" fill-opacity="0.5"/><circle cx="456" cy="250" r="16" fill="#ff6b81" fill-opacity="0.5"/>`;
  body += bow(384, 385, 0.42, 'green');
  for (const [y, c] of [
    [500, 'red'],
    [580, 'green'],
    [660, 'red'],
  ])
    body += `<circle cx="384" cy="${y}" r="24" fill="url(#orn-${c})"/><circle cx="377" cy="${y - 8}" r="6" fill="#fff" fill-opacity="0.8"/>`;
  return svg(768, 1024, defs, body);
}

function nativity() {
  let defs = commonDefs();
  defs += `<linearGradient id="gsil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a1"/><stop offset="1" stop-color="#e59a1f"/></linearGradient>`;
  defs += `<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a6" stop-opacity="0.45"/><stop offset="1" stop-color="#ffcf5a" stop-opacity="0"/></linearGradient>`;
  const G = 'url(#gsil)';
  let body = '';
  // star & beam
  body += `<polygon points="${pts([
    [688, 150],
    [712, 150],
    [790, 640],
    [610, 640],
  ])}" fill="url(#beam)" filter="url(#blur12)"/>`;
  body += `<circle cx="700" cy="110" r="210" fill="url(#halo-warm)" opacity="0.75"/>`;
  body += `<g filter="url(#glow)"><polygon points="${pts(starPts(700, 110, 120, 16, 4, -90))}" fill="#fffbe8"/><polygon points="${pts(starPts(700, 110, 64, 14, 4, -45))}" fill="#ffe9a6"/></g>`;
  body += `<g fill="none" stroke="${G}" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)">`;
  body += `<path d="M230,440 L700,230 L1170,440" stroke-width="28"/><path d="M300,410 L300,880 M1100,410 L1100,880" stroke-width="22"/>`;
  body += `<path d="M380,374 L380,430 M1020,374 L1020,430" stroke-width="12"/></g>`;
  // ground
  body += `<path d="M120,900 Q700,850 1280,900 L1280,915 Q700,880 120,915 Z" fill="${G}"/>`;
  // manger with the baby
  body += `<circle cx="652" cy="760" r="48" fill="url(#halo-warm)"/>`;
  body += `<g fill="${G}"><path d="M612,780 L788,780 L762,830 L638,830 Z"/><path d="M630,830 L600,890 L616,890 L650,830 Z M770,830 L800,890 L784,890 L750,830 Z"/></g>`;
  body += `<path d="M626,782 C 640,752 760,750 772,782 Z" fill="#fff6dc"/><circle cx="652" cy="758" r="19" fill="#fff6dc"/>`;
  // Mary (kneeling, left, facing the manger)
  body += `<circle cx="528" cy="612" r="58" fill="none" stroke="#fff3c4" stroke-width="5" opacity="0.8"/>`;
  body += `<g fill="${G}"><circle cx="530" cy="616" r="30"/><path d="M494,646 C 482,592 520,572 548,582 C 570,592 572,620 562,646 Z"/>`;
  body += `<path d="M498,648 C 476,662 468,694 466,734 C 463,792 450,842 424,880 L612,880 C 606,858 600,840 604,822 C 630,812 650,800 642,782 C 628,770 602,770 590,760 C 586,720 580,684 562,652 Z"/></g>`;
  // Joseph (standing, right, with staff)
  body += `<circle cx="880" cy="492" r="60" fill="none" stroke="#fff3c4" stroke-width="5" opacity="0.8"/>`;
  body += `<g fill="${G}"><circle cx="880" cy="494" r="32"/><path d="M846,532 C 820,546 814,582 816,622 C 820,702 810,792 798,880 L962,880 C 952,792 942,702 944,622 C 946,582 940,546 914,532 Z"/></g>`;
  body += `<path d="M972,880 L972,470 C 972,430 1010,430 1012,462" fill="none" stroke="${G}" stroke-width="14" stroke-linecap="round"/>`;
  body += `<path d="M928,604 L968,596" stroke="${G}" stroke-width="20" stroke-linecap="round"/>`;
  // sheep
  body += `<g fill="${G}"><ellipse cx="1150" cy="858" rx="70" ry="38"/><circle cx="1095" cy="840" r="22"/><circle cx="1130" cy="826" r="26"/><circle cx="1170" cy="826" r="26"/><circle cx="1205" cy="845" r="24"/><ellipse cx="1072" cy="852" rx="22" ry="16"/></g>`;
  const r = rng(9);
  for (let i = 0; i < 14; i++) body += sparkle(120 + r() * 1160, 60 + r() * 320, 6 + r() * 14, '#fff8dc', 0.5 + r() * 0.5);
  return svg(1400, 1000, defs, body);
}

function lightString() {
  const W = 2048;
  const H = 320;
  let defs = commonDefs();
  defs += `<linearGradient id="sock" x1="0" x2="1"><stop offset="0" stop-color="#0d2a12"/><stop offset="0.5" stop-color="#2e5a33"/><stop offset="1" stop-color="#0d2a12"/></linearGradient>`;
  let body = '';
  const swags = 3;
  const cols = ['red', 'gold', 'green', 'blue', 'pink', 'purple'];
  let idx = 0;
  let bulbs = '';
  for (let s = 0; s < swags; s++) {
    const x0 = (W * s) / swags;
    const x1 = (W * (s + 1)) / swags;
    const p0 = [x0, 34];
    const p1 = [(x0 + x1) / 2, 210];
    const p2 = [x1, 34];
    body += `<path d="M${p0[0]},${p0[1]} Q${p1[0]},${p1[1]} ${p2[0]},${p2[1]}" fill="none" stroke="#173a1c" stroke-width="7"/>`;
    body += `<path d="M${p0[0]},${p0[1] + 4} Q${p1[0]},${p1[1] + 4} ${p2[0]},${p2[1] + 4}" fill="none" stroke="#2c5c31" stroke-width="3" stroke-dasharray="10 8"/>`;
    for (let k = 1; k <= 7; k++) {
      const t = k / 8;
      const [x, y] = quadPt(p0, p1, p2, t);
      const c = cols[idx++ % cols.length];
      const a = (t - 0.5) * 16;
      bulbs += `<circle cx="${f(x)}" cy="${f(y + 52)}" r="78" fill="url(#halo-${c})"/>`;
      bulbs += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})"><rect x="-11" y="-4" width="22" height="30" rx="4" fill="url(#sock)"/>
        <path d="M0,24 C 26,30 30,62 18,86 C 10,100 -10,100 -18,86 C -30,62 -26,30 0,24 Z" fill="url(#orn-${c})"/>
        <path d="M-9,40 C -16,52 -16,68 -10,78" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="5" stroke-linecap="round"/></g>`;
    }
  }
  return svg(W, H, defs, body + bulbs);
}

function garlandBorder() {
  const W = 2048;
  const H = 380;
  const r = rng(31);
  let body = '';
  const swags = 3;
  let extras = '';
  for (let s = 0; s < swags; s++) {
    const x0 = (W * s) / swags;
    const x1 = (W * (s + 1)) / swags;
    const p0 = [x0, 60];
    const p1 = [(x0 + x1) / 2, 300];
    const p2 = [x1, 60];
    body += garlandSwag(r, p0, p1, p2, 78, 1.1);
    for (let k = 1; k < 10; k++) {
      const [x, y] = quadPt(p0, p1, p2, k / 10);
      extras += light(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, 6, ['gold', 'red', 'gold', 'blue'][k % 4]);
    }
    const [bx, by] = quadPt(p0, p1, p2, 0.5);
    extras += ball(bx, by + 92, 44, ['red', 'gold', 'blue'][s % 3], { string: 30 });
    extras += bauble(bx - 120, by + 10, 22, 'gold') + bauble(bx + 130, by + 8, 22, 'red');
  }
  for (const x of [W / 3, (2 * W) / 3]) extras += bow(x, 70, 0.55, 'red');
  extras += bow(26, 64, 0.5, 'red') + bow(W - 26, 64, 0.5, 'red');
  return svg(W, H, commonDefs(), body + extras);
}

function frameArt() {
  const W = 1920;
  const H = 1080;
  const r = rng(41);
  const inset = 64;
  let body = '';
  const edge = (x0, y0, x1, y1, n) => {
    let s = '';
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (let k = 0; k < 3; k++) s += needles(r, x + (r() - 0.5) * 60, y + (r() - 0.5) * 60, 46, 6);
    }
    return s;
  };
  body += edge(inset, inset, W - inset, inset, 120) + edge(inset, H - inset, W - inset, H - inset, 120);
  body += edge(inset, inset, inset, H - inset, 70) + edge(W - inset, inset, W - inset, H - inset, 70);
  let extras = '';
  const per = [
    [inset, inset, W - inset, inset, 16],
    [inset, H - inset, W - inset, H - inset, 16],
    [inset, inset, inset, H - inset, 9],
    [W - inset, inset, W - inset, H - inset, 9],
  ];
  const lc = ['gold', 'red', 'gold', 'blue', 'gold', 'green'];
  let li = 0;
  for (const [x0, y0, x1, y1, n] of per) {
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t + (r() - 0.5) * 30;
      const y = y0 + (y1 - y0) * t + (r() - 0.5) * 30;
      extras += light(x, y, 6.5, lc[li++ % lc.length]);
      if (i % 3 === 1) extras += bauble(x + 22, y + 18, 20, ['red', 'gold', 'silver', 'blue'][(i + li) % 4]);
    }
  }
  for (const [x, y, a] of [
    [inset, inset, 45],
    [W - inset, inset, 135],
    [inset, H - inset, -45],
    [W - inset, H - inset, -135],
  ])
    extras += hollySprig(x, y, 0.42, [a - 60, a, a + 60]);
  extras += bow(W / 2, inset, 0.85, 'red');
  return svg(W, H, commonDefs(), body + extras);
}

function snowTop() {
  const W = 2048;
  const H = 420;
  const r = rng(51);
  let defs = commonDefs();
  defs += `<linearGradient id="snowcap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.75" stop-color="#f2f7ff"/><stop offset="1" stop-color="#b9cdea"/></linearGradient>`;
  defs += `<linearGradient id="ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="0.5" stop-color="#cfe8ff" stop-opacity="0.75"/><stop offset="1" stop-color="#9fd0ff" stop-opacity="0.15"/></linearGradient>`;
  const yAt = (x) => 92 + Math.sin(x * 0.006) * 16 + Math.sin(x * 0.019 + 1) * 9 + Math.sin(x * 0.047) * 4;
  let icicles = '';
  for (let x = 20; x < W; x += 26 + r() * 40) {
    const L = 40 + r() ** 2 * 260;
    const w = 12 + r() * 16;
    const y = yAt(x) - 6;
    icicles += `<path d="M${f(x - w)},${f(y)} Q${f(x - w * 0.3)},${f(y + L * 0.6)} ${f(x)},${f(y + L)} Q${f(x + w * 0.3)},${f(y + L * 0.6)} ${f(x + w)},${f(y)} Z" fill="url(#ice)"/>`;
    icicles += `<path d="M${f(x - w * 0.35)},${f(y + 6)} Q${f(x - w * 0.15)},${f(y + L * 0.5)} ${f(x - 1)},${f(y + L * 0.85)}" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="2.5"/>`;
  }
  let d = `M0,0 L${W},0 L${W},${f(yAt(W))}`;
  for (let x = W; x >= 0; x -= 32) {
    const xm = x - 16;
    d += ` Q${f(xm)},${f(yAt(xm) + 14 + r() * 10)} ${f(x - 32)},${f(yAt(x - 32))}`;
  }
  d += ' Z';
  let body = icicles + `<path d="${d}" fill="url(#snowcap)"/>`;
  for (let i = 0; i < 40; i++) body += sparkle(r() * W, 20 + r() * 70, 5 + r() * 9, '#ffffff', 0.5 + r() * 0.5);
  return svg(W, H, defs, body);
}

const LETTER_DEFS = `<linearGradient id="goldText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7cf"/><stop offset="0.45" stop-color="#f5c542"/><stop offset="0.55" stop-color="#d99a1c"/><stop offset="1" stop-color="#fff0a8"/></linearGradient>
<linearGradient id="iceText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#d9ecff"/><stop offset="1" stop-color="#8fc3ff"/></linearGradient>
<linearGradient id="redText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a85"/><stop offset="0.5" stop-color="#e01b2f"/><stop offset="1" stop-color="#8a0717"/></linearGradient>`;

function feliz() {
  let body = textBlock('Feliz Natal', 1024, 470, 300, 'url(#goldText)', { stroke: '#5a1a00', sw: 9 });
  body += hollySprig(1024, 620, 0.55, [-170, -10, 90]);
  const r = rng(61);
  for (let i = 0; i < 16; i++) body += sparkle(140 + r() * 1760, 120 + r() * 600, 10 + r() * 26, '#fff8dc', 0.6 + r() * 0.4);
  return svg(2048, 800, commonDefs() + LETTER_DEFS, body);
}

function boasFestas() {
  let body = textBlock('Boas Festas', 1024, 470, 300, 'url(#iceText)', { stroke: '#0b2a66', sw: 9, glow: '#7ab8ff' });
  for (const [x, y, s] of [
    [250, 600, 70],
    [1800, 600, 70],
    [1024, 640, 48],
  ])
    body += snowflake(x, y, s, { w: 0.09 });
  const r = rng(62);
  for (let i = 0; i < 14; i++) body += sparkle(140 + r() * 1760, 120 + r() * 600, 8 + r() * 20, '#ffffff', 0.6 + r() * 0.4);
  return svg(2048, 800, commonDefs() + LETTER_DEFS, body);
}

function anoNovo() {
  let body = textBlock('Feliz Ano Novo', 1024, 450, 250, 'url(#goldText)', { stroke: '#3a2200', sw: 8 });
  const r = rng(63);
  for (let i = 0; i < 22; i++) {
    const x = 160 + r() * 1730;
    const y = 90 + r() * 640;
    if (y > 260 && y < 520) continue;
    body += sparkle(x, y, 10 + r() * 30, ['#fff8dc', '#ffd36b', '#ffffff'][i % 3], 0.6 + r() * 0.4);
  }
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2;
    const d = 20 + r() * 80;
    body += `<circle cx="${f(1024 + Math.cos(a) * d * 6)}" cy="${f(640 + Math.sin(a) * d * 0.9)}" r="${f(3 + r() * 5)}" fill="${['#ffd36b', '#ff6b81', '#7ab8ff', '#8ff0a4'][i % 4]}" opacity="0.85"/>`;
  }
  return svg(2048, 800, commonDefs() + LETTER_DEFS, body);
}

function snowyNight() {
  const W = 1920;
  const H = 1080;
  const r = rng(71);
  let defs = commonDefs();
  defs += `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#040a22"/><stop offset="0.55" stop-color="#0f2457"/><stop offset="0.8" stop-color="#2c4c8f"/><stop offset="1" stop-color="#4766a8"/></linearGradient>`;
  defs += `<radialGradient id="moonHalo"><stop offset="0" stop-color="#fff8dc" stop-opacity="0.55"/><stop offset="1" stop-color="#8fb0ff" stop-opacity="0"/></radialGradient>`;
  defs += `<linearGradient id="hill1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8c9ea"/><stop offset="1" stop-color="#7f96c4"/></linearGradient>`;
  defs += `<linearGradient id="hill2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3ecfa"/><stop offset="1" stop-color="#a9bde2"/></linearGradient>`;
  defs += `<linearGradient id="hill3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfdcf2"/></linearGradient>`;
  let body = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  for (let i = 0; i < 260; i++) {
    const y = r() ** 1.4 * 700;
    body += `<circle cx="${f(r() * W)}" cy="${f(y)}" r="${f(0.6 + r() ** 3 * 2.4)}" fill="#fff" opacity="${f(0.35 + r() * 0.65)}"/>`;
  }
  for (let i = 0; i < 7; i++) body += sparkle(r() * W, r() * 420, 8 + r() * 10, '#ffffff', 0.8);
  body += `<circle cx="1500" cy="220" r="320" fill="url(#moonHalo)"/><circle cx="1500" cy="220" r="88" fill="#fff6d8"/><circle cx="1470" cy="200" r="16" fill="#e9dfbd" opacity="0.7"/><circle cx="1528" cy="250" r="11" fill="#e9dfbd" opacity="0.6"/><circle cx="1520" cy="188" r="8" fill="#e9dfbd" opacity="0.6"/>`;
  const hill = (base, amp, seed, fill) => {
    const rr = rng(seed);
    const k1 = 0.002 + rr() * 0.002;
    const k2 = 0.006 + rr() * 0.004;
    const ph = rr() * 10;
    let d = `M0,${H}`;
    for (let x = 0; x <= W; x += 20) d += ` L${x},${f(base + Math.sin(x * k1 + ph) * amp + Math.sin(x * k2 + ph * 2) * amp * 0.4)}`;
    return { d: `${d} L${W},${H} Z`, y: (x) => base + Math.sin(x * k1 + ph) * amp + Math.sin(x * k2 + ph * 2) * amp * 0.4, fill };
  };
  const h1 = hill(700, 50, 1, 'url(#hill1)');
  const h2 = hill(800, 45, 2, 'url(#hill2)');
  const h3 = hill(930, 40, 3, 'url(#hill3)');
  body += `<path d="${h1.d}" fill="${h1.fill}"/>`;
  for (let i = 0; i < 46; i++) {
    const x = r() * W;
    body += pineSil(x, h1.y(x) + 8, 50 + r() * 50, '#1c2f5e');
  }
  body += `<path d="${h2.d}" fill="${h2.fill}"/>`;
  // village
  const houses = [
    [420, 1],
    [520, 0],
    [610, 1],
    [1080, 0],
    [1180, 1],
    [1290, 0],
  ];
  for (const [x, v] of houses) {
    const y = h2.y(x) + 10;
    const w = v ? 90 : 110;
    const h = v ? 70 : 60;
    body += `<rect x="${x - w / 2}" y="${f(y - h)}" width="${w}" height="${h}" fill="#3b2a4f"/>`;
    body += `<polygon points="${pts([
      [x - w / 2 - 12, y - h],
      [x, y - h - 52],
      [x + w / 2 + 12, y - h],
    ])}" fill="#f4f8ff"/>`;
    for (const dx of [-w / 4, w / 4]) body += `<rect x="${f(x + dx - 11)}" y="${f(y - h + 20)}" width="22" height="22" fill="#ffd36b"/><circle cx="${f(x + dx)}" cy="${f(y - h + 31)}" r="34" fill="url(#halo-gold)" opacity="0.7"/>`;
  }
  // church
  {
    const x = 840;
    const y = h2.y(x) + 12;
    body += `<rect x="${x - 70}" y="${f(y - 110)}" width="140" height="110" fill="#45325c"/><polygon points="${pts([
      [x - 84, y - 110],
      [x, y - 170],
      [x + 84, y - 110],
    ])}" fill="#f4f8ff"/>`;
    body += `<rect x="${x - 22}" y="${f(y - 250)}" width="44" height="120" fill="#45325c"/><polygon points="${pts([
      [x - 30, y - 250],
      [x, y - 330],
      [x + 30, y - 250],
    ])}" fill="#f4f8ff"/>`;
    body += `<path d="M${x},${f(y - 370)} V${f(y - 330)} M${x - 14},${f(y - 355)} H${x + 14}" stroke="#ffd36b" stroke-width="6"/>`;
    body += `<path d="M${x - 18},${f(y)} V${f(y - 50)} Q${x},${f(y - 72)} ${x + 18},${f(y - 50)} V${f(y)} Z" fill="#ffd36b"/><circle cx="${x}" cy="${f(y - 210)}" r="14" fill="#ffd36b"/><circle cx="${x}" cy="${f(y - 40)}" r="90" fill="url(#halo-gold)" opacity="0.6"/>`;
  }
  for (const x of [120, 230, 300, 1460, 1560, 1700, 1820]) body += pineSil(x, h2.y(x) + 14, 110 + r() * 90, '#14244c');
  body += `<path d="${h3.d}" fill="${h3.fill}"/>`;
  for (const [x, h] of [
    [70, 330],
    [200, 250],
    [1760, 300],
    [1870, 380],
  ])
    body += pineSil(x, h3.y(x) + 40, h, '#0d1a3a');
  for (let i = 0; i < 360; i++) body += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(1 + r() ** 2 * 4)}" fill="#fff" opacity="${f(0.4 + r() * 0.5)}"/>`;
  return svg(W, H, defs, body);
}

export const FIREPLACE_OPENING = [150 / 720, 712 / 1200, 570 / 720, 1072 / 1200];

function fireplace() {
  const W = 720;
  const H = 1200;
  const r = rng(81);
  let defs = commonDefs();
  defs += `<radialGradient id="vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>`;
  defs += `<radialGradient id="hearth" cx="0.5" cy="0.95" r="0.9"><stop offset="0" stop-color="#3a160a"/><stop offset="0.5" stop-color="#170805"/><stop offset="1" stop-color="#050202"/></radialGradient>`;
  defs += `<linearGradient id="stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3d5bd"/><stop offset="1" stop-color="#a89377"/></linearGradient>`;
  defs += `<linearGradient id="mantel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a5683a"/><stop offset="0.5" stop-color="#7a4520"/><stop offset="1" stop-color="#4a2810"/></linearGradient>`;
  defs += `<linearGradient id="logs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4a26"/><stop offset="1" stop-color="#3a1f0c"/></linearGradient>`;
  let body = `<rect width="${W}" height="${H}" fill="#5e3a2c"/>`;
  const bh = 40;
  const bw = 112;
  const brickCols = ['#9c3b25', '#a8452c', '#8a321f', '#b0503a', '#7c2c1c', '#a03f2a'];
  for (let row = 0; row * bh < H; row++) {
    const off = row % 2 ? -bw / 2 : 0;
    for (let x = off; x < W; x += bw) {
      const c = brickCols[Math.floor(r() * brickCols.length)];
      body += `<rect x="${f(x + 3)}" y="${f(row * bh + 3)}" width="${bw - 6}" height="${bh - 6}" rx="3" fill="${c}"/>`;
      if (r() > 0.6) body += `<rect x="${f(x + 8)}" y="${f(row * bh + 6)}" width="${f(30 + r() * 50)}" height="5" rx="2" fill="#fff" fill-opacity="0.08"/>`;
    }
  }
  body += `<rect width="${W}" height="${H}" fill="url(#vig)"/>`;
  // wreath on the chimney breast
  body += wreath(rng(82), 360, 300, 125, 82);
  // mantel
  body += `<rect x="0" y="582" width="${W}" height="30" fill="#000" fill-opacity="0.35" filter="url(#soft)"/>`;
  body += `<rect x="0" y="540" width="${W}" height="56" fill="url(#mantel)"/><rect x="0" y="540" width="${W}" height="8" fill="#c48a55"/>`;
  for (const x of [40, W - 80]) body += `<path d="M${x},596 h40 v40 q-20,30 -40,0 z" fill="url(#mantel)"/>`;
  body += garlandSwag(rng(83), [10, 545], [360, 560], [710, 545], 46, 1.4);
  for (let i = 0; i < 12; i++) body += light(30 + i * 60, 548 + (i % 2) * 10, 5, ['gold', 'red', 'gold', 'green'][i % 4]);
  // stone surround + opening
  const op = 'M150,1080 L150,800 Q150,712 360,712 Q570,712 570,800 L570,1080 Z';
  body += `<path d="M110,1080 L110,800 Q110,672 360,672 Q610,672 610,800 L610,1080 Z" fill="url(#stone)"/>`;
  body += `<path d="${op}" fill="url(#hearth)"/>`;
  body += `<path d="M150,800 Q150,712 360,712 Q570,712 570,800" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="14"/>`;
  // logs and embers
  body += `<g><rect x="200" y="1010" width="320" height="44" rx="22" fill="url(#logs)" transform="rotate(-6 360 1032)"/><rect x="210" y="1018" width="300" height="42" rx="21" fill="url(#logs)" transform="rotate(7 360 1040)"/>
    <ellipse cx="208" cy="1046" rx="14" ry="20" fill="#c08a5a"/><ellipse cx="512" cy="1052" rx="14" ry="20" fill="#c08a5a"/></g>`;
  for (let i = 0; i < 26; i++) body += `<circle cx="${f(215 + r() * 290)}" cy="${f(1060 + r() * 16)}" r="${f(2 + r() * 4)}" fill="${['#ff6a00', '#ffb000', '#ff3d00'][i % 3]}"/>`;
  body += `<ellipse cx="360" cy="1070" rx="170" ry="24" fill="url(#halo-warm)" opacity="0.7"/>`;
  // hearth slab + floor
  body += `<rect x="70" y="1078" width="580" height="44" rx="6" fill="url(#stone)"/><rect x="0" y="1122" width="${W}" height="${H - 1122}" fill="#3a2414"/>`;
  for (let x = 0; x < W; x += 90) body += `<line x1="${x}" y1="1122" x2="${x - 30}" y2="${H}" stroke="#24150b" stroke-width="3"/>`;
  // stockings hanging from the mantel
  body += stocking(108, 560, 0.26, 'red', 'green') + stocking(298, 560, 0.26, 'green', 'red') + stocking(488, 560, 0.26, 'red', 'gold');
  return svg(W, H, defs, body);
}

// Tileable textures: motifs are drawn with wrapped copies so the edges match.
function tiled(size, bg, motifs) {
  let body = `<rect width="${size}" height="${size}" fill="${bg}"/>`;
  for (const m of motifs) for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) body += `<g transform="translate(${dx} ${dy})">${m}</g>`;
  return body;
}

function giftPaperRed() {
  const S = 1024;
  const motifs = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const x = i * 256 + (j % 2 ? 128 : 0) + 64;
      const y = j * 256 + 64;
      motifs.push(`<polygon points="${pts(starPts(x, y, 46, 19))}" fill="url(#metalv)"/>`);
      motifs.push(`<circle cx="${x + 128}" cy="${y + 128}" r="9" fill="#ffe08a"/><circle cx="${x + 64}" cy="${y + 160}" r="5" fill="#fff" fill-opacity="0.7"/><circle cx="${x + 180}" cy="${y + 40}" r="5" fill="#fff" fill-opacity="0.7"/>`);
    }
  return svg(S, S, commonDefs(), tiled(S, '#b80f25', motifs));
}

function giftPaperGreen() {
  const S = 1024;
  const motifs = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const x = i * 256 + (j % 2 ? 128 : 0) + 64;
      const y = j * 256 + 80;
      motifs.push(snowflake(x, y, 44, { w: 0.1, glowColor: '#bfe6c8' }));
      motifs.push(`<circle cx="${x + 128}" cy="${y + 128}" r="11" fill="#d3122f"/><circle cx="${x + 124}" cy="${y + 124}" r="3.5" fill="#fff" fill-opacity="0.8"/>`);
    }
  return svg(S, S, commonDefs(), tiled(S, '#0f6b3a', motifs));
}

function plaid() {
  const S = 1024;
  let body = `<rect width="${S}" height="${S}" fill="#b3122b"/>`;
  for (let k = 0; k < 2; k++) {
    const o = k * 512;
    body += `<rect x="${o + 150}" y="0" width="190" height="${S}" fill="#0b3d1f" fill-opacity="0.6"/><rect x="0" y="${o + 150}" width="${S}" height="190" fill="#0b3d1f" fill-opacity="0.6"/>`;
    body += `<rect x="${o + 40}" y="0" width="34" height="${S}" fill="#000" fill-opacity="0.35"/><rect x="0" y="${o + 40}" width="${S}" height="34" fill="#000" fill-opacity="0.35"/>`;
    body += `<rect x="${o + 238}" y="0" width="8" height="${S}" fill="#ffd36b" fill-opacity="0.85"/><rect x="0" y="${o + 238}" width="${S}" height="8" fill="#ffd36b" fill-opacity="0.85"/>`;
    body += `<rect x="${o + 420}" y="0" width="6" height="${S}" fill="#fff" fill-opacity="0.7"/><rect x="0" y="${o + 420}" width="${S}" height="6" fill="#fff" fill-opacity="0.7"/>`;
  }
  // fine diagonal weave
  body += `<pattern id="twill" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0,8 L8,0" stroke="#000" stroke-opacity="0.12" stroke-width="2"/></pattern><rect width="${S}" height="${S}" fill="url(#twill)"/>`;
  return svg(S, S, commonDefs(), body);
}

function snowflakePattern() {
  const S = 1024;
  const motifs = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const x = i * 256 + (j % 2 ? 128 : 0) + 64;
      const y = j * 256 + 64;
      motifs.push(snowflake(x, y, j % 2 ? 54 : 70, { w: 0.08 }));
      motifs.push(`<circle cx="${x + 128}" cy="${y + 128}" r="6" fill="#fff" fill-opacity="0.85"/><circle cx="${x + 60}" cy="${y + 170}" r="4" fill="#fff" fill-opacity="0.6"/>`);
    }
  return svg(S, S, commonDefs(), tiled(S, '#153a86', motifs));
}

// ---------------------------------------------------------------------------
// catalogue
// ---------------------------------------------------------------------------
// size: suggested surface height as a fraction of the output height when the
// item is added as a new surface.

export const ART = [
  // Enfeites (fundo transparente)
  { id: 'arvore', name: 'Árvore de Natal', cat: 'enfeites', size: 0.78, draw: tree },
  { id: 'estrela', name: 'Estrela dourada', cat: 'enfeites', size: 0.36, draw: star },
  { id: 'estrela-guia', name: 'Estrela-guia', cat: 'enfeites', size: 0.7, draw: guideStar },
  { id: 'bola-vermelha', name: 'Bola vermelha', cat: 'enfeites', size: 0.32, draw: ornamentArt('red') },
  { id: 'bola-dourada', name: 'Bola dourada', cat: 'enfeites', size: 0.32, draw: ornamentArt('gold') },
  { id: 'bola-azul', name: 'Bola azul', cat: 'enfeites', size: 0.32, draw: ornamentArt('blue') },
  { id: 'guirlanda', name: 'Guirlanda', cat: 'enfeites', size: 0.5, draw: wreathArt },
  { id: 'laco', name: 'Laço vermelho', cat: 'enfeites', size: 0.3, draw: bowArt },
  { id: 'sinos', name: 'Sinos', cat: 'enfeites', size: 0.4, draw: bells },
  { id: 'bengala', name: 'Bengala doce', cat: 'enfeites', size: 0.5, draw: candyCane },
  { id: 'presente-vermelho', name: 'Presente vermelho', cat: 'enfeites', size: 0.36, draw: giftArt('red', 'gold', 'stars') },
  { id: 'presente-verde', name: 'Presente verde', cat: 'enfeites', size: 0.36, draw: giftArt('green', 'red', 'dots') },
  { id: 'presentes', name: 'Pilha de presentes', cat: 'enfeites', size: 0.42, draw: giftPile },
  { id: 'boneco-neve', name: 'Boneco de neve', cat: 'enfeites', size: 0.6, draw: snowman },
  { id: 'floco', name: 'Floco de neve', cat: 'enfeites', size: 0.36, draw: snowflakeArt },
  { id: 'gorro', name: 'Gorro natalino', cat: 'enfeites', size: 0.3, draw: santaHat },
  { id: 'meia', name: 'Meia natalina', cat: 'enfeites', size: 0.42, draw: stockingArt },
  { id: 'azevinho', name: 'Azevinho', cat: 'enfeites', size: 0.28, draw: hollyArt },
  { id: 'vela', name: 'Vela', cat: 'enfeites', size: 0.45, draw: candle },
  { id: 'casinha', name: 'Casinha de gengibre', cat: 'enfeites', size: 0.5, draw: gingerHouse },
  { id: 'biscoito', name: 'Biscoito de gengibre', cat: 'enfeites', size: 0.4, draw: gingerMan },
  { id: 'presepio', name: 'Presépio (silhueta)', cat: 'enfeites', size: 0.6, draw: nativity },
  // Faixas e molduras
  { id: 'pisca-pisca', name: 'Cordão de luzes', cat: 'faixas', size: 0.16, draw: lightString },
  { id: 'festao', name: 'Festão de pinheiro', cat: 'faixas', size: 0.18, draw: garlandBorder },
  { id: 'moldura', name: 'Moldura natalina', cat: 'faixas', size: 1, draw: frameArt },
  { id: 'neve-topo', name: 'Neve e pingentes de gelo', cat: 'faixas', size: 0.2, draw: snowTop },
  // Letreiros
  { id: 'feliz-natal', name: 'Feliz Natal', cat: 'letreiros', size: 0.3, draw: feliz },
  { id: 'boas-festas', name: 'Boas Festas', cat: 'letreiros', size: 0.3, draw: boasFestas },
  { id: 'feliz-ano-novo', name: 'Feliz Ano Novo', cat: 'letreiros', size: 0.3, draw: anoNovo },
  // Cenários (opacos)
  { id: 'noite-neve', name: 'Noite de neve na vila', cat: 'cenarios', size: 1, draw: snowyNight, opaque: true },
  { id: 'lareira', name: 'Lareira', cat: 'cenarios', size: 0.8, draw: fireplace, opaque: true, fireOpening: FIREPLACE_OPENING },
  // Texturas repetíveis
  { id: 'papel-vermelho', name: 'Papel de presente vermelho', cat: 'texturas', size: 0.5, draw: giftPaperRed, opaque: true, tile: true },
  { id: 'papel-verde', name: 'Papel de presente verde', cat: 'texturas', size: 0.5, draw: giftPaperGreen, opaque: true, tile: true },
  { id: 'xadrez', name: 'Xadrez natalino', cat: 'texturas', size: 0.5, draw: plaid, opaque: true, tile: true },
  { id: 'flocos-azul', name: 'Flocos no azul', cat: 'texturas', size: 0.5, draw: snowflakePattern, opaque: true, tile: true },
];
