// Black-figure Sisyphus drawing, round 4 (ROUND4_SISYPHUS §3, §6): a heroic, broad-shouldered build drawn as
// bone-local capsule outlines (flat black, grouped far leg → far arm → core → near leg → cloth → near arm), with an
// ochre incision where black overlaps black and a bone-attached detail layer of ~70 incised strokes in three levels
// of detail. Every detail line lives in its part's own frame, so it moves, bends and breathes with the rig.
import { INK, LW } from './artPalette';
import { mkCanvas } from './artDraw';
import type { Chain } from './chain';
import type { V } from './path';
import { RIG, type FootPose, type Limb, type Pose } from './rig';
import type { Trail } from './trail';

export interface FigureFrame {
  pose: Pose;
  centre: V;
  R: number;
  /** CSS px per H (zoom included). */
  Hpx: number;
  toS: (v: V) => V;
  chains: Chain[] | null;
  trail: Trail;
  facing: 1 | -1;
  quality: number;
  /** Strain veins drawn on, 0..1 (§6.5). */
  veins?: number;
  /** May the level of detail change this frame (only at the press, never mid-step)? */
  tierFree?: boolean;
}

export const h = 1 / 8; // head unit in H
type St = Array<[number, number]>; // [t, half-depth in h]
type Pt = [number, number];

/** §3.1 stations: [front, back] half-depths (head units) along each bone. */
export const STATIONS: Record<'torso' | 'neck' | 'upperArm' | 'foreArm' | 'thigh' | 'shin', { front: St; back: St }> = {
  torso: { front: [[0, 0.55], [0.35, 0.42], [0.68, 0.80], [0.9, 0.66], [1, 0.48]], back: [[0, 0.74], [0.3, 0.44], [0.5, 0.56], [0.66, 0.70], [0.95, 0.62], [1, 0.42]] },
  neck: { front: [[0, 0.34], [1, 0.34]], back: [[0, 0.55], [0.5, 0.40], [1, 0.34]] },
  upperArm: { front: [[0, 0.42], [0.1, 0.50], [0.55, 0.34], [1, 0.20]], back: [[0, 0.40], [0.1, 0.42], [0.4, 0.36], [1, 0.20]] },
  foreArm: { front: [[0, 0.22], [0.25, 0.30], [1, 0.15]], back: [[0, 0.22], [0.25, 0.28], [1, 0.15]] },
  thigh: { front: [[0, 0.44], [0.3, 0.52], [1, 0.28]], back: [[0, 0.50], [0.15, 0.54], [1, 0.28]] },
  shin: { front: [[0, 0.26], [0.08, 0.28], [0.25, 0.19], [1, 0.13]], back: [[0, 0.28], [0.25, 0.48], [0.6, 0.28], [1, 0.14]] },
};
type BonePart = keyof typeof STATIONS;

export function interp(st: St, t: number): number {
  if (t <= st[0][0]) return st[0][1];
  for (let i = 1; i < st.length; i++) if (t <= st[i][0]) { const a = st[i - 1], b = st[i]; const k = (t - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * (k * k * (3 - 2 * k)); }
  return st[st.length - 1][1];
}

/** Capsule outline in bone-local coordinates (x along the bone in H, y toward the front in H). */
export function partOutline(L: number, s: { front: St; back: St }, frontK = 1, capP = true): V[] {
  const ts = [0, 0.1, 0.2, 0.3, 0.42, 0.55, 0.68, 0.8, 0.9, 1];
  const out: V[] = [];
  for (const t of ts) out.push({ x: t * L, y: interp(s.front, t) * h * frontK });
  const fe = interp(s.front, 1) * h * frontK, be = interp(s.back, 1) * h;
  const r = (fe + be) / 2, cy = (fe - be) / 2;
  for (let i = 1; i < 6; i++) { const a = Math.PI / 2 - (i / 6) * Math.PI; out.push({ x: L + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
  for (let i = ts.length - 1; i >= 0; i--) out.push({ x: ts[i] * L, y: -interp(s.back, ts[i]) * h });
  if (capP) {
    const f0 = interp(s.front, 0) * h * frontK, b0 = interp(s.back, 0) * h;
    const r0 = (f0 + b0) / 2, c0 = (f0 - b0) / 2;
    for (let i = 1; i < 6; i++) { const a = -Math.PI / 2 - (i / 6) * Math.PI; out.push({ x: Math.cos(a) * r0, y: c0 + Math.sin(a) * r0 }); }
  }
  return out;
}

interface Frame { o: V; d: V; f: V; L: number }
/** Bone frame: origin, unit direction, unit front normal. `s` = +1 torso/neck, −1 limbs (bone pointing away from the body). */
function boneFrame(a: V, b: V, facing: number, s: number): Frame {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1e-9;
  const d = { x: dx / L, y: dy / L };
  return { o: a, d, f: { x: d.y * facing * s, y: -d.x * facing * s }, L };
}
/** A frame from an origin and a unit x axis; y is x rotated +90° times `side`. Local units are head units. */
function axisFrame(o: V, x: V, side: number): Frame {
  return { o, d: x, f: { x: -x.y * side, y: x.x * side }, L: h };
}
const toW = (fr: Frame, p: V): V => ({ x: fr.o.x + fr.d.x * p.x + fr.f.x * p.y, y: fr.o.y + fr.d.y * p.x + fr.f.y * p.y });
/** Bone-local (t along the bone, y in head units) → world. */
const btW = (fr: Frame, t: number, y: number): V => toW(fr, { x: t * fr.L, y: y * h });
/** Head-unit local (x, y) → world. */
const huW = (fr: Frame, x: number, y: number): V => toW(fr, { x: x * h, y: y * h });

/** Signed area in screen space. */
export function area(pts: V[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}

/** Closed Catmull-Rom loop (tension 0.5) as cubic béziers. */
function loopPath(p: Path2D, pts: V[]) {
  const n = pts.length;
  if (n < 3) return;
  const P = area(pts) < 0 ? pts.slice().reverse() : pts; // same winding everywhere (nonzero union never punches holes)
  p.moveTo(P[0].x, P[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    p.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
  }
  p.closePath();
}

/** Open Catmull-Rom curve. */
function openPath(p: Path2D, P: V[]) {
  const n = P.length;
  if (n < 2) return;
  p.moveTo(P[0].x, P[0].y);
  if (n === 2) { p.lineTo(P[1].x, P[1].y); return; }
  for (let i = 0; i < n - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    p.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
  }
}

/** The first fraction k (by length) of a polyline (a stroke that draws on, never fades). */
function partial(P: V[], k: number): V[] {
  if (k >= 1) return P;
  if (k <= 0) return [];
  let total = 0;
  for (let i = 1; i < P.length; i++) total += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
  let left = total * k;
  const out: V[] = [P[0]];
  for (let i = 1; i < P.length; i++) {
    const seg = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
    if (seg <= left) { out.push(P[i]); left -= seg; continue; }
    const t = left / (seg || 1);
    out.push({ x: P[i - 1].x + (P[i].x - P[i - 1].x) * t, y: P[i - 1].y + (P[i].y - P[i - 1].y) * t });
    break;
  }
  return out;
}

/** A small spiral curl, pre-flattened to a 10-point polyline in head units. */
function curl(cx: number, cy: number, r: number, hand: number, a0 = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 10; i++) { const k = i / 9, a = a0 + hand * k * 0.75 * Math.PI * 2, rr = r * (1 - 0.8 * k); out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  return out;
}

// ---------- local outlines (head units) ----------

/** Head: a straight Greek profile (forehead and nose on one line), brow notch, lips, a spade beard, a curl cap. x: chin → crown, y: toward the face. */
export const HEAD_OUTLINE: Pt[] = (() => {
  const face: Pt[] = [[0.55, -0.02], [0.42, 0.30], [0.24, 0.43], [0.19, 0.425], [0.12, 0.475], [0.0, 0.60], [-0.05, 0.50], [-0.10, 0.49], [-0.13, 0.45], [-0.16, 0.48], [-0.22, 0.47]];
  // spade beard: 5 scallops down the front edge to a forward-down point, then back up under the jaw
  const beard: Pt[] = [];
  const bA: Pt = [-0.22, 0.47], bTip: Pt = [-0.58, 0.50];
  for (let i = 1; i <= 9; i++) {
    const k = i / 9, bump = i % 2 ? 0.05 : 0;
    beard.push([bA[0] + (bTip[0] - bA[0]) * k - bump * 0.4, bA[1] + (bTip[1] - bA[1]) * k + bump]);
  }
  beard.push([-0.52, 0.32], [-0.44, 0.18]);
  const jaw: Pt[] = [[-0.36, 0.04], [-0.34, -0.20]];
  // curl cap: 9 scallops from the nape over the crown to the forehead
  const cap: Pt[] = [];
  const c0 = -2.1, c1 = 0.05; // angles around the skull centre (rad, measured from +x toward −y)
  for (let i = 0; i <= 18; i++) {
    const k = i / 18, a = c0 + (c1 - c0) * k, rr = 0.52 + (i % 2 ? 0.06 : 0);
    cap.push([Math.cos(a) * rr * 1.0, Math.sin(a) * rr * 1.0]);
  }
  return [...face, ...beard, ...jaw, ...cap];
})();

/** Hand in the palm frame (x along the stone's surface toward "up the stone", y out of the stone; origin = palm centre). */
export const PALM_SURFACE_Y = -RIG.palm / h; // the stone's surface, in head units below the palm centre
const FINGERS: Array<{ y0: number; ang: number; len: number }> = [
  { y0: -0.03, ang: 0, len: 0.42 }, { y0: 0.01, ang: -5, len: 0.46 }, { y0: 0.05, ang: -10, len: 0.44 }, { y0: 0.09, ang: -15, len: 0.36 },
];
function lobe(x0: number, y0: number, angDeg: number, len: number, w: number): Pt[] {
  const a = (angDeg * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const pts: Pt[] = [];
  pts.push([x0 + nx * w / 2, y0 + ny * w / 2]);
  pts.push([x0 + ux * len * 0.85 + nx * w / 2, y0 + uy * len * 0.85 + ny * w / 2]);
  pts.push([x0 + ux * len, y0 + uy * len]);
  pts.push([x0 + ux * len * 0.85 - nx * w / 2, y0 + uy * len * 0.85 - ny * w / 2]);
  pts.push([x0 - nx * w / 2, y0 - ny * w / 2]);
  return pts;
}
export function handOutlines(load = 0): Pt[][] {
  const wd = 1 + 0.06 * Math.min(1, Math.max(0, load));
  const palm: Pt[] = [[-0.22 * wd, -0.08], [0.20 * wd, -0.08], [0.24 * wd, 0.0], [0.20 * wd, 0.12], [-0.04, 0.15], [-0.20 * wd, 0.12]];
  const wrist: Pt[] = [[-0.13, 0.06], [0.11, 0.08], [0.09, 0.44], [-0.10, 0.44]];
  const fingers = FINGERS.map((f) => lobe(0.17 * wd, f.y0, f.ang, f.len, 0.10));
  const thumb = lobe(-0.12, 0.0, 192, 0.30, 0.09);
  return [palm, wrist, ...fingers, thumb];
}

/** Foot in the foot frame (origin = ball, x toward the toes along the sole, y up). The toe segment has its own pitch. */
export const FOOT_OUTLINE: Pt[] = [[0.02, 0.0], [-0.30, -0.01], [-0.70, 0.0], [-0.86, 0.09], [-0.82, 0.26], [-0.66, 0.40], [-0.46, 0.45], [-0.28, 0.32], [-0.06, 0.20], [0.03, 0.12]];
export const TOE_OUTLINE: Pt[] = [[-0.02, -0.005], [0.31, 0.0], [0.36, 0.05], [0.30, 0.11], [-0.02, 0.16]];

// ---------- the detail catalogue (§6.4) ----------
export type Tier = 1 | 2 | 3;
export type Weight = 'C' | 'F' | 'V';
type FramePart = BonePart | 'head' | 'hand' | 'foot' | 'toe' | 'knee' | 'elbow' | 'cloth';
export interface DetailLine { part: FramePart; pts: Pt[]; w: Weight; tier: Tier; strain?: boolean; dot?: number }
const D = (part: FramePart, pts: Pt[], w: Weight, tier: Tier, extra: Partial<DetailLine> = {}): DetailLine => ({ part, pts, w, tier, ...extra });

export const DETAIL: DetailLine[] = [
  // torso (t hip → shoulder, y + front)
  D('torso', [[0.60, 0.78], [0.66, 0.55], [0.74, 0.25]], 'C', 1),                 // pectoral underline
  D('torso', [[0.92, 0.56], [0.96, 0.26]], 'F', 3),                               // clavicle / upper pec
  D('torso', [[0.30, 0.44], [0.56, 0.50]], 'F', 2),                               // linea alba
  ...[0.34, 0.42, 0.50].map((t) => D('torso', [[t, 0.46], [t + 0.015, 0.33], [t, 0.20]], 'F', 2)), // ab grid
  D('torso', [[0.20, 0.40], [0.30, 0.14], [0.44, -0.04]], 'C', 2),                // external oblique
  D('torso', [[0.17, 0.46], [0.11, 0.22]], 'C', 1),                               // iliac line
  ...[0.52, 0.57, 0.62].map((t) => D('torso', [[t, 0.20], [t - 0.03, 0.34]], 'F', 3)), // serratus
  D('torso', [[0.40, -0.42], [0.62, -0.56], [0.80, -0.55]], 'C', 2),              // latissimus edge
  D('torso', [[0.30, -0.40], [0.56, -0.45]], 'F', 3),                             // spine groove
  D('torso', [[0.72, -0.50], [0.80, -0.33], [0.88, -0.43]], 'F', 3),              // shoulder blade
  D('torso', [[0.92, -0.56], [1.0, -0.30]], 'C', 1),                              // trapezius into the neck
  // neck
  D('neck', [[0.0, 0.22], [1.0, -0.10]], 'F', 2),                                 // sternocleidomastoid
  D('neck', [[0.15, 0.04], [0.45, 0.10], [0.8, 0.0]], 'V', 2, { strain: true }),  // external jugular (strain)
  // upper arm
  D('upperArm', [[0.02, 0.40], [0.30, 0.34], [0.36, 0.0], [0.30, -0.30], [0.05, -0.38]], 'C', 1), // deltoid horseshoe
  D('upperArm', [[0.08, 0.0], [0.28, 0.02]], 'F', 3),                             // deltoid split
  D('upperArm', [[0.40, 0.02], [0.88, 0.04]], 'C', 1),                            // biceps–triceps
  D('upperArm', [[0.45, 0.24], [0.70, 0.27], [0.85, 0.16]], 'F', 3),              // biceps belly
  D('upperArm', [[0.50, -0.25], [0.62, -0.10], [0.78, -0.22]], 'F', 2),           // triceps horseshoe
  D('elbow', [[0.0, -0.08], [0.06, -0.14]], 'F', 3),                              // elbow point
  // forearm
  D('foreArm', [[0.04, 0.16], [0.30, 0.25], [0.62, 0.10]], 'C', 1),               // brachioradialis
  D('foreArm', [[0.62, 0.05], [0.95, 0.04]], 'F', 3), D('foreArm', [[0.66, -0.04], [0.95, -0.05]], 'F', 3), // flexor tendons
  D('foreArm', [[0.88, 0.15], [0.88, -0.15]], 'F', 2), D('foreArm', [[0.95, 0.15], [0.95, -0.15]], 'F', 2), // wrist wrap
  ...[-0.07, 0.0, 0.07].map((y) => D('foreArm', [[0.915, y]], 'F', 2, { dot: 0.022 })),
  D('foreArm', [[0.25, 0.10], [0.45, 0.14], [0.62, 0.06], [0.85, 0.08]], 'V', 2, { strain: true }), // forearm vein
  // hand (palm frame)
  ...FINGERS.map((f) => D('hand', [[0.12, f.y0 - 0.005], [0.18, f.y0 + 0.01]], 'F', 3)), // knuckle row
  D('hand', [[0.0, 0.03], [0.17, 0.02]], 'F', 1), D('hand', [[0.0, 0.09], [0.17, 0.08]], 'F', 1), // mitten lines (L1)
  // thigh
  D('thigh', [[0.12, 0.30], [0.50, 0.40], [0.80, 0.27]], 'C', 2),                 // quadriceps front
  D('thigh', [[0.76, 0.30], [0.90, 0.18], [0.84, 0.05]], 'C', 1),                 // vastus medialis teardrop
  D('thigh', [[0.20, 0.00], [0.90, 0.02]], 'F', 3),                               // IT band
  D('thigh', [[0.60, -0.30], [0.95, -0.16]], 'C', 2),                             // hamstring
  D('thigh', [[0.06, -0.50], [0.20, -0.34]], 'C', 2),                             // gluteal fold
  // knee (joint frame)
  D('knee', [[-0.09, 0.14], [0.0, 0.22], [0.09, 0.14], [0.0, 0.08], [-0.09, 0.14]], 'C', 1), // patella
  D('knee', [[0.12, 0.13], [0.22, 0.12]], 'F', 3),                                // patellar tendon
  // shin
  D('shin', [[0.08, -0.30], [0.28, -0.44], [0.55, -0.14]], 'C', 1),               // calf diamond, outer
  D('shin', [[0.12, -0.10], [0.30, -0.24], [0.48, -0.10]], 'F', 2),               // calf diamond, inner split
  D('shin', [[0.15, 0.16], [0.80, 0.10]], 'F', 3),                                // tibia edge
  D('shin', [[0.70, -0.12], [0.97, -0.12]], 'C', 1),                              // Achilles
  // foot (foot frame) and toes (toe frame)
  D('foot', [[-0.58, 0.30]], 'C', 1, { dot: 0.035 }),                            // ankle bone
  D('foot', [[-0.74, 0.06], [-0.66, 0.14]], 'F', 3),                              // heel pad
  D('foot', [[-0.50, 0.07], [-0.22, 0.08]], 'F', 3),                              // arch
  D('foot', [[-0.03, 0.04], [0.0, 0.13]], 'F', 2),                                // crease at the ball
  ...[0.04, 0.075, 0.11].map((y) => D('toe', [[0.08, y], [0.28, y - 0.01]], 'F', 2)), // toe separations
  // head (x chin → crown, y toward the face)
  D('head', [[0.07, 0.24], [0.14, 0.33], [0.21, 0.24]], 'C', 1),                  // almond eye, upper
  D('head', [[0.07, 0.24], [0.13, 0.20], [0.21, 0.24]], 'C', 1),                  // almond eye, lower
  D('head', [[0.14, 0.26]], 'C', 1, { dot: 0.05 }),                               // iris
  D('head', [[0.27, 0.40], [0.29, 0.20]], 'F', 2),                                // brow
  D('head', [[0.06, -0.04], [0.12, -0.12], [0.04, -0.20], [-0.08, -0.16], [-0.10, -0.06]], 'F', 1), // C ear
  D('head', [[0.02, -0.11], [-0.03, -0.12]], 'F', 1),                             // ear curl
  D('head', [[0.40, 0.26], [0.30, 0.04], [0.10, -0.26]], 'F', 1),                 // hairline arc
  D('head', [[0.34, 0.30], [0.22, 0.04], [0.02, -0.30]], 'F', 2), D('head', [[0.28, 0.30], [0.16, 0.06], [-0.04, -0.26]], 'F', 2), // fillet
  ...[[0.42, -0.10], [0.38, -0.24], [0.28, -0.36], [0.14, -0.44], [-0.02, -0.46], [-0.16, -0.42]].map(([x, y], i) => D('head', curl(x, y, 0.05, i % 2 ? 1 : -1), 'F', 3)), // curl row 1
  ...[[0.30, -0.16], [0.20, -0.28], [0.06, -0.34], [-0.08, -0.34], [-0.20, -0.28]].map(([x, y], i) => D('head', curl(x, y, 0.045, i % 2 ? -1 : 1), 'F', i < 5 ? 2 : 3)), // curl row 2 (the L2 row)
  ...[[0.16, -0.20], [0.02, -0.24], [-0.12, -0.24], [-0.24, -0.18]].map(([x, y], i) => D('head', curl(x, y, 0.04, i % 2 ? 1 : -1), 'F', 3)), // curl row 3
  D('head', [[-0.08, 0.47], [-0.12, 0.36]], 'F', 2),                              // moustache
  ...[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => D('head', [[-0.26 - r * 0.09, 0.45 - c * 0.045 + r * 0.02], [-0.30 - r * 0.09, 0.42 - c * 0.045 + r * 0.02], [-0.34 - r * 0.09, 0.44 - c * 0.045 + r * 0.02]], 'F', r < 2 && c < 3 ? 2 : 3))), // beard S-strokes
  D('head', [[0.32, 0.26], [0.26, 0.14]], 'V', 3, { strain: true }),             // temple vein
  // loincloth (torso frame; t below 0 = below the hip joint)
  ...Array.from({ length: 6 }, (_, i) => D('cloth', [[0.055, 0.55 - i * 0.22], [-0.005, 0.47 - i * 0.22]], 'F', 2)), // belt twist
  D('cloth', [[0.0, 0.56], [-0.08, 0.30], [-0.21, 0.10]], 'C', 1),               // front layer edge
  D('cloth', [[-0.01, 0.50], [-0.20, 0.36]], 'F', 2), D('cloth', [[-0.01, 0.46], [-0.20, 0.08]], 'F', 2), // pleats
  D('cloth', [[-0.01, 0.44], [-0.20, -0.20]], 'F', 3), D('cloth', [[-0.01, 0.40], [-0.20, -0.48]], 'F', 3),
  D('cloth', [[-0.215, 0.62], [-0.215, -0.80]], 'C', 1), D('cloth', [[-0.247, 0.62], [-0.247, -0.80]], 'C', 1), // double hem
  ...Array.from({ length: 12 }, (_, i) => D('cloth', [[-0.231, 0.55 - i * 0.12]], 'F', 3, { dot: 0.025 })), // hem dots
];

/** Lines per part, clamped inside their part's outline (inset 0.04 h) once at load: no line ever touches the edge. */
const INSET = 0.04;
for (const ln of DETAIL) {
  if (!(ln.part in STATIONS)) continue;
  const st = STATIONS[ln.part as BonePart];
  ln.pts = ln.pts.map(([t, y]) => {
    const tc = Math.min(0.97, Math.max(0.03, t));
    return [tc, Math.min(interp(st.front, tc) - INSET, Math.max(-interp(st.back, tc) + INSET, y))];
  });
}

/** Level of detail from the on-screen figure size and quality, with ±8 px hysteresis (§6.6). */
let currentTier: Tier = 3;
/** The level of detail the last figure was drawn at. */
export const figureTier = (): Tier => currentTier;
export function tierFor(Hz: number, quality: number, prev: Tier = currentTier): Tier {
  if (quality < 0.5) return 1;
  // thresholds 200 px (L3) and 130 px (L2), each with ±8 px of hysteresis
  const up3 = prev === 3 ? 192 : 208, up2 = prev >= 2 ? 122 : 138;
  const t: Tier = Hz >= up3 ? 3 : Hz >= up2 ? 2 : 1;
  return Math.min(t, quality < 0.75 ? 2 : 3) as Tier;
}

// ---------- geometry ----------
export type GroupKey = 'farLeg' | 'farArm' | 'core' | 'nearLeg' | 'cloth' | 'nearArm' | 'head';
/** Draw order, back to front. The head is last (V1): the face, beard and curls are never under the near arm. */
export const ORDER: GroupKey[] = ['farLeg', 'farArm', 'core', 'nearLeg', 'cloth', 'nearArm', 'head'];

export interface FigureGeom {
  groups: Record<GroupKey, V[][]>;
  /** Detail polylines (world) per group and weight. */
  lines: Record<GroupKey, Record<Weight, V[][]>>;
  /** Filled dots (world centre, radius in H) per group. */
  dots: Record<GroupKey, Array<[V, number]>>;
  tier: Tier;
  strokes: number;
}

function footFrames(f: FootPose, facing: number): { foot: Frame; toe: Frame } {
  const sx = f.ball.x - f.heel.x, sy = f.ball.y - f.heel.y, l = Math.hypot(sx, sy) || 1;
  const x = { x: sx / l, y: sy / l };
  const foot = axisFrame(f.ball, x, facing);
  // toes: on a lifted heel they stay flat on the ground (pushing off the ball); on a flat foot they grip (−4°)
  const tx = f.toe.x - f.ball.x, ty = f.toe.y - f.ball.y, tl = Math.hypot(tx, ty) || 1;
  let td = { x: tx / tl, y: ty / tl };
  const lifted = Math.acos(Math.max(-1, Math.min(1, td.x * x.x + td.y * x.y))) > 0.2;
  if (!lifted) { const a = -0.07 * facing; td = { x: td.x * Math.cos(a) - td.y * Math.sin(a), y: td.x * Math.sin(a) + td.y * Math.cos(a) }; }
  return { foot, toe: axisFrame(f.ball, td, facing) };
}

/** Pure geometry of one frame (world units), shared by drawing and the tests. */
export function figureGeom(fr: FigureFrame, tier: Tier = 3): FigureGeom {
  const { pose, centre, R } = fr;
  const fc = pose.facing;
  const groups: FigureGeom['groups'] = { farLeg: [], farArm: [], core: [], nearLeg: [], cloth: [], nearArm: [], head: [] };
  const mk = () => ({ C: [] as V[][], F: [] as V[][], V: [] as V[][] });
  const lines: FigureGeom['lines'] = { farLeg: mk(), farArm: mk(), core: mk(), nearLeg: mk(), cloth: mk(), nearArm: mk(), head: mk() };
  const dots: FigureGeom['dots'] = { farLeg: [], farArm: [], core: [], nearLeg: [], cloth: [], nearArm: [], head: [] };
  const veins = fr.veins ?? fr.pose.veins ?? 0;
  let strokes = 0;
  /** Emit the catalogue's lines for one part into a group. `maxTier` limits far-side detail to L1. */
  const emit = (gk: GroupKey, part: FramePart, frame: Frame, maxTier: Tier, local: 'bone' | 'hu', front = 1) => {
    for (const ln of DETAIL) {
      if (ln.part !== part || ln.tier > maxTier) continue;
      if (ln.strain && veins <= 0) continue;
      const P = ln.pts.map(([a, b]) => (local === 'bone' ? btW(frame, a, b * (b > 0 ? front : 1)) : huW(frame, a, b)));
      if (ln.dot) { dots[gk].push([P[0], ln.dot * h]); continue; }
      const Q = ln.strain ? partial(P, veins) : P;
      if (Q.length >= 2) { lines[gk][ln.w].push(Q); strokes++; }
    }
  };

  // Legs.
  (['nearLeg', 'farLeg'] as const).forEach((gk, i) => {
    const leg = pose.legs[i];
    const maxT: Tier = gk === 'nearLeg' ? tier : 1;
    const th = boneFrame(leg.root, leg.joint, fc, -1), sh = boneFrame(leg.joint, leg.end, fc, -1);
    groups[gk].push(partOutline(th.L, STATIONS.thigh).map((p) => toW(th, p)));
    groups[gk].push(partOutline(sh.L, STATIONS.shin).map((p) => toW(sh, p)));
    emit(gk, 'thigh', th, maxT, 'bone'); emit(gk, 'shin', sh, maxT, 'bone');
    const kd = { x: th.d.x + sh.d.x, y: th.d.y + sh.d.y }, kl = Math.hypot(kd.x, kd.y) || 1;
    const knee = axisFrame(leg.joint, { x: kd.x / kl, y: kd.y / kl }, -fc);
    emit(gk, 'knee', knee, maxT, 'hu');
    if (pose.feet) {
      const ff = footFrames(pose.feet[i], fc);
      groups[gk].push(FOOT_OUTLINE.map(([x, y]) => huW(ff.foot, x, y)));
      groups[gk].push(TOE_OUTLINE.map(([x, y]) => huW(ff.toe, x, y)));
      emit(gk, 'foot', ff.foot, maxT, 'hu'); emit(gk, 'toe', ff.toe, maxT, 'hu');
    }
  });

  // Core: torso, neck, head.
  const tf = boneFrame(pose.pelvis, pose.shoulder, fc, 1);
  groups.core.push(partOutline(tf.L, STATIONS.torso, pose.breath).map((p) => toW(tf, p)));
  emit('core', 'torso', tf, tier, 'bone', pose.breath);
  const hc = pose.head;
  const nf = boneFrame(pose.shoulder, { x: pose.shoulder.x + (hc.x - pose.shoulder.x) * 0.82, y: pose.shoulder.y + (hc.y - pose.shoulder.y) * 0.82 }, fc, 1);
  groups.core.push(partOutline(nf.L, STATIONS.neck).map((p) => toW(nf, p)));
  emit('core', 'neck', nf, tier, 'bone');
  const ax = pose.headAxis ?? 0;
  const hf = axisFrame(hc, { x: Math.sin(ax), y: Math.cos(ax) }, -fc);
  // the beard swings about the chin (§4.5 tertiary): beard outline points and strokes rotate with it
  const bAng = -(pose.beard ?? 0), cb = Math.cos(bAng), sbn = Math.sin(bAng);
  const beardLocal = (x: number, y: number): Pt => {
    if (!(x < -0.2 && y > 0.12) || bAng === 0) return [x, y];
    const dx = x + 0.22, dy = y - 0.47;
    return [-0.22 + dx * cb - dy * sbn, 0.47 + dx * sbn + dy * cb];
  };
  groups.head.push(HEAD_OUTLINE.map(([x, y]) => { const [bx, by] = beardLocal(x, y); return huW(hf, bx, by); }));
  const hfB: Frame = hf;
  for (const ln of DETAIL) {
    if (ln.part !== 'head' || ln.tier > tier || (ln.strain && veins <= 0)) continue;
    const P = ln.pts.map(([x, y]) => { const [bx, by] = beardLocal(x, y); return huW(hfB, bx, by); });
    if (ln.dot) { dots.head.push([P[0], ln.dot * h]); continue; }
    const Q = ln.strain ? partial(P, veins) : P;
    if (Q.length >= 2) { lines.head[ln.w].push(Q); strokes++; }
  }

  // Arms (far is index 1): upper arm + deltoid lobe, forearm, hand with fingers and thumb.
  (['nearArm', 'farArm'] as const).forEach((gk, i) => {
    const arm = pose.arms[i];
    const maxT: Tier = gk === 'nearArm' ? tier : 1;
    const ua = boneFrame(arm.root, arm.joint, fc, -1), fa = boneFrame(arm.joint, arm.end, fc, -1);
    groups[gk].push(partOutline(ua.L, STATIONS.upperArm).map((p) => toW(ua, p)));
    const delt: V[] = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; delt.push(toW(ua, { x: 0.12 * h + Math.cos(a) * 0.275 * h, y: 0.04 * h + Math.sin(a) * 0.21 * h })); }
    groups[gk].push(delt);
    groups[gk].push(partOutline(fa.L, STATIONS.foreArm).map((p) => toW(fa, p)));
    emit(gk, 'upperArm', ua, maxT, 'bone'); emit(gk, 'foreArm', fa, gk === 'nearArm' ? tier : 1, 'bone');
    const ed = { x: ua.d.x + fa.d.x, y: ua.d.y + fa.d.y }, el = Math.hypot(ed.x, ed.y) || 1;
    emit(gk, 'elbow', axisFrame(arm.joint, { x: ed.x / el, y: ed.y / el }, -fc), maxT, 'hu');
    const palm = pose.hands?.[i];
    const onStone = palm && Math.hypot(palm.x - centre.x, palm.y - centre.y) < R + 0.04;
    let hfm: Frame;
    if (palm && onStone) {
      const nx = (palm.x - centre.x) / R, ny = (palm.y - centre.y) / R;
      let tx = -ny, ty = nx;
      if (ty < 0) { tx = -tx; ty = -ty; } // fingers point up the stone
      hfm = { o: palm, d: { x: tx, y: ty }, f: { x: nx, y: ny }, L: h };
    } else {
      // free hand (summit far arm, seated): the palm frame follows the forearm
      const d = fa.d;
      hfm = { o: { x: arm.end.x + d.x * 0.05, y: arm.end.y + d.y * 0.05 }, d: { x: d.x, y: d.y }, f: { x: -fa.f.x, y: -fa.f.y }, L: h };
    }
    for (const ol of handOutlines(pose.load ?? 0)) groups[gk].push(ol.map(([x, y]) => huW(hfm, x, y)));
    emit(gk, 'hand', hfm, maxT, 'hu');
  });

  // Cloth: knotted belt, two-layer wrap with pleats and a dotted double hem; flaps and knot tails on chains.
  const tL = tf.L;
  const front = (t: number) => interp(STATIONS.torso.front, Math.max(0, t)) * pose.breath, back = (t: number) => interp(STATIONS.torso.back, Math.max(0, t));
  const belt: V[] = [];
  for (let k = 0; k <= 6; k++) { const y = -back(0.05) - 0.04 + (front(0.05) + back(0.05) + 0.08) * (k / 6); belt.push(btW(tf, 0.065 - 0.012 * (y / 0.6), y)); }
  for (let k = 6; k >= 0; k--) { const y = -back(0.0) - 0.05 + (front(0.0) + back(0.0) + 0.10) * (k / 6); belt.push(btW(tf, -0.01 - 0.012 * (y / 0.6), y)); }
  groups.cloth.push(belt);
  const wrap: V[] = [];
  const hemT = -0.6 * h / tL;
  for (let k = 0; k <= 8; k++) { const y = -back(0) - 0.08 + (front(0) + back(0) + 0.14) * (k / 8); wrap.push(btW(tf, 0.0, y)); }
  for (let k = 8; k >= 0; k--) { const yk = k / 8, y = -back(0) - 0.10 + (front(0) + back(0) + 0.16) * yk; wrap.push(btW(tf, hemT - 0.03 * Math.sin(Math.PI * yk), y)); }
  groups.cloth.push(wrap);
  const knotC = btW(tf, 0.02, front(0) + 0.05);
  const knot: V[] = [];
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; knot.push({ x: knotC.x + Math.cos(a) * 0.07 * h, y: knotC.y + Math.sin(a) * 0.05 * h }); }
  groups.cloth.push(knot);
  lines.cloth.F.push([{ x: knotC.x - 0.05 * h, y: knotC.y - 0.03 * h }, { x: knotC.x + 0.05 * h, y: knotC.y + 0.03 * h }]);
  // cloth catalogue in the torso frame, with t scaled so the hem lines land at the wrap's hem
  const scale = (-hemT) / 0.247;
  for (const ln of DETAIL) {
    if (ln.part !== 'cloth' || ln.tier > tier) continue;
    const P = ln.pts.map(([t, y]) => btW(tf, t < 0 ? t * scale : t, y * (y > 0 ? front(0) / 0.55 : back(0) / 0.74)));
    if (ln.dot) { dots.cloth.push([P[0], ln.dot * h]); continue; }
    lines.cloth[ln.w].push(P); strokes++;
  }
  if (fr.chains) {
    fr.chains.forEach((c, ci) => {
      const P = c.p;
      const tail = ci >= 2;
      const left: V[] = [], right: V[] = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], bq = P[Math.min(P.length - 1, i + 1)];
        const dx = bq.x - a.x, dy = bq.y - a.y, l = Math.hypot(dx, dy) || 1;
        const n = { x: -dy / l, y: dx / l };
        const k = i / (P.length - 1);
        const wd = (tail ? 0.06 - 0.04 * k : 0.17 - 0.13 * k) * h; // flaps taper 0.34 → 0.08 h (the spec 0.45 → 0.25 read as boxes), knot tails 0.12 → 0.04 h
        left.push({ x: P[i].x + n.x * wd, y: P[i].y + n.y * wd }); right.push({ x: P[i].x - n.x * wd, y: P[i].y - n.y * wd });
      }
      groups.cloth.push([...left, ...right.reverse()]);
      if (!tail && tier >= 2) {
        for (const off of [0.3, -0.3]) lines.cloth.F.push(P.map((p, i) => ({ x: p.x + (left[i].x - p.x) * off, y: p.y + (left[i].y - p.y) * off })).slice(1));
        strokes += 2;
      }
    });
  }
  return { groups, lines, dots, tier, strokes };
}

let layerCanvas: HTMLCanvasElement | null = null;
/** Milliseconds the last detail layer took (transform + stroke), for __sceneStats. */
export let lastDetailMs = 0;

/** Draw the figure onto the scene (screen space; `g` already has the back-buffer scale transform). */
export function drawFigureArt(g: CanvasRenderingContext2D, fr: FigureFrame, scale: number) {
  if (fr.tierFree !== false) currentTier = tierFor(fr.Hpx, fr.quality);
  const tA = performance.now();
  const geom = figureGeom(fr, currentTier);
  const S = fr.toS;
  const lw = LW(fr.Hpx);
  const wOf: Record<Weight, number> = { C: lw.contour, F: lw.fine, V: lw.vein };
  // Screen-space outlines and bbox.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const scr: Record<string, V[][]> = {};
  for (const k of ORDER) {
    scr[k] = geom.groups[k].map((pts) => pts.map((p) => { const q = S(p); if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; return q; }));
  }
  if (!Number.isFinite(x0)) return;
  const pad = 0.15 * fr.Hpx;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const ox = Math.floor(x0 * scale), oy = Math.floor(y0 * scale);
  const W = Math.ceil(x1 * scale) - ox, Hh = Math.ceil(y1 * scale) - oy;
  if (W <= 0 || Hh <= 0 || W > 8000 || Hh > 8000) return;
  if (!layerCanvas || layerCanvas.width < W || layerCanvas.height < Hh) layerCanvas = mkCanvas(Math.max(W, layerCanvas?.width ?? 0), Math.max(Hh, layerCanvas?.height ?? 0));
  const lc = layerCanvas.getContext('2d');
  if (!lc) return;
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.clearRect(0, 0, W + 2, Hh + 2);
  lc.setTransform(scale, 0, 0, scale, -ox, -oy);
  lc.lineCap = 'round'; lc.lineJoin = 'round';
  const union = new Path2D();
  let detailMs = performance.now() - tA;
  for (const k of ORDER) {
    const gp = new Path2D();
    for (const pts of scr[k]) { loopPath(gp, pts); loopPath(union, pts); }
    lc.lineWidth = 2 * lw.incise; lc.strokeStyle = INK.ochre; lc.stroke(gp);   // halo (incision on whatever is beneath)
    lc.fillStyle = INK.black; lc.fill(gp);
    const td = performance.now();
    lc.strokeStyle = INK.ochre;
    for (const wk of ['C', 'F', 'V'] as const) {
      const ls = geom.lines[k][wk];
      if (!ls.length) continue;
      const lp = new Path2D();
      for (const pl of ls) openPath(lp, pl.map(S));
      lc.lineWidth = wOf[wk]; lc.stroke(lp);
    }
    if (geom.dots[k].length) {
      const dp = new Path2D();
      for (const [c, r] of geom.dots[k]) { const q = S(c), rr = Math.max(0.8, r * fr.Hpx); dp.moveTo(q.x + rr, q.y); dp.arc(q.x, q.y, rr, 0, Math.PI * 2); }
      lc.fillStyle = INK.ochre; lc.fill(dp);
    }
    detailMs += performance.now() - td;
  }
  lastDetailMs = detailMs;
  // Keep only what is inside the silhouette (the outer halo must not show on sky).
  lc.globalCompositeOperation = 'destination-in';
  lc.fillStyle = INK.black; lc.fill(union);
  lc.globalCompositeOperation = 'source-over';

  const alpha = fr.pose.alpha;
  g.save();
  if (alpha < 1) g.globalAlpha = alpha;
  // Outer incision only where the figure lies over the stone or the slope.
  if (fr.quality > 0.5) {
    const clip = new Path2D();
    const c = S(fr.centre);
    clip.arc(c.x, c.y, fr.R * fr.Hpx, 0, Math.PI * 2);
    const tr = fr.trail;
    const a = S({ x: 0, y: 0 }), b2 = S({ x: 1, y: 0 });
    const pts: V[] = [];
    for (let sx = x0; sx <= x1 + 4; sx += 4) { const wx = (sx - a.x) / (b2.x - a.x); pts.push(S({ x: wx, y: tr.groundY(wx) })); }
    if (pts.length > 1) {
      clip.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) clip.lineTo(p.x, p.y);
      clip.lineTo(x1 + 4, y1 + 2000); clip.lineTo(x0, y1 + 2000); clip.closePath();
    }
    g.save();
    g.clip(clip);
    g.lineWidth = 2 * lw.incise; g.strokeStyle = INK.ochre; g.lineJoin = 'round';
    g.stroke(union);
    g.restore();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(layerCanvas, 0, 0, W, Hh, ox, oy, W, Hh);
  g.restore();
  g.setTransform(scale, 0, 0, scale, 0, 0);
}

export type { Limb };
export { RIG };
