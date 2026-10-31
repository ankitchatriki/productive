import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import styles from './TodayPage.module.css';
import { useDispatch, useStore } from '../state/store';
import { useUi } from '../state/ui';
import { useNow } from '../hooks/useNow';
import { useToast } from '../hooks/useToast';
import { useHotkeys } from '../hooks/useHotkeys';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { allIntervals, intervalsOnDate, minutesBySection, minutesOnDate } from '../domain/aggregate';
import { createWeekPlan, dailyGoalFor, findCarryOver, isRestDate, shiftPlanFrom, todayBlocks } from '../domain/plan';
import { colorVar } from '../domain/colors';
import { formatClock, formatDay, formatDuration, formatElapsed, minuteOfDay, toDateKey, weekStartOf } from '../domain/time';
import { weekProgressAt } from '../state/selectors';
import { StartCard } from './today/StartCard';
import { LogCard } from './today/LogCard';
import { WeekCard } from './today/WeekCard';
import { UpNextCard } from './today/UpNextCard';
import { useMediaQuery, PHONE_QUERY } from '../hooks/useMediaQuery';
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

  // This week card (ROUND3_PLAN §1): recomputed when data changes or once a minute.
  const week = useMemo(() => weekProgressAt(data, new Date()), [data, minuteNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const isPhone = useMediaQuery(PHONE_QUERY);
  const upNext = useMemo(() => todayBlocks(plan, today, minuteOfDay(new Date(minuteNow * 60000))), [plan, today, minuteNow]);

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
      </header>

      {shownBanner && (
        <div className={styles.bannerRow}>
          {shownBanner}
          {banners.length > 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setBannerIdx((i) => i + 1)}>{banners.length - 1} more</button>}
        </div>
      )}

      <WeekCard w={week} courseName={(id) => courseById.get(id)?.name} compact={isPhone} />

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

      <div className={styles.side}>
        <UpNextCard rows={upNext} data={data} weekStart={ws} />
        <LogCard intervals={todayIntervals} todayMinutes={todayMinutes} />
      </div>
    </div>
  );
}
