// Derived data helpers for components. Pure; wrap in useMemo at call sites.
import type { AppData, Course, FocusSession, Id, Section } from '../domain/types';
import { blockProgress, blockRemainingMs, breakProgress, breakRemainingMs, focusedMs as focusedMsOf, isBreakOver, overtimeMs } from '../domain/focus';
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

// ---------- Focus (FOCUS_PLAN.md §5.3) ----------

export interface FocusView {
  session: FocusSession;
  phase: FocusSession['phase'];
  /** 0..1 for the scene: block progress (focus/paused/complete), break progress (break). */
  progress: number;
  remainingMs: number | null;
  focusedMs: number;
  overtimeMs: number;
  breakRemainingMs: number;
  breakOver: boolean;
  courseName: string;
  courseColor: string | undefined;
  sectionTitle: string | null;
  /** "50 min block", "Open-ended", plus "· Block 2" from the second block on. */
  blockLabel: string;
}

export function focusView(data: AppData, now: Date): FocusView | null {
  const s = data.focus;
  if (!s) return null;
  const course = data.courses.find((c) => c.id === s.target.courseId);
  const section = s.target.sectionId ? data.sections.find((x) => x.id === s.target.sectionId) : undefined;
  const base = s.blockMinutes === null ? 'Open-ended' : `${s.blockMinutes} min block${s.extendedMinutes ? ` · +${s.extendedMinutes}` : ''}`;
  return {
    session: s,
    phase: s.phase,
    progress: s.phase === 'break' ? breakProgress(s, now) : blockProgress(s, now),
    remainingMs: blockRemainingMs(s, now),
    focusedMs: focusedMsOf(s, now),
    overtimeMs: overtimeMs(s, now),
    breakRemainingMs: breakRemainingMs(s, now),
    breakOver: isBreakOver(s, now),
    courseName: course?.name ?? 'Course',
    courseColor: course?.color,
    sectionTitle: section?.title ?? null,
    blockLabel: s.blocksCompleted >= 1 ? `${base} · Block ${s.blocksCompleted + 1}` : base,
  };
}

export function canEnterFocus(data: AppData): boolean {
  return !!data.activeTimer || data.focus?.phase === 'paused' || data.focus?.phase === 'break';
}
