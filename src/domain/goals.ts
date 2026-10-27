// Weekly goals (PLAN.md §4.1, §4.2).
import type { AppData, Goal, GoalProgress, Weekday, WeekKey, WeekPlan } from './types';
import { allIntervals, minutesByDay, minutesInDates } from './aggregate';
import { formatDuration, isRestDay, toDateKey, weekDates } from './time';

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

export const STATUS_LABEL: Record<GoalProgress['status'], string> = { met: 'Met', on_track: 'On track', behind: 'Behind', missed: 'Missed' };
export const STATUS_CHIP: Record<GoalProgress['status'], string> = { met: 'chip-met', on_track: 'chip-ontrack', behind: 'chip-behind', missed: 'chip-missed' };

/** Display strings for a goal row (shared by Review and Today's week card). */
export function goalText(g: Goal, p: GoalProgress, courseName: (id: string) => string | undefined): { name: string; value: string; chip: string } {
  const fmt = (v: number) => (goalIsDuration(g) ? formatDuration(v) : String(v));
  const name = g.kind === 'totalHours' ? 'Total hours'
    : g.kind === 'courseHours' ? `Hours on ${courseName(g.courseId) ?? 'a course'}`
    : g.kind === 'sectionsCompleted' ? `Sections completed${g.courseId ? ` · ${courseName(g.courseId) ?? ''}` : ''}`
    : 'Days hitting daily goal';
  const chip = p.status === 'missed' && goalIsDuration(g) ? `Missed by ${formatDuration(p.target - p.current)}`
    : p.status === 'met' && goalIsDuration(g) && p.current > p.target ? `Met · +${formatDuration(p.current - p.target)} over`
    : p.status === 'behind' && goalIsDuration(g) ? `Behind` : STATUS_LABEL[p.status];
  return { name, value: `${fmt(p.current)} / ${fmt(p.target)}`, chip };
}
