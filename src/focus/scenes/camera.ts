// Tracking camera (ROUND3_ART §2.2, §4.9): figure height, anchor, damped follow, the end clamp, summit framing. Pure.
import type { V } from './path';

export interface CamLayout { landscape: boolean; Hpx: number; anchor: V }

export function camLayout(w: number, h: number): CamLayout {
  const landscape = w / h >= 0.9;
  // 0.35 w (the §2.2 table); ultrawide caps the lead room with 0.5 w − 0.27 h (the table's 3440×1440 row).
  if (landscape) return { landscape, Hpx: 0.24 * h, anchor: { x: w / h > 2 ? 0.5 * w - 0.27 * h : 0.35 * w, y: 0.64 * h } };
  return { landscape, Hpx: Math.min(0.17 * h, 0.36 * w), anchor: { x: 0.27 * w, y: 0.66 * h } };
}

export interface Cam { pos: V; vel: V; zoom: number; anchor: V }

/** Critically damped follow toward target (ω rad/s). */
export function follow(c: Cam, target: V, dt: number, omega = 2.2) {
  for (const k of ['x', 'y'] as const) {
    const x = c.pos[k] - target[k];
    const a = -omega * omega * x - 2 * omega * c.vel[k];
    c.vel[k] += a * dt;
    c.pos[k] += c.vel[k] * dt;
  }
}

/** World → screen. */
export function toScreen(c: Cam, Hpx: number, v: V): V {
  return { x: c.anchor.x + (v.x - c.pos.x) * Hpx * c.zoom, y: c.anchor.y - (v.y - c.pos.y) * Hpx * c.zoom };
}

/** Largest camera x that keeps the trail at crestS − 0.3 H at or beyond the right edge (the end clamp). */
export function clampCamX(camX: number, crestPointX: number, w: number, anchorX: number, Hpx: number): number {
  return Math.min(camX, crestPointX - (w - anchorX) / Hpx);
}
