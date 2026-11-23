// Unit tests for the geometry core. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  squareToQuad,
  solveHomography,
  invert3,
  applyH,
  applyH3,
  triangulate,
  orderQuad,
  orderTriangle,
  buildGeometry,
  meshFromQuad,
  resampleMesh,
  pointInPolygon,
  signedArea,
  transformPoints,
  UV_SQUARE,
} from '../js/mapping.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

const quad = [
  [0.1, 0.2],
  [0.8, 0.05],
  [0.95, 0.9],
  [0.2, 0.7],
];

test('squareToQuad maps the unit square corners onto the quad', () => {
  const H = squareToQuad(quad);
  UV_SQUARE.forEach((uv, i) => {
    const [x, y] = applyH(H, uv[0], uv[1]);
    close(x, quad[i][0]);
    close(y, quad[i][1]);
  });
});

test('squareToQuad agrees with the general DLT solver', () => {
  const H1 = squareToQuad(quad);
  const H2 = solveHomography(UV_SQUARE, quad);
  for (const [u, v] of [
    [0.3, 0.6],
    [0.5, 0.5],
    [0.9, 0.1],
  ]) {
    const a = applyH(H1, u, v);
    const b = applyH(H2, u, v);
    close(a[0], b[0], 1e-9);
    close(a[1], b[1], 1e-9);
  }
});

test('inverse homography round-trips points', () => {
  const H = squareToQuad(quad);
  const Hi = invert3(H);
  const [x, y] = applyH(H, 0.37, 0.81);
  const [u, v] = applyH(Hi, x, y);
  close(u, 0.37);
  close(v, 0.81);
});

test('perspective is projective, not bilinear: quad centre maps to diagonal intersection', () => {
  // The image of the square centre under a homography is the intersection of the quad diagonals.
  const H = squareToQuad(quad);
  const [cx, cy] = applyH(H, 0.5, 0.5);
  const [a, b, c, d] = quad;
  // Solve a + t(c-a) = b + s(d-b)
  const den = (c[0] - a[0]) * (d[1] - b[1]) - (c[1] - a[1]) * (d[0] - b[0]);
  const t = ((b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0])) / den;
  close(cx, a[0] + t * (c[0] - a[0]), 1e-9);
  close(cy, a[1] + t * (c[1] - a[1]), 1e-9);
});

test('GPU attribute (U,V,W) interpolated linearly gives the exact homography', () => {
  const s = { type: 'quad', points: quad };
  const g = buildGeometry(s, quad, [1920, 1080]);
  assert.equal(g.count, 6);
  // Interpolate the first triangle (0,1,2) at barycentric weights and compare to H^-1.
  const v = (i) => Array.from(g.verts.slice(i * 5, i * 5 + 5));
  const [A, B, C] = [v(0), v(1), v(2)];
  const w = [0.2, 0.3, 0.5];
  const mix = (k) => A[k] * w[0] + B[k] * w[1] + C[k] * w[2];
  const x = mix(0);
  const y = mix(1);
  const uv = [mix(2) / mix(4), mix(3) / mix(4)];
  const Hi = invert3(squareToQuad(quad));
  const expect = applyH(Hi, x, y);
  close(uv[0], expect[0], 1e-6);
  close(uv[1], expect[1], 1e-6);
  const h3 = applyH3(Hi, x, y);
  close(h3[0] / h3[2], expect[0], 1e-9);
});

test('triangulate handles concave polygons', () => {
  const L = [
    [0, 0],
    [2, 0],
    [2, 1],
    [1, 1],
    [1, 2],
    [0, 2],
  ];
  const tris = triangulate(L);
  assert.equal(tris.length, 4);
  let area = 0;
  for (const [a, b, c] of tris) area += Math.abs(signedArea([L[a], L[b], L[c]]));
  close(area, 3, 1e-9);
});

test('orderQuad sorts clicked points into TL, TR, BR, BL', () => {
  const shuffled = [
    [0.9, 0.9],
    [0.1, 0.1],
    [0.1, 0.9],
    [0.9, 0.1],
  ];
  assert.deepEqual(orderQuad(shuffled), [
    [0.1, 0.1],
    [0.9, 0.1],
    [0.9, 0.9],
    [0.1, 0.9],
  ]);
  const t = orderTriangle([
    [0, 1],
    [0.5, 0],
    [1, 1],
  ]);
  assert.deepEqual(t, [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ]);
});

test('mesh generation follows the perspective of the source quad', () => {
  const pts = meshFromQuad(quad, 2, 2);
  assert.equal(pts.length, 9);
  const H = squareToQuad(quad);
  const c = applyH(H, 0.5, 0.5);
  close(pts[4][0], c[0]);
  close(pts[4][1], c[1]);
  const re = resampleMesh(pts, 2, 2, 4, 4);
  assert.equal(re.length, 25);
  close(re[0][0], quad[0][0]);
  close(re[24][1], quad[2][1]);
  const g = buildGeometry({ type: 'mesh', mesh: { cols: 2, rows: 2 } }, pts, [1920, 1080]);
  assert.equal(g.count, 24);
});

test('point in polygon and transforms', () => {
  assert.ok(pointInPolygon([0.5, 0.5], quad));
  assert.ok(!pointInPolygon([0.02, 0.02], quad));
  const sq = [
    [0.4, 0.4],
    [0.6, 0.4],
    [0.6, 0.6],
    [0.4, 0.6],
  ];
  const moved = transformPoints(sq, { dx: 0.1 }, [100, 100]);
  close(moved[0][0], 0.5);
  const rot = transformPoints(sq, { rotation: 90 }, [100, 100]);
  close(rot[0][0], 0.6, 1e-9);
  close(rot[0][1], 0.4, 1e-9);
});

test('polygon geometry uses planar UVs and keeps outline for feathering', () => {
  const pts = [
    [0.1, 0.1],
    [0.5, 0.05],
    [0.6, 0.4],
    [0.3, 0.6],
    [0.05, 0.35],
  ];
  const g = buildGeometry({ type: 'polygon' }, pts, [1000, 1000]);
  assert.equal(g.count, 9);
  assert.equal(g.shape, 3);
  assert.equal(g.poly.length, 5);
});
