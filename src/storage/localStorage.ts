import type { AppData } from '../domain/types';
import { validateAppData } from '../domain/validate';
import type { Storage } from './storage';

export const STORAGE_KEY = 'productive:v1';
export const CORRUPT_KEY = 'productive:v1:corrupt';

/** Minimal Web Storage shape so tests can pass an in-memory fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function parseStored(raw: string): AppData | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = validateAppData(parsed);
    return Array.isArray(result) ? null : result;
  } catch {
    return null;
  }
}

export class LocalStorageAdapter implements Storage {
  private corruptThisSession = false;

  constructor(
    private store: KeyValueStore = window.localStorage,
    private win: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window !== 'undefined' ? window : null,
  ) {}

  load(): AppData | null {
    let raw: string | null = null;
    try {
      raw = this.store.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
    if (raw === null) return null;
    const data = parseStored(raw);
    if (!data) {
      console.warn('StruggleMore: stored data was unreadable; starting fresh. A raw copy was kept under', CORRUPT_KEY);
      try { this.store.setItem(CORRUPT_KEY, raw); } catch { /* ignore */ }
      this.corruptThisSession = true;
      return null;
    }
    return data;
  }

  save(data: AppData): void {
    this.store.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  clear(): void {
    this.store.removeItem(STORAGE_KEY);
  }

  subscribe(onExternalChange: (data: AppData) => void): () => void {
    if (!this.win) return () => {};
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue === null) return;
      const data = parseStored(e.newValue);
      if (data) onExternalChange(data);
    };
    this.win.addEventListener('storage', handler as EventListener);
    return () => this.win?.removeEventListener('storage', handler as EventListener);
  }

  corruptCopy(): string | null {
    if (!this.corruptThisSession) return null;
    try { return this.store.getItem(CORRUPT_KEY); } catch { return null; }
  }

  discardCorrupt(): void {
    this.corruptThisSession = false;
    try { this.store.removeItem(CORRUPT_KEY); } catch { /* ignore */ }
  }

  approxBytes(): number {
    try {
      const raw = this.store.getItem(STORAGE_KEY);
      return raw ? raw.length * 2 : 0; // UTF-16
    } catch {
      return 0;
    }
  }
}
