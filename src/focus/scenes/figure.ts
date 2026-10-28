// Round 5 figure (ROUND5_SISYPHUS §2.2–2.8): the black-figure Sisyphus drawn from scratch. Every part is a closed
// Catmull–Rom outline in its own bone frame; its ochre linework lives in the same frame and is clipped to it, so no
// line can leave the body. Where a part overlaps black already drawn (the stone, a limb behind), its outline is first
// incised in ochre, clipped to that black, then filled. Drawing order §2.3: the head group is drawn last.
import type { V } from './path';
import { INK, clamp } from './artPalette';
import {
  BODY, BREATH_U, CURL_R, CURL_ROWS, EYE, FINGERS, FLAP, FLAP_LINES, FLAP_ROOT, FOOT, FOOT_LINES, FOREARM_LINES, FOREARM_ST,
  HEAD, HEAD_LINES, NECK_ST, PALM, PALM_LINES, RINGLETS, SHIN_LINES, SHIN_ST, SKULL, THIGH_LINES, THIGH_ST, THUMB, TORSO,
  TORSO_LINES, UPPER_ARM_LINES, UPPER_ARM_ST, WRAP, WRAP_LINES, type Anchor, type Stations, type Stroke,
} from './body';
import { fromVertical, handPoint, type HandP, type Skel } from './walk';

export interface FigureView { toS: (v: V) => V; Hpx: number; zoom: number; scale: number; quality: number; stone?: { centre: V; R: number } }

/** Figure line weights (§2.8), CSS px. */
export const FLW = (Hz: number) => ({
  I: clamp(0.0060 * Hz, 1.2, 2.0),
  C: clamp(0.0055 * Hz, 1.1, 2.0),
  F: clamp(0.0035 * Hz, 0.8, 1.3),
});

/** T1 when Hpx·zoom ≥ 230 (desktop climbing), T2 150–230 (phone, summit zoom), T3 below or at reduced quality. */
export function figureTier(Hz: number, quality: number): 1 | 2 | 3 {
  if (Hz < 150 || quality <= 0.75) return 3;
  return Hz >= 230 ? 1 : 2;
}

// ---------- geometry helpers ----------
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const unit = (a: V): V => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
const cw = (v: V): V => ({ x: v.y, y: -v.x });
const ccw = (v: V): V => ({ x: -v.y, y: v.x });
const mulV = (v: V, k: number): V => ({ x: v.x * k, y: v.y * k });

/** Densely sampled closed Catmull–Rom curve through the anchors (corners keep zero handles). */
export function crPoints(a: Anchor[], steps = 6, closed = true): V[] {
  const n = a.length, out: V[] = [];
  const P = (i: number): V => { const q = a[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))]; return { x: q[0], y: q[1] }; };
  const corner = (i: number) => !!a[((i % n) + n) % n][2];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i), p1 = P(i + 1);
    const c1 = corner(i) ? p0 : { x: p0.x + (p1.x - P(i - 1).x) / 6, y: p0.y + (p1.y - P(i - 1).y) / 6 };
    const c2 = corner(i + 1) ? p1 : { x: p1.x - (P(i + 2).x - p0.x) / 6, y: p1.y - (P(i + 2).y - p0.y) / 6 };
    for (let s = 0; s < steps; s++) {
      const t = s / steps, u = 1 - t;
      out.push({ x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x, y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y });
    }
  }
  if (!closed) out.push(P(n - 1));
  return out;
}
const area = (p: V[]) => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j].x * p[i].y - p[i].x * p[j].y); return s / 2; };
/** A closed Bézier path through anchors, in the requested winding (+1: positive area in its own frame). */
function crPath(a: Anchor[], sign: 1 | -1): Path2D {
  const pts = area(a.map((q) => ({ x: q[0], y: q[1] })));
  const an = Math.sign(pts) === sign ? a : [...a].reverse();
  const n = an.length, path = new Path2D();
  const P = (i: number): V => { const q = an[((i % n) + n) % n]; return { x: q[0], y: q[1] }; };
  const corner = (i: number) => !!an[((i % n) + n) % n][2];
  path.moveTo(an[0][0], an[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = P(i), p1 = P(i + 1);
    const c1 = corner(i) ? p0 : { x: p0.x + (p1.x - P(i - 1).x) / 6, y: p0.y + (p1.y - P(i - 1).y) / 6 };
    const c2 = corner(i + 1) ? p1 : { x: p1.x - (P(i + 2).x - p0.x) / 6, y: p1.y - (P(i + 2).y - p0.y) / 6 };
    path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p1.x, p1.y);
  }
  path.closePath();
  return path;
}
/** A limb's outline: stations along the bone (u × len), round caps at both joints. */
export function capsule(len: number, st: Stations): Anchor[] {
  const out: Anchor[] = [];
  for (const [u, p] of st) out.push([u * len, p]);
  const e = st[st.length - 1], re = (e[1] + e[2]) / 2, ce = (e[1] - e[2]) / 2;
  for (const a of [55, 0, -55]) out.push([len + re * Math.cos((a * Math.PI) / 180) * 0.95, ce + re * Math.sin((a * Math.PI) / 180)]);
  for (let i = st.length - 1; i >= 0; i--) out.push([st[i][0] * len, -st[i][2]]);
  const s = st[0], r0 = (s[1] + s[2]) / 2, c0 = (s[1] - s[2]) / 2;
  for (const a of [-125, 180, 125]) out.push([r0 * Math.cos((a * Math.PI) / 180) * 0.95, c0 + r0 * Math.sin((a * Math.PI) / 180)]);
  return out;
}

// ---------- static outlines (cached Path2D per winding) ----------
export const LOCAL_OUTLINES: Record<string, Anchor[]> = {
  thigh: capsule(BODY.thigh, THIGH_ST), shin: capsule(BODY.shin, SHIN_ST), upperArm: capsule(BODY.upperArm, UPPER_ARM_ST), foreArm: capsule(BODY.foreArm, FOREARM_ST),
  foot: FOOT, head: HEAD, torso: TORSO, wrap: WRAP, flap: FLAP, palm: PALM,
};
/** Limb linework in absolute local units (u × len). */
const absLines = (lines: Stroke[], len: number): Stroke[] => lines.map((s) => ({ ...s, p: s.p.map((x, i) => (i % 2 ? x : x * len)) }));
export const LOCAL_LINES: Record<string, Stroke[]> = {
  thigh: absLines(THIGH_LINES, BODY.thigh), shin: absLines(SHIN_LINES, BODY.shin), upperArm: absLines(UPPER_ARM_LINES, BODY.upperArm), foreArm: absLines(FOREARM_LINES, BODY.foreArm),
  foot: FOOT_LINES, head: HEAD_LINES, torso: TORSO_LINES, wrap: WRAP_LINES, flap: FLAP_LINES, palm: PALM_LINES,
};

let outlineCache: Map<string, Path2D> | null = null;
function outline(key: string, sign: 1 | -1): Path2D {
  if (!outlineCache) outlineCache = new Map();
  const k = `${key}|${sign}`;
  let p = outlineCache.get(k);
  if (!p) { p = crPath(LOCAL_OUTLINES[key], sign); outlineCache.set(k, p); }
  return p;
}

interface LinePaths { I: Path2D; C: Path2D; F: Path2D; dots: Path2D; eye?: { almond: Path2D; pupil: Path2D } }
let lineCache: Map<string, LinePaths> | null = null;
function strokesPath(list: Stroke[], tier: number): LinePaths {
  const out: LinePaths = { I: new Path2D(), C: new Path2D(), F: new Path2D(), dots: new Path2D() };
  for (const s of list) {
    if (!s.t.includes(String(tier))) continue;
    if (s.dot) { out.dots.moveTo(s.p[0] + s.dot, s.p[1]); out.dots.arc(s.p[0], s.p[1], s.dot, 0, Math.PI * 2); continue; }
    const pts: Anchor[] = [];
    for (let i = 0; i < s.p.length; i += 2) pts.push([s.p[i], s.p[i + 1]]);
    const dense = pts.length > 2 ? crPoints(pts, 5, false) : pts.map((q) => ({ x: q[0], y: q[1] }));
    const path = out[s.w];
    path.moveTo(dense[0].x, dense[0].y);
    for (const q of dense.slice(1)) path.lineTo(q.x, q.y);
  }
  return out;
}
function lines(key: string, tier: number): LinePaths {
  if (!lineCache) lineCache = new Map();
  const k = `${key}|${tier}`;
  let p = lineCache.get(k);
  if (!p) {
    p = strokesPath(LOCAL_LINES[key], tier);
    if (key === 'head') {
      // curls: rows of spirals (1¼ turns), tiers 6/5/4 · 6/5 · 6
      for (const row of CURL_ROWS) {
        if (!row.t.includes(String(tier))) continue;
        for (const [u, v] of row.pts) {
          for (let i = 0; i <= 14; i++) {
            const a = (i / 14) * 2.5 * Math.PI, r = CURL_R * (1 - (0.8 * i) / 14);
            const x = u + Math.cos(a) * r, y = v + Math.sin(a) * r;
            if (i) p.F.lineTo(x, y); else p.F.moveTo(x, y);
          }
        }
      }
      const almond = new Path2D(), pupil = new Path2D();
      const eu = EYE.u, ev = EYE.v, l = EYE.len / 2;
      almond.moveTo(eu, ev - l);
      almond.quadraticCurveTo(eu + EYE.h * 2, ev, eu, ev + l);
      almond.quadraticCurveTo(eu - EYE.h * 2, ev, eu, ev - l);
      almond.closePath();
      pupil.arc(eu, ev + 0.002, EYE.pupil, 0, Math.PI * 2);
      p.eye = { almond, pupil };
    }
    lineCache.set(k, p);
  }
  return p;
}

// ---------- frames ----------
/** A part's frame in world units: origin, u axis and v axis (front). */
interface Frame { O: V; ex: V; ev: V }
export interface Part { key: string; frame: Frame; anchors?: Anchor[] }

function frames(s: Skel) {
  const f = s.facing;
  const limb = (a: V, b: V): Frame => { const ex = unit(sub(b, a)); return { O: a, ex, ev: mulV(ccw(ex), f) }; };
  const up = (O: V, ex: V): Frame => ({ O, ex, ev: mulV(cw(ex), f) });
  const torsoEx = unit(sub(s.shoulder, s.pelvis));
  const torso = up(s.pelvis, torsoEx);
  const tw = (u: number, v: number): V => ({ x: s.pelvis.x + torso.ex.x * u + torso.ev.x * v, y: s.pelvis.y + torso.ex.y * u + torso.ev.y * v });
  const hang = (root: V, a: number): Frame => { const ex = { x: Math.sin(a) * f, y: -Math.cos(a) }; return { O: root, ex, ev: mulV(ccw(ex), f) }; };
  const headEx = fromVertical(s.headAxis, f);
  const head = up(s.head, headEx);
  const hw = (u: number, v: number): V => ({ x: s.head.x + head.ex.x * u + head.ev.x * v, y: s.head.y + head.ex.y * u + head.ev.y * v });
  const foot = (i: 0 | 1): Frame => { const ft = s.feet[i]; const ex = { x: Math.cos(ft.ang) * f, y: Math.sin(ft.ang) * f }; return { O: ft.ball, ex, ev: mulV(ccw(ex), f) }; };
  return {
    torso, head, hw, tw,
    thigh: [limb(s.legs[0].hip, s.legs[0].knee), limb(s.legs[1].hip, s.legs[1].knee)],
    shin: [limb(s.legs[0].knee, s.legs[0].ankle), limb(s.legs[1].knee, s.legs[1].ankle)],
    foot: [foot(0), foot(1)],
    upperArm: [limb(s.arms[0].shoulder, s.arms[0].elbow), limb(s.arms[1].shoulder, s.arms[1].elbow)],
    foreArm: [limb(s.arms[0].elbow, s.arms[0].wrist), limb(s.arms[1].elbow, s.arms[1].wrist)],
    neck: up(s.neck, unit(sub(s.head, s.neck))),
    flapF: hang(tw(...FLAP_ROOT.front), s.sec.flapF),
    flapB: hang(tw(...FLAP_ROOT.back), -s.sec.flapB),
    ringlets: RINGLETS.map(([u, v], i) => hang(hw(u, v), s.sec.ringlet * (1 + 0.25 * i))),
  };
}

/** The torso outline this frame: the breath swells the chest's front stations, the pelvis pitch tips the hips. */
function torsoAnchors(s: Skel): Anchor[] {
  return TORSO.map(([u, v, c]) => {
    let uu = u, vv = v;
    if (v > 0 && u >= BREATH_U[0] && u <= BREATH_U[1]) vv = v * s.breath;
    if (u < 0.08) { const a = s.pelvisPitch * (1 - Math.max(0, u) / 0.08); uu = u * Math.cos(a) - vv * Math.sin(a); vv = u * Math.sin(a) + vv * Math.cos(a); }
    return [uu, vv, c] as Anchor;
  });
}
const NECK_LEN_REF = 0.075;
const neckAnchors = (len: number) => capsule(len, NECK_ST);
/** The hair mass (head frame): the skull line overhung by 0.006 with 7 curl bumps, closed inside the head. */
function hairAnchors(): Anchor[] {
  const dense = crPoints(SKULL.map(([u, v]) => [u, v] as Anchor), 8, false);
  const out: Anchor[] = [];
  const n = dense.length;
  for (let i = 0; i < n; i++) {
    const a = dense[Math.max(0, i - 1)], b = dense[Math.min(n - 1, i + 1)];
    const t = unit(sub(b, a)), nrm = { x: t.y, y: -t.x }; // outward: the skull runs front → back over the crown
    const k = i / (n - 1), bump = 0.004 * Math.abs(Math.sin(k * 7 * Math.PI));
    const off = 0.006 + bump;
    out.push([dense[i].x + nrm.x * off, dense[i].y + nrm.y * off]);
  }
  out.push([-0.030, -0.030], [0.000, -0.004], [0.026, 0.020]);
  return out;
}
const RINGLET: Anchor[] = [[0, -0.005], [0.010, -0.0055], [0.018, -0.0035], [0.022, 0], [0.018, 0.0035], [0.010, 0.0055], [0, 0.005]];

/** Hand shapes in world units (palm, thumb, four fingers), bent round the stone. */
export function handShapes(h: HandP, facing: 1 | -1): Array<{ key: string; pts: V[] }> {
  const W = (x: number, y: number) => handPoint(h, { x, y }, facing);
  const loz = (x0: number, y0: number, len: number, w0: number, w1: number, dirDeg = 0): V[] => {
    const c = Math.cos((dirDeg * Math.PI) / 180), sn = Math.sin((dirDeg * Math.PI) / 180);
    const P = (a: number, b: number) => W(x0 + a * c - b * sn, y0 + a * sn + b * c);
    const half = (w0 - w1) / 2;
    const pts: Anchor[] = [[0, 0], [len * 0.5, 0.0008], [len - w1 * 0.6, half], [len, w0 / 2], [len - w1 * 0.6, w0 - half], [len * 0.5, w0 - 0.0008], [0, w0]];
    return crPoints(pts, 4).map((q) => P(q.x, q.y));
  };
  const out = [{ key: 'palm', pts: crPoints(PALM, 4).map((q) => W(q.x, q.y)) }];
  out.push({ key: 'thumb', pts: loz(THUMB.base.x, THUMB.base.y - THUMB.w0 / 2, THUMB.len, THUMB.w0, THUMB.w1, THUMB.spread) });
  FINGERS.forEach(([x0, len, y0, w0], i) => out.push({ key: `finger${i}`, pts: loz(x0, y0, len, w0, Math.min(w0, 0.008) * (i === 0 ? 0.8 : 1)) }));
  return out;
}

// ---------- drawing ----------
const DM = () => (globalThis as { DOMMatrix?: new (m: number[]) => DOMMatrix }).DOMMatrix;

export function drawFigure(g: CanvasRenderingContext2D, s: Skel, view: FigureView): void {
  const k = view.Hpx * view.zoom, sc = view.scale;
  const tier = figureTier(k, view.quality);
  const lw = FLW(k);
  const fr = frames(s);
  const DMatrix = DM();
  const union = new Path2D();
  g.lineCap = 'round'; g.lineJoin = 'round';

  const matrix = (F: Frame): [number, number, number, number, number, number] => {
    const o = view.toS(F.O);
    return [F.ex.x * k * sc, -F.ex.y * k * sc, F.ev.x * k * sc, -F.ev.y * k * sc, o.x * sc, o.y * sc];
  };
  const addUnion = (p: Path2D, m: number[]) => { if (DMatrix) union.addPath(p, new DMatrix(m)); };
  /** Incise (clipped to the black beneath), fill, then the part's own linework clipped to it. */
  const draw = (path: Path2D, m: [number, number, number, number, number, number], detail: LinePaths | null, halo = true) => {
    if (halo && DMatrix) {
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clip(union);
      g.setTransform(...m); g.lineWidth = (2 * lw.I) / k; g.strokeStyle = INK.ochre; g.stroke(path);
      g.restore();
    }
    g.setTransform(...m); g.fillStyle = INK.black; g.fill(path);
    if (detail) {
      g.save(); g.clip(path);
      g.strokeStyle = INK.ochre;
      g.lineWidth = lw.I / k; g.stroke(detail.I);
      g.lineWidth = lw.C / k; g.stroke(detail.C);
      g.lineWidth = lw.F / k; g.stroke(detail.F);
      g.fillStyle = INK.ochre; g.fill(detail.dots);
      if (detail.eye) { g.fill(detail.eye.almond); g.fillStyle = INK.black; g.fill(detail.eye.pupil); }
      g.restore();
    }
    addUnion(path, m);
  };
  const sign = (m: number[]): 1 | -1 => (m[0] * m[3] - m[1] * m[2] > 0 ? 1 : -1);
  const cached = (key: string, F: Frame, withLines = true) => { const m = matrix(F); draw(outline(key, sign(m)), m, withLines ? lines(key, tier) : null); };
  const dynamic = (a: Anchor[], F: Frame, detail: LinePaths | null) => { const m = matrix(F); draw(crPath(a, sign(m)), m, detail); };
  const world: Frame = { O: { x: 0, y: 0 }, ex: { x: 1, y: 0 }, ev: { x: 0, y: 1 } };

  // 1–2: the stone is already drawn; it joins the black that incisions may cut into
  if (view.stone) {
    const R = view.stone.R, poly: Anchor[] = [];
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; poly.push([Math.cos(a) * R, Math.sin(a) * R]); }
    const m = matrix({ O: view.stone.centre, ex: { x: 1, y: 0 }, ev: { x: 0, y: 1 } });
    addUnion(crPath(poly, sign(m)), m);
  }
  const hand = (i: 0 | 1) => {
    const m = matrix(world);
    for (const sh of handShapes(s.hands[i], s.facing)) {
      const path = new Path2D();
      const pts = Math.sign(area(sh.pts)) === sign(m) ? sh.pts : [...sh.pts].reverse();
      path.moveTo(pts[0].x, pts[0].y); for (const q of pts.slice(1)) path.lineTo(q.x, q.y); path.closePath();
      let detail: LinePaths | null = null;
      if (sh.key === 'palm' && tier <= 2) {
        // palm linework in the hand's own frame, bent with it
        const d: LinePaths = { I: new Path2D(), C: new Path2D(), F: new Path2D(), dots: new Path2D() };
        for (const st of PALM_LINES) {
          if (!st.t.includes(String(tier))) continue;
          for (let j = 0; j < st.p.length; j += 2) { const q = handPoint(s.hands[i], { x: st.p[j], y: st.p[j + 1] }, s.facing); if (j) d.F.lineTo(q.x, q.y); else d.F.moveTo(q.x, q.y); }
        }
        detail = d;
      }
      if (sh.key.startsWith('finger') && tier === 1) {
        // a nail tick near each fingertip, on the back of the finger
        const [x0, len, y0, w0] = FINGERS[Number(sh.key.slice(6))];
        const d: LinePaths = { I: new Path2D(), C: new Path2D(), F: new Path2D(), dots: new Path2D() };
        const q0 = handPoint(s.hands[i], { x: x0 + len - 0.012, y: y0 + w0 * 0.75 }, s.facing), q1 = handPoint(s.hands[i], { x: x0 + len - 0.004, y: y0 + w0 * 0.55 }, s.facing);
        d.F.moveTo(q0.x, q0.y); d.F.lineTo(q1.x, q1.y);
        detail = d;
      }
      draw(path, m, detail);
    }
  };
  const leg = (i: 0 | 1) => { cached('thigh', fr.thigh[i]); cached('shin', fr.shin[i]); cached('foot', fr.foot[i]); };
  const arm = (i: 0 | 1) => { cached('upperArm', fr.upperArm[i]); cached('foreArm', fr.foreArm[i]); hand(i); };

  // 3–4: far leg, far arm and hand
  leg(1);
  arm(1);
  // 5: torso, then the loincloth's back flap
  dynamic(torsoAnchors(s), fr.torso, lines('torso', tier));
  cached('flap', fr.flapB);
  // 6: near leg
  leg(0);
  // 7: the wrap and its front flap
  cached('wrap', fr.torso);
  cached('flap', fr.flapF);
  // 8: near arm and hand
  arm(0);
  // 9: the head group, last: neck, ringlets, hair, head (beard, eye, fillet, curls)
  const nl = Math.hypot(s.head.x - s.neck.x, s.head.y - s.neck.y) || NECK_LEN_REF;
  dynamic(neckAnchors(nl), fr.neck, null);
  if (tier <= 2) fr.ringlets.forEach((F) => dynamic(RINGLET, F, null));
  dynamic(hairAnchors(), fr.head, null);
  cached('head', fr.head);
  g.setTransform(sc, 0, 0, sc, 0, 0);
}

/** Drawing order (for the tests): the head group is last. */
export const ORDER = ['farLeg', 'farArm', 'farHand', 'torso', 'backFlap', 'nearLeg', 'wrap', 'frontFlap', 'nearArm', 'nearHand', 'neck', 'ringlets', 'hair', 'head'] as const;

// ---------- world geometry for the tests ----------
const toWorld = (F: Frame, a: Anchor[], steps = 4): V[] =>
  crPoints(a, steps).map((q) => ({ x: F.O.x + F.ex.x * q.x + F.ev.x * q.y, y: F.O.y + F.ex.y * q.x + F.ev.y * q.y }));
/** World polygons of the face's landmarks and of the near arm (upper arm, forearm, hand shapes). */
export function figureGeometry(s: Skel): { face: V[]; nearArm: V[][]; head: V[]; silhouette: V[][] } {
  const fr = frames(s);
  const face = [[0.018, 0.058], [EYE.u, EYE.v], [-0.012, 0.073], [-0.027, 0.060], [-0.031, 0.054]].map(([u, v]) => fr.hw(u, v));
  const nearArm = [toWorld(fr.upperArm[0], LOCAL_OUTLINES.upperArm), toWorld(fr.foreArm[0], LOCAL_OUTLINES.foreArm), ...handShapes(s.hands[0], s.facing).map((h) => h.pts)];
  const head = toWorld(fr.head, HEAD);
  const silhouette = [
    head, toWorld(fr.torso, torsoAnchors(s)), toWorld(fr.neck, neckAnchors(Math.hypot(s.head.x - s.neck.x, s.head.y - s.neck.y))), toWorld(fr.head, hairAnchors()),
    ...[0, 1].flatMap((i) => [toWorld(fr.thigh[i], LOCAL_OUTLINES.thigh), toWorld(fr.shin[i], LOCAL_OUTLINES.shin), toWorld(fr.foot[i], FOOT), toWorld(fr.upperArm[i], LOCAL_OUTLINES.upperArm), toWorld(fr.foreArm[i], LOCAL_OUTLINES.foreArm), ...handShapes(s.hands[i], s.facing).map((h) => h.pts)]),
    toWorld(fr.torso, WRAP), toWorld(fr.flapF, FLAP), toWorld(fr.flapB, FLAP),
  ];
  return { face, nearArm, head, silhouette };
}
