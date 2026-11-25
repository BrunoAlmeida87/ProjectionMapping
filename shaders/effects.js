// Procedural effect bodies (GLSL ES 1.00). Each defines `vec4 effect(vec2 uv)`
// where uv is the surface texture coordinate (0..1, y down). Everything is
// generated on the GPU — no video files required.

export const EFFECT_GLSL = {
  water: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 dir = vec2(sin(uDir), cos(uDir));
  vec2 p = vec2(uv.x * uAspect, uv.y);
  vec2 q = vec2(dot(p, vec2(dir.y, -dir.x)), dot(p, dir)) * (2.0 / uScale);
  q.x += sin(q.y * 4.0 - t * 2.0) * 0.04 * uAmp;
  vec2 cp = q * PI - 250.0;
  vec2 i = cp; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < WATER_ITER; n++) {
    float tt = t * 0.6 * (1.0 - (3.5 / float(n + 1)));
    i = cp + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(cp.x / (sin(i.x + tt) / inten), cp.y / (cos(i.y + tt) / inten)));
  }
  c /= float(WATER_ITER);
  c = 1.17 - pow(c, 1.4);
  float caus = clamp(pow(abs(c), 8.0), 0.0, 1.5);
  float rv = fbm(vec2(q.x * 3.0, q.y * 0.35 - t * 0.9));
  float streak = pow(1.0 - abs(fract(q.x * 4.0 + rv * 2.0) - 0.5) * 2.0, 10.0);
  float drip = smoothstep(0.55, 0.95, fbm(vec2(q.x * 7.0, q.y * 1.1 - t * 2.4)));
  vec3 col = mix(uColorA, uColorB, clamp(caus * 0.9 + rv * 0.35, 0.0, 1.0));
  col += uColorB * streak * (0.25 + 0.5 * drip) + vec3(0.9, 0.97, 1.0) * drip * streak * 0.5 + vec3(caus) * 0.22;
  return vec4(col * INTEN, 1.0);
}`,

  fire: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 st = vec2((uv.x - 0.5) * uAspect, 1.0 - uv.y);
  vec2 q = st * vec2(2.4, 1.7) / uScale;
  float n1 = fbm(q * 2.0 + vec2(0.0, -t * 1.7));
  float n2 = fbm(q * 4.2 + vec2(n1 * 1.6, -t * 3.1));
  float base = 1.0 - st.y * (1.15 / max(uAmp, 0.15));
  float f = base + (n2 - 0.5) * 1.35 + (n1 - 0.5) * 0.7;
  f = clamp(f, 0.0, 1.0);
  f = pow(f, 1.25);
  vec3 col = mix(vec3(0.0), uColorA, smoothstep(0.04, 0.42, f));
  col = mix(col, uColorB, smoothstep(0.42, 0.78, f));
  col = mix(col, vec3(1.0, 0.97, 0.86), smoothstep(0.84, 1.0, f));
  float a = smoothstep(0.02, 0.28, f);
  vec2 eq = vec2(st.x * 14.0 / uScale, st.y * 7.0 / uScale - t * 2.6);
  vec2 id = floor(eq);
  vec2 fr = fract(eq) - 0.5;
  vec2 r = hash22(id) - 0.5;
  float e = smoothstep(0.09, 0.0, length(fr - r * 0.6)) * step(0.86, hash12(id + 3.1)) * clamp(1.1 - st.y, 0.0, 1.0);
  col += uColorB * e * 2.2;
  a = max(a, e);
  return vec4(col * INTEN, a);
}`,

  rain: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = vec2(uv.x * uAspect, uv.y);
  float sl = tan(clamp(uDir, -1.2, 1.2));
  vec3 col = vec3(0.0);
  float a = 0.0;
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float cols = (24.0 + fl * 18.0) * uDensity;
    float px = (p.x - p.y * sl) * cols;
    float id = floor(px);
    float h = hash11(id * 1.37 + fl * 11.0);
    float sp = (1.2 + h * 0.9) * (0.8 + fl * 0.3);
    float y = fract(p.y * 0.6 - t * sp * 0.6 + h * 7.0);
    float len = 0.22 * (0.6 + h) / (1.0 + fl * 0.3);
    float streak = smoothstep(1.0 - len, 1.0, y);
    streak *= streak;
    float x = abs(fract(px) - 0.5);
    float w = smoothstep(0.05 * uScale + 0.05, 0.0, x);
    float present = step(0.3, hash11(id * 7.1 + fl * 3.0));
    float d = streak * w * present;
    float lay = 0.55 + 0.3 * fl;
    col += mix(uColorA, vec3(1.0), 0.4) * d * lay * 1.5;
    a = max(a, d * lay);
  }
  float mist = fbm(vec2(p.x * 2.0, p.y - t * 0.25)) * 0.25;
  col += uColorB * mist;
  float sxp = p.x * 16.0 * uDensity;
  float sid = floor(sxp);
  float ph = fract(t * (1.4 + hash11(sid)) + hash11(sid * 3.3));
  float splash = smoothstep(0.08 + 0.3 * ph, 0.0, abs(fract(sxp) - 0.5)) * smoothstep(0.012, 0.0, abs(uv.y - 0.985 + ph * 0.03)) * (1.0 - ph);
  col += mix(uColorA, vec3(1.0), 0.5) * splash;
  a = max(a, splash);
  return vec4(col * INTEN, clamp(a + mist, 0.0, 1.0));
}`,

  particles: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec3 col = vec3(0.0);
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float sc = (5.0 + fl * 3.5) * uDensity;
    vec2 q = vec2(uv.x * uAspect, uv.y) * sc + vec2(fl * 7.3, t * (0.35 + 0.18 * fl));
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    vec2 rnd = hash22(id + fl * 31.0);
    vec2 pos = (rnd - 0.5) * 0.6 + 0.14 * vec2(sin(t * (1.0 + rnd.x) + rnd.y * 6.28), cos(t * (1.3 + rnd.y) + rnd.x * 6.28));
    float d = length(f - pos);
    float size = (0.03 + 0.06 * rnd.y) * uScale;
    float glow = pow(size / (d + 0.002), 1.5) * smoothstep(0.5, 0.18, d);
    float tw = 0.55 + 0.45 * sin(t * 3.0 * (0.5 + rnd.x) + rnd.y * 20.0);
    col += mix(uColorA, uColorB, rnd.x) * glow * tw * (0.75 - fl * 0.15);
  }
  col = min(col, vec3(2.0));
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  return vec4(col * INTEN, a);
}`,

  lines: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float lw = 0.006 * uScale;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 q = rot(p, t * (0.18 + 0.09 * fi) * (mod(fi, 2.0) * 2.0 - 1.0));
    float d = max(abs(q.x), abs(q.y));
    float k = uFreq * 3.0;
    float rings = abs(fract(d * k - t * 0.45 + fi * 0.33) - 0.5) / k;
    col += mix(uColorA, uColorB, fi * 0.5) * smoothstep(lw, 0.0, rings) * 0.75;
  }
  float diag = abs(fract((p.x + p.y) * uFreq * 1.4 + t * 0.55) - 0.5) / (uFreq * 1.4);
  col += uColorB * smoothstep(0.02 * uScale, 0.0, diag) * 0.55;
  vec2 g = abs(fract(p * uFreq * 6.0) - 0.5) / (uFreq * 6.0);
  col += uColorA * smoothstep(0.004 * uScale, 0.0, min(g.x, g.y)) * 0.22;
  float scan = exp(-pow((fract(uv.y - t * 0.15) - 0.5) * 18.0, 2.0));
  col += uColorB * scan * 0.25;
  col *= 1.35;
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  return vec4(col * INTEN, a);
}`,

  portal: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  p /= 0.5 * min(uAspect, 1.0) * uScale;
  float r = length(p);
  float a = atan(p.y, p.x);
  float arms = max(1.0, floor(uFreq * 3.0 + 0.5));
  float spiral = 0.5 + 0.5 * sin(a * arms + log(r + 0.001) * 5.0 * uAmp - t * 3.0);
  vec2 q = rot(p, t * 0.7 + 2.4 * uAmp / (r + 0.25));
  float n = fbm(q * 2.6 + vec2(t * 0.15));
  float tunnel = smoothstep(1.15, 0.1, r);
  vec3 col = mix(uColorA, uColorB, clamp(spiral * n * 1.5, 0.0, 1.0));
  col *= (spiral * 0.65 + n * 0.9) * tunnel;
  float ring = exp(-pow((r - 0.82) * 7.0, 2.0));
  col += uColorB * ring * (0.75 + 0.35 * sin(a * 10.0 + t * 6.0));
  col += uColorA * exp(-pow((r - 0.82) * 2.5, 2.0)) * 0.35;
  col += vec3(1.0) * exp(-r * 3.5) * (0.55 + 0.25 * sin(t * 4.0));
  vec2 sq = rot(p, -t * 1.5) * 9.0;
  vec2 sid = floor(sq);
  float spark = smoothstep(0.12, 0.0, length(fract(sq) - 0.5 - (hash22(sid) - 0.5) * 0.6)) * step(0.82, hash12(sid)) * smoothstep(1.3, 0.6, r);
  col += uColorB * spark * 1.5;
  col *= mix(0.35, 1.0, smoothstep(1.6, 0.85, r));
  return vec4(col * INTEN, 1.0);
}`,

  galaxy: `
float stars(vec2 p, float dens) {
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  vec2 r = hash22(id);
  float s = step(1.0 - clamp(dens, 0.0, 1.0), hash12(id + 7.7));
  float d = length(f - (r - 0.5) * 0.8);
  float tw = 0.6 + 0.4 * sin(uTime * (1.0 + r.x * 3.0) + r.y * 40.0);
  return s * smoothstep(0.07 * (0.5 + r.y), 0.0, d) * tw;
}
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0) * 2.2 / uScale;
  float st = stars(p * 26.0, 0.22 * uDensity) + stars(p * 55.0 + 13.0, 0.3 * uDensity) * 0.7 + stars(p * 105.0 + 29.0, 0.4 * uDensity) * 0.5;
  vec2 g = rot(p, t * 0.12);
  g.y *= 1.7;
  g = rot(g, 0.35);
  float r = length(g);
  float a = atan(g.y, g.x);
  float arm = pow(0.5 + 0.5 * cos(2.0 * (a - log(r + 0.05) * 2.3)), 2.5);
  float dust = fbm(rot(g, 1.2 / (r + 0.3)) * 4.0);
  float disk = exp(-r * 2.1);
  float body = arm * disk * (0.55 + 0.9 * dust);
  float core = exp(-r * 8.0) * 1.7;
  vec3 col = uColorA * body * 1.7 + uColorB * core + mix(uColorA, uColorB, 0.5) * disk * 0.22;
  float neb = fbm(p * 1.2 + vec2(t * 0.03, 0.0));
  col += mix(uColorA * 0.3, vec3(0.55, 0.1, 0.45) * 0.3, neb) * smoothstep(0.38, 0.9, neb);
  col += vec3(st) * (1.0 - disk * 0.5);
  col += vec3(1.0, 0.95, 0.9) * stars(g * 48.0, 0.55) * disk * 2.2;
  return vec4(col * INTEN, 1.0);
}`,

  neon: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 dpx = min(uv, 1.0 - uv) * uSizePx;
  float d = min(dpx.x, dpx.y);
  float th = 3.0 * uScale;
  float inset = 12.0 * uScale;
  float line = smoothstep(th, th * 0.25, abs(d - inset));
  float glow = exp(-abs(d - inset) / (16.0 * uScale));
  vec2 c = (uv - 0.5) * uSizePx;
  float per = atan(c.y, c.x) / TAU + 0.5;
  float run = pow(0.5 + 0.5 * sin(per * TAU * floor(uFreq * 4.0 + 1.0) - t * 4.0), 4.0);
  float flick = 0.93 + 0.07 * sin(t * 37.0) * sin(t * 13.0);
  vec3 col = uColorA * line * (0.6 + 0.6 * run) * 1.4 + uColorA * glow * 0.65 * flick + uColorB * run * glow * 0.9;
  float line2 = smoothstep(th * 0.7, 0.0, abs(d - inset * 2.7));
  col += uColorB * line2 * (0.25 + 0.85 * run);
  float fill = 0.05 + 0.04 * sin(t * 1.5);
  col += uColorB * fill;
  float a = clamp(max(max(line, line2), glow * 0.95) + fill, 0.0, 1.0);
  return vec4(col * INTEN, a);
}`,

  matrix: `
float glyph(vec2 f, float seed) {
  vec2 g = floor(f * vec2(7.0, 9.0));
  if (g.x < 1.0 || g.x > 5.0 || g.y < 1.0 || g.y > 7.0) return 0.0;
  return step(0.48, hash12(g + seed * 17.13));
}
vec4 effect(vec2 uv) {
  float t = TT;
  float cell = 18.0 * uScale;
  vec2 grid = max(vec2(2.0), floor(uSizePx / cell));
  vec2 g = uv * grid;
  vec2 id = floor(g);
  vec2 f = fract(g);
  float cs = hash11(id.x * 3.17 + 1.3);
  float speed = (0.5 + cs) * 7.0;
  float span = grid.y + 30.0;
  float head = mod(t * speed + cs * 300.0, span);
  float dist = head - id.y;
  float trail = 6.0 + cs * 18.0;
  float b = (dist >= 0.0 && dist < trail) ? pow(1.0 - dist / trail, 1.6) : 0.0;
  float head2 = mod(t * speed * 0.7 + cs * 911.0, span);
  float dist2 = head2 - id.y;
  b = max(b, (dist2 >= 0.0 && dist2 < trail * 0.6) ? pow(1.0 - dist2 / (trail * 0.6), 2.0) * 0.6 : 0.0);
  float active = step(1.0 - clamp(uDensity * 0.8, 0.05, 1.0), hash11(id.x * 9.1 + 2.0));
  float seed = floor(hash12(id) * 50.0 + t * (1.5 + 5.0 * hash12(id + 3.0)));
  float gl = glyph(f, seed);
  vec3 col = uColorA * gl * b * active;
  float isHead = (dist >= 0.0 && dist < 1.0) ? 1.0 : 0.0;
  col = mix(col, vec3(0.85, 1.0, 0.92) * gl, isHead * active);
  col += uColorA * b * active * 0.06 + uColorB * 0.03;
  return vec4(col * INTEN * 1.3, 1.0);
}`,

  lava: `
vec4 effect(vec2 uv) {
  float t = TT * 0.2;
  vec2 p = vec2(uv.x * uAspect, uv.y) * 2.2 / uScale;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  float f = fbm(p * 1.6 + 2.8 * q + vec2(t * 0.6, -t * 0.4));
  float veins = pow(clamp(1.0 - abs(f - 0.5) * 7.0, 0.0, 1.0), 2.0);
  float pools = smoothstep(0.56, 0.84, fbm(p * 0.8 + q * 1.8 - vec2(0.0, t * 0.7)));
  float heat = clamp(veins * (0.55 + pools) + pools * 0.75, 0.0, 1.0);
  vec3 crust = uColorB * (0.6 + 0.8 * fbm(p * 6.0 + q));
  vec3 col = mix(crust, uColorA, smoothstep(0.05, 0.6, heat));
  col = mix(col, vec3(1.0, 0.9, 0.45), smoothstep(0.65, 1.0, heat));
  col += uColorA * 0.12 * (0.5 + 0.5 * sin(t * 5.0 + f * 9.0));
  return vec4(col * INTEN, 1.0);
}`,

  depth3d: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = (uv - 0.5) * 2.0;
  float m = max(abs(p.x), abs(p.y));
  float z = 1.0 / max(m, 0.002);
  float wx = abs(p.x) > abs(p.y) ? p.y / abs(p.x) : p.x / abs(p.y);
  float k = 0.5 * uFreq / uScale;
  float zz = z * k - t * 0.6;
  float dz = abs(fract(zz) - 0.5) / k;
  float ring = smoothstep(0.018, 0.0, dz / (z * z));
  float lx = abs(fract(wx * 3.0 + 0.5) - 0.5) / 3.0 * m;
  float lng = smoothstep(0.006, 0.0, lx);
  float diag = smoothstep(0.008, 0.0, abs(abs(p.x) - abs(p.y)) * 0.5);
  float fog = exp(-z * 0.22 / max(uAmp, 0.1));
  float pulse = 0.5 + 0.5 * sin(zz * 0.5 * TAU / 4.0);
  vec3 col = (uColorA * ring * (0.6 + 0.6 * pulse) + uColorB * (lng * 0.7 + diag * 0.9)) * fog;
  col += mix(uColorA, uColorB, 0.5) * fog * 0.07;
  col += uColorB * exp(-m * 12.0) * 0.9;
  vec2 cell = vec2(floor(zz), floor(wx * 3.0 + 0.5));
  float lit = step(0.8, hash12(cell + floor(t * 0.5)));
  col += uColorA * lit * fog * 0.18;
  return vec4(col * INTEN * 1.3, 1.0);
}`,

  waves: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = rot((uv - 0.5) * vec2(uAspect, 1.0), uDir);
  vec3 col = mix(uColorA, uColorB, uv.y) * 0.12;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float y = sin(p.x * uFreq * (2.0 + fi * 0.7) + t * (1.0 + fi * 0.25) + fi * 1.7) * 0.16 * uAmp
            + sin(p.x * uFreq * 5.3 - t * 1.3 + fi) * 0.035 * uAmp
            + (fi - 2.5) * 0.12 * uScale;
    float d = abs(p.y - y);
    float w = 0.006 + 0.008 * uScale;
    vec3 c = hsv2rgb(vec3(fract(fi / 6.0 + t * 0.04), 0.72, 1.0));
    c = mix(c, mix(uColorA, uColorB, fi / 5.0), 0.45);
    col += c * (smoothstep(w, 0.0, d) * 1.1 + 0.006 / (d + 0.012));
    col += c * 0.035 * smoothstep(0.25, 0.0, y - p.y) * step(p.y, y);
  }
  return vec4(col * INTEN, 1.0);
}`,

  plasma: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0) * 6.0 * uFreq / uScale;
  float v = sin(p.x + t) + sin((p.y + t) * 0.5) + sin((p.x + p.y + t) * 0.5);
  v += sin(length(p + vec2(sin(t * 0.33), cos(t * 0.5)) * 3.0) + t);
  vec3 rainbow = 0.5 + 0.5 * cos(v * PI * 0.5 + vec3(0.0, 2.1, 4.2) + t * 0.2);
  vec3 col = mix(rainbow, mix(uColorA, uColorB, 0.5 + 0.5 * sin(v * PI)), 0.45);
  return vec4(col * INTEN, 1.0);
}`,

  aurora: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 st = vec2(uv.x * uAspect, 1.0 - uv.y);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float n = fbm(vec2(st.x * 1.2 / uScale + t * 0.08 + fi * 3.1, t * 0.12 + fi));
    float y0 = 0.42 + (n - 0.5) * 0.6 * uAmp + fi * 0.1;
    float band = exp(-pow((st.y - y0) * 5.0, 2.0)) + exp(-max(st.y - y0, 0.0) * 4.0) * step(y0, st.y) * 0.5 * smoothstep(1.0, y0, st.y);
    float rays = 0.4 + fbm(vec2(st.x * 14.0 / uScale + n * 5.0, t * 0.4 + fi * 2.0));
    col += mix(uColorA, uColorB, clamp((st.y - y0) * 2.5 + 0.5, 0.0, 1.0)) * band * rays * (0.65 - fi * 0.12);
  }
  vec2 sp = st * 60.0;
  float star = smoothstep(0.08, 0.0, length(fract(sp) - 0.5 - (hash22(floor(sp)) - 0.5) * 0.7)) * step(0.93, hash12(floor(sp)));
  col += vec3(star) * 0.6 * smoothstep(0.2, 0.8, st.y);
  return vec4(col * INTEN * 1.2, 1.0);
}`,

  starfield: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  vec3 col = vec3(0.0);
  for (int L = 0; L < 5; L++) {
    float fl = float(L);
    float depth = fract(fl / 5.0 + t * 0.12);
    float sc = mix(22.0, 0.6, depth) / uScale;
    float fade = depth * smoothstep(1.0, 0.85, depth);
    vec2 q = p * sc * uDensity + fl * 17.31;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    vec2 r = hash22(id);
    float d = length(f - (r - 0.5) * 0.7);
    float s = 0.025 / (d + 0.004) * step(0.45, hash12(id + 2.0));
    col += mix(uColorA, uColorB, r.x) * s * fade * smoothstep(0.5, 0.1, d);
  }
  col += uColorB * exp(-length(p) * 6.0) * 0.25;
  return vec4(min(col, vec3(2.0)) * INTEN, 1.0);
}`,

  kaleido: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x) + t * 0.15;
  float n = floor(uFreq * 3.0 + 3.0);
  float seg = TAU / n;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  p = vec2(cos(a), sin(a)) * r;
  float f = fbm(p * 5.0 / uScale + vec2(t * 0.35, -t * 0.2));
  float f2 = fbm(p * 11.0 / uScale - vec2(t * 0.2));
  vec3 col = hsv2rgb(vec3(fract(f * 1.3 + t * 0.05), 0.75, smoothstep(0.25, 0.8, f) + f2 * 0.3));
  col = mix(col, mix(uColorA, uColorB, f2), 0.35);
  return vec4(col * INTEN, 1.0);
}`,

  gradient: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 d = vec2(cos(uDir), sin(uDir));
  float g = 0.5 + 0.5 * sin((dot((uv - 0.5) * vec2(uAspect, 1.0), d) * uFreq * 3.0 - t * 0.5) * PI);
  vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 1.0, g));
  return vec4(col * INTEN, 1.0);
}`,

  pulse: `
vec4 effect(vec2 uv) {
  float t = TT;
  float beat = pow(0.5 + 0.5 * sin(t * TAU * uFreq * 0.5), 1.0 + uAmp * 6.0);
  beat = max(beat, uReact * uAudio.y * 1.5);
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float vign = smoothstep(1.2, 0.1, length(p));
  vec3 col = mix(uColorB * 0.15, uColorA, beat) * mix(0.6, 1.0, vign);
  return vec4(col * uIntensity, 1.0);
}`,

  hexgrid: `
float hexDist(vec2 p) { p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0) * 8.0 * uFreq / uScale;
  vec2 rr = vec2(1.0, 1.7320508);
  vec2 h = rr * 0.5;
  vec2 a = mod(p, rr) - h;
  vec2 b = mod(p - h, rr) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = p - gv;
  float edge = 0.5 - hexDist(gv);
  float wave = 0.5 + 0.5 * sin(length(id) * 0.6 - t * 2.5);
  float rnd = hash12(floor(id * 10.0 + 0.5));
  float lit = smoothstep(0.75, 1.0, wave) + step(0.94, fract(rnd + t * 0.1)) * 0.6;
  vec3 col = uColorA * smoothstep(0.05, 0.0, edge) * (0.35 + wave * 0.9);
  col += uColorB * lit * smoothstep(0.0, 0.08, edge) * 0.55;
  return vec4(col * INTEN * 1.3, 1.0);
}`,

  // ----- calibration / test content -----
  grid: `
vec4 effect(vec2 uv) {
  float n = max(2.0, floor(uFreq * 10.0 + 0.5));
  vec2 g = abs(fract(uv * n + 0.5) - 0.5) / n * uSizePx;
  float line = smoothstep(1.6, 0.4, min(g.x, g.y));
  vec2 g2 = abs(uv - 0.5) * uSizePx;
  float mid = smoothstep(2.6, 0.8, min(g2.x, g2.y));
  vec2 e = min(uv, 1.0 - uv) * uSizePx;
  float border = smoothstep(5.0, 2.5, min(e.x, e.y));
  float dg = min(abs(uv.x - uv.y), abs(uv.x - (1.0 - uv.y))) * min(uSizePx.x, uSizePx.y) * 0.7;
  float diag = smoothstep(1.6, 0.4, dg) * 0.55;
  vec2 c = (uv - 0.5) * 2.0;
  float rr = length(c);
  float circ = smoothstep(2.4, 0.6, abs(rr - 0.8) * 0.5 * min(uSizePx.x, uSizePx.y));
  vec3 col = vec3(0.04) + uColorA * line * 0.75 + vec3(1.0) * mid + uColorA * diag + uColorB * circ + vec3(1.0) * border;
  float cs = 0.1;
  if (uv.x < cs && uv.y < cs) col = mix(col, vec3(1.0, 0.22, 0.22), 0.85);
  if (uv.x > 1.0 - cs && uv.y < cs) col = mix(col, vec3(0.2, 1.0, 0.35), 0.85);
  if (uv.x > 1.0 - cs && uv.y > 1.0 - cs) col = mix(col, vec3(0.25, 0.45, 1.0), 0.85);
  if (uv.x < cs && uv.y > 1.0 - cs) col = mix(col, vec3(1.0, 0.88, 0.2), 0.85);
  vec2 ar = (uv - vec2(0.5, 0.2)) * vec2(uSizePx.x / max(uSizePx.y, 1.0), 1.0) / 0.07;
  if (ar.y > -1.0 && ar.y < 0.7 && abs(ar.x) < (ar.y + 1.0) * 0.55) col = mix(col, vec3(1.0), 0.9);
  return vec4(col * max(uIntensity, 0.2), 1.0);
}`,

  checker: `
vec4 effect(vec2 uv) {
  float n = max(1.0, floor(uFreq * 8.0 + 0.5));
  vec2 cells = vec2(n * max(uAspect, 1.0), n / min(uAspect, 1.0));
  vec2 c = floor(uv * cells);
  float k = mod(c.x + c.y, 2.0);
  return vec4(mix(uColorB, uColorA, k) * uIntensity, 1.0);
}`,

  bars: `
vec4 effect(vec2 uv) {
  vec3 col;
  float b = floor(uv.x * 7.0);
  if (uv.y > 0.75) col = vec3(floor(uv.x * 11.0) / 10.0);
  else if (b < 0.5) col = vec3(0.78);
  else if (b < 1.5) col = vec3(0.78, 0.78, 0.0);
  else if (b < 2.5) col = vec3(0.0, 0.78, 0.78);
  else if (b < 3.5) col = vec3(0.0, 0.78, 0.0);
  else if (b < 4.5) col = vec3(0.78, 0.0, 0.78);
  else if (b < 5.5) col = vec3(0.78, 0.0, 0.0);
  else col = vec3(0.0, 0.0, 0.78);
  return vec4(col * uIntensity, 1.0);
}`,

  solid: `
vec4 effect(vec2 uv) {
  return vec4(uColorA * uIntensity, 1.0);
}`,

  // ------------------------------------------------------------- Natal
  snow: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = vec2(uv.x * uAspect, uv.y);
  float wind = clamp(uDir, -1.2, 1.2);
  float acc = 0.0;
  for (int L = 0; L < 4; L++) {
    float fl = float(L);
    float cells = (3.2 + fl * 3.4) / uScale;
    float sp = 0.26 - fl * 0.05;
    vec2 q = p;
    q.y -= t * sp;
    q.x -= t * sp * wind;
    q *= cells;
    q.x += sin(q.y * 0.9 + fl * 1.7 + t * 0.7) * 0.3;
    vec2 id = floor(q);
    vec2 fr = fract(q) - 0.5;
    vec2 h = hash22(id + fl * 37.0);
    float present = step(hash12(id * 1.7 + fl * 5.0), 0.12 + 0.42 * uDensity);
    vec2 o = (h - 0.5) * 0.5;
    float r = 0.07 + 0.08 * hash12(id + 3.3);
    float d = length(fr - o);
    float flake = smoothstep(r, r * 0.2, d) * present;
    flake += smoothstep(r * 2.6, 0.0, d) * 0.18 * present;
    acc = max(acc, clamp(flake, 0.0, 1.0) * (1.0 - fl * 0.16));
  }
  float bgA = clamp(uAmp, 0.0, 1.0);
  vec3 bg = mix(uColorB * 0.45, uColorB * 1.3, uv.y);
  vec3 C = uColorA * acc + bg * bgA * (1.0 - acc);
  float A = acc + bgA * (1.0 - acc);
  return vec4(C / max(A, 0.001) * INTEN, A);
}`,

  xmaslights: `
vec3 xmasPal(float h) {
  if (h < 0.2) return vec3(1.0, 0.16, 0.18);
  if (h < 0.4) return vec3(0.18, 1.0, 0.38);
  if (h < 0.6) return vec3(1.0, 0.8, 0.22);
  if (h < 0.8) return vec3(0.28, 0.55, 1.0);
  return vec3(1.0, 0.38, 0.85);
}
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = vec2(uv.x * uAspect, uv.y);
  float rows = clamp(floor(2.0 * uFreq + 0.5), 1.0, 6.0);
  float rowH = 1.0 / rows;
  float spacing = rowH * 0.42 / max(uDensity, 0.15);
  float P = spacing * 6.0;
  float sag = rowH * 0.3 * uAmp;
  float br = rowH * 0.07 * uScale;
  float lw = max(rowH * 0.012, 0.0015);
  vec3 C = vec3(0.0);
  float A = 0.0;
  float r0 = floor(uv.y / rowH);
  for (int dr = -1; dr <= 1; dr++) {
    float ri = r0 + float(dr);
    if (ri < 0.0 || ri > rows - 1.0) continue;
    float top = ri * rowH + rowH * 0.1;
    float sw = fract(p.x / P);
    float yw = top + sag * 4.0 * sw * (1.0 - sw);
    float slope = sag * 4.0 * (1.0 - 2.0 * sw) / P;
    float dWire = abs(p.y - yw) / sqrt(1.0 + slope * slope);
    float wa = smoothstep(lw, lw * 0.3, dWire) * 0.9;
    C = uColorA * wa + C * (1.0 - wa);
    A = wa + A * (1.0 - wa);
    float i0 = floor(p.x / spacing);
    for (int k = -1; k <= 1; k++) {
      float i = i0 + float(k);
      float xc = (i + 0.5) * spacing;
      float s2 = fract(xc / P);
      float yc = top + sag * 4.0 * s2 * (1.0 - s2);
      vec2 v = p - vec2(xc, yc + br * 1.9);
      float h = hash12(vec2(i, ri * 7.0 + 1.0));
      vec3 bc = xmasPal(h);
      float tw = 0.5 + 0.5 * sin(t * (1.0 + 1.6 * hash11(i * 3.7 + ri)) + h * 31.0 - i * 0.45);
      float bright = 0.18 + 0.82 * smoothstep(0.15, 0.95, tw);
      float g = exp(-dot(v, v) / (br * br * 7.0)) * 0.75 * bright;
      C = bc * g + C * (1.0 - g);
      A = g + A * (1.0 - g);
      vec2 vb = vec2(v.x, v.y / 1.5);
      float bulb = smoothstep(br, br * 0.8, length(vb));
      vec3 glass = mix(bc * (0.35 + 0.65 * bright), vec3(1.0), 0.45 * bright * smoothstep(br, 0.0, length(vb - vec2(-br * 0.3, -br * 0.5))));
      C = glass * bulb + C * (1.0 - bulb);
      A = bulb + A * (1.0 - bulb);
      vec2 vs = p - vec2(xc, yc + br * 0.45);
      float sock = step(abs(vs.x), br * 0.42) * step(abs(vs.y), br * 0.5);
      C = uColorA * 1.4 * sock + C * (1.0 - sock);
      A = sock + A * (1.0 - sock);
    }
  }
  return vec4(C / max(A, 0.001) * INTEN, A);
}`,

  candycane: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = vec2(uv.x * uAspect, uv.y);
  vec2 d = vec2(cos(uDir), sin(uDir));
  float s = dot(p, d) * 5.0 / uScale + t * 0.5;
  float f = fract(s);
  float e = 7.5 / (uScale * max(uSizePx.y, 1.0)) + 0.004;
  float wide = smoothstep(0.0, e, f) * (1.0 - smoothstep(0.42, 0.42 + e, f));
  float tw = 0.07 * clamp(uAmp, 0.0, 2.0);
  float thin = smoothstep(0.6 - tw, 0.6 - tw + e, f) * (1.0 - smoothstep(0.6 + tw, 0.6 + tw + e, f));
  vec3 col = mix(uColorB, uColorA, max(wide, thin * step(0.01, uAmp)));
  float shade = 0.78 + 0.22 * sin(uv.x * PI);
  float sheen = pow(1.0 - abs(fract(uv.x * 0.5 + uv.y * 0.2 - t * 0.12) - 0.5) * 2.0, 14.0);
  col = col * shade + vec3(sheen * 0.35);
  return vec4(col * INTEN, 1.0);
}`,

  giftwrap: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = vec2(uv.x * uAspect, uv.y);
  float m = min(uAspect, 1.0);
  vec2 g = p * 7.0 / uScale;
  vec2 gid = floor(g);
  vec2 gf = fract(g) - 0.5;
  float odd = mod(gid.x + gid.y, 2.0);
  float ang = atan(gf.y, gf.x);
  float k = 0.5 + 0.5 * cos(5.0 * (ang + PI * 0.5));
  float starR = mix(0.09, 0.22, pow(k, 3.0));
  float motif = odd > 0.5 ? smoothstep(starR + 0.02, starR - 0.02, length(gf)) : smoothstep(0.07, 0.05, length(gf));
  vec3 paper = uColorA * (0.92 + 0.08 * sin(p.x * 40.0 + p.y * 40.0));
  vec3 col = mix(paper, mix(uColorB, vec3(1.0), 0.25), motif * (odd > 0.5 ? 0.9 : 0.6));
  vec2 c = vec2(uAspect * 0.5, 0.5);
  vec2 v = p - c;
  float w = 0.085 * m * uAmp;
  float bv = smoothstep(w, w - 0.004, abs(v.x));
  float bh = smoothstep(w, w - 0.004, abs(v.y));
  float sat = 0.75 + 0.25 * cos((bv > bh ? v.x : v.y) / max(w, 0.001) * 2.6);
  float shim = pow(0.5 + 0.5 * sin((uv.x + uv.y) * 9.0 - t * 2.2), 16.0);
  vec3 rib = uColorB * sat + vec3(shim * 0.6);
  col = mix(col, rib * 0.82, max(bv, bh) * 0.25);
  col = mix(col, rib, max(bv, bh));
  // bow at the crossing (tails, two loops and the knot)
  float bs = m * uAmp * step(0.05, uAmp);
  if (bs > 0.0) {
    for (int i = 0; i < 2; i++) {
      float sx = i == 0 ? -1.0 : 1.0;
      vec2 ta = vec2(0.0, 0.01) * bs;
      vec2 tb = vec2(sx * 0.11, 0.2) * bs;
      vec2 pa = v - ta;
      vec2 ba = tb - ta;
      float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      float dT = length(pa - ba * hh);
      float tail = smoothstep(0.03 * bs, 0.026 * bs, dT);
      col = mix(col, uColorB * (0.95 - hh * 0.35) + vec3(shim * 0.3), tail);
    }
    for (int i = 0; i < 2; i++) {
      float sx = i == 0 ? -1.0 : 1.0;
      vec2 q = rot(v - vec2(sx * 0.115, -0.045) * bs, sx * 0.42);
      vec2 e1 = q / (vec2(0.14, 0.075) * bs);
      float loopA = smoothstep(1.0, 0.93, length(e1));
      float outer = clamp(e1.x * sx * 0.5 + 0.5, 0.0, 1.0);
      vec3 lc = uColorB * (0.62 + 0.5 * outer - 0.18 * e1.y) + vec3(shim * 0.35);
      vec2 e2 = (q - vec2(sx * 0.03, -0.004) * bs) / (vec2(0.075, 0.03) * bs);
      float hole = smoothstep(1.0, 0.75, length(e2));
      lc = mix(lc, uColorB * 0.32, hole);
      col = mix(col, lc, loopA);
    }
    float kd = length(v * vec2(1.0, 0.85));
    float knot = smoothstep(0.048 * bs, 0.043 * bs, kd);
    col = mix(col, uColorB * (1.05 - 6.0 * v.y / bs) * 0.85 + vec3(0.25) * smoothstep(0.03 * bs, 0.0, length(v + vec2(0.012, 0.014) * bs)), knot);
  }
  // sparkles
  vec2 sg = p * 9.0 * uDensity;
  vec2 sid = floor(sg);
  vec2 sf = fract(sg) - 0.5 - (hash22(sid) - 0.5) * 0.6;
  float life = pow(max(0.0, sin(t * (1.0 + hash12(sid)) * 1.5 + hash12(sid + 9.0) * TAU)), 12.0);
  float cr = exp(-abs(sf.x) * 60.0) * exp(-abs(sf.y) * 9.0) + exp(-abs(sf.y) * 60.0) * exp(-abs(sf.x) * 9.0);
  col += vec3(1.0, 0.95, 0.8) * cr * life * step(0.7, hash12(sid + 4.0)) * step(0.01, uDensity);
  return vec4(col * INTEN, 1.0);
}`,

  xmasnight: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = vec2(uv.x * uAspect, uv.y);
  vec3 col = mix(uColorB * 0.3, uColorB * 1.15, smoothstep(0.0, 1.0, uv.y));
  for (int L = 0; L < 2; L++) {
    float fl = float(L);
    vec2 g = p * (16.0 + fl * 18.0) * uDensity;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash12(id + fl * 21.0);
    vec2 o = (hash22(id + fl * 3.0) - 0.5) * 0.7;
    float d = length(f - o);
    float tw = 0.55 + 0.45 * sin(t * (1.5 + h * 4.0) + h * 40.0);
    float s = smoothstep(0.09 - fl * 0.03, 0.0, d) * step(0.72, h) * tw;
    col += vec3(0.85, 0.9, 1.0) * s * (1.2 - fl * 0.4);
  }
  vec2 sp = vec2(uAspect * 0.72, 0.2);
  vec2 v = p - sp;
  float dd = length(v);
  float pulse = 0.85 + 0.15 * sin(t * 2.0);
  float rays = exp(-abs(v.x) * 260.0) * exp(-abs(v.y) * 7.0) + exp(-abs(v.y) * 260.0) * exp(-abs(v.x) * 12.0);
  vec2 v45 = rot(v, 0.785);
  rays += 0.5 * (exp(-abs(v45.x) * 300.0) * exp(-abs(v45.y) * 22.0) + exp(-abs(v45.y) * 300.0) * exp(-abs(v45.x) * 22.0));
  float tail = exp(-abs(v.x) * 140.0) * smoothstep(0.0, 0.03, v.y) * exp(-v.y * 2.2) * 0.8;
  col += uColorA * (exp(-dd * dd * 2500.0) * 2.5 + 0.012 / (dd + 0.015) + rays * 0.9 + tail) * pulse;
  float period = 5.0;
  float k = floor(t / period);
  float ph = fract(t / period);
  vec2 st0 = vec2(hash11(k * 1.3) * uAspect * 0.8 + uAspect * 0.1, hash11(k * 2.1) * 0.35);
  vec2 dir = normalize(vec2(-0.85, 0.45));
  vec2 head = st0 + dir * ph * 0.9;
  vec2 rel = p - head;
  float along = dot(rel, -dir);
  float perp = abs(dot(rel, vec2(-dir.y, dir.x)));
  float trail = smoothstep(0.0, 0.004, along + 0.004) * exp(-along * 9.0) * exp(-perp * 900.0);
  float fade = smoothstep(0.0, 0.1, ph) * smoothstep(0.55, 0.3, ph);
  col += vec3(1.0, 0.97, 0.9) * trail * fade * 1.6;
  if (uAmp > 0.01) {
    float hy = 1.0 - 0.13 * uAmp + 0.035 * sin(uv.x * 7.0 + 1.0) + 0.02 * sin(uv.x * 17.0);
    float hill = smoothstep(hy - 0.004, hy + 0.004, uv.y);
    vec3 snowc = mix(vec3(0.72, 0.8, 0.95), vec3(0.9, 0.94, 1.0), smoothstep(hy, 1.0, uv.y)) * 0.75;
    col = mix(col, snowc, hill);
  }
  return vec4(col * INTEN, 1.0);
}`,

  snowflakes: `
float sdSegX(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a; vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float flakeSDF(vec2 v, float R) {
  float r = length(v);
  float a = atan(v.y, v.x);
  a = mod(a + PI / 6.0, PI / 3.0) - PI / 6.0;
  a = abs(a);
  vec2 q = r * vec2(cos(a), sin(a));
  float d = sdSegX(q, vec2(0.0), vec2(R, 0.0));
  d = min(d, sdSegX(q, vec2(R * 0.32, 0.0), vec2(R * 0.47, R * 0.26)));
  d = min(d, sdSegX(q, vec2(R * 0.58, 0.0), vec2(R * 0.7, R * 0.2)));
  d = min(d, sdSegX(q, vec2(R * 0.8, 0.0), vec2(R * 0.87, R * 0.12)));
  d = min(d, abs(r - R * 0.15));
  return d;
}
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = vec2(uv.x * uAspect, uv.y);
  float acc = 0.0;
  float glow = 0.0;
  for (int L = 0; L < 2; L++) {
    float fl = float(L);
    float cells = (2.2 + fl * 2.0) / uScale;
    vec2 q = p;
    q.y -= t * (0.04 + fl * 0.03);
    q.x += sin(t * 0.3 + fl) * 0.03;
    q *= cells;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash12(id + fl * 13.0);
    float present = step(hash12(id * 2.3 + fl), 0.25 + 0.5 * uDensity);
    float R = 0.3 + 0.1 * h;
    vec2 v = rot(f - (hash22(id) - 0.5) * 0.12, t * (h - 0.5) * 0.8 + h * 6.0);
    float d = flakeSDF(v, R);
    float w = 0.022 + 0.01 * fl;
    acc = max(acc, smoothstep(w, w * 0.35, d) * present * (1.0 - fl * 0.25));
    glow = max(glow, exp(-d * 28.0) * 0.45 * present * smoothstep(0.5, 0.35, length(f)));
  }
  float a = max(acc, glow);
  vec3 fc = mix(uColorA, vec3(1.0), acc * 0.5);
  float bgA = clamp(uAmp, 0.0, 1.0);
  vec3 bg = mix(uColorB * 0.5, uColorB * 1.2, uv.y);
  vec3 C = fc * a + bg * bgA * (1.0 - a);
  float A = a + bgA * (1.0 - a);
  return vec4(C / max(A, 0.001) * INTEN, A);
}`,

  xmastree: `
vec3 treePal(float h) {
  if (h < 0.25) return vec3(1.0, 0.2, 0.22);
  if (h < 0.5) return vec3(0.3, 0.6, 1.0);
  if (h < 0.75) return vec3(1.0, 0.45, 0.85);
  return vec3(1.0, 0.85, 0.35);
}
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = vec2(uv.x * uAspect, uv.y);
  float cx = uAspect * 0.5;
  float top = 0.12;
  float base = 0.93;
  float halfB = min(0.36, uAspect * 0.46);
  float yy = (uv.y - top) / (base - top);
  vec3 C = vec3(0.0);
  float A = 0.0;
  float wy = halfB * clamp(yy, 0.0, 1.0);
  float u = (p.x - cx) / max(wy, 0.0001);
  float inside = step(0.0, yy) * step(yy, 1.0) * step(abs(u), 1.0);
  float edge = smoothstep(1.0, 0.94, abs(u)) * inside;
  float fill = edge * 0.38 * clamp(uAmp, 0.0, 2.0) * (0.6 + 0.4 * yy);
  C = uColorB * fill;
  A = fill;
  float turns = 5.0 * uFreq;
  if (inside > 0.5) {
    float th = asin(clamp(u, -1.0, 1.0));
    for (int side = 0; side < 2; side++) {
      float front = side == 0 ? 1.0 : 0.0;
      float ang = side == 0 ? th : PI - th;
      for (int strand = 0; strand < 2; strand++) {
        float off = float(strand) * 0.5;
        float ph = yy * turns + ang / TAU + off - t * 0.08;
        float dl = abs(fract(ph) - 0.5);
        float lineW = 0.018 + 0.012 * front;
        float ln = smoothstep(lineW, lineW * 0.2, dl) * (0.25 + 0.75 * front);
        float n = floor(ph) + off * 13.0;
        float bead = fract((ang / TAU + 1.0) * (10.0 + yy * 18.0) * uDensity);
        float bid = floor((ang / TAU + 1.0) * (10.0 + yy * 18.0) * uDensity) + n * 57.0;
        float tw = 0.5 + 0.5 * sin(t * 3.0 - bid * 0.7 + yy * 8.0);
        float dot2 = smoothstep(0.32, 0.0, abs(bead - 0.5)) * smoothstep(lineW * 1.8, 0.0, dl);
        vec3 lc = strand == 0 ? uColorA : treePal(hash11(bid));
        float g = clamp(ln * 0.55 + dot2 * (0.5 + 0.9 * tw), 0.0, 1.0) * (0.3 + 0.7 * front);
        C = lc * g + C * (1.0 - g);
        A = g + A * (1.0 - g);
      }
    }
  }
  vec2 sp = vec2(cx, top - 0.01);
  vec2 v = p - sp;
  float ang5 = atan(v.x, -v.y);
  float k = 0.5 + 0.5 * cos(5.0 * ang5);
  float sr = mix(0.022, 0.06, pow(k, 4.0)) * (0.92 + 0.08 * sin(t * 3.0));
  float star = smoothstep(sr, sr * 0.8, length(v));
  float sg = exp(-length(v) * 22.0) * 0.8;
  vec3 starC = vec3(1.0, 0.86, 0.4);
  C = starC * sg + C * (1.0 - sg);
  A = sg + A * (1.0 - sg);
  C = mix(C, vec3(1.0, 0.95, 0.7), star);
  A = max(A, star);
  return vec4(C / max(A, 0.001) * INTEN, A);
}`,

  glitter: `
vec4 effect(vec2 uv) {
  float t = TT;
  vec2 p = vec2(uv.x * uAspect, uv.y);
  vec3 C = vec3(0.0);
  float A = 0.0;
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    vec2 g = p * (5.0 + fl * 5.0) * uDensity / uScale;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5 - (hash22(id + fl * 7.0) - 0.5) * 0.6;
    float h = hash12(id + fl * 19.0);
    float life = pow(max(0.0, sin(t * (0.8 + h * 1.6) + h * TAU)), 6.0);
    float sz = 1.0 + fl * 0.6;
    float cr = exp(-abs(f.x) * 70.0 * sz) * exp(-abs(f.y) * 8.0 * sz) + exp(-abs(f.y) * 70.0 * sz) * exp(-abs(f.x) * 8.0 * sz);
    float core = exp(-dot(f, f) * 900.0 * sz);
    float s = clamp((cr * 0.9 + core) * life, 0.0, 1.0);
    vec3 c = mix(uColorA, uColorB, step(0.6, hash12(id + 2.0)));
    C = c * s + C * (1.0 - s);
    A = s + A * (1.0 - s);
  }
  return vec4(C / max(A, 0.001) * INTEN, A);
}`,
};
