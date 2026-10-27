import type { SceneId } from '../../domain/types';

export type ScenePhase = 'focus' | 'paused' | 'complete' | 'break' | 'open';

export interface SceneInitOptions {
  reducedMotion: boolean;
  colorScheme: 'light' | 'dark';
  accent: string;
}

/** FOCUS_PLAN §6.3. Progress meaning per phase: focus/open/paused = sun progress;
 *  complete = overtime moon progress (overtime / 60 min); break = break progress. */
export interface SceneEngine {
  mount(canvas: HTMLCanvasElement, opts: SceneInitOptions): void;
  setProgress(p: number): void;
  /** `instant` skips the completion sequence (e.g. restoring an old completion after reload). */
  setPhase(phase: ScenePhase, opts?: { instant?: boolean }): void;
  resize(width: number, height: number, dpr: number): void;
  setRunning(running: boolean): void;
  setReducedMotion(reduced: boolean): void;
  destroy(): void;
}

export interface SceneInfo {
  id: SceneId;
  label: string;
  description: string;
  create(): SceneEngine;
}
