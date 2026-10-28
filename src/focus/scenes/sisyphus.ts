// "Sisyphus" focus scene, black-figure edition (ROUND3_ART; round 5 motion, ROUND5_SISYPHUS): a tracking close-up of
// a figure pushing a stone up an endless incline. One clock, the distance D, drives the walk, the stone and the camera;
// the summit appears only when a block completes. Flat fills and thin ochre lines.
import type { ClimbInput, SceneEngine, SceneInitOptions, ScenePhase } from './types';
import { INK, LW, NIGHT, PREDAWN_BAND, artStop, mixOk, mixStop, pausedStop, type ArtStop } from './artPalette';
import { softCap, buildBoulderSprite, buildCloudMass, buildStrip, drawContactArc, drawMoon, drawSky, drawStars, drawSun, makeStars, mkCanvas, type Star } from './artDraw';
import { camLayout, clampCamX, follow, toScreen, type Cam, type CamLayout } from './camera';
import { detailsIn, makeTrail, type Trail } from './trail';
import { M_PER_H, PACE_M, PREFIX_LEN } from '../../domain/mountain';
import { hash1, mulberry32, ridged, smoothstep } from './noise';
import type { V } from './path';
import { WALK, frac, sm, walkPose, type Secondary, type Skel, type WalkPose } from './walk';
import { Spring, assemble, blendParams, easeStd, paramsOf, sitParams, standParams, type PoseParams } from './poses';
import { drawFigure, figureTier } from './figure';
import { DEG, armToStone } from './walk';
import { birdSchedule, birdsAt, type BirdGroup } from './ambient';

type Mode = 'climb' | 'summit' | 'stand' | 'sit';
type SeqKind = 'summit' | 'mini' | 'next';
interface Seq { kind: SeqKind; t0: number; dur: number }

const SUMMIT_DUR = 6.0, MINI_DUR = 6.0, NEXT_DUR = 3.2, CROSSFADE_DUR = 0.4;
/** §5: the speed envelope's entrance (600 ms) and exit (400 ms); a new climb holds 0.3 s before it starts. */
const E_IN = 0.6, E_OUT = 0.4, NEXT_HOLD = 0.3;
/** §6.1: the summit push (peak cadence × SUMMIT_E), its quintic stop over the last DECEL_DIST, then the stand. */
const SUMMIT_E = 3.0, DECEL_DIST = 0.35, STAND_TAIL = 0.4;
const R = WALK.R; // H units

/** Debug/measurement hook read by the tests and the e2e scripts. */
export interface SceneStats {
  frames: number; avgMs: number; maxMs: number; fps: number; quality: number; particles: number; firstMs?: number;
  camX?: number; camY?: number; sLocal?: number; gait?: string; figureAlpha?: number; figureOnScreen?: boolean; slopeFrac?: number;
  zoom?: number; rangesDrawn?: number; cloudsDrawn?: number; stripBuilds?: number; rot?: number; sB?: number; figureMs?: number;
  tier?: number; clock?: number; figBox?: number[]; figBounds?: number[]; figureAvg?: number; cut?: boolean;
  /** Round 5: the distance clock, its envelope and phase, the rendered skeleton (world, H) and the camera. */
  D?: number; e?: number; phi?: number; skel?: Skel; centre?: V; Hpx?: number; anchor?: number[]; walking?: boolean; fpsCap?: number;
}

export function createSisyphus(): SceneEngine & { stats: SceneStats } {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let w = 0, h = 0, scale = 1, hostDpr = 1, quality = 1, fpsCap = 60;
  let reduced = false, running = false, raf = 0, mounted = false;
  let phase: ScenePhase = 'focus';
  let phaseSet = false;
  let progress = 0;
  let mode: Mode = 'climb';
  let seq: Seq | null = null;

  // ---------- climb state ----------
  let climb: ClimbInput = { stage: 1, stageStartM: 0, stageLenM: 1500 * PACE_M, posM: 0, fromSummit: false, summits: 0 };
  let climbSet = false;
  let trail: Trail = makeTrail({ stage: 1, startH: 0, lenH: climb.stageLenM / M_PER_H, fromSummit: false });
  let trailKey = '';
  /** Climber's target position along the current stage (H), from the domain (metres come from focused time). */
  const sTarget = () => (climbSet ? (climb.posM - climb.stageStartM) / M_PER_H : progress * (climb.stageLenM / M_PER_H));
  const lenH = () => climb.stageLenM / M_PER_H;
  /** Between setClimb updates the target advances at the pace (≤ 1.5 s), so it grows linearly, never in stairs. */
  let rawTgt = NaN, rawTgtT = 0;
  function dTarget(t: number): number {
    const raw = sTarget();
    if (raw !== rawTgt) { rawTgt = raw; rawTgtT = t; }
    return targetLive(t) ? Math.min(lenH(), raw + Math.min(1.5, Math.max(0, t - rawTgtT)) * WALK.v) : raw;
  }
  /** The target is advancing: focusing on a climb, fed within the last 1.5 s, short of the climb's end. */
  function targetLive(t: number): boolean {
    return mode === 'climb' && (phase === 'focus' || phase === 'open') && (!climbSet || t - rawTgtT < 1.5) && rawTgt < lenH() - 1e-6;
  }

  // ---------- the distance clock (§5) ----------
  /** Visual distance along the trail (H): every joint, the stone and the camera are functions of it. */
  let D = 0;
  /** Speed envelope ramp: e = smootherstep(eU); eU rises over 600 ms, falls over 400 ms. */
  let eU = 0, holdUntil = -1, lastDdot = 0;
  const envelope = () => sm(eU);

  /** Rebuild the trail when the climb changes; true when a new climb (stage) began. */
  function ensureTrail(): boolean {
    const key = `${climb.stage}|${climb.stageStartM.toFixed(2)}|${Math.round(climb.stageLenM * 10)}|${climb.fromSummit}`;
    if (key === trailKey) return false;
    const prevStage = trail.geom.spec.stage;
    trail = makeTrail({ stage: climb.stage, startH: climb.stageStartM / M_PER_H, lenH: lenH(), fromSummit: climb.fromSummit });
    trailKey = key;
    chunkCache.clear();
    standCache = null;
    if (prevStage !== climb.stage) { D = sTarget(); return true; }
    return false;
  }

  // ---------- summit / stand state ----------
  interface StandBase { Dstop: number; from: PoseParams; centre: V; sB: number; rot: number; psiWalk: number }
  let standCache: StandBase | null = null;
  /**
   * The summit spot: the stone at the top of the crest fillet (≤ 5°), the walk stopped in double support (φ = 0.06):
   * the nearest such D to the stone's spot (the spec's "first after" could add up to a stride to the push).
   */
  function standBase(): StandBase {
    if (standCache) return standCache;
    const Dstand = trail.geom.ledgeStart - 0.1 - WALK.dS;
    const Dstop = WALK.L * (Math.round(Dstand / WALK.L - 0.06) + 0.06);
    const wp = walkPose(trail, Dstop, 0);
    standCache = { Dstop, from: paramsOf(wp), centre: wp.centre, sB: wp.sB, rot: wp.rot, psiWalk: wp.psi[0] };
    return standCache;
  }
  interface Summit { kind: 'summit' | 'mini'; t0: number; e0: number; dec: { t0: number; D0: number; r: number; Td: number } | null; blendDur: number }
  let summit: Summit | null = null;
  let xfadeT0 = -1;

  // ---------- camera ----------
  let lay: CamLayout = camLayout(800, 600);
  const cam: Cam = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, zoom: 1, anchor: { x: 0, y: 0 } };
  let camInit = false;
  const S = (v: V) => toScreen(cam, lay.Hpx, v);
  const px = (hUnits: number) => hUnits * lay.Hpx * cam.zoom;

  // ---------- figure ----------
  /** Tertiary channels outside the walk (springs), and the last analytic values for the hand-off. */
  const springs = { beard: new Spring(), ringlet: new Spring(), flapF: new Spring(), flapB: new Spring() };
  let secPrev: Secondary | null = null, secVel: Secondary = { beard: 0, ringlet: 0, flapF: 0, flapB: 0 }, springsLive = false;

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

  const frameTimes: number[] = [];
  const stats: SceneStats = { frames: 0, avgMs: 0, maxMs: 0, fps: 0, quality: 1, particles: 0 };
  let fpsCount = 0, fpsWindow = 0;
  let lastFrame = 0, ambientT = 0;
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
    // §4.1: ρ = +centreArc(D + ΔS)/R, applied in screen space (y down) after toScreen, where a positive angle is
    // clockwise: the forward roll for a stone travelling up and to the right. Never inside a y-flipped transform.
    const rotCanvas = rot;
    g.rotate(rotCanvas);
    stats.rot = rotCanvas; stats.sB = sB;
    g.drawImage(boulderSprite, -size / 2, -size / 2, size, size);
    g.restore();
    const slope = (trail.angleAt(sB) * Math.PI) / 180;
    drawContactArc(g, c, Rpx, slope, LW(lay.Hpx * cam.zoom).fleck);
  }

  // ---------- sequences ----------
  function startSeq(kind: SeqKind, t: number) {
    const dur = kind === 'summit' ? SUMMIT_DUR : kind === 'mini' ? MINI_DUR : NEXT_DUR;
    seq = reduced ? null : { kind, t0: t, dur };
    ensureLoop();
  }

  /** A 400 ms cross-fade from the current frame (a cut that never pops). */
  function crossfade(t: number) {
    if (!mounted || !canvas || stats.frames === 0) return;
    takeSnapshot();
    xfadeT0 = t;
    ensureLoop();
  }

  /** §6.1: the block ends: the walk speeds up to a triumphant last push and stops in double support on the ledge. */
  function startSummit(t: number, kind: 'summit' | 'mini') {
    mode = 'summit';
    summit = { kind, t0: t, e0: Math.max(envelope(), 0.6), dec: null, blendDur: 1.2 };
    D = Math.min(D, standBase().Dstop);
    startSeq(kind, t);
  }

  /**
   * §6.3: the next climb is a clean cut (a 0.4 s cross-fade) to the col, the figure in its standing push pose in double
   * support (φ = 0.06) with e = 0; after a 0.3 s hold the walk eases in over 600 ms. The first step grows out of it.
   */
  function beginNext(t: number) {
    crossfade(t);
    mode = 'climb';
    summit = null; seq = null;
    const tgt = sTarget();
    D = WALK.L * (Math.floor(tgt / WALK.L - 0.06) + 0.06);
    eU = 0; holdUntil = t + NEXT_HOLD;
    camInit = false; springsLive = false; secPrev = null;
    rebuildAll = true;
  }

  // ---------- frame ----------
  let altNow = 0;

  /**
   * Summit framing: zoom 0.62 (portrait 0.72) on the stand spot, which sits at (0.30 w, 0.62 h) (portrait
   * (0.20 w, 0.62 h)), so the pull-back keeps the walking figure in frame and opens the ledge and the cairn ahead.
   */
  function summitFrame(): { pos: V; anchor: V; zoom: number } {
    const spot = trail.at(standBase().Dstop);
    return { pos: spot, anchor: lay.landscape ? { x: 0.30 * w, y: 0.62 * h } : { x: 0.20 * w, y: 0.62 * h }, zoom: lay.landscape ? 0.62 : 0.72 };
  }

  /**
   * §3.7: while climbing (and through the summit push) the camera is rigid on the ground point at D: no spring, no
   * filter, so the ground scrolls at exactly the planted foot's speed. The end clamp (a soft minimum, width 0.3 H)
   * keeps the crest off screen during a block. Set pieces follow and pull back to the summit framing.
   */
  function updateCamera(t: number, dt: number) {
    const sf = summitFrame();
    let zoomK = 0;
    if (phase === 'complete' || phase === 'break' || mode !== 'climb') {
      zoomK = seq && (seq.kind === 'summit' || seq.kind === 'mini') ? smoothstep(0.5, 4.0, t - seq.t0) : mode === 'climb' ? 0 : 1;
      if (reduced && mode !== 'climb') zoomK = 1;
    }
    const ez = zoomK * zoomK * (3 - 2 * zoomK);
    const crestX = trail.at(trail.geom.crestS - 0.3).x;
    const limitX = clampCamX(Infinity, crestX, w, lay.anchor.x, lay.Hpx);
    if (mode === 'climb' || mode === 'summit') {
      const p = trail.at(D);
      const x = mode === 'climb' ? 0.5 * (p.x + limitX - Math.sqrt((p.x - limitX) * (p.x - limitX) + 0.09)) : p.x;
      cam.vel = { x: (x - cam.pos.x) / Math.max(1e-3, dt), y: (p.y - cam.pos.y) / Math.max(1e-3, dt) };
      cam.pos = { x, y: p.y };
      camInit = true;
    } else {
      const target = trail.at(standBase().Dstop);
      if (!camInit || reduced) { cam.pos = { ...target }; cam.vel = { x: 0, y: 0 }; camInit = true; } else follow(cam, target, dt, 2.2);
    }
    const trackPos = mode === 'climb' ? { x: Math.min(cam.pos.x, limitX), y: cam.pos.y } : { ...cam.pos };
    if (ez > 0) {
      // the summit framing is centred on the stand spot: while he pushes toward it the camera stays on him (only the
      // anchor and the zoom ease), so he can never walk out of frame; he arrives exactly at the framing's spot
      const kp = mode === 'summit' ? 0 : ez;
      const p = { x: trackPos.x + (sf.pos.x - trackPos.x) * kp, y: trackPos.y + (sf.pos.y - trackPos.y) * kp };
      renderCam = { pos: p, anchor: { x: lay.anchor.x + (sf.anchor.x - lay.anchor.x) * ez, y: lay.anchor.y + (sf.anchor.y - lay.anchor.y) * ez }, zoom: 1 + (sf.zoom - 1) * ez };
    } else renderCam = { pos: { ...trackPos }, anchor: { ...lay.anchor }, zoom: 1 };
  }
  let renderCam = { pos: { x: 0, y: 0 }, anchor: { x: 0, y: 0 }, zoom: 1 };
  let cut = false;

  /** §5: the visual integrator. Ḋ = v·e·(1 + 0.03·tanh((D* − D)/0.3)) ≥ 0: D never decreases during a block. */
  function stepClock(t: number, dt: number) {
    const tgt = dTarget(t);
    if (Math.abs(tgt - D) > 0.5) { if (stats.frames > 0 && !reduced) crossfade(t); D = tgt; }
    const want = targetLive(t) && t >= holdUntil && !seq ? 1 : 0;
    eU = want ? Math.min(1, eU + dt / E_IN) : Math.max(0, eU - dt / E_OUT);
    const e = envelope();
    lastDdot = WALK.v * e * (1 + 0.03 * Math.tanh((tgt - D) / 0.3));
    D += lastDdot * dt;
  }

  /** The summit push (§6.1): the cadence eases up to ×SUMMIT_E, then a quintic stop lands exactly on Dstop. */
  function stepSummit(t: number, dt: number) {
    const sm0 = summit!, base = standBase();
    if (!sm0.dec) {
      const e = sm0.e0 + (SUMMIT_E - sm0.e0) * sm((t - sm0.t0) / 1.2);
      lastDdot = WALK.v * e;
      D += lastDdot * dt;
      const r = base.Dstop - D;
      if (r <= DECEL_DIST) {
        const Td = (2 * Math.max(1e-3, r)) / Math.max(1e-3, lastDdot);
        sm0.dec = { t0: t, D0: D, r: Math.max(0, r), Td };
        sm0.blendDur = Td + STAND_TAIL;
      }
      return;
    }
    const s = Math.min(1, (t - sm0.dec.t0) / sm0.dec.Td);
    // quintic: p(0) = 0, p'(0) = 2 (the push speed), p''(0) = 0, p(1) = 1, p'(1) = p''(1) = 0
    const P = 2 * (s - 6 * s ** 3 + 8 * s ** 4 - 3 * s ** 5) + (10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5);
    const prev = D;
    D = sm0.dec.D0 + sm0.dec.r * P;
    lastDdot = (D - prev) / Math.max(1e-6, dt);
  }

  /** Tertiary channels: analytic while walking; springs (seeded from the analytic value and slope) otherwise. */
  function secondary(analytic: Secondary | null, rest: Secondary, k: number, dt: number): Secondary {
    if (analytic && k <= 0) {
      if (secPrev && dt > 0) secVel = { beard: (analytic.beard - secPrev.beard) / dt, ringlet: (analytic.ringlet - secPrev.ringlet) / dt, flapF: (analytic.flapF - secPrev.flapF) / dt, flapB: (analytic.flapB - secPrev.flapB) / dt };
      secPrev = analytic; springsLive = false;
      return analytic;
    }
    if (!springsLive) {
      const a = secPrev ?? rest;
      (Object.keys(springs) as Array<keyof Secondary>).forEach((key) => springs[key].set(a[key], secPrev ? secVel[key] : 0));
      springsLive = true;
    }
    const out = {} as Secondary;
    (Object.keys(springs) as Array<keyof Secondary>).forEach((key) => {
      const target = analytic ? analytic[key] * (1 - k) + rest[key] * k : rest[key];
      out[key] = reduced ? target : springs[key].step(target, dt);
    });
    return out;
  }

  /** The pose for this frame, the stone and its rotation. */
  function figureState(t: number, dt: number): { skel: Skel; centre: V; rot: number; sB: number; walk: WalkPose | null } {
    const ground = (x: number) => trail.groundY(x);
    if (mode === 'climb') {
      // reduced motion: the static key pose at toe-off (φ = 0.62) at the current D (§6.5)
      const Dw = reduced ? WALK.L * (Math.floor(D / WALK.L) + 0.62) : D;
      const wp = walkPose(trail, Dw, ambientT);
      wp.sec = secondary(wp.sec, wp.sec, 0, dt);
      return { skel: wp, centre: wp.centre, rot: wp.rot, sB: wp.sB, walk: wp };
    }
    if (mode === 'summit' && summit) {
      const base = standBase();
      const wp = walkPose(trail, D, ambientT);
      const k = summit.dec ? easeStd((t - summit.dec.t0) / summit.blendDur) : 0;
      const stand = standParams(base.from, wp.centre, ambientT, undefined, ground);
      const sec = secondary(wp.sec, stand.sec, k, dt);
      let skel: Skel = wp;
      if (k > 0) {
        const p = blendParams(paramsOf(wp), stand, k);
        // the near palm slides round the stone (polar blend), never through it
        const psiS = Math.atan2(stand.hands[0].origin.y - wp.centre.y, stand.hands[0].origin.x - wp.centre.x);
        let dpsi = psiS - wp.psi[0]; while (dpsi > Math.PI) dpsi -= 2 * Math.PI; while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
        // (and keeps the arm long: from the blended angle it creeps to where the elbow stays in its band)
        const ub = assemble(p);
        p.hands[0] = armToStone(ub.shoulder, wp.centre, wp.psi[0] + dpsi * k, 1, 0, 40 * DEG).hand;
        p.armOff[0] = { x: 0, y: 0 };
        skel = assemble(p);
      }
      skel.sec = sec;
      if (summit.dec && t - summit.dec.t0 >= summit.blendDur) { mode = 'stand'; summit = null; D = base.Dstop; }
      return { skel, centre: wp.centre, rot: wp.rot, sB: wp.sB, walk: wp };
    }
    const base = standBase();
    const p = mode === 'sit' ? sitParams(base.centre, ambientT, ground) : standParams(base.from, base.centre, ambientT, undefined, ground);
    p.sec = secondary(null, p.sec, 1, dt);
    if (mode === 'stand') {
      // the same long-arm rule as the stand blend's last frame (no pop at the hand-off)
      const psi = Math.atan2(p.hands[0].origin.y - base.centre.y, p.hands[0].origin.x - base.centre.x);
      p.hands[0] = armToStone(assemble(p).shoulder, base.centre, psi, 1, 0, 40 * DEG).hand;
    }
    return { skel: assemble(p), centre: base.centre, rot: base.rot, sB: base.sB, walk: null };
  }

  function sceneFrame(t: number, dt: number) {
    if (!ctx || !canvas) return;
    if (seq && t - seq.t0 >= seq.dur) seq = null;
    if (desatK !== desatTarget) { const step = dt / 0.4; desatK = desatTarget > desatK ? Math.min(desatTarget, desatK + step) : Math.max(desatTarget, desatK - step); }
    // A new climb while focusing (an open-ended block's hourly summit): cut to the next col.
    if (ensureTrail() && (phase === 'focus' || phase === 'open') && phaseSet && !climb.atSummit) beginNext(t);
    // An open-ended block's hourly summit (review U8): the push onto the ledge and the stand.
    if (climb.atSummit && mode === 'climb' && (phase === 'focus' || phase === 'open') && phaseSet) {
      if (reduced || stats.frames === 0) mode = 'stand';
      else startSummit(t, 'mini');
    }

    // The clock. Breath and wind freeze with the walk when paused (they run on the envelope).
    if (mode === 'climb') { if (reduced) D = dTarget(t); else stepClock(t, dt); }
    else if (mode === 'summit') stepSummit(t, dt);
    ambientT += dt * (mode === 'climb' && !reduced ? envelope() : phase === 'paused' ? 0 : 1);

    const fs = figureState(t, dt);
    const { skel, centre, rot, sB } = fs;
    updateCamera(t, dt);
    cam.anchor = renderCam.anchor; const keepPos = cam.pos; cam.pos = renderCam.pos; cam.zoom = renderCam.zoom;
    stoneScreenX = S(centre).x;

    // Altitude parallax: 0 at the climb start, 1 at its end.
    const tp = trail.at(mode === 'climb' || mode === 'summit' ? D : standBase().Dstop);
    const lh = Math.max(1e-3, trail.at(trail.geom.crestS).y - trail.at(0).y);
    altNow = Math.min(1, Math.max(0, (tp.y - trail.at(0).y) / lh));

    const ss = skyState(t);
    stop = desatK > 0 ? pausedStop(ss.stop, Math.round(desatK * 4) / 4) : ss.stop;
    const g = ctx;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    const band = desatK > 0 ? pausedStop({ ...ss.stop, band: ss.band }, Math.round(desatK * 4) / 4).band : ss.band;
    drawSky(g, w, h, stop, layerTop(0, altNow) - 0.22 * (layerTop(0, altNow)), layerTop(0, altNow) + h, band);
    if (ss.moon) drawMoon(g, ss.moon, 0.035 * h);
    drawStars(g, stars, ss.starVis, ss.twinkle ? ambientT : null);
    if (ss.sun) drawSun(g, ss.sun, 0.055 * h, stop, ss.sunRing);

    // Strips: staged rebuilds; a reduced-motion still builds everything it needs at once (review U5).
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
    if (mode !== 'climb' || phase === 'complete' || phase === 'break') drawCairn(g, trail.geom.ledgeEnd - 0.25, true);
    if (climb.fromSummit) drawCairn(g, -PREFIX_LEN + 1.5 - 0.25, true);

    // Stone, then the figure.
    drawBoulder(g, centre, rot, sB);
    const Hz = lay.Hpx * cam.zoom;
    const flush = (globalThis as { __flushTiming?: boolean }).__flushTiming === true;
    if (flush) g.getImageData(0, 0, 1, 1);
    const tF = performance.now();
    drawFigure(g, skel, { toS: S, Hpx: lay.Hpx, zoom: cam.zoom, scale, quality, stone: { centre, R } });
    if (flush) g.getImageData(0, 0, 1, 1);
    stats.figureMs = performance.now() - tF; stats.tier = figureTier(Hz, quality);
    stats.figureAvg = stats.frames ? (stats.figureAvg ?? stats.figureMs) * 0.95 + stats.figureMs * 0.05 : stats.figureMs;
    stats.cut = cut; cut = false;

    if (xfadeT0 >= 0 && snapshot) {
      const k = 1 - Math.min(1, (t - xfadeT0) / CROSSFADE_DUR);
      if (k <= 0) { xfadeT0 = -1; snapshot = null; }
      else { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = k; g.drawImage(snapshot, 0, 0); g.globalAlpha = 1; }
    }
    // Framing checks (read by the tests): the figure is drawn and on screen, the slope fills a sensible share.
    const ps = S(skel.pelvis);
    stats.figureAlpha = 1;
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
      const pts = [skel.pelvis, skel.shoulder, skel.head, ...skel.legs.flatMap((l) => [l.knee, l.ankle]), ...skel.arms.flatMap((a) => [a.elbow, a.wrist]), ...skel.feet.flatMap((f) => [f.heel, f.toe])].map(S);
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      stats.figBounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const c0 = S({ x: centre.x - R, y: centre.y + R }), c1 = S({ x: centre.x + R, y: centre.y - R });
      stats.figBox = [Math.min(stats.figBounds[0], c0.x) - 30, Math.min(stats.figBounds[1], c0.y) - 30, Math.max(stats.figBounds[2], c1.x) + 30, Math.max(stats.figBounds[3], c1.y) + 20];
    }
    stats.Hpx = lay.Hpx; stats.anchor = [cam.anchor.x, cam.anchor.y];
    cam.pos = keepPos;
    stats.camX = renderCam.pos.x; stats.camY = renderCam.pos.y; stats.clock = t;
    stats.D = D; stats.sLocal = D; stats.e = mode === 'climb' ? envelope() : lastDdot / WALK.v; stats.phi = frac(D / WALK.L);
    stats.skel = skel; stats.centre = centre; stats.walking = mode === 'climb' || mode === 'summit'; stats.fpsCap = fpsCap;
    stats.gait = mode;
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
  /** §0: 60 fps while climbing (focused tab, full quality), set pieces and cross-fades; otherwise 30; hidden 15. */
  function targetFps(): number {
    if (typeof document !== 'undefined' && !document.hasFocus()) return 15;
    if (seq || xfadeT0 >= 0 || mode === 'summit') return 60;
    if (mode === 'climb' && (phase === 'focus' || phase === 'open') && quality >= 1) return fpsCap;
    return 30;
  }

  function loop(ts: number) {
    raf = 0;
    if (!running || !mounted) return;
    const t = ts / 1000;
    const minGap = 1 / targetFps();
    if (lastFrame && t - lastFrame < minGap - 0.002) { raf = requestAnimationFrame(loop); return; }
    const dt = Math.min(0.1, lastFrame ? t - lastFrame : 1 / 60);
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
    // §8 F3: over 10 ms on average for 90 frames, drop to 30 fps, then to the lighter tier (time-based: same speed)
    if (frameTimes.length >= 90 && stats.avgMs > 10) {
      if (fpsCap > 30) fpsCap = 30;
      else if (quality > 0.75) { quality = 0.75; stats.quality = quality; applySize(); }
      else if (stats.avgMs > 22 && quality > 0.5) { quality = 0.5; stats.quality = quality; applySize(); }
      frameTimes.length = 0;
    }
  }

  function ensureLoop() {
    if (!mounted || !running || raf) return;
    lastFrame = 0;
    raf = requestAnimationFrame(loop);
  }

  /** Still frame (reduced motion): the key pose, camera set directly. */
  function drawNow() {
    if (!mounted) return;
    const t = nowS();
    const a = performance.now();
    sceneFrame(t, 1 / 30);
    record(performance.now() - a, t);
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
    // §6.5: re-posed every 10 s at the current D, an instant cut (no breath, cloth or ramps)
    reducedTimer = window.setTimeout(() => { drawNow(); scheduleReducedRedraw(); }, mode === 'climb' && (phase === 'focus' || phase === 'open') ? 10000 : 15000);
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
        seq = null; summit = null;
        mode = next === 'complete' ? 'stand' : next === 'break' ? (progress >= 1 ? 'stand' : 'sit') : climb.atSummit ? 'stand' : 'climb';
        desatK = desatTarget;
        springsLive = false; secPrev = null;
        if (mode === 'climb') { D = sTarget(); eU = 0; holdUntil = -1; }
      } else if (next === 'complete' && mode === 'stand') {
        // a +N extension from the summit ended: he is still standing on it
      } else if (next === 'complete' && (prev === 'focus' || prev === 'open' || prev === 'paused')) {
        if (reduced) { crossfade(t); mode = 'stand'; } else startSummit(t, 'summit');
      } else if (next === 'break') {
        // (the seated pose faces downhill: a profile can't turn round, so the break is a 0.4 s cross-fade)
        crossfade(t);
        seq = null; summit = null;
        mode = 'sit';
      } else if ((next === 'focus' || next === 'open') && (prev === 'complete' || prev === 'break') && climb.atSummit) {
        // +N from the summit: the summit scene holds until the extension ends (never a second crest, U2)
        if (mode === 'sit') { crossfade(t); mode = 'stand'; }
      } else if ((next === 'focus' || next === 'open') && (prev === 'complete' || prev === 'break')) {
        beginNext(t);
      } else if (mode !== 'climb' && mode !== 'summit' && !climb.atSummit && (next === 'focus' || next === 'open' || next === 'paused')) {
        mode = 'climb'; summit = null; D = sTarget(); eU = 0;
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
      if (!reduced && mode === 'climb' && stats.frames > 0 && Math.abs(sTarget() - D) > 0.5) { crossfade(nowS()); D = sTarget(); camInit = false; }
      if (reduced) { drawNow(); scheduleReducedRedraw(); } else ensureLoop();
    },
    setReducedMotion(r: boolean) {
      reduced = r;
      if (r) {
        if (raf) cancelAnimationFrame(raf); raf = 0;
        seq = null; xfadeT0 = -1;
        if (mode === 'summit') { summit = null; mode = 'stand'; }
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
}
