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
    const r = validateAppData({ ...data(), schemaVersion: 2 });
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
