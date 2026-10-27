import { useEffect, useState } from 'react';

/** Re-render every `ms` milliseconds; returns the current Date. */
export function useNow(ms = 1000, enabled = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms, enabled]);
  return now;
}
