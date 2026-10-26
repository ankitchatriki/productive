// Timecard CSV export (PLAN.md §3.3).
import type { AppData, WeekKey } from './types';
import { addDays, minToHHMM, parseDateKey, toDateKey } from './time';

export const CSV_HEADER = ['date', 'start', 'end', 'minutes', 'course', 'section', 'note', 'source'];

export function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const hhmm = (d: Date) => minToHHMM(d.getHours() * 60 + d.getMinutes());

/** One row per entry that overlaps the week (local days), sorted by start. */
export function timecardCsv(data: Pick<AppData, 'entries' | 'courses' | 'sections'>, weekStart: WeekKey): string {
  const from = parseDateKey(weekStart).getTime();
  const to = parseDateKey(addDays(weekStart, 7)).getTime();
  const rows = data.entries
    .filter((e) => Date.parse(e.start) < to && Date.parse(e.end) > from)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => {
      const s = new Date(e.start);
      const en = new Date(e.end);
      const sameDay = toDateKey(s) === toDateKey(en);
      return [
        toDateKey(s),
        hhmm(s),
        sameDay ? hhmm(en) : `${toDateKey(en)} ${hhmm(en)}`,
        Math.round((en.getTime() - s.getTime()) / 60000),
        data.courses.find((c) => c.id === e.courseId)?.name ?? '',
        e.sectionId ? data.sections.find((x) => x.id === e.sectionId)?.title ?? '' : '',
        e.note,
        e.source,
      ].map(csvCell).join(',');
    });
  return [CSV_HEADER.join(','), ...rows].join('\n') + '\n';
}
