import styles from './FocusMode.module.css';
import type { FocusView } from '../state/selectors';

interface FocusControlsProps {
  view: FocusView;
  onPause: () => void;
  onResume: () => void;
  onExtend: () => void;
  onClockOut: () => void;
}

/** Bottom control bar for 'focus' and 'paused' (auto-hides; stays in the tab order). */
export function FocusControls({ view, onPause, onResume, onExtend, onClockOut }: FocusControlsProps) {
  return (
    <div className={styles.controls} role="group" aria-label="Focus controls">
      {view.phase === 'paused' ? (
        <button type="button" className={`${styles.pill} ${styles.primary}`} data-autofocus onClick={onResume}>▶ Resume <kbd>Space</kbd></button>
      ) : (
        <button type="button" className={styles.pill} data-autofocus onClick={onPause}>❚❚ Pause <kbd>Space</kbd></button>
      )}
      {view.phase === 'focus' && view.remainingMs !== null && (
        <button type="button" className={styles.pill} onClick={onExtend} aria-label="Add 5 minutes">+5 min <kbd>E</kbd></button>
      )}
      <button type="button" className={styles.pill} onClick={onClockOut}>■ Clock out <kbd>C</kbd></button>
    </div>
  );
}
