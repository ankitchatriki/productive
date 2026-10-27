// The continuous trudge (ROUND4 §4, S2) on a headless frame-sequence harness: pure gait + trail, 1/30 s frames,
// 1440×900 scale (H = 234 px), 25- and 50-minute paces, slopes 16–32°. The §7.7 motion limits live in
// motion.clean.test.ts; these are the long-run invariants.
import { describe, expect, it } from 'vitest';
import { DEG, RIG, interior } from './rig';
import { Gait, KEY, PACE, periodAt, sigmaAt, type GaitFrame } from './gait';
import { makeTrail, type Trail } from './trail';
import { M_PER_H, PACE_M } from '../../domain/mountain';
import type { V } from './path';

const HPX = 234, DT = 1 / 30;
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);

/** A straight trail at θ (deg) with the full Trail interface. */
function lineTrail(theta: number): Trail {
  const t = { x: Math.cos(theta * DEG), y: Math.sin(theta * DEG) }, n = { x: -t.y, y: t.x };
  return {
    geom: { spec: { stage: 1, startH: 0, lenH: 1000, fromSummit: false }, s0: -10, s1: 2000, xs: new Float32Array(0), ys: new Float32Array(0), crestS: 1e4, ledgeStart: 1e4, ledgeEnd: 1e4, colS: 1e4 },
    spec: { p0: { x: 0, y: 0 }, p1: t, p2: t, p3: t, plateauEnd: t }, length: 1, plateauEndS: 1e4,
    at: (s) => ({ x: t.x * s, y: t.y * s }), tangentAt: () => t, normalAt: () => n, angleAt: () => theta,
    groundY: (x) => (x * t.y) / t.x, centreAt: (s, R) => ({ x: t.x * s + n.x * R, y: t.y * s + n.y * R }), centreArc: (s) => s,
  };
}

interface Run { frames: Array<Omit<GaitFrame, 'mode'> & { t: number; mode: string; u: number; D: number; target: number; strainT: number; baseS: number }>; snaps: number }

function simulate(trail: Trail, seconds: number, opts: { pace?: number; freezeAt?: number; seed?: number; lenH?: number; climbing?: boolean } = {}): Run {
  const g = new Gait(opts.seed ?? 7);
  g.snap(0, trail);
  const frames: Run['frames'] = [];
  let snaps = 0;
  for (let i = 0; i < seconds / DT; i++) {
    const t = i * DT;
    const target = (opts.freezeAt !== undefined ? Math.min(t, opts.freezeAt) : t) * (opts.pace ?? PACE);
    const before = g.D;
    g.step(DT, target, trail, { climbing: opts.climbing ?? true, lenH: opts.lenH ?? 400 });
    if (Math.abs(g.D - before) > 1) snaps++;
    frames.push({ ...g.pose(trail), t, mode: g.mode, u: g.u, D: g.D, target, strainT: g.strainT, baseS: g.baseS() });
  }
  return { frames, snaps };
}

describe('push cycle harness', () => {
  const slopes = [16, 22, 28, 32];
  for (const th of slopes) {
    const trail = lineTrail(th);
    const run = simulate(trail, 120);
    it(`${th}°: planted feet move < 1 px; no snaps; debt within ±2σ`, () => {
      expect(run.snaps).toBe(0);
      let worst = 0;
      for (let i = 1; i < run.frames.length; i++) {
        const a = run.frames[i - 1], b = run.frames[i];
        for (const k of [0, 1]) if (a.planted[k] && b.planted[k]) worst = Math.max(worst, dist(a.pose.feet![k].ball, b.pose.feet![k].ball) * HPX);
      }
      expect(worst).toBeLessThan(1);
      const sig = sigmaAt(th);
      // the strain beat does not count toward the debt; the next pair catches up (§4.7)
      let catchUp = false;
      for (const f of run.frames.slice(60)) {
        if (f.mode === 'strain') { catchUp = true; continue; }
        if (catchUp) { if (f.mode === 'hold' && f.target - f.D < 1.4 * sig) catchUp = false; else continue; }
        expect(Math.abs(f.target - f.D)).toBeLessThanOrEqual(2 * sig + 0.02);
      }
    });
    it(`${th}°: contact, intersection and penetration hold on every frame`, () => {
      for (const f of run.frames) {
        for (const p of f.pose.hands!) expect(Math.abs(dist(p, f.centre) - RIG.boulderR - RIG.palm) * HPX).toBeLessThanOrEqual(2);
        for (const l of [...f.pose.legs, ...f.pose.arms]) { const a = interior(l); expect(a).toBeGreaterThanOrEqual(35); expect(a).toBeLessThanOrEqual(179.9); }
        for (const j of [f.pose.pelvis, f.pose.shoulder, f.pose.head, ...f.pose.legs.flatMap((l) => [l.joint, l.end]), ...f.pose.arms.map((a) => a.joint)]) expect(dist(j, f.centre)).toBeGreaterThan(RIG.boulderR + 0.02);
        for (const ft of f.pose.feet!) for (const q of [ft.ball, ft.heel, ft.toe]) expect((q.y - trail.groundY(q.x)) * HPX).toBeGreaterThanOrEqual(-0.5);
      }
    });
  }

  it('rotation is exactly distance: boulderRot·R equals the centre’s arc length (≤ 0.5%) on the real trail', () => {
    for (const minutes of [25, 50]) {
      const lenH = (minutes * 60 * PACE_M) / M_PER_H;
      const trail = makeTrail({ stage: 2, startH: 40, lenH, fromSummit: false });
      const run = simulate(trail, 120, { lenH });
      let arc = 0, rot = 0;
      for (let i = 1; i < run.frames.length; i++) {
        arc += dist(run.frames[i].centre, run.frames[i - 1].centre) * Math.sign(run.frames[i].sB - run.frames[i - 1].sB || 1);
        rot += run.frames[i].rot - run.frames[i - 1].rot;
      }
      expect(arc).toBeGreaterThan(10);
      expect(Math.abs(rot * RIG.boulderR - arc) / arc).toBeLessThan(0.005);
    }
  }, 30000);

  it('no rolling without travel: with the target frozen he comes to rest in the hold and the stone stays still', () => {
    const run = simulate(lineTrail(22), 60, { freezeAt: 20, climbing: false });
    const fr = run.frames.filter((f) => f.t > 28);
    expect(fr.every((f) => f.mode === 'hold')).toBe(true);
    for (let i = 1; i < fr.length; i++) expect(Math.abs(fr[i].rot - fr[i - 1].rot) / DEG / DT).toBeLessThan(0.1);
  });

  it('the trudge is continuous: one step per σ/v̄ (±25%), the pelvis never stops outside a strain beat', () => {
    for (const th of [18, 22, 26]) {
      const run = simulate(lineTrail(th), 120);
      const P = periodAt(th), wraps: number[] = [];
      for (let i = 1; i < run.frames.length; i++) {
        const a = run.frames[i - 1], b = run.frames[i];
        if (a.mode === 'trudge' && b.mode === 'trudge' && b.u < a.u) wraps.push(b.t);
      }
      const restT = run.frames.filter((f) => f.mode !== 'trudge').map((f) => f.t);
      const gaps = wraps.slice(1).map((t, i) => t - wraps[i]).filter((_g, i) => !restT.some((r) => r > wraps[i] - P && r < wraps[i + 1]));
      expect(gaps.length).toBeGreaterThan(20);
      for (const g of gaps) { expect(g).toBeGreaterThanOrEqual(0.75 * P); expect(g).toBeLessThanOrEqual(1.25 * P); }
      const tr = run.frames.slice(90).filter((f, i, arr) => f.mode === 'trudge' && arr[i - 1]?.mode === 'trudge' && arr[i + 1]?.mode === 'trudge');
      const speeds = tr.slice(1).map((f, i) => (f.t - tr[i].t < DT * 1.5 ? dist(f.pose.pelvis, tr[i].pose.pelvis) / DT : Infinity));
      // (the step out of a strain beat or a hold eases up from rest over 0.9 s)
      const rest = run.frames.filter((f) => f.mode !== 'trudge').map((f) => f.t);
      // (and the step into a strain beat decelerates to rest, C2: excluded too)
      const moving = speeds.filter((_v, i) => !rest.some((t) => tr[i + 1].t - t > -1.3 * P && tr[i + 1].t - t < 1.3 + P));
      expect(Math.min(...moving)).toBeGreaterThanOrEqual(0.35 * PACE);
    }
  });

  it('the cycle curves are periodic C2: value, slope and curvature match across u = 1 → 0', () => {
    const d1 = (f: (u: number) => number, u: number) => (f(u + 1e-4) - f(u - 1e-4)) / 2e-4;
    const d2 = (f: (u: number) => number, u: number) => (f(u + 1e-4) - 2 * f(u) + f(u - 1e-4)) / 1e-8;
    const travel = (u: number) => KEY.travel(u) - u; // travel advances by one stride per cycle
    for (const f of [travel, KEY.hipDy, KEY.lean, KEY.pitch]) {
      expect(Math.abs(f(1 - 1e-9) - f(0))).toBeLessThan(1e-6);
      expect(Math.abs(d1(f, 0.9999) - d1(f, 0.0001))).toBeLessThan(0.02 * (1 + Math.abs(d1(f, 0.0001))));
      expect(Math.abs(d2(f, 0.9998) - d2(f, 0.0002))).toBeLessThan(0.05 * (1 + Math.abs(d2(f, 0.0002))));
    }
    // the stop curve arrives at rest: zero speed and zero acceleration at u = 1
    expect(Math.abs(d1(KEY.travelStop, 1 - 1e-3))).toBeLessThan(0.01);
    expect(KEY.travelStop(1)).toBeCloseTo(1, 9);
  });

  it('lean 17–27° while trudging (≤ 29° in a strain beat); elbows stay 155–178° (spec 148 ± 5 in a slip), both arms alike', () => {
    const run = simulate(lineTrail(22), 120);
    for (const f of run.frames) {
      const l = f.pose.lean / DEG;
      expect(l).toBeGreaterThanOrEqual(17);
      expect(l).toBeLessThanOrEqual(f.mode === 'strain' ? 29 : 27);
      for (const a of f.pose.arms) { expect(interior(a)).toBeGreaterThanOrEqual(f.mode === 'strain' ? 143 : 155); expect(interior(a)).toBeLessThanOrEqual(178); }
      expect(Math.abs(interior(f.pose.arms[0]) - interior(f.pose.arms[1]))).toBeLessThanOrEqual(1);
    }
  });

  it('a strain beat happens in the first 2 minutes and the stone returns to within 0.5 px', () => {
    const run = simulate(lineTrail(22), 120);
    const i0 = run.frames.findIndex((f) => f.mode === 'strain');
    expect(i0).toBeGreaterThan(30 / DT);
    expect(run.frames[i0].t).toBeLessThan(120);
    let i1 = i0;
    while (run.frames[i1 + 1]?.mode === 'strain') i1++;
    const before = run.frames[i0 - 1].centre, after = run.frames[i1 + 1].centre;
    expect(dist(before, after) * HPX).toBeLessThanOrEqual(0.5);
    // the stone did give back during the slip, and turned back by that distance
    const minS = Math.min(...run.frames.slice(i0, i1).map((f) => f.sB));
    expect(run.frames[i0 - 1].sB - minS).toBeGreaterThan(0.03);
  });

  it('is deterministic: same seed, same frames', () => {
    const a = simulate(lineTrail(24), 20), b = simulate(lineTrail(24), 20);
    expect(a.frames.map((f) => [f.pose.pelvis, f.centre, f.rot])).toEqual(b.frames.map((f) => [f.pose.pelvis, f.centre, f.rot]));
  });
});
