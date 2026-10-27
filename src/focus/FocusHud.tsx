import styles from './FocusMode.module.css';
import { formatCountdown } from '../domain/focus';
import { formatClock } from '../domain/time';
import type { FocusView } from '../state/selectors';

export type ReadoutMode = 'remaining' | 'elapsed' | 'hidden';

interface FocusHudProps {
  view: FocusView;
  now: Date;
  readoutMode: ReadoutMode;
  onCycleReadout: () => void;
}

/** Status line, big readout and caption over the lake (FOCUS_DESIGN §2.2). */
export function FocusHud({ view, now, readoutMode, onCycleReadout }: FocusHudProps) {
  const { phase, session } = view;
  let status = '';
  let readout = '';
  let caption = '';
  let muted = false;
  let minutesLeft: number | null = null;

  if (phase === 'focus' || phase === 'paused') {
    const open = view.remainingMs === null;
    const remaining = Math.max(0, view.remainingMs ?? 0);
    minutesLeft = open ? null : Math.ceil(remaining / 60_000);
    const mode = open && readoutMode === 'remaining' ? 'elapsed' : readoutMode;
    readout = mode === 'elapsed' ? formatCountdown(view.focusedMs) : formatCountdown(remaining);
    if (phase === 'paused') caption = open ? `${formatCountdown(view.focusedMs)} focused` : `${formatCountdown(remaining)} left`;
    else if (open) caption = 'focused · open-ended';
    else if (mode === 'elapsed') caption = `focused · ${formatCountdown(remaining)} left`;
    else caption = `left · ends ${formatClock(new Date(now.getTime() + remaining))}`;
    if (mode === 'hidden') readout = '';
  } else if (phase === 'complete') {
    status = 'Block complete';
    readout = formatCountdown(-Math.max(1000, view.overtimeMs));
    if (view.overtimeMs < 1000) readout = formatCountdown((session.blockMinutes ?? 0) * 60_000);
    caption = view.overtimeMs >= 1000 ? `past your ${session.blockMinutes} min block` : `${session.blockMinutes} minutes done`;
    muted = view.overtimeMs >= 1000;
  } else {
    muted = true;
    if (view.breakOver) {
      status = "Break's over";
      readout = formatCountdown(view.breakRemainingMs);
      caption = 'Ready for the next block?';
    } else {
      readout = formatCountdown(view.breakRemainingMs);
      caption = 'break';
      minutesLeft = Math.ceil(view.breakRemainingMs / 60_000);
    }
  }

  const timerLabel = minutesLeft !== null ? `${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} left` : status || caption;

  return (
    <>
      <div className={styles.status} aria-hidden={!status}>{status}</div>
      {phase === 'paused' && <div className={styles.paused}>PAUSED</div>}
      {readout ? (
        <button type="button" className={`${styles.readout} ${muted ? styles.muted : ''}`} onClick={onCycleReadout}
          role="timer" aria-live="off" aria-label={`${timerLabel}. Change readout (T)`}>
          {readout}
        </button>
      ) : (
        <button type="button" className={`${styles.readout} ${styles.readoutHidden}`} onClick={onCycleReadout} aria-label="Show the time (T)">show time</button>
      )}
      {caption && <div className={styles.caption}>{caption}</div>}
    </>
  );
}
