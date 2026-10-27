interface ProgressBarProps {
  value: number;
  max: number;
  /** Fill colour (CSS value). Defaults to accent; turns --behind when `warnOver` and value > max. */
  color?: string;
  warnOver?: boolean;
  /** Position (0–1) of the pace/plan tick. */
  tick?: number | null;
  large?: boolean;
  label: string;
}

export function ProgressBar({ value, max, color, warnOver, tick, large, label }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const over = max > 0 && value > max;
  const fill = over && warnOver ? 'var(--behind)' : color ?? 'var(--accent)';
  return (
    <div
      className={`bar ${large ? 'bar-lg' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(1, Math.round(max))}
      aria-valuenow={Math.round(Math.min(value, Math.max(max, 0)))}
    >
      <div className="bar-fill" style={{ width: `${ratio * 100}%`, background: fill }} />
      {tick != null && tick > 0 && tick < 1 && <div className="bar-tick" style={{ left: `calc(${tick * 100}% - 1px)` }} aria-hidden="true" />}
    </div>
  );
}
