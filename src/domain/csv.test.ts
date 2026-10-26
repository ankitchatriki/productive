import { describe, expect, it } from 'vitest';
import { csvCell, timecardCsv } from './csv';
import { course, entry, iso, section } from './fixtures';

describe('timecardCsv', () => {
  const data = {
    courses: [course('c1', { name: 'Chem, Organic' })],
    sections: [section('s1', 'c1', 0, { title: 'Ch "4"' })],
    entries: [
      entry('a', 'c1', iso(2026, 10, 27, 9), iso(2026, 10, 27, 10, 30), { sectionId: 's1', note: 'line1\nline2' }),
      entry('b', 'c1', iso(2026, 11, 1, 23), iso(2026, 11, 2, 1)), // Sun → Mon, overlaps week
      entry('c', 'c1', iso(2026, 10, 25, 23), iso(2026, 10, 26, 0, 30)), // prev Sun → Mon, overlaps week
      entry('d', 'c1', iso(2026, 10, 20, 9), iso(2026, 10, 20, 10)), // outside
    ],
  };
  it('has the specified header and one row per overlapping entry', () => {
    const lines = timecardCsv(data, '2026-10-26').trim().split('\n');
    expect(lines[0]).toBe('date,start,end,minutes,course,section,note,source');
    expect(lines).toHaveLength(1 + 3 + 1); // the quoted note spans two physical lines
  });
  it('escapes and formats fields', () => {
    const csv = timecardCsv(data, '2026-10-26');
    expect(csv).toContain('2026-10-27,09:00,10:30,90,"Chem, Organic","Ch ""4""","line1\nline2",manual');
    expect(csv).toContain('2026-11-01,23:00,2026-11-02 01:00,120,"Chem, Organic",,,manual');
    expect(csv.indexOf('2026-10-25,23:00')).toBeLessThan(csv.indexOf('2026-10-27'));
  });
  it('csvCell leaves plain values alone', () => {
    expect(csvCell('abc')).toBe('abc');
    expect(csvCell(12)).toBe('12');
  });
});

describe('formula injection (review R12)', () => {
  it('prefixes cells that start with = + - @', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell(-5)).toBe('-5');
  });
});
