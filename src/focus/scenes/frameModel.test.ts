// P1 (ROUND6_PLAN §3.4, §10): what the renderer is handed. The crest line is the trail projected (the feet and the
// stone stand on it), the contact windows sit under the feet and the stone, the model is deterministic per posM, and
// each climb gets its own rock seed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installStubs, makeEngine, removeStubs, run } from './testkit/engineStub';
import { M_PER_H, PACE_M } from '../../domain/mountain';
import type { FrameModel } from './frameModel';
import { makeTrail } from './trail';

beforeAll(installStubs);
afterAll(removeStubs);
const lenM = 1500 * PACE_M;
const climb = (posM: number, stage = 1) => ({ stage, stageStartM: 0, stageLenM: lenM, posM, fromSummit: false, summits: 0, atSummit: false });
const modelOf = (e: unknown) => (e as { model(): FrameModel }).model();

describe('the frame model', () => {
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    it(`${w}×${h}: the crest line is the trail projected; the planted feet and the stone's contact stand on it (±1 px)`, async () => {
      const e = await makeEngine(w, h);
      e.setClimb!(climb(600 * PACE_M)); e.setProgress(0.4); e.setPhase('focus', { instant: true });
      run(2);
      const m = modelOf(e);
      const trail = makeTrail({ stage: 1, startH: 0, lenH: lenM / M_PER_H, fromSummit: false });
      const zH = m.cam.Hpx * m.cam.zoom;
      const S = (x: number, y: number) => ({ x: m.cam.ax + (x - m.cam.x) * zH, y: m.cam.ay - (y - m.cam.y) * zH });
      expect(m.ridge.length).toBe(Math.ceil(w));
      for (let i = 0; i < m.ridge.length; i += 37) { const wx = m.cam.x + (i + 0.5 - m.cam.ax) / zH; expect(Math.abs(m.ridge[i] - S(wx, trail.groundY(wx)).y)).toBeLessThan(1e-3); }
      for (const f of m.skel!.feet.filter((ft) => ft.planted)) {
        const p = S(f.ball.x, f.ball.y), col = Math.round(p.x - 0.5);
        expect(Math.abs(m.ridge[col] - p.y)).toBeLessThanOrEqual(1);
        expect(m.contacts.some((c) => Math.abs(c - f.ball.x) < 1e-9)).toBe(true);
      }
      // the stone touches the crest line: its circle's lowest clearance above the line is within 1 px
      const c = S(m.stone.c.x, m.stone.c.y), Rp = m.stone.R * zH;
      let gap = Infinity;
      for (let a = 0; a < 360; a += 0.25) { const x = c.x + Rp * Math.cos((a * Math.PI) / 180), y = c.y + Rp * Math.sin((a * Math.PI) / 180); const col = Math.round(x - 0.5); if (col >= 0 && col < m.ridge.length) gap = Math.min(gap, m.ridge[col] - y); }
      expect(Math.abs(gap)).toBeLessThanOrEqual(1);
      e.destroy();
    });
  }
  it('deterministic: the same posM gives the same model; each climb has its own rock seed', async () => {
    const at = async (stage: number) => { const e = await makeEngine(1440, 900, true); e.setClimb!(climb(523 * PACE_M, stage)); e.setProgress(0.3); e.setPhase('focus', { instant: true }); const m = modelOf(e); e.destroy(); return m; };
    const a = await at(1), b = await at(1), c = await at(2);
    expect(Array.from(a.ridge)).toEqual(Array.from(b.ridge));
    expect(a.stone.rot).toBe(b.stone.rot);
    expect(a.seed).toBe(b.seed);
    expect(c.seed).not.toBe(a.seed);
  });
  it('a 4-H-or-more lead of incline is in view ahead of the stone at 1440×900 (the crest still hidden)', async () => {
    const e = await makeEngine(1440, 900);
    e.setClimb!(climb(600 * PACE_M)); e.setProgress(0.4); e.setPhase('focus', { instant: true });
    run(1);
    const m = modelOf(e);
    const zH = m.cam.Hpx * m.cam.zoom;
    const stoneRight = m.cam.ax + (m.stone.c.x + m.stone.R - m.cam.x) * zH;
    expect((1440 - stoneRight) / zH).toBeGreaterThanOrEqual(3.5);
    e.destroy();
  });
});
