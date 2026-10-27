import { describe, expect, it } from 'vitest';
import { SCENES } from './index';
import { SCENE_IDS } from './ids';

describe('scene registry', () => {
  it.each(SCENE_IDS.map((id) => [id]))('%s: create() returns every method; destroy without mount is safe', (id) => {
    const e = SCENES[id].create();
    for (const m of ['mount', 'setProgress', 'setPhase', 'resize', 'setRunning', 'setReducedMotion', 'destroy'] as const) expect(typeof e[m]).toBe('function');
    expect(() => e.destroy()).not.toThrow();
    expect(SCENES[id].label.length).toBeGreaterThan(0);
  });
});
