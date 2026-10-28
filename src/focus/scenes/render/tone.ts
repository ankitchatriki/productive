// The print (ROUND6_PLAN §3.6): scene luminance → print density through a filmic toe/shoulder, then a warm sepia
// split-tone measured from the reference (§1.2). Pure; the GL post pass mirrors printDensity() and samples toneLUT().

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Print black and white points (L ≈ 20 and ≈ 209 of 255 through the toning stops): no true black or white. */
export const PRINT_BLACK = 0.075, PRINT_WHITE = 0.855;

/** Scene luminance → print density P (before vignette, paper and grain). */
export function printDensity(Ls: number, exposure = 1): number {
  const e = Math.max(0, Ls * exposure);
  let t = (e / (e + 0.18)) * 1.18;
  t = smoothstep(0, 1, Math.pow(clamp(t, 0, 1), 1.10));
  return PRINT_BLACK + (PRINT_WHITE - PRINT_BLACK) * t;
}

/** Toning stops: print density → sRGB (§3.6, from the reference's L bands). Below the black point, a slightly deeper
 *  warm black for the burned corners. */
export const TONE_STOPS: Array<[number, [number, number, number]]> = [
  [0.000, [12, 11, 9]],
  [0.075, [22, 20, 16]],
  [0.140, [36, 32, 26]],
  [0.230, [60, 54, 45]],
  [0.350, [91, 84, 72]],
  [0.500, [127, 116, 103]],
  [0.620, [158, 145, 130]],
  [0.730, [186, 174, 161]],
  [0.820, [209, 201, 185]],
  [0.860, [219, 211, 196]],
  [1.000, [226, 219, 205]],
];
const toLin = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
const toSrgb = (x: number) => 255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

/** The toned colour of print density P; warmth w ∈ [−1, 1] scales the tint (R−B, G−B) by 1 + 0.35·w about the luma. */
export function toneAt(P: number, warmth = 0): [number, number, number] {
  const p = clamp(P, 0, 1);
  let i = 0;
  while (i < TONE_STOPS.length - 2 && TONE_STOPS[i + 1][0] < p) i++;
  const [p0, c0] = TONE_STOPS[i], [p1, c1] = TONE_STOPS[i + 1];
  const k = clamp((p - p0) / (p1 - p0), 0, 1);
  const rgb = [0, 1, 2].map((j) => toSrgb(toLin(c0[j]) + (toLin(c1[j]) - toLin(c0[j])) * k));
  const Y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const s = 1 + 0.35 * clamp(warmth, -1, 1);
  return rgb.map((c) => clamp(Math.round(Y + (c - Y) * s), 0, 255)) as [number, number, number];
}

/** 256×1 RGBA toning LUT for the post pass. */
export function toneLUT(warmth = 0): Uint8Array {
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) { const [r, g, b] = toneAt(i / 255, warmth); out.set([r, g, b, 255], i * 4); }
  return out;
}

/** Rec.709 luma of an sRGB triple (the plan's L). */
export const luma = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** The grade a phase and progress ask for (§6.4); the engine eases toward it (≤ 1% per 10 s while climbing). */
export interface Grade { exposure: number; warmth: number; glow: number; burn: number }
export function gradeFor(phase: string, p: number, summitK = 0, overtime = 0): Grade {
  if (phase === 'break') return { exposure: 0.80, warmth: -0.30 + 0.30 * smoothstep(0.85, 1, p), glow: 0.04, burn: 0.16 };
  if (phase === 'complete') {
    const base = { exposure: 1.05 + 0.03 * summitK, warmth: 0.25 + 0.15 * summitK, glow: 0.13 + 0.03 * summitK, burn: 0.07 - 0.02 * summitK };
    const d = clamp(overtime, 0, 1); // overtime dusk
    return { exposure: base.exposure + (0.88 - base.exposure) * d, warmth: base.warmth + (0.15 - base.warmth) * d, glow: base.glow + (0.06 - base.glow) * d, burn: base.burn + (0.14 - base.burn) * d };
  }
  // focus / open / paused: start → mid → late
  const k1 = smoothstep(0, 0.5, p), k2 = smoothstep(0.5, 0.9, p);
  return {
    exposure: 1.00 + 0.02 * k1 + 0.03 * k2,
    warmth: -0.20 + 0.20 * k1 + 0.25 * k2,
    glow: 0.08 + 0.02 * k1 + 0.03 * k2,
    burn: 0.10 - 0.03 * k2,
  };
}
