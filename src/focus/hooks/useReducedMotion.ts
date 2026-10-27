import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { MotionPref } from '../../domain/types';

/** Effective reduced motion: 'reduced' forces it, 'full' overrides the OS, 'system' follows it. */
export function useReducedMotion(pref: MotionPref): boolean {
  const os = useMediaQuery('(prefers-reduced-motion: reduce)');
  return pref === 'reduced' || (pref === 'system' && os);
}
