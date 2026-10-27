// The never-ending mountain (ROUND3_ART §5.1, §6): one seeded trail, built stage by stage. Pure.
// Units: H (figure standing height, = 1.8 m). y up. A stage's local origin is its start point.
import { noise1 } from '../focus/scenes/noise';

export const MOUNTAIN_SEED = 0x5157;
export const M_PER_H = 1.8;
/** Climb pace: H of trail per focused second, and metres per second. */
export const PACE_H = 0.1333;
export const PACE_M = PACE_H * M_PER_H; // ≈ 0.24 m/s

const DEG = Math.PI / 180;
export const SAMPLES_PER_H = 16;

/** Fixed summit profile beyond a climb's end (so the next stage's prefix matches it exactly). */
export const CREST = { before: 0.3, after: 0.6 };      // crest fillet from L − 0.3 to L + 0.6, heading → 2°
export const LEDGE_LEN = 2.6;
export const BACK_STEEP = 2.5;                           // −28° → −10°
export const COL_DESCENT = 3.5;                          // −10° → −4°
/** Distance (H) from the crest-fillet's nominal end point L to the next col bottom. */
export const TAIL_TO_COL = CREST.after + LEDGE_LEN + BACK_STEEP + COL_DESCENT;
/** The climber's end position sits END_LEAD before L, so the stone (≈1.1 H ahead) is fully on screen at the end
 *  while the crest-fillet start (L − 0.3) stays just beyond the right edge. */
export const END_LEAD = 2.45;
/** Distance (H) from where the climber stands at a block's end to the next climb's start (the col bottom). */
export const SUMMIT_TO_COL = END_LEAD + TAIL_TO_COL;
/** Prefix behind a stage that starts in a col: the last 1.5 H of the ledge + the descent. */
export const PREFIX_LEN = 1.5 + BACK_STEEP + COL_DESCENT;
/** Look-ahead beyond the summit: the next stage's first 6 H. */
export const BEYOND_LEN = 6;

export interface StageSpec {
  stage: number;
  /** Global trail position (H) of this stage's origin; only used to seed the incline's shape. */
  startH: number;
  lenH: number;
  fromSummit: boolean;
}

/** Incline heading at global trail position sG (deg): 22° ± 6°, gently varying, always ≥ 16° (no false tops). */
export function inclineHeading(sG: number): number {
  const v = 22 + 6 * (noise1(sG / 18 + 3.7) * 2 - 1) + 1.5 * (noise1(sG / 5.5 + 11.3) * 2 - 1);
  return Math.min(32, Math.max(16, v));
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Heading (deg) of the fixed summit/back-side profile at distance d past the crest-fillet end (L + 0.6). */
function tailHeading(d: number): number {
  if (d < 0) return 2;
  if (d < LEDGE_LEN) return 2 - 2 * (d / LEDGE_LEN);                      // ledge 2° → 0°
  const d2 = d - LEDGE_LEN;
  if (d2 < 0.5) return -28 * smooth(0, 0.5, d2);                          // over the lip
  if (d2 < BACK_STEEP) return -28 + 18 * smooth(0.5, BACK_STEEP, d2);     // −28° → −10°
  const d3 = d2 - BACK_STEEP;
  if (d3 < COL_DESCENT) return -10 + 6 * smooth(0, COL_DESCENT, d3);      // −10° → −4°
  return -4;
}

/** Heading (deg) along stage-local s. */
export function stageHeading(spec: StageSpec, s: number): number {
  const L = spec.lenH + END_LEAD;
  if (s < 0) {
    if (!spec.fromSummit) return inclineHeading(spec.startH);
    return tailHeading(s + PREFIX_LEN + (LEDGE_LEN - 1.5));               // prefix reproduces the tail's last part
  }
  const inc = inclineHeading(spec.startH + s);
  if (s <= L - CREST.before) {
    // concave fillet out of the col (from −4°) over the first 2 H
    return spec.fromSummit ? -4 + (inc + 4) * smooth(0, 2, s) : inc;
  }
  if (s <= L + CREST.after) {
    const k = smooth(L - CREST.before, L + CREST.after, s);
    return inc + (2 - inc) * k;                                          // convex crest fillet → 2°
  }
  const d = s - (L + CREST.after);
  if (d < TAIL_TO_COL - CREST.after) return tailHeading(d);
  // beyond the col: the next stage's incline (seeded by global position), with its own col fillet
  const s2 = s - (L + TAIL_TO_COL);
  const inc2 = inclineHeading(spec.startH + L + TAIL_TO_COL + s2);
  return -4 + (inc2 + 4) * smooth(0, 2, s2);
}

export interface StageGeom {
  spec: StageSpec;
  s0: number;              // first sample's s (negative: prefix / backward extension)
  s1: number;              // last sample's s
  xs: Float32Array;
  ys: Float32Array;
  /** Start of this climb's crest fillet (never on screen during a block). */
  crestS: number;
  ledgeStart: number;
  ledgeEnd: number;
  colS: number;            // next stage's origin (col bottom)
}

/** Integrate the heading into a polyline at 16 samples per H. */
export function buildStage(spec: StageSpec): StageGeom {
  const back = spec.fromSummit ? PREFIX_LEN : 4;
  const s0 = -back, s1 = spec.lenH + END_LEAD + TAIL_TO_COL + BEYOND_LEN;
  const n = Math.ceil((s1 - s0) * SAMPLES_PER_H) + 1;
  const xs = new Float32Array(n), ys = new Float32Array(n);
  const ds = 1 / SAMPLES_PER_H;
  const i0 = Math.round(-s0 * SAMPLES_PER_H);
  xs[i0] = 0; ys[i0] = 0;
  for (let i = i0 + 1; i < n; i++) {
    const s = s0 + (i - 0.5) * ds;
    const a = stageHeading(spec, s) * DEG;
    xs[i] = xs[i - 1] + Math.cos(a) * ds; ys[i] = ys[i - 1] + Math.sin(a) * ds;
  }
  for (let i = i0 - 1; i >= 0; i--) {
    const s = s0 + (i + 0.5) * ds;
    const a = stageHeading(spec, s) * DEG;
    xs[i] = xs[i + 1] - Math.cos(a) * ds; ys[i] = ys[i + 1] - Math.sin(a) * ds;
  }
  const L = spec.lenH + END_LEAD;
  return { spec, s0, s1: s0 + (n - 1) * ds, xs, ys, crestS: L - CREST.before, ledgeStart: L + CREST.after, ledgeEnd: L + CREST.after + LEDGE_LEN, colS: L + TAIL_TO_COL };
}

/** Point at stage-local s (linear between samples; clamped to the built range). */
export function stageAt(g: StageGeom, s: number): { x: number; y: number } {
  const f = Math.min(g.xs.length - 1.000001, Math.max(0, (s - g.s0) * SAMPLES_PER_H));
  const i = Math.floor(f), k = f - i;
  return { x: g.xs[i] + (g.xs[i + 1] - g.xs[i]) * k, y: g.ys[i] + (g.ys[i + 1] - g.ys[i]) * k };
}

/** Altitude gained (H) from the stage origin to s. */
export function stageRise(g: StageGeom, s: number): number { return stageAt(g, s).y; }

/** Drop (H, positive) from the summit ledge's far end down to the next col: constant for every stage. */
export function colDrop(): number {
  let y = 0;
  const ds = 1 / SAMPLES_PER_H;
  for (let d = LEDGE_LEN; d < TAIL_TO_COL - CREST.after; d += ds) y += Math.sin(tailHeading(d + ds / 2) * DEG) * ds;
  return -y;
}
