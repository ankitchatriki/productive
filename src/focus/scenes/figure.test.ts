// F2 (ROUND5_SISYPHUS §8): the figure drawn from scratch. Face never covered by the near arm (60 s of the rendered
// walk), size on screen, every stroke inside its own part, four fingers and a thumb with ochre gaps, the head last.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureClimb, installStubs, removeStubs } from './testkit/engineStub';
import { LOCAL_LINES, LOCAL_OUTLINES, ORDER, crPoints, figureGeometry, handShapes } from './figure';
import { CURL_ROWS, CURL_R, FINGERS, FINGER_GAP } from './body';
import { WALK, type Skel } from './walk';
import type { V } from './path';

beforeAll(installStubs);
afterAll(removeStubs);

function inside(p: V, poly: V[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
function distToPoly(p: V, poly: V[]): number {
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    m = Math.min(m, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return inside(p, poly) ? -m : m;
}

describe('the face is never covered (V1)', () => {
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    it(`${w}×${h}: over 60 s of the rendered walk, brow, eye, nose, lips and mouth corner stay ≥ 0.01 H clear of the near arm and hand`, async () => {
      const { e, rows } = await captureClimb(w, h, 300, 60);
      let worst = Infinity;
      for (const r of rows) {
        const g = figureGeometry(r.skel as Skel);
        for (const p of g.face) for (const poly of g.nearArm) worst = Math.min(worst, distToPoly(p, poly));
      }
      console.log(`${w}×${h}: closest face landmark to the near arm ${worst.toFixed(4)} H over ${rows.length} frames`);
      expect(worst).toBeGreaterThanOrEqual(0.01);
      e.destroy();
    }, 60_000);
  }
  it('the head group is drawn last', () => { expect(ORDER[ORDER.length - 1]).toBe('head'); expect(ORDER.indexOf('nearArm')).toBeLessThan(ORDER.indexOf('head')); });
});

describe('size on screen (§0, §8 F2)', () => {
  for (const [w, h, min] of [[1440, 900, 0.28], [1920, 1080, 0.28], [390, 844, 0.15]] as const) {
    it(`${w}×${h}: the silhouette (stone excluded) is ≥ ${min} h tall at its smallest over a cycle${w === 390 ? '; figure and stone inside 16 px gutters' : ''}`, async () => {
      const { e, rows } = await captureClimb(w, h, 300, 4);
      let minH = Infinity, x0 = Infinity, x1 = -Infinity;
      for (const r of rows.slice(30)) {
        const Hz = (r.Hpx as number) * (r.zoom as number), a = r.anchor as number[];
        const S = (v: V) => ({ x: a[0] + (v.x - (r.camX as number)) * Hz, y: a[1] - (v.y - (r.camY as number)) * Hz });
        const pts = figureGeometry(r.skel as Skel).silhouette.flat().map(S);
        const ys = pts.map((p) => p.y);
        minH = Math.min(minH, Math.max(...ys) - Math.min(...ys));
        const c = r.centre as V;
        x0 = Math.min(x0, ...pts.map((p) => p.x)); x1 = Math.max(x1, ...pts.map((p) => p.x), S({ x: c.x + WALK.R, y: c.y }).x);
      }
      console.log(`${w}×${h}: smallest figure height ${(minH / h * 100).toFixed(1)}% of the viewport; x ${x0.toFixed(0)}–${x1.toFixed(0)}`);
      expect(minH / h).toBeGreaterThanOrEqual(min);
      if (w === 390) { expect(x0).toBeGreaterThanOrEqual(16); expect(x1).toBeLessThanOrEqual(w - 16); }
      e.destroy();
    }, 30_000);
  }
});

describe('construction (§2.2, §2.8)', () => {
  it('every stroke lies inside its own part outline', () => {
    for (const [key, lines] of Object.entries(LOCAL_LINES)) {
      const poly = crPoints(LOCAL_OUTLINES[key], 8);
      for (const s of lines) for (let i = 0; i < s.p.length; i += 2) expect(inside({ x: s.p[i], y: s.p[i + 1] }, poly), `${key} stroke point ${s.p[i]},${s.p[i + 1]}`).toBe(true);
    }
    const head = crPoints(LOCAL_OUTLINES.head, 8);
    for (const row of CURL_ROWS) for (const [u, v] of row.pts) for (let a = 0; a < 6.28; a += 0.5) expect(inside({ x: u + Math.cos(a) * CURL_R, y: v + Math.sin(a) * CURL_R }, head)).toBe(true);
  });
  it('four fingers and a thumb on each hand, 0.0025 H gaps (ochre between), each ≥ 2.5 px wide at 1440×900', () => {
    const shapes = handShapes({ origin: { x: 0, y: 0 }, dir: Math.PI / 2, curve: 2 }, 1);
    expect(shapes.filter((s) => s.key.startsWith('finger')).length).toBe(4);
    expect(shapes.filter((s) => s.key === 'thumb').length).toBe(1);
    for (let i = 1; i < FINGERS.length; i++) expect(FINGERS[i][2] - (FINGERS[i - 1][2] + FINGERS[i - 1][3])).toBeGreaterThanOrEqual(FINGER_GAP - 1e-9);
    for (const f of FINGERS) expect(f[3] * 0.33 * 900).toBeGreaterThanOrEqual(2.5);
  });
});
