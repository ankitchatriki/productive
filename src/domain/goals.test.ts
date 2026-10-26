import { describe, expect, it } from 'vitest';
import { computeGoalProgress } from './goals';
import { createWeekPlan } from './plan';
import { at, data, entry, iso, section } from './fixtures';
import type { Goal } from './types';

const WS = '2026-10-26'; // Mon
const plan = createWeekPlan(WS, { ...data().settings, restDays: [6] }, iso(2026, 10, 26)); // 6 study days, 8h goal
const total: Goal = { id: 't', kind: 'totalHours', targetMinutes: 600 };
const days: Goal = { id: 'd', kind: 'dailyGoalDays', targetCount: 5 };

function withHours(perDay: Record<string, number>) {
  const entries = Object.entries(perDay).map(([d, h], i) => {
    const [y, m, dd] = d.split('-').map(Number);
    return entry(`e${i}`, 'c1', iso(y, m, dd, 8), iso(y, m, dd, 8 + h));
  });
  return data({ entries });
}

describe('computeGoalProgress', () => {
  it('met when current ≥ target', () => {
    const d = withHours({ '2026-10-26': 10 });
    expect(computeGoalProgress(total, plan, d, at(2026, 10, 27, 9))).toMatchObject({ current: 600, target: 600, ratio: 1, status: 'met' });
  });
  it('on_track on Monday (expected 0) even with nothing logged', () => {
    expect(computeGoalProgress(total, plan, data(), at(2026, 10, 26, 9)).status).toBe('on_track');
  });
  it('on_track when at or above pace, behind when below', () => {
    // Thursday: 3 study days elapsed of 6 → expected 300.
    expect(computeGoalProgress(total, plan, withHours({ '2026-10-26': 5 }), at(2026, 10, 29, 9)).status).toBe('on_track');
    expect(computeGoalProgress(total, plan, withHours({ '2026-10-26': 4 }), at(2026, 10, 29, 9)).status).toBe('behind');
  });
  it('missed after the week ends', () => {
    expect(computeGoalProgress(total, plan, withHours({ '2026-10-26': 4 }), at(2026, 11, 2, 9))).toMatchObject({ status: 'missed', ratio: 0.4 });
  });
  it('dailyGoalDays missed early when it can no longer be reached', () => {
    // Saturday, 0 days hit, 2 days remaining (Sat, Sun) < 5.
    expect(computeGoalProgress(days, plan, data(), at(2026, 10, 31, 9)).status).toBe('missed');
    // Friday with 3 days hit: 3 + 3 remaining ≥ 5 → pace check (4 elapsed of 6 → expected 3.33) → behind.
    const d = withHours({ '2026-10-26': 8, '2026-10-27': 8, '2026-10-28': 8 });
    expect(computeGoalProgress(days, plan, d, at(2026, 10, 30, 9))).toMatchObject({ current: 3, status: 'behind' });
  });
  it('dailyGoalDays counts rest days that hit the goal', () => {
    const d = withHours({ '2026-11-01': 9 });
    expect(computeGoalProgress(days, plan, d, at(2026, 11, 1, 20)).current).toBe(1);
  });
  it('future week is on_track', () => {
    const future = createWeekPlan('2026-11-09', data().settings, iso(2026, 10, 26));
    expect(computeGoalProgress(total, future, data(), at(2026, 10, 28, 9)).status).toBe('on_track');
  });
  it('courseHours counts only that course; includes the running timer', () => {
    const d = data({
      entries: [entry('a', 'c1', iso(2026, 10, 26, 8), iso(2026, 10, 26, 9)), entry('b', 'c2', iso(2026, 10, 26, 9), iso(2026, 10, 26, 12))],
      activeTimer: { courseId: 'c1', sectionId: null, startedAt: iso(2026, 10, 26, 13), note: '' },
    });
    const g: Goal = { id: 'c', kind: 'courseHours', courseId: 'c1', targetMinutes: 600 };
    expect(computeGoalProgress(g, plan, d, at(2026, 10, 26, 14)).current).toBe(120);
  });
  it('sectionsCompleted counts completions within the week, filtered by course', () => {
    const d = data({ sections: [
      section('a', 'c1', 0, { completedAt: iso(2026, 10, 27, 10) }),
      section('b', 'c2', 0, { completedAt: iso(2026, 10, 28, 10) }),
      section('c', 'c1', 1, { completedAt: iso(2026, 10, 20, 10) }),
      section('d', 'c1', 2),
    ] });
    expect(computeGoalProgress({ id: 's', kind: 'sectionsCompleted', courseId: null, targetCount: 3 }, plan, d, at(2026, 10, 29)).current).toBe(2);
    expect(computeGoalProgress({ id: 's', kind: 'sectionsCompleted', courseId: 'c1', targetCount: 3 }, plan, d, at(2026, 10, 29)).current).toBe(1);
  });
});
