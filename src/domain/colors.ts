import type { Course } from './types';

/** The 8 subject colours (light-theme solids from DESIGN.md). Stored on Course.color;
 *  rendered through CSS variables so dark mode picks its own variant. */
export const COURSE_COLORS = [
  '#2f6bd8', // blue
  '#c4570c', // orange
  '#2b8040', // green
  '#c0337a', // magenta
  '#0e8585', // teal
  '#7548cc', // violet
  '#9a7300', // ochre
  '#80563a', // brown
] as const;

export const COURSE_COLOR_NAMES = ['Blue', 'Orange', 'Green', 'Magenta', 'Teal', 'Violet', 'Ochre', 'Brown'];

/** 1-based palette index for a colour (falls back to 1). */
export function colorIndex(color: string): number {
  const i = COURSE_COLORS.indexOf(color.toLowerCase() as (typeof COURSE_COLORS)[number]);
  return i < 0 ? 1 : i + 1;
}

export function colorVar(color: string | undefined): string {
  return color ? `var(--subj-${colorIndex(color)})` : 'var(--border-strong)';
}

export function softVar(color: string | undefined): string {
  return color ? `var(--subj-${colorIndex(color)}-soft)` : 'var(--surface-2)';
}

/** Lowest unused palette colour among active courses, wrapping after 8. */
export function nextCourseColor(courses: Course[]): string {
  const used = new Set(courses.filter((c) => !c.archived).map((c) => c.color));
  return COURSE_COLORS.find((c) => !used.has(c)) ?? COURSE_COLORS[courses.length % COURSE_COLORS.length];
}
