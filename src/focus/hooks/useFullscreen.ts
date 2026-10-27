import { useCallback, useEffect, useState, type RefObject } from 'react';

export function useFullscreen(ref: RefObject<HTMLElement>) {
  const [isFullscreen, setFs] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
    ref.current?.requestFullscreen?.().catch(() => {});
  }, [ref]);
  const exit = useCallback(() => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); }, []);
  return { isFullscreen, toggle, exit, supported: typeof document !== 'undefined' && !!document.fullscreenEnabled };
}
