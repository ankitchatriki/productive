import styles from './DayTimeline.module.css';
import type { Course, Id, ScheduledBlock, Section } from '../domain/types';
import { colorVar, softVar } from '../domain/colors';
import { formatClock, formatDuration, minToHHMM, minuteOfDay } from '../domain/time';

const PX_PER_MIN = 32 / 60;

interface Piece { key: string; courseId: Id; sectionId: Id | null; clipStart: Date; clipEnd: Date; continuesAfter: boolean; continuesBefore: boolean; running: boolean }

interface DayTimelineProps {
  blocks: ScheduledBlock[];
  pieces: Piece[];
  startHour: number;
  endHour: number;
  now: Date | null;
  courses: Map<Id, Course>;
  sections: Map<Id, Section>;
}

/** Vertical day strip: planned blocks (outlined) beside logged entries (filled). */
export function DayTimeline({ blocks, pieces, startHour, endHour, now, courses, sections }: DayTimelineProps) {
  const start = startHour * 60;
  const end = endHour * 60;
  const height = (end - start) * PX_PER_MIN;
  const y = (m: number) => (Math.min(end, Math.max(start, m)) - start) * PX_PER_MIN;
  const hours: number[] = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);
  const nowMin = now ? minuteOfDay(now) : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.lanesHead} aria-hidden="true"><span /> <span>Planned</span><span>Logged</span></div>
      <div className={styles.tl} style={{ height }}>
        <div className={styles.gutter} aria-hidden="true">
          {hours.map((h) => <span key={h} style={{ top: (h - startHour) * 32 }}>{minToHHMM(h * 60)}</span>)}
        </div>
        <ul className={styles.lane} aria-label="Planned blocks">
          {blocks.map((b) => {
            const c = courses.get(b.courseId);
            const s = b.sectionId ? sections.get(b.sectionId) : undefined;
            const top = y(b.startMin);
            const h = y(b.endMin) - top;
            if (h <= 0) return null;
            const label = `${c?.name ?? ''}${s ? ` · ${s.title}` : ''}${b.label ? ` · ${b.label}` : ''}`;
            return (
              <li key={b.id} className={styles.planned} style={{ top, height: h, ['--c' as string]: colorVar(c?.color) }} title={`${minToHHMM(b.startMin)}–${minToHHMM(b.endMin)} ${label}`}>
                {h >= 20 && <span className="truncate">{c?.name}</span>}
                <span className="visually-hidden">{minToHHMM(b.startMin)} to {minToHHMM(b.endMin)}, {label}</span>
              </li>
            );
          })}
        </ul>
        <ul className={styles.lane} aria-label="Logged time">
          {pieces.map((p) => {
            const c = courses.get(p.courseId);
            const s = p.sectionId ? sections.get(p.sectionId) : undefined;
            const sm = p.continuesBefore ? 0 : minuteOfDay(p.clipStart);
            const em = p.continuesAfter ? 1440 : minuteOfDay(p.clipEnd);
            const top = y(sm);
            const h = Math.max(2, y(em) - top);
            const mins = Math.round((p.clipEnd.getTime() - p.clipStart.getTime()) / 60000);
            return (
              <li key={p.key} className={`${styles.logged} ${p.running ? styles.running : ''}`} style={{ top, height: h, ['--c' as string]: colorVar(c?.color), ['--soft' as string]: softVar(c?.color) }}
                title={`${formatClock(p.clipStart)}–${p.running ? 'now' : formatClock(p.clipEnd)} ${c?.name ?? ''}${s ? ` · ${s.title}` : ''} (${formatDuration(mins)})`}>
                {h >= 20 && <span className="truncate">{c?.name}</span>}
                {p.continuesAfter && h >= 34 && <span className={styles.cont}>↪ continues</span>}
                <span className="visually-hidden">{formatClock(p.clipStart)} to {p.running ? 'now' : formatClock(p.clipEnd)}, {c?.name}, {formatDuration(mins)}</span>
              </li>
            );
          })}
        </ul>
        {nowMin !== null && nowMin >= start && nowMin <= end && <div className={styles.now} style={{ top: y(nowMin) }} aria-hidden="true" />}
      </div>
    </div>
  );
}
