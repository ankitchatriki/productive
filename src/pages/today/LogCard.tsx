import { useState } from 'react';
import styles from '../TodayPage.module.css';
import { useStore } from '../../state/store';
import { useUi } from '../../state/ui';
import { useMediaQuery, PHONE_QUERY } from '../../hooks/useMediaQuery';
import { colorVar } from '../../domain/colors';
import { formatClock, formatDuration } from '../../domain/time';
import type { intervalsOnDate } from '../../domain/aggregate';
import { Icon } from '../../components/Icon';

type Row = ReturnType<typeof intervalsOnDate>[number];

/** Log card: today's entries; natural height, no inner scroll. */
export function LogCard({ intervals, todayMinutes }: { intervals: Row[]; todayMinutes: number }) {
  const data = useStore();
  const ui = useUi();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [showAll, setShowAll] = useState(false);
  const hasCourses = data.courses.some((c) => !c.archived);
  // The card grows with its rows and the page scrolls (ROUND3_PLAN §2.5): phone shows the last 3, desktop the last 12.
  const limit = isPhone ? 3 : 12;
  const rows = !showAll ? intervals.slice(-limit) : intervals;

  const entryCount = intervals.filter((i) => i.entryId).length + (intervals.some((i) => !i.entryId) ? 1 : 0);
  return (
    <section className={`card ${styles.log}`} aria-labelledby="log-h">
      <div className={styles.logHead}>
        <h2 id="log-h" className={styles.logTitle}>Log</h2>
        <span className="num small muted">{formatDuration(todayMinutes)} · {entryCount} {entryCount === 1 ? 'entry' : 'entries'}</span>
        <span className="spacer" />
        <button type="button" className="btn btn-sm" onClick={() => ui.openEntry({})} disabled={!hasCourses}><Icon name="plus" /> Add <kbd className={styles.inKbd}>N</kbd></button>
      </div>
      <div className={styles.logBody}>
        {intervals.length === 0 ? (
          <div className={styles.logEmpty}>
            <p className="muted">Nothing logged yet. The boulder is waiting.</p>
            <button type="button" className="btn btn-sm" onClick={() => ui.openEntry({})} disabled={!hasCourses}><Icon name="plus" /> Add entry</button>
          </div>
        ) : (
          <ul className={styles.logList}>
            {rows.map((i) => {
              const course = data.courses.find((c) => c.id === i.courseId);
              const section = i.sectionId ? data.sections.find((s) => s.id === i.sectionId) : undefined;
              const entry = i.entryId ? data.entries.find((e) => e.id === i.entryId) : undefined;
              const mins = Math.round((i.clipEnd.getTime() - i.clipStart.getTime()) / 60000);
              const open = () => { if (entry) ui.openEntry({ entry }); };
              const label = `${formatClock(i.clipStart)} to ${entry ? formatClock(i.clipEnd) : 'now'}, ${course?.name ?? ''}${section ? `, ${section.title}` : ''}, ${formatDuration(mins)}`;
              return (
                <li key={i.entryId ?? 'live'}>
                  <div className={`${styles.logRow} ${entry ? '' : styles.liveRow}`} role={entry ? 'button' : undefined} tabIndex={entry ? 0 : undefined}
                    aria-label={entry ? `${label}. Edit entry` : `${label} (running)`}
                    onClick={open} onKeyDown={(e) => { if (entry && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } }}>
                    <span className={`num ${styles.logRange}`}>{i.continuesBefore ? '↩ ' : ''}{formatClock(i.clipStart)}–{entry ? formatClock(i.clipEnd) : 'now'}</span>
                    <span className="dot" style={{ background: colorVar(course?.color) }} />
                    <span className={`truncate ${styles.logWhat}`}>{course?.name}{section ? ` · ${section.title}` : ''}</span>
                    {entry?.note ? <span className={`truncate muted xs ${styles.logNote}`}>{entry.note}</span> : <span className={styles.logNote} />}
                    <span className={`num ${styles.logDur}`}>{formatDuration(mins)}</span>
                    {entry ? <span className={styles.logEdit} aria-hidden="true"><Icon name="pencil" size={14} /></span> : <span className={styles.liveDot} aria-hidden="true" />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!showAll && intervals.length > limit && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll(true)}>Show all ({intervals.length})</button>
        )}
      </div>
    </section>
  );
}
