import { useEffect, useRef, type RefObject } from 'react';

export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface FocusTrapOptions {
  active: boolean;
  onEscape?: () => void;
  /** Element to focus first; defaults to the first focusable. */
  initialFocus?: () => HTMLElement | null | undefined;
}

/**
 * Shared by Modal and the focus overlay: focuses the first control, traps Tab,
 * handles Esc for the top-most dialog only, and restores focus on close.
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, { active, onEscape, initialFocus }: FocusTrapOptions) {
  const escRef = useRef(onEscape);
  escRef.current = onEscape;
  const initRef = useRef(initialFocus);
  initRef.current = initialFocus;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = initRef.current?.() || node?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (!node) return;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== node) return;
      if (e.key === 'Escape' && escRef.current) {
        e.preventDefault();
        e.stopPropagation();
        escRef.current();
      } else if (e.key === 'Tab') {
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (!node.contains(document.activeElement)) { e.preventDefault(); firstEl.focus(); }
        else if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [active, ref]);
}
