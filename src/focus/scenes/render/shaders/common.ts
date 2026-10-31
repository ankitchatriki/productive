// Shared GLSL ES 1.00 (ROUND6_PLAN §3.3): precision, hashing, value noise, fBm, ridged noise, 3D cellular noise.
export const HEADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

export const NOISE = `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z);
}
const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);
float fbm(vec2 p, int oct) { float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise(p); n += a; p = ROT * p * 2.03 + 17.1; a *= 0.5; } return s / n; }
float fbm3(vec3 p, int oct) { float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise3(p); n += a; p = p * 2.02 + vec3(17.1, 3.7, 9.2); a *= 0.5; } return s / n; }
float ridged(vec2 p, int oct) { float s = 0.0, a = 0.5, n = 0.0, w = 1.0; for (int i = 0; i < 6; i++) { if (i >= oct) break; float r = 1.0 - abs(vnoise(p) * 2.0 - 1.0); r *= r; s += a * r * w; n += a; w = clamp(r * 1.5, 0.0, 1.0); p = ROT * p * 2.07 + 5.3; a *= 0.5; } return s / n; }
`;

export const QUAD_VS = `
attribute vec2 aPos;
varying vec2 vUv;
uniform vec4 uRect; // x0, y0, x1, y1 in clip space
void main() { vec2 p = mix(uRect.xy, uRect.zw, aPos); vUv = aPos; gl_Position = vec4(p, 0.0, 1.0); }
`;
