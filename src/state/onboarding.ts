// First-run onboarding as a pure list of actions, so re-running a step updates
// instead of duplicating (review R5).
import type { Action } from './actions';
import type { AppData, Id, Weekday } from '../domain/types';
import { autoAssign, createWeekPlan, goalsAreDefault } from '../domain/plan';
import { defaultGoals } from '../domain/goals';
import { makeSections, parseBulkSections, sectionsOfCourse } from '../domain/sections';
import { weekStartOf } from '../domain/time';

export interface OnboardingInput {
  dailyGoalMinutes: number;
  restDays: Weekday[];
  courseName: string;
  color: string;
  sectionsText: string;
}

/** Actions that apply the goal settings to settings and (if present) this week's plan. */
export function onboardingGoalActions(data: AppData, input: Pick<OnboardingInput, 'dailyGoalMinutes' | 'restDays'>, today: string, now: string): Action[] {
  const actions: Action[] = [{ type: 'settings/update', patch: { dailyGoalMinutes: input.dailyGoalMinutes, restDays: input.restDays } }];
  const ws = weekStartOf(today);
  const plan = data.weekPlans[ws];
  if (plan) {
    actions.push({
      type: 'plan/update', weekStart: ws, now,
      patch: {
        dailyGoalMinutes: input.dailyGoalMinutes,
        restDays: [...input.restDays],
        goals: goalsAreDefault(plan) ? defaultGoals(ws, input.dailyGoalMinutes, input.restDays) : plan.goals,
      },
    });
  }
  return actions;
}

/**
 * Step 2 (+3): create the course — or update it if `existingCourseId` is set —
 * replace its sections, and (re)build this week's plan with auto-assign from today.
 */
export function onboardingActions(
  data: AppData, input: OnboardingInput, existingCourseId: Id | null, today: string, now: string, makeId: () => Id,
): { courseId: Id; actions: Action[] } {
  const actions: Action[] = [];
  const courseId = existingCourseId && data.courses.some((c) => c.id === existingCourseId) ? existingCourseId : makeId();
  const settings = { ...data.settings, dailyGoalMinutes: input.dailyGoalMinutes, restDays: input.restDays };
  actions.push({ type: 'settings/update', patch: { dailyGoalMinutes: input.dailyGoalMinutes, restDays: input.restDays } });

  const removed = new Set<Id>();
  if (courseId === existingCourseId) {
    actions.push({ type: 'course/update', id: courseId, patch: { name: input.courseName.trim(), color: input.color } });
    for (const s of sectionsOfCourse(data.sections, courseId)) {
      removed.add(s.id);
      actions.push({ type: 'section/delete', id: s.id });
    }
  } else {
    actions.push({ type: 'course/add', course: { id: courseId, name: input.courseName.trim(), color: input.color, archived: false, createdAt: now } });
  }
  const sections = makeSections(courseId, parseBulkSections(input.sectionsText), [], makeId);
  if (sections.length) actions.push({ type: 'section/addMany', sections });

  const ws = weekStartOf(today);
  const existing = data.weekPlans[ws];
  const base = existing
    ? {
        ...existing,
        dailyGoalMinutes: input.dailyGoalMinutes,
        restDays: [...input.restDays],
        goals: goalsAreDefault(existing) ? defaultGoals(ws, input.dailyGoalMinutes, input.restDays) : existing.goals,
        sectionByDay: Object.fromEntries(Object.entries(existing.sectionByDay).map(([d, sid]) => [d, sid && removed.has(sid) ? null : sid])),
      }
    : createWeekPlan(ws, settings, now);
  const assigned = autoAssign(base, sections, courseId, today);
  const { weekStart: _ws, ...patch } = { ...base, sectionByDay: assigned.sectionByDay };
  void _ws;
  actions.push({ type: 'plan/update', weekStart: ws, patch, now });
  return { courseId, actions };
}
