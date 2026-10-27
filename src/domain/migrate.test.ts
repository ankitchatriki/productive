import { describe, expect, it } from 'vitest';
import { migrate } from './migrate';
import { validateAppData } from './validate';
import { exportJson, importJson } from '../storage/json';
import { defaultFocusSettings } from '../storage/defaults';
import { course, data, entry, iso } from './fixtures';
import type { AppData } from './types';

/** A round-1 (schema v1) export. */
function v1() {
  const d = data({ courses: [course('c1')], entries: [entry('e', 'c1', iso(2026, 10, 27, 9), iso(2026, 10, 27, 10))] });
  const { focus: _f, mountain: _m, ...rest } = d;
  void _f; void _m;
  const { focus: _s, ...settings } = d.settings;
  void _s;
  return { ...rest, schemaVersion: 1, settings };
}

/** A round-2 (schema v2) export: no mountain yet. */
function v2() {
  const d = data({ courses: [course('c1')], entries: [entry('e', 'c1', iso(2026, 10, 27, 9), iso(2026, 10, 27, 10))] });
  const { mountain: _m, ...rest } = d;
  void _m;
  return { ...rest, schemaVersion: 2 };
}

describe('v1 → v2 migration', () => {
  it('migrate adds focus settings and a null session', () => {
    const m = migrate(v1()) as AppData;
    expect(m.schemaVersion).toBe(3);
    expect(m.settings.focus).toEqual(defaultFocusSettings);
    expect(m.focus).toBeNull();
  });
  it('v3 passes through and unknown input is untouched', () => {
    const d = data();
    expect(migrate(d)).toBe(d);
    expect(migrate(42)).toBe(42);
    const odd = { schemaVersion: 9 };
    expect(migrate(odd)).toBe(odd);
  });
  it('a v1 export imports as v3 and exports v3', () => {
    const r = importJson(JSON.stringify(v1()));
    expect('data' in r).toBe(true);
    if ('data' in r) {
      expect(r.data.schemaVersion).toBe(3);
      expect(r.data.entries).toHaveLength(1);
      expect(JSON.parse(exportJson(r.data)).schemaVersion).toBe(3);
    }
  });
  it('unknown schemaVersion is rejected clearly', () => {
    expect(validateAppData({ ...data(), schemaVersion: 7 })).toEqual(['Unsupported schemaVersion: 7 (expected 1, 2 or 3).']);
  });
});

describe('v2 → v3 migration (the mountain, ROUND3_ART §6.2)', () => {
  it('adds the default mountain at its foot and keeps everything else', () => {
    const m = migrate(v2()) as AppData;
    expect(m.schemaVersion).toBe(3);
    expect(m.mountain).toEqual({ seed: 0x5157, stage: 0, posM: 0, altM: 0, stageStartM: 0, stageStartAltM: 0, fromSummit: false, atSummit: false, summits: 0 });
    expect(m.entries).toHaveLength(1);
  });
  it('a v2 export imports, validates and round-trips the mountain through export/import', () => {
    const r = importJson(JSON.stringify(v2()));
    expect('data' in r).toBe(true);
    if (!('data' in r)) return;
    const moved = { ...r.data, mountain: { ...r.data.mountain, stage: 4, posM: 812.5, altM: 301.2, stageStartM: 700, stageStartAltM: 260, fromSummit: true, summits: 3 } };
    const back = importJson(exportJson(moved));
    expect('data' in back && back.data.mountain).toEqual(moved.mountain);
  });
  it('rejects a malformed mountain', () => {
    const bad = { ...data(), mountain: { ...data().mountain, posM: -3, summits: 1.5, atSummit: 'yes' } };
    const r = validateAppData(bad) as string[];
    expect(r.join('\n')).toMatch(/mountain.summits[\s\S]*mountain.posM[\s\S]*mountain.atSummit/);
    expect((validateAppData({ ...data(), mountain: undefined }) as string[])[0]).toMatch(/mountain is missing/);
  });
});

describe('focus validation (repair first)', () => {
  it('repairs invalid settings.focus fields with warnings', () => {
    const d = data();
    (d.settings as unknown as Record<string, unknown>).focus = { ...defaultFocusSettings, breakMinutes: 0, scene: 'ice', motion: 'wild', lastChoice: { kind: 'custom', minutes: 2 } };
    const warnings: string[] = [];
    const r = validateAppData(d, warnings) as AppData;
    expect(r.settings.focus).toMatchObject({ breakMinutes: 10, scene: 'sisyphus', motion: 'system', lastChoice: { kind: 'preset', minutes: 50 } });
    expect(warnings).toHaveLength(4);
  });
  it('missing settings.focus becomes defaults', () => {
    const d = data();
    delete (d.settings as unknown as Record<string, unknown>).focus;
    const warnings: string[] = [];
    expect((validateAppData(d, warnings) as AppData).settings.focus).toEqual(defaultFocusSettings);
    expect(warnings).toEqual(['settings.focus was missing and was reset to defaults.']);
  });
  it('an inconsistent session is dropped; the timer is kept', () => {
    const timer = { courseId: 'c1', sectionId: null, startedAt: iso(2026, 10, 27, 9), note: '' };
    const d = data({ courses: [course('c1')], activeTimer: timer });
    (d as unknown as Record<string, unknown>).focus = {
      id: 'f', target: { courseId: 'c1', sectionId: null, note: '' }, choice: 'preset', blockMinutes: 50,
      blockStartedAt: timer.startedAt, focusedMsBefore: 0, segmentStartedAt: null, phase: 'focus', // broken: running without segment
      completedAt: null, pausedAt: null, breakMinutes: null, breakStartedAt: null, breakEndsAt: null, blocksCompleted: 0, scene: 'daylight', immersive: true,
    };
    const warnings: string[] = [];
    const r = validateAppData(d, warnings) as AppData;
    expect(r.focus).toBeNull();
    expect(r.activeTimer).toEqual(timer);
    expect(warnings).toContain('Focus session was inconsistent and was cleared.');
  });
  it('a consistent session survives and a dangling target section is nulled', () => {
    const timer = { courseId: 'c1', sectionId: null, startedAt: iso(2026, 10, 27, 9), note: '' };
    const d = data({ courses: [course('c1')], activeTimer: timer });
    const session = {
      id: 'f', target: { courseId: 'c1', sectionId: 'gone', note: '' }, choice: 'preset', blockMinutes: 50,
      blockStartedAt: timer.startedAt, focusedMsBefore: 0, segmentStartedAt: timer.startedAt, phase: 'focus',
      completedAt: null, pausedAt: null, breakMinutes: null, breakStartedAt: null, breakEndsAt: null, blocksCompleted: 0, scene: 'daylight', immersive: true,
    };
    (d as unknown as Record<string, unknown>).focus = session;
    const r = validateAppData(d) as AppData;
    expect(r.focus).toMatchObject({ id: 'f', target: { sectionId: null } });
  });
  it('focus that is not an object makes the file invalid', () => {
    const d = { ...data(), focus: 5 };
    expect(validateAppData(d)).toEqual(['focus must be null or an object.']);
  });
});

describe('scene ids (STRUGGLEMORE §3.1)', () => {
  it("a stored 'nightfall' scene is repaired to 'sisyphus' with a warning; 'daylight' stays", () => {
    const d = data();
    (d.settings.focus as unknown as Record<string, unknown>).scene = 'nightfall';
    const warnings: string[] = [];
    expect((validateAppData(d, warnings) as AppData).settings.focus.scene).toBe('sisyphus');
    expect(warnings).toEqual(['settings.focus.scene was invalid and was reset.']);
    const d2 = data();
    d2.settings.focus.scene = 'daylight';
    expect((validateAppData(d2) as AppData).settings.focus.scene).toBe('daylight');
  });
  it('showSplash: v1 migration defaults it to true; v2 missing or invalid is repaired to true', () => {
    const { showSplash: _x, ...noSplash } = v1().settings as Record<string, unknown>;
    void _x;
    expect((migrate({ ...v1(), settings: noSplash }) as AppData).settings.showSplash).toBe(true);
    const d = data();
    const { showSplash: _y, ...rest } = d.settings;
    void _y;
    const w: string[] = [];
    expect((validateAppData({ ...d, settings: rest }, w) as AppData).settings.showSplash).toBe(true);
    expect(w).toEqual([]);
    const w2: string[] = [];
    expect((validateAppData({ ...d, settings: { ...d.settings, showSplash: 'no' } }, w2) as AppData).settings.showSplash).toBe(true);
    expect(w2).toEqual(['settings.showSplash was not true/false; it was reset to true.']);
    expect((validateAppData({ ...d, settings: { ...d.settings, showSplash: false } }) as AppData).settings.showSplash).toBe(false);
  });
  it('a v1 migration writes the new default scene', () => {
    expect((migrate({ ...data(), schemaVersion: 1 }) as AppData).settings.focus.scene).toBe('sisyphus');
  });
  it("a session with scene 'nightfall' is dropped as inconsistent", () => {
    const timer = { courseId: 'c1', sectionId: null, startedAt: iso(2026, 10, 27, 9), note: '' };
    const d = data({ courses: [course('c1')], activeTimer: timer });
    (d as unknown as Record<string, unknown>).focus = {
      id: 'f', target: { courseId: 'c1', sectionId: null, note: '' }, choice: 'preset', blockMinutes: 50,
      blockStartedAt: timer.startedAt, focusedMsBefore: 0, segmentStartedAt: timer.startedAt, phase: 'focus',
      completedAt: null, pausedAt: null, breakMinutes: null, breakStartedAt: null, breakEndsAt: null, blocksCompleted: 0, scene: 'nightfall', immersive: true,
    };
    expect((validateAppData(d) as AppData).focus).toBeNull();
  });
});
