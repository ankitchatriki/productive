// Figure v2 outlines (ROUND3_DESIGN §3.4): skeleton + width profile → one closed outline per part. Pure, screen px.
import type { V } from './path';

export const DEGR = Math.PI / 180;

/** Half-widths in units of H at t = 0, .25, .5, .75, 1 along each bone: [front, back]. */
export const PROFILE = {
  thigh: { front: [0.056, 0.062, 0.060, 0.050, 0.040], back: [0.052, 0.056, 0.050, 0.044, 0.038] },
  knee: 0.036,
  shin: { front: [0.034, 0.036, 0.030, 0.024, 0.020], back: [0.036, 0.046, 0.040, 0.028, 0.020] },
  upperArm: { front: [0.034, 0.042, 0.036, 0.030, 0.026], back: [0.030, 0.034, 0.032, 0.028, 0.026] },
  foreArm: { front: [0.028, 0.032, 0.028, 0.022, 0.018], back: [0.026, 0.030, 0.026, 0.020, 0.018] },
  torsoFront: [0.085, 0.075, 0.100, 0.095],
  torsoBack: [0.080, 0.070, 0.115, 0.050],
};

const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
const len = (a: V) => Math.hypot(a.x, a.y) || 1e-9;
const norm = (a: V): V => mul(a, 1 / len(a));
const lerpV = (a: V, b: V, k: number): V => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

/** Signed area (screen coordinates). */
export function area(pts: V[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}
/** Make every outline wind the same way, so a union of parts never punches holes. */
export function clockwise(pts: V[]): V[] { return area(pts) < 0 ? pts.slice().reverse() : pts; }

/**
 * Outline of a two-bone limb (root → joint → end) as one closed polygon.
 * `front` is a unit vector pointing to the limb's front side (e.g. uphill / toward the stone).
 * `bulge` scales the back profile (calf squash under load); the front narrows to keep the volume.
 */
export function limbOutline(root: V, joint: V, end: V, H: number, kind: 'leg' | 'arm', front: V, bulge = 1): V[] {
  const p1 = kind === 'leg' ? PROFILE.thigh : PROFILE.upperArm;
  const p2 = kind === 'leg' ? PROFILE.shin : PROFILE.foreArm;
  const fs: V[] = [], bs: V[] = [];
  const bone = (a: V, b: V, prof: { front: number[]; back: number[] }, skipFirst: boolean, back2 = 1, front2 = 1) => {
    const d = norm(sub(b, a));
    let n = { x: -d.y, y: d.x };
    if (n.x * front.x + n.y * front.y < 0) n = mul(n, -1);
    for (let i = skipFirst ? 1 : 0; i < 5; i++) {
      const c = lerpV(a, b, i / 4);
      fs.push(add(c, mul(n, prof.front[i] * H * front2)));
      bs.push(sub(c, mul(n, prof.back[i] * H * back2)));
    }
  };
  bone(root, joint, p1, false);
  // Knee / elbow: a single narrow point gives a clear joint.
  if (kind === 'leg') {
    const d1 = norm(sub(joint, root)), d2 = norm(sub(end, joint));
    let n = norm({ x: -(d1.y + d2.y), y: d1.x + d2.x });
    if (n.x * front.x + n.y * front.y < 0) n = mul(n, -1);
    fs[fs.length - 1] = add(joint, mul(n, PROFILE.knee * H * 1.05));
    bs[bs.length - 1] = sub(joint, mul(n, PROFILE.knee * H));
  }
  bone(joint, end, p2, true, kind === 'leg' ? bulge : 1, kind === 'leg' ? 1 - (bulge - 1) * 0.5 : 1);
  // Rounded cap at the end.
  const d = norm(sub(end, joint));
  const cap = add(end, mul(d, (kind === 'leg' ? 0.02 : 0.018) * H));
  return clockwise([...fs, cap, ...bs.reverse()]);
}

/** Torso from pelvis to shoulder along a 3-point spine that rounds the back under load. */
export function torsoOutline(pelvis: V, shoulder: V, H: number, front: V, breath: number, round = 0.02): V[] {
  const d = norm(sub(shoulder, pelvis));
  let n = { x: -d.y, y: d.x };
  if (n.x * front.x + n.y * front.y < 0) n = mul(n, -1);
  const mid = sub(lerpV(pelvis, shoulder, 0.55), mul(n, round * H)); // spine bows toward the back
  const spine = (t: number): V => {
    const u = 1 - t;
    return { x: u * u * pelvis.x + 2 * u * t * mid.x + t * t * shoulder.x, y: u * u * pelvis.y + 2 * u * t * mid.y + t * t * shoulder.y };
  };
  const ts = [0, 0.33, 0.7, 1];
  const fs: V[] = [], bs: V[] = [];
  ts.forEach((t, i) => {
    const c = spine(t);
    const chest = i === 2 ? breath : 1;
    fs.push(add(c, mul(n, PROFILE.torsoFront[i] * H * chest)));
    bs.push(sub(c, mul(n, PROFILE.torsoBack[i] * H * (i === 2 ? breath : 1))));
  });
  const neckTop = add(shoulder, mul(d, 0.03 * H));
  const hipCap = sub(pelvis, mul(d, 0.05 * H));
  return clockwise([hipCap, ...fs, neckTop, ...bs.reverse()]);
}

/** Head: an egg along the neck direction with a brow notch and a jaw corner on the face side. */
export function headOutline(c: V, H: number, tiltRad: number, faceSign: 1 | -1): V[] {
  const rx = 0.060 * H, ry = 0.072 * H;
  const pts: V[] = [];
  const ca = Math.cos(tiltRad), sa = Math.sin(tiltRad);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    let x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    // face side (+x in head space × faceSign): brow notch near the top, jaw corner lower
    const fx = x * faceSign;
    if (fx > 0.7 * rx && y < -0.15 * ry && y > -0.55 * ry) x -= 0.008 * H * faceSign;
    if (fx > 0.5 * rx && y > 0.45 * ry) { x -= 0.008 * H * faceSign; y -= 0.004 * H; }
    // screen y grows down: head "up" is −y. Rotate by tilt (from vertical, toward +x).
    pts.push({ x: c.x + x * ca - y * sa, y: c.y + x * sa + y * ca });
  }
  return clockwise(pts);
}

/** Mitten hand at `p`, palm axis along `axisRad`, widened under load. */
export function handOutline(p: V, H: number, axisRad: number, load: number): V[] {
  const rx = 0.034 * H * (1 + 0.12 * load), ry = 0.025 * H;
  const pts: V[] = [];
  const ca = Math.cos(axisRad), sa = Math.sin(axisRad);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    let x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    if (Math.abs(a - 35 * DEGR) < 0.6) { x *= 1.25; y *= 1.35; } // thumb nub
    pts.push({ x: p.x + x * ca - y * sa, y: p.y + x * sa + y * ca });
  }
  return clockwise(pts);
}

/** Foot wedge (heel → toe) along the ground; `heelLift` (rad) rotates it about the toe. */
export function footOutline(ankle: V, H: number, groundRad: number, facing: 1 | -1, heelLift: number): V[] {
  const L = 0.12 * H;
  const dir = { x: Math.cos(groundRad) * facing, y: Math.sin(groundRad) * facing };
  const toe = add(ankle, mul(dir, L * 0.78));
  // rotate heel about the toe
  const back = mul(dir, -L);
  const c = Math.cos(heelLift * facing), s = Math.sin(heelLift * facing);
  const heelDir = { x: back.x * c - back.y * s, y: back.x * s + back.y * c };
  const heel = add(toe, heelDir);
  // "up" off the ground: perpendicular to the sole, pointing away from the slope (screen y down).
  let up = norm({ x: -dir.y, y: dir.x });
  if (up.y > 0) up = mul(up, -1);
  const rH = 0.022 * H, rT = 0.014 * H;
  const hd = norm(sub(toe, heel));
  const pts: V[] = [
    add(heel, mul(up, rH)),
    sub(heel, mul(hd, rH)),
    sub(heel, mul(up, rH * 0.6)),
    sub(toe, mul(up, rT * 0.7)),
    add(toe, mul(hd, rT)),
    add(toe, mul(up, rT)),
    add(lerpV(heel, toe, 0.45), mul(up, rH * 1.5)),
  ];
  return clockwise(pts);
}

/** Append a closed smooth outline (quadratic curves through edge midpoints) to the current path. */
export function smoothPath(g: { moveTo(x: number, y: number): void; quadraticCurveTo(a: number, b: number, c: number, d: number): void; closePath(): void }, pts: V[]) {
  const n = pts.length;
  if (n < 3) return;
  const m = (i: number) => lerpV(pts[i % n], pts[(i + 1) % n], 0.5);
  const s0 = m(n - 1);
  g.moveTo(s0.x, s0.y);
  for (let i = 0; i < n; i++) { const c = pts[i], e = m(i); g.quadraticCurveTo(c.x, c.y, e.x, e.y); }
  g.closePath();
}

export function finite(pts: V[]): boolean { return pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)); }
