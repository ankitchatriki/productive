import { describe, expect, it } from 'vitest';
import { birdSchedule, birdsAt } from './ambient';

describe('birds (ROUND6 §6.3)', () => {
  it('groups of 1–3, every 35–80 s, crossing in 25–45 s; deterministic', () => {
    const s = birdSchedule(4242);
    expect(s[0].start).toBeLessThan(100);
    for (let i = 1; i < s.length; i++) { const gap = s[i].start - s[i - 1].start; expect(gap).toBeGreaterThanOrEqual(35); expect(gap).toBeLessThanOrEqual(80); }
    for (const g of s) { expect(g.n).toBeGreaterThanOrEqual(1); expect(g.n).toBeLessThanOrEqual(3); expect(g.dur).toBeGreaterThanOrEqual(25); expect(g.dur).toBeLessThanOrEqual(45); }
    expect(new Set(s.map((g) => g.n)).size).toBeGreaterThan(1);
    expect(birdSchedule(4242)).toEqual(s);
  });
  it('they glide right to left high in the sky, only during their window, flapping now and then', () => {
    const g = birdSchedule(4242)[0];
    expect(birdsAt(g, g.start - 1, 1440, 900, 900)).toEqual([]);
    const a = birdsAt(g, g.start + 2, 1440, 900, 900), b = birdsAt(g, g.start + g.dur - 2, 1440, 900, 900);
    expect(a.length).toBe(g.n);
    expect(b[0].x).toBeLessThan(a[0].x);
    for (const q of a) expect(q.y).toBeLessThan(900 * 0.4);
    const wings = Array.from({ length: 600 }, (_, i) => birdsAt(g, g.start + i * 0.05, 1440, 900, 900)[0].wing);
    expect(Math.max(...wings)).toBeGreaterThan(15); expect(wings.filter((x) => x === 6).length).toBeGreaterThan(300); // mostly gliding
  });
});
