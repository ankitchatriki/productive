import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { CoursePicker } from './CoursePicker';
import { SectionPicker } from './SectionPicker';
import { useDispatch, useStore } from '../state/store';
import { useToast } from '../hooks/useToast';
import { validateEntry } from '../domain/entries';
import { addDays, dateAtMinute, formatDuration, hhmmToMin, minToHHMM, toDateKey } from '../domain/time';
import { newId } from '../domain/ids';
import type { DateKey, Id, TimeEntry } from '../domain/types';
import styles from './EntryDialog.module.css';

export interface EntryDialogInit {
  /** Edit this entry. */
  entry?: TimeEntry;
  date?: DateKey;
  courseId?: Id;
  sectionId?: Id | null;
  /** Prefill from the running timer; saving stops the timer at the chosen end. */
  fromTimer?: boolean;
  /** Called after the dialog closes (e.g. to reopen the Timecard cell panel). */
  onClosed?: () => void;
}

interface EntryDialogProps {
  open: boolean;
  init: EntryDialogInit;
  onClose: () => void;
}

function initialState(init: EntryDialogInit, data: ReturnType<typeof useStore>) {
  const now = new Date();
  if (init.entry) {
    const s = new Date(init.entry.start);
    const e = new Date(init.entry.end);
    const date = toDateKey(s);
    return {
      date, start: minToHHMM(s.getHours() * 60 + s.getMinutes()), end: minToHHMM(e.getHours() * 60 + e.getMinutes()),
      nextDay: toDateKey(e) !== date, courseId: init.entry.courseId, sectionId: init.entry.sectionId, note: init.entry.note,
    };
  }
  if (init.fromTimer && data.activeTimer) {
    const s = new Date(data.activeTimer.startedAt);
    const date = toDateKey(s);
    return {
      date, start: minToHHMM(s.getHours() * 60 + s.getMinutes()), end: minToHHMM(now.getHours() * 60 + now.getMinutes()),
      nextDay: toDateKey(now) !== date, courseId: data.activeTimer.courseId, sectionId: data.activeTimer.sectionId, note: data.activeTimer.note,
    };
  }
  const today = toDateKey(now);
  const date = init.date ?? today;
  let startMin = 9 * 60;
  let endMin = 10 * 60;
  if (date === today) {
    endMin = now.getHours() * 60 + now.getMinutes();
    startMin = Math.max(0, endMin - 60);
  }
  const fallbackCourse = data.courses.find((c) => !c.archived)?.id ?? '';
  return {
    date, start: minToHHMM(startMin), end: minToHHMM(endMin), nextDay: false,
    courseId: init.courseId ?? fallbackCourse, sectionId: init.sectionId ?? null, note: '',
  };
}

export function EntryDialog({ open, init, onClose }: EntryDialogProps) {
  const data = useStore();
  const dispatch = useDispatch();
  const toast = useToast();
  const [f, setF] = useState(() => initialState(init, data));
  const [orig, setOrig] = useState(f);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const s = initialState(init, data);
    setF(s);
    setOrig(s);
    setSubmitted(false);
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isEdit = !!init.entry;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const draft = useMemo(() => {
    const sMin = hhmmToMin(f.start);
    const eMin = hhmmToMin(f.end);
    if (sMin === null || eMin === null || !f.date) return null;
    let start = dateAtMinute(f.date, sMin).toISOString();
    let end = dateAtMinute(f.nextDay ? addDays(f.date, 1) : f.date, eMin).toISOString();
    // Keep exact (second-precision) instants when the user didn't touch the times.
    if (init.entry && f.date === orig.date && f.start === orig.start) start = init.entry.start;
    if (init.entry && f.date === orig.date && f.end === orig.end && f.nextDay === orig.nextDay) end = init.entry.end;
    if (init.fromTimer && data.activeTimer && f.date === orig.date && f.start === orig.start) start = data.activeTimer.startedAt;
    return { id: init.entry?.id ?? 'new', courseId: f.courseId, sectionId: f.sectionId, start, end };
  }, [f, orig, init.entry, init.fromTimer, data.activeTimer]);

  const now = new Date();
  const validationData = init.fromTimer ? { ...data, activeTimer: null } : data;
  const error = draft ? validateEntry(draft, validationData, now, { isEdit }) : 'Enter a valid date, start and end time.';
  const minutes = draft ? Math.round((Date.parse(draft.end) - Date.parse(draft.start)) / 60000) : 0;

  const save = () => {
    setSubmitted(true);
    if (error || !draft) return;
    const stamp = new Date().toISOString();
    if (init.entry) {
      dispatch({ type: 'entry/update', entry: { ...init.entry, ...draft, note: f.note.trim(), updatedAt: stamp } });
      toast.show('Entry saved.');
    } else {
      const entry: TimeEntry = {
        ...draft, id: newId(), note: f.note.trim(), source: init.fromTimer ? 'timer' : 'manual', createdAt: stamp, updatedAt: stamp,
      };
      if (init.fromTimer) {
        dispatch({ type: 'data/replace', data: { ...data, activeTimer: null, entries: [...data.entries, entry] } });
        toast.show(`Clocked out. Logged ${formatDuration(minutes)}.`);
      } else {
        dispatch({ type: 'entry/add', entry });
        toast.show('Entry saved.');
      }
    }
    onClose();
  };

  const remove = () => {
    if (!init.entry) return;
    const removed = init.entry;
    dispatch({ type: 'entry/delete', id: removed.id });
    toast.show('Entry deleted.', { label: 'Undo', onClick: () => dispatch({ type: 'entry/add', entry: removed }) });
    onClose();
  };

  const showError = submitted && error;
  const title = isEdit ? 'Edit entry' : init.fromTimer ? 'Stop the timer at…' : 'Add entry';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          {isEdit && <button type="button" className="btn btn-danger-ghost" onClick={remove} style={{ marginRight: 'auto' }}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="entry-form" className="btn btn-primary">{init.fromTimer ? 'Clock out' : 'Save entry'}</button>
        </>
      }
    >
      <form id="entry-form" className={styles.form} onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <div className={`field ${styles.date}`}>
          <label htmlFor="entry-date">Date</label>
          <input id="entry-date" type="date" className="input" value={f.date} onChange={(e) => set('date', e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="entry-start">Start</label>
          <input id="entry-start" type="time" className="input" value={f.start} onChange={(e) => set('start', e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="entry-end">End</label>
          <input id="entry-end" type="time" className="input" value={f.end} onChange={(e) => set('end', e.target.value)} required />
        </div>
        <div className={styles.full}>
          <label className="check">
            <input type="checkbox" checked={f.nextDay} onChange={(e) => set('nextDay', e.target.checked)} /> Ends next day
          </label>
          <span className={styles.duration}>Duration <strong className="num">{minutes > 0 ? formatDuration(minutes) : '–'}</strong></span>
        </div>
        <div className="field">
          <label htmlFor="entry-course">Course</label>
          <CoursePicker id="entry-course" data={data} value={f.courseId} keep={init.entry?.courseId} onChange={(id) => setF((p) => ({ ...p, courseId: id, sectionId: null }))} />
        </div>
        <div className="field">
          <label htmlFor="entry-section">Section</label>
          <SectionPicker id="entry-section" data={data} courseId={f.courseId} value={f.sectionId} onChange={(id) => set('sectionId', id)} />
        </div>
        <div className={`field ${styles.full}`}>
          <label htmlFor="entry-note">Note</label>
          <textarea id="entry-note" className="textarea" rows={3} value={f.note} onChange={(e) => set('note', e.target.value)} />
        </div>
        {showError && <p className={`error ${styles.full}`} role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
