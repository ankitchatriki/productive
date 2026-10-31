import { Link } from 'react-router-dom';
import styles from '../TodayPage.module.css';
import { colorVar } from '../../domain/colors';
import { minToHHMM } from '../../domain/time';
import type { AppData, ScheduledBlock } from '../../domain/types';

/** Up next (ROUND3_PLAN §2.4): today's current and upcoming planned blocks. Not rendered when empty. */
export function UpNextCard({ rows, data, weekStart }: { rows: Array<{ block: ScheduledBlock; state: 'now' | 'next' }>; data: AppData; weekStart: string }) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 4);
  return (
    <section className={`card ${styles.upNext}`} aria-labelledby="upnext-h">
      <div className={styles.logHead}>
        <h2 id="upnext-h" className={styles.logTitle}>Up next</h2>
        <span className="spacer" />
        <Link to={`/plan/${weekStart}`} className="small">Plan →</Link>
      </div>
      <ul className={styles.upList}>
        {shown.map(({ block, state }) => {
          const course = data.courses.find((c) => c.id === block.courseId);
          const section = block.sectionId ? data.sections.find((s) => s.id === block.sectionId) : undefined;
          return (
            <li key={block.id} className={styles.upRow} data-now={state === 'now' || undefined}>
              <span className={`num ${styles.logRange}`}>{minToHHMM(block.startMin)}–{minToHHMM(block.endMin)}</span>
              <span className="dot" style={{ background: colorVar(course?.color) }} aria-hidden="true" />
              <span className="truncate">{course?.name ?? 'Course'}{section ? ` · ${section.title}` : block.label ? ` · ${block.label}` : ''}</span>
              {state === 'now' && <span className="chip chip-today">Now</span>}
            </li>
          );
        })}
      </ul>
      {rows.length > shown.length && <Link to={`/plan/${weekStart}`} className="small">+{rows.length - shown.length} more</Link>}
    </section>
  );
}
