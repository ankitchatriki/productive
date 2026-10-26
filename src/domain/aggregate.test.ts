import { describe, expect, it } from 'vitest';
import { allIntervals, dayTotals, intervalsOnDate, minutesByCourse, minutesByDay, minutesBySection, minutesInDates, timecard, weekTotals } from './aggregate';
import { at, data, entry, iso } from './fixtures';
import { weekDates } from './time';

const entries = [
  entry('a', 'c1', iso(2026, 10, 26, 9), iso(2026, 10, 26, 11), { sectionId: 's1' }),
  entry('b', 'c2', iso(2026, 10, 27, 23, 30), iso(2026, 10, 28, 0, 30)),
  // Sunday → Monday, splits across two weeks.
  entry('c', 'c1', iso(2026, 11, 1, 23), iso(2026, 11, 2, 1), { sectionId: 's1' }),
];

describe('aggregation', () => {
  const ints = allIntervals(data({ entries }), at(2026, 11, 3));
  it('minutesByDay splits at midnight', () => {
    const m = minutesByDay(ints);
    expect(m.get('2026-10-27')).toBe(30);
    expect(m.get('2026-10-28')).toBe(30);
    expect(m.get('2026-11-01')).toBe(60);
    expect(m.get('2026-11-02')).toBe(60);
  });
  it('dayTotals and weekTotals split Sunday→Monday across weeks', () => {
    expect(dayTotals(ints, '2026-10-26')).toEqual([120, 30, 30, 0, 0, 0, 60]);
    expect(weekTotals(ints, '2026-11-02', 2)).toEqual([
      { weekStart: '2026-10-26', minutes: 240 },
      { weekStart: '2026-11-02', minutes: 60 },
    ]);
  });
  it('minutesByCourse / minutesBySection / minutesInDates', () => {
    const week = weekDates('2026-10-26');
    expect(minutesByCourse(ints, week)).toEqual({ c1: 180, c2: 60 });
    expect(minutesBySection(ints)).toEqual({ s1: 240 });
    expect(minutesInDates(ints, week, (i) => i.courseId === 'c2')).toBe(60);
  });
  it('includes the running timer up to now', () => {
    const d = data({ activeTimer: { courseId: 'c1', sectionId: null, startedAt: iso(2026, 10, 28, 23, 50), note: '' } });
    const now = at(2026, 10, 29, 0, 20);
    const m = minutesByDay(allIntervals(d, now));
    expect(m.get('2026-10-28')).toBe(10);
    expect(m.get('2026-10-29')).toBe(20);
  });
  it('intervalsOnDate clips and marks continuation', () => {
    const list = intervalsOnDate(ints, '2026-10-28');
    expect(list).toHaveLength(1);
    expect(list[0].continuesBefore).toBe(true);
    expect(list[0].clipStart.getTime()).toBe(at(2026, 10, 28).getTime());
  });
});

describe('timecard', () => {
  it('rows, columns and grand total match the entries; cross-midnight split', () => {
    const tc = timecard(allIntervals(data({ entries }), at(2026, 11, 3)), '2026-10-26', ['c9']);
    const c1 = tc.rows.find((r) => r.courseId === 'c1')!;
    expect(c1.days).toEqual([120, 0, 0, 0, 0, 0, 60]);
    expect(c1.total).toBe(180);
    expect(c1.sections).toHaveLength(1);
    expect(c1.sections[0]).toMatchObject({ sectionId: 's1', total: 180 });
    const c2 = tc.rows.find((r) => r.courseId === 'c2')!;
    expect(c2.days).toEqual([0, 30, 30, 0, 0, 0, 0]);
    expect(c2.sections[0].sectionId).toBeNull();
    expect(tc.rows.find((r) => r.courseId === 'c9')?.total).toBe(0);
    expect(tc.dayTotals).toEqual([120, 30, 30, 0, 0, 0, 60]);
    expect(tc.total).toBe(240);
    // The Sunday→Monday entry's Monday part lands in the next week.
    expect(timecard(allIntervals(data({ entries }), at(2026, 11, 3)), '2026-11-02').total).toBe(60);
  });
});
