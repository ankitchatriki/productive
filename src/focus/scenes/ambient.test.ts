import { describe, expect, it } from 'vitest';
import { birdSchedule, birdsAt, cameraDrift, cloudTargetAlpha } from './ambient';

describe('ambient layer (ROUND3 §3.6)', () => {
  it('camera drift stays within ±6 px at 1440 and is deterministic', () => {
    for (let t = 0; t < 300; t += 0.37) {
      const d = cameraDrift(t, 1440, 900);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(6);
      expect(Math.abs(d.y)).toBeLessThanOrEqual(2);
    }
    expect(cameraDrift(12.3, 1440, 900)).toEqual(cameraDrift(12.3, 1440, 900));
  });
  it('birds appear within 140 s at the fixed seed, then every 70–140 s, in 3–5s', () => {
    const s = birdSchedule(4242);
    expect(s[0].start).toBeLessThan(140);
    for (let i = 1; i < s.length; i++) { const gap = s[i].start - s[i - 1].start; expect(gap).toBeGreaterThanOrEqual(70); expect(gap).toBeLessThanOrEqual(140); }
    for (const g of s) { expect(g.n).toBeGreaterThanOrEqual(3); expect(g.n).toBeLessThanOrEqual(5); }
    expect(birdSchedule(4242)).toEqual(s);
  });
  it('birds fly right to left high in the sky, only during their window', () => {
    const g = birdSchedule(4242)[0];
    expect(birdsAt(g, g.start - 1, 1440, 900, 900)).toEqual([]);
    const a = birdsAt(g, g.start + 2, 1440, 900, 900), b = birdsAt(g, g.start + g.dur - 2, 1440, 900, 900);
    expect(a.length).toBe(g.n);
    expect(b[0].x).toBeLessThan(a[0].x);
    for (const q of a) expect(q.y).toBeLessThan(900 * 0.4);
  });
  it('clouds fade to 0.25 when they would sit behind the stone', () => {
    const stone = { x0: 600, y0: 300, x1: 700, y1: 400 };
    expect(cloudTargetAlpha(0.75, { x0: 650, y0: 350, x1: 900, y1: 420 }, [stone])).toBe(0.25);
    expect(cloudTargetAlpha(0.75, { x0: 100, y0: 100, x1: 300, y1: 150 }, [stone])).toBe(0.75);
  });
});
