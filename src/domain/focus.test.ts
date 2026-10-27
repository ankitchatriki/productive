import { describe, expect, it } from 'vitest';
import {
  blockEndsAt, blockProgress, blockRemainingMs, breakProgress, breakRemainingMs, clampBlockMinutes, clampBreakMinutes,
  focusInvariantErrors, focusTitle, focusedMs, formatCountdown, isBlockDue, isBreakOver, isStaleFocus, overtimeMs,
  plannedBlockNow, resolveBlockMinutes,
} from './focus';
import { at, data, iso } from './fixtures';
import { createWeekPlan } from './plan';
import type { FocusSession, ScheduledBlock } from './types';

const T0 = at(2026, 10, 27, 14, 0);
const plus = (min: number, sec = 0) => new Date(T0.getTime() + min * 60_000 + sec * 1000);

function session(extra: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 'f', target: { courseId: 'c1', sectionId: null, note: '' }, choice: 'preset', blockMinutes: 50,
    blockStartedAt: T0.toISOString(), focusedMsBefore: 0, segmentStartedAt: T0.toISOString(), phase: 'focus',
    completedAt: null, pausedAt: null, breakMinutes: null, breakStartedAt: null, breakEndsAt: null,
    blocksCompleted: 0, scene: 'daylight', immersive: true, ...extra,
  };
}

describe('block progress', () => {
  it('0, mid, exactly 1 and over', () => {
    const s = session();
    expect(blockProgress(s, T0)).toBe(0);
    expect(blockProgress(s, plus(25))).toBe(0.5);
    expect(blockProgress(s, plus(50))).toBe(1);
    expect(blockProgress(s, plus(70))).toBe(1);
    expect(blockRemainingMs(s, plus(70))).toBe(-20 * 60_000);
    expect(blockProgress(session({ phase: 'complete', completedAt: plus(50).toISOString() }), plus(10))).toBe(1);
  });
  it('after pause/resume: banked plus the new segment', () => {
    // 20 min focused, paused 15 min, resumed at T0+35.
    const s = session({ focusedMsBefore: 20 * 60_000, segmentStartedAt: plus(35).toISOString() });
    expect(focusedMs(s, plus(45))).toBe(30 * 60_000);
    expect(blockProgress(s, plus(45))).toBeCloseTo(0.6);
  });
  it('blockEndsAt shifts by the pause length', () => {
    expect(blockEndsAt(session())).toBe(plus(50).toISOString());
    const resumed = session({ focusedMsBefore: 20 * 60_000, segmentStartedAt: plus(35).toISOString() });
    expect(blockEndsAt(resumed)).toBe(plus(65).toISOString());
    expect(blockEndsAt(session({ phase: 'paused', segmentStartedAt: null, pausedAt: plus(5).toISOString() }))).toBeNull();
  });
  it('isBlockDue is false while paused even if wall time passed', () => {
    const paused = session({ phase: 'paused', segmentStartedAt: null, focusedMsBefore: 10 * 60_000, pausedAt: plus(10).toISOString() });
    expect(isBlockDue(paused, plus(200))).toBe(false);
    expect(isBlockDue(session(), plus(49, 59))).toBe(false);
    expect(isBlockDue(session(), plus(50))).toBe(true);
    expect(isBlockDue(session({ blockMinutes: null, choice: 'open' }), plus(500))).toBe(false);
  });
  it('open-ended loops every 60 focused minutes', () => {
    const s = session({ blockMinutes: null, choice: 'open' });
    expect(blockProgress(s, plus(30))).toBe(0.5);
    expect(blockProgress(s, plus(60))).toBe(0);
    expect(blockProgress(s, plus(75))).toBe(0.25);
    expect(blockRemainingMs(s, plus(10))).toBeNull();
  });
  it('extend from overtime (reducer rule: ceil(focused) + N) gives N left', () => {
    // 53 min focused (3 overtime), extend +10 → block 63 → 10:00 left.
    const extended = session({ blockMinutes: Math.ceil(focusedMs(session(), plus(53)) / 60_000) + 10 });
    expect(blockRemainingMs(extended, plus(53))).toBe(10 * 60_000);
  });
  it('overtime counts from completedAt in complete only', () => {
    const c = session({ phase: 'complete', completedAt: plus(50).toISOString() });
    expect(overtimeMs(c, plus(53))).toBe(3 * 60_000);
    expect(overtimeMs(session(), plus(53))).toBe(0);
  });
  it('a block started at 23:40 progresses normally across midnight', () => {
    const start = at(2026, 10, 27, 23, 40);
    const s = session({ blockStartedAt: start.toISOString(), segmentStartedAt: start.toISOString() });
    expect(blockProgress(s, at(2026, 10, 28, 0, 5))).toBe(0.5);
    expect(blockEndsAt(s)).toBe(at(2026, 10, 28, 0, 30).toISOString());
  });
});

describe('breaks', () => {
  const b = session({ phase: 'break', segmentStartedAt: null, breakMinutes: 10, breakStartedAt: plus(50).toISOString(), breakEndsAt: plus(60).toISOString() });
  it('progress, remaining and over', () => {
    expect(breakProgress(b, plus(55))).toBe(0.5);
    expect(breakRemainingMs(b, plus(55))).toBe(5 * 60_000);
    expect(isBreakOver(b, plus(59))).toBe(false);
    expect(isBreakOver(b, plus(60))).toBe(true);
    expect(breakRemainingMs(b, plus(62))).toBe(-2 * 60_000);
    expect(breakProgress(session(), plus(5))).toBe(0);
  });
  it('extend adds to the end and the length', () => {
    const ext = { ...b, breakEndsAt: plus(65).toISOString(), breakMinutes: 15 };
    expect(breakProgress(ext, plus(56))).toBeCloseTo(6 / 15);
    expect(isBreakOver(ext, plus(62))).toBe(false);
  });
});

describe('plannedBlockNow', () => {
  const blk = (id: string, date: string, s: number, e: number): ScheduledBlock => ({ id, date, startMin: s, endMin: e, courseId: 'c1', sectionId: null, label: '' });
  const withBlocks = (blocks: ScheduledBlock[]) => {
    const d = data();
    d.weekPlans['2026-10-26'] = { ...createWeekPlan('2026-10-26', d.settings, iso(2026, 10, 26)), blocks };
    return d;
  };
  it('none when there is no plan or no block', () => {
    expect(plannedBlockNow(data(), T0)).toBeNull();
    expect(plannedBlockNow(withBlocks([blk('a', '2026-10-27', 600, 660)]), T0)).toBeNull();
  });
  it('inside a block: floor of minutes left', () => {
    const d = withBlocks([blk('a', '2026-10-27', 13 * 60, 15 * 60)]);
    expect(plannedBlockNow(d, at(2026, 10, 27, 14, 22, 30))).toMatchObject({ minutesLeft: 37, block: { id: 'a' } });
  });
  it('null in the last 4 minutes', () => {
    const d = withBlocks([blk('a', '2026-10-27', 13 * 60, 15 * 60)]);
    expect(plannedBlockNow(d, at(2026, 10, 27, 14, 56))).toBeNull();
    expect(plannedBlockNow(d, at(2026, 10, 27, 14, 55))?.minutesLeft).toBe(5);
  });
  it('two blocks: the one that started latest', () => {
    const d = withBlocks([blk('a', '2026-10-27', 13 * 60, 16 * 60), blk('b', '2026-10-27', 13 * 60 + 30, 15 * 60)]);
    expect(plannedBlockNow(d, T0)?.block.id).toBe('b');
  });
  it('a block on another day does not count', () => {
    expect(plannedBlockNow(withBlocks([blk('a', '2026-10-28', 13 * 60, 15 * 60)]), T0)).toBeNull();
  });
  it('resolveBlockMinutes', () => {
    const d = withBlocks([blk('a', '2026-10-27', 13 * 60, 15 * 60)]);
    expect(resolveBlockMinutes({ kind: 'planned' }, d, T0, 50)).toBe(60);
    expect(resolveBlockMinutes({ kind: 'planned' }, data(), T0, 50)).toBe(50);
    expect(resolveBlockMinutes({ kind: 'preset', minutes: 25 }, d, T0, 50)).toBe(25);
    expect(resolveBlockMinutes({ kind: 'custom', minutes: 40 }, d, T0, 50)).toBe(40);
    expect(resolveBlockMinutes({ kind: 'open' }, d, T0, 50)).toBeNull();
  });
});

describe('clamps, stale rule, formatting', () => {
  it('clamps incl. NaN', () => {
    expect(clampBlockMinutes(3)).toBe(5);
    expect(clampBlockMinutes(500)).toBe(240);
    expect(clampBlockMinutes(42.6)).toBe(43);
    expect(clampBlockMinutes(NaN)).toBe(50);
    expect(clampBreakMinutes(0)).toBe(1);
    expect(clampBreakMinutes(99)).toBe(60);
    expect(clampBreakMinutes(NaN)).toBe(10);
  });
  it('isStaleFocus boundaries (6 h)', () => {
    const p = session({ phase: 'paused', segmentStartedAt: null, pausedAt: T0.toISOString() });
    expect(isStaleFocus(p, plus(360))).toBe(false);
    expect(isStaleFocus(p, plus(360, 1))).toBe(true);
    const b = session({ phase: 'break', segmentStartedAt: null, breakMinutes: 10, breakStartedAt: T0.toISOString(), breakEndsAt: plus(10).toISOString() });
    expect(isStaleFocus(b, plus(370))).toBe(false);
    expect(isStaleFocus(b, plus(370, 1))).toBe(true);
    expect(isStaleFocus(session(), plus(10000))).toBe(false);
  });
  it('formatCountdown', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(400)).toBe('0:01');
    expect(formatCountdown(59_400)).toBe('1:00');
    expect(formatCountdown(245_000)).toBe('4:05');
    expect(formatCountdown(3_600_000)).toBe('1:00:00');
    expect(formatCountdown(3_725_000)).toBe('1:02:05');
    expect(formatCountdown(-192_000)).toBe('+3:12');
  });
  it('focusTitle per phase', () => {
    expect(focusTitle(session(), plus(31, 40), 'OChem')).toBe('▶ 18:20 · OChem');
    expect(focusTitle(session({ blockMinutes: null }), plus(42, 10), 'OChem')).toBe('▶ 42:10 · OChem');
    expect(focusTitle(session({ phase: 'paused', segmentStartedAt: null, pausedAt: T0.toISOString() }), T0, 'OChem')).toBe('❚❚ Paused · OChem');
    expect(focusTitle(session({ phase: 'complete', completedAt: T0.toISOString() }), T0, 'OChem')).toBe('✓ Block done · OChem');
    const b = session({ phase: 'break', segmentStartedAt: null, breakMinutes: 5, breakStartedAt: T0.toISOString(), breakEndsAt: plus(5).toISOString() });
    expect(focusTitle(b, plus(0, 48), 'x')).toBe('☕ Break 4:12');
    expect(focusTitle(b, plus(6), 'x')).toBe('☕ Break over');
  });
  it('invariant checker', () => {
    const timer = { courseId: 'c1', sectionId: null, startedAt: T0.toISOString(), note: '' };
    expect(focusInvariantErrors(session(), timer)).toEqual([]);
    expect(focusInvariantErrors(session(), null).length).toBeGreaterThan(0);
    expect(focusInvariantErrors(session({ phase: 'paused', segmentStartedAt: null, pausedAt: null }), null).length).toBeGreaterThan(0);
  });
});
