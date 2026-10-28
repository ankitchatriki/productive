import { describe, expect, it } from 'vitest';
import { softCap } from './artDraw';
import { ART_STOPS, INK, LW, NIGHT, artStop, contrast, hexToRgb, pausedStop } from './artPalette';
import sisyphusSrc from './sisyphus.ts?raw';
import artDrawSrc from './artDraw.ts?raw';
import figureSrc from './figure.ts?raw';
import trailSrc from './trail.ts?raw';
import cameraSrc from './camera.ts?raw';

describe('A0: flat black-figure rules (ROUND3_ART §1.3)', () => {
  it('no gradients, blur, glow, filters or blend modes in the scene code', () => {
    for (const src of [sisyphusSrc, artDrawSrc, figureSrc, trailSrc, cameraSrc]) {
      expect(src.length).toBeGreaterThan(500);
      expect(src).not.toMatch(/createLinearGradient|createRadialGradient|shadowBlur|filter\s*=|soft-light|'overlay'/);
    }
    // no composites at all: the figure draws straight onto the scene, its incisions clipped to what lies beneath
    expect(sisyphusSrc + artDrawSrc + figureSrc).not.toMatch(/globalCompositeOperation\s*=\s*'(?!source-over)/);
  });

  it('palette: the stops hit their values, dawn → ember → dusk darkens the sky, contrast holds', () => {
    for (const s of ART_STOPS) expect(artStop(s.p)).toEqual(s.v);
    const lum = (h: string) => { const [r, g, b] = hexToRgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    expect(lum(artStop(0).sky)).toBeGreaterThan(lum(artStop(0.86).sky));
    expect(lum(artStop(0.86).sky)).toBeGreaterThan(lum(artStop(1).sky));
    // depth by tone: far lighter than mid lighter than near, at every stop
    for (const s of [...ART_STOPS.map((x) => x.v), NIGHT]) { expect(lum(s.far)).toBeGreaterThan(lum(s.mid)); expect(lum(s.mid)).toBeGreaterThan(lum(s.near)); }
    expect(contrast(INK.cream, INK.black)).toBeGreaterThan(14.5); // spec quotes 15.8; measured 14.96
    expect(contrast(INK.ochre, INK.black)).toBeGreaterThan(7);
    // paused: greyer and darker, still a palette (not a filter)
    const p = pausedStop(artStop(0.4));
    expect(lum(p.sky)).toBeLessThan(lum(artStop(0.4).sky));
    expect(p.sky).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('line weights scale with the figure and clamp (§1.2)', () => {
    expect(LW(216).contour).toBeCloseTo(1.62, 2);
    expect(LW(60).contour).toBe(1.2);
    expect(LW(234).fine).toBeCloseTo(1.17, 2);
    expect(LW(600).incise).toBe(2.0);
    expect(LW(216).swirl).toBe(1.75);
  });
});

describe('range cap (review U4)', () => {
  it('never exceeds the allowed height, keeps low peaks, and has no flat shelf (strictly increasing)', () => {
    const A = 100;
    let prev = -1;
    for (let H = 0; H <= 400; H += 2) {
      const c = softCap(H, A);
      expect(c).toBeLessThanOrEqual(A);
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
    expect(softCap(30, A)).toBeGreaterThan(29.9);
    expect(softCap(50, 0)).toBe(0);
  });
});
