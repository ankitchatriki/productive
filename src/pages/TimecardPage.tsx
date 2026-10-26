import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './TimecardPage.module.css';
import { useDispatch, useStore } from '../state/store';
import { useUi } from '../state/ui';
import { useToast } from '../hooks/useToast';
import { useNow } from '../hooks/useNow';
import { useWeekParam } from '../hooks/useWeekParam';
import { useMediaQuery, PHONE_QUERY } from '../hooks/useMediaQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { allIntervals, timecard, type Interval } from '../domain/aggregate';
import { dailyGoalFor, plannedMinutes } from '../domain/plan';
import { colorVar } from '../domain/colors';
import { timecardCsv } from '../domain/csv';
import { WEEKDAY_SHORT, formatClock, formatDay, formatDuration, parseDateKey, splitByLocalDay, toDateKey, weekDates, type DurationFormat } from '../domain/time';
import type { DateKey, Id, Weekday } from '../domain/types';
import { downloadText } from '../utils/download';
import { WeekNav } from '../components/WeekNav';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { ProgressBar } from '../components/ProgressBar';
import { Icon } from '../components/Icon';

interface CellSel { courseId: Id; sectionId: Id | null | 'all'; date: DateKey }

export function TimecardPage() {
  useDocumentTitle('Timecard');
  const data = useStore();
  const dispatch = useDispatch();
  const ui = useUi();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const { weekStart, currentWeek, go } = useWeekParam('/timecard');
  const today = toDateKey(now);
  const dates = weekDates(weekStart);
  const plan = data.weekPlans[weekStart];

  const [fmt, setFmt] = useState<DurationFormat>('decimal');
  const [extraRows, setExtraRows] = useState<Id[]>([]);
  const [expanded, setExpanded] = useState<Set<Id>>(new Set());
  const [sel, setSel] = useState<CellSel | null>(null);
  const [phoneDay, setPhoneDay] = useState<DateKey>(dates.includes(today) ? today : weekStart);
  const [phoneMode, setPhoneMode] = useState<'day' | 'week'>('day');

  const intervals = useMemo(() => allIntervals(data, now), [data, now]);
  const tc = useMemo(() => timecard(intervals, weekStart, extraRows), [intervals, weekStart, extraRows]);
  const courseById = useMemo(() => new Map(data.courses.map((c) => [c.id, c])), [data.courses]);
  const sectionById = useMemo(() => new Map(data.sections.map((s) => [s.id, s])), [data.sections]);
  const goals = dates.map((d) => dailyGoalFor(d, data));
  const restDays = plan?.restDays ?? data.settings.restDays;
  const weekGoal = dates.reduce((s, _d, i) => s + (restDays.includes(i as Weekday) ? 0 : goals[i]), 0);
  const planned = plan ? plannedMinutes(plan.blocks) : 0;
  const daysHit = tc.dayTotals.filter((m, i) => m >= goals[i] && m > 0).length;
  const sectionsDone = data.sections.filter((s) => s.completedAt && dates.includes(toDateKey(new Date(s.completedAt)))).length;
  const f = (m: number) => (m === 0 ? '' : formatDuration(m, fmt));
  const addable = data.courses.filter((c) => !c.archived && !tc.rows.some((r) => r.courseId === c.id));
  const rows = [...tc.rows].sort((a, b) => b.total - a.total);

  const exportCsv = () => {
    downloadText(`productive-timecard-${weekStart}.csv`, timecardCsv(data, weekStart), 'text/csv');
    toast.show('Timecard exported as CSV.');
  };
  const toggle = (id: Id) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const rowLabel = (courseId: Id, sectionId: Id | null | 'all') => {
    const c = courseById.get(courseId)?.name ?? 'Course';
    if (sectionId === 'all') return c;
    return `${c} · ${sectionId ? sectionById.get(sectionId)?.title ?? 'Section' : 'General'}`;
  };

  const cell = (courseId: Id, sectionId: Id | null | 'all', k: number, minutes: number) => (
    <td key={k} className={`num ${styles.cell} ${dates[k] === today ? styles.todayCol : ''}`}>
      <button type="button" className={styles.cellBtn} onClick={() => setSel({ courseId, sectionId, date: dates[k] })}
        aria-label={`${rowLabel(courseId, sectionId)}, ${formatDay(dates[k])}: ${minutes ? formatDuration(minutes) : 'nothing'} logged. Open entries`}>
        {minutes ? f(minutes) : <span className="zero">–</span>}
      </button>
    </td>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Timecard</h1>
          <p className="page-sub">
            <span className="num">{formatDuration(tc.total)}</span> logged · <span className="num">{formatDuration(weekGoal)}</span> goal · <span className="num">{formatDuration(planned)}</span> planned
          </p>
        </div>
        <div className={`page-actions no-print ${styles.headActions}`}>
          <WeekNav weekStart={weekStart} currentWeek={currentWeek} go={go} />
        </div>
      </div>

      <div className={`${styles.toolbar} no-print`}>
        {!isPhone && (
          <div className="segmented" role="group" aria-label="Hours format">
            <button type="button" aria-pressed={fmt === 'decimal'} onClick={() => setFmt('decimal')}>2.50</button>
            <button type="button" aria-pressed={fmt === 'hmm'} onClick={() => setFmt('hmm')}>2:30</button>
          </div>
        )}
        {isPhone && (
          <div className="segmented" role="group" aria-label="View">
            <button type="button" aria-pressed={phoneMode === 'day'} onClick={() => setPhoneMode('day')}>By day</button>
            <button type="button" aria-pressed={phoneMode === 'week'} onClick={() => setPhoneMode('week')}>Week totals</button>
          </div>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-sm" onClick={() => ui.openEntry({ date: dates.includes(today) ? today : weekStart })}><Icon name="plus" /> Add entry</button>
        <button type="button" className="btn btn-sm" onClick={exportCsv}><Icon name="download" /> Export CSV</button>
        <button type="button" className="btn btn-sm" onClick={() => window.print()}><Icon name="printer" /> Print</button>
      </div>

      {tc.rows.length === 0 && (
        <div className="card no-print" style={{ marginBottom: 16 }}>
          <EmptyState icon="table" title="No time logged this week." actions={<button type="button" className="btn btn-primary" onClick={() => navigate('/')}>Go to Today</button>}>
            Clock in from Today and your hours land here.
          </EmptyState>
        </div>
      )}

      {!isPhone ? (
        <div className={`${styles.tableWrap} print-area`}>
          <table className={styles.table}>
            <caption className="visually-hidden">Timecard for {formatDay(weekStart)} to {formatDay(dates[6])}, hours per course per day</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.first}>Course</th>
                {dates.map((d, i) => (
                  <th key={d} scope="col" className={`${styles.numHead} ${d === today ? styles.todayHead : ''}`}>
                    {WEEKDAY_SHORT[i]} <span className="num">{parseDateKey(d).getDate()}</span>
                  </th>
                ))}
                <th scope="col" className={`${styles.numHead} ${styles.totalCol}`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = courseById.get(r.courseId);
                const open = expanded.has(r.courseId);
                return (
                  <Fragment key={r.courseId}>
                    <tr className={styles.courseRow}>
                      <th scope="row" className={styles.first}>
                        <button type="button" className={styles.expand} onClick={() => toggle(r.courseId)} aria-expanded={open} disabled={r.sections.length === 0}
                          aria-label={`${open ? 'Hide' : 'Show'} sections for ${c?.name}`}>
                          <Icon name={open ? 'down' : 'right'} size={14} />
                        </button>
                        <span className="dot" style={{ background: colorVar(c?.color) }} />
                        <span className="truncate">{c?.name ?? 'Unknown course'}</span>
                      </th>
                      {r.days.map((m, k) => cell(r.courseId, 'all', k, m))}
                      <td className={`num ${styles.totalCol} ${styles.strong}`}>{f(r.total) || <span className="zero">–</span>}</td>
                    </tr>
                    {open && [...r.sections].sort((a, b) => (sectionById.get(a.sectionId ?? '')?.order ?? -1) - (sectionById.get(b.sectionId ?? '')?.order ?? -1)).map((s) => (
                      <tr key={s.key} className={styles.subRow}>
                        <th scope="row" className={`${styles.first} ${styles.subLabel}`}>
                          <span className="truncate">{s.sectionId ? sectionById.get(s.sectionId)?.title ?? 'Section' : 'General'}</span>
                        </th>
                        {s.days.map((m, k) => cell(r.courseId, s.sectionId, k, m))}
                        <td className={`num ${styles.totalCol}`}>{f(s.total)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {addable.length > 0 && (
                <tr className="no-print">
                  <th scope="row" className={styles.first} colSpan={9}>
                    <label htmlFor="add-row" className="visually-hidden">Add a course row</label>
                    <select id="add-row" className={`select ${styles.addRow}`} value="" onChange={(e) => e.target.value && setExtraRows((x) => [...x, e.target.value])}>
                      <option value="">+ Add row…</option>
                      {addable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </th>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className={styles.first}>Day total</th>
                {tc.dayTotals.map((m, k) => (
                  <td key={k} className={`num ${m >= goals[k] && m > 0 ? styles.hit : ''} ${dates[k] === today ? styles.todayCol : ''}`} title={`Goal ${formatDuration(goals[k])}`}>
                    {f(m) || <span className="zero">–</span>}{m >= goals[k] && m > 0 && <span className="visually-hidden"> (goal met)</span>}
                  </td>
                ))}
                <td className={`num ${styles.totalCol} ${styles.strong}`}>{f(tc.total) || '–'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : phoneMode === 'day' ? (
        <div className={`card print-area ${styles.phoneCard}`}>
          <div className={styles.dayTabs} role="tablist" aria-label="Day">
            {dates.map((d, i) => (
              <button key={d} type="button" role="tab" aria-selected={d === phoneDay} className={`${styles.dayTab} ${d === phoneDay ? styles.dayTabOn : ''}`} onClick={() => setPhoneDay(d)}>
                <span>{WEEKDAY_SHORT[i]}</span>
                <span className={`num ${tc.dayTotals[i] >= goals[i] && tc.dayTotals[i] > 0 ? styles.hitText : ''}`}>{tc.dayTotals[i] ? formatDuration(tc.dayTotals[i]) : '–'}</span>
              </button>
            ))}
          </div>
          {(() => {
            const k = dates.indexOf(phoneDay);
            const dayRows = rows.filter((r) => r.days[k] > 0);
            return (
              <>
                <ul className={styles.phoneList}>
                  {dayRows.length === 0 && <li className="muted">Nothing logged on {formatDay(phoneDay)}.</li>}
                  {dayRows.map((r) => {
                    const c = courseById.get(r.courseId);
                    return (
                      <li key={r.courseId}>
                        <button type="button" className={styles.phoneRow} onClick={() => setSel({ courseId: r.courseId, sectionId: 'all', date: phoneDay })}>
                          <span className="dot" style={{ background: colorVar(c?.color) }} />
                          <span className="truncate">{c?.name}</span>
                          <span className="num">{formatDuration(r.days[k])}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className={styles.phoneTotal}>
                  <span>Day total <strong className="num">{formatDuration(tc.dayTotals[k])}</strong> <span className="muted num">/ {formatDuration(goals[k])}</span></span>
                  <ProgressBar value={tc.dayTotals[k]} max={goals[k]} color={tc.dayTotals[k] >= goals[k] ? 'var(--ontrack)' : undefined} label={`Day total vs goal`} />
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        <div className={`card print-area ${styles.phoneCard}`}>
          <table className={styles.weekTable}>
            <thead><tr><th scope="col">Course</th><th scope="col" className="num">Total</th><th scope="col" className="num">%</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const c = courseById.get(r.courseId);
                return (
                  <tr key={r.courseId}>
                    <th scope="row"><span className="dot" style={{ background: colorVar(c?.color) }} /> {c?.name}</th>
                    <td className="num">{formatDuration(r.total)}</td>
                    <td className="num">{tc.total ? Math.round((r.total / tc.total) * 100) : 0}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><th scope="row">Week</th><td className="num">{formatDuration(tc.total)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}

      <section className={`card ${styles.statement} print-area`} aria-labelledby="statement-h">
        <h2 id="statement-h" className="card-title">Statement</h2>
        <p className="muted small">{formatDay(weekStart)} – {formatDay(dates[6])} {parseDateKey(dates[6]).getFullYear()}</p>
        <dl className={styles.stats}>
          <div><dt>Week total</dt><dd className="num">{formatDuration(tc.total)}</dd></div>
          <div><dt>Days goal hit</dt><dd className="num">{daysHit}</dd></div>
          <div><dt>Sections completed</dt><dd className="num">{sectionsDone}</dd></div>
        </dl>
        <table className={styles.lines}>
          <thead><tr><th scope="col">Course</th><th scope="col" className="num">Hours</th><th scope="col" className="num">% of week</th></tr></thead>
          <tbody>
            {rows.filter((r) => r.total > 0).map((r) => (
              <tr key={r.courseId}>
                <th scope="row"><span className="dot" style={{ background: colorVar(courseById.get(r.courseId)?.color) }} /> {courseById.get(r.courseId)?.name}</th>
                <td className="num">{formatDuration(r.total, fmt)}</td>
                <td className="num">{tc.total ? Math.round((r.total / tc.total) * 100) : 0}%</td>
              </tr>
            ))}
            {tc.total === 0 && <tr><td colSpan={3} className="muted">No time logged this week.</td></tr>}
          </tbody>
        </table>
        <div className="row no-print" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-sm" onClick={exportCsv}><Icon name="download" /> Export CSV</button>
          <button type="button" className="btn btn-sm" onClick={() => window.print()}><Icon name="printer" /> Print</button>
        </div>
      </section>

      {sel && (
        <CellPanel sel={sel} intervals={intervals} label={rowLabel(sel.courseId, sel.sectionId)} onClose={() => setSel(null)}
          onEdit={(id) => { const e = data.entries.find((x) => x.id === id); if (e) ui.openEntry({ entry: e }); }}
          onDelete={(id) => {
            const e = data.entries.find((x) => x.id === id);
            if (!e) return;
            dispatch({ type: 'entry/delete', id });
            toast.show('Entry deleted.', { label: 'Undo', onClick: () => dispatch({ type: 'entry/add', entry: e }) });
          }}
          onAdd={() => ui.openEntry({ date: sel.date, courseId: sel.courseId, sectionId: sel.sectionId === 'all' ? null : sel.sectionId })}
          notes={new Map(data.entries.map((e) => [e.id, e.note]))}
          sectionTitle={(id) => (id ? sectionById.get(id)?.title ?? 'Section' : 'General')}
        />
      )}
    </div>
  );
}

interface CellPanelProps {
  sel: CellSel;
  intervals: Interval[];
  label: string;
  notes: Map<Id, string>;
  sectionTitle: (id: Id | null) => string;
  onClose: () => void;
  onEdit: (id: Id) => void;
  onDelete: (id: Id) => void;
  onAdd: () => void;
}

function CellPanel({ sel, intervals, label, notes, sectionTitle, onClose, onEdit, onDelete, onAdd }: CellPanelProps) {
  const items = intervals
    .filter((i) => i.courseId === sel.courseId && (sel.sectionId === 'all' || i.sectionId === sel.sectionId))
    .map((i) => ({ i, piece: splitByLocalDay(i.start, i.end).find((p) => p.date === sel.date) }))
    .filter((x) => x.piece)
    .sort((a, b) => a.i.start.localeCompare(b.i.start));
  return (
    <Modal open onClose={onClose} title={`${label} · ${formatDay(sel.date)}`} size="md"
      footer={<><button type="button" className="btn" onClick={onClose}>Close</button><button type="button" className="btn btn-primary" onClick={onAdd}><Icon name="plus" /> Add entry</button></>}>
      {items.length === 0 ? <p className="muted">No entries for this cell.</p> : (
        <ul className={styles.panelList}>
          {items.map(({ i, piece }) => (
            <li key={i.entryId ?? 'running'} className={styles.panelItem}>
              <div className={styles.panelMain}>
                <span className="num">{formatClock(i.start)}–{i.entryId ? formatClock(i.end) : 'now'}</span>
                <span className="muted small truncate">{sectionTitle(i.sectionId)}{i.entryId && notes.get(i.entryId) ? ` · ${notes.get(i.entryId)}` : ''}</span>
              </div>
              <span className="num">{formatDuration(piece!.minutes)}</span>
              {i.entryId ? (
                <span className="row" style={{ flexWrap: 'nowrap', gap: 2 }}>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(i.entryId!)} aria-label="Edit entry"><Icon name="pencil" /></button>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onDelete(i.entryId!)} aria-label="Delete entry"><Icon name="trash" /></button>
                </span>
              ) : <span className="chip chip-ontrack">● Live</span>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
