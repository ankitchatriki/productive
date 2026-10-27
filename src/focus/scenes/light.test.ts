import { describe, expect, it } from 'vitest';
import { LIGHT_STOPS, lightState } from './light';

describe('light model (ROUND3_DESIGN §3.2)', () => {
  it('lightState is continuous: no channel jumps more than 5% between progress steps of 0.01', () => {
    // In focus, paletteP = 0.86·p (the 0.86 → 1 range is the time-driven summit beat).
    let prev = lightState(0);
    const span = { rim: 1, rimW: 3, shadowLen: 4, haze: 1, warmth: 2 };
    for (let i = 1; i <= 100; i++) {
      const cur = lightState(0.86 * (i / 100));
      for (const c of [0, 1, 2]) {
        expect(Math.abs(cur.key[c] - prev.key[c])).toBeLessThanOrEqual(0.05);
        expect(Math.abs(cur.ambient[c] - prev.ambient[c])).toBeLessThanOrEqual(0.05);
      }
      for (const k of Object.keys(span) as Array<keyof typeof span>) expect(Math.abs(cur[k] - prev[k]) / span[k]).toBeLessThanOrEqual(0.05);
      prev = cur;
    }
  });
  it('hits the keyframes exactly and golden hour has a wider, stronger rim than noon', () => {
    for (const s of LIGHT_STOPS) expect(lightState(s.p).rim).toBeCloseTo(s.v.rim, 6);
    expect(lightState(0.86 * 0.95).rim).toBeGreaterThan(lightState(0.43).rim);
    expect(lightState(0.86 * 0.95).rimW).toBeGreaterThan(lightState(0.43).rimW);
    expect(lightState(0).shadowLen).toBeGreaterThan(lightState(0.43).shadowLen * 4);
  });
});
