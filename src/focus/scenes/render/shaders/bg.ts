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
  float mott2 = fbm(css / max(uRes.x / uDpr, 1.0) * vec2(120.0, 150.0) + uSeed * 1.3, 2);   // emulsion mottle at 1–3% of the frame
  // the crest line, blurred across ±0.4 H so the glow band never shows a step where the crest turns or drops
  float ry = 0.0;
  for (int k = -3; k <= 3; k++) ry += ridgeAt(css.x + float(k) * 0.133 * uH);
  ry /= 7.0 * uH;
  float base = mix(0.80, 0.98, smoothstep(0.05, 0.80, u.y));
  float glow = uSky.z * 2.4 * exp(-max(0.0, ry - u.y) / 0.08);
  float open = uOpen.x * exp(-dot((css - uOpen.yz) / uH * vec2(0.8, 1.6), (css - uOpen.yz) / uH * vec2(0.8, 1.6)) * 4.0);
  // broken stratocumulus: cells 10–40 px across, brighter tops, darker gaps, denser where the big field is high
  float cells = fbm(u * vec2(6.0, 9.5) + vec2(uSky.x * 2.5, 0.0) + 2.0 * w + vec2(ev, 3.0), 4);
  float puffs = smoothstep(0.42, 0.72, cells) * (0.5 + big);
  float cloud = 0.55 * (big - 0.5) + 0.30 * (billow - 0.5) + 0.30 * (puffs - 0.45);
  // a lighter diagonal rift along the ridge direction
  float rift = exp(-pow((u.y - 0.55 + 0.42 * (css.x / uH - 0.8) + 0.12 * (w.x)) / 0.16, 2.0));
  float L = base + cloud * (1.0 - 0.6 * open) + 0.06 * (mott - 0.5) + 0.08 * (mott2 - 0.5) + 0.06 * rift + glow + 0.06 * open
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
// Fractured rock (REVIEW_ROUND6 A1): every cell of an anisotropic Voronoi field is a flat plane with its own normal,
// so the light changes abruptly at the cell borders: hard 1 px cleavage edges made of light, never drawn seams.
// Returns (tilt.xy, unused, cell hash).
vec4 planes(vec2 q, float sx, float sy, float salt) {
  vec2 g = vec2(q.x / sx, q.y / sy);
  vec2 i = floor(g), f = fract(g);
  float d1 = 9.0; vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 r = o + vec2(hash12(i + o + salt), hash12(i + o + salt + 7.7)) * 0.9 + 0.05 - f;
    float d = dot(r, r);
    if (d < d1) { d1 = d; id = i + o; }
  }
  float a = hash12(id + salt + 3.1), b = hash12(id + salt + 9.4);
  return vec4((a - 0.45) * 1.2, (b - 0.42) * 0.9, 0.0, hash12(id + salt + 1.9));
}
float rockDetail(vec2 q) { return 0.55 * ridged(vec2(q.x * 3.2, q.y * 2.4) + uSeed * 0.3, 2) + 0.30 * fbm(vec2(q.x * 11.0, q.y * 8.0), 2) + 0.15 * vnoise(q * 34.0); }

void main() {
  vec2 px = vec2(gl_FragCoord.x, uTarget.y - gl_FragCoord.y);          // target px, y down
  vec2 wp = vec2(uW0.x + px.x / uPxPerH, uW0.y - px.y / uPxPerH);
  float d = max((px.y - ridgeAt(px.x)) / uPxPerH, 0.0);                // H below the (unbroken) crest line
  float e = 1.0 / uPxPerH;                                              // one target px in H
  vec2 p = wp + uOrigin;
  vec2 q = mat2(0.966, 0.259, -0.259, 0.966) * p;                       // cleavage ~15° from vertical
  vec2 wv = vec2(fbm(q * 0.6 + uSeed, 2), fbm(q * 0.6 + uSeed + 5.2, 2)) - 0.5;
  vec2 qw = q + wv * vec2(0.25, 0.5);
  // two joint sets of planes: slabs 0.25–0.5 H wide and 1.2–2.5 H tall, broken faces inside them
  vec4 big = planes(qw, 0.38, 1.8, uSeed);
  vec2 qj = qw + 0.035 * (vec2(fbm(q * 9.0 + 3.0, 2), fbm(q * 9.0 + 8.0, 2)) - 0.5);   // jagged, not ruled, borders
  vec4 mid = planes(qj + 11.0, 0.13, 0.42, uSeed + 3.0);
  vec4 sml = planes(qj * mat2(0.94, -0.34, 0.34, 0.94) + 23.0, 0.05, 0.13, uSeed + 5.0);   // crumbly chips, a second joint direction
  // fine relief: two octaves at half weight; the crispness comes from the plane edges
  float h0 = rockDetail(qw), hx = rockDetail(qw + vec2(e, 0.0)), hy = rockDetail(qw + vec2(0.0, e));
  vec2 tilt = big.xy * 1.15 + mid.xy * 0.55 + sml.xy * 0.45 - vec2(hx - h0, hy - h0) / e * 0.11;
  // buttresses: lit ribs and shadowed channels 1.5–3 H apart along the cleavage (the large-scale form of the face)
  vec2 mq = vec2(qw.x * 0.85, qw.y * 0.16) + uSeed * 1.7;
  float m0 = fbm(mq, 3), mx = fbm(mq + vec2(0.04, 0.0), 3);
  tilt.x -= (mx - m0) / 0.04 * 0.85 * 0.55;
  vec3 n = normalize(vec3(tilt, 1.0));
  float lit = clamp(dot(n, normalize(LKEY)), 0.0, 1.0);
  float alb = 0.85 + 0.30 * (big.w - 0.5) + 0.14 * (mid.w - 0.5) + 0.20 * (sml.w - 0.5) + 0.16 * (fbm(p * 1.3, 2) - 0.5);
  float r = alb * (0.30 + 1.15 * pow(lit, 1.8));
  r *= 0.80 + 0.20 * smoothstep(0.1, 0.7, h0);                         // the deep parts of the relief hold shadow
  // ledges: sub-horizontal steps every 0.25–0.6 H, jittered per column band; lit top 2–3 px, shadow under 4–8 px
  float bw = 0.7 + 0.5 * hash12(vec2(floor(p.x / 0.9), uSeed + 21.0));
  float band = floor(p.x / bw);
  float sp = 0.25 + 0.35 * hash12(vec2(band, uSeed + 13.0));
  float yy = d + (p.x - band * bw) * (hash12(vec2(band, uSeed + 17.0)) - 0.5) * 0.35 + hash12(vec2(band, uSeed + 19.0)) * sp;
  float k = floor(yy / sp), fy = (yy - k * sp);                          // H below this ledge's line
  if (hash12(vec2(band, k + uSeed)) < 0.40 && d > 0.12) {
    float top = sp - fy;                                                // H above the next ledge line
    r += 0.25 * 0.30 * (1.0 - smoothstep(1.5 * e, 3.0 * e, top)) * (0.6 + 0.4 * lit);
    r *= 1.0 - 0.45 * (1.0 - smoothstep(2.0 * e, 9.0 * e, fy));
  }
  // one dark gully per 8–14 H of world x, 0.5–1 H wide at the crest, widening 1.5× by 3 H down
  float gc = floor(p.x / 11.0);
  float gx = (gc + 0.2 + 0.6 * hash12(vec2(gc, uSeed + 31.0))) * 11.0;
  float gw = (0.5 + 0.5 * hash12(vec2(gc, uSeed + 37.0))) * (1.0 + 0.5 * min(d / 3.0, 1.5));
  float gdx = p.x - gx + d * 0.27 + 0.25 * (fbm(vec2(d * 1.5, gc) + uSeed, 2) - 0.5);
  float gully = 1.0 - smoothstep(0.32 * gw, 0.5 * gw, abs(gdx));
  r = mix(r, min(r * 0.5, 0.20), gully);
  r *= mix(1.0, 0.82, smoothstep(0.0, 4.0, d));                        // heavier toward the base
  // snow or scree: one patch per 12 H cell in three, never within 0.4 H of the crest
  float cell = floor(p.x / 12.0);
  if (hash12(vec2(cell, uSeed)) < 0.34) {
    float cx = (cell + 0.25 + 0.5 * hash12(vec2(cell, uSeed + 1.0))) * 12.0, top = 0.6 + 0.9 * hash12(vec2(cell, uSeed + 2.0));
    float wdt = 0.4 + 0.5 * hash12(vec2(cell, uSeed + 3.0)), hgt = 0.8 + 0.8 * hash12(vec2(cell, uSeed + 4.0));
    float sx = (p.x - cx + (d - top) * 0.25) / wdt;
    float sy = (d - top) / hgt;
    float ed = 0.12 * (fbm(vec2(p.x * 3.0, d * 3.0) + 9.0, 3) - 0.5);
    float inPatch = smoothstep(0.5 + ed, 0.42 + ed, abs(sx)) * smoothstep(-0.02, 0.04, sy) * (1.0 - smoothstep(0.6, 1.0, sy + 0.3 * fbm(vec2(p.x * 9.0, 1.0), 2)));
    inPatch *= step(0.4, d) * (0.55 + 0.45 * fbm(vec2(p.x * 14.0, d * 2.0), 3));
    r = mix(r, 2.4 * (0.35 + 0.65 * lit), inPatch * (1.0 - gully));
  }
  // the top of a near-vertical face: darker just under the lip, then lifting
  r *= mix(1.0, 0.6, smoothstep(0.02, 0.12, d) * (1.0 - smoothstep(0.2, 0.45, d)));
  r *= 0.21;                                                           // calibrated: the rock lobe ≈ L 32–48
  r += 0.10 * (1.0 - smoothstep(1.0 * e, 3.0 * e, d));                 // the lit crest lip, 1–3 px
  r = mix(r, 0.09, 0.08 * exp(-d / 1.2));                              // haze near the crest
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
