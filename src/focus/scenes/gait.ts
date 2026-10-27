// The push cycle (ROUND3_ART §4): a keyframed step-and-hold gait with locked feet, a swing leg blended FK→IK,
// a boulder solved from the shoulders that turns by exactly its travel, elbow give, strain beats, idles and breathing.
// Pure and seeded: same seed + same step() calls ⇒ same poses. World units are H (y up).
import { mulberry32, noise1, smoothstep } from './noise';
import type { V } from './path';
import type { Trail } from './trail';
import {
  ARM_CHAIN, DEG, FRONT_FOOT, HAND_FAR, HAND_NEAR, REAR_HEEL, farShoulder, stoneDistance, h0, LEG_CHAIN, LEG_MAX, REAR_FOOT, RIG, armIK, boulderSFor, cosRatio, footAt, headFrom, hipCeiling, lean0, legIK,
  type FootPose, type Limb, type Pose,
} from './rig';

/** Global wind in H/s, pointing +x (uphill, into the figure's back), with slow gusts. */
export function wind(t: number): number {
  const base = 0.06 * (0.7 + 0.6 * noise1(t * 0.13));
  const g = noise1(t * 0.13 + 40);
  return base * (1 + 0.8 * smoothstep(0.68, 0.78, g));
}

/** Monotone cubic (Fritsch–Carlson) through keys, with zero end slopes (so the body is at rest at contact/hold). */
export function keyCurve(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const d: number[] = [], m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const hgt = xs[i + 1] - xs[i], t = (x - xs[i]) / hgt, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hgt * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hgt * m[i + 1];
  };
}

// §4.3 keyframe table.
const U = [0, 0.10, 0.20, 0.45, 0.68, 0.80, 0.90, 1.0];
export const KEY = {
  travel: keyCurve(U, [0, 0.03, 0.12, 0.55, 0.85, 0.95, 0.985, 1]),
  hipDy: keyCurve(U, [0, -0.008, -0.008, 0.014, 0.006, 0.0, -0.024, 0]),
  lean: keyCurve(U, [0, 1, 3, 1, 0, -1, -1.5, 0]),
  pitch: keyCurve(U, [0, -1, -3, -1, 0, 1, 2, 0]),
  drive: keyCurve(U, [0, 0.5, 1, 0.3, 0, 0, 0, 0]),
  swingThigh: keyCurve(U, [-24, -25, -27, 15, 42, 46, 45, 45]),
  swingKnee: keyCurve(U, [172, 174, 176, 85, 100, 90, 88, 92]),
  swingPitch: keyCurve(U, [30, 38, 50, -15, -5, 0, 0, 0]),
  stanceHeel: keyCurve([0, 0.45, 0.68, 0.8, 0.9, 1], [0, 0, 9, 20, 26, 30]),
};

export const PACE = 0.1333;
export const sigmaAt = (thetaDeg: number) => (FRONT_FOOT + REAR_FOOT) * cosRatio(thetaDeg);
export const tStepAt = (thetaDeg: number) => 0.95 * (1 + (0.5 * (thetaDeg - 20)) / 25);
const FRONT = FRONT_FOOT, REAR = REAR_FOOT;
const OMEGA_GIVE = 14;
const EXT = 0.995;

type Mode = 'hold' | 'step' | 'strain';
type IdleKind = 'regrip' | 'shift' | 'heel' | 'look';
interface Foot { ballS: number; ball: V; ground: number; heel: number }

export interface GaitOptions { climbing: boolean; lenH: number; speed?: number; idles?: boolean }
export interface GaitFrame { pose: Pose; centre: V; rot: number; sB: number; planted: [boolean, boolean]; elbow: number }

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const easeIn = (u: number) => u * u;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class Gait {
  mode: Mode = 'hold';
  D = 0;
  u = 0;
  t = 0;
  holdT = 0;
  front: 0 | 1 = 0;
  feet: [Foot, Foot] = [{ ballS: 0, ball: { x: 0, y: 0 }, ground: 0, heel: 0 }, { ballS: 0, ball: { x: 0, y: 0 }, ground: 0, heel: 0 }];
  pairLeft = 0;
  v = { sigma: 0.34, T: 0.95, clear: 1, lean: 0 };
  give = 0; giveV = 0;
  strainT = 0;
  holdsToStrain = 6;
  idle: IdleKind | null = null; idleT = 0; nextIdle = 3.5; lastIdle: IdleKind | null = null;
  breathT = 0;
  thetaF = 22;
  events = { grit: false, stepEnd: false };
  private rng: () => number;
  private hist: Array<{ t: number; lean: number; pitch: number }> = [];
  private lastPelvisS = 0;
  private seed: number;
  /** Pelvis surge speed (H/s along the trail) last step(). */
  vel = 0;
  private velPrev = 0;
  private accF = 0;

  constructor(seed = 1) { this.seed = seed; this.rng = mulberry32(seed); }

  // ---------- scheduling ----------
  /** Re-plant both feet in the hold pose at D (|debt| > 4σ, reload, a new climb). */
  snap(D: number, trail: Trail) {
    this.D = D; this.mode = 'hold'; this.u = 0; this.holdT = 0; this.pairLeft = 0;
    this.give = 0; this.giveV = 0; this.idle = null; this.idleT = 0; this.strainT = 0;
    this.thetaF = this.footprintSlope(trail, D);
    this.v = { sigma: sigmaAt(this.thetaF), T: tStepAt(this.thetaF), clear: 1, lean: 0 };
    const k = cosRatio(this.thetaF);
    this.plant(this.front, D + FRONT * k, trail, 0);
    this.plant((this.front ^ 1) as 0 | 1, D - REAR * k, trail, REAR_HEEL * DEG);
    this.hist = [];
    this.sBfloor = -Infinity;
    this.lastPelvisS = D;
    this.vel = 0; this.velPrev = 0; this.accF = 0;
  }

  /** Reduced motion / paused: reduced snaps to the hold pose at the target; paused freezes. */
  settle(Dtarget: number, trail: Trail, reduced: boolean) {
    this.events.grit = false; this.events.stepEnd = false;
    if (reduced && (this.mode !== 'hold' || Math.abs(Dtarget - this.D) > 1e-3 || this.idle)) this.snap(Dtarget, trail);
  }

  private plant(i: 0 | 1, s: number, trail: Trail, heel: number) {
    this.feet[i] = { ballS: s, ball: trail.at(s), ground: trail.angleAt(s) * DEG, heel };
  }

  private footprintSlope(trail: Trail, s: number): number {
    return (trail.angleAt(s - 0.2) + trail.angleAt(s) + trail.angleAt(s + 0.15)) / 3;
  }

  private startStep(pair: number) {
    const r = this.rng;
    this.mode = 'step'; this.u = 0; this.pairLeft = pair;
    this.v = {
      sigma: sigmaAt(this.thetaF) * (1 + 0.06 * (2 * r() - 1)),
      T: tStepAt(this.thetaF) * (1 + 0.03 * (2 * r() - 1)),
      clear: 1 + 0.15 * (2 * r() - 1),
      lean: 1.5 * (2 * r() - 1),
    };
    this.idle = null; this.idleT = 0;
  }

  private strainDue(lenH: number): boolean {
    if (this.D < 4) return false; // never in the first 30 s of a climb
    return this.holdsToStrain <= 0 && lenH > 0;
  }

  step(dt: number, Dtarget: number, trail: Trail, opts: GaitOptions) {
    this.events.grit = false; this.events.stepEnd = false;
    const speed = opts.speed ?? 1;
    const sig = sigmaAt(this.footprintSlope(trail, this.D));
    const debt = Dtarget - this.D;
    if (Math.abs(debt) > 4 * sig + 0.05) { this.snap(Dtarget, trail); this.tick(dt, trail); return; }
    switch (this.mode) {
      case 'hold': {
        this.holdT += dt;
        const v = PACE;
        if (this.idle) { this.idleT += dt; if (this.idleT >= 1.2) { this.idle = null; this.idleT = 0; } }
        if (opts.climbing && this.holdT >= 0.35 && debt >= 1.4 * sig && !this.idle) this.startStep(2);
        else if (!opts.climbing && this.holdT >= 0.2 && debt >= 0.5 * sig && !this.idle) this.startStep(1);
        else if (opts.climbing && !this.idle && this.strainDue(opts.lenH) && this.holdT >= 1.0 && debt < 0.9 * sig) {
          this.mode = 'strain'; this.strainT = 0; this.idle = null;
        } else if ((opts.idles ?? true) && opts.climbing && !this.idle && this.holdT >= this.nextIdle && debt + 1.25 * v < 1.4 * sig) {
          const kinds: IdleKind[] = ['regrip', 'shift', 'heel', 'look'];
          let k = kinds[Math.floor(this.rng() * kinds.length)];
          if (k === this.lastIdle) k = kinds[(kinds.indexOf(k) + 1) % kinds.length];
          this.idle = k; this.lastIdle = k; this.idleT = 0; this.nextIdle = this.holdT + 1.2 + 3 + 2 * this.rng();
        }
        break;
      }
      case 'step': {
        this.u += (dt * speed) / this.v.T;
        if (this.u >= 1) {
          const swing = (this.front ^ 1) as 0 | 1;
          const k = cosRatio(this.thetaF);
          this.plant(swing, this.D + this.v.sigma + FRONT * k, trail, 0);
          this.feet[this.front].heel = REAR_HEEL * DEG;
          this.D += this.v.sigma; this.front = swing; this.u = 0; this.pairLeft--;
          this.events.stepEnd = true;
          this.thetaF = this.footprintSlope(trail, this.D);
          const d2 = Dtarget - this.D;
          const catchUp = opts.climbing ? d2 >= 0.8 * this.v.sigma : d2 >= 0.5 * this.v.sigma;
          if (this.pairLeft > 0 || catchUp) this.startStep(Math.max(this.pairLeft, 1));
          else { this.mode = 'hold'; this.holdT = 0; this.holdsToStrain--; if (this.holdsToStrain < 0) this.holdsToStrain = 0; }
        }
        break;
      }
      case 'strain': {
        const before = this.strainT;
        this.strainT += dt;
        if (before < 1.4 && this.strainT >= 1.4) this.events.grit = true;
        if (this.strainT >= 3.0) {
          this.mode = 'hold'; this.holdT = 0; this.strainT = 0;
          const late = this.D > 0.7 * opts.lenH;
          this.holdsToStrain = late ? 3 + Math.floor(this.rng() * 3) : 4 + Math.floor(this.rng() * 5);
        }
        break;
      }
    }
    this.tick(dt, trail);
    this.ratchet(trail);
  }

  /** Lowest stone position allowed outside a slip (the ratchet); −∞ until the first pose after a snap. */
  sBfloor = -Infinity;
  /** The slip, catch and recover of a strain beat: the stone may roll back, then forward again. */
  slipping(): boolean { return this.mode === 'strain' && this.strainT >= 1.4 && this.strainT < 2.6; }
  private ratchet(trail: Trail) {
    if (this.mode === 'strain') return;
    this.sBfloor = Math.max(this.sBfloor, this.pose(trail).sB);
  }

  private tick(dt: number, trail: Trail) {
    this.t += dt; this.breathT += dt;
    // Elbow give: a critically damped spring driven by the pelvis surge (the stone's inertia), ω = 14.
    const ps = this.pelvisS();
    this.vel = dt > 0 ? (ps - this.lastPelvisS) / dt : 0;
    this.lastPelvisS = ps;
    // driven by the surge (forward acceleration): the stone lags as the pelvis speeds up, then the arms re-lock
    const v0 = this.velPrev; this.velPrev = this.vel;
    const acc = dt > 0 ? (this.vel - v0) / dt : 0;
    this.accF += (acc - this.accF) * Math.min(1, dt * 20);
    const target = Math.min(13, Math.max(0, this.accF) * (2.8 * this.v.T * this.v.T / this.v.sigma)); // elbow give, degrees
    const a = -OMEGA_GIVE * OMEGA_GIVE * (this.give - target) - 2 * OMEGA_GIVE * this.giveV;
    this.giveV += a * dt; this.give = Math.max(0, this.give + this.giveV * dt);
    // raw channels for the lagged torso/head
    const k = this.mode === 'step' ? this.u : 0;
    this.hist.push({ t: this.t, lean: this.mode === 'step' ? KEY.lean(k) : 0, pitch: this.mode === 'step' ? KEY.pitch(k) : 0 });
    while (this.hist.length > 2 && this.t - this.hist[1].t > 0.4) this.hist.shift();
    void trail;
  }

  private lagged(ch: 'lean' | 'pitch', lag: number): number {
    const h = this.hist;
    if (!h.length) return 0;
    const tt = this.t - lag;
    if (tt <= h[0].t) return h[0][ch];
    for (let i = h.length - 1; i > 0; i--) {
      if (h[i - 1].t <= tt) { const a = h[i - 1], b = h[i]; const k = (tt - a.t) / ((b.t - a.t) || 1); return a[ch] + (b[ch] - a[ch]) * k; }
    }
    return h[h.length - 1][ch];
  }

  // ---------- strain beat channels (§4.7) ----------
  private strain() {
    const s = this.mode === 'strain' ? this.strainT : -1;
    if (s < 0) return { back: 0, dy: 0, lean: 0, ext: 0, head: 0, tremor: 0, heel: 0 };
    let back = 0, dy = 0, lean = 0, ext = 0, head = 0, heel = 0;
    if (s < 0.5) { const k = easeIn(s / 0.5); lean = 5 * k; dy = -0.02 * k; }
    else if (s < 1.4) { lean = 5; dy = -0.02; heel = 8 * smoothstep(0.5, 0.8, s); }
    else if (s < 1.7) { const k = easeIn((s - 1.4) / 0.3); lean = 5 - 2 * k; dy = -0.02; back = 0.05 * k; ext = 0.045 * k; head = 6 * k; heel = 8; }
    else if (s < 2.0) { const q = (s - 1.7) / 0.3; back = 0.05 * (1 + 0.1 * Math.sin(Math.PI * q) * Math.exp(-2 * q)); lean = 3; dy = -0.02 - 0.006 * Math.sin(Math.PI * q); ext = 0.045; head = 6; heel = 8 * (1 - q); }
    else if (s < 2.6) { const k = ease((s - 2.0) / 0.6); back = 0.05 * (1 - k); lean = 3 - 2 * k; dy = -0.02 * (1 - k); ext = 0.045 * (1 - k); head = 6 * (1 - k); }
    else { const k = ease((s - 2.6) / 0.4); lean = 1 - k; }
    const tremor = s >= 0.5 && s < 1.4 ? 0.002 * Math.sin(2 * Math.PI * 9 * s) : 0;
    return { back, dy, lean, ext, head, tremor, heel };
  }

  private idleCh() {
    if (!this.idle) return { shift: 0, regrip: 0, heel: 0, look: 0 };
    const q = clamp01(this.idleT / 1.2), bump = Math.sin(Math.PI * q);
    switch (this.idle) {
      case 'shift': return { shift: 0.01 * bump, regrip: 0, heel: 0, look: 0 };
      case 'regrip': return { shift: 0, regrip: 0.03 * bump, heel: 0, look: 0 };
      case 'heel': return { shift: 0, regrip: 0, heel: -10 * bump, look: 0 };
      case 'look': return { shift: 0, regrip: 0, heel: 0, look: -12 * smoothstep(0, 0.17, q) * (1 - smoothstep(0.83, 1, q)) };
    }
  }

  /** Breath phase −1..1: inhale 1.5 s, exhale 1.9 s (3.4 s period, co-prime with the steps). */
  breathPhase(): number {
    if (this.mode === 'strain' && this.strainT < 1.4) return 1;
    const q = this.breathT % 3.4;
    return q < 1.5 ? -Math.cos((Math.PI * q) / 1.5) : Math.cos((Math.PI * (q - 1.5)) / 1.9);
  }

  /** Pelvis base along the trail, without the bob (camera target). */
  baseS(): number { return this.D + (this.mode === 'step' ? this.v.sigma * KEY.travel(this.u) : 0); }

  private pelvisS(): number { return this.baseS() - this.strain().back + this.idleCh().shift; }

  // ---------- pose (pure read) ----------
  pose(trail: Trail, R = RIG.boulderR): GaitFrame {
    const k = this.mode === 'step' ? this.u : 0;
    const st = this.strain(), id = this.idleCh();
    const pelvisS = this.pelvisS();
    const theta = this.thetaF;
    const base = trail.at(pelvisS);
    const tan = trail.tangentAt(pelvisS), nrm = trail.normalAt(pelvisS);
    const b = this.breathPhase();
    const front = this.feet[this.front], rear = this.feet[this.front ^ 1];
    const stepping = this.mode === 'step';
    // Stance (front) foot: ball fixed, heel rises 0.45 → 1.
    const stanceHeel = stepping ? KEY.stanceHeel(k) * DEG : front.heel;
    const stanceFoot = footAt(front.ball, front.ground, stanceHeel);
    // Rear / swing foot.
    let swingFoot: FootPose;
    let swingPlanted = true;
    let swingTarget: FootPose | null = null;
    const kk = cosRatio(theta);
    if (!stepping) {
      swingFoot = footAt(rear.ball, rear.ground, rear.heel + (st.heel + id.heel) * DEG);
    } else if (k < 0.2) {
      swingFoot = footAt(rear.ball, rear.ground, KEY.swingPitch(k) * DEG);
    } else if (k < 0.8) {
      swingPlanted = false;
      const sT = this.D + this.v.sigma + FRONT * kk;
      swingTarget = footAt(trail.at(sT), trail.angleAt(sT) * DEG, 0);
      swingFoot = swingTarget; // replaced below once the pelvis is known
    } else {
      const sT = this.D + this.v.sigma + FRONT * kk;
      swingFoot = footAt(trail.at(sT), trail.angleAt(sT) * DEG, 0);
    }
    // Pelvis height with the ceiling (never move a planted foot).
    let hh = h0(theta) + KEY.hipDy(k) + 0.004 * b * 0.5 + st.dy + st.tremor;
    const ankles = [stanceFoot.ankle];
    if (swingPlanted) ankles.push(swingFoot.ankle);
    hh = hipCeiling(base, nrm, hh, ankles, LEG_MAX);
    const pelvis = { x: base.x + nrm.x * hh, y: base.y + nrm.y * hh }; // along the slope normal (ROUND4 §3.4)
    // Swing leg in the air: keyed FK, blended to IK toward the plant target from u 0.62 to 0.80.
    let swingLeg: Limb;
    if (!swingPlanted && swingTarget) {
      const a = KEY.swingThigh(k) * DEG, kn = KEY.swingKnee(k) * DEG;
      const dir = (ang: number): V => ({ x: -nrm.x * Math.cos(ang) + tan.x * Math.sin(ang), y: -nrm.y * Math.cos(ang) + tan.y * Math.sin(ang) });
      const knee = { x: pelvis.x + dir(a).x * RIG.thigh, y: pelvis.y + dir(a).y * RIG.thigh };
      const sa = a - (Math.PI - kn);
      const fkAnkle = { x: knee.x + dir(sa).x * RIG.shin, y: knee.y + dir(sa).y * RIG.shin };
      // clearance scale (micro-variation)
      const w = smoothstep(0.62, 0.80, k);
      let ankle = { x: fkAnkle.x + (swingTarget.ankle.x - fkAnkle.x) * w, y: fkAnkle.y + (swingTarget.ankle.y - fkAnkle.y) * w };
      const pitch = KEY.swingPitch(k) * DEG;
      const gr = trail.angleAt(this.D + this.v.sigma * 0.5) * DEG;
      swingFoot = footFromAnkle(ankle, gr * (1 - w) + swingTarget.angle * w, pitch * (1 - w));
      // clearance guard: keep heel and toe above the ground (lift by the deepest penetration + margin)
      const low = Math.min(swingFoot.heel.y - trail.groundY(swingFoot.heel.x), swingFoot.toe.y - trail.groundY(swingFoot.toe.x), swingFoot.ball.y - trail.groundY(swingFoot.ball.x));
      const lift = (1 - w) * 0.02 * this.v.clear;
      if (low < lift) { const dy = lift - low; ankle = { x: ankle.x, y: ankle.y + dy }; swingFoot = footFromAnkle(ankle, gr * (1 - w) + swingTarget.angle * w, pitch * (1 - w)); }
      swingLeg = legIK(pelvis, swingFoot.ankle, tan);
    } else swingLeg = legIK(pelvis, swingFoot.ankle, tan);
    const stanceLeg = legIK(pelvis, stanceFoot.ankle, tan);
    // Torso lean (lagged 50 ms) and shoulders.
    const leanBase = lean0(theta) + this.lagged('lean', 0.05) + this.v.lean * (stepping ? 1 : 0.5) + st.lean;
    const leanDeg = leanBase + 0 * this.seed; // lean noise returns with the S2 trudge (it must not pump the stone ratchet)
    const drive = 0.01 * (1 + KEY.drive(k));
    // The shoulder comes from the pelvis without the idle weight shift or tremor (the torso tilts to absorb them),
    // and the stone is solved from that shoulder: locked elbows are so sensitive that any other source of
    // shoulder motion would make them wobble. The stone moves only with travel (and a slip).
    const base0 = trail.at(pelvisS - id.shift);
    const n0 = trail.normalAt(pelvisS - id.shift), h0n = hh - st.tremor - 0.002 * b;
    const pelvis0 = { x: base0.x + n0.x * h0n, y: base0.y + n0.y * h0n };
    const shoulder = { x: pelvis0.x + RIG.torso * Math.sin(leanDeg * DEG) + tan.x * drive, y: pelvis0.y + RIG.torso * Math.cos(leanDeg * DEG) + tan.y * drive };
    const lean = Math.atan2(shoulder.x - pelvis.x, shoulder.y - pelvis.y);
    // elbow give in degrees from the locked 170° (the IK keeps both bones; extension follows from the angle)
    const ua = RIG.upperArm, fa = RIG.foreArm, el = (170 - this.give) * DEG;
    const eGive = Math.sqrt(ua * ua + fa * fa - 2 * ua * fa * Math.cos(el)) / ARM_CHAIN;
    const e = Math.max(0.94, Math.min(eGive, EXT - st.ext));
    const A = stoneDistance(e, R);
    const solved = boulderSFor(trail, shoulder, A, pelvisS + 0.3, pelvisS + 3, R);
    // Ratchet (ROUND4 §5.2): outside a slip the stone never rolls back; the elbows take up any shoulder dip.
    // In a strain beat the stone holds, then slips back with the body and is driven forward again (net zero).
    const sB = this.mode === 'strain' && Number.isFinite(this.sBfloor) ? this.sBfloor - st.back : Math.max(solved, this.sBfloor);
    const centre = trail.centreAt(sB, R);
    const dx = centre.x - shoulder.x, dy = centre.y - shoulder.y, dl = Math.hypot(dx, dy) || 1;
    const ux = dx / dl, uy = dy / dl;
    const handAt = (o: number): V => { const ang = Math.atan2(-uy, -ux) + o / R; return { x: centre.x + Math.cos(ang) * (R + RIG.palm), y: centre.y + Math.sin(ang) * (R + RIG.palm) }; };
    const hands: [V, V] = [handAt(HAND_NEAR - id.regrip), handAt(HAND_FAR)];
    const wrists = hands.map((p) => {
      const nx = (p.x - centre.x) / (R + RIG.palm), ny = (p.y - centre.y) / (R + RIG.palm);
      const tr = { x: nx * st.tremor * 0.5, y: ny * st.tremor * 0.5 };
      return { x: p.x + nx * RIG.wristToPalm + tr.x, y: p.y + ny * RIG.wristToPalm + tr.y };
    });
    const dNear = Math.hypot(wrists[0].x - shoulder.x, wrists[0].y - shoulder.y);
    const arms = [armIK(shoulder, wrists[0]), armIK(farShoulder(shoulder, wrists[1], dNear), wrists[1])] as [Limb, Limb];
    const pitch = this.lagged('pitch', 0.15) + st.head + id.look;
    const { head, axis } = headFrom(shoulder, pitch);
    const nearIsFront = this.front === 0;
    const legs: [Limb, Limb] = nearIsFront ? [stanceLeg, swingLeg] : [swingLeg, stanceLeg];
    const feet: [FootPose, FootPose] = nearIsFront ? [stanceFoot, swingFoot] : [swingFoot, stanceFoot];
    const planted: [boolean, boolean] = nearIsFront ? [true, swingPlanted] : [swingPlanted, true];
    const rot = trail.centreArc(sB, R) / R;
    const elbow = Math.min(interiorDeg(arms[0]), interiorDeg(arms[1]));
    const pose: Pose = { pelvis, shoulder, head, headAxis: axis, lean, legs, arms, hands, feet, facing: 1, breath: 1 + 0.015 * b, alpha: 1, load: this.give / 13 };
    return { pose, centre, rot, sB, planted, elbow };
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
