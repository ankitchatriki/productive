// Week plans, section assignment, blocks, planned vs actual (PLAN.md §4.1, §4.3, §4.5).
import type { DateKey, Id, IsoInstant, Settings, WeekKey, WeekPlan } from './types';
import { defaultGoals } from './goals';
import { isRestDay, weekDates, weekStartOf } from './time';

export function createWeekPlan(weekStart: WeekKey, settings: Settings, now: IsoInstant): WeekPlan {
  const sectionByDay: Record<DateKey, Id | null> = {};
  for (const d of weekDates(weekStart)) sectionByDay[d] = null;
  return {
    weekStart,
    dailyGoalMinutes: settings.dailyGoalMinutes,
    restDays: [...settings.restDays],
    goals: defaultGoals(weekStart, settings.dailyGoalMinutes, settings.restDays),
    sectionByDay,
    blocks: [],
    reviewNote: '',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Carry-over "Do it today": `today` gets `sectionId`; every section assigned from
 * today onward moves to the next non-rest day after its day; whatever falls off
 * Sunday becomes unassigned (returned in `dropped`).
 */
export function shiftPlanFrom(plan: WeekPlan, today: DateKey, sectionId: Id): { plan: WeekPlan; dropped: Id[] } {
  const dates = weekDates(plan.weekStart);
  const startIdx = dates.indexOf(today);
  if (startIdx < 0) return { plan, dropped: [] };
  const next: Record<DateKey, Id | null> = { ...plan.sectionByDay };
  for (let i = startIdx; i < 7; i++) next[dates[i]] = null;
  const dropped: Id[] = [];
  for (let i = startIdx; i < 7; i++) {
    const sid = plan.sectionByDay[dates[i]];
    if (!sid || sid === sectionId) continue;
    let j = i + 1;
    while (j < 7 && isRestDay(dates[j], plan.restDays)) j++;
    if (j < 7) next[dates[j]] = sid;
    else dropped.push(sid);
  }
  next[today] = sectionId;
  return { plan: { ...plan, sectionByDay: next }, dropped };
}

export function planFor(weekPlans: Record<WeekKey, WeekPlan>, date: DateKey): WeekPlan | undefined {
  return weekPlans[weekStartOf(date)];
}

/** A day's goal: that week's plan snapshot if it exists, else settings (§4.1). */
export function dailyGoalFor(date: DateKey, data: { weekPlans: Record<WeekKey, WeekPlan>; settings: Settings }): number {
  return planFor(data.weekPlans, date)?.dailyGoalMinutes ?? data.settings.dailyGoalMinutes;
}

export function restDaysFor(date: DateKey, data: { weekPlans: Record<WeekKey, WeekPlan>; settings: Settings }) {
  return planFor(data.weekPlans, date)?.restDays ?? data.settings.restDays;
}

export function isRestDate(date: DateKey, data: { weekPlans: Record<WeekKey, WeekPlan>; settings: Settings }): boolean {
  return isRestDay(date, restDaysFor(date, data));
}
