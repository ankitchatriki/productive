import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDays, isValidDateKey, toDateKey, weekStartOf } from '../domain/time';
import type { WeekKey } from '../domain/types';
import { useHotkeys } from './useHotkeys';

/**
 * Week from `:weekStart` (default: current week). Non-Monday dates are normalised
 * to their Monday with replace navigation; invalid ones go to the base route.
 * Also wires `[`, `]` and `T`.
 */
export function useWeekParam(base: string): { weekStart: WeekKey; currentWeek: WeekKey; go: (w: WeekKey) => void } {
  const { weekStart: param } = useParams();
  const navigate = useNavigate();
  const currentWeek = weekStartOf(toDateKey(new Date()));
  const valid = isValidDateKey(param);
  const weekStart = valid ? weekStartOf(param) : currentWeek;

  useEffect(() => {
    if (param === undefined) return;
    if (!valid) navigate(base, { replace: true });
    else if (weekStart !== param) navigate(`${base}/${weekStart}`, { replace: true });
  }, [param, valid, weekStart, base, navigate]);

  const go = (w: WeekKey) => navigate(w === currentWeek ? base : `${base}/${w}`);
  useHotkeys({
    '[': () => go(addDays(weekStart, -7)),
    ']': () => go(addDays(weekStart, 7)),
    t: () => go(currentWeek),
  });
  return { weekStart, currentWeek, go };
}
