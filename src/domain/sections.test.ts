import { describe, expect, it } from 'vitest';
import type { Section } from './types';
import { makeSections, normalizeOrder, parseBulkSections, parseHours, reorder, sectionStatus, sectionsOfCourse } from './sections';

const sec = (id: string, order: number, courseId = 'c1', completedAt: string | null = null): Section => ({
  id, courseId, title: id, order, estimatedMinutes: null, completedAt, notes: '',
});

describe('parseBulkSections', () => {
  it('parses titles without hours', () => {
    expect(parseBulkSections('Ch 1 – Intro\nCh 2 – Atoms')).toEqual([
      { title: 'Ch 1 – Intro', estimatedMinutes: null },
      { title: 'Ch 2 – Atoms', estimatedMinutes: null },
    ]);
  });
  it('parses `| hours` suffixes and skips blank lines', () => {
    expect(parseBulkSections('Ch 5 – Kinetics | 6\n\n  Ch 6 | 1.5 \nCh 7 | 1:30\n')).toEqual([
      { title: 'Ch 5 – Kinetics', estimatedMinutes: 360 },
      { title: 'Ch 6', estimatedMinutes: 90 },
      { title: 'Ch 7', estimatedMinutes: 90 },
    ]);
  });
  it('keeps the whole line when the suffix is not a number', () => {
    expect(parseBulkSections('A | B')).toEqual([{ title: 'A | B', estimatedMinutes: null }]);
  });
  it('handles empty suffix and zero hours', () => {
    expect(parseBulkSections('A |\nB | 0')).toEqual([
      { title: 'A', estimatedMinutes: null },
      { title: 'B', estimatedMinutes: null },
    ]);
  });
  it('parseHours', () => {
    expect(parseHours('2')).toBe(120);
    expect(parseHours('2,5')).toBe(150);
    expect(parseHours('3h')).toBe(180);
    expect(parseHours('abc')).toBeNull();
  });
});

describe('section ordering', () => {
  const list = [sec('a', 0), sec('b', 1), sec('c', 2), sec('x', 0, 'c2')];
  it('moves up and down within the course', () => {
    expect(sectionsOfCourse(reorder(list, 'c', -1), 'c1').map((s) => s.id)).toEqual(['a', 'c', 'b']);
    expect(sectionsOfCourse(reorder(list, 'a', 1), 'c1').map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });
  it('is a no-op at the edges', () => {
    expect(reorder(list, 'a', -1)).toBe(list);
    expect(reorder(list, 'c', 1)).toBe(list);
  });
  it('normalizeOrder makes orders contiguous', () => {
    const gappy = [sec('a', 0), sec('c', 5)];
    expect(normalizeOrder(gappy, 'c1').map((s) => s.order)).toEqual([0, 1]);
  });
  it('makeSections appends after existing', () => {
    let n = 0;
    const made = makeSections('c1', [{ title: 'd', estimatedMinutes: 60 }], list, () => `id${n++}`);
    expect(made[0]).toMatchObject({ id: 'id0', order: 3, courseId: 'c1', completedAt: null, notes: '' });
  });
});

describe('sectionStatus', () => {
  it('derives status', () => {
    expect(sectionStatus(sec('a', 0), 0)).toBe('todo');
    expect(sectionStatus(sec('a', 0), 5)).toBe('in_progress');
    expect(sectionStatus(sec('a', 0, 'c1', '2026-10-26T10:00:00.000Z'), 0)).toBe('done');
  });
});
