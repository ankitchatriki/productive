// The set pieces on the engine (ROUND5_SISYPHUS §6): the summit push and stand, the seated break, the next climb's
// ramp, reduced motion — stub canvas, real engine.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installStubs, makeEngine, removeStubs, run } from './testkit/engineStub';
import { PACE_M } from '../../domain/mountain';
import type { ClimbInput } from './types';
import { WALK, dist, handPoint, type Skel } from './walk';
import { BODY } from './body';

beforeAll(installStubs);
afterAll(removeStubs);

const lenM = 1500 * PACE_M;
const climb1 = (posM: number, atSummit = false): ClimbInput => ({ stage: 1, stageStartM: 0, stageLenM: lenM, posM, fromSummit: false, summits: atSummit ? 1 : 0, atSummit });
type Stats = Record<string, unknown>;
const sk = (s: Stats) => s.skel as Skel;

describe('the summit beat (§6.1)', () => {
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    it(`${w}×${h}: on screen throughout, standing ≤ 7 s after the chime, the walk eases to a stop (no step), hand on its wrist`, async () => {
      const e = await makeEngine(w, h);
      let f = 1500 - 4;
      e.setClimb!(climb1(f * PACE_M)); e.setProgress(f / 1500); e.setPhase('focus', { instant: true });
      for (let k = 0; k < 4; k++) { f++; e.setClimb!(climb1(f * PACE_M)); run(1); }
      e.setClimb!(climb1(lenM, true)); e.setProgress(0); e.setPhase('complete');
      const seen: Stats[] = [];
      run(10, (s) => seen.push({ ...s }), e.stats as unknown as Stats);
      const t0 = seen[0].clock as number;
      const iStand = seen.findIndex((s) => s.gait === 'stand');
      expect(iStand).toBeGreaterThan(0);
      console.log(`${w}×${h}: standing ${((seen[iStand].clock as number) - t0).toFixed(2)} s after the chime`);
      expect((seen[iStand].clock as number) - t0).toBeLessThanOrEqual(7);
      let maxDv = 0, worstGap = 0;
      for (let i = 0; i < seen.length; i++) {
        const s = seen[i];
        const [x0, y0, x1, y1] = s.figBounds as number[];
        expect(x0).toBeGreaterThanOrEqual(0); expect(x1).toBeLessThanOrEqual(w);
        expect(y0).toBeGreaterThanOrEqual(0); expect(y1).toBeLessThanOrEqual(h);
        // the near hand is built from its wrist on every frame (gap 0)
        expect(dist(sk(s).arms[0].wrist, handPoint(sk(s).hands[0], BODY.wristLocal, 1))).toBeLessThan(1e-9);
        if (s.gait !== "stand") worstGap = Math.max(worstGap, Math.abs(dist(handPoint(sk(s).hands[0], { x: 0, y: 0 }, 1), s.centre as never) - WALK.R));
        if (i > 1) {
          const v = (s.D as number) - (seen[i - 1].D as number), u = (seen[i - 1].D as number) - (seen[i - 2].D as number);
          expect(v).toBeGreaterThanOrEqual(-1e-12); // never backwards
          maxDv = Math.max(maxDv, Math.abs(v - u));
        }
      }
      expect(maxDv).toBeLessThan(0.0005); // speed changes smoothly (≤ 0.03 H/s per frame)
      console.log(`near palm off the stone ≤ ${(worstGap * (e.stats.Hpx as number)).toFixed(2)} px`);
      e.destroy();
    }, 30_000);
  }

  it('the stand is alive: breath and a weight shift move the figure (never frozen for 20 s)', async () => {
    const e = await makeEngine(1440, 900);
    e.setClimb!(climb1(lenM, true)); e.setProgress(0); e.setPhase('complete', { instant: true });
    const xs: number[] = [];
    run(20, (s) => xs.push(sk(s).pelvis.x), e.stats as unknown as Stats);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.01);
    e.destroy();
  });
});

describe('the break (§6.2)', () => {
  it('seated: the whole figure is on screen at 1440×900 and 390×844', async () => {
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      const e = await makeEngine(w, h);
      e.setClimb!(climb1(lenM, true)); e.setProgress(0.2); e.setPhase('break', { instant: true });
      const seen: Stats[] = [];
      run(2, (s) => seen.push({ ...s }), e.stats as unknown as Stats);
      expect(seen.length).toBeGreaterThan(10);
      for (const s of seen) {
        expect(s.gait).toBe('sit');
        const [x0, y0, x1, y1] = s.figBounds as number[];
        expect(x0).toBeGreaterThanOrEqual(0); expect(y0).toBeGreaterThanOrEqual(0);
        expect(x1).toBeLessThanOrEqual(w); expect(y1).toBeLessThanOrEqual(h);
      }
      e.destroy();
    }
  });
});

describe('reduced motion (§6.5)', () => {
  it('while climbing the still is re-posed every 10 s, in the toe-off key pose (φ 0.62), the stone turned to match', async () => {
    const g = globalThis as unknown as { window: { setTimeout: (f: () => void, ms: number) => number } };
    const delays: number[] = [];
    const saved = g.window.setTimeout;
    g.window.setTimeout = (_f, ms) => { delays.push(ms); return 1; };
    const e = await makeEngine(1440, 900, true);
    e.setClimb!(climb1(lenM * 0.5)); e.setProgress(0.5); e.setPhase('focus', { instant: true });
    e.setRunning(true);
    expect(delays[delays.length - 1]).toBe(10000);
    const a = { rot: e.stats.rot!, phi: sk(e.stats as unknown as Stats) as Skel };
    e.setClimb!(climb1(lenM * 0.5 + 10 * PACE_M)); e.setRunning(true);
    expect(e.stats.rot!).toBeGreaterThan(a.rot);
    const D = e.stats.D!;
    const legPhase = ((Math.floor(D / WALK.L) + 0.62) * WALK.L) / WALK.L % 1;
    expect(legPhase).toBeCloseTo(0.62, 9);
    e.destroy();
    g.window.setTimeout = saved;
  });
});
