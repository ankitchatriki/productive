import { describe, expect, it } from 'vitest';
import { reducer } from './reducer';
import { course, data, entry, iso, section } from '../domain/fixtures';
import { createWeekPlan } from '../domain/plan';
import type { AppData, ScheduledBlock } from '../domain/types';

const NOW = iso(2026, 10, 28, 12);
const WS = '2026-10-26';

function seed(): AppData {
  const d = data({
    courses: [course('c1'), course('c2')],
    sections: [section('s1', 'c1', 0), section('s2', 'c1', 1), section('s3', 'c1', 2), section('t1', 'c2', 0)],
    entries: [entry('e1', 'c1', iso(2026, 10, 27, 9), iso(2026, 10, 27, 10), { sectionId: 's2' })],
  });
  const plan = createWeekPlan(WS, d.settings, NOW);
  plan.sectionByDay['2026-10-28'] = 's2';
  const block: ScheduledBlock = { id: 'b1', date: '2026-10-28', startMin: 540, endMin: 600, courseId: 'c1', sectionId: 's2', label: '' };
  plan.blocks = [block];
  d.weekPlans[WS] = plan;
  return d;
}

describe('reducer: settings & courses', () => {
  it('settings/update merges', () => {
    const s = reducer(seed(), { type: 'settings/update', patch: { dailyGoalMinutes: 360 } });
    expect(s.settings.dailyGoalMinutes).toBe(360);
    expect(s.settings.gridStartHour).toBe(6);
  });
  it('course/add and course/update', () => {
    let s = reducer(seed(), { type: 'course/add', course: course('c3') });
    expect(s.courses.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    s = reducer(s, { type: 'course/update', id: 'c3', patch: { name: 'Physics', archived: true } });
    expect(s.courses[2]).toMatchObject({ name: 'Physics', archived: true });
  });
  it('course/delete no-ops when entries exist', () => {
    const s0 = seed();
    expect(reducer(s0, { type: 'course/delete', id: 'c1' })).toBe(s0);
  });
  it('course/delete removes the course, its sections, blocks and goals', () => {
    const s0 = seed();
    s0.weekPlans[WS].goals.push({ id: 'g', kind: 'courseHours', courseId: 'c2', targetMinutes: 60 });
    s0.weekPlans[WS].blocks.push({ id: 'b2', date: '2026-10-29', startMin: 0, endMin: 60, courseId: 'c2', sectionId: 't1', label: '' });
    s0.weekPlans[WS].sectionByDay['2026-10-29'] = 't1';
    const s = reducer(s0, { type: 'course/delete', id: 'c2' });
    expect(s.courses.map((c) => c.id)).toEqual(['c1']);
    expect(s.sections.some((x) => x.courseId === 'c2')).toBe(false);
    expect(s.weekPlans[WS].blocks.map((b) => b.id)).toEqual(['b1']);
    expect(s.weekPlans[WS].goals.some((g) => g.id === 'g')).toBe(false);
    expect(s.weekPlans[WS].sectionByDay['2026-10-29']).toBeNull();
  });
});

describe('reducer: sections', () => {
  it('section/addMany appends', () => {
    const s = reducer(seed(), { type: 'section/addMany', sections: [section('s4', 'c1', 3)] });
    expect(s.sections).toHaveLength(5);
  });
  it('section/update patches', () => {
    const s = reducer(seed(), { type: 'section/update', id: 's1', patch: { title: 'Intro', estimatedMinutes: 90 } });
    expect(s.sections[0]).toMatchObject({ title: 'Intro', estimatedMinutes: 90, courseId: 'c1' });
  });
  it('section/move swaps order', () => {
    const s = reducer(seed(), { type: 'section/move', id: 's3', direction: -1 });
    const byId = Object.fromEntries(s.sections.map((x) => [x.id, x.order]));
    expect(byId).toMatchObject({ s1: 0, s2: 2, s3: 1 });
  });
  it('section/setDone sets and clears completedAt', () => {
    let s = reducer(seed(), { type: 'section/setDone', id: 's1', done: true, now: NOW });
    expect(s.sections[0].completedAt).toBe(NOW);
    s = reducer(s, { type: 'section/setDone', id: 's1', done: false, now: NOW });
    expect(s.sections[0].completedAt).toBeNull();
  });
  it('section/delete nulls entries, plan day, blocks, timer; reorders contiguously', () => {
    const s0 = seed();
    s0.activeTimer = { courseId: 'c1', sectionId: 's2', startedAt: NOW, note: '' };
    const s = reducer(s0, { type: 'section/delete', id: 's2' });
    expect(s.sections.find((x) => x.id === 's2')).toBeUndefined();
    expect(s.entries[0]).toMatchObject({ courseId: 'c1', sectionId: null });
    expect(s.weekPlans[WS].sectionByDay['2026-10-28']).toBeNull();
    expect(s.weekPlans[WS].blocks[0].sectionId).toBeNull();
    expect(s.activeTimer?.sectionId).toBeNull();
    expect(s.sections.filter((x) => x.courseId === 'c1').map((x) => [x.id, x.order])).toEqual([['s1', 0], ['s3', 1]]);
  });
});

describe('reducer: entries', () => {
  it('entry/add, update, delete', () => {
    const e = entry('e2', 'c2', iso(2026, 10, 27, 11), iso(2026, 10, 27, 12));
    let s = reducer(seed(), { type: 'entry/add', entry: e });
    expect(s.entries).toHaveLength(2);
    s = reducer(s, { type: 'entry/update', entry: { ...e, note: 'x' } });
    expect(s.entries[1].note).toBe('x');
    s = reducer(s, { type: 'entry/delete', id: 'e2' });
    expect(s.entries.map((x) => x.id)).toEqual(['e1']);
  });
});

describe('reducer: timer', () => {
  const timer = { courseId: 'c1', sectionId: 's1', startedAt: iso(2026, 10, 28, 11), note: '' };
  it('timer/start only when idle', () => {
    let s = reducer(seed(), { type: 'timer/start', timer });
    expect(s.activeTimer).toEqual(timer);
    const again = reducer(s, { type: 'timer/start', timer: { ...timer, courseId: 'c2' } });
    expect(again).toBe(s);
  });
  it('timer/stop creates an entry', () => {
    const s = reducer({ ...seed(), activeTimer: timer }, { type: 'timer/stop', now: iso(2026, 10, 28, 11, 30), newEntryId: 'n' });
    expect(s.activeTimer).toBeNull();
    expect(s.entries.find((e) => e.id === 'n')).toMatchObject({ source: 'timer', start: timer.startedAt, end: iso(2026, 10, 28, 11, 30) });
  });
  it('timer/stop under 60 s discards', () => {
    const s = reducer({ ...seed(), activeTimer: timer }, { type: 'timer/stop', now: iso(2026, 10, 28, 11, 0, 45), newEntryId: 'n' });
    expect(s.activeTimer).toBeNull();
    expect(s.entries).toHaveLength(1);
  });
  it('timer/stop trims overlap with a manual entry', () => {
    const s0 = { ...seed(), activeTimer: timer };
    s0.entries = [...s0.entries, entry('m', 'c2', iso(2026, 10, 28, 11, 5), iso(2026, 10, 28, 11, 20))];
    const s = reducer(s0, { type: 'timer/stop', now: iso(2026, 10, 28, 11, 30), newEntryId: 'n' });
    expect(s.entries.find((e) => e.id === 'n')?.start).toBe(iso(2026, 10, 28, 11, 20));
  });
  it('timer/switch creates adjacent entries with no gap', () => {
    const now = iso(2026, 10, 28, 11, 45);
    let s = reducer({ ...seed(), activeTimer: timer }, { type: 'timer/switch', now, newEntryId: 'n1', next: { courseId: 'c2', sectionId: 't1', note: '' } });
    expect(s.activeTimer).toEqual({ courseId: 'c2', sectionId: 't1', note: '', startedAt: now });
    s = reducer(s, { type: 'timer/stop', now: iso(2026, 10, 28, 12, 30), newEntryId: 'n2' });
    const n1 = s.entries.find((e) => e.id === 'n1')!;
    const n2 = s.entries.find((e) => e.id === 'n2')!;
    expect(n1.end).toBe(n2.start);
  });
});

describe('reducer: plans and blocks', () => {
  it('plan/ensure creates once', () => {
    const s = reducer(data(), { type: 'plan/ensure', weekStart: WS, now: NOW });
    expect(Object.keys(s.weekPlans[WS].sectionByDay)).toHaveLength(7);
    expect(reducer(s, { type: 'plan/ensure', weekStart: WS, now: NOW })).toBe(s);
  });
  it('plan/update patches and stamps updatedAt (creating if needed)', () => {
    const later = iso(2026, 10, 29, 9);
    const s = reducer(data(), { type: 'plan/update', weekStart: WS, patch: { reviewNote: 'ok' }, now: later });
    expect(s.weekPlans[WS]).toMatchObject({ reviewNote: 'ok', updatedAt: later, weekStart: WS });
  });
  it('plan/assignSection only accepts the week dates', () => {
    let s = reducer(seed(), { type: 'plan/assignSection', weekStart: WS, date: '2026-10-26', sectionId: 's1' });
    expect(s.weekPlans[WS].sectionByDay['2026-10-26']).toBe('s1');
    s = reducer(s, { type: 'plan/assignSection', weekStart: WS, date: '2026-11-05', sectionId: 's1' });
    expect('2026-11-05' in s.weekPlans[WS].sectionByDay).toBe(false);
  });
  it('plan/shiftFrom moves sections forward', () => {
    const s = reducer(seed(), { type: 'plan/shiftFrom', date: '2026-10-28', sectionId: 's1' });
    expect(s.weekPlans[WS].sectionByDay['2026-10-28']).toBe('s1');
    expect(s.weekPlans[WS].sectionByDay['2026-10-29']).toBe('s2');
  });
  it('block/upsert inserts and replaces; block/delete removes', () => {
    const b: ScheduledBlock = { id: 'b9', date: '2026-10-27', startMin: 600, endMin: 660, courseId: 'c2', sectionId: null, label: '' };
    let s = reducer(seed(), { type: 'block/upsert', weekStart: WS, block: b });
    expect(s.weekPlans[WS].blocks).toHaveLength(2);
    s = reducer(s, { type: 'block/upsert', weekStart: WS, block: { ...b, endMin: 720 } });
    expect(s.weekPlans[WS].blocks.find((x) => x.id === 'b9')?.endMin).toBe(720);
    s = reducer(s, { type: 'block/delete', weekStart: WS, id: 'b9' });
    expect(s.weekPlans[WS].blocks.map((x) => x.id)).toEqual(['b1']);
  });
  it('data/replace swaps state', () => {
    const next = data();
    expect(reducer(seed(), { type: 'data/replace', data: next })).toBe(next);
  });
});
