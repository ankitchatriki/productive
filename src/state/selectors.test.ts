import { describe, expect, it } from 'vitest';
import { streaksAt } from './selectors';
import { at, data, entry, iso } from '../domain/fixtures';

describe('streaksAt (review R8)', () => {
  it('counts today when the goal is reached only through the running timer', () => {
    const d = data({
      entries: [entry('y', 'c1', iso(2026, 10, 25, 6), iso(2026, 10, 25, 14))],
      activeTimer: { courseId: 'c1', sectionId: null, startedAt: iso(2026, 10, 26, 6), note: '' },
    });
    expect(streaksAt(d, at(2026, 10, 26, 13)).current).toBe(1); // 7h so far: yesterday only
    expect(streaksAt(d, at(2026, 10, 26, 14, 1)).current).toBe(2); // 8h reached while running
  });
});
