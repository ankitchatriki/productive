import { formatDuration } from '../domain/time';

export interface Segment { key: string; color: string; minutes: number; label: string }

/** Course-segmented bar of logged time against a goal; the remainder is the track. */
export function SegmentBar({ segments, goal, met, label }: { segments: Segment[]; goal: number; met: boolean; label: string }) {
  const total = segments.reduce((s, x) => s + x.minutes, 0);
  const scale = Math.max(goal, total, 1);
  return (
    <div className="segbar" role="img" aria-label={label} style={{ background: met ? 'var(--ontrack)' : undefined }}>
      {segments.filter((s) => s.minutes > 0).map((s) => (
        <span key={s.key} tabIndex={0} title={`${s.label} ${formatDuration(s.minutes)}`} aria-label={`${s.label} ${formatDuration(s.minutes)}`}
          style={{ width: `${(s.minutes / scale) * 100}%`, background: s.color }} />
      ))}
    </div>
  );
}
