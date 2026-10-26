// Timer actions shared by Today, the nav pill and global shortcuts (PLAN.md §4.7).
import { useCallback } from 'react';
import { useDispatch, useStore } from './store';
import { useToast } from '../hooks/useToast';
import { entryFromTimer } from '../domain/entries';
import { formatDuration, toDateKey, weekStartOf } from '../domain/time';
import { newId } from '../domain/ids';
import type { ActiveTimer, AppData, Id } from '../domain/types';

export interface TimerTarget { courseId: Id; sectionId: Id | null }

/** Default clock-in target: today's assigned section, else the last-used course/section, else the first course. */
export function defaultTimerTarget(data: AppData, now: Date): TimerTarget | null {
  const today = toDateKey(now);
  const sid = data.weekPlans[weekStartOf(today)]?.sectionByDay[today];
  const assigned = sid ? data.sections.find((s) => s.id === sid) : undefined;
  if (assigned && data.courses.some((c) => c.id === assigned.courseId && !c.archived)) return { courseId: assigned.courseId, sectionId: assigned.id };
  const last = [...data.entries].sort((a, b) => b.end.localeCompare(a.end)).find((e) => data.courses.some((c) => c.id === e.courseId && !c.archived));
  if (last) {
    const sec = last.sectionId ? data.sections.find((s) => s.id === last.sectionId) : undefined;
    return { courseId: last.courseId, sectionId: sec && !sec.completedAt ? sec.id : null };
  }
  const first = data.courses.find((c) => !c.archived);
  return first ? { courseId: first.id, sectionId: null } : null;
}

export function useTimerActions() {
  const data = useStore();
  const dispatch = useDispatch();
  const toast = useToast();

  const courseName = useCallback((id: Id) => data.courses.find((c) => c.id === id)?.name ?? 'course', [data.courses]);

  const clockIn = useCallback((target: TimerTarget & { note?: string }) => {
    if (data.activeTimer) return;
    const timer: ActiveTimer = { courseId: target.courseId, sectionId: target.sectionId, note: target.note ?? '', startedAt: new Date().toISOString() };
    dispatch({ type: 'timer/start', timer });
  }, [data.activeTimer, dispatch]);

  const clockOut = useCallback(() => {
    const t = data.activeTimer;
    if (!t) return;
    const now = new Date().toISOString();
    const id = newId();
    const result = entryFromTimer(t, now, id, data.entries);
    dispatch({ type: 'timer/stop', now, newEntryId: id });
    if (result.kind === 'discarded') {
      toast.show(result.reason === 'short' ? 'Under a minute — not logged.' : 'That time is already covered by other entries — not logged.');
      return;
    }
    const minutes = Math.round((Date.parse(result.entry.end) - Date.parse(result.entry.start)) / 60000);
    toast.show(`Logged ${formatDuration(minutes)} to ${courseName(t.courseId)}.`, {
      label: 'Undo',
      onClick: () => dispatch({ type: 'data/replace', data: { ...data, activeTimer: t } }),
    });
  }, [data, dispatch, toast, courseName]);

  const switchTo = useCallback((next: TimerTarget & { note?: string }) => {
    const t = data.activeTimer;
    if (!t) return;
    const now = new Date().toISOString();
    const id = newId();
    const result = entryFromTimer(t, now, id, data.entries);
    dispatch({ type: 'timer/switch', now, newEntryId: id, next: { courseId: next.courseId, sectionId: next.sectionId, note: next.note ?? '' } });
    if (result.kind === 'entry') {
      const minutes = Math.round((Date.parse(result.entry.end) - Date.parse(result.entry.start)) / 60000);
      toast.show(`Switched. Logged ${formatDuration(minutes)} to ${courseName(t.courseId)}.`);
    } else {
      toast.show('Switched. Under a minute — not logged.');
    }
  }, [data, dispatch, toast, courseName]);

  return { clockIn, clockOut, switchTo };
}
