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
};
