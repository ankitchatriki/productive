// S0: the stone rolls forward (ROUND4 §5): clockwise on screen by exactly the distance its centre travels, never
// back outside a slip, and a slip spins it back then forward again. Engine on a stub canvas that records rotate().
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installStubs, makeEngine, removeStubs, run, stub } from './testkit/engineStub';
import { makeTrail } from './trail';
import { RIG } from './rig';
import { M_PER_H, PACE_M } from '../../domain/mountain';

beforeAll(installStubs);
afterAll(removeStubs);

const lenM = 1500 * PACE_M;
const R = RIG.boulderR;

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  describe(`forward roll at ${w}×${h}`, () => {
    it('rotation = +arc/R every frame, clockwise forward, ratcheted, slip back then forward, top marker moves forward', async () => {
      const e = await makeEngine(w, h, false, true);
      const trail = makeTrail({ stage: 1, startH: 0, lenH: lenM / M_PER_H, fromSummit: false });
      const climb = (posM: number, atSummit = false) => ({ stage: 1, stageStartM: 0, stageLenM: lenM, posM, fromSummit: false, summits: atSummit ? 1 : 0, atSummit });
      // start 85 s before the end of the climb, so the run includes a strain beat (never in the first 30 s) and the summit
      let focused = 1500 - 85;
      e.setClimb!(climb(focused * PACE_M)); e.setProgress(focused / 1500); e.setPhase('focus', { instant: true });
      const rows: Array<{ sB: number; rot: number; tag: string }> = [];
      const rec = (s: Record<string, unknown>) => {
        const st = s.strainT as number;
        rows.push({ sB: s.sB as number, rot: stub.rotates[stub.rotates.length - 1], tag: st >= 1.4 && st < 2.6 ? 'slip' : (s.gait as string) });
      };
      for (let k = 0; k < 85; k++) {
        focused += 1;
        e.setClimb!(climb(Math.min(1500, focused) * PACE_M)); e.setProgress(Math.min(1, focused / 1500));
        run(1, rec, e.stats as unknown as Record<string, unknown>);
      }
      e.setClimb!(climb(lenM, true)); e.setProgress(0); e.setPhase('complete');
      run(10, rec, e.stats as unknown as Record<string, unknown>);
      expect(rows.length).toBeGreaterThan(2500); // the scene renders at 30 fps (60 during set pieces)

      let slipBack = 0, strainNet = 0, inStrain = false, sawSlip = false, maxStep = 0;
      for (let i = 0; i + 1 < rows.length; i++) {
        const a = rows[i], b = rows[i + 1];
        const dA = trail.centreArc(b.sB, R) - trail.centreArc(a.sB, R);
        const dR = b.rot - a.rot;
        // exactly the distance travelled, clockwise (positive canvas rotation) when moving forward
        expect(Math.abs(dR - dA / R)).toBeLessThan(1e-6);
        if (Math.abs(dA) > 1e-7) expect(Math.sign(dR)).toBe(Math.sign(dA));
        // the ratchet: never back outside a slip
        if (b.tag !== 'slip' && a.tag !== 'slip') expect(dA).toBeGreaterThanOrEqual(-1e-9);
        if (b.tag === 'slip' && dR < 0) { sawSlip = true; slipBack += dR; }
        const strainNow = b.tag === 'slip' || b.tag === 'strain';
        if (strainNow) { strainNet += dR; inStrain = true; } else if (inStrain) { expect(Math.abs(strainNet)).toBeLessThan(1e-4); strainNet = 0; inStrain = false; }
        maxStep = Math.max(maxStep, Math.abs(dR));
      }
      expect(sawSlip).toBe(true);
      expect(slipBack).toBeLessThan(-0.05); // ≈ −0.095 rad back during the slip
      // strobe guard at 60 Hz sampling; S0 bound for the round-3 step cycle (tightened to 0.02 rad at 30 fps in S2)
      expect(maxStep).toBeLessThan(0.05); // interim for the old step cycle at the new stride; S2 brings it under 0.02 at 30 fps
      // the sprite point at the stone's top at frame i, after ctx.rotate(+θ), sits at screen x = r·sin(θ(i+k) − θ(i))
      // relative to the centre: while the stone moves forward the top of the disc moves forward (rightwards)
      for (const i of [100, 400, 900]) {
        const a = rows[i], b = rows[i + 10];
        if (b.sB > a.sB + 1e-4 && a.tag !== 'slip' && b.tag !== 'slip') expect(Math.sin(b.rot - a.rot)).toBeGreaterThan(0);
      }
      e.destroy();
    }, 30_000);
  });
}
