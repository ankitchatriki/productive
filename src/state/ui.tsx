// App-wide UI: entry dialog, switch picker, shortcuts overlay, timer draft and global hotkeys.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useStore } from './store';
import { BlockPicker } from '../focus/BlockPicker';
import { FocusController } from '../focus/FocusController';
import { primeAudio } from '../focus/chime';
import { resolveBlockMinutes } from '../domain/focus';
import type { BlockChoice, SceneId } from '../domain/types';
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
  /** Open the focus block picker ('attach' = for an already-running plain timer). */
  openBlockPicker: (mode?: 'start' | 'attach') => void;
  /** Re-open the focus overlay for the current session. */
  enterFocus: () => void;
  /** Start straight away with this block choice (Today's inline chips; no picker). */
  startWithChoice: (choice: BlockChoice) => void;
}

const UiContext = createContext<UiValue | null>(null);

export function AppUiProvider({ children }: { children: ReactNode }) {
  const data = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();
  const { clockIn, clockOut, switchTo, startFocus, resume, nextBlock } = useTimerActions();
  const dispatch = useDispatch();
  const [picker, setPicker] = useState<null | 'start' | 'attach'>(null);
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

  /** Start a focus block (or a plain timer for "Just track") from a picker result. */
  const startFromChoice = useCallback((choice: BlockChoice, scene: SceneId, justTrack: boolean, mode: 'start' | 'attach') => {
    primeAudio();
    dispatch({ type: 'focus/settings', patch: { lastChoice: choice, scene } });
    const target = mode === 'attach' && data.activeTimer ? { courseId: data.activeTimer.courseId, sectionId: data.activeTimer.sectionId, note: data.activeTimer.note } : effectiveTarget;
    if (!target) {
      toast.show('Add a course to start tracking.', { label: 'Courses', onClick: () => navigate('/courses') });
      return;
    }
    if (justTrack) {
      clockIn(target);
      setDraft((d) => (d ? { ...d, note: '' } : d));
      setAnnouncement('Clocked in.');
      return;
    }
    const fs = data.settings.focus;
    const blockMinutes = resolveBlockMinutes(choice, data, new Date(), fs.defaultBlockMinutes);
    startFocus({ target, blockMinutes, choice: choice.kind, scene, immersive: fs.enterOnClockIn });
    setDraft((d) => (d ? { ...d, note: '' } : d));
    setAnnouncement(blockMinutes ? `Block started, ${blockMinutes} minutes.` : 'Focus started.');
  }, [data, effectiveTarget, dispatch, clockIn, startFocus, toast, navigate]);

  const openBlockPicker = useCallback((mode: 'start' | 'attach' = 'start') => {
    if (mode === 'start' && !effectiveTarget) {
      toast.show('Add a course to start tracking.', { label: 'Courses', onClick: () => navigate('/courses') });
      return;
    }
    setPicker(mode);
  }, [effectiveTarget, toast, navigate]);

  const toggleTimer = useCallback(() => {
    if (!data.activeTimer && data.focus?.phase === 'paused') { primeAudio(); resume(); setAnnouncement('Resumed.'); return; }
    if (!data.activeTimer && data.focus?.phase === 'break') { primeAudio(); nextBlock(); setAnnouncement('Block started.'); return; }
    if (!data.activeTimer && effectiveTarget) {
      const fs = data.settings.focus;
      // On Today the inline chips are the picker: Space starts with the selected chip.
      if (fs.askBlockEachTime && pathname !== '/') openBlockPicker('start');
      else startFromChoice(fs.lastChoice, fs.scene, false, 'start');
      return;
    }
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
  }, [pathname, data.activeTimer, data.focus?.phase, data.settings.focus, effectiveTarget, clockIn, clockOut, resume, nextBlock, openBlockPicker, startFromChoice, toast, navigate]);

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
    openBlockPicker,
    enterFocus: () => dispatch({ type: 'focus/setImmersive', immersive: true }),
    startWithChoice: (choice: BlockChoice) => startFromChoice(choice, data.settings.focus.scene, false, 'start'),
  }), [openSwitch, draft, effectiveTarget, toggleTimer, openBlockPicker, dispatch, startFromChoice, data.settings.focus.scene]);

  const pickerTarget = picker === 'attach' && data.activeTimer ? data.activeTimer : effectiveTarget;
  const pickerLabel = pickerTarget
    ? [data.courses.find((c) => c.id === pickerTarget.courseId)?.name, pickerTarget.sectionId ? data.sections.find((x) => x.id === pickerTarget.sectionId)?.title : 'General'].filter(Boolean).join(' · ')
    : '';

  return (
    <UiContext.Provider value={value}>
      {children}
      <EntryDialog open={!!entryInit} init={entryInit ?? {}} onClose={() => { const done = entryInit?.onClosed; setEntryInit(null); done?.(); }} />
      <SwitchDialog open={switchOpen} onClose={() => setSwitchOpen(false)} onConfirm={(next) => { switchTo(next); setAnnouncement('Switched section.'); }} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <BlockPicker open={!!picker} mode={picker ?? 'start'} targetLabel={pickerLabel} onClose={() => setPicker(null)}
        onStart={(r) => { const mode = picker ?? 'start'; setPicker(null); startFromChoice(r.choice, r.scene, r.justTrack, mode); }} />
      <div className="visually-hidden" aria-live="polite">{announcement}</div>
      <TimerTitle />
      <FocusController announceApp={setAnnouncement} onStopAtLastActivity={() => setEntryInit({ fromTimer: true })} />
    </UiContext.Provider>
  );
}

/** Tab title while running: "● 1:23 · Course — Productive", updated each minute. */
function TimerTitle() {
  const data = useStore();
  const [tick, setTick] = useState(0);
  const t = data.activeTimer;
  const hasFocus = !!data.focus;
  useEffect(() => {
    if (!t) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 15_000);
    return () => window.clearInterval(id);
  }, [t]);
  useEffect(() => {
    const root = document.documentElement;
    if (hasFocus) { root.dataset.timer = '1'; return; } // FocusController owns the title
    if (!t) {
      delete root.dataset.timer;
      document.title = `${root.dataset.page ?? 'Today'} — Productive`;
      return;
    }
    root.dataset.timer = '1';
    const course = data.courses.find((c) => c.id === t.courseId)?.name ?? '';
    document.title = `● ${formatElapsed(Date.now() - Date.parse(t.startedAt)).slice(0, -3)} · ${course} — Productive`;
  }, [t, data.courses, tick, hasFocus]);
  return null;
}

export function useUi(): UiValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside <AppUiProvider>');
  return ctx;
}
