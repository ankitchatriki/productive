// Streaks (PLAN.md §4.4) and heatmap levels.
import type { AppData, DateKey } from './types';
import { allIntervals, minutesByDay } from './aggregate';
import { addDays } from './time';
import { dailyGoalFor, isRestDate } from './plan';

export interface Streaks { current: number; best: number }

/**
 * A date is hit when its minutes ≥ that day's goal. Rest days that aren't hit
 * neither break nor count; a hit rest day counts. An unfinished today never breaks
 * the current streak. Pass `now` to include the running timer.
 */
export function computeStreaks(data: AppData, today: DateKey, now?: Date): Streaks {
  const intervals = allIntervals(now ? data : { ...data, activeTimer: null }, now ?? new Date(0));
  const byDay = minutesByDay(intervals);
  const days = [...byDay.keys()].filter((d) => (byDay.get(d) ?? 0) > 0).sort();
  if (days.length === 0) return { current: 0, best: 0 };
  const earliest = days[0];
  const hit = (d: DateKey) => (byDay.get(d) ?? 0) > 0 && (byDay.get(d) ?? 0) >= dailyGoalFor(d, data);

  let current = 0;
  for (let d = addDays(today, -1); d >= earliest; d = addDays(d, -1)) {
    if (hit(d)) current++;
    else if (isRestDate(d, data)) continue;
    else break;
  }
  if (hit(today)) current++;

  let best = 0;
  let run = 0;
  for (let d = earliest; d <= today; d = addDays(d, 1)) {
    if (hit(d)) run++;
    else if (d === today || isRestDate(d, data)) continue;
    else run = 0;
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current) };
}

/** 0 = nothing, 1 = <25%, 2 = <50%, 3 = <100%, 4 = ≥100% of the day's goal. */
export function heatLevel(minutes: number, goal: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  const r = goal > 0 ? minutes / goal : 1;
  if (r < 0.25) return 1;
  if (r < 0.5) return 2;
  if (r < 1) return 3;
  return 4;
}
