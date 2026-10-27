import { describe, expect, it } from 'vitest';
import { validateAppData } from './validate';
import { course, data, entry, iso, section } from './fixtures';
import { createWeekPlan } from './plan';

describe('validateAppData', () => {
  it('accepts valid data unchanged', () => {
    const d = data({ courses: [course('c1')], sections: [section('s1', 'c1', 0)], entries: [entry('e', 'c1', iso(2026, 10, 27, 9), iso(2026, 10, 27, 10), { sectionId: 's1' })] });
    d.weekPlans['2026-10-26'] = createWeekPlan('2026-10-26', d.settings, iso(2026, 10, 26));
    expect(validateAppData(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it('rejects non-objects and wrong schemaVersion', () => {
    expect(validateAppData(null)).toEqual(['File is not a Productive backup (expected a JSON object).']);
    const r = validateAppData({ ...data(), schemaVersion: 3 });
    expect(Array.isArray(r) && r[0]).toMatch(/schemaVersion/);
  });
  it('reports missing fields and types', () => {
    const r = validateAppData({ schemaVersion: 1, settings: { dailyGoalMinutes: 'x' } });
    expect(Array.isArray(r)).toBe(true);
    expect((r as string[]).join('\n')).toMatch(/dailyGoalMinutes[\s\S]*courses must be a list/);
  });
  it('rejects entries referencing unknown courses', () => {
    const r = validateAppData(data({ entries: [entry('e', 'ghost', iso(2026, 10, 27, 9), iso(2026, 10, 27, 10))] }));
    expect(r).toEqual(['entries[0] references unknown course ghost.']);
  });
  it('rejects sections and blocks referencing unknown courses', () => {
    const d = data({ courses: [course('c1')], sections: [section('s', 'ghost', 0)] });
    expect(validateAppData(d)).toEqual(['sections[0] references unknown course ghost.']);
    const d2 = data({ courses: [course('c1')] });
    const plan = createWeekPlan('2026-10-26', d2.settings, iso(2026, 10, 26));
    plan.blocks = [{ id: 'b', date: '2026-10-26', startMin: 0, endMin: 60, courseId: 'ghost', sectionId: null, label: '' }];
    d2.weekPlans['2026-10-26'] = plan;
    expect(validateAppData(d2)).toEqual(['weekPlans[2026-10-26].blocks[0] references unknown course.']);
  });
  it('clears dangling sectionIds with a warning', () => {
    const d = data({ courses: [course('c1')], entries: [entry('e', 'c1', iso(2026, 10, 27, 9), iso(2026, 10, 27, 10), { sectionId: 'gone' })] });
    const plan = createWeekPlan('2026-10-26', d.settings, iso(2026, 10, 26));
    plan.sectionByDay['2026-10-27'] = 'gone';
    d.weekPlans['2026-10-26'] = plan;
    const warnings: string[] = [];
    const r = validateAppData(d, warnings);
    expect(Array.isArray(r)).toBe(false);
    if (!Array.isArray(r)) {
      expect(r.entries[0].sectionId).toBeNull();
      expect(r.weekPlans['2026-10-26'].sectionByDay['2026-10-27']).toBeNull();
    }
    expect(warnings).toHaveLength(2);
  });
  it('rejects entries that end before they start', () => {
    const r = validateAppData(data({ courses: [course('c1')], entries: [entry('e', 'c1', iso(2026, 10, 27, 10), iso(2026, 10, 27, 9))] }));
    expect(r).toEqual(['entries[0] ends before it starts.']);
  });
});

describe('semantic checks (review R6)', () => {
  const base = () => data({ courses: [course('c1')] });
  it('rejects out-of-range settings', () => {
    const d = base();
    d.settings = { ...d.settings, gridStartHour: 30, gridEndHour: -5 };
    expect((validateAppData(d) as string[]).join()).toMatch(/gridStartHour\/gridEndHour/);
    const d2 = base();
    d2.settings = { ...d2.settings, dailyGoalMinutes: 5000 };
    expect((validateAppData(d2) as string[]).join()).toMatch(/dailyGoalMinutes/);
  });
  it('rejects duplicate ids', () => {
    const e = entry('dup', 'c1', iso(2026, 10, 27, 9), iso(2026, 10, 27, 10));
    const d = base();
    d.entries = [e, { ...e, start: iso(2026, 10, 27, 11), end: iso(2026, 10, 27, 12) }];
    expect(validateAppData(d)).toEqual(['entries[1] has a duplicate id dup.']);
  });
  it('rejects overlapping entries but allows touching ones', () => {
    const d = base();
    d.entries = [entry('a', 'c1', iso(2026, 10, 27, 9), iso(2026, 10, 27, 10)), entry('b', 'c1', iso(2026, 10, 27, 9, 30), iso(2026, 10, 27, 11))];
    expect(validateAppData(d)).toEqual(['entries[1] overlaps entries[0].']);
    d.entries[1] = entry('b', 'c1', iso(2026, 10, 27, 10), iso(2026, 10, 27, 11));
    expect(Array.isArray(validateAppData(d))).toBe(false);
  });
  it('rejects off-grid or overlapping blocks', () => {
    const d = base();
    const plan = createWeekPlan('2026-10-26', d.settings, iso(2026, 10, 26));
    plan.blocks = [{ id: 'b', date: '2026-10-26', startMin: 7, endMin: 60, courseId: 'c1', sectionId: null, label: '' }];
    d.weekPlans['2026-10-26'] = plan;
    expect((validateAppData(d) as string[])[0]).toMatch(/15-minute steps/);
    plan.blocks = [
      { id: 'b', date: '2026-10-26', startMin: 0, endMin: 60, courseId: 'c1', sectionId: null, label: '' },
      { id: 'c', date: '2026-10-26', startMin: 45, endMin: 90, courseId: 'c1', sectionId: null, label: '' },
    ];
    expect(validateAppData(d)).toEqual(['weekPlans[2026-10-26] has overlapping blocks on 2026-10-26.']);
  });
});
