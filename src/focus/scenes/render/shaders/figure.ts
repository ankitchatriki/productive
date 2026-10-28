// The figure (ROUND6_PLAN §4.3): round cones ray-cast in 2.5D, smooth-unioned on height, lit by the one soft key
// from the upper left with a sky fill, the far side darker. No rim, no outline anywhere.
import { HEADER, NOISE } from './common';

export const MAX_PRIMS = 32;

export const FIGURE_FS = HEADER + NOISE + `
uniform vec2 uRes; uniform float uDpr, uH; uniform vec4 uCam; uniform vec2 uAnchor;
uniform vec4 uA[${MAX_PRIMS}], uB[${MAX_PRIMS}], uC[${MAX_PRIMS}];
uniform int uN;
uniform vec4 uFeet; uniform vec2 uPeel;
uniform sampler2D uRidge; uniform float uRidgeN;
varying vec2 vUv;
const vec3 LKEY = vec3(-0.55, 0.45, 0.70);
float ridgeAt(float col) {
  float c = clamp(col, 0.0, uRidgeN - 1.0); float i = floor(c), f = c - i;
  vec4 a = texture2D(uRidge, vec2((i + 0.5) / uRidgeN, 0.5)), b = texture2D(uRidge, vec2((min(i + 1.0, uRidgeN - 1.0) + 0.5) / uRidgeN, 0.5));
  return mix((a.r * 65280.0 + a.g * 255.0) / 8.0 - uH, (b.r * 65280.0 + b.g * 255.0) / 8.0 - uH, f);
}
void main() {
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 p = vec2(uCam.x + (css.x - uAnchor.x) / uCam.z, uCam.y - (css.y - uAnchor.y) / uCam.z);
  float aa = 1.5 / (uDpr * uCam.z);                        // a soft ≈ 1.5 px edge: motion softness, in H
  float zBest = -1e3, cov = 0.0, alb = 0.36, side = 0.0;
  vec3 nAcc = vec3(0.0); float wAcc = 0.0;
  for (int i = 0; i < ${MAX_PRIMS}; i++) {
    if (i >= uN) break;
    vec4 A = uA[i], B = uB[i], C = uC[i];
    vec2 ab = B.xy - A.xy; float l2 = max(dot(ab, ab), 1e-9);
    float u = clamp(dot(p - A.xy, ab) / l2, 0.0, 1.0);
    vec2 c = A.xy + ab * u;
    float r = mix(A.w, B.w, u);
    float d = length(p - c);
    cov = max(cov, smoothstep(r + aa, r - aa, d));
    if (d < r + aa) {
      float dd = min(d, r * 0.999);
      float h = sqrt(r * r - dd * dd) * C.w;
      float z = mix(A.z, B.z, u) + h;
      vec3 n = normalize(vec3((p - c) / max(r, 1e-5), h / max(r, 1e-5) / max(C.w, 0.3)));
      // smooth union on height: organic joins
      float k = 0.05;
      float hh = clamp(0.5 + 0.5 * (z - zBest) / k, 0.0, 1.0);
      float wNew = hh;
      zBest = mix(zBest, z, hh) + k * hh * (1.0 - hh);
      nAcc = mix(nAcc, n, wNew); wAcc = 1.0;
      alb = mix(alb, C.x, wNew); side = mix(side, C.z, wNew);
    }
  }
  float L = 0.0, alpha = 0.0;
  if (cov > 0.0) {
    vec3 n = normalize(nAcc + vec3(0.0, 0.0, 1e-4));
    vec3 lk = normalize(LKEY);
    float wrap = clamp((dot(n, lk) + 0.25) / 1.25, 0.0, 1.0);
    float sky = 0.5 + 0.5 * n.y;
    float far = side < -0.5 ? 0.72 : 1.0;
    L = alb * far * (0.75 * pow(wrap, 1.2) + 0.16 * sky + 0.10);   // soft modelling: the form reads, the joints do not
    alpha = cov;
  } else {
    // soft contact shadows under the planted feet, on the rock
    float ry = ridgeAt(css.x);
    if (css.y > ry - 1.0) {
      float sh = 0.0;
      for (int k = 0; k < 2; k++) {
        vec2 fp = k == 0 ? uFeet.xy : uFeet.zw;
        float lift = clamp(1.0 - (k == 0 ? uPeel.x : uPeel.y) / 30.0, 0.0, 1.0);
        vec2 q = (p - fp - vec2(-0.03, 0.0)) / vec2(0.07, 0.014);
        sh = max(sh, lift * exp(-dot(q, q)));
      }
      L = 0.0; alpha = 0.18 * sh;
    }
  }
  gl_FragColor = vec4(sqrt(max(L, 0.0)), 1.0, 0.0, alpha);
}
`;
