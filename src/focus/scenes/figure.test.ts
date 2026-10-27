// A2: the black-figure Sisyphus (ROUND3_ART §3): proportions, the key pose, contact, no self-intersection.
import { describe, expect, it } from 'vitest';
import type { SlopePath, V } from './path';
import { DEG, RIG, interior, solveHoldStatic, solveSit, solveStand } from './rig';
import { STATIONS, figureGeom, partOutline } from './figureArt';
import type { Trail } from './trail';

/** A straight slope at θ (deg). */
export function line(theta: number): SlopePath {
  const t = { x: Math.cos(theta * DEG), y: Math.sin(theta * DEG) }, n = { x: -t.y, y: t.x };
  return {
    spec: { p0: { x: 0, y: 0 }, p1: t, p2: t, p3: t, plateauEnd: t }, length: 1,
    at: (s) => ({ x: t.x * s, y: t.y * s }), tangentAt: () => t, normalAt: () => n, angleAt: () => theta,
    groundY: (x) => (x * t.y) / t.x, plateauEndS: 99, centreAt: (s, R) => ({ x: t.x * s + n.x * R, y: t.y * s + n.y * R }),
  };
}

const HPX = 216; // 1440×900
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
const deg = (r: number) => r / DEG;

describe('proportions (§3.1)', () => {
  it('8 heads: hip 4.15 h, shoulder 6.55 h, crown 8 h; boulder Ø 1.12 H', () => {
    const h = 1 / 8;
    expect(RIG.ankleH + RIG.shin + RIG.thigh).toBeCloseTo(4.15 * h, 6);
    expect(RIG.ankleH + RIG.shin + RIG.thigh + RIG.torso).toBeCloseTo(6.55 * h, 6);
    expect(RIG.ankleH + RIG.shin + RIG.thigh + RIG.torso + RIG.neck + RIG.head).toBeCloseTo(1, 1); // the neck joins inside the skull: crown ≈ 8 h
    expect(2 * RIG.boulderR).toBeCloseTo(1.125, 3);
  });
  it('part outlines are closed capsules through the stations (broad chest, narrow waist)', () => {
    const torso = partOutline(RIG.torso, STATIONS.torso);
    const at = (t: number) => Math.max(...torso.filter((p) => Math.abs(p.x - t * RIG.torso) < 0.004).map((p) => p.y));
    expect(at(0.7)).toBeGreaterThan(at(0.35) * 1.4);
    for (const p of torso) { expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true); }
  });
});

describe('the hold (key) pose (§3.6)', () => {
  const path = line(22);
  const { pose, centre } = solveHoldStatic(path, 5);
  it('lean 16 ± 2° (raised from 20° for an upright read, review U10), front knee 90 ± 8°, rear knee ≥ 165°, elbows locked ≥ 165°', () => {
    expect(Math.abs(deg(pose.lean) - 16)).toBeLessThanOrEqual(2);
    expect(Math.abs(interior(pose.legs[0]) - 90)).toBeLessThanOrEqual(8);
    expect(interior(pose.legs[1])).toBeGreaterThanOrEqual(165);
    for (const a of pose.arms) expect(interior(a)).toBeGreaterThanOrEqual(165);
  });
  it('arms push about parallel to the slope; the head sits below the shoulder → hand line, between the arms', () => {
    const dir = deg(Math.atan2(centre.y - pose.shoulder.y, centre.x - pose.shoulder.x));
    expect(Math.abs(dir - 22)).toBeLessThan(5);
    const hand = pose.hands![0];
    const lineY = pose.shoulder.y + ((hand.y - pose.shoulder.y) * (pose.head.x - pose.shoulder.x)) / (hand.x - pose.shoulder.x);
    expect(pose.head.y).toBeLessThan(lineY);
    expect(pose.head.x).toBeGreaterThan(pose.shoulder.x);
  });
  it('palms on the stone within 2 px at 1440×900', () => {
    for (const p of pose.hands!) expect(Math.abs(dist(p, centre) - RIG.boulderR - RIG.palm) * HPX).toBeLessThanOrEqual(2);
  });
  it('no self-intersection; nothing but the hands touches the stone; feet on (not in) the ground', () => {
    for (const l of [...pose.legs, ...pose.arms]) { const a = interior(l); expect(a).toBeGreaterThanOrEqual(35); expect(a).toBeLessThanOrEqual(179.5); }
    const joints = [pose.pelvis, pose.shoulder, pose.head, ...pose.legs.flatMap((l) => [l.joint, l.end]), ...pose.arms.map((a) => a.joint)];
    for (const j of joints) expect(dist(j, centre)).toBeGreaterThan(RIG.boulderR + 0.02);
    for (const f of pose.feet!) for (const q of [f.ball, f.heel, f.toe]) expect((q.y - path.groundY(q.x)) * HPX).toBeGreaterThanOrEqual(-0.5);
  });
  it('the three negative shapes stay open (legs triangle, sky wedge under the arms, rear leg wedge)', () => {
    const thigh = (i: number) => Math.atan2(pose.legs[i].joint.y - pose.pelvis.y, pose.legs[i].joint.x - pose.pelvis.x);
    expect(deg(Math.abs(thigh(0) - thigh(1)))).toBeGreaterThan(40);
    const armDir = Math.atan2(pose.arms[0].end.y - pose.shoulder.y, pose.arms[0].end.x - pose.shoulder.x);
    const torsoDown = Math.atan2(pose.pelvis.y - pose.shoulder.y, pose.pelvis.x - pose.shoulder.x);
    expect(deg(Math.abs(armDir - torsoDown)) % 360).toBeGreaterThan(60);
    const rear = pose.legs[1];
    const shinUp = deg(Math.atan2(rear.joint.y - rear.end.y, rear.joint.x - rear.end.x)) - 22;
    expect(shinUp).toBeGreaterThan(20);
  });
  it('the figure geometry is finite and grouped as six fills', () => {
    const g = figureGeom({ pose, centre, R: RIG.boulderR, Hpx: HPX, toS: (v) => v, chains: null, trail: path as unknown as Trail, facing: 1, quality: 1 });
    for (const k of ['farLeg', 'farArm', 'core', 'nearLeg', 'cloth', 'nearArm'] as const) {
      expect(g.groups[k].length).toBeGreaterThan(0);
      for (const poly of g.groups[k]) for (const p of poly) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    expect(g.lines.core.length).toBeGreaterThan(10);
  });
  it('the pose holds across 16–32° slopes', () => {
    for (const th of [16, 20, 26, 32]) {
      const r = solveHoldStatic(line(th), 5);
      expect(interior(r.pose.legs[1])).toBeGreaterThanOrEqual(160);
      expect(interior(r.pose.legs[0])).toBeGreaterThan(75);
      for (const p of r.pose.hands!) expect(Math.abs(dist(p, r.centre) - RIG.boulderR - RIG.palm) * HPX).toBeLessThanOrEqual(2);
    }
  });
});

describe('stand and sit (§5.2, §5.3)', () => {
  const flat = line(1);
  const c = flat.centreAt!(3, RIG.boulderR);
  it('standing: the near palm rests on the stone’s upper flank, feet on the ground, no overlap with the stone', () => {
    const p = solveStand(flat, 1, c.x - RIG.boulderR - 0.25, c, { sway: 0, breath: 1, handDeg: 150 });
    expect(Math.abs(dist(p.hands![0], c) - RIG.boulderR - RIG.palm) * HPX).toBeLessThanOrEqual(2);
    for (const f of p.feet!) expect(Math.abs(f.ball.y - flat.groundY(f.ball.x)) * HPX).toBeLessThanOrEqual(0.5);
    for (const j of [p.pelvis, p.shoulder, p.head, ...p.legs.map((l) => l.joint)]) expect(dist(j, c)).toBeGreaterThan(RIG.boulderR + 0.02);
  });
  it('sitting: back to the stone, facing downhill, feet on the ground', () => {
    const p = solveSit(flat, 1, c, 1);
    expect(p.facing).toBe(-1);
    expect(p.pelvis.x).toBeLessThan(c.x - RIG.boulderR);
    for (const f of p.feet!) expect(Math.abs(f.ball.y - flat.groundY(f.ball.x)) * HPX).toBeLessThanOrEqual(1);
  });
});
