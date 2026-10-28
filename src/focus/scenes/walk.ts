// Round 5 walk (ROUND5_SISYPHUS §3): a side-scroller walk cycle driven by one number, the distance D (H) along the
// trail. Every joint, both feet, the pelvis and the stone are pure functions of D (plus t for breath and wind), so
// nothing can stop, slide or roll back. World units are H, y up. No drawing here.
import type { V } from './path';
import { noise1 } from './noise';
import { PACE_H } from '../../domain/mountain';
import { BODY, LEG_CHAIN, armSpan } from './body';

export const DEG = Math.PI / 180;
export const WALK = {
  /** Stride (two steps), H. */
  L: 0.40,
  /** Duty factor: each foot is planted 62% of the cycle. */
  beta: 0.62,
  /** Contact point ahead of the pelvis, H. */
  c: 0.07,
  /** Swing lift, H. */
  lift: 0.06,
  /** Heel peel at toe-off, deg. */
  peel: 28,
  /** Stone ahead of the pelvis along the trail, H (constant: the stone rolls with the ground). */
  dS: 1.20,
  R: BODY.R,
  /** Walk speed along the trail, H/s. */
  v: PACE_H,
} as const;

/** The trail as the walk reads it (a real Trail, or a straight test incline). */
export interface WalkTrail {
  at(s: number): V;
  angleAt(s: number): number;
  centreAt(s: number, R: number): V;
  centreArc(s: number, R: number): number;
}

export interface FootP { ball: V; ankle: V; heel: V; toe: V; /** sole direction heel→toe, world rad */ ang: number; planted: boolean; ballS: number; peel: number }
export interface LegP { hip: V; knee: V; ankle: V }
export interface ArmP { shoulder: V; elbow: V; wrist: V }
/** A hand: its sole origin (the palm's contact point), finger direction (world rad) and sole curvature (1/R or 0). */
export interface HandP { origin: V; dir: number; curve: number }
/** Tertiary channels (rad). */
export interface Secondary { beard: number; ringlet: number; flapF: number; flapB: number }
export interface Skel {
  facing: 1 | -1;
  pelvis: V;
  /** Hip tip (rad), drawn on the torso base. */
  pelvisPitch: number;
  /** Torso lean from vertical toward the facing side (rad). */
  lean: number;
  shoulder: V;
  neck: V;
  head: V;
  /** Head up-axis from vertical toward the facing side (rad): >0 bows the head. */
  headAxis: number;
  legs: [LegP, LegP];
  feet: [FootP, FootP];
  arms: [ArmP, ArmP];
  hands: [HandP, HandP];
  /** Chest breath factor (1 ± 0.015). */
  breath: number;
  sec: Secondary;
}
export interface WalkPose extends Skel {
  D: number; phi: number; theta: number;
  centre: V; rot: number; sB: number;
  psi: [number, number];
  protraction: [number, number];
}

// ---------- small math ----------
export const frac = (x: number) => x - Math.floor(x);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** smootherstep on clamped x: C2 at both ends. */
export const sm = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (6 * t - 15) + 10); };
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
const len = (a: V) => Math.hypot(a.x, a.y);
export const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
const dir = (a: number): V => ({ x: Math.cos(a), y: Math.sin(a) });
/** Unit vector `ang` from vertical toward the facing side. */
export const fromVertical = (ang: number, facing: 1 | -1): V => ({ x: Math.sin(ang) * facing, y: Math.cos(ang) });

/** Pelvis height over the ground point (§2.4): 0.400 at 22°. */
export const h0 = (thDeg: number) => 0.400 - 0.0038 * (thDeg - 22);
/** Torso lean (deg) for a slope. */
export const lam0 = (thDeg: number) => clamp(17 + 0.2 * (thDeg - 22), 14, 20);
/** Breath on its own clock (4.2 s). */
export const breathRise = (t: number) => 0.003 * Math.sin((2 * Math.PI * t) / 4.2);
export const breathK = (t: number) => 1 + 0.015 * Math.sin((2 * Math.PI * t) / 4.2);
/** Wind on cloth, hair and fillet (rad), ±1.5° on a 7.7 s clock. */
export const windAt = (t: number) => 1.5 * DEG * (noise1(t / 7.7) - 0.5) * 2;

// ---------- feet ----------
/** Foot from its ball at trail position s, lifted along the ground normal, with the heel peeled (deg; < 0: toe up). */
export function footAt(trail: WalkTrail, ballS: number, lift: number, peelDeg: number, planted: boolean): FootP {
  const g = trail.at(ballS);
  const th = trail.angleAt(ballS) * DEG;
  const ball = { x: g.x - Math.sin(th) * lift, y: g.y + Math.cos(th) * lift };
  return footFromBall(ball, th - peelDeg * DEG, planted, ballS, peelDeg);
}
export function footFromBall(ball: V, ang: number, planted = true, ballS = NaN, peel = 0, facing: 1 | -1 = 1): FootP {
  const d = { x: Math.cos(ang) * facing, y: Math.sin(ang) * facing };
  const n = { x: -Math.sin(ang), y: Math.cos(ang) };
  return {
    ball,
    ankle: { x: ball.x - d.x * BODY.ankleBack + n.x * BODY.ankleH, y: ball.y - d.y * BODY.ankleBack + n.y * BODY.ankleH },
    heel: { x: ball.x - d.x * BODY.heelBack, y: ball.y - d.y * BODY.heelBack },
    toe: { x: ball.x + d.x * BODY.toe, y: ball.y + d.y * BODY.toe },
    ang, planted, ballS, peel,
  };
}

/** Swing foot pitch (deg) over q ∈ [0, 1]: the heel keeps peeling to 50°, then the toe lifts, flat at landing. */
/** The heel peels on to 50° over the first quarter of the swing (toes last off). */
const PEEL_Q = 0.25;
export function swingPitch(q: number): number {
  return (28 + 22 * sm(q / PEEL_Q)) * (1 - sm((q - 0.2) / 0.45)) - 8 * sm((q - 0.3) / 0.3) * (1 - sm((q - 0.75) / 0.25));
}
/** Stance heel peel (deg) over p ∈ [0, β). */
export const stancePeel = (p: number) => WALK.peel * sm((p - 0.279) / 0.341);
/** Swing lift (H): an early-peaked C2 arc, 0.06 at q = 0.375. */
export const swingLift = (q: number) => WALK.lift * 198.8 * q ** 3 * (1 - q) ** 5;

// ---------- the figure's place behind the stone ----------
/**
 * The stone is a constant ΔS ahead along the trail, so on a steeper slope it sits higher and closer in the gravity
 * frame. To keep the arms in their 156–170° band on every slope the figure's place behind the stone shifts with the
 * slope by δ(θ) (a few hundredths of H, over tens of seconds); the stone, the camera and the roll never do.
 * δ is closed-form: the mean shoulder sits REACH from the stone's surface. ψ0 is the polar angle that faces it.
 */
let REACH = 0.36;
export function standOff(thDeg: number): { delta: number; psi0: number } {
  const th = thDeg * DEG, t = dir(th), n = { x: -Math.sin(th), y: Math.cos(th) };
  const lam = lam0(thDeg) * DEG;
  const S0 = { x: 0.31 * Math.sin(lam), y: h0(thDeg) + 0.31 * Math.cos(lam) };
  const C = { x: WALK.dS * t.x + WALK.R * n.x, y: WALK.dS * t.y + WALK.R * n.y };
  const A = sub(C, S0);
  const T = WALK.R + REACH;
  const at = A.x * t.x + A.y * t.y;
  const delta = at - Math.sqrt(Math.max(0, at * at - (A.x * A.x + A.y * A.y) + T * T));
  const S = { x: S0.x + delta * t.x, y: S0.y + delta * t.y };
  return { delta, psi0: Math.atan2(S.y - C.y, S.x - C.x) };
}
/** Palms either side of the facing point, ≈ 7° below (near) and above (far): 200° / 186° at 22°. */
export const PSI_SPREAD = 7 * DEG;
/** Both palms sit below the facing point, so the near arm descends under the face and the far arm rises behind it. */
export const PSI_BIAS = 8.5 * DEG;
/** The far palm sits 4° above the spread (≈ 199° at 22°), so the far arm rises gently behind the head. */
export const FAR_LIFT = 4 * DEG;

export interface Place { delta: number; psi0: number; psi: [number, number]; bias: [number, number] }
let placeTrail: WalkTrail | null = null, placeD = NaN, placeV: Place | null = null;
/**
 * The figure's place for D on the actual trail (the stone may already be on the crest while he is still on the
 * incline): δ solved (Newton from the straight-slope value) so the mean shoulder sits REACH from the stone's surface,
 * then the palms: near ψ0 + 15.5°, far ψ0 + 5.5° (≈ 209° / 199° at 22°). The near arm descends under the face, the far
 * arm rises gently behind the head. The near arm sits mid-band from the mean shoulder (REACH is tuned for it); the far
 * wrist is nearer, so the far shoulder sits that much back along its arm (`bias`; inside the torso, which hides it).
 */
export function placeAt(trail: WalkTrail, D: number): Place {
  if (trail === placeTrail && D === placeD && placeV) return placeV;
  const th = trail.angleAt(D), lam = lam0(th) * DEG;
  const off = { x: 0.31 * Math.sin(lam), y: h0(th) + 0.31 * Math.cos(lam) };
  const C = trail.centreAt(D + WALK.dS, WALK.R);
  const S = (d: number) => add(trail.at(D + d), off);
  const T = WALK.R + REACH;
  let delta = standOff(th).delta;
  for (let i = 0; i < 4; i++) {
    const e = 1e-4, f = dist(S(delta), C) - T, df = (dist(S(delta + e), C) - dist(S(delta - e), C)) / (2 * e);
    if (Math.abs(df) < 1e-9) break;
    delta -= f / df;
  }
  const Sm = S(delta);
  const psi0 = Math.atan2(Sm.y - C.y, Sm.x - C.x);
  const psi: [number, number] = [psi0 + PSI_BIAS + PSI_SPREAD, psi0 + PSI_BIAS - PSI_SPREAD + FAR_LIFT];
  const bias = psi.map((p) => dist(Sm, wristOf(handOnStone(C, p), 1)) - D_MID) as [number, number];
  placeTrail = trail; placeD = D; placeV = { delta, psi0, psi, bias };
  return placeV;
}
const deltaAt = (trail: WalkTrail, D: number) => placeAt(trail, D).delta;

// ---------- hands and arms ----------
/** World point of a hand-local point (x along the fingers, y outward from the sole), bending the sole round the stone. */
export function handPoint(h: HandP, p: V, facing: 1 | -1): V {
  let x = p.x, y = p.y;
  if (h.curve > 1e-6) { const r = 1 / h.curve, a = p.x * h.curve; x = (r + p.y) * Math.sin(a); y = (r + p.y) * Math.cos(a) - r; }
  const ex = dir(h.dir), ey = { x: -ex.y * facing, y: ex.x * facing };
  return { x: h.origin.x + ex.x * x + ey.x * y, y: h.origin.y + ex.y * x + ey.y * y };
}
/** A palm flat on the stone at polar angle ψ, fingers pointing up round it. */
export function handOnStone(centre: V, psi: number, facing: 1 | -1 = 1): HandP {
  return { origin: { x: centre.x + Math.cos(psi) * WALK.R, y: centre.y + Math.sin(psi) * WALK.R }, dir: psi - (Math.PI / 2) * facing, curve: 1 / WALK.R };
}
export const wristOf = (h: HandP, facing: 1 | -1) => handPoint(h, BODY.wristLocal, facing);

/** Two-bone IK; `pick` chooses the joint. The end is clamped to `max` of the chain. */
export function twoBone(root: V, target: V, a: number, b: number, pick: (c1: V, c2: V) => V, max = 0.9999): { joint: V; end: V } {
  const dx = target.x - root.x, dy = target.y - root.y;
  const d0 = Math.hypot(dx, dy) || 1e-9;
  const d = clamp(d0, Math.abs(a - b) + 1e-6, max * (a + b));
  const end = { x: root.x + (dx / d0) * d, y: root.y + (dy / d0) * d };
  const base = Math.atan2(dy, dx);
  const off = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const c1 = { x: root.x + a * Math.cos(base + off), y: root.y + a * Math.sin(base + off) };
  const c2 = { x: root.x + a * Math.cos(base - off), y: root.y + a * Math.sin(base - off) };
  return { joint: pick(c1, c2), end };
}
/** Arm IK, elbow down. */
export function armIK(shoulder: V, wrist: V): ArmP {
  const r = twoBone(shoulder, wrist, BODY.upperArm, BODY.foreArm, (c1, c2) => (c1.y <= c2.y ? c1 : c2));
  return { shoulder, elbow: r.joint, wrist: r.end };
}
/**
 * Soft two-bone leg IK, knee forward (§3.3): above SOFT_IK of the chain the reach eases toward SOFT_IK + 0.009, so a
 * swing foot near full extension never snaps the knee. Planted feet stay ≤ SOFT_IK (0.989: the rear knee opens to
 * ≈ 162° at toe-off) and are reached exactly; a swing ankle falls short by < 0.002 H.
 */
export const SOFT_IK = 0.989, SOFT_K = 0.009;
export function legIK(hip: V, ankle: V, facing: 1 | -1): LegP {
  const d = dist(hip, ankle), r = d / LEG_CHAIN;
  let eff = r;
  if (r > SOFT_IK) eff = SOFT_IK + SOFT_K * Math.tanh((r - SOFT_IK) / SOFT_K); // C2 at the junction
  const tgt = { x: hip.x + ((ankle.x - hip.x) / (d || 1)) * eff * LEG_CHAIN, y: hip.y + ((ankle.y - hip.y) / (d || 1)) * eff * LEG_CHAIN };
  const r2 = twoBone(hip, tgt, BODY.thigh, BODY.shin, (c1, c2) => ((c1.x - c2.x) * facing >= 0 ? c1 : c2), 0.9999);
  return { hip, knee: r2.joint, ankle: r2.end };
}

const D_LO = armSpan(157), D_HI = armSpan(169), D_MID = (D_LO + D_HI) / 2, D_HALF = (D_HI - D_LO) / 2;
const PROT_MAX = 0.008, CREEP_MAX = 1.5 * DEG;
/**
 * An arm to a palm on the stone (§2.6): the shoulder-to-wrist error is absorbed by scapular protraction (≤ 0.008 H),
 * then the elbow (kept smoothly inside 157–169°), then a palm creep round the stone (≤ 1.5°). All smooth.
 */
export function armToStone(shoulder: V, centre: V, psi: number, facing: 1 | -1, bias = 0, creepMax = CREEP_MAX): { arm: ArmP; hand: HandP; prot: number; psi: number } {
  const w0 = wristOf(handOnStone(centre, psi, facing), facing);
  const d00 = dist(shoulder, w0);
  const d0 = d00 - bias;
  const prot = PROT_MAX * Math.tanh((d0 - D_MID) / PROT_MAX);
  const u = mul(sub(w0, shoulder), 1 / (d00 || 1));
  const S1 = add(shoulder, mul(u, prot + bias));
  const want = D_MID + D_HALF * Math.tanh((d0 - prot - D_MID) / D_HALF);
  let dPsi = 0;
  const f = (x: number) => dist(S1, wristOf(handOnStone(centre, psi + x, facing), facing)) - want;
  for (let i = 0; i < (creepMax > CREEP_MAX ? 8 : 3); i++) {
    const v = f(dPsi), e = 1e-4, dv = (f(dPsi + e) - f(dPsi - e)) / (2 * e);
    if (Math.abs(dv) < 1e-9) break;
    dPsi = clamp(dPsi - v / dv, -creepMax, creepMax);
  }
  let hand = handOnStone(centre, psi + dPsi, facing);
  const wTgt = wristOf(hand, facing), arm = armIK(S1, wTgt);
  // V4: the hand is always built from the wrist (if the arm ever fell short, the hand would come with it)
  if (dist(arm.wrist, wTgt) > 1e-12) hand = { ...hand, origin: { x: hand.origin.x + arm.wrist.x - wTgt.x, y: hand.origin.y + arm.wrist.y - wTgt.y } };
  return { arm, hand, prot, psi: psi + dPsi };
}

// ---------- the cycle ----------
const PI4 = 4 * Math.PI;
/** Fore-aft surge ±0.0019 H: ±6% speed (the spec's 0.002 gives ±6.3%). */
const surge = (phi: number) => 0.0019 * Math.sin(PI4 * (phi - 0.08));
const bob = (phi: number) => -0.009 * Math.cos(PI4 * (phi - 0.08));
const OFFS = [0, 0.5] as const;

/** Pelvis world position at D (no breath: breath rides on the shoulder). */
export function pelvisAt(trail: WalkTrail, D: number): V {
  const phi = frac(D / WALK.L), th = trail.angleAt(D);
  const g = trail.at(D + deltaAt(trail, D) + surge(phi));
  return { x: g.x, y: g.y + h0(th) + bob(phi) };
}

/** Leg i's foot at D: planted at its stance contact, or swinging to the next one. */
export function walkFoot(trail: WalkTrail, D: number, i: 0 | 1): FootP {
  const o = OFFS[i];
  const p = frac(D / WALK.L + o);
  const n = Math.floor(D / WALK.L + o);
  // contact for stance n, with the slope offset frozen at its landing
  const contact = (k: number) => { const Dl = (k - o) * WALK.L; return Dl + WALK.c + deltaAt(trail, Dl); };
  const sC = contact(n);
  if (p < WALK.beta) return footAt(trail, sC, 0, stancePeel(p), true);
  const q = (p - WALK.beta) / (1 - WALK.beta);
  const sN = contact(n + 1);
  return footAt(trail, sC + (sN - sC) * sm(q), swingLift(q), swingPitch(q), false);
}

/** Thigh angle from vertical, + = forward (rad). */
export const thighAngle = (l: LegP, facing: 1 | -1 = 1) => Math.atan2((l.knee.x - l.hip.x) * facing, l.hip.y - l.knee.y);
/** Interior joint angle (deg) at b between a and c. */
export function interior(a: V, b: V, c: V): number {
  const u = sub(a, b), v = sub(c, b);
  return (Math.acos(clamp((u.x * v.x + u.y * v.y) / ((len(u) * len(v)) || 1), -1, 1)) * 180) / Math.PI;
}
const THIGH_MEAN = 9 * DEG;
const softDeg = (x: number, maxDeg: number) => maxDeg * DEG * Math.tanh(x / (maxDeg * DEG));

/** The analytic secondary channels while climbing (§3.6): phase-lagged copies of the primary ones, plus wind. */
export function secondaryAt(trail: WalkTrail, D: number, t: number): Secondary {
  const phi = frac(D / WALK.L), wind = windAt(t);
  const thighLag = (i: 0 | 1, lag: number) => {
    const Dl = D - lag * WALK.L;
    return thighAngle(legIK(pelvisAt(trail, Dl), walkFoot(trail, Dl, i).ankle, 1));
  };
  return {
    beard: -2.5 * DEG * Math.cos(PI4 * (phi - 0.18)),
    ringlet: 3 * DEG * Math.cos(PI4 * (phi - 0.20)) + wind,
    flapF: softDeg(0.35 * (thighLag(0, 0.12) - THIGH_MEAN), 6) + wind,
    flapB: softDeg(0.30 * (thighLag(1, 0.15) - THIGH_MEAN), 5) + 0.5 * DEG * Math.sin(PI4 * (phi - 0.08)),
  };
}

/** Upper body from the pelvis: shoulder, neck base and head (§3.4). */
export function upperBody(pelvis: V, lean: number, headPitch: number, rise: number, facing: 1 | -1): { shoulder: V; neck: V; head: V; headAxis: number } {
  const td = fromVertical(lean, facing);
  const shoulder = { x: pelvis.x + td.x * BODY.torso, y: pelvis.y + td.y * BODY.torso + rise };
  const neck = add(shoulder, mul(td, 0.03));
  const headAxis = lean + headPitch;
  const head = add(neck, mul(fromVertical(headAxis, facing), 0.075));
  return { shoulder, neck, head, headAxis };
}

/** The whole pose at distance D and time t (breath and wind only). Pure. */
export function walkPose(trail: WalkTrail, D: number, t: number): WalkPose {
  const phi = frac(D / WALK.L), th = trail.angleAt(D);
  const pelvis = pelvisAt(trail, D);
  const lean = (lam0(th) + 0.8 * Math.cos(PI4 * (phi - 0.11))) * DEG;
  const headPitch = (18 + 1.2 * Math.cos(PI4 * (phi - 0.14))) * DEG;
  const ub = upperBody(pelvis, lean, headPitch, breathRise(t), 1);
  const feet: [FootP, FootP] = [walkFoot(trail, D, 0), walkFoot(trail, D, 1)];
  const legs: [LegP, LegP] = [legIK(pelvis, feet[0].ankle, 1), legIK(pelvis, feet[1].ankle, 1)];
  const sB = D + WALK.dS;
  const centre = trail.centreAt(sB, WALK.R);
  const rot = trail.centreArc(sB, WALK.R) / WALK.R;
  const pa = placeAt(trail, D);
  const near = armToStone(ub.shoulder, centre, pa.psi[0], 1, pa.bias[0]);
  const far = armToStone(ub.shoulder, centre, pa.psi[1], 1, pa.bias[1]);
  return {
    facing: 1, pelvis, pelvisPitch: -1.5 * DEG * Math.cos(PI4 * (phi - 0.14)), lean,
    shoulder: ub.shoulder, neck: ub.neck, head: ub.head, headAxis: ub.headAxis,
    legs, feet, arms: [near.arm, far.arm], hands: [near.hand, far.hand],
    breath: breathK(t), sec: secondaryAt(trail, D, t),
    D, phi, theta: th, centre, rot, sB, psi: [near.psi, far.psi], protraction: [near.prot, far.prot],
  };
}

/** Tune REACH once (at 22°) so the near arm's mean elbow sits mid-band. */
(function tune() {
  const th = 22 * DEG, t = dir(th), n = { x: -Math.sin(th), y: Math.cos(th) };
  const line: WalkTrail = { at: (s) => mul(t, s), angleAt: () => 22, centreAt: (s, R) => add(mul(t, s), mul(n, R)), centreArc: (s) => s };
  let lo = 0.25, hi = 0.5;
  for (let i = 0; i < 40; i++) {
    REACH = (lo + hi) / 2;
    placeD = NaN;
    if (placeAt(line, 0).bias[0] > 0) hi = REACH; else lo = REACH;
  }
  placeD = NaN; placeTrail = null;
})();
