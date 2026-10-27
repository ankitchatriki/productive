import { Link, useNavigate } from 'react-router-dom';
import styles from './TimerPill.module.css';
import { useStore } from '../state/store';
import { useUi } from '../state/ui';
import { focusView } from '../state/selectors';
import { focusStateText } from '../focus/FocusStrip';
import { useNow } from '../hooks/useNow';
import { formatElapsed } from '../domain/time';
import { colorVar } from '../domain/colors';
import { Icon } from './Icon';

export function TimerPill({ onStop }: { onStop: () => void }) {
  const data = useStore();
  const now = useNow(1000);
  const navigate = useNavigate();
  const ui = useUi();
  const t = data.activeTimer;
  const view = focusView(data, now);
  if (!t && !view) return null;
  const courseId = t?.courseId ?? view!.session.target.courseId;
  const sectionId = t ? t.sectionId : view!.session.target.sectionId;
  const course = data.courses.find((c) => c.id === courseId);
  const section = sectionId ? data.sections.find((s) => s.id === sectionId) : undefined;
  const elapsed = t ? formatElapsed(now.getTime() - Date.parse(t.startedAt)) : '';
  const label = [course?.name, section?.title].filter(Boolean).join(' · ');
  const state = view ? focusStateText(view) : null;
  const goFocus = view ? () => ui.enterFocus() : () => navigate('/');
  const headline = t ? elapsed : state ?? '';
  return (
    <div className={styles.pill} style={{ ['--c' as string]: colorVar(course?.color) }}>
      <button type="button" className={styles.body} onClick={goFocus} data-focus-origin
        aria-label={view ? `Focus: ${state}, ${label}. Return to focus view` : `Timer running ${elapsed}, ${label}. Go to Today`}>
        <span className={styles.time}>
          <span className={styles.pulse} aria-hidden="true" style={view && view.phase !== 'focus' && view.phase !== 'complete' ? { animation: 'none', opacity: 0.5 } : undefined} />
          <span className={styles.long}>{headline}</span><span className={styles.short}>{t ? elapsed.slice(0, -3) : state}</span>
        </span>
        <span className={`${styles.label} truncate`}>{view && t ? `${state} · ${label}` : label}</span>
      </button>
      {t ? (
        <button type="button" className={`btn btn-clockout btn-icon ${styles.stop}`} onClick={onStop} aria-label="Clock out">
          <Icon name="stop" size={14} />
        </button>
      ) : (
        <button type="button" className={`btn btn-primary btn-icon ${styles.stop}`} onClick={onStop} aria-label={view!.phase === 'paused' ? 'Resume focus' : 'Start next block'}>
          <Icon name="play" size={14} />
        </button>
      )}
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
