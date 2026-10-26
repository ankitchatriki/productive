import { Link, useNavigate } from 'react-router-dom';
import styles from './TimerPill.module.css';
import { useStore } from '../state/store';
import { useNow } from '../hooks/useNow';
import { formatElapsed } from '../domain/time';
import { colorVar } from '../domain/colors';
import { Icon } from './Icon';

export function TimerPill({ onStop }: { onStop: () => void }) {
  const data = useStore();
  const now = useNow(1000);
  const navigate = useNavigate();
  const t = data.activeTimer;
  if (!t) return null;
  const course = data.courses.find((c) => c.id === t.courseId);
  const section = t.sectionId ? data.sections.find((s) => s.id === t.sectionId) : undefined;
  const elapsed = formatElapsed(now.getTime() - Date.parse(t.startedAt));
  const label = [course?.name, section?.title].filter(Boolean).join(' · ');
  return (
    <div className={styles.pill} style={{ ['--c' as string]: colorVar(course?.color) }}>
      <button type="button" className={styles.body} onClick={() => navigate('/')} aria-label={`Timer running ${elapsed}, ${label}. Go to Today`}>
        <span className={styles.time}><span className={styles.pulse} aria-hidden="true" /><span className={styles.long}>{elapsed}</span><span className={styles.short}>{elapsed.slice(0, -3)}</span></span>
        <span className={`${styles.label} truncate`}>{label}</span>
      </button>
      <button type="button" className={`btn btn-clockout btn-icon ${styles.stop}`} onClick={onStop} aria-label="Clock out">
        <Icon name="stop" size={14} />
      </button>
    </div>
  );
}

/** Shown in the sidebar slot when no timer runs. */
export function TimerIdle({ label, onClockIn }: { label: string | null; onClockIn: () => void }) {
  return (
    <div className={styles.idle}>
      {label ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClockIn} title={`Clock in to ${label}`} aria-label={`Clock in to ${label}`}>
          <Icon name="play" size={12} /> <span className="truncate">Clock in</span>
        </button>
      ) : (
        <Link to="/plan" className="btn btn-ghost btn-sm"><Icon name="calendar" size={14} /> <span className="subtle">No section today</span></Link>
      )}
    </div>
  );
}
