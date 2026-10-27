// S2: clean motion (ROUND4 §7.7). 10 s captures at 60 Hz from the deterministic 120 Hz sim via the interpolated
// render state, at 1440×900 scale (H = 234 px): steady climbing, a window with a full strain beat, and the summit
// heave → stand. Each series prints its max and p95 so the reviewer sees the margins.
import { describe, expect, it } from 'vitest';
import { Gait, PACE, PHASE, sigmaAt } from './gait';
import { makeTrail, type Trail } from './trail';
import { DEG, RIG, holdDForStone, interior, stepToStand, type Limb, type Pose } from './rig';
import { M_PER_H, PACE_M } from '../../domain/mountain';
import type { V } from './path';

const HPX = 234, FPS = 60;
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
const lenH = (25 * 60 * PACE_M) / M_PER_H;

interface Sample { t: number; pose: Pose; centre: V; sB: number; rot: number; planted: [boolean, boolean]; support: [boolean, boolean]; mode: string; u: number; strainT: number; beard: number }

/** Run the gait from a cold start at the pace and sample at `hz` from t0 for `secs`. */
function capture(trail: Trail, t0: number, secs: number, hz = FPS, schedule?: number[]): Sample[] {
  const g = new Gait(11);
  g.snap(0, trail);
  const out: Sample[] = [];
  let t = 0;
  const times = schedule ?? Array.from({ length: Math.round((t0 + secs) * hz) }, (_, i) => (i + 1) / hz);
  for (const tn of times) {
    g.step(tn - t, tn * PACE, trail, { climbing: true, lenH });
    t = tn;
    if (t >= t0) { const f = g.pose(trail); out.push({ t, pose: f.pose, centre: f.centre, sB: f.sB, rot: f.rot, planted: f.planted, support: f.support, mode: g.mode, u: g.u, strainT: g.strainT, beard: f.beard }); }
  }
  return out;
}

const pct = (xs: number[], p: number) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
/** Spike rule (§7.7): a series' max ≤ 4 × its own 95th percentile — catches single-frame pops under the limits. */
let spikes: string[] = [];
function report(name: string, xs: number[]) {
  const m = Math.max(...xs.map(Math.abs)), p = pct(xs.map(Math.abs), 0.95);
  console.log(`${name.padEnd(28)} max ${m.toFixed(3)}  p95 ${p.toFixed(3)}  (×${(m / Math.max(p, 1e-9)).toFixed(1)})`);
  if (m > 4 * p && m > 1e-6) spikes.push(`${name} max ${m.toFixed(3)} > 4 × p95 ${p.toFixed(3)}`);
  return m;
}
const diff = (xs: number[], dt: number) => xs.slice(1).map((x, i) => (x - xs[i]) / dt);
const vdiff = (ps: V[], dt: number) => ps.slice(1).map((p, i) => ({ x: (p.x - ps[i].x) / dt, y: (p.y - ps[i].y) / dt }));
const mag = (vs: V[]) => vs.map((v) => Math.hypot(v.x, v.y));
const hip = (l: Limb, p: Pose) => (Math.atan2(l.joint.y - l.root.y, l.joint.x - l.root.x) - Math.atan2(p.shoulder.y - p.pelvis.y, p.shoulder.x - p.pelvis.x)) / DEG;
const flipSign = (l: Limb) => Math.sign((l.joint.x - l.root.x) * (l.end.y - l.joint.y) - (l.joint.y - l.root.y) * (l.end.x - l.joint.x));

function metrics(S: Sample[], label: string, lim: { swing: number; stance: number; elbow: number; lean: number; head: number; acc: number; jerk: number; handJerk: number; headJerk: number }) {
  const dt = 1 / FPS;
  spikes = [];
  let swingMax = 0, stanceMax = 0, swingAt = '', stanceAt = '';
  for (let i = 1; i < S.length; i++) {
    for (const k of [0, 1] as const) {
      const a = S[i - 1].pose.legs[k], b = S[i].pose.legs[k];
      const dk = Math.abs(interior(b) - interior(a)), dh = Math.abs(hip(b, S[i].pose) - hip(a, S[i - 1].pose));
      const fa = S[i - 1].pose.feet![k], fb = S[i].pose.feet![k];
      const dp = Math.abs(fb.angle - fa.angle) / DEG;
      const where = (w: string) => `u ${S[i].u.toFixed(3)} ${S[i].mode} leg ${k} ${w}`;
      if (S[i].support[k] && S[i - 1].support[k]) {
        const m = Math.max(dk, dh, dp);
        if (m > stanceMax) { stanceMax = m; stanceAt = where(m === dk ? 'knee' : m === dh ? 'hip' : 'ankle'); }
      } else { const m = Math.max(dk, dh); if (m > swingMax) { swingMax = m; swingAt = where(m === dk ? 'knee' : 'hip'); } }
    }
  }
  console.log(`--- ${label}`);
  console.log(`swing knee/hip per frame      max ${swingMax.toFixed(2)}°  (${swingAt})`);
  console.log(`stance knee/hip/ankle         max ${stanceMax.toFixed(2)}°  (${stanceAt})`);
  expect(swingMax).toBeLessThanOrEqual(lim.swing);
  expect(stanceMax).toBeLessThanOrEqual(lim.stance);
  const elb = [0, 1].map((k) => report(`elbow ${k} °/frame`, diff(S.map((s) => interior(s.pose.arms[k])), 1)));
  for (const e of elb) expect(e).toBeLessThanOrEqual(lim.elbow);
  expect(report('lean °/frame', diff(S.map((s) => s.pose.lean / DEG), 1))).toBeLessThanOrEqual(lim.lean);
  expect(report('head axis °/frame', diff(S.map((s) => (s.pose.headAxis ?? 0) / DEG), 1))).toBeLessThanOrEqual(lim.head);
  const pv = vdiff(S.map((s) => s.pose.pelvis), dt), pa = vdiff(pv, dt), pj = vdiff(pa, dt);
  const peak = (name: string, m: number[], off: number) => { const i = m.indexOf(Math.max(...m)); const q = S[i + off]; console.log(`${name} peak at t ${q?.t.toFixed(3)} u ${q?.u.toFixed(3)} ${q?.mode}`); };
  peak('pelvis |a|', mag(pa), 1); peak('pelvis |j|', mag(pj), 2);
  expect(report('pelvis |a| H/s²', mag(pa))).toBeLessThanOrEqual(lim.acc);
  expect(report('pelvis |j| H/s³', mag(pj))).toBeLessThanOrEqual(lim.jerk);
  for (const k of [0, 1]) {
    const hj = vdiff(vdiff(vdiff(S.map((s) => s.pose.hands![k]), dt), dt), dt);
    peak(`hand ${k} |j|`, mag(hj), 2);
    expect(report(`hand ${k} |j| H/s³`, mag(hj))).toBeLessThanOrEqual(lim.handJerk);
  }
  const hdj = vdiff(vdiff(vdiff(S.map((s) => s.pose.head), dt), dt), dt);
  expect(report('head |j| H/s³', mag(hdj))).toBeLessThanOrEqual(lim.headJerk);
  // per-leg knee/hip rates as series too, for the spike rule
  for (const k of [0, 1] as const) {
    report(`knee ${k} °/frame`, diff(S.map((s) => interior(s.pose.legs[k])), 1));
    report(`hip ${k} °/frame`, diff(S.map((s) => hip(s.pose.legs[k], s.pose)), 1));
  }
  expect(spikes).toEqual([]);
}

/**
 * Discontinuities (§7.7): at each logged state change (a mode change, a toe-off or a contact) the step across the
 * change is ≤ 1.5 × the median per-frame step of that series over ±10 frames (+ a floor for series at rest), or
 * ≤ 1.5 × the larger adjacent step (a smooth local peak in the rate passes; a one-frame pop fails both).
 */
function discontinuities(S: Sample[], label: string) {
  const series: Array<[string, (s: Sample) => number, number]> = [];
  for (const k of [0, 1] as const) {
    series.push([`knee ${k}`, (s) => interior(s.pose.legs[k]), 0.02]);
    series.push([`hip ${k}`, (s) => hip(s.pose.legs[k], s.pose), 0.02]);
    series.push([`foot ${k}`, (s) => s.pose.feet![k].angle / DEG, 0.02]);
    series.push([`elbow ${k}`, (s) => interior(s.pose.arms[k]), 0.02]);
  }
  series.push(['lean', (s) => s.pose.lean / DEG, 0.02], ['head axis', (s) => (s.pose.headAxis ?? 0) / DEG, 0.02]);
  const pts: Array<[string, (s: Sample) => V]> = [['pelvis', (s) => s.pose.pelvis], ['hand 0', (s) => s.pose.hands![0]], ['hand 1', (s) => s.pose.hands![1]], ['head', (s) => s.pose.head]];
  const bad: string[] = [];
  let n = 0;
  for (let i = 11; i < S.length - 11; i++) {
    const a = S[i - 1], b = S[i];
    if (a.mode === b.mode && a.support[0] === b.support[0] && a.support[1] === b.support[1]) continue;
    n++;
    const what = `${a.mode}→${b.mode} @${b.t.toFixed(2)}`;
    const check = (name: string, step: (j: number) => number, floor: number) => {
      const around: number[] = [];
      for (let j = i - 10; j <= i + 10; j++) if (j !== i) around.push(step(j));
      around.sort((x, y) => x - y);
      const med = around[Math.floor(around.length / 2)];
      // a pop is a step out of line with the median AND with both adjacent steps (a smooth peak in the rate, e.g. the
      // pelvis settling as the body comes to rest, is not a discontinuity)
      const adj = Math.max(step(i - 1), step(i + 1));
      if (step(i) > 1.5 * med + floor && step(i) > 1.5 * adj + floor) bad.push(`${what} ${name}: ${step(i).toFixed(4)} > 1.5 × ${med.toFixed(4)} (adjacent ${adj.toFixed(4)})`);
    };
    for (const [name, f, floor] of series) check(name, (j) => Math.abs(f(S[j]) - f(S[j - 1])), floor);
    for (const [name, f] of pts) check(name, (j) => dist(f(S[j]), f(S[j - 1])) * HPX, 0.05);
  }
  console.log(`${label}: ${n} state changes checked, ${bad.length} discontinuities`);
  for (const b of bad.slice(0, 12)) console.log('  ' + b);
  expect(bad).toEqual([]);
}

function invariants(S: Sample[], trail: Trail) {
  let drift = 0, contact = 0, flips = 0;
  const sign0 = [0, 1].map((k) => flipSign(S[0].pose.legs[k])), signA = [0, 1].map((k) => flipSign(S[0].pose.arms[k]));
  for (let i = 1; i < S.length; i++) {
    for (const k of [0, 1] as const) {
      if (S[i].planted[k] && S[i - 1].planted[k]) drift = Math.max(drift, dist(S[i].pose.feet![k].ball, S[i - 1].pose.feet![k].ball) * HPX);
      if (flipSign(S[i].pose.legs[k]) !== sign0[k]) flips++;
      if (flipSign(S[i].pose.arms[k]) !== signA[k]) flips++;
    }
    for (const p of S[i].pose.hands!) contact = Math.max(contact, Math.abs(dist(p, S[i].centre) - RIG.boulderR - RIG.palm) * HPX);
  }
  console.log(`foot drift ${drift.toFixed(3)} px · hand contact ${contact.toFixed(3)} px · flips ${flips}`);
  expect(drift).toBeLessThan(1);
  expect(contact).toBeLessThanOrEqual(2);
  expect(flips).toBe(0);
  void trail;
}

describe('clean motion (§7.7)', () => {
  const trail = makeTrail({ stage: 3, startH: 60, lenH, fromSummit: false });
  const climbLim = { swing: 4.5, stance: 1.5, elbow: 0.8, lean: 0.3, head: 0.5, acc: 1.6, jerk: 12, handJerk: 12, headJerk: 15 };
  const hardLim = { swing: 4.5, stance: 3.0, elbow: 2.5, lean: 0.9, head: 1.0, acc: 3.0, jerk: 30, handJerk: 30, headJerk: 35 };

  it('steady climbing: angle, acceleration and jerk limits; feet locked, hands on the stone, no IK flips', () => {
    const S = capture(trail, 5, 10);
    metrics(S, 'climbing', climbLim);
    invariants(S, trail);
    discontinuities(S, 'climbing');
    // the trudge never freezes: pelvis speed ≥ 0.35 v̄; the stone's rim keeps moving ≥ 8 px/s
    const sp = mag(vdiff(S.map((s) => s.pose.pelvis), 1 / FPS));
    const vbar = PACE;
    console.log(`pelvis speed min ${(Math.min(...sp) / vbar).toFixed(2)} v̄`);
    expect(Math.min(...sp)).toBeGreaterThanOrEqual(0.35 * vbar);
    const rim = diff(S.map((s) => s.rot), 1 / FPS).map((w) => w * RIG.boulderR * HPX);
    const rimMin = Math.min(...rim.map((w, i) => (rim[i - 1] !== undefined ? (w + rim[i - 1]) / 2 : w)));
    console.log(`stone rim speed min ${rimMin.toFixed(1)} px/s`);
    expect(rimMin).toBeGreaterThanOrEqual(8);
    // torso lean 17–27°, head between the arms, leg triangle open
    for (const s of S) { const l = s.pose.lean / DEG; expect(l).toBeGreaterThanOrEqual(17); expect(l).toBeLessThanOrEqual(27); }
    const between = S.filter((s) => {
      const sh = s.pose.shoulder, wr = s.pose.arms[0].end, ux = wr.x - sh.x, uy = wr.y - sh.y, l = Math.hypot(ux, uy);
      const along = ((s.pose.head.x - sh.x) * ux + (s.pose.head.y - sh.y) * uy) / l;
      const across = Math.abs((s.pose.head.x - sh.x) * uy - (s.pose.head.y - sh.y) * ux) / l;
      return across <= 0.035 && along >= 0.07 && along <= 0.15;
    }).length / S.length;
    console.log(`head between the arms ${(between * 100).toFixed(1)}%`);
    expect(between).toBeGreaterThanOrEqual(0.95);
    const open = S.filter((s) => dist(s.pose.legs[0].joint, s.pose.legs[1].joint) >= 0.06).length / S.length;
    expect(open).toBeGreaterThanOrEqual(0.9);
  });

  it('a strain beat: within the strain limits; the stone holds, slips back and is driven forward to where it was', () => {
    // find a strain beat, then take the 10 s window around it
    const probe = capture(trail, 0, 120, 30);
    const i0 = probe.findIndex((s) => s.mode === 'strain');
    expect(i0).toBeGreaterThan(0);
    const tS = probe[i0].t;
    const S = capture(trail, tS - 3, 10);
    metrics(S, 'strain', hardLim);
    invariants(S, trail);
    discontinuities(S, 'strain');
    const pre = S.find((s) => s.mode === 'strain')!, post = S.filter((s) => s.mode === 'strain').pop()!;
    expect(Math.abs(post.sB - pre.sB) * HPX).toBeLessThanOrEqual(0.5);
    expect(Math.min(...S.filter((s) => s.mode === 'strain').map((s) => s.sB))).toBeLessThan(pre.sB - 0.04);
    for (const s of S) expect(s.pose.lean / DEG).toBeLessThanOrEqual(29);
  });

  it('measured lags: head 100–140 ms behind the pelvis height; beard 150–220 ms; beard swing ≤ 4°', () => {
    const S = capture(trail, 5, 20);
    const py = S.map((s) => s.pose.pelvis.y - trail.groundY(s.pose.pelvis.x));
    const hp = S.map((s) => (s.pose.headAxis ?? 0) / DEG);
    const bd = S.map((s) => s.beard);
    const lagOf = (a: number[], b: number[]) => {
      const ma = a.reduce((x, y) => x + y) / a.length, mb = b.reduce((x, y) => x + y) / b.length;
      let best = -Infinity, bestL = 0;
      for (let L = 0; L <= 30; L++) { let c = 0; for (let i = 0; i + L < a.length; i++) c += (a[i] - ma) * (b[i + L] - mb); c = Math.abs(c); if (c > best) { best = c; bestL = L; } }
      return (bestL * 1000) / FPS;
    };
    const head = lagOf(py, hp), beard = lagOf(py, bd);
    console.log(`lags: head ${head} ms, beard ${beard} ms; beard max ${Math.max(...bd.map(Math.abs)).toFixed(2)}°`);
    expect(Math.max(...bd.map(Math.abs))).toBeLessThanOrEqual(4);
    expect(head).toBeGreaterThanOrEqual(100); expect(head).toBeLessThanOrEqual(140);
    expect(beard).toBeGreaterThanOrEqual(150); expect(beard).toBeLessThanOrEqual(220);
  });

  it('frame-rate robustness: 30 fps and an irregular 20–60 fps schedule trace the 60 fps pelvis path within 0.5 px', () => {
    const ref = capture(trail, 2, 6, 60);
    const at30 = capture(trail, 2, 6, 30);
    const times: number[] = [];
    let t = 0, k = 0;
    while (t < 8) { t += [1 / 20, 1 / 60, 1 / 45, 1 / 33, 1 / 60][k++ % 5]; times.push(t); }
    const irregular = capture(trail, 2, 6, 60, times);
    const byT = new Map(ref.map((s) => [Math.round(s.t * 1e6), s.pose.pelvis]));
    let worst = 0, n = 0;
    for (const s of [...at30, ...irregular]) {
      const r = byT.get(Math.round(s.t * 1e6));
      if (!r) continue;
      worst = Math.max(worst, dist(r, s.pose.pelvis) * HPX); n++;
    }
    console.log(`frame-rate robustness: ${n} shared samples, worst ${worst.toFixed(3)} px`);
    expect(n).toBeGreaterThan(100);
    expect(worst).toBeLessThanOrEqual(0.5);
  });

  it('summit heave → stand: walk up to the ledge and step through, within the set-piece limits', () => {
    const tr = makeTrail({ stage: 4, startH: 210, lenH: 30, fromSummit: true });
    const D1 = holdDForStone(tr, tr.geom.ledgeStart + 0.1);
    const g = new Gait(5);
    g.snap(D1 - 0.95, tr); // the engine's heave: a cut to two steps before the hold spot (V3)
    const S: Sample[] = [];
    let t = 0, standT = -1;
    let hold: ReturnType<Gait['pose']> | null = null;
    for (let i = 0; i < FPS * 14; i++) {
      t += 1 / FPS;
      if (standT < 0) {
        g.step(1 / FPS, D1, tr, { climbing: false, lenH: 30, speed: 1.1 });
        const f = g.pose(tr);
        S.push({ t, pose: f.pose, centre: f.centre, sB: f.sB, rot: f.rot, planted: f.planted, support: f.support, mode: g.mode, u: g.u, strainT: 0, beard: f.beard });
        if (g.mode === 'hold' && g.holdT >= 0.4 && Math.abs(D1 - g.D) < 0.5 * sigmaAt(tr.angleAt(g.D))) { standT = t; hold = f; }
      } else {
        const k = Math.min(1, (t - standT) / 1.2);
        const p = stepToStand(tr, hold!.pose, hold!.centre, k);
        S.push({ t, pose: p, centre: hold!.centre, sB: hold!.sB, rot: hold!.rot, planted: [true, true], support: [true, true], mode: 'stand', u: 0, strainT: 0, beard: 0 });
      }
    }
    expect(standT).toBeGreaterThan(0);
    // (the first 0.4 s sit under the engine's cross-fade cut into the heave)
    const walk = S.filter((s) => s.mode !== 'stand' && s.t > 0.4);
    metrics(walk, 'summit heave', hardLim);
    invariants(walk, tr);
    discontinuities(S, 'summit heave → stand');
    void PHASE;
  });
});
