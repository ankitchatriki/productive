// A1 geometry (ROUND3_ART §2.2, §4.9, §9): figure size, the end never on screen during a block, visible progress,
// determinism. Pure: trail + camera, with the camera exactly on its target (the damped follow only lags behind it).
import { describe, expect, it } from 'vitest';
import { camLayout, clampCamX } from './camera';
import { makeTrail } from './trail';
import { M_PER_H, PACE_H, PACE_M, END_LEAD, buildStage } from '../../domain/mountain';
import { WALK } from './walk';

const VIEWPORTS: Array<[number, number]> = [[1280, 800], [1440, 900], [1920, 1080], [390, 844], [3440, 1440], [844, 390]];

describe('camera layout', () => {
  it('the figure scale is 0.17 h on desktop and min(0.13 h, 0.30 w) on a phone (ROUND6 §4.5)', () => {
    for (const [w, h] of VIEWPORTS.slice(0, 3)) expect(camLayout(w, h).Hpx / h).toBeCloseTo(0.17, 9);
    expect(camLayout(390, 844).Hpx).toBeCloseTo(Math.min(0.13 * 844, 0.30 * 390), 9);
    const l = camLayout(1440, 900);
    expect(l.Hpx).toBeCloseTo(153, 6); expect(l.anchor.x).toBeCloseTo(0.38 * 1440, 6); expect(l.anchor.y).toBeCloseTo(540, 6);
    expect(camLayout(3440, 1440).anchor.x).toBeCloseTo(0.5 * 3440 - 0.20 * 1440, 6);
    expect(camLayout(844, 390).Hpx).toBeCloseTo(78, 6);
  });
});

describe('the end is never on screen during focus', () => {
  for (const minutes of [25, 50]) {
    const lenH = (minutes * 60 * PACE_M) / M_PER_H;
    const trail = makeTrail({ stage: 3, startH: 123.4, lenH, fromSummit: true });
    for (const [w, h] of VIEWPORTS) {
      it(`${minutes} min at ${w}×${h}: no point under 14° in view, crest ≥ 0.3 H past the right edge, stone fully in view`, () => {
        const lay = camLayout(w, h);
        const crestX = trail.at(trail.geom.crestS - 0.3).x;
        // trail points that read as a top (heading < 14°) beyond the climb start
        const flats: number[] = [];
        for (let s = 0; s < trail.geom.s1; s += 1 / 16) if (trail.angleAt(s) < 14 && s > 3) flats.push(trail.at(s).x);
        const firstFlat = Math.min(...flats);
        expect(trail.at(trail.geom.crestS).x).toBeGreaterThanOrEqual(firstFlat - 1);
        for (let i = 0; i <= 200; i++) {
          const p = i / 200;
          const pelvis = trail.at(p * lenH);
          const camX = clampCamX(pelvis.x, crestX, w, lay.anchor.x, lay.Hpx);
          const rightEdge = camX + (w - lay.anchor.x) / lay.Hpx;
          // review Z1: the camera tracks him to the block's last second: the end clamp never engages during a block
          expect(camX).toBe(pelvis.x);
          expect(rightEdge).toBeLessThan(firstFlat);
          expect(trail.at(trail.geom.crestS).x - rightEdge).toBeGreaterThanOrEqual(0.3 * Math.cos(0.4) - 1e-6);
          // the stone (ΔS ahead of the camera point) stays on screen, so the climber walks into frame at the end
          const stoneRight = trail.at(p * lenH + WALK.dS).x + WALK.R;
          expect(stoneRight).toBeLessThanOrEqual(rightEdge + 1e-6);
        }
      });
    }
  }
});

describe('visible progress and determinism', () => {
  it('the ground scrolls ≥ 15 px per second at 1440×900 for 25- and 50-minute blocks (ROUND6 §9)', () => {
    for (const minutes of [25, 50]) {
      const lenH = (minutes * 60 * PACE_M) / M_PER_H;
      const trail = makeTrail({ stage: 1, startH: 0, lenH, fromSummit: false });
      const { Hpx, anchor } = camLayout(1440, 900);
      const crestX = trail.at(trail.geom.crestS - 0.3).x;
      const camAt = (sec: number) => clampCamX(trail.at(sec * PACE_H).x, crestX, 1440, anchor.x, Hpx);
      const total = minutes * 60;
      const pxPerSec = ((camAt(total) - camAt(0)) * Hpx) / total;
      expect(pxPerSec).toBeGreaterThanOrEqual(15);
    }
  });
  it('the same mountain state gives the same geometry; the climb ends END_LEAD before its crest fillet', () => {
    const a = buildStage({ stage: 7, startH: 512.25, lenH: 200, fromSummit: true });
    const b = buildStage({ stage: 7, startH: 512.25, lenH: 200, fromSummit: true });
    expect(Array.from(a.xs)).toEqual(Array.from(b.xs));
    expect(Array.from(a.ys)).toEqual(Array.from(b.ys));
    expect(a.crestS).toBeCloseTo(200 + END_LEAD - 0.3, 6);
  });
  it('no false tops on the incline: heading ≥ 14° from the col fillet to the crest', () => {
    const t = makeTrail({ stage: 2, startH: 77, lenH: 400, fromSummit: true });
    for (let s = 2; s < t.geom.crestS; s += 0.25) expect(t.angleAt(s)).toBeGreaterThanOrEqual(14);
  });
});
