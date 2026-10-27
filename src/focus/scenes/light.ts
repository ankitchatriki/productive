// Light model (ROUND3_DESIGN §3.2): progress drives the time of day. Pure.
import { hex, mixRGB, type RGB } from './palette';

export interface LightKey {
  key: RGB;        // light colour on lit surfaces
  ambient: RGB;    // shadow-side fill
  rim: number;     // rim-light strength 0..1
  rimW: number;    // rim width, CSS px
  shadowLen: number; // cast-shadow length, in object heights
  haze: number;    // aerial perspective 0..1
  warmth: number;  // −1 cool .. +1 warm (grade overlay)
}

const K = (p: number, key: string, ambient: string, rim: number, rimW: number, shadowLen: number, haze: number, warmth: number) =>
  ({ p, v: { key: hex(key), ambient: hex(ambient), rim, rimW, shadowLen, haze, warmth } as LightKey });

/** Keyframes on paletteP (focus: 0.86·p; the summit beat runs 0.86 → 1). */
export const LIGHT_STOPS: Array<{ p: number; v: LightKey }> = [
  K(0.00, '#ffb894', '#4a4060', 0.55, 2.0, 3.0, 0.60, 0.4),
  K(0.20, '#ffe2c4', '#5a5a72', 0.35, 1.5, 1.4, 0.45, 0.1),
  K(0.43, '#fff4e2', '#6a6458', 0.25, 1.5, 0.5, 0.35, 0.0),
  K(0.65, '#ffd9a8', '#5e5048', 0.45, 1.75, 1.2, 0.40, 0.3),
  K(0.86, '#ffa95a', '#4a3442', 0.85, 2.5, 3.2, 0.55, 0.8),
  K(0.93, '#ff8a4a', '#3a2a3e', 0.95, 2.75, 4.0, 0.65, 1.0),
  K(1.00, '#c08a9a', '#2a2234', 0.30, 1.5, 0.0, 0.70, -0.2),
];

const smooth = (k: number) => k * k * (3 - 2 * k);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function mixLight(a: LightKey, b: LightKey, k: number): LightKey {
  return {
    key: mixRGB(a.key, b.key, k), ambient: mixRGB(a.ambient, b.ambient, k),
    rim: lerp(a.rim, b.rim, k), rimW: lerp(a.rimW, b.rimW, k), shadowLen: lerp(a.shadowLen, b.shadowLen, k),
    haze: lerp(a.haze, b.haze, k), warmth: lerp(a.warmth, b.warmth, k),
  };
}

/** Light at a palette position, smoothstep between neighbouring keyframes (continuous in every channel). */
export function lightState(paletteP: number): LightKey {
  const q = Math.min(1, Math.max(0, paletteP));
  for (let i = 0; i < LIGHT_STOPS.length - 1; i++) {
    const a = LIGHT_STOPS[i], b = LIGHT_STOPS[i + 1];
    if (q <= b.p) return mixLight(a.v, b.v, smooth((q - a.p) / (b.p - a.p)));
  }
  return LIGHT_STOPS[LIGHT_STOPS.length - 1].v;
}

/** Night / break light: cool moonlight, no cast shadows. */
export const NIGHT_LIGHT: LightKey = { key: hex('#b8bcd8'), ambient: hex('#1c1a2a'), rim: 0.2, rimW: 1.25, shadowLen: 0, haze: 0.7, warmth: -0.5 };
