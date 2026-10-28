// Flat black-figure drawing helpers (ROUND3_ART §1–§2): sky, sun, stars, moon, cloud masses, range strips,
// boulder sprite. Flat fills and thin lines only: no gradients, no blur, no glow.
import { INK, type ArtStop } from './artPalette';
import { mulberry32 } from './noise';
import type { V } from './path';

export const mkCanvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

/** Flat sky with a crisp, stepped horizon band (two flat rectangles, §1.4). */
export function drawSky(g: CanvasRenderingContext2D, w: number, h: number, stop: ArtStop, bandTop: number, bandBottom: number, bandColour = stop.band) {
  g.fillStyle = stop.sky; g.fillRect(0, 0, w, h);
  g.fillStyle = bandColour; g.fillRect(0, bandTop, w, Math.max(0, bandBottom - bandTop));
}

/** The archaic sun: a flat disc with two concentric line rings. */
export function drawSun(g: CanvasRenderingContext2D, c: V, r: number, stop: ArtStop, ringScale = 1, lw = 1.5) {
  g.fillStyle = stop.sun;
  g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = lw;
  g.strokeStyle = stop.sun;
  g.beginPath(); g.arc(c.x, c.y, r * 1.45 * ringScale, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = INK.salmon;
  g.beginPath(); g.arc(c.x, c.y, r * 1.85 * ringScale, 0, Math.PI * 2); g.stroke();
}

/** Flat crescent moon with one ring. */
export function drawMoon(g: CanvasRenderingContext2D, c: V, r: number, lw = 1.5) {
  const p = new Path2D();
  p.arc(c.x, c.y, r, 0, Math.PI * 2);
  p.moveTo(c.x + r * 0.45 + r * 0.95, c.y - r * 0.2);
  p.arc(c.x + r * 0.45, c.y - r * 0.2, r * 0.95, 0, Math.PI * 2);
  g.fillStyle = INK.cream; g.fill(p, 'evenodd');
  g.strokeStyle = INK.cream; g.lineWidth = lw;
  g.beginPath(); g.arc(c.x, c.y, r * 1.6, 0, Math.PI * 2); g.stroke();
}

export interface Star { x: number; y: number; b: number; cross: boolean; ph: number }

/** Cream crosses (and some dots); `vis` 0..1 pops them in brightest first, each scaling up over its own window. */
export function drawStars(g: CanvasRenderingContext2D, stars: Star[], vis: number, twinkleT: number | null, lw = 1.5) {
  if (vis <= 0) return;
  g.strokeStyle = INK.cream; g.fillStyle = INK.cream; g.lineWidth = lw; g.lineCap = 'round';
  g.beginPath();
  for (const s of stars) {
    const start = 1 - s.b;                               // brightest first
    let k = Math.min(1, Math.max(0, (vis - start * 0.8) / 0.2));
    if (k <= 0) continue;
    k = 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2); // ease-out-back
    const tw = twinkleT === null ? 1 : 1 + 0.15 * Math.sin(twinkleT * (2 * Math.PI / (4 + 3 * s.b)) + s.ph);
    const r = (2 + 2.5 * s.b) * k * tw;
    if (s.cross) { g.moveTo(s.x - r, s.y); g.lineTo(s.x + r, s.y); g.moveTo(s.x, s.y - r); g.lineTo(s.x, s.y + r); }
  }
  g.stroke();
  for (const s of stars) {
    if (s.cross) continue;
    const k = Math.min(1, Math.max(0, (vis - (1 - s.b) * 0.8) / 0.2));
    if (k > 0) g.fillRect(s.x - k, s.y - k, 2 * k, 2 * k);
  }
}

export function makeStars(w: number, maxY: number, seed = 7): Star[] {
  const r = mulberry32(seed);
  const n = Math.round((w * maxY) / 9000);
  const out: Star[] = [];
  for (let i = 0; i < n; i++) out.push({ x: r() * w, y: r() * maxY, b: r(), cross: r() > 0.33, ph: r() * 6.28 });
  return out;
}

// ---------- clouds (§2.5) ----------
function spiral(g: CanvasRenderingContext2D, cx: number, cy: number, rOut: number, turns: number, dir: 1 | -1, a0 = 0) {
  const steps = Math.max(12, Math.round(turns * 28));
  const th = turns * Math.PI * 2;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * th;
    const r = (t / th) * rOut;
    const x = cx + Math.cos(a0 + dir * t) * r, y = cy + Math.sin(a0 + dir * t) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
}

/** One black-figure cumulus: scalloped two-tone mass with spiral swirls, in its own bitmap (CSS px × scale). */
export function buildCloudMass(seed: number, mw: number, mh: number, stop: ArtStop, scale: number, swirls = true): HTMLCanvasElement {
  const r = mulberry32(seed);
  const pad = 0.2;
  const c = mkCanvas(mw * (1 + 2 * pad) * scale, mh * (1 + 2 * pad) * scale);
  const g = c.getContext('2d')!;
  g.setTransform(scale, 0, 0, scale, mw * pad * scale, mh * pad * scale);
  const n = 5 + Math.floor(r() * 5);
  const circles: Array<{ x: number; y: number; r: number }> = [];
  const baseY = mh * 0.78;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const big = Math.sin(Math.PI * u);
    const rr = mh * (0.18 + 0.22 * big * (0.75 + 0.25 * r()));
    // centres low enough that every scallop overlaps the slab (no flat valleys between them)
    circles.push({ x: mw * (0.08 + 0.84 * u), y: baseY - mh * 0.25 - rr * 0.15 - mh * 0.1 * big, r: rr });
  }
  const tailLeft = r() < 0.5;
  const tail = { x: tailLeft ? mw * 0.03 : mw * 0.97, y: baseY - mh * 0.14, r: mh * 0.16 };
  const union = (gg: CanvasRenderingContext2D) => {
    gg.beginPath();
    gg.rect(-mw, -mh, mw * 3, baseY + mh); gg.clip(); // nothing hangs below the slab's baseline
    gg.beginPath();
    gg.moveTo(mw * 0.06 + mh * 0.125, baseY);
    // base slab with 2–3 shallow scallops underneath
    const sc = 2 + Math.floor(r() * 2);
    for (let i = 0; i < sc; i++) { const x0 = mw * 0.06 + mh * 0.125 + ((mw * 0.88 - mh * 0.25) * i) / sc, x1 = mw * 0.06 + mh * 0.125 + ((mw * 0.88 - mh * 0.25) * (i + 1)) / sc; gg.quadraticCurveTo((x0 + x1) / 2, baseY + mh * 0.05, x1, baseY); }
    // rounded slab ends (no square corners showing past the scallops)
    gg.arc(mw * 0.94 - mh * 0.125, baseY - mh * 0.125, mh * 0.125, Math.PI / 2, -Math.PI / 2, true);
    gg.lineTo(mw * 0.06 + mh * 0.125, baseY - mh * 0.25);
    gg.arc(mw * 0.06 + mh * 0.125, baseY - mh * 0.125, mh * 0.125, -Math.PI / 2, Math.PI / 2, true);
    gg.closePath();
    gg.fill();
    // scallops and the tail curl: painted separately (opposite windings must never cancel into holes)
    gg.beginPath();
    for (const ci of circles) { gg.moveTo(ci.x + ci.r, ci.y); gg.arc(ci.x, ci.y, ci.r, 0, Math.PI * 2); }
    gg.moveTo(tail.x + tail.r, tail.y); gg.arc(tail.x, tail.y, tail.r, 0, Math.PI * 2);
    gg.fill('nonzero');
  };
  // back tone: offset and slightly scaled
  g.save();
  g.translate(mw * 0.05, -mh * 0.10);
  g.translate(mw / 2, mh / 2); g.scale(1.04, 1.04); g.translate(-mw / 2, -mh / 2);
  g.fillStyle = stop.cloudBack; union(g);
  g.restore();
  g.save();
  g.fillStyle = stop.cloudFront; union(g);
  g.restore();
  if (swirls) {
    g.strokeStyle = INK.ochreDeep; g.lineWidth = 1.75; g.lineCap = 'round';
    g.beginPath();
    const picks = circles.map((_, i) => i).sort(() => r() - 0.5).slice(0, 3 + Math.floor(r() * 3));
    for (const i of picks) { const ci = circles[i]; spiral(g, ci.x, ci.y, ci.r * (0.55 + r() * 0.15), 1.25, r() < 0.5 ? 1 : -1, r() * 6); }
    // tail curl
    spiral(g, tail.x, tail.y, tail.r * 0.8, 1.25, tailLeft ? -1 : 1);
    g.stroke();
    // commas at the front/back boundary
    g.beginPath();
    for (let i = 0; i < 1 + Math.floor(r() * 2); i++) { const ci = circles[Math.floor(r() * circles.length)]; spiral(g, ci.x + ci.r * 0.7, ci.y - ci.r * 0.6, ci.r * 0.28, 0.6, 1, r() * 6); }
    g.stroke();
  }
  return c;
}

// ---------- range strips (§2.3) ----------
/** A flat range silhouette strip: `topAt(xCss)` returns the skyline y (CSS px, within the strip). */
export function buildStrip(width: number, height: number, scale: number, colour: string, topAt: (x: number) => number): HTMLCanvasElement {
  const c = mkCanvas(width * scale, height * scale);
  const g = c.getContext('2d')!;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.fillStyle = colour;
  g.beginPath(); g.moveTo(0, height + 4);
  for (let x = 0; x <= width + 3; x += 3) g.lineTo(x, Math.min(height + 2, topAt(x)));
  g.lineTo(width, height + 4); g.closePath(); g.fill();
  return c;
}

// ---------- boulder sprite (§7.2) ----------
/** Black disc with a ragged edge, ochre rim flecks (denser on the lower half) and interior chips. Rotates with the stone. */
/**
 * The stone, v5 (ROUND5_SISYPHUS §4.3): flat black with ochre incisions and no rotational symmetry, so its turn reads
 * at a glance. Two flat rim notches (35°, 155°) move round the silhouette; three long strata chords tilt as it turns;
 * one forked crack; five comet chips on a ring whose heads lead clockwise (their tails trail counter-clockwise);
 * 14 flecks. Angles are sprite-local on the y-down canvas, where increasing angle is clockwise.
 */
export function buildBoulderSprite(Rpx: number, scale: number, seed = 31, lw = 1.5): HTMLCanvasElement {
  const res = scale * 2;
  const size = Math.ceil(2 * Rpx * 1.06 * res);
  const c = mkCanvas(size, size);
  const g = c.getContext('2d')!;
  g.setTransform(res, 0, 0, res, size / 2, size / 2);
  const r = mulberry32(seed);
  const D = Math.PI / 180;
  const notches = [35 * D, 155 * D], half = Math.asin(0.10); // 0.20 R wide
  const radiusAt = (a: number) => {
    let rr = Rpx * (1 - 0.005 * (Math.sin(a * 5 + 1.3) + Math.sin(a * 11 + 0.4) + 1));
    for (const f of notches) {
      let d = a - f; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < half) rr = Math.min(rr, (Rpx * (1 - 0.06)) / Math.cos(d)); // a flat bite 0.06 R deep
    }
    return rr;
  };
  g.fillStyle = INK.black;
  g.beginPath();
  for (let i = 0; i <= 240; i++) {
    const a = (i / 240) * Math.PI * 2, rr = radiusAt(a);
    if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(rr, 0);
  }
  g.closePath(); g.fill();
  g.strokeStyle = INK.ochre; g.fillStyle = INK.ochre; g.lineCap = 'round'; g.lineJoin = 'round';
  // three strata chords: near-parallel, slightly wavy, of different lengths, never through the centre
  g.lineWidth = lw;
  g.beginPath();
  const dir0 = 18 * D;
  for (const [off, len, tilt] of [[-0.35, 1.5, 0], [0.05, 1.2, 3], [0.45, 0.8, -4]] as const) {
    const a = dir0 + tilt * D, nx = -Math.sin(a), ny = Math.cos(a);
    for (let i = 0; i <= 16; i++) {
      const k = i / 16 - 0.5;
      const wav = 0.02 * Math.sin(k * 10 + off * 9) * Rpx;
      const x = Math.cos(a) * k * len * Rpx + nx * (off * Rpx + wav), y = Math.sin(a) * k * len * Rpx + ny * (off * Rpx + wav);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
  }
  g.stroke();
  // one forked crack from the rim at 250°, inward 0.55 R, forking at 60%
  {
    const a = 250 * D, start = { x: Math.cos(a) * radiusAt(a) * 0.98, y: Math.sin(a) * radiusAt(a) * 0.98 };
    const dir = { x: -Math.cos(a + 0.18), y: -Math.sin(a + 0.18) };
    const mid = { x: start.x + dir.x * 0.33 * Rpx + dir.y * 0.03 * Rpx, y: start.y + dir.y * 0.33 * Rpx - dir.x * 0.03 * Rpx };
    const end = { x: start.x + dir.x * 0.55 * Rpx, y: start.y + dir.y * 0.55 * Rpx };
    const fa = Math.atan2(dir.y, dir.x) + 38 * D;
    g.beginPath(); g.moveTo(start.x, start.y); g.lineTo(mid.x, mid.y); g.lineTo(end.x, end.y); g.stroke();
    g.lineWidth = Math.max(1, lw * 0.7);
    g.beginPath(); g.moveTo(mid.x, mid.y); g.lineTo(mid.x + Math.cos(fa) * 0.16 * Rpx, mid.y + Math.sin(fa) * 0.16 * Rpx); g.stroke();
  }
  // five comet chips on a ring at 0.70 R (300°–40°): a round head, a tapering tail trailing counter-clockwise
  for (let i = 0; i < 5; i++) {
    const ah = (300 + i * 25) * D, ring = 0.70 * Rpx, head = 0.035 * Rpx + 0.6, tail = 0.16 * Rpx;
    const hx = Math.cos(ah) * ring, hy = Math.sin(ah) * ring;
    g.beginPath(); g.arc(hx, hy, head, 0, Math.PI * 2); g.fill();
    const span = tail / ring;
    g.beginPath();
    for (let j = 0; j <= 8; j++) { const t = j / 8, a = ah - span * t, w = head * (1 - t); const rr = ring + w; if (j) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    for (let j = 8; j >= 0; j--) { const t = j / 8, a = ah - span * t, w = head * (1 - t); const rr = ring - w; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  // 14 irregular flecks
  g.lineWidth = Math.max(0.8, lw * 0.7);
  g.beginPath();
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = (0.2 + 0.7 * r()) * Rpx, l = (0.015 + 0.03 * r()) * Rpx, t = r() * Math.PI;
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    g.moveTo(x - Math.cos(t) * l, y - Math.sin(t) * l); g.lineTo(x + Math.cos(t) * l, y + Math.sin(t) * l);
  }
  g.stroke();
  return c;
}

/** Non-rotating contact arc (ROUND4 §5.3): 70° centred on the contact normal, 3 short dashes within 3 px of the rim. */
export function drawContactArc(g: CanvasRenderingContext2D, c: V, Rpx: number, slopeRad: number, lw: number) {
  g.strokeStyle = INK.ochre; g.lineWidth = lw; g.lineCap = 'round';
  const mid = Math.PI / 2 - slopeRad, half = (35 * Math.PI) / 180;
  for (let i = 0; i < 3; i++) {
    const a0 = mid - half + ((2 * half) * i) / 3 + 0.08, a1 = a0 + ((2 * half) / 3) * 0.6;
    g.beginPath(); g.arc(c.x, c.y, Rpx - 1.5, a0, a1); g.stroke();
  }
}

/**
 * Soft cap for a range skyline (review U4): heights well under `allowed` pass unchanged, taller ones are pressed
 * smoothly toward it (p-norm soft minimum) — peaks keep their shape and slip behind the slope, never a flat shelf.
 */
export function softCap(height: number, allowed: number, p = 6): number {
  if (allowed <= 0 || height <= 0) return Math.max(0, Math.min(height, 0));
  return (height * allowed) / Math.pow(Math.pow(height, p) + Math.pow(allowed, p), 1 / p);
}
