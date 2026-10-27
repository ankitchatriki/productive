// Black-figure Sisyphus rig (ROUND3_ART §3.1, §3.6): heroic 8-head proportions, two-bone IK, the hold (key) pose,
// standing and sitting. Pure; world units are H (standing height = 1), y up.
import type { SlopePath, V } from './path';

export const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
export const easeOut = (u: number) => 1 - (1 - u) * (1 - u);

const hu = 1 / 8; // one head unit
/** Lengths between joint centres, in H. */
export const RIG = {
  // ROUND4 §3.1: heavier, heroic build; the boulder about the figure's height.
  head: 1.05 * hu, neck: 0.45 * hu, torso: 2.5 * hu,
  upperArm: 1.45 * hu, foreArm: 1.25 * hu, wristToPalm: 0.4 * hu, handLen: 0.85 * hu,
  thigh: 2.0 * hu, shin: 1.95 * hu, heelToBall: 0.75 * hu, ballToToe: 0.35 * hu, ankleH: 0.3 * hu,
  boulderR: 4.2 * hu,
  palm: 0.012,
};
export const ARM_CHAIN = RIG.upperArm + RIG.foreArm;
export const LEG_CHAIN = RIG.thigh + RIG.shin;

export interface Limb { root: V; joint: V; end: V }
export interface FootPose { ball: V; ankle: V; heel: V; toe: V; angle: number /* rad, sole direction */ }
export interface Pose {
  pelvis: V; shoulder: V; head: V;
  /** Torso lean from vertical, radians; positive leans toward +x. */
  lean: number;
  legs: [Limb, Limb];   // [near, far]
  arms: [Limb, Limb];   // [near, far]
  feet?: [FootPose, FootPose];
  hands?: [V, V];       // palm centres
  /** Head axis from vertical (rad): >0 tips forward (chin down). */
  headAxis?: number;
  facing: 1 | -1;
  breath: number;
  alpha: number;
  load?: number;
}

/** Two-bone IK: joint position for root→target with lengths a, b. `pick` chooses between the two solutions. */
export function twoBoneIK(root: V, target: V, a: number, b: number, pick: (c1: V, c2: V) => V): V {
  const dx = target.x - root.x, dy = target.y - root.y;
  const d = clamp(Math.hypot(dx, dy), Math.abs(a - b) + 1e-6, 0.9999 * (a + b));
  const base = Math.atan2(dy, dx);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const off = Math.acos(cosA);
  const c1 = { x: root.x + a * Math.cos(base + off), y: root.y + a * Math.sin(base + off) };
  const c2 = { x: root.x + a * Math.cos(base - off), y: root.y + a * Math.sin(base - off) };
  return pick(c1, c2);
}

/** Effective end point actually reached (target clamped to the chain's reach). */
export function reach(root: V, target: V, a: number, b: number, max = 0.9999): V {
  const dx = target.x - root.x, dy = target.y - root.y;
  const d = Math.hypot(dx, dy);
  const m = max * (a + b);
  if (d <= m) return target;
  return { x: root.x + (dx / d) * m, y: root.y + (dy / d) * m };
}

/** Leg from hip to ankle with the knee forward (uphill / along +tangent). */
export function legIK(hip: V, ankle: V, forward: V): Limb {
  const end = reach(hip, ankle, RIG.thigh, RIG.shin);
  const mid = { x: (hip.x + end.x) / 2, y: (hip.y + end.y) / 2 };
  const knee = twoBoneIK(hip, end, RIG.thigh, RIG.shin, (c1, c2) =>
    ((c1.x - mid.x) * forward.x + (c1.y - mid.y) * forward.y) >= ((c2.x - mid.x) * forward.x + (c2.y - mid.y) * forward.y) ? c1 : c2);
  return { root: hip, joint: knee, end };
}

/** Arm from shoulder to wrist with the elbow bending downward. */
export function armIK(shoulder: V, wrist: V): Limb {
  const end = reach(shoulder, wrist, RIG.upperArm, RIG.foreArm);
  const elbow = twoBoneIK(shoulder, end, RIG.upperArm, RIG.foreArm, (c1, c2) => (c1.y <= c2.y ? c1 : c2));
  return { root: shoulder, joint: elbow, end };
}

/** Foot from its ball point on the ground; `heel` (rad) lifts the heel by rotating the foot about the ball. */
export function footAt(ball: V, groundRad: number, heel: number, facing: 1 | -1 = 1): FootPose {
  const t = { x: Math.cos(groundRad) * facing, y: Math.sin(groundRad) * facing };
  const n = { x: -Math.sin(groundRad), y: Math.cos(groundRad) };
  const rot = (v: V, a: number): V => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  const a = -heel * facing;
  const heelV = rot({ x: -t.x * RIG.heelToBall, y: -t.y * RIG.heelToBall }, a);
  const ankleV = rot({ x: -t.x * RIG.heelToBall * 0.78 + n.x * RIG.ankleH, y: -t.y * RIG.heelToBall * 0.78 + n.y * RIG.ankleH }, a);
  return {
    ball, heel: { x: ball.x + heelV.x, y: ball.y + heelV.y }, ankle: { x: ball.x + ankleV.x, y: ball.y + ankleV.y },
    toe: { x: ball.x + t.x * RIG.ballToToe, y: ball.y + t.y * RIG.ballToToe }, angle: groundRad + a,
  };
}

/** Torso lean for a slope (deg): 16° at 22° — raised from the §3.6 20° so he reads upright and heroic (review U10). */
export const lean0 = (thetaDeg: number) => clamp(20 + 0.25 * (thetaDeg - 22), 16, 24); // ROUND4 §3.4: the 20° spear
/** Stride scale on a slope relative to 22°. */
export const cosRatio = (thetaDeg: number) => Math.cos(thetaDeg * DEG) / Math.cos(22 * DEG);
export const H0 = 0.43;
/** Keyed pelvis height for a slope: higher on shallow ground so the rear leg stays long (the ceiling caps it). */
export const h0 = (thetaDeg: number) => H0 + 0.004 * Math.max(0, 22 - thetaDeg) + 0.012 * Math.max(0, thetaDeg - 22);
/** Hold-pose foot placement along the trail from the pelvis ground point (× cos θ / cos 22°). */
export const FRONT_FOOT = 0.12, REAR_FOOT = 0.29;
/** Rear heel lift in the hold (on the ball of the foot): the long straight rear leg. */
export const REAR_HEEL = 30;
/** Far hand offset around the stone and far-shoulder offset (H), so both arms read in profile (review U10). */
export const HAND_NEAR = 0, HAND_FAR = -0.05, FAR_SHOULDER = 0.03; // the far hand sits 0.05 H higher round the stone
/** Max stance-leg extension: 0.996 keeps the rear knee at ≈ 168° (0.985 would cap it at 159°). */
export const LEG_MAX = 0.996;

/** Head centre from the shoulder: neck thrust 70° from vertical, head axis 100° (chin tucked). */
export function headFrom(shoulder: V, pitchDeg = 0): { head: V; axis: number } {
  const n = 58 * DEG, a = (105 + pitchDeg) * DEG; // ROUND4 §3.4: neck 58°, head axis 105° (bowed between the arms)
  const neckEnd = { x: shoulder.x + Math.sin(n) * RIG.neck, y: shoulder.y + Math.cos(n) * RIG.neck };
  return { head: { x: neckEnd.x + Math.sin(a) * RIG.head * 0.5, y: neckEnd.y + Math.cos(a) * RIG.head * 0.5 }, axis: a };
}

/** Pelvis height ceiling: lower the pelvis so each given ankle is within 0.985·leg of the hip (never move a foot). */
export function hipCeiling(base: V, up: V, h: number, ankles: V[], frac = LEG_MAX): number {
  let hh = h;
  const max = frac * LEG_CHAIN;
  for (let it = 0; it < 3; it++) {
    for (const a of ankles) {
      const hip = { x: base.x + up.x * hh, y: base.y + up.y * hh };
      const d = Math.hypot(a.x - hip.x, a.y - hip.y);
      if (d > max) {
        // solve |base + up·x − a| = max for x (take the smaller root ≤ hh)
        const bx = base.x - a.x, by = base.y - a.y;
        const B = 2 * (bx * up.x + by * up.y), C = bx * bx + by * by - max * max;
        const disc = B * B - 4 * C;
        if (disc >= 0) hh = Math.min(hh, (-B + Math.sqrt(disc)) / 2);
      }
    }
  }
  return hh;
}

/** Boulder position: s on the trail where |centre(s) − shoulder| = A (bisection over [lo, hi]). */
export function boulderSFor(path: SlopePath, shoulder: V, A: number, lo: number, hi: number, R: number): number {
  const centre = (s: number) => (path.centreAt ? path.centreAt(s, R) : { x: path.at(s).x + path.normalAt(s).x * R, y: path.at(s).y + path.normalAt(s).y * R });
  const f = (s: number) => { const c = centre(s); return Math.hypot(c.x - shoulder.x, c.y - shoulder.y) - A; };
  let a = lo, b = hi;
  if (f(a) > 0) return a;
  for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (f(m) < 0) a = m; else b = m; }
  return (a + b) / 2;
}

export interface ArmsResult { arms: [Limb, Limb]; hands: [V, V] }

/** Arms to the stone: palms flat on its near face facing the shoulder, near/far hands offset across the arm axis. */
export function armsToStone(shoulder: V, centre: V, R: number, regrip = 0): ArmsResult {
  const dx = centre.x - shoulder.x, dy = centre.y - shoulder.y, d = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / d, y: dy / d }, perp = { x: -dir.y, y: dir.x };
  const hands = [HAND_NEAR - regrip, HAND_FAR].map((o) => {
    // palm on the surface at the point facing the shoulder (rotated around the stone by o/R)
    const a = Math.atan2(-dir.y, -dir.x) + o / R;
    return { x: centre.x + Math.cos(a) * (R + RIG.palm), y: centre.y + Math.sin(a) * (R + RIG.palm) };
  }) as [V, V];
  void perp;
  const wrists = hands.map((p) => {
    const nx = (p.x - centre.x) / (R + RIG.palm), ny = (p.y - centre.y) / (R + RIG.palm);
    return { x: p.x + nx * RIG.wristToPalm, y: p.y + ny * RIG.wristToPalm };
  });
  const dNear = Math.hypot(wrists[0].x - shoulder.x, wrists[0].y - shoulder.y);
  const arms = [armIK(shoulder, wrists[0]), armIK(farShoulder(shoulder, wrists[1], dNear), wrists[1])] as [Limb, Limb];
  return { arms, hands };
}

/** The hold (key) pose at trail position sP (§3.6), with the boulder solved from the shoulders. Static, for tests and stills. */
export function solveHoldStatic(path: SlopePath, sP: number, R = RIG.boulderR): { pose: Pose; centre: V; sB: number } {
  const theta = path.angleAt(sP);
  const k = cosRatio(theta);
  const t = path.tangentAt(sP), n = path.normalAt(sP);
  const base = path.at(sP);
  const gA = (s: number) => path.angleAt(s) * DEG;
  const sFront = sP + FRONT_FOOT * k, sRear = sP - REAR_FOOT * k;
  const front = footAt(path.at(sFront), gA(sFront), 0);
  const rear = footAt(path.at(sRear), gA(sRear), REAR_HEEL * DEG);
  const up = n; // ROUND4 §3.4: pelvis height is measured along the slope normal
  const hh = hipCeiling(base, up, h0(theta), [front.ankle, rear.ankle]);
  const pelvis = { x: base.x + up.x * hh, y: base.y + up.y * hh };
  const lean = lean0(theta) * DEG;
  const shoulder = { x: pelvis.x + RIG.torso * Math.sin(lean) + t.x * 0.01, y: pelvis.y + RIG.torso * Math.cos(lean) + t.y * 0.01 };
  const A = stoneDistance(0.995, R);
  const sB = boulderSFor(path, shoulder, A, sP + 0.5, sP + 3, R);
  const centre = path.centreAt ? path.centreAt(sB, R) : { x: path.at(sB).x + n.x * R, y: path.at(sB).y + n.y * R };
  const { arms, hands } = armsToStone(shoulder, centre, R);
  const { head, axis } = headFrom(shoulder);
  const legs: [Limb, Limb] = [legIK(pelvis, front.ankle, t), legIK(pelvis, rear.ankle, t)];
  return { pose: { pelvis, shoulder, head, headAxis: axis, lean, legs, arms, hands, feet: [front, rear], facing: 1, breath: 1, alpha: 1 }, centre, sB };
}

/** Standing on the summit ledge with the near hand resting on the stone's upper flank (150°). */
export function solveStand(path: SlopePath, _H: number, pelvisX: number, bc: V, opts: { sway: number; breath: number; leanDeg?: number; alpha?: number; handDeg?: number; chin?: number; feetX?: [number, number] }): Pose {
  const gy = path.groundY(pelvisX);
  const g = (x: number) => Math.atan2(path.groundY(x + 0.01) - path.groundY(x - 0.01), 0.02);
  const fx = opts.feetX ?? [pelvisX + 0.07 + RIG.heelToBall * 0.4, pelvisX - 0.05 + RIG.heelToBall * 0.4];
  const feet = fx.map((x) => footAt({ x, y: path.groundY(x) }, g(x), 0)) as [FootPose, FootPose];
  // standing tall, but never taller than both legs reach: the feet stay on the legs (review U1)
  const hh = hipCeiling({ x: pelvisX + opts.sway, y: gy }, { x: 0, y: 1 }, 0.505, feet.map((f) => f.ankle), 0.985);
  const pelvis = { x: pelvisX + opts.sway, y: gy + hh };
  const lean = (opts.leanDeg ?? 3) * DEG;
  const shoulder = { x: pelvis.x + RIG.torso * Math.sin(lean), y: pelvis.y + RIG.torso * Math.cos(lean) };
  const chin = opts.chin ?? 0;
  const neckEnd = { x: shoulder.x + Math.sin(12 * DEG) * RIG.neck, y: shoulder.y + Math.cos(12 * DEG) * RIG.neck };
  const axis = (8 - 20 * chin) * DEG;
  const head = { x: neckEnd.x + Math.sin(axis) * RIG.head * 0.5, y: neckEnd.y + Math.cos(axis) * RIG.head * 0.5 };
  const legs = feet.map((f) => legIK(pelvis, f.ankle, { x: 1, y: 0 })) as [Limb, Limb];
  const R = RIG.boulderR;
  const a = (opts.handDeg ?? 150) * DEG;
  const palm = { x: bc.x + Math.cos(a) * (R + RIG.palm), y: bc.y + Math.sin(a) * (R + RIG.palm) };
  const wrist = { x: palm.x + Math.cos(a) * RIG.wristToPalm, y: palm.y + Math.sin(a) * RIG.wristToPalm };
  const near = armIK(shoulder, wrist);
  const hang = { x: shoulder.x + Math.sin(-6 * DEG) * ARM_CHAIN * 0.97, y: shoulder.y - Math.cos(6 * DEG) * ARM_CHAIN * 0.97 };
  const far = { root: shoulder, joint: twoBoneIK(shoulder, hang, RIG.upperArm, RIG.foreArm, (c1, c2) => (c1.x >= c2.x ? c1 : c2)), end: hang };
  return { pelvis, shoulder, head, headAxis: axis, lean, legs, arms: [near, far], hands: [palm, hang], feet, facing: 1, breath: opts.breath, alpha: opts.alpha ?? 1 };
}

/** Sitting with the back against the stone, facing downhill (break): thighs 15° up, shins down, forearms on knees. */
export function solveSit(path: SlopePath, _H: number, bc: V, breath: number, alpha = 1): Pose {
  const R = RIG.boulderR;
  const lean = 14 * DEG; // leaning back into the stone (+x); faces −x
  // place the pelvis so the back (shoulder joint + its depth) just touches the stone
  let px = bc.x - R - 0.1;
  for (let i = 0; i < 6; i++) {
    const sh = { x: px + RIG.torso * Math.sin(lean), y: path.groundY(px) + 0.07 + RIG.torso * Math.cos(lean) };
    px += (Math.hypot(sh.x - bc.x, sh.y - bc.y) - (R + 0.065)) * 0.9;
  }
  const gy = path.groundY(px);
  const pelvis = { x: px, y: gy + 0.07 };
  const shoulder = { x: pelvis.x + RIG.torso * Math.sin(lean), y: pelvis.y + RIG.torso * Math.cos(lean) };
  const axis = -(10 + 8) * DEG;
  const neckEnd = { x: shoulder.x - Math.sin(15 * DEG) * RIG.neck, y: shoulder.y + Math.cos(15 * DEG) * RIG.neck };
  const head = { x: neckEnd.x + Math.sin(axis) * RIG.head * 0.5, y: neckEnd.y + Math.cos(axis) * RIG.head * 0.5 };
  const th = 15 * DEG;
  const legs = [0, -0.02].map((dx) => {
    const knee = { x: pelvis.x - RIG.thigh * Math.cos(th) + dx, y: pelvis.y + RIG.thigh * Math.sin(th) };
    const ankleX = knee.x - 0.04;
    const ankle = { x: ankleX, y: path.groundY(ankleX) + RIG.ankleH };
    const end = reach(knee, ankle, RIG.shin, 1e-4);
    return { root: pelvis, joint: knee, end };
  }) as [Limb, Limb];
  const g = (x: number) => Math.atan2(path.groundY(x + 0.01) - path.groundY(x - 0.01), 0.02);
  const feet = legs.map((l) => footAt({ x: l.end.x - RIG.heelToBall * 0.6, y: path.groundY(l.end.x - RIG.heelToBall * 0.6) }, g(l.end.x), 0, -1)) as [FootPose, FootPose];
  const arms = legs.map((l, i) => {
    const hand = { x: l.joint.x - 0.03 - i * 0.01, y: l.joint.y + 0.012 };
    return armIK(shoulder, hand);
  }) as [Limb, Limb];
  return { pelvis, shoulder, head, headAxis: axis, lean, legs, arms, feet, facing: -1, breath, alpha };
}

const lv = (a: V, b: V, k: number): V => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const ll = (a: Limb, b: Limb, k: number): Limb => ({ root: lv(a.root, b.root, k), joint: lv(a.joint, b.joint, k), end: lv(a.end, b.end, k) });

/** Joint-space blend between two poses. */
export function blendPose(a: Pose, b: Pose, k: number): Pose {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const feet = a.feet && b.feet ? (a.feet.map((f, i) => ({ ball: lv(f.ball, b.feet![i].ball, k), ankle: lv(f.ankle, b.feet![i].ankle, k), heel: lv(f.heel, b.feet![i].heel, k), toe: lv(f.toe, b.feet![i].toe, k), angle: lerp(f.angle, b.feet![i].angle, k) })) as [FootPose, FootPose]) : (k < 0.5 ? a.feet : b.feet);
  return {
    pelvis: lv(a.pelvis, b.pelvis, k), shoulder: lv(a.shoulder, b.shoulder, k), head: lv(a.head, b.head, k),
    headAxis: lerp(a.headAxis ?? 0, b.headAxis ?? 0, k),
    lean: lerp(a.lean, b.lean, k),
    legs: [ll(a.legs[0], b.legs[0], k), ll(a.legs[1], b.legs[1], k)],
    arms: [ll(a.arms[0], b.arms[0], k), ll(a.arms[1], b.arms[1], k)],
    hands: a.hands && b.hands ? [lv(a.hands[0], b.hands[0], k), lv(a.hands[1], b.hands[1], k)] : b.hands,
    feet,
    facing: k < 0.5 ? a.facing : b.facing,
    breath: lerp(a.breath, b.breath, k), alpha: lerp(a.alpha, b.alpha, k),
  };
}

/** Interior angle at the joint (deg). */
export function interior(l: Limb): number {
  const a = { x: l.root.x - l.joint.x, y: l.root.y - l.joint.y }, b = { x: l.end.x - l.joint.x, y: l.end.y - l.joint.y };
  const c = (a.x * b.x + a.y * b.y) / ((Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)) || 1);
  return Math.acos(clamp(c, -1, 1)) / DEG;
}

/**
 * From the hold to standing beside the stone (§5.2): the front foot stays planted, the rear foot steps through in a
 * low arc to become the new front foot; the pelvis rises and the lean eases from ~20° to 3°; the near palm slides
 * around the stone to rest on its upper flank, the far arm drops to hang. k: 0 → 1.
 */
export function stepToStand(path: SlopePath, hold: Pose, centre: V, k: number, breath = 1): Pose {
  const R = RIG.boulderR;
  const fi = hold.feet![0].ball.x > hold.feet![1].ball.x ? 0 : 1; // hold's front foot
  const front = hold.feet![fi].ball, rear = hold.feet![1 - fi].ball;
  const pelvisX = centre.x - R - 0.25;
  const newFront = Math.max(front.x + 0.1, pelvisX + 0.12);
  const feetX: [number, number] = fi === 0 ? [front.x, newFront] : [newFront, front.x];
  const stand = solveStand(path, 1, pelvisX, centre, { sway: 0, breath, handDeg: 150, feetX });
  if (k >= 1) return stand;
  const e = easeInOut(Math.min(1, Math.max(0, k)));
  const b = blendPose(hold, stand, e);
  // feet: the planted one stays; the stepping one arcs (lift peaks mid-step), heel rolls flat
  const g = (x: number) => Math.atan2(path.groundY(x + 0.01) - path.groundY(x - 0.01), 0.02);
  const ks = Math.min(1, Math.max(0, (k - 0.1) / 0.6)), es = easeInOut(ks);
  const sx = rear.x + (newFront - rear.x) * es;
  const lift = 0.05 * Math.sin(Math.PI * ks);
  const moving = footAt({ x: sx, y: path.groundY(sx) + lift }, g(sx), (1 - es) * REAR_HEEL * DEG);
  const planted = footAt(front, g(front.x), 0);
  const feet = (fi === 0 ? [planted, moving] : [moving, planted]) as [FootPose, FootPose];
  const base = { x: b.pelvis.x, y: path.groundY(b.pelvis.x) };
  const hh = hipCeiling(base, { x: 0, y: 1 }, b.pelvis.y - base.y, feet.map((f) => f.ankle), 0.985);
  const pelvis = { x: b.pelvis.x, y: base.y + hh };
  const dy = pelvis.y - b.pelvis.y;
  b.pelvis = pelvis; b.shoulder = { x: b.shoulder.x, y: b.shoulder.y + dy }; b.head = { x: b.head.x, y: b.head.y + dy };
  const legs = feet.map((f) => legIK(pelvis, f.ankle, { x: 1, y: 0 })) as [Limb, Limb];
  // near hand slides around the stone surface from the pushing face to 150°
  const a0 = Math.atan2(hold.hands![0].y - centre.y, hold.hands![0].x - centre.x);
  let a1 = 150 * DEG;
  while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
  while (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
  const an = a0 + (a1 - a0) * e;
  const palm = { x: centre.x + Math.cos(an) * (R + RIG.palm), y: centre.y + Math.sin(an) * (R + RIG.palm) };
  const near = armIK(b.shoulder, { x: palm.x + Math.cos(an) * RIG.wristToPalm, y: palm.y + Math.sin(an) * RIG.wristToPalm });
  // far hand: stays flat on the stone while the weight comes off it, then releases and drops to hang (review U12)
  const hf = hold.hands![1];
  const fa = Math.atan2(hf.y - centre.y, hf.x - centre.x);
  const onStone = { x: centre.x + Math.cos(fa) * (R + RIG.palm), y: centre.y + Math.sin(fa) * (R + RIG.palm) };
  const rel = easeInOut(Math.min(1, Math.max(0, (k - 0.35) / 0.55)));
  let farHand: V, far: Limb;
  if (rel <= 0) {
    farHand = onStone;
    far = armIK(b.shoulder, { x: onStone.x + Math.cos(fa) * RIG.wristToPalm, y: onStone.y + Math.sin(fa) * RIG.wristToPalm });
  } else {
    const w0 = { x: onStone.x + Math.cos(fa) * RIG.wristToPalm, y: onStone.y + Math.sin(fa) * RIG.wristToPalm };
    farHand = { x: w0.x + (stand.arms[1].end.x - w0.x) * rel, y: w0.y + (stand.arms[1].end.y - w0.y) * rel };
    far = armIK(b.shoulder, farHand);
  }
  return { ...b, feet, legs, arms: [near, far], hands: [palm, rel <= 0 ? onStone : farHand] };
}

/** Pelvis position whose hold pose rests the stone at `stoneS` (the summit ledge's start), by fixed-point iteration. */
export function holdDForStone(path: SlopePath, stoneS: number): number {
  let D = stoneS - 1.0;
  for (let i = 0; i < 5; i++) D += stoneS - solveHoldStatic(path, D).sB;
  return D;
}

/**
 * The far shoulder sits a little above the near one (seen in profile), so the two arms separate. It slides along
 * its arm until its shoulder → wrist distance equals the near arm's (`dist`), so both elbows lock alike.
 */
export function farShoulder(shoulder: V, target: V, dist?: number): V {
  const dx = target.x - shoulder.x, dy = target.y - shoulder.y, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d, o = FAR_SHOULDER;
  const want = dist ?? d;
  // root = shoulder + perp·o + u·δ with |target − root| = want
  const along = d, across = o; // target is `along` ahead on u, root is `across` off it
  const delta = along - Math.sqrt(Math.max(0, want * want - across * across));
  return { x: shoulder.x - uy * o + ux * delta, y: shoulder.y + ux * o + uy * delta };
}

/**
 * Shoulder → stone-centre distance that puts the wrist of the hand furthest round the stone (HAND_FAR) at arm
 * extension e. Hands sit off the centre line, so measuring along it would over-straighten the arms.
 */
export function stoneDistance(e: number, R: number): number {
  const rr = R + RIG.palm + RIG.wristToPalm, phi = Math.abs(HAND_NEAR) / R; // the near hand sets it; the far shoulder matches its distance
  const L = e * ARM_CHAIN;
  return rr * Math.cos(phi) + Math.sqrt(Math.max(0, L * L - (rr * Math.sin(phi)) ** 2));
}
