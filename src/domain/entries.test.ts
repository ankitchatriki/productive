import { describe, expect, it } from 'vitest';
import { entryFromTimer, intervalsOverlap, overlapMs, validateEntry } from './entries';
import { at, course, data, entry, iso, section } from './fixtures';

const NOW = at(2026, 10, 28, 18);
const base = () => data({
  courses: [course('c1'), course('c2'), course('old', { archived: true })],
  sections: [section('s1', 'c1', 0), section('s2', 'c2', 0)],
  entries: [entry('e1', 'c1', iso(2026, 10, 28, 9), iso(2026, 10, 28, 10))],
});
const draft = (start: string, end: string, extra = {}) => ({ id: 'new', courseId: 'c1', sectionId: null as string | null, start, end, ...extra });

describe('overlap rules', () => {
  it('touching intervals do not overlap', () => {
    expect(intervalsOverlap(0, 10, 10, 20)).toBe(false);
    expect(intervalsOverlap(10, 20, 0, 10)).toBe(false);
  });
  it('partial and nested intervals overlap', () => {
    expect(intervalsOverlap(0, 10, 9, 20)).toBe(true);
    expect(intervalsOverlap(0, 30, 10, 20)).toBe(true);
    expect(intervalsOverlap(10, 20, 0, 30)).toBe(true);
  });
  it('overlapMs', () => {
    expect(overlapMs(0, 10, 5, 20)).toBe(5);
    expect(overlapMs(0, 10, 10, 20)).toBe(0);
  });
});

describe('validateEntry', () => {
  it('accepts a valid entry that touches another', () => {
    expect(validateEntry(draft(iso(2026, 10, 28, 10), iso(2026, 10, 28, 11)), base(), NOW)).toBeNull();
    expect(validateEntry(draft(iso(2026, 10, 28, 8), iso(2026, 10, 28, 9)), base(), NOW)).toBeNull();
  });
  it('rejects end ≤ start', () => {
    expect(validateEntry(draft(iso(2026, 10, 28, 11), iso(2026, 10, 28, 11)), base(), NOW)).toBe('End time must be after start time.');
    expect(validateEntry(draft(iso(2026, 10, 28, 12), iso(2026, 10, 28, 11)), base(), NOW)).toBe('End time must be after start time.');
  });
  it('rejects a future end beyond 1 minute tolerance', () => {
    expect(validateEntry(draft(iso(2026, 10, 28, 17), iso(2026, 10, 28, 18, 0, 30)), base(), NOW)).toBeNull();
    expect(validateEntry(draft(iso(2026, 10, 28, 17), iso(2026, 10, 28, 18, 5)), base(), NOW)).toBe("End time can't be in the future.");
  });
  it('rejects more than 16 hours', () => {
    expect(validateEntry(draft(iso(2026, 10, 27, 0), iso(2026, 10, 27, 16, 1)), base(), NOW)).toBe('An entry can be at most 16 hours long.');
    expect(validateEntry(draft(iso(2026, 10, 27, 0), iso(2026, 10, 27, 16)), base(), NOW)).toBeNull();
  });
  it('rejects a missing or unknown course', () => {
    expect(validateEntry(draft(iso(2026, 10, 28, 11), iso(2026, 10, 28, 12), { courseId: '' }), base(), NOW)).toBe('Choose a course.');
    expect(validateEntry(draft(iso(2026, 10, 28, 11), iso(2026, 10, 28, 12), { courseId: 'zzz' }), base(), NOW)).toBe('Choose a course.');
  });
  it('rejects archived course for new entries but allows it when editing', () => {
    const d = draft(iso(2026, 10, 28, 11), iso(2026, 10, 28, 12), { courseId: 'old' });
    expect(validateEntry(d, base(), NOW)).toMatch(/archived/);
    expect(validateEntry(d, base(), NOW, { isEdit: true })).toBeNull();
  });
  it('rejects a section from another course', () => {
    expect(validateEntry(draft(iso(2026, 10, 28, 11), iso(2026, 10, 28, 12), { sectionId: 's2' }), base(), NOW)).toBe('That section belongs to a different course.');
    expect(validateEntry(draft(iso(2026, 10, 28, 11), iso(2026, 10, 28, 12), { sectionId: 's1' }), base(), NOW)).toBeNull();
  });
  it('rejects overlap with another entry, but not with itself when editing', () => {
    expect(validateEntry(draft(iso(2026, 10, 28, 9, 30), iso(2026, 10, 28, 11)), base(), NOW)).toMatch(/^Overlaps another entry/);
    expect(validateEntry({ ...draft(iso(2026, 10, 28, 9, 30), iso(2026, 10, 28, 11)), id: 'e1' }, base(), NOW)).toBeNull();
  });
  it('rejects overlap with the running timer', () => {
    const d = base();
    d.activeTimer = { courseId: 'c1', sectionId: null, startedAt: iso(2026, 10, 28, 17), note: '' };
    expect(validateEntry(draft(iso(2026, 10, 28, 16, 30), iso(2026, 10, 28, 17, 15)), d, NOW)).toMatch(/^Overlaps the running timer/);
    expect(validateEntry(draft(iso(2026, 10, 28, 16), iso(2026, 10, 28, 17)), d, NOW)).toBeNull();
  });
});

describe('entryFromTimer', () => {
  const timer = { courseId: 'c1', sectionId: 's1', startedAt: iso(2026, 10, 28, 11), note: 'n' };
  it('creates a timer entry with exact instants', () => {
    const r = entryFromTimer(timer, iso(2026, 10, 28, 12, 0, 30), 'x', []);
    expect(r).toMatchObject({ kind: 'entry', trimmed: false, entry: { id: 'x', start: timer.startedAt, end: iso(2026, 10, 28, 12, 0, 30), source: 'timer', sectionId: 's1', note: 'n' } });
  });
  it('discards under 60 seconds', () => {
    expect(entryFromTimer(timer, iso(2026, 10, 28, 11, 0, 59), 'x', [])).toEqual({ kind: 'discarded', reason: 'short' });
  });
  it('trims start to the end of the latest overlapping entry', () => {
    const entries = [entry('m', 'c2', iso(2026, 10, 28, 11, 10), iso(2026, 10, 28, 11, 40))];
    const r = entryFromTimer(timer, iso(2026, 10, 28, 12), 'x', entries);
    expect(r).toMatchObject({ kind: 'entry', trimmed: true, entry: { start: iso(2026, 10, 28, 11, 40) } });
  });
  it('discards when nothing remains after trimming', () => {
    const entries = [entry('m', 'c2', iso(2026, 10, 28, 10), iso(2026, 10, 28, 12))];
    expect(entryFromTimer(timer, iso(2026, 10, 28, 12), 'x', entries)).toEqual({ kind: 'discarded', reason: 'overlap' });
  });
});
