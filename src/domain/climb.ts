// The climber on the never-ending mountain (ROUND3_ART §6): block start/finish/clock-out bookkeeping and the live
// climb derived from focused time. Pure: the clock comes in as arguments.
import type { FocusSession, MountainState } from './types';
import { OPEN_LOOP_MS, blockMs, focusedMs } from './focus';
import { M_PER_H, MOUNTAIN_SEED, PACE_M, SUMMIT_TO_COL, buildStage, stageRise, type StageGeom, type StageSpec } from './mountain';

export const defaultMountain = (): MountainState => ({
  seed: MOUNTAIN_SEED, stage: 0, posM: 0, altM: 0, stageStartM: 0, stageStartAltM: 0, fromSummit: false, atSummit: false, summits: 0,
});

/** What a scene needs to draw the climb (plus the altitude for the HUD). */
export interface Climb {
  stage: number;
  stageStartM: number;
  stageLenM: number;
  posM: number;
  fromSummit: boolean;
  summits: number;
  altM: number;
  stageStartAltM: number;
  /** The climber stands on this climb's summit (block complete, or a +N extension from it). */
  atSummit: boolean;
}

const cache = new Map<string, StageGeom>();
/** Stage geometry, cached (a few are live at once: the current climb and its predecessor). */
export function stageGeom(spec: StageSpec): StageGeom {
  const key = `${spec.stage}|${spec.startH.toFixed(4)}|${spec.lenH.toFixed(4)}|${spec.fromSummit}`;
  let g = cache.get(key);
  if (!g) {
    g = buildStage(spec);
    cache.set(key, g);
    if (cache.size > 6) cache.delete(cache.keys().next().value as string);
  }
  return g;
}

const specOf = (stage: number, startM: number, lenM: number, fromSummit: boolean): StageSpec =>
  ({ stage, startH: startM / M_PER_H, lenH: Math.max(0.5, lenM / M_PER_H), fromSummit });

/** Altitude (m) at posM on a climb. */
export function altitudeOn(stage: number, startM: number, startAltM: number, lenM: number, fromSummit: boolean, posM: number): number {
  const g = stageGeom(specOf(stage, startM, lenM, fromSummit));
  return startAltM + stageRise(g, (posM - startM) / M_PER_H) * M_PER_H;
}

/** How long an open-ended block's hourly summit is held before the next climb (review U8). */
export const MINI_SUMMIT_MS = 8000;

const lenFor = (s: FocusSession): number => (blockMs(s) ?? OPEN_LOOP_MS) * PACE_M / 1000;
const roundM = (m: number) => Math.round(m * 1000) / 1000;

/** A block starts: the next climb begins where the climber is, or in the col beyond the last summit. */
export function beginClimb(m: MountainState): MountainState {
  if (m.atSummit) {
    const lenM = Math.max(0, m.posM - m.stageStartM);
    const colM = m.posM + SUMMIT_TO_COL * M_PER_H;
    const colAlt = altitudeOn(m.stage, m.stageStartM, m.stageStartAltM, lenM, m.fromSummit, colM);
    return { ...m, stage: m.stage + 1, fromSummit: true, atSummit: false, stageStartM: roundM(colM), stageStartAltM: roundM(colAlt), posM: roundM(colM), altM: roundM(colAlt) };
  }
  return { ...m, stage: m.stage + 1, fromSummit: false, atSummit: false, stageStartM: m.posM, stageStartAltM: m.altM };
}

/** The live climb for a focus session at a moment (open-ended blocks climb one summit per 60 focused minutes). */
export function liveClimb(m: MountainState, s: FocusSession, now: Date): Climb {
  const f = focusedMs(s, now);
  const lenM = lenFor(s);
  if (blockMs(s) !== null) {
    const posM = m.stageStartM + Math.min(f, blockMs(s)!) * PACE_M / 1000;
    return { stage: m.stage, stageStartM: m.stageStartM, stageLenM: lenM, posM, fromSummit: m.fromSummit, summits: m.summits, stageStartAltM: m.stageStartAltM, altM: altitudeOn(m.stage, m.stageStartM, m.stageStartAltM, lenM, m.fromSummit, posM), atSummit: false };
  }
  // Each hour's summit is held for MINI_SUMMIT_MS (the mini summit beat) before the next climb begins.
  const kRaw = Math.floor(f / OPEN_LOOP_MS);
  const onTop = kRaw >= 1 && f - kRaw * OPEN_LOOP_MS < MINI_SUMMIT_MS;
  const k = onTop ? kRaw - 1 : kRaw;
  let start = m.stageStartM, startAlt = m.stageStartAltM, from = m.fromSummit;
  for (let i = 0; i < k; i++) {
    const col = start + lenM + SUMMIT_TO_COL * M_PER_H;
    startAlt = altitudeOn(m.stage + i, start, startAlt, lenM, from, col);
    start = col; from = true;
  }
  const posM = start + Math.min(OPEN_LOOP_MS, f - k * OPEN_LOOP_MS) * PACE_M / 1000;
  return { stage: m.stage + k, stageStartM: start, stageLenM: lenM, posM, fromSummit: from, summits: m.summits + k + (onTop ? 1 : 0), stageStartAltM: startAlt, altM: altitudeOn(m.stage + k, start, startAlt, lenM, from, posM), atSummit: onTop };
}

/** Persist the live position (clock out, pause, a break mid-block, the 60 s save): progress is kept, never lost. */
export function foldClimb(m: MountainState, s: FocusSession, now: Date): MountainState {
  if (m.atSummit) return m; // an extension from the summit: he stays on it (overtime and extensions add no distance)
  const c = liveClimb(m, s, now);
  return { ...m, stage: c.stage, stageStartM: c.stageStartM, stageStartAltM: roundM(c.stageStartAltM), fromSummit: c.fromSummit, summits: c.summits, posM: roundM(c.posM), altM: roundM(c.altM), atSummit: c.atSummit };
}

/** The block completed: the climber is at this climb's end (the summit). */
export function summitClimb(m: MountainState, s: FocusSession): MountainState {
  if (m.atSummit) return m; // an extension from the summit ending: this summit was already counted
  const lenM = lenFor(s);
  const posM = m.stageStartM + lenM;
  return { ...m, posM: roundM(posM), altM: roundM(altitudeOn(m.stage, m.stageStartM, m.stageStartAltM, lenM, m.fromSummit, posM)), atSummit: true, summits: m.summits + 1 };
}

/** The climb a scene should draw now (complete/break show the reached summit; no session shows where he stands). */
export function climbFor(m: MountainState, s: FocusSession | null, now: Date): Climb {
  if (s && (s.phase === 'focus' || s.phase === 'paused') && !m.atSummit) return liveClimb(m, s, now);
  // At the summit (complete, overtime, a +N extension from it, a break): the reached climb, unchanged.
  const lenM = m.atSummit ? Math.max(0.9, m.posM - m.stageStartM) : s ? lenFor(s) : Math.max(0.9, m.posM - m.stageStartM);
  return { stage: m.stage, stageStartM: m.stageStartM, stageLenM: lenM, posM: m.posM, fromSummit: m.fromSummit, summits: m.summits, altM: m.altM, stageStartAltM: m.stageStartAltM, atSummit: m.atSummit };
}
