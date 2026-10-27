import { describe, expect, it } from 'vitest';
import { reducer } from './reducer';
import type { Action } from './actions';
import { canEnterFocus, focusView } from './selectors';
import { defaultTimerTarget } from './timer';
import { at, course, data, entry, section } from '../domain/fixtures';
import { createWeekPlan } from '../domain/plan';
import { focusInvariantErrors } from '../domain/focus';
import type { AppData } from '../domain/types';

const T = (min: number, sec = 0) => new Date(at(2026, 10, 27, 14, 0).getTime() + min * 60_000 + sec * 1000).toISOString();
const target = { courseId: 'c1', sectionId: 's1', note: 'n' };
const base = () => data({ courses: [course('c1'), course('c2')], sections: [section('s1', 'c1', 0), section('s2', 'c1', 1)] });
const start = (blockMinutes: number | null = 50): Action => ({ type: 'focus/start', now: T(0), id: 'f', target, blockMinutes, choice: blockMinutes === null ? 'open' : 'preset', scene: 'daylight', immersive: true });

/** §4.2 invariants as a test helper. */
function assertFocusInvariants(s: AppData) {
  if (!s.focus) return;
  expect(focusInvariantErrors(s.focus, s.activeTimer)).toEqual([]);
  expect(s.courses.some((c) => c.id === s.focus!.target.courseId)).toBe(true);
}

describe('focus/start', () => {
  it('starts a timer and a session when idle', () => {
    const s = reducer(base(), start());
    expect(s.activeTimer).toEqual({ ...target, startedAt: T(0) });
    expect(s.focus).toMatchObject({ phase: 'focus', blockMinutes: 50, blockStartedAt: T(0), segmentStartedAt: T(0), focusedMsBefore: 0, blocksCompleted: 0 });
    assertFocusInvariants(s);
  });
  it('attaches to a running timer, taking its target', () => {
    const running = { ...base(), activeTimer: { courseId: 'c2', sectionId: null, note: 'x', startedAt: T(-30) } };
    const s = reducer(running, start());
    expect(s.activeTimer?.startedAt).toBe(T(-30));
    expect(s.focus?.target).toEqual({ courseId: 'c2', sectionId: null, note: 'x' });
  });
  it('no-op if a session exists', () => {
    const s = reducer(base(), start());
    expect(reducer(s, start(25))).toBe(s);
  });
});

describe('pause / resume', () => {
  it('pause creates an entry ending at the pause; resume starts a second one after the gap', () => {
    let s = reducer(base(), start());
    s = reducer(s, { type: 'focus/pause', now: T(20), newEntryId: 'p1' });
    expect(s.activeTimer).toBeNull();
    expect(s.entries.find((e) => e.id === 'p1')).toMatchObject({ start: T(0), end: T(20) });
    expect(s.focus).toMatchObject({ phase: 'paused', pausedAt: T(20), focusedMsBefore: 20 * 60_000, segmentStartedAt: null });
    assertFocusInvariants(s);
    s = reducer(s, { type: 'focus/resume', now: T(35) });
    expect(s.activeTimer).toEqual({ ...target, startedAt: T(35) });
    expect(s.focus).toMatchObject({ phase: 'focus', segmentStartedAt: T(35), pausedAt: null });
    s = reducer(s, { type: 'timer/stop', now: T(45), newEntryId: 'p2' });
    const p2 = s.entries.find((e) => e.id === 'p2')!;
    expect(Date.parse(p2.start) - Date.parse(T(20))).toBe(15 * 60_000);
  });
  it('a pause under 60 s discards the entry but banks progress', () => {
    let s = reducer(base(), start());
    s = reducer(s, { type: 'focus/pause', now: T(0, 40), newEntryId: 'p1' });
    expect(s.entries).toHaveLength(0);
    expect(s.focus?.focusedMsBefore).toBe(40_000);
  });
  it('guards: pause only in focus, resume only in paused', () => {
    const s = reducer(base(), start());
    expect(reducer(s, { type: 'focus/resume', now: T(1) })).toBe(s);
    const p = reducer(s, { type: 'focus/pause', now: T(5), newEntryId: 'x' });
    expect(reducer(p, { type: 'focus/pause', now: T(6), newEntryId: 'y' })).toBe(p);
  });
});

describe('complete / extend / nextBlock / break', () => {
  it('complete only from focus with a block length', () => {
    const s = reducer(base(), start());
    const c = reducer(s, { type: 'focus/complete', at: T(50) });
    expect(c.focus).toMatchObject({ phase: 'complete', completedAt: T(50) });
    expect(c.activeTimer).toEqual(s.activeTimer);
    expect(reducer(c, { type: 'focus/complete', at: T(51) })).toBe(c);
    const open = reducer(base(), start(null));
    expect(reducer(open, { type: 'focus/complete', at: T(60) })).toBe(open);
  });
  it('extend from overtime: +10 at 3 min over gives 10 min left', () => {
    let s = reducer(base(), start());
    s = reducer(s, { type: 'focus/complete', at: T(50) });
    s = reducer(s, { type: 'focus/extend', now: T(53), minutes: 10 });
    expect(s.focus).toMatchObject({ phase: 'focus', blockMinutes: 63, completedAt: null });
    expect(focusView(s, new Date(T(53)))!.remainingMs).toBe(10 * 60_000);
    const open = reducer(base(), start(null));
    expect(reducer(open, { type: 'focus/extend', now: T(5), minutes: 5 })).toBe(open);
  });
  it('keep going (nextBlock from complete) continues the same entry', () => {
    let s = reducer(base(), start());
    s = reducer(s, { type: 'focus/complete', at: T(50) });
    s = reducer(s, { type: 'focus/nextBlock', now: T(52) });
    expect(s.activeTimer?.startedAt).toBe(T(0));
    expect(s.focus).toMatchObject({ phase: 'focus', blocksCompleted: 1, blockMinutes: 50, blockStartedAt: T(52), focusedMsBefore: 0 });
    expect(reducer(reducer(base(), start()), { type: 'focus/nextBlock', now: T(5) }).focus?.blocksCompleted).toBe(0); // guard: no-op in focus
  });
  it('startBreak with stopAt = completedAt ends the entry at the block end', () => {
    let s = reducer(base(), start());
    s = reducer(s, { type: 'focus/complete', at: T(50) });
    s = reducer(s, { type: 'focus/startBreak', now: T(57), stopAt: T(50), newEntryId: 'b', minutes: 10 });
    expect(s.entries.find((e) => e.id === 'b')).toMatchObject({ start: T(0), end: T(50) });
    expect(s.activeTimer).toBeNull();
    expect(s.focus).toMatchObject({ phase: 'break', blocksCompleted: 1, breakMinutes: 10, breakStartedAt: T(57), breakEndsAt: T(67), completedAt: null });
    assertFocusInvariants(s);
  });
  it('extendBreak and nextBlock from break starts a new timer without double counting', () => {
    let s = reducer(base(), start(25));
    s = reducer(s, { type: 'focus/startBreak', now: T(25), stopAt: T(25), newEntryId: 'b', minutes: 5 });
    s = reducer(s, { type: 'focus/extendBreak', minutes: 5 });
    expect(s.focus).toMatchObject({ breakEndsAt: T(35), breakMinutes: 10 });
    s = reducer(s, { type: 'focus/nextBlock', now: T(36), blockMinutes: 50 });
    expect(s.activeTimer).toEqual({ ...target, startedAt: T(36) });
    expect(s.focus).toMatchObject({ phase: 'focus', blocksCompleted: 1, blockMinutes: 50, breakEndsAt: null });
    assertFocusInvariants(s);
  });
});

describe('interaction with v1 actions', () => {
  it('timer/stop clears the session; timer/switch updates the target', () => {
    let s = reducer(base(), start());
    s = reducer(s, { type: 'timer/switch', now: T(10), newEntryId: 'w', next: { courseId: 'c2', sectionId: null, note: '' } });
    expect(s.focus?.target).toEqual({ courseId: 'c2', sectionId: null, note: '' });
    expect(s.focus?.phase).toBe('focus');
    s = reducer(s, { type: 'timer/stop', now: T(20), newEntryId: 'z' });
    expect(s.focus).toBeNull();
  });
  it('course delete clears the session; section delete nulls the target section', () => {
    const paused = reducer(reducer(base(), start()), { type: 'focus/pause', now: T(0, 30), newEntryId: 'x' }); // discarded: no entries for c1
    expect(reducer(paused, { type: 'section/delete', id: 's1' }).focus?.target.sectionId).toBeNull();
    expect(reducer(paused, { type: 'course/delete', id: 'c1' }).focus).toBeNull();
  });
  it('setImmersive, setScene, end, settings', () => {
    let s = reducer(base(), start());
    s = reducer(s, { type: 'focus/setImmersive', immersive: false });
    expect(s.focus?.immersive).toBe(false);
    s = reducer(s, { type: 'focus/setScene', scene: 'sisyphus' });
    expect(s.focus?.scene).toBe('sisyphus');
    s = reducer(s, { type: 'focus/settings', patch: { breakMinutes: 15 } });
    expect(s.settings.focus.breakMinutes).toBe(15);
    expect(s.settings.focus.chime).toBe(true);
    s = reducer(s, { type: 'focus/end' });
    expect(s.focus).toBeNull();
    expect(s.activeTimer).not.toBeNull();
  });
  it('invariants hold through start → pause → resume → complete → break → nextBlock → extend → clock out', () => {
    const steps: Action[] = [
      start(),
      { type: 'focus/pause', now: T(10), newEntryId: 'a' },
      { type: 'focus/resume', now: T(15) },
      { type: 'focus/complete', at: T(55) },
      { type: 'focus/startBreak', now: T(56), stopAt: T(56), newEntryId: 'b', minutes: 10 },
      { type: 'focus/nextBlock', now: T(66) },
      { type: 'focus/extend', now: T(70), minutes: 5 },
      { type: 'timer/stop', now: T(80), newEntryId: 'c' },
    ];
    let s = base();
    for (const a of steps) { s = reducer(s, a); assertFocusInvariants(s); }
    expect(s.focus).toBeNull();
    expect(s.entries.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('selectors', () => {
  it('focusView per phase and canEnterFocus', () => {
    let s = reducer(base(), start());
    expect(focusView(base(), new Date(T(0)))).toBeNull();
    expect(focusView(s, new Date(T(25)))).toMatchObject({ phase: 'focus', progress: 0.5, remainingMs: 25 * 60_000, courseName: 'C1', sectionTitle: 's1', blockLabel: '50 min block' });
    s = reducer(s, { type: 'focus/pause', now: T(25), newEntryId: 'p' });
    expect(focusView(s, new Date(T(40)))).toMatchObject({ phase: 'paused', progress: 0.5, remainingMs: 25 * 60_000 });
    expect(canEnterFocus(s)).toBe(true);
    s = reducer(s, { type: 'focus/resume', now: T(40) });
    s = reducer(s, { type: 'focus/complete', at: T(65) });
    expect(focusView(s, new Date(T(68)))).toMatchObject({ phase: 'complete', progress: 1, overtimeMs: 3 * 60_000 });
    s = reducer(s, { type: 'focus/startBreak', now: T(68), stopAt: T(68), newEntryId: 'q', minutes: 10 });
    expect(focusView(s, new Date(T(73)))).toMatchObject({ phase: 'break', progress: 0.5, breakRemainingMs: 5 * 60_000, breakOver: false, blockLabel: '50 min block · Block 2' });
    expect(focusView(s, new Date(T(79)))!.breakOver).toBe(true);
    expect(canEnterFocus(base())).toBe(false);
  });
});

describe('defaultTimerTarget prefers the planned block active now', () => {
  it('uses the block course and its section', () => {
    const d = base();
    const plan = createWeekPlan('2026-10-26', d.settings, T(0));
    plan.sectionByDay['2026-10-27'] = 's1';
    plan.blocks = [{ id: 'b', date: '2026-10-27', startMin: 13 * 60, endMin: 15 * 60, courseId: 'c2', sectionId: null, label: '' }];
    d.weekPlans['2026-10-26'] = plan;
    d.entries = [entry('e', 'c1', T(-120), T(-60))];
    expect(defaultTimerTarget(d, new Date(T(0)))).toEqual({ courseId: 'c2', sectionId: null });
    plan.blocks[0] = { ...plan.blocks[0], courseId: 'c1' };
    expect(defaultTimerTarget(d, new Date(T(0)))).toEqual({ courseId: 'c1', sectionId: 's1' });
    plan.blocks[0] = { ...plan.blocks[0], sectionId: 's2' };
    expect(defaultTimerTarget(d, new Date(T(0)))).toEqual({ courseId: 'c1', sectionId: 's2' });
    expect(defaultTimerTarget(d, new Date(T(90)))).toEqual({ courseId: 'c1', sectionId: 's1' }); // after the block: today's section
  });
});
