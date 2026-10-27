import { addDays, formatWeekLabel } from '../domain/time';
import type { WeekKey } from '../domain/types';
import { Icon } from './Icon';
import styles from './WeekNav.module.css';

export function WeekNav({ weekStart, currentWeek, go }: { weekStart: WeekKey; currentWeek: WeekKey; go: (w: WeekKey) => void }) {
  return (
    <div className={styles.nav} role="group" aria-label="Week">
      <button type="button" className="btn btn-ghost btn-icon" onClick={() => go(addDays(weekStart, -7))} aria-label="Previous week" title="Previous week ([)"><Icon name="left" /></button>
      <span className={styles.label} aria-live="polite">{formatWeekLabel(weekStart)}</span>
      <button type="button" className="btn btn-ghost btn-icon" onClick={() => go(addDays(weekStart, 7))} aria-label="Next week" title="Next week (])"><Icon name="right" /></button>
      <button type="button" className="btn btn-sm" onClick={() => go(currentWeek)} disabled={weekStart === currentWeek} title="This week (T)">This week</button>
    </div>
  );
}
