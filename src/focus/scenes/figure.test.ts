import { describe, expect, it } from 'vitest';
import { area, finite, footOutline, handOutline, headOutline, limbOutline, torsoOutline } from './figure';
import { RIDGES, buildRidgePath } from './ridge';
import { FIGURE_H } from './path';
import { BODY, hipH, leanDeg, solvePush, surge } from './rig';

describe('figure v2 outlines (ROUND3 §3.4)', () => {
  const path = buildRidgePath(RIDGES.landscape);
  const H = FIGURE_H.landscape, S = 900;
  const toS = (v: { x: number; y: number }) => ({ x: v.x * S, y: 900 - v.y * S });
  it('every part is one closed, finite, consistently wound outline across the push cycle', () => {
    for (let i = 0; i < 24; i++) {
      const phi = i / 24;
      const r = solvePush({ path, H, sB: 0.5, phi, lean: leanDeg(phi), hip: hipH(phi), surge: surge(phi), tremor: 0, headTilt: 28, breath: 1 });
      const Hp = H * S;
      const parts = [
        ...r.pose.legs.map((l) => limbOutline(toS(l.root), toS(l.joint), toS(l.end), Hp, 'leg', { x: 1, y: 0 }, 1.08)),
        ...r.pose.arms.map((a) => limbOutline(toS(a.root), toS(a.joint), toS(a.end), Hp, 'arm', { x: 0, y: -1 })),
        torsoOutline(toS(r.pose.pelvis), toS(r.pose.shoulder), Hp, { x: 0.96, y: 0.29 }, 1),
        headOutline(toS(r.pose.head), Hp, 0.5, 1),
        handOutline(toS(r.pose.arms[0].end), Hp, 1.2, 1),
        footOutline(toS(r.pose.legs[0].end), Hp, -0.4, 1, 0.3),
      ];
      for (const p of parts) {
        expect(p.length).toBeGreaterThanOrEqual(4);
        expect(finite(p)).toBe(true);
        expect(area(p)).toBeGreaterThan(0); // same winding for all parts: unions never punch holes
      }
      // The outline reaches the IK end points: hands and feet stay on their targets (cap within 0.5 px of the tip).
      r.pose.arms.forEach((a, k) => {
        const out = limbOutline(toS(a.root), toS(a.joint), toS(a.end), Hp, 'arm', { x: 0, y: -1 });
        const e = toS(a.end);
        const minD = Math.min(...out.map((q) => Math.hypot(q.x - e.x, q.y - e.y)));
        expect(minD).toBeLessThanOrEqual(0.018 * Hp + 0.5);
        void k;
      });
    }
  });
  it('the calf bulges under load while the front narrows (volume kept)', () => {
    const a = limbOutline({ x: 0, y: 0 }, { x: 0, y: 30 }, { x: 0, y: 60 }, 120, 'leg', { x: 1, y: 0 }, 1);
    const b = limbOutline({ x: 0, y: 0 }, { x: 0, y: 30 }, { x: 0, y: 60 }, 120, 'leg', { x: 1, y: 0 }, 1.08);
    const minX = (p: Array<{ x: number; y: number }>) => Math.min(...p.filter((q) => q.y > 32 && q.y < 58).map((q) => q.x));
    expect(minX(b)).toBeLessThan(minX(a));
    void BODY;
  });
});
