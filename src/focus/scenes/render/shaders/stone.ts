// The stone (ROUND6_PLAN §5): a lunar sphere, cratered and mottled in material space, rolled by +rot (clockwise on
// screen) under a light that never moves. Texture lookups use the material point nM; the lighting uses the view
// normal nV, so the terminator and core shadow stay put while the craters travel over the top.
import { HEADER, NOISE } from './common';

const SURFACE = `
// one octave of craters: 3D cells, each holding a crater with probability prob. Returns (height, albedo delta).
vec2 craters(vec3 p, float prob, float depth) {
  vec3 i = floor(p), f = fract(p);
  vec2 acc = vec2(0.0);
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 h = hash33(i + g + uSeed);
    if (h.z > prob) continue;
    vec3 c = g + 0.25 + 0.5 * h - f;
    float rc = 0.35 + 0.13 * fract(h.x * 7.3 + h.y * 3.1);
    float d = length(c) / rc;
    if (d < 1.0) { acc.x += -0.45 * depth * (1.0 - d * d); acc.y -= 0.05 * depth * (1.0 - d); }
    float ring = exp(-((d - 1.0) / 0.22) * ((d - 1.0) / 0.22));
    acc.x += 0.12 * depth * ring;
    acc.y += 0.04 * ring;                                   // lighter rims: craters read in tone, not only in relief
  }
  return acc;
}
vec2 surface(vec3 m) {   // (height in R units, albedo)
  // REVIEW_ROUND6 A4: lunar albedo first: 2–4 large dark maria, a mottled highland, few craters, little relief
  float alb = 0.37 + 0.10 * (fbm3(m * 2.2 + uSeed, 4) - 0.5) * 2.0 + 0.05 * (fbm3(m * 18.0, 2) - 0.5) * 2.0;
  // the pitted, speckled grain of the reference's surface: tone, not relief
  alb += 0.16 * (fbm3(m * 42.0 + 9.0, 2) - 0.5) - 0.12 * smoothstep(0.68, 0.86, vnoise3(m * 70.0 + 3.0)) + 0.14 * (fbm3(m * 12.0 + 4.0, 3) - 0.5) * 2.0;
  alb -= 0.14 * smoothstep(0.44, 0.62, fbm3(m * 0.9 + 7.0 + uSeed * 0.37, 3));
  vec2 b0 = craters(m * 1.6 + 5.0, 0.10, 0.2);                 // a few large shallow basins
  vec2 c1 = craters(m * 3.0, 0.12, 1.0), c2 = craters(m * 7.0 + 11.0, 0.14, 0.6);
  float hgt = 0.030 * b0.x + 0.022 * c1.x + 0.010 * c2.x + 0.012 * (fbm3(m * 7.0, 4) - 0.5);
  alb += b0.y * 1.5 + c1.y + c2.y * 0.8 + 0.22 * (fbm3(m * 5.0 + 3.0, 4) - 0.5) + 0.10 * (fbm3(m * 24.0 + 1.0, 3) - 0.5);
  return vec2(hgt, clamp(alb, 0.18, 0.62));
}

`;

export const STONE_FS = HEADER + NOISE + `
uniform vec2 uRes; uniform float uDpr, uH, uSeed, uQuality;
uniform vec3 uStone;        // centre x, y (CSS, y down), radius (CSS px)
uniform float uRot, uAlbedoOnly;
uniform sampler2D uSurf;     // the baked material-space surface
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
vec2 surf(vec3 m) {
  vec2 uv = vec2(atan(m.z, m.x) / 6.2831853 + 0.5, asin(clamp(m.y, -1.0, 1.0)) / 3.1415927 + 0.5);
  vec4 t = texture2D(uSurf, uv);
  return vec2((t.g - 0.5) * 0.08, t.r * 0.6);
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 pp = (css - uStone.xy) / uStone.z; pp.y = -pp.y;            // y-up, units of R
  float r2 = dot(pp, pp);
  // a ragged limb in material angle: its bumps travel with the roll
  float ang = atan(pp.y, pp.x) + uRot;
  float rim = 1.0 + 0.006 * (vnoise(vec2(ang * 6.366, 2.0 + uSeed)) * 2.0 - 1.0) + 0.004 * (vnoise(vec2(ang * 19.1, 5.0)) * 2.0 - 1.0);
  float aa = 1.3 / (uDpr * uStone.z);                              // a soft 1.3 px limb
  float cov = smoothstep(rim + aa, rim - aa, sqrt(r2));
  float L = 0.0, alpha = 0.0;
  if (cov > 0.0) {
    vec2 q = pp / rim; float qq = min(dot(q, q), 0.9999);
    vec3 nV = vec3(q, sqrt(1.0 - qq));
    vec3 nM = toMat(nV);
    vec2 s0 = surf(nM);
    float alb = s0.y;
    // bump normal: the height's gradient on the view tangent plane
    float e = 0.012;
    vec3 tx = normalize(vec3(1.0, 0.0, -nV.x / nV.z)), ty = normalize(vec3(0.0, 1.0, -nV.y / nV.z));
    float hx = surf(toMat(normalize(nV + tx * e))).x, hy = surf(toMat(normalize(nV + ty * e))).x;
    vec3 nB = normalize(nV - ((hx - s0.x) / e) * tx * 2.0 - ((hy - s0.x) / e) * ty * 2.0);
    vec3 lk = normalize(LKEY);
    float wrap = clamp((dot(nB, lk) + 0.55) / 1.55, 0.0, 1.0);
    L = alb * (1.10 * pow(wrap, 2.3) + 0.05 * (0.5 + 0.5 * nB.y) + 0.010);
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

/** The material sphere as an equirectangular map: R = albedo / 0.6, G = height / 0.08 + 0.5. */
export const STONE_BAKE_FS = HEADER + NOISE + `
uniform vec2 uSize; uniform float uSeed, uQuality;
varying vec2 vUv;
` + SURFACE + `
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float lon = (uv.x - 0.5) * 6.2831853, lat = (uv.y - 0.5) * 3.1415927;
  vec3 m = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  vec2 s = surface(m);
  gl_FragColor = vec4(clamp(s.y / 0.6, 0.0, 1.0), clamp(s.x / 0.08 + 0.5, 0.0, 1.0), 0.0, 1.0);
}
`;
