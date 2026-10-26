import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './CoursesPage.module.css';
import { useDispatch, useStore } from '../state/store';
import { allIntervals } from '../domain/aggregate';
import { formatDuration } from '../domain/time';
import { colorVar, nextCourseColor } from '../domain/colors';
import { newId } from '../domain/ids';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyState } from '../components/EmptyState';
import { CourseDialog } from '../components/CourseDialog';
import { Icon } from '../components/Icon';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function CoursesPage() {
  useDocumentTitle('Courses');
  const data = useStore();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const totals = useMemo(() => {
    const ints = allIntervals(data, new Date());
    const all: Record<string, number> = {};
    for (const i of ints) all[i.courseId] = (all[i.courseId] ?? 0) + Math.round((Date.parse(i.end) - Date.parse(i.start)) / 60000);
    return all;
  }, [data]);

  const visible = data.courses.filter((c) => showArchived || !c.archived);
  const activeCount = data.courses.filter((c) => !c.archived).length;
  const archivedCount = data.courses.length - activeCount;
  const sectionCount = data.sections.filter((s) => data.courses.find((c) => c.id === s.courseId && !c.archived)).length;
  const doneCount = data.sections.filter((s) => s.completedAt && data.courses.find((c) => c.id === s.courseId && !c.archived)).length;

  const create = (name: string, color: string) => {
    const id = newId();
    dispatch({ type: 'course/add', course: { id, name, color, archived: false, createdAt: new Date().toISOString() } });
    setCreating(false);
    navigate(`/courses/${id}`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Courses</h1>
          <p className="page-sub"><span className="num">{activeCount}</span> courses · <span className="num">{sectionCount}</span> sections · <span className="num">{doneCount}</span> done</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New course</button>
        </div>
      </div>

      {activeCount === 0 && !showArchived ? (
        <EmptyState icon="book" title="No courses yet" actions={<button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New course</button>}>
          Courses hold sections. Every hour you log belongs to one.
          {archivedCount > 0 && <><br /><button type="button" className="link-btn" onClick={() => setShowArchived(true)}>Show archived ({archivedCount})</button></>}
        </EmptyState>
      ) : (
        <>
          <div className={styles.toolbar}>
            <span className="section-title">Active courses</span>
            {archivedCount > 0 && (
              <label className="check">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived ({archivedCount})
              </label>
            )}
          </div>
          <div className={styles.grid}>
            {visible.map((c) => {
              const secs = data.sections.filter((s) => s.courseId === c.id);
              const done = secs.filter((s) => s.completedAt).length;
              return (
                <Link key={c.id} to={`/courses/${c.id}`} className={`${styles.card} ${c.archived ? styles.archived : ''}`} style={{ ['--c' as string]: colorVar(c.color) }}>
                  <span className={styles.name}><span className="dot" style={{ background: colorVar(c.color) }} /><span className="truncate">{c.name}</span>{c.archived && <span className="chip">Archived</span>}</span>
                  <span className={styles.meta}>
                    <span><span className="num">{done}/{secs.length}</span> sections done</span>
                    <span className="num">{formatDuration(totals[c.id] ?? 0)} logged</span>
                  </span>
                  <ProgressBar value={done} max={secs.length} color={colorVar(c.color)} label={`${c.name}: ${done} of ${secs.length} sections done`} />
                </Link>
              );
            })}
          </div>
        </>
      )}

      <CourseDialog open={creating} title="New course" initialColor={nextCourseColor(data.courses)} submitLabel="Add course" onSubmit={create} onClose={() => setCreating(false)} />
    </div>
  );
}
