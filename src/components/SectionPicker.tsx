import type { AppData, Id } from '../domain/types';
import { sectionsOfCourse } from '../domain/sections';

interface SectionPickerProps {
  id: string;
  data: AppData;
  courseId: Id | '';
  value: Id | null;
  onChange: (id: Id | null) => void;
  disabled?: boolean;
}

/** Sections of one course; done ones are listed last with ✓. "General" = no section. */
export function SectionPicker({ id, data, courseId, value, onChange, disabled }: SectionPickerProps) {
  const all = courseId ? sectionsOfCourse(data.sections, courseId) : [];
  const open = all.filter((s) => !s.completedAt);
  const done = all.filter((s) => s.completedAt);
  return (
    <select id={id} className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled || !courseId}>
      <option value="">General (no section)</option>
      {open.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      {done.length > 0 && (
        <optgroup label="Done">
          {done.map((s) => <option key={s.id} value={s.id}>✓ {s.title}</option>)}
        </optgroup>
      )}
    </select>
  );
}
