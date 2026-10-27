import { describe, expect, it } from 'vitest';
import { CORRUPT_KEY, LocalStorageAdapter, STORAGE_KEY, type KeyValueStore } from './localStorage';
import { emptyAppData } from './defaults';
import { exportJson, importJson } from './json';
import { course, data, entry, iso } from '../domain/fixtures';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

describe('LocalStorageAdapter', () => {
  it('returns null when empty', () => {
    expect(new LocalStorageAdapter(new MemoryStore(), null).load()).toBeNull();
  });
  it('round-trips data including a running timer', () => {
    const mem = new MemoryStore();
    const a = new LocalStorageAdapter(mem, null);
    const d = data({ courses: [course('c1')], activeTimer: { courseId: 'c1', sectionId: null, startedAt: iso(2026, 10, 28, 9), note: '' } });
    a.save(d);
    expect(a.load()).toEqual(d);
    expect(a.approxBytes()).toBeGreaterThan(0);
    a.clear();
    expect(mem.getItem(STORAGE_KEY)).toBeNull();
  });
  it('corrupt JSON → null and raw copy kept', () => {
    const mem = new MemoryStore();
    mem.setItem(STORAGE_KEY, '{not json');
    expect(new LocalStorageAdapter(mem, null).load()).toBeNull();
    expect(mem.getItem(CORRUPT_KEY)).toBe('{not json');
  });
  it('schema-invalid data is treated as corrupt', () => {
    const mem = new MemoryStore();
    mem.setItem(STORAGE_KEY, '{"schemaVersion": 7}');
    expect(new LocalStorageAdapter(mem, null).load()).toBeNull();
    expect(mem.getItem(CORRUPT_KEY)).toBe('{"schemaVersion": 7}');
  });
  it('subscribe forwards valid external writes only for our key', () => {
    const listeners: Array<(e: StorageEvent) => void> = [];
    const win = {
      addEventListener: (_: string, h: EventListener) => listeners.push(h as unknown as (e: StorageEvent) => void),
      removeEventListener: () => {},
    } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>;
    const got: unknown[] = [];
    new LocalStorageAdapter(new MemoryStore(), win).subscribe((d) => got.push(d));
    listeners[0]({ key: 'other', newValue: '{}' } as StorageEvent);
    listeners[0]({ key: STORAGE_KEY, newValue: 'garbage' } as StorageEvent);
    listeners[0]({ key: STORAGE_KEY, newValue: JSON.stringify(emptyAppData()) } as StorageEvent);
    expect(got).toEqual([emptyAppData()]);
  });
});

describe('export/import JSON', () => {
  it('round-trips identically', () => {
    const d = data({ courses: [course('c1')], entries: [entry('e', 'c1', iso(2026, 10, 27, 9), iso(2026, 10, 27, 10))] });
    const r = importJson(exportJson(d));
    expect(r).toEqual({ data: d, warnings: [] });
  });
  it('rejects invalid JSON text', () => {
    expect(importJson('nope')).toEqual({ errors: ['The file is not valid JSON.'] });
  });
});

describe('recovering from bad stored data (review R9)', () => {
  it('drops a broken goal with a warning instead of discarding everything', () => {
    const mem = new MemoryStore();
    const d = data({ courses: [course('c1')] });
    const raw = JSON.parse(JSON.stringify(d));
    raw.weekPlans['2026-10-26'] = {
      weekStart: '2026-10-26', dailyGoalMinutes: 480, restDays: [], sectionByDay: {}, blocks: [], reviewNote: '',
      createdAt: iso(2026, 10, 26), updatedAt: iso(2026, 10, 26),
      goals: [{ id: 'g1', kind: 'totalHours', targetMinutes: null }, { id: 'g2', kind: 'dailyGoalDays', targetCount: 5 }],
    };
    mem.setItem(STORAGE_KEY, JSON.stringify(raw));
    const a = new LocalStorageAdapter(mem, null);
    const loaded = a.load();
    expect(loaded?.courses).toHaveLength(1);
    expect(loaded?.weekPlans['2026-10-26'].goals.map((g) => g.id)).toEqual(['g2']);
    expect(a.corruptCopy()).toBeNull();
  });
  it('exposes the raw copy of unreadable data for this session, and can discard it', () => {
    const mem = new MemoryStore();
    mem.setItem(STORAGE_KEY, '{oops');
    const a = new LocalStorageAdapter(mem, null);
    expect(a.load()).toBeNull();
    expect(a.corruptCopy()).toBe('{oops');
    a.discardCorrupt();
    expect(a.corruptCopy()).toBeNull();
    expect(mem.getItem(CORRUPT_KEY)).toBeNull();
  });
});
