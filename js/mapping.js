// Geometry core: homographies (perspective correction), polygon utilities and
// GPU geometry generation for every surface type. Pure math, no DOM — it is
// unit-tested in Node (tests/mapping.test.mjs).

export const QUAD_TYPES = new Set(['quad', 'rect', 'circle', 'ellipse']);
export const UV_SQUARE = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
export const UV_TRIANGLE = [
  [0.5, 0],
  [1, 1],
  [0, 1],
];

// ---------------------------------------------------------------------------
// 3x3 matrices (row-major arrays of 9 numbers)
// ---------------------------------------------------------------------------

/** Homography that maps the unit square (0,0)(1,0)(1,1)(0,1) onto quad p0..p3. */
export function squareToQuad(p) {
  const [x0, y0] = p[0];
  const [x1, y1] = p[1];
  const [x2, y2] = p[2];
  const [x3, y3] = p[3];
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  if (Math.abs(sx) < 1e-12 && Math.abs(sy) < 1e-12) {
    // Parallelogram: affine is exact.
    return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0, 1];
  }
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-14) return null;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

/** General homography mapping 4 src points onto 4 dst points (DLT, Gaussian elimination). */
export function solveHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-14) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) return null;
  const k = 1 / det;
  return [
    A * k,
    -(b * i - c * h) * k,
    (b * f - c * e) * k,
    B * k,
    (a * i - c * g) * k,
    -(a * f - c * d) * k,
    C * k,
    -(a * h - b * g) * k,
    (a * e - b * d) * k,
  ];
}

export function mul3(m, n) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = m[i * 3] * n[j] + m[i * 3 + 1] * n[3 + j] + m[i * 3 + 2] * n[6 + j];
  return r;
}

/** Applies homography and returns the projected 2D point. */
export function applyH(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/** Applies homography and returns the homogeneous triple (linear in x,y). */
export function applyH3(m, x, y) {
  return [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5], m[6] * x + m[7] * y + m[8]];
}

/** Affine matrix mapping triangle src -> triangle dst (as a 3x3 homography). */
export function affineFromTriangles(src, dst) {
  const [[x0, y0], [x1, y1], [x2, y2]] = src;
  const S = [x1 - x0, x2 - x0, x0, y1 - y0, y2 - y0, y0, 0, 0, 1];
  const [[u0, v0], [u1, v1], [u2, v2]] = dst;
  const D = [u1 - u0, u2 - u0, u0, v1 - v0, v2 - v0, v0, 0, 0, 1];
  const Si = invert3(S);
  if (!Si) return null;
  return mul3(D, Si);
}

// ---------------------------------------------------------------------------
// Polygon helpers
// ---------------------------------------------------------------------------

export function bbox(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export function centroid(pts) {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

export function pointInPolygon(pt, poly) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-30) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a[0] + t * dx;
  const qy = a[1] + t * dy;
  return { d: Math.hypot(p[0] - qx, p[1] - qy), t, q: [qx, qy] };
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function pointInTri(p, a, b, c) {
  const d1 = cross(p, a, b);
  const d2 = cross(p, b, c);
  const d3 = cross(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Ear-clipping triangulation. Returns index triples. Falls back to a fan. */
export function triangulate(pts) {
  const n = pts.length;
  if (n < 3) return [];
  const idx = [...Array(n).keys()];
  if (signedArea(pts) < 0) idx.reverse();
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let earFound = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % idx.length];
      const a = pts[i0];
      const b = pts[i1];
      const c = pts[i2];
      if (cross(a, b, c) <= 1e-14) continue; // reflex or degenerate
      let contains = false;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (pointInTri(pts[j], a, b, c)) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      tris.push([i0, i1, i2]);
      idx.splice(i, 1);
      earFound = true;
      break;
    }
    if (!earFound) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  else if (idx.length > 3) for (let i = 1; i < idx.length - 1; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
  return tris;
}

/** Sorts 4 arbitrary points into TL, TR, BR, BL (clockwise on screen, y down). */
export function orderQuad(pts) {
  const [cx, cy] = centroid(pts);
  const sorted = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let start = 0;
  let best = Infinity;
  sorted.forEach((p, i) => {
    const s = p[0] + p[1];
    if (s < best) {
      best = s;
      start = i;
    }
  });
  return [...sorted.slice(start), ...sorted.slice(0, start)].map((p) => [p[0], p[1]]);
}

/** Orders 3 points as apex (top-most) followed by right and left base points. */
export function orderTriangle(pts) {
  const p = pts.map((q) => [q[0], q[1]]);
  p.sort((a, b) => a[1] - b[1]);
  const apex = p[0];
  const [a, b] = [p[1], p[2]];
  return a[0] >= b[0] ? [apex, a, b] : [apex, b, a];
}

// ---------------------------------------------------------------------------
// Shape constructors (normalized output coordinates 0..1, y down)
// ---------------------------------------------------------------------------

export function rectPoints(x, y, w, h) {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

export function trianglePoints(x, y, w, h) {
  return [
    [x + w / 2, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

export function regularPolygon(cx, cy, rx, ry, n, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/** Grid points (row-major) for a mesh warp, generated through the quad's homography. */
export function meshFromQuad(quad, cols, rows) {
  const H = squareToQuad(quad);
  const pts = [];
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) pts.push(H ? applyH(H, i / cols, j / rows) : [quad[0][0], quad[0][1]]);
  return pts;
}

export function meshCorners(points, cols, rows) {
  const at = (i, j) => points[j * (cols + 1) + i];
  return [at(0, 0), at(cols, 0), at(cols, rows), at(0, rows)];
}

export function meshBoundary(points, cols, rows) {
  const at = (i, j) => points[j * (cols + 1) + i];
  const out = [];
  for (let i = 0; i < cols; i++) out.push(at(i, 0));
  for (let j = 0; j < rows; j++) out.push(at(cols, j));
  for (let i = cols; i > 0; i--) out.push(at(i, rows));
  for (let j = rows; j > 0; j--) out.push(at(0, j));
  return out;
}

/** Re-samples a mesh to a new resolution, keeping its current warp (bilinear per cell). */
export function resampleMesh(points, cols, rows, newCols, newRows) {
  const at = (i, j) => points[Math.min(rows, j) * (cols + 1) + Math.min(cols, i)];
  const out = [];
  for (let j = 0; j <= newRows; j++) {
    for (let i = 0; i <= newCols; i++) {
      const u = (i / newCols) * cols;
      const v = (j / newRows) * rows;
      const ci = Math.min(cols - 1, Math.floor(u));
      const cj = Math.min(rows - 1, Math.floor(v));
      const H = squareToQuad([at(ci, cj), at(ci + 1, cj), at(ci + 1, cj + 1), at(ci, cj + 1)]);
      out.push(H ? applyH(H, u - ci, v - cj) : [...at(ci, cj)]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transformations
// ---------------------------------------------------------------------------

/** Transform points in pixel space so rotation keeps the aspect ratio. */
export function transformPoints(pts, { dx = 0, dy = 0, scale = 1, rotation = 0, sx = null, sy = null }, res, center = null) {
  const [cx, cy] = center || centroid(pts);
  const W = res[0];
  const Hh = res[1];
  const c = Math.cos((rotation * Math.PI) / 180);
  const s = Math.sin((rotation * Math.PI) / 180);
  const kx = sx ?? scale;
  const ky = sy ?? scale;
  return pts.map(([x, y]) => {
    let px = (x - cx) * W * kx;
    let py = (y - cy) * Hh * ky;
    const rx = px * c - py * s;
    const ry = px * s + py * c;
    return [cx + rx / W + dx, cy + ry / Hh + dy];
  });
}

export function surfaceCenter(surface) {
  return centroid(surfaceOutline(surface, surface.points, 16));
}

// ---------------------------------------------------------------------------
// Outlines & GPU geometry
// ---------------------------------------------------------------------------

export function ellipseOutline(quad, segments = 48) {
  const H = squareToQuad(quad);
  if (!H) return quad.map((p) => [...p]);
  const out = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push(applyH(H, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)));
  }
  return out;
}

/** Outline of the visible shape (used for hit testing, labels and output outlines). */
export function surfaceOutline(surface, pts = surface.points, segments = 48) {
  switch (surface.type) {
    case 'circle':
    case 'ellipse':
      return ellipseOutline(pts, segments);
    case 'mesh':
      return meshBoundary(pts, surface.mesh.cols, surface.mesh.rows);
    default:
      return pts;
  }
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Builds GPU-ready triangles: interleaved [x, y, U, V, W] where (U/W, V/W) is the
 * surface texture coordinate. (U,V,W) is linear in screen space, so the GPU's
 * linear interpolation reproduces the exact projective (homographic) mapping.
 */
export function buildGeometry(surface, pts, res) {
  const [RW, RH] = res;
  const px = (p) => [p[0] * RW, p[1] * RH];
  const verts = [];
  const push = (p, uvw) => verts.push(p[0], p[1], uvw[0], uvw[1], uvw[2]);
  let shape = 0;
  let sizePx = [1, 1];
  let poly = null;
  const type = surface.type;

  if (QUAD_TYPES.has(type)) {
    const H = squareToQuad(pts);
    const Hi = H && invert3(H);
    if (!Hi) return null;
    const idx = [0, 1, 2, 0, 2, 3];
    for (const i of idx) push(pts[i], applyH3(Hi, pts[i][0], pts[i][1]));
    const q = pts.map(px);
    sizePx = [(dist(q[0], q[1]) + dist(q[3], q[2])) / 2, (dist(q[0], q[3]) + dist(q[1], q[2])) / 2];
    shape = type === 'circle' || type === 'ellipse' ? 1 : 0;
  } else if (type === 'triangle') {
    for (let i = 0; i < 3; i++) push(pts[i], [UV_TRIANGLE[i][0], UV_TRIANGLE[i][1], 1]);
    const q = pts.map(px);
    const base = dist(q[1], q[2]);
    const h = base > 0 ? Math.abs(cross(q[1], q[2], q[0])) / base : 1;
    sizePx = [base, h];
    shape = 2;
  } else if (type === 'mesh') {
    const { cols, rows } = surface.mesh;
    const at = (i, j) => pts[j * (cols + 1) + i];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const cell = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        const Hc = squareToQuad(cell);
        const Hci = Hc && invert3(Hc);
        if (!Hci) continue;
        const du = 1 / cols;
        const dv = 1 / rows;
        const M = mul3([du, 0, i * du, 0, dv, j * dv, 0, 0, 1], Hci);
        for (const k of [0, 1, 2, 0, 2, 3]) push(cell[k], applyH3(M, cell[k][0], cell[k][1]));
      }
    }
    const c = meshCorners(pts, cols, rows).map(px);
    sizePx = [(dist(c[0], c[1]) + dist(c[3], c[2])) / 2, (dist(c[0], c[3]) + dist(c[1], c[2])) / 2];
    shape = 0;
  } else {
    // polygon: planar mapping over the bounding box
    const b = bbox(pts);
    const w = b.w || 1e-6;
    const h = b.h || 1e-6;
    const uv = (p) => [(p[0] - b.minX) / w, (p[1] - b.minY) / h, 1];
    for (const [a, bb, c] of triangulate(pts)) {
      push(pts[a], uv(pts[a]));
      push(pts[bb], uv(pts[bb]));
      push(pts[c], uv(pts[c]));
    }
    sizePx = [w * RW, h * RH];
    poly = pts.slice(0, 48).map((p) => [(p[0] - b.minX) / w, (p[1] - b.minY) / h]);
    shape = 3;
  }
  return {
    verts: new Float32Array(verts),
    count: verts.length / 5,
    shape,
    sizePx,
    aspect: sizePx[0] / Math.max(1e-6, sizePx[1]),
    poly,
  };
}

/** Quick validation used by the editor (e.g. prevents saving NaN coordinates). */
export function validPoints(pts) {
  return Array.isArray(pts) && pts.length >= 3 && pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}
