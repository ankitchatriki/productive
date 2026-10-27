// "Sisyphus" focus scene (STRUGGLEMORE_DESIGN §3): Canvas 2D, a figure pushing a boulder
// up a dusk-lit mountain. Boulder position on the slope = block progress.
import type { SceneEngine, SceneInitOptions, ScenePhase } from './types';
import { NIGHT, PREDAWN, css, darken, desaturate, gradePalette, lighten, mixPalette, mixRGB, palette, type Palette, type RGB } from './palette';
import { FIGURE_H, PATHS, WORLD, boulderS, buildPath, layoutFor, startS, summitS, sunPosition, type Layout, type SlopePath, type V } from './path';
import {
  BODY, DEG, blendPose, boulderCentre, easeInOut, easeOut, hipH, leanDeg, pelvisOffset, solvePush, solveSit, solveStand,
  surge as surgeCurve, type Limb, type Pose,
} from './rig';
import { hash2, mulberry32, noise2, ridged, smoothstep } from './noise';

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
  let path: SlopePath = buildPath(PATHS.landscape);
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
  let sky: HTMLCanvasElement | null = null, land: HTMLCanvasElement | null = null, rimLayer: HTMLCanvasElement | null = null;
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

  // ---------- sizing ----------
  function layoutWorld() {
    const l = layoutFor(w, h);
    layout = l.layout; S = l.S; ox = l.ox; oy = l.oy;
    path = buildPath(PATHS[layout]);
    Hw = FIGURE_H[layout];
    Rw = BODY.boulderR * Hw;
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
  interface SkyState { pal: Palette; sun: V | null; sunVis: number; glow: number; moon: V | null; moonVis: number; starVis: number; predawn: number }

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
      return { pal: base, sun, sunVis: 1 - smoothstep(2.4, 4.0, st), glow, moon: progress > 0 ? moonPath(Math.min(1, progress)) : null, moonVis: smoothstep(0, 0.02, progress) * 0.9, starVis: Math.max(starVis, night), predawn: 0 };
    }
    if (phase === 'break') {
      const pre = smoothstep(0.85, 1.0, progress);
      let base = mixPalette(NIGHT, PREDAWN, pre);
      if (progress >= 1) base = mixPalette(PREDAWN, palette(0), 0.6);
      return { pal: base, sun: null, sunVis: 0, glow: 1, moon: moonPath(Math.min(1, progress)), moonVis: 1 - pre * 0.6, starVis: 1 - pre * 0.6, predawn: pre };
    }
    // focus / open / paused (and the roll-back into a new climb)
    let p = progress;
    let palP = 0.86 * p;
    let base = palette(palP);
    if (seq && seq.kind === 'rollback') {
      p = 0;
      base = mixPalette(rollFrom ?? palette(0.86), palette(0), smoothstep(0, ROLLBACK_DUR, t - seq.t0));
    }
    const sun = sunPosition(p, w, h, horizonPx, summitPx, layout);
    return { pal: base, sun, sunVis: 1, glow: 1, moon: null, moonVis: 0, starVis: smoothstep(0.93, 1.0, p) * 0.25, predawn: 0 };
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
    // Sun with two-term glow (baked; it moves < 1 px between rebuilds)
    if (ss.sun && ss.sunVis > 0) {
      const r = 0.028 * Math.min(w, h);
      const sunCol = pal.sun;
      const glowR = r * 9 * ss.glow;
      const gg = g.createRadialGradient(ss.sun.x, ss.sun.y, 0, ss.sun.x, ss.sun.y, glowR);
      gg.addColorStop(0, css(sunCol, 0.55 * ss.sunVis));
      gg.addColorStop(0.18, css(sunCol, 0.22 * ss.sunVis));
      gg.addColorStop(1, css(sunCol, 0));
      g.fillStyle = gg; g.fillRect(ss.sun.x - glowR, ss.sun.y - glowR, glowR * 2, glowR * 2);
      g.fillStyle = css(lighten(sunCol, 0.15), ss.sunVis);
      g.beginPath(); g.arc(ss.sun.x, ss.sun.y, r, 0, Math.PI * 2); g.fill();
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
    vignette(g);

    // Land: ridges, mountain, strata, cairn
    if (!land || land.width !== cw || land.height !== ch) land = mk(cw, ch);
    const l = land.getContext('2d')!;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, cw, ch);
    l.setTransform(scale, 0, 0, scale, 0, 0);
    const bases = [0.36, 0.27, 0.18], amps = [0.14, 0.10, 0.06], freqs = [1.1, 2.0, 3.6], hazes = [0.70, 0.45, 0.22];
    for (let i = 0; i < 3; i++) {
      l.fillStyle = css(mixRGB(pal.ridgeNear, pal.horizon, hazes[i] * (0.55 + 0.45 * (1 - desatK))));
      l.beginPath(); l.moveTo(0, h);
      for (let x = 0; x <= w + 6; x += 6) {
        const wx = (x - ox) / S;
        const y = bases[i] + amps[i] * ridged(wx * freqs[i] + 13.7 * (i + 1));
        l.lineTo(x, h - oy - y * S);
      }
      l.lineTo(w, h); l.closePath(); l.fill();
    }
    // Mountain body
    const sp = path.spec;
    const leftX = -ox / S - 0.05;
    const backEnd = WORLD[layout].w + (w - WORLD[layout].w * S) / 2 / S + 0.05;
    const body = new Path2D();
    const P = (x: number, y: number) => toS({ x, y });
    let q = P(leftX, 0); body.moveTo(q.x, h + 2);
    q = P(leftX, sp.p0.y - 0.01); body.lineTo(q.x, q.y);
    q = P(sp.p0.x - 0.02, sp.p0.y - 0.005); body.lineTo(q.x, q.y);
    for (let i = 0; i <= 64; i++) { const v = toS(path.at(i / 64)); body.lineTo(v.x, v.y); }
    q = toS(sp.plateauEnd); body.lineTo(q.x, q.y);
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const x = sp.plateauEnd.x + (backEnd - sp.plateauEnd.x) * k;
      const y = sp.plateauEnd.y + (0.42 - sp.plateauEnd.y) * Math.pow(k, 0.7) + 0.02 * (ridged(x * 6 + 3) - 0.5);
      const v = P(x, y); body.lineTo(v.x, v.y);
    }
    body.lineTo(w + 2, h + 2); body.closePath();
    const top = toS(path.at(1)).y;
    const mg = l.createLinearGradient(0, top, 0, h);
    mg.addColorStop(0, css(pal.rockLit)); mg.addColorStop(1, css(pal.rockShade));
    l.fillStyle = mg; l.fill(body);
    // Strata and scree
    l.save(); l.clip(body);
    const pr = mulberry32(9);
    l.lineWidth = 1;
    l.strokeStyle = css(darken(pal.rockShade, 0.3), 0.18);
    for (let i = 0; i < 54; i++) {
      const s = pr() * 1.05, depth = 0.015 + pr() * 0.3, len = 0.03 + pr() * 0.06;
      const a = path.at(s), n = path.normalAt(Math.min(1, s)), t = path.tangentAt(Math.min(1, s));
      const c = { x: a.x - n.x * depth, y: a.y - n.y * depth };
      const e1 = toS({ x: c.x - t.x * len / 2, y: c.y - t.y * len / 2 }), e2 = toS({ x: c.x + t.x * len / 2, y: c.y + t.y * len / 2 });
      l.beginPath(); l.moveTo(e1.x, e1.y); l.lineTo(e2.x, e2.y); l.stroke();
    }
    l.fillStyle = css(lighten(pal.rockLit, 0.1), 0.25);
    for (let i = 0; i < 25; i++) {
      const s = pr(), a = path.at(s), n = path.normalAt(s), d = 0.004 + pr() * 0.03;
      const v = toS({ x: a.x - n.x * d, y: a.y - n.y * d });
      l.fillRect(v.x, v.y, 1.5 + pr() * 1.5, 1);
    }
    l.restore();
    // Rim light on the slope edge
    l.strokeStyle = css(pal.sun, 0.3 * (1 - desatK * 0.5));
    l.lineWidth = 2;
    l.beginPath();
    for (let i = 0; i <= 64; i++) { const v = toS(path.at(i / 64)); if (i === 0) l.moveTo(v.x, v.y); else l.lineTo(v.x, v.y); }
    const pe = toS(sp.plateauEnd); l.lineTo(pe.x, pe.y);
    l.stroke();
    // Summit cairn
    const cairnBase = toS({ x: sp.plateauEnd.x - 0.01, y: sp.plateauEnd.y });
    let cy = cairnBase.y;
    l.fillStyle = css(darken(pal.rockShade, 0.2));
    for (const [wid, ht] of [[0.030, 0.010], [0.022, 0.009], [0.014, 0.008]]) {
      const rw = (wid * S) / 2, rh = (ht * S) / 2;
      l.beginPath(); l.ellipse(cairnBase.x, cy - rh, rw, rh, 0, 0, Math.PI * 2); l.fill();
      cy -= rh * 1.8;
    }
    vignette(l);
    buildClouds(lighten(mixRGB(pal.horizon, pal.zenith, 0.3), 0.15));
    buildBoulderTexture(pal.boulderBase);
  }

  function maybeRebuild(t: number, ss: SkyState) {
    const key = [ss.pal.zenith, ss.pal.horizon, ss.pal.rockLit].map((c) => c.map((v) => Math.round(v * 200)).join(',')).join('|')
      + `|${ss.sun ? Math.round(ss.sun.x / 2) + ',' + Math.round(ss.sun.y / 2) : ''}|${Math.round(ss.sunVis * 20)}|${ss.moon ? Math.round(ss.moon.x / 3) : ''}|${Math.round(ss.glow * 20)}|${Math.round(desatK * 10)}|${Math.round(ss.predawn * 20)}`;
    const minGap = seq || (desatK !== desatTarget) ? 0.1 : 2;
    if (key !== palKey && (t - lastCacheAt >= minGap || !sky)) {
      rebuildCaches(ss);
      palKey = key;
      lastCacheAt = t;
    }
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
    const ux = (dx / d) * 1.5, uy = (dy / d) * 1.5;
    const sil = () => {
      r.beginPath();
      torsoPath(r, pose);
      limbPath(r, pose.legs[0], true, pose.facing, groundAngleAt(pose.legs[0].end.x));
      limbPath(r, pose.arms[0], false, pose.facing, 0);
      r.fill();
    };
    r.fillStyle = css(pal.sun);
    sil();
    r.globalCompositeOperation = 'destination-out';
    r.translate(-ux, -uy);
    sil();
    r.globalCompositeOperation = 'source-over';
    g.save();
    g.globalAlpha = 0.3 * ss.sunVis * pose.alpha;
    g.drawImage(rimLayer, c.x - box, c.y - box, box * 2, box * 2);
    g.restore();
  }

  function drawBoulder(g: CanvasRenderingContext2D, centre: V, rot: number, lift = 0) {
    if (!boulderTex || !boulderOutline) return;
    const R = Rw * S;
    const c = toS(centre);
    c.y -= lift;
    // contact shadow
    g.fillStyle = css(pal.rockShade, 0.45);
    g.beginPath(); g.ellipse(c.x, c.y + R * 0.95 + lift, R * 0.7, R * 0.12, 0, 0, Math.PI * 2); g.fill();
    g.save();
    g.translate(c.x, c.y);
    g.rotate(rot);
    const size = boulderTex.width / Math.max(1, scale * 1.5);
    g.drawImage(boulderTex, -size / 2, -size / 2, size, size);
    g.clip(boulderOutline);
    g.rotate(-rot);
    // Unrotated lighting: highlight toward the sun, terminator shade opposite, rim.
    const ss = lastSky;
    const sx = ss?.sun ? ss.sun.x - c.x : R, sy = ss?.sun ? ss.sun.y - c.y : -R;
    const sd = Math.hypot(sx, sy) || 1;
    const lx = (sx / sd) * R * 0.45, ly = (sy / sd) * R * 0.45;
    const sunCol = ss?.sun && ss.sunVis > 0 ? pal.sun : [0.8, 0.8, 0.9] as RGB;
    const hl = g.createRadialGradient(lx, ly, R * 0.05, lx, ly, R * 1.1);
    hl.addColorStop(0, css(sunCol, 0.35 * (ss?.sunVis ?? 0.3)));
    hl.addColorStop(1, css(sunCol, 0));
    g.fillStyle = hl; g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
    const sh = g.createRadialGradient(-lx * 1.4, -ly * 1.4, R * 0.2, -lx * 1.4, -ly * 1.4, R * 1.3);
    sh.addColorStop(0, css(pal.rockShade, 0.5));
    sh.addColorStop(1, css(pal.rockShade, 0));
    g.fillStyle = sh; g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
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
    const speed = seq?.kind === 'summit' || seq?.kind === 'mini' ? 1.2 : 1;
    const heaveSpeed = heave > 1 ? 1.25 : 1;
    const before = phi;
    phi += (dt / T) * speed * heaveSpeed;
    if (phi >= 1) {
      phi -= 1;
      heave = 1;
      const sB = boulderS(progress, Hw, Rw, path.length);
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
    const lean = still ? 48 : leanDeg(ph) * (1 - k) + 51 * k;
    const hip = (still ? 0.455 : hipH(ph)) - 0.02 * k;
    const sg = still ? 0 : surgeCurve(ph) * heave;
    const tremor = k > 0 ? 0.006 * Math.sin(2 * Math.PI * 5 * t) * k : 0;
    const headTilt = still ? 30 : (lean - 18) * (1 - k) + (lean - 4) * k;
    const breath = 1 + 0.012 * Math.sin((2 * Math.PI * t) / 3.2);
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
      const sB = boulderS(progress, Hw, Rw, path.length);
      const pp = pushPose(sB, t);
      fig = pp; boulderC = pp.boulderC; rot = pp.rot + (pp.tremor ? pp.tremor * 0.5 : 0);
    }

    // Trail: done (scuffed) behind the stone, dotted ahead to the summit lip.
    const sBnow = (() => {
      const c = boulderC!;
      // project centre back to the path: s where at(s) is nearest, approximated by x lookup
      let best = 0, bd = Infinity;
      for (let i = 0; i <= 64; i++) { const s = i / 64 * 1.1; const a = path.at(s); const d = Math.abs(a.x - c.x); if (d < bd) { bd = d; best = s; } }
      return best;
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

    // Shadows under planted feet
    g.fillStyle = css(pal.rockShade, 0.35);
    if (fig) for (const leg of fig.pose.legs) { const v = toS(leg.end); g.beginPath(); g.ellipse(v.x, v.y + 1, H * 0.07, H * 0.012, 0, 0, Math.PI * 2); g.fill(); }

    if (fig2) drawFigure(g, fig2.pose, () => {});
    const bcx = boulderC!, brot = rot!;
    if (fig) drawFigure(g, fig.pose, () => drawBoulder(g, bcx, brot, lift));
    else drawBoulder(g, bcx, brot, lift);
    drawParticles(g);

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
    if (kind === 'rollback') rollFrom = lastSky ? lastSky.pal : null;
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
      lastProgress = q;
      progress = q;
      if (reduced && mounted) {
        const t = nowS();
        const moved = Math.abs(boulderS(q, Hw, Rw, path.length) - boulderS(lastDrawnP, Hw, Rw, path.length)) * path.length * S * scale;
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
      sky = land = rimLayer = boulderTex = snapshot = null;
      clouds = [];
      canvas = null; ctx = null;
    },
  };
}

