// Local-calendar helpers. No date library. All "which day" logic uses LOCAL time.
import type { DateKey, IsoInstant, WeekKey, Weekday } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidDateKey(key: string | undefined | null): key is DateKey {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = parseDateKey(key);
  return toDateKey(d) === key;
}

/** Local midnight of the given day. */
export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = parseDateKey(key);
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(key: DateKey): Weekday {
  return ((parseDateKey(key).getDay() + 6) % 7) as Weekday;
}

export function weekStartOf(key: DateKey): WeekKey {
  return addDays(key, -weekdayOf(key));
}

export function weekDates(weekStart: WeekKey): DateKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isRestDay(key: DateKey, restDays: Weekday[]): boolean {
  return restDays.includes(weekdayOf(key));
}

/** Days between two keys (b − a). */
export function daysBetween(a: DateKey, b: DateKey): number {
  const da = parseDateKey(a);
  const db = parseDateKey(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function minutesBetween(start: IsoInstant | Date, end: IsoInstant | Date): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

/**
 * Cut [start, end) at each LOCAL midnight. DST-safe because midnights are
 * built with new Date(y, m, d), never by adding 24h.
 */
export function splitByLocalDay(start: IsoInstant | Date, end: IsoInstant | Date): Array<{ date: DateKey; minutes: number }> {
  const s = new Date(start);
  const e = new Date(end);
  const out: Array<{ date: DateKey; minutes: number }> = [];
  if (!(e.getTime() > s.getTime())) return out;
  let cur = s;
  while (cur.getTime() < e.getTime()) {
    const nextMidnight = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    const pieceEnd = nextMidnight.getTime() < e.getTime() ? nextMidnight : e;
    const minutes = Math.round((pieceEnd.getTime() - cur.getTime()) / 60000);
    if (minutes > 0) out.push({ date: toDateKey(cur), minutes });
    cur = pieceEnd;
  }
  return out;
}

/** Local Date for a day + minutes after midnight (1440 = next midnight). */
export function dateAtMinute(key: DateKey, minute: number): Date {
  const d = parseDateKey(key);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minute);
}

/** Minutes after local midnight of `d`. */
export function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** "09:05" — for <input type="time">. 1440 → "24:00". */
export function minToHHMM(min: number): string {
  const m = Math.round(min);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function hhmmToMin(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59 || (h === 24 && mm > 0)) return null;
  return h * 60 + mm;
}

export type DurationFormat = 'hmm' | 'decimal';

/** Every duration render goes through here. Minutes in. `h:mm` or `2.50`. */
export function formatDuration(minutes: number, fmt: DurationFormat = 'hmm'): string {
  if (fmt === 'decimal') return formatHoursDecimal(minutes);
  const sign = minutes < 0 ? '−' : '';
  const m = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(m / 60)}:${pad(m % 60)}`;
}

export function formatHoursDecimal(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

/** Signed duration: "+1:25" / "−3:20". */
export function formatSigned(minutes: number): string {
  return minutes >= 0 ? `+${formatDuration(minutes)}` : formatDuration(minutes);
}

/** "1 hour 5 minutes" for screen readers. */
export function spokenDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (r || !h) parts.push(`${r} minute${r === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** H:MM:SS for the running timer. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad(m)}:${pad(s)}`;
}

/** "9:12 AM" (locale-aware). */
export function formatClock(d: Date | IsoInstant): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(d));
}

/** "Thu 30 Oct" */
export function formatDay(key: DateKey): string {
  const d = parseDateKey(key);
  const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(d);
  const mo = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d);
  return `${wd} ${d.getDate()} ${mo}`;
}

/** "Week of Mon 26 Oct 2026" */
export function formatWeekLabel(weekStart: WeekKey): string {
  return `Week of ${formatDay(weekStart)} ${parseDateKey(weekStart).getFullYear()}`;
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
