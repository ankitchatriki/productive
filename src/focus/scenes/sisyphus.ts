// "Sisyphus" focus scene (STRUGGLEMORE_DESIGN §3): Canvas 2D, a figure pushing a boulder
// up a dusk-lit mountain. Boulder position on the slope = block progress.
import type { SceneEngine, SceneInitOptions, ScenePhase } from './types';
import { NIGHT, PREDAWN, css, darken, desaturate, gradePalette, hex, lighten, mixPalette, mixRGB, palette, type Palette, type RGB } from './palette';
import { FIGURE_H, layoutFor, startS, summitS, sunPosition, type Layout, type SlopePath, type V } from './path';
import { RANGE_LAYERS, RIDGES, backSide, benchProgressMap, buildRidgePath, foregroundRocks, rangeSkyline, rockRadius, snowEdge, type RidgePath } from './ridge';
import {
  BODY, DEG, blendPose, boulderCentre, easeInOut, easeOut, hipH, leanDeg, pelvisOffset, solvePush, solveSit, solveStand,
  surge as surgeCurve, type Limb, type Pose,
} from './rig';
import { fbm1, fbm2, hash1, hash2, mulberry32, noise1, noise2, ridged, smoothstep } from './noise';
import { NIGHT_LIGHT, lightState, mixLight, type LightKey } from './light';
import { Motion, wind } from './motion';
import { makeChain, solveRest, stepChain, type Chain } from './chain';
import { clockwise, finite, footOutline, handOutline, headOutline, limbOutline, smoothPath, torsoOutline } from './figure';

type Mode = 'climb' | 'stand' | 'sit';
type SeqKind = 'summit' | 'mini' | 'rollback' | 'standup' | 'fadein' | 'crossfade';
interface Seq { kind: SeqKind; t0: number; dur: number; from?: Mode }

interface Particle { live: boolean; kind: 'dust' | 'pebble' | 'grit'; x: number; y: number; vx: number; vy: number; r: number; life: number; age: number; s: number; hops: number }

const MAX_PARTICLES = 60;
const HORIZON_Y = 0.30;
const SUMMIT_DUR = 6.0, MINI_DUR = 1.4, ROLLBACK_DUR = 2.8, STANDUP_DUR = 1.0, FADEIN_DUR = 0.6, CROSSFADE_DUR = 1.0;

/** Debug/measurement hook read by the e2e scripts. */
export interface SceneStats { frames: number; avgMs: number; maxMs: number; fps: number; quality: number; particles: number; rebuilds?: number; gapMs?: number }

export function createSisyphus(): SceneEngine & { stats: SceneStats } {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let w = 0, h = 0, scale = 1, hostDpr = 1, quality = 1;
  let layout: Layout = 'landscape', S = 1, ox = 0, oy = 0;
  let path: RidgePath = buildRidgePath(RIDGES.landscape);
  let sMap: (p: number) => number = (p) => p;
  let mountainBody: Path2D | null = null;
  let benchesLit = 0;
  const isRidge = (pth: SlopePath): pth is RidgePath => 'benches' in pth;
  // Milestone beat at each false summit (ROUND3 §3.3.2) and the look-ahead lean filter.
  let beatT0 = -1e9, leanAhead = 0, leanT = 0, meanSlope = 30;
  void mountainBody;
  const BEAT_DUR = 1.4;
  /** Milestone beat envelope 0..1: ease in 0–0.4 s, hold, ease out 1.0–1.4 s. */
  const beatK = (t: number) => { const u = t - beatT0; return u < 0 || u > BEAT_DUR ? 0 : u < 0.4 ? easeInOut(u / 0.4) : u < 1.0 ? 1 : 1 - easeInOut((u - 1.0) / 0.4); };
  let Hw = 0.085, Rw = BODY.boulderR * 0.085;
  let reduced = false, running = false, raf = 0, mounted = false;
  let phase: ScenePhase = 'focus';
  let phaseSet = false;
  let progress = 0;
  let lastProgress = 0;
  let mode: Mode = 'climb';
  let seq: Seq | null = null;
  const rng = mulberry32(20261027);

  // Gait
  let motion = new Motion(20261027);
  let lastFrame = 0, lastDraw = 0, ambientT = 0, lastDrawnP = 0;
  // Pause look
  let desatK = 0, desatTarget = 0;
  // Stand idle sway
  let swayStart = 0, nextSway = 7;
  // Caches
  let sky: HTMLCanvasElement | null = null, land: HTMLCanvasElement | null = null, rimLayer: HTMLCanvasElement | null = null, gradeLayer: HTMLCanvasElement | null = null;
  let detail: HTMLCanvasElement | null = null, fgLayer: HTMLCanvasElement | null = null;
  let skyB: HTMLCanvasElement | null = null, landB: HTMLCanvasElement | null = null, gradeB: HTMLCanvasElement | null = null, fgB: HTMLCanvasElement | null = null;
  let rebuild: Generator<void, void, void> | null = null, rebuildKey = '';
  let clouds: HTMLCanvasElement[] = [];
  let boulderTex: HTMLCanvasElement | null = null;
  let boulderOutline: Path2D | null = null;
  let dustSprite: HTMLCanvasElement | null = null;
  let stars: Array<{ x: number; y: number; b: number; ph: number }> = [];
  let pal: Palette = gradePalette(palette(0));
  let palKey = '';
  let lastCacheAt = -1e9;
  let snapshot: HTMLCanvasElement | null = null;
  let colorScheme: 'light' | 'dark' = 'dark';
  void colorScheme;
  const particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({ live: false, kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, r: 0, life: 0, age: 0, s: 0, hops: 0 }));
  const frameTimes: number[] = [];
  const stats: SceneStats = { frames: 0, avgMs: 0, maxMs: 0, fps: 0, quality: 1, particles: 0 };
  let fpsCount = 0, fpsWindow = 0;

  const mk = (cw: number, ch: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(cw)); c.height = Math.max(1, Math.round(ch)); return c; };
  const toS = (v: V): V => ({ x: ox + v.x * S, y: h - oy - v.y * S });
  const Hpx = () => Hw * S;
  const s0 = () => startS(Hw, Rw, path.length);
  const s1 = () => summitS(Rw, path.length);
  /** Boulder rest point on the plateau: far enough from the lip that the figure's back foot is on top (review S4/S5). */
  const plateauMid = () => Math.min(path.plateauEndS - Rw / path.length, 1 + (0.02 + 0.2 * Hw + Rw) / path.length);
  const nowS = () => performance.now() / 1000;
  /** Arc-length fraction of the ground point at world x (binary search; x increases along the path). */
  const sAtX = (x: number) => {
    let lo = -0.2, hi = path.plateauEndS;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (path.at(mid).x < x) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };

  // ---------- sizing ----------
  function layoutWorld() {
    const l = layoutFor(w, h);
    layout = l.layout; S = l.S; ox = l.ox; oy = l.oy;
    path = buildRidgePath(RIDGES[layout]);
    Hw = FIGURE_H[layout];
    Rw = BODY.boulderR * Hw;
    sMap = benchProgressMap(path, startS(Hw, Rw, path.length), summitS(Rw, path.length));
    leanAhead = 0;
    meanSlope = path.headings.reduce((a, b) => a + b, 0) / path.headings.length;
  }

  function applySize() {
    if (!canvas || !ctx || w <= 0 || h <= 0) return;
    let d = Math.min(1.5, hostDpr) * quality;
    // Very large screens (ultrawide / 4K) get a smaller back-buffer: the scene is soft-edged and upscales well.
    const cap = w * h > 3e6 ? 1.3e6 : 2.1e6;
    if (w * h * d * d > cap) d = Math.sqrt(cap / (w * h));
    scale = d;
    canvas.width = Math.max(1, Math.round(w * d));
    canvas.height = Math.max(1, Math.round(h * d));
    layoutWorld();
    buildStars();
    buildBoulderShape();
    buildDetail();
    palKey = '';
    lastCacheAt = -1e9;
    sky = null; land = null; rebuild = null;
  }

  // ---------- scene state per phase ----------
  interface SkyState { pal: Palette; sun: V | null; sunVis: number; glow: number; moon: V | null; moonVis: number; starVis: number; predawn: number; light: LightKey }

  function skyState(t: number): SkyState {
    const horizonPx = h - oy - HORIZON_Y * S;
    const summitPx = toS(path.at(1));
    const moonPath = (q: number): V => {
      const A = { x: 0.08 * w, y: horizonPx }, C = { x: 0.32 * w, y: 0.12 * h }, B = { x: 0.62 * w, y: 0.18 * h };
      const u = 1 - q; return { x: u * u * A.x + 2 * u * q * C.x + q * q * B.x, y: u * u * A.y + 2 * u * q * C.y + q * q * B.y };
    };
    if (phase === 'complete') {
      const st = seq && (seq.kind === 'summit' || seq.kind === 'crossfade') ? Math.min(SUMMIT_DUR, t - seq.t0) : SUMMIT_DUR;
      const k = seq?.kind === 'crossfade' ? 1 : smoothstep(1.0, 4.0, st);
      const night = Math.min(1, progress * 6); // dusk → night over the first 10 min of overtime
      let base = palette(0.86 + 0.14 * k);
      if (night > 0) base = mixPalette(base, NIGHT, night * 0.85);
      const sun = sunPosition(1, w, h, horizonPx, summitPx, layout);
      sun.y += 0.06 * h * k;
      const glow = st > 1 && st < 3 ? 1 + 0.6 * Math.sin(((st - 1) / 2) * Math.PI) : 1;
      const starVis = seq?.kind === 'crossfade' ? 1 : smoothstep(2.5, 5.0, st);
      let light = lightState(0.86 + 0.14 * k);
      if (night > 0) light = mixLight(light, NIGHT_LIGHT, night * 0.85);
      return { pal: base, sun, sunVis: 1 - smoothstep(2.4, 4.0, st), glow, moon: progress > 0 ? moonPath(Math.min(1, progress)) : null, moonVis: smoothstep(0, 0.02, progress) * 0.9, starVis: Math.max(starVis, night), predawn: 0, light };
    }
    if (phase === 'break') {
      const pre = smoothstep(0.85, 1.0, progress);
      let base = mixPalette(NIGHT, PREDAWN, pre);
      if (progress >= 1) base = mixPalette(PREDAWN, palette(0), 0.6);
      const light = mixLight(NIGHT_LIGHT, lightState(0), progress >= 1 ? 0.6 : pre * 0.5);
      return { pal: base, sun: null, sunVis: 0, glow: 1, moon: moonPath(Math.min(1, progress)), moonVis: 1 - pre * 0.6, starVis: 1 - pre * 0.6, predawn: pre, light };
    }
    // focus / open / paused (and the roll-back into a new climb)
    let p = progress;
    let palP = 0.86 * p;
    let base = palette(palP);
    let light = lightState(palP);
    if (seq && seq.kind === 'rollback') {
      p = 0;
      const k = smoothstep(0, ROLLBACK_DUR, t - seq.t0);
      base = mixPalette(rollFrom ?? palette(0.86), palette(0), k);
      light = mixLight(rollLight ?? lightState(0.86), lightState(0), k);
    }
    const sun = sunPosition(p, w, h, horizonPx, summitPx, layout);
    return { pal: base, sun, sunVis: 1, glow: 1, moon: null, moonVis: 0, starVis: smoothstep(0.93, 1.0, p) * 0.25, predawn: 0, light };
  }

  // ---------- caches ----------
  function buildStars() {
    stars = [];
    const cell = Math.min(w, h) / 140;
    const horizonPx = h - oy - HORIZON_Y * S;
    for (let gy = 0; gy * cell < horizonPx - 10; gy++) {
      for (let gx = 0; gx * cell < w; gx++) {
        const b = hash2(gx, gy);
        if (b < 0.992) continue;
        stars.push({ x: (gx + hash2(gx + 7.1, gy)) * cell, y: (gy + hash2(gx, gy + 3.3)) * cell, b: hash2(gx * 1.7, gy * 2.3), ph: b * 40 });
      }
    }
  }

  function buildBoulderShape() {
    const R = Rw * S;
    const p = new Path2D();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r = R * (1 + 0.035 * (noise2(Math.cos(a) * 1.5 + 4, Math.sin(a) * 1.5 + 4) * 2 - 1) * 1.6);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
    boulderOutline = p;
  }

  function buildBoulderTexture(base: RGB) {
    const R = Rw * S;
    const res = Math.max(1, scale * 1.5);
    const size = Math.ceil(2 * R * res * 1.08);
    const c = mk(size, size);
    const g = c.getContext('2d')!;
    g.translate(size / 2, size / 2);
    g.scale(res, res);
    if (boulderOutline) g.clip(boulderOutline);
    g.fillStyle = css(base);
    g.fillRect(-R * 1.1, -R * 1.1, R * 2.2, R * 2.2);
    // Value-noise mottling, two octaves (±14% luminance).
    for (const [cellK, amp] of [[5, 0.10], [12, 0.06]] as const) {
      const cell = R / cellK;
      for (let y = -R; y < R; y += cell) for (let x = -R; x < R; x += cell) {
        const n = noise2(x / cell + cellK * 3.1, y / cell + cellK * 1.7) * 2 - 1;
        g.fillStyle = n > 0 ? `rgba(255,240,220,${n * amp})` : `rgba(10,6,4,${-n * amp * 1.3})`;
        g.fillRect(x, y, cell + 0.6, cell + 0.6);
      }
    }
    // Pits
    const pr = mulberry32(77);
    // Pits: soft radial hollows with a lit lip toward the texture's fixed up-light (no stickers).
    for (let i = 0; i < 9; i++) {
      const a = pr() * Math.PI * 2, d = pr() * R * 0.75, rr = R * (0.04 + pr() * 0.06);
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      const pg = g.createRadialGradient(x, y, 0, x, y, rr);
      pg.addColorStop(0, 'rgba(10,6,4,0.35)'); pg.addColorStop(0.7, 'rgba(10,6,4,0.12)'); pg.addColorStop(1, 'rgba(10,6,4,0)');
      g.fillStyle = pg; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,238,215,0.22)'; g.lineWidth = Math.max(0.6, rr * 0.18);
      g.beginPath(); g.arc(x, y + rr * 0.1, rr * 0.85, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    }
    // Lichen flecks.
    const lichen = mixRGB(base, hex('#7a7a52'), 0.4);
    for (let i = 0; i < 12; i++) {
      const a = pr() * Math.PI * 2, d = pr() * R * 0.85;
      g.fillStyle = css(lichen, 0.35);
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, R * (0.012 + pr() * 0.02), 0, Math.PI * 2); g.fill();
    }
    // Cracks
    g.strokeStyle = 'rgba(10,6,4,0.35)';
    g.lineWidth = 1 / res;
    for (let i = 0; i < 3; i++) {
      let a = pr() * Math.PI * 2, x = Math.cos(a) * R * 0.2, y = Math.sin(a) * R * 0.2;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { a += (pr() - 0.5) * 1.2; x += Math.cos(a) * R * 0.13; y += Math.sin(a) * R * 0.13; g.lineTo(x, y); }
      g.stroke();
    }
    boulderTex = c;
  }

  function buildClouds(col: RGB) {
    clouds = [0, 1, 2].map((i) => {
      const cw = Math.round((0.28 + 0.08 * i) * S * scale), ch = Math.round(0.07 * S * scale);
      const c = mk(cw, ch * 2);
      const g = c.getContext('2d')!;
      g.filter = `blur(${Math.max(2, ch * 0.18)}px)`;
      g.fillStyle = css(col, 0.55);
      const pr = mulberry32(100 + i);
      for (let k = 0; k < 7; k++) {
        const x = cw * (0.15 + pr() * 0.7), y = ch * (0.9 + pr() * 0.4), rx = cw * (0.08 + pr() * 0.14), ry = ch * (0.22 + pr() * 0.2);
        g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
      }
      return c;
    });
  }

  function vignette(g: CanvasRenderingContext2D) {
    const r = Math.hypot(w, h) * 0.62;
    const grad = g.createRadialGradient(w / 2, h / 2, r * 0.35, w / 2, h / 2, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }

  /** Tint rebuild, spread across frames (one stage per frame) into back buffers, then swapped (ROUND3 §3.12). */
  function* rebuildCaches(ss: SkyState): Generator<void, void, void> {
    const cw = canvas!.width, ch = canvas!.height;
    pal = gradePalette(ss.pal);
    if (desatK > 0) pal = desaturate(pal, 0.35 * desatK, 0.08 * desatK);
    const fit = (c: HTMLCanvasElement | null) => (c && c.width === cw && c.height === ch ? c : mk(cw, ch));
    skyB = fit(skyB); landB = fit(landB); gradeB = fit(gradeB); fgB = fit(fgB);
    const skyT = skyB, landT = landB, gradeT = gradeB, fgT = fgB;
    // Sky
    const g = skyT.getContext('2d')!;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    const horizonPx = h - oy - HORIZON_Y * S;
    const grad = g.createLinearGradient(0, 0, 0, horizonPx);
    grad.addColorStop(0, css(pal.zenith));
    grad.addColorStop(0.55, css(mixRGB(pal.zenith, pal.horizon, 0.45)));
    grad.addColorStop(1, css(pal.horizon));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const band = g.createLinearGradient(0, horizonPx - 0.18 * S, 0, horizonPx + 0.05 * S);
    band.addColorStop(0, css(pal.horizon, 0));
    band.addColorStop(0.8, css(lighten(pal.horizon, 0.12), 0.45));
    band.addColorStop(1, css(pal.horizon, 0));
    g.fillStyle = band;
    g.fillRect(0, horizonPx - 0.18 * S, w, 0.23 * S);
    if (ss.predawn > 0) {
      const pg = g.createRadialGradient(0, horizonPx, 0, 0, horizonPx, w * 0.6);
      pg.addColorStop(0, css(mixRGB(pal.horizon, [0.85, 0.6, 0.55], 0.6), 0.5 * ss.predawn));
      pg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = pg; g.fillRect(0, 0, w, h);
    }
    if (ss.moon && ss.moonVis > 0) {
      const r = 0.02 * Math.min(w, h);
      const mg = g.createRadialGradient(ss.moon.x, ss.moon.y, 0, ss.moon.x, ss.moon.y, r * 5);
      mg.addColorStop(0, `rgba(232,230,240,${0.18 * ss.moonVis})`); mg.addColorStop(1, 'rgba(232,230,240,0)');
      g.fillStyle = mg; g.fillRect(ss.moon.x - r * 5, ss.moon.y - r * 5, r * 10, r * 10);
      g.save();
      g.beginPath(); g.arc(ss.moon.x, ss.moon.y, r, 0, Math.PI * 2); g.clip();
      const cres = new Path2D();
      cres.arc(ss.moon.x, ss.moon.y, r, 0, Math.PI * 2);
      cres.moveTo(ss.moon.x + r * 0.45 + r * 0.95, ss.moon.y - r * 0.2);
      cres.arc(ss.moon.x + r * 0.45, ss.moon.y - r * 0.2, r * 0.95, 0, Math.PI * 2);
      g.fillStyle = `rgba(232,230,240,${ss.moonVis})`;
      g.fill(cres, 'evenodd');
      g.restore();
    }
    // Grade layer (L11): vignette + a faint warm/cool wash, applied once over everything per frame.
    const gl = gradeT.getContext('2d')!;
    gl.setTransform(1, 0, 0, 1, 0, 0); gl.clearRect(0, 0, cw, ch);
    gl.setTransform(scale, 0, 0, scale, 0, 0);
    const warm = ss.light.warmth;
    gl.fillStyle = warm >= 0 ? css(ss.light.key, 0.06 * warm) : css([0.45, 0.5, 0.75], -0.06 * warm);
    gl.fillRect(0, 0, w, h);
    vignette(gl);

    // Land (ROUND3_DESIGN §3.3): peaked range layers with snow and haze, then the main mountain.
    yield;
    const l = landT.getContext('2d')!;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, cw, ch);
    l.setTransform(scale, 0, 0, scale, 0, 0);
    drawRange(l, ss);
    yield;
    const { body, back } = drawMountainBase(l, ss);
    yield;
    drawSurface(l, body, back, ss, 0);
    yield;
    drawSurface(l, body, back, ss, 1);
    yield;
    drawSurface(l, body, back, ss, 2);
    yield;
    drawMountainTop(l, body, back, ss);
    yield;
    buildForeground(fgT, ss);
    yield;
    buildClouds(lighten(mixRGB(pal.horizon, pal.zenith, 0.3), 0.15));
    buildBoulderTexture(pal.boulderBase);
    buildDustSprite(ss.light);
    // Bake the grade (vignette + wash) into sky and land: no full-screen blend per frame (perf at dpr 2).
    for (const [c, op] of [[skyT, 'source-over'], [landT, 'source-atop']] as const) {
      const cx = c.getContext('2d')!;
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.globalCompositeOperation = op;
      cx.drawImage(gradeT, 0, 0);
      cx.globalCompositeOperation = 'source-over';
    }
    // Swap front and back buffers.
    [sky, skyB] = [skyT, sky]; [land, landB] = [landT, land]; [gradeLayer, gradeB] = [gradeT, gradeLayer]; [fgLayer, fgB] = [fgT, fgLayer];
  }

  // ---------- terrain (ROUND3_DESIGN §3.3) ----------
  const SNOWLINE: Record<Layout, number> = { landscape: 0.62, portrait: 0.47 };
  const worldX = (x: number) => (x - ox) / S;
  const scrY = (wy: number) => h - oy - wy * S;

  function rangeFrame() {
    return { horizonY: HORIZON_Y, summit: path.spec.plateauEnd, baseY: path.spec.p0.y };
  }

  function drawRange(l: CanvasRenderingContext2D, ss: SkyState) {
    const frame = rangeFrame();
    const snowline = SNOWLINE[layout];
    const L = ss.light;
    const step = 3;
    RANGE_LAYERS.forEach((layer, i) => {
      const haze = layer.haze * (0.55 + 0.45 * (1 - desatK));
      const col = mixRGB(mixRGB(pal.ridgeNear, pal.horizon, haze), L.key, 0.15);
      const tops: Array<{ x: number; y: number; peakX: number }> = [];
      for (let x = -step; x <= w + step; x += step) {
        const r = rangeSkyline(layer, worldX(x), frame);
        tops.push({ x, y: r.y, peakX: r.peakX });
      }
      l.fillStyle = css(col);
      l.beginPath(); l.moveTo(-step, h);
      for (const t of tops) l.lineTo(t.x, scrY(t.y));
      l.lineTo(w + step, h); l.closePath(); l.fill();
      // Snow caps above the snowline: sun side lit, shade side cool; they take the layer's haze.
      const sunX = ss.sun ? worldX(ss.sun.x) : frame.summit.x;
      const litSnow = mixRGB(mixRGB(hex('#efe6da'), L.key, 0.35), pal.horizon, haze * 0.6);
      const shadeSnow = mixRGB(mixRGB(hex('#c9c3cf'), L.ambient, 0.45), pal.horizon, haze * 0.6);
      // Contiguous runs → polygons (top = skyline, bottom = ragged snow edge), split at each peak into sun/shade.
      let run: Array<{ x: number; top: number; bot: number }> = [];
      let runSide: boolean | null = null;
      const flush = () => {
        if (run.length > 1) {
          l.fillStyle = css(runSide ? litSnow : shadeSnow, 0.93);
          l.beginPath();
          run.forEach((c, k) => { if (k === 0) l.moveTo(c.x, c.top); else l.lineTo(c.x, c.top); });
          for (let k = run.length - 1; k >= 0; k--) l.lineTo(run[k].x, run[k].bot);
          l.closePath(); l.fill();
        }
        run = [];
      };
      for (const t of tops) {
        const wx = worldX(t.x);
        const edge = snowEdge(wx + i * 3.1, snowline);
        const sunSide = Math.sign(wx - t.peakX) === Math.sign(sunX - t.peakX);
        if (t.y <= edge) { flush(); runSide = null; continue; }
        if (runSide !== null && sunSide !== runSide) { const last = run[run.length - 1]; flush(); if (last) run.push(last); }
        runSide = sunSide;
        run.push({ x: t.x, top: scrY(t.y), bot: scrY(Math.min(t.y, edge)) });
      }
      flush();
      // Lit ridge top
      l.strokeStyle = css(L.key, 0.15 * (1 - layer.haze));
      l.lineWidth = 1;
      l.beginPath();
      tops.forEach((t, k) => { if (k === 0) l.moveTo(t.x, scrY(t.y)); else l.lineTo(t.x, scrY(t.y)); });
      l.stroke();
      // Haze band (valley mist) at the foot of this layer, in front of the next one back.
      const baseWY = frame.horizonY + (frame.summit.y - frame.horizonY) * layer.height[0] * 0.45;
      const y0 = scrY(baseWY), y1 = scrY(baseWY + 0.06);
      const hg = l.createLinearGradient(0, y0, 0, y1);
      hg.addColorStop(0, css(pal.horizon, 0.35 * haze)); hg.addColorStop(1, css(pal.horizon, 0));
      l.fillStyle = hg; l.fillRect(0, y1, w, h - y1);
    });
  }

  /** The main mountain outline (screen space) as a Path2D, plus its back-side polyline (world). */
  function mountainShape(): { body: Path2D; back: V[] } {
    const sp = path.spec;
    const leftX = worldX(0) - 0.05;
    const rightX = worldX(w) + 0.05;
    const back = backSide(layout, sp.plateauEnd, sp.p0.y, rightX);
    const body = new Path2D();
    body.moveTo(-2, h + 2);
    // Left foothill rubble, not a ruler line.
    for (let x = leftX; x < sp.p0.x - 0.005; x += 0.01) {
      const y = sp.p0.y - 0.012 + 0.03 * (ridged(x * 7 + 2.3, 3) - 0.5) * Math.min(1, (sp.p0.x - x) / 0.08);
      const v = toS({ x, y }); body.lineTo(v.x, v.y);
    }
    for (let i = 0; i <= 160; i++) { const v = toS(path.at(i / 160)); body.lineTo(v.x, v.y); }
    for (let i = 0; i < back.length; i++) {
      const a2 = back[i];
      const b2 = back[i + 1];
      const v = toS(a2); body.lineTo(v.x, v.y);
      if (b2 && i > 0) {
        // chatter along the rock edge
        for (let k = 1; k < 6; k++) {
          const u = k / 6, x = a2.x + (b2.x - a2.x) * u, y = a2.y + (b2.y - a2.y) * u + 0.006 * (noise2(x * 45, 3.3) - 0.5);
          const q = toS({ x, y }); body.lineTo(q.x, q.y);
        }
      }
    }
    body.lineTo(w + 2, h + 2); body.closePath();
    return { body, back };
  }

  function backTopAt(back: V[], x: number): number {
    for (let i = 0; i < back.length - 1; i++) if (x >= back[i].x && x <= back[i + 1].x) {
      const u = (x - back[i].x) / (back[i + 1].x - back[i].x || 1); return back[i].y + (back[i + 1].y - back[i].y) * u;
    }
    return -1;
  }

  /** Detail grain (resize-only): half-resolution fBm + hash grit, greyscale. */
  function buildDetail() {
    const dw = Math.max(1, Math.round(w / 2)), dh = Math.max(1, Math.round(h / 2));
    detail = mk(dw, dh);
    const g = detail.getContext('2d')!;
    const img = g.createImageData(dw, dh);
    const d = img.data;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const v = 0.5 + 0.22 * (fbm2(x / 9, y / 9, 3) * 2 - 1) + 0.08 * (hash2(x * 1.3, y * 0.7) * 2 - 1);
      const c = Math.max(0, Math.min(255, Math.round(v * 255)));
      const i = (y * dw + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = c; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  /** Faces, strata, joints, gullies, scree and grain on the main mountain (ROUND3 §3.3.7). */
  function drawSurface(l: CanvasRenderingContext2D, body: Path2D, back: V[], ss: SkyState, part: 0 | 1 | 2) {
    const sp = path.spec;
    const L = ss.light;
    const sEnd = 1 + (path.plateauEndS - 1) * 1.45;
    l.save();
    l.clip(body);
    if (part === 2) {
      // Grain overlay (one drawImage per tint rebuild).
      if (detail && quality > 0.5) {
        l.globalCompositeOperation = 'overlay';
        l.globalAlpha = 0.35;
        l.drawImage(detail, 0, 0, w, h);
        l.globalCompositeOperation = 'source-over';
        l.globalAlpha = 1;
      }
      l.restore();
      return;
    }
    if (part === 1) { surfaceDetail(l, back, ss); l.restore(); return; }
    void back;
    // Strata bands in mountain-local coordinates (u along the path, v depth along the normal).
    const N = layout === 'landscape' ? 9 : 7;
    const vk = (k: number, s: number) => 0.035 + k * 0.055 + 0.012 * (fbm1(s * 3.2 * path.length + k * 7.1) * 2 - 1);
    // Offsets along one fixed direction (normal of the climb's chord), so bed lines are parallel copies that never cross.
    const ch0 = path.at(0), ch1 = path.at(1);
    const cl = Math.hypot(ch1.x - ch0.x, ch1.y - ch0.y);
    const n0 = { x: -(ch1.y - ch0.y) / cl, y: (ch1.x - ch0.x) / cl };
    const bandPt = (s: number, v: number) => { const g = path.at(s); return toS({ x: g.x - n0.x * v, y: g.y - n0.y * v }); };
    const s0b = -0.25, steps = 90;
    for (let k = 0; k < N - 1; k++) {
      const lumK = (k % 2 === 0 ? 0.06 : -0.06) + (hash1(k * 3.3) - 0.5) * 0.08;
      l.fillStyle = lumK > 0 ? css(L.key, lumK * 0.9) : css([0, 0, 0], -lumK);
      l.beginPath();
      for (let i = 0; i <= steps; i++) { const s = s0b + ((sEnd - s0b) * i) / steps; const p = bandPt(s, vk(k, s)); if (i === 0) l.moveTo(p.x, p.y); else l.lineTo(p.x, p.y); }
      for (let i = steps; i >= 0; i--) { const s = s0b + ((sEnd - s0b) * i) / steps; const p = bandPt(s, vk(k + 1, s)); l.lineTo(p.x, p.y); }
      l.closePath(); l.fill();
    }
    // Ledges: a lit top edge and a shadow line under it.
    for (let k = 1; k < N; k++) {
      for (const [dv, col, a, lw] of [[0, L.key, 0.18, 1.2], [2 / S, pal.rockShade, 0.22, 2]] as Array<[number, RGB, number, number]>) {
        l.strokeStyle = css(col, a); l.lineWidth = lw;
        l.beginPath();
        for (let i = 0; i <= steps; i++) { const s = s0b + ((sEnd - s0b) * i) / steps; const p = bandPt(s, vk(k, s) + dv); if (i === 0) l.moveTo(p.x, p.y); else l.lineTo(p.x, p.y); }
        l.stroke();
      }
    }
    // Back face: one step darker, meeting the climb face along a soft ridge from the summit down to the right.
    const sumS = toS(sp.plateauEnd);
    const footR = toS({ x: (back[back.length - 1]?.x ?? sp.plateauEnd.x + 0.4), y: sp.p0.y - 0.05 });
    const bf = new Path2D();
    bf.moveTo(sumS.x - 2, sumS.y - 4);
    for (const p of back) { const v = toS(p); bf.lineTo(v.x, v.y - 4); }
    bf.lineTo(w + 4, h + 4); bf.lineTo(footR.x - 0.25 * S, h + 4);
    bf.quadraticCurveTo(sumS.x + 0.05 * S, sumS.y + 0.35 * S, sumS.x - 2, sumS.y - 4);
    bf.closePath();
    const bg = l.createLinearGradient(sumS.x, sumS.y, sumS.x + 0.2 * S, sumS.y + 0.5 * S);
    bg.addColorStop(0, css(mixRGB(pal.rockShade, L.ambient, 0.2), 0.8));
    bg.addColorStop(1, css(darken(pal.rockShade, 0.25), 0.9));
    l.fillStyle = bg; l.fill(bf);
    l.restore();
  }

  function surfaceDetail(l: CanvasRenderingContext2D, back: V[], ss: SkyState) {
    const sp = path.spec;
    const L = ss.light;
    void sp; void back;
    // Joints: short cracks perpendicular to the strata, with a lit edge on the sun side.
    const pr = mulberry32(53);
    const nJ = 18 + Math.floor(pr() * 9);
    for (let j = 0; j < nJ; j++) {
      const s = pr() * 1.05, v = 0.02 + pr() * 0.35, len = 0.01 + pr() * 0.02;
      const g = path.at(s), n = path.normalAt(Math.min(1, s));
      let p = { x: g.x - n.x * v, y: g.y - n.y * v };
      const pts: V[] = [toS(p)];
      for (let q = 0; q < 3; q++) { p = { x: p.x - n.x * (len / 3) + (pr() - 0.5) * 0.004, y: p.y - n.y * (len / 3) }; pts.push(toS(p)); }
      l.strokeStyle = css(darken(pal.rockShade, 0.3), 0.25); l.lineWidth = 1.2;
      l.beginPath(); pts.forEach((q, i) => (i ? l.lineTo(q.x, q.y) : l.moveTo(q.x, q.y))); l.stroke();
      l.strokeStyle = css(L.key, 0.12); l.lineWidth = 0.8;
      l.beginPath(); pts.forEach((q, i) => (i ? l.lineTo(q.x - 1, q.y) : l.moveTo(q.x - 1, q.y))); l.stroke();
    }
    // Gullies below each false summit, with scree fans at their feet.
    path.benches.forEach((b, k) => {
      const g = path.at(b.sMid);
      const top = toS({ x: g.x, y: g.y - 0.02 });
      const wd = 0.028 * S;
      const gg = l.createLinearGradient(top.x - wd, 0, top.x + wd, 0);
      gg.addColorStop(0, css(L.ambient, 0)); gg.addColorStop(0.5, css(darken(L.ambient, 0.3), 0.15)); gg.addColorStop(1, css(L.ambient, 0));
      l.fillStyle = gg;
      l.beginPath();
      l.moveTo(top.x - wd * 0.3, top.y);
      l.quadraticCurveTo(top.x - wd * 0.2 + k * 3, top.y + 0.2 * S, top.x - wd, h + 2);
      l.lineTo(top.x + wd, h + 2);
      l.quadraticCurveTo(top.x + wd * 0.3, top.y + 0.2 * S, top.x + wd * 0.3, top.y);
      l.closePath(); l.fill();
    });
    // Scree just below the walking line (never on it, so the feet stay clean).
    for (let i = 0; i < 40; i++) {
      const s = 0.02 + pr() * 0.98, depth = 0.008 + pr() * 0.05, sz = (0.004 + pr() * 0.008) * S;
      const g = path.at(s), n = path.normalAt(s);
      const c = toS({ x: g.x - n.x * depth, y: g.y - n.y * depth });
      const nv = 4 + Math.floor(pr() * 3);
      l.beginPath();
      for (let q = 0; q < nv; q++) { const a = (q / nv) * Math.PI * 2; const rr = sz * (0.6 + 0.4 * pr()); const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr * 0.55; q ? l.lineTo(x, y) : l.moveTo(x, y); }
      l.closePath();
      l.fillStyle = css(darken(pal.rockShade, 0.1), 0.55); l.fill();
      l.strokeStyle = css(L.key, 0.3); l.lineWidth = 0.8;
      l.beginPath(); l.moveTo(c.x - sz * 0.6, c.y - sz * 0.35); l.lineTo(c.x + sz * 0.5, c.y - sz * 0.4); l.stroke();
    }
  }

  /** Foreground rocks (L10): dark, slightly blurred, at the bottom corners; never over the path or the HUD. */
  function buildForeground(target: HTMLCanvasElement, ss: SkyState) {
    const cw = target.width, ch = target.height;
    const g = target.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
    g.setTransform(scale, 0, 0, scale, 0, 0);
    if (quality > 0.5) g.filter = 'blur(1.5px)';
    const rocks = foregroundRocks(layout, w, h, S);
    for (const r of rocks) {
      const pts: V[] = [];
      for (let k = 0; k < 11; k++) { const a = (k / 11) * Math.PI * 2; const rr = rockRadius(r, k); pts.push({ x: r.cx + Math.cos(a) * rr, y: r.cy + Math.sin(a) * rr * 0.8 }); }
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
      g.fillStyle = css(darken(pal.rockShade, 0.35)); g.fill();
      const L = sunDir({ x: r.cx, y: r.cy });
      g.save(); g.clip();
      g.strokeStyle = css(ss.light.key, 0.4 * ss.light.rim); g.lineWidth = 3;
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x - L.x * 1.5, p.y - L.y * 1.5) : g.moveTo(p.x - L.x * 1.5, p.y - L.y * 1.5))); g.closePath(); g.stroke();
      g.restore();
    }
    g.filter = 'none';
  }

  function drawCairn(l: CanvasRenderingContext2D, base: V, size: number, lit: number, L: LightKey) {
    let cy = base.y;
    for (const [wid, ht] of [[0.030, 0.010], [0.022, 0.009], [0.014, 0.008]]) {
      const rw = (wid * S * size) / 2, rh = (ht * S * size) / 2;
      l.fillStyle = css(darken(pal.rockShade, 0.2));
      l.beginPath(); l.ellipse(base.x, cy - rh, rw, rh, 0, 0, Math.PI * 2); l.fill();
      if (lit > 0) {
        l.strokeStyle = css(L.key, 0.6 * lit); l.lineWidth = 1;
        l.beginPath(); l.ellipse(base.x, cy - rh, rw, rh, 0, Math.PI * 1.05, Math.PI * 1.75); l.stroke();
      }
      cy -= rh * 1.8;
    }
  }

  function drawMountainBase(l: CanvasRenderingContext2D, ss: SkyState) {
    const { body, back } = mountainShape();
    mountainBody = body;
    const sp = path.spec;
    const top = toS(sp.plateauEnd).y;
    const mg = l.createLinearGradient(0, top, 0, h);
    mg.addColorStop(0, css(mixRGB(pal.rockLit, ss.light.key, 0.12)));
    mg.addColorStop(1, css(mixRGB(pal.rockShade, ss.light.ambient, 0.3)));
    l.fillStyle = mg; l.fill(body);
    return { body, back };
  }

  function drawMountainTop(l: CanvasRenderingContext2D, body: Path2D, back: V[], ss: SkyState) {
    const sp = path.spec;
    // Snow: a full cap on the twin peak, only a dusting near the true summit, never near the path.
    l.save(); l.clip(body);
    const snowline = SNOWLINE[layout];
    const lit = mixRGB(hex('#efe6da'), ss.light.key, 0.35), shade = mixRGB(hex('#c9c3cf'), ss.light.ambient, 0.45);
    const x0 = sp.plateauEnd.x + 0.045;
    for (let px = Math.floor(toS({ x: x0, y: 0 }).x); px < w; px += 2) {
      const wx = worldX(px);
      const ty = backTopAt(back, wx);
      if (ty < 0) continue;
      const edge = snowEdge(wx + 7.7, snowline);
      if (ty <= edge) continue;
      l.fillStyle = css(wx < back[4]?.x ? shade : lit, 0.9);
      l.fillRect(px, scrY(ty) - 1, 2.5, (ty - edge) * S + 1);
    }
    l.restore();
    // Lit crest along the climb: brighter toward golden hour (the "nearly there" cue).
    l.strokeStyle = css(ss.light.key, (0.25 + 0.4 * ss.light.rim) * (1 - desatK * 0.5));
    l.lineWidth = 2;
    l.beginPath();
    for (let i = 0; i <= 160; i++) { const v = toS(path.at(i / 160)); if (i === 0) l.moveTo(v.x, v.y); else l.lineTo(v.x, v.y); }
    const pe = toS(sp.plateauEnd); l.lineTo(pe.x, pe.y);
    l.stroke();
    // Cairns: one on each false summit (lit once passed) and the summit cairn.
    if (isRidge(path)) path.benches.forEach((b, k) => {
      const g = path.at(b.sMid);
      const n = path.normalAt(b.sMid);
      drawCairn(l, toS({ x: g.x - n.x * 0.004, y: g.y - n.y * 0.004 }), 0.55, benchesLit > k ? 1 : 0, ss.light);
    });
    drawCairn(l, toS({ x: sp.plateauEnd.x - 0.01, y: sp.plateauEnd.y }), 1, 0, ss.light);
  }

  function maybeRebuild(t: number, ss: SkyState) {
    const key = [ss.pal.zenith, ss.pal.horizon, ss.pal.rockLit].map((c) => c.map((v) => Math.round(v * 200)).join(',')).join('|')
      + `|${benchesLit}|${Math.round(ss.light.rim * 20)}|${Math.round(ss.light.warmth * 20)}|${ss.moon ? Math.round(ss.moon.x / 3) : ''}|${Math.round(ss.glow * 20)}|${Math.round(desatK * 10)}|${Math.round(ss.predawn * 20)}`;
    const minGap = seq || (desatK !== desatTarget) ? 0.1 : 2;
    if (!sky || !land) {
      // First paint (or after a resize): build synchronously.
      const gen = rebuildCaches(ss);
      while (!gen.next().done) { /* run all stages */ }
      rebuild = null; palKey = key; lastCacheAt = t;
      return;
    }
    if (rebuild) {
      if (rebuild.next().done) { rebuild = null; palKey = rebuildKey; }
      return;
    }
    if (key !== palKey && t - lastCacheAt >= minGap) {
      rebuild = rebuildCaches(ss); rebuildKey = key; lastCacheAt = t; stats.rebuilds = (stats.rebuilds ?? 0) + 1;
      if (rebuild.next().done) { rebuild = null; palKey = key; }
    }
  }

  // ---------- light (ROUND3_DESIGN §3.2) ----------
  /** Sun disc + two-term glow, drawn live so it can bloom at the summit (L1). */
  function drawSun(g: CanvasRenderingContext2D, ss: SkyState) {
    if (!ss.sun || ss.sunVis <= 0) return;
    const r = 0.028 * Math.min(w, h);
    const sunCol = mixRGB(pal.sun, ss.light.key, 0.35);
    const glowR = r * 9 * ss.glow;
    const gg = g.createRadialGradient(ss.sun.x, ss.sun.y, 0, ss.sun.x, ss.sun.y, glowR);
    gg.addColorStop(0, css(sunCol, 0.55 * ss.sunVis));
    gg.addColorStop(0.18, css(sunCol, 0.22 * ss.sunVis));
    gg.addColorStop(1, css(sunCol, 0));
    g.fillStyle = gg; g.fillRect(ss.sun.x - glowR, ss.sun.y - glowR, glowR * 2, glowR * 2);
    g.fillStyle = css(lighten(sunCol, 0.2), ss.sunVis);
    g.beginPath(); g.arc(ss.sun.x, ss.sun.y, r, 0, Math.PI * 2); g.fill();
  }

  /** Unit vector toward the sun in screen space (or straight up when there's no sun). */
  function sunDir(c: V): V {
    const ss = lastSky;
    if (!ss?.sun || ss.sunVis < 0.05) return { x: 0, y: -1 };
    const dx = ss.sun.x - c.x, dy = ss.sun.y - c.y, d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  /** Soft cast shadow lying along the slope away from the sun, plus contact AO (L7). */
  function drawShadow(g: CanvasRenderingContext2D, groundS: number, heightPx: number, aoHalfW: number, len: number) {
    const ss = lastSky;
    if (!ss) return;
    const gp = toS(path.at(groundS));
    const tan = path.tangentAt(Math.max(0, Math.min(1.05, groundS)));
    const ang = Math.atan2(-tan.y, tan.x); // screen angle of the uphill tangent
    const L = sunDir(gp);
    const shadowLen = ss.sun && ss.sunVis > 0.05 ? ss.light.shadowLen * ss.sunVis : 0;
    if (shadowLen > 0.05) {
      const dir = L.x > 0 ? -1 : 1; // away from the sun along the slope
      const half = Math.max(heightPx * 0.35, (heightPx * len * shadowLen) / 2);
      const cx = gp.x + Math.cos(ang) * dir * half * 0.9, cy = gp.y + Math.sin(ang) * dir * half * 0.9;
      g.save();
      g.translate(cx, cy); g.rotate(ang); g.scale(half, Math.max(1.5, heightPx * 0.07));
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      const a = 0.35 * (1 - ss.light.haze * 0.4);
      rg.addColorStop(0, css(darken(pal.rockShade, 0.4), a));
      rg.addColorStop(0.6, css(darken(pal.rockShade, 0.4), a * 0.6));
      rg.addColorStop(1, css(darken(pal.rockShade, 0.4), 0));
      g.fillStyle = rg;
      g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // Contact AO exactly under the contact point (no offset), so nothing hovers.
    g.save();
    g.translate(gp.x, gp.y); g.rotate(ang);
    g.fillStyle = css(darken(pal.rockShade, 0.5), 0.55);
    g.beginPath(); g.ellipse(0, 0, aoHalfW, Math.max(1, aoHalfW * 0.13), 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // ---------- figure ----------
  function groundAngleAt(x: number): number {
    const a = path.groundY(x - 0.01), b = path.groundY(x + 0.01);
    return Math.atan2(b - a, 0.02) / DEG;
  }

  interface FigureParts { far: V[][]; body: V[][]; head: V[]; hair: V[]; near: V[][]; marks: V[][] }

  /** Screen-space outlines for a pose (figure v2, ROUND3 §3.4). */
  function figureParts(pose: Pose, stone: V | null): FigureParts {
    const H = Hpx();
    const P = (v: V) => toS(v);
    const f = pose.facing;
    const load = pose.load ?? 0;
    const legFront = (leg: Limb) => { const a = groundAngleAt(leg.end.x) * DEG; return { x: Math.cos(a) * f, y: -Math.sin(a) * f }; };
    const leg = (i: 0 | 1) => {
      const lg = pose.legs[i];
      const out = limbOutline(P(lg.root), P(lg.joint), P(lg.end), H, 'leg', legFront(lg), 1 + 0.08 * load);
      const ga = -groundAngleAt(lg.end.x) * DEG;
      const foot = footOutline(P(lg.end), H, ga, f, pose.heel ? pose.heel[i] : 0);
      return [out, foot];
    };
    const arm = (i: 0 | 1) => {
      const am = pose.arms[i];
      const root = P(am.root), joint = P(am.joint), end = P(am.end);
      const out = limbOutline(root, joint, end, H, 'arm', { x: 0, y: -1 }, 1);
      let axis = Math.atan2(end.y - joint.y, end.x - joint.x);
      if (stone) { const c = P(stone); const rd = Math.atan2(end.y - c.y, end.x - c.x); if (Math.hypot(end.x - c.x, end.y - c.y) < Rw * S * 1.2) axis = rd + Math.PI / 2; }
      return [out, handOutline(end, H, axis, load)];
    };
    const pel = P(pose.pelvis), sh = P(pose.shoulder), hd = P(pose.head);
    const front = (() => { const l2 = Math.hypot(f, 0.3); return { x: f / l2, y: 0.3 / l2 }; })();
    const torso = torsoOutline(pel, sh, H, front, pose.breath, 0.02 + 0.01 * load);
    // Neck juts toward the stone.
    const nd = { x: hd.x - sh.x, y: hd.y - sh.y }, nl = Math.hypot(nd.x, nd.y) || 1;
    const nn = { x: -nd.y / nl, y: nd.x / nl };
    const neck = [
      { x: sh.x + nn.x * 0.040 * H, y: sh.y + nn.y * 0.040 * H }, { x: hd.x + nn.x * 0.034 * H, y: hd.y + nn.y * 0.034 * H },
      { x: hd.x - nn.x * 0.034 * H, y: hd.y - nn.y * 0.034 * H }, { x: sh.x - nn.x * 0.040 * H, y: sh.y - nn.y * 0.040 * H },
    ];
    const tilt = Math.atan2(nd.x, -nd.y);
    const head = headOutline(hd, H, tilt, f);
    const hairC = { x: hd.x - Math.cos(tilt) * 0.012 * H * f - Math.sin(tilt) * 0.01 * H, y: hd.y - Math.sin(tilt) * 0.012 * H * f * -1 - Math.cos(tilt) * 0.012 * H };
    const hair: V[] = [];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const x = Math.cos(a) * 0.064 * H, y = Math.sin(a) * 0.05 * H; hair.push({ x: hairC.x + x * Math.cos(tilt) - y * Math.sin(tilt), y: hairC.y + x * Math.sin(tilt) + y * Math.cos(tilt) - 0.02 * H }); }
    const [nl0, nf0] = leg(0), [nl1, nf1] = leg(1);
    const [na0, nh0] = arm(0), [na1, nh1] = arm(1);
    // Muscle highlight strokes (sun side): deltoid, upper back, calf.
    const marks = [na0.slice(1, 3), torso.slice(3, 5), nl0.slice(-5, -3)];
    return { far: [nl1, nf1, na1, nh1], body: [torso, clockwise(neck)], head, hair: clockwiseHair(hair), near: [nl0, nf0, na0, nh0], marks };
  }
  const clockwiseHair = (pts: V[]) => clockwise(pts);

  function fillParts(g: CanvasRenderingContext2D, parts: V[][]) {
    g.beginPath();
    for (const p of parts) if (finite(p)) smoothPath(g, p);
    g.fill();
  }

  function drawFigure(g: CanvasRenderingContext2D, pose: Pose, drawBoulderBetween: () => void, stone: V | null = null, withChains = false) {
    if (pose.alpha <= 0.001) { drawBoulderBetween(); return; }
    const parts = figureParts(pose, stone);
    const light = lastSky?.light ?? lightState(0.43);
    const figure = pal.figure;
    const far = mixRGB(mixRGB(figure, light.ambient, 0.25), pal.rockShade, 0.15);
    g.save();
    g.globalAlpha = pose.alpha;
    g.fillStyle = css(far);
    fillParts(g, parts.far);
    g.fillStyle = css(figure);
    fillParts(g, [...parts.body, parts.head]);
    g.fillStyle = css(darken(figure, 0.35));
    fillParts(g, [parts.hair]);
    g.restore();
    if (withChains) { drawCloth(g, 1, pose.alpha); drawHair(g, pose.alpha); }
    drawBoulderBetween();
    g.save();
    g.globalAlpha = pose.alpha;
    g.fillStyle = css(figure);
    fillParts(g, parts.near);
    g.restore();
    if (withChains) drawCloth(g, 0, pose.alpha);
    if (quality >= 0.75) {
      drawEdgeLight(g, pose, parts, 'bounce');
      if (!reduced || lastSky?.sun) drawEdgeLight(g, pose, parts, 'rim');
      if (quality >= 1 && lastSky?.sun) {
        g.save();
        g.globalAlpha = pose.alpha * 0.10 * light.rim * 2;
        g.strokeStyle = css(light.key); g.lineWidth = 1.2; g.lineCap = 'round';
        for (const m of parts.marks) { if (m.length < 2 || !finite(m)) continue; g.beginPath(); g.moveTo(m[0].x, m[0].y); for (const q of m.slice(1)) g.lineTo(q.x, q.y); g.stroke(); }
        g.restore();
      }
    }
  }

  /** Rim (sun side, key colour) or bounce (underside, warm ground light): the silhouette minus itself shifted. */
  function drawEdgeLight(g: CanvasRenderingContext2D, pose: Pose, parts: FigureParts, kind: 'rim' | 'bounce') {
    const ss = lastSky;
    if (!ss) return;
    const light = ss.light;
    const H = Hpx();
    const c = toS(pose.pelvis);
    let ux: number, uy: number, colour: RGB, alpha: number;
    if (kind === 'rim') {
      if (!ss.sun || ss.sunVis < 0.05) return;
      const L = sunDir(c);
      const rw = light.rimW;
      ux = L.x * rw; uy = L.y * rw; colour = light.key; alpha = Math.min(1, light.rim * 0.8) * ss.sunVis;
    } else {
      const bw = Math.max(1, 0.02 * H);
      ux = 0; uy = bw; colour = lighten(pal.rockLit, 0.1); alpha = 0.14;
    }
    const box = H * 2.4;
    const size = Math.ceil(box * 2 * scale);
    if (!rimLayer || rimLayer.width !== size) rimLayer = mk(size, size);
    const r = rimLayer.getContext('2d')!;
    r.setTransform(1, 0, 0, 1, 0, 0);
    r.clearRect(0, 0, size, size);
    r.setTransform(scale, 0, 0, scale, (box - c.x) * scale, (box - c.y) * scale);
    const all = [...parts.body, parts.head, ...parts.near];
    r.fillStyle = css(colour);
    fillParts(r, all);
    r.globalCompositeOperation = 'destination-out';
    r.translate(-ux, -uy);
    fillParts(r, all);
    r.globalCompositeOperation = 'source-over';
    g.save();
    g.globalAlpha = alpha * pose.alpha;
    g.drawImage(rimLayer, c.x - box, c.y - box, box * 2, box * 2);
    g.restore();
  }

  function drawBoulder(g: CanvasRenderingContext2D, centre: V, rot: number, lift = 0) {
    if (!boulderTex || !boulderOutline) return;
    const R = Rw * S;
    const c = toS(centre);
    c.y -= lift;
    g.save();
    g.translate(c.x, c.y);
    g.rotate(rot);
    const size = boulderTex.width / Math.max(1, scale * 1.5);
    g.drawImage(boulderTex, -size / 2, -size / 2, size, size);
    g.clip(boulderOutline);
    g.rotate(-rot);
    // Unrotated lighting pass from the light model (ROUND3_DESIGN §3.8).
    const ss = lastSky;
    const light = ss?.light ?? lightState(0.43);
    const sunOn = !!ss?.sun && ss.sunVis > 0.05;
    const L = sunDir(c);
    const lx = L.x * R * 0.45, ly = L.y * R * 0.45;
    const hl = g.createRadialGradient(lx, ly, R * 0.05, lx, ly, R * 1.1);
    hl.addColorStop(0, css(light.key, (0.30 + 0.15 * light.rim) * (sunOn ? ss!.sunVis : 0.35)));
    hl.addColorStop(1, css(light.key, 0));
    g.fillStyle = hl; g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
    const sh = g.createRadialGradient(-lx * 1.5, -ly * 1.5, R * 0.15, -lx * 1.5, -ly * 1.5, R * 1.35);
    sh.addColorStop(0, css(darken(light.ambient, 0.25), 0.55));
    sh.addColorStop(1, css(light.ambient, 0));
    g.fillStyle = sh; g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
    // Bounce: warm light reflected up from the slope onto the lower edge.
    const bounce = lighten(pal.rockLit, 0.1);
    const bg = g.createRadialGradient(0, R * 1.25, R * 0.4, 0, R * 1.25, R * 0.95);
    bg.addColorStop(0, css(bounce, 0.18)); bg.addColorStop(1, css(bounce, 0));
    g.fillStyle = bg; g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
    // Rim on the sun side: the outline minus itself shifted away from the sun.
    if (sunOn && quality >= 0.75) {
      const rw = light.rimW;
      g.translate(-L.x * rw, -L.y * rw);
      g.fillStyle = css(light.key, light.rim * 0.8 * ss!.sunVis);
      const ring = new Path2D();
      ring.rect(-R * 1.5, -R * 1.5, R * 3, R * 3);
      ring.addPath(boulderOutline);
      g.fill(ring, 'evenodd');
    }
    g.restore();
  }

  // ---------- particles v2 (ROUND3 §3.9) ----------
  function spawn(kind: Particle['kind'], x: number, y: number, vx: number, vy: number, r: number, life: number, s = 0) {
    const cap = quality >= 1 ? MAX_PARTICLES : quality >= 0.75 ? 36 : 20;
    let live = 0;
    for (const q of particles) if (q.live) live++;
    if (live >= cap) return;
    const p = particles.find((q) => !q.live);
    if (!p) return;
    p.live = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.r = r; p.life = life; p.age = 0; p.s = s; p.hops = 0;
  }

  /** Dust puffs drift back and down the slope with drag, then rise a little in the wind. */
  function dustAt(foot: V, n: number) {
    const H = Hw;
    const t = path.tangentAt(Math.max(0, Math.min(1, sAtX(foot.x))));
    for (let i = 0; i < n; i++) {
      const sp = (0.15 + rng() * 0.2) * H;
      spawn('dust', foot.x + (rng() - 0.5) * 0.03 * H, foot.y + 0.01 * H, -t.x * sp, -t.y * sp + 0.03 * H, (0.012 + rng() * 0.014) * H, 0.9 + rng() * 0.6);
    }
  }

  /** Grit: a few grains drop from the contact point and bounce once. */
  function gritAt(s: number, n: number) {
    const g = path.at(Math.max(0, s));
    for (let i = 0; i < n; i++) spawn('grit', g.x + (rng() - 0.5) * 0.01, g.y + 0.004, -(0.05 + rng() * 0.1) * Hw, 0.15 * Hw, 0.004 * Hw, 1.1);
  }

  function stepParticles(dt: number, t: number) {
    let live = 0;
    const wx = wind(t) * Hw;
    const drag = Math.pow(0.92, dt * 60);
    for (const p of particles) {
      if (!p.live) continue;
      p.age += dt;
      if (p.age >= p.life) { p.live = false; continue; }
      live++;
      if (p.kind === 'pebble') {
        // Roll down the path; each landing hop keeps 35% of its speed and kicks a tiny puff.
        const ang = path.angleAt(Math.max(0, Math.min(0.999, p.s))) * DEG;
        p.vx -= 2.2 * Hw * Math.sin(ang) * dt;
        p.s += (p.vx * dt) / path.length;
        p.vy -= 12 * Hw * dt;
        p.y = Math.max(0, p.y + p.vy * dt);
        if (p.y === 0 && p.vy < 0) {
          if (p.hops < 3 && Math.abs(p.vy) > 0.05 * Hw) {
            p.vy = Math.abs(p.vy) * 0.35; p.hops++;
            const g = path.at(p.s); spawn('dust', g.x, g.y, 0, 0.02 * Hw, 0.008 * Hw, 0.5);
          } else p.vy = 0;
        }
        if (p.s < -0.2) p.live = false;
      } else if (p.kind === 'grit') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 1.6 * Hw * dt;
        const gy = path.groundY(p.x);
        if (p.y < gy && p.hops === 0) { p.y = gy; p.vy = Math.abs(p.vy) * 0.35; p.hops = 1; }
      } else {
        p.vx = p.vx * drag + wx * 0.5 * dt * 2; p.vy = p.vy * drag + 0.01 * Hw * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
    stats.particles = live;
  }

  /** Two-tone dust sprite (lit toward the sun), rebuilt with the tint. */
  function buildDustSprite(light: LightKey) {
    const n = Math.max(8, Math.round(32 * scale));
    dustSprite = mk(n, n);
    const g = dustSprite.getContext('2d')!;
    const lit = mixRGB(pal.rockLit, light.key, 0.5), shade = mixRGB(pal.rockLit, light.ambient, 0.4);
    const rg = g.createRadialGradient(n * 0.4, n * 0.4, 0, n / 2, n / 2, n / 2);
    rg.addColorStop(0, css(lit, 1)); rg.addColorStop(0.55, css(mixRGB(lit, shade, 0.5), 0.6)); rg.addColorStop(1, css(shade, 0));
    g.fillStyle = rg; g.fillRect(0, 0, n, n);
  }

  function drawParticles(g: CanvasRenderingContext2D) {
    for (const p of particles) {
      if (!p.live) continue;
      const k = p.age / p.life;
      if (p.kind === 'pebble') {
        const base = path.at(p.s), n = path.normalAt(Math.max(0, Math.min(1, p.s)));
        const v = toS({ x: base.x + n.x * (p.r + p.y), y: base.y + n.y * (p.r + p.y) });
        g.fillStyle = css(darken(pal.rockShade, 0.1), 1 - k * 0.3);
        g.beginPath(); g.arc(v.x, v.y, Math.max(1, p.r * S), 0, Math.PI * 2); g.fill();
        g.fillStyle = css(lastSky?.light.key ?? pal.rockLit, 0.35 * (1 - k));
        g.beginPath(); g.arc(v.x - 0.3 * p.r * S, v.y - 0.3 * p.r * S, Math.max(0.5, p.r * S * 0.45), 0, Math.PI * 2); g.fill();
      } else if (p.kind === 'grit') {
        const v = toS({ x: p.x, y: p.y });
        g.fillStyle = css(darken(pal.rockShade, 0.2), 0.85 * (1 - k));
        g.fillRect(v.x, v.y, 1.5, 1.5);
      } else if (dustSprite) {
        const v = toS({ x: p.x, y: p.y });
        const r = p.r * S * (1 + 1.5 * (1 - (1 - k) * (1 - k)));
        g.globalAlpha = 0.35 * (1 - k) * (1 - k);
        g.drawImage(dustSprite, v.x - r, v.y - r, r * 2, r * 2);
        g.globalAlpha = 1;
      }
    }
  }

  // ---------- hair and cloth chains (ROUND3 §3.5) ----------
  let chains: { hair: Chain[]; cloth: Chain[] } | null = null;
  let chainAcc = 0;

  function chainAnchors(pose: Pose) {
    const H = Hw;
    const d = { x: pose.shoulder.x - pose.pelvis.x, y: pose.shoulder.y - pose.pelvis.y };
    const dl = Math.hypot(d.x, d.y) || 1;
    const front = { x: (pose.facing * d.y) / dl, y: (-pose.facing * d.x) / dl };
    const up = { x: d.x / dl, y: d.y / dl };
    const hd = pose.head;
    return {
      hair: [0, 1].map((i) => ({ x: hd.x - front.x * 0.045 * H + up.x * (0.03 - i * 0.015) * H, y: hd.y - front.y * 0.045 * H + up.y * (0.03 - i * 0.015) * H })),
      cloth: [1, -1].map((side) => ({ x: pose.pelvis.x + front.x * 0.07 * H * side - up.x * 0.03 * H, y: pose.pelvis.y + front.y * 0.07 * H * side - up.y * 0.03 * H })),
      back: { x: -front.x, y: -front.y },
    };
  }

  function updateChains(pose: Pose, dt: number, t: number, rest: boolean) {
    const a = chainAnchors(pose);
    const H = Hw;
    if (!chains) {
      chains = {
        hair: a.hair.map((p) => makeChain(p, 3, 0.04 * H, 35, 1.0, { x: a.back.x * 0.7, y: -0.7 })),
        cloth: a.cloth.map((p) => makeChain(p, 4, 0.03 * H, 25, 0.6, { x: 0, y: -1 })),
      };
      rest = true;
    }
    const grav = 0.9 * H * 9;
    const w = wind(t) * H * 6;
    const hairDir = { x: a.back.x * 0.6, y: 0.4 }, clothDir = { x: 0, y: -1 };
    if (rest) {
      chains.hair.forEach((c, i) => solveRest(c, a.hair[i], hairDir, grav * 0.4, w));
      chains.cloth.forEach((c, i) => solveRest(c, a.cloth[i], clothDir, grav, w * 0.6));
      return;
    }
    chainAcc = Math.min(chainAcc + dt, 3 / 60);
    const sub = quality >= 1 ? 3 : 1;
    let n = 0;
    while (chainAcc >= 1 / 60 && n < sub) {
      chains.hair.forEach((c, i) => stepChain(c, a.hair[i], hairDir, 1 / 60, grav * 0.4, w));
      chains.cloth.forEach((c, i) => stepChain(c, a.cloth[i], clothDir, 1 / 60, grav, w * 0.6));
      chainAcc -= 1 / 60; n++;
    }
  }

  function drawHair(g: CanvasRenderingContext2D, alpha: number) {
    if (!chains) return;
    const H = Hpx();
    g.save(); g.globalAlpha = alpha;
    g.strokeStyle = css(darken(pal.figure, 0.35)); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const c of chains.hair) {
      for (let i = 1; i < c.p.length; i++) {
        const a = toS(c.p[i - 1]), b = toS(c.p[i]);
        g.lineWidth = Math.max(0.8, (0.016 - i * 0.004) * H);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    }
    g.restore();
  }

  function drawCloth(g: CanvasRenderingContext2D, which: 0 | 1, alpha: number) {
    if (!chains) return;
    const c = chains.cloth[which];
    const H = Hpx();
    const pts = c.p.map((p) => toS(p));
    const left: V[] = [], right: V[] = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      const wdt = (0.05 - (0.03 * i) / (pts.length - 1)) * H * 0.5;
      left.push({ x: p.x - (dy / l) * wdt, y: p.y + (dx / l) * wdt });
      right.push({ x: p.x + (dy / l) * wdt, y: p.y - (dx / l) * wdt });
    });
    g.save(); g.globalAlpha = alpha;
    g.fillStyle = css(mixRGB(pal.figure, pal.rockShade, 0.35));
    g.beginPath();
    smoothPath(g, clockwise([...left, ...right.reverse()]));
    g.fill();
    g.restore();
  }

  // ---------- gait / poses (motion v2, ROUND3 §3.7) ----------
  let lastFeet: V[] = [];
  let lastContactS = 0;

  function advanceGait(dt: number, t: number) {
    const still = phase === 'paused' || reduced;
    const speed = (seq?.kind === 'summit' || seq?.kind === 'mini' ? 1.2 : 1) * (1 - 0.6 * beatK(t));
    const climb = Math.min(1, Math.max(0, (sMap(progress) - s0()) / (s1() - s0())));
    motion.step(t, dt, { still, climb, speed, climbing: mode === 'climb' && !seq });
    if (still || mode !== 'climb') return;
    const m = motion.sample(t, false);
    // Small juice: dust when a planted foot slips; medium: the big slip (burst + pebbles); grit on the heave.
    motion.events.slipStart.forEach((on, i) => {
      if (!on || !lastFeet[i]) return;
      const big = i === 0 && m.bigSlip;
      dustAt(lastFeet[i], big ? 6 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 3));
      const pebbles = big ? 1 + Math.floor(rng() * 2) : rng() < 0.12 ? 1 : 0;
      for (let k = 0; k < pebbles && quality > 0.5; k++) {
        if (particles.filter((q) => q.live && q.kind === 'pebble').length >= 3) break;
        spawn('pebble', 0, 0, -0.05 * Hw - rng() * 0.05 * Hw, 0.02 * Hw, (0.012 + rng() * 0.008) * Hw, 4, sAtX(lastFeet[i].x));
      }
    });
    if (motion.events.heaveStart) gritAt(lastContactS, 2 + Math.floor(rng() * 2));
  }

  function pushPose(sB: number, t: number, alpha = 1) {
    const still = phase === 'paused' || reduced;
    const m = motion.sample(t, still);
    const ph = m.phi;
    const k = m.strainK;
    // Look-ahead lean (anticipation): dig in before a steeper pitch, ease off toward a bench (§3.3.5).
    const thAhead = path.angleAt(Math.min(0.999, sB + (0.5 * Hw) / path.length));
    const fdt = Math.min(0.2, Math.max(0, t - leanT)); leanT = t;
    leanAhead = leanAhead === 0 ? thAhead : leanAhead + (thAhead - leanAhead) * Math.min(1, fdt / 1.2);
    const ahead = Math.max(-8, Math.min(5, 0.6 * (leanAhead - meanSlope)));
    const bk = still ? 0 : beatK(t);
    // Drag hierarchy: pelvis leads; the spine lags ~60 ms and the head ~120 ms behind it.
    const spineLean = still ? 48 : leanDeg(ph - 0.023) * (1 - k) + 51 * k;
    const lean = Math.max(36, Math.min(53, spineLean + ahead - 8 * bk + m.leanAdj));
    const hip = (still ? 0.455 : hipH(ph)) - 0.02 * k + 0.02 * bk + m.hipAdj;
    const sg = still ? 0 : surgeCurve(ph) * m.heave * m.surgeMul * (1 - bk);
    const tremor = k > 0 ? 0.006 * Math.sin(2 * Math.PI * 5 * t) * k : 0;
    const headLag = still ? 30 : (leanDeg(ph - 0.046) + ahead - 18) * (1 - k) + (lean - 4) * k;
    const headTilt = (headLag + (still ? 0 : 3 * (noise1(t * 0.4) * 2 - 1))) * (1 - bk) + 10 * bk;
    const breath = m.breath * (1 + 0.025 * bk * Math.sin(Math.min(1, Math.max(0, (t - beatT0 - 0.4) / 0.6)) * Math.PI));
    // The stone gives back on a damped spring (pushed on each shove, rolls back on each slip).
    const nudge = (m.spring * Hw) / path.length;
    const r = solvePush({
      path, H: Hw, sB: sB + nudge, phi: ph, lean, hip, surge: sg, tremor, headTilt, breath, alpha,
      strideMul: still ? 1 : m.strideMul, liftMul: still ? 1 : m.liftMul, slipExtra: m.slipExtra, shoulderLift: m.shoulderLift,
    }, pelvisOffset(path, sB, Hw));
    lastFeet = r.feet;
    lastContactS = sB + nudge;
    // Heel lifts in the grip push (φ .55 → 1 of that foot), the push-off that sells the drive.
    const heelOf = (off: number) => { const fph = (((ph + off) % 1) + 1) % 1; return fph >= 0.55 ? 22 * DEG * Math.pow((fph - 0.55) / 0.45, 2) : 0; };
    r.pose.heel = still ? [0, 0] : [heelOf(0), heelOf(0.5)];
    r.pose.load = still ? 0.5 : Math.min(1, sg / 0.018 + k);
    return { pose: r.pose, boulderC: r.boulder, rot: ((sB + nudge) * path.length) / Rw, tremor };
  }

  function standPose(t: number, alpha = 1) {
    const sB = plateauMid();
    const bc = boulderCentre(path, sB, Rw);
    let sway = 0;
    if (!reduced) {
      if (t - swayStart > nextSway) { swayStart = t; nextSway = 6 + rng() * 3; }
      const st = t - swayStart;
      sway = st < 1.2 ? 0.01 * Math.sin((st / 1.2) * Math.PI) : 0;
    }
    const breath = 1 + (reduced ? 0 : 0.012 * Math.sin((2 * Math.PI * t) / 3.2));
    return { pose: solveStand(path, Hw, bc.x - Rw - 0.14 * Hw, bc, { sway, breath, alpha }), boulderC: bc, rot: (sB * path.length) / Rw };
  }

  function sitPose(t: number, alpha = 1) {
    const sB = plateauMid();
    const bc = boulderCentre(path, sB, Rw);
    const breath = 1 + (reduced ? 0 : 0.012 * Math.sin((2 * Math.PI * t) / 3.2));
    return { pose: solveSit(path, Hw, bc, breath, alpha), boulderC: bc, rot: (sB * path.length) / Rw };
  }

  // ---------- frame ----------
  let lastSky: SkyState | null = null;
  let rollFrom: Palette | null = null;
  let rollLight: LightKey | null = null;

  function sceneFrame(t: number, dt: number) {
    if (!ctx || !canvas) return;
    // Sequence bookkeeping
    if (seq && t - seq.t0 >= seq.dur) {
      const done = seq.kind;
      seq = null;
      if (done === 'mini') startSeq('rollback', t);
      else if (done === 'rollback') { mode = 'climb'; motion.phi = 0; }
    }
    if (desatK !== desatTarget) {
      const step = dt / 0.4;
      desatK = desatTarget > desatK ? Math.min(desatTarget, desatK + step) : Math.max(desatTarget, desatK - step);
    }
    ambientT += dt * (phase === 'paused' ? 0.25 : 1);
    advanceGait(dt, t);
    stepParticles(dt, t);
    const ss = skyState(t);
    lastSky = ss;
    maybeRebuild(t, ss);

    const g = ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(sky!, 0, 0);
    g.setTransform(scale, 0, 0, scale, 0, 0);
    // Stars (twinkle per frame)
    if (ss.starVis > 0.01) {
      for (const st of stars) {
        const appear = phase === 'complete' ? ss.starVis >= 0.25 + 0.6 * (1 - st.b) ? 1 : 0 : 1;
        if (!appear) continue;
        const tw = reduced ? 1 : 0.75 + 0.25 * Math.sin(ambientT * 0.8 + st.ph);
        g.fillStyle = `rgba(255,248,235,${(0.35 + 0.65 * st.b) * tw * Math.min(1, ss.starVis * 1.2)})`;
        const sz = 0.8 + st.b * 1.1;
        g.fillRect(st.x, st.y, sz, sz);
      }
    }
    drawSun(g, ss);
    // Evening star near the end of the climb
    if ((phase === 'focus' || phase === 'open') && progress > 0.88) {
      const a = smoothstep(0.88, 0.92, progress);
      g.fillStyle = `rgba(255,250,240,${0.9 * a})`;
      g.beginPath(); g.arc(w * 0.78, h * 0.16, 1.8, 0, Math.PI * 2); g.fill();
    }
    // Clouds
    if (clouds.length && quality > 0.5) {
      const band0 = h - oy - (HORIZON_Y + 0.45) * S, band1 = h - oy - (HORIZON_Y + 0.12) * S;
      clouds.forEach((c, i) => {
        const cw = c.width / scale, ch = c.height / scale;
        const span = w + cw;
        const x = ((ambientT * 4 + i * span * 0.37 + i * 97) % span) - cw;
        const y = band0 + (band1 - band0) * (0.2 + 0.3 * i);
        g.globalAlpha = phase === 'break' ? 0.35 : 0.8;
        g.drawImage(c, x, y, cw, ch);
      });
      g.globalAlpha = 1;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(land!, 0, 0);
    g.setTransform(scale, 0, 0, scale, 0, 0);

    // Figure + boulder state
    let fig: { pose: Pose; boulderC: V; rot: number; tremor?: number } | null = null;
    let boulderC: V, rot: number, lift = 0;
    let fig2: { pose: Pose } | null = null;
    const sq = seq;
    const st = sq ? t - sq.t0 : 0;
    if (sq && (sq.kind === 'summit' || sq.kind === 'mini')) {
      const pushEnd = sq.kind === 'mini' ? 1.0 : 1.2;
      const sB = st < 1.4 ? s1() + (plateauMid() - s1()) * easeOut(Math.min(1, st / 1.4)) : plateauMid();
      const push = pushPose(Math.min(sB, plateauMid()), t);
      const stand = standPose(t);
      const k = easeInOut(smoothstep(pushEnd, sq.kind === 'mini' ? 1.4 : 2.6, st));
      const pose = blendPose(push.pose, stand.pose, k);
      // Spring rock after arriving
      const rock = st > 1.4 ? 3 * DEG * Math.exp(-(st - 1.4) * 2.2) * Math.sin((st - 1.4) * 9) : 0;
      boulderC = k < 1 ? push.boulderC : stand.boulderC;
      rot = (sB * path.length) / Rw + rock;
      if (st > 1.38 && st < 1.42 + dt && !reduced) dustAt(path.at(plateauMid() - Rw / path.length), 10);
      fig = { pose, boulderC, rot };
    } else if (sq && sq.kind === 'rollback') {
      // 0–0.4 tip back, 0.4–2.0 roll down under gravity, 2.0–2.4 hops, figure fades
      const top = plateauMid();
      const base = s0();
      let sB: number;
      if (st < 0.4) sB = top - (0.02 / path.length) * easeInOut(st / 0.4);
      else if (st < 2.0) { const u = (st - 0.4) / 1.6; sB = top - 0.02 / path.length - (top - 0.02 / path.length - base) * u * u; }
      else sB = base;
      if (st >= 2.0 && st < 2.4) { const u = (st - 2.0) / 0.4; lift = (u < 0.6 ? 0.06 * Math.sin((u / 0.6) * Math.PI) : 0.02 * Math.sin(((u - 0.6) / 0.4) * Math.PI)) * Hpx(); }
      boulderC = boulderCentre(path, sB, Rw);
      rot = (sB * path.length) / Rw - (st < 0.4 ? 10 * DEG * (st / 0.4) : 10 * DEG);
      if (Math.floor(st / 0.25) !== Math.floor((st - dt) / 0.25) && st > 0.4 && st < 2.0) dustAt(path.at(sB), 2);
      if (st >= 2.0 && st - dt < 2.0) dustAt(path.at(base), 8);
      const fromSit = sq.from === 'sit';
      const old = fromSit ? sitPose(t, 1 - smoothstep(0.6, 0.9, st)) : standPose(t, 1 - smoothstep(0.6, 0.9, st));
      fig2 = { pose: old.pose };
      const baseFig = pushPose(base, t, smoothstep(2.1, 2.5, st));
      fig = { pose: baseFig.pose, boulderC, rot };
    } else if (mode === 'stand') {
      const s2 = standPose(t);
      if (sq && sq.kind === 'standup') {
        const k = smoothstep(0, STANDUP_DUR, st);
        fig2 = { pose: sitPose(t, 1 - k).pose };
        s2.pose.alpha = k;
      }
      fig = s2; boulderC = s2.boulderC; rot = s2.rot;
    } else if (mode === 'sit') {
      const s2 = sitPose(t);
      if (sq && sq.kind === 'fadein') s2.pose.alpha = smoothstep(0, FADEIN_DUR, st);
      fig = s2; boulderC = s2.boulderC; rot = s2.rot;
    } else {
      const sB = sMap(progress);
      const pp = pushPose(sB, t);
      fig = pp; boulderC = pp.boulderC; rot = pp.rot + (pp.tremor ? pp.tremor * 0.5 : 0);
    }

    // Trail: done (scuffed) behind the stone, dotted ahead to the summit lip.
    // Contact point: the ground point under the centre along the normal (centre − n·R).
    const sBnow = (() => {
      let sg = sAtX(boulderC!.x);
      for (let i = 0; i < 2; i++) { const n = path.normalAt(Math.max(0, Math.min(1.2, sg))); sg = sAtX(boulderC!.x - n.x * Rw); }
      return sg;
    })();
    const H = Hpx();
    g.lineCap = 'round';
    g.strokeStyle = css(darken(pal.rockShade, 0.2), 0.35);
    g.lineWidth = 3;
    g.beginPath();
    const doneEnd = Math.min(1, sBnow - (Rw * 0.9) / path.length);
    for (let i = 0; i <= 40; i++) { const s = (doneEnd * i) / 40; const v = toS(path.at(s)); if (i === 0) g.moveTo(v.x, v.y - 1); else g.lineTo(v.x, v.y - 1); }
    if (doneEnd > 0) g.stroke();
    g.fillStyle = 'rgba(244,241,234,0.18)';
    g.beginPath();
    for (let s = Math.max(0, sBnow + (Rw * 1.1) / path.length); s <= 1; s += 0.016) { const v = toS(path.at(s)); g.moveTo(v.x + 1.4, v.y - 3); g.arc(v.x, v.y - 3, 1.4, 0, Math.PI * 2); }
    g.fill();

    // Cast shadows + contact AO (stone, then the figure from its feet).
    const Rpx = Rw * S;
    const contactS = sBnow;
    if (lift < Rpx) drawShadow(g, contactS, Rpx * 2, Rpx * 0.4, 0.5);
    if (fig && fig.pose.alpha > 0.3) {
      const fm = { x: (fig.pose.legs[0].end.x + fig.pose.legs[1].end.x) / 2 };
      drawShadow(g, sAtX(fm.x), H, H * 0.09, 0.5);
    }

    if (fig2) drawFigure(g, fig2.pose, () => {});
    const bcx = boulderC!, brot = rot!;
    if (fig) {
      updateChains(fig.pose, dt, t, reduced);
      drawFigure(g, fig.pose, () => drawBoulder(g, bcx, brot, lift), bcx, true);
    }
    else drawBoulder(g, bcx, brot, lift);
    drawParticles(g);

    // Foreground rocks (L10).
    if (fgLayer) {
      // Blit only the rock rectangles, not the whole (mostly empty) layer.
      g.setTransform(1, 0, 0, 1, 0, 0);
      for (const r of foregroundRocks(layout, w, h, S)) {
        const x0 = Math.max(0, Math.floor((r.cx - r.r - 4) * scale)), y0 = Math.max(0, Math.floor((r.cy - r.r - 4) * scale));
        const x1 = Math.min(fgLayer.width, Math.ceil((r.cx + r.r + 4) * scale)), y1 = Math.min(fgLayer.height, Math.ceil((r.cy + r.r + 4) * scale));
        if (x1 > x0 && y1 > y0) g.drawImage(fgLayer, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      }
      g.setTransform(scale, 0, 0, scale, 0, 0);
    }
    // Grade (L11): vignette + warm/cool wash.
    // (baked into the sky and land caches at rebuild time)

    // Reduced-motion completion cross-fade from the last climbing frame.
    if (seq && seq.kind === 'crossfade' && snapshot) {
      const k = 1 - Math.min(1, (t - seq.t0) / CROSSFADE_DUR);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = k;
      g.drawImage(snapshot, 0, 0);
      g.globalAlpha = 1;
    }
  }

  function startSeq(kind: SeqKind, t: number, from?: Mode) {
    const dur = kind === 'summit' ? SUMMIT_DUR : kind === 'mini' ? MINI_DUR : kind === 'rollback' ? ROLLBACK_DUR : kind === 'standup' ? STANDUP_DUR : kind === 'fadein' ? FADEIN_DUR : CROSSFADE_DUR;
    seq = { kind, t0: t, dur, from };
    // Review S6: the roll-back cross-fades from the sky as it is now to dawn, instead of scrubbing back through noon.
    if (kind === 'rollback') { rollFrom = lastSky ? lastSky.pal : null; rollLight = lastSky ? lastSky.light : null; }
    if (reduced && kind !== 'crossfade') { seq = null; }
    ensureLoop();
  }

  function targetFps(): number {
    if (seq) return 60;
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
    const t0 = performance.now();
    sceneFrame(t, dt);
    const ms = performance.now() - t0;
    record(ms, t);
    if (reduced && !seq) return; // static illustration: no loop
    raf = requestAnimationFrame(loop);
  }

  function record(ms: number, t: number) {
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

  /** Static (reduced-motion) redraw. */
  function drawNow() {
    if (!mounted) return;
    const t = nowS();
    sceneFrame(t, 0);
    lastDraw = t;
  }

  function takeSnapshot() {
    if (!canvas) return;
    snapshot = mk(canvas.width, canvas.height);
    snapshot.getContext('2d')!.drawImage(canvas, 0, 0);
  }

  return {
    stats,
    mount(c: HTMLCanvasElement, opts: SceneInitOptions) {
      canvas = c;
      ctx = c.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas 2D unavailable');
      reduced = opts.reducedMotion;
      colorScheme = opts.colorScheme;
      mounted = true;
      running = true;
      w = c.clientWidth || 800; h = c.clientHeight || 600;
      applySize();
      if (reduced) drawNow(); else ensureLoop();
    },
    setProgress(p: number) {
      const q = Math.min(1, Math.max(0, p));
      if (phase === 'open' && q < lastProgress - 0.5 && !seq && mode === 'climb') startSeq('mini', nowS());
      // Review S5: when the break runs out, the figure stands up beside the stone (1 s).
      if (phase === 'break' && q >= 1 && progress < 1 && mode === 'sit' && phaseSet) {
        mode = 'stand';
        if (!reduced) { startSeq('standup', nowS()); }
      }
      // False summits at 25/50/75% (ROUND3 §3.3.2): light the cairn; play the beat on a live crossing only.
      const passed = (phase === 'focus' || phase === 'open' || phase === 'paused') ? [0.25, 0.5, 0.75].filter((b) => q >= b).length : benchesLit;
      if (passed > benchesLit && phaseSet && (phase === 'focus' || phase === 'open') && !reduced && q - lastProgress < 0.01 && lastProgress > 0) beatT0 = nowS();
      if (passed !== benchesLit) { benchesLit = passed; palKey = ''; }
      lastProgress = q;
      progress = q;
      if (reduced && mounted) {
        const t = nowS();
        const moved = Math.abs(sMap(q) - sMap(lastDrawnP)) * path.length * S * scale;
        if ((moved >= 1 && t - lastDraw >= 60) || phase !== 'focus') { lastDrawnP = q; drawNow(); }
      }
    },
    setPhase(next: ScenePhase, opts?: { instant?: boolean }) {
      const prev = phase;
      const t = nowS();
      const first = !phaseSet;
      // A repeat of the current phase (e.g. the host re-sending it right after mount) must not reset the figure.
      if (!first && next === prev && !opts?.instant) return;
      phaseSet = true;
      phase = next;
      desatTarget = next === 'paused' ? 1 : 0;
      if (first || opts?.instant) {
        // A fresh mount (or restore) renders the right state directly.
        seq = null;
        mode = next === 'complete' ? 'stand' : next === 'break' ? (progress >= 1 ? 'stand' : 'sit') : 'climb';
        desatK = desatTarget;
      } else if (next === 'complete' && (prev === 'focus' || prev === 'open' || prev === 'paused')) {
        mode = 'stand';
        if (reduced) { takeSnapshot(); seq = { kind: 'crossfade', t0: t, dur: CROSSFADE_DUR }; ensureLoop(); }
        else startSeq('summit', t);
      } else if (next === 'break') {
        mode = 'sit';
        startSeq('fadein', t);
      } else if ((next === 'focus' || next === 'open') && (prev === 'complete' || prev === 'break')) {
        const from = mode;
        mode = 'climb';
        progress = 0;
        if (!reduced) startSeq('rollback', t, from === 'sit' ? 'sit' : 'stand');
      } else {
        mode = 'climb';
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
      // Sequences are timestamp-driven: snap to the end if we were away for long.
      if (seq && nowS() - seq.t0 > seq.dur + 6) seq = null;
      if (reduced) drawNow(); else ensureLoop();
    },
    setReducedMotion(r: boolean) {
      reduced = r;
      if (r) { if (raf) cancelAnimationFrame(raf); raf = 0; seq = seq?.kind === 'crossfade' ? seq : null; drawNow(); }
      else ensureLoop();
    },
    destroy() {
      mounted = false; running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      sky = land = rimLayer = gradeLayer = detail = fgLayer = boulderTex = snapshot = null;
      skyB = landB = gradeB = fgB = null; rebuild = null;
      clouds = [];
      canvas = null; ctx = null;
    },
  };
}

