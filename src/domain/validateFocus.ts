// Repair-first validation for focus settings and sessions (FOCUS_PLAN.md §4.4).
import type { ActiveTimer, BlockChoice, FocusSession, FocusSettings, MotionPref } from './types';
import { defaultFocusSettings } from '../storage/defaults';
import { isSceneId } from '../focus/scenes/ids';
import { focusInvariantErrors } from './focus';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isIsoOrNull = (v: unknown) => v === null || isIso(v);
const MOTIONS: MotionPref[] = ['system', 'full', 'reduced'];

function isBlockChoice(v: unknown): v is BlockChoice {
  if (!isObj(v)) return false;
  if (v.kind === 'preset') return v.minutes === 25 || v.minutes === 50 || v.minutes === 90;
  if (v.kind === 'custom') return isInt(v.minutes) && v.minutes >= 5 && v.minutes <= 240;
  return v.kind === 'planned' || v.kind === 'open';
}

/** Any bad field falls back to its default, with a warning. */
export function repairFocusSettings(raw: unknown, warnings: string[]): FocusSettings {
  const d: FocusSettings = { ...defaultFocusSettings, lastChoice: { ...defaultFocusSettings.lastChoice } };
  if (!isObj(raw)) {
    warnings.push('settings.focus was missing and was reset to defaults.');
    return d;
  }
  const out = { ...d };
  const fix = <K extends keyof FocusSettings>(k: K, ok: boolean) => {
    if (ok) (out as Record<string, unknown>)[k] = raw[k];
    else warnings.push(`settings.focus.${k} was invalid and was reset.`);
  };
  fix('defaultBlockMinutes', isInt(raw.defaultBlockMinutes) && raw.defaultBlockMinutes >= 5 && raw.defaultBlockMinutes <= 240);
  fix('lastChoice', isBlockChoice(raw.lastChoice));
  fix('askBlockEachTime', typeof raw.askBlockEachTime === 'boolean');
  fix('enterOnClockIn', typeof raw.enterOnClockIn === 'boolean');
  fix('breakMinutes', isInt(raw.breakMinutes) && raw.breakMinutes >= 1 && raw.breakMinutes <= 60);
  fix('chime', typeof raw.chime === 'boolean');
  fix('scene', isSceneId(raw.scene));
  fix('motion', MOTIONS.includes(raw.motion as MotionPref));
  if (out.lastChoice) out.lastChoice = { ...(out.lastChoice as BlockChoice) };
  return out;
}

/**
 * Returns the cleaned session, or null (dropped, with a warning) when it is
 * malformed, points at an unknown course or breaks an invariant.
 */
export function validateFocusSession(
  raw: Obj, courseIds: Set<string>, sectionCourse: Map<string, string>, activeTimer: ActiveTimer | null, warnings: string[],
): FocusSession | null {
  const drop = () => { warnings.push('Focus session was inconsistent and was cleared.'); return null; };
  const t = raw.target;
  const choices = ['preset', 'custom', 'planned', 'open'];
  const phases = ['focus', 'paused', 'complete', 'break'];
  if (typeof raw.id !== 'string' || !isObj(t) || typeof t.courseId !== 'string' || typeof (t.note ?? '') !== 'string') return drop();
  if (!courseIds.has(t.courseId)) return drop();
  if (!choices.includes(raw.choice as string) || !phases.includes(raw.phase as string)) return drop();
  if (!(raw.blockMinutes === null || (isInt(raw.blockMinutes) && raw.blockMinutes >= 1 && raw.blockMinutes <= 480))) return drop();
  if (!isIso(raw.blockStartedAt) || typeof raw.focusedMsBefore !== 'number' || !Number.isFinite(raw.focusedMsBefore) || raw.focusedMsBefore < 0) return drop();
  for (const k of ['segmentStartedAt', 'completedAt', 'pausedAt', 'breakStartedAt', 'breakEndsAt']) if (!isIsoOrNull(raw[k])) return drop();
  if (!(raw.breakMinutes === null || (typeof raw.breakMinutes === 'number' && raw.breakMinutes > 0))) return drop();
  if (!isInt(raw.blocksCompleted) || raw.blocksCompleted < 0) return drop();
  if (!isSceneId(raw.scene) || typeof raw.immersive !== 'boolean') return drop();
  let sectionId = (t.sectionId ?? null) as string | null;
  if (sectionId !== null && (typeof sectionId !== 'string' || sectionCourse.get(sectionId) !== t.courseId)) {
    warnings.push('Focus session referenced a missing section; it was cleared.');
    sectionId = null;
  }
  const session = { ...(raw as unknown as FocusSession), target: { courseId: t.courseId, sectionId, note: (t.note ?? '') as string } };
  if (focusInvariantErrors(session, activeTimer).length) return drop();
  return session;
}
