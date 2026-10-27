// A4: the summit tableau, the break and the next climb's start (ROUND3_ART §5).
import { describe, expect, it } from 'vitest';
import { makeTrail } from './trail';
import { Gait } from './gait';
import { RIG, holdDForStone, interior, solveSit, stepToStand } from './rig';
import { camLayout } from './camera';
import { M_PER_H, PACE_M, PREFIX_LEN } from '../../domain/mountain';
import type { V } from './path';

const HPX = 216;
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);

for (const minutes of [25, 50]) {
  describe(`summit after a ${minutes}-minute climb`, () => {
    const lenH = (minutes * 60 * PACE_M) / M_PER_H;
    const trail = makeTrail({ stage: 4, startH: 210, lenH, fromSummit: true });
    const D = holdDForStone(trail, trail.geom.ledgeStart + 0.1);
    const g = new Gait(5);
    g.snap(D, trail);
    const fr = g.pose(trail);
    const groundGap = (c: V) => { let m = Infinity; for (let s = fr.sB - 1.5; s <= fr.sB + 1.5; s += 1 / 64) m = Math.min(m, dist(c, trail.at(s))); return m - RIG.boulderR; };

    it('the stone rests on the ledge: on the ground (gap ≤ 1 px), past the crest', () => {
      expect(Math.abs(fr.sB - (trail.geom.ledgeStart + 0.1))).toBeLessThan(0.02);
      expect(Math.abs(groundGap(fr.centre)) * HPX).toBeLessThanOrEqual(1);
      expect(trail.angleAt(fr.sB)).toBeLessThan(4);
    });

    it('stepping through to stand: feet planted or arcing above ground, only the resting palm on the stone', () => {
      for (let k = 0; k <= 1.0001; k += 0.05) {
        const p = stepToStand(trail, fr.pose, fr.centre, k);
        for (const f of p.feet!) for (const q of [f.ball, f.heel, f.toe]) expect((q.y - trail.groundY(q.x)) * HPX).toBeGreaterThanOrEqual(-1);
        for (const j of [p.pelvis, p.shoulder, p.head, ...p.legs.flatMap((l) => [l.joint, l.end]), ...p.arms.map((a) => a.joint), p.arms[1].end]) expect(dist(j, fr.centre)).toBeGreaterThan(RIG.boulderR + 0.02);
        expect(Math.abs(dist(p.hands![0], fr.centre) - RIG.boulderR - RIG.palm) * HPX).toBeLessThanOrEqual(2);
        for (const l of [...p.legs, ...p.arms]) { expect(interior(l)).toBeGreaterThanOrEqual(35); expect(interior(l)).toBeLessThanOrEqual(179.9); }
      }
      const stand = stepToStand(trail, fr.pose, fr.centre, 1);
      expect(Math.abs((Math.atan2(stand.hands![0].y - fr.centre.y, stand.hands![0].x - fr.centre.x) * 180) / Math.PI - 150)).toBeLessThan(1);
      expect(stand.lean).toBeLessThan(0.1); // upright
    });

    it('break: seated against the stone on the ledge, facing downhill', () => {
      const p = solveSit(trail, 1, fr.centre, 1);
      expect(p.facing).toBe(-1);
      for (const f of p.feet!) expect(Math.abs(f.ball.y - trail.groundY(f.ball.x)) * HPX).toBeLessThanOrEqual(1);
      expect(dist(p.shoulder, fr.centre)).toBeGreaterThan(RIG.boulderR);
    });

    it('in the summit framing the figure is still ≥ 15% of the height', () => {
      for (const [w, h, z] of [[1440, 900, 0.62], [1920, 1080, 0.62], [390, 844, 0.72]]) expect(camLayout(w, h).Hpx * z / h).toBeGreaterThanOrEqual(0.115);
      expect(camLayout(1440, 900).Hpx * 0.62 / 900).toBeGreaterThanOrEqual(0.148);
    });
  });
}

describe('the next climb starts in the col', () => {
  it('the stone has room to roll forward from the last summit’s ledge, down into the col', () => {
    const trail = makeTrail({ stage: 5, startH: 300, lenH: 200, fromSummit: true });
    const sStart = -PREFIX_LEN + 0.75;
    expect(sStart).toBeGreaterThan(trail.geom.s0 + 1.3 * RIG.boulderR);
    expect(trail.at(sStart).y).toBeGreaterThan(trail.at(0).y + 1); // the ledge is well above the col
    // forward only: positions along the roll increase monotonically to the hold spot
    const g = new Gait(5); g.snap(0, trail);
    const s1 = g.pose(trail).sB;
    let prev = -Infinity;
    for (let k = 0; k <= 1; k += 0.05) { const s = sStart + (s1 - sStart) * k * k; expect(s).toBeGreaterThanOrEqual(prev); prev = s; }
  });
});
