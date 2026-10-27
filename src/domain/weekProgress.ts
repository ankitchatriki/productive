// Weekly progress card data (ROUND3_PLAN.md §1). Pure: no React, no new state.
import type { AppData, DateKey, Goal, GoalProgress, WeekKey } from './types';
import { allIntervals, minutesByDay, minutesOnDate } from './aggregate';
import { computeGoalProgress } from './goals';
import { createWeekPlan } from './plan';
import { isRestDay, toDateKey, weekDates, weekStartOf } from './time';
import { computeStreaks } from './streaks';

export type DayState = 'future' | 'hit' | 'today' | 'rest' | 'short' | 'empty';

export interface DayCell {
  date: DateKey;
  minutes: number;
  /** 0 on rest days. */
  goal: number;
  rest: boolean;
  isToday: boolean;
  state: DayState;
  /** 0..1 against the plan's daily goal (rest days too, so studying on one still shows a bar). */
  ratio: number;
}

export interface WeekProgress {
  weekStart: WeekKey;
  hasPlan: boolean;
  total: number;
  target: number;
  status: GoalProgress['status'] | null;
  remaining: number;
  over: number;
  daysLeft: number;
  perDay: number | null;
  firstDay: boolean;
  lastDay: boolean;
  liveMinutes: number;
  days: DayCell[];
  goals: Array<{ goal: Goal; progress: GoalProgress }>;
  streak: { current: number; best: number };
  sections: { done: number; assigned: number } | null;
}

/** §1.3, evaluated in order. */
export function dayState(date: DateKey, today: DateKey, minutes: number, goal: number, rest: boolean): DayState {
  if (date > today) return 'future';
  if (minutes > 0 && minutes >= goal) return 'hit';
  if (date === today) return 'today';
  if (rest) return 'rest';
  if (minutes > 0) return 'short';
  return 'empty';
}

export function weekProgress(data: AppData, now: Date): WeekProgress {
  const today = toDateKey(now);
  const ws = weekStartOf(today);
  const dates = weekDates(ws);
  const stored = data.weekPlans[ws];
  const hasPlan = !!stored;
  const ep = stored ?? createWeekPlan(ws, data.settings, now.toISOString());
  const goalOf = ep.dailyGoalMinutes;
  const intervals = allIntervals(data, now);
  const byDay = minutesByDay(intervals);

  const days: DayCell[] = dates.map((d) => {
    const rest = isRestDay(d, ep.restDays);
    const minutes = byDay.get(d) ?? 0;
    // A rest day is judged against the plan's daily goal too (same rule as computeStreaks' "hit").
    return {
      date: d, minutes, goal: rest ? 0 : goalOf, rest, isToday: d === today,
      state: dayState(d, today, minutes, goalOf, rest),
      ratio: goalOf > 0 ? Math.min(1, minutes / goalOf) : 0,
    };
  });
  const studyDays = days.filter((c) => !c.rest);
  const total = days.reduce((s, c) => s + c.minutes, 0);
  const target = goalOf * studyDays.length;
  const status = target > 0
    ? computeGoalProgress({ id: 'week-total', kind: 'totalHours', targetMinutes: target }, ep, data, now).status
    : null;
  const remaining = Math.max(0, target - total);
  const over = Math.max(0, total - target);
  const daysLeft = studyDays.filter((c) => c.date >= today).length;
  const perDay = remaining > 0 && daysLeft > 0 ? Math.ceil(remaining / daysLeft) : null;

  const running = data.activeTimer ? intervals.filter((i) => i.entryId === null) : [];
  const liveMinutes = running.length ? minutesOnDate(running, today) : 0;

  const goals = hasPlan ? ep.goals.map((goal) => ({ goal, progress: computeGoalProgress(goal, ep, data, now) })) : [];

  let sections: WeekProgress['sections'] = null;
  if (hasPlan) {
    const byId = new Map(data.sections.map((s) => [s.id, s]));
    const ids = [...new Set(Object.values(ep.sectionByDay).filter((id): id is string => !!id && byId.has(id)))];
    if (ids.length) sections = { done: ids.filter((id) => byId.get(id)!.completedAt !== null).length, assigned: ids.length };
  }

  const st = computeStreaks(data, today, now);
  return {
    weekStart: ws, hasPlan, total, target, status, remaining, over, daysLeft, perDay,
    firstDay: !studyDays.some((c) => c.date < today),
    lastDay: today === dates[6],
    liveMinutes, days, goals,
    streak: { current: st.current, best: st.best },
    sections,
  };
}
