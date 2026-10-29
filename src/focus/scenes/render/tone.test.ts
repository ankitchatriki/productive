// P0 (ROUND6_PLAN §10): the print's tone curve and sepia toning, and the renderer selection.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TONE_STOPS, gradeFor, luma, printDensity, toneAt, toneLUT } from './tone';
import { installStubs, makeEngine, removeStubs, run, stubCanvas } from '../testkit/engineStub';
import { PACE_M } from '../../../domain/mountain';

describe('tone (§3.6)', () => {
  it('the LUT reproduces the toning stops within ±3 per channel', () => {
    const lut = toneLUT(0);
    for (const [P, rgb] of TONE_STOPS.filter(([p]) => p >= 0.075 && p <= 0.86)) {
      const i = Math.round(P * 255);
      for (let c = 0; c < 3; c++) expect(Math.abs(lut[i * 4 + c] - rgb[c]), `P ${P} channel ${c}`).toBeLessThanOrEqual(3);
    }
  });
  it('a 0–1 scene ramp prints from L 18–22 to 208–214, nothing outside [15, 216]', () => {
    const Ls = Array.from({ length: 401 }, (_, i) => (i / 400) * 4);
    const L = Ls.map((x) => luma(toneAt(printDensity(x))));
    expect(L[0]).toBeGreaterThanOrEqual(18); expect(L[0]).toBeLessThanOrEqual(22);
    const top = L[L.length - 1];
    expect(top).toBeGreaterThanOrEqual(208); expect(top).toBeLessThanOrEqual(214);
    for (const v of L) { expect(v).toBeGreaterThanOrEqual(15); expect(v).toBeLessThanOrEqual(216); }
    for (let i = 1; i < L.length; i++) expect(L[i]).toBeGreaterThanOrEqual(L[i - 1] - 1e-9); // monotonic
  });
  it('mids are the warmest; chroma stays a tone (max − min ≤ 36); warmth scales the tint', () => {
    const chroma = (c: number[]) => Math.max(...c) - Math.min(...c);
    const mid = toneAt(0.62), dark = toneAt(0.14);
    expect(mid[0] - mid[2]).toBeGreaterThan(dark[0] - dark[2]);
    for (let P = 0.075; P <= 0.86; P += 0.01) expect(chroma(toneAt(P))).toBeLessThanOrEqual(36);
    expect(toneAt(0.5, 1)[0] - toneAt(0.5, 1)[2]).toBeGreaterThan(toneAt(0.5, -1)[0] - toneAt(0.5, -1)[2]);
  });
  it('grade: warmer and slightly brighter later in the block; the break is dim and cool', () => {
    expect(gradeFor('focus', 0.9).warmth).toBeGreaterThan(gradeFor('focus', 0).warmth);
    expect(gradeFor('break', 0.5).exposure).toBeCloseTo(0.80, 6);
    expect(gradeFor('break', 0.5).warmth).toBeLessThan(0);
  });
});

describe('renderer selection (§3.7)', () => {
  beforeAll(installStubs);
  afterAll(removeStubs);
  it('with no working WebGL the Canvas 2D renderer is chosen', async () => {
    const { setRendererFactory } = await import('./renderer');
    setRendererFactory(null);
    const { createSisyphus } = await import('../sisyphus');
    const e = createSisyphus();
    // the stub canvas offers no real GL program support, so GL fails to compile and the engine falls back
    e.mount(stubCanvas(800, 600) as unknown as HTMLCanvasElement, { reducedMotion: true, colorScheme: 'dark', accent: '#000' });
    expect(e.stats.renderer).toBe('2d');
    e.destroy();
  });
  it('a GL context lost twice in a minute asks the engine to fall back', async () => {
    const { GLRenderer } = await import('./glRenderer');
    const r = new GLRenderer();
    let failed = 0;
    r.onFail = () => { failed++; };
    const lost = (r as unknown as { onLost: (e: Event) => void }).onLost;
    lost({ preventDefault() {} } as Event);
    expect(failed).toBe(0);
    lost({ preventDefault() {} } as Event);
    expect(failed).toBe(1);
  });
  it('review K2: a lost context that is not restored within 1 s falls back too; a restore in time does not', async () => {
    vi.useFakeTimers();
    try {
      const { GLRenderer } = await import('./glRenderer');
      const r = new GLRenderer();
      let failed = 0;
      r.onFail = () => { failed++; };
      (r as unknown as { onLost: (e: Event) => void }).onLost({ preventDefault() {} } as Event);
      vi.advanceTimersByTime(900); expect(failed).toBe(0);
      vi.advanceTimersByTime(200); expect(failed).toBe(1);
      const r2 = new GLRenderer();
      let failed2 = 0;
      r2.onFail = () => { failed2++; };
      (r2 as unknown as { onLost: (e: Event) => void }).onLost({ preventDefault() {} } as Event);
      (r2 as unknown as { onRestored: () => void }).onRestored();
      vi.advanceTimersByTime(2000); expect(failed2).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});

describe('the frame-time governor (review K1)', () => {
  beforeAll(installStubs);
  afterAll(removeStubs);
  it('a GPU-bound device steps down by delivered frame interval (CPU time stays tiny): 30 fps, Q 0.75, Q 0.5', async () => {
    const e = await makeEngine(1440, 900);
    const lenM = 1500 * PACE_M;
    e.setClimb!({ stage: 1, stageStartM: 0, stageLenM: lenM, posM: 300 * PACE_M, fromSummit: false, summits: 0, atSummit: false });
    e.setProgress(0.2); e.setPhase('focus', { instant: true });
    run(3, undefined, undefined, 60);
    expect(e.stats.quality).toBe(1);
    run(40, undefined, undefined, 12);              // rAF delivered at 12 Hz (83 ms) while the JS takes ~0 ms
    expect(e.stats.quality).toBe(0.5);
    expect(e.stats.intervalMs as number).toBeGreaterThan(45);
    e.destroy();
  });
});

describe('time of block (§6.4)', () => {
  const rb = (P: number, w: number) => { const c = toneAt(P, w); return c[0] - c[2]; };
  it('the mid-tones warm by 3–8 levels from p = 0 to p = 0.9; the break is cool (mid R−B ≤ 18)', () => {
    const d = rb(0.5, gradeFor('focus', 0.9).warmth) - rb(0.5, gradeFor('focus', 0).warmth);
    expect(d).toBeGreaterThanOrEqual(3); expect(d).toBeLessThanOrEqual(8);
    expect(rb(0.5, gradeFor('break', 0.5).warmth)).toBeLessThanOrEqual(18);
  });
});
