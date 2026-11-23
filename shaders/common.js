// GLSL ES 1.00 sources shared by all surface programs. Written in the 1.00
// dialect so they compile on both WebGL 2 and WebGL 1 (older iOS/Android).

export const VERT_SURFACE = `
attribute vec2 aPos;
attribute vec3 aUVW;
uniform mat3 uView;
varying vec3 vUVW;
varying vec2 vPos;
void main() {
  vec3 c = uView * vec3(aPos, 1.0);
  gl_Position = vec4(c.xy, 0.0, 1.0);
  vUVW = aUVW;
  vPos = aPos;
}`;

export const VERT_SIMPLE = `
attribute vec2 aPos;
uniform mat3 uView;
varying vec2 vPos;
void main() {
  vec3 c = uView * vec3(aPos, 1.0);
  gl_Position = vec4(c.xy, 0.0, 1.0);
  vPos = aPos;
}`;

export function header(quality) {
  const q = Math.max(0, Math.min(2, quality | 0));
  return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define QUALITY ${q}
#define FBM_OCT ${[3, 4, 5][q]}
#define WATER_ITER ${[3, 4, 5][q]}
#define PI 3.14159265359
#define TAU 6.28318530718
`;
}

export const NOISE = `
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < FBM_OCT; i++) { v += a * vnoise(p); p = r * p * 2.02 + 17.0; a *= 0.5; }
  return v;
}
vec2 rot(vec2 p, float a) { float c = cos(a); float s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
`;

// Uniforms visible to effect code.
export const EFFECT_UNIFORMS = `
varying vec3 vUVW;
varying vec2 vPos;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uSizePx;
uniform float uAspect;
uniform float uSpeed;
uniform float uScale;
uniform float uIntensity;
uniform float uDensity;
uniform float uDir;
uniform float uFreq;
uniform float uAmp;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec4 uAudio;
uniform float uReact;
#define TT (uTime * uSpeed)
#define INTEN (uIntensity * (1.0 + uReact * uAudio.x * 2.5))
`;

// Shape mask, feathering, content transform and colour grading.
export const PIPELINE = `
uniform float uOpacity;
uniform int uShape;
uniform float uFeather;
uniform vec4 uPoly[24];
uniform float uPolyN;
uniform vec4 uAdjust;
uniform vec4 uXform;
uniform vec3 uXform2;
uniform float uIsMask;

float sdPolygonPx(vec2 p) {
  vec2 S = uSizePx;
  float d = 1e10;
  float s = 1.0;
  vec2 prev = vec2(0.0);
  vec2 first = uPoly[0].xy * S;
  bool started = false;
  for (int k = 0; k < 24; k++) {
    for (int h = 0; h < 2; h++) {
      float idx = float(k * 2 + h);
      if (idx < uPolyN) {
        vec2 v = (h == 0 ? uPoly[k].xy : uPoly[k].zw) * S;
        if (started) {
          vec2 e = prev - v; vec2 w = p - v;
          vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
          d = min(d, dot(b, b));
          bvec3 c = bvec3(p.y >= v.y, p.y < prev.y, e.x * w.y > e.y * w.x);
          if (all(c) || all(not(c))) s *= -1.0;
        }
        prev = v; started = true;
      }
    }
  }
  vec2 e = prev - first; vec2 w = p - first;
  vec2 b = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
  d = min(d, dot(b, b));
  bvec3 c = bvec3(p.y >= first.y, p.y < prev.y, e.x * w.y > e.y * w.x);
  if (all(c) || all(not(c))) s *= -1.0;
  return -s * sqrt(d);
}

// Distance (in output pixels, positive inside) to the edge of the surface.
float edgeDistance(vec2 uv) {
  if (uShape == 1) {
    vec2 q = (uv - 0.5) * 2.0;
    return (1.0 - length(q)) * 0.5 * min(uSizePx.x, uSizePx.y);
  }
  if (uShape == 2) {
    vec2 P = uv * uSizePx;
    vec2 A = vec2(0.5, 0.0) * uSizePx; vec2 B = uSizePx; vec2 C = vec2(0.0, uSizePx.y);
    vec2 n1 = normalize(vec2(B.y - A.y, A.x - B.x));
    vec2 n2 = normalize(vec2(C.y - B.y, B.x - C.x));
    vec2 n3 = normalize(vec2(A.y - C.y, C.x - A.x));
    float d1 = -dot(P - A, n1); float d2 = -dot(P - B, n2); float d3 = -dot(P - C, n3);
    return min(d1, min(d2, d3));
  }
  if (uShape == 3) {
    if (uFeather <= 0.0) return 1e5;
    return sdPolygonPx(uv * uSizePx);
  }
  vec2 d = min(uv, 1.0 - uv) * uSizePx;
  return min(d.x, d.y);
}

float shapeAlpha(vec2 uv) {
  float d = edgeDistance(uv);
  float f = max(uFeather, 0.75);
  return clamp(d / f, 0.0, 1.0);
}

vec2 contentUV(vec2 uv) {
  vec2 c = uv - 0.5;
  c.x *= uAspect;
  c = rot(c, -uXform2.x);
  c.x /= uAspect;
  c = c / uXform.xy - uXform.zw;
  if (uXform2.y > 0.5) c.x = -c.x;
  if (uXform2.z > 0.5) c.y = -c.y;
  return c + 0.5;
}

vec3 hueShift(vec3 col, float a) {
  const vec3 k = vec3(0.57735);
  float c = cos(a);
  return col * c + cross(k, col) * sin(a) + k * dot(k, col) * (1.0 - c);
}

vec3 grade(vec3 c) {
  c = (c - 0.5) * uAdjust.y + 0.5 + uAdjust.x;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uAdjust.z);
  if (abs(uAdjust.w) > 0.001) c = hueShift(c, uAdjust.w);
  return clamp(c, 0.0, 1.0);
}

void main() {
  if (vUVW.z <= 0.0) discard;
  vec2 uv = vUVW.xy / vUVW.z;
  float m = shapeAlpha(uv);
  if (m <= 0.0) discard;
  if (uIsMask > 0.5) {
    float a = m * uOpacity;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
    return;
  }
  vec4 c = content(contentUV(uv));
  c.rgb = grade(c.rgb);
  float a = clamp(c.a, 0.0, 1.0) * m * uOpacity;
  gl_FragColor = vec4(c.rgb * a, a);
}
`;

export const MEDIA_CONTENT = `
uniform sampler2D uTex;
uniform float uTile;
vec4 content(vec2 uv) {
  if (uTile > 0.5) uv = fract(uv);
  else if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(uTex, uv);
}
`;

export const MASK_CONTENT = `vec4 content(vec2 uv) { return vec4(0.0, 0.0, 0.0, 1.0); }`;

export const FRAG_SOLID = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = vec4(uColor.rgb * uColor.a, uColor.a); }
`;

// Full-output calibration patterns, evaluated in output pixel space.
export const FRAG_CALIB = `
precision highp float;
varying vec2 vPos;
uniform vec2 uRes;
uniform int uPattern;
uniform float uGridPx;
uniform vec3 uLineColor;
float lineAt(float d, float w) { return smoothstep(w, w * 0.25, d); }
void main() {
  vec2 px = vPos * uRes;
  vec3 col = vec3(0.0);
  float a = 1.0;
  if (uPattern == 1) {
    vec2 g = abs(mod(px + uGridPx * 0.5, uGridPx) - uGridPx * 0.5);
    float minor = lineAt(min(g.x, g.y), 1.2);
    vec2 g5 = abs(mod(px + uGridPx * 2.5, uGridPx * 5.0) - uGridPx * 2.5);
    float major = lineAt(min(g5.x, g5.y), 2.2);
    vec2 c = abs(px - uRes * 0.5);
    float crs = lineAt(min(c.x, c.y), 2.5);
    float r = length(px - uRes * 0.5);
    float circ = lineAt(abs(r - min(uRes.x, uRes.y) * 0.45), 2.0) + lineAt(abs(r - min(uRes.x, uRes.y) * 0.2), 1.5);
    vec2 e = min(px, uRes - px);
    float border = lineAt(min(e.x, e.y), 3.0);
    vec2 dn = (px / uRes - 0.5);
    float diag = lineAt(min(abs(dn.x * uRes.x / uRes.y - dn.y), abs(dn.x * uRes.x / uRes.y + dn.y)) * uRes.y, 1.2) * 0.5;
    col = uLineColor * (minor * 0.45 + major * 0.8 + diag) + vec3(1.0) * max(crs, max(circ, border));
    a = clamp(max(max(minor, major), max(max(crs, circ), max(border, diag))), 0.0, 1.0);
    col /= max(a, 0.001);
  } else if (uPattern == 2) {
    vec2 c = floor(px / uGridPx);
    col = vec3(mod(c.x + c.y, 2.0));
  } else if (uPattern == 3) {
    col = vec3(1.0);
  } else if (uPattern == 4) {
    col = vec3(0.0);
  } else if (uPattern == 5) {
    col = vec3(1.0, 0.0, 0.0);
  } else if (uPattern == 6) {
    col = vec3(0.0, 1.0, 0.0);
  } else if (uPattern == 7) {
    col = vec3(0.0, 0.0, 1.0);
  } else if (uPattern == 8) {
    float b = floor(vPos.x * 8.0);
    if (vPos.y > 0.78) {
      col = vec3(floor(vPos.x * 11.0) / 10.0);
    } else {
      if (b < 0.5) col = vec3(0.75);
      else if (b < 1.5) col = vec3(0.75, 0.75, 0.0);
      else if (b < 2.5) col = vec3(0.0, 0.75, 0.75);
      else if (b < 3.5) col = vec3(0.0, 0.75, 0.0);
      else if (b < 4.5) col = vec3(0.75, 0.0, 0.75);
      else if (b < 5.5) col = vec3(0.75, 0.0, 0.0);
      else if (b < 6.5) col = vec3(0.0, 0.0, 0.75);
      else col = vec3(0.05);
    }
  } else if (uPattern == 9) {
    col = vec3(vPos.x);
  }
  gl_FragColor = vec4(col * a, a);
}
`;

// Simulation composite: what the room looks like lit by the projector.
export const FRAG_SIMULATE = `
precision mediump float;
varying vec2 vPos;
uniform sampler2D uLight;
uniform sampler2D uAlbedo;
uniform float uAmbient;
uniform float uGain;
uniform float uHasAlbedo;
void main() {
  vec3 light = texture2D(uLight, vec2(vPos.x, 1.0 - vPos.y)).rgb;
  vec3 albedo = uHasAlbedo > 0.5 ? texture2D(uAlbedo, vPos).rgb : vec3(0.85);
  vec3 col = albedo * (uAmbient + light * uGain);
  col += light * light * 0.08;
  gl_FragColor = vec4(col, 1.0);
}
`;

// Plain textured quad (reference background photo, FBO blit).
export const FRAG_TEXTURE = `
precision mediump float;
varying vec2 vPos;
uniform sampler2D uTex;
uniform float uAlpha;
uniform float uFlipY;
void main() {
  vec2 uv = uFlipY > 0.5 ? vec2(vPos.x, 1.0 - vPos.y) : vPos;
  vec4 c = texture2D(uTex, uv);
  gl_FragColor = vec4(c.rgb * uAlpha, uAlpha);
}
`;
