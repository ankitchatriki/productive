import { describe, expect, it } from 'vitest';
import { dayState, weekProgress } from './weekProgress';
import { computeGoalProgress } from './goals';
import { createWeekPlan } from './plan';
import { at, course, data, entry, iso, section } from './fixtures';
import { streaksAt } from '../state/selectors';
import type { AppData, Settings, Weekday } from './types';

const WS = '2026-10-26';
const c1 = course('c1');
// Day index 0 = Mon 26 Oct … 6 = Sun 1 Nov.
const day = (i: number, h = 0, m = 0) => at(2026, 10, 26 + i, h, m);
const isoDay = (i: number, h = 0, m = 0) => day(i, h, m).toISOString();
const mins = (id: string, i: number, minutes: number, h = 8) => entry(id, 'c1', isoDay(i, h), new Date(day(i, h).getTime() + minutes * 60_000).toISOString());
function withPlan(d: AppData, patch: Partial<Settings> = {}) {
  d.weekPlans[WS] = createWeekPlan(WS, { ...d.settings, ...patch }, iso(2026, 10, 26));
  return d;
}

describe('weekProgress', () => {
  it('1. no plan, nothing logged, Tue 10:00', () => {
    const w = weekProgress(data({ courses: [c1] }), day(1, 10));
    expect(w).toMatchObject({ hasPlan: false, target: 3360, total: 0, goals: [], sections: null, status: 'behind', daysLeft: 6, perDay: 560, weekStart: WS });
    expect(w.days[0].state).toBe('empty');
    expect(w.days[1]).toMatchObject({ state: 'today', isToday: true });
    for (let i = 2; i < 7; i++) expect(w.days[i].state).toBe('future');
  });
  it('2. plan with rest Sunday', () => {
    const d = withPlan(data({ courses: [c1] }), { restDays: [6 as Weekday], dailyGoalMinutes: 360 });
    const sun = weekProgress(d, day(6, 10));
    expect(sun.target).toBe(2160);
    expect(sun.days[6]).toMatchObject({ rest: true, goal: 0, state: 'today' });
    expect(weekProgress(d, day(1, 10)).days[6].state).toBe('future');
  });
  it('3. rest day studied to the goal is a hit and counts', () => {
    const d = withPlan(data({ courses: [c1], entries: [mins('e', 5, 400)] }), { restDays: [5 as Weekday], dailyGoalMinutes: 360 });
    const w = weekProgress(d, day(6, 12));
    expect(w.days[5].rest).toBe(true);
    expect(w.days[5].state).toBe('hit');
    expect(w.total).toBe(400);
  });
  it('4. rest day with some study under goal stays rest', () => {
    const d = withPlan(data({ courses: [c1], entries: [mins('e', 5, 100)] }), { restDays: [5 as Weekday], dailyGoalMinutes: 360 });
    expect(weekProgress(d, day(6, 12)).days[5].state).toBe('rest');
  });
  it('5. short / empty', () => {
    expect(weekProgress(data({ courses: [c1], entries: [mins('e', 0, 200)] }), day(1, 10)).days[0].state).toBe('short');
    expect(weekProgress(data({ courses: [c1] }), day(1, 10)).days[0].state).toBe('empty');
  });
  it('6. running timer', () => {
    const d = data({ courses: [c1], entries: [mins('e', 0, 120)], activeTimer: { courseId: 'c1', sectionId: null, note: '', startedAt: isoDay(1, 9) } });
    const w = weekProgress(d, day(1, 10, 30));
    expect(w.total).toBe(210);
    expect(w.liveMinutes).toBe(90);
    expect(w.days[1].minutes).toBe(90);
  });
  it('7. timer across midnight', () => {
    const d = data({ courses: [c1], activeTimer: { courseId: 'c1', sectionId: null, note: '', startedAt: isoDay(0, 23) } });
    const w = weekProgress(d, day(1, 1));
    expect(w.liveMinutes).toBe(60);
    expect(w.days[0].minutes).toBe(60);
    expect(w.days[1].minutes).toBe(60);
  });
  it('8. first day', () => {
    const mon = weekProgress(data({ courses: [c1] }), day(0, 12));
    expect(mon.firstDay).toBe(true);
    expect(mon.status).toBe('on_track');
    const restMon = withPlan(data({ courses: [c1] }), { restDays: [0 as Weekday] });
    expect(weekProgress(restMon, day(0, 12)).firstDay).toBe(true);
    expect(weekProgress(restMon, day(1, 12)).firstDay).toBe(true);
    expect(weekProgress(data({ courses: [c1] }), day(1, 12)).firstDay).toBe(false);
  });
  it('9. met / over', () => {
    const entries = [0, 1, 2, 3, 4, 5].map((i) => mins(`e${i}`, i, 560)).concat([mins('e6', 6, 40)]);
    const w = weekProgress(data({ courses: [c1], entries }), day(6, 20));
    expect(w.total).toBe(3400);
    expect(w).toMatchObject({ status: 'met', over: 40, remaining: 0, perDay: null });
  });
  it('10. last day not met', () => {
    const e2500 = [0, 1, 2, 3, 4].map((i) => mins(`e${i}`, i, 500));
    const w = weekProgress(data({ courses: [c1], entries: e2500 }), day(6, 23));
    expect(w).toMatchObject({ lastDay: true, daysLeft: 1, perDay: 860, status: 'behind', total: 2500 });
    const e3000 = [0, 1, 2, 3, 4].map((i) => mins(`e${i}`, i, 600));
    expect(weekProgress(data({ courses: [c1], entries: e3000 }), day(6, 23)).status).toBe('on_track');
  });
  it('11. all rest days', () => {
    const d = withPlan(data({ courses: [c1] }), { restDays: [0, 1, 2, 3, 4, 5, 6] as Weekday[] });
    expect(weekProgress(d, day(2, 10))).toMatchObject({ target: 0, status: null, perDay: null });
  });
  it('12. goals pass through computeGoalProgress', () => {
    const d = withPlan(data({ courses: [c1], entries: [mins('e', 0, 90)] }));
    d.weekPlans[WS].goals.push({ id: 'g', kind: 'courseHours', courseId: 'c1', targetMinutes: 600 });
    const now = day(2, 10);
    const w = weekProgress(d, now);
    const i = w.goals.findIndex((g) => g.goal.id === 'g');
    expect(w.goals[i].progress).toEqual(computeGoalProgress(d.weekPlans[WS].goals[i], d.weekPlans[WS], d, now));
  });
  it('13. sections done / assigned', () => {
    const d = withPlan(data({ courses: [c1], sections: [section('s1', 'c1', 0, { completedAt: iso(2026, 10, 20) }), section('s2', 'c1', 1)] }));
    d.weekPlans[WS].sectionByDay = { ...d.weekPlans[WS].sectionByDay, [WS]: 's1', '2026-10-27': 's2', '2026-10-28': 's1', '2026-10-29': 'gone' };
    expect(weekProgress(d, day(2, 10)).sections).toEqual({ done: 1, assigned: 2 });
    expect(weekProgress(withPlan(data({ courses: [c1] })), day(2, 10)).sections).toBeNull();
  });
  it('14. streak passes through streaksAt', () => {
    const d = data({ courses: [c1], entries: [mins('a', 0, 480), mins('b', 1, 480)] });
    expect(weekProgress(d, day(2, 10)).streak).toEqual(streaksAt(d, day(2, 10)));
  });
  it('15. settings change does not change a planned week', () => {
    const d = withPlan(data({ courses: [c1] }), { dailyGoalMinutes: 360 });
    d.settings.dailyGoalMinutes = 600;
    expect(weekProgress(d, day(2, 10)).target).toBe(360 * 7);
  });
  it('16. dayState covers every branch', () => {
    const T = '2026-10-28';
    expect(dayState('2026-10-29', T, 999, 480, false)).toBe('future');
    expect(dayState('2026-10-27', T, 480, 480, false)).toBe('hit');
    expect(dayState(T, T, 500, 480, false)).toBe('hit');
    expect(dayState(T, T, 100, 480, false)).toBe('today');
    expect(dayState('2026-10-27', T, 100, 480, true)).toBe('rest');
    expect(dayState('2026-10-27', T, 0, 0, true)).toBe('rest');
    expect(dayState('2026-10-27', T, 100, 480, false)).toBe('short');
    expect(dayState('2026-10-27', T, 0, 480, false)).toBe('empty');
  });
});
