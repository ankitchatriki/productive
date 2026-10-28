// Round 5 poses outside the walk (ROUND5_SISYPHUS §6): parameters, assembly by IK, the summit stand, the seated
// break, and blends in parameter space (never screen positions). Planted feet stay where they are. Pure; H, y up.
import type { V } from './path';
import { BODY, armSpan } from './body';
import {
  DEG, WALK, armIK, breathK, breathRise, clamp, dist, footFromBall, handOnStone, handPoint, legIK, upperBody, windAt,
  type FootP, type HandP, type Secondary, type Skel, type WalkPose,
} from './walk';

/** Everything a pose is made of; a Skel is assembled from it by IK. */
export interface PoseParams {
  facing: 1 | -1;
  pelvis: V;
  pelvisPitch: number;
  lean: number;
  headPitch: number;
  rise: number;
  breath: number;
  feet: [FootP, FootP];
  hands: [HandP, HandP];
  /** Each arm's root relative to the shoulder (protraction, the far shoulder's place). */
  armOff: [V, V];
  sec: Secondary;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpV = (a: V, b: V, k: number): V => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const lerpAng = (a: number, b: number, k: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };

/** cubic-bezier(0.4, 0, 0.2, 1) (the blend ease, §6): solved for x by Newton. */
export function easeStd(x: number): number {
  const t0 = clamp(x, 0, 1);
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * 0.4 + 3 * (1 - t) * t * t * 0.2 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * t * t * 1 + t * t * t;
  let t = t0;
  for (let i = 0; i < 8; i++) { const e = 1e-5, f = bx(t) - t0, d = (bx(t + e) - bx(t - e)) / (2 * e); if (Math.abs(d) < 1e-9) break; t = clamp(t - f / d, 0, 1); }
  return by(t);
}

/** The parameters of a walk frame (assemble(paramsOf(w)) reproduces w). */
export function paramsOf(w: WalkPose): PoseParams {
  const ub = upperBody(w.pelvis, w.lean, w.headAxis - w.lean, 0, w.facing);
  return {
    facing: w.facing, pelvis: w.pelvis, pelvisPitch: w.pelvisPitch, lean: w.lean, headPitch: w.headAxis - w.lean,
    rise: w.shoulder.y - ub.shoulder.y, breath: w.breath, feet: w.feet, hands: w.hands,
    armOff: [{ x: w.arms[0].shoulder.x - w.shoulder.x, y: w.arms[0].shoulder.y - w.shoulder.y }, { x: w.arms[1].shoulder.x - w.shoulder.x, y: w.arms[1].shoulder.y - w.shoulder.y }],
    sec: w.sec,
  };
}

export const wristOfHand = (h: HandP, facing: 1 | -1) => handPoint(h, BODY.wristLocal, facing);
/** A free hand whose wrist is at `wrist`, fingers along `dir`. */
export function freeHand(wrist: V, dir: number, facing: 1 | -1): HandP {
  const ex = { x: Math.cos(dir), y: Math.sin(dir) }, ey = { x: -ex.y * facing, y: ex.x * facing };
  const l = BODY.wristLocal;
  return { origin: { x: wrist.x - ex.x * l.x - ey.x * l.y, y: wrist.y - ex.y * l.x - ey.y * l.y }, dir, curve: 0 };
}

/** Skeleton from parameters: legs and arms by IK. */
export function assemble(p: PoseParams): Skel {
  const ub = upperBody(p.pelvis, p.lean, p.headPitch, p.rise, p.facing);
  const legs = [legIK(p.pelvis, p.feet[0].ankle, p.facing), legIK(p.pelvis, p.feet[1].ankle, p.facing)] as Skel['legs'];
  const hands = [...p.hands] as Skel['hands'];
  const arms = [0, 1].map((i) => {
    const root = { x: ub.shoulder.x + p.armOff[i].x, y: ub.shoulder.y + p.armOff[i].y };
    const want = wristOfHand(p.hands[i], p.facing);
    const arm = armIK(root, want);
    // V4: the hand is always built from the wrist: if the arm falls short, the hand comes with it
    if (dist(arm.wrist, want) > 1e-12) hands[i] = { ...p.hands[i], origin: { x: p.hands[i].origin.x + arm.wrist.x - want.x, y: p.hands[i].origin.y + arm.wrist.y - want.y } };
    return arm;
  }) as Skel['arms'];
  return { facing: p.facing, pelvis: p.pelvis, pelvisPitch: p.pelvisPitch, lean: p.lean, shoulder: ub.shoulder, neck: ub.neck, head: ub.head, headAxis: ub.headAxis, legs, feet: p.feet, arms, hands, breath: p.breath, sec: p.sec };
}

/** Blend two parameter sets (feet: ball position and sole angle; hands: origin, direction, curvature). */
export function blendParams(a: PoseParams, b: PoseParams, k: number): PoseParams {
  const foot = (fa: FootP, fb: FootP): FootP => footFromBall(lerpV(fa.ball, fb.ball, k), lerpAng(fa.ang, fb.ang, k), true, fa.ballS, lerp(fa.peel, fb.peel, k), a.facing);
  const hand = (ha: HandP, hb: HandP): HandP => ({ origin: lerpV(ha.origin, hb.origin, k), dir: lerpAng(ha.dir, hb.dir, k), curve: lerp(ha.curve, hb.curve, k) });
  return {
    facing: a.facing, pelvis: lerpV(a.pelvis, b.pelvis, k), pelvisPitch: lerp(a.pelvisPitch, b.pelvisPitch, k), lean: lerp(a.lean, b.lean, k),
    headPitch: lerp(a.headPitch, b.headPitch, k), rise: lerp(a.rise, b.rise, k), breath: lerp(a.breath, b.breath, k),
    feet: [foot(a.feet[0], b.feet[0]), foot(a.feet[1], b.feet[1])], hands: [hand(a.hands[0], b.hands[0]), hand(a.hands[1], b.hands[1])],
    armOff: [lerpV(a.armOff[0], b.armOff[0], k), lerpV(a.armOff[1], b.armOff[1], k)],
    sec: { beard: lerp(a.sec.beard, b.sec.beard, k), ringlet: lerp(a.sec.ringlet, b.sec.ringlet, k), flapF: lerp(a.sec.flapF, b.sec.flapF, k), flapB: lerp(a.sec.flapB, b.sec.flapB, k) },
  };
}

/** The stand's slow idle (§6.1, V11): a weight shift every 7.5 s eased over 1.2 s, and a look out that lifts the chin. */
export function standIdle(t: number): { sway: number; chin: number } {
  const P = 7.5, k = Math.floor(t / P), tau = t - k * P;
  const side = k % 2 ? 1 : -1;
  const sway = 0.010 * (-side + 2 * side * easeStd(Math.min(1, tau / 1.2)));
  const q = (t % 11) / 11, look = q < 0.4 ? Math.sin((Math.PI * q) / 0.4) ** 2 : 0;
  return { sway, chin: 4 * DEG * look };
}

/**
 * The summit stand (§6.1) from the stopped walk pose: the feet stay planted (the rear heel lowers), the pelvis rises
 * over them, the torso straightens to 3°, the chin lifts (−12°), the near hand moves to the stone's upper flank
 * (ψ 150°, built from the wrist) and the far arm hangs.
 */
export function standParams(from: PoseParams, centre: V, t: number, idle = standIdle(t), ground: (x: number) => number): PoseParams {
  const f = from.facing;
  const feet = from.feet.map((ft) => footFromBall(ft.ball, Math.atan2(ground(ft.ball.x + 0.01) - ground(ft.ball.x - 0.01), 0.02), true, ft.ballS, 0, f)) as [FootP, FootP];
  // the pelvis stays over its walking spot (he stopped on the incline with the stone already on the crest), and rises
  // as far as the legs allow (≤ 0.97 of the leg, ≤ 0.50 H over the ground)
  const midX = from.pelvis.x + idle.sway;
  let y = ground(midX) + 0.50;
  for (const ft of feet) { const dx = ft.ankle.x - midX, m = 0.97 * (BODY.thigh + BODY.shin); if (Math.hypot(dx, y - ft.ankle.y) > m) y = ft.ankle.y + Math.sqrt(Math.max(0, m * m - dx * dx)); }
  const pelvis = { x: midX, y };
  // upright (3°) unless the near hand would leave the stone: then just enough lean to keep the stone in reach
  const headPitch = -12 * DEG - idle.chin;
  let lean = 3 * DEG;
  let ub = upperBody(pelvis, lean, headPitch, breathRise(t), f);
  for (let i = 0; i < 40 && dist(ub.shoulder, centre) - WALK.R > 0.33; i++) { lean += 0.5 * DEG; ub = upperBody(pelvis, lean, headPitch, breathRise(t), f); }
  // near hand: resting on the stone's back at ψ 168° (the spec's 150° raised the arm overhead, a wave), or the first
  // angle below it the arm reaches with the elbow ≤ 165°
  let psi = 168 * DEG, hand = handOnStone(centre, psi, f);
  for (let i = 0; i < 60 && dist(ub.shoulder, wristOfHand(hand, f)) > armSpan(165); i++) { psi += 1 * DEG; hand = handOnStone(centre, psi, f); }
  const hang = freeHand({ x: ub.shoulder.x + 0.03 * f, y: ub.shoulder.y - 0.335 }, -Math.PI / 2 + 0.08 * f, f);
  return {
    facing: f, pelvis, pelvisPitch: 0, lean, headPitch, rise: breathRise(t), breath: breathK(t), feet, hands: [hand, hang],
    armOff: [{ x: 0, y: 0 }, { x: -0.02 * f, y: 0.005 }], sec: { beard: 0, ringlet: windAt(t), flapF: windAt(t), flapB: 0 },
  };
}

/** The seated break (§6.2): facing downhill, back against the stone, knees up, forearms on the knees. */
export function sitParams(centre: V, t: number, ground: (x: number) => number): PoseParams {
  const f = -1 as const;
  const gy = (x: number) => ground(x);
  const pelvis = { x: centre.x - WALK.R - 0.12, y: 0 };
  pelvis.y = gy(pelvis.x) + 0.085;
  const lean = -14 * DEG;
  const feet = [0, 1].map((i) => { const bx = pelvis.x - 0.40 + i * 0.05; return footFromBall({ x: bx, y: gy(bx) }, Math.atan2(gy(bx + 0.01) - gy(bx - 0.01), 0.02), true, NaN, 0, f); }) as [FootP, FootP];
  const ub = upperBody(pelvis, lean, -6 * DEG, breathRise(t), f);
  const knees = feet.map((ft) => legIK(pelvis, ft.ankle, f).knee);
  const hands = knees.map((k, i) => freeHand({ x: k.x - 0.07 - 0.02 * i, y: k.y - 0.03 }, -Math.PI / 2 - 0.35, f)) as [HandP, HandP];
  void ub;
  return {
    facing: f, pelvis, pelvisPitch: 0, lean, headPitch: -6 * DEG, rise: breathRise(t), breath: breathK(t), feet, hands,
    armOff: [{ x: 0, y: 0 }, { x: 0.02, y: 0.005 }], sec: { beard: 0, ringlet: windAt(t), flapF: windAt(t), flapB: 0 },
  };
}

/**
 * A tertiary channel outside the walk (§3.6): a spring (k 120, c 22, unit mass) driven toward its rest value,
 * initialised from the analytic value and its derivative at the hand-off, so the hand-off is C1.
 */
export class Spring {
  x = 0; v = 0;
  set(x: number, v: number) { this.x = x; this.v = v; }
  step(target: number, dt: number) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) { const a = -120 * (this.x - target) - 22 * this.v; this.v += a * h; this.x += this.v * h; }
    return this.x;
  }
}
