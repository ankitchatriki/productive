import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { CoursePicker } from './CoursePicker';
import { SectionPicker } from './SectionPicker';
import { useStore } from '../state/store';
import { canPlaceBlock } from '../domain/plan';
import { formatDay, hhmmToMin, minToHHMM, weekDates } from '../domain/time';
import type { ScheduledBlock, WeekPlan } from '../domain/types';

interface BlockPopoverProps {
  open: boolean;
  plan: WeekPlan;
  block: ScheduledBlock | null;
  isNew: boolean;
  onSave: (b: ScheduledBlock) => void;
  onDelete: (b: ScheduledBlock) => void;
  onClose: () => void;
}

/** Edit / add a planned block (also the mobile "Add block" form). */
export function BlockPopover({ open, plan, block, isNew, onSave, onDelete, onClose }: BlockPopoverProps) {
  const data = useStore();
  const [b, setB] = useState<ScheduledBlock | null>(block);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !block) return;
    setB(block);
    setStart(minToHHMM(block.startMin));
    setEnd(minToHHMM(block.endMin));
    setError('');
  }, [open, block]);
  if (!b) return null;

  const save = () => {
    const s = hhmmToMin(start);
    let e = hhmmToMin(end);
    if (e === 0 && s !== null && s > 0) e = 1440; // "00:00" end = midnight
    if (s === null || e === null) { setError('Enter a start and end time.'); return; }
    if (s % 15 || e % 15) { setError('Use 15-minute steps (e.g. 9:00, 9:15).'); return; }
    if (e <= s) { setError('End time must be after start time.'); return; }
    if (!b.courseId) { setError('Choose a course.'); return; }
    const next = { ...b, startMin: s, endMin: e, label: b.label.trim() };
    if (!canPlaceBlock(plan.blocks, next)) { setError('That time overlaps another block on this day.'); return; }
    onSave(next);
  };

  return (
    <Modal open={open} onClose={onClose} title={isNew ? 'Add block' : 'Edit block'}
      footer={<>
        {!isNew && <button type="button" className="btn btn-danger-ghost" style={{ marginRight: 'auto' }} onClick={() => onDelete(b)}>Delete</button>}
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" form="block-form" className="btn btn-primary">{isNew ? 'Add block' : 'Save'}</button>
      </>}>
      <form id="block-form" className="stack" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <div className="field">
          <label htmlFor="block-day">Day</label>
          <select id="block-day" className="select" value={b.date} onChange={(e) => setB({ ...b, date: e.target.value })}>
            {weekDates(plan.weekStart).map((d) => <option key={d} value={d}>{formatDay(d)}</option>)}
          </select>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="block-start">Start</label>
            <input id="block-start" type="time" step={900} className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="block-end">End</label>
            <input id="block-end" type="time" step={900} className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="block-course">Course</label>
          <CoursePicker id="block-course" data={data} value={b.courseId} onChange={(id) => setB({ ...b, courseId: id, sectionId: null })} />
        </div>
        <div className="field">
          <label htmlFor="block-section">Section</label>
          <SectionPicker id="block-section" data={data} courseId={b.courseId} value={b.sectionId} onChange={(id) => setB({ ...b, sectionId: id })} />
        </div>
        <div className="field">
          <label htmlFor="block-label">Label</label>
          <input id="block-label" className="input" value={b.label} placeholder="Optional, e.g. Problem set" onChange={(e) => setB({ ...b, label: e.target.value })} />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
