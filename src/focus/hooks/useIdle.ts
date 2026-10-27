import { useEffect, useRef, useState } from 'react';

/** True after `ms` without pointer movement (>4px), key presses or touches. */
export function useIdle(ms: number, enabled = true): boolean {
  const [idle, setIdle] = useState(false);
  const timer = useRef<number | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!enabled) { setIdle(false); return; }
    const arm = () => {
      setIdle(false);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setIdle(true), ms);
    };
    const onMove = (e: PointerEvent) => {
      const p = last.current;
      if (p && Math.abs(e.clientX - p.x) < 4 && Math.abs(e.clientY - p.y) < 4) return;
      last.current = { x: e.clientX, y: e.clientY };
      arm();
    };
    arm();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm, true);
    window.addEventListener('touchstart', arm);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm, true);
      window.removeEventListener('touchstart', arm);
    };
  }, [ms, enabled]);
  return idle;
}
