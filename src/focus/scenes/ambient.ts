// Ambient layer (ROUND6_PLAN §6.3): a few distant birds gliding across the overcast. Pure and seeded.
import { mulberry32 } from './noise';

export interface BirdGroup { start: number; dur: number; n: number; y: number; seed: number }

/** Bird groups for a session: 1–3 birds (weights 0.45 / 0.35 / 0.20), a group every 35–80 s (REVIEW_ROUND6 A5: seen more often), crossing in 25–45 s. */
export function birdSchedule(seed: number, horizon = 3600): BirdGroup[] {
  const r = mulberry32(seed);
  const out: BirdGroup[] = [];
  let t = 30 + r() * 60;
  while (t < horizon) {
    const u = r();
    out.push({ start: t, dur: 25 + r() * 20, n: u < 0.45 ? 1 : u < 0.80 ? 2 : 3, y: 0.12 + r() * 0.18, seed: Math.floor(r() * 1e9) });
    t += 35 + r() * 45;
  }
  return out;
}

/** A bird: screen position (CSS px) and wing angle (deg; > 0 raised). */
export interface Bird { x: number; y: number; wing: number }

/**
 * Bird positions for group g at time t, or [] when not flying: right to left on gentle arcs, gliding with a slight
 * dihedral; every 6–12 s, 2–3 slow flaps (0.45 s each, eased).
 */
export function birdsAt(g: BirdGroup, t: number, w: number, h: number, S: number, yBand: [number, number] = [0.12, 0.30]): Bird[] {
  const u = (t - g.start) / g.dur;
  if (u < 0 || u > 1) return [];
  const r = mulberry32(g.seed);
  const yN = yBand[0] + ((g.y - 0.12) / 0.18) * (yBand[1] - yBand[0]);
  const out: Bird[] = [];
  const el = t - g.start;
  for (let i = 0; i < g.n; i++) {
    const period = 6 + r() * 6, ph = r() * period, flaps = 2 + Math.floor(r() * 2);
    const c = (el + ph) % period;
    const fl = c < flaps * 0.45 ? Math.sin((Math.PI * 2 * c) / 0.45) * Math.sin((Math.PI * c) / (flaps * 0.45)) : 0;
    const wing = 6 + 22 * fl;
    const off = { x: Math.ceil(i / 2) * 0.06 * S * (0.8 + 0.4 * r()), y: (i % 2 === 0 ? -1 : 1) * Math.ceil(i / 2) * 0.03 * S };
    const x = w * (1.05 - 1.15 * u) + off.x;
    const y = h * yN - Math.sin(Math.PI * u) * 0.04 * h + off.y + 0.01 * h * Math.sin(el / 7 + i);
    out.push({ x, y, wing });
  }
  return out;
}

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export const rectsOverlap = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
