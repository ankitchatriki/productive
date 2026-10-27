import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './FocusMode.module.css';
import { useDispatch, useStore } from '../state/store';
import { useTimerActions } from '../state/timer';
import { focusView, type FocusView } from '../state/selectors';
import { useNow } from '../hooks/useNow';
import { useFocusTrap } from './hooks/useFocusTrap';
import { useIdle } from './hooks/useIdle';
import { useFullscreen } from './hooks/useFullscreen';
import { useWakeLock } from './hooks/useWakeLock';
import { usePageVisible } from './hooks/usePageVisible';
import { FocusHud, type ReadoutMode } from './FocusHud';
import { FocusControls } from './FocusControls';
import { CompletePanel, OVERTIME_CHOICE_MS, type PendingStop } from './CompletePanel';
import { BreakPanel } from './BreakPanel';
import { SceneCanvas } from './SceneCanvas';
import { primeAudio } from './chime';
import { SCENE_IDS } from './scenes/ids';
import { SCENE_META } from './scenes/meta';
import { Icon } from '../components/Icon';
import { formatDuration } from '../domain/time';
import type { SceneId } from '../domain/types';

const READOUT_KEY = 'productive:focus:readout';
const LONG_RUN_MS = 10 * 60 * 60_000;

interface FocusModeProps {
  announcement: string;
  announce: (msg: string) => void;
  reducedMotion: boolean;
  /** Animate in (false when restoring after reload). */
  animateIn: boolean;
  /** Called after exiting with the 10h "Stop at last activity…" action. */
  onStopAtLastActivity: () => void;
}

function readStoredMode(): ReadoutMode {
  try {
    const v = localStorage.getItem(READOUT_KEY);
    return v === 'elapsed' || v === 'hidden' ? v : 'remaining';
  } catch {
    return 'remaining';
  }
}

/** Where the sky opens from / closes to: the Clock in / focus button if visible, else the centre. */
function originPoint(): { x: string; y: string } {
  const el = document.querySelector<HTMLElement>('[data-focus-origin]');
  const r = el?.getBoundingClientRect();
  if (!r || r.width === 0) return { x: '50%', y: '50%' };
  return { x: `${r.left + r.width / 2}px`, y: `${r.top + r.height / 2}px` };
}

export function FocusMode(props: FocusModeProps) {
  const data = useStore();
  const now = useNow(1000);
  const view = focusView(data, now);
  if (!view) return null;
  return <FocusModeInner {...props} view={view} now={now} />;
}

function FocusModeInner({ announcement, announce, reducedMotion, animateIn, onStopAtLastActivity, view, now }: FocusModeProps & { view: FocusView; now: Date }) {
  const data = useStore();
  const dispatch = useDispatch();
  const actions = useTimerActions();
  const ref = useRef<HTMLDivElement>(null);
  const visible = usePageVisible();
  const fullscreen = useFullscreen(ref);
  const phase = view.phase;
  const sticky = phase === 'complete' || (phase === 'break' && view.breakOver);
  const idle = useIdle(3000, !sticky);
  const [closing, setClosing] = useState(false);
  const [opening, setOpening] = useState(animateIn);
  const [origin] = useState(originPoint);
  const [readoutMode, setReadoutMode] = useState<ReadoutMode>(readStoredMode);
  const [pending, setPending] = useState<PendingStop>(null);
  const [breakMinutes, setBreakMinutes] = useState(data.settings.focus.breakMinutes);
  const [hud, setHud] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const closingRef = useRef(false);

  useWakeLock(visible && phase !== 'paused');

  // App root inert + scroll lock while open.
  useLayoutEffect(() => {
    const root = document.getElementById('root');
    const prevOverflow = document.body.style.overflow;
    if (root) { root.inert = true; root.setAttribute('aria-hidden', 'true'); }
    document.body.style.overflow = 'hidden';
    return () => {
      if (root) { root.inert = false; root.removeAttribute('aria-hidden'); }
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    if (!opening) return;
    const t = window.setTimeout(() => setOpening(false), reducedMotion ? 260 : 1300);
    return () => window.clearTimeout(t);
  }, [opening, reducedMotion]);

  useEffect(() => { if (phase !== 'complete') setPending(null); }, [phase]);
  useEffect(() => { if (!hud) return; const t = window.setTimeout(() => setHud(''), 3000); return () => window.clearTimeout(t); }, [hud]);

  /** Play the close transition, then run `after` (which unmounts the overlay). */
  const close = useCallback((after: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    fullscreen.exit();
    setClosing(true);
    window.setTimeout(after, reducedMotion ? 240 : 560);
  }, [fullscreen, reducedMotion]);

  const exit = useCallback(() => close(() => dispatch({ type: 'focus/setImmersive', immersive: false })), [close, dispatch]);

  const initialFocus = useCallback(() => ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? null, []);
  useFocusTrap(ref, { active: true, onEscape: exit, initialFocus });
  // Move focus to the phase's primary control when the phase changes (§8 initial focus).
  const focusKey = `${phase}:${view.breakOver ? 1 : 0}:${pending ?? ''}`;
  useEffect(() => {
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [focusKey]);

  const cycleReadout = useCallback(() => {
    setReadoutMode((m) => {
      const next: ReadoutMode = m === 'remaining' ? 'elapsed' : m === 'elapsed' ? 'hidden' : 'remaining';
      try { localStorage.setItem(READOUT_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const s = view.session;

  const doPause = () => { const msg = actions.pause(); announce('Paused.'); if (msg) setHud(msg); };
  const doResume = () => { primeAudio(); actions.resume(); announce('Resumed.'); };
  const doExtend = (m: number) => { actions.extend(m); announce(`Extended by ${m} minutes.`); };
  const doKeepGoing = () => { primeAudio(); actions.keepGoing(); announce(`Block started, ${s.blockMinutes} minutes.`); };
  const doBreak = (atEnd: boolean) => { actions.startBreak(breakMinutes, atEnd); setPending(null); announce(`Break started, ${breakMinutes} minutes.`); };
  const doNext = (m?: number | null) => { primeAudio(); actions.nextBlock(m); const len = m === undefined ? s.blockMinutes : m; announce(len ? `Block started, ${len} minutes.` : 'Focus started.'); };
  const doClockOut = (atEnd = false) => {
    const stopAt = atEnd && s.completedAt ? s.completedAt : undefined;
    const startMs = data.activeTimer ? Date.parse(data.activeTimer.startedAt) : null;
    close(() => {
      actions.clockOut(stopAt);
      if (startMs !== null) announce(`Clocked out, logged ${formatDuration(Math.round(((stopAt ? Date.parse(stopAt) : Date.now()) - startMs) / 60000))}.`);
    });
  };
  const requestClockOut = () => {
    if (phase === 'complete' && view.overtimeMs >= OVERTIME_CHOICE_MS) setPending('clockout');
    else doClockOut(false);
  };
  const requestBreak = () => {
    if (phase !== 'complete') return;
    if (view.overtimeMs >= OVERTIME_CHOICE_MS) setPending('break');
    else doBreak(false);
  };
  const toggleMute = () => dispatch({ type: 'focus/settings', patch: { chime: !data.settings.focus.chime } });
  const setScene = (scene: SceneId) => { dispatch({ type: 'focus/setScene', scene }); dispatch({ type: 'focus/settings', patch: { scene } }); };

  // Overlay keys (FOCUS_PLAN §3.11). Esc is handled by the focus trap.
  useOverlayKeys(ref, (e) => {
    const k = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const onButton = (e.target as HTMLElement | null)?.closest('button, select, a');
    switch (k) {
      case 'Space':
        if (onButton) return false;
        if (phase === 'focus') doPause(); else if (phase === 'paused') doResume(); else return false;
        return true;
      case 'f': fullscreen.toggle(); return true;
      case 'm': toggleMute(); return true;
      case 't': cycleReadout(); return true;
      case 'e':
        if (phase === 'focus' && s.blockMinutes !== null) doExtend(5);
        else if (phase === 'complete') doExtend(5);
        else if (phase === 'break' && !view.breakOver) actions.extendBreak(5);
        else return false;
        return true;
      case 'k':
        if (phase === 'complete') doKeepGoing(); else if (phase === 'break') doNext(); else return false;
        return true;
      case 'b': if (phase === 'complete') { requestBreak(); return true; } return false;
      case 'c': requestClockOut(); return true;
      case '?': setShowKeys((v) => !v); return true;
      default: return false;
    }
  });

  const longRun = !!data.activeTimer && now.getTime() - Date.parse(data.activeTimer.startedAt) >= LONG_RUN_MS;
  const sceneProgress = phase === 'complete' ? Math.min(1, view.overtimeMs / (60 * 60_000)) : view.progress;
  const scenePhase = phase === 'focus' && s.blockMinutes === null ? 'open' : phase;
  const chromeHidden = idle && !sticky && !showKeys;
  const label = [view.courseName, view.sectionTitle].filter(Boolean).join(' · ');

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
      className={`${styles.overlay} ${opening ? styles.opening : ''} ${closing ? styles.closing : ''} ${reducedMotion ? styles.reduced : ''} ${chromeHidden ? `${styles.hidden} ${styles.idleCursor}` : styles.shown}`}
      style={{ ['--ox' as string]: origin.x, ['--oy' as string]: origin.y }}
      data-phase={phase}
    >
      <div className={styles.scene} aria-hidden="true">
        <SceneCanvas sceneId={s.scene} phase={scenePhase} progress={sceneProgress} completedAt={s.completedAt}
          reducedMotion={reducedMotion} running={visible} accent={view.courseColor ?? '#3446c9'} />
      </div>
      <div className={styles.scrim} aria-hidden="true" />

      <div className={`${styles.chrome} ${animateIn ? styles.chromeIn : ''}`}>
        <div className={`${styles.top} ${styles.fade}`}>
          <div className={styles.label}>{label}<small>{view.blockLabel}</small></div>
          <div className={styles.topBtns}>
            <label className="visually-hidden" htmlFor="focus-scene">Scene</label>
            <span className={`${styles.pill} ${styles.small}`}>
              <select id="focus-scene" value={s.scene} onChange={(e) => setScene(e.target.value as SceneId)}>
                {SCENE_IDS.map((id) => <option key={id} value={id}>{SCENE_META[id].label}</option>)}
              </select>
            </span>
            <button type="button" className={styles.iconBtn} onClick={toggleMute} aria-pressed={!data.settings.focus.chime}
              aria-label={data.settings.focus.chime ? 'Mute chime (M)' : 'Unmute chime (M)'} title={data.settings.focus.chime ? 'Chime on (M)' : 'Chime off (M)'}>
              {data.settings.focus.chime ? '🔔' : '🔕'}
            </button>
            {fullscreen.supported && (
              <button type="button" className={styles.iconBtn} onClick={fullscreen.toggle} aria-label={fullscreen.isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}>
                ⛶ <kbd>F</kbd>
              </button>
            )}
            <button type="button" className={styles.iconBtn} onClick={exit} aria-label="Exit focus view (timer keeps running)">
              <Icon name="x" size={18} /> <kbd>Esc</kbd>
            </button>
          </div>
        </div>

        <div className={styles.middle} />

        <div className={styles.bottom}>
          {longRun && (
            <div className={styles.notice} role="status">
              Timer has been running 10h+ — still studying?
              <button type="button" className={`${styles.pill} ${styles.small}`} onClick={() => close(() => { dispatch({ type: 'focus/setImmersive', immersive: false }); onStopAtLastActivity(); })}>Stop at last activity…</button>
            </div>
          )}
          {hud && <div className={styles.hud} role="status">{hud}</div>}
          <FocusHud view={view} now={now} readoutMode={readoutMode} onCycleReadout={cycleReadout} />
          {phase === 'focus' || phase === 'paused' ? (
            <div className={styles.fade}>
              <FocusControls view={view} onPause={doPause} onResume={doResume} onExtend={() => doExtend(5)} onClockOut={requestClockOut} />
            </div>
          ) : phase === 'complete' ? (
            <CompletePanel view={view} now={now} breakMinutes={breakMinutes} setBreakMinutes={setBreakMinutes} pending={pending} setPending={setPending}
              onKeepGoing={doKeepGoing} onExtend={doExtend} onBreak={doBreak} onClockOut={doClockOut} />
          ) : (
            <div className={view.breakOver ? undefined : styles.fade}>
              <BreakPanel view={view} onNext={doNext} onExtendBreak={() => actions.extendBreak(5)} onClockOut={() => doClockOut(false)} />
            </div>
          )}
        </div>
        {showKeys && (
          <div className={styles.keys} role="note" aria-label="Focus mode keys">
            <table><tbody>
              <tr><td><kbd>Space</kbd></td><td>Pause / resume</td></tr>
              <tr><td><kbd>E</kbd></td><td>+5 min</td></tr>
              <tr><td><kbd>K</kbd></td><td>Keep going / next block</td></tr>
              <tr><td><kbd>B</kbd></td><td>Take a break</td></tr>
              <tr><td><kbd>C</kbd></td><td>Clock out</td></tr>
              <tr><td><kbd>F</kbd></td><td>Fullscreen</td></tr>
              <tr><td><kbd>M</kbd></td><td>Mute chime</td></tr>
              <tr><td><kbd>T</kbd></td><td>Readout: left / elapsed / hidden</td></tr>
              <tr><td><kbd>Esc</kbd></td><td>Leave (timer keeps running)</td></tr>
            </tbody></table>
          </div>
        )}
      </div>
      <div className="visually-hidden" aria-live="polite">{announcement}</div>
    </div>,
    document.body,
  );
}

/** keydown (capture) while this overlay is the top-most dialog; handler returns true when it consumed the key. */
function useOverlayKeys(ref: React.RefObject<HTMLElement>, handler: (e: KeyboardEvent) => boolean) {
  const h = useRef(handler);
  h.current = handler;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const node = ref.current;
      if (!node || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== node) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest('input, textarea, [contenteditable="true"]')) return;
      if (t && t.closest('select') && e.key !== 'Escape') return;
      if (h.current(e)) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [ref]);
}
