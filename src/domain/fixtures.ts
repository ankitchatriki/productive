// Test fixture builders (imported only by *.test.ts).
import type { AppData, Course, Section, TimeEntry } from './types';

export const at = (y: number, m: number, d: number, h = 0, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s);
export const iso = (y: number, m: number, d: number, h = 0, min = 0, s = 0) => at(y, m, d, h, min, s).toISOString();

export function course(id: string, extra: Partial<Course> = {}): Course {
  return { id, name: id.toUpperCase(), color: '#2f6bd8', archived: false, createdAt: '2026-01-01T00:00:00.000Z', ...extra };
}

export function section(id: string, courseId: string, order: number, extra: Partial<Section> = {}): Section {
  return { id, courseId, title: id, order, estimatedMinutes: null, completedAt: null, notes: '', ...extra };
}

export function entry(id: string, courseId: string, start: string, end: string, extra: Partial<TimeEntry> = {}): TimeEntry {
  return { id, courseId, sectionId: null, start, end, note: '', source: 'manual', createdAt: start, updatedAt: start, ...extra };
}

export function data(extra: Partial<AppData> = {}): AppData {
  return {
    schemaVersion: 1,
    settings: { dailyGoalMinutes: 480, restDays: [], gridStartHour: 6, gridEndHour: 24, onboarded: true },
    courses: [],
    sections: [],
    entries: [],
    weekPlans: {},
    activeTimer: null,
    ...extra,
  };
}
