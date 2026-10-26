import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './PlanPage.module.css';
import { useDispatch, useStore } from '../state/store';
import { useToast } from '../hooks/useToast';
import { useNow } from '../hooks/useNow';
import { useWeekParam } from '../hooks/useWeekParam';
import { useMediaQuery, PHONE_QUERY } from '../hooks/useMediaQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  autoAssign, autoAssignStart, canPlaceBlock, copyBlocksFromPreviousWeek, copyGoalsFromPreviousWeek, defaultAutoAssignCourse,
  goalsAreDefault, plannedMinutes,
} from '../domain/plan';
import { defaultGoals } from '../domain/goals';
import { addDays, formatDay, formatDuration, minuteOfDay, toDateKey, weekDates, weekdayOf, WEEKDAY_SHORT } from '../domain/time';
import { sectionsOfCourse } from '../domain/sections';
import { newId } from '../domain/ids';
import type { DateKey, Goal, Id, ScheduledBlock, Weekday, WeekPlan } from '../domain/types';
import { WeekNav } from '../components/WeekNav';
import { WeekGrid } from '../components/WeekGrid';
import { BlockPopover } from '../components/BlockPopover';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DurationInput } from '../components/DurationInput';
import { Icon } from '../components/Icon';

const KIND_LABEL: Record<Goal['kind'], string> = {
  totalHours: 'Total hours',
  courseHours: 'Hours on a course',
  sectionsCompleted: 'Sections completed',
  dailyGoalDays: 'Days hitting daily goal',
};

export function PlanPage() {
  useDocumentTitle('Plan week');
  const data = useStore();
  const dispatch = useDispatch();
  const { weekStart, currentWeek, go } = useWeekParam('/plan');
  const plan = data.weekPlans[weekStart];

  useEffect(() => {
    if (!plan) dispatch({ type: 'plan/ensure', weekStart, now: new Date().toISOString() });
  }, [plan, weekStart, dispatch]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Plan week</h1>
          {plan && <PlannedSummary plan={plan} />}
        </div>
        <WeekNav weekStart={weekStart} currentWeek={currentWeek} go={go} />
      </div>
      {plan && <PlanBody key={weekStart} plan={plan} />}
    </div>
  );
}

function weeklyTarget(plan: WeekPlan) {
  return plan.dailyGoalMinutes * (7 - plan.restDays.length);
}

function PlannedSummary({ plan }: { plan: WeekPlan }) {
  const planned = plannedMinutes(plan.blocks);
  const target = weeklyTarget(plan);
  const off = target > 0 && (planned > target * 1.1 || planned < target * 0.9);
  return (
    <p className="page-sub">
      Planned <span className="num">{formatDuration(planned)}</span> / goal <span className="num">{formatDuration(target)}</span>
      {off && planned > target && <span className={styles.warn}> · ⚠ {formatDuration(planned - target)} over</span>}
      {off && planned < target && <span className={styles.warn}> · {formatDuration(target - planned)} unplanned</span>}
    </p>
  );
}

function PlanBody({ plan }: { plan: WeekPlan }) {
  const data = useStore();
  const dispatch = useDispatch();
  const toast = useToast();
  const now = useNow(60_000);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const today = toDateKey(now);
  const weekStart = plan.weekStart;
  const dates = weekDates(weekStart);
  const prevPlan = data.weekPlans[addDays(weekStart, -7)];
  const activeCourses = data.courses.filter((c) => !c.archived);
  const courseMap = useMemo(() => new Map(data.courses.map((c) => [c.id, c])), [data.courses]);
  const sectionMap = useMemo(() => new Map(data.sections.map((s) => [s.id, s])), [data.sections]);
  const stamp = () => new Date().toISOString();
  const update = (patch: Partial<Omit<WeekPlan, 'weekStart'>>) => dispatch({ type: 'plan/update', weekStart, patch, now: stamp() });

  const [confirm, setConfirm] = useState<'goals' | 'blocks' | null>(null);
  const [popover, setPopover] = useState<{ block: ScheduledBlock; isNew: boolean } | null>(null);
  const [phoneDay, setPhoneDay] = useState<DateKey>(dates.includes(today) ? today : weekStart);
  const lastCourse = useRef<Id | null>(null);
  const [autoCourse, setAutoCourse] = useState<Id | ''>(() => defaultAutoAssignCourse(data.courses, data.sections) ?? '');

  // ---------- Goals ----------
  const setDailyGoal = (m: number | null) => {
    if (m === null) return;
    const patch: Partial<WeekPlan> = { dailyGoalMinutes: m };
    if (goalsAreDefault(plan)) patch.goals = defaultGoals(weekStart, m, plan.restDays);
    update(patch);
  };
  const toggleRest = (d: Weekday) => {
    const restDays = (plan.restDays.includes(d) ? plan.restDays.filter((x) => x !== d) : [...plan.restDays, d]).sort() as Weekday[];
    if (restDays.length > 6) return;
    const patch: Partial<WeekPlan> = { restDays };
    if (goalsAreDefault(plan)) patch.goals = defaultGoals(weekStart, plan.dailyGoalMinutes, restDays);
    update(patch);
  };
  const setGoal = (id: Id, g: Goal) => update({ goals: plan.goals.map((x) => (x.id === id ? g : x)) });
  const changeKind = (g: Goal, kind: Goal['kind']) => {
    const firstCourse = activeCourses[0]?.id ?? '';
    const next: Goal =
      kind === 'totalHours' ? { id: g.id, kind, targetMinutes: weeklyTarget(plan) }
      : kind === 'courseHours' ? { id: g.id, kind, courseId: firstCourse, targetMinutes: 600 }
      : kind === 'sectionsCompleted' ? { id: g.id, kind, courseId: null, targetCount: 3 }
      : { id: g.id, kind, targetCount: 7 - plan.restDays.length };
    setGoal(g.id, next);
  };
  const addGoal = () => {
    const g: Goal = activeCourses[0]
      ? { id: newId(), kind: 'courseHours', courseId: activeCourses[0].id, targetMinutes: 600 }
      : { id: newId(), kind: 'totalHours', targetMinutes: weeklyTarget(plan) };
    update({ goals: [...plan.goals, g] });
  };
  const removeGoal = (g: Goal) => {
    const index = plan.goals.findIndex((x) => x.id === g.id);
    update({ goals: plan.goals.filter((x) => x.id !== g.id) });
    toast.show('Goal removed.', { label: 'Undo', onClick: () => dispatch({ type: 'plan/insertGoal', weekStart, goal: g, index, now: stamp() }) });
  };
  const copyGoals = () => {
    if (!prevPlan || prevPlan.goals.length === 0) { toast.show("Last week has no goals to copy."); return; }
    update({ goals: copyGoalsFromPreviousWeek(prevPlan, newId) });
    setConfirm(null);
    toast.show("Copied last week's goals.");
  };

  // ---------- Sections ----------
  const assigned = new Set(Object.values(plan.sectionByDay).filter(Boolean));
  const openSections = data.sections.filter((s) => !s.completedAt && courseMap.get(s.courseId) && !courseMap.get(s.courseId)!.archived);
  const runAutoAssign = () => {
    if (!autoCourse) return;
    const next = autoAssign(plan, data.sections, autoCourse, autoAssignStart(weekStart, today));
    const added = dates.filter((d) => next.sectionByDay[d] !== plan.sectionByDay[d]).length;
    if (!added) { toast.show('Nothing to assign — no empty study days or no unfinished sections left.'); return; }
    update({ sectionByDay: next.sectionByDay });
    toast.show(`Assigned ${added} section${added === 1 ? '' : 's'}.`);
  };
  const clearSections = () => {
    const before = plan.sectionByDay;
    const cleared = Object.fromEntries(dates.map((d) => [d, null]));
    update({ sectionByDay: cleared });
    toast.show('Section plan cleared.', { label: 'Undo', onClick: () => dispatch({ type: 'plan/fillDays', weekStart, sectionByDay: before }) });
  };

  // ---------- Blocks ----------
  const defaultCourseFor = (date: DateKey): { courseId: Id; sectionId: Id | null } | null => {
    const sid = plan.sectionByDay[date];
    const sec = sid ? sectionMap.get(sid) : undefined;
    if (sec && courseMap.get(sec.courseId) && !courseMap.get(sec.courseId)!.archived) return { courseId: sec.courseId, sectionId: sec.id };
    const remembered = lastCourse.current && courseMap.get(lastCourse.current) && !courseMap.get(lastCourse.current)!.archived ? lastCourse.current : null;
    if (remembered) return { courseId: remembered, sectionId: null };
    const lastBlock = [...plan.blocks].reverse().find((b) => courseMap.get(b.courseId) && !courseMap.get(b.courseId)!.archived);
    if (lastBlock) return { courseId: lastBlock.courseId, sectionId: null };
    const lastEntry = [...data.entries].sort((a, b) => b.end.localeCompare(a.end)).find((e) => courseMap.get(e.courseId) && !courseMap.get(e.courseId)!.archived);
    if (lastEntry) return { courseId: lastEntry.courseId, sectionId: null };
    return activeCourses[0] ? { courseId: activeCourses[0].id, sectionId: null } : null;
  };

  const createBlock = (date: DateKey, startMin: number, endMin: number) => {
    const def = defaultCourseFor(date);
    if (!def) { toast.show('Add a course first.'); return; }
    let block: ScheduledBlock = { id: newId(), date, startMin, endMin, ...def, label: '' };
    if (!canPlaceBlock(plan.blocks, block)) {
      // Fit a click-created block into the gap before the next block.
      const next = plan.blocks.filter((b) => b.date === date && b.startMin >= startMin).sort((a, b) => a.startMin - b.startMin)[0];
      if (next && next.startMin - startMin >= 15) block = { ...block, endMin: next.startMin };
      if (!canPlaceBlock(plan.blocks, block)) { toast.show("Blocks can't overlap."); return; }
    }
    dispatch({ type: 'block/upsert', weekStart, block });
  };
  const moveBlock = (b: ScheduledBlock, next: { date: DateKey; startMin: number; endMin: number }) => {
    const moved = { ...b, ...next };
    if (!canPlaceBlock(plan.blocks, moved)) { toast.show("Blocks can't overlap — moved back."); return false; }
    dispatch({ type: 'block/upsert', weekStart, block: moved });
    return true;
  };
  const deleteBlock = (b: ScheduledBlock) => {
    dispatch({ type: 'block/delete', weekStart, id: b.id });
    setPopover(null);
    toast.show('Block deleted.', { label: 'Undo', onClick: () => dispatch({ type: 'block/upsert', weekStart, block: b }) });
  };
  const saveBlock = (b: ScheduledBlock) => {
    lastCourse.current = b.courseId;
    dispatch({ type: 'block/upsert', weekStart, block: b });
    setPopover(null);
  };
  const addBlockOnPhone = () => {
    const def = defaultCourseFor(phoneDay);
    if (!def) { toast.show('Add a course first.'); return; }
    const dayBlocks = plan.blocks.filter((b) => b.date === phoneDay);
    const start = dayBlocks.length ? Math.min(1380, Math.max(...dayBlocks.map((b) => b.endMin))) : Math.max(data.settings.gridStartHour * 60, 9 * 60);
    setPopover({ isNew: true, block: { id: newId(), date: phoneDay, startMin: start, endMin: Math.min(1440, start + 60), ...def, label: '' } });
  };
  const copyBlocks = () => {
    if (!prevPlan || prevPlan.blocks.length === 0) { toast.show('Last week has no blocks to copy.'); setConfirm(null); return; }
    const before = plan.blocks;
    update({ blocks: copyBlocksFromPreviousWeek(plan, prevPlan, newId).blocks });
    setConfirm(null);
    toast.show(`Copied ${prevPlan.blocks.length} blocks from last week.`, { label: 'Undo', onClick: () => dispatch({ type: 'plan/update', weekStart, patch: { blocks: before }, now: stamp() }) });
  };

  const planned = plannedMinutes(plan.blocks);
  const studyDays = 7 - plan.restDays.length;
  const target = plan.dailyGoalMinutes * studyDays;
  const heavyDay = dates.find((d) => plannedMinutes(plan.blocks, d) > 600);
  const overcommit = planned > target * 1.1;

  const stepDone = {
    goals: plan.goals.length > 0,
    sections: dates.every((d) => plan.restDays.includes(weekdayOf(d)) || !!plan.sectionByDay[d]),
    blocks: dates.every((d) => plan.restDays.includes(weekdayOf(d)) || plan.blocks.some((b) => b.date === d)),
  };

  return (
    <>
      <nav className={styles.stepper} aria-label="Planning steps">
        {(['goals', 'sections', 'blocks'] as const).map((k, i) => (
          <a key={k} href={`#plan-${k}`} onClick={(e) => { e.preventDefault(); document.getElementById(`plan-${k}`)?.scrollIntoView({ behavior: 'smooth' }); }} className={styles.step}>
            <span className={`${styles.badge} ${stepDone[k] ? styles.badgeDone : ''}`}>{stepDone[k] ? '✓' : i + 1}</span>
            {k === 'goals' ? 'Goals' : k === 'sections' ? 'Sections' : 'Time blocks'}
          </a>
        ))}
        <span className={`${styles.saved} subtle`}>Changes save automatically</span>
      </nav>

      {/* ---------- 1. Goals ---------- */}
      <section id="plan-goals" className={`card ${styles.panel}`} aria-labelledby="goals-h">
        <div className="card-head">
          <h2 id="goals-h" className="card-title">Goals</h2>
          <button type="button" className="btn btn-sm" onClick={() => (goalsAreDefault(plan) ? copyGoals() : setConfirm('goals'))} disabled={!prevPlan}>
            <Icon name="copy" /> Copy last week's goals
          </button>
        </div>
        <div className={styles.goalSettings}>
          <div className="field">
            <label htmlFor="daily-goal">Daily goal (hours)</label>
            <DurationInput id="daily-goal" value={plan.dailyGoalMinutes} step={15} min={15} max={24 * 60} ariaLabel="daily goal" onCommit={setDailyGoal} />
          </div>
          <div className="field">
            <span className="label" id="rest-label">Rest days</span>
            <div className="daychips" role="group" aria-labelledby="rest-label">
              {WEEKDAY_SHORT.map((w, i) => (
                <button key={w} type="button" className="daychip" aria-pressed={plan.restDays.includes(i as Weekday)} onClick={() => toggleRest(i as Weekday)} title={plan.restDays.includes(i as Weekday) ? `${w}: rest day` : `${w}: study day`}>
                  {w}
                </button>
              ))}
            </div>
            <span className="help">Pressed = rest day. <span className="num">{studyDays}</span> study days · weekly target <span className="num">{formatDuration(target)}</span></span>
          </div>
        </div>

        <ul className={styles.goals}>
          {plan.goals.length === 0 && <li className="muted">No goals yet. Add one below.</li>}
          {plan.goals.map((g, i) => (
            <li key={g.id} className={styles.goalRow}>
              <div className="field">
                <label htmlFor={`gk-${g.id}`} className="visually-hidden">Goal {i + 1} kind</label>
                <select id={`gk-${g.id}`} className="select" value={g.kind} onChange={(e) => changeKind(g, e.target.value as Goal['kind'])}>
                  {(Object.keys(KIND_LABEL) as Goal['kind'][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </div>
              {(g.kind === 'courseHours' || g.kind === 'sectionsCompleted') && (
                <div className="field">
                  <label htmlFor={`gc-${g.id}`} className="visually-hidden">Goal {i + 1} course</label>
                  <select id={`gc-${g.id}`} className="select" value={g.courseId ?? ''} onChange={(e) => setGoal(g.id, { ...g, courseId: e.target.value || (g.kind === 'sectionsCompleted' ? null : g.courseId) } as Goal)}>
                    {g.kind === 'sectionsCompleted' && <option value="">Any course</option>}
                    {g.kind === 'courseHours' && !g.courseId && <option value="">Choose a course</option>}
                    {activeCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className={`field ${styles.target}`}>
                <label htmlFor={`gt-${g.id}`} className="visually-hidden">Goal {i + 1} target</label>
                {g.kind === 'totalHours' || g.kind === 'courseHours' ? (
                  <DurationInput id={`gt-${g.id}`} value={g.targetMinutes} min={15} onCommit={(m) => m && setGoal(g.id, { ...g, targetMinutes: m })} ariaLabel={`Goal ${i + 1} target hours`} />
                ) : (
                  <input id={`gt-${g.id}`} type="number" className="input input-num" min={1} max={g.kind === 'dailyGoalDays' ? 7 : 999} value={g.targetCount}
                    onChange={(e) => { const n = Math.round(Number(e.target.value)); if (Number.isFinite(n) && n >= 1) setGoal(g.id, { ...g, targetCount: Math.min(g.kind === 'dailyGoalDays' ? 7 : 999, n) }); }} />
                )}
                <span className="subtle small">{g.kind === 'totalHours' || g.kind === 'courseHours' ? 'h' : g.kind === 'dailyGoalDays' ? 'days' : 'sections'}</span>
              </div>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeGoal(g)} aria-label={`Remove goal ${i + 1}`}><Icon name="trash" /></button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-sm" onClick={addGoal}><Icon name="plus" /> Add goal</button>
      </section>

      {/* ---------- 2. Sections ---------- */}
      <section id="plan-sections" className={`card ${styles.panel}`} aria-labelledby="sections-h">
        <div className="card-head">
          <h2 id="sections-h" className="card-title">Sections</h2>
          <div className="row">
            <label htmlFor="auto-course" className="visually-hidden">Auto-assign course</label>
            <select id="auto-course" className="select" style={{ width: 'auto', height: 28 }} value={autoCourse} onChange={(e) => setAutoCourse(e.target.value)}>
              {!autoCourse && <option value="">Choose a course</option>}
              {activeCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" className="btn btn-sm btn-primary" onClick={runAutoAssign} disabled={!autoCourse}><Icon name="wand" /> Auto-assign</button>
            <button type="button" className="btn btn-sm" onClick={clearSections}>Clear</button>
          </div>
        </div>
        {openSections.length === 0 && <p className="muted" style={{ marginBottom: 12 }}>All sections are done — add more in <Link to="/courses">Courses</Link>.</p>}
        <ol className={styles.days}>
          {dates.map((d) => {
            const rest = plan.restDays.includes(weekdayOf(d));
            const sid = plan.sectionByDay[d] ?? null;
            const current = sid ? sectionMap.get(sid) : undefined;
            return (
              <li key={d} className={`${styles.dayRow} ${rest ? styles.rest : ''} ${d === today ? styles.todayRow : ''}`}>
                <label htmlFor={`day-${d}`} className={styles.dayLabel}>
                  <span>{formatDay(d)}</span>
                  {rest && <span className="chip">Rest</span>}
                  {d === today && <span className="chip chip-today">Today</span>}
                </label>
                <select id={`day-${d}`} className="select" value={sid ?? ''} onChange={(e) => dispatch({ type: 'plan/assignSection', weekStart, date: d, sectionId: e.target.value || null })}>
                  <option value="">— No section —</option>
                  {activeCourses.map((c) => {
                    const opts = sectionsOfCourse(data.sections, c.id).filter((s) => !s.completedAt || s.id === sid);
                    if (!opts.length) return null;
                    return (
                      <optgroup key={c.id} label={c.name}>
                        {opts.map((s) => <option key={s.id} value={s.id}>{s.completedAt ? '✓ ' : ''}{s.title}{s.id !== sid && assigned.has(s.id) ? ' (planned)' : ''}</option>)}
                      </optgroup>
                    );
                  })}
                  {current && courseMap.get(current.courseId)?.archived && <option value={current.id}>{current.title}</option>}
                </select>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ---------- 3. Schedule ---------- */}
      <section id="plan-blocks" className={`card ${styles.panel}`} aria-labelledby="blocks-h">
        <div className="card-head">
          <h2 id="blocks-h" className="card-title">Time blocks</h2>
          <div className="row">
            <button type="button" className="btn btn-sm btn-primary" onClick={addBlockOnPhone}><Icon name="plus" /> Add block</button>
            <button type="button" className="btn btn-sm" onClick={() => (plan.blocks.length ? setConfirm('blocks') : copyBlocks())} disabled={!prevPlan}>
              <Icon name="copy" /> Copy last week's blocks
            </button>
          </div>
        </div>
        {!isPhone && <p className="help" style={{ marginBottom: 12 }}>Drag on the grid to add a block (click adds one hour), or use Add block. Drag a block to move it, drag its bottom edge to resize, click it to edit. Focused blocks: arrows move, Shift+arrows resize, Enter edits, Delete removes.</p>}
        {(overcommit || heavyDay) && (
          <div className="banner banner-behind">
            <Icon name="alert" />
            <span className="banner-text">
              {overcommit ? <>Planned <span className="num">{formatDuration(planned)}</span> — <span className="num">{formatDuration(planned - target)}</span> more than your <span className="num">{formatDuration(target)}</span> goal.</> : null}
              {heavyDay ? <> {formatDay(heavyDay)} has more than 10 hours planned.</> : null}
            </span>
          </div>
        )}
        {isPhone && (
          <div className={styles.dayTabs} role="tablist" aria-label="Day">
            {dates.map((d) => (
              <button key={d} type="button" role="tab" aria-selected={d === phoneDay} className={`${styles.dayTab} ${d === phoneDay ? styles.dayTabOn : ''}`} onClick={() => setPhoneDay(d)}>
                <span>{WEEKDAY_SHORT[weekdayOf(d)]}</span>
                <span className="num">{Number(d.slice(8))}</span>
              </button>
            ))}
          </div>
        )}
        <div className={styles.gridWrap}>
          <WeekGrid
            dates={isPhone ? [phoneDay] : dates}
            blocks={plan.blocks}
            sectionByDay={plan.sectionByDay}
            restDays={plan.restDays}
            startHour={data.settings.gridStartHour}
            endHour={data.settings.gridEndHour}
            today={today}
            nowMin={minuteOfDay(now)}
            courses={courseMap}
            sections={sectionMap}
            dragEnabled={!isPhone}
            onCreate={createBlock}
            onMove={moveBlock}
            onOpen={(b) => setPopover({ block: b, isNew: false })}
            onDelete={deleteBlock}
          />
        </div>
        <p className={styles.footer}>
          Planned <strong className="num">{formatDuration(planned)}</strong> of <span className="num">{formatDuration(target)}</span>
          <span className="muted"> ({formatDuration(plan.dailyGoalMinutes)} × {studyDays} study days)</span>
        </p>
      </section>

      {popover && (
        <BlockPopover open plan={plan} block={popover.block} isNew={popover.isNew} onClose={() => setPopover(null)} onSave={saveBlock} onDelete={deleteBlock} />
      )}
      <ConfirmDialog open={confirm === 'goals'} title="Replace this week's goals?" confirmLabel="Copy goals" onCancel={() => setConfirm(null)} onConfirm={copyGoals}>
        <p>Your edited goals for this week will be replaced with last week's.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'blocks'} title="Replace this week's blocks?" confirmLabel="Copy blocks" onCancel={() => setConfirm(null)} onConfirm={copyBlocks}>
        <p>The {plan.blocks.length} blocks planned this week will be replaced with last week's, shifted to the same weekdays.</p>
      </ConfirmDialog>
    </>
  );
}
