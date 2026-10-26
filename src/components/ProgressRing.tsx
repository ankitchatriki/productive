import { formatDuration, spokenDuration } from '../domain/time';
import styles from './ProgressRing.module.css';

export interface RingSegment { key: string; color: string; minutes: number }

interface ProgressRingProps {
  segments: RingSegment[];
  goalMinutes: number;
  restDay?: boolean;
  statusLabel: string;
}

const SIZE = 168;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const R_IN = R - STROKE / 2 - 6 - 4; // 8px stroke, 6px inset
const C_IN = 2 * Math.PI * R_IN;
const GAP = 2;

export function ProgressRing({ segments, goalMinutes, restDay, statusLabel }: ProgressRingProps) {
  const total = segments.reduce((s, x) => s + x.minutes, 0);
  const goal = Math.max(1, goalMinutes);
  const over = Math.max(0, total - goalMinutes);
  let offset = 0;
  const arcs: Array<{ key: string; color: string; len: number; start: number }> = [];
  let remaining = goal;
  for (const seg of segments) {
    if (remaining <= 0 || seg.minutes <= 0) continue;
    const m = Math.min(seg.minutes, remaining);
    remaining -= m;
    const len = (m / goal) * C;
    arcs.push({ key: seg.key, color: seg.color, len, start: offset });
    offset += len;
  }
  const multi = arcs.length > 1;
  const chip = restDay ? 'chip' : total >= goalMinutes ? 'chip chip-met' : 'chip';
  const aria = `${spokenDuration(total)} logged of ${spokenDuration(goalMinutes)} goal${restDay ? ', rest day' : ''}, ${statusLabel}`;
  return (
    <div className={styles.wrap} role="img" aria-label={aria}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={styles.svg} aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--surface-3)" strokeWidth={STROKE} />
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {arcs.map((a) => (
            <circle key={a.key} cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={a.color} strokeWidth={STROKE}
              strokeDasharray={`${Math.max(0, a.len - (multi ? GAP : 0))} ${C}`} strokeDashoffset={-a.start} className={styles.arc} />
          ))}
          {over > 0 && (
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R_IN} fill="none" stroke="var(--over)" strokeWidth={8} strokeLinecap="round"
              strokeDasharray={`${Math.min(1, over / goal) * C_IN} ${C_IN}`} className={styles.arc} />
          )}
        </g>
      </svg>
      <div className={styles.center}>
        <span className={styles.value}>{formatDuration(total)}</span>
        <span className={styles.of}>of {formatDuration(goalMinutes)}</span>
        {over > 0 && !restDay ? <span className={`${chip} chip-over`}>+{formatDuration(over)} over</span> : <span className={chip}>{statusLabel}</span>}
      </div>
    </div>
  );
}
