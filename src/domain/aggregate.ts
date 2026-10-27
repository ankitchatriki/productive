// Per-day / per-course aggregation. Everything goes through splitByLocalDay.
import type { AppData, DateKey, Id, IsoInstant, TimeEntry, WeekKey } from './types';
import { addDays, splitByLocalDay, weekDates } from './time';

/** An entry or the running timer as a closed interval. */
export interface Interval {
  entryId: Id | null; // null = running timer
  courseId: Id;
  sectionId: Id | null;
  start: IsoInstant;
  end: IsoInstant;
}

export function entryToInterval(e: TimeEntry): Interval {
  return { entryId: e.id, courseId: e.courseId, sectionId: e.sectionId, start: e.start, end: e.end };
}

/** All entries plus the running timer treated as [startedAt, now]. */
export function allIntervals(data: Pick<AppData, 'entries' | 'activeTimer'>, now: Date): Interval[] {
  const out = data.entries.map(entryToInterval);
  const t = data.activeTimer;
  if (t && new Date(t.startedAt).getTime() < now.getTime()) {
    out.push({ entryId: null, courseId: t.courseId, sectionId: t.sectionId, start: t.startedAt, end: now.toISOString() });
  }
  return out;
}

export type IntervalFilter = (i: Interval) => boolean;

export function minutesByDay(intervals: Interval[], filter?: IntervalFilter): Map<DateKey, number> {
  const map = new Map<DateKey, number>();
  for (const i of intervals) {
    if (filter && !filter(i)) continue;
    for (const p of splitByLocalDay(i.start, i.end)) map.set(p.date, (map.get(p.date) ?? 0) + p.minutes);
  }
  return map;
}

/** Minutes falling on any of `dates`. */
export function minutesInDates(intervals: Interval[], dates: DateKey[], filter?: IntervalFilter): number {
  const set = new Set(dates);
  let sum = 0;
  for (const i of intervals) {
    if (filter && !filter(i)) continue;
    for (const p of splitByLocalDay(i.start, i.end)) if (set.has(p.date)) sum += p.minutes;
  }
  return sum;
}

export function minutesOnDate(intervals: Interval[], date: DateKey, filter?: IntervalFilter): number {
  return minutesInDates(intervals, [date], filter);
}

/** courseId → minutes within `dates`. */
export function minutesByCourse(intervals: Interval[], dates: DateKey[]): Record<Id, number> {
  const set = new Set(dates);
  const out: Record<Id, number> = {};
  for (const i of intervals) {
    for (const p of splitByLocalDay(i.start, i.end)) {
      if (set.has(p.date)) out[i.courseId] = (out[i.courseId] ?? 0) + p.minutes;
    }
  }
  return out;
}

/** sectionId → minutes, all time (or within dates if given). */
export function minutesBySection(intervals: Interval[], dates?: DateKey[]): Record<Id, number> {
  const set = dates ? new Set(dates) : null;
  const out: Record<Id, number> = {};
  for (const i of intervals) {
    if (!i.sectionId) continue;
    for (const p of splitByLocalDay(i.start, i.end)) {
      if (!set || set.has(p.date)) out[i.sectionId] = (out[i.sectionId] ?? 0) + p.minutes;
    }
  }
  return out;
}

/** Mon..Sun minutes for a week. */
export function dayTotals(intervals: Interval[], weekStart: WeekKey, filter?: IntervalFilter): number[] {
  const byDay = minutesByDay(intervals, filter);
  return weekDates(weekStart).map((d) => byDay.get(d) ?? 0);
}

/** Totals for the `n` weeks ending with `lastWeekStart` (oldest first). */
export function weekTotals(intervals: Interval[], lastWeekStart: WeekKey, n: number): Array<{ weekStart: WeekKey; minutes: number }> {
  const byDay = minutesByDay(intervals);
  const out: Array<{ weekStart: WeekKey; minutes: number }> = [];
  for (let k = n - 1; k >= 0; k--) {
    const ws = addDays(lastWeekStart, -7 * k);
    out.push({ weekStart: ws, minutes: weekDates(ws).reduce((s, d) => s + (byDay.get(d) ?? 0), 0) });
  }
  return out;
}

/** Intervals that overlap a given local day, clipped to it (for timelines). */
export function intervalsOnDate(intervals: Interval[], date: DateKey): Array<Interval & { clipStart: Date; clipEnd: Date; continuesBefore: boolean; continuesAfter: boolean }> {
  const [y, m, d] = date.split('-').map(Number);
  const dayStart = new Date(y, m - 1, d);
  const dayEnd = new Date(y, m - 1, d + 1);
  return intervals
    .filter((i) => new Date(i.start) < dayEnd && new Date(i.end) > dayStart)
    .map((i) => {
      const s = new Date(i.start);
      const e = new Date(i.end);
      return {
        ...i,
        clipStart: s < dayStart ? dayStart : s,
        clipEnd: e > dayEnd ? dayEnd : e,
        continuesBefore: s < dayStart,
        continuesAfter: e > dayEnd,
      };
    })
    .sort((a, b) => a.clipStart.getTime() - b.clipStart.getTime());
}

export interface TimecardRow { key: string; courseId: Id; sectionId: Id | null; days: number[]; total: number }
export interface TimecardCourseRow extends TimecardRow { sections: TimecardRow[] }
export interface Timecard { rows: TimecardCourseRow[]; dayTotals: number[]; total: number }

/** Courses × days grid for a week, with section sub-rows ('General' = null). */
export function timecard(intervals: Interval[], weekStart: WeekKey, extraCourseIds: Id[] = []): Timecard {
  const dates = weekDates(weekStart);
  const idx = new Map(dates.map((d, i) => [d, i]));
  const courses = new Map<Id, TimecardCourseRow>();
  const ensure = (courseId: Id) => {
    let r = courses.get(courseId);
    if (!r) { r = { key: courseId, courseId, sectionId: null, days: [0, 0, 0, 0, 0, 0, 0], total: 0, sections: [] }; courses.set(courseId, r); }
    return r;
  };
  for (const i of intervals) {
    for (const p of splitByLocalDay(i.start, i.end)) {
      const k = idx.get(p.date);
      if (k === undefined) continue;
      const row = ensure(i.courseId);
      row.days[k] += p.minutes;
      row.total += p.minutes;
      let sub = row.sections.find((s) => s.sectionId === i.sectionId);
      if (!sub) { sub = { key: `${i.courseId}:${i.sectionId ?? 'general'}`, courseId: i.courseId, sectionId: i.sectionId, days: [0, 0, 0, 0, 0, 0, 0], total: 0 }; row.sections.push(sub); }
      sub.days[k] += p.minutes;
      sub.total += p.minutes;
    }
  }
  for (const id of extraCourseIds) ensure(id);
  const rows = [...courses.values()];
  const dayTotalsArr = [0, 1, 2, 3, 4, 5, 6].map((k) => rows.reduce((s, r) => s + r.days[k], 0));
  return { rows, dayTotals: dayTotalsArr, total: dayTotalsArr.reduce((a, b) => a + b, 0) };
}
