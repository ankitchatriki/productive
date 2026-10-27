import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import styles from '../TodayPage.module.css';
import { useDispatch, useStore } from '../../state/store';
import { useUi } from '../../state/ui';
import { useNow } from '../../hooks/useNow';
import { focusView } from '../../state/selectors';
import { CoursePicker } from '../../components/CoursePicker';
import { SectionPicker } from '../../components/SectionPicker';
import { SegmentBar, type Segment } from '../../components/SegmentBar';
import { Icon } from '../../components/Icon';
import { colorVar } from '../../domain/colors';
import { clampBlockMinutes, plannedBlockNow } from '../../domain/focus';
import { formatDuration } from '../../domain/time';
import type { Section } from '../../domain/types';
import { blockOptions, choiceFor, optionKeyFor, plannedLine, type OptionKey } from '../../focus/blockOptions';
import { focusStateText } from '../../focus/FocusStrip';

interface StartCardProps {
  running: boolean;
  readout: string | null;
  clockedInSince: string | null;
  todayMinutes: number;
  goal: number;
  rest: boolean;
  segments: Segment[];
  todaySection: Section | undefined;
  sectionLogged: number;
  onMarkDone: (id: string, done: boolean) => void;
  todayKey: string;
  weekStart: string;
}

/** Start card (STRUGGLEMORE §4.2): pick → Clock in, or the running state; the TODAY block is pinned to the bottom. */
export function StartCard(p: StartCardProps) {
  const data = useStore();
  const dispatch = useDispatch();
  const ui = useUi();
  const now = useNow(1000);
  const fs = data.settings.focus;
  const session = data.focus;
  const view = focusView(data, now);
  const hasCourses = data.courses.some((c) => !c.archived);
  const target = ui.effectiveTarget;
  const options = blockOptions(data, now);
  const planned = !!plannedBlockNow(data, now);
  const selected = optionKeyFor(fs.lastChoice, planned, fs.defaultBlockMinutes);
  const [custom, setCustom] = useState(String(fs.lastChoice.kind === 'custom' ? fs.lastChoice.minutes : fs.defaultBlockMinutes));
  const groupRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (fs.lastChoice.kind === 'custom') setCustom(String(fs.lastChoice.minutes)); }, [fs.lastChoice]);

  const select = (key: OptionKey) => dispatch({ type: 'focus/settings', patch: { lastChoice: choiceFor(key, clampBlockMinutes(Number(custom))) } });
  const onChipsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.key === selected);
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else return;
    e.preventDefault();
    select(options[next].key);
    window.setTimeout(() => groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus(), 0);
  };
  const clockIn = () => ui.startWithChoice(choiceFor(selected, clampBlockMinutes(Number(custom))));

  const setDraft = (patch: Partial<{ courseId: string; sectionId: string | null; note: string }>) => {
    const base = ui.effectiveTarget ?? { courseId: '', sectionId: null, note: '' };
    ui.setDraft({ ...base, ...patch });
  };

  const t = data.activeTimer;
  const course = t ? data.courses.find((c) => c.id === t.courseId) : session ? data.courses.find((c) => c.id === session.target.courseId) : undefined;
  const sectionId = t ? t.sectionId : session?.target.sectionId ?? null;
  const section = sectionId ? data.sections.find((x) => x.id === sectionId) : undefined;
  const line = plannedLine(data, now, p.todayKey, p.weekStart);
  const toGo = Math.max(0, p.goal - p.todayMinutes);
  const met = !p.rest && p.todayMinutes >= p.goal;

  return (
    <section className={`card ${styles.start}`} aria-labelledby="start-h" style={{ ['--c' as string]: colorVar(course?.color ?? data.courses.find((c) => c.id === target?.courseId)?.color) }}>
      <h2 id="start-h" className="visually-hidden">Start</h2>
      {p.running || session ? (
        <div className={styles.running}>
          <p className={`eyebrow ${styles.liveEyebrow}`}>
            {p.running ? <><span className={styles.livedot} aria-hidden="true" /> Clocked in since {p.clockedInSince}</> : view ? `Focus · ${focusStateText(view)}` : ''}
          </p>
          <p className={styles.target}><span className="dot" style={{ background: colorVar(course?.color) }} /> <span className="truncate">{course?.name}{section ? ` · ${section.title}` : ''}</span></p>
          {p.readout && <div className={styles.readout} aria-live="off">{p.readout}</div>}
          {view && (
            <div className={styles.blockRow}>
              <span className="xs muted">Block</span>
              <div className="bar" style={{ flex: 1 }} role="progressbar" aria-label="Block progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(view.progress * 100)}>
                <div className="bar-fill" style={{ width: `${view.progress * 100}%` }} />
              </div>
              <span className="num xs">{focusStateText(view)}</span>
            </div>
          )}
          <div className={styles.runActions}>
            {session ? (
              <button type="button" className="btn btn-lg" onClick={ui.enterFocus} data-focus-origin>◐ Back to focus</button>
            ) : (
              <button type="button" className="btn btn-lg" onClick={() => ui.openBlockPicker('attach')} data-focus-origin>◐ Start focus</button>
            )}
            {p.running ? (
              <button type="button" className="btn btn-lg btn-clockout" onClick={ui.toggleTimer}><Icon name="stop" /> Clock out <kbd className={styles.inKbd}>Space</kbd></button>
            ) : (
              <button type="button" className="btn btn-lg btn-primary" onClick={ui.toggleTimer}><Icon name="play" /> {session?.phase === 'paused' ? 'Resume' : 'Start next block'}</button>
            )}
            {p.running && <button type="button" className="btn btn-lg" onClick={ui.openSwitch}>Switch <kbd className={styles.inKbd}>S</kbd></button>}
          </div>
        </div>
      ) : hasCourses ? (
        <div className={styles.idle}>
          <div className={styles.pickRow}>
            <label htmlFor="today-course" className={styles.pickLabel}>Course</label>
            <CoursePicker id="today-course" data={data} value={target?.courseId ?? ''} onChange={(id) => setDraft({ courseId: id, sectionId: null })} />
            <label htmlFor="today-section" className={styles.pickLabel}>Section</label>
            <SectionPicker id="today-section" data={data} courseId={target?.courseId ?? ''} value={target?.sectionId ?? null} onChange={(id) => setDraft({ sectionId: id })} />
          </div>
          {line && <p className="small muted">{line}</p>}
          <div className={styles.blockPick}>
            <span className={styles.pickLabel} id="block-label">Block</span>
            <div ref={groupRef} role="radiogroup" aria-labelledby="block-label" className={styles.chipsRow} onKeyDown={onChipsKey}>
              {options.map((o) => (
                <button key={o.key} type="button" role="radio" aria-checked={selected === o.key} aria-label={o.aria} tabIndex={selected === o.key ? 0 : -1}
                  className={`${styles.blockChip} ${o.key === 'planned' ? styles.plannedChip : ''}`}
                  style={o.key === 'planned' ? { ['--pc' as string]: colorVar(data.courses.find((c) => c.id === o.courseId)?.color) } : undefined}
                  onClick={() => select(o.key)}>
                  {o.key === 'custom' ? '✎ Custom' : o.key === 'open' ? '∞' : o.label}
                </button>
              ))}
            </div>
            {selected === 'custom' && (
              <label className={styles.customField}>
                <span className="visually-hidden">Custom minutes</span>
                <input className="input input-num" inputMode="numeric" value={custom} aria-label="Custom minutes"
                  onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))}
                  onBlur={() => { const m = clampBlockMinutes(Number(custom)); setCustom(String(m)); dispatch({ type: 'focus/settings', patch: { lastChoice: { kind: 'custom', minutes: m } } }); }} />
                <span className="xs muted">min</span>
              </label>
            )}
          </div>
          <button type="button" className={`btn btn-primary ${styles.clockIn}`} onClick={clockIn} disabled={!target} data-focus-origin>
            <Icon name="play" /> Clock in <kbd className={styles.inKbd}>Space</kbd>
          </button>
        </div>
      ) : (
        <p className="muted">Add a course to start. <a href="#/courses">Go to Courses</a></p>
      )}

      <div className={styles.todayBlock}>
        <div className={styles.keyRow}>
          <span className="eyebrow">Today</span>
          <span className="small muted">{p.rest ? 'Rest day' : met ? 'Goal met' : <><span className="num">{formatDuration(toGo)}</span> to go</>}</span>
        </div>
        <p className={styles.keyNumber}><span className="num">{formatDuration(p.todayMinutes)}</span> <span className={`num ${styles.keyGoal}`}>/ {formatDuration(p.goal)}</span>{met && <span className="chip chip-met" style={{ marginLeft: 8 }}>✓ Met</span>}</p>
        <SegmentBar segments={p.segments} goal={p.goal} met={met} label={`${formatDuration(p.todayMinutes)} logged of ${formatDuration(p.goal)}: ${p.segments.map((s) => `${s.label} ${formatDuration(s.minutes)}`).join(', ') || 'nothing yet'}`} />
        {p.todaySection ? (
          <div className={styles.sectionLine}>
            <span className="truncate small muted">Section {p.todaySection.title}: <span className="num">{formatDuration(p.sectionLogged)}</span>{p.todaySection.estimatedMinutes ? <> of ~<span className="num">{formatDuration(p.todaySection.estimatedMinutes)}</span></> : ''}</span>
            {p.todaySection.completedAt ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onMarkDone(p.todaySection!.id, false)}>Mark not done</button>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onMarkDone(p.todaySection!.id, true)}><Icon name="check" /> Mark done <kbd className={styles.inKbd}>D</kbd></button>
            )}
          </div>
        ) : (
          <p className="small muted">No section assigned today. <a href="#/plan">Plan →</a></p>
        )}
      </div>
    </section>
  );
}
