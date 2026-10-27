// The Sisyphus engine driven frame by frame on a stub canvas (no pixels): transitions keep the figure on screen and
// the slope in frame, +5 at the summit never leaves the summit, reduced motion draws ranges and clouds (U2, U3, U5,
// U8, U11).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClimbInput } from './types';
import { M_PER_H, PACE_M, SUMMIT_TO_COL } from '../../domain/mountain';

import { installStubs, removeStubs, run, makeEngine } from './testkit/engineStub';

beforeAll(installStubs);
afterAll(removeStubs);

const lenM = 1500 * PACE_M;
const climb1 = (posM: number, atSummit = false): ClimbInput => ({ stage: 1, stageStartM: 0, stageLenM: lenM, posM, fromSummit: false, summits: atSummit ? 1 : 0, atSummit });
const climb2: ClimbInput = { stage: 2, stageStartM: lenM + SUMMIT_TO_COL * M_PER_H, stageLenM: lenM, posM: lenM + SUMMIT_TO_COL * M_PER_H, fromSummit: true, summits: 1, atSummit: false };

const engine = (reduced = false) => makeEngine(1440, 900, reduced);

describe('engine transitions (stub canvas)', () => {
  it('the next climb is a clean cut: every frame has the figure on screen, fully drawn, with the slope in frame', async () => {
    const e = await engine();
    e.setClimb!(climb1(lenM, true)); e.setProgress(0.05); e.setPhase('complete', { instant: true });
    run(1);
    e.setClimb!(climb2); e.setProgress(0); e.setPhase('focus');
    const seen: Array<Record<string, unknown>> = [];
    run(4, (s) => seen.push({ ...s }), e.stats as unknown as Record<string, unknown>);
    expect(seen.length).toBeGreaterThan(100);
    for (const s of seen) {
      expect(s.figureAlpha).toBe(1);
      expect(s.figureOnScreen).toBe(true);
      expect(s.zoom).toBe(1);
      expect(s.slopeFrac as number).toBeGreaterThan(0.2);
      expect(s.slopeFrac as number).toBeLessThan(0.8);
    }
    e.destroy();
  });

  it('+5 from the summit stays on the summit: same framing, no climbing, figure standing', async () => {
    const e = await engine();
    e.setClimb!(climb1(lenM * 0.999)); e.setProgress(0.999); e.setPhase('focus', { instant: true });
    run(1);
    e.setClimb!(climb1(lenM, true)); e.setProgress(0); e.setPhase('complete');
    run(12);
    const camAtTop = e.stats.camX;
    expect(e.stats.gait).toBe('stand');
    e.setClimb!(climb1(lenM, true)); e.setProgress(0); e.setPhase('focus');
    run(5, (s) => { expect(s.gait).toBe('stand'); expect(s.camX).toBeCloseTo(camAtTop!, 6); expect(s.figureAlpha).toBe(1); }, e.stats as unknown as Record<string, unknown>);
    e.setPhase('complete'); // the extension ends
    run(2, (s) => expect(s.gait).toBe('stand'), e.stats as unknown as Record<string, unknown>);
    e.destroy();
  });

  it('an open-ended block’s hourly summit plays the summit walk, then cuts to the col with the figure in frame', async () => {
    const e = await engine();
    e.setClimb!(climb1(lenM * 0.998)); e.setProgress(0.99); e.setPhase('open', { instant: true });
    run(1);
    e.setClimb!(climb1(lenM, true));
    run(6);
    expect(['summit', 'stand']).toContain(e.stats.gait);
    e.setClimb!(climb2);
    run(2, (s) => { expect(s.figureAlpha).toBe(1); expect(s.figureOnScreen).toBe(true); expect(s.slopeFrac as number).toBeGreaterThan(0.2); }, e.stats as unknown as Record<string, unknown>);
    expect(e.stats.gait).not.toBe('stand');
    e.destroy();
  });

  it('reduced motion: the still draws all three ranges and the clouds', async () => {
    const e = await engine(true);
    e.setClimb!(climb1(lenM * 0.4)); e.setProgress(0.4); e.setPhase('focus', { instant: true });
    expect(e.stats.rangesDrawn).toBe(3);
    expect(e.stats.cloudsDrawn as number).toBeGreaterThanOrEqual(3);
    expect(e.stats.frames).toBeGreaterThan(0);
    e.destroy();
  });
});
