// The never-ending mountain through the reducer (ROUND3_ART §6): progress is kept, never lost; summits lead to cols.
import { describe, expect, it } from 'vitest';
import { reducer } from './reducer';
import type { Action } from './actions';
import { at, course, data, section } from '../domain/fixtures';
import { climbFor, liveClimb } from '../domain/climb';
import { M_PER_H, PACE_M, PREFIX_LEN, SUMMIT_TO_COL, buildStage, stageAt, stageHeading } from '../domain/mountain';
import type { AppData } from '../domain/types';

const T = (min: number, sec = 0) => new Date(at(2026, 10, 27, 14, 0).getTime() + min * 60_000 + sec * 1000).toISOString();
const target = { courseId: 'c1', sectionId: 's1', note: '' };
const base = () => data({ courses: [course('c1')], sections: [section('s1', 'c1', 0)] });
const start = (now: string, blockMinutes: number | null = 25): Action => ({ type: 'focus/start', now, id: 'f', target, blockMinutes, choice: blockMinutes === null ? 'open' : 'preset', scene: 'sisyphus', immersive: true });
const run = (s: AppData, ...as: Action[]) => as.reduce(reducer, s);

describe('mountain bookkeeping (schema v3)', () => {
  it('a block start begins climb 1 at the foot; focused time moves the climber at the pace', () => {
    const s = run(base(), start(T(0)));
    expect(s.mountain).toMatchObject({ stage: 1, stageStartM: 0, fromSummit: false, atSummit: false });
    const c = climbFor(s.mountain, s.focus, new Date(T(10)));
    expect(c.posM).toBeCloseTo(600 * PACE_M, 6);
    expect(c.stageLenM).toBeCloseTo(1500 * PACE_M, 6);
    expect(c.altM).toBeGreaterThan(0);
  });

  it('clock out mid-block keeps progress; the next block resumes at the same posM with no col prefix', () => {
    const a = run(base(), start(T(0)), { type: 'timer/stop', now: T(10), newEntryId: 'e1' });
    expect(a.focus).toBeNull();
    expect(a.mountain.posM).toBeCloseTo(600 * PACE_M, 2);
    expect(a.mountain.atSummit).toBe(false);
    const b = run(a, start(T(30)));
    expect(b.mountain).toMatchObject({ stage: 2, fromSummit: false });
    expect(b.mountain.stageStartM).toBeCloseTo(a.mountain.posM, 6);
    expect(climbFor(b.mountain, b.focus, new Date(T(30))).posM).toBeCloseTo(a.mountain.posM, 6);
    expect(b.mountain.stageStartAltM).toBeCloseTo(a.mountain.altM, 6);
  });

  it('pause, the 60 s save and exiting keep progress too', () => {
    const p = run(base(), start(T(0)), { type: 'focus/pause', now: T(5), newEntryId: 'e' });
    expect(p.mountain.posM).toBeCloseTo(300 * PACE_M, 2);
    expect(p.mountain.stageStartM).toBe(0);
    const r = run(p, { type: 'focus/resume', now: T(8) }, { type: 'mountain/sync', now: T(10) });
    expect(r.mountain.posM).toBeCloseTo(420 * PACE_M, 2);
    const e = run(r, { type: 'focus/end', now: T(12) });
    expect(e.mountain.posM).toBeCloseTo(540 * PACE_M, 2);
  });

  it('extending never moves the climber backward and makes the climb longer', () => {
    const s = run(base(), start(T(0)));
    const before = climbFor(s.mountain, s.focus, new Date(T(20)));
    const x = run(s, { type: 'focus/extend', now: T(20), minutes: 10 });
    const after = climbFor(x.mountain, x.focus, new Date(T(20)));
    expect(after.posM).toBeCloseTo(before.posM, 6);
    expect(after.stageLenM).toBeGreaterThan(before.stageLenM);
    let prev = 0;
    for (let m = 0; m <= 35; m += 0.5) { const c = climbFor(x.mountain, x.focus, new Date(T(m))); expect(c.posM).toBeGreaterThanOrEqual(prev); prev = c.posM; }
  });

  it('completing reaches the summit; the next block starts in the col beyond it (fromSummit)', () => {
    const done = run(base(), start(T(0)), { type: 'focus/complete', at: T(25) });
    expect(done.mountain).toMatchObject({ atSummit: true, summits: 1 });
    expect(done.mountain.posM).toBeCloseTo(1500 * PACE_M, 2);
    const next = run(done, { type: 'focus/nextBlock', now: T(26) });
    expect(next.mountain).toMatchObject({ stage: 2, fromSummit: true, atSummit: false, summits: 1 });
    expect(next.mountain.stageStartM).toBeCloseTo(done.mountain.posM + SUMMIT_TO_COL * M_PER_H, 2);
    // the col is below the summit but above the foot
    expect(next.mountain.stageStartAltM).toBeLessThan(done.mountain.altM);
    expect(next.mountain.stageStartAltM).toBeGreaterThan(0);
  });

  it('+5 from the summit keeps him on it: no new crest, no distance from overtime or the extension (U2)', () => {
    const done = run(base(), start(T(0)), { type: 'focus/complete', at: T(25) });
    const atTop = climbFor(done.mountain, done.focus, new Date(T(33)));
    const x = run(done, { type: 'focus/extend', now: T(33), minutes: 5 });
    expect(x.mountain).toEqual(done.mountain);
    for (const m of [33, 34.5, 36, 38]) {
      const c = climbFor(x.mountain, x.focus, new Date(T(m)));
      expect(c).toMatchObject({ stage: atTop.stage, stageStartM: atTop.stageStartM, stageLenM: atTop.stageLenM, posM: atTop.posM, atSummit: true });
    }
    // saves, pauses and the extension ending change nothing; the next block starts in the col beyond this summit
    const y = run(x, { type: 'mountain/sync', now: T(35) }, { type: 'focus/complete', at: T(38) });
    expect(y.mountain).toEqual(done.mountain);
    const n = run(y, { type: 'focus/nextBlock', now: T(39) });
    expect(n.mountain.stageStartM).toBeCloseTo(done.mountain.posM + SUMMIT_TO_COL * M_PER_H, 2);
    expect(n.mountain.summits).toBe(1);
  });

  it('open-ended blocks climb a summit every 60 focused minutes; clock out folds them in', () => {
    const s = run(base(), start(T(0), null));
    const c = liveClimb(s.mountain, s.focus!, new Date(T(75)));
    expect(c.stage).toBe(2);
    expect(c.summits).toBe(1);
    expect(c.fromSummit).toBe(true);
    expect(c.stageStartM).toBeCloseTo(3600 * PACE_M + SUMMIT_TO_COL * M_PER_H, 2);
    const out = run(s, { type: 'timer/stop', now: T(75), newEntryId: 'e' });
    expect(out.mountain).toMatchObject({ stage: 2, summits: 1, fromSummit: true, atSummit: false });
    expect(out.mountain.posM).toBeCloseTo(c.posM, 2);
  });

  it('the stage seam matches: the next climb’s prefix is the previous summit’s back side (C0, heading jump < 1°)', () => {
    const lenH = (1500 * PACE_M) / M_PER_H;
    const prev = buildStage({ stage: 1, startH: 0, lenH, fromSummit: false });
    const next = buildStage({ stage: 2, startH: lenH + SUMMIT_TO_COL, lenH, fromSummit: true });
    const colPrev = stageAt(prev, lenH + SUMMIT_TO_COL), colNext = stageAt(next, 0);
    for (let d = 0; d <= PREFIX_LEN; d += 0.25) {
      const a = stageAt(prev, lenH + SUMMIT_TO_COL - d), b = stageAt(next, -d);
      expect(Math.hypot((a.x - colPrev.x) - (b.x - colNext.x), (a.y - colPrev.y) - (b.y - colNext.y))).toBeLessThan(0.02);
      expect(Math.abs(stageHeading(prev.spec, lenH + SUMMIT_TO_COL - d) - stageHeading(next.spec, -d))).toBeLessThan(1);
    }
    // and beyond the col the previous stage's look-ahead is the next stage's incline
    for (let d = 0; d <= 5; d += 0.5) expect(Math.abs(stageHeading(prev.spec, lenH + SUMMIT_TO_COL + d) - stageHeading(next.spec, d))).toBeLessThan(1);
  });
});
