// Timer actions shared by Today, the nav pill and global shortcuts (PLAN.md §4.7).
import { useCallback } from 'react';
import { useDispatch, useStore } from './store';
import { useToast } from '../hooks/useToast';
import { entryFromTimer } from '../domain/entries';
import { formatDuration, toDateKey, weekStartOf } from '../domain/time';
import { newId } from '../domain/ids';
import type { ActiveTimer, AppData, BlockChoice, Id, IsoInstant, SceneId } from '../domain/types';

export interface TimerTarget { courseId: Id; sectionId: Id | null }

/** Default clock-in target: today's assigned section, else the last-used course/section, else the first course. */
export function defaultTimerTarget(data: AppData, now: Date): TimerTarget | null {
  const today = toDateKey(now);
  const sid = data.weekPlans[weekStartOf(today)]?.sectionByDay[today];
  const assigned = sid ? data.sections.find((s) => s.id === sid) : undefined;
  // Round 2 (FOCUS_PLAN §3.2): a planned block containing now comes first.
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const block = (data.weekPlans[weekStartOf(today)]?.blocks ?? [])
    .filter((b) => b.date === today && b.startMin <= nowMin && nowMin < b.endMin)
    .sort((a, b) => b.startMin - a.startMin)
    .find((b) => data.courses.some((c) => c.id === b.courseId && !c.archived));
  if (block) {
    const bs = block.sectionId ? data.sections.find((s) => s.id === block.sectionId) : undefined;
    if (bs && !bs.completedAt && bs.courseId === block.courseId) return { courseId: block.courseId, sectionId: bs.id };
    if (assigned && assigned.courseId === block.courseId) return { courseId: block.courseId, sectionId: assigned.id };
    return { courseId: block.courseId, sectionId: null };
  }
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

  /** Clock out (optionally at an earlier instant, e.g. the block end). Ends any focus session. */
  const clockOut = useCallback((stopAt?: IsoInstant) => {
    const t = data.activeTimer;
    if (!t) {
      if (data.focus) { dispatch({ type: 'focus/end', now: new Date().toISOString() }); toast.show('Focus session ended.'); }
      return;
    }
    const now = stopAt ?? new Date().toISOString();
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
      onClick: () => dispatch({ type: 'timer/restore', timer: t, removeEntryId: result.entry.id }),
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

  // ---------- Focus (FOCUS_PLAN.md §5.4) ----------
  const startFocus = useCallback((opts: { target: TimerTarget & { note?: string }; blockMinutes: number | null; targetMs?: number | null; choice: BlockChoice['kind']; scene: SceneId; immersive: boolean }) => {
    dispatch({
      type: 'focus/start', now: new Date().toISOString(), id: newId(),
      target: { courseId: opts.target.courseId, sectionId: opts.target.sectionId, note: opts.target.note ?? '' },
      blockMinutes: opts.blockMinutes, targetMs: opts.targetMs ?? null, choice: opts.choice, scene: opts.scene, immersive: opts.immersive,
    });
  }, [dispatch]);

  /** Returns a short message for the HUD when the stopped piece was discarded. */
  const pause = useCallback((): string | null => {
    const t = data.activeTimer;
    if (!t || data.focus?.phase !== 'focus') return null;
    const now = new Date().toISOString();
    const id = newId();
    const r = entryFromTimer(t, now, id, data.entries);
    dispatch({ type: 'focus/pause', now, newEntryId: id });
    return r.kind === 'discarded' ? 'Under a minute — not logged' : null;
  }, [data, dispatch]);

  const resume = useCallback(() => dispatch({ type: 'focus/resume', now: new Date().toISOString() }), [dispatch]);
  const extend = useCallback((minutes: number) => dispatch({ type: 'focus/extend', now: new Date().toISOString(), minutes }), [dispatch]);
  const keepGoing = useCallback(() => dispatch({ type: 'focus/nextBlock', now: new Date().toISOString() }), [dispatch]);
  const nextBlock = useCallback((blockMinutes?: number | null) => dispatch({ type: 'focus/nextBlock', now: new Date().toISOString(), blockMinutes }), [dispatch]);
  const extendBreak = useCallback((minutes: number) => dispatch({ type: 'focus/extendBreak', minutes }), [dispatch]);
  const endSession = useCallback(() => dispatch({ type: 'focus/end', now: new Date().toISOString() }), [dispatch]);

  /** Start a break; `stopAtBlockEnd` bills only up to the block's end instant. */
  const startBreak = useCallback((minutes: number, stopAtBlockEnd = false) => {
    const s = data.focus;
    if (!s) return;
    const now = new Date().toISOString();
    const stopAt = stopAtBlockEnd && s.completedAt ? s.completedAt : now;
    dispatch({ type: 'focus/startBreak', now, stopAt, newEntryId: newId(), minutes });
  }, [data.focus, dispatch]);

  return { clockIn, clockOut, switchTo, startFocus, pause, resume, extend, keepGoing, nextBlock, extendBreak, endSession, startBreak };
}
