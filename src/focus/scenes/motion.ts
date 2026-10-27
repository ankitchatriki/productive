// Motion v2 (ROUND3_DESIGN §3.7): gait clock, strain pauses, big slips, the stone's spring give, breathing,
// per-cycle micro-variation and wind. Pure and seeded: same seed + same steps ⇒ same state.
import { mulberry32, noise1, smoothstep } from './noise';

export const easeIn = (u: number) => u * u;

/** Global wind in H/s, pointing +x (uphill, into the figure's back), with slow gusts (§3.6). */
export function wind(t: number): number {
  const base = 0.06 * (0.7 + 0.6 * noise1(t * 0.13));
  const g = noise1(t * 0.13 + 40);
  const gust = 1 + 0.8 * smoothstep(0.68, 0.78, g);
  return base * gust;
}

export interface MotionInput {
  /** Gait frozen (paused / reduced motion). */
  still: boolean;
  /** Boulder position along the climb, 0 (start) .. 1 (summit lip). */
  climb: number;
  /** Speed multiplier from sequences / milestone beat. */
  speed: number;
  /** Allow strain pauses and big slips (only while climbing). */
  climbing: boolean;
}

export interface MotionSample {
  phi: number;
  strainK: number;      // 0..1 strain-pause intensity
  heave: number;        // >1 right after a strain pause
  leanAdj: number;      // degrees added to the lean
  hipAdj: number;       // H
  surgeMul: number;
  strideMul: number;
  liftMul: number;
  slipExtra: number;    // extra slide of the planted foot during a big slip (H)
  spring: number;       // stone offset along the path (H), damped spring
  breath: number;       // chest width multiplier
  shoulderLift: number; // H
  bigSlip: boolean;
}

/** Foot slip intensity for the foot at phase f (same table as rig.footTarget). */
const slipOf = (f: number) => { const q = ((f % 1) + 1) % 1; return q >= 0.3 && q < 0.55 ? 1 - (q - 0.3) / 0.25 : 0; };

export class Motion {
  phi = 0.42;
  T = 2.6;
  cycle = 0;
  private rng: () => number;
  private cyclesUntilPause = 6;
  private sinceStrain = 99;
  strainUntil = 0;
  private strainStart = 0;
  private heave = 1;
  private bigSlipCycle = false;
  private recover = false;
  private mul = { stride: 1, lean: 0, surge: 1, lift: 1 };
  /** Spring state (H units). */
  g = 0;
  gv = 0;
  private breathPhase = 0;
  private holdBreath = 0;
  private exhaleUntil = 0;
  events: { newCycle: boolean; bigSlipStart: boolean; slipStart: [boolean, boolean]; heaveStart: boolean } = { newCycle: false, bigSlipStart: false, slipStart: [false, false], heaveStart: false };
  private prevSlip: [number, number] = [0, 0];

  constructor(seed: number) {
    this.rng = mulberry32(seed);
    this.newMultipliers();
  }

  private newMultipliers() {
    const r = this.rng;
    this.mul = { stride: 1 + (r() * 2 - 1) * 0.10, lean: (r() * 2 - 1) * 2, surge: 1 + (r() * 2 - 1) * 0.2, lift: 1 + (r() * 2 - 1) * 0.15 };
  }

  /** Advance by dt seconds (absolute time t, for noise drift and timed holds). */
  step(t: number, dt: number, inp: MotionInput) {
    this.events = { newCycle: false, bigSlipStart: false, slipStart: [false, false], heaveStart: false };
    // Breathing runs always: inhale 1.5 s, exhale 1.9 s (3.4 s, co-prime with the gait); held during a strain.
    if (this.strainUntil > t) this.holdBreath = Math.min(1, this.holdBreath + dt / 0.4);
    else this.holdBreath = Math.max(0, this.holdBreath - dt / 0.3);
    if (this.holdBreath < 0.5) this.breathPhase = (this.breathPhase + dt / 3.4) % 1;

    if (!inp.still) {
      if (this.strainUntil > 0 && this.strainUntil <= t) {
        this.strainUntil = 0; this.heave = 1.6; this.exhaleUntil = t + 0.5; this.events.heaveStart = true; this.sinceStrain = 0;
      }
      if (this.strainUntil <= t) {
        const slow = this.recover ? 0.85 : 1;
        this.phi += (dt / this.T) * inp.speed * (this.heave > 1 ? 1.25 : 1) * slow;
        if (this.phi >= 1) {
          this.phi -= 1;
          this.cycle++;
          this.sinceStrain++;
          this.events.newCycle = true;
          this.heave = 1;
          this.recover = this.bigSlipCycle;
          this.T = 2.6 * (1 + 0.24 * (this.rng() - 0.5)) * (1 + 0.25 * Math.min(1, Math.max(0, inp.climb)));
          this.newMultipliers();
          // Big slip: ~1 in 7 cycles, never within 2 cycles after a strain pause, none on the last stretch.
          this.bigSlipCycle = inp.climbing && this.sinceStrain > 2 && inp.climb < 0.9 && this.rng() < 1 / 7;
          if (this.bigSlipCycle) this.events.bigSlipStart = true;
          this.cyclesUntilPause--;
          if (this.cyclesUntilPause <= 0 && inp.climbing) {
            // Strain pauses come more often on the upper slope (3–6 cycles instead of 5–9).
            this.cyclesUntilPause = inp.climb > 0.7 ? 3 + Math.floor(this.rng() * 4) : 5 + Math.floor(this.rng() * 5);
            this.phi = 0.42;
            this.strainStart = t;
            this.strainUntil = t + 1.6 + this.rng() * 0.8;
            this.bigSlipCycle = false;
          }
        }
      }
    }
    // Slip onsets per foot (for dust).
    const s0 = slipOf(this.phi), s1 = slipOf(this.phi + 0.5);
    this.events.slipStart = [s0 > 0 && this.prevSlip[0] === 0, s1 > 0 && this.prevSlip[1] === 0];
    this.prevSlip = [s0, s1];

    // The stone gives back: damped spring toward the push/slip target (ω 7, ζ 0.55), integrated in substeps.
    const target = this.springTarget(inp.still);
    const w = 7, z = 0.55;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const acc = w * w * (target - this.g) - 2 * z * w * this.gv;
      this.gv += acc * h;
      this.g += this.gv * h;
    }
  }

  private springTarget(still: boolean): number {
    if (still) return 0;
    const surge = 0.018 * Math.max(0, Math.sin(4 * Math.PI * this.phi - 0.6)) * this.heave * this.mul.surge;
    const slip = Math.max(slipOf(this.phi), slipOf(this.phi + 0.5));
    const big = this.bigSlipCycle ? 0.03 * slipOf(this.phi) : 0;
    // Anticipation: the stone backs off a little as the load shifts before each step.
    const ant = this.anticipation() * 0.004;
    return 0.6 * surge - 0.010 * slip - big - ant;
  }

  /** 0..1 in the 0.12 s before either foot lifts (φ .95 → 1.0 for that foot). */
  anticipation(): number {
    const a = (f: number) => { const q = ((f % 1) + 1) % 1; return q >= 0.954 ? smoothstep(0.954, 1, q) : 0; };
    return Math.max(a(this.phi), a(this.phi + 0.5));
  }

  strainK(t: number): number {
    if (this.strainUntil <= t) return 0;
    return Math.min(smoothstep(this.strainStart, this.strainStart + 0.4, t), 1 - smoothstep(this.strainUntil - 0.3, this.strainUntil, t));
  }

  sample(t: number, still: boolean): MotionSample {
    const k = still ? 0 : this.strainK(t);
    const inhale = this.breathPhase < 1.5 / 3.4 ? Math.sin((this.breathPhase / (1.5 / 3.4)) * Math.PI / 2) : Math.cos(((this.breathPhase - 1.5 / 3.4) / (1.9 / 3.4)) * Math.PI / 2);
    const b = Math.max(inhale, this.holdBreath);
    const exhale = this.exhaleUntil > t ? 1 - easeIn(1 - (this.exhaleUntil - t) / 0.5) : 0;
    const big = this.bigSlipCycle && !still ? slipOf(this.phi) : 0;
    const drop = big > 0 ? 0.015 * smoothstep(0, 0.5, 1 - big) : 0;
    const ant = still ? 0 : this.anticipation();
    return {
      phi: still ? 0.42 : this.phi,
      strainK: k,
      heave: this.heave,
      leanAdj: still ? 0 : this.mul.lean + 1.5 * (noise1(t * 0.21) * 2 - 1) + (this.recover ? 3 : 0),
      hipAdj: still ? 0 : 0.004 * (noise1(t * 0.17 + 9) * 2 - 1) - drop - 0.008 * ant,
      surgeMul: this.mul.surge,
      strideMul: this.mul.stride,
      liftMul: this.mul.lift,
      slipExtra: big * 0.08,
      spring: this.g,
      breath: 1 + 0.015 * (b * 2 - 1),
      shoulderLift: 0.004 * (b * 2 - 1) - 0.006 * exhale + (still ? 0 : 0.006 * Math.max(0, Math.sin(4 * Math.PI * (this.phi - 0.035)))),
      bigSlip: big > 0,
    };
  }
}
