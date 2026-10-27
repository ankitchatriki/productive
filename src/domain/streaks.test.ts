import { describe, expect, it } from 'vitest';
import { computeStreaks, heatLevel } from './streaks';
import { at, data, entry, iso } from './fixtures';
import type { AppData } from './types';

function study(days: Array<[string, number]>, extra: Partial<AppData> = {}) {
  const entries = days.map(([d, h], i) => {
    const [y, m, dd] = d.split('-').map(Number);
    return entry(`e${i}`, 'c1', iso(y, m, dd, 6), iso(y, m, dd, 6, h * 60));
  });
  return data({ entries, ...extra });
}

describe('computeStreaks', () => {
  it('counts consecutive hit days up to yesterday; an unfinished today does not break it', () => {
    const d = study([['2026-10-23', 8], ['2026-10-24', 8], ['2026-10-25', 9], ['2026-10-26', 2]]);
    expect(computeStreaks(d, '2026-10-26')).toEqual({ current: 3, best: 3 });
  });
  it('today hit adds one', () => {
    const d = study([['2026-10-25', 8], ['2026-10-26', 8]]);
    expect(computeStreaks(d, '2026-10-26').current).toBe(2);
  });
  it('a gap breaks the streak; best keeps the longer run', () => {
    const d = study([['2026-10-19', 8], ['2026-10-20', 8], ['2026-10-21', 8], ['2026-10-22', 1], ['2026-10-24', 8], ['2026-10-25', 8]]);
    expect(computeStreaks(d, '2026-10-26')).toEqual({ current: 2, best: 3 });
  });
  it('rest days are skipped (neither break nor count)', () => {
    const d = study([['2026-10-23', 8], ['2026-10-24', 8], ['2026-10-26', 8]]);
    d.settings.restDays = [6]; // Sunday 25 is rest
    expect(computeStreaks(d, '2026-10-26')).toEqual({ current: 3, best: 3 });
  });
  it('a hit rest day counts +1', () => {
    const d = study([['2026-10-24', 8], ['2026-10-25', 8]]);
    d.settings.restDays = [6];
    expect(computeStreaks(d, '2026-10-26').current).toBe(2);
  });
  it('stops at the earliest entry and handles no data', () => {
    expect(computeStreaks(data(), '2026-10-26')).toEqual({ current: 0, best: 0 });
    const d = study([['2026-10-25', 8]]);
    d.settings.restDays = [0, 1, 2, 3, 4, 5, 6].slice(0, 6) as AppData['settings']['restDays'];
    expect(computeStreaks(d, '2026-10-26').current).toBe(1);
  });
  it('includes the running timer when now is given', () => {
    const d = study([['2026-10-25', 8]], { activeTimer: { courseId: 'c1', sectionId: null, startedAt: iso(2026, 10, 26, 6), note: '' } });
    expect(computeStreaks(d, '2026-10-26', at(2026, 10, 26, 14, 30)).current).toBe(2);
    expect(computeStreaks(d, '2026-10-26').current).toBe(1);
  });
});

describe('heatLevel', () => {
  it('maps to 5 levels relative to the goal', () => {
    expect(heatLevel(0, 480)).toBe(0);
    expect(heatLevel(100, 480)).toBe(1);
    expect(heatLevel(200, 480)).toBe(2);
    expect(heatLevel(400, 480)).toBe(3);
    expect(heatLevel(480, 480)).toBe(4);
  });
});
