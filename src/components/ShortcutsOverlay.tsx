import { Modal } from './Modal';

export const SHORTCUTS: Array<[string[], string]> = [
  [['Space'], 'Clock in (pick a focus block) / clock out; resumes a paused focus session'],
  [['S'], 'Switch section while the timer runs'],
  [['N'], 'New manual entry'],
  [['D'], "Mark today's section done (Today)"],
  [['1', '–', '6'], 'Go to Today, Plan, Timecard, Courses, Review, Settings'],
  [['[', ']'], 'Previous / next week (Plan, Timecard, Review)'],
  [['T'], 'Jump to this week / today'],
  [['?'], 'Show this list'],
  [['Esc'], 'Close dialog, popover or overlay'],
];

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <table style={{ width: '100%' }}>
        <tbody>
          {SHORTCUTS.map(([keys, label]) => (
            <tr key={label}>
              <td style={{ padding: '6px 12px 6px 0', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                {keys.map((k, i) => (k === '–' ? <span key={i} className="muted"> – </span> : <kbd key={i} style={{ marginRight: 4 }}>{k}</kbd>))}
              </td>
              <td style={{ padding: '6px 0' }}>{label}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="help" style={{ marginTop: 12 }}>Shortcuts are ignored while you type in a field.</p>
    </Modal>
  );
}
