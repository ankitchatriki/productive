// §4.2: the stone rolls forward. 60 s of climbing at 60 Hz on the real engine (stub canvas that records every
// ctx.rotate): the rotation strictly increases every frame, turns a marker clockwise on screen, and is proportional
// to the ground scroll (the camera's distance D) within 1% over the minute and 3% per frame, with no surges.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureClimb, installStubs, removeStubs } from './testkit/engineStub';
import { WALK } from './walk';

beforeAll(installStubs);
afterAll(removeStubs);

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  describe(`forward roll at ${w}×${h}`, () => {
    it('ρ strictly increasing and clockwise; ±1% of the ground scroll over 60 s; ±3% per frame; no surges', async () => {
      const { e, rows } = await captureClimb(w, h, 300, 61, { record: true });
      const live = rows.filter((r) => (r.clock as number) - (rows[0].clock as number) > 0.7); // after the 600 ms entrance
      expect(live.length).toBeGreaterThan(3500); // 60 fps while climbing
      const rho = live.map((r) => r.rotRec as number), D = live.map((r) => r.D as number);
      // (the recorded canvas rotation is the same number the stats report)
      live.forEach((r) => expect(r.rotRec).toBe(r.rot));
      const marker = (k: number) => {
        // the stone-local point (0.8 R, 0) after ctx.rotate(ρ) on the y-down canvas, relative to the centre
        const r = 0.8 * WALK.R * (live[k].Hpx as number);
        return Math.atan2(r * Math.sin(rho[k]), r * Math.cos(rho[k]));
      };
      const dr: number[] = [];
      let worstFrame = 0;
      for (let k = 1; k < live.length; k++) {
        const d = rho[k] - rho[k - 1];
        expect(d).toBeGreaterThan(0);
        let da = marker(k) - marker(k - 1); while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        expect(da).toBeGreaterThan(0); // clockwise on screen (atan2 on y-down)
        const ratio = (d * WALK.R) / (D[k] - D[k - 1]);
        worstFrame = Math.max(worstFrame, Math.abs(ratio - 1));
        dr.push(d);
      }
      const total = ((rho[rho.length - 1] - rho[0]) * WALK.R) / (D[D.length - 1] - D[0]);
      const mean = dr.reduce((a, b) => a + b, 0) / dr.length;
      let surge = 0;
      for (let k = 1; k < dr.length; k++) surge = Math.max(surge, Math.abs(dr[k] - dr[k - 1]));
      console.log(`${w}×${h}: roll/ground over 60 s ${total.toFixed(4)}, worst frame ${(worstFrame * 100).toFixed(2)}%, max |ΔΔρ| ${(surge / mean * 100).toFixed(3)}% of mean`);
      expect(Math.abs(total - 1)).toBeLessThan(0.01);
      expect(worstFrame).toBeLessThan(0.03);
      expect(surge).toBeLessThan(0.02 * mean);
      e.destroy();
    }, 60_000);
  });
}
