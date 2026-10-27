import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { CoursePicker } from './CoursePicker';
import { SectionPicker } from './SectionPicker';
import { useStore } from '../state/store';
import type { TimerTarget } from '../state/timer';

interface SwitchDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (next: TimerTarget & { note: string }) => void;
}

export function SwitchDialog({ open, onClose, onConfirm }: SwitchDialogProps) {
  const data = useStore();
  const [courseId, setCourseId] = useState('');
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setCourseId(data.activeTimer?.courseId ?? data.courses.find((c) => !c.archived)?.id ?? '');
    setSectionId(null);
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const sameAsRunning = data.activeTimer && data.activeTimer.courseId === courseId && data.activeTimer.sectionId === sectionId;
  return (
    <Modal open={open} onClose={onClose} title="Switch section"
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" form="switch-form" className="btn btn-primary" disabled={!courseId || !!sameAsRunning}>Switch</button>
      </>}>
      <form id="switch-form" className="stack" onSubmit={(e) => { e.preventDefault(); if (courseId && !sameAsRunning) { onConfirm({ courseId, sectionId, note: note.trim() }); onClose(); } }}>
        <p className="muted small">Clocks out of the current entry and clocks in to the new one at the same moment.</p>
        <div className="field">
          <label htmlFor="switch-course">Course</label>
          <CoursePicker id="switch-course" data={data} value={courseId} onChange={(id) => { setCourseId(id); setSectionId(null); }} />
        </div>
        <div className="field">
          <label htmlFor="switch-section">Section</label>
          <SectionPicker id="switch-section" data={data} courseId={courseId} value={sectionId} onChange={setSectionId} />
        </div>
        <div className="field">
          <label htmlFor="switch-note">Note</label>
          <input id="switch-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
