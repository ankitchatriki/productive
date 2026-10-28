// The print pass (ROUND6_PLAN §3.6): soften, cross-fade, tone curve, burned vignette, paper, grain, sepia LUT.
import { HEADER, NOISE } from './common';

export const POST_FS = HEADER + NOISE + `
uniform sampler2D uScene, uSnap, uLut;
uniform vec2 uRes;          // device px
uniform float uDpr, uXfade, uExposure, uGrainT, uSoft, uPaperSeed;
varying vec2 vUv;
float dec(vec4 c) { return c.r * c.r; }       // the scene stores sqrt(luminance)
float sceneAt(vec2 uv) {
  vec2 px = uSoft / uRes;
  float c = texture2D(uScene, uv).r;
  float s = c * 0.5 + 0.125 * (texture2D(uScene, uv + vec2(px.x, 0.0)).r + texture2D(uScene, uv - vec2(px.x, 0.0)).r
                             + texture2D(uScene, uv + vec2(0.0, px.y)).r + texture2D(uScene, uv - vec2(0.0, px.y)).r);
  return s * s;
}
float grainAt(vec2 css, float k) { return vnoise(css / 1.6 + vec2(hash12(vec2(k, 3.1)), hash12(vec2(k, 7.7))) * 512.0); }
void main() {
  vec2 uv = vUv;
  float Ls = sceneAt(uv);
  if (uXfade > 0.0) { float s = texture2D(uSnap, uv).r; Ls = mix(Ls, s * s, uXfade); }
  // 1. tone curve
  float e = Ls * uExposure;
  float t = e / (e + 0.18) * 1.18;
  t = smoothstep(0.0, 1.0, pow(clamp(t, 0.0, 1.0), 1.10));
  float P = mix(0.075, 0.855, t);
  // 2. a hand-burned vignette: heavier top and left, the glow along the ridge left alone
  vec2 ud = vec2(uv.x, 1.0 - uv.y);
  float aspect = uRes.x / uRes.y;
  vec2 q = (ud - vec2(0.56, 0.52)) * vec2(aspect, 1.0);
  float vig = 1.0 - 0.34 * smoothstep(0.35, 1.05, length(q * vec2(0.95 / max(1.0, aspect * 0.62), 1.10)))
                  - 0.10 * smoothstep(0.55, 0.0, ud.y) - 0.06 * smoothstep(0.45, 0.0, ud.x);
  P *= vig;
  // 3. paper: low-frequency unevenness ±3% and sparse foxing specks (static: the print, not the scene)
  vec2 css = gl_FragCoord.xy / uDpr;
  float paper = fbm(ud * vec2(3.0, 3.0 / aspect) * 2.0 + uPaperSeed, 3);
  P *= 1.0 + 0.06 * (paper - 0.5);
  vec2 cell = floor(css / 9.0);
  float fx = hash12(cell + uPaperSeed);
  if (fx > 0.9965) { vec2 c = (cell + 0.5 + (vec2(hash12(cell + 1.3), hash12(cell + 2.9)) - 0.5) * 6.0 / 9.0) * 9.0; float d = length(css - c); P += (hash12(cell + 5.1) > 0.5 ? 0.035 : -0.03) * smoothstep(1.6, 0.4, d); }
  // 4. grain: a static print grain whose offset changes every 0.5 s, blended (no video flicker); strongest in the mids
  float k = floor(uGrainT / 0.5), f = fract(uGrainT / 0.5);
  float g = mix(grainAt(css, k), grainAt(css, k + 1.0), smoothstep(0.0, 1.0, f)) - 0.5;
  float amp = 0.075 * (4.0 * P * (1.0 - P)) + 0.008;
  P += g * amp;
  // 5. toning
  gl_FragColor = vec4(texture2D(uLut, vec2(clamp(P, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0, 0.5)).rgb, 1.0);
}
`;

export const COPY_FS = HEADER + `
uniform sampler2D uTex;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTex, vUv); }
`;
