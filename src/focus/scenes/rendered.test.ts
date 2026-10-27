// Round 4 fix round (V1, V2): checks on the pose the scene actually renders — the gait's interpolated frames over
// full cycles at 60 fps — not on a static solve. The face must stay clear of the near arm's silhouette and the drive
// leg must open to a long, near-straight line every step.
import { describe, expect, it } from 'vitest';
import { Gait, PACE } from './gait';
import { makeTrail, type Trail } from './trail';
import { DEG, RIG, interior, type Pose } from './rig';
import { ORDER, figureGeom } from './figureArt';
import { M_PER_H, PACE_M } from '../../domain/mountain';
import type { V } from './path';

const lenH = (25 * 60 * PACE_M) / M_PER_H;
const trail = makeTrail({ stage: 3, startH: 60, lenH, fromSummit: false });

interface F { pose: Pose; centre: V; mode: string; u: number; front: number }
function frames(secs: number, t0 = 4): F[] {
  const g = new Gait(11);
  g.snap(0, trail);
  const out: F[] = [];
  for (let i = 1; i <= secs * 60; i++) {
    const t = i / 60;
    g.step(1 / 60, t * PACE, trail, { climbing: true, lenH });
    if (t < t0) continue;
    const f = g.pose(trail);
    out.push({ pose: f.pose, centre: f.centre, mode: f.mode, u: g.u, front: g.front });
  }
  return out;
}
const S = frames(60);

function inside(p: V, poly: V[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** The face's landmarks in the head frame (head units: x toward the crown, y toward the face). */
const FACE: Array<[number, number]> = [[0.14, 0.26], [0.28, 0.30], [0.0, 0.40], [-0.12, 0.42], [-0.3, 0.38]];
const hu = 1 / 8;

describe('the rendered gait (V1, V2)', () => {
  it('the head is drawn last (curls and fillet over the arm), and the face (eye, brow, nose, moustache, beard) is clear of the near arm silhouette on ≥ 90% of frames', () => {
    expect(ORDER[ORDER.length - 1]).toBe('head');
    let clear = 0;
    const per = FACE.map(() => 0);
    for (const f of S) {
      const g = figureGeom({ pose: f.pose, centre: f.centre, R: RIG.boulderR, Hpx: 234, toS: (v) => v, chains: null, trail: trail as Trail, facing: 1, quality: 1 }, 3);
      const ax = f.pose.headAxis ?? 0, c = f.pose.head;
      const xd = { x: Math.sin(ax), y: Math.cos(ax) }, yd = { x: xd.y, y: -xd.x }; // face side for facing +1
      const pts = FACE.map(([x, y]) => ({ x: c.x + (xd.x * x + yd.x * y) * hu, y: c.y + (xd.y * x + yd.y * y) * hu }));
      pts.forEach((p, i) => { if (g.groups.nearArm.some((poly) => inside(p, poly))) per[i]++; });
      const covered = pts.filter((p) => g.groups.nearArm.some((poly) => inside(p, poly))).length;
      if (covered === 0) clear++;
    }
    console.log('per-point covered', per.map((n) => (n / S.length).toFixed(2)).join(' '));
    console.log(`face clear of the near arm on ${((clear / S.length) * 100).toFixed(1)}% of frames`);
    expect(clear / S.length).toBeGreaterThanOrEqual(0.9);
  });

  it('every step the drive leg opens to ≥ 165° (the rear knee through the press ≥ 160°), the front knee 98–128° at the press', () => {
    const cycles: F[][] = [];
    let cur: F[] = [];
    for (let i = 0; i < S.length; i++) {
      if (i && S[i].mode === 'trudge' && S[i - 1].mode === 'trudge' && S[i].u < S[i - 1].u) { if (cur.length > 60) cycles.push(cur); cur = []; }
      if (S[i].mode === 'trudge') cur.push(S[i]); else cur = [];
    }
    expect(cycles.length).toBeGreaterThan(10);
    for (const c of cycles) {
      const max = Math.max(...c.flatMap((f) => f.pose.legs.map(interior)));
      expect(max).toBeGreaterThanOrEqual(165);
      for (const f of c.filter((q) => q.u > 0.03 && q.u < 0.2)) {
        const rear = f.front ^ 1;
        expect(interior(f.pose.legs[rear])).toBeGreaterThanOrEqual(160);
        expect(interior(f.pose.legs[f.front])).toBeGreaterThanOrEqual(98);
        expect(interior(f.pose.legs[f.front])).toBeLessThanOrEqual(128);
        expect(Math.abs(f.pose.lean / DEG - 20.5)).toBeLessThanOrEqual(3);
      }
    }
  });
});
