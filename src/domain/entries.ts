// Time entry validation and timer → entry conversion (PLAN.md §4.6, §4.7).
import type { ActiveTimer, AppData, Id, IsoInstant, TimeEntry } from './types';
import { formatClock } from './time';

export const MAX_ENTRY_MINUTES = 16 * 60;
const TOLERANCE_MS = 60_000;

/** Half-open overlap: touching (a ends when b starts) is NOT an overlap. */
export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

const t = (iso: IsoInstant) => new Date(iso).getTime();

/** Entries (excluding `ignoreId`) that overlap [start, end). */
export function overlappingEntries(entries: TimeEntry[], start: IsoInstant, end: IsoInstant, ignoreId?: Id): TimeEntry[] {
  const s = t(start);
  const e = t(end);
  return entries.filter((x) => x.id !== ignoreId && intervalsOverlap(s, e, t(x.start), t(x.end)));
}

export interface ValidateOptions {
  /** True when editing an existing entry (archived course allowed). */
  isEdit?: boolean;
}

/** Returns an error message, or null when valid. */
export function validateEntry(
  entry: Pick<TimeEntry, 'id' | 'courseId' | 'sectionId' | 'start' | 'end'>,
  data: Pick<AppData, 'courses' | 'sections' | 'entries' | 'activeTimer'>,
  now: Date,
  opts: ValidateOptions = {},
): string | null {
  const s = t(entry.start);
  const e = t(entry.end);
  if (!entry.courseId) return 'Choose a course.';
  const course = data.courses.find((c) => c.id === entry.courseId);
  if (!course) return 'Choose a course.';
  if (course.archived && !opts.isEdit) return 'That course is archived. Unarchive it to log new time.';
  if (entry.sectionId) {
    const section = data.sections.find((x) => x.id === entry.sectionId);
    if (!section || section.courseId !== entry.courseId) return 'That section belongs to a different course.';
  }
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 'Enter a valid start and end time.';
  if (e <= s) return 'End time must be after start time.';
  if (e > now.getTime() + TOLERANCE_MS) return "End time can't be in the future.";
  if (e - s > MAX_ENTRY_MINUTES * 60_000) return 'An entry can be at most 16 hours long.';
  const clash = overlappingEntries(data.entries, entry.start, entry.end, entry.id)[0];
  if (clash) return `Overlaps another entry (${formatClock(clash.start)}–${formatClock(clash.end)}). Entries can't double-book time.`;
  const timer = data.activeTimer;
  if (timer && intervalsOverlap(s, e, t(timer.startedAt), now.getTime())) {
    return `Overlaps the running timer (since ${formatClock(timer.startedAt)}).`;
  }
  return null;
}

export type TimerStopResult =
  | { kind: 'entry'; entry: TimeEntry; trimmed: boolean }
  | { kind: 'discarded'; reason: 'short' | 'overlap' };

/**
 * Clock-out: build the entry for [startedAt, now]. Exact instants are kept.
 * If it overlaps existing entries, start moves to the end of the latest one.
 * Under 60 s (after trimming) → discarded.
 */
export function entryFromTimer(timer: ActiveTimer, now: IsoInstant, newEntryId: Id, entries: TimeEntry[]): TimerStopResult {
  let start = t(timer.startedAt);
  const end = t(now);
  let trimmed = false;
  const clashes = overlappingEntries(entries, timer.startedAt, now);
  if (clashes.length) {
    const latestEnd = Math.max(...clashes.map((c) => t(c.end)));
    start = latestEnd;
    trimmed = true;
    if (start >= end) return { kind: 'discarded', reason: 'overlap' };
    // Anything starting after the trimmed start would still overlap; only possible if entries are nested oddly.
    if (overlappingEntries(entries, new Date(start).toISOString(), now).length) return { kind: 'discarded', reason: 'overlap' };
  }
  if (end - start < 60_000) return { kind: 'discarded', reason: trimmed ? 'overlap' : 'short' };
  return {
    kind: 'entry',
    trimmed,
    entry: {
      id: newEntryId,
      courseId: timer.courseId,
      sectionId: timer.sectionId,
      start: new Date(start).toISOString(),
      end: now,
      note: timer.note,
      source: 'timer',
      createdAt: now,
      updatedAt: now,
    },
  };
}
