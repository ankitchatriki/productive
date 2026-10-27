import { useId, useRef, type ReactNode } from 'react';
import { useFocusTrap } from '../focus/hooks/useFocusTrap';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
  /** Element to focus first (defaults to first focusable). */
  initialFocusSelector?: string;
}

export function Modal({ open, onClose, title, children, footer, size = 'sm', initialFocusSelector }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useFocusTrap(ref, {
    active: open,
    onEscape: () => onCloseRef.current(),
    initialFocus: () => (initialFocusSelector ? ref.current?.querySelector<HTMLElement>(initialFocusSelector) : null),
  });

  if (!open) return null;
  return createPortal(
    <div className={styles.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${styles.modal} ${size === 'md' ? styles.md : ''}`}
      >
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
