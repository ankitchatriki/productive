import { describe, expect, it } from 'vitest';
import { RIDGES, buildRidgePath, summitLayout } from './ridge';
import { FIGURE_H, layoutFor } from './path';
import { BODY, boulderCentre, solveSit, solveStand } from './rig';
import { headOutline, limbOutline, torsoOutline } from './figure';

const viewports: Array<[number, number]> = [[1280, 800], [1440, 900], [1920, 1080], [390, 844]];

describe('summit ledge (review T1, T3)', () => {
  for (const [w, h] of viewports) {
    const l = layoutFor(w, h);
    const path = buildRidgePath(RIDGES[l.layout]);
    const H = FIGURE_H[l.layout], R = BODY.boulderR * H;
    const { pelvisX, sStone } = summitLayout(path, l.layout, H, R);
    const bc = boulderCentre(path, sStone, R);
    const toS = (v: { x: number; y: number }) => ({ x: l.ox + v.x * l.S, y: h - l.oy - v.y * l.S });
    it(`${w}×${h}: the resting stone sits on the ledge (bottom within 1 px of the ground)`, () => {
      let minD = Infinity;
      for (let i = 0; i <= 400; i++) { const g = path.at(1 + (i / 400) * (path.plateauEndS - 1)); minD = Math.min(minD, Math.hypot(g.x - bc.x, g.y - bc.y)); }
      expect(Math.abs(minD - R) * l.S).toBeLessThan(1);
      expect(bc.x + R).toBeLessThanOrEqual(path.spec.plateauEnd.x + 1e-6); // and fits on the ledge
    });
    it(`${w}×${h}: standing and sitting, the figure's body never overlaps the stone, feet on the ledge`, () => {
      const st = solveStand(path, H, pelvisX, bc, { sway: 0, breath: 1.03, handDeg: 150 });
      const Hp = H * l.S;
      const c = toS(bc), Rp = R * l.S;
      const body = [
        torsoOutline(toS(st.pelvis), toS(st.shoulder), Hp, { x: 0.96, y: 0.29 }, 1.03),
        headOutline(toS(st.head), Hp, 0, 1),
        ...st.legs.map((g) => limbOutline(toS(g.root), toS(g.joint), toS(g.end), Hp, 'leg', { x: 1, y: 0 })),
      ];
      for (const poly of body) for (const p of poly) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThan(Rp - 0.5);
      for (const g of st.legs) expect(g.end.x).toBeGreaterThanOrEqual(path.spec.p3.x + 0.02);
      // the near hand rests on the stone
      expect(Math.abs(Math.hypot(st.arms[0].end.x - bc.x, st.arms[0].end.y - bc.y) - R) * l.S).toBeLessThan(2.5);
      const sit = solveSit(path, H, bc, 1);
      expect(sit.pelvis.x).toBeGreaterThan(path.spec.p3.x);
    });
  }
});
