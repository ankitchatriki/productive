// Week plans, section assignment, blocks, planned vs actual (PLAN.md §4.1, §4.3, §4.5).
import type { Course, DateKey, Goal, Id, IsoInstant, ScheduledBlock, Section, Settings, WeekKey, WeekPlan } from './types';
import type { Interval } from './aggregate';
import { defaultGoals } from './goals';
import { overlapMs } from './entries';
import { addDays, dateAtMinute, isRestDay, weekDates, weekStartOf } from './time';

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
  // Each section moves to the next non-rest day after its own day, but never onto
  // a day already taken by an earlier section (review R4: rest-day sections collided).
  let lastTarget = startIdx;
  for (let i = startIdx; i < 7; i++) {
    const sid = plan.sectionByDay[dates[i]];
    if (!sid || sid === sectionId) continue;
    let j = Math.max(i, lastTarget) + 1;
    while (j < 7 && isRestDay(dates[j], plan.restDays)) j++;
    if (j < 7) { next[dates[j]] = sid; lastTarget = j; }
    else { dropped.push(sid); lastTarget = 7; }
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

// ---------- Auto-assign ----------

/** Course with the most unfinished sections (ties → course order). */
export function defaultAutoAssignCourse(courses: Course[], sections: Section[]): Id | null {
  let best: Id | null = null;
  let bestCount = 0;
  for (const c of courses) {
    if (c.archived) continue;
    const n = sections.filter((s) => s.courseId === c.id && !s.completedAt).length;
    if (n > bestCount) { best = c.id; bestCount = n; }
  }
  return best;
}

/** First date auto-assign may fill: today if inside the week, else Monday. */
export function autoAssignStart(weekStart: WeekKey, today: DateKey): DateKey {
  const dates = weekDates(weekStart);
  return dates.includes(today) ? today : weekStart;
}

/**
 * Fill empty non-rest days from `from` onward with the next unfinished sections
 * of `courseId` (in order) that are not already assigned this week.
 */
export function autoAssign(plan: WeekPlan, sections: Section[], courseId: Id, from: DateKey): WeekPlan {
  const assigned = new Set(Object.values(plan.sectionByDay).filter(Boolean) as Id[]);
  const queue = sections
    .filter((s) => s.courseId === courseId && !s.completedAt && !assigned.has(s.id))
    .sort((a, b) => a.order - b.order);
  const next = { ...plan.sectionByDay };
  for (const d of weekDates(plan.weekStart)) {
    if (d < from || next[d] || isRestDay(d, plan.restDays)) continue;
    const s = queue.shift();
    if (!s) break;
    next[d] = s.id;
  }
  return { ...plan, sectionByDay: next };
}

// ---------- Blocks ----------

export function blocksOverlap(a: Pick<ScheduledBlock, 'date' | 'startMin' | 'endMin'>, b: Pick<ScheduledBlock, 'date' | 'startMin' | 'endMin'>): boolean {
  return a.date === b.date && a.startMin < b.endMin && b.startMin < a.endMin;
}

/** True if `block` fits among `blocks` (ignoring a block with the same id). */
export function canPlaceBlock(blocks: ScheduledBlock[], block: ScheduledBlock): boolean {
  if (block.startMin < 0 || block.endMin > 1440 || block.endMin <= block.startMin) return false;
  return !blocks.some((b) => b.id !== block.id && blocksOverlap(b, block));
}

export const snap15 = (min: number) => Math.round(min / 15) * 15;
export const floor15 = (min: number) => Math.floor(min / 15) * 15;

export function plannedMinutes(blocks: ScheduledBlock[], date?: DateKey): number {
  return blocks.filter((b) => !date || b.date === date).reduce((s, b) => s + (b.endMin - b.startMin), 0);
}

/** Replace blocks with the previous week's, shifted +7 days, new ids. */
export function copyBlocksFromPreviousWeek(plan: WeekPlan, prev: WeekPlan | undefined, makeId: () => Id): WeekPlan {
  const blocks = (prev?.blocks ?? []).map((b) => ({ ...b, id: makeId(), date: addDays(b.date, 7) }));
  return { ...plan, blocks };
}

export function copyGoalsFromPreviousWeek(prev: WeekPlan | undefined, makeId: () => Id): Goal[] {
  return (prev?.goals ?? []).map((g) => ({ ...g, id: makeId() }));
}

/** True when goals are still the defaults created with the plan. */
export function goalsAreDefault(plan: WeekPlan): boolean {
  const def = defaultGoals(plan.weekStart, plan.dailyGoalMinutes, plan.restDays);
  return JSON.stringify(plan.goals) === JSON.stringify(def);
}

// ---------- Planned vs actual (§4.5) ----------

export interface Adherence { planned: number; matched: number; pct: number | null }

export function adherence(blocks: ScheduledBlock[], intervals: Interval[], dates: DateKey[]): Adherence {
  const set = new Set(dates);
  let planned = 0;
  let matchedMs = 0;
  for (const b of blocks) {
    if (!set.has(b.date)) continue;
    planned += b.endMin - b.startMin;
    const bs = dateAtMinute(b.date, b.startMin).getTime();
    const be = dateAtMinute(b.date, b.endMin).getTime();
    for (const i of intervals) {
      if (i.courseId !== b.courseId) continue;
      matchedMs += overlapMs(bs, be, Date.parse(i.start), Date.parse(i.end));
    }
  }
  const matched = Math.round(matchedMs / 60000);
  return { planned, matched, pct: planned > 0 ? Math.round((matched / planned) * 100) : null };
}

// ---------- Carry-over (§4.3) ----------

export interface CarryOver { sectionId: Id; date: DateKey }

/**
 * Y = most recent date before today (looking back up to 7 days, across into the
 * previous week) with a non-null assignment. Banner when Y's section is not done
 * and is not assigned to today or a later day of the current week.
 */
export function findCarryOver(data: { weekPlans: Record<WeekKey, WeekPlan>; sections: Section[] }, today: DateKey): CarryOver | null {
  for (let k = 1; k <= 7; k++) {
    const d = addDays(today, -k);
    const sid = planFor(data.weekPlans, d)?.sectionByDay[d];
    if (!sid) continue;
    const section = data.sections.find((s) => s.id === sid);
    if (!section || section.completedAt) return null;
    const current = data.weekPlans[weekStartOf(today)];
    if (current) {
      for (const day of weekDates(current.weekStart)) {
        if (day >= today && current.sectionByDay[day] === sid) return null;
      }
    }
    return { sectionId: sid, date: d };
  }
  return null;
}
