// Focus-mode pure logic (FOCUS_PLAN.md §5.1). Every function takes `now` explicitly.
import type { ActiveTimer, AppData, BlockChoice, FocusSession, IsoInstant, ScheduledBlock } from './types';
import { toDateKey, weekStartOf } from './time';

export const OPEN_LOOP_MS = 60 * 60_000;
export const BLOCK_PRESETS = [25, 50, 90] as const;
export const BREAK_PRESETS = [5, 10, 15, 20] as const;
export const EXTEND_PRESETS = [5, 10, 15] as const;
export const STALE_MS = 6 * 60 * 60_000;
export const MAX_BLOCK_MINUTES = 480;

const ms = (iso: IsoInstant) => Date.parse(iso);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Focus ms in the current block: banked segments plus the running one. */
export function focusedMs(s: FocusSession, now: Date): number {
  return s.focusedMsBefore + (s.segmentStartedAt ? Math.max(0, now.getTime() - ms(s.segmentStartedAt)) : 0);
}

export function blockMs(s: FocusSession): number | null {
  return s.blockMinutes === null ? null : s.blockMinutes * 60_000;
}

/** 0..1. Open-ended sessions loop every 60 focused minutes; 'complete' is always 1. */
export function blockProgress(s: FocusSession, now: Date): number {
  const f = focusedMs(s, now);
  const b = blockMs(s);
  if (b === null) return (f % OPEN_LOOP_MS) / OPEN_LOOP_MS;
  if (s.phase === 'complete') return 1;
  return b > 0 ? clamp(f / b, 0, 1) : 1;
}

/** null when open-ended; negative = overtime. */
export function blockRemainingMs(s: FocusSession, now: Date): number | null {
  const b = blockMs(s);
  return b === null ? null : b - focusedMs(s, now);
}

/** The instant the running block reaches 100% (only while 'focus'). */
export function blockEndsAt(s: FocusSession): IsoInstant | null {
  const b = blockMs(s);
  if (s.phase !== 'focus' || b === null || !s.segmentStartedAt) return null;
  return new Date(ms(s.segmentStartedAt) + (b - s.focusedMsBefore)).toISOString();
}

export function isBlockDue(s: FocusSession, now: Date): boolean {
  if (s.phase !== 'focus' || s.blockMinutes === null) return false;
  const r = blockRemainingMs(s, now);
  return r !== null && r <= 0;
}

export function overtimeMs(s: FocusSession, now: Date): number {
  return s.phase === 'complete' && s.completedAt ? Math.max(0, now.getTime() - ms(s.completedAt)) : 0;
}

export function breakProgress(s: FocusSession, now: Date): number {
  if (s.phase !== 'break' || !s.breakStartedAt || !s.breakEndsAt) return 0;
  const total = ms(s.breakEndsAt) - ms(s.breakStartedAt);
  return total > 0 ? clamp((now.getTime() - ms(s.breakStartedAt)) / total, 0, 1) : 1;
}

export function breakRemainingMs(s: FocusSession, now: Date): number {
  if (s.phase !== 'break' || !s.breakEndsAt) return 0;
  return ms(s.breakEndsAt) - now.getTime();
}

export function isBreakOver(s: FocusSession, now: Date): boolean {
  return s.phase === 'break' && !!s.breakEndsAt && now.getTime() >= ms(s.breakEndsAt);
}

/** The planned block containing now (today, current week plan), if ≥ 5 min remain. */
export function plannedBlockNow(data: Pick<AppData, 'weekPlans'>, now: Date): { block: ScheduledBlock; minutesLeft: number } | null {
  const today = toDateKey(now);
  const plan = data.weekPlans[weekStartOf(today)];
  if (!plan) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 60000;
  const current = plan.blocks
    .filter((b) => b.date === today && b.startMin <= nowMin && nowMin < b.endMin)
    .sort((a, b) => b.startMin - a.startMin)[0];
  if (!current) return null;
  const minutesLeft = Math.floor(current.endMin - nowMin);
  return minutesLeft >= 5 ? { block: current, minutesLeft } : null;
}

export function resolveBlockMinutes(choice: BlockChoice, data: Pick<AppData, 'weekPlans'>, now: Date, fallback: number): number | null {
  switch (choice.kind) {
    case 'preset':
    case 'custom':
      return choice.minutes;
    case 'open':
      return null;
    case 'planned':
      return plannedBlockNow(data, now)?.minutesLeft ?? fallback;
  }
}

export function clampBlockMinutes(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return clamp(Math.round(n), 5, 240);
}

export function clampBreakMinutes(n: number): number {
  if (!Number.isFinite(n)) return 10;
  return clamp(Math.round(n), 1, 60);
}

export function isStaleFocus(s: FocusSession, now: Date): boolean {
  if (s.phase === 'paused' && s.pausedAt) return now.getTime() - ms(s.pausedAt) > STALE_MS;
  if (s.phase === 'break' && s.breakEndsAt) return now.getTime() - ms(s.breakEndsAt) > STALE_MS;
  return false;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "4:05", "25:00", "1:02:05" (ceil to the second); negative → "+3:12". */
export function formatCountdown(msLeft: number): string {
  const neg = msLeft < 0;
  const total = neg ? Math.floor(-msLeft / 1000) : Math.ceil(msLeft / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const body = h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  return neg ? `+${body}` : body;
}

export function focusTitle(s: FocusSession, now: Date, courseName: string): string {
  switch (s.phase) {
    case 'focus': {
      const r = blockRemainingMs(s, now);
      return `▶ ${r === null ? formatCountdown(focusedMs(s, now)) : formatCountdown(Math.max(0, r))} · ${courseName}`;
    }
    case 'paused':
      return `❚❚ Paused · ${courseName}`;
    case 'complete':
      return `✓ Block done · ${courseName}`;
    case 'break':
      return isBreakOver(s, now) ? '☕ Break over' : `☕ Break ${formatCountdown(breakRemainingMs(s, now))}`;
  }
}

/** Broken §4.2 invariants (empty = consistent). Used by validation and tests. */
export function focusInvariantErrors(s: FocusSession, activeTimer: ActiveTimer | null): string[] {
  const errs: string[] = [];
  const running = s.phase === 'focus' || s.phase === 'complete';
  if (running && (!activeTimer || !s.segmentStartedAt)) errs.push('running phase needs a timer and a segment');
  if (!running && (activeTimer || s.segmentStartedAt)) errs.push('paused/break phase must have no timer and no segment');
  if (s.phase === 'paused' && !s.pausedAt) errs.push('paused needs pausedAt');
  if (s.phase === 'break' && (!s.breakStartedAt || !s.breakEndsAt || s.breakMinutes === null)) errs.push('break needs break fields');
  if (s.phase === 'complete' && (!s.completedAt || s.blockMinutes === null)) errs.push('complete needs completedAt and a block length');
  if (s.blockMinutes === null && s.phase === 'complete') errs.push('open-ended can never complete');
  return errs;
}
