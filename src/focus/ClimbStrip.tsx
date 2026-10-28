import styles from './FocusMode.module.css';

interface ClimbStripProps {
  /** Altitude in metres. */
  altM: number;
  /** "Climb N". */
  climbNo: number;
  /** How much of this block is done, 0..1 (open-ended: of each 60 focused minutes). */
  fraction: number;
}

/** The climb strip (ROUND6_PLAN §8): metres and climb in small caps over a hairline rule with a cream progress tick. */
export function ClimbStrip({ altM, climbNo, fraction }: ClimbStripProps) {
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <div className={styles.climb} aria-hidden="true">
      <div className={styles.climbLine}>{Math.max(0, Math.floor(altM)).toLocaleString('en-US')} m&nbsp;&nbsp;·&nbsp;&nbsp;Climb {climbNo}</div>
      <div className={styles.rule}><span className={styles.ruleDone} style={{ width: `${f * 100}%` }} /><span className={styles.tick} style={{ left: `${f * 100}%` }} /></div>
    </div>
  );
}
