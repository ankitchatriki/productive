// App-wide UI: entry dialog, switch picker, shortcuts overlay, timer draft and global hotkeys.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from './store';
import { defaultTimerTarget, useTimerActions, type TimerTarget } from './timer';
import { useToast } from '../hooks/useToast';
import { useHotkeys } from '../hooks/useHotkeys';
import { EntryDialog, type EntryDialogInit } from '../components/EntryDialog';
import { SwitchDialog } from '../components/SwitchDialog';
import { ShortcutsOverlay } from '../components/ShortcutsOverlay';
import { NAV_ITEMS } from '../components/Nav';
import { formatDuration, formatElapsed } from '../domain/time';

export type TimerDraft = TimerTarget & { note: string };

interface UiValue {
  openEntry: (init?: EntryDialogInit) => void;
  openSwitch: () => void;
  openShortcuts: () => void;
  /** Today's picker selection; null = use the default target. */
  draft: TimerDraft | null;
  setDraft: (d: TimerDraft | null) => void;
  effectiveTarget: TimerDraft | null;
  toggleTimer: () => void;
  announce: (msg: string) => void;
}

const UiContext = createContext<UiValue | null>(null);

export function AppUiProvider({ children }: { children: ReactNode }) {
  const data = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const { clockIn, clockOut, switchTo } = useTimerActions();
  const [entryInit, setEntryInit] = useState<EntryDialogInit | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [draft, setDraft] = useState<TimerDraft | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // Drop a draft that points at a deleted/archived course.
  useEffect(() => {
    if (draft && !data.courses.some((c) => c.id === draft.courseId && !c.archived)) setDraft(null);
  }, [data.courses, draft]);

  const effectiveTarget = useMemo<TimerDraft | null>(() => {
    if (draft) return draft;
    const d = defaultTimerTarget(data, new Date());
    return d ? { ...d, note: '' } : null;
  }, [draft, data]);

  const toggleTimer = useCallback(() => {
    if (data.activeTimer) {
      const mins = Math.round((Date.now() - Date.parse(data.activeTimer.startedAt)) / 60000);
      clockOut();
      setAnnouncement(`Clocked out, logged ${formatDuration(mins)}.`);
      return;
    }
    if (!effectiveTarget) {
      toast.show('Add a course to start tracking.', { label: 'Courses', onClick: () => navigate('/courses') });
      return;
    }
    clockIn(effectiveTarget);
    setDraft((d) => (d ? { ...d, note: '' } : d));
    setAnnouncement('Clocked in.');
  }, [data.activeTimer, effectiveTarget, clockIn, clockOut, toast, navigate]);

  const openSwitch = useCallback(() => { if (data.activeTimer) setSwitchOpen(true); }, [data.activeTimer]);

  const hotkeys: Record<string, () => void> = {
    Space: toggleTimer,
    s: openSwitch,
    n: () => setEntryInit({}),
    '?': () => setShortcutsOpen(true),
  };
  for (const item of NAV_ITEMS) hotkeys[item.key] = () => navigate(item.to);
  useHotkeys(hotkeys);

  const value = useMemo<UiValue>(() => ({
    openEntry: (init = {}) => setEntryInit(init),
    openSwitch,
    openShortcuts: () => setShortcutsOpen(true),
    draft, setDraft, effectiveTarget, toggleTimer,
    announce: setAnnouncement,
  }), [openSwitch, draft, effectiveTarget, toggleTimer]);

  return (
    <UiContext.Provider value={value}>
      {children}
      <EntryDialog open={!!entryInit} init={entryInit ?? {}} onClose={() => setEntryInit(null)} />
      <SwitchDialog open={switchOpen} onClose={() => setSwitchOpen(false)} onConfirm={(next) => { switchTo(next); setAnnouncement('Switched section.'); }} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <div className="visually-hidden" aria-live="polite">{announcement}</div>
      <TimerTitle />
    </UiContext.Provider>
  );
}

/** Tab title while running: "● 1:23 · Course — Productive", updated each minute. */
function TimerTitle() {
  const data = useStore();
  const [tick, setTick] = useState(0);
  const t = data.activeTimer;
  useEffect(() => {
    if (!t) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 15_000);
    return () => window.clearInterval(id);
  }, [t]);
  useEffect(() => {
    const root = document.documentElement;
    if (!t) {
      delete root.dataset.timer;
      document.title = `${root.dataset.page ?? 'Today'} — Productive`;
      return;
    }
    root.dataset.timer = '1';
    const course = data.courses.find((c) => c.id === t.courseId)?.name ?? '';
    document.title = `● ${formatElapsed(Date.now() - Date.parse(t.startedAt)).slice(0, -3)} · ${course} — Productive`;
  }, [t, data.courses, tick]);
  return null;
}

export function useUi(): UiValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside <AppUiProvider>');
  return ctx;
}
