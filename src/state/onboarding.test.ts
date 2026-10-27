import { describe, expect, it } from 'vitest';
import { onboardingActions, onboardingGoalActions } from './onboarding';
import { reducer } from './reducer';
import { emptyAppData } from '../storage/defaults';
import type { Action } from './actions';
import type { AppData } from '../domain/types';

const run = (d: AppData, actions: Action[]) => actions.reduce(reducer, d);
const TODAY = '2026-10-28'; // Wednesday
const NOW = '2026-10-28T09:00:00.000Z';

describe('onboarding (review R5)', () => {
  it('creates a course, sections and a plan assigned from today', () => {
    let n = 0;
    const { courseId, actions } = onboardingActions(emptyAppData(), { dailyGoalMinutes: 360, restDays: [6], courseName: 'Physics', color: '#2f6bd8', sectionsText: 'A\nB\nC' }, null, TODAY, NOW, () => `id${n++}`);
    const d = run(emptyAppData(), actions);
    expect(d.courses.map((c) => c.id)).toEqual([courseId]);
    expect(d.sections).toHaveLength(3);
    const plan = d.weekPlans['2026-10-26'];
    expect(plan.dailyGoalMinutes).toBe(360);
    expect(plan.sectionByDay['2026-10-27']).toBeNull();
    expect(plan.sectionByDay['2026-10-28']).toBe(d.sections[0].id);
  });
  it('going back and forward again updates the same course instead of duplicating it', () => {
    let n = 0;
    const mk = () => `id${n++}`;
    const first = onboardingActions(emptyAppData(), { dailyGoalMinutes: 480, restDays: [], courseName: 'Physics', color: '#2f6bd8', sectionsText: 'A\nB' }, null, TODAY, NOW, mk);
    let d = run(emptyAppData(), first.actions);
    d = run(d, onboardingGoalActions(d, { dailyGoalMinutes: 300, restDays: [6] }, TODAY, NOW));
    expect(d.weekPlans['2026-10-26'].dailyGoalMinutes).toBe(300);
    const second = onboardingActions(d, { dailyGoalMinutes: 300, restDays: [6], courseName: 'Physics II', color: '#c4570c', sectionsText: 'X\nY\nZ' }, first.courseId, TODAY, NOW, mk);
    d = run(d, second.actions);
    expect(second.courseId).toBe(first.courseId);
    expect(d.courses).toHaveLength(1);
    expect(d.courses[0]).toMatchObject({ name: 'Physics II', color: '#c4570c' });
    expect(d.sections.map((s) => s.title)).toEqual(['X', 'Y', 'Z']);
    const plan = d.weekPlans['2026-10-26'];
    const ids = new Set(d.sections.map((s) => s.id));
    expect(Object.values(plan.sectionByDay).filter(Boolean).every((id) => ids.has(id!))).toBe(true);
    expect(plan.sectionByDay['2026-10-28']).toBe(d.sections[0].id);
    expect(plan.goals[0]).toMatchObject({ kind: 'totalHours', targetMinutes: 300 * 6 });
  });
});
