// Import validation (PLAN.md §4.10).
import type { AppData, FocusSession, Goal, Weekday } from './types';
import { migrate } from './migrate';
import { repairFocusSettings, validateFocusSession } from './validateFocus';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isPos = (v: unknown): v is number => isNum(v) && v > 0;

/** Report ids that appear more than once in a list. */
function checkDuplicateIds(list: unknown[], label: string, errors: string[]) {
  const seen = new Set<string>();
  list.forEach((x, i) => {
    if (!isObj(x) || !isStr(x.id)) return;
    if (seen.has(x.id)) errors.push(`${label}[${i}] has a duplicate id ${x.id}.`);
    seen.add(x.id);
  });
}
const isIso = (v: unknown) => isStr(v) && !Number.isNaN(Date.parse(v));
const isDateKey = (v: unknown) => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isWeekdays = (v: unknown): v is Weekday[] => Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);

/**
 * Returns a cleaned AppData, or a list of error messages. Dangling sectionIds
 * are set to null and reported in `warnings`.
 */
export function validateAppData(input: unknown, warnings: string[] = []): AppData | string[] {
  const errors: string[] = [];
  const raw = migrate(input);
  if (!isObj(raw)) return ['File is not a StruggleMore backup (expected a JSON object).'];
  if (raw.schemaVersion !== 2) errors.push(`Unsupported schemaVersion: ${JSON.stringify(raw.schemaVersion)} (expected 1 or 2).`);

  const s = raw.settings;
  if (!isObj(s)) errors.push('settings is missing.');
  else {
    if (!isNum(s.dailyGoalMinutes) || s.dailyGoalMinutes < 1 || s.dailyGoalMinutes > 1440) errors.push('settings.dailyGoalMinutes must be between 1 and 1440 minutes.');
    if (!isWeekdays(s.restDays)) errors.push('settings.restDays must be a list of weekdays 0–6.');
    if (!isInt(s.gridStartHour) || !isInt(s.gridEndHour) || s.gridStartHour < 0 || s.gridEndHour > 24 || s.gridStartHour >= s.gridEndHour) {
      errors.push('settings.gridStartHour/gridEndHour must be whole hours with 0 ≤ start < end ≤ 24.');
    }
    if (!isBool(s.onboarded)) errors.push('settings.onboarded must be true or false.');
  }

  for (const key of ['courses', 'sections', 'entries'] as const) {
    if (!Array.isArray(raw[key])) errors.push(`${key} must be a list.`);
  }
  if (!isObj(raw.weekPlans)) errors.push('weekPlans must be an object.');
  if (raw.activeTimer !== null && !isObj(raw.activeTimer)) errors.push('activeTimer must be null or an object.');
  if (raw.focus !== undefined && raw.focus !== null && !isObj(raw.focus)) errors.push('focus must be null or an object.');
  if (errors.length) return errors;

  const courses = raw.courses as unknown[];
  const sections = raw.sections as unknown[];
  const entries = raw.entries as unknown[];
  checkDuplicateIds(courses, 'courses', errors);
  checkDuplicateIds(sections, 'sections', errors);
  checkDuplicateIds(entries, 'entries', errors);
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

  // Entries are a timesheet: no double billing (review R6).
  const timed = cleanEntries
    .map((e, i) => ({ i, e: e as Obj }))
    .filter(({ e }) => isObj(e) && isIso(e.start) && isIso(e.end))
    .sort((a, b) => Date.parse(a.e.start as string) - Date.parse(b.e.start as string));
  let latest: { i: number; end: number } | null = null;
  for (const { i, e } of timed) {
    const start = Date.parse(e.start as string);
    if (latest && start < latest.end) errors.push(`entries[${i}] overlaps entries[${latest.i}].`);
    const end = Date.parse(e.end as string);
    if (!latest || end > latest.end) latest = { i, end };
  }

  const plans = raw.weekPlans as Obj;
  const cleanPlans: Obj = {};
  for (const [wk, p] of Object.entries(plans)) {
    if (!isObj(p) || !isDateKey(p.weekStart) || p.weekStart !== wk || !isNum(p.dailyGoalMinutes) || !isWeekdays(p.restDays) ||
      !Array.isArray(p.goals) || !isObj(p.sectionByDay) || !Array.isArray(p.blocks) || !isStr(p.reviewNote) ||
      !isIso(p.createdAt) || !isIso(p.updatedAt)) {
      errors.push(`weekPlans[${wk}] is missing required fields.`);
      continue;
    }
    const seenGoal = new Set<string>();
    const goals = (p.goals as unknown[]).filter((g, i): g is Goal => {
      const ok = isObj(g) && isStr(g.id) && (
        (g.kind === 'totalHours' && isPos(g.targetMinutes)) ||
        (g.kind === 'courseHours' && isStr(g.courseId) && isPos(g.targetMinutes)) ||
        (g.kind === 'sectionsCompleted' && (g.courseId === null || isStr(g.courseId)) && isPos(g.targetCount)) ||
        (g.kind === 'dailyGoalDays' && isPos(g.targetCount)));
      // A broken goal is dropped with a warning rather than rejecting the whole file (review R9).
      if (!ok) { warnings.push(`weekPlans[${wk}].goals[${i}] was invalid and was removed.`); return false; }
      if ('courseId' in g && g.courseId && !courseIds.has(g.courseId as string)) { warnings.push(`weekPlans[${wk}].goals[${i}] referenced a missing course and was removed.`); return false; }
      if (seenGoal.has(g.id as string)) { errors.push(`weekPlans[${wk}].goals[${i}] has a duplicate id.`); return false; }
      seenGoal.add(g.id as string);
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
      if (!isInt(b.startMin) || !isInt(b.endMin) || b.startMin % 15 || b.endMin % 15 || b.startMin < 0 || b.endMin > 1440 || b.endMin <= b.startMin) {
        errors.push(`weekPlans[${wk}].blocks[${i}] must start and end on 15-minute steps within the day.`);
      }
      const copy = { ...b, label: b.label ?? '', sectionId: b.sectionId ?? null };
      fixSection(`weekPlans[${wk}].blocks[${i}]`, copy);
      return copy;
    });
    checkDuplicateIds(blocks, `weekPlans[${wk}].blocks`, errors);
    const valid = blocks.filter((b): b is Obj => isObj(b) && isDateKey(b.date) && isInt(b.startMin) && isInt(b.endMin)) as Array<Obj & { date: string; startMin: number; endMin: number }>;
    for (let a = 0; a < valid.length; a++) {
      for (let c = a + 1; c < valid.length; c++) {
        const x = valid[a]; const y = valid[c];
        if (x.date === y.date && x.startMin < y.endMin && y.startMin < x.endMin) errors.push(`weekPlans[${wk}] has overlapping blocks on ${x.date}.`);
      }
    }
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

  const focusSettings = repairFocusSettings((raw.settings as Obj).focus, warnings);
  const rawSplash = (raw.settings as Obj).showSplash;
  if (rawSplash !== undefined && typeof rawSplash !== 'boolean') warnings.push('settings.showSplash was not true/false; it was reset to true.');
  const showSplash = typeof rawSplash === 'boolean' ? rawSplash : true;
  let focus: FocusSession | null = null;
  if (isObj(raw.focus)) focus = validateFocusSession(raw.focus, courseIds, sectionCourse, activeTimer as AppData['activeTimer'], warnings);

  return {
    schemaVersion: 2,
    settings: { ...(raw.settings as AppData['settings']), showSplash, focus: focusSettings },
    courses: courses as AppData['courses'],
    sections: sections as AppData['sections'],
    entries: cleanEntries as AppData['entries'],
    weekPlans: cleanPlans as AppData['weekPlans'],
    activeTimer: activeTimer as AppData['activeTimer'],
    focus,
  };
}
