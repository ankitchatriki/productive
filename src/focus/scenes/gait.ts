// The trudge (ROUND4 §4, §7): a continuous single-step push cycle with a loaded press, anticipation, a swing on an
// early-peaked arc and a weight-accept dip — never a freeze — simulated at a fixed 120 Hz with render interpolation.
// Planted feet are locked at the ball; the swing leg is keyed FK blended into IK; the stone is solved from the
// shoulder, ratcheted (it never rolls back outside a slip) and turns by exactly its travel. Pure and seeded.
// World units are H (y up).
import { mulberry32, noise1, smoothstep } from './noise';
import type { V } from './path';
import type { Trail } from './trail';
import {
  ARM_CHAIN, DEG, FRONT_FOOT, LEG_CHAIN, LEG_MAX, REAR_FOOT, RIG, armIK, boulderSFor, cosRatio, farShoulder, footAt,
  headFrom, hipCeiling, HAND_FAR, HAND_NEAR, lean0, legIK, stoneDistance, type FootPose, type Limb, type Pose,
} from './rig';

/** Global wind in H/s, pointing +x (uphill, into the figure's back), with slow 7.7 s gusts. */
export function wind(t: number): number {
  const base = 0.06 * (0.7 + 0.6 * noise1(t * 0.13));
  const g = noise1(t / 7.7 + 40);
  return base * (1 + 0.8 * smoothstep(0.68, 0.78, g));
}

/**
 * C2 cubic spline through keys with given end slopes (a "complete" spline): positions, velocities and
 * accelerations are continuous, so finite-difference jerk has no spikes at the keys (§7.2).
 */
export function spline(xs: number[], ys: number[], m0 = 0, m1 = 0): (x: number) => number {
  const n = xs.length;
  const hgt = xs.slice(1).map((x, i) => x - xs[i]);
  // solve for second derivatives M with clamped first-derivative end conditions
  const a = new Array(n).fill(0), b = new Array(n).fill(0), c = new Array(n).fill(0), d = new Array(n).fill(0);
  b[0] = 2 * hgt[0]; c[0] = hgt[0]; d[0] = 6 * ((ys[1] - ys[0]) / hgt[0] - m0);
  for (let i = 1; i < n - 1; i++) {
    a[i] = hgt[i - 1]; b[i] = 2 * (hgt[i - 1] + hgt[i]); c[i] = hgt[i];
    d[i] = 6 * ((ys[i + 1] - ys[i]) / hgt[i] - (ys[i] - ys[i - 1]) / hgt[i - 1]);
  }
  a[n - 1] = hgt[n - 2]; b[n - 1] = 2 * hgt[n - 2]; d[n - 1] = 6 * (m1 - (ys[n - 1] - ys[n - 2]) / hgt[n - 2]);
  for (let i = 1; i < n; i++) { const w = a[i] / b[i - 1]; b[i] -= w * c[i - 1]; d[i] -= w * d[i - 1]; }
  const M = new Array(n).fill(0);
  M[n - 1] = d[n - 1] / b[n - 1];
  for (let i = n - 2; i >= 0; i--) M[i] = (d[i] - c[i] * M[i + 1]) / b[i];
  return (x: number) => {
    if (x <= xs[0]) return ys[0] + m0 * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + m1 * (x - xs[n - 1]);
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const hh = hgt[i], A = (xs[i + 1] - x) / hh, B = (x - xs[i]) / hh;
    return A * ys[i] + B * ys[i + 1] + ((A * A * A - A) * M[i] + (B * B * B - B) * M[i + 1]) * (hh * hh) / 6;
  };
}

/**
 * Periodic C2 spline on [0, 1) through keys with ys[0] = ys[n−1]: built over three periods and read in the middle,
 * so position, velocity and acceleration all match across the cycle wrap (no jerk spike at u = 0).
 */
export function periodicSpline(xs: number[], ys: number[]): (x: number) => number {
  const X: number[] = [], Y: number[] = [];
  for (const o of [-1, 0, 1]) for (let i = 0; i < xs.length - 1; i++) { X.push(xs[i] + o); Y.push(ys[i]); }
  X.push(2); Y.push(ys[0]);
  const f = spline(X, Y, 0, 0);
  return (x: number) => f(x - Math.floor(x));
}

/** Monotone cubic (Fritsch–Carlson) with zero end slopes; kept for callers that need a no-overshoot ease. */
export function keyCurve(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const d: number[] = [], m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const hgt = xs[i + 1] - xs[i], t = (x - xs[i]) / hgt, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hgt * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hgt * m[i + 1];
  };
}

// ---------- the cycle (§4.2), u ∈ [0, 1) per step ----------
export const PHASE = { pressEnd: 0.31, antEnd: 0.32, toeOff: 0.42, passing: 0.60, reach: 0.74, contact: 0.80, accept: 0.86 };
/** Pelvis travel (× σ). End slopes 0.35 so the velocity carries across cycles; a stop uses END_STOP. */
const TRAVEL_X = [0, 0.31, 0.42, 0.57, 0.80, 0.91, 1];
const TRAVEL_Y = [0, 0.15, 0.22, 0.45, 0.85, 0.955, 1];
const KEY_TRAVEL = ((f) => (u: number) => u + f(u))(periodicSpline(TRAVEL_X, TRAVEL_Y.map((y, i) => y - TRAVEL_X[i])));
export const KEY = {
  travel: (u: number) => KEY_TRAVEL(u),
  /** The last cycle before a hold: the travel curve, eased (C2) onto a curve that arrives with zero speed. */
  /** The last cycle before rest: the travel curve, then from u 0.74 a quintic that arrives at 1 with zero speed and
   * zero acceleration (C2 all the way into the hold or the strain beat). */
  travelStop: ((u0: number) => {
    const e = 1e-4, p0 = KEY_TRAVEL(u0), v0 = (KEY_TRAVEL(u0 + e) - KEY_TRAVEL(u0 - e)) / (2 * e);
    const a0 = (KEY_TRAVEL(u0 + e) - 2 * p0 + KEY_TRAVEL(u0 - e)) / (e * e), h = 1 - u0;
    return (u: number) => {
      if (u <= u0) return KEY_TRAVEL(u);
      const t = Math.min(1, (u - u0) / h), t2 = t * t, t3 = t2 * t, t4 = t3 * t, t5 = t4 * t;
      const H0 = 1 - 10 * t3 + 15 * t4 - 6 * t5, H1 = t - 6 * t3 + 8 * t4 - 3 * t5, H2 = 0.5 * (t2 - 3 * t3 + 3 * t4 - t5);
      const H5 = 10 * t3 - 15 * t4 + 6 * t5;
      return H0 * p0 + H1 * h * v0 + H2 * h * h * a0 + H5 * 1;
    };
  })(0.74),
  hipDy: periodicSpline([0, 0.38, 0.46, 0.60, 0.74, 0.86, 1], [0, -0.010, -0.007, -0.001, -0.001, -0.014, 0]),
  lean: periodicSpline([0, 0.38, 0.48, 0.62, 0.80, 1], [-0.5, 1.5, 2.5, 1, -0.5, -0.5]),
  pitch: periodicSpline([0, 0.30, 0.44, 0.60, 0.80, 1], [0, 0, -3, 0, 2, 0]),
  /** Rear foot heel (deg): press peel 22 → 30, anticipation drop to 24, fire to 44 by toe-off. */
  rearHeel: (u: number) => 22 + 18 * ease5((u - 0.04) / 0.38), // C2 into toe-off (no jerk when the foot lifts)
  /** Front (stance) foot heel: flat, then rising as the body passes over to 22 at the cycle's end. */
  stanceHeel: (u: number) => 22 * ease5((u - 0.5) / 0.5),
  swingThigh: spline([0.46, 0.53, 0.60, 0.70, 0.75], [-40, -15, 14, 40, 44]),
  swingKnee: spline([0.46, 0.53, 0.60, 0.70, 0.75], [170, 135, 86, 104, 104]),
  swingPitch: spline([0.46, 0.53, 0.60, 0.70, 0.75], [40, 15, -15, -4, 0]),
};

export const PACE = 0.1333;
export const sigmaAt = (thetaDeg: number) => (FRONT_FOOT + REAR_FOOT) * cosRatio(thetaDeg);
/** Nominal cycle period: one stride at the pace. */
export const periodAt = (thetaDeg: number) => sigmaAt(thetaDeg) / PACE;
const SIM_DT = 1 / 120;
/** V8: the cadence eases up from rest (after a hold or a strain beat) over this long. */
const RAMP_T = 0.3;
const PRESS_END = 0.24, PRESS_KNEE = 164, TOEOFF_KNEE = 150, TO_BLEND = 0.16;
/** 0 → 1 at an even rate with eased ends (C2; the peak rate is 1.33×, against 1.875× for a quintic ease). */
const trapRamp = (x: number) => {
  // even-rate ramp whose speed eases in and out on smoothsteps (C2 position: no jerk spike at the joins)
  const t = Math.min(1, Math.max(0, x)), a = 0.25, v = 1 / (1 - a), seg = (T: number) => v * a * (T ** 3 - T ** 4 / 2);
  return t < a ? seg(t / a) : t > 1 - a ? 1 - seg((1 - t) / a) : v * (a / 2 + (t - a));
};
/** Hip-to-ankle reach (fraction of the leg chain) for an interior knee angle. */
const kneeReach = (deg: number) => Math.sqrt(RIG.thigh ** 2 + RIG.shin ** 2 - 2 * RIG.thigh * RIG.shin * Math.cos(deg * DEG)) / LEG_CHAIN;
const KNEE_SOFT = kneeReach(173); // just inside LEG_MAX (≈ 170°): the hard reach never binds
/** The push-hold key pose sits at the end of the press: the feet are planted relative to D + KEY_OFF·σ (§3.4). */
const KEY_OFF = 0.12;
const EXT = 0.995;
/** C2 ease (smootherstep). */
function ease5(x: number) { const t = Math.min(1, Math.max(0, x)); return t * t * t * (t * (t * 6 - 15) + 10); }

interface Foot { ballS: number; ball: V; ground: number }
export type Mode = 'trudge' | 'hold' | 'strain';
interface GState {
  mode: Mode;
  D: number; u: number; cyc: number;
  sigma: number; P: number; stop: boolean;
  /** last cycle's stride (eased into this one over the first 30% of the cycle) and the filtered period */
  sigmaPrev: number; Pe: number; PeV: number;
  /** this cycle ends in a strain beat (it decelerates to rest like a stop); time since the trudge (re)started */
  toStrain: boolean; rampT: number;
  /** after a strain beat the ratchet catches up with the stance it resumed in: rendered as an eased offset (C2) */
  sOff: number; sOffT: number;
  leanVar: number; leanVarPrev: number; ant: number; clear: number;
  front: 0 | 1; feet: [Foot, Foot];
  strainT: number; giveDeg: number; giveV: number;
  t: number; breathT: number; sBfloor: number;
  beard: number; beardV: number;
  holdT: number;
  /** running mean of the pelvis height (the bob is measured about it) */
  hhMean: number;
  /** Pelvis height along the normal (a critically damped follower of the keyed, reach-limited target). */
  hh: number; hhV: number;
  /** Elbow interior angles, low-passed (critically damped, ω = 18) before IK places the hands (§7.2). */
  elb: [number, number]; elbV: [number, number];
}
const cloneState = (s: GState): GState => ({ ...s, elb: [s.elb[0], s.elb[1]], elbV: [s.elbV[0], s.elbV[1]], feet: [{ ...s.feet[0], ball: { ...s.feet[0].ball } }, { ...s.feet[1], ball: { ...s.feet[1].ball } }] });

export interface GaitOptions { climbing: boolean; lenH: number; speed?: number; idles?: boolean }
export interface GaitFrame { pose: Pose; centre: V; rot: number; sB: number; planted: [boolean, boolean]; support: [boolean, boolean]; elbow: number; beard: number; hhTarget: number; ceil: number; /** the rendered (interpolated) state's mode and strain clock */ mode: Mode; strainT: number }

export class Gait {
  private cur: GState;
  private prev: GState;
  private acc = 0;
  private rng: () => number;
  private seed: number;
  private cyclesToStrain = 6;
  private hist: Array<{ t: number; lean: number; pitch: number; pelvisY: number }> = [];
  events = { grit: false, stepEnd: false, snap: false };

  constructor(seed = 1) {
    this.seed = seed; this.rng = mulberry32(seed);
    this.cur = this.blank(); this.prev = cloneState(this.cur);
  }
  private blank(): GState {
    const f = { ballS: 0, ball: { x: 0, y: 0 }, ground: 0 };
    return { mode: 'trudge', D: 0, u: 0, cyc: 0, sigma: 0.41, P: 3.08, stop: false, sigmaPrev: 0.41, Pe: 3.08, PeV: 0, toStrain: false, rampT: 9, sOff: 0, sOffT: 9, leanVar: 0, leanVarPrev: 0, ant: 1, clear: 1, front: 0, feet: [{ ...f }, { ...f }], strainT: 0, giveDeg: 0, giveV: 0, t: 0, breathT: 0, sBfloor: -Infinity, beard: 0, beardV: 0, holdT: 0, hhMean: NaN, hh: NaN, hhV: 0, elb: [NaN, NaN], elbV: [0, 0] };
  }

  get mode(): Mode { return this.cur.mode; }
  get D(): number { return this.cur.D; }
  get u(): number { return this.cur.u; }
  get strainT(): number { return this.cur.strainT; }
  get sBfloor(): number { return this.cur.sBfloor; }
  /** Index of the stance (front) foot this cycle. */
  get front(): number { return this.cur.front; }
  /** Seconds since the gait came to rest in the hold (the pelvis settles over ≈ 0.6 s). */
  get holdT(): number { return this.cur.mode === 'hold' ? this.cur.holdT : 0; }
  slipping(): boolean { return this.cur.mode === 'strain' && this.cur.strainT >= 1.4 && this.cur.strainT < 2.65; }

  // ---------- scheduling ----------
  private footprintSlope(trail: Trail, s: number): number {
    return (trail.angleAt(s - 0.2) + trail.angleAt(s) + trail.angleAt(s + 0.15)) / 3;
  }
  private plant(st: GState, i: 0 | 1, s: number, trail: Trail) {
    st.feet[i] = { ballS: s, ball: trail.at(s), ground: trail.angleAt(s) * DEG };
  }

  /** Re-plant both feet in the key pose at D (|debt| > 4σ, reload, a new climb). */
  snap(D: number, trail: Trail) {
    const st = this.blank();
    st.D = D; st.t = this.cur.t; st.breathT = this.cur.breathT;
    const th = this.footprintSlope(trail, D);
    st.sigma = sigmaAt(th); st.P = periodAt(th); st.sigmaPrev = st.sigma; st.Pe = st.P; st.PeV = 0;
    const k = cosRatio(th);
    // snap straight into the key pose: the cycle sits at the end of its press
    st.D = D - KEY_OFF * st.sigma; st.u = PHASE.pressEnd;
    this.plant(st, 0, D + FRONT_FOOT * k, trail);
    this.plant(st, 1, D - REAR_FOOT * k, trail);
    this.cur = st; this.prev = cloneState(st); this.acc = 0;
    this.hist = []; this.lastHT = NaN; this.htV = 0; this.elbRaw = [NaN, NaN]; this.elbRawV = [0, 0];
    this.cur.sBfloor = this.solve(st, trail).sB;
    this.prev = cloneState(this.cur);
    this.events.snap = true;
  }

  /** Reduced motion re-poses at the target; paused freezes the sim. */
  settle(Dtarget: number, trail: Trail, reduced: boolean) {
    this.events.grit = false; this.events.stepEnd = false; this.events.snap = false;
    if (reduced && (Math.abs(Dtarget - this.cur.D) > 1e-3 || this.cur.u !== 0 || this.cur.mode !== 'trudge')) this.snap(Dtarget, trail);
    this.events.snap = false;
    this.acc = 0; this.prev = cloneState(this.cur);
  }

  /** Begin a cycle: draw the seeded multipliers and the debt-controlled period (§4.7). */
  private beginCycle(st: GState, trail: Trail, Dtarget: number, climbing: boolean) {
    const r = this.rng;
    const th = this.footprintSlope(trail, st.D);
    const s0 = sigmaAt(th), P0 = periodAt(th);
    st.sigmaPrev = st.mode === 'trudge' && Number.isFinite(st.sigma) ? st.sigma : s0;
    st.sigma = s0 * (1 + 0.05 * (2 * r() - 1));
    if (st.mode !== 'trudge') st.sigmaPrev = st.sigma;
    const debt = Dtarget - st.D;
    const k = 1 + 0.35 * Math.max(-1, Math.min(1, debt / s0));
    st.P = Math.min(1.25 * P0, Math.max(0.8 * P0, (st.sigma / (PACE * k)) * (1 + 0.04 * (2 * r() - 1))));
    st.leanVarPrev = st.leanVar;
    st.leanVar = 2 * r() - 1;
    st.ant = 1 + 0.2 * (2 * r() - 1);
    st.clear = 1 + 0.15 * (2 * r() - 1);
    // stop at the end of this cycle when not climbing and the target is (almost) reached
    st.stop = !climbing && Dtarget - (st.D + st.sigma) < 0.5 * s0;
    // a strain beat is decided one cycle ahead, so the step before it decelerates to rest (no velocity step)
    st.toStrain = climbing && !st.stop && st.D + st.sigma > 4 && this.cyclesToStrain <= 1 && debt < 0.9 * s0;
  }

  step(dt: number, Dtarget: number, trail: Trail, opts: GaitOptions) {
    this.events.grit = false; this.events.stepEnd = false; this.events.snap = false;
    const s0 = sigmaAt(this.footprintSlope(trail, this.cur.D));
    if (Math.abs(Dtarget - this.cur.D) > 4 * s0 + 0.05) { this.snap(Dtarget, trail); return; }
    this.acc = Math.min(this.acc + dt, 12 * SIM_DT);
    while (this.acc >= SIM_DT) {
      this.prev = cloneState(this.cur);
      this.sim(SIM_DT, Dtarget, trail, opts);
      this.acc -= SIM_DT;
    }
  }

  private sim(dt: number, Dtarget: number, trail: Trail, opts: GaitOptions) {
    const st = this.cur;
    const speed = opts.speed ?? 1;
    // the breath (and the lean noise on the same clock) is held through a strain beat: the body comes out of the beat
    // exactly as it went in, so the ratcheted stone is still within the arms' reach
    st.t += dt; if (st.mode !== 'strain') st.breathT += dt;
    const s0 = sigmaAt(this.footprintSlope(trail, st.D));
    if (st.mode === 'hold') {
      st.holdT += dt;
      if (Dtarget - st.D > 0.5 * s0 || (opts.climbing && Dtarget - st.D > 0.05)) { st.mode = 'trudge'; st.u = 0; st.rampT = 0; this.beginCycle(st, trail, Dtarget, opts.climbing); }
    } else if (st.mode === 'strain') {
      const before = st.strainT;
      st.strainT += dt;
      if (before < 1.4 && st.strainT >= 1.4) this.events.grit = true;
      if (st.strainT >= 3.0) {
        st.mode = 'trudge'; st.strainT = 0; st.u = 0; st.rampT = 0;
        const late = st.D > 0.7 * opts.lenH;
        this.cyclesToStrain = late ? 3 + Math.floor(this.rng() * 3) : 4 + Math.floor(this.rng() * 5);
        this.beginCycle(st, trail, Dtarget, opts.climbing);
      }
    } else {
      // the cadence changes smoothly (critically damped, ω = 2): no velocity step at a cycle boundary
      st.PeV += (-4 * (st.Pe - st.P) - 4 * st.PeV) * dt; st.Pe += st.PeV * dt;
      // from rest (after a hold or a strain beat) the cadence eases up from zero (C2): no acceleration step
      st.rampT += dt;
      const du = (dt * speed * ease5(st.rampT / RAMP_T)) / st.Pe;
      st.u += du;
      if (st.u >= PHASE.contact && st.u - du < PHASE.contact) this.events.stepEnd = true;
      if (st.u >= 1) {
        // the swing foot is the new front; the old stance foot becomes the rear
        const k = cosRatio(this.footprintSlope(trail, st.D));
        const swing = (st.front ^ 1) as 0 | 1;
        this.plant(st, swing, st.D + st.sigma + KEY_OFF * st.sigma + FRONT_FOOT * k, trail);
        st.D += st.sigma; st.front = swing; st.u -= 1; st.cyc++;
        this.cyclesToStrain--;
        if (st.stop) { st.mode = 'hold'; st.u = 0; st.holdT = 0; }
        else if (st.toStrain) { st.mode = 'strain'; st.strainT = 0; st.u = 0; st.toStrain = false; }
        else this.beginCycle(st, trail, Dtarget, opts.climbing);
      }
    }
    // elbow give (deg): a critically damped spring driven by the pelvis surge (the stone's inertia), ω = 18
    const v = this.pelvisVel(st);
    const acc = (v - this.lastV) / dt; this.lastV = v;
    this.accF += (acc - this.accF) * Math.min(1, dt * 12);
    const target = Math.min(6, Math.max(0, this.accF) * 9);
    const w = 18;
    st.giveV += (-w * w * (st.giveDeg - target) - 2 * w * st.giveV) * dt;
    st.giveDeg = Math.max(0, st.giveDeg + st.giveV * dt);
    // follow-through (§7.5): the head nods after the pelvis bob (exact 120 ms lag through the history buffer) and the
    // beard swings after it through an angular spring (ω = 8, ζ = 1: ≈ 180 ms behind). Both read the bob about a
    // slow running mean, so they trail the body's rise and fall rather than the keyed curves.
    if (Number.isFinite(st.hh)) st.hhMean = Number.isFinite(st.hhMean) ? st.hhMean + (st.hh - st.hhMean) * Math.min(1, dt / 6) : st.hh;
    const bob = Number.isFinite(st.hh) && Number.isFinite(st.hhMean) ? st.hh - st.hhMean : 0;
    const raw = this.channels(st);
    this.hist.push({ t: st.t, lean: raw.lean, pitch: raw.pitch + 110 * bob, pelvisY: bob });
    while (this.hist.length > 2 && st.t - this.hist[1].t > 0.4) this.hist.shift();
    const wb = 9.5, beardTarget = -80 * bob + (wind(st.t) - 0.06) * 1.5;
    st.beardV += (-wb * wb * (st.beard - beardTarget) - 2 * wb * st.beardV) * dt;
    st.beard = Math.max(-4, Math.min(4, st.beard + st.beardV * dt));
    // pelvis height: follow the reach-limited keyed target through a critically damped spring (ω = 9), so the
    // body never pops when a foot's reach limit lets go; the hard limit still applies in the pose
    const sol = this.solve(st, trail);
    if (!Number.isFinite(st.hh) || !Number.isFinite(this.lastHT)) { st.hh = Number.isFinite(st.hh) ? st.hh : sol.hhTarget; st.hhV = 0; this.lastHT = sol.hhTarget; }
    const wh = 6;
    // feed-forward: the follower tracks the target's own velocity, so a sinking target is matched without lag
    const tv = (sol.hhTarget - this.lastHT) / dt; this.lastHT = sol.hhTarget;
    this.htV += (tv - this.htV) * Math.min(1, dt * 10);
    st.hhV += (-wh * wh * (st.hh - sol.hhTarget) - 2 * 1.3 * wh * (st.hhV - this.htV)) * dt;
    st.hh += st.hhV * dt;
    // (no hard clamp here: the pose applies the soft knee limit, which always sits inside the legs' reach)
    // the ratchet: outside a strain beat the stone's floor only moves forward
    // (in the hold the stone rests: the body breathes against it and the arms take it)
    if (st.mode === 'trudge') {
      // resuming from a strain beat or a hold, the ratchet catches up with the stance: an eased offset (C2), not a jump
      if (this.prev.mode !== 'trudge') { st.sOff = Math.max(0, sol.sB - st.sBfloor); st.sOffT = 0; }
      st.sBfloor = Math.max(st.sBfloor, sol.sB);
    }
    st.sOffT += dt;
    // elbows: filter the geometric angle of the arms on the rendered stone; the hands are then placed by that
    // filtered angle (≤ 2 px off the stone)
    const ren = this.poseOf(st, trail, false, RIG.boulderR, false);
    for (const i of [0, 1] as const) {
      const raw = interiorDeg(ren.pose.arms[i]);
      if (!Number.isFinite(st.elb[i]) || !Number.isFinite(this.elbRaw[i])) { st.elb[i] = Number.isFinite(st.elb[i]) ? st.elb[i] : raw; st.elbV[i] = 0; this.elbRaw[i] = raw; this.elbRawV[i] = 0; }
      // ω = 18 low-pass with 30% of the raw rate fed forward: the noise is filtered, the lag (and the palm’s slide off the
      // stone) is halved
      this.elbRawV[i] += ((raw - this.elbRaw[i]) / dt - this.elbRawV[i]) * Math.min(1, dt * 20); this.elbRaw[i] = raw;
      const we = 14;
      st.elbV[i] += (-we * we * (st.elb[i] - raw) - 2 * we * (st.elbV[i] - 0.15 * this.elbRawV[i])) * dt;
      st.elb[i] += st.elbV[i] * dt;
    }
  }
  private lastV = 0;
  private lastHT = 0;
  private elbRaw: [number, number] = [NaN, NaN];
  private elbRawV: [number, number] = [0, 0];
  private htV = 0;
  private accF = 0;

  private pelvisVel(st: GState): number {
    if (st.mode !== 'trudge') return 0;
    const e = 1e-3, tr = st.stop || st.toStrain ? KEY.travelStop : KEY.travel;
    return (this.sigEff(st) * (tr(st.u + e) - tr(st.u - e))) / (2 * e) / st.Pe;
  }

  private channels(st: GState) {
    const k = st.mode === 'trudge' ? st.u : 0;
    // the anticipation multiplier fades in and out (C2): a stepped window would put a pop in the lagged lean
    const antK = 1 + (st.ant - 1) * ease5((k - 0.24) / 0.08) * (1 - ease5((k - 0.44) / 0.08));
    const lean = st.mode === 'trudge' ? KEY.lean(k) * antK : -0.5;
    const pitch = 0; // (the head's nod is the lagged pelvis bob alone: §4.5 follow-through)
    const hipDy = st.mode === 'trudge' ? KEY.hipDy(k) * antK : 0;
    return { lean, pitch, hipDy };
  }

  private lagged(ch: 'lean' | 'pitch', lag: number, t: number): number {
    const h = this.hist;
    if (!h.length) return 0;
    const tt = t - lag;
    if (tt <= h[0].t) return h[0][ch];
    for (let i = h.length - 1; i > 0; i--) {
      if (h[i - 1].t <= tt) { const a = h[i - 1], b = h[i]; const kk = (tt - a.t) / ((b.t - a.t) || 1); return a[ch] + (b[ch] - a[ch]) * kk; }
    }
    return h[h.length - 1][ch];
  }

  // ---------- strain beat channels (§4.6), all C1/C2 ----------
  private strain(st: GState) {
    const s = st.mode === 'strain' ? st.strainT : -1;
    const z = { back: 0, dy: 0, lean: 0, ext: 0, head: 0, tremor: 0, heel: 0, veins: 0 };
    if (s < 0) return z;
    const brace = ease5(s / 0.5);                          // 0–0.5 brace
    const release = 1 - ease5((s - 2.5) / 0.5);            // 2.5–3.0 settle into the press
    const slip = ease5((s - 1.4) / 0.6);                   // 1.4–2.0 slip (gravity wins)
    const cb = (s - 2.0) / 0.25, catchBump = cb > 0 && cb < 1 ? 0.03 * 64 * cb ** 3 * (1 - cb) ** 3 : 0; // ≤ 3% overshoot, C2 bump
    const recover = ease5((s - 2.1) / 0.6);                // 2.1–2.7 recover
    const backK = slip * (1 - recover) + catchBump;
    z.back = 0.05 * backK;
    z.lean = (2 * brace + 0.5 * backK) * release;
    z.dy = (-0.025 * brace - 0.005 * backK) * release;
    z.ext = 0.045 * backK;
    z.head = (3 * brace + 5 * backK) * release;
    z.heel = 8 * ease5((s - 0.5) / 0.3) * (1 - ease5((s - 1.9) / 0.5));
    z.tremor = s >= 0.5 && s < 1.4 ? 0.0006 * Math.sin(2 * Math.PI * 9 * s) * Math.sin(Math.PI * (s - 0.5) / 0.9) : 0;
    z.veins = ease5((s - 0.0) / 0.45) * (1 - ease5((s - 2.05) / 0.3));
    return z;
  }

  /** Breath −1..1: inhale 1.6 s, exhale 2.0 s (3.6 s), held full during the brace. */
  private breath(st: GState): number {
    // a smooth 3.6 s breath; held through a strain beat (its clock stops)
    return -Math.cos((2 * Math.PI * st.breathT) / 3.6);
  }

  private pelvisSOf(st: GState): number {
    const tr = st.stop || st.toStrain ? KEY.travelStop : KEY.travel;
    return st.D + (st.mode === 'trudge' ? this.sigEff(st) * tr(st.u) : 0) - this.strain(st).back;
  }

  /** Pelvis base along the trail, without the bob (camera target). Interpolated. */
  baseS(): number {
    const st = this.interp();
    const tr = st.stop || st.toStrain ? KEY.travelStop : KEY.travel;
    return st.D + (st.mode === 'trudge' ? this.sigEff(st) * tr(st.u) : 0);
  }

  /** The stride the pelvis travels by: last cycle's eased into this one (C2 at u = 0, where travel is 0). */
  private sigEff(st: GState): number {
    return st.sigmaPrev + (st.sigma - st.sigmaPrev) * ease5(st.u / 0.3);
  }

  /** The render state: the last two sim states blended by the accumulator (parameters, never IK outputs). */
  private interp(): GState {
    const a = this.prev, b = this.cur, al = Math.min(1, this.acc / SIM_DT);
    // the render lags the sim by one step: al = 0 is exactly the previous state, al = 1 the current one
    if (a.mode !== b.mode) return al < 0.5 ? a : b;
    if (al <= 0) return a;
    const out = cloneState(b);
    if (a.cyc === b.cyc) out.u = a.u + (b.u - a.u) * al;
    else {
      // across a cycle boundary: continue the previous cycle past 1, or the new one from its start
      const u = a.u + (b.u + 1 - a.u) * al;
      if (u < 1) return { ...cloneState(a), u, t: a.t + (b.t - a.t) * al, breathT: a.breathT + (b.breathT - a.breathT) * al };
      out.u = u - 1;
    }
    out.t = a.t + (b.t - a.t) * al;
    out.breathT = a.breathT + (b.breathT - a.breathT) * al;
    out.strainT = a.strainT + (b.strainT - a.strainT) * al;
    out.giveDeg = a.giveDeg + (b.giveDeg - a.giveDeg) * al;
    out.beard = a.beard + (b.beard - a.beard) * al;
    out.hh = a.hh + (b.hh - a.hh) * al;
    out.elb = [a.elb[0] + (b.elb[0] - a.elb[0]) * al, a.elb[1] + (b.elb[1] - a.elb[1]) * al];
    out.sBfloor = a.sBfloor + (b.sBfloor - a.sBfloor) * al;
    out.sOffT = a.sOffT + (b.sOffT - a.sOffT) * al;
    return out;
  }

  /** The cycle-linear pelvis base (D + σ·u, no per-step surge): what the camera's correction follows (§7.6). */
  linS(): number {
    const st = this.interp();
    return st.D + (st.mode === 'trudge' ? st.sigma * st.u : 0);
  }

  /** The stone position the shoulder sets, before the ratchet. */
  private solve(st: GState, trail: Trail) {
    return this.poseOf(st, trail, true);
  }

  // ---------- pose (pure read of a state) ----------
  pose(trail: Trail, R = RIG.boulderR): GaitFrame {
    return this.poseOf(this.interp(), trail, false, R);
  }

  private poseOf(st: GState, trail: Trail, rawStone: boolean, R = RIG.boulderR, filter = true): GaitFrame {
    const trudge = st.mode === 'trudge';
    const k = trudge ? st.u : 0;
    const sz = this.strain(st);
    const pelvisS = this.pelvisSOf(st);
    const theta = this.footprintSlope(trail, pelvisS);
    const base = trail.at(pelvisS);
    const tan = trail.tangentAt(pelvisS), nrm = trail.normalAt(pelvisS);
    const b = this.breath(st);
    const front = st.feet[st.front], rear = st.feet[st.front ^ 1];
    // Stance (front) foot: ball locked, heel peeling up through the second half.
    const stanceHeel = (trudge ? KEY.stanceHeel(k) : 0) * DEG;
    const stanceFoot = footAt(front.ball, front.ground, stanceHeel);
    // Rear / swing foot.
    let swingFoot: FootPose;
    let swingPlanted = true;
    const kk = cosRatio(theta);
    const sT = st.D + st.sigma + KEY_OFF * st.sigma + FRONT_FOOT * kk;
    const plantTarget = footAt(trail.at(sT), trail.angleAt(sT) * DEG, 0);
    if (!trudge || k < PHASE.toeOff) {
      const heel = trudge ? KEY.rearHeel(k) : 22 + (st.mode === 'strain' ? sz.heel : 0);
      swingFoot = footAt(rear.ball, rear.ground, heel * DEG);
    } else if (k < PHASE.contact) {
      // The swing ankle travels on an early-peaked arc from its last planted spot to the plant target (§4.4,
      // disney "arcs"): progress eases in-out (C2), the lift peaks at 40% of the swing, the toe hangs, then the sole
      // decelerates flat onto the ground. The knee follows by IK, always on the uphill side (no flips).
      swingPlanted = false;
      const sw = (k - PHASE.toeOff) / (PHASE.contact - PHASE.toeOff);
      // Hermite progress: leaves the ground already moving with the body (start slope 0.8), decelerates onto the plant
      const sc = Math.min(1, Math.max(0, sw));
      const prog = 0 * (sc - 2 * sc * sc + sc * sc * sc) + (3 * sc * sc - 2 * sc * sc * sc);
      const last = footAt(rear.ball, rear.ground, KEY.rearHeel(PHASE.toeOff) * DEG);
      const lift = 0.045 * st.clear * (sw < 0.5 ? ease5(sw / 0.5) : 1 - ease5((sw - 0.5) / 0.5));
      const gx = last.ankle.x + (plantTarget.ankle.x - last.ankle.x) * prog;
      const gy = last.ankle.y + (plantTarget.ankle.y - last.ankle.y) * prog;
      const pitchDeg = 40 * (1 - ease5((sw - 0) / 0.45)) - 15 * Math.sin(Math.PI * ease5((sw - 0.2) / 0.6)) * (1 - ease5((sw - 0.8) / 0.2));
      swingFoot = footFromAnkle({ x: gx, y: gy + lift }, plantTarget.angle, pitchDeg * DEG);
    } else {
      swingFoot = plantTarget;
    }
    // Pelvis height along the slope normal (never moves a planted foot). V2: the pelvis rides the pushing leg's
    // reach at a keyed knee angle, so the drive leg is long and near-straight — the spear of the key pose:
    // - press (u < 0.32): the rear knee at 167°; anticipation eases it to 148° by toe-off (it is bending when the
    //   foot lifts, so it never snaps);
    // - from the end of the press the stance leg takes over (blended over 0.16 of the cycle) and is walked open at
    //   an even rate, 107° → 168° by the step boundary, where it becomes the next press's rear leg (the same leg, the same knee).
    // Small offsets ride on top: breath, the strain beat's sink and tremor.
    const extra = 0.002 * b + sz.dy + sz.tremor;
    // an airborne foot never holds the body down: only planted ankles limit the pelvis
    const ceilFront = hipCeiling(base, nrm, 2, [stanceFoot.ankle], LEG_MAX);
    const ceilSwing = swingPlanted ? hipCeiling(base, nrm, 2, [swingFoot.ankle], LEG_MAX) : 9;
    const ceil = Math.min(ceilFront, ceilSwing); // hard: planted feet only
    const kneeR = !trudge || k <= PRESS_END ? PRESS_KNEE : PRESS_KNEE - (PRESS_KNEE - TOEOFF_KNEE) * trapRamp((k - PRESS_END) / (PHASE.toeOff - PRESS_END));
    const rearFoot = !trudge || k < PHASE.toeOff || swingPlanted && k < 0.5 ? swingFoot : footAt(rear.ball, rear.ground, KEY.rearHeel(PHASE.toeOff) * DEG);
    const cR = Math.min(hipCeiling(base, nrm, 2, [rearFoot.ankle], kneeReach(kneeR), true), ceilFront - 0.003);
    let hhTarget = cR;
    if (trudge && k >= PHASE.toeOff - TO_BLEND) {
      // from toe-off the stance leg drives: its knee starts at exactly the angle it had at toe-off (so the height
      // is continuous) and is walked open to 168° by the step boundary
      const sToe = st.D + this.sigEff(st) * (st.stop || st.toStrain ? KEY.travelStop : KEY.travel)(PHASE.toeOff) - sz.back;
      const b0 = trail.at(sToe), n0 = trail.normalAt(sToe);
      const rearToe = footAt(rear.ball, rear.ground, KEY.rearHeel(PHASE.toeOff) * DEG).ankle;
      const h0 = Math.min(hipCeiling(b0, n0, 2, [rearToe], kneeReach(TOEOFF_KNEE), true), hipCeiling(b0, n0, 2, [stanceFoot.ankle], LEG_MAX) - 0.003);
      const hip0 = { x: b0.x + n0.x * h0, y: b0.y + n0.y * h0 };
      const d0 = Math.hypot(hip0.x - stanceFoot.ankle.x, hip0.y - stanceFoot.ankle.y);
      const k0 = Math.acos(Math.max(-1, Math.min(1, (RIG.thigh ** 2 + RIG.shin ** 2 - d0 * d0) / (2 * RIG.thigh * RIG.shin)))) / DEG;
      const kneeS = k0 + (PRESS_KNEE - k0) * trapRamp((k - PHASE.toeOff) / (1 - PHASE.toeOff));
      const cS = hipCeiling(base, nrm, 2, [stanceFoot.ankle], kneeReach(kneeS), true); // (the knee limits below cap it smoothly)
      // both drives are defined on both sides of toe-off: the hand-over is a C2 blend across it (no velocity step)
      hhTarget = cR + (cS - cR) * ease5((k - PHASE.toeOff + TO_BLEND) / (2 * TO_BLEND));
    }
    hhTarget += extra;
    // the lifting foot's knee limit (from its last planted spot) fades out over the first 0.15 of the swing: the
    // limited and unlimited heights are blended (C2), so nothing jumps when the foot lifts
    const stanceKneeCeil = hipCeiling(base, nrm, 2, [stanceFoot.ankle], KNEE_SOFT);
    let swingKneeCeil = 9;
    if (swingPlanted) swingKneeCeil = hipCeiling(base, nrm, 2, [swingFoot.ankle], KNEE_SOFT);
    else if (trudge && k < PHASE.toeOff + 0.15) {
      // the limit as it stood at toe-off (the foot's last planted spot, at the toe-off pelvis base), lifted away
      const sT = st.D + this.sigEff(st) * (st.stop || st.toStrain ? KEY.travelStop : KEY.travel)(PHASE.toeOff) - sz.back;
      const lim0 = hipCeiling(trail.at(sT), trail.normalAt(sT), 2, [footAt(rear.ball, rear.ground, KEY.rearHeel(PHASE.toeOff) * DEG).ankle], KNEE_SOFT, true);
      swingKneeCeil = lim0 + 0.15 * ease5((k - PHASE.toeOff) / 0.15);
    }
    const fadeSwing = swingPlanted || !trudge ? 0 : ease5((k - PHASE.toeOff) / 0.06);
    const smin = (a: number, c: number, kk: number) => 0.5 * (a + c - Math.sqrt((a - c) ** 2 + kk * kk));
    const kneeLimit = (hgt: number, kk: number, off: number) => {
      const withSwing = smin(hgt, Math.min(stanceKneeCeil, swingKneeCeil) - off, kk), without = smin(hgt, stanceKneeCeil - off, kk);
      return withSwing + (without - withSwing) * fadeSwing;
    };
    // the target itself respects the planted knees' soft limit (≈ 170°), so the spring never runs into it
    hhTarget = kneeLimit(hhTarget, 0.003, 0);
    // the planted legs open to ≈ 169° at most: a soft limit just inside the hard reach, so the spring's small
    // overshoots never snap a knee straight (near-straight, a millimetre of height is ten degrees of knee)
    const hRaw = Number.isFinite(st.hh) && !rawStone ? st.hh : hhTarget;
    const hSoft = kneeLimit(hRaw, 0.004, 0);
    const hh = Math.min(hSoft, ceil);
    const pelvis = { x: base.x + nrm.x * hh, y: base.y + nrm.y * hh };
    // Swing leg: keyed FK, blended to IK toward the plant target over u 0.66–0.75 (on the foot target).
    if (!swingPlanted) {
      // keep the airborne ankle within a soft reach of the hip (it trails, the knee bends; never a locked snap)
      const dx = swingFoot.ankle.x - pelvis.x, dy = swingFoot.ankle.y - pelvis.y, d = Math.hypot(dx, dy) || 1;
      const L0 = 0.93 * LEG_CHAIN, Lm = 0.985 * LEG_CHAIN;
      if (d > L0) {
        // eased in over the first quarter of the swing: at toe-off the ankle is exactly where it was planted
        const swK = ease5(((k - PHASE.toeOff) / (PHASE.contact - PHASE.toeOff)) / 0.25);
        const d2 = d + (Lm - (Lm - L0) * Math.exp(-(d - L0) / (Lm - L0)) - d) * swK;
        const a2 = { x: pelvis.x + (dx / d) * d2, y: pelvis.y + (dy / d) * d2 };
        const sh = { x: a2.x - swingFoot.ankle.x, y: a2.y - swingFoot.ankle.y };
        swingFoot = { ball: { x: swingFoot.ball.x + sh.x, y: swingFoot.ball.y + sh.y }, ankle: a2, heel: { x: swingFoot.heel.x + sh.x, y: swingFoot.heel.y + sh.y }, toe: { x: swingFoot.toe.x + sh.x, y: swingFoot.toe.y + sh.y }, angle: swingFoot.angle };
      }
    }
    const swingLeg: Limb = legIK(pelvis, swingFoot.ankle, tan);
    const stanceLeg = legIK(pelvis, stanceFoot.ankle, tan);
    // Torso lean (lagged 60 ms) and the shoulder; per-cycle lean variation eases in over the press.
    const leanVar = st.leanVarPrev + (st.leanVar - st.leanVarPrev) * (trudge ? ease5(k / 0.3) : 1);
    const lagLean = this.lagged('lean', 0.06, st.t);
    const leanDeg = lean0(theta) + lagLean + leanVar + 0.4 * (noise1(st.breathT / 4.8 + this.seed) - 0.5) * 2 + sz.lean;
    const lean = leanDeg * DEG;
    const shoulder = { x: pelvis.x + RIG.torso * Math.sin(lean), y: pelvis.y + RIG.torso * Math.cos(lean) + 0.002 * b }; // + the pelvis's 0.002 = shoulders ±0.004 H
    // The stone from the shoulder at the locked extension (less the elbow give), ratcheted; a strain slip moves it back.
    const ua = RIG.upperArm, fa = RIG.foreArm, el = (170 - st.giveDeg) * DEG;
    const eGive = Math.sqrt(ua * ua + fa * fa - 2 * ua * fa * Math.cos(el)) / ARM_CHAIN;
    const e = Math.max(0.93, Math.min(eGive, EXT - sz.ext));
    const solved = boulderSFor(trail, shoulder, stoneDistance(e, R), pelvisS + 0.3, pelvisS + 3, R);
    // the render reads the (interpolated) ratchet, never the raw solve: one continuous stone through every mode
    const sB = rawStone || !Number.isFinite(st.sBfloor) ? solved
      : st.sBfloor - (st.mode === 'strain' ? sz.back : st.sOff * (1 - ease5(st.sOffT / 0.6)));
    const centre = trail.centreAt(sB, R);
    const dx = centre.x - shoulder.x, dy = centre.y - shoulder.y, dl = Math.hypot(dx, dy) || 1;
    const ux = dx / dl, uy = dy / dl;
    const handAt = (o: number): V => { const ang = Math.atan2(-uy, -ux) + o / R; return { x: centre.x + Math.cos(ang) * (R + RIG.palm), y: centre.y + Math.sin(ang) * (R + RIG.palm) }; };
    const hands: [V, V] = [handAt(HAND_NEAR), handAt(HAND_FAR)];
    const wrists = hands.map((p) => {
      const nx = (p.x - centre.x) / (R + RIG.palm), ny = (p.y - centre.y) / (R + RIG.palm);
      const tr = { x: 0 * nx, y: 0 * ny }; // the body trembles; the hands stay pressed to the stone
      return { x: p.x + nx * RIG.wristToPalm + tr.x, y: p.y + ny * RIG.wristToPalm + tr.y };
    });
    const dNear = Math.hypot(wrists[0].x - shoulder.x, wrists[0].y - shoulder.y);
    const roots = [shoulder, farShoulder(shoulder, wrists[1], dNear)];
    let arms = [armIK(roots[0], wrists[0]), armIK(roots[1], wrists[1])] as [Limb, Limb];
    if (filter && !rawStone && Number.isFinite(st.elb[0])) {
      // place each wrist along its arm line at the distance the filtered elbow angle gives
      arms = arms.map((_arm, i) => {
        const r = roots[i], wv = wrists[i], dd = Math.hypot(wv.x - r.x, wv.y - r.y) || 1;
        const ua = RIG.upperArm, fa = RIG.foreArm, th = Math.min(179, st.elb[i]) * DEG;
        const df = Math.sqrt(ua * ua + fa * fa - 2 * ua * fa * Math.cos(th));
        const w2 = { x: r.x + ((wv.x - r.x) / dd) * df, y: r.y + ((wv.y - r.y) / dd) * df };
        const sh = { x: w2.x - wv.x, y: w2.y - wv.y };
        hands[i] = { x: hands[i].x + sh.x, y: hands[i].y + sh.y };
        return armIK(r, w2);
      }) as [Limb, Limb];
    }
    const pitch = this.lagged('pitch', 0.12, st.t) + sz.head;
    const { head, axis } = headFrom(shoulder, pitch);
    const nearIsFront = st.front === 0;
    const legs: [Limb, Limb] = nearIsFront ? [stanceLeg, swingLeg] : [swingLeg, stanceLeg];
    const feet: [FootPose, FootPose] = nearIsFront ? [stanceFoot, swingFoot] : [swingFoot, stanceFoot];
    const planted: [boolean, boolean] = nearIsFront ? [true, swingPlanted] : [swingPlanted, true];
    // support: the leg carrying the body (the rear leg joins the swing phase once it fires at push-off)
    const rearSupport = !trudge || k < PHASE.antEnd || k >= PHASE.contact;
    const support: [boolean, boolean] = nearIsFront ? [true, rearSupport] : [rearSupport, true];
    const rot = trail.centreArc(sB, R) / R;
    const elbow = Math.min(interiorDeg(arms[0]), interiorDeg(arms[1]));
    const pose: Pose = { pelvis, shoulder, head, headAxis: axis, lean, legs, arms, hands, feet, facing: 1, breath: 1 + 0.015 * b, alpha: 1, load: st.giveDeg / 6, beard: st.beard * DEG, veins: sz.veins };
    return { pose, centre, rot, sB, planted, support, elbow, beard: st.beard, hhTarget, ceil, mode: st.mode, strainT: st.mode === 'strain' ? st.strainT : -1 };
  }
}

/** Foot whose ankle is at `ankle`, sole along groundRad, pitched by `pitch` (heel up, rad). */
export function footFromAnkle(ankle: V, groundRad: number, pitch: number): FootPose {
  const probe = footAt({ x: 0, y: 0 }, groundRad, pitch);
  return footAt({ x: ankle.x - probe.ankle.x, y: ankle.y - probe.ankle.y }, groundRad, pitch);
}

export function interiorDeg(l: Limb): number {
  const a = { x: l.root.x - l.joint.x, y: l.root.y - l.joint.y }, b = { x: l.end.x - l.joint.x, y: l.end.y - l.joint.y };
  const c = (a.x * b.x + a.y * b.y) / ((Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)) || 1);
  return Math.acos(Math.min(1, Math.max(-1, c))) / DEG;
}

export { LEG_CHAIN };
