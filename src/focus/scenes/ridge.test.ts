import { describe, expect, it } from 'vitest';
import { RANGE_LAYERS, RIDGES, backSide, benchProgressMap, buildRidgePath, monotoneCubic, rangeSkyline, snowEdge } from './ridge';
import { FIGURE_H, layoutFor, startS, summitS } from './path';
import { BODY } from './rig';

const HORIZON_Y = 0.3;

describe('ridge path (ROUND3_DESIGN §3.3.3)', () => {
  for (const layout of ['landscape', 'portrait'] as const) {
    const path = buildRidgePath(RIDGES[layout]);
    const H = FIGURE_H[layout], R = BODY.boulderR * H, L = path.length;
    it(`${layout}: heading bounds, x strictly increasing, anchors`, () => {
      const max = layout === 'landscape' ? 45 : 50;
      for (const h of path.headings) { expect(h).toBeGreaterThanOrEqual(2); expect(h).toBeLessThanOrEqual(max); }
      let px = -Infinity;
      for (let i = 0; i <= 400; i++) { const x = path.at(i / 400).x; expect(x).toBeGreaterThan(px); px = x; }
      expect(path.at(0).x).toBeCloseTo(RIDGES[layout].p0.x, 3);
      expect(path.at(1).x).toBeCloseTo(RIDGES[layout].summit.x, 2);
      expect(path.at(1).y).toBeCloseTo(RIDGES[layout].summit.y, 2);
    });
    it(`${layout}: three benches, gentle, in order, between start and summit`, () => {
      expect(path.benches).toHaveLength(3);
      const s0 = startS(H, R, L), s1 = summitS(R, L);
      let prev = s0;
      for (const b of path.benches) {
        expect(b.sMid).toBeGreaterThan(prev);
        const a = path.angleAt(b.sMid);
        expect(a).toBeLessThan(layout === 'landscape' ? 14 : 16);
        prev = b.sMid;
      }
      expect(prev).toBeLessThan(s1);
    });
    it(`${layout}: deterministic (same seed ⇒ identical LUT)`, () => {
      const again = buildRidgePath(RIDGES[layout]);
      for (let i = 0; i <= 50; i++) expect(again.at(i / 50)).toEqual(path.at(i / 50));
      const other = buildRidgePath(RIDGES[layout], 99);
      expect(other.at(0.5)).not.toEqual(path.at(0.5));
    });
    it(`${layout}: progress lands on bench centres at ¼ ½ ¾ (within 0.5 px) and is monotone`, () => {
      const map = benchProgressMap(path, startS(H, R, L), summitS(R, L));
      const S = layoutFor(layout === 'landscape' ? 1440 : 390, layout === 'landscape' ? 900 : 844).S;
      path.benches.forEach((b, k) => expect(Math.abs(map((k + 1) / 4) - b.sMid) * L * S).toBeLessThan(0.5));
      let prev = -1;
      for (let i = 0; i <= 200; i++) { const s = map(i / 200); expect(s).toBeGreaterThanOrEqual(prev); prev = s; }
    });
    it(`${layout}: the stone never penetrates the ground`, () => {
      for (let i = 0; i <= 300; i++) {
        const s = -0.05 + (i / 300) * (path.plateauEndS - 0.05);
        const c = path.centreAt(s, R);
        let minD = Infinity;
        for (let j = 0; j <= 600; j++) { const g = path.at(-0.1 + (j / 600) * (path.plateauEndS + 0.15)); minD = Math.min(minD, Math.hypot(g.x - c.x, g.y - c.y)); }
        expect(minD).toBeGreaterThanOrEqual(0.99 * R);
      }
    });
  }
  it('monotoneCubic interpolates knots and never overshoots', () => {
    const f = monotoneCubic([0, 1, 2, 3], [0, 0.1, 0.9, 1]);
    expect(f(1)).toBeCloseTo(0.1); expect(f(2)).toBeCloseTo(0.9);
    let prev = -1; for (let i = 0; i <= 300; i++) { const v = f(i / 100); expect(v).toBeGreaterThanOrEqual(prev - 1e-12); expect(v).toBeLessThanOrEqual(1); prev = v; }
  });
});

describe('neighbouring range (§3.3.4)', () => {
  const viewports: Array<[number, number]> = [[1440, 900], [1280, 800], [390, 844], [3440, 1440]];
  for (const [w, hgt] of viewports) {
    it(`${w}×${hgt}: the true summit is the highest skyline point`, () => {
      const l = layoutFor(w, hgt);
      const path = buildRidgePath(RIDGES[l.layout]);
      const summit = path.spec.plateauEnd;
      const frame = { horizonY: HORIZON_Y, summit, baseY: path.spec.p0.y };
      const x0 = -l.ox / l.S, x1 = (w - l.ox) / l.S;
      for (const layer of RANGE_LAYERS) for (let i = 0; i <= 400; i++) {
        const x = x0 + ((x1 - x0) * i) / 400;
        expect(rangeSkyline(layer, x, frame).y).toBeLessThanOrEqual(summit.y - 0.02 + 1e-9);
      }
      for (const p of backSide(l.layout, summit, path.spec.p0.y, x1)) expect(p.y).toBeLessThanOrEqual(summit.y + 1e-9);
    });
  }
  it('deterministic and seamless across world cells', () => {
    const f = { horizonY: 0.3, summit: { x: 1.4, y: 0.75 }, baseY: 0.12 };
    expect(rangeSkyline(RANGE_LAYERS[0], 2.37, f)).toEqual(rangeSkyline(RANGE_LAYERS[0], 2.37, f));
    for (const x of [1, 2, 3]) expect(Math.abs(rangeSkyline(RANGE_LAYERS[1], x - 1e-6, f).y - rangeSkyline(RANGE_LAYERS[1], x + 1e-6, f).y)).toBeLessThan(1e-3);
  });
  it('snow edge stays near the snowline', () => {
    for (let i = 0; i < 100; i++) { const e = snowEdge(i / 10, 0.62); expect(e).toBeGreaterThan(0.55); expect(e).toBeLessThan(0.66); }
  });
});
