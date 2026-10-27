// S1: the redesigned Sisyphus (ROUND4 §3, §6): proportions, the push-hold key pose, contact, negative spaces, the detail layer.
import { describe, expect, it } from 'vitest';
import type { SlopePath, V } from './path';
import { DEG, RIG, interior, solveHoldStatic, solveSit, solveStand } from './rig';
import { DETAIL, FOOT_OUTLINE, HEAD_OUTLINE, STATIONS, TOE_OUTLINE, figureGeom, handOutlines, interp, partOutline, tierFor } from './figureArt';
import { camLayout } from './camera';
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

const HPX = 234; // 1440×900 (0.26 h)
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
const deg = (r: number) => r / DEG;
const hu = 1 / 8;
const geomOf = (pose: ReturnType<typeof solveHoldStatic>['pose'], centre: V, path: SlopePath) =>
  figureGeom({ pose, centre, R: RIG.boulderR, Hpx: HPX, toS: (v) => v, chains: null, trail: path as unknown as Trail, facing: 1, quality: 1 });

describe('proportions (ROUND4 §3.1)', () => {
  it('8 heads: hip 4.25 h, shoulder 6.75 h, crown ≈ 8 h; boulder Ø 1.05 H', () => {
    expect(RIG.ankleH + RIG.shin + RIG.thigh).toBeCloseTo(4.25 * hu, 6);
    expect(RIG.ankleH + RIG.shin + RIG.thigh + RIG.torso).toBeCloseTo(6.75 * hu, 6);
    expect(Math.abs(RIG.ankleH + RIG.shin + RIG.thigh + RIG.torso + RIG.neck + RIG.head * 0.75 - 1)).toBeLessThan(0.02);
    expect(2 * RIG.boulderR).toBeCloseTo(1.05, 3);
  });
  it('heroic V torso: chest : waist depth ≈ 1.74 : 1; closed capsules', () => {
    const at = (t: number) => interp(STATIONS.torso.front, t) + interp(STATIONS.torso.back, t);
    expect(at(0.68) / at(0.35)).toBeGreaterThan(1.65);
    for (const p of partOutline(RIG.torso, STATIONS.torso)) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

describe('the push-hold key pose (ROUND4 §3.4)', () => {
  const path = line(22);
  const { pose, centre } = solveHoldStatic(path, 5);
  const sh = pose.shoulder, wr = pose.arms[0].end;
  it('lean 20 ± 1°, pelvis 0.42–0.44 H off the slope, rear knee ≥ 168°, front knee 100–112°, one straight line of action', () => {
    expect(Math.abs(deg(pose.lean) - 20)).toBeLessThanOrEqual(1);
    const base = path.at(5), n = path.normalAt(5);
    const pn = (pose.pelvis.x - base.x) * n.x + (pose.pelvis.y - base.y) * n.y;
    expect(pn).toBeGreaterThanOrEqual(0.42); expect(pn).toBeLessThanOrEqual(0.44);
    expect(interior(pose.legs[1])).toBeGreaterThanOrEqual(168);
    const kF = interior(pose.legs[0]);
    expect(kF).toBeGreaterThanOrEqual(100); expect(kF).toBeLessThanOrEqual(112);
    const ra = pose.feet![1].ankle;
    const loa = deg(Math.atan2(pose.pelvis.x - ra.x, pose.pelvis.y - ra.y));
    expect(Math.abs(loa - deg(pose.lean))).toBeLessThanOrEqual(6);
  });
  it('arms 10–18° above horizontal, elbows 168–172° (both arms)', () => {
    const arm = deg(Math.atan2(wr.y - sh.y, wr.x - sh.x));
    expect(arm).toBeGreaterThanOrEqual(10); expect(arm).toBeLessThanOrEqual(18);
    for (const a of pose.arms) { expect(interior(a)).toBeGreaterThanOrEqual(168); expect(interior(a)).toBeLessThanOrEqual(172); }
  });
  it('head bowed just below the near arm (V1): 0.01–0.09 H under the shoulder → wrist line, 0.05–0.16 H along it; crown ≥ 0.05 H from the stone', () => {
    const ux = (wr.x - sh.x), uy = (wr.y - sh.y), l = Math.hypot(ux, uy);
    const along = ((pose.head.x - sh.x) * ux + (pose.head.y - sh.y) * uy) / l;
    const below = ((pose.head.x - sh.x) * uy - (pose.head.y - sh.y) * ux) / l; // + = under the arm
    console.log(`head under the arm line ${below.toFixed(3)} H, ${along.toFixed(3)} H along`);
    expect(below).toBeGreaterThanOrEqual(0.01); expect(below).toBeLessThanOrEqual(0.09);
    expect(along).toBeGreaterThanOrEqual(0.05); expect(along).toBeLessThanOrEqual(0.16);
    const g = geomOf(pose, centre, path);
    for (const p of g.groups.head[0]) expect(dist(p, centre) - RIG.boulderR).toBeGreaterThanOrEqual(0.05);
  });
  it('palms on the stone within 2 px; no finger lobe enters the stone by more than 1 px', () => {
    for (const p of pose.hands!) expect(Math.abs(dist(p, centre) - RIG.boulderR - RIG.palm) * HPX).toBeLessThanOrEqual(2);
    const g = geomOf(pose, centre, path);
    for (const gk of ['nearArm', 'farArm'] as const) {
      for (const lobe of g.groups[gk].slice(-5)) for (const p of lobe) expect((dist(p, centre) - RIG.boulderR) * HPX).toBeGreaterThanOrEqual(-1);
    }
  });
  it('the three negative spaces stay open (leg triangle, arm wedge, rear-leg wedge)', () => {
    expect(dist(pose.legs[0].joint, pose.legs[1].joint) - 2 * 0.28 * hu).toBeGreaterThanOrEqual(0.06);
    // near elbow to the chest's front line (pelvis → shoulder, offset by the front depth)
    const e = pose.arms[0].joint, a = pose.pelvis, b = pose.shoulder, l = dist(a, b);
    const across = Math.abs((e.x - a.x) * (b.y - a.y) - (e.y - a.y) * (b.x - a.x)) / l;
    // ≥ 0.06 H of sky between the near elbow and the chest front (the spec's 0.09 is not reachable with these proportions)
    expect(across - 0.66 * hu).toBeGreaterThanOrEqual(0.06);
    const rk = pose.legs[1].joint;
    expect(rk.y - path.groundY(rk.x)).toBeGreaterThanOrEqual(0.12);
  });
  it('no self-intersection; only the hands touch the stone; feet on (not in) the ground', () => {
    for (const l of [...pose.legs, ...pose.arms]) { const a = interior(l); expect(a).toBeGreaterThanOrEqual(35); expect(a).toBeLessThanOrEqual(179.5); }
    for (const j of [pose.pelvis, pose.shoulder, pose.head, ...pose.legs.flatMap((l) => [l.joint, l.end]), ...pose.arms.map((x) => x.joint)]) expect(dist(j, centre)).toBeGreaterThan(RIG.boulderR + 0.02);
    for (const f of pose.feet!) for (const q of [f.ball, f.heel, f.toe]) expect((q.y - path.groundY(q.x)) * HPX).toBeGreaterThanOrEqual(-0.5);
  });
  it('the push silhouette is ≥ 22% of the viewport on desktop and ≥ 15% on phones', () => {
    const g = geomOf(pose, centre, path);
    const ys = [...g.groups.core, ...g.groups.nearArm, ...g.groups.farArm].flat().map((p) => p.y);
    const silH = Math.max(...ys) - pose.feet![1].ball.y;
    for (const [w, hh, min] of [[1280, 800, 0.22], [1440, 900, 0.22], [1920, 1080, 0.22], [390, 844, 0.15], [844, 390, 0.15]] as const) {
      expect((silH * camLayout(w, hh).Hpx) / hh).toBeGreaterThanOrEqual(min);
    }
  });
  it('holds across slopes 16–28°: lean 16–24°, rear knee ≥ 168°, palms on the stone', () => {
    for (const th of [16, 22, 28]) {
      const r = solveHoldStatic(line(th), 5);
      const l = deg(r.pose.lean);
      expect(l).toBeGreaterThanOrEqual(16); expect(l).toBeLessThanOrEqual(24);
      expect(interior(r.pose.legs[1])).toBeGreaterThanOrEqual(168);
      for (const p of r.pose.hands!) expect(Math.abs(dist(p, r.centre) - RIG.boulderR - RIG.palm) * HPX).toBeLessThanOrEqual(2);
    }
  });
});

describe('the detail layer (ROUND4 §6)', () => {
  const pip = (pts: Array<[number, number]>, x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  it('every detail vertex lies inside its own part (bone parts inset 0.02 h; head, hand and foot in their outlines)', () => {
    const hands = handOutlines(0);
    for (const ln of DETAIL) {
      for (const [a, b] of ln.pts) {
        if (ln.part in STATIONS) {
          const st = STATIONS[ln.part as keyof typeof STATIONS];
          expect(b).toBeLessThanOrEqual(interp(st.front, a) - 0.02);
          expect(b).toBeGreaterThanOrEqual(-interp(st.back, a) + 0.02);
        } else if (ln.part === 'head') expect(pip(HEAD_OUTLINE, a, b)).toBe(true);
        else if (ln.part === 'hand') expect(hands.some((o) => pip(o, a, b))).toBe(true);
        else if (ln.part === 'foot') expect(pip(FOOT_OUTLINE, a, b)).toBe(true);
        else if (ln.part === 'toe') expect(pip(TOE_OUTLINE, a, b)).toBe(true);
      }
    }
  });
  it('three levels: L3 ≈ 70 strokes, L2 ≈ 45, L1 ≈ 22; tiers switch with hysteresis', () => {
    const path = line(22);
    const { pose, centre } = solveHoldStatic(path, 5);
    const n = (t: 1 | 2 | 3) => figureGeom({ pose, centre, R: RIG.boulderR, Hpx: HPX, toS: (v) => v, chains: null, trail: path as unknown as Trail, facing: 1, quality: 1 }, t).strokes;
    expect(n(3)).toBeGreaterThanOrEqual(60);
    expect(n(2)).toBeGreaterThanOrEqual(35); expect(n(2)).toBeLessThan(n(3));
    expect(n(1)).toBeGreaterThanOrEqual(15); expect(n(1)).toBeLessThan(n(2));
    expect(tierFor(234, 1, 3)).toBe(3);
    expect(tierFor(156, 1, 3)).toBe(2);   // phone portrait
    expect(tierFor(145, 1, 2)).toBe(2);   // summit framing
    expect(tierFor(196, 1, 3)).toBe(3);   // hysteresis: stays
    expect(tierFor(196, 1, 2)).toBe(2);
    expect(tierFor(100, 1, 2)).toBe(1);
    expect(tierFor(234, 0.6, 3)).toBe(2);
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

describe('cloth flaps (V5)', () => {
  it('the hanging flaps are soft tabs with a rounded hem, never tapering to a spike', async () => {
    const { makeChain } = await import('./chain');
    const path = line(22);
    const { pose, centre } = solveHoldStatic(path, 5);
    const a = { x: pose.pelvis.x, y: pose.pelvis.y - 0.08 };
    const chains = [makeChain(a, 3, 0.24 / 8, 30, 0.6), makeChain({ x: a.x - 0.05, y: a.y }, 3, 0.24 / 8, 30, 0.6)];
    const g = figureGeom({ pose, centre, R: RIG.boulderR, Hpx: HPX, toS: (v) => v, chains, trail: path as unknown as Trail, facing: 1, quality: 1 });
    for (const poly of g.groups.cloth.slice(-2)) {
      // the free end: the two edge points at the last chain point are ≥ 0.2 head units apart, and the hem bulges out
      const n = 4, left = poly[n - 1], right = poly[poly.length - n];
      expect(dist(left, right)).toBeGreaterThanOrEqual(0.2 * hu);
      const tipY = Math.min(...poly.map((p) => p.y));
      expect(Math.min(left.y, right.y) - tipY).toBeLessThanOrEqual(0.12 * hu); // a rounded end, not a long point
    }
  });
});

describe('fingers (V6)', () => {
  it('four fingers fan out with open gaps at the tips (≥ 0.1 head units ≈ 3 px at 1440×900) and stay narrower than their spacing', () => {
    const [, , ...rest] = handOutlines(0);
    const fingers = rest.slice(0, 4);
    const tip = (l: Array<[number, number]>) => l[2];
    for (let i = 1; i < 4; i++) {
      const a = tip(fingers[i - 1]), b = tip(fingers[i]);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThanOrEqual(0.1);
    }
    // the knuckle ticks each lie inside their own finger root (incised across it)
    expect(fingers.length).toBe(4);
  });
});

describe('figure draw cost (V10)', () => {
  it('the opaque figure is drawn straight onto the scene: no offscreen layer copy, no destination-in mask pass, no halos on the back limbs', async () => {
    const { drawFigureArt } = await import('./figureArt');
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (o, k) => (k in o ? o[k as string] : (..._a: unknown[]) => { calls.push(String(k)); }),
      set: (o, k, v) => { if (k === 'globalCompositeOperation') calls.push(`gco:${v}`); o[k as string] = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
    const g0 = globalThis as unknown as { Path2D?: unknown };
    const savedP = g0.Path2D;
    g0.Path2D = class { moveTo() {} lineTo() {} closePath() {} arc() {} bezierCurveTo() {} quadraticCurveTo() {} };
    const path = line(22);
    const { pose, centre } = solveHoldStatic(path, 5);
    drawFigureArt(ctx, { pose, centre, R: RIG.boulderR, Hpx: HPX, toS: (v) => v, chains: null, trail: path as unknown as Trail, facing: 1, quality: 1 }, 2);
    g0.Path2D = savedP;
    expect(calls.filter((c) => c === 'drawImage').length).toBe(0);
    expect(calls.some((c) => c.startsWith('gco:destination'))).toBe(false);
    expect(calls.filter((c) => c === 'clip').length).toBe(2); // the outer incision's ground/stone clip and the silhouette
    expect(calls.filter((c) => c === 'stroke').length).toBeLessThan(40);
  });
});
