import type { Id } from './types';

export function newId(): Id {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
