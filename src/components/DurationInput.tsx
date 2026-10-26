import { useEffect, useState } from 'react';
import { formatDuration } from '../domain/time';
import { parseHours } from '../domain/sections';

/** Parse "1:30", "1.5", "90m", "1h30", "2h". Returns minutes or null. */
export function parseDurationInput(v: string): number | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  const m1 = /^(\d+)\s*m(in)?$/.exec(s);
  if (m1) return Number(m1[1]);
  const m2 = /^(\d+)\s*h\s*(\d{1,2})\s*m?$/.exec(s);
  if (m2) return Number(m2[1]) * 60 + Number(m2[2]);
  return parseHours(s);
}

interface DurationInputProps {
  id?: string;
  value: number | null;
  onCommit: (minutes: number | null) => void;
  allowEmpty?: boolean;
  step?: number; // minutes for −/+ buttons; omit for no stepper
  min?: number;
  max?: number;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

export function DurationInput({ id, value, onCommit, allowEmpty, step, min = 0, max = 24 * 60 * 7, placeholder, ariaLabel, className }: DurationInputProps) {
  const [text, setText] = useState(value == null ? '' : formatDuration(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setText(value == null ? '' : formatDuration(value)); setInvalid(false); }, [value]);

  const commit = () => {
    if (!text.trim()) {
      if (allowEmpty) { onCommit(null); setInvalid(false); }
      else { setText(value == null ? '' : formatDuration(value)); }
      return;
    }
    const m = parseDurationInput(text);
    if (m === null || m < min || m > max) { setInvalid(true); return; }
    setInvalid(false);
    setText(formatDuration(m));
    if (m !== value) onCommit(m);
  };
  const bump = (d: number) => {
    const next = Math.min(max, Math.max(min, (value ?? 0) + d));
    onCommit(next);
  };
  const input = (
    <input
      id={id}
      className={`input input-num ${className ?? ''}`}
      value={text}
      inputMode="decimal"
      placeholder={placeholder ?? '0:00'}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      title={invalid ? 'Enter hours like 1:30 or 1.5.' : undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
    />
  );
  if (!step) return input;
  return (
    <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => bump(-step)} aria-label={`Decrease ${ariaLabel ?? 'hours'}`}>−</button>
      {input}
      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => bump(step)} aria-label={`Increase ${ariaLabel ?? 'hours'}`}>+</button>
    </div>
  );
}
