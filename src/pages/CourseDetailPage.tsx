import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import styles from './CourseDetailPage.module.css';
import { useDispatch, useStore } from '../state/store';
import { useToast } from '../hooks/useToast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { allIntervals, minutesBySection, minutesInDates } from '../domain/aggregate';
import { formatDuration, toDateKey, weekDates, weekStartOf } from '../domain/time';
import { colorVar } from '../domain/colors';
import { newId } from '../domain/ids';
import { STATUS_LABEL, makeSections, parseBulkSections, sectionStatus, sectionsOfCourse } from '../domain/sections';
import type { Section } from '../domain/types';
import { ProgressBar } from '../components/ProgressBar';
import { CourseDialog } from '../components/CourseDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DurationInput } from '../components/DurationInput';
import { Icon } from '../components/Icon';

const STATUS_CHIP = { todo: '', in_progress: 'chip-progress', done: 'chip-done' } as const;

export function CourseDetailPage() {
  const { courseId } = useParams();
  const data = useStore();
  const dispatch = useDispatch();
  const toast = useToast();
  const navigate = useNavigate();
  const course = data.courses.find((c) => c.id === courseId);
  useDocumentTitle(course ? course.name : 'Courses');

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<'course' | 'blocked' | null>(null);
  const [pendingSectionDelete, setPendingSectionDelete] = useState<Section | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const addRef = useRef<HTMLInputElement>(null);

  const now = new Date();
  const today = toDateKey(now);
  const week = weekDates(weekStartOf(today));
  const ints = useMemo(() => allIntervals(data, new Date()), [data]);
  const bySection = useMemo(() => minutesBySection(ints), [ints]);

  if (!course) return <Navigate to="/courses" replace />;

  const sections = sectionsOfCourse(data.sections, course.id);
  const done = sections.filter((s) => s.completedAt).length;
  const courseInts = ints.filter((i) => i.courseId === course.id);
  const allTime = courseInts.reduce((s, i) => s + Math.round((Date.parse(i.end) - Date.parse(i.start)) / 60000), 0);
  const thisWeek = minutesInDates(courseInts, week);
  const hasEntries = data.entries.some((e) => e.courseId === course.id);
  const todaySectionId = data.weekPlans[weekStartOf(today)]?.sectionByDay[today] ?? null;
  const c = colorVar(course.color);

  const addOne = () => {
    const parsed = parseBulkSections(newTitle);
    if (!parsed.length) return;
    dispatch({ type: 'section/addMany', sections: makeSections(course.id, parsed.slice(0, 1), data.sections, newId) });
    setNewTitle('');
    addRef.current?.focus();
  };
  const addMany = () => {
    const parsed = parseBulkSections(bulkText);
    if (!parsed.length) return;
    dispatch({ type: 'section/addMany', sections: makeSections(course.id, parsed, data.sections, newId) });
    toast.show(`Added ${parsed.length} section${parsed.length === 1 ? '' : 's'}.`);
    setBulkText('');
    setBulkOpen(false);
  };
  const deleteSection = (s: Section) => {
    const snapshot = data;
    dispatch({ type: 'section/delete', id: s.id });
    setPendingSectionDelete(null);
    toast.show(`Section "${s.title}" deleted.`, { label: 'Undo', onClick: () => dispatch({ type: 'data/replace', data: snapshot }) });
  };
  const requestDeleteSection = (s: Section) => {
    if (data.entries.some((e) => e.sectionId === s.id)) setPendingSectionDelete(s);
    else deleteSection(s);
  };

  return (
    <div className="page">
      <div className={styles.layout}>
        <nav className={styles.side} aria-label="Courses">
          <Link to="/courses" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', marginBottom: 8 }}><Icon name="left" /> All courses</Link>
          {data.courses.filter((x) => !x.archived || x.id === course.id).map((x) => {
            const xs = data.sections.filter((s) => s.courseId === x.id);
            return (
              <Link key={x.id} to={`/courses/${x.id}`} className={`${styles.sideItem} ${x.id === course.id ? styles.selected : ''}`} style={{ ['--c' as string]: colorVar(x.color) }} aria-current={x.id === course.id ? 'page' : undefined}>
                <span className="dot" style={{ background: colorVar(x.color) }} />
                <span className="truncate">{x.name}</span>
                <span className={`${styles.count} num`}>{xs.filter((s) => s.completedAt).length}/{xs.length}</span>
              </Link>
            );
          })}
        </nav>

        <div>
          <Link to="/courses" className={`btn btn-ghost btn-sm ${styles.backTop}`} style={{ marginBottom: 8 }}><Icon name="left" /> Courses</Link>
          <div className={styles.head}>
            <h1 className={styles.title}><span className="dot" style={{ background: c }} /><span className="truncate">{course.name}</span>{course.archived && <span className="chip">Archived</span>}</h1>
            <div className="page-actions">
              <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}><Icon name="pencil" /> Edit</button>
              <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'course/update', id: course.id, patch: { archived: !course.archived } })}>
                {course.archived ? 'Unarchive' : 'Archive'}
              </button>
              <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setConfirmDelete(hasEntries ? 'blocked' : 'course')}><Icon name="trash" /> Delete</button>
            </div>
          </div>
          <p className={styles.stats}>
            <span className="num">{formatDuration(allTime)}</span> logged all time · <span className="num">{formatDuration(thisWeek)}</span> this week · <span className="num">{done}</span> of <span className="num">{sections.length}</span> sections done
          </p>
          <ProgressBar value={done} max={sections.length} color={c} large label={`${done} of ${sections.length} sections done`} />

          <div className="card-head" style={{ marginTop: 32 }}>
            <h2 className="section-title">Sections</h2>
            <button type="button" className="btn btn-sm" onClick={() => setBulkOpen((o) => !o)} aria-expanded={bulkOpen}>Add many</button>
          </div>

          {bulkOpen && (
            <div className={`${styles.bulk} card`} style={{ marginBottom: 16 }}>
              <div className="field">
                <label htmlFor="bulk">Paste sections, one per line. Add <span className="num">| hours</span> for an estimate.</label>
                <textarea id="bulk" className="textarea" rows={6} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'Ch 4 – Stereochemistry | 5\nCh 5 – Kinetics | 6'} />
                <span className="help">{parseBulkSections(bulkText).length} sections will be added.</span>
              </div>
              <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setBulkOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={addMany} disabled={!parseBulkSections(bulkText).length}>Add sections</button>
              </div>
            </div>
          )}

          {sections.length === 0 ? (
            <p className="muted" style={{ padding: '16px 0' }}>No sections yet — paste your table of contents.</p>
          ) : (
            <ol className={styles.list}>
              {sections.map((s, idx) => {
                const logged = bySection[s.id] ?? 0;
                const status = sectionStatus(s, logged);
                return (
                  <li key={s.id} className={`${styles.row} ${s.completedAt ? styles.done : ''} ${s.id === todaySectionId ? styles.today : ''}`} style={{ ['--c' as string]: c }}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={!!s.completedAt}
                      aria-label={`Mark "${s.title}" ${s.completedAt ? 'not done' : 'done'}`}
                      className={styles.circle}
                      onClick={() => dispatch({ type: 'section/setDone', id: s.id, done: !s.completedAt, now: new Date().toISOString() })}
                    >
                      <Icon name="check" size={14} />
                    </button>
                    <span className={`${styles.num} num`}>{idx + 1}</span>
                    <SectionTitle section={s} onSave={(title) => dispatch({ type: 'section/update', id: s.id, patch: { title } })} />
                    <div className={styles.meta}>
                      {s.id === todaySectionId && <span className="chip chip-today">Today</span>}
                      <span className={`chip ${STATUS_CHIP[status]}`}>{STATUS_LABEL[status]}</span>
                      <div className={styles.logged}>
                        <span className="num">{formatDuration(logged)}{s.estimatedMinutes ? <span className="muted"> / ~{formatDuration(s.estimatedMinutes)}</span> : null}</span>
                        {s.estimatedMinutes ? <ProgressBar value={logged} max={s.estimatedMinutes} color={c} warnOver label={`${formatDuration(logged)} of ${formatDuration(s.estimatedMinutes)} estimate`} /> : null}
                      </div>
                      <div className={styles.estimate}>
                        <DurationInput value={s.estimatedMinutes} allowEmpty placeholder="est." ariaLabel={`Estimate for ${s.title}`} onCommit={(m) => dispatch({ type: 'section/update', id: s.id, patch: { estimatedMinutes: m && m > 0 ? m : null } })} />
                      </div>
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={idx === 0} onClick={() => dispatch({ type: 'section/move', id: s.id, direction: -1 })} aria-label={`Move "${s.title}" up`}><Icon name="up" /></button>
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={idx === sections.length - 1} onClick={() => dispatch({ type: 'section/move', id: s.id, direction: 1 })} aria-label={`Move "${s.title}" down`}><Icon name="down" /></button>
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => requestDeleteSection(s)} aria-label={`Delete "${s.title}"`}><Icon name="trash" /></button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <form className={styles.addRow} onSubmit={(e) => { e.preventDefault(); addOne(); }}>
            <label htmlFor="new-section" className="visually-hidden">New section title</label>
            <input id="new-section" ref={addRef} className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add a section, e.g. Ch 5 – Kinetics | 6" />
            <button type="submit" className="btn" disabled={!newTitle.trim()}><Icon name="plus" /> Add section</button>
          </form>
        </div>
      </div>

      <CourseDialog open={editing} title="Edit course" initialName={course.name} initialColor={course.color} submitLabel="Save" onClose={() => setEditing(false)}
        onSubmit={(name, color) => { dispatch({ type: 'course/update', id: course.id, patch: { name, color } }); setEditing(false); }} />

      <ConfirmDialog open={confirmDelete === 'course'} title={`Delete ${course.name}?`} confirmLabel="Delete course" danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => { dispatch({ type: 'course/delete', id: course.id }); setConfirmDelete(null); navigate('/courses'); toast.show(`${course.name} deleted.`); }}>
        <p>This removes the course and its {sections.length} sections. It has no logged time.</p>
      </ConfirmDialog>

      <ConfirmDialog open={confirmDelete === 'blocked'} title="This course has logged time" confirmLabel={course.archived ? 'OK' : 'Archive instead'}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => { if (!course.archived) dispatch({ type: 'course/update', id: course.id, patch: { archived: true } }); setConfirmDelete(null); }}>
        <p>Courses with entries can't be deleted, so your history stays intact. Archive it to hide it from pickers.</p>
      </ConfirmDialog>

      <ConfirmDialog open={!!pendingSectionDelete} title={`Delete "${pendingSectionDelete?.title ?? ''}"?`} confirmLabel="Delete section" danger
        onCancel={() => setPendingSectionDelete(null)} onConfirm={() => pendingSectionDelete && deleteSection(pendingSectionDelete)}>
        <p>Its logged entries stay on {course.name} as general time.</p>
      </ConfirmDialog>
    </div>
  );
}

function SectionTitle({ section, onSave }: { section: Section; onSave: (title: string) => void }) {
  const [value, setValue] = useState(section.title);
  const [prev, setPrev] = useState(section.title);
  if (prev !== section.title) { setPrev(section.title); setValue(section.title); }
  const commit = () => {
    const t = value.trim();
    if (!t) setValue(section.title);
    else if (t !== section.title) onSave(t);
  };
  return (
    <input
      className={styles.titleInput}
      value={value}
      aria-label="Section title"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setValue(section.title); }
      }}
    />
  );
}
