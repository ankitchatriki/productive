// Sky and cliff (ROUND6_PLAN §6.1–6.2, §3.3–3.5) as three passes: the sky at half resolution every other frame;
// the cliff into a world-anchored, double-buffered panorama built a strip per frame (it only depends on the world, so
// it is rendered once and scrolled); and a per-frame composite that cuts the broken crest, adds the edge glow and the
// summit's far-side haze. Everything is scene luminance (sqrt-encoded in R).
import { HEADER, NOISE } from './common';

const RIDGE = `
uniform sampler2D uRidge;     // per column of the target: crest y (target px, ×8, 16 bit)
uniform float uRidgeN, uRidgeOff;
float ridgeAt(float col) {
  float c = clamp(col, 0.0, uRidgeN - 1.0);
  float i = floor(c), f = c - i;
  vec4 a = texture2D(uRidge, vec2((i + 0.5) / uRidgeN, 0.5));
  vec4 b = texture2D(uRidge, vec2((min(i + 1.0, uRidgeN - 1.0) + 0.5) / uRidgeN, 0.5));
  float ya = (a.r * 65280.0 + a.g * 255.0) / 8.0 - uRidgeOff, yb = (b.r * 65280.0 + b.g * 255.0) / 8.0 - uRidgeOff;
  return mix(ya, yb, f);
}

`;

export const SKY_FS = HEADER + NOISE + `
uniform vec2 uRes; uniform float uDpr, uH, uSeed;
uniform vec4 uSky; uniform vec4 uOpen; uniform vec4 uMoon;
varying vec2 vUv;
` + RIDGE + `
float skyL(vec2 css) {
  vec2 u = css / uH;
  // stratocumulus stretched 2.5:1, domain-warped, drifting and slowly evolving (never sliding like wallpaper)
  vec2 sp = vec2(u.x * 0.40, u.y) + vec2(uSky.x, 0.0);
  float ev = uSky.y;
  vec2 w = vec2(fbm(sp * 1.7 + vec2(3.1, ev), 4), fbm(sp * 1.7 + vec2(8.7, -ev), 4)) - 0.5;
  float big = fbm(sp * vec2(2.6, 3.4) + 1.6 * w + vec2(ev * 0.5, 0.0), 4);
  float billow = ridged(sp * vec2(3.0, 5.5) + 1.2 * w + 2.0, 3);          // soft defined undersides
  float mott = fbm(u * 26.0 + uSeed, 3);
  // the crest line, blurred across ±0.4 H so the glow band never shows a step where the crest turns or drops
  float ry = 0.0;
  for (int k = -3; k <= 3; k++) ry += ridgeAt(css.x + float(k) * 0.133 * uH);
  ry /= 7.0 * uH;
  float base = mix(0.80, 0.98, smoothstep(0.05, 0.80, u.y));
  float glow = uSky.z * 1.6 * exp(-max(0.0, ry - u.y) / 0.12);
  float open = uOpen.x * exp(-dot((css - uOpen.yz) / uH * vec2(0.8, 1.6), (css - uOpen.yz) / uH * vec2(0.8, 1.6)) * 4.0);
  float cloud = 1.25 * (big - 0.5) + 0.14 * (billow - 0.5);
  float L = base + cloud * (1.0 - 0.6 * open) + 0.03 * (mott - 0.5) + glow + 0.06 * open
          - uSky.w * 0.6 * smoothstep(0.35, 0.0, u.y);
  if (uMoon.x > 0.0) L += 0.06 * uMoon.x * exp(-dot(css - uMoon.yz, css - uMoon.yz) / (uMoon.w * uMoon.w));
  return L * 0.46;   // calibrated to the print curve: mid sky ≈ L 160–175, the band by the crest ≈ 190–205
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  gl_FragColor = vec4(sqrt(max(skyL(css), 0.0)), 0.0, 0.0, 1.0);
}
`;

export const CLIFF_FS = HEADER + NOISE + `
uniform vec2 uTarget;          // target size (px)
uniform float uPxPerH;         // target px per H
uniform vec2 uW0;              // world (relative to the origin) at the target's top-left pixel corner
uniform vec2 uOrigin;          // world origin mod 289
uniform float uSeed, uQuality;
varying vec2 vUv;
` + RIDGE + `
const vec3 LKEY = vec3(-0.55, 0.45, 0.70);
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
float rockDetail(vec2 q) { return 0.55 * ridged(vec2(q.x * 3.2, q.y * 1.7) + uSeed * 0.3, 5) + 0.25 * fbm(vec2(q.x * 9.0, q.y * 6.0), 3) + 0.20 * fbm(vec2(q.x * 26.0, q.y * 9.0) + 4.0, 3); }

void main() {
  vec2 px = vec2(gl_FragCoord.x, uTarget.y - gl_FragCoord.y);          // target px, y down
  vec2 wp = vec2(uW0.x + px.x / uPxPerH, uW0.y - px.y / uPxPerH);
  float d = max((px.y - ridgeAt(px.x)) / uPxPerH, 0.0);                // H below the (unbroken) crest line
    vec2 p = wp + uOrigin;
    vec2 q = mat2(0.990, 0.140, -0.140, 0.990) * p;                 // cleavage tilted ~8° from vertical
    vec2 wv = vec2(fbm(q * 0.7 + uSeed, 3), fbm(q * 0.7 + uSeed + 5.2, 3)) - 0.5;
    vec2 qw = q + wv * vec2(0.40, 0.9);
    vec4 big = facets(qw, 0.45, 2.2, uSeed);                       // slabs ≈ 0.45 H wide, 2.2 H tall
    vec4 mid = facets(qw + 11.0, 0.14, 0.55, uSeed + 3.0);           // broken faces
    // detail relief on top of the facets
    float e = 1.0 / uPxPerH;
    float h0 = rockDetail(qw), hx = rockDetail(qw + vec2(e, 0.0)), hy = rockDetail(qw + vec2(0.0, e));
    // facet edges are where the light changes, never drawn lines: the tilt eases across a narrow border
    vec2 tilt = big.xy * 0.75 * smoothstep(0.0, 0.08, big.z) + mid.xy * 0.22 - vec2(hx - h0, hy - h0) / e * 0.15;
    vec3 n = normalize(vec3(tilt, 1.0));
    float lit = clamp((dot(n, normalize(LKEY)) - 0.05) / 0.95, 0.0, 1.0);
    float crack = 0.55 + 0.45 * smoothstep(0.08, 0.6, h0);           // the deep parts of the relief hold shadow
    float gully = smoothstep(0.58, 0.82, fbm(vec2(p.x * 0.30 + uSeed, 0.3), 3));
    float alb = (0.85 + 0.30 * (big.w - 0.5) + 0.2 * (fbm(p * 1.3, 3) - 0.5) + 0.70 * (fbm(vec2(q.x * 14.0, q.y * 6.0), 3) - 0.5)) * (1.0 - 0.55 * gully * smoothstep(0.0, 0.5, d));
    float r = alb * (0.30 + 0.9 * pow(lit, 2.0) + 0.08 * (0.5 + 0.5 * n.y)) * crack;
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
    r *= 0.26;                                                     // calibrated: rock body ≈ L 30–70, lit edges ≈ 120
    r += 0.030 * exp(-d / 0.04);                                    // the lit crest lip
    r = mix(r, 0.09, 0.10 * exp(-d / 1.2));                         // haze near the crest
  gl_FragColor = vec4(sqrt(max(r, 0.0)), 1.0, 0.0, 1.0);
}
`;

export const COMP_FS = HEADER + NOISE + `
uniform vec2 uRes; uniform float uDpr, uH, uSeed;
uniform vec4 uCam; uniform vec2 uAnchor;
uniform sampler2D uSkyTex, uCliffTex;
uniform vec4 uCliffMap;        // cliff texture: world (relative) at its top-left, px per H, unused
uniform vec2 uCliffSize;
uniform float uHazeX;
varying vec2 vUv;
` + RIDGE + `
void main() {
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 wp = vec2(uCam.x + (css.x - uAnchor.x) / uCam.z, uCam.y - (css.y - uAnchor.y) / uCam.z);
  float edge = ridgeAt(css.x);                                          // the broken crest (computed per column on the CPU)
  float aa = 0.75 / uDpr;
  float rockA = smoothstep(-aa, aa, css.y - edge);
  float s = texture2D(uSkyTex, vec2(gl_FragCoord.x / uRes.x, gl_FragCoord.y / uRes.y)).r;
  float L = s * s + 0.05 * exp(-max(0.0, edge - css.y) * uDpr / 2.5);   // the faint halo against the dark rock
  if (rockA > 0.0) {
    vec2 c = vec2((wp.x - uCliffMap.x) * uCliffMap.z, (uCliffMap.y - wp.y) * uCliffMap.z) / uCliffSize;
    float r = texture2D(uCliffTex, vec2(c.x, 1.0 - c.y)).r; r *= r;
    if (wp.x > uHazeX) r = mix(r, 0.26, 1.0 - exp(-(wp.x - uHazeX) / 2.5));
    L = mix(L, r, rockA);
  }
  gl_FragColor = vec4(sqrt(max(L, 0.0)), rockA, 0.0, 1.0);
}
`;
