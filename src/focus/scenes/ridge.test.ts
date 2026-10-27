import { describe, expect, it } from 'vitest';
import { RANGE_LAYERS, RIDGES, backSide, localMaxima, summitPeak, benchProgressMap, buildRidgePath, circleHitsBox, foregroundRocks, monotoneCubic, rangeSkyline, snowEdge, type Box } from './ridge';
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
      const back = backSide(l.layout, path.spec.plateauEnd, path.spec.p0.y, (w - l.ox) / l.S);
      const summit = summitPeak(back);
      const frame = { horizonY: HORIZON_Y, summit, baseY: path.spec.p0.y };
      const x0 = -l.ox / l.S, x1 = (w - l.ox) / l.S;
      for (const layer of RANGE_LAYERS) for (let i = 0; i <= 400; i++) {
        const x = x0 + ((x1 - x0) * i) / 400;
        expect(rangeSkyline(layer, x, frame).y).toBeLessThanOrEqual(summit.y - 0.02 + 1e-9);
      }
      for (const p of back) expect(p.y).toBeLessThanOrEqual(summit.y + 1e-9);
      for (let i = 0; i <= 200; i++) expect(path.at(i / 200 * path.plateauEndS).y).toBeLessThan(summit.y);
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

describe('main-ridge silhouette (review T2)', () => {
  const viewports: Array<[number, number]> = [[1280, 800], [1440, 900], [1920, 1080], [390, 844]];
  for (const [w, h] of viewports) {
    it(`${w}×${h}: at least 3 distinct peaks on screen, the true summit a real peak, the twin on screen`, () => {
      const l = layoutFor(w, h);
      const path = buildRidgePath(RIDGES[l.layout]);
      const x0 = -l.ox / l.S, x1 = (w - l.ox) / l.S;
      const back = backSide(l.layout, path.spec.plateauEnd, path.spec.p0.y, x1);
      const peaks = localMaxima(back, x0, x1 - 0.005);
      expect(peaks.length).toBeGreaterThanOrEqual(3);
      const top = summitPeak(back);
      expect(top.x).toBeGreaterThan(path.spec.plateauEnd.x);           // a peak behind the ledge, not the platform edge
      expect(top.y - path.spec.plateauEnd.y).toBeGreaterThan(0.06);
      expect(top.x).toBeLessThan(x1);
    });
  }
});

describe('arête on ultrawide (review T2)', () => {
  it('teeth are irregular: varied spacing and heights, not a ruler-drawn sawtooth', () => {
    const l = layoutFor(3440, 1440);
    const path = buildRidgePath(RIDGES.landscape);
    const back = backSide('landscape', path.spec.plateauEnd, path.spec.p0.y, (3440 - l.ox) / l.S);
    const pk = localMaxima(back, path.spec.plateauEnd.x, 99).map((i) => back[i]);
    expect(pk.length).toBeGreaterThanOrEqual(5);
    const gaps = pk.slice(1).map((p, i) => p.x - pk[i].x);
    const drops = pk.slice(1).map((p, i) => pk[i].y - p.y);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.02);
    expect(Math.max(...drops) - Math.min(...drops)).toBeGreaterThan(0.02);
  });
});

describe('foreground rocks (§3.3 L10)', () => {
  const viewports: Array<[number, number]> = [[1440, 900], [1280, 800], [390, 844], [3440, 1440]];
  for (const [w, h] of viewports) {
    it(`${w}×${h}: rocks never cover the climb, the readout or the control bar`, () => {
      const l = layoutFor(w, h);
      const path = buildRidgePath(RIDGES[l.layout]);
      const H = FIGURE_H[l.layout], R = BODY.boulderR * H;
      const toS = (x: number, y: number) => ({ x: l.ox + x * l.S, y: h - l.oy - y * l.S });
      const rocks = foregroundRocks(l.layout, w, h, l.S);
      const s0 = startS(H, R, path.length) - 0.05;
      for (let i = 0; i <= 300; i++) {
        const s = s0 + ((path.plateauEndS - s0) * i) / 300;
        const g = path.at(s), p = toS(g.x, g.y);
        // the figure stands up to ~1.2 H above the ground
        for (const r of rocks) for (const up of [0, 0.5, 1.2]) expect(Math.hypot(p.x - r.cx, p.y - up * H * l.S - r.cy)).toBeGreaterThan(r.r);
      }
      const boxes: Box[] = l.layout === 'landscape'
        ? [{ x0: w * 0.92 - 300, y0: h * 0.84 - 130, x1: w * 0.92, y1: h * 0.84 }, { x0: w / 2 - 230, y0: h - 90, x1: w / 2 + 230, y1: h - 28 }]
        : [{ x0: w / 2 - 160, y0: h - 150, x1: w / 2 + 160, y1: h - 28 }];
      for (const r of rocks) for (const b of boxes) expect(circleHitsBox(r.cx, r.cy, r.r, b)).toBe(false);
    });
  }
});
