import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { COURSE_COLORS, COURSE_COLOR_NAMES, colorVar } from '../domain/colors';
import styles from './CourseDialog.module.css';

export function ColorSwatches({ value, onChange, name = 'course-colour' }: { value: string; onChange: (c: string) => void; name?: string }) {
  return (
    <div className={styles.swatches} role="radiogroup" aria-label="Colour">
      {COURSE_COLORS.map((c, i) => (
        <label key={c} className={styles.swatch} style={{ background: colorVar(c) }} title={COURSE_COLOR_NAMES[i]}>
          <input type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} aria-label={COURSE_COLOR_NAMES[i]} />
        </label>
      ))}
    </div>
  );
}

interface CourseDialogProps {
  open: boolean;
  title: string;
  initialName?: string;
  initialColor: string;
  submitLabel: string;
  onSubmit: (name: string, color: string) => void;
  onClose: () => void;
}

export function CourseDialog({ open, title, initialName = '', initialColor, submitLabel, onSubmit, onClose }: CourseDialogProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setName(initialName); setColor(initialColor); setError(''); } }, [open, initialName, initialColor]);
  const submit = () => {
    if (!name.trim()) { setError('Enter a course name.'); return; }
    onSubmit(name.trim(), color);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" form="course-form" className="btn btn-primary">{submitLabel}</button>
      </>}
    >
      <form id="course-form" className="stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="field">
          <label htmlFor="course-name">Name</label>
          <input id="course-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Organic Chemistry" aria-invalid={!!error || undefined} aria-describedby={error ? 'course-name-error' : undefined} />
          {error && <span id="course-name-error" className="error">{error}</span>}
        </div>
        <div className="field">
          <span className="label">Colour</span>
          <ColorSwatches value={color} onChange={setColor} />
        </div>
      </form>
    </Modal>
  );
}
