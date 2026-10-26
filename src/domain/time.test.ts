import { describe, expect, it } from 'vitest';
import {
  addDays, daysBetween, formatDuration, formatElapsed, formatHoursDecimal, formatSigned, hhmmToMin,
  isRestDay, isValidDateKey, minToHHMM, minutesBetween, splitByLocalDay, toDateKey, weekDates, weekStartOf, weekdayOf,
} from './time';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('time zone of the test run', () => {
  it('is Europe/London so DST cases are meaningful', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/London');
  });
});

describe('weekStartOf', () => {
  // 2026-10-26 is a Monday.
  const cases: Array<[string, string]> = [
    ['2026-10-26', '2026-10-26'], // Mon
    ['2026-10-27', '2026-10-26'], // Tue
    ['2026-10-28', '2026-10-26'], // Wed
    ['2026-10-29', '2026-10-26'], // Thu
    ['2026-10-30', '2026-10-26'], // Fri
    ['2026-10-31', '2026-10-26'], // Sat
    ['2026-11-01', '2026-10-26'], // Sun → previous Monday
  ];
  it.each(cases)('%s → %s', (d, ws) => expect(weekStartOf(d)).toBe(ws));
  it('handles month and year boundaries', () => {
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
    expect(weekStartOf('2026-03-01')).toBe('2026-02-23');
  });
  it('weekdayOf is Monday-based', () => {
    expect(weekdayOf('2026-10-26')).toBe(0);
    expect(weekdayOf('2026-11-01')).toBe(6);
  });
});

describe('date helpers', () => {
  it('weekDates returns 7 consecutive days', () => {
    expect(weekDates('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });
  it('addDays across DST does not drift', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('daysBetween', () => {
    expect(daysBetween('2026-10-20', '2026-10-27')).toBe(7);
    expect(daysBetween('2026-10-27', '2026-10-20')).toBe(-7);
  });
  it('validates date keys', () => {
    expect(isValidDateKey('2026-10-26')).toBe(true);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('nope')).toBe(false);
  });
  it('toDateKey uses local time', () => {
    expect(toDateKey(local(2026, 10, 26, 23, 59))).toBe('2026-10-26');
  });
  it('isRestDay', () => {
    expect(isRestDay('2026-11-01', [6])).toBe(true);
    expect(isRestDay('2026-10-31', [6])).toBe(false);
  });
});

describe('splitByLocalDay', () => {
  it('same day → one piece', () => {
    expect(splitByLocalDay(local(2026, 10, 27, 9), local(2026, 10, 27, 11, 30))).toEqual([{ date: '2026-10-27', minutes: 150 }]);
  });
  it('23:10–01:20 → 50 + 80', () => {
    expect(splitByLocalDay(local(2026, 10, 27, 23, 10), local(2026, 10, 28, 1, 20))).toEqual([
      { date: '2026-10-27', minutes: 50 },
      { date: '2026-10-28', minutes: 80 },
    ]);
  });
  it('23:30–00:30 → 30 + 30', () => {
    expect(splitByLocalDay(local(2026, 10, 27, 23, 30), local(2026, 10, 28, 0, 30))).toEqual([
      { date: '2026-10-27', minutes: 30 },
      { date: '2026-10-28', minutes: 30 },
    ]);
  });
  it('multi-day', () => {
    expect(splitByLocalDay(local(2026, 11, 2, 22), local(2026, 11, 4, 2))).toEqual([
      { date: '2026-11-02', minutes: 120 },
      { date: '2026-11-03', minutes: 1440 },
      { date: '2026-11-04', minutes: 120 },
    ]);
  });
  it('DST end day (25h) counted in real minutes', () => {
    // 2026-10-25: clocks go back 02:00 BST → 01:00 GMT in London.
    expect(splitByLocalDay(local(2026, 10, 25, 0), local(2026, 10, 26, 0))).toEqual([{ date: '2026-10-25', minutes: 1500 }]);
    expect(splitByLocalDay(local(2026, 10, 24, 23), local(2026, 10, 25, 3))).toEqual([
      { date: '2026-10-24', minutes: 60 },
      { date: '2026-10-25', minutes: 240 },
    ]);
  });
  it('DST start day (23h)', () => {
    expect(splitByLocalDay(local(2026, 3, 29, 0), local(2026, 3, 30, 0))).toEqual([{ date: '2026-03-29', minutes: 1380 }]);
  });
  it('empty or inverted interval → []', () => {
    const d = local(2026, 10, 27, 9);
    expect(splitByLocalDay(d, d)).toEqual([]);
    expect(splitByLocalDay(local(2026, 10, 27, 10), d)).toEqual([]);
  });
  it('accepts ISO strings', () => {
    const s = local(2026, 10, 27, 9).toISOString();
    const e = local(2026, 10, 27, 10).toISOString();
    expect(splitByLocalDay(s, e)).toEqual([{ date: '2026-10-27', minutes: 60 }]);
    expect(minutesBetween(s, e)).toBe(60);
  });
});

describe('formatting', () => {
  it('formatDuration h:mm', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(750)).toBe('12:30');
    expect(formatDuration(-200)).toBe('−3:20');
    expect(formatDuration(150, 'decimal')).toBe('2.50');
  });
  it('formatHoursDecimal / formatSigned / formatElapsed', () => {
    expect(formatHoursDecimal(465)).toBe('7.75');
    expect(formatSigned(85)).toBe('+1:25');
    expect(formatSigned(-200)).toBe('−3:20');
    expect(formatElapsed(5025000)).toBe('1:23:45');
  });
  it('minToHHMM / hhmmToMin', () => {
    expect(minToHHMM(545)).toBe('09:05');
    expect(minToHHMM(1440)).toBe('24:00');
    expect(hhmmToMin('09:05')).toBe(545);
    expect(hhmmToMin('25:00')).toBeNull();
  });
});
