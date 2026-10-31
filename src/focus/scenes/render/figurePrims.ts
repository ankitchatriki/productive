// The figure as volumes (ROUND6_PLAN §4.2): the 2D skeleton lifted to 2.5D round cones (tapered capsules) with a
// depth per side, plus a few muscle masses. Pure; world units H, y up. The figure shader ray-casts these per pixel.
import type { V } from '../path';
import { BODY } from '../body';
import { fromVertical, handPoint, type Skel } from '../walk';

export interface Prim { a: V; b: V; az: number; bz: number; ra: number; rb: number; albedo: number; kind: number; side: number; squash: number; name: string }

/** Scene-luminance albedos (§4.3, rescaled to the print curve as it is: the plan's 0.36/0.16/0.42 printed far too light). */
export const ALBEDO = { skin: 0.16, hair: 0.05 }; // REVIEW_ROUND6 A3: figure mean ≈ L 80–95 against the sky
const Z = { near: 0.06, mid: 0, far: -0.06 };

const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const dist2 = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (a: V): V => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };

/** ≤ 24 primitives from a skeleton. Far limbs first (they also sit deeper in z). */
export function figurePrims(s: Skel): Prim[] {
  const f = s.facing;
  const out: Prim[] = [];
  const P = (name: string, a: V, b: V, ra: number, rb: number, z: number, side: number, albedo = ALBEDO.skin, za = z, squash = 1) =>
    out.push({ name, a, b, az: za, bz: z, ra, rb, albedo, kind: 0, side, squash });
  const td = unit(sub(s.shoulder, s.pelvis));                 // torso up
  const front = { x: td.y * f, y: -td.x * f };               // torso front (toward the facing side)
  const at = (u: number, v = 0) => add(add(s.pelvis, mul(td, u)), mul(front, v));
  const limbs = (i: 0 | 1) => {
    const side = i === 0 ? 1 : -1, z = i === 0 ? Z.near : Z.far;
    const l = s.legs[i], ft = s.feet[i];
    // thigh 0.068 → 0.042 with the quadriceps' front bulge at u ≈ 0.35; shin with a calf bulge 30% down
    const td2 = unit(sub(l.knee, l.hip)), tf = { x: td2.y * f, y: -td2.x * f };
    P(`thigh${i}`, l.hip, l.knee, 0.066, 0.040, z, side);
    const q0 = add(add(l.hip, mul(sub(l.knee, l.hip), 0.22)), mul(tf, 0.012)), q1 = add(add(l.hip, mul(sub(l.knee, l.hip), 0.55)), mul(tf, 0.008));
    if (i === 0) P(`quad${i}`, q0, q1, 0.050, 0.042, z + 0.004, side);   // far side: hidden, saves the budget
    P(`shin${i}`, l.knee, l.ankle, 0.036, 0.022, z, side);
    const sd = unit(sub(l.ankle, l.knee)), back = { x: -sd.y * f, y: sd.x * f };
    const lk = dist2(l.knee, l.ankle);
    const c0 = add(add(l.knee, mul(sd, 0.18 * lk)), mul(back, 0.010)), c1 = add(add(l.knee, mul(sd, 0.42 * lk)), mul(back, 0.006));
    P(`calf${i}`, c0, c1, 0.036, 0.028, z, side);
    // the foot as a flat wedge: heel 0.022, ball 0.014, its sole on the ground
    const n = { x: -Math.sin(ft.ang), y: Math.cos(ft.ang) };
    const heel = add(ft.heel, mul(n, 0.022)), ball = add(ft.ball, mul(n, 0.014)), toe = add(ft.toe, mul(n, 0.008));
    P(`foot${i}`, heel, ball, 0.022, 0.014, z, side, ALBEDO.skin, z, 0.55);
    P(`toe${i}`, ball, toe, 0.014, 0.008, z, side, ALBEDO.skin, z, 0.5);
  };
  const arm = (i: 0 | 1) => {
    const side = i === 0 ? 1 : -1, z = i === 0 ? Z.near : Z.far;
    const a = s.arms[i], h = s.hands[i];
    const ad = unit(sub(a.elbow, a.shoulder));
    P(`deltoid${i}`, a.shoulder, add(a.shoulder, mul(ad, 0.050)), 0.042, 0.034, z, side);
    P(`upperArm${i}`, a.shoulder, a.elbow, 0.033, 0.024, z, side);
    const ua = sub(a.elbow, a.shoulder), uf = { x: -ad.y * f, y: ad.x * f };
    if (i === 0) P(`biceps${i}`, add(add(a.shoulder, mul(ua, 0.35)), mul(uf, -0.006)), add(add(a.shoulder, mul(ua, 0.70)), mul(uf, -0.004)), 0.031, 0.026, z + 0.003, side);
    P(`foreArm${i}`, a.elbow, a.wrist, 0.028, 0.018, z, side);
    const palm = handPoint(h, { x: 0.020, y: 0.012 }, f), tip = handPoint(h, { x: 0.050, y: 0.008 }, f);
    P(`hand${i}`, a.wrist, palm, 0.019, 0.017, z, side, ALBEDO.skin, z, 0.6);
    if (i === 0) P(`fingers${i}`, palm, tip, 0.015, 0.010, z, side, ALBEDO.skin, z, 0.5);
  };
  limbs(1); arm(1);
  // torso masses (mid plane)
  const br = s.breath;
  // torso: buttock behind the pelvis, a waist (abdomen 0.052 under a 0.078 ribcage), lats and chest
  P('glute', at(0.010, -0.024), at(-0.030, -0.022), 0.055, 0.050, Z.mid - 0.01, 0);
  P('pelvis', at(-0.020, 0.000), at(0.06, 0.006), 0.058, 0.053, Z.mid, 0);
  P('abdomen', at(0.04, 0.008), at(0.16, 0.008), 0.052, 0.060 * br, Z.mid, 0);
  P('ribcage', at(0.15, 0.004), at(0.255, 0.000), 0.078 * br, 0.072, Z.mid, 0);
  P('lats', at(0.13, -0.026), at(0.27, -0.032), 0.044, 0.058, Z.mid - 0.005, 0);
  P('pectoral', at(0.21, 0.030), at(0.25, 0.024), 0.046, 0.040, Z.mid + 0.004, 0);
  limbs(0);
  // head group: neck, cranium, jaw, hair
  const hd = fromVertical(s.headAxis, f), face = { x: hd.y * f, y: -hd.x * f };
  const hp = (u: number, v: number) => add(add(s.head, mul(hd, u)), mul(face, v));
  P('trapezius', at(BODY.torso - 0.035, -0.035), at(BODY.torso + 0.005, -0.012), 0.040, 0.030, Z.mid - 0.002, 0);
  P('neck', at(BODY.torso - 0.01, 0.0), hp(-0.035, -0.010), 0.032, 0.026, Z.mid, 0);
  P('cranium', hp(-0.010, -0.004), hp(0.018, -0.006), 0.060, 0.058, Z.mid + 0.002, 0);
  P('jaw', hp(-0.030, 0.012), hp(-0.052, 0.030), 0.036, 0.026, Z.mid + 0.001, 0);
  P('hair', hp(-0.004, -0.022), hp(0.022, -0.008), 0.062, 0.056, Z.mid + 0.006, 0, ALBEDO.hair);   // a cap over the back and top
  arm(0);
  return out;
}

/** World bounds of the primitives (with their radii). */
export function figureBounds(prims: Prim[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of prims) for (const [c, r] of [[p.a, p.ra], [p.b, p.rb]] as const) { x0 = Math.min(x0, c.x - r); x1 = Math.max(x1, c.x + r); y0 = Math.min(y0, c.y - r); y1 = Math.max(y1, c.y + r); }
  return { x0, y0, x1, y1 };
}

/** Coverage test (the silhouette): is world point q inside any primitive? */
export function insideFigure(prims: Prim[], q: V): boolean {
  for (const p of prims) {
    const ab = sub(p.b, p.a), l2 = ab.x * ab.x + ab.y * ab.y || 1e-9;
    const u = Math.max(0, Math.min(1, ((q.x - p.a.x) * ab.x + (q.y - p.a.y) * ab.y) / l2));
    const c = add(p.a, mul(ab, u)), r = p.ra + (p.rb - p.ra) * u;
    if (Math.hypot(q.x - c.x, q.y - c.y) <= r) return true;
  }
  return false;
}
