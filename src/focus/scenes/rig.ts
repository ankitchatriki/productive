// Sisyphus figure rig (STRUGGLEMORE §3.4): keyframed pelvis/spine + analytic two-bone IK. Pure, world units, y up.
import type { SlopePath, V } from './path';

export const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
export const easeOut = (u: number) => 1 - (1 - u) * (1 - u);

/** Proportions in units of standing height H. */
export const BODY = {
  headR: 0.072, neck: 0.105, torso: 0.3, shoulderW: 0.2, hipW: 0.15,
  upperArm: 0.17, foreArm: 0.16, armW0: 0.075, armW1: 0.055,
  thigh: 0.255, shin: 0.255, legW0: 0.11, legW1: 0.068,
  footL: 0.12, footH: 0.04, handR: 0.036, boulderR: 0.56,
};

export interface Limb { root: V; joint: V; end: V }
export interface Pose {
  pelvis: V; shoulder: V; head: V;
  /** Torso lean from vertical, radians; positive leans toward +x. */
  lean: number;
  legs: [Limb, Limb];   // [near, far]
  arms: [Limb, Limb];   // [near, far]
  /** +1 faces uphill (+x), −1 faces downhill. */
  facing: 1 | -1;
  breath: number;       // torso width scale
  alpha: number;        // figure opacity
  /** Heel lift per foot (rad) during the grip push. */
  heel?: [number, number];
  /** Push effort 0..1 (calf squash, hand spread). */
  load?: number;
}

/**
 * Two-bone IK: joint position for a chain root→target with lengths a, b.
 * `pick` chooses between the two solutions (e.g. knee forward / elbow down).
 */
export function twoBoneIK(root: V, target: V, a: number, b: number, pick: (c1: V, c2: V) => V): V {
  const dx = target.x - root.x, dy = target.y - root.y;
  const d = clamp(Math.hypot(dx, dy), Math.abs(a - b) + 1e-6, 0.995 * (a + b));
  const base = Math.atan2(dy, dx);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const off = Math.acos(cosA);
  const c1 = { x: root.x + a * Math.cos(base + off), y: root.y + a * Math.sin(base + off) };
  const c2 = { x: root.x + a * Math.cos(base - off), y: root.y + a * Math.sin(base - off) };
  return pick(c1, c2);
}

/** Effective end point actually reached (target clamped to the chain's reach). */
export function reach(root: V, target: V, a: number, b: number): V {
  const dx = target.x - root.x, dy = target.y - root.y;
  const d = Math.hypot(dx, dy);
  const max = 0.995 * (a + b);
  if (d <= max) return target;
  return { x: root.x + (dx / d) * max, y: root.y + (dy / d) * max };
}

/** Foot target along the slope (in H) relative to the pelvis ground point, its lift and slip speed. */
export function footTarget(phi: number): { u: number; lift: number; slip: number } {
  const f = ((phi % 1) + 1) % 1;
  if (f < 0.3) { const u = f / 0.3; return { u: lerp(-0.3, 0.16, easeInOut(u)), lift: 0.07 * Math.sin(Math.PI * u), slip: 0 }; }
  if (f < 0.55) { const u = (f - 0.3) / 0.25; return { u: lerp(0.16, -0.04, easeOut(u)), lift: 0, slip: 1 - u }; }
  const u = (f - 0.55) / 0.45;
  return { u: lerp(-0.04, -0.3, u), lift: 0, slip: 0 };
}

export const hipH = (phi: number) => 0.38 - 0.015 * Math.cos(4 * Math.PI * phi);
export const surge = (phi: number) => 0.018 * Math.max(0, Math.sin(4 * Math.PI * phi - 0.6));
export const leanDeg = (phi: number) => 46 + 4 * Math.sin(4 * Math.PI * phi + Math.PI / 2);

export interface PushParams {
  path: SlopePath;
  H: number;
  /** Boulder centre arc-length fraction (already including any nudge). */
  sB: number;
  phi: number;
  lean: number;        // degrees
  hip: number;         // nominal hip height in H
  surge: number;       // in H
  tremor: number;      // in H, added to pelvis/hands
  headTilt: number;    // degrees from vertical (neck direction)
  breath: number;
  alpha?: number;
}

export function boulderCentre(path: SlopePath, sB: number, R: number): V {
  if (path.centreAt) return path.centreAt(sB, R);
  const g = path.at(sB), n = path.normalAt(sB);
  return { x: g.x + n.x * R, y: g.y + n.y * R };
}

/** Contact angles on the stone, relative to the local slope (208°/192° on the 22° base slope). Non-rotating with the texture. */
export function handAngles(path: SlopePath, sB: number): [number, number] {
  // Slope averaged over the figure's footprint (a chord), so the hands slide smoothly over a crest (ROUND3 §3.3.5).
  const s = Math.min(sB, 0.999);
  const p1 = path.at(s), p0 = path.at(s - 0.14 / path.length);
  const a = Math.atan2(p1.y - p0.y, p1.x - p0.x) / DEG;
  return [188 + a, 196 + a];
}

export function handTarget(bc: V, R: number, H: number, deg: number): V {
  return { x: bc.x + (R + 0.008 * H) * Math.cos(deg * DEG), y: bc.y + (R + 0.008 * H) * Math.sin(deg * DEG) };
}

const LEG = () => BODY.thigh + BODY.shin;
const ARM = () => BODY.upperArm + BODY.foreArm;

const STRIDE_MIN = -0.3, STRIDE_MAX = 0.16;

/**
 * Pelvis height: the nominal hip height, but never higher than lets the feet reach
 * the extremes of the stride on this slope (a per-position ceiling, so the body
 * doesn't bob with each step beyond the scripted hipH curve).
 */
/** Shorter steps on steeper ground, so the back foot doesn't drop out of reach. */
function strideScale(path: SlopePath, s: number): number {
  return Math.cos(path.angleAt(Math.min(0.999, Math.max(0, s))) * DEG) / Math.cos(22 * DEG);
}

function pelvisY(path: SlopePath, pelvisS: number, gx: number, gy: number, hip: number, H: number): number {
  let y = gy + hip * H;
  const maxLeg = 0.96 * LEG() * H;
  const k = strideScale(path, pelvisS);
  for (const u of [STRIDE_MIN, STRIDE_MAX]) {
    const f = path.at(pelvisS + (u * k * H) / path.length);
    const dx = Math.abs(f.x - gx);
    if (dx < maxLeg) y = Math.min(y, f.y + Math.sqrt(maxLeg * maxLeg - dx * dx));
  }
  return y;
}

function feetFor(path: SlopePath, pelvisS: number, phi: number, H: number) {
  const k = strideScale(path, pelvisS);
  return [0, 0.5].map((off) => {
    const t = footTarget(phi + off);
    const g = path.at(pelvisS + (t.u * k * H) / path.length);
    return { foot: { x: g.x, y: g.y + t.lift * H }, slip: t.slip, lift: t.lift };
  });
}

/** Distance behind the boulder contact point (world units, along the path) that puts the near hand at comfortable reach. */
export function pelvisOffset(path: SlopePath, sB: number, H: number): number {
  const R = BODY.boulderR * H;
  const bc = boulderCentre(path, sB, R);
  const hands = handAngles(path, sB).map((a) => handTarget(bc, R, H, a));
  const want = 0.8 * ARM() * H;
  const lean = 48 * DEG;
  const distAt = (d: number) => {
    const ps = sB - d / path.length;
    const g = path.at(ps);
    const py = pelvisY(path, ps, g.x, g.y, 0.455, H);
    const sh = { x: g.x + BODY.torso * H * Math.sin(lean), y: py + BODY.torso * H * Math.cos(lean) };
    return Math.max(...hands.map((hand) => Math.hypot(hand.x - sh.x, hand.y - sh.y)));
  };
  const maxDist = distAt;
  // Distance is not monotone in d (on steep slopes the pelvis can pass under the hand),
  // so find the closest approach first, then bisect on the behind side of it.
  let best = 0.2 * H, bestDist = Infinity;
  for (let d = 0.2 * H; d <= 3 * H; d += 0.1 * H) {
    const v = maxDist(d);
    if (v < bestDist) { bestDist = v; best = d; }
  }
  if (bestDist >= want) return best;
  let lo = best, hi = 3 * H;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (maxDist(mid) < want) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The straining push pose: feet on the slope, hands on the stone. */
export function solvePush(p: PushParams, offset?: number): { pose: Pose; boulder: V; slips: number[]; feet: V[] } {
  const { path, H } = p;
  const R = BODY.boulderR * H;
  const bc = boulderCentre(path, p.sB, R);
  const d = offset ?? pelvisOffset(path, p.sB, H);
  const pelvisS = p.sB - d / path.length;
  const g = path.at(pelvisS);
  const feetInfo = feetFor(path, pelvisS, p.phi, H);
  const feet = feetInfo.map((f) => f.foot);
  const px = g.x + p.surge * H;
  const py = pelvisY(path, pelvisS, px, g.y, p.hip, H) + p.tremor * H;
  const lean = p.lean * DEG;
  const pelvis = { x: px, y: py };
  let shoulder = { x: pelvis.x + BODY.torso * H * Math.sin(lean), y: pelvis.y + BODY.torso * H * Math.cos(lean) };
  // If the stone is just out of reach (steep top of the climb), the body shifts toward it.
  const targets = handAngles(path, p.sB).map((deg) => handTarget(bc, R, H, deg));
  const maxArm = 0.99 * ARM() * H;
  let deficit = 0, dir = { x: 0, y: 0 };
  for (const t of targets) {
    const dx = t.x - shoulder.x, dy = t.y - shoulder.y, dist = Math.hypot(dx, dy);
    if (dist - maxArm > deficit) { deficit = dist - maxArm; dir = { x: dx / dist, y: dy / dist }; }
  }
  if (deficit > 0) {
    const shift = Math.min(deficit, 0.08 * H);
    pelvis.x += dir.x * shift; pelvis.y += dir.y * shift;
    shoulder = { x: shoulder.x + dir.x * shift, y: shoulder.y + dir.y * shift };
  }
  const neck = p.headTilt * DEG;
  const head = { x: shoulder.x + BODY.neck * H * Math.sin(neck), y: shoulder.y + BODY.neck * H * Math.cos(neck) };
  const tangent = path.tangentAt(pelvisS);
  const legs = feet.map((foot) => {
    const end = reach(pelvis, foot, BODY.thigh * H, BODY.shin * H);
    const mid = { x: (pelvis.x + end.x) / 2, y: (pelvis.y + end.y) / 2 };
    const knee = twoBoneIK(pelvis, end, BODY.thigh * H, BODY.shin * H, (c1, c2) =>
      ((c1.x - mid.x) * tangent.x + (c1.y - mid.y) * tangent.y) >= ((c2.x - mid.x) * tangent.x + (c2.y - mid.y) * tangent.y) ? c1 : c2);
    return { root: pelvis, joint: knee, end };
  }) as [Limb, Limb];
  const arms = handAngles(path, p.sB).map((deg) => {
    const t = handTarget(bc, R, H, deg);
    const hand = reach(shoulder, { x: t.x, y: t.y + p.tremor * H * 0.5 }, BODY.upperArm * H, BODY.foreArm * H);
    const elbow = twoBoneIK(shoulder, hand, BODY.upperArm * H, BODY.foreArm * H, (c1, c2) => (c1.y <= c2.y ? c1 : c2));
    return { root: shoulder, joint: elbow, end: hand };
  }) as [Limb, Limb];
  return {
    pose: { pelvis, shoulder, head, lean, legs, arms, facing: 1, breath: p.breath, alpha: p.alpha ?? 1 },
    boulder: bc,
    slips: feetInfo.map((f) => f.slip),
    feet,
  };
}

/** Standing on the plateau with a hand resting on top of the stone (summit). */
export function solveStand(path: SlopePath, H: number, pelvisX: number, bc: V, opts: { sway: number; breath: number; leanDeg?: number; alpha?: number; handOnStone?: boolean }): Pose {
  const gy = path.groundY(pelvisX);
  const pelvis = { x: pelvisX + opts.sway * H, y: gy + 0.47 * H };
  const lean = (opts.leanDeg ?? 4) * DEG;
  const shoulder = { x: pelvis.x + BODY.torso * H * Math.sin(lean), y: pelvis.y + BODY.torso * H * Math.cos(lean) };
  const head = { x: shoulder.x + BODY.neck * H * Math.sin(-8 * DEG + lean * 0.3), y: shoulder.y + BODY.neck * H * Math.cos(-8 * DEG) };
  const feet = [pelvisX + 0.07 * H, pelvisX - 0.06 * H].map((x) => ({ x, y: path.groundY(x) }));
  const legs = feet.map((foot) => {
    const end = reach(pelvis, foot, BODY.thigh * H, BODY.shin * H);
    const knee = twoBoneIK(pelvis, end, BODY.thigh * H, BODY.shin * H, (c1, c2) => (c1.x >= c2.x ? c1 : c2));
    return { root: pelvis, joint: knee, end };
  }) as [Limb, Limb];
  const R = BODY.boulderR * H;
  const nearT = opts.handOnStone === false
    ? { x: shoulder.x + 0.05 * H, y: shoulder.y - 0.3 * H }
    : handTarget(bc, R, H, 120);
  const nearHand = reach(shoulder, nearT, BODY.upperArm * H, BODY.foreArm * H);
  const nearElbow = twoBoneIK(shoulder, nearHand, BODY.upperArm * H, BODY.foreArm * H, (c1, c2) => (c1.y <= c2.y ? c1 : c2));
  const hang = { x: shoulder.x - Math.sin(8 * DEG) * ARM() * H * 0.98, y: shoulder.y - Math.cos(8 * DEG) * ARM() * H * 0.98 };
  const farElbow = twoBoneIK(shoulder, hang, BODY.upperArm * H, BODY.foreArm * H, (c1, c2) => (c1.x >= c2.x ? c1 : c2));
  return {
    pelvis, shoulder, head, lean, legs,
    arms: [{ root: shoulder, joint: nearElbow, end: nearHand }, { root: shoulder, joint: farElbow, end: hang }],
    facing: 1, breath: opts.breath, alpha: opts.alpha ?? 1,
  };
}

/** Sitting with the back against the stone, facing down the valley (break). */
export function solveSit(path: SlopePath, H: number, bc: V, breath: number, alpha = 1): Pose {
  const R = BODY.boulderR * H;
  const px = bc.x - R * 0.95 - 0.04 * H;
  const gy = path.groundY(px);
  const pelvis = { x: px, y: gy + 0.06 * H };
  const lean = 18 * DEG; // leaning back into the stone (+x), figure faces −x
  const shoulder = { x: pelvis.x + BODY.torso * H * Math.sin(lean), y: pelvis.y + BODY.torso * H * Math.cos(lean) };
  const head = { x: shoulder.x - 0.04 * H, y: shoulder.y + BODY.neck * H * 0.95 };
  const thighAng = 15 * DEG;
  const legs = [0.01, -0.02].map((dx) => {
    const knee = { x: pelvis.x - BODY.thigh * H * Math.cos(thighAng) + dx * H, y: pelvis.y + BODY.thigh * H * Math.sin(thighAng) };
    const footX = knee.x - 0.05 * H;
    const foot = { x: footX, y: path.groundY(footX) + BODY.footH * H * 0.5 };
    const end = reach(knee, foot, BODY.shin * H, 0.0001);
    return { root: pelvis, joint: knee, end };
  }) as [Limb, Limb];
  const arms = legs.map((l, i) => {
    const hand = { x: l.joint.x - 0.02 * H - i * 0.01 * H, y: l.joint.y + 0.015 * H };
    const end = reach(shoulder, hand, BODY.upperArm * H, BODY.foreArm * H);
    const elbow = twoBoneIK(shoulder, end, BODY.upperArm * H, BODY.foreArm * H, (c1, c2) => (c1.y <= c2.y ? c1 : c2));
    return { root: shoulder, joint: elbow, end };
  }) as [Limb, Limb];
  return { pelvis, shoulder, head, lean, legs, arms, facing: -1, breath, alpha };
}

const lv = (a: V, b: V, k: number): V => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const ll = (a: Limb, b: Limb, k: number): Limb => ({ root: lv(a.root, b.root, k), joint: lv(a.joint, b.joint, k), end: lv(a.end, b.end, k) });

/** Joint-space blend between two poses of the same facing. */
export function blendPose(a: Pose, b: Pose, k: number): Pose {
  if (k <= 0) return a;
  if (k >= 1) return b;
  return {
    pelvis: lv(a.pelvis, b.pelvis, k), shoulder: lv(a.shoulder, b.shoulder, k), head: lv(a.head, b.head, k),
    lean: lerp(a.lean, b.lean, k),
    legs: [ll(a.legs[0], b.legs[0], k), ll(a.legs[1], b.legs[1], k)],
    arms: [ll(a.arms[0], b.arms[0], k), ll(a.arms[1], b.arms[1], k)],
    facing: k < 0.5 ? a.facing : b.facing,
    breath: lerp(a.breath, b.breath, k), alpha: lerp(a.alpha, b.alpha, k),
  };
}
