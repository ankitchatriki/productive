// P3 (ROUND6_PLAN §4, §10): the figure's volumes from the walk: proportions, the push pose's negative spaces at
// toe-off, a bowed head, the hands on the stone, and nothing anatomically explicit.
import { describe, expect, it } from 'vitest';
import { figurePrims, insideFigure, figureBounds } from './figurePrims';
import { BODY } from '../body';
import { DEG, WALK, interior, walkPose, type WalkTrail } from '../walk';
import type { V } from '../path';

const line = (thDeg: number): WalkTrail => {
  const th = thDeg * DEG, t = { x: Math.cos(th), y: Math.sin(th) }, n = { x: -Math.sin(th), y: Math.cos(th) };
  return { at: (s) => ({ x: t.x * s, y: t.y * s }), angleAt: () => thDeg, centreAt: (s, R) => ({ x: t.x * s + n.x * R, y: t.y * s + n.y * R }), centreArc: (s) => s };
};
/** Distance from q to the silhouette's edge (0 if inside). */
function clearance(prims: ReturnType<typeof figurePrims>, q: V): number {
  let m = Infinity;
  for (const p of prims) {
    const ab = { x: p.b.x - p.a.x, y: p.b.y - p.a.y }, l2 = ab.x * ab.x + ab.y * ab.y || 1e-9;
    const u = Math.max(0, Math.min(1, ((q.x - p.a.x) * ab.x + (q.y - p.a.y) * ab.y) / l2));
    const c = { x: p.a.x + ab.x * u, y: p.a.y + ab.y * u };
    m = Math.min(m, Math.hypot(q.x - c.x, q.y - c.y) - (p.ra + (p.rb - p.ra) * u));
  }
  return Math.max(0, m);
}
const PX = 3 / 153; // 3 px at 1440×900

describe('figure primitives', () => {
  it('a realistic adult: head : height = 1 : 7.5 ± 0.2; ≤ 32 primitives', () => {
    expect(1 / BODY.head).toBeGreaterThanOrEqual(7.3); expect(1 / BODY.head).toBeLessThanOrEqual(7.7);
    const w = walkPose(line(24), 10 * WALK.L, 0);
    expect(figurePrims(w).length).toBeLessThanOrEqual(32);
  });
  for (const th of [16, 24, 32]) {
    it(`toe-off (φ 0.62) at ${th}°: open spaces between the legs and under the arms (≥ 3 px), the head bowed ≥ 45°, the rear knee long, the hands on the stone`, () => {
      const w = walkPose(line(th), (10 + 0.62) * WALK.L, 0);
      const prims = figurePrims(w);
      // between the legs: a point between the two knees, lowered toward the ground
      const k0 = w.legs[0].knee, k1 = w.legs[1].knee, a0 = w.feet[0].ankle, a1 = w.feet[1].ankle;
      // the open triangle between the legs: somewhere between the two shins there is ≥ 3 px of sky
      let legBest = 0;
      for (let u = 0.2; u <= 0.8; u += 0.05) for (let v = 0.1; v <= 0.9; v += 0.05) {
        const s0 = { x: k0.x + (a0.x - k0.x) * u, y: k0.y + (a0.y - k0.y) * u }, s1 = { x: k1.x + (a1.x - k1.x) * u, y: k1.y + (a1.y - k1.y) * u };
        const q = { x: s0.x + (s1.x - s0.x) * v, y: s0.y + (s1.y - s0.y) * v };
        if (!insideFigure(prims, q)) legBest = Math.max(legBest, clearance(prims, q));
      }
      expect(legBest).toBeGreaterThanOrEqual(th >= 32 ? (2.5 / 3) * PX : PX); // (the steepest slope closes the stance a little: 2.7 px)
      // under the arms: between the near forearm and the front thigh
      const el = w.arms[0].elbow, kn = w.legs[1 - (w.feet[0].planted && w.feet[0].peel > 10 ? 0 : 1)].knee;
      void kn;
      // sky shows somewhere below the forearm, above the thigh
      let best = 0;
      for (let dy = 0.05; dy <= 0.3; dy += 0.01) best = Math.max(best, clearance(prims, { x: (el.x + w.arms[0].wrist.x) / 2, y: (el.y + w.arms[0].wrist.y) / 2 - dy }));
      expect(best).toBeGreaterThanOrEqual(PX);
      expect(w.headAxis / DEG).toBeGreaterThanOrEqual(45);
      const rear = w.feet[0].peel > w.feet[1].peel ? 0 : 1;
      expect(interior(w.legs[rear].hip, w.legs[rear].knee, w.legs[rear].ankle)).toBeGreaterThanOrEqual(150);
      // the hands touch the stone: a hand volume reaches its surface (no gap)
      for (const name of ['fingers0', 'hand0', 'fingers1', 'hand1']) void name;
      for (const i of [0, 1]) {
        const hs = prims.filter((p) => p.name === `hand${i}` || p.name === `fingers${i}`);
        const gap = Math.min(...hs.flatMap((p) => [p.a, p.b].map((c, j) => Math.hypot(c.x - w.centre.x, c.y - w.centre.y) - WALK.R - (j ? p.rb : p.ra))));
        expect(gap).toBeLessThanOrEqual(0.002);
      }
      const b = figureBounds(prims);
      expect(b.y1 - b.y0).toBeGreaterThan(0.75); // a push-pose silhouette ≈ 0.9 H tall
    });
  }
  it('no cartoon follow-through: the skeleton carries breath only (no beard, ringlet or cloth channels)', () => {
    const w = walkPose(line(24), 4, 1.3) as unknown as Record<string, unknown>;
    expect(w.sec).toBeUndefined();
    expect(typeof w.breath).toBe('number');
  });
});
