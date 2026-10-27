import { useEffect, useRef, useState } from 'react';
import { FallbackRing } from './FallbackRing';
import { SCENES } from './scenes';
import type { ClimbInput, SceneEngine, ScenePhase } from './scenes/types';
import type { SceneId } from '../domain/types';

export interface SceneCanvasProps {
  sceneId: SceneId;
  phase: ScenePhase;
  progress: number;
  completedAt: string | null;
  reducedMotion: boolean;
  running: boolean;
  accent: string;
  /** Where the climber is on the never-ending mountain (scenes that draw it follow it). */
  climb?: ClimbInput;
}

let loggedFailure = false;

/** Scene host (FOCUS_PLAN §6.3): owns the canvas size, feeds progress/phase, falls back to a ring on engine failure. */
export function SceneCanvas({ sceneId, phase, progress, completedAt, reducedMotion, running, accent, climb }: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SceneEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const debug = typeof location !== 'undefined' && location.search.includes('scene-debug');
  const [debugP, setDebugP] = useState<number | null>(null);
  const shownProgress = debugP ?? progress;
  // The debug slider also scrubs the climber along the current climb.
  const shownClimb = climb && debugP !== null && (phase === 'focus' || phase === 'open' || phase === 'paused')
    ? { ...climb, posM: climb.stageStartM + debugP * climb.stageLenM } : climb;
  const latest = useRef({ phase, progress, completedAt, reducedMotion, running, climb: shownClimb });
  latest.current = { phase, progress, completedAt, reducedMotion, running, climb: shownClimb };

  // Create / replace the engine when the scene changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setFailed(false);
    let engine: SceneEngine;
    try {
      engine = SCENES[sceneId].create();
      engine.mount(canvas, { reducedMotion: latest.current.reducedMotion, colorScheme: 'dark', accent });
      const r = canvas.getBoundingClientRect();
      engine.resize(r.width || window.innerWidth, r.height || window.innerHeight, Math.min(2, window.devicePixelRatio || 1));
      engine.setProgress(latest.current.progress);
      if (latest.current.climb) engine.setClimb?.(latest.current.climb);
      engine.setPhase(latest.current.phase, { instant: true });
      engine.setRunning(latest.current.running);
    } catch (err) {
      if (!loggedFailure) { console.warn('Focus scene failed; showing a simple ring instead.', err); loggedFailure = true; }
      setFailed(true);
      return;
    }
    engineRef.current = engine;
    (window as unknown as { __sceneStats?: unknown }).__sceneStats = (engine as unknown as { stats?: unknown }).stats;
    let t: number | null = null;
    const ro = new ResizeObserver((entries) => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        const e = entries[entries.length - 1];
        engine.resize(e.contentRect.width, e.contentRect.height, Math.min(2, window.devicePixelRatio || 1));
      }, 100);
    });
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      if (t) window.clearTimeout(t);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId]);

  useEffect(() => { engineRef.current?.setProgress(shownProgress); }, [shownProgress]);
  // Before the phase effect: a new climb must be known when the phase changes (next climb vs. keep climbing).
  const climbKey = shownClimb ? `${shownClimb.stage}|${shownClimb.stageStartM}|${shownClimb.stageLenM}|${shownClimb.posM.toFixed(3)}|${shownClimb.fromSummit}|${shownClimb.summits}|${shownClimb.atSummit}` : '';
  useEffect(() => { if (shownClimb) engineRef.current?.setClimb?.(shownClimb); }, [climbKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const live = phase !== 'complete' || !completedAt || Date.now() - Date.parse(completedAt) <= 6000;
    engineRef.current?.setPhase(phase, { instant: !live });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  useEffect(() => { engineRef.current?.setRunning(running); }, [running]);
  useEffect(() => { engineRef.current?.setReducedMotion(reducedMotion); }, [reducedMotion]);

  if (failed) return <FallbackRing progress={progress} phase={phase} />;
  return (
    <>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {debug && (
        <input type="range" min={0} max={1} step={0.001} value={shownProgress} aria-label="Scene progress (debug)"
          onChange={(e) => setDebugP(Number(e.target.value))}
          style={{ position: 'absolute', left: 24, right: 24, top: 80, zIndex: 5, pointerEvents: 'auto' }} />
      )}
    </>
  );
}
