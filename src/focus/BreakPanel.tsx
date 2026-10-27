import styles from './FocusMode.module.css';
import { BLOCK_PRESETS } from '../domain/focus';
import type { FocusView } from '../state/selectors';

interface BreakPanelProps {
  view: FocusView;
  onNext: (minutes?: number | null) => void;
  onExtendBreak: () => void;
  onClockOut: () => void;
}

export function BreakPanel({ view, onNext, onExtendBreak, onClockOut }: BreakPanelProps) {
  const last = view.session.blockMinutes;
  const lastLabel = last === null ? 'open-ended' : `${last} min`;
  if (view.breakOver) {
    return (
      <div className={styles.card} role="group" aria-label="Break over">
        <p className={styles.cardText}>Break's over. Ready for the next block?</p>
        <div className={styles.row}>
          <button type="button" className={`${styles.pill} ${styles.primary}`} data-autofocus onClick={() => onNext()}>▶ Start next block · {lastLabel} <kbd>K</kbd></button>
          {BLOCK_PRESETS.filter((m) => m !== last).map((m) => (
            <button key={m} type="button" className={`${styles.pill} ${styles.small}`} onClick={() => onNext(m)}>{m} min</button>
          ))}
          <button type="button" className={styles.pill} onClick={onClockOut}>■ Clock out <kbd>C</kbd></button>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.controls} role="group" aria-label="Break controls">
      <button type="button" className={`${styles.pill} ${styles.primary}`} data-autofocus onClick={() => onNext()}>▶ Start next block now <kbd>K</kbd></button>
      <button type="button" className={styles.pill} onClick={onExtendBreak}>+5 min break <kbd>E</kbd></button>
      <button type="button" className={styles.pill} onClick={onClockOut}>■ Clock out <kbd>C</kbd></button>
    </div>
  );
}
