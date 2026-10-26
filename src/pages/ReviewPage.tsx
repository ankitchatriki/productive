import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './ReviewPage.module.css';
import { useDispatch, useStore } from '../state/store';
import { useNow } from '../hooks/useNow';
import { useWeekParam } from '../hooks/useWeekParam';
import { useMediaQuery, PHONE_QUERY } from '../hooks/useMediaQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { allIntervals, minutesByCourse, minutesByDay, weekTotals } from '../domain/aggregate';
import { computeGoalProgress, goalIsDuration } from '../domain/goals';
import { computeStreaks } from '../domain/streaks';
import { dailyGoalFor, isRestDate, plannedMinutes } from '../domain/plan';
import { colorVar } from '../domain/colors';
import { WEEKDAY_SHORT, addDays, formatDay, formatDuration, parseDateKey, toDateKey, weekDates, weekStartOf } from '../domain/time';
import type { Goal, GoalProgress } from '../domain/types';
import { WeekNav } from '../components/WeekNav';
import { BarChart } from '../components/BarChart';
import { Heatmap } from '../components/Heatmap';
import { ProgressBar } from '../components/ProgressBar';

const STATUS_LABEL: Record<GoalProgress['status'], string> = { met: 'Met', on_track: 'On track', behind: 'Behind', missed: 'Missed' };
const STATUS_CHIP: Record<GoalProgress['status'], string> = { met: 'chip-met', on_track: 'chip-ontrack', behind: 'chip-behind', missed: 'chip-missed' };
const STATUS_ICON: Record<GoalProgress['status'], string> = { met: '✓✓', on_track: '✓', behind: '⚠', missed: '–' };

export function ReviewPage() {
  useDocumentTitle('Review');
  const data = useStore();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const { weekStart, currentWeek, go } = useWeekParam('/review');
  const today = toDateKey(now);
  const dates = weekDates(weekStart);
  const plan = data.weekPlans[weekStart];
  const courseById = useMemo(() => new Map(data.courses.map((c) => [c.id, c])), [data.courses]);
  const sectionById = useMemo(() => new Map(data.sections.map((s) => [s.id, s])), [data.sections]);

  const intervals = useMemo(() => allIntervals(data, now), [data, now]);
  const byDay = useMemo(() => minutesByDay(intervals), [intervals]);
  const weekMins = dates.map((d) => byDay.get(d) ?? 0);
  const weekTotal = weekMins.reduce((a, b) => a + b, 0);
  const goalsFor = dates.map((d) => dailyGoalFor(d, data));
  const progress = useMemo(() => (plan ? plan.goals.map((g) => ({ goal: g, p: computeGoalProgress(g, plan, data, now) })) : []), [plan, data, now]);
  const met = progress.filter((x) => x.p.status === 'met').length;
  const streaks = useMemo(() => computeStreaks(data, today, now), [data, today, now]);
  const byCourse = minutesByCourse(intervals, dates);
  const courseRows = Object.entries(byCourse).sort((a, b) => b[1] - a[1]);
  const maxCourse = Math.max(1, ...courseRows.map(([, m]) => m));
  const trend = weekTotals(intervals, currentWeek, 12);
  const allTime = intervals.reduce((s, i) => s + Math.round((Date.parse(i.end) - Date.parse(i.start)) / 60000), 0);
  const elapsedDays = Math.max(1, dates.filter((d) => d <= today).length);
  const weekEnded = today > dates[6];
  const weeklyGoal = plan ? plan.dailyGoalMinutes * (7 - plan.restDays.length) : data.settings.dailyGoalMinutes * (7 - data.settings.restDays.length);

  // Sections planned vs completed.
  const prevPlan = data.weekPlans[addDays(weekStart, -7)];
  const plannedSections = plan ? dates.filter((d) => plan.sectionByDay[d]).map((d) => ({ date: d, id: plan.sectionByDay[d]! })) : [];
  const weekSet = new Set(dates);
  const doneThisWeek = data.sections.filter((s) => s.completedAt && weekSet.has(toDateKey(new Date(s.completedAt))));
  const unplannedDone = doneThisWeek.filter((s) => !plannedSections.some((p) => p.id === s.id));
  const carried = (id: string, date: string) => {
    const earlier = plannedSections.some((p) => p.id === id && p.date < date);
    const fromPrev = prevPlan ? Object.values(prevPlan.sectionByDay).includes(id) : false;
    return earlier || fromPrev;
  };

  const goalText = (g: Goal, p: GoalProgress) => {
    const fmt = (v: number) => (goalIsDuration(g) ? formatDuration(v) : String(v));
    const name = g.kind === 'totalHours' ? 'Total hours'
      : g.kind === 'courseHours' ? `Hours on ${courseById.get(g.courseId)?.name ?? 'a course'}`
      : g.kind === 'sectionsCompleted' ? `Sections completed${g.courseId ? ` · ${courseById.get(g.courseId)?.name ?? ''}` : ''}`
      : 'Days hitting daily goal';
    const chip = p.status === 'missed' && goalIsDuration(g) ? `Missed by ${formatDuration(p.target - p.current)}`
      : p.status === 'met' && goalIsDuration(g) && p.current > p.target ? `Met · +${formatDuration(p.current - p.target)} over`
      : p.status === 'behind' && goalIsDuration(g) ? `Behind` : STATUS_LABEL[p.status];
    return { name, value: `${fmt(p.current)} / ${fmt(p.target)}`, chip };
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Review</h1>
          <p className="page-sub">
            <span className="num">{formatDuration(weekTotal)}</span> of <span className="num">{formatDuration(weeklyGoal)}</span>
            {plan && plan.goals.length > 0 && <> · {met} of {plan.goals.length} goals met</>}
          </p>
        </div>
        <WeekNav weekStart={weekStart} currentWeek={currentWeek} go={go} />
      </div>

      <div className={styles.tiles}>
        <div className={styles.tile}>
          <span className="eyebrow">Logged</span>
          <span className={styles.tileValue}>{formatDuration(weekTotal)}</span>
          <span className={styles.tileSub}>this week</span>
        </div>
        <div className={styles.tile}>
          <span className="eyebrow">Daily average</span>
          <span className={styles.tileValue}>{formatDuration(Math.round(weekTotal / (weekEnded ? 7 : elapsedDays)))}</span>
          <span className={styles.tileSub}>goal {formatDuration(plan?.dailyGoalMinutes ?? data.settings.dailyGoalMinutes)}</span>
        </div>
        <div className={styles.tile} title="Days in a row you hit your daily goal. Rest days don't break it.">
          <span className="eyebrow">Current streak</span>
          <span className={styles.tileValue}>{streaks.current} <small>day{streaks.current === 1 ? '' : 's'}</small></span>
          <span className={styles.tileSub}>Best {streaks.best}</span>
        </div>
        <div className={styles.tile}>
          <span className="eyebrow">Goals met</span>
          <span className={styles.tileValue}>{met} <small>/ {plan?.goals.length ?? 0}</small></span>
          <span className={styles.tileSub}>All time <span className="num">{formatDuration(allTime)}</span></span>
        </div>
      </div>

      <section className={`card ${styles.block}`} aria-labelledby="goals-h">
        <h2 id="goals-h" className="section-title">Goal results</h2>
        {!plan || plan.goals.length === 0 ? (
          <p className="muted">No goals set for this week — <Link to={weekStart === currentWeek ? '/plan' : `/plan/${weekStart}`}>Plan it</Link>.</p>
        ) : (
          <ul className={styles.goalGrid}>
            {progress.map(({ goal, p }) => {
              const t = goalText(goal, p);
              const color = goal.kind === 'courseHours' ? colorVar(courseById.get(goal.courseId)?.color) : p.status === 'met' ? 'var(--ontrack)' : p.status === 'on_track' ? 'var(--accent)' : 'var(--behind)';
              return (
                <li key={goal.id} className={styles.goalCard}>
                  <div className={styles.goalHead}>
                    <span className={styles.goalName}>{t.name}</span>
                    <span className={`chip ${STATUS_CHIP[p.status]}`}><span aria-hidden="true">{STATUS_ICON[p.status]}</span> {t.chip}</span>
                  </div>
                  <span className={`${styles.goalValue} num`}>{t.value}</span>
                  <ProgressBar value={p.current} max={p.target} large color={color} label={`${t.name}: ${t.value}`} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className={styles.two}>
        <section className={`card ${styles.block}`} aria-labelledby="days-h">
          <h2 id="days-h" className="section-title">This week by day</h2>
          <p className="help" style={{ marginBottom: 8 }}>Solid = logged · hatched = planned · dashed line = daily goal</p>
          <BarChart
            ariaLabel="Logged minutes per day this week"
            goal={plan?.dailyGoalMinutes ?? data.settings.dailyGoalMinutes}
            goalLabel="goal"
            bars={dates.map((d, i) => ({
              key: d, label: `${WEEKDAY_SHORT[i]} ${parseDateKey(d).getDate()}`, value: weekMins[i],
              ghost: plan ? plannedMinutes(plan.blocks, d) : undefined, highlight: weekMins[i] >= goalsFor[i] && weekMins[i] > 0, current: d === today,
            }))}
          />
        </section>
        <section className={`card ${styles.block}`} aria-labelledby="courses-h">
          <h2 id="courses-h" className="section-title">By course</h2>
          {courseRows.length === 0 ? <p className="muted">No time logged this week.</p> : (
            <ul className={styles.hbars}>
              {courseRows.map(([id, m]) => {
                const c = courseById.get(id);
                return (
                  <li key={id}>
                    <span className={styles.hName}><span className="dot" style={{ background: colorVar(c?.color) }} /><span className="truncate">{c?.name}</span></span>
                    <span className={styles.hTrack}><span style={{ width: `${(m / maxCourse) * 100}%`, background: colorVar(c?.color) }} /></span>
                    <span className="num">{formatDuration(m)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className={styles.two}>
        <section className={`card ${styles.block}`} aria-labelledby="secs-h">
          <h2 id="secs-h" className="section-title">Sections: planned vs done</h2>
          {plannedSections.length === 0 && unplannedDone.length === 0 ? <p className="muted">No sections planned this week.</p> : (
            <ul className={styles.secList}>
              {plannedSections.map(({ date, id }) => {
                const s = sectionById.get(id);
                const done = !!s?.completedAt && toDateKey(new Date(s.completedAt)) <= dates[6];
                return (
                  <li key={date}>
                    <span className={done ? styles.yes : styles.no} aria-label={done ? 'Done' : date >= today ? 'Upcoming' : 'Not done'}>{done ? '✓' : date >= today ? '○' : '✗'}</span>
                    <span className="muted small">{formatDay(date).slice(0, 3)}</span>
                    <span className="truncate">{s?.title ?? 'Deleted section'}</span>
                    {carried(id, date) && <span className="chip">carried</span>}
                  </li>
                );
              })}
              {unplannedDone.map((s) => (
                <li key={s.id}>
                  <span className={styles.yes} aria-label="Done">✓</span>
                  <span className="muted small">{formatDay(toDateKey(new Date(s.completedAt!))).slice(0, 3)}</span>
                  <span className="truncate">{s.title}</span>
                  <span className="chip">unplanned</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Reflection key={weekStart} weekStart={weekStart} initial={plan?.reviewNote ?? ''} onSave={(text) => dispatch({ type: 'plan/update', weekStart, patch: { reviewNote: text }, now: new Date().toISOString() })} />
      </div>

      <h2 className={`section-title ${styles.insightsH}`}>Insights</h2>
      <section className={`card ${styles.block}`} aria-labelledby="heat-h">
        <div className="card-head">
          <h3 id="heat-h" className="card-title">Consistency</h3>
          <span className="muted small">Streak <strong className="num">{streaks.current}</strong> · best <span className="num">{streaks.best}</span> · all time <span className="num">{formatDuration(allTime)}</span></span>
        </div>
        <Heatmap
          lastWeekStart={currentWeek}
          weeks={isPhone ? 13 : 26}
          today={today}
          minutesFor={(d) => byDay.get(d) ?? 0}
          goalFor={(d) => dailyGoalFor(d, data)}
          isRest={(d) => isRestDate(d, data)}
          onSelect={(d) => navigate(`/timecard/${weekStartOf(d)}`)}
        />
      </section>
      <section className={`card ${styles.block}`} aria-labelledby="trend-h">
        <h3 id="trend-h" className="card-title" style={{ marginBottom: 12 }}>Weekly totals, last 12 weeks</h3>
        <BarChart
          ariaLabel="Weekly totals for the last 12 weeks"
          goal={weeklyGoal}
          goalLabel="weekly goal"
          height={160}
          onBarClick={(k) => go(k)}
          bars={trend.map((w) => ({ key: w.weekStart, label: formatDay(w.weekStart).slice(4), value: w.minutes, highlight: w.minutes >= weeklyGoal, current: w.weekStart === weekStart }))}
        />
      </section>
    </div>
  );
}

function Reflection({ weekStart, initial, onSave }: { weekStart: string; initial: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(true);
  const timer = useRef<number | null>(null);
  const latest = useRef({ text, saved, onSave });
  latest.current = { text, saved, onSave };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!latest.current.saved) latest.current.onSave(latest.current.text);
  }, []);
  const change = (v: string) => {
    setText(v);
    setSaved(false);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { onSave(v); setSaved(true); }, 600);
  };
  return (
    <section className={`card ${styles.block}`} aria-labelledby="refl-h">
      <div className="card-head">
        <h2 id="refl-h" className="section-title">Reflection</h2>
        <span className="subtle xs" aria-live="polite">{saved ? 'Saved' : 'Saving…'}</span>
      </div>
      <label htmlFor={`refl-${weekStart}`} className="visually-hidden">Reflection for this week</label>
      <textarea id={`refl-${weekStart}`} className="textarea" rows={6} value={text} onChange={(e) => change(e.target.value)}
        placeholder="What went well? What will you change next week?" />
      <p className="help" style={{ marginTop: 8 }}>Done reviewing? <Link to={`/plan/${addDays(weekStart, 7)}`}>Plan next week</Link></p>
    </section>
  );
}
