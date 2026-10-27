import { useEffect } from 'react';

interface WakeLockSentinelLike { release(): Promise<void>; addEventListener?(t: string, cb: () => void): void }

/** Best-effort screen wake lock while `active`; silently does nothing where unsupported. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wl) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      wl.request('screen').then((s) => { if (cancelled) s.release().catch(() => {}); else sentinel = s; }).catch(() => {});
    };
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible' && !sentinel) acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
