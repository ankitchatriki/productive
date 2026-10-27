import type { AppData, Id } from '../domain/types';

interface CoursePickerProps {
  id: string;
  data: AppData;
  value: Id | '';
  onChange: (id: Id) => void;
  /** Always include this course even if archived (editing old entries). */
  keep?: Id | null;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}

export function CoursePicker({ id, data, value, onChange, keep, disabled, invalid, placeholder = 'Choose a course' }: CoursePickerProps) {
  const options = data.courses.filter((c) => !c.archived || c.id === keep || c.id === value);
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-invalid={invalid || undefined}>
      {!value && <option value="">{placeholder}</option>}
      {options.map((c) => <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archived)' : ''}</option>)}
    </select>
  );
}
