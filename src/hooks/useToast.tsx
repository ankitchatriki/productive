import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Toasts } from '../components/Toast';

export interface ToastAction { label: string; onClick: () => void }
export interface ToastItem { id: number; message: string; action?: ToastAction; duration: number }

interface ToastApi { show: (message: string, action?: ToastAction) => void }

const ToastContext = createContext<ToastApi>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback((message: string, action?: ToastAction) => {
    const item: ToastItem = { id: nextId.current++, message, action, duration: action ? 8000 : 4000 };
    setItems((list) => [...list, item].slice(-3));
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toasts items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
