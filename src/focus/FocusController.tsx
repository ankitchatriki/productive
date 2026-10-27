// Always mounted inside AppUiProvider (FOCUS_PLAN §6.1): ticks the session, detects
// block/break ends, chimes, keeps the tab title, and portals the overlay.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useStore } from '../state/store';
import { useNow } from '../hooks/useNow';
import { blockEndsAt, blockMs, blockRemainingMs, focusTitle, isBlockDue, isBreakOver, isStaleFocus } from '../domain/focus';
import { playChime } from './chime';
import { FocusMode } from './FocusMode';
import { useReducedMotion } from './hooks/useReducedMotion';

const CHIME_WINDOW_MS = 10_000;

interface FocusControllerProps {
  /** App-level live region (used while the overlay is hidden). */
  announceApp: (msg: string) => void;
  onStopAtLastActivity: () => void;
}

export function FocusController({ announceApp, onStopAtLastActivity }: FocusControllerProps) {
  const data = useStore();
  const dispatch = useDispatch();
  const session = data.focus;
  const now = useNow(1000, !!session);
  const reducedMotion = useReducedMotion(data.settings.focus.motion);
  const [announcement, setAnnouncement] = useState('');
  const breakAnnounced = useRef<string | null>(null);
  const completedKey = useRef<string | null>(null);
  const milestones = useRef<{ key: string; half: boolean; five: boolean }>({ key: '', half: false, five: false });
  const [animateIn, setAnimateIn] = useState(false);
  const prevImmersive = useRef<boolean | null>(null);

  const announce = useCallback((msg: string) => {
    if (data.focus?.immersive) setAnnouncement(msg); else announceApp(msg);
  }, [data.focus?.immersive, announceApp]);

  // Stale paused/break session on load → end it.
  useEffect(() => {
    if (session && isStaleFocus(session, new Date())) dispatch({ type: 'focus/end' });
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate the overlay in only when it opens after mount (not when restored on reload).
  useEffect(() => {
    const imm = !!session?.immersive;
    if (prevImmersive.current === null) setAnimateIn(false);
    else if (imm && !prevImmersive.current) setAnimateIn(true);
    prevImmersive.current = imm;
  }, [session?.immersive]);

  const check = useCallback(() => {
    const s = data.focus;
    if (!s) return;
    const t = new Date();
    if (isBlockDue(s, t)) {
      const at = blockEndsAt(s)!;
      const key = `${s.id}:${s.blockStartedAt}:${at}`;
      if (completedKey.current === key) return;
      completedKey.current = key;
      dispatch({ type: 'focus/complete', at });
      // Chime once, in the tab that completed it, only if noticed live (not restored after reload).
      const live = t.getTime() - Date.parse(at) <= CHIME_WINDOW_MS && document.visibilityState === 'visible';
      if (live && data.settings.focus.chime) playChime();
      if (live) announce(`Block complete. ${s.blockMinutes} minutes done.`);
      return;
    }
    if (isBreakOver(s, t) && breakAnnounced.current !== s.breakEndsAt) {
      breakAnnounced.current = s.breakEndsAt;
      const live = t.getTime() - Date.parse(s.breakEndsAt!) <= CHIME_WINDOW_MS && document.visibilityState === 'visible';
      if (live && data.settings.focus.chime) playChime();
      if (live) announce('Break over.');
    }
    // Halfway / 5 minutes left (FOCUS_DESIGN §2.2), never per second.
    if (s.phase === 'focus' && s.blockMinutes !== null) {
      const key = `${s.id}:${s.blockStartedAt}:${s.blockMinutes}:${s.targetMs ?? ""}`;
      if (milestones.current.key !== key) milestones.current = { key, half: false, five: false };
      const r = blockRemainingMs(s, t)!;
      const total = blockMs(s)!;
      if (!milestones.current.half && r <= total / 2 && r > total / 2 - 5000 && total >= 20 * 60_000) {
        milestones.current.half = true;
        announce(`Halfway through your ${s.blockMinutes} minute block.`);
      }
      if (!milestones.current.five && r <= 5 * 60_000 && r > 5 * 60_000 - 5000 && total > 10 * 60_000) {
        milestones.current.five = true;
        announce('5 minutes left.');
      }
    }
  }, [data.focus, data.settings.focus.chime, dispatch, announce]);

  useEffect(() => { check(); }, [now, check]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [check]);

  // Tab title while a session exists.
  useEffect(() => {
    if (!session) return;
    const course = data.courses.find((c) => c.id === session.target.courseId)?.name ?? '';
    document.title = `${focusTitle(session, now, course)} — StruggleMore`;
  }, [session, now, data.courses]);

  if (!session || !session.immersive) return null;
  return (
    <FocusMode
      key={session.id}
      announcement={announcement}
      announce={announce}
      reducedMotion={reducedMotion}
      animateIn={animateIn}
      onStopAtLastActivity={onStopAtLastActivity}
    />
  );
}
