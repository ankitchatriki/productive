// Weekly goals (PLAN.md §4.1, §4.2).
import type { Goal, Weekday, WeekKey } from './types';

/** Default goals for a new week. IDs are deterministic so the reducer stays pure. */
export function defaultGoals(weekStart: WeekKey, dailyGoalMinutes: number, restDays: Weekday[]): Goal[] {
  const studyDays = 7 - restDays.length;
  return [
    { id: `${weekStart}-total`, kind: 'totalHours', targetMinutes: dailyGoalMinutes * studyDays },
    { id: `${weekStart}-days`, kind: 'dailyGoalDays', targetCount: studyDays },
  ];
}
