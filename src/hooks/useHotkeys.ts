import { useEffect, useRef } from 'react';

export type HotkeyHandler = (e: KeyboardEvent) => void;

/** True when typing in a field or a dialog is open — global shortcuts must not fire. */
export function shouldIgnoreHotkey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const t = e.target as HTMLElement | null;
  if (t && (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))) return true;
  if (document.querySelector('[role="dialog"]')) return true;
  return false;
}

/** Normalise to the keys used in PLAN.md §5: 'Space', single lowercase letters, digits, '[', ']', '?'. */
export function keyName(e: KeyboardEvent): string {
  if (e.key === ' ' || e.code === 'Space') return 'Space';
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

/**
 * Register shortcut handlers (keys: 'Space', 'n', '1', '[', '?', …).
 * Space never fires when a button/link has focus (the control handles it).
 */
export function useHotkeys(handlers: Record<string, HotkeyHandler>, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || shouldIgnoreHotkey(e)) return;
      const k = keyName(e);
      const h = ref.current[k];
      if (!h) return;
      if (k === 'Space') {
        const t = e.target as HTMLElement | null;
        if (t && t.closest('button, a, [role="button"], [role="checkbox"], summary, label')) return;
      }
      e.preventDefault();
      h(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
