import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './WeekCard.module.css';
import { STATUS_CHIP, STATUS_LABEL, goalText } from '../../domain/goals';
import { WEEKDAY_LETTER, WEEKDAY_SHORT, addDays, formatDay, formatDuration, weekdayOf } from '../../domain/time';
import type { DayCell, WeekProgress } from '../../domain/weekProgress';

const STATE_TEXT: Record<DayCell['state'], string> = { future: 'not yet', hit: 'goal met', today: 'in progress', rest: 'rest day', short: 'under goal', empty: 'nothing logged' };
const STREAK_TIP = "Days in a row you hit your daily goal. Rest days don't break it.";

function shortRange(ws: string) {
  const a = formatDay(ws).split(' ').slice(1).join(' ');
  const b = formatDay(addDays(ws, 6)).split(' ').slice(1).join(' ');
  return `${a} – ${b}`;
}

/** "This week" card (ROUND3_PLAN §1, ROUND3_DESIGN §4.3). Pure view of a WeekProgress. */
export function WeekCard({ w, courseName, compact = false }: { w: WeekProgress; courseName: (id: string) => string | undefined; compact?: boolean }) {
  const [details, setDetails] = useState(false);
  const ws = w.weekStart;
  const met = w.target > 0 && w.total >= w.target;

  let pace = '';
  if (w.target > 0) {
    if (met) pace = w.over > 0 ? `+${formatDuration(w.over)} over` : 'Target met';
    else if (w.firstDay && w.perDay !== null) pace = `Week starts today · ${formatDuration(w.perDay)}/day`;
    else if (w.daysLeft === 0) pace = `${formatDuration(w.remaining)} short`;
    else if (w.perDay !== null) pace = `${formatDuration(w.remaining)} to go · ${formatDuration(w.perDay)}/day for ${w.daysLeft} day${w.daysLeft === 1 ? '' : 's'}`;
  }
  const streak = w.streak.current > 0 ? `${w.streak.current}-day streak · best ${w.streak.best}` : w.streak.best > 0 ? `No streak · best ${w.streak.best}` : '';
  const shownGoals = w.goals.slice(0, compact ? 2 : 3);
  const moreGoals = w.goals.length - shownGoals.length;
  const endLinks = (w.lastDay || (met && w.lastDay)) && (
    <span className={styles.endLinks}>
      <Link to={`/review/${ws}`}>Review week →</Link>
      <Link to={`/plan/${addDays(ws, 7)}`}>Plan next week →</Link>
    </span>
  );

  const side = (
    <div className={styles.side}>
      {w.hasPlan ? (
        <>
          <div className={styles.sideHead}>
            <span className="eyebrow">Goals</span>
            <Link to={`/plan/${ws}`} className={styles.small}>Edit goals</Link>
          </div>
          {shownGoals.length === 0 ? <p className="small muted">No goals this week.</p> : (
            <ul className={styles.goals}>
              {shownGoals.map(({ goal, progress }) => {
                const t = goalText(goal, progress, courseName);
                return (
                  <li key={goal.id} className={styles.goal}>
                    <span className="truncate">{t.name} <span className="num muted">{t.value}</span></span>
                    <span className={`chip ${STATUS_CHIP[progress.status]} ${styles.chipSm}`}>{t.chip}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className={styles.sideFoot}>
            {moreGoals > 0 && <Link to={`/review/${ws}`} className={styles.small}>+{moreGoals} more</Link>}
            {w.sections && <Link to={`/plan/${ws}`} className={styles.small}>Sections <span className="num">{w.sections.done} / {w.sections.assigned}</span> done</Link>}
          </div>
        </>
      ) : (
        <div className={styles.noPlan}>
          <p className="small muted">No plan for this week yet.</p>
          <Link to={`/plan/${ws}`} className="btn btn-sm">Plan week →</Link>
        </div>
      )}
    </div>
  );

  return (
    <section className={`card ${styles.card} ${compact ? styles.compact : ''}`} aria-labelledby="week-h">
      <header className={styles.head}>
        <h2 id="week-h" className={`eyebrow ${styles.title}`}>
          <Link to={`/review/${ws}`}>This week</Link> <span className={styles.range}>· {shortRange(ws)}</span>
        </h2>
        {streak && <span className={styles.streak} title={STREAK_TIP}>{streak}</span>}
      </header>

      <div className={styles.body}>
        <div className={styles.main}>
          <div className={styles.totalRow}>
            <p className={styles.total}>
              <span className="num">{formatDuration(w.total)}</span>
              {w.target > 0 && <span className={`num ${styles.target}`}> / {formatDuration(w.target)}</span>}
            </p>
            {w.status && <span className={`chip ${STATUS_CHIP[w.status]}`}>{STATUS_LABEL[w.status]}</span>}
            {!compact && pace && <span className={`small muted ${styles.pace}`}>{pace}</span>}
          </div>
          <ol className={styles.days} aria-label="Hours per day this week against the daily goal">
            {w.days.map((d) => {
              const wd = weekdayOf(d.date);
              const goalRef = d.rest ? (w.days.find((x) => !x.rest)?.goal ?? 0) : d.goal;
              const ratio = goalRef > 0 ? Math.min(1, d.minutes / goalRef) : d.minutes > 0 ? 1 : 0;
              const live = d.isToday && w.liveMinutes > 0 && goalRef > 0 ? Math.min(ratio, w.liveMinutes / goalRef) : 0;
              const label = `${WEEKDAY_SHORT[wd]} ${formatDay(d.date).split(' ').slice(1).join(' ')}: ${formatDuration(d.minutes)}${d.rest ? '' : ` of ${formatDuration(d.goal)}`}, ${STATE_TEXT[d.state]}${d.isToday && d.state === 'hit' ? ', today' : ''}. Open timecard`;
              return (
                <li key={d.date}>
                  <Link to={`/timecard/${ws}`} className={styles.day} data-state={d.state} data-today={d.isToday || undefined} data-rest={d.rest || undefined} aria-label={label}>
                    <span className={styles.track} aria-hidden="true">
                      <span className={styles.fill} style={{ height: `${ratio * 100}%` }} />
                      {live > 0 && <span className={styles.live} style={{ height: `${live * 100}%` }} />}
                    </span>
                    {!compact && <span className={`num ${styles.val}`} aria-hidden="true">{d.state === 'future' ? '—' : d.rest && d.minutes === 0 ? 'Rest' : formatDuration(d.minutes)}</span>}
                    <span className={styles.letter} aria-hidden="true">{WEEKDAY_LETTER[wd]}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
          {!w.hasPlan && !compact && <p className={`xs muted ${styles.defaultNote}`}>Default target (no plan)</p>}
        </div>
        {!compact && <div className={styles.rule} aria-hidden="true" />}
        {!compact && side}
      </div>
      {compact && (
        <>
          <button type="button" className={`btn btn-ghost btn-sm ${styles.details}`} aria-expanded={details} onClick={() => setDetails((v) => !v)}>
            {details ? 'Hide details' : 'Details'}
          </button>
          {details && (
            <div className={styles.detailsBody}>
              {pace && <p className="small muted">{pace}</p>}
              {!w.hasPlan && <p className="xs muted">Default target (no plan)</p>}
              {side}
            </div>
          )}
        </>
      )}
      {endLinks}
    </section>
  );
}
