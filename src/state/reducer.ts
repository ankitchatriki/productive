// Pure reducer. Receives `now` inside actions; never reads the clock itself.
import type { AppData, Id, WeekPlan } from '../domain/types';
import type { Action, SectionDeleteRecord } from './actions';
import { entryFromTimer } from '../domain/entries';
import { normalizeOrder, reorder } from '../domain/sections';
import { createWeekPlan, shiftPlanFrom } from '../domain/plan';
import { weekStartOf } from '../domain/time';

function mapPlans(data: AppData, fn: (p: WeekPlan) => WeekPlan): Record<string, WeekPlan> {
  const out: Record<string, WeekPlan> = {};
  for (const [k, p] of Object.entries(data.weekPlans)) out[k] = fn(p);
  return out;
}

function withPlan(data: AppData, weekStart: string, fn: (p: WeekPlan) => WeekPlan, now?: string): AppData {
  const existing = data.weekPlans[weekStart];
  if (!existing && !now) return data;
  const plan = existing ?? createWeekPlan(weekStart, data.settings, now!);
  return { ...data, weekPlans: { ...data.weekPlans, [weekStart]: fn(plan) } };
}

function clearSectionRefs(plan: WeekPlan, sectionIds: Set<Id>): WeekPlan {
  let changed = false;
  const sectionByDay = { ...plan.sectionByDay };
  for (const [d, sid] of Object.entries(sectionByDay)) {
    if (sid && sectionIds.has(sid)) { sectionByDay[d] = null; changed = true; }
  }
  const blocks = plan.blocks.map((b) => {
    if (b.sectionId && sectionIds.has(b.sectionId)) { changed = true; return { ...b, sectionId: null }; }
    return b;
  });
  return changed ? { ...plan, sectionByDay, blocks } : plan;
}

/** Record what deleting section `id` will change (for a precise Undo). */
export function sectionDeleteRecord(state: AppData, id: Id): SectionDeleteRecord | null {
  const section = state.sections.find((s) => s.id === id);
  if (!section) return null;
  const blocks: SectionDeleteRecord['blocks'] = [];
  const days: SectionDeleteRecord['days'] = [];
  for (const p of Object.values(state.weekPlans)) {
    for (const b of p.blocks) if (b.sectionId === id) blocks.push({ weekStart: p.weekStart, blockId: b.id });
    for (const [d, sid] of Object.entries(p.sectionByDay)) if (sid === id) days.push({ weekStart: p.weekStart, date: d });
  }
  return {
    section,
    entryIds: state.entries.filter((e) => e.sectionId === id).map((e) => e.id),
    blocks,
    days,
    timer: state.activeTimer?.sectionId === id,
  };
}

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'course/add':
      return { ...state, courses: [...state.courses, action.course] };

    case 'course/update':
      return { ...state, courses: state.courses.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) };

    case 'course/delete': {
      if (state.entries.some((e) => e.courseId === action.id)) return state;
      if (!state.courses.some((c) => c.id === action.id)) return state;
      const removedSections = new Set(state.sections.filter((s) => s.courseId === action.id).map((s) => s.id));
      return {
        ...state,
        courses: state.courses.filter((c) => c.id !== action.id),
        sections: state.sections.filter((s) => s.courseId !== action.id),
        activeTimer: state.activeTimer?.courseId === action.id ? null : state.activeTimer,
        weekPlans: mapPlans(state, (p) => {
          const cleared = clearSectionRefs(p, removedSections);
          return {
            ...cleared,
            blocks: cleared.blocks.filter((b) => b.courseId !== action.id),
            goals: cleared.goals.filter((g) => !('courseId' in g) || g.courseId !== action.id),
          };
        }),
      };
    }

    case 'section/addMany':
      return { ...state, sections: [...state.sections, ...action.sections] };

    case 'section/update':
      return { ...state, sections: state.sections.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) };

    case 'section/move':
      return { ...state, sections: reorder(state.sections, action.id, action.direction) };

    case 'section/delete': {
      const target = state.sections.find((s) => s.id === action.id);
      if (!target) return state;
      const ids = new Set([action.id]);
      return {
        ...state,
        sections: normalizeOrder(state.sections.filter((s) => s.id !== action.id), target.courseId),
        entries: state.entries.map((e) => (e.sectionId === action.id ? { ...e, sectionId: null } : e)),
        activeTimer: state.activeTimer?.sectionId === action.id ? { ...state.activeTimer, sectionId: null } : state.activeTimer,
        weekPlans: mapPlans(state, (p) => clearSectionRefs(p, ids)),
      };
    }

    case 'section/setDone':
      return {
        ...state,
        sections: state.sections.map((s) => (s.id === action.id ? { ...s, completedAt: action.done ? action.now : null } : s)),
      };

    case 'entry/add':
      return { ...state, entries: [...state.entries, action.entry] };

    case 'entry/update':
      return { ...state, entries: state.entries.map((e) => (e.id === action.entry.id ? action.entry : e)) };

    case 'entry/delete':
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id) };

    case 'timer/start':
      if (state.activeTimer) return state;
      return { ...state, activeTimer: action.timer };

    case 'timer/stop': {
      if (!state.activeTimer) return state;
      const r = entryFromTimer(state.activeTimer, action.now, action.newEntryId, state.entries);
      return { ...state, activeTimer: null, entries: r.kind === 'entry' ? [...state.entries, r.entry] : state.entries };
    }

    case 'timer/switch': {
      if (!state.activeTimer) return state;
      const stopped = reducer(state, { type: 'timer/stop', now: action.now, newEntryId: action.newEntryId });
      return { ...stopped, activeTimer: { ...action.next, startedAt: action.now } };
    }

    case 'plan/ensure':
      if (state.weekPlans[action.weekStart]) return state;
      return { ...state, weekPlans: { ...state.weekPlans, [action.weekStart]: createWeekPlan(action.weekStart, state.settings, action.now) } };

    case 'plan/update':
      return withPlan(state, action.weekStart, (p) => ({ ...p, ...action.patch, weekStart: p.weekStart, updatedAt: action.now }), action.now);

    case 'plan/assignSection':
      return withPlan(state, action.weekStart, (p) =>
        action.date in p.sectionByDay ? { ...p, sectionByDay: { ...p.sectionByDay, [action.date]: action.sectionId } } : p);

    case 'plan/shiftFrom': {
      const ws = weekStartOf(action.date);
      const createdAt = new Date(`${action.date}T00:00:00`).toISOString();
      return withPlan(state, ws, (p) => shiftPlanFrom(p, action.date, action.sectionId).plan, createdAt);
    }

    case 'block/upsert':
      return withPlan(state, action.weekStart, (p) => {
        const exists = p.blocks.some((b) => b.id === action.block.id);
        return { ...p, blocks: exists ? p.blocks.map((b) => (b.id === action.block.id ? action.block : b)) : [...p.blocks, action.block] };
      });

    case 'block/delete':
      return withPlan(state, action.weekStart, (p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== action.id) }));

    case 'data/replace':
      return action.data;

    case 'timer/restore': {
      if (state.activeTimer) return state; // a newer timer is running; don't clobber it
      return {
        ...state,
        entries: action.removeEntryId ? state.entries.filter((e) => e.id !== action.removeEntryId) : state.entries,
        activeTimer: action.timer,
      };
    }

    case 'section/restore': {
      const r = action.record;
      if (state.sections.some((s) => s.id === r.section.id)) return state;
      if (!state.courses.some((c) => c.id === r.section.courseId)) return state;
      const shifted = state.sections.map((s) => (s.courseId === r.section.courseId && s.order >= r.section.order ? { ...s, order: s.order + 1 } : s));
      const sections = normalizeOrder([...shifted, r.section], r.section.courseId);
      const entryIds = new Set(r.entryIds);
      const weekPlans = { ...state.weekPlans };
      for (const ref of r.blocks) {
        const p = weekPlans[ref.weekStart];
        if (!p) continue;
        weekPlans[ref.weekStart] = { ...p, blocks: p.blocks.map((b) => (b.id === ref.blockId && b.sectionId === null && b.courseId === r.section.courseId ? { ...b, sectionId: r.section.id } : b)) };
      }
      for (const ref of r.days) {
        const p = weekPlans[ref.weekStart];
        if (!p || p.sectionByDay[ref.date] !== null) continue;
        weekPlans[ref.weekStart] = { ...p, sectionByDay: { ...p.sectionByDay, [ref.date]: r.section.id } };
      }
      const t = state.activeTimer;
      return {
        ...state,
        sections,
        entries: state.entries.map((e) => (entryIds.has(e.id) && e.sectionId === null && e.courseId === r.section.courseId ? { ...e, sectionId: r.section.id } : e)),
        weekPlans,
        activeTimer: r.timer && t && t.sectionId === null && t.courseId === r.section.courseId ? { ...t, sectionId: r.section.id } : t,
      };
    }

    case 'plan/insertGoal':
      return withPlan(state, action.weekStart, (p) => {
        if (p.goals.some((g) => g.id === action.goal.id)) return p;
        const goals = [...p.goals];
        goals.splice(Math.min(action.index, goals.length), 0, action.goal);
        return { ...p, goals, updatedAt: action.now };
      });

    case 'plan/fillDays':
      return withPlan(state, action.weekStart, (p) => {
        const sectionByDay = { ...p.sectionByDay };
        for (const [d, sid] of Object.entries(action.sectionByDay)) {
          if (d in sectionByDay && sectionByDay[d] === null && sid && state.sections.some((s) => s.id === sid)) sectionByDay[d] = sid;
        }
        return { ...p, sectionByDay };
      });

    default:
      return state;
  }
}
