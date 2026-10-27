import { useStore } from '../state/store';
import { focusView } from '../state/selectors';
import { useNow } from '../hooks/useNow';
import { formatCountdown } from '../domain/focus';
import type { BlockChoice } from '../domain/types';

export function blockChoiceLabel(c: BlockChoice): string {
  if (c.kind === 'preset' || c.kind === 'custom') return `${c.minutes} min`;
  if (c.kind === 'planned') return 'until planned end';
  return 'no limit';
}

/** Short text for the session state (pill second line, Today strip). */
export function focusStateText(v: NonNullable<ReturnType<typeof focusView>>): string {
  if (v.phase === 'focus') return v.remainingMs === null ? `${formatCountdown(v.focusedMs)} focused` : `${formatCountdown(Math.max(0, v.remainingMs))} left`;
  if (v.phase === 'paused') return 'Paused';
  if (v.phase === 'complete') return `${formatCountdown(-Math.max(0, v.overtimeMs))} over`;
  return v.breakOver ? 'Break over' : `Break ${formatCountdown(v.breakRemainingMs)}`;
}

/** Slim block progress bar on Today's timer card while a session exists. */
export function FocusStrip() {
  const data = useStore();
  const now = useNow(1000);
  const v = focusView(data, now);
  if (!v) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} aria-label={`Focus: ${focusStateText(v)}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        <span>◐ {v.blockLabel}</span><span className="num">{focusStateText(v)}</span>
      </div>
      <div className="bar" role="progressbar" aria-label="Block progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v.progress * 100)}>
        <div className="bar-fill" style={{ width: `${v.progress * 100}%`, background: v.phase === 'break' ? 'var(--text-subtle)' : 'var(--accent)' }} />
      </div>
    </div>
  );
}
