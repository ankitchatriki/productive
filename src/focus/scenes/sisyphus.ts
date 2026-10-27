// "Sisyphus" focus scene, black-figure edition (ROUND3_ART): a tracking close-up of a figure pushing a stone up an
// endless incline. Flat fills and thin ochre lines; the summit appears only when a block completes.
import type { ClimbInput, SceneEngine, SceneInitOptions, ScenePhase } from './types';
import { INK, LW, NIGHT, PREDAWN_BAND, artStop, mixOk, mixStop, pausedStop, type ArtStop } from './artPalette';
import { softCap, buildBoulderSprite, buildCloudMass, buildStrip, drawContactArc, drawMoon, drawSky, drawStars, drawSun, makeStars, mkCanvas, type Star } from './artDraw';
import { camLayout, clampCamX, follow, toScreen, type Cam, type CamLayout } from './camera';
import { detailsIn, makeTrail, type Trail } from './trail';
import { M_PER_H, PACE_M } from '../../domain/mountain';
import { PACE, sigmaAt } from './gait';
import { hash1, mulberry32, noise1, ridged, smoothstep } from './noise';
import type { V } from './path';
import { DEG as DEG_, RIG, holdDForStone, interior as interiorDeg_, solveSit, stepToStand, type Pose } from './rig';
import { PREFIX_LEN } from '../../domain/mountain';
import { Gait } from './gait';
import { drawFigureArt, figureTier, lastDetailMs, type FigureFrame } from './figureArt';
import { makeChain, solveRest, stepChain, type Chain } from './chain';
import { wind } from './gait';
import { birdSchedule, birdsAt, type BirdGroup } from './ambient';

type Mode = 'climb' | 'summit' | 'stand' | 'sit';
type SeqKind = 'summit' | 'mini' | 'next';
interface Seq { kind: SeqKind; t0: number; dur: number }

const SUMMIT_DUR = 6.0, MINI_DUR = 6.0, NEXT_DUR = 3.2, CROSSFADE_DUR = 0.4, STAND_DUR = 1.2;
/** The summit heave: the walk-in distance (H, two steps) and its cadence. */
const HEAVE_DIST = 0.95, HEAVE_SPEED = 1.1;
const MAX_GRIT = 12;
const R = RIG.boulderR; // H units
/** Screen direction of travel along the trail (+1: the climb runs left → right in every layout). */
const ROLL_DIR = 1;

/** Debug/measurement hook read by the e2e scripts. */
export interface SceneStats { frames: number; avgMs: number; maxMs: number; fps: number; quality: number; particles: number; firstMs?: number; camX?: number; sLocal?: number; gait?: string; figureAlpha?: number; figureOnScreen?: boolean; slopeFrac?: number; zoom?: number; rangesDrawn?: number; cloudsDrawn?: number; stripBuilds?: number; rot?: number; sB?: number; strainT?: number; camY?: number; figureMs?: number; detailMs?: number; tier?: number; pelvisH?: number; clothDeg?: number; clock?: number; u?: number; figBox?: number[]; figBounds?: number[]; figureAvg?: number; detailAvg?: number; settling?: boolean; cut?: boolean; handGapPx?: number; pelvisPx?: number[]; pelvisW?: number[]; headAxisDeg?: number; elbowDeg?: number }

interface Grit { live: boolean; x: number; y: number; vx: number; vy: number; age: number }

export function createSisyphus(): SceneEngine & { stats: SceneStats } {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let w = 0, h = 0, scale = 1, hostDpr = 1, quality = 1;
  let reduced = false, running = false, raf = 0, mounted = false;
  let phase: ScenePhase = 'focus';
  let phaseSet = false;
  let progress = 0;
  let mode: Mode = 'climb';
  let seq: Seq | null = null;
  const rng = mulberry32(20261027);

  // ---------- climb state ----------
  let climb: ClimbInput = { stage: 1, stageStartM: 0, stageLenM: 1500 * PACE_M, posM: 0, fromSummit: false, summits: 0 };
  let climbSet = false;
  let trail: Trail = makeTrail({ stage: 1, startH: 0, lenH: climb.stageLenM / M_PER_H, fromSummit: false });
  let trailKey = '';
  /** Climber's target position along the current stage (H). */
  const sTarget = () => (climbSet ? (climb.posM - climb.stageStartM) / M_PER_H : progress * (climb.stageLenM / M_PER_H));
  const lenH = () => climb.stageLenM / M_PER_H;
  /** §7.6: between setClimb updates the target advances at the pace (≤ 1.5 s), so it grows linearly, never in stairs. */
  let rawTgt = NaN, rawTgtT = 0;
  function dTarget(t: number): number {
    const raw = sTarget();
    if (raw !== rawTgt) { rawTgt = raw; rawTgtT = t; }
    return targetLive(t) ? raw + Math.min(1.5, Math.max(0, t - rawTgtT)) * PACE : raw;
  }
  /** The target is advancing: focusing on a climb, fed within the last 1.5 s, short of the climb's end. */
  function targetLive(t: number): boolean {
    return climbSet && mode === 'climb' && (phase === 'focus' || phase === 'open') && t - rawTgtT < 1.5 && rawTgt < lenH() - 1e-6;
  }

  /** Rebuild the trail when the climb changes; true when a new climb (stage) began. */
  function ensureTrail(): boolean {
    const key = `${climb.stage}|${climb.stageStartM.toFixed(2)}|${Math.round(climb.stageLenM * 10)}|${climb.fromSummit}`;
    if (key === trailKey) return false;
    const prevStage = trail.geom.spec.stage;
    trail = makeTrail({ stage: climb.stage, startH: climb.stageStartM / M_PER_H, lenH: lenH(), fromSummit: climb.fromSummit });
    trailKey = key;
    chunkCache.clear();
    standCache = null;
    if (prevStage !== climb.stage) { gait.snap(sTarget(), trail); return true; }
    return false;
  }

  // ---------- summit / stand state ----------
  /** Pelvis position (H) whose hold pose puts the stone at rest at the start of the summit ledge. */
  function standD(): number { return holdDForStone(trail, trail.geom.ledgeStart + 0.1); }
  interface StandCache { hold: Pose; centre: V; sB: number; rot: number; D: number }
  let standCache: StandCache | null = null;
  /** The resting summit tableau (hold pose at standD, stone on the ledge), computed once per climb. */
  function standState(): StandCache {
    if (standCache) return standCache;
    const D = standD();
    const g2 = new Gait(5);
    g2.snap(D, trail);
    const fr = g2.pose(trail);
    standCache = { hold: fr.pose, centre: fr.centre, sB: fr.sB, rot: fr.rot, D };
    return standCache;
  }
  /** The summit beat's walk: from the climb's end up onto the ledge, then the stand. */
  let summitWalk: { t0: number; Dend: number; standT0: number | null; hold: Pose | null; centre: V | null; sB: number; rot: number } | null = null;
  /** The next-climb beat: the stone rolls forward from the previous summit's ledge into the col. */
  let xfadeT0 = -1;

  // ---------- camera ----------
  let lay: CamLayout = camLayout(800, 600);
  const cam: Cam = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, zoom: 1, anchor: { x: 0, y: 0 } };
  let camInit = false;
  const S = (v: V) => toScreen(cam, lay.Hpx, v);
  const px = (hUnits: number) => hUnits * lay.Hpx * cam.zoom;

  // ---------- figure ----------
  const gait = new Gait(20261027);
  let chains: Chain[] | null = null;
  let chainAcc = 0;
  let fig: FigureFrame | null = null;

  // ---------- palette / sky ----------
  let stop: ArtStop = artStop(0);
  let stars: Star[] = [];
  let birds: BirdGroup[] = [];
  let birdT0 = -1;
  let desatK = 0, desatTarget = 0;

  // ---------- caches ----------
  interface Strip { canvas: HTMLCanvasElement | null; offAtBuild: number; key: string; uStart: number; band: number; sig: CapSig | null }
  interface CapSig { stoneX: number; ys: number[] }
  const LAYERS = [
    { name: 'far', baseY: 0.42, k: 0.08, f: 0.02, unit: 0.30, amp: 0.20, seed: 11 },
    { name: 'mid', baseY: 0.48, k: 0.18, f: 0.05, unit: 0.24, amp: 0.15, seed: 23 },
    { name: 'near', baseY: 0.52, k: 0.32, f: 0.10, unit: 0.18, amp: 0.11, seed: 37 },
  ] as const;
  const strips: Strip[] = LAYERS.map(() => ({ canvas: null, offAtBuild: 0, key: '', uStart: 0, band: 0, sig: null }));
  interface Cloud { canvas: HTMLCanvasElement | null; key: string; x: number; y: number; mw: number; mh: number; seed: number; back: boolean; part: number }
  let clouds: Cloud[] = [];
  let boulderSprite: HTMLCanvasElement | null = null;
  let spriteKey = '';
  let snapshot: HTMLCanvasElement | null = null;
  const chunkCache = new Map<number, { body: Path2D; lines: Path2D; salmon: Path2D; stones: Path2D; stoneTops: Path2D; tufts: Path2D }>();
  /** Cache rebuilds allowed this frame (strips and cloud masses rebuild staged, one per frame). */
  let cacheBudget = 1;
  let drawnRanges = 0, drawnClouds = 0, stripBuilds = 0;
  /** After a cut, the next frame rebuilds every stale cache at once (no mixed-palette frame). */
  let rebuildAll = false;

  const grit: Grit[] = Array.from({ length: MAX_GRIT }, () => ({ live: false, x: 0, y: 0, vx: 0, vy: 0, age: 0 }));
  const frameTimes: number[] = [];
  const stats: SceneStats = { frames: 0, avgMs: 0, maxMs: 0, fps: 0, quality: 1, particles: 0 };
  let fpsCount = 0, fpsWindow = 0;
  let lastFrame = 0, lastDraw = 0, ambientT = 0;
  const nowS = () => performance.now() / 1000;

  // ---------- sizing ----------
  function applySize() {
    if (!canvas || !ctx || w <= 0 || h <= 0) return;
    let d = Math.min(1.5, hostDpr) * (quality >= 0.75 ? 1 : 0.85);
    const cap = w * h > 3e6 ? 1.3e6 : 2.1e6;
    if (w * h * d * d > cap) d = Math.sqrt(cap / (w * h));
    scale = d;
    canvas.width = Math.max(1, Math.round(w * d));
    canvas.height = Math.max(1, Math.round(h * d));
    lay = camLayout(w, h);
    cam.anchor = { ...lay.anchor };
    stars = makeStars(w, h * 0.55);
    strips.forEach((s) => { s.canvas = null; s.key = ''; });
    layoutClouds();
    spriteKey = '';
    chunkCache.clear();
    camInit = false;
  }

  function layoutClouds() {
    const pr = lay.landscape
      ? [{ x: 0.10, y: 0.18, s: 1 }, { x: 0.62, y: 0.12, s: 0.9 }, { x: 0.88, y: 0.30, s: 0.75 }]
      : [{ x: 0.15, y: 0.08, s: 1 }, { x: 0.7, y: 0.30, s: 0.85 }];
    const mw = (lay.landscape ? 0.36 : 0.62) * w, mh = (lay.landscape ? 0.15 : 0.09) * h;
    clouds = pr.map((p, i) => ({ canvas: null, key: '', x: p.x * w - (mw * p.s) / 2, y: p.y * h, mw: mw * p.s, mh: mh * p.s, seed: 100 + i, back: false, part: 0 }));
    clouds.push(...[0, 1].map((i) => ({ canvas: null, key: '', x: (0.15 + 0.5 * i) * w, y: 0.40 * h - mh * 0.6, mw: mw * 1.3, mh: mh * 0.9, seed: 200 + i, back: true, part: 0 })));
  }

  // ---------- palette state per phase ----------
  interface SkyState { stop: ArtStop; sun: V | null; sunRing: number; starVis: number; moon: V | null; twinkle: boolean; band: string }

  function sunPos(q: number): V {
    // Rises left, arcs right (screen space), B ≈ (0.86 w, 0.20 h) in landscape.
    // Portrait keeps the sun low on the left, clear of the readout cartouche at the top.
    const A = lay.landscape ? { x: 0.06 * w, y: 0.40 * h } : { x: 0.08 * w, y: 0.52 * h };
    const C = lay.landscape ? { x: 0.42 * w, y: 0.06 * h } : { x: 0.12 * w, y: 0.36 * h };
    const B = lay.landscape ? { x: 0.86 * w, y: 0.20 * h } : { x: 0.24 * w, y: 0.40 * h };
    const u = 1 - q; return { x: u * u * A.x + 2 * u * q * C.x + q * q * B.x, y: u * u * A.y + 2 * u * q * C.y + q * q * B.y };
  }

  function skyState(t: number): SkyState {
    const moonPath = (q: number): V => ({ x: (0.08 + 0.5 * q) * w, y: (0.30 - 0.18 * Math.sin(Math.PI * q)) * h });
    if (phase === 'complete' || ((mode === 'stand' || mode === 'summit') && phase !== 'break' && phase !== 'open')) {
      const st = seq && seq.kind === 'summit' ? Math.min(SUMMIT_DUR, t - seq.t0) : SUMMIT_DUR;
      const k = smoothstep(1.0, 4.0, st);
      let s = artStop(0.86 + 0.14 * k);
      const night = phase === 'complete' ? Math.min(1, progress * 6) : 0; // a +N extension from the summit: dusk
      if (night > 0) s = mixStop(s, NIGHT, night);
      const sinkK = smoothstep(1.0, 4.0, st);
      const sun = sinkK < 1 ? summitSunPos(sinkK) : null;
      return { stop: s, sun, sunRing: 1 + 0.25 * sinkK, starVis: Math.max(smoothstep(2.5, 5.0, st), night), moon: night > 0.05 ? moonPath(Math.min(1, progress)) : null, twinkle: !reduced, band: s.band };
    }
    if (phase === 'break') {
      const pre = smoothstep(0.85, 1.0, progress);
      return { stop: NIGHT, sun: null, sunRing: 1, starVis: 1, moon: moonPath(Math.min(1, progress)), twinkle: !reduced, band: mixOk(NIGHT.band, PREDAWN_BAND, pre) };
    }
    const p = progress;
    const s = artStop(0.86 * Math.round(p * 200) / 200); // palette steps (caches rebuild staged, not every frame)
    return { stop: s, sun: sunPos(p), sunRing: 1, starVis: 0, moon: null, twinkle: false, band: s.band };
  }

  /** Sun sinking behind the summit ledge's far side (summit beat). */
  function summitSunPos(k: number): V {
    const ledge = S(trail.at(trail.geom.ledgeEnd));
    const start = sunPos(1);
    const end = { x: ledge.x + px(0.4), y: ledge.y + px(0.5) };
    return { x: start.x + (end.x - start.x) * k, y: start.y + (end.y - start.y) * k * k };
  }

  // ---------- range strips ----------
  /** Layer skyline (CSS px above the layer base) at layer coordinate u: jagged tent peaks of varied height. */
  function skyline(L: typeof LAYERS[number], u: number): number {
    let best = 0;
    const cell = Math.floor(u);
    for (let c = cell - 2; c <= cell + 2; c++) {
      const r = mulberry32((c * 7919 + L.seed * 104729) >>> 0);
      const n = 1 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const pxu = c + (k + 0.2 + r() * 0.6) / n;
        const ph = (0.4 + 0.6 * r()) * L.amp;
        const sl = 0.9 + r() * 0.9;
        best = Math.max(best, ph - Math.abs(u - pxu) * sl * L.amp * 1.4);
      }
    }
    return Math.max(0, best + L.amp * 0.06 * (ridged(u * 3 + L.seed) - 0.5));
  }

  /** Screen y of the slope surface at screen x (current render camera). */
  function slopeScreenY(X: number): number {
    const wx = cam.pos.x + (X - cam.anchor.x) / (lay.Hpx * cam.zoom);
    return S({ x: wx, y: trail.groundY(wx) }).y;
  }
  let stoneScreenX = 0;
  /** What the range cap depends on: the stone's screen x and the slope's screen skyline. */
  function capSignature(): CapSig {
    return { stoneX: stoneScreenX, ys: [0.55, 0.7, 0.85, 1].map((k) => slopeScreenY(k * w)) };
  }
  const sigMoved = (a: CapSig | null, b: CapSig) => !a || Math.abs(a.stoneX - b.stoneX) > 40 || a.ys.some((y, j) => Math.abs(y - b.ys[j]) > 12);
  /** The range cap ahead of the stone applies while tracking (not in the wide summit / next-climb shots). */
  const capOn = () => renderCam.zoom > 0.99;
  function layerOffset(i: number): number { return -LAYERS[i].f * cam.pos.x * lay.Hpx; }
  /** 0 while tracking, 1 in the summit framing: the world drops away below the ledge (review U6). */
  const summitK = () => Math.min(1, Math.max(0, (1 - cam.zoom) / (1 - (lay.landscape ? 0.62 : 0.72))));
  const SUMMIT_SINK = [0.24, 0.32, 0.4];
  function layerTop(i: number, altK: number): number { return (LAYERS[i].baseY + LAYERS[i].k * altK + SUMMIT_SINK[i] * summitK()) * h; }

  function stripColour(i: number) { return i === 0 ? stop.far : i === 1 ? stop.mid : stop.near; }

  function buildStripFor(i: number) {
    const L = LAYERS[i];
    const unit = L.unit * h;
    const off = layerOffset(i);
    const uStart = (-0.5 * w - off) / unit;
    const band = (L.amp * 1.25 + 0.04) * h; // the strip holds only the peaks; below it is a plain fillRect
    const base = band - 0.02 * h;            // skyline zero row inside the strip
    // Clarity (review U4): ahead of the stone no range may rise above the real slope skyline. Peaks are lowered
    // smoothly (a soft minimum against the slope edge, measured per column) so they slip behind the slope instead
    // of being clipped into shelves or a straight wedge; left of the stone they are untouched.
    const cap = capOn();
    const sig = capSignature();
    const top0 = layerTop(i, altNow);
    const ramp = Math.max(8, px(R));
    const strip = buildStrip(2 * w, band, scale, stripColour(i), (x) => {
      const X = x - 0.5 * w;
      const H = skyline(L, uStart + x / unit) * h;             // px above the layer's base line
      if (!cap || X < sig.stoneX - ramp) return base - H;
      const allowed = top0 - (slopeScreenY(X) + 16);             // px above base that stays behind the slope (with room for drift between rebuilds)
      const wgt = smoothstep(sig.stoneX - ramp, sig.stoneX, X);
      const A = allowed + (1 - wgt) * 2 * h;
      return base - softCap(H, A);
    });
    stripBuilds++;
    strips[i].canvas = strip; strips[i].offAtBuild = off; strips[i].uStart = uStart; strips[i].band = band; strips[i].sig = sig;
    strips[i].key = `${stripColour(i)}|${Math.round(top0)}|${capOn()}`;
  }

  function drawStrip(g: CanvasRenderingContext2D, i: number, altK: number) {
    const s = strips[i];
    if (!s.canvas) return;
    drawnRanges++;
    const off = layerOffset(i);
    const x = -0.5 * w + (off - s.offAtBuild);
    const band = s.band;
    const top = layerTop(i, altK) - (band - 0.02 * h);
    // blit only the visible part of the strip
    const sx = Math.max(0, -x * scale), sw = Math.min(s.canvas.width - sx, w * scale);
    if (sw > 0) g.drawImage(s.canvas, sx, 0, sw, s.canvas.height, x + sx / scale, top, sw / scale, band);
    g.fillStyle = stripColour(i);
    if (top + band < h) g.fillRect(0, Math.floor(top + band - 1), w, h - top - band + 2);
  }

  // ---------- slope ----------
  const CHUNK = 8;
  function buildChunk(ci: number) {
    const s0 = ci * CHUNK, s1 = s0 + CHUNK;
    const body = new Path2D(), lines = new Path2D(), salmon = new Path2D(), stones = new Path2D(), stoneTops = new Path2D(), tufts = new Path2D();
    const ds = 1 / 16;
    // body polygon in world units (H), closed far below
    const a = trail.at(s0 - ds);
    body.moveTo(a.x, a.y - 40);
    for (let s = s0 - ds; s <= s1 + ds; s += ds) { const p = trail.at(s); body.lineTo(p.x, p.y); }
    const b = trail.at(s1 + ds);
    body.lineTo(b.x, b.y - 40); body.closePath();
    for (const d of detailsIn(s0, s1, trail.geom.spec.startH)) {
      if (d.s < s0 || d.s >= s1) continue;
      const p = trail.at(d.s), t = trail.tangentAt(d.s), n = { x: -t.y, y: t.x };
      if (d.kind === 'fleck') {
        const c = { x: p.x - n.x * d.depth, y: p.y - n.y * d.depth };
        const tw = (hash1(d.seed + 0.37) - 0.5) * 0.5; // slight tilt so the flecks never read as a dashed line
        const t2 = { x: t.x * Math.cos(tw) - t.y * Math.sin(tw), y: t.x * Math.sin(tw) + t.y * Math.cos(tw) };
        const path = d.salmon ? salmon : lines;
        path.moveTo(c.x - t2.x * d.size / 2, c.y - t2.y * d.size / 2); path.lineTo(c.x + t2.x * d.size / 2, c.y + t2.y * d.size / 2);
      } else if (d.kind === 'stone') {
        const r = 0.02 + d.size * 0.03;
        const c = { x: p.x + n.x * r * 0.6, y: p.y + n.y * r * 0.6 };
        const k = 6;
        for (let i = 0; i <= k; i++) {
          const ang = (i / k) * Math.PI * 2;
          const rr = r * (0.8 + 0.2 * hash1(d.seed + i));
          const x = c.x + Math.cos(ang) * rr * 1.3, y = c.y + Math.sin(ang) * rr;
          if (i) stones.lineTo(x, y); else stones.moveTo(x, y);
        }
        stones.closePath();
        stoneTops.moveTo(c.x - r * 1.0, c.y + r * 0.55); stoneTops.quadraticCurveTo(c.x, c.y + r * 1.15, c.x + r * 1.0, c.y + r * 0.55);
      } else if (d.kind === 'tuft') {
        for (let i = -1; i <= 1; i++) {
          const base = { x: p.x + t.x * i * 0.012, y: p.y + t.y * i * 0.012 };
          const tip = { x: base.x + n.x * (0.05 + 0.02 * (1 - Math.abs(i))) + t.x * i * 0.02, y: base.y + n.y * (0.05 + 0.02 * (1 - Math.abs(i))) + t.y * i * 0.02 };
          tufts.moveTo(base.x, base.y); tufts.lineTo(tip.x, tip.y);
        }
      } else {
        let c = { x: p.x - n.x * 0.04, y: p.y - n.y * 0.04 };
        lines.moveTo(c.x, c.y);
        for (let i = 0; i < 3; i++) { c = { x: c.x - n.x * (0.06 + d.size * 0.04) + t.x * (hash1(d.seed + i) - 0.5) * 0.06, y: c.y - n.y * (0.06 + d.size * 0.04) + t.y * (hash1(d.seed + i) - 0.5) * 0.06 }; lines.lineTo(c.x, c.y); }
      }
    }
    chunkCache.set(ci, { body, lines, salmon, stones, stoneTops, tufts });
    if (chunkCache.size > 10) { const first = chunkCache.keys().next().value as number; chunkCache.delete(first); }
  }

  function drawSlope(g: CanvasRenderingContext2D, builds: { left: number }) {
    // visible s range: from the left edge to the right edge
    const sL = sAtScreenX(-20), sR = sAtScreenX(w + 20);
    const c0 = Math.floor(sL / CHUNK), c1 = Math.floor(sR / CHUNK);
    const z = lay.Hpx * cam.zoom;
    g.save();
    g.transform(z, 0, 0, -z, cam.anchor.x - cam.pos.x * z, cam.anchor.y + cam.pos.y * z);
    for (let ci = c0; ci <= c1; ci++) {
      if (!chunkCache.has(ci)) { if (builds.left <= 0 && chunkCache.size > 0) continue; buildChunk(ci); builds.left--; }
      const ch = chunkCache.get(ci)!;
      g.fillStyle = INK.black; g.fill(ch.body);
    }
    const lw = LW(lay.Hpx * cam.zoom);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let ci = c0; ci <= c1; ci++) {
      const ch = chunkCache.get(ci);
      if (!ch) continue;
      g.strokeStyle = INK.ochre; g.lineWidth = lw.fleck / z; g.stroke(ch.lines);
      g.strokeStyle = INK.salmon; g.stroke(ch.salmon);
      g.fillStyle = INK.black; g.fill(ch.stones);
      g.strokeStyle = INK.black; g.lineWidth = (lw.fleck * 1.2) / z; g.stroke(ch.tufts);
      g.strokeStyle = INK.ochre; g.lineWidth = 1.25 / z; g.stroke(ch.stoneTops);
    }
    g.restore();
  }

  function sAtScreenX(X: number): number {
    const wx = cam.pos.x + (X - cam.anchor.x) / (lay.Hpx * cam.zoom);
    const xs = trail.geom.xs;
    let lo = 0, hi = xs.length - 1;
    if (wx <= xs[0]) return trail.geom.s0;
    if (wx >= xs[hi]) return trail.geom.s1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] < wx) lo = mid; else hi = mid; }
    return trail.geom.s0 + lo / 16;
  }

  // ---------- summit cairn ----------
  function drawCairn(g: CanvasRenderingContext2D, s: number, reached: boolean) {
    const base = trail.at(s);
    const sx = S(base).x;
    if (sx < -px(0.5) || sx > w + px(0.5)) return;
    let y = 0;
    const widths = [0.22, 0.16, 0.10];
    widths.forEach((wd, i) => {
      const ht = wd * 0.45;
      const c = S({ x: base.x, y: base.y + y + ht / 2 });
      g.fillStyle = i === 2 && reached ? INK.cream : INK.black;
      g.beginPath(); g.ellipse(c.x, c.y, px(wd / 2), px(ht / 2), 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = INK.ochre; g.lineWidth = 1.25;
      g.beginPath(); g.ellipse(c.x, c.y, px(wd / 2), px(ht / 2), 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      y += ht * 0.9;
    });
  }

  // ---------- boulder ----------
  function drawBoulder(g: CanvasRenderingContext2D, centre: V, rot: number, sB: number) {
    const Rpx = px(R);
    const key = `${Math.round(Rpx)}|${scale}`;
    if (key !== spriteKey || !boulderSprite) { boulderSprite = buildBoulderSprite(Rpx, scale, 31, LW(lay.Hpx * cam.zoom).fleck); spriteKey = key; }
    const c = S(centre);
    const size = boulderSprite.width / (scale * 2);
    g.save();
    g.translate(c.x, c.y);
    // Rolling forward = clockwise on the y-down canvas: rotate by +arc/R (ROUND4 §5.1; round 3 had the sign wrong).
    const rotCanvas = ROLL_DIR * rot;
    g.rotate(rotCanvas);
    stats.rot = rotCanvas; stats.sB = sB;
    g.drawImage(boulderSprite, -size / 2, -size / 2, size, size);
    g.restore();
    const slope = (trail.angleAt(sB) * Math.PI) / 180;
    drawContactArc(g, c, Rpx, slope, LW(lay.Hpx * cam.zoom).fleck);
  }

  // ---------- grit ----------
  function spawnGrit(at: V, n: number) {
    for (let i = 0; i < n; i++) {
      const p = grit.find((q) => !q.live);
      if (!p) return;
      p.live = true; p.x = at.x; p.y = at.y; p.vx = -(0.1 + rng() * 0.25); p.vy = 0.15 + rng() * 0.2; p.age = 0;
    }
  }
  function stepGrit(dt: number) {
    let live = 0;
    for (const p of grit) {
      if (!p.live) continue;
      p.age += dt; p.vy -= 2.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const gy = trail.groundY(p.x);
      if (p.y < gy) { if (p.vy < -0.3) { p.y = gy; p.vy = -p.vy * 0.3; p.vx *= 0.6; } else { p.y = gy; p.vy = 0; p.vx *= 0.9; } }
      if (p.age > 2.2) p.live = false; else live++;
    }
    stats.particles = live;
  }
  function drawGrit(g: CanvasRenderingContext2D) {
    g.fillStyle = INK.ochre;
    const r = Math.max(1, px(0.008));
    for (const p of grit) { if (!p.live) continue; const v = S(p); g.fillRect(v.x - r, v.y - r, r * 2, r * 2); }
  }

  // ---------- chains (loincloth flaps) ----------
  let chainAnchors: V[] | null = null;
  let clothMean = NaN, clothSwing = 0, clothSwingV = 0;
  function updateChains(pose: Pose, dt: number, rest: boolean) {
    const anchors = clothAnchors(pose);
    if (!chains) {
      // front and back flaps (3 links; phone 2) and the belt knot's two tails (2 links) — ROUND4 §6.4
      const flapLinks = lay.landscape ? 3 : 2;
      chains = anchors.map((a, i) => (i < 2 ? makeChain(a, flapLinks, 0.24 / 8, 30, 0.6) : makeChain(a, 2, 0.16 / 8, 35, 0.9)));
      rest = true;
    }
    const grav = 9;
    const ph = pose.pelvis.y - trail.groundY(pose.pelvis.x);
    clothMean = Number.isFinite(clothMean) ? clothMean + (ph - clothMean) * Math.min(1, dt / 4) : ph;
    if (!rest) { const wc = 5; clothSwingV += (-wc * wc * (clothSwing - (ph - clothMean) * 14) - 2 * wc * clothSwingV) * dt; clothSwing += clothSwingV * dt; }
    const wx = wind(ambientT) * 6 + clothSwing;
    if (rest) { chains.forEach((c, i) => solveRest(c, anchors[i], { x: 0, y: -1 }, grav, wx)); chainAnchors = anchors; return; }
    // the cloth is carried 85% with the body (wrapped linen clings), so the surge never flags it; its follow-through
    // is an explicit swing driven by the pelvis bob through a critically damped spring (ω = 5: the tip trails the
    // body by ≈ 250–350 ms, §7.5)
    if (chainAnchors) chains.forEach((c, i) => {
      const dx = (anchors[i].x - chainAnchors![i].x) * 0.85, dy = (anchors[i].y - chainAnchors![i].y) * 0.85;
      for (let k = 1; k < c.p.length; k++) { c.p[k].x += dx; c.p[k].y += dy; c.prev[k].x += dx; c.prev[k].y += dy; }
    });
    chainAnchors = anchors;
    chainAcc = Math.min(chainAcc + dt, 3 / 60);
    let n = 0;
    while (chainAcc >= 1 / 60 && n < (quality >= 0.75 ? 3 : 1)) { chains.forEach((c, i) => stepChain(c, anchors[i], { x: 0, y: -1 }, 1 / 60, grav, wx, 0.82)); chainAcc -= 1 / 60; n++; }
  }
  function clothAnchors(pose: Pose): V[] {
    const d = { x: pose.shoulder.x - pose.pelvis.x, y: pose.shoulder.y - pose.pelvis.y };
    const l = Math.hypot(d.x, d.y) || 1;
    const up = { x: d.x / l, y: d.y / l };
    const front = { x: up.y * pose.facing, y: -up.x * pose.facing };
    const low = 0.62 / 8;
    const at = (f: number, dn: number) => ({ x: pose.pelvis.x + front.x * f - up.x * dn, y: pose.pelvis.y + front.y * f - up.y * dn });
    // flaps hang from the wrap's hem at front and back; the knot tails from the belt knot at the front hip
    return [at(0.055, low), at(-0.07, low), at(0.08, -0.01), at(0.085, -0.005)];
  }

  /**
   * V11: the summit idles (§4.7). A slow weight shift (the pelvis sways ±0.012 H over a 7.3 s period, C∞) and,
   * every 8 s, a look out — the chin lifts a further 6° and settles. The base chin is lifted 12° (§3.4).
   */
  function standIdle(): { sway: number; chin: number } {
    if (reduced) return { sway: 0, chin: 0.6 };
    const sway = 0.012 * Math.sin((2 * Math.PI * ambientT) / 7.3) * Math.sin((2 * Math.PI * ambientT) / 23 + 1) ** 2;
    const q = (ambientT % 8) / 8, look = q < 0.5 ? Math.sin(Math.PI * q * 2) ** 2 : 0;
    return { sway, chin: 0.6 + 0.3 * look };
  }

  // ---------- sequences ----------
  /**
   * V3: the summit beat starts with a 400 ms cross-fade cut to the heave — the figure two steps before his spot on the
   * ledge, the camera on him — so he is on screen throughout and the beat lasts ≈ 6 s, not a 2 H walk of 15 s.
   */
  function startSummitWalk(t: number, kind: SeqKind) {
    crossfade(t);
    const D1 = standState().D;
    gait.snap(D1 - HEAVE_DIST, trail);
    camInit = false; chains = null; cut = true;
    mode = 'summit';
    summitWalk = { t0: t, Dend: gait.D, standT0: null, hold: null, centre: null, sB: 0, rot: 0 };
    startSeq(kind, t);
  }
  function startSeq(kind: SeqKind, t: number) {
    const dur = kind === 'summit' ? SUMMIT_DUR : kind === 'mini' ? MINI_DUR : NEXT_DUR;
    seq = { kind, t0: t, dur };
    if (reduced) seq = null;
    ensureLoop();
  }

  /** A 400 ms cross-fade from the current frame (a cut that never pops). */
  function crossfade(t: number) {
    if (!mounted || !canvas || stats.frames === 0) return;
    takeSnapshot();
    xfadeT0 = t;
    ensureLoop();
  }

  /**
   * The next climb (review U3, U11): a clean cut on a single frame to the col, the climber already braced behind
   * the stone and the camera on its tracking frame. No camera move through empty sky, no fade, no double exposure;
   * the gait picks up from the hold.
   */
  function beginNext() {
    mode = 'climb';
    summitWalk = null;
    seq = null;
    xfadeT0 = -1; snapshot = null;
    gait.snap(sTarget(), trail);
    chains = null;
    camInit = false;
    rebuildAll = true;
  }

  // ---------- frame ----------
  let altNow = 0;

  /** Summit framing: zoom 0.62 (portrait 0.72) with the ledge at (0.55 w, 0.58 h) (portrait (0.45 w, 0.62 h)). */
  function summitFrame(): { pos: V; anchor: V; zoom: number } {
    // portrait: frame the stone and the standing figure (the back side runs off to the right)
    const ledge = trail.at(trail.geom.ledgeStart + (lay.landscape ? 0.8 : 0.1));
    return { pos: ledge, anchor: lay.landscape ? { x: 0.34 * w, y: 0.58 * h } : { x: 0.58 * w, y: 0.58 * h }, zoom: lay.landscape ? 0.62 : 0.72 };
  }

  function updateCamera(t: number, dt: number, target: V) {
    const sf = summitFrame();
    let zoomK = 0;
    if (phase === 'complete' || phase === 'break' || mode === 'stand' || mode === 'sit' || mode === 'summit') {
      zoomK = seq && (seq.kind === 'summit' || seq.kind === 'mini') ? smoothstep(0.5, 4.0, t - seq.t0) : 1;
      if (reduced) zoomK = 1;
    }
    const from = sf;
    const ez = zoomK * zoomK * (3 - 2 * zoomK);
    // tracking target with the end clamp (the crest never on screen during a block)
    const crestX = trail.at(trail.geom.crestS - 0.3).x;
    const limitX = clampCamX(Infinity, crestX, w, lay.anchor.x, lay.Hpx);
    if (reduced) { cam.pos = { ...target }; cam.vel = { x: 0, y: 0 }; camInit = true; ffS = NaN; }
    else if (!camInit && mode !== 'climb') { cam.pos = { ...target }; cam.vel = { x: 0, y: 0 }; camInit = true; ffS = NaN; }
    else if (mode === 'climb') {
      if (!camInit) { ffS = NaN; camInit = true; }
      // §7.6: a feed-forward constant-speed target (Dtarget − 0.15σ) plus a gentle correction toward the
      // cycle-linear pelvis base: the world scrolls at ≈ v̄ and the per-step surge plays out
      // inside the frame. The end clamp engages through a soft minimum (width 0.3 H): the camera eases to a stop.
      const lin = gait.linS();
      const live = targetLive(t) && !seq;
      // σ read at a continuously moving point (at the stepping D it would jump at every step)
      let sig = sigmaAt(trail.angleAt(Number.isFinite(ffS) ? ffS : lin));
      if (!Number.isFinite(ffS) || Math.abs(dTarget(t) - ffS) > 3 * sig) {
        sig = sigmaAt(trail.angleAt(lin));
        ffS = dTarget(t); ffV = live ? PACE : 0; ffA = 0; corr = lin - (ffS - 0.15 * sig); corrV = 0; corrA = 0;
      }
      // the feed-forward speed itself changes through a critically damped filter (ω = 2.5): eases in and out
      // V9: through a strain beat the world eases down to 25% of the pace (the figure stalls for 3 s), so he never
      // slides far back in the frame; the saturating correction brings him home in a few seconds
      const vT = live ? PACE * (frMode === 'strain' ? 0.25 : 1) : 0;
      ffA += (-6.25 * (ffV - vT) - 5 * ffA) * dt; ffV += ffA * dt;
      ffS += ffV * dt + 0.03 * PACE * Math.tanh((dTarget(t) - ffS) / 0.3) * dt; // (a slow, capped pull keeps it honest)
      // the correction: proportional (ω = 1.2) but its speed saturates at ±12% of v̄ and changes through a critically
      // damped velocity filter (ω = 2) — a strain beat's 3 s stall plays out in the frame, the world never stutters
      const err = lin - (ffS - 0.15 * sig) - corr, vmax = 0.12 * PACE;
      const vc = vmax * Math.tanh((1.2 * err) / vmax);
      corrA += (-4 * (corrV - vc) - 4 * corrA) * dt; corrV += corrA * dt; corr += corrV * dt;
      const p = trail.at(ffS - 0.15 * sig + corr);
      const x = 0.5 * (p.x + limitX - Math.sqrt((p.x - limitX) * (p.x - limitX) + 0.09));
      const np = { x, y: p.y };
      cam.vel = { x: (np.x - cam.pos.x) / Math.max(1e-3, dt), y: (np.y - cam.pos.y) / Math.max(1e-3, dt) };
      cam.pos = np;
    } else { follow(cam, target, dt, 2.2); ffS = NaN; }
    const trackPos = { x: Math.min(cam.pos.x, limitX), y: cam.pos.y };
    if (trackPos.x !== cam.pos.x) { cam.pos.x = trackPos.x; cam.vel.x = Math.min(0, cam.vel.x); } // y keeps following: he walks into the frame, not out of its top
    if (ez > 0) {
      const p = { x: trackPos.x + (from.pos.x - trackPos.x) * ez, y: trackPos.y + (from.pos.y - trackPos.y) * ez };
      renderCam = { pos: p, anchor: { x: lay.anchor.x + (from.anchor.x - lay.anchor.x) * ez, y: lay.anchor.y + (from.anchor.y - lay.anchor.y) * ez }, zoom: 1 + (from.zoom - 1) * ez };
    } else renderCam = { pos: { ...trackPos }, anchor: { ...lay.anchor }, zoom: 1 };
    void t;
  }
  let renderCam = { pos: { x: 0, y: 0 }, anchor: { x: 0, y: 0 }, zoom: 1 };
  let ffS = NaN, ffV = 0, ffA = 0, corr = 0, corrV = 0, corrA = 0;
  let frMode = 'trudge', frStrainT = -1, tierFree = true, settling = false, cut = false;

  function sceneFrame(t: number, dt: number) {
    if (!ctx || !canvas) return;
    const t0 = performance.now();
    if (seq && t - seq.t0 >= seq.dur) {
      const done = seq.kind;
      seq = null;
      void done;
    }
    if (desatK !== desatTarget) { const step = dt / 0.4; desatK = desatTarget > desatK ? Math.min(desatTarget, desatK + step) : Math.max(desatTarget, desatK - step); }
    ambientT += dt * (phase === 'paused' ? 0.25 : 1);
    // A new climb while focusing (an open-ended block's hourly summit): the stone rolls on into the next col.
    if (ensureTrail() && (phase === 'focus' || phase === 'open') && phaseSet && !climb.atSummit) beginNext();
    // An open-ended block's hourly summit (review U8): heave onto the ledge and stand, then the cut to the col.
    if (climb.atSummit && mode === 'climb' && (phase === 'focus' || phase === 'open') && phaseSet) {
      if (reduced || stats.frames === 0) mode = 'stand';
      else startSummitWalk(t, 'mini');
    }

    // Figure state.
    const still = reduced || phase === 'paused';
    let pose: Pose, centre: V, rot: number, sB: number;
    settling = false; tierFree = true;
    if (mode === 'climb') {
      if (!still) gait.step(dt, dTarget(t), trail, { climbing: !seq && (phase === 'focus' || phase === 'open'), lenH: lenH(), idles: quality >= 1 });
      else gait.settle(sTarget(), trail, reduced);
      if (gait.events.snap && !reduced && stats.frames > 0) crossfade(t);
      const fr = gait.pose(trail);
      pose = fr.pose; centre = fr.centre; rot = fr.rot; sB = fr.sB;
      frMode = fr.mode; frStrainT = fr.strainT;
      // the level of detail may only change at the press (never mid-step) or at rest
      tierFree = fr.mode !== 'trudge' || gait.u < 0.3;
      if (gait.events.grit) spawnGrit(trail.at(sB), 2 + Math.floor(rng() * 2));
    } else if (mode === 'summit' && summitWalk) {
      // §5.2: heave onto the ledge (quick steps, the stone rolls by distance), then step through and stand.
      const sw = summitWalk;
      const st = t - sw.t0;
      if (sw.standT0 === null) {
        const D1 = standState().D;
        // the heave: two steps onto the ledge at a brisk cadence (×HEAVE_SPEED), straight at the hold spot
        const target = D1;
        gait.step(dt, target, trail, { climbing: false, lenH: lenH(), speed: HEAVE_SPEED, idles: false });
        const fr = gait.pose(trail);
        pose = fr.pose; centre = fr.centre; rot = fr.rot; sB = fr.sB;
        tierFree = fr.mode !== 'trudge' || gait.u < 0.3;
        if (gait.events.stepEnd && rng() < 0.6) spawnGrit(trail.at(sB), 1);
        // arrived: at rest in the hold for 0.4 s (the pelvis has settled), so the step-through starts from stillness
        const arrived = gait.mode === 'hold' && gait.holdT >= 0.4 && Math.abs(D1 - gait.D) < 0.5 * sigmaAt(trail.angleAt(gait.D));
        if (arrived || st > 9) { sw.standT0 = t; sw.hold = fr.pose; sw.centre = fr.centre; sw.sB = fr.sB; sw.rot = fr.rot; }
      } else {
        // §5.3 summit settle: released on the ledge, the stone rocks on a damped spring (±0.01 H, ζ 0.35, two
        // oscillations) and turns with its travel, in phase (rot = centreArc/R holds); the palm rides it
        const ts = t - sw.standT0, wn = (2 * Math.PI) / 0.55, z = 0.35;
        const off = ts < STAND_DUR ? 0.01 * Math.exp(-z * wn * ts) * Math.sin(wn * Math.sqrt(1 - z * z) * ts) : 0;
        sB = sw.sB + off; centre = off === 0 ? sw.centre! : trail.centreAt(sB, R); rot = sw.rot + (trail.centreArc(sB, R) - trail.centreArc(sw.sB, R)) / R;
        settling = ts < STAND_DUR;
        const k = ts / STAND_DUR;
        pose = stepToStand(trail, sw.hold!, centre, Math.min(1, k), 1 + 0.015 * Math.sin(ambientT * 1.85), standIdle());
        if (k >= 1) { standCache = { hold: sw.hold!, centre: sw.centre!, sB: sw.sB, rot: sw.rot, D: gait.D }; summitWalk = null; mode = 'stand'; }
      }
    } else {
      const sc = standState();
      centre = sc.centre; sB = sc.sB; rot = sc.rot;
      const breath = 1 + 0.015 * Math.sin(ambientT * 1.85);
      pose = mode === 'sit' ? solveSit(trail, 1, centre, breath) : stepToStand(trail, sc.hold, centre, 1, breath, standIdle());
    }

    // Camera target: the pelvis ground point without the bob.
    const targetS = mode === 'climb' || (mode === 'summit' && summitWalk?.standT0 === null) ? gait.baseS() : standState().D;
    const tp = trail.at(targetS);
    updateCamera(t, dt, tp);
    cam.anchor = renderCam.anchor; const keepPos = cam.pos; cam.pos = renderCam.pos; cam.zoom = renderCam.zoom;
    stoneScreenX = S(centre).x;

    // Altitude parallax: 0 at the climb start, 1 at its end.
    const lh = Math.max(1e-3, trail.at(trail.geom.crestS).y - trail.at(0).y);
    altNow = Math.min(1, Math.max(0, (tp.y - trail.at(0).y) / lh));

    const ss = skyState(t);
    stop = desatK > 0 ? pausedStop(ss.stop, Math.round(desatK * 4) / 4) : ss.stop;
    const g = ctx;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    // paused: the horizon band greys with the rest of the palette (review U9)
    const band = desatK > 0 ? pausedStop({ ...ss.stop, band: ss.band }, Math.round(desatK * 4) / 4).band : ss.band;
    drawSky(g, w, h, stop, layerTop(0, altNow) - 0.22 * (layerTop(0, altNow)), layerTop(0, altNow) + h, band);
    if (ss.moon) drawMoon(g, ss.moon, 0.035 * h);
    drawStars(g, stars, ss.starVis, ss.twinkle ? ambientT : null);
    if (ss.sun) drawSun(g, ss.sun, 0.055 * h, stop, ss.sunRing);

    // Strips: rebuild at most one per frame when out of range or recoloured.
    // Staged rebuilds; the first animated frame draws sky, slope, stone and figure only. A reduced-motion still is
    // the only frame for 15 s, so it builds everything it needs at once (review U5).
    cacheBudget = reduced || rebuildAll ? 99 : stats.frames === 0 ? 0 : stats.frames < 12 ? 2 : 1;
    rebuildAll = false;
    drawnRanges = 0; drawnClouds = 0;
    for (let i = 0; i < LAYERS.length; i++) {
      const s = strips[i];
      const off = layerOffset(i);
      const key = `${stripColour(i)}|${Math.round(layerTop(i, altNow))}|${capOn()}`;
      const capStale = capOn() && (Math.abs(off - s.offAtBuild) > 12 || sigMoved(s.sig, capSignature()));
      const stale = !s.canvas || capStale || Math.abs(off - s.offAtBuild) > 0.12 * w || (s.key !== key && Math.abs(Number(s.key.split('|')[1]) - layerTop(i, altNow)) > 0.03 * h) || s.key.split('|')[0] !== key.split('|')[0] || s.key.split('|')[2] !== key.split('|')[2];
      if (stale && cacheBudget > 0) { buildStripFor(i); cacheBudget--; }
    }
    drawStrip(g, 0, altNow);
    drawClouds(g, dt, true);
    drawStrip(g, 1, altNow);
    drawClouds(g, dt, false);
    drawStrip(g, 2, altNow);
    drawBirds(g, t);
    drawSlope(g, { left: 2 });
    // Cairns only on summits: this climb's (once reached) and, behind the start, the last one's.
    if (mode !== 'climb' || phase === 'complete' || phase === 'break') drawCairn(g, trail.geom.ledgeEnd - 0.25, true);
    if (climb.fromSummit) drawCairn(g, -PREFIX_LEN + 1.5 - 0.25, true);

    // Boulder + figure.
    drawBoulder(g, centre, rot, sB);
    updateChains(pose, dt, still);
    fig = { pose, centre, R, Hpx: lay.Hpx * cam.zoom, toS: S, chains, trail, facing: pose.facing, quality, veins: pose.veins ?? 0, tierFree };
    // (measurement hook: with __flushTiming set, rasterise before and after so figureMs is the figure's real cost)
    const flush = (globalThis as { __flushTiming?: boolean }).__flushTiming === true;
    if (flush) g.getImageData(0, 0, 1, 1);
    const tF = performance.now();
    drawFigureArt(g, fig, scale);
    if (flush) g.getImageData(0, 0, 1, 1);
    stats.figureMs = performance.now() - tF; stats.detailMs = lastDetailMs; stats.tier = figureTier();
    stats.figureAvg = stats.frames ? (stats.figureAvg ?? stats.figureMs) * 0.95 + stats.figureMs * 0.05 : stats.figureMs;
    stats.detailAvg = stats.frames ? (stats.detailAvg ?? lastDetailMs) * 0.95 + lastDetailMs * 0.05 : lastDetailMs;
    stats.settling = settling; stats.cut = cut; cut = false;
    if (pose.hands) { const he = S(pose.arms[0].end), hp = S(pose.hands[0]); stats.handGapPx = Math.abs(Math.hypot(he.x - hp.x, he.y - hp.y) - RIG.wristToPalm * lay.Hpx * cam.zoom); stats.pelvisPx = [S(pose.pelvis).x, S(pose.pelvis).y]; stats.pelvisW = [pose.pelvis.x, pose.pelvis.y]; stats.headAxisDeg = (pose.headAxis ?? 0) / DEG_; stats.elbowDeg = interiorDeg_(pose.arms[0]); }
    stepGrit(dt);
    drawGrit(g);

    if (xfadeT0 >= 0 && snapshot) {
      const k = 1 - Math.min(1, (t - xfadeT0) / CROSSFADE_DUR);
      if (k <= 0) { xfadeT0 = -1; snapshot = null; }
      else { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = k; g.drawImage(snapshot, 0, 0); g.globalAlpha = 1; }
    }
    // Framing checks (read by the transition tests): the figure is drawn and on screen, the black slope fills a
    // sensible share of the frame (no empty flat-colour frames).
    const ps = S(pose.pelvis);
    stats.figureAlpha = pose.alpha;
    stats.figureOnScreen = ps.x > 0 && ps.x < w && ps.y > 0 && ps.y < h;
    let below = 0;
    for (let i = 0; i < 16; i++) {
      const X = ((i + 0.5) / 16) * w;
      const wx = cam.pos.x + (X - cam.anchor.x) / (lay.Hpx * cam.zoom);
      const Y = S({ x: wx, y: trail.groundY(wx) }).y;
      below += Math.min(1, Math.max(0, (h - Y) / h));
    }
    stats.slopeFrac = below / 16;
    stats.zoom = cam.zoom; stats.rangesDrawn = drawnRanges; stats.cloudsDrawn = drawnClouds; stats.stripBuilds = stripBuilds;
    {
      // the figure's screen bounds (every joint, hand and foot point) and a crop box with the stone (capture tools)
      const pts = [pose.pelvis, pose.shoulder, pose.head, ...pose.legs.flatMap((l) => [l.joint, l.end]), ...pose.arms.flatMap((a) => [a.joint, a.end]), ...pose.feet!.flatMap((f) => [f.heel, f.toe])].map(S);
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      stats.figBounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const c0 = S({ x: centre.x - R, y: centre.y + R }), c1 = S({ x: centre.x + R, y: centre.y - R });
      stats.figBox = [Math.min(stats.figBounds[0], c0.x) - 30, Math.min(stats.figBounds[1], c0.y) - 30, Math.max(stats.figBounds[2], c1.x) + 30, Math.max(stats.figBounds[3], c1.y) + 20];
    }
    cam.pos = keepPos;
    stats.camX = renderCam.pos.x; stats.sLocal = gait.baseS(); stats.camY = renderCam.pos.y; stats.clock = t; stats.u = gait.u;
    stats.pelvisH = pose.pelvis.y - trail.groundY(pose.pelvis.x);
    if (chains) { const c = chains[0].p, tip = c[c.length - 1]; stats.clothDeg = (Math.atan2(tip.x - c[0].x, c[0].y - tip.y) * 180) / Math.PI; }
    stats.gait = mode === 'climb' ? frMode : mode; stats.strainT = mode === 'climb' ? frStrainT : -1;
    void t0;
  }

  function drawClouds(g: CanvasRenderingContext2D, dt: number, back: boolean) {
    const drift = reduced || phase === 'paused' ? 0 : back ? 2 : 4;
    for (const c of clouds) {
      if (c.back !== back) continue;
      const key = `${stop.cloudFront}|${stop.cloudBack}|${Math.round(c.mw)}`;
      if ((!c.canvas || c.key !== key) && cacheBudget > 0) { cacheBudget--; c.canvas = buildCloudMass(c.seed, c.mw, c.mh, stop, scale, quality > 0.5); c.key = key; }
      if (!c.canvas) continue; // staged: appears within the first frames, under the overlay's fade-in
      c.x -= drift * dt;
      const span = w + c.mw * 1.3;
      if (c.x < -c.mw * 1.2) c.x += span;
      const f = back ? 0.03 : 0.06, k = back ? 0.20 : 0.30;
      const pxp = -f * cam.pos.x * lay.Hpx;
      let x = ((c.x + pxp) % span + span) % span - c.mw * 0.2;
      const y = c.y + k * altNow * h + (back ? 0.3 : 0.34) * summitK() * h; // the cloud sea sinks below the ledge
      if (phase === 'complete' && !back) {
        const st = seq?.kind === 'summit' ? smoothstep(1.2, 3.7, nowS() - seq.t0) : 1;
        x += (x + c.mw / 2 < w / 2 ? -1 : 1) * 0.18 * w * st;
      }
      drawnClouds++;
      const cw = c.canvas.width / scale, ch = c.canvas.height / scale;
      g.drawImage(c.canvas, x - c.mw * 0.2, y - c.mh * 0.2, cw, ch);
    }
  }

  function drawBirds(g: CanvasRenderingContext2D, t: number) {
    if (reduced || phase === 'paused' || phase === 'break' || quality < 1 || seq?.kind === 'summit' || seq?.kind === 'mini') return;
    if (birdT0 < 0) { birdT0 = t; birds = birdSchedule(4242); }
    const el = t - birdT0;
    const gr = birds.find((b) => el >= b.start && el <= b.start + b.dur);
    if (!gr) return;
    const span = 0.012 * h;
    g.strokeStyle = INK.black; g.lineWidth = 1.6; g.lineCap = 'round';
    for (const b of birdsAt(gr, el, w, h, h, lay.landscape ? [0.10, 0.26] : [0.30, 0.45])) {
      const a = (b.wing * Math.PI) / 180;
      g.beginPath();
      g.moveTo(b.x - span, b.y - Math.sin(a) * span);
      g.quadraticCurveTo(b.x - span * 0.45, b.y - span * 0.3, b.x, b.y);
      g.quadraticCurveTo(b.x + span * 0.45, b.y - span * 0.3, b.x + span, b.y - Math.sin(a) * span);
      g.stroke();
    }
  }

  // ---------- loop ----------
  function targetFps(): number {
    if (seq || xfadeT0 >= 0 || mode === 'summit') return 60;
    if (typeof document !== 'undefined' && !document.hasFocus()) return 15;
    return 30;
  }

  function loop(ts: number) {
    raf = 0;
    if (!running || !mounted) return;
    const t = ts / 1000;
    const minGap = 1 / targetFps();
    if (lastFrame && t - lastFrame < minGap - 0.002) { raf = requestAnimationFrame(loop); return; }
    const dt = Math.min(0.1, lastFrame ? t - lastFrame : 1 / 30);
    lastFrame = t;
    const a = performance.now();
    sceneFrame(t, dt);
    record(performance.now() - a, t);
    if (reduced && !seq && xfadeT0 < 0) return;
    raf = requestAnimationFrame(loop);
  }

  function record(ms: number, t: number) {
    if (stats.frames === 0) stats.firstMs = Math.round(ms * 10) / 10;
    frameTimes.push(ms);
    if (frameTimes.length > 90) frameTimes.shift();
    stats.frames++;
    stats.avgMs = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    stats.maxMs = Math.max(...frameTimes);
    fpsCount++;
    if (t - fpsWindow >= 1) { stats.fps = fpsCount / (t - fpsWindow || 1); fpsCount = 0; fpsWindow = t; }
    if (frameTimes.length >= 90 && stats.avgMs > 22 && quality > 0.5) {
      quality = quality > 0.75 ? 0.75 : 0.5;
      stats.quality = quality;
      frameTimes.length = 0;
      applySize();
    }
  }

  function ensureLoop() {
    if (!mounted || !running || raf) return;
    lastFrame = 0;
    raf = requestAnimationFrame(loop);
  }

  /** Still frame (reduced motion): hold pose, camera set directly. */
  function drawNow() {
    if (!mounted) return;
    const t = nowS();
    const a = performance.now();
    sceneFrame(t, 1 / 30);
    record(performance.now() - a, t); // stills count as frames too (the reduced-motion cross-fade needs one)
    lastDraw = t;
  }

  function takeSnapshot() {
    if (!canvas) return;
    snapshot = mkCanvas(canvas.width, canvas.height);
    snapshot.getContext('2d')!.drawImage(canvas, 0, 0);
  }

  let reducedTimer = 0;
  function scheduleReducedRedraw() {
    if (typeof window === 'undefined') return;
    window.clearTimeout(reducedTimer);
    if (!reduced || !mounted || !running) return;
    // §4.9: while climbing, the key pose is re-posed once a second at the target (no breath, cloth or beard motion)
    reducedTimer = window.setTimeout(() => { drawNow(); scheduleReducedRedraw(); }, mode === 'climb' && (phase === 'focus' || phase === 'open') ? 1000 : 15000);
  }

  return {
    stats,
    mount(c: HTMLCanvasElement, opts: SceneInitOptions) {
      canvas = c;
      ctx = c.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas 2D unavailable');
      reduced = opts.reducedMotion;
      mounted = true;
      running = true;
      w = c.clientWidth || 800; h = c.clientHeight || 600;

      applySize();
      if (reduced) { drawNow(); scheduleReducedRedraw(); } else ensureLoop();
    },
    setProgress(p: number) {
      const q = Math.min(1, Math.max(0, p));
      if (phase === 'break' && q >= 1 && progress < 1 && mode === 'sit' && phaseSet) { crossfade(nowS()); mode = 'stand'; if (reduced) drawNow(); }
      progress = q;
    },
    setClimb(c: ClimbInput) {
      climb = { ...c };
      climbSet = true;
    },
    setPhase(next: ScenePhase, opts?: { instant?: boolean }) {
      const prev = phase;
      const t = nowS();
      const first = !phaseSet;
      if (!first && next === prev && !opts?.instant) return;
      phaseSet = true;
      phase = next;
      desatTarget = next === 'paused' ? 1 : 0;
      ensureTrail();
      if (first || opts?.instant) {
        seq = null; summitWalk = null;
        mode = next === 'complete' ? 'stand' : next === 'break' ? (progress >= 1 ? 'stand' : 'sit') : climb.atSummit ? 'stand' : 'climb';
        desatK = desatTarget;
        chains = null;
        if (mode === 'climb') gait.snap(sTarget(), trail);
      } else if (next === 'complete' && mode === 'stand') {
        // a +N extension from the summit ended: he is still standing on it
      } else if (next === 'complete' && (prev === 'focus' || prev === 'open' || prev === 'paused')) {
        if (reduced) { crossfade(t); mode = 'stand'; }
        else startSummitWalk(t, 'summit');
      } else if (next === 'break') {
        crossfade(t);
        seq = null; summitWalk = null;
        mode = 'sit';
      } else if ((next === 'focus' || next === 'open') && (prev === 'complete' || prev === 'break') && climb.atSummit) {
        // +N from the summit: the summit scene holds until the extension ends (never a second crest, U2)
        if (mode === 'sit') { crossfade(t); mode = 'stand'; }
      } else if ((next === 'focus' || next === 'open') && (prev === 'complete' || prev === 'break')) {
        beginNext();
      } else if (mode !== 'climb' && !climb.atSummit && (next === 'focus' || next === 'open' || next === 'paused')) {
        mode = 'climb'; summitWalk = null; gait.snap(sTarget(), trail);
      }
      if (reduced) drawNow(); else ensureLoop();
    },
    resize(width: number, height: number, dpr: number) {
      w = width; h = height; hostDpr = dpr;
      applySize();
      if (reduced) drawNow(); else ensureLoop();
    },
    setRunning(r: boolean) {
      running = r;
      if (!r) { if (raf) cancelAnimationFrame(raf); raf = 0; return; }
      if (seq && nowS() - seq.t0 > seq.dur + 6) seq = null;
      // Back from a hidden tab far behind: re-plant at the target under a short cross-fade, never a visible snap (U13).
      if (!reduced && mode === 'climb' && stats.frames > 0 && Math.abs(sTarget() - gait.D) > 4 * sigmaAt(trail.angleAt(gait.D))) {
        crossfade(nowS()); gait.snap(sTarget(), trail); camInit = false; chains = null;
      }
      if (reduced) { drawNow(); scheduleReducedRedraw(); } else ensureLoop();
    },
    setReducedMotion(r: boolean) {
      reduced = r;
      if (r) {
        if (raf) cancelAnimationFrame(raf); raf = 0;
        seq = null; xfadeT0 = -1;
        if (mode === 'summit') { summitWalk = null; mode = 'stand'; }
        drawNow(); scheduleReducedRedraw();
      }
      else ensureLoop();
    },
    destroy() {
      mounted = false; running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (typeof window !== 'undefined') window.clearTimeout(reducedTimer);
      boulderSprite = snapshot = null;
      strips.forEach((s) => { s.canvas = null; });
      clouds = [];
      chunkCache.clear();
      canvas = null; ctx = null;
    },
  };
  void noise1; void lastDraw;
}
