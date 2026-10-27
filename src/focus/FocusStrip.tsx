import { focusView } from '../state/selectors';
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

