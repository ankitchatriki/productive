// Sky and cliff (ROUND6_PLAN §6.1–6.2), one full-screen pass into the scene buffer (sqrt luminance in R, material
// mask in G: 0 sky, 1 rock). World lookups are relative to a CPU-side origin, so the rock is fixed to the world.
import { HEADER, NOISE } from './common';

export const BG_FS = HEADER + NOISE + `
uniform vec2 uRes;            // device px
uniform float uDpr, uH;       // device pixel ratio, CSS height
uniform vec4 uCam;            // camX - originX, camY - originY, zoom * Hpx (CSS px per H), zoom
uniform vec2 uAnchor;         // CSS px
uniform vec2 uOrigin;         // world origin (multiple of 64 H) mod 289, for the hash domain
uniform sampler2D uRidge;     // per CSS column: crest screen y
uniform float uRidgeN, uSeed;
uniform vec4 uSky;            // drift, evolve, glow, burn
uniform vec4 uOpen;           // open amount, open centre x, y (CSS), unused
uniform vec4 uMoon;           // amount, x, y (CSS), radius
uniform vec4 uContacts;       // world x (relative) of up to 4 contact windows
uniform float uHazeX, uQuality;
varying vec2 vUv;

const vec3 LKEY = vec3(-0.55, 0.45, 0.70);

float ridgeAt(float col) {
  float c = clamp(col, 0.0, uRidgeN - 1.0);
  float i = floor(c), f = c - i;
  vec4 a = texture2D(uRidge, vec2((i + 0.5) / uRidgeN, 0.5));
  vec4 b = texture2D(uRidge, vec2((min(i + 1.0, uRidgeN - 1.0) + 0.5) / uRidgeN, 0.5));
  float ya = (a.r * 65280.0 + a.g * 255.0) / 8.0 - uH, yb = (b.r * 65280.0 + b.g * 255.0) / 8.0 - uH;
  return mix(ya, yb, f);
}

float skyL(vec2 css) {
  vec2 u = css / uH;
  vec2 sp = vec2(u.x * 0.40, u.y) + vec2(uSky.x, 0.0);
  float ev = uSky.y;
  vec2 w = vec2(fbm(sp * 1.6 + vec2(3.1, ev), 4), fbm(sp * 1.6 + vec2(8.7, -ev), 4));
  float big = fbm(sp * 3.2 + 1.1 * w + vec2(ev * 0.5, 0.0), 5);
  big = 0.5 + (big - 0.5) * 1.8;
  float mott = fbm(u * 28.0 + uSeed, 3);
  float ry = ridgeAt(css.x) / uH;
  float base = mix(0.62, 0.80, smoothstep(0.15, 0.85, u.y));
  float glow = uSky.z * exp(-max(0.0, ry - u.y) / 0.10);
  // the clouds thin above the summit
  float open = uOpen.x * exp(-dot((css - uOpen.yz) / uH * vec2(0.8, 1.6), (css - uOpen.yz) / uH * vec2(0.8, 1.6)) * 4.0);
  float L = base + 0.70 * (big - 0.5) * (1.0 - 0.6 * open) + 0.07 * (mott - 0.5) + glow + 0.06 * open
          - uSky.w * smoothstep(0.30, 0.0, u.y);
  L *= 0.46;   // calibrated to the print curve: mid sky ≈ L 160–175
  // a hidden moon or sun: a soft brighter patch through the cloud, never a disc
  if (uMoon.x > 0.0) L += 0.06 * uMoon.x * exp(-dot(css - uMoon.yz, css - uMoon.yz) / (uMoon.w * uMoon.w));
  return L;
}

// faceted rock: an anisotropic cellular field; every cell is a flat facet with its own tilt, cracks along the borders
vec4 facets(vec2 q, float sx, float sy, float salt) {
  vec2 g = vec2(q.x / sx, q.y / sy);
  vec2 i = floor(g), f = fract(g);
  float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 r = o + vec2(hash12(i + o + salt), hash12(i + o + salt + 7.7)) * 0.9 + 0.05 - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = i + o; } else if (d < d2) d2 = d;
  }
  float crack = sqrt(d2) - sqrt(d1);
  // facet normal: mostly facing out, tilted left/up (lit) or right/down (shadowed), cleavage-steep
  float a = hash12(id + salt + 3.1), b = hash12(id + salt + 9.4);
  vec2 tilt = vec2((a - 0.42) * 1.5, (b - 0.40) * 0.9);
  return vec4(tilt, crack, hash12(id + salt + 1.9));
}
float rockDetail(vec2 q) { return fbm(vec2(q.x * 7.0, q.y * 2.4) + uSeed * 0.3, 4); }

void main() {
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;      // CSS px, y down
  vec2 wp = vec2(uCam.x + (css.x - uAnchor.x) / uCam.z, uCam.y - (css.y - uAnchor.y) / uCam.z); // world, relative
  float ry = ridgeAt(css.x);
  // crest roughness: bites below the walking line, never above; the trail exactly under the feet and the stone
  float win = 1.0;
  for (int i = 0; i < 4; i++) win = min(win, smoothstep(0.15, 0.6, abs(wp.x - uContacts[i])));
  float bite = (0.022 * ridged(vec2(wp.x * 5.0 + uSeed, 0.5), 3) + 0.006 * vnoise(vec2(wp.x * 40.0, 3.0)) + 0.04 * smoothstep(0.80, 0.95, vnoise(vec2(wp.x / 1.2 + uSeed, 1.7)))) * win;
  float edge = ry + bite * uCam.z;                                      // CSS px
  float depth = (css.y - edge) / uCam.z;                                // H below the crest (≥ 0 in rock)
  float aa = 0.75 / uDpr;
  float rockA = smoothstep(-aa, aa, css.y - edge);
  float L = 0.0;
  if (rockA < 1.0) {
    float s = skyL(css);
    // edge glow on the sky side: a faint lighter halo against the dark rock
    s += 0.05 * exp(-max(0.0, edge - css.y) * uDpr / 2.5);
    L = s;
  }
  if (rockA > 0.0) {
    vec2 p = wp + uOrigin;
    float d = max(depth, 0.0);
    vec2 q = mat2(0.990, 0.140, -0.140, 0.990) * p;                 // cleavage tilted ~8° from vertical
    vec2 wv = vec2(fbm(q * 0.6 + uSeed, 3), fbm(q * 0.6 + uSeed + 5.2, 3)) - 0.5;
    vec2 qw = q + wv * vec2(0.35, 0.8);
    vec4 big = facets(qw, 0.45, 2.2, uSeed);                       // slabs ≈ 0.45 H wide, 2.2 H tall
    vec4 mid = facets(qw + 11.0, 0.14, 0.55, uSeed + 3.0);           // broken faces
    vec4 fine = facets(qw + 23.0, 0.045, 0.14, uSeed + 6.0);
    // detail relief on top of the facets
    float e = 1.0 / uCam.z;
    float h0 = rockDetail(qw), hx = rockDetail(qw + vec2(e, 0.0)), hy = rockDetail(qw + vec2(0.0, e));
    // facet edges are where the light changes, never drawn lines: the tilt eases across a narrow border
    vec2 tilt = big.xy * 0.8 * smoothstep(0.0, 0.05, big.z) + mid.xy * 0.55 + fine.xy * 0.22 - vec2(hx - h0, hy - h0) / e * 0.06;
    vec3 n = normalize(vec3(tilt, 1.0));
    float lit = clamp((dot(n, normalize(LKEY)) - 0.05) / 0.95, 0.0, 1.0);
    float crack = 0.75 + 0.25 * smoothstep(0.0, 0.12, mid.z);
    float gully = smoothstep(0.58, 0.82, fbm(vec2(p.x * 0.30 + uSeed, 0.3), 3));
    float alb = (0.85 + 0.30 * (big.w - 0.5) + 0.2 * (fbm(p * 1.3, 3) - 0.5)) * (1.0 - 0.55 * gully * smoothstep(0.0, 0.5, d));
    float r = alb * (0.16 + 0.9 * pow(lit, 2.0) + 0.08 * (0.5 + 0.5 * n.y)) * crack;
    r *= mix(1.0, 0.6, smoothstep(0.0, 4.0, d));                    // heavier toward the base
    // snow or scree: one patch per 12 H cell in three, never within 0.4 H of the crest
    float cell = floor(p.x / 12.0);
    if (hash12(vec2(cell, uSeed)) < 0.34) {
      float cx = (cell + 0.25 + 0.5 * hash12(vec2(cell, uSeed + 1.0))) * 12.0, top = 0.6 + 0.9 * hash12(vec2(cell, uSeed + 2.0));
      float wdt = 0.4 + 0.5 * hash12(vec2(cell, uSeed + 3.0)), hgt = 0.8 + 0.8 * hash12(vec2(cell, uSeed + 4.0));
      float sx = (p.x - cx + (d - top) * 0.25) / wdt;                // sheared along the cleavage
      float sy = (d - top) / hgt;
      float edge = 0.12 * (fbm(vec2(p.x * 3.0, d * 3.0) + 9.0, 3) - 0.5);
      float inPatch = smoothstep(0.5 + edge, 0.42 + edge, abs(sx)) * smoothstep(-0.02, 0.04, sy) * (1.0 - smoothstep(0.6, 1.0, sy + 0.3 * fbm(vec2(p.x * 9.0, 1.0), 2)));
      inPatch *= step(0.4, d) * (0.55 + 0.45 * fbm(vec2(p.x * 14.0, d * 2.0), 3));
      r = mix(r, 0.62 * (0.35 + 0.65 * lit) * 0.42, inPatch);
    }
    r *= 0.21;                                                     // calibrated: rock body ≈ L 30–70, lit edges ≈ 120
    r += 0.030 * exp(-d / 0.04);                                    // the lit crest lip
    r = mix(r, 0.09, 0.10 * exp(-d / 1.2));                         // haze near the crest
    if (wp.x > uHazeX) r = mix(r, 0.26, 1.0 - exp(-(wp.x - uHazeX) / 2.5));
    L = mix(L, r, rockA);
  }
  gl_FragColor = vec4(sqrt(max(L, 0.0)), rockA, 0.0, 1.0);
}
`;
