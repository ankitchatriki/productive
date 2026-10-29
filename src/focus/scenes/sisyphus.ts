// "Sisyphus" focus scene, round 6 (ROUND6_PLAN): a photographic, sepia-toned print of a small figure pushing a great
// stone up the crest of an endless cliff. The engine keeps round 5's motion: one distance clock D drives the walk,
// the stone's roll and a rigid camera; the summit stays hidden until a block ends. It draws nothing itself: each
// frame it builds a FrameModel and hands it to a renderer (WebGL, or a Canvas 2D fallback).
import type { ClimbInput, SceneEngine, SceneInitOptions, ScenePhase } from './types';
import { camLayout, clampCamX, follow, toScreen, type Cam, type CamLayout } from './camera';
import { makeTrail, type Trail } from './trail';
import { M_PER_H, PACE_M, MOUNTAIN_SEED } from '../../domain/mountain';
import { fbm1, hash1, noise1, ridged, smoothstep } from './noise';
import type { V } from './path';
import { DEG, WALK, armToStone, footFromBall, frac, sm, walkPose, type Skel, type WalkPose } from './walk';
import { assemble, blendParams, easeStd, paramsOf, sitParams, standParams, type PoseParams } from './poses';
import { birdSchedule, birdsAt, type BirdGroup } from './ambient';
import type { BirdModel, FrameModel } from './frameModel';
import { NullRenderer, rendererOverride, type Renderer } from './render/renderer';
import { GLRenderer } from './render/glRenderer';
import { CanvasRenderer } from './render/canvasRenderer';
import { gradeFor, type Grade } from './render/tone';

type Mode = 'climb' | 'summit' | 'stand' | 'sit';

/**
 * The broken crest (ROUND6 §3.4): bites below the walking line (H), never above it; zero within the contact windows
 * under the feet and the stone, so they stand exactly on the trail; rocky and notched everywhere else.
 */
export function crestBite(wx: number, contacts: number[], seed: number): number {
  let win = 1;
  for (const c of contacts) win = Math.min(win, smoothstep(0.15, 0.6, Math.abs(wx - c)));
  if (win <= 0) return 0;
  // REVIEW_ROUND6 A2: one real notch per ~4 H (0.06–0.12 H deep, 0.3–0.6 H wide), as well as the small breakage
  const cell = Math.floor(wx / 4), cx = (cell + 0.2 + 0.6 * hash1(cell * 1.7 + seed)) * 4;
  const hw = 0.15 + 0.15 * hash1(cell * 2.3 + seed + 5), dep = 0.06 + 0.06 * hash1(cell * 3.1 + seed + 9);
  const u = Math.abs(wx - cx) / hw;
  const notch = u < 1 ? dep * (1 - Math.pow(u, 1.6)) * (0.8 + 0.2 * noise1(wx * 13 + seed)) : 0;
  return (0.060 * smoothstep(0.42, 0.72, fbm1(wx * 2.2 + seed, 4)) + 0.025 * ridged(wx * 9 + 3, 3) + 0.06 * smoothstep(0.72, 0.92, noise1(wx / 1.1 + seed)) + notch) * win;
}
type SeqKind = 'summit' | 'mini' | 'next';
interface Seq { kind: SeqKind; t0: number; dur: number }

const SUMMIT_DUR = 6.0, MINI_DUR = 6.0, NEXT_DUR = 3.2, CROSSFADE_DUR = 0.4;
/** §5 (round 5): the speed envelope's entrance (600 ms) and exit (400 ms); a new climb holds 0.3 s before it starts. */
const E_IN = 0.6, E_OUT = 0.4, NEXT_HOLD = 0.3;
/** The summit push (peak cadence × SUMMIT_E), its quintic stop over the last DECEL_DIST, the stand's tail. When the
 *  stand spot is more than PUSH_MAX away (round 6's longer END_LEAD), the beat opens with a cut to PUSH_FROM before it. */
const SUMMIT_E = 2.0, DECEL_DIST = 0.35, STAND_TAIL = 0.6, PUSH_MAX = 1.6, PUSH_FROM = 1.2; // review Z2: ×2, not ×3
const R = WALK.R; // H units

/** Debug/measurement hook read by the tests and the e2e scripts. */
export interface SceneStats {
  frames: number; avgMs: number; maxMs: number; fps: number; quality: number; particles: number; firstMs?: number;
  camX?: number; camY?: number; sLocal?: number; gait?: string; figureAlpha?: number; figureOnScreen?: boolean; slopeFrac?: number;
  zoom?: number; rot?: number; sB?: number; clock?: number; figBox?: number[]; figBounds?: number[]; cut?: boolean;
  D?: number; e?: number; phi?: number; skel?: Skel; centre?: V; Hpx?: number; anchor?: number[]; walking?: boolean; fpsCap?: number;
  lastMs?: number; poseMs?: number; renderer?: string; grade?: Grade; birds?: number;
}

export function createSisyphus(): SceneEngine & { stats: SceneStats; model(): FrameModel | null; renderer(): Renderer | null } {
  let canvas: HTMLCanvasElement | null = null;
  let renderer: Renderer | null = null;
  let w = 0, h = 0, hostDpr = 1, quality = 1, fpsCap = 60;
  let reduced = false, running = false, raf = 0, mounted = false;
  let phase: ScenePhase = 'focus';
  let phaseSet = false;
  let progress = 0;
  let mode: Mode = 'climb';
  let seq: Seq | null = null;
  let lastModel: FrameModel | null = null;

  // ---------- climb state ----------
  let climb: ClimbInput = { stage: 1, stageStartM: 0, stageLenM: 1500 * PACE_M, posM: 0, fromSummit: false, summits: 0 };
  let climbSet = false;
  let trail: Trail = makeTrail({ stage: 1, startH: 0, lenH: climb.stageLenM / M_PER_H, fromSummit: false });
  let trailKey = '';
  const sTarget = () => (climbSet ? (climb.posM - climb.stageStartM) / M_PER_H : progress * (climb.stageLenM / M_PER_H));
  const lenH = () => climb.stageLenM / M_PER_H;
  let rawTgt = NaN, rawTgtT = 0;
  function dTarget(t: number): number {
    const raw = sTarget();
    if (raw !== rawTgt) { rawTgt = raw; rawTgtT = t; }
    return targetLive(t) ? Math.min(lenH(), raw + Math.min(1.5, Math.max(0, t - rawTgtT)) * WALK.v) : raw;
  }
  function targetLive(t: number): boolean {
    return mode === 'climb' && (phase === 'focus' || phase === 'open') && (!climbSet || t - rawTgtT < 1.5) && rawTgt < lenH() - 1e-6;
  }

  // ---------- the distance clock (round 5 §5) ----------
  let D = 0;
  let eU = 0, holdUntil = -1, lastDdot = 0;
  const envelope = () => sm(eU);

  function ensureTrail(): boolean {
    const key = `${climb.stage}|${climb.stageStartM.toFixed(2)}|${Math.round(climb.stageLenM * 10)}|${climb.fromSummit}`;
    if (key === trailKey) return false;
    const prevStage = trail.geom.spec.stage;
    trail = makeTrail({ stage: climb.stage, startH: climb.stageStartM / M_PER_H, lenH: lenH(), fromSummit: climb.fromSummit });
    trailKey = key;
    standCache = null;
    if (prevStage !== climb.stage) { D = sTarget(); return true; }
    return false;
  }
  /** Each climb has its own rock (§3.4). */
  const seed = () => Math.floor(hash1(MOUNTAIN_SEED * 0.001 + climb.stage * 7.31) * 1e6);

  // ---------- summit / stand state ----------
  interface StandBase { Dstop: number; from: PoseParams; centre: V; sB: number; rot: number; psiWalk: number }
  let standCache: StandBase | null = null;
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
  let xfadeT0 = -1, cutNow = false;

  // ---------- camera ----------
  let lay: CamLayout = camLayout(800, 600);
  const cam: Cam = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, zoom: 1, anchor: { x: 0, y: 0 } };
  let camInit = false;
  let renderCam = { pos: { x: 0, y: 0 }, anchor: { x: 0, y: 0 }, zoom: 1 };

  // ---------- atmosphere ----------
  let birds: BirdGroup[] = [];
  let birdT0 = -1;
  let grade: Grade = gradeFor('focus', 0);
  let gradeSet = false;
  let pausedK = 0, skyDrift = 0, skyEvolve = 0, grainT = 0;
  let summitOpen = 0;

  const frameTimes: number[] = [];
  const stats: SceneStats = { frames: 0, avgMs: 0, maxMs: 0, fps: 0, quality: 1, particles: 0 };
  let fpsCount = 0, fpsWindow = 0;
  let lastFrame = 0, ambientT = 0;
  const nowS = () => performance.now() / 1000;

  // ---------- renderer ----------
  function pickRenderer(c: HTMLCanvasElement): Renderer {
    const list: Renderer[] = rendererOverride()?.() ?? [new GLRenderer(), new CanvasRenderer()];
    for (const r of list) {
      if (r.mount(c)) { r.onFail = () => fallBack(); return r; }
    }
    const n = new NullRenderer(); n.mount(); return n;
  }
  /** The GL context was lost twice in a minute: the rest of the session uses Canvas 2D. */
  function fallBack() {
    if (!canvas || renderer?.kind !== 'gl') return;
    renderer.destroy();
    const fresh = document.createElement('canvas');
    fresh.className = canvas.className;
    fresh.style.cssText = canvas.style.cssText;
    canvas.replaceWith?.(fresh);
    canvas = fresh;
    const c2 = new CanvasRenderer();
    renderer = c2.mount(fresh) ? c2 : new NullRenderer();
    renderer.resize(w, h, hostDpr);
  }

  function applySize() {
    if (!canvas || w <= 0 || h <= 0) return;
    lay = camLayout(w, h);
    cam.anchor = { ...lay.anchor };
    const q = quality >= 1 ? 1 : quality >= 0.75 ? 0.8 : 0.65;
    renderer?.resize(w, h, hostDpr * q);
    camInit = false;
  }

  // ---------- sequences ----------
  function startSeq(kind: SeqKind, t: number) {
    const dur = kind === 'summit' ? SUMMIT_DUR : kind === 'mini' ? MINI_DUR : NEXT_DUR;
    seq = reduced ? null : { kind, t0: t, dur };
    ensureLoop();
  }
  function crossfade(t: number) {
    if (!mounted || stats.frames === 0) return;
    cutNow = true;
    xfadeT0 = t;
    ensureLoop();
  }
  function startSummit(t: number, kind: 'summit' | 'mini') {
    mode = 'summit';
    const base = standBase();
    // round 6: the stand spot can be ~4 H away (END_LEAD 4.7); the beat opens with a cut to the last push
    if (base.Dstop - D > PUSH_MAX) { crossfade(t); D = base.Dstop - PUSH_FROM; eU = 1; camInit = false; }
    summit = { kind, t0: t, e0: envelope(), dec: null, blendDur: 1.2 };
    D = Math.min(D, base.Dstop);
    startSeq(kind, t);
  }
  function beginNext(t: number) {
    crossfade(t);
    mode = 'climb';
    summit = null; seq = null;
    const tgt = sTarget();
    D = WALK.L * (Math.round(tgt / WALK.L - 0.06) + 0.06);
    eU = 0; holdUntil = t + NEXT_HOLD;
    camInit = false;
  }

  // ---------- camera ----------
  function summitFrame(): { pos: V; anchor: V; zoom: number } {
    const spot = trail.at(standBase().Dstop);
    return { pos: spot, anchor: lay.landscape ? { x: 0.30 * w, y: 0.66 * h } : { x: 0.22 * w, y: 0.64 * h }, zoom: lay.landscape ? 0.62 : 0.72 };
  }
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
      const kp = mode === 'summit' ? 0 : ez;
      const p = { x: trackPos.x + (sf.pos.x - trackPos.x) * kp, y: trackPos.y + (sf.pos.y - trackPos.y) * kp };
      renderCam = { pos: p, anchor: { x: lay.anchor.x + (sf.anchor.x - lay.anchor.x) * ez, y: lay.anchor.y + (sf.anchor.y - lay.anchor.y) * ez }, zoom: 1 + (sf.zoom - 1) * ez };
    } else renderCam = { pos: { ...trackPos }, anchor: { ...lay.anchor }, zoom: 1 };
    summitOpen = ez;
  }

  // ---------- motion ----------
  function stepClock(t: number, dt: number) {
    const tgt = dTarget(t);
    if (Math.abs(tgt - D) > 0.5) { if (stats.frames > 0 && !reduced) crossfade(t); D = tgt; }
    const want = targetLive(t) && t >= holdUntil && !seq ? 1 : 0;
    eU = want ? Math.min(1, eU + dt / E_IN) : Math.max(0, eU - dt / E_OUT);
    const e = envelope();
    lastDdot = WALK.v * e * (1 + 0.03 * Math.tanh((tgt - D) / 0.3));
    D += lastDdot * dt;
  }
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
    const P = 2 * (s - 6 * s ** 3 + 8 * s ** 4 - 3 * s ** 5) + (10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5);
    const prev = D;
    D = sm0.dec.D0 + sm0.dec.r * P;
    lastDdot = (D - prev) / Math.max(1e-6, dt);
  }

  function figureState(t: number): { skel: Skel; centre: V; rot: number; sB: number; walk: WalkPose | null } {
    const ground = (x: number) => trail.groundY(x);
    if (mode === 'climb') {
      // reduced motion: the static key pose at toe-off (φ = 0.62) at the current D
      const Dw = reduced ? WALK.L * (Math.floor(D / WALK.L) + 0.62) : D;
      const wp = walkPose(trail, Dw, ambientT);
      return { skel: wp, centre: wp.centre, rot: wp.rot, sB: wp.sB, walk: wp };
    }
    if (mode === 'summit' && summit) {
      const base = standBase();
      const wp = walkPose(trail, D, ambientT);
      const k = summit.dec ? easeStd((t - summit.dec.t0) / summit.blendDur) : 0;
      const stand = standParams(base.from, wp.centre, ambientT, undefined, ground);
      let skel: Skel = wp;
      if (k > 0) {
        const p = blendParams(paramsOf(wp), stand, k);
        // the feet are never blended: they walk to their planted spots; once stopped, the rear heel lowers
        const tStop = summit.dec!.t0 + summit.dec!.Td;
        const kh = easeStd((t - tStop) / STAND_TAIL);
        p.feet = wp.feet.map((ft) => {
          const ga = Math.atan2(ground(ft.ball.x + 0.01) - ground(ft.ball.x - 0.01), 0.02);
          return kh > 0 ? footFromBall(ft.ball, ft.ang + (ga - ft.ang) * kh, true, ft.ballS, ft.peel * (1 - kh)) : ft;
        }) as typeof p.feet;
        const psiS = Math.atan2(stand.hands[0].origin.y - wp.centre.y, stand.hands[0].origin.x - wp.centre.x);
        let dpsi = psiS - wp.psi[0]; while (dpsi > Math.PI) dpsi -= 2 * Math.PI; while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
        const ub = assemble(p);
        p.hands[0] = armToStone(ub.shoulder, wp.centre, wp.psi[0] + dpsi * k, 1, 0, 40 * DEG).hand;
        skel = assemble(p);
      }
      if (summit.dec && t - summit.dec.t0 >= summit.blendDur) { mode = 'stand'; summit = null; D = base.Dstop; }
      return { skel, centre: wp.centre, rot: wp.rot, sB: wp.sB, walk: wp };
    }
    const base = standBase();
    const p = mode === 'sit' ? sitParams(base.centre, ambientT, ground) : standParams(base.from, base.centre, ambientT, undefined, ground);
    if (mode === 'stand') {
      const psi = Math.atan2(p.hands[0].origin.y - base.centre.y, p.hands[0].origin.x - base.centre.x);
      p.hands[0] = armToStone(assemble(p).shoulder, base.centre, psi, 1, 0, 40 * DEG).hand;
    }
    return { skel: assemble(p), centre: base.centre, rot: base.rot, sB: base.sB, walk: null };
  }

  /** Ease the print's grade toward what the phase asks for: ≤ 1% per 10 s while climbing, ~3 s in set pieces. */
  function stepGrade(dt: number) {
    const overtime = phase === 'complete' ? Math.min(1, progress * 6) : 0;
    const want = gradeFor(phase === 'open' || phase === 'paused' ? 'focus' : phase, progress, summitOpen, overtime);
    if (!gradeSet || reduced) { grade = want; gradeSet = true; return; }
    const climbing = mode === 'climb' && phase !== 'break';
    const rate = climbing ? 0.001 : dt / 1.0;           // per second (climbing) or a ~1 s time constant
    const toward = (a: number, b: number) => (climbing ? a + Math.max(-rate * dt, Math.min(rate * dt, b - a)) : a + (b - a) * Math.min(1, rate));
    grade = { exposure: toward(grade.exposure, want.exposure), warmth: toward(grade.warmth, want.warmth), glow: toward(grade.glow, want.glow), burn: toward(grade.burn, want.burn) };
  }

  // ---------- the frame ----------
  function sceneFrame(t: number, dt: number) {
    if (!renderer) return;
    if (seq && t - seq.t0 >= seq.dur) seq = null;
    if (ensureTrail() && (phase === 'focus' || phase === 'open') && phaseSet && !climb.atSummit) beginNext(t);
    if (climb.atSummit && mode === 'climb' && (phase === 'focus' || phase === 'open') && phaseSet) {
      if (reduced || stats.frames === 0) mode = 'stand';
      else startSummit(t, 'mini');
    }
    if (mode === 'climb') { if (reduced) D = dTarget(t); else stepClock(t, dt); }
    else if (mode === 'summit') stepSummit(t, dt);
    const live = mode === 'climb' && !reduced ? envelope() : phase === 'paused' || reduced ? 0 : 1;
    ambientT += dt * live;
    pausedK += ((phase === 'paused' ? 1 : 0) - pausedK) * Math.min(1, dt / 0.4);
    if (!reduced && phase !== 'paused') { skyDrift += dt * 0.004 * 0.40; skyEvolve += dt * 0.002; grainT += dt; }
    if (reduced && skyDrift === 0) skyDrift = (seed() % 1000) / 1000;

    const tP = performance.now();
    const fs = figureState(t);
    stats.poseMs = performance.now() - tP;
    const { skel, centre, rot, sB } = fs;
    updateCamera(t, dt);
    stepGrade(dt);
    cam.anchor = renderCam.anchor; const keepPos = cam.pos; cam.pos = renderCam.pos; cam.zoom = renderCam.zoom;
    const zH = lay.Hpx * cam.zoom;
    const S = (v: V) => toScreen(cam, lay.Hpx, v);

    // the crest's screen line, one sample per CSS column
    const N = Math.max(2, Math.ceil(w));
    const ridge = new Float32Array(N), crest = new Float32Array(N);
    const contacts = [...skel.feet.map((f) => f.ball.x), centre.x - Math.sin((trail.angleAt(sB) * Math.PI) / 180) * R];
    const sd = (seed() % 997) * 0.731;
    for (let i = 0; i < N; i++) {
      const wx = cam.pos.x + (i + 0.5 - cam.anchor.x) / zH;
      ridge[i] = cam.anchor.y - (trail.groundY(wx) - cam.pos.y) * zH;
      crest[i] = ridge[i] + crestBite(wx, contacts, sd) * zH;
    }
    // atmosphere
    const xf = xfadeT0 >= 0 ? 1 - Math.min(1, (t - xfadeT0) / CROSSFADE_DUR) : 0;
    if (xfadeT0 >= 0 && xf <= 0) xfadeT0 = -1;
    const birdList: BirdModel[] = [];
    if (!reduced && phase !== 'paused' && phase !== 'break' && quality >= 1 && !(seq && (seq.kind === 'summit' || seq.kind === 'mini'))) {
      if (birdT0 < 0) { birdT0 = t; birds = birdSchedule(4242 + seed()); }
      const el = t - birdT0;
      const gr = birds.find((b) => el >= b.start && el <= b.start + b.dur);
      if (gr) {
        const band: [number, number] = lay.landscape ? [0.10, 0.35] : [0.12, 0.30];
        const span = (lay.landscape ? 0.0375 : 0.020) * h;
        const cS = S(centre), Rp = R * zH;
        for (const b of birdsAt(gr, el, w, h, h, band)) {
          if (Math.hypot(b.x - cS.x, b.y - cS.y) < Rp + span * 2) continue;          // never over the stone
          const ps = S(skel.pelvis); if (Math.abs(b.x - ps.x) < 0.6 * zH && Math.abs(b.y - ps.y) < 1.2 * zH) continue;
          const col = Math.max(0, Math.min(N - 1, Math.round(b.x)));
          if (b.y > ridge[col] - 0.12 * h) continue;                                  // never just above the crest
          birdList.push({ x: b.x, y: b.y, span: span / 2, flap: b.wing * DEG, bank: 6 * DEG * Math.sin(el / 5 + b.x * 0.01) });
        }
      }
    }
    const ledge = S(trail.at(trail.geom.ledgeStart + 1.0));
    const moonK = phase === 'break' ? 1 : phase === 'complete' ? Math.min(1, progress * 6) : 0;
    const model: FrameModel = {
      w, h, dpr: hostDpr,
      t: grainT,
      cam: { x: cam.pos.x, y: cam.pos.y, zoom: cam.zoom, ax: cam.anchor.x, ay: cam.anchor.y, Hpx: lay.Hpx },
      seed: seed(),
      ridge,
      crest,
      groundY: (x: number) => trail.groundY(x),
      contacts,
      hazeFromX: mode === 'climb' ? Infinity : trail.at(trail.geom.ledgeEnd).x,
      stone: { c: centre, R, rot },
      skel: (globalThis as { __hideFigure?: boolean }).__hideFigure === true ? null : skel,
      sky: {
        drift: skyDrift, evolve: skyEvolve, glow: grade.glow + 0.04 * summitOpen, burn: grade.burn, open: phase === 'break' ? 0 : summitOpen,
        openX: ledge.x, openY: ledge.y - 0.25 * h, moon: moonK, moonX: (0.15 + 0.6 * Math.min(1, progress)) * w, moonY: (0.32 - 0.15 * Math.sin(Math.PI * Math.min(1, progress))) * h,
      },
      tone: { exposure: grade.exposure * (1 - 0.08 * pausedK), warmth: grade.warmth + (-0.45 - grade.warmth) * pausedK },
      birds: birdList,
      xfade: xf, cut: cutNow, reduced, quality,
      debugAlbedo: (globalThis as { __stoneAlbedo?: boolean }).__stoneAlbedo === true,
    };
    cutNow = false;
    lastModel = model;
    renderer.draw(model);

    // stats (read by the tests)
    const ps = S(skel.pelvis);
    stats.figureAlpha = 1;
    stats.figureOnScreen = ps.x > 0 && ps.x < w && ps.y > 0 && ps.y < h;
    let below = 0;
    for (let i = 0; i < 16; i++) { const Y = ridge[Math.min(N - 1, Math.floor(((i + 0.5) / 16) * N))]; below += Math.min(1, Math.max(0, (h - Y) / h)); }
    stats.slopeFrac = below / 16;
    stats.zoom = cam.zoom; stats.rot = rot; stats.sB = sB; stats.cut = model.cut;
    {
      const pts = [skel.pelvis, skel.shoulder, skel.head, ...skel.legs.flatMap((l) => [l.knee, l.ankle]), ...skel.arms.flatMap((a) => [a.elbow, a.wrist]), ...skel.feet.flatMap((f) => [f.heel, f.toe])].map(S);
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      stats.figBounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const c0 = S({ x: centre.x - R, y: centre.y + R }), c1 = S({ x: centre.x + R, y: centre.y - R });
      stats.figBox = [Math.min(stats.figBounds[0], c0.x) - 20, Math.min(stats.figBounds[1], c0.y) - 20, Math.max(stats.figBounds[2], c1.x) + 20, Math.max(stats.figBounds[3], c1.y) + 14];
    }
    stats.Hpx = lay.Hpx; stats.anchor = [cam.anchor.x, cam.anchor.y];
    cam.pos = keepPos;
    stats.camX = renderCam.pos.x; stats.camY = renderCam.pos.y; stats.clock = t;
    stats.D = D; stats.sLocal = D; stats.e = mode === 'climb' ? envelope() : lastDdot / WALK.v; stats.phi = frac(D / WALK.L);
    stats.skel = skel; stats.centre = centre; stats.walking = mode === 'climb' || mode === 'summit'; stats.fpsCap = fpsCap;
    stats.gait = mode; stats.renderer = renderer.kind; stats.grade = grade; stats.birds = birdList.length;
  }

  // ---------- loop ----------
  function targetFps(): number {
    // review Z5: an unfocused but visible window (a timer on a second screen; headless Chromium) keeps its full rate;
    // only a hidden page drops to 15 fps (where rAF is throttled anyway)
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return 15;
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
    stats.lastMs = ms;
    frameTimes.push(ms);
    if (frameTimes.length > 90) frameTimes.shift();
    stats.frames++;
    stats.avgMs = frameTimes.reduce((x, y) => x + y, 0) / frameTimes.length;
    stats.maxMs = Math.max(...frameTimes);
    fpsCount++;
    if (t - fpsWindow >= 1) { stats.fps = fpsCount / (t - fpsWindow || 1); fpsCount = 0; fpsWindow = t; }
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
  /** A single still (reduced motion): the GL renderer draws without a running loop. */
  function drawNow() {
    if (!mounted) return;
    const t = nowS();
    const a = performance.now();
    sceneFrame(t, 1 / 30);
    record(performance.now() - a, t);
  }
  let reducedTimer = 0;
  function scheduleReducedRedraw() {
    if (typeof window === 'undefined') return;
    window.clearTimeout(reducedTimer);
    if (!reduced || !mounted || !running) return;
    reducedTimer = window.setTimeout(() => { drawNow(); scheduleReducedRedraw(); }, mode === 'climb' && (phase === 'focus' || phase === 'open') ? 10000 : 15000);
  }

  return {
    stats,
    model: () => lastModel,
    renderer: () => renderer,
    mount(c: HTMLCanvasElement, opts: SceneInitOptions) {
      canvas = c;
      renderer = pickRenderer(c);
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
    setClimb(c: ClimbInput) { climb = { ...c }; climbSet = true; },
    setPhase(next: ScenePhase, opts?: { instant?: boolean }) {
      const prev = phase;
      const t = nowS();
      const first = !phaseSet;
      if (!first && next === prev && !opts?.instant) return;
      phaseSet = true;
      phase = next;
      ensureTrail();
      if (first || opts?.instant) {
        seq = null; summit = null;
        mode = next === 'complete' ? 'stand' : next === 'break' ? (progress >= 1 ? 'stand' : 'sit') : climb.atSummit ? 'stand' : 'climb';
        pausedK = next === 'paused' ? 1 : 0;
        gradeSet = false;
        if (mode === 'climb') { D = sTarget(); eU = 0; holdUntil = -1; }
      } else if (next === 'complete' && mode === 'stand') {
        // a +N extension from the summit ended: he is still standing on it
      } else if (next === 'complete' && (prev === 'focus' || prev === 'open' || prev === 'paused')) {
        if (reduced) { crossfade(t); mode = 'stand'; } else startSummit(t, 'summit');
      } else if (next === 'break') {
        // the seated pose faces downhill: a profile can't turn round, so the break is a 0.4 s cross-fade
        crossfade(t);
        seq = null; summit = null;
        mode = 'sit';
      } else if ((next === 'focus' || next === 'open') && (prev === 'complete' || prev === 'break') && climb.atSummit) {
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
      } else ensureLoop();
    },
    destroy() {
      mounted = false; running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (typeof window !== 'undefined') window.clearTimeout(reducedTimer);
      renderer?.destroy(); renderer = null;
      canvas = null;
    },
  };
}
