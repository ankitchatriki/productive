// S3 (ROUND4 §3.4, §4.9, §6): the summit stand and seated break with the new rig, the level-of-detail choice,
// strain veins and reduced motion — engine on a stub canvas, plus the pure stand pose on a real summit trail.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installStubs, makeEngine, removeStubs, run } from './testkit/engineStub';
import { makeTrail } from './trail';
import { Gait } from './gait';
import { DEG, RIG, holdDForStone, stepToStand } from './rig';
import { M_PER_H, PACE_M } from '../../domain/mountain';
import type { ClimbInput } from './types';
import type { V } from './path';

beforeAll(installStubs);
afterAll(removeStubs);

const HPX = 234;
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
const lenM = 1500 * PACE_M;
const climb1 = (posM: number, atSummit = false): ClimbInput => ({ stage: 1, stageStartM: 0, stageLenM: lenM, posM, fromSummit: false, summits: atSummit ? 1 : 0, atSummit });
type Stats = Record<string, unknown>;

describe('summit stand (§3.4)', () => {
  for (const minutes of [25, 50]) {
    it(`${minutes}-minute climb: lean 0–6°, the near palm on the stone ≤ 2 px, feet on the legs (U1)`, () => {
      const lenH = (minutes * 60 * PACE_M) / M_PER_H;
      const trail = makeTrail({ stage: 4, startH: 210, lenH, fromSummit: true });
      const g = new Gait(5);
      g.snap(holdDForStone(trail, trail.geom.ledgeStart + 0.1), trail);
      const fr = g.pose(trail);
      const p = stepToStand(trail, fr.pose, fr.centre, 1);
      const lean = p.lean / DEG;
      expect(lean).toBeGreaterThanOrEqual(0); expect(lean).toBeLessThanOrEqual(6);
      expect(Math.abs(dist(p.hands![0], fr.centre) - RIG.boulderR - RIG.palm) * HPX).toBeLessThanOrEqual(2);
      p.legs.forEach((l, i) => expect(dist(l.end, p.feet![i].ankle) * HPX).toBeLessThanOrEqual(1));
      expect(p.veins ?? 0).toBe(0);
    });
  }
});

describe('set pieces and level of detail on the engine', () => {
  it('desktop climbing draws L3; the summit framing drops to L2 and the veins are gone', async () => {
    const e = await makeEngine(1440, 900);
    e.setClimb!(climb1(lenM * 0.5)); e.setProgress(0.5); e.setPhase('focus', { instant: true });
    run(3);
    expect(e.stats.tier).toBe(3);
    e.setClimb!(climb1(lenM, true)); e.setProgress(0); e.setPhase('complete');
    let waited = 0;
    while (e.stats.gait !== 'stand' && waited < 30) { run(0.5); waited += 0.5; }
    run(3);
    expect(e.stats.tier).toBe(2);
    e.destroy();
  });

  it('the phone draws L2', async () => {
    const e = await makeEngine(390, 844);
    e.setClimb!(climb1(lenM * 0.5)); e.setProgress(0.5); e.setPhase('focus', { instant: true });
    run(3);
    expect(e.stats.tier).toBe(2);
    e.destroy();
  });

  it('seated break: the whole figure is on screen at 1440×900 and 390×844', async () => {
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      const e = await makeEngine(w, h);
      e.setClimb!(climb1(lenM, true)); e.setProgress(0.2); e.setPhase('break', { instant: true });
      const seen: Stats[] = [];
      run(2, (s) => seen.push({ ...s }), e.stats as unknown as Stats);
      expect(seen.length).toBeGreaterThan(10);
      for (const s of seen) {
        expect(s.gait).toBe('sit');
        expect(s.figureOnScreen).toBe(true);
        const [x0, y0, x1, y1] = s.figBounds as number[];
        expect(x0).toBeGreaterThanOrEqual(0); expect(y0).toBeGreaterThanOrEqual(0);
        expect(x1).toBeLessThanOrEqual(w); expect(y1).toBeLessThanOrEqual(h);
      }
      e.destroy();
    }
  });

  it('strain veins draw on (no frame jumps by more than 0.15) and are off outside the beat', async () => {
    const { Gait: G } = await import('./gait');
    const trail = makeTrail({ stage: 3, startH: 60, lenH: (25 * 60 * PACE_M) / M_PER_H, fromSummit: false });
    const g = new G(11); g.snap(0, trail);
    let last = 0, maxStep = 0, peak = 0, seenStrain = false;
    for (let i = 1; i < 60 * 80; i++) {
      g.step(1 / 60, (i / 60) * 0.1333, trail, { climbing: true, lenH: 200 });
      const f = g.pose(trail), v = f.pose.veins ?? 0;
      if (f.mode === 'strain') seenStrain = true; else expect(v).toBe(0);
      maxStep = Math.max(maxStep, Math.abs(v - last)); peak = Math.max(peak, v); last = v;
    }
    expect(seenStrain).toBe(true);
    expect(peak).toBeGreaterThan(0.95);
    expect(maxStep).toBeLessThanOrEqual(0.15);
  });
});

describe('reduced motion (§4.9)', () => {
  it('while climbing the still is re-posed once a second, in the key pose, the stone turned to match its position', async () => {
    const g = globalThis as unknown as { window: { setTimeout: (f: () => void, ms: number) => number } };
    const delays: number[] = [];
    const saved = g.window.setTimeout;
    g.window.setTimeout = (_f, ms) => { delays.push(ms); return 1; };
    const e = await makeEngine(1440, 900, true);
    e.setClimb!(climb1(lenM * 0.5)); e.setProgress(0.5); e.setPhase('focus', { instant: true });
    e.setRunning(true);
    expect(delays[delays.length - 1]).toBe(1000);
    const a = { sB: e.stats.sB as number, rot: e.stats.rot as number, u: e.stats.u as number };
    e.setClimb!(climb1(lenM * 0.5 + 2 * PACE_M)); e.setRunning(true); // the next once-a-second redraw
    const b = { sB: e.stats.sB as number, rot: e.stats.rot as number, u: e.stats.u as number };
    expect(b.sB).toBeGreaterThan(a.sB);
    expect(b.u).toBeCloseTo(a.u, 9); // the same key pose
    e.destroy();
    g.window.setTimeout = saved;
  });
});

describe('the summit beat on the engine (V3, V4, V11)', () => {
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    it(`${w}×${h}: the figure stays fully on screen from the chime to the stand, which arrives in ≤ 7 s; the near hand stays on its wrist`, async () => {
      const e = await makeEngine(w, h);
      e.setClimb!(climb1(lenM * 0.999)); e.setProgress(0.999); e.setPhase('focus', { instant: true });
      run(3);
      e.setClimb!(climb1(lenM, true)); e.setProgress(0); e.setPhase('complete');
      const seen: Stats[] = [];
      run(12, (s) => seen.push({ ...s }), e.stats as unknown as Stats);
      const t0 = seen[0].clock as number;
      const iStand = seen.findIndex((s) => s.gait === 'stand');
      expect(iStand).toBeGreaterThan(0);
      console.log(`${w}×${h}: stand ${((seen[iStand].clock as number) - t0).toFixed(2)} s after the chime`);
      expect((seen[iStand].clock as number) - t0).toBeLessThanOrEqual(7);
      for (const s of seen) {
        const [x0, y0, x1, y1] = s.figBounds as number[];
        expect(x0).toBeGreaterThanOrEqual(0); expect(x1).toBeLessThanOrEqual(w);
        expect(y0).toBeGreaterThanOrEqual(0); expect(y1).toBeLessThanOrEqual(h);
        if (s.gait === 'stand' || s.gait === 'summit') expect(s.handGapPx as number).toBeLessThanOrEqual(2);
      }
      e.destroy();
    });
  }

  it('the stand is alive: breath, a weight shift and a look out move the figure (never frozen for 24 s)', async () => {
    const e = await makeEngine(1440, 900);
    e.setClimb!(climb1(lenM, true)); e.setProgress(0); e.setPhase('complete', { instant: true });
    const px: number[][] = [];
    run(24, (s) => px.push(s.pelvisPx as number[]), e.stats as unknown as Stats);
    const xs = px.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(2);
    e.destroy();
  });
});
