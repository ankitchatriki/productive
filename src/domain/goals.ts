// Weekly goals (PLAN.md §4.1, §4.2).
import type { AppData, Goal, GoalProgress, Weekday, WeekKey, WeekPlan } from './types';
import { allIntervals, minutesByDay, minutesInDates } from './aggregate';
import { isRestDay, toDateKey, weekDates } from './time';

/** Default goals for a new week. IDs are deterministic so the reducer stays pure. */
export function defaultGoals(weekStart: WeekKey, dailyGoalMinutes: number, restDays: Weekday[]): Goal[] {
  const studyDays = 7 - restDays.length;
  return [
    { id: `${weekStart}-total`, kind: 'totalHours', targetMinutes: dailyGoalMinutes * studyDays },
    { id: `${weekStart}-days`, kind: 'dailyGoalDays', targetCount: studyDays },
  ];
}

export function goalTarget(goal: Goal): number {
  return goal.kind === 'totalHours' || goal.kind === 'courseHours' ? goal.targetMinutes : goal.targetCount;
}

/** Hours goals are in minutes; count goals in units. */
export function goalIsDuration(goal: Goal): boolean {
  return goal.kind === 'totalHours' || goal.kind === 'courseHours';
}

export function computeGoalProgress(goal: Goal, plan: WeekPlan, data: Pick<AppData, 'entries' | 'activeTimer' | 'sections'>, now: Date): GoalProgress {
  const dates = weekDates(plan.weekStart);
  const intervals = allIntervals(data, now);
  let current = 0;
  switch (goal.kind) {
    case 'totalHours':
      current = minutesInDates(intervals, dates);
      break;
    case 'courseHours':
      current = minutesInDates(intervals, dates, (i) => i.courseId === goal.courseId);
      break;
    case 'sectionsCompleted': {
      const set = new Set(dates);
      current = data.sections.filter((s) => s.completedAt && (goal.courseId === null || s.courseId === goal.courseId) && set.has(toDateKey(new Date(s.completedAt)))).length;
      break;
    }
    case 'dailyGoalDays': {
      const byDay = minutesByDay(intervals);
      current = dates.filter((d) => (byDay.get(d) ?? 0) >= plan.dailyGoalMinutes).length;
      break;
    }
  }
  const target = goalTarget(goal);
  const ratio = target > 0 ? Math.min(1, Math.max(0, current / target)) : 1;
  const today = toDateKey(now);
  let status: GoalProgress['status'];
  if (current >= target) status = 'met';
  else if (today > dates[6]) status = 'missed';
  else if (today < dates[0]) status = 'on_track';
  else if (goal.kind === 'dailyGoalDays' && current + dates.filter((d) => d >= today).length < target) status = 'missed';
  else {
    const studyDates = dates.filter((d) => !isRestDay(d, plan.restDays));
    const elapsed = studyDates.filter((d) => d < today).length;
    const total = Math.max(1, studyDates.length);
    const expected = (target * elapsed) / total;
    status = current >= expected ? 'on_track' : 'behind';
  }
  return { goalId: goal.id, current, target, ratio, status };
}
