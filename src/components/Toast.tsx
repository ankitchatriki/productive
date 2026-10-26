import { useEffect, useRef, useState } from 'react';
import styles from './Toast.module.css';
import type { ToastItem } from '../hooks/useToast';
import { Icon } from './Icon';

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration);
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const t = window.setTimeout(() => onDismiss(item.id), remaining.current);
    return () => { window.clearTimeout(t); remaining.current -= Date.now() - started; };
  }, [paused, item.id, onDismiss]);
  return (
    <div
      className={styles.toast}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.msg}>{item.message}</span>
      {item.action && (
        <button type="button" className={styles.action} onClick={() => { item.action!.onClick(); onDismiss(item.id); }}>
          {item.action.label}
        </button>
      )}
      <button type="button" className={styles.close} onClick={() => onDismiss(item.id)} aria-label="Dismiss">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

export function Toasts({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {items.map((t) => <Toast key={t.id} item={t} onDismiss={onDismiss} />)}
    </div>
  );
}
