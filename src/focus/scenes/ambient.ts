// Ambient layer (ROUND3_DESIGN §3.6): bird groups (black strokes), rect helper. Pure and seeded.
import { mulberry32 } from './noise';

export interface BirdGroup { start: number; dur: number; n: number; y: number; seed: number }

/** Bird groups for a session: first within 35–75 s, then every 70–140 s. */
export function birdSchedule(seed: number, horizon = 3600): BirdGroup[] {
  const r = mulberry32(seed);
  const out: BirdGroup[] = [];
  let t = 35 + r() * 40;
  while (t < horizon) {
    out.push({ start: t, dur: 18 + r() * 8, n: 3 + Math.floor(r() * 3), y: 0.12 + r() * 0.18, seed: Math.floor(r() * 1e9) });
    t += 70 + r() * 70;
  }
  return out;
}

export interface Bird { x: number; y: number; wing: number }

/** Bird positions (screen px) for group g at time t, or [] when not flying. Right to left on a gentle arc. */
export function birdsAt(g: BirdGroup, t: number, w: number, h: number, S: number, yBand: [number, number] = [0.12, 0.30]): Bird[] {
  const u = (t - g.start) / g.dur;
  if (u < 0 || u > 1) return [];
  const r = mulberry32(g.seed);
  const yN = yBand[0] + ((g.y - 0.12) / 0.18) * (yBand[1] - yBand[0]);
  const out: Bird[] = [];
  for (let i = 0; i < g.n; i++) {
    const ph = r() * Math.PI * 2;
    const flap = 1.2 + r() * 0.8, glide = 1.5 + r() * 1.5;
    const cyc = (t - g.start + r() * 3) % (flap + glide);
    const wing = cyc < flap ? 28 * Math.sin(2 * Math.PI * 3.2 * (t - g.start) + ph) : 8;
    // loose V behind the leader
    const off = { x: (i % 2 === 0 ? 1 : 1) * Math.ceil(i / 2) * 0.025 * S, y: (i % 2 === 0 ? -1 : 1) * Math.ceil(i / 2) * 0.012 * S };
    const bob = 0.004 * S * Math.sin((2 * Math.PI * (t - g.start)) / [2.1, 2.6, 3.3][i % 3] + ph);
    const x = w * (1.05 - 1.15 * u) + off.x;
    const y = h * yN - Math.sin(Math.PI * u) * 0.04 * h + off.y + bob;
    out.push({ x, y, wing });
  }
  return out;
}

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export const rectsOverlap = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
