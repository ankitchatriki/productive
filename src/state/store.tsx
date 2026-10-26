import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react';
import type { AppData } from '../domain/types';
import type { Action } from './actions';
import { reducer } from './reducer';
import type { Storage } from '../storage/storage';
import { LocalStorageAdapter } from '../storage/localStorage';
import { emptyAppData } from '../storage/defaults';

interface StoreValue {
  data: AppData;
  dispatch: Dispatch<Action>;
  storage: Storage;
  storageError: string | null;
}

const StoreContext = createContext<StoreValue | null>(null);

const DEBOUNCE_MS = 300;

export function StoreProvider({ children, storage: injected }: { children: ReactNode; storage?: Storage }) {
  const storage = useMemo(() => injected ?? new LocalStorageAdapter(), [injected]);
  const [data, dispatch] = useReducer(reducer, undefined, () => storage.load() ?? emptyAppData());
  const [storageError, setStorageError] = useState<string | null>(null);
  const latest = useRef(data);
  const external = useRef(false);
  const timer = useRef<number | null>(null);
  latest.current = data;

  const flush = useRef(() => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    try {
      storage.save(latest.current);
      setStorageError(null);
    } catch (err) {
      const quota = err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
      setStorageError(quota
        ? 'Browser storage is full, so recent changes are not being saved. Export a backup from Settings now.'
        : 'Changes could not be saved to browser storage. Export a backup from Settings.');
    }
  });

  // Debounced persistence after any change.
  useEffect(() => {
    if (external.current) { external.current = false; return; }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush.current(), DEBOUNCE_MS);
  }, [data]);

  // Synchronous save on pagehide; cross-tab sync (last writer wins).
  useEffect(() => {
    const onHide = () => flush.current();
    window.addEventListener('pagehide', onHide);
    const unsubscribe = storage.subscribe((incoming) => {
      external.current = true;
      dispatch({ type: 'data/replace', data: incoming });
    });
    return () => { window.removeEventListener('pagehide', onHide); unsubscribe(); };
  }, [storage]);

  const value = useMemo(() => ({ data, dispatch, storage, storageError }), [data, storage, storageError]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useStoreContext(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export function useStore(): AppData {
  return useStoreContext().data;
}

export function useDispatch(): Dispatch<Action> {
  return useStoreContext().dispatch;
}

export function useStorageInfo() {
  const { storage, storageError } = useStoreContext();
  return { storage, storageError };
}
