import { useRef, type KeyboardEvent } from 'react';
import styles from './Heatmap.module.css';
import { heatLevel } from '../domain/streaks';
import { MONTH_SHORT, WEEKDAY_SHORT, addDays, formatDay, formatDuration, parseDateKey } from '../domain/time';
import type { DateKey, WeekKey } from '../domain/types';

interface HeatmapProps {
  lastWeekStart: WeekKey;
  weeks: number;
  today: DateKey;
  minutesFor: (d: DateKey) => number;
  goalFor: (d: DateKey) => number;
  isRest: (d: DateKey) => boolean;
  onSelect: (d: DateKey) => void;
}

const LEVEL_VAR = ['var(--heat-0)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)', 'var(--heat-5)'];

/** Columns = weeks (Mon start), rows = Mon–Sun. Roving tabindex, arrow keys move. */
export function Heatmap({ lastWeekStart, weeks, today, minutesFor, goalFor, isRest, onSelect }: HeatmapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const first = addDays(lastWeekStart, -7 * (weeks - 1));
  const cols = Array.from({ length: weeks }, (_, w) => addDays(first, 7 * w));
  const focusDate = today >= first && today < addDays(lastWeekStart, 7) ? today : addDays(lastWeekStart, 6);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, d: DateKey) => {
    const delta = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = addDays(d, delta);
    const el = ref.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`);
    if (el) {
      ref.current?.querySelectorAll<HTMLButtonElement>('button[data-date]').forEach((b) => (b.tabIndex = -1));
      el.tabIndex = 0;
      el.focus();
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.scroller}>
        <div className={styles.months} style={{ gridTemplateColumns: `24px repeat(${weeks}, 12px)` }} aria-hidden="true">
          <span />
          {cols.map((ws, i) => {
            const m = parseDateKey(ws).getMonth();
            const show = i === 0 || parseDateKey(cols[i - 1]).getMonth() !== m;
            return <span key={ws}>{show ? MONTH_SHORT[m] : ''}</span>;
          })}
        </div>
        <div className={styles.grid} ref={ref} role="grid" aria-label={`Daily hours, last ${weeks} weeks`} style={{ gridTemplateColumns: `24px repeat(${weeks}, 12px)` }}>
          {WEEKDAY_SHORT.map((wd, r) => (
            <div key={wd} role="row" className={styles.row}>
              <span className={styles.rowLabel} aria-hidden="true">{r % 2 === 0 ? wd.slice(0, 1) : ''}</span>
              {cols.map((ws) => {
                const d = addDays(ws, r);
                const future = d > today;
                const m = future ? 0 : minutesFor(d);
                const g = goalFor(d);
                const lvl = heatLevel(m, g);
                const rest = isRest(d);
                const label = `${formatDay(d)}: ${formatDuration(m)} logged, goal ${formatDuration(g)}${rest ? ', rest day' : ''}${lvl === 4 ? ', goal met' : ''}`;
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    data-date={d}
                    tabIndex={d === focusDate ? 0 : -1}
                    className={`${styles.cell} ${future ? styles.future : ''} ${d === today ? styles.today : ''} ${rest && lvl === 0 && !future ? styles.rest : ''}`}
                    style={{ background: future ? 'transparent' : LEVEL_VAR[lvl] }}
                    title={label}
                    aria-label={label}
                    onClick={() => onSelect(d)}
                    onKeyDown={(e) => onKey(e, d)}
                  >
                    {lvl === 4 && <span className={styles.met} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.legend} aria-hidden="true">
        Less {LEVEL_VAR.map((c, i) => <span key={i} className={styles.cell} style={{ background: c }}>{i === 4 && <span className={styles.met} />}</span>)} More
      </div>
    </div>
  );
}
