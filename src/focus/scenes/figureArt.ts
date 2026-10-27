// Black-figure Sisyphus drawing (ROUND3_ART §3.2–3.5): parts as smooth closed outlines built in bone space from the
// §3.1 stations, grouped (far leg, far arm, core, near leg, cloth, near arm) and filled flat black; ochre contour lines
// ride in each part's local frame; black-on-black overlaps get an ochre incision; the outer halo shows only over the
// stone and the slope.
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
}

const h = 1 / 8; // head unit in H
type St = Array<[number, number]>; // [t, half-depth in h]

/** §3.1 stations: [front, back] half-depths (head units) along each bone. */
export const STATIONS: Record<string, { front: St; back: St }> = {
  torso: { front: [[0, 0.55], [0.35, 0.45], [0.7, 0.72], [0.9, 0.62], [1, 0.45]], back: [[0, 0.70], [0.3, 0.45], [0.5, 0.52], [0.7, 0.64], [0.95, 0.60], [1, 0.40]] },
  neck: { front: [[0, 0.30], [1, 0.28]], back: [[0, 0.50], [0.5, 0.36], [1, 0.30]] },
  upperArm: { front: [[0, 0.36], [0.1, 0.44], [0.55, 0.30], [1, 0.18]], back: [[0, 0.34], [0.1, 0.36], [0.4, 0.32], [1, 0.18]] },
  foreArm: { front: [[0, 0.18], [0.25, 0.27], [1, 0.14]], back: [[0, 0.18], [0.25, 0.25], [1, 0.14]] },
  thigh: { front: [[0, 0.40], [0.3, 0.46], [1, 0.26]], back: [[0, 0.46], [0.15, 0.48], [1, 0.26]] },
  shin: { front: [[0, 0.24], [0.08, 0.26], [0.25, 0.18], [1, 0.13]], back: [[0, 0.26], [0.25, 0.42], [0.6, 0.26], [1, 0.14]] },
};

function interp(st: St, t: number): number {
  if (t <= st[0][0]) return st[0][1];
  for (let i = 1; i < st.length; i++) if (t <= st[i][0]) { const a = st[i - 1], b = st[i]; const k = (t - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * (k * k * (3 - 2 * k)); }
  return st[st.length - 1][1];
}

/** Capsule outline in bone-local coordinates (x along the bone in H, y toward the front in H). */
export function partOutline(L: number, s: { front: St; back: St }, frontK = 1, capP = true): V[] {
  const ts = [0, 0.1, 0.2, 0.3, 0.42, 0.55, 0.7, 0.85, 1];
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
const toW = (fr: Frame, p: V): V => ({ x: fr.o.x + fr.d.x * p.x + fr.f.x * p.y, y: fr.o.y + fr.d.y * p.x + fr.f.y * p.y });

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

function spiral(p: Path2D, c: V, r: number, turns: number, a0: number, dir: number) {
  const n = Math.max(8, Math.round(turns * 18));
  for (let i = 0; i <= n; i++) {
    const k = i / n, a = a0 + dir * k * turns * Math.PI * 2, rr = r * (1 - k * 0.85);
    const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr;
    if (i) p.lineTo(x, y); else p.moveTo(x, y);
  }
}

/** Head outline in head-local coordinates (x: chin → crown, y: toward the face), in head units. */
function headLocal(): { outline: V[]; curls: V[]; beard: V[] } {
  const face: V[] = [[0.5, 0.02], [0.4, 0.3], [0.2, 0.43], [0.06, 0.55], [-0.02, 0.46], [-0.12, 0.45], [-0.2, 0.47]].map(([x, y]) => ({ x, y }));
  const beardPts: V[] = [];
  const bA = { x: -0.2, y: 0.47 }, bB = { x: -0.56, y: 0.02 };
  for (let i = 1; i <= 8; i++) {
    const k = i / 8, out = i % 2 ? 0.09 : 0;
    const base = { x: bA.x + (bB.x - bA.x) * k - 0.1 * Math.sin(Math.PI * k), y: bA.y + (bB.y - bA.y) * k + 0.08 * Math.sin(Math.PI * k) };
    beardPts.push({ x: base.x - out * 0.7, y: base.y + out * 0.7 });
  }
  const jaw: V[] = [{ x: -0.45, y: -0.16 }];
  // curls cap: nape → crown → forehead, scalloped (alternate outward bumps)
  const cA: V[] = [{ x: -0.32, y: -0.42 }, { x: -0.1, y: -0.52 }, { x: 0.12, y: -0.5 }, { x: 0.32, y: -0.38 }, { x: 0.48, y: -0.16 }, { x: 0.56, y: 0.06 }, { x: 0.46, y: 0.26 }];
  const curls: V[] = [];
  for (let i = 0; i < cA.length - 1; i++) {
    const a = cA[i], b = cA[i + 1];
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const l = Math.hypot(m.x, m.y) || 1;
    curls.push(a, { x: m.x + (m.x / l) * 0.075, y: m.y + (m.y / l) * 0.075 });
  }
  curls.push(cA[cA.length - 1]);
  const outline = [...face.slice(1), ...beardPts, ...jaw, ...curls];
  return { outline, curls: cA, beard: beardPts };
}
const HEAD = headLocal();

/** All the figure's outlines in world space, by group, plus contour polylines per group (world). */
export interface FigureGeom {
  groups: Record<'farLeg' | 'farArm' | 'core' | 'nearLeg' | 'cloth' | 'nearArm', V[][]>;
  lines: Record<'farLeg' | 'farArm' | 'core' | 'nearLeg' | 'cloth' | 'nearArm', V[][]>;
  dots: V[];
  /** Spirals as [centre, radius, turns, a0, dir] in world (H). */
  spirals: Array<[V, number, number, number, number]>;
}

function footOutline(f: FootPose, facing: number): V[] {
  const sx = f.toe.x - f.heel.x, sy = f.toe.y - f.heel.y, l = Math.hypot(sx, sy) || 1;
  const sv = { x: sx / l, y: sy / l }, n = { x: -sv.y * facing, y: sv.x * facing };
  const P = (b: V, a: number, c: number): V => ({ x: b.x + sv.x * a + n.x * c, y: b.y + sv.y * a + n.y * c });
  return [
    P(f.heel, -0.012, 0.0), P(f.heel, -0.024, 0.018), P(f.ankle, -0.026, 0.012), P(f.ankle, -0.006, 0.03),
    P(f.ankle, 0.03, 0.006), P(f.ball, -0.035, 0.03), P(f.toe, -0.012, 0.022), P(f.toe, 0.004, 0.008), P(f.toe, 0, 0),
    P(f.ball, 0, -0.001), P(f.heel, 0.03, -0.001),
  ];
}

function handOutline(arm: Limb, palm: V | undefined, centre: V, R: number, load: number): { pts: V[]; lines: V[][] } {
  const wrist = arm.end;
  const onStone = palm && Math.hypot(palm.x - centre.x, palm.y - centre.y) < R + 0.04;
  if (onStone && palm) {
    const nx = (palm.x - centre.x) / R, ny = (palm.y - centre.y) / R;
    let t = { x: -ny, y: nx };
    if (t.y < 0) t = { x: -t.x, y: -t.y }; // fingers point up the stone
    const wd = 1 + 0.08 * Math.min(1, Math.max(0, load));
    const P = (a: number, c: number): V => ({ x: palm.x + t.x * a * wd + nx * c, y: palm.y + t.y * a * wd + ny * c });
    const pts = [P(-0.035, -0.011), P(0.04, -0.012), P(0.072, -0.008), P(0.08, 0.0), P(0.06, 0.012), P(0.02, 0.018), { x: wrist.x + t.x * 0.016, y: wrist.y + t.y * 0.016 }, { x: wrist.x - t.x * 0.016, y: wrist.y - t.y * 0.016 }, P(-0.045, 0.006)];
    const lines = [0, 1, 2].map((i) => [P(0.045 + i * 0.002, -0.004 + i * 0.0045), P(0.072, -0.004 + i * 0.0045)]);
    return { pts, lines };
  }
  // Free hand: a closed paddle along the forearm direction.
  const dx = arm.end.x - arm.joint.x, dy = arm.end.y - arm.joint.y, l = Math.hypot(dx, dy) || 1;
  const d = { x: dx / l, y: dy / l }, n = { x: -d.y, y: d.x };
  const P = (a: number, c: number): V => ({ x: wrist.x + d.x * a + n.x * c, y: wrist.y + d.y * a + n.y * c });
  return { pts: [P(-0.01, -0.017), P(0.05, -0.022), P(0.085, -0.01), P(0.085, 0.012), P(0.05, 0.022), P(-0.01, 0.017)], lines: [] };
}

/** Pure geometry of one frame (world units), shared by drawing and the acceptance tests. */
export function figureGeom(fr: FigureFrame): FigureGeom {
  const { pose, centre, R } = fr;
  const fc = pose.facing;
  const groups: FigureGeom['groups'] = { farLeg: [], farArm: [], core: [], nearLeg: [], cloth: [], nearArm: [] };
  const lines: FigureGeom['lines'] = { farLeg: [], farArm: [], core: [], nearLeg: [], cloth: [], nearArm: [] };
  const dots: V[] = [];
  const spirals: FigureGeom['spirals'] = [];
  const far = fr.quality > 0.5;
  const L = (fm: Frame, pts: Array<[number, number]>): V[] => pts.map(([t, y]) => toW(fm, { x: t * fm.L, y: y * h }));

  // Legs.
  (['nearLeg', 'farLeg'] as const).forEach((gk, i) => {
    const leg = pose.legs[i];
    const th = boneFrame(leg.root, leg.joint, fc, -1), sh = boneFrame(leg.joint, leg.end, fc, -1);
    groups[gk].push(partOutline(th.L, STATIONS.thigh).map((p) => toW(th, p)));
    groups[gk].push(partOutline(sh.L, STATIONS.shin).map((p) => toW(sh, p)));
    if (pose.feet) groups[gk].push(footOutline(pose.feet[i], fc));
    const ln = lines[gk];
    ln.push(L(sh, [[-0.03, 0.18], [0.03, 0.27], [0.1, 0.17]]));                  // patella
    ln.push(L(sh, [[0.14, -0.26], [0.3, -0.22], [0.52, -0.1]]));                  // calf split
    if (gk === 'nearLeg' || far) {
      ln.push(L(th, [[0.25, 0.26], [0.55, 0.3], [0.85, 0.16]]));                  // vastus lateralis
      ln.push(L(th, [[0.68, -0.22], [0.95, -0.14]]));                             // hamstring
      ln.push(L(sh, [[0.74, -0.1], [0.95, -0.11]]));                              // Achilles
      if (pose.feet) {
        const f = pose.feet[i];
        dots.push({ x: f.ankle.x, y: f.ankle.y });
        ln.push([{ x: f.ball.x + (f.toe.x - f.ball.x) * 0.1, y: f.ball.y + (f.toe.y - f.ball.y) * 0.1 + 0.004 }, { x: f.ball.x + (f.toe.x - f.ball.x) * 0.15, y: f.ball.y + 0.02 }]);
      }
    }
  });

  // Core: torso, neck, head.
  const tf = boneFrame(pose.pelvis, pose.shoulder, fc, 1);
  groups.core.push(partOutline(tf.L, STATIONS.torso, pose.breath).map((p) => toW(tf, p)));
  const hc = pose.head;
  const nf = boneFrame(pose.shoulder, { x: pose.shoulder.x + (hc.x - pose.shoulder.x) * 0.82, y: pose.shoulder.y + (hc.y - pose.shoulder.y) * 0.82 }, fc, 1);
  groups.core.push(partOutline(nf.L, STATIONS.neck).map((p) => toW(nf, p)));
  const ax = pose.headAxis ?? 0;
  const up = { x: Math.sin(ax), y: Math.cos(ax) }, face = { x: up.y * fc, y: -up.x * fc };
  const HW = (p: V): V => ({ x: hc.x + (up.x * p.x + face.x * p.y) * h, y: hc.y + (up.y * p.x + face.y * p.y) * h });
  groups.core.push(HEAD.outline.map(HW));
  const b = pose.breath;
  lines.core.push(L(tf, [[0.56, 0.6 * b], [0.6, 0.32], [0.7, 0.08]]));            // pectoral underline
  lines.core.push(L(tf, [[0.3, 0.4 * b], [0.48, 0.42 * b]]));                     // linea alba
  for (const t of [0.3, 0.38, 0.46]) lines.core.push(L(tf, [[t, 0.44 * b], [t + 0.012, 0.32], [t, 0.22]])); // ab arcs
  lines.core.push(L(tf, [[0.6, 0.14], [0.56, 0.24]]), L(tf, [[0.53, 0.1], [0.5, 0.2]])); // serratus ticks
  lines.core.push(L(tf, [[0.16, 0.42], [0.06, 0.24]]));                           // inguinal V
  // head details
  const eyeC = HW({ x: 0.1, y: 0.3 });
  const eL = 0.11 * h;
  const ea = { x: face.x * eL, y: face.y * eL }, eu = { x: up.x * 0.045 * h, y: up.y * 0.045 * h };
  lines.core.push([{ x: eyeC.x - ea.x, y: eyeC.y - ea.y }, { x: eyeC.x + eu.x, y: eyeC.y + eu.y }, { x: eyeC.x + ea.x, y: eyeC.y + ea.y }]);
  lines.core.push([{ x: eyeC.x - ea.x, y: eyeC.y - ea.y }, { x: eyeC.x - eu.x, y: eyeC.y - eu.y }, { x: eyeC.x + ea.x, y: eyeC.y + ea.y }]);
  if (pose.facing === 1) dots.push(eyeC);
  spirals.push([HW({ x: -0.02, y: -0.08 }), 0.07 * h, 1, 0, 1]);                // ear
  lines.core.push([HW({ x: 0.38, y: 0.22 }), HW({ x: 0.22, y: 0.0 }), HW({ x: -0.02, y: -0.22 }), HW({ x: -0.25, y: -0.3 })]); // hairline
  [[0.3, -0.3], [0.1, -0.36], [-0.12, -0.38], [0.42, -0.06], [0.42, 0.14]].forEach(([x, y], i) => spirals.push([HW({ x, y }), 0.05 * h, 0.75, i, i % 2 ? 1 : -1]));
  for (let i = 0; i < 3; i++) lines.core.push([HW({ x: -0.24 - i * 0.08, y: 0.38 - i * 0.05 }), HW({ x: -0.36 - i * 0.08, y: 0.3 - i * 0.07 })]);

  // Arms (far is index 1).
  (['nearArm', 'farArm'] as const).forEach((gk, i) => {
    const arm = pose.arms[i];
    const ua = boneFrame(arm.root, arm.joint, fc, -1), fa = boneFrame(arm.joint, arm.end, fc, -1);
    groups[gk].push(partOutline(ua.L, STATIONS.upperArm).map((p) => toW(ua, p)));
    groups[gk].push(partOutline(fa.L, STATIONS.foreArm).map((p) => toW(fa, p)));
    const hand = handOutline(arm, pose.hands?.[i], centre, R, pose.load ?? 0);
    groups[gk].push(hand.pts);
    if (gk === 'nearArm' || far) {
      lines[gk].push(L(ua, [[0.02, 0.32], [0.28, 0.3], [0.34, 0.0], [0.08, -0.28]])); // deltoid
      lines[gk].push(L(ua, [[0.42, 0.02], [0.86, 0.03]]));                          // biceps–triceps
      lines[gk].push(L(fa, [[0.06, 0.14], [0.34, 0.2], [0.6, 0.11]]));              // brachioradialis
      lines[gk].push(...hand.lines);
    }
  });

  // Cloth: wrap + two flaps.
  const wrapT0 = -0.069 / tf.L, wrapT1 = 0.05;
  const wrap: V[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) { const k = i / steps; const y = (-0.78 + 1.42 * k) * h; wrap.push(toW(tf, { x: (wrapT1 - 0.04 * k * k) * tf.L, y })); }
  for (let i = steps; i >= 0; i--) { const k = i / steps; const y = (-0.78 + 1.42 * k) * h; wrap.push(toW(tf, { x: (wrapT0 + 0.03 * Math.sin(Math.PI * k)) * tf.L, y: y * 1.02 })); }
  groups.cloth.push(wrap);
  const knot = toW(tf, { x: (wrapT1 - 0.03) * tf.L, y: 0.55 * h });
  for (let i = 0; i < 3; i++) lines.cloth.push([knot, toW(tf, { x: (wrapT0 + 0.15 + 0.05 * i) * tf.L, y: (0.1 - 0.35 * i) * h })]);
  lines.cloth.push(
    [toW(tf, { x: (wrapT0 + 0.03) * tf.L, y: 0.62 * h }), toW(tf, { x: (wrapT0 + 0.03) * tf.L, y: -0.76 * h })],
    [toW(tf, { x: (wrapT0 + 0.08) * tf.L, y: 0.62 * h }), toW(tf, { x: (wrapT0 + 0.08) * tf.L, y: -0.76 * h })],
  );
  if (fr.chains) {
    for (const c of fr.chains) {
      const P = c.p;
      const left: V[] = [], right: V[] = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], bq = P[Math.min(P.length - 1, i + 1)];
        const dx = bq.x - a.x, dy = bq.y - a.y, l = Math.hypot(dx, dy) || 1;
        const n = { x: -dy / l, y: dx / l };
        const wd = (0.17 - 0.08 * (i / (P.length - 1))) * h;
        left.push({ x: P[i].x + n.x * wd, y: P[i].y + n.y * wd }); right.push({ x: P[i].x - n.x * wd, y: P[i].y - n.y * wd });
      }
      groups.cloth.push([...left, ...right.reverse()]);
      const mid = P.map((p, i) => ({ x: p.x + (left[i].x - p.x) * 0.35, y: p.y + (left[i].y - p.y) * 0.35 }));
      lines.cloth.push(mid.slice(1));
    }
  }
  return { groups, lines, dots, spirals };
}

let layerCanvas: HTMLCanvasElement | null = null;

/** Draw the figure onto the scene (screen space; `g` already has the back-buffer scale transform). */
export function drawFigureArt(g: CanvasRenderingContext2D, fr: FigureFrame, scale: number) {
  const geom = figureGeom(fr);
  const S = fr.toS;
  const lw = LW(fr.Hpx);
  const order = ['farLeg', 'farArm', 'core', 'nearLeg', 'cloth', 'nearArm'] as const;
  // Screen-space outlines and bbox.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const scr: Record<string, V[][]> = {};
  for (const k of order) {
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
  for (const k of order) {
    const gp = new Path2D();
    for (const pts of scr[k]) { loopPath(gp, pts); loopPath(union, pts); }
    lc.lineWidth = 2 * lw.incise; lc.strokeStyle = INK.ochre; lc.stroke(gp);   // halo (incision on whatever is beneath)
    lc.fillStyle = INK.black; lc.fill(gp);
    const lp = new Path2D();
    for (const pl of geom.lines[k]) openPath(lp, pl.map(S));
    if (k === 'core') {
      for (const [c, r, turns, a0, dir] of geom.spirals) spiral(lp, S(c), r * fr.Hpx, turns, a0, dir);
    }
    lc.lineWidth = lw.contour; lc.strokeStyle = INK.ochre; lc.stroke(lp);
  }
  // ankle bones + eye dot
  lc.fillStyle = INK.ochre;
  for (const d of geom.dots) { const q = S(d); lc.beginPath(); lc.arc(q.x, q.y, Math.max(0.9, 0.035 * h * fr.Hpx), 0, Math.PI * 2); lc.fill(); }
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
    const wx0 = x0, wx1 = x1;
    const pts: V[] = [];
    for (let sx = wx0; sx <= wx1 + 4; sx += 4) {
      // invert the screen x to a world x via two probes of the transform
      const a = S({ x: 0, y: 0 }), b2 = S({ x: 1, y: 0 });
      const wxw = (sx - a.x) / (b2.x - a.x);
      pts.push(S({ x: wxw, y: tr.groundY(wxw) }));
    }
    if (pts.length > 1) {
      clip.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) clip.lineTo(p.x, p.y);
      clip.lineTo(wx1 + 4, y1 + 2000); clip.lineTo(wx0, y1 + 2000); clip.closePath();
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

export { RIG };
