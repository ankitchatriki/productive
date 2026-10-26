// Section helpers (PLAN.md §2, §3.4).
import type { Id, Section, SectionStatus } from './types';

export function sectionStatus(section: Section, loggedMinutes: number): SectionStatus {
  if (section.completedAt) return 'done';
  return loggedMinutes > 0 ? 'in_progress' : 'todo';
}

export const STATUS_LABEL: Record<SectionStatus, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

export function sectionsOfCourse(sections: Section[], courseId: Id): Section[] {
  return sections.filter((s) => s.courseId === courseId).sort((a, b) => a.order - b.order);
}

/** Re-number a course's sections 0..n-1 in current order. */
export function normalizeOrder(sections: Section[], courseId: Id): Section[] {
  const ordered = sectionsOfCourse(sections, courseId);
  const pos = new Map(ordered.map((s, i) => [s.id, i]));
  return sections.map((s) => (pos.has(s.id) && s.order !== pos.get(s.id) ? { ...s, order: pos.get(s.id)! } : s));
}

/** Swap a section with its neighbour within the course. No-op at the edges. */
export function reorder(sections: Section[], id: Id, direction: -1 | 1): Section[] {
  const target = sections.find((s) => s.id === id);
  if (!target) return sections;
  const ordered = sectionsOfCourse(sections, target.courseId);
  const idx = ordered.findIndex((s) => s.id === id);
  const swapWith = ordered[idx + direction];
  if (!swapWith) return sections;
  const newOrder = new Map<Id, number>();
  ordered.forEach((s, i) => newOrder.set(s.id, i));
  newOrder.set(target.id, idx + direction);
  newOrder.set(swapWith.id, idx);
  return sections.map((s) => (newOrder.has(s.id) ? { ...s, order: newOrder.get(s.id)! } : s));
}

export interface ParsedSection { title: string; estimatedMinutes: number | null }

/** Parse hours like "6", "1.5", "1,5" or "1:30". Returns minutes or null. */
export function parseHours(v: string): number | null {
  const s = v.trim().replace(',', '.').replace(/h$/i, '').trim();
  if (!s) return null;
  const hm = /^(\d+):(\d{1,2})$/.exec(s);
  if (hm) {
    const m = Number(hm[2]);
    if (m > 59) return null;
    return Number(hm[1]) * 60 + m;
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const h = Number(s);
  return Number.isFinite(h) && h >= 0 ? Math.round(h * 60) : null;
}

/** One section per line, optional `| hours` suffix. Blank lines ignored. */
export function parseBulkSections(text: string): ParsedSection[] {
  const out: ParsedSection[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const bar = line.lastIndexOf('|');
    if (bar >= 0) {
      const title = line.slice(0, bar).trim();
      const minutes = parseHours(line.slice(bar + 1));
      if (title && minutes !== null) {
        out.push({ title, estimatedMinutes: minutes > 0 ? minutes : null });
        continue;
      }
      if (title && line.slice(bar + 1).trim() === '') {
        out.push({ title, estimatedMinutes: null });
        continue;
      }
    }
    out.push({ title: line, estimatedMinutes: null });
  }
  return out;
}

/** Build Section records appended after the course's existing sections. */
export function makeSections(courseId: Id, parsed: ParsedSection[], existing: Section[], newId: () => Id): Section[] {
  const start = existing.filter((s) => s.courseId === courseId).length;
  return parsed.map((p, i) => ({
    id: newId(),
    courseId,
    title: p.title,
    order: start + i,
    estimatedMinutes: p.estimatedMinutes,
    completedAt: null,
    notes: '',
  }));
}
