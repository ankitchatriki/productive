// Import validation (PLAN.md §4.10).
import type { AppData, Goal, Weekday } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isIso = (v: unknown) => isStr(v) && !Number.isNaN(Date.parse(v));
const isDateKey = (v: unknown) => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isWeekdays = (v: unknown): v is Weekday[] => Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);

/**
 * Returns a cleaned AppData, or a list of error messages. Dangling sectionIds
 * are set to null and reported in `warnings`.
 */
export function validateAppData(raw: unknown, warnings: string[] = []): AppData | string[] {
  const errors: string[] = [];
  if (!isObj(raw)) return ['File is not a Productive backup (expected a JSON object).'];
  if (raw.schemaVersion !== 1) errors.push(`Unsupported schemaVersion: ${JSON.stringify(raw.schemaVersion)} (expected 1).`);

  const s = raw.settings;
  if (!isObj(s)) errors.push('settings is missing.');
  else {
    if (!isNum(s.dailyGoalMinutes) || s.dailyGoalMinutes < 0) errors.push('settings.dailyGoalMinutes must be a number.');
    if (!isWeekdays(s.restDays)) errors.push('settings.restDays must be a list of weekdays 0–6.');
    if (!isNum(s.gridStartHour) || !isNum(s.gridEndHour)) errors.push('settings.gridStartHour/gridEndHour must be numbers.');
    if (!isBool(s.onboarded)) errors.push('settings.onboarded must be true or false.');
  }

  for (const key of ['courses', 'sections', 'entries'] as const) {
    if (!Array.isArray(raw[key])) errors.push(`${key} must be a list.`);
  }
  if (!isObj(raw.weekPlans)) errors.push('weekPlans must be an object.');
  if (raw.activeTimer !== null && !isObj(raw.activeTimer)) errors.push('activeTimer must be null or an object.');
  if (errors.length) return errors;

  const courses = raw.courses as unknown[];
  const sections = raw.sections as unknown[];
  const entries = raw.entries as unknown[];
  const courseIds = new Set<string>();
  courses.forEach((c, i) => {
    if (!isObj(c) || !isStr(c.id) || !isStr(c.name) || !isStr(c.color) || !isBool(c.archived) || !isIso(c.createdAt)) {
      errors.push(`courses[${i}] is missing required fields.`);
    } else courseIds.add(c.id);
  });
  const sectionCourse = new Map<string, string>();
  sections.forEach((x, i) => {
    if (!isObj(x) || !isStr(x.id) || !isStr(x.courseId) || !isStr(x.title) || !isNum(x.order) ||
      !(x.estimatedMinutes === null || isNum(x.estimatedMinutes)) || !(x.completedAt === null || isIso(x.completedAt)) || !isStr(x.notes)) {
      errors.push(`sections[${i}] is missing required fields.`);
    } else if (!courseIds.has(x.courseId)) errors.push(`sections[${i}] references unknown course ${x.courseId}.`);
    else sectionCourse.set(x.id, x.courseId);
  });
  const fixSection = (where: string, obj: Obj) => {
    if (obj.sectionId !== null && obj.sectionId !== undefined && !sectionCourse.has(obj.sectionId as string)) {
      warnings.push(`${where} referenced a missing section; it was cleared.`);
      obj.sectionId = null;
    }
  };
  const cleanEntries = entries.map((e, i) => {
    if (!isObj(e) || !isStr(e.id) || !isStr(e.courseId) || !isIso(e.start) || !isIso(e.end) || !isStr(e.note) ||
      (e.source !== 'timer' && e.source !== 'manual') || !isIso(e.createdAt) || !isIso(e.updatedAt) ||
      !(e.sectionId === null || isStr(e.sectionId))) {
      errors.push(`entries[${i}] is missing required fields.`);
      return e;
    }
    if (!courseIds.has(e.courseId)) errors.push(`entries[${i}] references unknown course ${e.courseId}.`);
    if (Date.parse(e.end as string) <= Date.parse(e.start as string)) errors.push(`entries[${i}] ends before it starts.`);
    const copy = { ...e };
    fixSection(`entries[${i}]`, copy);
    return copy;
  });

  const plans = raw.weekPlans as Obj;
  const cleanPlans: Obj = {};
  for (const [wk, p] of Object.entries(plans)) {
    if (!isObj(p) || !isDateKey(p.weekStart) || p.weekStart !== wk || !isNum(p.dailyGoalMinutes) || !isWeekdays(p.restDays) ||
      !Array.isArray(p.goals) || !isObj(p.sectionByDay) || !Array.isArray(p.blocks) || !isStr(p.reviewNote) ||
      !isIso(p.createdAt) || !isIso(p.updatedAt)) {
      errors.push(`weekPlans[${wk}] is missing required fields.`);
      continue;
    }
    const goals = (p.goals as unknown[]).filter((g, i): g is Goal => {
      const ok = isObj(g) && isStr(g.id) && (
        (g.kind === 'totalHours' && isNum(g.targetMinutes)) ||
        (g.kind === 'courseHours' && isStr(g.courseId) && isNum(g.targetMinutes)) ||
        (g.kind === 'sectionsCompleted' && (g.courseId === null || isStr(g.courseId)) && isNum(g.targetCount)) ||
        (g.kind === 'dailyGoalDays' && isNum(g.targetCount)));
      if (!ok) errors.push(`weekPlans[${wk}].goals[${i}] is invalid.`);
      else if ('courseId' in g && g.courseId && !courseIds.has(g.courseId as string)) errors.push(`weekPlans[${wk}].goals[${i}] references unknown course.`);
      return ok;
    });
    const sbd: Record<string, string | null> = {};
    for (const [d, sid] of Object.entries(p.sectionByDay as Obj)) {
      if (sid !== null && !isStr(sid)) { errors.push(`weekPlans[${wk}].sectionByDay[${d}] is invalid.`); continue; }
      if (sid && !sectionCourse.has(sid)) { warnings.push(`weekPlans[${wk}] assigned a missing section on ${d}; it was cleared.`); sbd[d] = null; }
      else sbd[d] = sid;
    }
    const blocks = (p.blocks as unknown[]).map((b, i) => {
      if (!isObj(b) || !isStr(b.id) || !isDateKey(b.date) || !isNum(b.startMin) || !isNum(b.endMin) || !isStr(b.courseId) || !isStr(b.label ?? '')) {
        errors.push(`weekPlans[${wk}].blocks[${i}] is invalid.`);
        return b;
      }
      if (!courseIds.has(b.courseId)) errors.push(`weekPlans[${wk}].blocks[${i}] references unknown course.`);
      const copy = { ...b, label: b.label ?? '', sectionId: b.sectionId ?? null };
      fixSection(`weekPlans[${wk}].blocks[${i}]`, copy);
      return copy;
    });
    cleanPlans[wk] = { ...p, goals, sectionByDay: sbd, blocks };
  }

  let activeTimer = raw.activeTimer as Obj | null;
  if (activeTimer) {
    if (!isStr(activeTimer.courseId) || !isIso(activeTimer.startedAt) || !isStr(activeTimer.note ?? '')) errors.push('activeTimer is invalid.');
    else if (!courseIds.has(activeTimer.courseId)) errors.push('activeTimer references unknown course.');
    else {
      activeTimer = { ...activeTimer, note: activeTimer.note ?? '', sectionId: activeTimer.sectionId ?? null };
      fixSection('activeTimer', activeTimer);
    }
  }
  if (errors.length) return errors;

  return {
    schemaVersion: 1,
    settings: raw.settings as AppData['settings'],
    courses: courses as AppData['courses'],
    sections: sections as AppData['sections'],
    entries: cleanEntries as AppData['entries'],
    weekPlans: cleanPlans as AppData['weekPlans'],
    activeTimer: activeTimer as AppData['activeTimer'],
  };
}
