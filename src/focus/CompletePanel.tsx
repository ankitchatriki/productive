import styles from './FocusMode.module.css';
import { BREAK_PRESETS, EXTEND_PRESETS } from '../domain/focus';
import { formatClock } from '../domain/time';
import type { FocusView } from '../state/selectors';

export type PendingStop = null | 'break' | 'clockout';

interface CompletePanelProps {
  view: FocusView;
  now: Date;
  breakMinutes: number;
  setBreakMinutes: (m: number) => void;
  pending: PendingStop;
  setPending: (p: PendingStop) => void;
  onKeepGoing: () => void;
  onExtend: (m: number) => void;
  onBreak: (stopAtBlockEnd: boolean) => void;
  onClockOut: (stopAtBlockEnd: boolean) => void;
}

export const OVERTIME_CHOICE_MS = 2 * 60_000;

/** Block complete: keep going / extend / break / clock out (+ overtime choice). */
export function CompletePanel(p: CompletePanelProps) {
  const { view, now } = p;
  const s = view.session;
  const needsChoice = view.overtimeMs >= OVERTIME_CHOICE_MS;
  const endAt = s.completedAt ? formatClock(s.completedAt) : '';
  const request = (kind: 'break' | 'clockout') => {
    if (needsChoice) p.setPending(kind);
    else if (kind === 'break') p.onBreak(false);
    else p.onClockOut(false);
  };
  if (p.pending) {
    const act = (atEnd: boolean) => (p.pending === 'break' ? p.onBreak(atEnd) : p.onClockOut(atEnd));
    return (
      <div className={styles.card} role="group" aria-label="When did you stop?">
        <p className={styles.cardText}>You kept going past the block. When did you stop?</p>
        <div className={styles.row}>
          <button type="button" className={`${styles.pill} ${styles.primary}`} data-autofocus onClick={() => act(true)}>Stop at block end ({endAt})</button>
          <button type="button" className={styles.pill} onClick={() => act(false)}>Stop now ({formatClock(now)})</button>
          <button type="button" className={`${styles.pill} ${styles.small}`} onClick={() => p.setPending(null)}>Back</button>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.card} role="group" aria-label="Block complete">
      <p className={styles.cardText}>Nice work: {s.blockMinutes} minutes on {view.courseName}.</p>
      <div className={styles.row}>
        <button type="button" className={`${styles.pill} ${styles.primary}`} data-autofocus onClick={p.onKeepGoing}>Keep going · {s.blockMinutes} min <kbd>K</kbd></button>
        {EXTEND_PRESETS.map((m) => (
          <button key={m} type="button" className={`${styles.pill} ${styles.small}`} onClick={() => p.onExtend(m)} aria-label={`Extend by ${m} minutes`}>+{m}{m === 5 && <kbd>E</kbd>}</button>
        ))}
      </div>
      <div className={styles.row}>
        <span className={styles.pill}>
          <button type="button" onClick={() => request('break')} style={{ background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}>Take a break <kbd>B</kbd></button>
          <label className="visually-hidden" htmlFor="break-len">Break length</label>
          <select id="break-len" value={p.breakMinutes} onChange={(e) => p.setBreakMinutes(Number(e.target.value))}>
            {[...new Set([...BREAK_PRESETS, p.breakMinutes])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </span>
        <button type="button" className={styles.pill} onClick={() => request('clockout')}>■ Clock out <kbd>C</kbd></button>
      </div>
    </div>
  );
}
