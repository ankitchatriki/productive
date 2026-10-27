import { describe, expect, it } from 'vitest';
import { blockOptions, choiceFor, optionKeyFor, plannedLine } from './blockOptions';
import { at, course, data, iso } from '../domain/fixtures';
import { createWeekPlan } from '../domain/plan';

const withBlocks = () => {
  const d = data({ courses: [course('c1', { name: 'OChem' })] });
  const plan = createWeekPlan('2026-10-26', d.settings, iso(2026, 10, 26));
  plan.blocks = [
    { id: 'a', date: '2026-10-27', startMin: 13 * 60, endMin: 15 * 60, courseId: 'c1', sectionId: null, label: '' },
    { id: 'b', date: '2026-10-27', startMin: 16 * 60, endMin: 17 * 60, courseId: 'c1', sectionId: null, label: '' },
  ];
  d.weekPlans['2026-10-26'] = plan;
  return d;
};

describe('block options', () => {
  it('presets, custom and open always; planned only inside a block', () => {
    expect(blockOptions(data(), at(2026, 10, 27, 14)).map((o) => o.key)).toEqual(['25', '50', '90', 'custom', 'open']);
    const opts = blockOptions(withBlocks(), at(2026, 10, 27, 14, 22, 30));
    expect(opts.map((o) => o.key)).toEqual(['25', '50', '90', 'planned', 'custom', 'open']);
    expect(opts[3]).toMatchObject({ label: 'Until 15:00', minutes: 37, courseId: 'c1' });
  });
  it('option key for a stored choice, with planned fallback', () => {
    expect(optionKeyFor({ kind: 'preset', minutes: 25 }, false, 50)).toBe('25');
    expect(optionKeyFor({ kind: 'planned' }, true, 50)).toBe('planned');
    expect(optionKeyFor({ kind: 'planned' }, false, 50)).toBe('50');
    expect(optionKeyFor({ kind: 'planned' }, false, 40)).toBe('custom');
    expect(choiceFor('custom', 40)).toEqual({ kind: 'custom', minutes: 40 });
    expect(choiceFor('90', 0)).toEqual({ kind: 'preset', minutes: 90 });
  });
  it('planned line: now, next, or nothing', () => {
    const d = withBlocks();
    expect(plannedLine(d, at(2026, 10, 27, 14), '2026-10-27', '2026-10-26')).toBe('Planned now · OChem until 15:00');
    expect(plannedLine(d, at(2026, 10, 27, 15, 30), '2026-10-27', '2026-10-26')).toBe('Next · OChem at 16:00');
    expect(plannedLine(d, at(2026, 10, 27, 18), '2026-10-27', '2026-10-26')).toBeNull();
  });
});
