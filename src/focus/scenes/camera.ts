// Tracking camera (ROUND3_ART §2.2, §4.9): figure height, anchor, damped follow, the end clamp, summit framing. Pure.
import type { V } from './path';

export interface CamLayout { landscape: boolean; Hpx: number; anchor: V }

export function camLayout(w: number, h: number): CamLayout {
  const landscape = w / h >= 0.9;
  // ROUND6 §4.5: the figure small against a large sky. Landscape 0.17 h with the pelvis ground point at (0.46 w,
  // 0.54 h), so the stone's centre lands near (0.57 w, 0.33 h) (REVIEW_ROUND6 A2: the subject on the third) (ultrawide caps x at 0.5 w − 0.20 h; a phone held sideways 0.20 h at (0.36 w, 0.62 h)); portrait
  // min(0.135 h, 0.30 w) at (0.27 w, 0.63 h) (review K3: 0.13 → 0.135 so the ground scrolls ≥ 15 px/s on a phone).
  if (landscape && h < 500) return { landscape, Hpx: 0.20 * h, anchor: { x: 0.36 * w, y: 0.62 * h } };
  if (landscape) return { landscape, Hpx: 0.17 * h, anchor: { x: w / h > 2 ? 0.5 * w - 0.20 * h : 0.46 * w, y: 0.54 * h } };
  return { landscape, Hpx: Math.min(0.135 * h, 0.30 * w), anchor: { x: 0.27 * w, y: 0.63 * h } };
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
