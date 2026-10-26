// Derived data helpers for components. Pure; wrap in useMemo at call sites.
import type { AppData, Course, Id, Section } from '../domain/types';
import { sectionsOfCourse } from '../domain/sections';
import { toDateKey, weekStartOf } from '../domain/time';
import { computeStreaks } from '../domain/streaks';

export const todayKey = (now: Date) => toDateKey(now);
export const currentWeekStart = (now: Date) => weekStartOf(toDateKey(now));

export function activeCourses(data: AppData): Course[] {
  return data.courses.filter((c) => !c.archived);
}

export function courseMap(data: AppData): Map<Id, Course> {
  return new Map(data.courses.map((c) => [c.id, c]));
}

export function sectionMap(data: AppData): Map<Id, Section> {
  return new Map(data.sections.map((s) => [s.id, s]));
}

/** Sections grouped by course in course order then section order. */
export function sectionsByCourse(data: AppData, opts: { includeArchived?: boolean; filter?: (s: Section) => boolean } = {}) {
  const courses = opts.includeArchived ? data.courses : activeCourses(data);
  return courses
    .map((course) => ({ course, sections: sectionsOfCourse(data.sections, course.id).filter((s) => (opts.filter ? opts.filter(s) : true)) }))
    .filter((g) => g.sections.length > 0);
}

/** Streaks as of `now`, including the running timer — shared by Today and Review (review R8). */
export function streaksAt(data: AppData, now: Date) {
  return computeStreaks(data, toDateKey(now), now);
}
