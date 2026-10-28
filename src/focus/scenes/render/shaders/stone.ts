// The stone (ROUND6_PLAN §5): a lunar sphere, cratered and mottled in material space, rolled by +rot (clockwise on
// screen) under a light that never moves. Texture lookups use the material point nM; the lighting uses the view
// normal nV, so the terminator and core shadow stay put while the craters travel over the top.
import { HEADER, NOISE } from './common';

export const STONE_FS = HEADER + NOISE + `
uniform vec2 uRes; uniform float uDpr, uH, uSeed, uQuality;
uniform vec3 uStone;        // centre x, y (CSS, y down), radius (CSS px)
uniform float uRot, uAlbedoOnly;
uniform sampler2D uRidge; uniform float uRidgeN;
varying vec2 vUv;
const vec3 LKEY = vec3(-0.55, 0.45, 0.70);

float ridgeAt(float col) {
  float c = clamp(col, 0.0, uRidgeN - 1.0); float i = floor(c), f = c - i;
  vec4 a = texture2D(uRidge, vec2((i + 0.5) / uRidgeN, 0.5)), b = texture2D(uRidge, vec2((min(i + 1.0, uRidgeN - 1.0) + 0.5) / uRidgeN, 0.5));
  return mix((a.r * 65280.0 + a.g * 255.0) / 8.0 - uH, (b.r * 65280.0 + b.g * 255.0) / 8.0 - uH, f);
}
// y-up rotation by +a (CCW): undoes the clockwise roll for the material lookup
vec3 toMat(vec3 v) { float c = cos(uRot), s = sin(uRot); return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }

// one octave of craters: 3D cells, each holding a crater with probability prob. Returns (height, albedo delta).
vec2 craters(vec3 p, float prob) {
  vec3 i = floor(p), f = fract(p);
  vec2 acc = vec2(0.0);
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 h = hash33(i + g + uSeed);
    if (h.z > prob) continue;
    vec3 c = g + 0.25 + 0.5 * h - f;
    float rc = 0.35 + 0.13 * fract(h.x * 7.3 + h.y * 3.1);
    float d = length(c) / rc;
    if (d < 1.0) { acc.x += -0.45 * (1.0 - d * d); acc.y -= 0.06 * (1.0 - d); }
    acc.x += 0.12 * exp(-((d - 1.0) / 0.22) * ((d - 1.0) / 0.22));
    if (d > 1.0 && d < 1.8) acc.y += 0.02;
  }
  return acc;
}
vec2 surface(vec3 m) {   // (height in R units, albedo)
  float alb = 0.40 + 0.10 * (fbm3(m * 2.2 + uSeed, 4) - 0.5) * 2.0 - 0.05 * smoothstep(0.55, 0.75, fbm3(m * 1.3 + 7.0, 3)) + 0.03 * (fbm3(m * 18.0, 2) - 0.5) * 2.0;
  vec2 c1 = craters(m * 3.0, 0.16), c2 = craters(m * 7.0 + 11.0, 0.22);
  vec2 c3 = uQuality > 0.6 ? craters(m * 16.0 + 23.0, 0.30) : vec2(0.0);
  float hgt = 0.022 * c1.x + 0.010 * c2.x + 0.005 * c3.x + 0.020 * (fbm3(m * 7.0, 4) - 0.5);
  alb += c1.y + c2.y * 0.8 + c3.y * 0.6 + 0.16 * (fbm3(m * 5.0 + 3.0, 4) - 0.5) + 0.08 * (fbm3(m * 24.0 + 1.0, 3) - 0.5);
  return vec2(hgt, clamp(alb, 0.24, 0.58));
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 pp = (css - uStone.xy) / uStone.z; pp.y = -pp.y;            // y-up, units of R
  float r2 = dot(pp, pp);
  // a ragged limb in material angle: its bumps travel with the roll
  float ang = atan(pp.y, pp.x) + uRot;
  float rim = 1.0 + 0.006 * (vnoise(vec2(ang * 6.366, 2.0 + uSeed)) * 2.0 - 1.0) + 0.004 * (vnoise(vec2(ang * 19.1, 5.0)) * 2.0 - 1.0);
  float aa = 0.8 / (uDpr * uStone.z);
  float cov = smoothstep(rim + aa, rim - aa, sqrt(r2));
  float L = 0.0, alpha = 0.0;
  if (cov > 0.0) {
    vec2 q = pp / rim; float qq = min(dot(q, q), 0.9999);
    vec3 nV = vec3(q, sqrt(1.0 - qq));
    vec3 nM = toMat(nV);
    vec2 s0 = surface(nM);
    float alb = s0.y;
    // bump normal: the height's gradient on the view tangent plane
    float e = 0.012;
    vec3 tx = normalize(vec3(1.0, 0.0, -nV.x / nV.z)), ty = normalize(vec3(0.0, 1.0, -nV.y / nV.z));
    float hx = surface(toMat(normalize(nV + tx * e))).x, hy = surface(toMat(normalize(nV + ty * e))).x;
    vec3 nB = normalize(nV - ((hx - s0.x) / e) * tx * 6.0 - ((hy - s0.x) / e) * ty * 6.0);
    vec3 lk = normalize(LKEY);
    float wrap = clamp((dot(nB, lk) + 0.45) / 1.45, 0.0, 1.0);
    L = alb * (1.25 * pow(wrap, 2.3) + 0.05 * (0.5 + 0.5 * nB.y) + 0.010);
    L += 0.10 * pow(1.0 - nV.z, 3.0) * max(0.0, dot(normalize(nV.xy + 1e-5), normalize(lk.xy)));  // rim brightening
    L *= 1.0 - 0.20 * smoothstep(0.80, 0.98, -nV.y);                                            // ground occlusion
    L *= 0.95;
    if (uAlbedoOnly > 0.5) L = alb;
    alpha = cov;
  } else {
    // contact shadow on the crest under the stone
    float ry = ridgeAt(css.x);
    float dx = (css.x - uStone.x) / (0.9 * uStone.z);
    float below = css.y - ry;
    if (below > -1.0 && abs(dx) < 1.4) { alpha = 0.30 * exp(-dx * dx * 2.0) * exp(-max(below, 0.0) / (0.06 * uStone.z)); L = 0.0; }
  }
  gl_FragColor = vec4(sqrt(max(L, 0.0)), 1.0, 0.0, alpha);
}
`;
