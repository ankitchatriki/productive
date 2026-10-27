import { describe, expect, it } from 'vitest';
import { Motion, wind } from './motion';
import { makeChain, solveRest, stepChain } from './chain';

const run = (seed: number, seconds: number, cb?: (m: Motion, t: number) => void) => {
  const m = new Motion(seed);
  const dt = 1 / 30;
  for (let i = 0; i < seconds * 30; i++) {
    const t = i * dt;
    m.step(t, dt, { still: false, climb: 0.4, speed: 1, climbing: true });
    cb?.(m, t);
  }
  return m;
};

describe('motion v2 (ROUND3 §3.7)', () => {
  it('is deterministic: same seed ⇒ identical samples', () => {
    const a: number[] = [], b: number[] = [];
    run(20261027, 12, (m, t) => { const s = m.sample(t, false); a.push(s.phi, s.spring, s.breath, s.leanAdj); });
    run(20261027, 12, (m, t) => { const s = m.sample(t, false); b.push(s.phi, s.spring, s.breath, s.leanAdj); });
    expect(a).toEqual(b);
  });
  it('a big slip happens within the first 30 s at the fixed seed, and the stone rolls back then recovers', () => {
    let first = -1, minSpring = Infinity, after = -Infinity;
    run(20261027, 30, (m, t) => {
      const s = m.sample(t, false);
      if (s.bigSlip && first < 0) first = t;
      if (first >= 0 && t < first + 1) minSpring = Math.min(minSpring, s.spring);
      if (first >= 0 && t > first + 2 && t < first + 4) after = Math.max(after, s.spring);
    });
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(30);
    expect(minSpring).toBeLessThan(-0.012);    // visibly rolls back (beyond a normal slip)
    expect(after).toBeGreaterThan(0);          // and is pushed forward again
  });
  it('strain pauses hold the breath and the gait; the spring stays bounded and finite', () => {
    let held = false;
    run(7, 40, (m, t) => {
      const s = m.sample(t, false);
      expect(Number.isFinite(s.spring)).toBe(true);
      expect(Math.abs(s.spring)).toBeLessThan(0.08);
      if (s.strainK > 0.9) { held = true; expect(s.breath).toBeGreaterThan(1.009); }
    });
    expect(held).toBe(true);
  });
  it('wind is positive with gusts', () => {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < 600; t += 0.5) { const w = wind(t); lo = Math.min(lo, w); hi = Math.max(hi, w); }
    expect(lo).toBeGreaterThan(0);
    expect(hi / lo).toBeGreaterThan(1.8);
  });
});

describe('chains (ROUND3 §3.5)', () => {
  it('link lengths stay within ±1% over 10 s of motion, with no NaN', () => {
    const c = makeChain({ x: 0, y: 0 }, 4, 0.03, 25, 0.6);
    for (let i = 0; i < 600; i++) {
      const t = i / 60;
      const anchor = { x: 0.02 * Math.sin(t * 5), y: 0.01 * Math.cos(t * 3) };
      stepChain(c, anchor, { x: 0, y: -1 }, 1 / 60, 0.8, wind(t) * 6);
      for (let k = 1; k < c.p.length; k++) {
        const d = Math.hypot(c.p[k].x - c.p[k - 1].x, c.p[k].y - c.p[k - 1].y);
        expect(Number.isFinite(d)).toBe(true);
        expect(Math.abs(d - 0.03) / 0.03).toBeLessThan(0.01);
      }
    }
  });
  it('the cloth trails a moving anchor (follow-through) and settles at rest', () => {
    const c = makeChain({ x: 0, y: 0 }, 4, 0.03, 25, 0.6);
    for (let i = 0; i < 10; i++) stepChain(c, { x: (i + 1) * 0.004, y: 0 }, { x: 0, y: -1 }, 1 / 60, 0.8, 0);
    expect(c.p[4].x).toBeLessThan(c.p[0].x); // the tip lags behind the root
    solveRest(c, { x: 0, y: 0 }, { x: 0, y: -1 }, 0.8, 0);
    expect(Math.abs(c.p[4].x)).toBeLessThan(0.01);
  });
});
