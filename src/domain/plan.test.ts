import { describe, expect, it } from 'vitest';
import {
  adherence, autoAssign, autoAssignStart, blocksOverlap, canPlaceBlock, copyBlocksFromPreviousWeek, copyGoalsFromPreviousWeek,
  createWeekPlan, dailyGoalFor, defaultAutoAssignCourse, findCarryOver, goalsAreDefault, plannedMinutes, shiftPlanFrom, todayBlocks,
} from './plan';
import { allIntervals } from './aggregate';
import { course, data, entry, iso, section } from './fixtures';
import type { ScheduledBlock } from './types';

const WS = '2026-10-26';
const settings = data().settings;
const blk = (id: string, date: string, s: number, e: number, courseId = 'c1'): ScheduledBlock => ({ id, date, startMin: s, endMin: e, courseId, sectionId: null, label: '' });

describe('createWeekPlan', () => {
  it('uses settings and default goals', () => {
    const p = createWeekPlan(WS, { ...settings, restDays: [6] }, iso(2026, 10, 26));
    expect(Object.keys(p.sectionByDay)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(Object.values(p.sectionByDay).every((v) => v === null)).toBe(true);
    expect(p.goals).toEqual([
      { id: `${WS}-total`, kind: 'totalHours', targetMinutes: 480 * 6 },
      { id: `${WS}-days`, kind: 'dailyGoalDays', targetCount: 6 },
    ]);
    expect(p).toMatchObject({ dailyGoalMinutes: 480, restDays: [6], blocks: [], reviewNote: '' });
    expect(goalsAreDefault(p)).toBe(true);
  });
  it('dailyGoalFor uses the plan snapshot, else settings', () => {
    const d = data();
    d.weekPlans[WS] = { ...createWeekPlan(WS, settings, iso(2026, 10, 26)), dailyGoalMinutes: 300 };
    expect(dailyGoalFor('2026-10-28', d)).toBe(300);
    expect(dailyGoalFor('2026-11-04', d)).toBe(480);
  });
});

describe('autoAssign', () => {
  const sections = [section('a', 'c1', 0, { completedAt: iso(2026, 10, 1) }), section('b', 'c1', 1), section('c', 'c1', 2), section('d', 'c1', 3), section('x', 'c2', 0)];
  it('fills empty non-rest days from the start date with next unfinished, unassigned sections in order', () => {
    const p = { ...createWeekPlan(WS, { ...settings, restDays: [6] }, iso(2026, 10, 26)) };
    p.sectionByDay = { ...p.sectionByDay, '2026-10-29': 'c' };
    const r = autoAssign(p, sections, 'c1', '2026-10-28');
    expect(r.sectionByDay).toEqual({
      '2026-10-26': null, '2026-10-27': null, '2026-10-28': 'b', '2026-10-29': 'c', '2026-10-30': 'd', '2026-10-31': null, '2026-11-01': null,
    });
  });
  it('start date is today within the week, else Monday', () => {
    expect(autoAssignStart(WS, '2026-10-28')).toBe('2026-10-28');
    expect(autoAssignStart(WS, '2026-10-20')).toBe(WS);
  });
  it('default course has the most remaining sections', () => {
    expect(defaultAutoAssignCourse([course('c1'), course('c2')], sections)).toBe('c1');
    expect(defaultAutoAssignCourse([], sections)).toBeNull();
  });
});

describe('shiftPlanFrom', () => {
  it('moves each section to the next non-rest day and drops what falls off Sunday', () => {
    const p = createWeekPlan(WS, { ...settings, restDays: [5] }, iso(2026, 10, 26)); // Saturday rest
    p.sectionByDay = { ...p.sectionByDay, '2026-10-29': 's4', '2026-10-30': 's5', '2026-11-01': 's7' };
    const r = shiftPlanFrom(p, '2026-10-29', 'old');
    expect(r.plan.sectionByDay['2026-10-29']).toBe('old');
    expect(r.plan.sectionByDay['2026-10-30']).toBe('s4');
    expect(r.plan.sectionByDay['2026-10-31']).toBeNull(); // rest day skipped
    expect(r.plan.sectionByDay['2026-11-01']).toBe('s5');
    expect(r.dropped).toEqual(['s7']);
  });
  it('keeps gaps and leaves earlier days untouched', () => {
    const p = createWeekPlan(WS, settings, iso(2026, 10, 26));
    p.sectionByDay = { ...p.sectionByDay, '2026-10-26': 'm', '2026-10-28': 'w', '2026-10-30': 'f' };
    const r = shiftPlanFrom(p, '2026-10-28', 'x');
    expect(r.plan.sectionByDay).toMatchObject({ '2026-10-26': 'm', '2026-10-28': 'x', '2026-10-29': 'w', '2026-10-30': null, '2026-10-31': 'f' });
    expect(r.dropped).toEqual([]);
  });
});

describe('shiftPlanFrom with a section on a rest day (review R4)', () => {
  it('never drops a section silently when two would land on the same day', () => {
    const p = createWeekPlan(WS, { ...settings, restDays: [2] }, iso(2026, 10, 26)); // Wednesday rest
    p.sectionByDay = { ...p.sectionByDay, '2026-10-27': 'A', '2026-10-28': 'B', '2026-10-29': 'C' };
    const r = shiftPlanFrom(p, '2026-10-27', 'X');
    expect(r.plan.sectionByDay).toMatchObject({ '2026-10-27': 'X', '2026-10-28': null, '2026-10-29': 'A', '2026-10-30': 'B', '2026-10-31': 'C' });
    expect(r.dropped).toEqual([]);
    const assigned = Object.values(r.plan.sectionByDay).filter(Boolean).sort();
    expect(assigned).toEqual(['A', 'B', 'C', 'X']);
  });
  it('reports every section that falls off Sunday', () => {
    const p = createWeekPlan(WS, { ...settings, restDays: [5] }, iso(2026, 10, 26)); // Saturday rest
    p.sectionByDay = { ...p.sectionByDay, '2026-10-30': 'F', '2026-10-31': 'S', '2026-11-01': 'U' };
    const r = shiftPlanFrom(p, '2026-10-30', 'X');
    expect(r.plan.sectionByDay['2026-11-01']).toBe('F');
    expect(r.dropped).toEqual(['S', 'U']);
  });
});

describe('blocks', () => {
  it('overlap rules (touching is fine, different days never overlap)', () => {
    expect(blocksOverlap(blk('a', WS, 540, 600), blk('b', WS, 600, 660))).toBe(false);
    expect(blocksOverlap(blk('a', WS, 540, 615), blk('b', WS, 600, 660))).toBe(true);
    expect(blocksOverlap(blk('a', WS, 540, 615), blk('b', '2026-10-27', 600, 660))).toBe(false);
  });
  it('canPlaceBlock ignores itself and checks bounds', () => {
    const blocks = [blk('a', WS, 540, 600), blk('b', WS, 660, 720)];
    expect(canPlaceBlock(blocks, blk('a', WS, 555, 615))).toBe(true);
    expect(canPlaceBlock(blocks, blk('a', WS, 600, 675))).toBe(false);
    expect(canPlaceBlock(blocks, blk('n', WS, 1380, 1455))).toBe(false);
  });
  it('plannedMinutes per day and week', () => {
    const blocks = [blk('a', WS, 540, 600), blk('b', WS, 660, 750), blk('c', '2026-10-27', 0, 15)];
    expect(plannedMinutes(blocks, WS)).toBe(150);
    expect(plannedMinutes(blocks)).toBe(165);
  });
  it('copyBlocksFromPreviousWeek shifts +7 days with new ids', () => {
    const prev = createWeekPlan('2026-10-19', settings, iso(2026, 10, 19));
    prev.blocks = [blk('a', '2026-10-19', 540, 600), blk('b', '2026-10-25', 60, 120)];
    let n = 0;
    const r = copyBlocksFromPreviousWeek(createWeekPlan(WS, settings, iso(2026, 10, 26)), prev, () => `n${n++}`);
    expect(r.blocks.map((b) => [b.id, b.date, b.startMin])).toEqual([['n0', '2026-10-26', 540], ['n1', '2026-11-01', 60]]);
  });
  it('copyGoalsFromPreviousWeek gives new ids', () => {
    const prev = createWeekPlan('2026-10-19', settings, iso(2026, 10, 19));
    const goals = copyGoalsFromPreviousWeek(prev, () => 'z');
    expect(goals.map((g) => g.id)).toEqual(['z', 'z']);
    expect(goals[0]).toMatchObject({ kind: 'totalHours', targetMinutes: 3360 });
  });
});

describe('adherence', () => {
  it('counts overlap with same-course entries only', () => {
    const blocks = [blk('a', WS, 540, 660, 'c1'), blk('b', WS, 780, 840, 'c2')];
    const d = data({ entries: [
      entry('e1', 'c1', iso(2026, 10, 26, 9, 30), iso(2026, 10, 26, 12)), // 90 of 120 match
      entry('e2', 'c1', iso(2026, 10, 26, 13), iso(2026, 10, 26, 14)), // wrong course for block b
    ] });
    const r = adherence(blocks, allIntervals(d, new Date(2030, 0, 1)), [WS]);
    expect(r).toEqual({ planned: 180, matched: 90, pct: 50 });
  });
  it('is null when nothing is planned', () => {
    expect(adherence([], [], [WS]).pct).toBeNull();
  });
});

describe('findCarryOver', () => {
  const mk = () => {
    const d = data({ sections: [section('a', 'c1', 0), section('b', 'c1', 1), section('done', 'c1', 2, { completedAt: iso(2026, 10, 20) })] });
    d.weekPlans['2026-10-19'] = createWeekPlan('2026-10-19', settings, iso(2026, 10, 19));
    d.weekPlans[WS] = createWeekPlan(WS, settings, iso(2026, 10, 26));
    return d;
  };
  it('finds yesterday’s unfinished section', () => {
    const d = mk();
    d.weekPlans[WS].sectionByDay['2026-10-28'] = 'a';
    expect(findCarryOver(d, '2026-10-29')).toEqual({ sectionId: 'a', date: '2026-10-28' });
  });
  it('skips null days and looks into the previous week', () => {
    const d = mk();
    d.weekPlans['2026-10-19'].sectionByDay['2026-10-23'] = 'a';
    expect(findCarryOver(d, '2026-10-27')).toEqual({ sectionId: 'a', date: '2026-10-23' });
  });
  it('none when the most recent assigned section is done', () => {
    const d = mk();
    d.weekPlans[WS].sectionByDay['2026-10-26'] = 'a';
    d.weekPlans[WS].sectionByDay['2026-10-27'] = 'done';
    expect(findCarryOver(d, '2026-10-28')).toBeNull();
  });
  it('none when already assigned to today or later this week', () => {
    const d = mk();
    d.weekPlans[WS].sectionByDay['2026-10-27'] = 'a';
    d.weekPlans[WS].sectionByDay['2026-10-30'] = 'a';
    expect(findCarryOver(d, '2026-10-28')).toBeNull();
  });
  it('none beyond 7 days back', () => {
    const d = mk();
    d.weekPlans['2026-10-19'].sectionByDay['2026-10-19'] = 'a';
    expect(findCarryOver(d, '2026-10-27')).toBeNull();
  });
});

describe('todayBlocks (Up next)', () => {
  const b = (id: string, date: string, s: number, e: number): ScheduledBlock => ({ id, date, startMin: s, endMin: e, courseId: 'c1', sectionId: null, label: '' });
  const p = () => ({ ...createWeekPlan(WS, data().settings, iso(2026, 10, 26)), blocks: [b('late', '2026-10-27', 960, 1020), b('past', '2026-10-27', 540, 600), b('now', '2026-10-27', 780, 840), b('other', '2026-10-28', 780, 840), b('edge', '2026-10-27', 700, 780)] });
  it('undefined plan gives []', () => expect(todayBlocks(undefined, '2026-10-27', 600)).toEqual([]));
  it('excludes other days and past blocks, sorted, now/next', () => {
    const r = todayBlocks(p(), '2026-10-27', 800);
    expect(r.map((x) => [x.block.id, x.state])).toEqual([['now', 'now'], ['late', 'next']]);
  });
  it('a block ending exactly now is excluded; one starting exactly now is "now"', () => {
    const r = todayBlocks(p(), '2026-10-27', 780);
    expect(r.map((x) => [x.block.id, x.state])).toEqual([['now', 'now'], ['late', 'next']]);
  });
});
