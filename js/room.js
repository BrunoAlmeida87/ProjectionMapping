// Procedural residential room used by the demo: a simple 3D model projected
// with a pinhole camera (so every object is in correct perspective), drawn
// with Canvas 2D. The same 3D definitions produce the mapping surfaces.

export const CAM = { eye: 1.45, fx: 0.5625, fy: 1.0 };
const BACK = -4.2;
const W2 = 2.6;
const HGT = 2.7;

/** 3D (meters) -> normalized output coordinates. */
export function proj([X, Y, Z]) {
  const d = -Z;
  return [0.5 + (CAM.fx * X) / d, 0.5 - (CAM.fy * (Y - CAM.eye)) / d];
}

const box = (x0, x1, y0, y1, z) => [
  [x0, y1, z],
  [x1, y1, z],
  [x1, y0, z],
  [x0, y0, z],
];

export const OBJ = {
  wall: box(-W2, W2, 0, HGT, BACK),
  door: box(-0.75, 0.2, 0, 2.1, BACK + 0.01),
  cabinet: { x0: -2.35, x1: -1.25, y0: 0, y1: 2.0, z0: BACK, z1: BACK + 0.55 },
  shelf: { x0: 0.95, x1: 2.3, y0: 0, y1: 2.15, z0: BACK, z1: BACK + 0.36 },
  table: { x0: -0.9, x1: 0.7, z0: -2.85, z1: -2.15, y: 0.62, th: 0.05 },
  floor: [
    [-W2, 0, BACK],
    [W2, 0, BACK],
    [W2, 0, -2.45],
    [-W2, 0, -2.45],
  ],
};

export const P = (pts) => pts.map(proj);

export function cabinetFront() {
  const c = OBJ.cabinet;
  return P(box(c.x0, c.x1, c.y0 + 0.03, c.y1, c.z1));
}
export function shelfFront() {
  const s = OBJ.shelf;
  return P(box(s.x0, s.x1, s.y0, s.y1, s.z1));
}
export function tableTop() {
  const t = OBJ.table;
  return P([
    [t.x0, t.y, t.z0],
    [t.x1, t.y, t.z0],
    [t.x1, t.y, t.z1],
    [t.x0, t.y, t.z1],
  ]);
}

function hull(points) {
  const pts = points.map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Silhouettes used as masks (screen-space convex hulls). */
export function silhouette(name) {
  if (name === 'cabinet' || name === 'shelf') {
    const c = OBJ[name];
    const pts = [];
    for (const x of [c.x0, c.x1]) for (const y of [c.y0, c.y1]) for (const z of [c.z0, c.z1]) pts.push(proj([x, y, z]));
    return hull(pts);
  }
  if (name === 'table') {
    const t = OBJ.table;
    const pts = [];
    for (const x of [t.x0, t.x1]) for (const z of [t.z0, t.z1]) for (const y of [0, t.y]) pts.push(proj([x, y, z]));
    return hull(pts);
  }
  return [];
}

// ---------------------------------------------------------------- drawing

export function renderRoom(width = 1920, height = 1080) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const S = (p) => [p[0] * width, p[1] * height];
  const poly = (pts3, fill, stroke = null, lw = 1) => {
    const pts = pts3.map((p) => S(proj(p)));
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
    return pts;
  };
  const line = (a, b, color, lw = 1) => {
    const p = S(proj(a));
    const q = S(proj(b));
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  };
  const grad = (p0, p1, stops) => {
    const a = S(p0);
    const b = S(p1);
    const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    return g;
  };

  ctx.fillStyle = '#cfc8bb';
  ctx.fillRect(0, 0, width, height);
  const near = -1.2;
  // ceiling
  poly([[-W2, HGT, BACK], [W2, HGT, BACK], [W2, HGT, near], [-W2, HGT, near]], grad([0.5, 0], [0.5, 0.2], [[0, '#d8d3ca'], [1, '#ebe7df']]));
  // side walls
  poly([[-W2, HGT, near], [-W2, HGT, BACK], [-W2, 0, BACK], [-W2, 0, near]], grad([0, 0.5], [0.16, 0.5], [[0, '#c4bcae'], [1, '#d6cfc2']]));
  poly([[W2, HGT, BACK], [W2, HGT, near], [W2, 0, near], [W2, 0, BACK]], grad([1, 0.5], [0.84, 0.5], [[0, '#c4bcae'], [1, '#d6cfc2']]));
  // back wall
  poly(OBJ.wall, grad([0.5, 0.2], [0.5, 0.85], [[0, '#e4ded2'], [1, '#d9d2c5']]));
  // floor + planks
  poly([[-W2, 0, BACK], [W2, 0, BACK], [W2, 0, near], [-W2, 0, near]], grad([0.5, 0.84], [0.5, 1], [[0, '#8a6644'], [1, '#a37a52']]));
  for (let x = -W2; x <= W2 + 1e-6; x += 0.2) line([x, 0, BACK], [x, 0, near], 'rgba(60,38,20,0.35)', 1.2);
  for (let z = BACK; z < near; z += 1.1) {
    for (let x = -W2; x < W2; x += 0.4) {
      const zz = z + ((Math.round((x + W2) / 0.2) % 3) * 0.37);
      line([x, 0, zz], [x + 0.2, 0, zz], 'rgba(60,38,20,0.25)', 1);
    }
  }
  // corner shading
  line([-W2, 0, BACK], [-W2, HGT, BACK], 'rgba(0,0,0,0.12)', 3);
  line([W2, 0, BACK], [W2, HGT, BACK], 'rgba(0,0,0,0.12)', 3);
  // baseboards
  poly([[-W2, 0.1, BACK + 0.005], [W2, 0.1, BACK + 0.005], [W2, 0, BACK + 0.005], [-W2, 0, BACK + 0.005]], '#f1eee8');
  poly([[-W2, 0.1, near], [-W2, 0.1, BACK], [-W2, 0, BACK], [-W2, 0, near]], '#e9e5de');
  poly([[W2, 0.1, BACK], [W2, 0.1, near], [W2, 0, near], [W2, 0, BACK]], '#e9e5de');

  // rug
  ctx.save();
  const rug = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    rug.push([0 + Math.cos(a) * 1.55, 0.002, -2.55 + Math.sin(a) * 0.75]);
  }
  poly(rug, '#7d3b3b', 'rgba(230,200,170,0.6)', 3);
  ctx.restore();

  // door (on back wall)
  const d = { x0: -0.75, x1: 0.2, y1: 2.1, z: BACK + 0.01 };
  poly(box(d.x0 - 0.08, d.x1 + 0.08, 0, d.y1 + 0.08, d.z), '#f3f0ea', 'rgba(0,0,0,0.15)', 1);
  poly(box(d.x0, d.x1, 0, d.y1, d.z + 0.005), grad([0.45, 0.35], [0.45, 0.84], [[0, '#efebe4'], [1, '#e3ddd3']]), 'rgba(0,0,0,0.25)', 1.5);
  poly(box(d.x0 + 0.12, d.x1 - 0.12, 1.15, 1.95, d.z + 0.01), null, 'rgba(0,0,0,0.18)', 2);
  poly(box(d.x0 + 0.12, d.x1 - 0.12, 0.15, 0.95, d.z + 0.01), null, 'rgba(0,0,0,0.18)', 2);
  const knob = S(proj([d.x1 - 0.1, 1.0, d.z + 0.02]));
  ctx.fillStyle = '#b08d57';
  ctx.beginPath();
  ctx.arc(knob[0], knob[1], width * 0.0035, 0, Math.PI * 2);
  ctx.fill();

  // cabinet
  const cb = OBJ.cabinet;
  poly([[cb.x1, cb.y1, cb.z0], [cb.x1, cb.y1, cb.z1], [cb.x1, cb.y0, cb.z1], [cb.x1, cb.y0, cb.z0]], '#b9b2a6');
  poly(box(cb.x0, cb.x1, cb.y0, cb.y1, cb.z1), grad([0.2, 0.37], [0.2, 0.9], [[0, '#f1ede6'], [1, '#e2ddd3']]), 'rgba(0,0,0,0.3)', 2);
  poly(box(cb.x0, cb.x1, cb.y0, 0.08, cb.z1 + 0.001), '#8f877b');
  const mid = (cb.x0 + cb.x1) / 2;
  line([mid, 0.1, cb.z1 + 0.002], [mid, cb.y1 - 0.02, cb.z1 + 0.002], 'rgba(0,0,0,0.45)', 2);
  for (const x of [mid - 0.07, mid + 0.07]) line([x, 0.95, cb.z1 + 0.01], [x, 1.25, cb.z1 + 0.01], '#9a8f7e', 4);
  for (const x0 of [cb.x0 + 0.06, mid + 0.06]) poly(box(x0, x0 + (cb.x1 - cb.x0) / 2 - 0.12, 0.18, cb.y1 - 0.08, cb.z1 + 0.003), null, 'rgba(0,0,0,0.2)', 1.5);

  // bookshelf
  const sh = OBJ.shelf;
  poly([[sh.x0, sh.y1, sh.z1], [sh.x0, sh.y1, sh.z0], [sh.x0, sh.y0, sh.z0], [sh.x0, sh.y0, sh.z1]], '#a68560');
  poly(box(sh.x0, sh.x1, sh.y0, sh.y1, sh.z0 + 0.01), '#8a6c4c');
  const levels = [0.08, 0.5, 0.92, 1.34, 1.76];
  const colors = ['#9b2c2c', '#2b6cb0', '#2f855a', '#b7791f', '#6b46c1', '#c05621', '#285e61', '#97266d', '#4a5568', '#d69e2e'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let li = 0; li < levels.length - 1; li++) {
    const y0 = levels[li] + 0.03;
    let x = sh.x0 + 0.06;
    while (x < sh.x1 - 0.12) {
      const bw = 0.03 + rnd() * 0.05;
      const bh = 0.24 + rnd() * 0.12;
      const lean = rnd() > 0.92;
      if (rnd() > 0.12) {
        const z = sh.z1 - 0.06;
        if (lean) poly([[x, y0 + bh * 0.9, z], [x + bh * 0.4, y0 + bh * 0.95, z], [x + bh * 0.45 + bw, y0, z], [x + bw, y0, z]], colors[Math.floor(rnd() * colors.length)]);
        else poly(box(x, x + bw, y0, y0 + bh, z), colors[Math.floor(rnd() * colors.length)], 'rgba(0,0,0,0.25)', 1);
      }
      x += bw + 0.005 + (lean ? 0.18 : 0);
    }
  }
  for (const y of levels) {
    poly([[sh.x0, y + 0.03, sh.z1], [sh.x1, y + 0.03, sh.z1], [sh.x1, y, sh.z1], [sh.x0, y, sh.z1]], '#c9a57a');
    poly([[sh.x0, y + 0.03, sh.z0], [sh.x1, y + 0.03, sh.z0], [sh.x1, y + 0.03, sh.z1], [sh.x0, y + 0.03, sh.z1]], '#d8b78e');
  }
  poly(box(sh.x0, sh.x0 + 0.04, 0, sh.y1, sh.z1), '#c9a57a');
  poly(box(sh.x1 - 0.04, sh.x1, 0, sh.y1, sh.z1), '#c9a57a');
  poly(box(sh.x0, sh.x1, sh.y1 - 0.04, sh.y1, sh.z1), '#c9a57a');

  // plant
  const pot = [[-2.0, 0.42, -3.0], [-1.7, 0.42, -3.0], [-1.75, 0, -3.0], [-1.95, 0, -3.0]];
  poly(pot, '#c46a3f');
  ctx.fillStyle = '#3f7a45';
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI / 2 + (i - 6.5) * 0.2;
    const base = S(proj([-1.85, 0.42, -3.0]));
    const len = height * (0.06 + 0.04 * ((i * 37) % 5) / 5);
    ctx.beginPath();
    ctx.ellipse(base[0] + Math.cos(a) * len * 0.6, base[1] + Math.sin(a) * len * 0.6, len * 0.55, len * 0.12, a, 0, Math.PI * 2);
    ctx.fill();
  }

  // table
  const t = OBJ.table;
  const leg = (x, z) => poly(box(x - 0.03, x + 0.03, 0, t.y, z), '#8a6a4a');
  leg(t.x0 + 0.08, t.z0 + 0.08);
  leg(t.x1 - 0.08, t.z0 + 0.08);
  poly([[t.x0, t.y, t.z1], [t.x1, t.y, t.z1], [t.x1, t.y - t.th, t.z1], [t.x0, t.y - t.th, t.z1]], '#a07c58');
  poly([[t.x1, t.y, t.z0], [t.x1, t.y, t.z1], [t.x1, t.y - t.th, t.z1], [t.x1, t.y - t.th, t.z0]], '#8f6d4c');
  leg(t.x0 + 0.08, t.z1 - 0.08);
  leg(t.x1 - 0.08, t.z1 - 0.08);
  poly([[t.x0, t.y, t.z0], [t.x1, t.y, t.z0], [t.x1, t.y, t.z1], [t.x0, t.y, t.z1]], grad([0.5, 0.72], [0.5, 0.8], [[0, '#d6b48c'], [1, '#e2c29b']]), 'rgba(0,0,0,0.35)', 1.5);

  // soft vignette (ambient occlusion feel)
  const v = ctx.createRadialGradient(width / 2, height * 0.55, height * 0.3, width / 2, height * 0.55, height * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, width, height);
  return c;
}
