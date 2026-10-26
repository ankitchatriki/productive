import { useEffect } from 'react';

/** Page name in the tab title. The running timer overrides it (see TimerTitle in App). */
export function useDocumentTitle(page: string) {
  useEffect(() => {
    document.documentElement.dataset.page = page;
    if (!document.documentElement.dataset.timer) document.title = `${page} — Productive`;
  }, [page]);
}
