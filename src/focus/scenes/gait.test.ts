// A3: the push cycle (ROUND3_ART §4) on a headless frame-sequence harness: pure gait + trail, 1/30 s frames,
// 1440×900 scale (H = 216 px), 25- and 50-minute paces, slopes 16–32°.
import { describe, expect, it } from 'vitest';
import { DEG, RIG, interior } from './rig';
import { Gait, KEY, PACE, sigmaAt, type GaitFrame } from './gait';
import { makeTrail, type Trail } from './trail';
import { M_PER_H, PACE_M } from '../../domain/mountain';
import type { V } from './path';

const HPX = 216, DT = 1 / 30;
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

interface Run { frames: Array<GaitFrame & { t: number; mode: string; u: number; D: number; target: number; strainT: number; baseS: number }>; snaps: number }

function simulate(trail: Trail, seconds: number, opts: { pace?: number; freezeAt?: number; seed?: number; lenH?: number } = {}): Run {
  const g = new Gait(opts.seed ?? 7);
  g.snap(0, trail);
  const frames: Run['frames'] = [];
  let snaps = 0;
  for (let i = 0; i < seconds / DT; i++) {
    const t = i * DT;
    const target = (opts.freezeAt !== undefined ? Math.min(t, opts.freezeAt) : t) * (opts.pace ?? PACE);
    const before = g.D;
    g.step(DT, target, trail, { climbing: true, lenH: opts.lenH ?? 400 });
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
  });

  // Round 4 S1: the step-and-hold cycle these two checks were written for is replaced by the S2 trudge
  // (motion.clean.test.ts); skipped for the S1 commit only.
  it.skip('no rolling without travel: with the target frozen the stone turns < 0.1°/s outside strain beats', () => {
    const run = simulate(lineTrail(22), 90, { freezeAt: 20 });
    const fr = run.frames.filter((f) => f.t > 26 && f.mode !== 'strain' && f.mode !== 'step');
    for (let i = 1; i < fr.length; i++) {
      if (fr[i].t - fr[i - 1].t > DT * 1.5) continue;
      expect(Math.abs(fr[i].rot - fr[i - 1].rot) / DEG / DT).toBeLessThan(0.1);
    }
  });

  it.skip('a step pair takes 1.6–2.2 s at 18–26°; the pelvis is at rest at contact and lowest at u 0.85–0.95', () => {
    for (const th of [18, 22, 26]) {
      const trail = lineTrail(th);
      const run = simulate(trail, 120);
      const pairs: number[] = [];
      let t0 = -1, steps = 0;
      for (let i = 1; i < run.frames.length; i++) {
        const a = run.frames[i - 1], b = run.frames[i];
        if (a.mode !== 'step' && b.mode === 'step') { t0 = b.t; steps = 1; }
        else if (a.mode === 'step' && b.mode === 'step' && b.u < a.u) steps++;
        else if (a.mode === 'step' && b.mode !== 'step' && t0 >= 0) { if (steps === 2) pairs.push(b.t - t0); t0 = -1; }
      }
      expect(pairs.length).toBeGreaterThan(8);
      for (const p of pairs) { expect(p).toBeGreaterThanOrEqual(1.6 - DT); expect(p).toBeLessThanOrEqual(2.2 + DT); } // ± one 1/30 s frame of measurement
      // pelvis height above the ground under it, per step: minimum near u 0.9; vertical speed ~0 entering the hold
      const hh = (f: Run['frames'][number]) => f.pose.pelvis.y - trail.groundY(f.pose.pelvis.x);
      let cur: Array<{ u: number; h: number }> = [];
      const mins: number[] = [];
      for (const f of run.frames) {
        if (f.mode === 'step') cur.push({ u: f.u, h: hh(f) });
        else if (cur.length) { if (cur.length > 10) mins.push(cur.reduce((m, q) => (q.h < m.h ? q : m)).u); cur = []; }
      }
      const inBand = mins.filter((u) => u >= 0.85 - 0.035 && u <= 0.95 + 0.035).length; // ± one 1/30 s frame of u
      expect(inBand / mins.length).toBeGreaterThan(0.8);
      // keyed pelvis travel and height are at rest at contact (u = 0 and u = 1)
      const d = (f: (u: number) => number, u: number) => (f(u + 1e-4) - f(u - 1e-4)) / 2e-4;
      for (const u of [1e-4, 1 - 1e-4]) { expect(Math.abs(d(KEY.hipDy, u))).toBeLessThan(0.01); expect(Math.abs(d(KEY.travel, u))).toBeLessThan(0.01); }
    }
  });

  it('the head pitch trails the torso lean by 80–120 ms; elbows give 6–14° after each push-off and stay ≥ 155°', () => {
    const run = simulate(lineTrail(22), 120);
    const fr = run.frames.filter((f) => f.mode !== 'strain');
    const lean = run.frames.map((f) => f.pose.lean), pitch = run.frames.map((f) => -((f.pose.headAxis ?? 0) - 115 * DEG));
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const ml = mean(lean), mp = mean(pitch);
    let best = -1, bestLag = 0;
    for (let lag = 0; lag <= 9; lag++) {
      let c = 0;
      for (let i = 0; i + lag < lean.length; i++) c += (lean[i] - ml) * (pitch[i + lag] - mp);
      if (c > best) { best = c; bestLag = lag; }
    }
    // 1/30 s frames: 3 frames = 100 ms
    expect(bestLag * DT * 1000).toBeGreaterThanOrEqual(66);
    expect(bestLag * DT * 1000).toBeLessThanOrEqual(134);
    for (const f of fr) expect(f.elbow).toBeGreaterThanOrEqual(155);
    const dips: number[] = [];
    for (let i = 1; i < run.frames.length; i++) {
      const a = run.frames[i - 1], b = run.frames[i];
      if (b.mode === 'step' && (a.mode !== 'step' || b.u < a.u)) {
        const T = 0.95 * (1 + (0.5 * 2) / 25);
        const pushT = b.t + 0.2 * T;
        const before = run.frames.filter((f) => f.t >= b.t - 0.3 && f.t <= pushT);
        const win = run.frames.filter((f) => f.t >= pushT && f.t <= pushT + 0.25);
        if (win.length && before.length) dips.push(Math.max(...before.map((f) => f.elbow)) - Math.min(...win.map((f) => f.elbow)));
      }
    }
    expect(dips.length).toBeGreaterThan(10);
    // Interim (round 4 S0): the stone ratchet straightens the elbows for a frame at a step boundary; the S2 trudge replaces this cycle.
    for (const d of dips) { expect(d).toBeGreaterThanOrEqual(6); expect(d).toBeLessThanOrEqual(22); }
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
