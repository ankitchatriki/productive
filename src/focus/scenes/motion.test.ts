// F1 (ROUND5_SISYPHUS §8): the walk as the engine renders it. 60 s captures at 60 Hz on a stub canvas, the climb fed
// once a second: constant speed (no stop-and-go), feet locked on screen, never stopping, pause and resume ramps,
// and a reload reproducing the same frame.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureClimb, installStubs, makeEngine, removeStubs, run } from './testkit/engineStub';
import { WALK, type Skel } from './walk';
import { M_PER_H, PACE_M } from '../../domain/mountain';
import { makeTrail } from './trail';

beforeAll(installStubs);
afterAll(removeStubs);

type Row = Record<string, unknown>;
const sk = (r: Row) => r.skel as Skel;

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  describe(`the rendered walk at ${w}×${h}`, () => {
    let rows: Row[] = [];
    beforeAll(async () => { const c = await captureClimb(w, h, 300, 61); rows = c.rows; c.e.destroy(); }, 60_000);

    it('constant speed: the pelvis never moves slower than 0.90 or faster than 1.10 of its mean (after the 600 ms entrance)', () => {
      const live = rows.filter((r) => (r.clock as number) - (rows[0].clock as number) > 0.6);
      const v = live.slice(1).map((r, k) => (sk(r).pelvis.x - sk(live[k]).pelvis.x) / ((r.clock as number) - (live[k].clock as number)));
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      const lo = Math.min(...v) / mean, hi = Math.max(...v) / mean;
      console.log(`${w}×${h}: pelvis horizontal speed ${lo.toFixed(3)}–${hi.toFixed(3)} of mean (${v.length} frames); camera = trail at D`);
      expect(lo).toBeGreaterThanOrEqual(0.90);
      expect(hi).toBeLessThanOrEqual(1.10);
      expect(Math.min(...v)).toBeGreaterThan(0); // never stops
    });

    it('feet locked: a planted ball drifts < 1 px on screen once the camera scroll is added back', () => {
      let worst = 0;
      for (const i of [0, 1] as const) {
        let ref: { x: number; y: number } | null = null;
        for (const r of rows) {
          const f = sk(r).feet[i], Hz = (r.Hpx as number) * (r.zoom as number), a = r.anchor as number[];
          // screen position plus the camera's screen displacement since the frame = world position × Hpx
          const sx = a[0] + (f.ball.x - (r.camX as number)) * Hz + (r.camX as number) * Hz, sy = a[1] - (f.ball.y - (r.camY as number)) * Hz - (r.camY as number) * Hz;
          if (!f.planted) { ref = null; continue; }
          if (!ref) ref = { x: sx, y: sy };
          worst = Math.max(worst, Math.hypot(sx - ref.x, sy - ref.y));
        }
      }
      console.log(`${w}×${h}: stance-foot drift ${worst.toExponential(2)} px`);
      expect(worst).toBeLessThan(1);
    });

    it('the camera is rigid on the distance clock: the ground point at D sits on the anchor every frame (no spring, no filter)', () => {
      const trail = makeTrail({ stage: 1, startH: 0, lenH: (1500 * PACE_M) / M_PER_H, fromSummit: false });
      for (const r of rows) {
        const p = trail.at(r.D as number);
        // (x carries the end clamp's soft minimum: ≈ 2e-4 H, constant while it is far away)
        expect(Math.abs((r.camX as number) - p.x)).toBeLessThan(5e-4);
        expect(Math.abs((r.camY as number) - p.y)).toBeLessThan(1e-12);
      }
    });
  });
}

describe('pause, resume and persistence', () => {
  const lenM = 1500 * PACE_M;
  const climb = (posM: number) => ({ stage: 1, stageStartM: 0, stageLenM: lenM, posM, fromSummit: false, summits: 0, atSummit: false });

  it('pause stops everything within 400 ms; resume reaches 95% speed by 600 ms', async () => {
    const e = await makeEngine(1440, 900);
    let f = 400;
    e.setClimb!(climb(f * PACE_M)); e.setProgress(f / 1500); e.setPhase('focus', { instant: true });
    const st = e.stats as unknown as Row;
    for (let k = 0; k < 5; k++) { f++; e.setClimb!(climb(f * PACE_M)); run(1); }
    e.setPhase('paused');
    const after: Row[] = [];
    run(0.45, (s) => after.push({ ...s }), st);
    expect(after[after.length - 1].e).toBe(0);
    const Dp = e.stats.D!; const phiP = e.stats.phi!;
    run(2, (s) => { expect(s.D).toBe(Dp); expect(s.phi).toBe(phiP); }, st); // walk, stone and camera frozen
    e.setPhase('focus');
    const res: Row[] = [];
    for (let k = 0; k < 2; k++) { f++; e.setClimb!(climb(f * PACE_M)); run(1, (s) => res.push({ ...s }), st); }
    const t0 = res[0].clock as number;
    const at600 = res.find((r) => (r.clock as number) - t0 >= 0.6 - 1e-9)!;
    console.log(`resume: e = ${(at600.e as number).toFixed(3)} at 600 ms`);
    expect(at600.e as number).toBeGreaterThanOrEqual(0.95);
    e.destroy();
  });

  it('a reload at the same posM reproduces φ, ρ and the pose (1e-6)', async () => {
    const frame = async () => {
      const e = await makeEngine(1440, 900);
      e.setClimb!(climb(523.25 * PACE_M)); e.setProgress(0.3); e.setPhase('focus', { instant: true });
      run(1 / 60);
      const s = { phi: e.stats.phi!, rot: e.stats.rot!, skel: e.stats.skel! };
      e.destroy();
      return s;
    };
    const a = await frame(), b = await frame();
    expect(Math.abs(a.phi - b.phi)).toBeLessThan(1e-6);
    expect(Math.abs(a.rot - b.rot)).toBeLessThan(1e-6);
    expect(Math.abs(a.skel.pelvis.x - b.skel.pelvis.x) + Math.abs(a.skel.arms[0].elbow.y - b.skel.arms[0].elbow.y)).toBeLessThan(1e-6);
    expect(a.phi).toBeCloseTo(((523.25 * PACE_M) / M_PER_H / WALK.L) % 1, 2);
  });
});
