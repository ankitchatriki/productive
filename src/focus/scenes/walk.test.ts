// F0 (ROUND5_SISYPHUS §8): the pure walk. 4,000 samples of D over 10 strides at 16°, 22°, 28° and 32°, plus a real
// trail stretch where the slope varies: foot lock, seam continuity, C1 joint curves, the pose table, arms, speed, roll.
import { describe, expect, it } from 'vitest';
import { DEG, WALK, dist, handPoint, interior, thighAngle, walkPose, type WalkPose, type WalkTrail } from './walk';
import { makeTrail } from './trail';
import { BODY, LEG_CHAIN } from './body';

const line = (thDeg: number): WalkTrail => {
  const th = thDeg * DEG, t = { x: Math.cos(th), y: Math.sin(th) }, n = { x: -Math.sin(th), y: Math.cos(th) };
  return { at: (s) => ({ x: t.x * s, y: t.y * s }), angleAt: () => thDeg, centreAt: (s, R) => ({ x: t.x * s + n.x * R, y: t.y * s + n.y * R }), centreArc: (s) => s };
};
const real = makeTrail({ stage: 3, startH: 60, lenH: 300, fromSummit: false });
const TRAILS: Array<[string, WalkTrail, number]> = [['16°', line(16), 4], ['22°', line(22), 4], ['28°', line(28), 4], ['32°', line(32), 4], ['real trail', real, 41.3]];
const N = 4000, SPAN = 10 * WALK.L;
const p = (D: number, i: 0 | 1) => (D / WALK.L + (i ? 0.5 : 0)) % 1;

/** Every joint channel the spec lists, in degrees. */
function channels(w: WalkPose): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of [0, 1] as const) {
    const l = w.legs[i], a = w.arms[i];
    out[`thigh${i}`] = thighAngle(l) / DEG;
    out[`knee${i}`] = interior(l.hip, l.knee, l.ankle);
    out[`foot${i}`] = w.feet[i].ang / DEG;
    out[`elbow${i}`] = interior(a.shoulder, a.elbow, a.wrist);
    out[`shoulder${i}`] = (Math.atan2(a.elbow.y - a.shoulder.y, a.elbow.x - a.shoulder.x)) / DEG;
  }
  out.lean = w.lean / DEG;
  out.headPitch = (w.headAxis - w.lean) / DEG;
  return out;
}

for (const [name, trail, D0] of TRAILS) {
  describe(`walk at ${name}`, () => {
    const poses = Array.from({ length: N }, (_, k) => walkPose(trail, D0 + (k / N) * SPAN, 0));

    it('foot lock: a planted ball deviates < 1e-6 H from its contact', () => {
      for (const i of [0, 1] as const) {
        let ref: { x: number; y: number } | null = null, worst = 0, stances = 0;
        for (const w of poses) {
          const f = w.feet[i];
          if (!f.planted) { ref = null; continue; }
          if (!ref) { ref = f.ball; stances++; }
          worst = Math.max(worst, dist(ref, f.ball));
        }
        expect(stances).toBeGreaterThanOrEqual(9);
        expect(worst).toBeLessThan(1e-6);
      }
    });

    it('seams: feet continuous in position (< 1e-6 H) and velocity (< 1% of v) at every lift and landing', () => {
      for (const i of [0, 1] as const) {
        const seams: number[] = [];
        const o = i ? 0.5 : 0;
        for (let n = Math.ceil(D0 / WALK.L) - 1; n * WALK.L < D0 + SPAN; n++) seams.push((n - o + WALK.beta) * WALK.L, (n - o + 1) * WALK.L);
        for (const s of seams.filter((x) => x > D0 && x < D0 + SPAN)) {
          const e = 1e-9, h = 1e-4;
          const at = (D: number) => walkPose(trail, D, 0).feet[i].ball;
          expect(dist(at(s - e), at(s + e))).toBeLessThan(1e-6);
          const vl = dist(at(s), at(s - h)) / h, vr = dist(at(s + h), at(s)) / h;
          expect(Math.abs(vl - vr)).toBeLessThan(0.01);
        }
      }
    });

    it('C1 joint curves: < 0.05° and derivatives within 2% of peak at every seam; no second-difference spikes', () => {
      const ch = poses.map(channels);
      const keys = Object.keys(ch[0]);
      const step = SPAN / N;
      const seams: number[] = [];
      for (let n = Math.ceil(D0 / WALK.L); n * WALK.L < D0 + SPAN; n++) seams.push(n * WALK.L, (n + WALK.beta) * WALK.L, (n - 0.5 + WALK.beta) * WALK.L);
      for (const k of keys) {
        const vals = ch.map((c) => c[k]);
        const d1 = vals.slice(1).map((v, j) => (v - vals[j]) / step);
        const peak = Math.max(...d1.map(Math.abs), 1e-6);
        for (const s of seams.filter((x) => x > D0 + 0.01 && x < D0 + SPAN - 0.01)) {
          const f = (D: number) => channels(walkPose(trail, D, 0))[k];
          const e = 1e-9, h = 2e-4;
          expect(Math.abs(f(s + e) - f(s - e))).toBeLessThan(0.05);
          const dl = (f(s) - f(s - h)) / h, dr = (f(s + h) - f(s)) / h;
          expect(Math.abs(dl - dr), `${k} at D=${s.toFixed(3)}`).toBeLessThan(0.02 * peak + 1e-6);
        }
        // spikes: a second difference > 8× the median of its neighbourhood (±25 samples, 1/16 of a cycle). (The thigh's
        // reversal at toe-off is a fast but smooth feature that peaks at ≈ 7×; a kink or a jump measures in the hundreds.)
        const d2 = vals.slice(2).map((v, j) => Math.abs(v - 2 * vals[j + 1] + vals[j]));
        const floor = 1e-9 + 0.02 * Math.max(...d2); // (beside a flat stretch the median is 0)
        for (let j = 25; j < d2.length - 25; j++) {
          const nb = d2.slice(j - 25, j + 26).filter((_, q) => q !== 25).sort((a, b) => a - b);
          expect(d2[j], `${k} spike at sample ${j}`).toBeLessThanOrEqual(8 * nb[nb.length >> 1] + floor);
        }
      }
    });

    it('arms: elbows 156–170°, palms on the stone (gap < 0.002 H), protraction ≤ 0.008 H', () => {
      for (const w of poses) {
        for (const i of [0, 1] as const) {
          const a = w.arms[i];
          const e = interior(a.shoulder, a.elbow, a.wrist);
          expect(e).toBeGreaterThanOrEqual(156); expect(e).toBeLessThanOrEqual(170);
          expect(Math.abs(dist(handPoint(w.hands[i], { x: 0, y: 0 }, 1), w.centre) - BODY.R)).toBeLessThan(0.002);
          expect(dist(a.wrist, handPoint(w.hands[i], BODY.wristLocal, 1))).toBeLessThan(1e-6); // built from the wrist
          expect(Math.abs(w.protraction[i])).toBeLessThanOrEqual(0.008);
        }
      }
    });

    it('legs: stance reach ≤ 0.985 and exact; solved reach ≤ 0.9965; the rear knee opens ≥ 156° at toe-off', () => {
      for (const w of poses) for (const i of [0, 1] as const) {
        const f = w.feet[i], r = dist(w.pelvis, f.ankle) / LEG_CHAIN;
        expect(dist(w.pelvis, w.legs[i].ankle) / LEG_CHAIN).toBeLessThanOrEqual(0.9965);
        if (f.planted) { expect(r).toBeLessThanOrEqual(0.985); expect(dist(w.legs[i].ankle, f.ankle)).toBeLessThan(1e-5); } // (≤ 0.002 px)
        else expect(dist(w.legs[i].ankle, f.ankle)).toBeLessThan(0.002);
      }
      for (const i of [0, 1] as const) {
        const win = poses.filter((w) => p(w.D, i) >= 0.62 && p(w.D, i) <= 0.63).map((w) => interior(w.legs[i].hip, w.legs[i].knee, w.legs[i].ankle));
        expect(Math.max(...win)).toBeGreaterThanOrEqual(156); // review Z3: a softer knee lock (no flick) costs ≈ 3°
      }
    });

    it('speed: along the slope the pelvis moves at 0.94–1.06 v for a constant Ḋ = v (review Z4: the bob runs on the normal)', () => {
      const lim = name === 'real trail' ? 0.08 : 0.06; // (on the real trail the slope offset δ(θ) adds ≤ ±2%)
      for (let k = 1; k < N; k++) {
        const a = poses[k - 1], b = poses[k], th = (trail.angleAt(b.D) * Math.PI) / 180;
        const along = ((b.pelvis.x - a.pelvis.x) * Math.cos(th) + (b.pelvis.y - a.pelvis.y) * Math.sin(th)) / (b.D - a.D);
        expect(Math.abs(along - 1)).toBeLessThanOrEqual(lim);
      }
    });

    it('no knee flick at toe-off (review Z3): the knee peak acceleration is ≤ 32× its median over the cycle', () => {
      const P = poses.filter((_, k) => k % 4 === 0).map((w) => w.legs[0].knee);
      const acc = P.slice(2).map((q, i) => Math.hypot(q.x - 2 * P[i + 1].x + P[i].x, q.y - 2 * P[i + 1].y + P[i].y)).sort((x, y) => x - y);
      const ratio = acc[acc.length - 1] / acc[acc.length >> 1];
      expect(ratio).toBeLessThanOrEqual(32);
    });

    it('roll: rotation strictly increases with D, d rot/dD · R within 0.99–1.01', () => {
      for (let k = 1; k < N; k++) expect(poses[k].rot).toBeGreaterThan(poses[k - 1].rot);
      for (let k = 100; k < N; k += 100) {
        const ratio = ((poses[k].rot - poses[k - 100].rot) * WALK.R) / (poses[k].D - poses[k - 100].D);
        expect(ratio).toBeGreaterThanOrEqual(0.99); expect(ratio).toBeLessThanOrEqual(1.01);
      }
    });
  });
}

describe('the pose table (§2.5, 22°, ±4°)', () => {
  const tr = line(22);
  const rows: Array<[number, number, number, number]> = [
    // p, thigh, knee, foot peel
    [0.00, 38, 98, 0], [0.08, 32, 101, 0], [0.31, 6, 133, 0], [0.45, -3, 136, 15], // (round 6: the pelvis 0.003 H lower)
    [0.70, -7, 129, 50], [0.81, 11, 113, 4], [0.95, 39, 100, -4],
  ];
  it('contact, down, passing, up and the swing keys match', () => {
    for (const [ph, thigh, knee, peel] of rows) {
      const w = walkPose(tr, 10 * WALK.L + ph * WALK.L, 0);
      const l = w.legs[0];
      expect(Math.abs(thighAngle(l) / DEG - thigh), `thigh at ${ph}`).toBeLessThanOrEqual(4);
      expect(Math.abs(interior(l.hip, l.knee, l.ankle) - knee), `knee at ${ph}`).toBeLessThanOrEqual(4);
      expect(Math.abs(w.feet[0].peel - peel), `peel at ${ph}`).toBeLessThanOrEqual(4);
    }
  });
  it('the pelvis is lowest at the down (φ 0.08) and highest at the passing (φ 0.33)', () => {
    const ph = (x: number) => { const D = 10 * WALK.L + x * WALK.L, w = walkPose(tr, D, 0); return w.pelvis.y - tr.at(D).y; };
    expect(ph(0.08)).toBeLessThan(ph(0.0));
    expect(ph(0.33)).toBeGreaterThan(ph(0.45));
    expect(Math.abs(ph(0.33) - ph(0.08) - 0.018)).toBeLessThan(0.002);
  });
});
