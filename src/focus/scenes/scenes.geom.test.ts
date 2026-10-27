import { describe, expect, it } from 'vitest';
import { STOPS, palette, mixRGB, grade, hex, lum, NIGHT } from './palette';
import { FIGURE_H, PATHS, boulderS, buildPath, easeProgress, layoutFor, startS, summitS, sunPosition } from './path';
import { BODY, footTarget, hipH, leanDeg, solvePush, solveSit, solveStand, surge, twoBoneIK, boulderCentre, handTarget, handAngles } from './rig';

describe('palette', () => {
  it('returns the exact stop at its p', () => {
    for (const s of STOPS) expect(palette(s.p).zenith.map((v) => Math.round(v * 255))).toEqual(s.pal.zenith.map((v) => Math.round(v * 255)));
  });
  it('is monotone per channel between neighbouring stops', () => {
    for (let i = 0; i < STOPS.length - 1; i++) {
      const a = STOPS[i], b = STOPS[i + 1];
      for (const key of ['zenith', 'horizon', 'rockLit'] as const) {
        for (let c = 0; c < 3; c++) {
          const dir = Math.sign(b.pal[key][c] - a.pal[key][c]);
          let prev = a.pal[key][c];
          for (let k = 1; k <= 10; k++) {
            const v = palette(a.p + ((b.p - a.p) * k) / 10)[key][c];
            expect((v - prev) * dir).toBeGreaterThanOrEqual(-1e-9);
            prev = v;
          }
        }
      }
    }
  });
  it('mixes in linear light and grades toward sepia', () => {
    expect(mixRGB(hex('#000000'), hex('#ffffff'), 0.5)[0]).toBeGreaterThan(0.7); // linear midpoint is bright in sRGB
    const g = grade(hex('#2c5a8f'));
    expect(g[0]).toBeGreaterThan(hex('#2c5a8f')[0]); // warmer
    expect(lum(NIGHT.zenith)).toBeLessThan(lum(palette(0.5).zenith));
  });
});

describe('slope path', () => {
  it('lengths and end angles match the design table', () => {
    const land = buildPath(PATHS.landscape), port = buildPath(PATHS.portrait);
    expect(land.length).toBeGreaterThan(1.30 * 0.95);
    expect(land.length).toBeLessThan(1.30 * 1.05);
    expect(port.length).toBeGreaterThan(0.77 * 0.82 * 0.95);
    expect(port.length).toBeLessThan(0.77 * 0.82 * 1.05);
    expect(Math.abs(land.angleAt(0) - 22)).toBeLessThan(1);
    expect(Math.abs(land.angleAt(0.999) - 36)).toBeLessThan(1.5);
    expect(Math.abs(port.angleAt(0) - 28)).toBeLessThan(1);
    expect(Math.abs(port.angleAt(0.999) - 48)).toBeLessThan(1.5);
  });
  it('at/groundY agree and s beyond 1 runs onto the plateau', () => {
    const p = buildPath(PATHS.landscape);
    for (const s of [0.1, 0.4, 0.8]) { const pt = p.at(s); expect(Math.abs(p.groundY(pt.x) - pt.y)).toBeLessThan(1e-3); }
    expect(p.at(1).x).toBeCloseTo(1.24, 3);
    expect(p.at(p.plateauEndS).x).toBeCloseTo(1.50, 3);
  });
  it('layout rule', () => {
    expect(layoutFor(1440, 900).layout).toBe('landscape');
    expect(layoutFor(390, 844).layout).toBe('portrait');
    const l = layoutFor(1440, 900);
    expect(l.S).toBe(900);
    expect(l.ox).toBeCloseTo((1440 - 1.6 * 900) / 2);
    expect(l.oy).toBe(0);
  });
  it('portrait lifts the climb above the control bar (review S2)', () => {
    const l = layoutFor(390, 844);
    const path = buildPath(PATHS.portrait);
    const baseFromBottom = l.oy + path.at(0).y * l.S;
    expect(baseFromBottom).toBeGreaterThan(0.2 * 844);
    const summitFromTop = 844 - l.oy - path.at(1).y * l.S;
    expect(summitFromTop).toBeGreaterThan(0.3 * 844); // below the readout band
    expect(FIGURE_H.portrait * l.S).toBeGreaterThanOrEqual(70);
    // the stone resting on the plateau stays on screen
    expect(l.ox + 0.75 * l.S).toBeLessThanOrEqual(390); // standing px on a 390 px phone
  });
});

describe('progress → boulder position (pure mapping)', () => {
  const path = buildPath(PATHS.landscape);
  const H = 0.085, R = BODY.boulderR * H, L = path.length;
  it('maps 0 to the start and 1 to the summit lip, monotonically', () => {
    expect(boulderS(0, H, R, L)).toBeCloseTo(startS(H, R, L));
    expect(boulderS(1, H, R, L)).toBeCloseTo(summitS(R, L));
    let prev = -1;
    for (let i = 0; i <= 100; i++) { const s = boulderS(i / 100, H, R, L); expect(s).toBeGreaterThan(prev); prev = s; }
  });
  it('e(p) is faster early and slower late', () => {
    expect(easeProgress(0.1)).toBeGreaterThan(0.1);
    expect(easeProgress(0.9)).toBeGreaterThan(0.9);
    expect(easeProgress(1) - easeProgress(0.95)).toBeLessThan(0.05);
    expect(easeProgress(-1)).toBe(0);
  });
  it('the sun ends just above and behind the summit', () => {
    const summit = { x: 1000, y: 200 };
    const s1 = sunPosition(1, 1440, 900, 600, summit, 'landscape');
    expect(s1.x).toBeGreaterThan(summit.x);
    expect(s1.y).toBeLessThan(summit.y);
    expect(sunPosition(0, 1440, 900, 600, summit, 'landscape')).toEqual({ x: 144, y: 600 });
  });
});

describe('rig', () => {
  const S = 900; // px per world unit for tolerance checks
  it('twoBoneIK reaches a reachable target', () => {
    const j = twoBoneIK({ x: 0, y: 0 }, { x: 1, y: 0.5 }, 0.8, 0.7, (a, b) => (a.y > b.y ? a : b));
    expect(Math.hypot(j.x, j.y)).toBeCloseTo(0.8, 6);
    expect(Math.hypot(1 - j.x, 0.5 - j.y)).toBeCloseTo(0.7, 6);
  });
  for (const layout of ['landscape', 'portrait'] as const) {
    it(`${layout}: hands on the stone, feet on the slope, knees uphill, lean in range through the cycle`, () => {
      const path = buildPath(PATHS[layout]);
      const H = FIGURE_H[layout];
      const R = BODY.boulderR * H;
      for (const p of [0, 0.25, 0.5, 0.9, 1]) {
        const sB = boulderS(p, H, R, path.length);
        for (let i = 0; i < 40; i++) {
          const phi = i / 40;
          const lean = leanDeg(phi);
          expect(lean).toBeGreaterThanOrEqual(42);
          expect(lean).toBeLessThanOrEqual(50);
          const r = solvePush({ path, H, sB, phi, lean, hip: hipH(phi), surge: surge(phi), tremor: 0, headTilt: lean - 18, breath: 1 });
          const bc = boulderCentre(path, sB, R);
          handAngles(path, sB).forEach((deg, k) => {
            const t = handTarget(bc, R, H, deg);
            expect(Math.hypot(r.pose.arms[k].end.x - t.x, r.pose.arms[k].end.y - t.y) * S).toBeLessThan(0.5);
          });
          r.pose.legs.forEach((leg, k) => {
            const ft = footTarget(phi + (k === 0 ? 0 : 0.5));
            if (ft.lift === 0) expect(Math.abs(leg.end.y - path.groundY(leg.end.x)) * S).toBeLessThan(0.5);
            // knee forward (uphill) of the hip→foot line
            const t = path.tangentAt(sB);
            const mid = { x: (leg.root.x + leg.end.x) / 2, y: (leg.root.y + leg.end.y) / 2 };
            expect((leg.joint.x - mid.x) * t.x + (leg.joint.y - mid.y) * t.y).toBeGreaterThanOrEqual(-1e-9);
          });
          // elbows below the shoulder→hand line, arms bent a little
          for (const arm of r.pose.arms) {
            const lineY = arm.root.y + ((arm.joint.x - arm.root.x) / (arm.end.x - arm.root.x || 1e-9)) * (arm.end.y - arm.root.y);
            expect(arm.joint.y).toBeLessThanOrEqual(lineY + 1e-9);
          }
        }
      }
    });
  }
  it('stand and sit poses keep feet on the ground', () => {
    const path = buildPath(PATHS.landscape);
    const H = FIGURE_H.landscape, R = BODY.boulderR * H;
    const plateauMid = 1 + (0.02 + 0.2 * H + R) / path.length;
    const bc = boulderCentre(path, plateauMid, R);
    const st = solveStand(path, H, bc.x - R - 0.14 * H, bc, { sway: 0, breath: 1 });
    for (const l of st.legs) expect(Math.abs(l.end.y - path.groundY(l.end.x)) * 900).toBeLessThan(1);
    // review S4/S5: both feet (standing) and the seat (sitting) are on the plateau, not the slope
    for (const l of st.legs) expect(l.end.x).toBeGreaterThanOrEqual(path.spec.p3.x);
    expect(bc.x + R).toBeLessThanOrEqual(path.spec.plateauEnd.x);
    const sit = solveSit(path, H, bc, 1);
    expect(sit.pelvis.x).toBeGreaterThanOrEqual(path.spec.p3.x - 0.02);
    expect(sit.facing).toBe(-1);
    expect(sit.pelvis.y - path.groundY(sit.pelvis.x)).toBeLessThan(0.1 * H);
  });
});
