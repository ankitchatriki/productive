// "Sisyphus" focus scene (STRUGGLEMORE_DESIGN §3): Canvas 2D, a figure pushing a boulder
// up a dusk-lit mountain. Boulder position on the slope = block progress.
import type { SceneEngine, SceneInitOptions, ScenePhase } from './types';
import { NIGHT, PREDAWN, css, darken, desaturate, gradePalette, hex, lighten, mixPalette, mixRGB, palette, type Palette, type RGB } from './palette';
import { FIGURE_H, layoutFor, startS, summitS, sunPosition, type Layout, type SlopePath, type V } from './path';
import { RANGE_LAYERS, RIDGES, backSide, benchProgressMap, buildRidgePath, rangeSkyline, snowEdge, type RidgePath } from './ridge';
import {
  BODY, DEG, blendPose, boulderCentre, easeInOut, easeOut, hipH, leanDeg, pelvisOffset, solvePush, solveSit, solveStand,
  surge as surgeCurve, type Limb, type Pose,
} from './rig';
import { hash2, mulberry32, noise2, ridged, smoothstep } from './noise';
import { NIGHT_LIGHT, lightState, mixLight, type LightKey } from './light';

type Mode = 'climb' | 'stand' | 'sit';
type SeqKind = 'summit' | 'mini' | 'rollback' | 'standup' | 'fadein' | 'crossfade';
interface Seq { kind: SeqKind; t0: number; dur: number; from?: Mode }

interface Particle { live: boolean; kind: 'dust' | 'pebble' | 'grit'; x: number; y: number; vx: number; vy: number; r: number; life: number; age: number; s: number; hops: number }

const MAX_PARTICLES = 60;
const HORIZON_Y = 0.30;
const SUMMIT_DUR = 6.0, MINI_DUR = 1.4, ROLLBACK_DUR = 2.8, STANDUP_DUR = 1.0, FADEIN_DUR = 0.6, CROSSFADE_DUR = 1.0;

/** Debug/measurement hook read by the e2e scripts. */
export interface SceneStats { frames: number; avgMs: number; maxMs: number; fps: number; quality: number; particles: number }

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
  let phi = 0.42, T = 2.6, cyclesUntilPause = 6, strainUntil = 0, strainStart = 0, heave = 1;
  let lastFrame = 0, lastDraw = 0, ambientT = 0, lastDrawnP = 0;
  // Pause look
  let desatK = 0, desatTarget = 0;
  // Stand idle sway
  let swayStart = 0, nextSway = 7;
  // Caches
  let sky: HTMLCanvasElement | null = null, land: HTMLCanvasElement | null = null, rimLayer: HTMLCanvasElement | null = null, gradeLayer: HTMLCanvasElement | null = null;
  let clouds: HTMLCanvasElement[] = [];
  let boulderTex: HTMLCanvasElement | null = null;
  let boulderOutline: Path2D | null = null;
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
    palKey = '';
    lastCacheAt = -1e9;
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
    for (let i = 0; i < 8; i++) {
      const a = pr() * Math.PI * 2, d = pr() * R * 0.75, rr = R * (0.04 + pr() * 0.06);
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      g.fillStyle = 'rgba(10,6,4,0.35)';
      g.beginPath(); g.ellipse(x - rr * 0.15, y + rr * 0.15, rr, rr * 0.75, 0.3, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,235,210,0.18)';
      g.beginPath(); g.ellipse(x + rr * 0.25, y - rr * 0.25, rr * 0.7, rr * 0.45, 0.3, 0, Math.PI * 2); g.fill();
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

  function rebuildCaches(ss: SkyState) {
    const cw = canvas!.width, ch = canvas!.height;
    pal = gradePalette(ss.pal);
    if (desatK > 0) pal = desaturate(pal, 0.35 * desatK, 0.08 * desatK);
    // Sky
    if (!sky || sky.width !== cw || sky.height !== ch) sky = mk(cw, ch);
    const g = sky.getContext('2d')!;
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
    if (!gradeLayer || gradeLayer.width !== cw || gradeLayer.height !== ch) gradeLayer = mk(cw, ch);
    const gl = gradeLayer.getContext('2d')!;
    gl.setTransform(1, 0, 0, 1, 0, 0); gl.clearRect(0, 0, cw, ch);
    gl.setTransform(scale, 0, 0, scale, 0, 0);
    const warm = ss.light.warmth;
    gl.fillStyle = warm >= 0 ? css(ss.light.key, 0.06 * warm) : css([0.45, 0.5, 0.75], -0.06 * warm);
    gl.fillRect(0, 0, w, h);
    vignette(gl);

    // Land (ROUND3_DESIGN §3.3): peaked range layers with snow and haze, then the main mountain.
    if (!land || land.width !== cw || land.height !== ch) land = mk(cw, ch);
    const l = land.getContext('2d')!;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, cw, ch);
    l.setTransform(scale, 0, 0, scale, 0, 0);
    drawRange(l, ss);
    drawMountain(l, ss);
    buildClouds(lighten(mixRGB(pal.horizon, pal.zenith, 0.3), 0.15));
    buildBoulderTexture(pal.boulderBase);
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

  function drawMountain(l: CanvasRenderingContext2D, ss: SkyState) {
    const { body, back } = mountainShape();
    mountainBody = body;
    const sp = path.spec;
    const top = toS(sp.plateauEnd).y;
    const mg = l.createLinearGradient(0, top, 0, h);
    mg.addColorStop(0, css(mixRGB(pal.rockLit, ss.light.key, 0.12)));
    mg.addColorStop(1, css(mixRGB(pal.rockShade, ss.light.ambient, 0.3)));
    l.fillStyle = mg; l.fill(body);
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
    if (key !== palKey && (t - lastCacheAt >= minGap || !sky)) {
      rebuildCaches(ss);
      palKey = key;
      lastCacheAt = t;
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
  /** Tapered capsule as one closed contour (consistent winding, so unions never punch holes). */
  function capsule(g: CanvasRenderingContext2D, a: V, b: V, r0: number, r1: number) {
    const th = Math.atan2(b.y - a.y, b.x - a.x);
    g.moveTo(a.x + Math.cos(th + Math.PI / 2) * r0, a.y + Math.sin(th + Math.PI / 2) * r0);
    g.arc(a.x, a.y, r0, th + Math.PI / 2, th + (3 * Math.PI) / 2);
    g.arc(b.x, b.y, r1, th - Math.PI / 2, th + Math.PI / 2);
    g.closePath();
  }

  function disc(g: CanvasRenderingContext2D, c: V, r: number) {
    g.moveTo(c.x + r, c.y);
    g.arc(c.x, c.y, r, 0, Math.PI * 2);
  }

  function limbPath(g: CanvasRenderingContext2D, limb: Limb, leg: boolean, facing: 1 | -1, groundAngle: number) {
    const H = Hpx();
    const a = toS(limb.root), j = toS(limb.joint), e = toS(limb.end);
    if (leg) {
      capsule(g, a, j, (BODY.legW0 * H) / 2, (BODY.legW0 * H) / 2.25);
      capsule(g, j, e, (BODY.legW0 * H) / 2.3, (BODY.legW1 * H) / 2);
      // Foot along the ground toward the facing side.
      const fl = BODY.footL * H, fh = BODY.footH * H;
      const ang = -groundAngle * DEG;
      const cx = Math.cos(ang) * facing, cy = Math.sin(ang) * facing;
      const heel = { x: e.x - cx * fl * 0.2, y: e.y - cy * fl * 0.2 };
      const toe = { x: e.x + cx * fl * 0.8, y: e.y + cy * fl * 0.8 };
      capsule(g, { x: heel.x, y: heel.y - fh * 0.1 }, { x: toe.x, y: toe.y + fh * 0.1 }, fh * 0.7, fh * 0.45);
    } else {
      capsule(g, a, j, (BODY.armW0 * H) / 2, (BODY.armW0 * H) / 2.2);
      capsule(g, j, e, (BODY.armW0 * H) / 2.3, (BODY.armW1 * H) / 2);
      disc(g, e, BODY.handR * H);
    }
  }

  function torsoPath(g: CanvasRenderingContext2D, pose: Pose) {
    const H = Hpx();
    const p = toS(pose.pelvis), s = toS(pose.shoulder), hd = toS(pose.head);
    const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1e-6;
    const nx = -dy / d, ny = dx / d; // screen normal
    const hw = (BODY.hipW * H * pose.breath) / 2, sw = (BODY.shoulderW * H * pose.breath) / 2;
    // "front" side = facing direction (+x for uphill). Choose the normal side with x sign matching facing.
    const fs = Math.sign(nx || 1) === pose.facing ? 1 : -1;
    const fx = nx * fs, fy = ny * fs;
    const bulge = 0.02 * H;
    const hipF = { x: p.x + fx * hw, y: p.y + fy * hw }, hipB = { x: p.x - fx * hw, y: p.y - fy * hw };
    const shF = { x: s.x + fx * sw, y: s.y + fy * sw }, shB = { x: s.x - fx * sw, y: s.y - fy * sw };
    // Clockwise in screen space (matches arc winding) whichever way the figure faces.
    const pts: Array<[number, number, number?, number?]> = [
      [hipB.x, hipB.y], [hipF.x, hipF.y],
      [shF.x, shF.y, (hipF.x + shF.x) / 2 + fx * bulge, (hipF.y + shF.y) / 2 + fy * bulge],
      [shB.x, shB.y, s.x + ((s.x - p.x) / d) * sw * 0.9, s.y + ((s.y - p.y) / d) * sw * 0.9],
    ];
    const area = (hipF.x - hipB.x) * (shF.y - hipB.y) - (hipF.y - hipB.y) * (shF.x - hipB.x);
    if (area < 0) {
      g.moveTo(hipB.x, hipB.y);
      g.lineTo(hipF.x, hipF.y);
      g.quadraticCurveTo(pts[2][2]!, pts[2][3]!, shF.x, shF.y);
      g.quadraticCurveTo(pts[3][2]!, pts[3][3]!, shB.x, shB.y);
    } else {
      g.moveTo(hipB.x, hipB.y);
      g.lineTo(shB.x, shB.y);
      g.quadraticCurveTo(pts[3][2]!, pts[3][3]!, shF.x, shF.y);
      g.quadraticCurveTo(pts[2][2]!, pts[2][3]!, hipF.x, hipF.y);
    }
    g.closePath();
    disc(g, p, hw * 1.05);
    // Neck + head
    capsule(g, s, hd, 0.04 * H, 0.034 * H);
    disc(g, hd, BODY.headR * H);
  }

  function groundAngleAt(x: number): number {
    const a = path.groundY(x - 0.01), b = path.groundY(x + 0.01);
    return Math.atan2(b - a, 0.02) / DEG;
  }

  function drawFigure(g: CanvasRenderingContext2D, pose: Pose, drawBoulderBetween: () => void) {
    if (pose.alpha <= 0.001) { drawBoulderBetween(); return; }
    const figure = pal.figure;
    const far = mixRGB(figure, pal.rockShade, 0.35);
    g.save();
    g.globalAlpha = pose.alpha;
    // far limbs
    g.fillStyle = css(far);
    g.beginPath();
    limbPath(g, pose.legs[1], true, pose.facing, groundAngleAt(pose.legs[1].end.x));
    limbPath(g, pose.arms[1], false, pose.facing, 0);
    g.fill();
    // torso + head
    g.fillStyle = css(figure);
    g.beginPath(); torsoPath(g, pose); g.fill();
    g.restore();
    drawBoulderBetween();
    g.save();
    g.globalAlpha = pose.alpha;
    g.fillStyle = css(figure);
    g.beginPath();
    limbPath(g, pose.legs[0], true, pose.facing, groundAngleAt(pose.legs[0].end.x));
    limbPath(g, pose.arms[0], false, pose.facing, 0);
    g.fill();
    g.restore();
    if (quality >= 0.75 && !reduced) drawRim(g, pose);
  }

  /** Rim light: the sun-facing edge of the near silhouette (S minus S shifted away from the sun). */
  function drawRim(g: CanvasRenderingContext2D, pose: Pose) {
    const ss = lastSky;
    if (!ss || !ss.sun || ss.sunVis < 0.05) return;
    const H = Hpx();
    const c = toS(pose.pelvis);
    const box = H * 2.4;
    const size = Math.ceil(box * 2 * scale);
    if (!rimLayer || rimLayer.width !== size) rimLayer = mk(size, size);
    const r = rimLayer.getContext('2d')!;
    r.setTransform(1, 0, 0, 1, 0, 0);
    r.clearRect(0, 0, size, size);
    r.setTransform(scale, 0, 0, scale, (box - c.x) * scale, (box - c.y) * scale);
    const dx = ss.sun.x - c.x, dy = ss.sun.y - c.y, d = Math.hypot(dx, dy) || 1;
    const rw = ss.light.rimW;
    const ux = (dx / d) * rw, uy = (dy / d) * rw;
    const sil = () => {
      r.beginPath();
      torsoPath(r, pose);
      limbPath(r, pose.legs[0], true, pose.facing, groundAngleAt(pose.legs[0].end.x));
      limbPath(r, pose.arms[0], false, pose.facing, 0);
      r.fill();
    };
    r.fillStyle = css(ss.light.key);
    sil();
    r.globalCompositeOperation = 'destination-out';
    r.translate(-ux, -uy);
    sil();
    r.globalCompositeOperation = 'source-over';
    g.save();
    g.globalAlpha = Math.min(1, ss.light.rim * 0.8) * ss.sunVis * pose.alpha;
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

  // ---------- particles ----------
  function spawn(kind: Particle['kind'], x: number, y: number, vx: number, vy: number, r: number, life: number, s = 0) {
    const p = particles.find((q) => !q.live);
    if (!p) return;
    p.live = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.r = r; p.life = life; p.age = 0; p.s = s; p.hops = 0;
  }

  function dustAt(foot: V, n: number) {
    const H = Hw;
    const t = path.tangentAt(path.length ? Math.max(0, Math.min(1, s0())) : 0);
    for (let i = 0; i < n; i++) {
      const sp = (0.15 + rng() * 0.2) * H;
      spawn('dust', foot.x, foot.y + 0.01 * H, -t.x * sp, -t.y * sp + 0.05 * H, (0.01 + rng() * 0.015) * H, 0.9 + rng() * 0.5);
    }
  }

  function stepParticles(dt: number) {
    let live = 0;
    for (const p of particles) {
      if (!p.live) continue;
      p.age += dt;
      if (p.age >= p.life) { p.live = false; continue; }
      live++;
      if (p.kind === 'pebble') {
        // Roll down the path under gravity along the tangent, with two small hops.
        const ang = path.angleAt(Math.max(0, Math.min(0.999, p.s))) * DEG;
        p.vx -= 2.2 * Hw * Math.sin(ang) * dt; // along-path speed (world/s), negative = downhill
        p.s += (p.vx * dt) / path.length;
        p.vy -= 3 * Hw * dt * 4;
        p.y = Math.max(0, p.y + p.vy * dt);
        if (p.y === 0 && p.hops < 2) { p.vy = Math.abs(p.vy) * 0.4; p.hops++; }
        if (p.s < -0.2) p.live = false;
      } else {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'grit') p.vy -= 2.2 * Hw * dt;
      }
    }
    stats.particles = live;
  }

  function drawParticles(g: CanvasRenderingContext2D) {
    const dust = pal.rockLit; // review S14: tinted, not bright white dots
    for (const p of particles) {
      if (!p.live) continue;
      const k = p.age / p.life;
      if (p.kind === 'pebble') {
        const base = path.at(p.s), n = path.normalAt(Math.max(0, Math.min(1, p.s)));
        const v = toS({ x: base.x + n.x * (p.r + p.y), y: base.y + n.y * (p.r + p.y) });
        g.fillStyle = css(pal.rockShade, 1 - k * 0.3);
        g.beginPath(); g.arc(v.x, v.y, p.r * S, 0, Math.PI * 2); g.fill();
      } else {
        const v = toS({ x: p.x, y: p.y });
        const r = p.r * S * (1 + 1.5 * k);
        g.fillStyle = css(p.kind === 'grit' ? pal.rockShade : dust, (p.kind === 'grit' ? 0.8 : 0.22) * (1 - k));
        g.beginPath(); g.arc(v.x, v.y, r, 0, Math.PI * 2); g.fill();
      }
    }
  }

  // ---------- gait / poses ----------
  let prevSlip = [0, 0];

  function advanceGait(dt: number, t: number) {
    if (phase === 'paused' || reduced) return;
    if (strainUntil > t) return;
    if (strainUntil > 0 && strainUntil <= t) { strainUntil = 0; heave = 1.6; }
    const speed = (seq?.kind === 'summit' || seq?.kind === 'mini' ? 1.2 : 1) * (1 - 0.6 * beatK(t));
    const heaveSpeed = heave > 1 ? 1.25 : 1;
    const before = phi;
    phi += (dt / T) * speed * heaveSpeed;
    if (phi >= 1) {
      phi -= 1;
      heave = 1;
      const sB = sMap(progress);
      T = 2.6 * (1 + 0.24 * (rng() - 0.5)) * (1 + 0.25 * Math.min(1, Math.max(0, (sB - s0()) / (s1() - s0()))));
      cyclesUntilPause--;
      if (cyclesUntilPause <= 0 && mode === 'climb' && !seq) {
        cyclesUntilPause = 5 + Math.floor(rng() * 5);
        // Freeze at the key pose for the strain pause.
        phi = 0.42;
        strainStart = t;
        strainUntil = t + 1.6 + rng() * 0.8;
      }
    }
    void before;
  }

  function strainK(t: number): number {
    if (strainUntil <= t) return 0;
    return Math.min(smoothstep(strainStart, strainStart + 0.4, t), 1 - smoothstep(strainUntil - 0.3, strainUntil, t));
  }

  function pushPose(sB: number, t: number, alpha = 1) {
    const still = phase === 'paused' || reduced;
    const ph = still ? 0.42 : phi;
    const k = still ? 0 : strainK(t);
    // Look-ahead lean (anticipation): dig in before a steeper pitch, ease off toward a bench (§3.3.5).
    const thAhead = path.angleAt(Math.min(0.999, sB + (0.5 * Hw) / path.length));
    const fdt = Math.min(0.2, Math.max(0, t - leanT)); leanT = t;
    leanAhead = leanAhead === 0 ? thAhead : leanAhead + (thAhead - leanAhead) * Math.min(1, fdt / 1.2);
    const ahead = Math.max(-8, Math.min(5, 0.6 * (leanAhead - meanSlope)));
    const bk = still ? 0 : beatK(t);
    const lean = Math.max(36, Math.min(53, (still ? 48 : leanDeg(ph) * (1 - k) + 51 * k) + ahead - 8 * bk));
    const hip = (still ? 0.455 : hipH(ph)) - 0.02 * k + 0.02 * bk;
    const sg = still ? 0 : surgeCurve(ph) * heave * (1 - bk);
    const tremor = k > 0 ? 0.006 * Math.sin(2 * Math.PI * 5 * t) * k : 0;
    const headTilt = (still ? 30 : (lean - 18) * (1 - k) + (lean - 4) * k) * (1 - bk) + 10 * bk;
    const breath = (1 + 0.012 * Math.sin((2 * Math.PI * t) / 3.2)) * (1 + 0.025 * bk * Math.sin(Math.min(1, (t - beatT0 - 0.4) / 0.6) * Math.PI));
    const nudge = (0.6 * sg * Hw) / path.length;
    const r = solvePush({ path, H: Hw, sB: sB + nudge, phi: ph, lean, hip, surge: sg, tremor, headTilt, breath, alpha }, pelvisOffset(path, sB, Hw));
    // Dust from slipping feet.
    if (!still) {
      r.slips.forEach((sl, i) => {
        if (sl > 0 && prevSlip[i] === 0) {
          dustAt(r.feet[i], 3 + Math.floor(rng() * 4));
          if (rng() < 0.15 && quality > 0.5) {
            const fs = sB - pelvisOffset(path, sB, Hw) / path.length;
            spawn('pebble', 0, 0, -0.05 * Hw, 0.02 * Hw, (0.012 + rng() * 0.008) * Hw, 3, fs);
          }
        }
        prevSlip[i] = sl;
      });
    }
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
      else if (done === 'rollback') { mode = 'climb'; phi = 0.0; }
    }
    if (desatK !== desatTarget) {
      const step = dt / 0.4;
      desatK = desatTarget > desatK ? Math.min(desatTarget, desatK + step) : Math.max(desatTarget, desatK - step);
    }
    ambientT += dt * (phase === 'paused' ? 0.25 : 1);
    advanceGait(dt, t);
    stepParticles(dt);
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
    if (fig) drawFigure(g, fig.pose, () => drawBoulder(g, bcx, brot, lift));
    else drawBoulder(g, bcx, brot, lift);
    drawParticles(g);

    // Grade (L11): vignette + warm/cool wash.
    if (gradeLayer) { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(gradeLayer, 0, 0); g.setTransform(scale, 0, 0, scale, 0, 0); }

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
      sky = land = rimLayer = gradeLayer = boulderTex = snapshot = null;
      clouds = [];
      canvas = null; ctx = null;
    },
  };
}

