import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import styles from './TodayPage.module.css';
import { useDispatch, useStore } from '../state/store';
import { useUi } from '../state/ui';
import { useNow } from '../hooks/useNow';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { allIntervals, dayTotals, intervalsOnDate, minutesOnDate } from '../domain/aggregate';
import { dailyGoalFor, isRestDate } from '../domain/plan';
import { colorVar } from '../domain/colors';
import { WEEKDAY_LETTER, formatClock, formatDay, formatDuration, formatElapsed, toDateKey, weekDates, weekStartOf } from '../domain/time';
import { ProgressRing, type RingSegment } from '../components/ProgressRing';
import { CoursePicker } from '../components/CoursePicker';
import { SectionPicker } from '../components/SectionPicker';
import { Icon } from '../components/Icon';

const LONG_RUN_MIN = 10 * 60;

export function TodayPage() {
  useDocumentTitle('Today');
  const data = useStore();
  const dispatch = useDispatch();
  const ui = useUi();
  const now = useNow(1000);
  void dispatch;

  const today = toDateKey(now);
  const ws = weekStartOf(today);
  const timer = data.activeTimer;
  const running = !!timer;
  const hasCourses = data.courses.some((c) => !c.archived);
  const courseById = useMemo(() => new Map(data.courses.map((c) => [c.id, c])), [data.courses]);
  const sectionById = useMemo(() => new Map(data.sections.map((s) => [s.id, s])), [data.sections]);

  // Recomputed every tick while running (cheap), otherwise only on data change.
  const minuteKey = running ? Math.floor(now.getTime() / 1000) : 0;
  const intervals = useMemo(() => allIntervals(data, now), [data, minuteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const todayIntervals = useMemo(() => intervalsOnDate(intervals, today), [intervals, today]);
  const todayMinutes = minutesOnDate(intervals, today);
  const goal = dailyGoalFor(today, data);
  const rest = isRestDate(today, data);
  const toGo = Math.max(0, goal - todayMinutes);

  const segments: RingSegment[] = useMemo(() => {
    const order: string[] = [];
    const mins = new Map<string, number>();
    for (const i of todayIntervals) {
      const m = Math.round((i.clipEnd.getTime() - i.clipStart.getTime()) / 60000);
      if (!mins.has(i.courseId)) order.push(i.courseId);
      mins.set(i.courseId, (mins.get(i.courseId) ?? 0) + m);
    }
    return order.map((id) => ({ key: id, color: colorVar(courseById.get(id)?.color), minutes: mins.get(id) ?? 0 }));
  }, [todayIntervals, courseById]);

  const ringStatus = rest ? 'Rest day' : todayMinutes >= goal ? 'Goal hit ✓' : `${formatDuration(toGo)} to go`;
  const week = dayTotals(intervals, ws);
  const weekGoal = weekDates(ws).reduce((s, d) => s + (isRestDate(d, data) ? 0 : dailyGoalFor(d, data)), 0);
  const weekTotal = week.reduce((a, b) => a + b, 0);

  const target = running ? { courseId: timer.courseId, sectionId: timer.sectionId, note: timer.note } : ui.effectiveTarget;
  const targetCourse = target ? courseById.get(target.courseId) : undefined;
  const targetSection = target?.sectionId ? sectionById.get(target.sectionId) : undefined;
  const elapsedMs = timer ? now.getTime() - Date.parse(timer.startedAt) : 0;
  const longRun = timer && elapsedMs >= LONG_RUN_MIN * 60000;

  const setDraft = (patch: Partial<{ courseId: string; sectionId: string | null; note: string }>) => {
    const base = ui.effectiveTarget ?? { courseId: '', sectionId: null, note: '' };
    ui.setDraft({ ...base, ...patch });
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Today</h1>
          <p className="page-sub">
            <time dateTime={today}>{formatDay(today)}</time> · <span className="num">{formatDuration(todayMinutes)}</span> logged
            {rest ? ' · rest day' : todayMinutes >= goal ? ' · goal hit' : <> · <span className="num">{formatDuration(toGo)}</span> to go</>}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => ui.openEntry({ date: today })} disabled={!hasCourses}><Icon name="plus" /> Add entry</button>
        </div>
      </div>

      {longRun && (
        <div className="banner banner-behind" role="alert">
          <Icon name="alert" />
          <span className="banner-text">Timer has been running <span className="num">{formatDuration(Math.floor(elapsedMs / 60000))}</span> — still studying?</span>
          <button type="button" className="btn btn-sm" onClick={() => ui.openEntry({ fromTimer: true })}>Stop at last activity…</button>
        </div>
      )}

      <div className={styles.row1}>
        <section className={`card ${styles.timer}`} style={{ ['--c' as string]: colorVar(targetCourse?.color) }} aria-labelledby="timer-heading">
          {running ? (
            <>
              <h2 id="timer-heading" className={`eyebrow ${styles.eyebrowRunning}`}><span className={styles.livedot} aria-hidden="true" /> Clocked in since {formatClock(timer.startedAt)}</h2>
              <div>
                <div className={styles.course}>{targetCourse?.name}</div>
                <div className={styles.section}>{targetSection?.title ?? 'General'}{timer.note ? ` · ${timer.note}` : ''}</div>
              </div>
            </>
          ) : (
            <>
              <h2 id="timer-heading" className="eyebrow">Today's section</h2>
              {hasCourses ? (
                <div className={styles.pickers}>
                  <div className="field">
                    <label htmlFor="today-course">Course</label>
                    <CoursePicker id="today-course" data={data} value={target?.courseId ?? ''} onChange={(id) => setDraft({ courseId: id, sectionId: null })} />
                  </div>
                  <div className="field">
                    <label htmlFor="today-section">Section</label>
                    <SectionPicker id="today-section" data={data} courseId={target?.courseId ?? ''} value={target?.sectionId ?? null} onChange={(id) => setDraft({ sectionId: id })} />
                  </div>
                  <div className={`field ${styles.noteField}`}>
                    <label htmlFor="today-note">Note</label>
                    <input id="today-note" className="input" value={ui.draft?.note ?? ''} placeholder="What are you working on? (optional)" onChange={(e) => setDraft({ note: e.target.value })} />
                  </div>
                </div>
              ) : (
                <p className="muted">Add a course to start tracking. <Link to="/courses">Go to Courses</Link></p>
              )}
            </>
          )}

          <div className={`${styles.readout} ${running ? styles.running : ''}`} aria-live="off">{formatElapsed(elapsedMs)}</div>
          {running && <p className={styles.sub}>this session · <span className="num">{formatDuration(todayMinutes)}</span> today</p>}

          <div className={styles.actions}>
            <div className={styles.actionCol}>
              {running ? (
                <button type="button" className={`btn btn-lg btn-clockout ${styles.clockBtn}`} onClick={ui.toggleTimer}><Icon name="stop" /> Clock out</button>
              ) : (
                <button type="button" className={`btn btn-lg btn-primary ${styles.clockBtn}`} onClick={ui.toggleTimer} disabled={!hasCourses || !target}><Icon name="play" /> Clock in</button>
              )}
              <kbd className={styles.hint}>Space</kbd>
            </div>
            {running && (
              <div className={styles.actionCol}>
                <button type="button" className="btn btn-lg" onClick={ui.openSwitch}>Switch section</button>
                <kbd className={styles.hint}>S</kbd>
              </div>
            )}
          </div>
        </section>

        <section className={`card ${styles.ringCard}`} aria-label="Progress towards today's goal">
          <ProgressRing segments={segments} goalMinutes={goal} restDay={rest} statusLabel={ringStatus} />
          {segments.length > 0 && (
            <ul className={styles.legend}>
              {segments.map((s) => (
                <li key={s.key}><span className="dot" style={{ background: s.color }} />{courseById.get(s.key)?.name} <span className="num muted">{formatDuration(s.minutes)}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className={styles.row2}>
        <section className="card" aria-labelledby="logged-heading" style={{ gridColumn: '1 / -1' }}>
          <div className="card-head">
            <h2 id="logged-heading" className="section-title">Logged today</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => ui.openEntry({ date: today })} disabled={!hasCourses}><Icon name="plus" /> Add entry</button>
          </div>
          {todayIntervals.length === 0 ? (
            <p className="muted">{hasCourses ? <>No time logged today. Press <kbd>Space</kbd> to clock in.</> : 'Add a course to start tracking.'}</p>
          ) : (
            <ul className={styles.entries}>
              {todayIntervals.map((i) => {
                const course = courseById.get(i.courseId);
                const section = i.sectionId ? sectionById.get(i.sectionId) : undefined;
                const entry = i.entryId ? data.entries.find((e) => e.id === i.entryId) : undefined;
                const mins = Math.round((i.clipEnd.getTime() - i.clipStart.getTime()) / 60000);
                return (
                  <li key={i.entryId ?? 'running'} className={styles.entry} style={{ ['--c' as string]: colorVar(course?.color) }}>
                    <span className={`${styles.range} num`}>
                      {i.continuesBefore && <span className={styles.cont} title="Started the previous day">↩ </span>}
                      {formatClock(i.clipStart)}–{i.entryId ? formatClock(i.clipEnd) : 'now'}
                      {i.continuesAfter && <span className={styles.cont}> ↪ continues</span>}
                    </span>
                    <span className={styles.what}>
                      <span className="truncate">{course?.name}{section ? ` · ${section.title}` : ''}</span>
                      {entry?.note && <span className={`${styles.note} truncate`}>{entry.note}</span>}
                    </span>
                    <span className={`${styles.dur} num`}>{formatDuration(mins)}</span>
                    {entry ? (
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => ui.openEntry({ entry })} aria-label={`Edit entry ${formatClock(i.clipStart)} ${course?.name ?? ''}`}><Icon name="pencil" /></button>
                    ) : (
                      <span className="chip chip-ontrack">● Live</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className={`card ${styles.full}`} aria-labelledby="week-heading">
        <div className="card-head">
          <h2 id="week-heading" className="section-title">This week</h2>
          <Link to="/timecard" className="small">View timecard →</Link>
        </div>
        <div className={styles.week}>
          <ol className={styles.days}>
            {weekDates(ws).map((d, idx) => {
              const g = dailyGoalFor(d, data);
              const isRest = isRestDate(d, data);
              const m = week[idx];
              const h = Math.min(1, g > 0 ? m / g : 0);
              return (
                <li key={d} className={`${styles.day} ${d === today ? styles.today : ''}`} title={`${formatDay(d)}: ${formatDuration(m)} of ${formatDuration(g)}${isRest ? ' (rest day)' : ''}`}>
                  <div className={`${styles.col} ${isRest ? styles.rest : ''}`} role="img" aria-label={`${formatDay(d)}: ${formatDuration(m)} logged of ${formatDuration(g)}${isRest ? ', rest day' : ''}`}>
                    <div className={`${styles.colFill} ${m >= g ? styles.hit : ''}`} style={{ height: `${h * 100}%` }} />
                  </div>
                  <span aria-hidden="true">{WEEKDAY_LETTER[idx]}</span>
                </li>
              );
            })}
          </ol>
          <div className={styles.weekSum}>
            <span><span className={styles.big}>{formatDuration(weekTotal)}</span> <span className="muted num">/ {formatDuration(weekGoal)}</span></span>
          </div>
        </div>
      </section>
    </div>
  );
}
