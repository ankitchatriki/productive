import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, pageTitleFor } from './Nav';

describe('nav', () => {
  it('has six items in shortcut order', () => {
    expect(NAV_ITEMS.map((n) => n.key)).toEqual(['1', '2', '3', '4', '5', '6']);
  });
  it('maps routes to page titles', () => {
    expect(pageTitleFor('/')).toBe('Today');
    expect(pageTitleFor('/plan/2026-10-26')).toBe('Plan week');
    expect(pageTitleFor('/courses/abc')).toBe('Courses');
  });
});
