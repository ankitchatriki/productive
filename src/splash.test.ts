// The splash lives inline in index.html (STRUGGLEMORE §2). Extract its skip rule and test it.
import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';

const src = html.split('/* splash-skip:start */')[1]?.split('/* splash-skip:end */')[0] ?? '';
const shouldSkip = new Function(`${src}; return shouldSkipSplash;`)() as (search: string, stored: string | null, now?: number) => boolean;

describe('opening splash', () => {
  it('has the exact quote, no attribution, and is hidden from assistive tech', () => {
    expect(html).toContain('Would climbing up a mountain be impressive if the mountain was flat?');
    expect(html).toMatch(/<div id="splash" role="presentation" aria-hidden="true">/);
    expect(html.indexOf('id="splash"')).toBeLessThan(html.indexOf('id="root"'));
  });
  it('shows by default and on unreadable data', () => {
    expect(shouldSkip('', null)).toBe(false);
    expect(shouldSkip('', '{not json')).toBe(false);
    expect(shouldSkip('', JSON.stringify({ settings: { showSplash: true }, focus: null }))).toBe(false);
    expect(shouldSkip('?nosplashy', null)).toBe(false);
  });
  it('skips for ?nosplash, a persisted immersive session, or showSplash false', () => {
    expect(shouldSkip('?nosplash', null)).toBe(true);
    expect(shouldSkip('?a=1&nosplash', null)).toBe(true);
    expect(shouldSkip('', JSON.stringify({ settings: {}, focus: { immersive: true } }))).toBe(true);
    expect(shouldSkip('', JSON.stringify({ settings: {}, focus: { immersive: false } }))).toBe(false);
    expect(shouldSkip('', JSON.stringify({ settings: { showSplash: false }, focus: null }))).toBe(true);
  });
  it('review S13: a stale immersive session (discarded on load) does not skip the splash', () => {
    const now = Date.parse('2026-10-27T14:00:00Z');
    const paused = (h: number) => JSON.stringify({ settings: {}, focus: { immersive: true, phase: 'paused', pausedAt: new Date(now - h * 3600e3).toISOString() } });
    expect(shouldSkip('', paused(7), now)).toBe(false);
    expect(shouldSkip('', paused(1), now)).toBe(true);
    const brk = JSON.stringify({ settings: {}, focus: { immersive: true, phase: 'break', breakEndsAt: new Date(now - 7 * 3600e3).toISOString() } });
    expect(shouldSkip('', brk, now)).toBe(false);
  });
});
