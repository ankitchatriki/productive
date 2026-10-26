import { formatDuration } from '../domain/time';
import styles from './BarChart.module.css';

export interface Bar { key: string; label: string; value: number; ghost?: number; highlight?: boolean; current?: boolean; title?: string }

interface BarChartProps {
  bars: Bar[];
  /** Horizontal reference line (e.g. daily goal), minutes. */
  goal?: number | null;
  goalLabel?: string;
  height?: number;
  ariaLabel: string;
  onBarClick?: (key: string) => void;
}

/** Hand-rolled SVG bar chart: solid = logged, hatched ghost = planned, dashed goal line. */
export function BarChart({ bars, goal, goalLabel, height = 180, ariaLabel, onBarClick }: BarChartProps) {
  const W = 100 * Math.max(1, bars.length);
  const top = 16;
  const bottom = 22;
  const plotH = height - top - bottom;
  const maxRaw = Math.max(60, goal ?? 0, ...bars.map((b) => Math.max(b.value, b.ghost ?? 0)));
  const step = maxRaw > 1200 ? 600 : maxRaw > 480 ? 120 : 60;
  const max = Math.ceil(maxRaw / step) * step;
  const y = (m: number) => top + plotH - (m / max) * plotH;
  const slot = W / Math.max(1, bars.length);
  const bw = Math.min(56, slot * 0.56);
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  const patternId = `hatch-${ariaLabel.replace(/\W/g, '')}`;

  return (
    <figure className={styles.fig}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className={styles.svg} style={{ height }} role="img" aria-label={ariaLabel}>
        <defs>
          <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--border-strong)" strokeWidth="1.5" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {bars.map((b, i) => {
          const cx = slot * i + slot / 2;
          return (
            <g key={b.key} className={onBarClick ? styles.clickable : undefined} onClick={onBarClick ? () => onBarClick(b.key) : undefined}>
              <title>{b.title ?? `${b.label}: ${formatDuration(b.value)}${b.ghost != null ? `, planned ${formatDuration(b.ghost)}` : ''}`}</title>
              {b.ghost != null && b.ghost > 0 && (
                <rect x={cx - bw / 2 - 4} width={bw + 8} y={y(b.ghost)} height={y(0) - y(b.ghost)} fill={`url(#${patternId})`} stroke="var(--border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" rx={3} />
              )}
              {b.value > 0 && (
                <rect x={cx - bw / 2} width={bw} y={y(b.value)} height={y(0) - y(b.value)} fill={b.highlight ? 'var(--ontrack)' : 'var(--accent)'} rx={3} />
              )}
            </g>
          );
        })}
        {goal != null && goal > 0 && (
          <line x1={0} x2={W} y1={y(goal)} y2={y(goal)} stroke="var(--text-muted)" strokeDasharray="5 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className={`${styles.labels} ${bars.length > 8 ? styles.dense : ''}`} style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {bars.map((b) => <span key={b.key} className={b.current ? styles.hl : undefined}>{b.label}</span>)}
      </div>
      <div className={styles.axis} aria-hidden="true">
        <span>max {formatDuration(max)}</span>
        {goal != null && goal > 0 && <span>- - {goalLabel ?? 'goal'} {formatDuration(goal)}</span>}
      </div>
      <table className="visually-hidden">
        <caption>{ariaLabel}</caption>
        <tbody>{bars.map((b) => <tr key={b.key}><th scope="row">{b.label}</th><td>{formatDuration(b.value)}</td>{b.ghost != null && <td>planned {formatDuration(b.ghost)}</td>}</tr>)}</tbody>
      </table>
    </figure>
  );
}
