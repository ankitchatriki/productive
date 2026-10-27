import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import styles from './TodayPage.module.css';
import { useDispatch, useStore } from '../state/store';
import { useUi } from '../state/ui';
import { useNow } from '../hooks/useNow';
import { useToast } from '../hooks/useToast';
import { useHotkeys } from '../hooks/useHotkeys';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { allIntervals, intervalsOnDate, minutesBySection, minutesInDates, minutesOnDate } from '../domain/aggregate';
import { createWeekPlan, dailyGoalFor, findCarryOver, isRestDate, shiftPlanFrom } from '../domain/plan';
import { colorVar } from '../domain/colors';
import { formatClock, formatDay, formatDuration, formatElapsed, toDateKey, weekDates, weekStartOf } from '../domain/time';
import { streaksAt } from '../state/selectors';
import { StartCard } from './today/StartCard';
import { LogCard } from './today/LogCard';
import { Icon } from '../components/Icon';

const LONG_RUN_MIN = 10 * 60;

export function TodayPage() {
  useDocumentTitle('Today');
  const data = useStore();
  const dispatch = useDispatch();
  const ui = useUi();
  const toast = useToast();
  const now = useNow(1000);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [dismissTick, setDismissTick] = useState(0);
  void dismissTick;

  const today = toDateKey(now);
  const ws = weekStartOf(today);
  const plan = data.weekPlans[ws];
  const minuteNow = Math.floor(now.getTime() / 60000);
  const running = !!data.activeTimer;
  const secondKey = running ? Math.floor(now.getTime() / 1000) : minuteNow;
  const intervals = useMemo(() => allIntervals(data, new Date(secondKey * (running ? 1000 : 60000))), [data, secondKey, running]); // eslint-disable-line react-hooks/exhaustive-deps
  const todayIntervals = useMemo(() => intervalsOnDate(intervals, today), [intervals, today]);
  const courseById = useMemo(() => new Map(data.courses.map((c) => [c.id, c])), [data.courses]);
  const sectionById = useMemo(() => new Map(data.sections.map((s) => [s.id, s])), [data.sections]);
  const todayMinutes = minutesOnDate(intervals, today);
  const goal = dailyGoalFor(today, data);
  const rest = isRestDate(today, data);

  // Week chip + streak chip
  const dates = weekDates(ws);
  const weekMinutes = minutesInDates(intervals, dates);
  const weekGoal = dates.reduce((s, d) => s + (isRestDate(d, data) ? 0 : dailyGoalFor(d, data)), 0);
  const studyDays = dates.filter((d) => !isRestDate(d, data));
  const elapsedStudy = studyDays.filter((d) => d < today).length;
  const expected = weekGoal * (elapsedStudy / Math.max(1, studyDays.length));
  const weekStatus = weekMinutes > weekGoal * 1.1 && weekGoal > 0 ? 'over' : weekMinutes >= expected ? 'ontrack' : 'behind';
  // Review S8: no "Behind" before a single study day of the week has passed (unless already over).
  const weekJudged = elapsedStudy > 0 || weekStatus === 'over';
  const streak = useMemo(() => streaksAt(data, new Date(minuteNow * 60000)).current, [data, minuteNow]);

  // Section of the day
  const todaySectionId = plan?.sectionByDay[today] ?? null;
  const todaySection = todaySectionId ? sectionById.get(todaySectionId) : undefined;
  const sectionLogged = useMemo(() => (todaySectionId ? minutesBySection(intervals)[todaySectionId] ?? 0 : 0), [intervals, todaySectionId]);

  // Banners: storage error is global; here 10h > carry-over (one row, "1 more" toggles).
  const carry = useMemo(() => findCarryOver(data, today), [data, today]);
  const dismissKey = carry ? `productive:dismissed:${carry.sectionId}:${today}` : '';
  let dismissed = false;
  try { dismissed = !!dismissKey && sessionStorage.getItem(dismissKey) === '1'; } catch { /* storage blocked */ }
  const carrySection = carry ? sectionById.get(carry.sectionId) : undefined;
  const longRunMs = data.activeTimer ? now.getTime() - Date.parse(data.activeTimer.startedAt) : 0;

  const markDone = (id: string, done: boolean) => {
    dispatch({ type: 'section/setDone', id, done, now: new Date().toISOString() });
    const title = sectionById.get(id)?.title ?? 'Section';
    if (done) toast.show(`"${title}" marked done.`, { label: 'Undo', onClick: () => dispatch({ type: 'section/setDone', id, done: false, now: new Date().toISOString() }) });
  };
  const doItToday = () => {
    if (!carry) return;
    const base = plan ?? createWeekPlan(ws, data.settings, new Date().toISOString());
    const { dropped } = shiftPlanFrom(base, today, carry.sectionId);
    dispatch({ type: 'plan/shiftFrom', date: today, sectionId: carry.sectionId });
    ui.setDraft(null);
    if (dropped.length) toast.show(dropped.map((id) => `"${sectionById.get(id)?.title ?? 'Section'}"`).join(', ') + ' moved off this week.');
    else toast.show(`"${carrySection?.title ?? 'Section'}" is today's section.`);
  };
  const dismissCarry = () => {
    try { sessionStorage.setItem(dismissKey, '1'); } catch { /* ignore */ }
    setDismissTick((x) => x + 1);
  };

  useHotkeys({ d: () => { if (todaySection && !todaySection.completedAt) markDone(todaySection.id, true); } });

  if (!data.settings.onboarded && data.courses.length === 0) return <Navigate to="/welcome" replace />;

  const banners: JSX.Element[] = [];
  if (data.activeTimer && longRunMs >= LONG_RUN_MIN * 60000) {
    banners.push(
      <div key="long" className={`banner banner-behind ${styles.banner}`} role="alert">
        <Icon name="alert" />
        <span className="banner-text truncate">Timer has been running <span className="num">{formatDuration(Math.floor(longRunMs / 60000))}</span> — still studying?</span>
        <button type="button" className="btn btn-sm" onClick={() => ui.openEntry({ fromTimer: true })}>Stop at last activity…</button>
      </div>,
    );
  }
  if (carry && carrySection && !dismissed) {
    banners.push(
      <div key="carry" className={`banner banner-behind ${styles.banner}`} role="region" aria-label="Unfinished section">
        <Icon name="alert" />
        <span className="banner-text truncate">"{carrySection.title}" (planned {formatDay(carry.date).slice(0, 3)}) isn't finished.</span>
        <button type="button" className="btn btn-sm" onClick={doItToday}>Do it today</button>
        <button type="button" className="btn btn-sm" onClick={() => markDone(carrySection.id, true)}>Mark done</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={dismissCarry}>Dismiss</button>
      </div>,
    );
  }
  const shownBanner = banners.length ? banners[bannerIdx % banners.length] : null;

  // Today key number segments (course colours, log order)
  const order: string[] = [];
  const mins = new Map<string, number>();
  for (const i of todayIntervals) {
    const m = Math.round((i.clipEnd.getTime() - i.clipStart.getTime()) / 60000);
    if (!mins.has(i.courseId)) order.push(i.courseId);
    mins.set(i.courseId, (mins.get(i.courseId) ?? 0) + m);
  }
  const segments = order.map((id) => ({ key: id, color: colorVar(courseById.get(id)?.color), minutes: mins.get(id) ?? 0, label: courseById.get(id)?.name ?? 'Course' }));

  const t = data.activeTimer;
  const readout = t ? formatElapsed(now.getTime() - Date.parse(t.startedAt)) : null;

  return (
    <div className={styles.today}>
      <header className={styles.head}>
        <h1 className={`page-title ${styles.title}`}>Today <span className={styles.date}>{formatDay(today)}</span></h1>
        <div className={styles.chips}>
          <Link to="/timecard" className={`chip ${weekJudged ? `chip-${weekStatus}` : ''} ${styles.headChip}`} title="This week, logged / goal">
            Week <span className="num">{formatDuration(weekMinutes)} / {formatDuration(weekGoal)}</span>
            {weekJudged && <><span aria-hidden="true">·</span> {weekStatus === 'ontrack' ? 'On track' : weekStatus === 'over' ? 'Over' : 'Behind'}</>}
          </Link>
          {streak > 0 && <span className={`chip ${styles.headChip}`} title="Days in a row you hit your daily goal. Rest days don't break it.">{streak}-day streak</span>}
          <Link to="/plan" className={styles.planLink}>Plan →</Link>
        </div>
      </header>

      {shownBanner && (
        <div className={styles.bannerRow}>
          {shownBanner}
          {banners.length > 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setBannerIdx((i) => i + 1)}>{banners.length - 1} more</button>}
        </div>
      )}

      <StartCard
        running={running}
        readout={readout}
        clockedInSince={t ? formatClock(t.startedAt) : null}
        todayMinutes={todayMinutes}
        goal={goal}
        rest={rest}
        segments={segments}
        todaySection={todaySection}
        sectionLogged={sectionLogged}
        onMarkDone={markDone}
        todayKey={today}
        weekStart={ws}
      />

      <LogCard intervals={todayIntervals} todayMinutes={todayMinutes} />
    </div>
  );
}
