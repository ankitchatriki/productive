import { describe, expect, it } from 'vitest';
import { STOPS, palette, mixRGB, grade, hex, lum, NIGHT } from './palette';
import { FIGURE_H, PATHS, boulderS, buildPath, easeProgress, layoutFor, startS, summitS, sunPosition } from './path';

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
  const H = 0.085, R = 0.56 * H, L = path.length;
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
