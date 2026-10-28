// A distant bird (ROUND6_PLAN §6.3): a soft dark silhouette, two bent wings and a small body, hazed off black.
import { HEADER } from './common';

export const BIRD_FS = HEADER + `
uniform vec2 uRes; uniform float uDpr;
uniform vec4 uBird;  // x, y (CSS), span (CSS px, half), flap (rad)
uniform float uBank;
varying vec2 vUv;
float seg(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float u = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - a - ab * u); }
void main() {
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 q = (css - uBird.xy) / uBird.z;
  float c = cos(uBank), s = sin(uBank); q = mat2(c, -s, s, c) * q;
  float lift = sin(uBird.w) * 0.35;
  vec2 elbowL = vec2(-0.45, -0.10 - lift), tipL = vec2(-1.0, 0.05 - 1.6 * lift);
  vec2 elbowR = vec2(0.45, -0.10 - lift), tipR = vec2(1.0, 0.05 - 1.6 * lift);
  float d = min(min(seg(q, vec2(0.0), elbowL), seg(q, elbowL, tipL)), min(seg(q, vec2(0.0), elbowR), seg(q, elbowR, tipR)));
  float t = length(q) < 0.45 ? 0.07 : 0.035;
  float body = length((q - vec2(0.0, 0.02)) / vec2(0.22, 0.09));
  float px = 1.0 / uBird.z;
  float a = max(smoothstep(t + px, t - px, d), smoothstep(1.0 + px * 6.0, 1.0 - px * 6.0, body));
  gl_FragColor = vec4(sqrt(0.11), 0.0, 0.0, a * 0.85);
}
`;
