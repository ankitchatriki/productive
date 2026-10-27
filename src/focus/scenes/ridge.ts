// Generated climb ridge with benches (false summits) and the neighbouring range (ROUND3_DESIGN §3.3). Pure.
import type { Layout, PathSpec, SlopePath, V } from './path';
import { hash1, mulberry32, noise1, ridged } from './noise';

export const TERRAIN_SEED = 0x5157;

export interface RidgeSpec {
  p0: V;
  summit: V;                       // summit lip (end of the climb)
  pitchDeg: Array<[number, number]>; // 4 pitches, start → end heading
  pitchRun: number[];              // relative run lengths (seeded ±15% on top)
  benchLen: number;                // world length of each bench
  benchDeg: [number, number];
  jitterDeg: number;
  roughAmp: number;
  roughWave: number;
  platformLen: number;
  /** Heading low-pass length (world): sets the fillet radius at crests and hollows. */
  filterLen: number;
  /** Hard ceiling on the heading (deg). */
  maxDeg: number;
}

export const RIDGES: Record<Layout, RidgeSpec> = {
  landscape: {
    p0: { x: 0.10, y: 0.12 }, summit: { x: 1.24, y: 0.74 },
    pitchDeg: [[20, 25], [24, 30], [29, 36], [35, 41]], pitchRun: [1.75, 1.0, 0.95, 0.85],
    benchLen: 0.11, benchDeg: [3, 7], jitterDeg: 3, roughAmp: 0.001, roughWave: 0.1, platformLen: 0.21, filterLen: 0.045, maxDeg: 43,
  },
  portrait: {
    p0: { x: 0.0, y: 0.14 }, summit: { x: 0.532, y: 0.494 },
    pitchDeg: [[26, 31], [30, 37], [36, 43], [41, 47]], pitchRun: [3.0, 1.0, 0.9, 0.8],
    benchLen: 0.07, benchDeg: [3, 7], jitterDeg: 3, roughAmp: 0.001, roughWave: 0.1, platformLen: 0.2, filterLen: 0.03, maxDeg: 48,
  },
};

export interface Bench { sStart: number; sMid: number; sEnd: number }
export interface RidgePath extends SlopePath {
  benches: Bench[];
  /** Heading (deg) at every LUT sample of the climb, for tests. */
  headings: number[];
  /** Boulder centre for radius R that never penetrates the ground (offset curve, §3.3.5). */
  centreAt(s: number, R: number): V;
}

const N = 512;
const DEG = Math.PI / 180;

interface Seg { len: number; h0: number; h1: number; bench?: number }

function buildSegs(spec: RidgeSpec, rng: () => number, benchRel: number, offset: number): Seg[] {
  const segs: Seg[] = [];
  spec.pitchDeg.forEach(([a, b], i) => {
    const j0 = (rng() * 2 - 1) * spec.jitterDeg, j1 = (rng() * 2 - 1) * spec.jitterDeg;
    const run = spec.pitchRun[i] * (1 + (rng() * 2 - 1) * 0.15);
    segs.push({ len: run, h0: a + j0 + offset, h1: Math.max(a + j0, b + j1) + offset });
    if (i < 3) {
      const bd = spec.benchDeg[0] + rng() * (spec.benchDeg[1] - spec.benchDeg[0]);
      segs.push({ len: benchRel, h0: bd, h1: bd, bench: i });
    }
  });
  return segs;
}

/** Heading samples (deg) along a run of total length T, low-pass filtered (fillets instead of corners). */
function headingProfile(segs: Seg[], M: number, filterLen: number) {
  const total = segs.reduce((s, g) => s + g.len, 0);
  const raw: number[] = [];
  const benchAt: Array<number | undefined> = [];
  let acc = 0, si = 0;
  for (let i = 0; i < M; i++) {
    const u = ((i + 0.5) / M) * total;
    while (si < segs.length - 1 && u > acc + segs[si].len) { acc += segs[si].len; si++; }
    const g = segs[si];
    const k = Math.min(1, Math.max(0, (u - acc) / g.len));
    raw.push(g.h0 + (g.h1 - g.h0) * k);
    benchAt.push(g.bench);
  }
  // Moving average (two passes ≈ triangular filter) over filterLen of run length.
  const win = Math.max(1, Math.round((filterLen / total) * M));
  let h = raw;
  for (let pass = 0; pass < 2; pass++) {
    const out: number[] = [];
    let sum = 0;
    const q: number[] = [];
    // centred window with edge clamping
    for (let i = 0; i < M; i++) {
      let s2 = 0, n = 0;
      for (let j = i - win; j <= i + win; j++) { s2 += h[Math.min(M - 1, Math.max(0, j))]; n++; }
      out.push(s2 / n);
    }
    void sum; void q;
    h = out;
  }
  return { h, total, benchAt };
}

/** Build the climb ridge: turtle walk with benches, fillets, scaled onto the summit anchor, plus a platform. */
export function buildRidgePath(spec: RidgeSpec, seed = TERRAIN_SEED): RidgePath {
  const M = 2048;
  const chord = Math.atan2(spec.summit.y - spec.p0.y, spec.summit.x - spec.p0.x);
  const chordLen = Math.hypot(spec.summit.x - spec.p0.x, spec.summit.y - spec.p0.y);
  let benchRel = 0.3, k = 1;
  let pts: V[] = [], hs: number[] = [], benchFlags: Array<number | undefined> = [];
  const walk = (offset: number) => {
    const rng = mulberry32(seed);
    const segs = buildSegs(spec, rng, benchRel, offset);
    // Fillets: crests r ≥ 2.2·R ≈ 0.05 world of arc for these angle changes; filter over that length.
    const prof = headingProfile(segs, M, spec.filterLen / k);
    const ds = prof.total / M;
    const out: V[] = [{ x: 0, y: 0 }];
    for (let i = 0; i < M; i++) {
      const p = out[out.length - 1];
      const hd = Math.min(spec.maxDeg, prof.h[i]);
      prof.h[i] = hd;
      out.push({ x: p.x + Math.cos(hd * DEG) * ds, y: p.y + Math.sin(hd * DEG) * ds });
    }
    return { out, prof };
  };
  for (let iter = 0; iter < 4; iter++) {
    // Pitch heading offset so the walk's chord points at the summit anchor (uniform scale keeps every angle).
    let lo = -12, hi = 12;
    for (let b = 0; b < 30; b++) {
      const mid = (lo + hi) / 2;
      const e = walk(mid).out[M];
      if (Math.atan2(e.y, e.x) < chord) lo = mid; else hi = mid;
    }
    const r = walk((lo + hi) / 2);
    pts = r.out; hs = r.prof.h; benchFlags = r.prof.benchAt;
    const e = pts[M];
    k = chordLen / Math.hypot(e.x, e.y);
    benchRel = spec.benchLen / k;
  }
  const rot = chord - Math.atan2(pts[M].y, pts[M].x);
  const kx = k, ky = k;
  pts = pts.map((p) => ({ x: p.x * Math.cos(rot) - p.y * Math.sin(rot), y: p.x * Math.sin(rot) + p.y * Math.cos(rot) }));
  void hs;
  // Scale onto the anchors and add the fine undulation along the normal.
  let climb: V[] = pts.map((p) => ({ x: spec.p0.x + p.x * kx, y: spec.p0.y + p.y * ky }));
  // arc length of the scaled climb
  const cumOf = (arr: V[]) => { const c = [0]; for (let i = 1; i < arr.length; i++) c.push(c[i - 1] + Math.hypot(arr[i].x - arr[i - 1].x, arr[i].y - arr[i - 1].y)); return c; };
  let cum = cumOf(climb);
  const Lraw = cum[cum.length - 1];
  climb = climb.map((p, i) => {
    if (i === 0 || i === climb.length - 1) return p;
    const a = climb[i - 1], b = climb[i + 1];
    const tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const fade = Math.min(1, cum[i] / 0.05, (Lraw - cum[i]) / 0.05);
    const d = spec.roughAmp * (noise1((cum[i] / spec.roughWave) + seed * 0.001) * 2 - 1) * fade;
    return { x: p.x - (ty / tl) * d, y: p.y + (tx / tl) * d };
  });
  cum = cumOf(climb);
  const length = cum[cum.length - 1];

  // Resample to an arc-length LUT.
  const lut: V[] = [];
  const headings: number[] = [];
  let j = 0;
  for (let i = 0; i <= N; i++) {
    const target = (i / N) * length;
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const k = (target - cum[j]) / seg;
    lut.push({ x: climb[j].x + (climb[j + 1].x - climb[j].x) * k, y: climb[j].y + (climb[j + 1].y - climb[j].y) * k });
  }
  for (let i = 0; i < N; i++) headings.push(Math.atan2(lut[i + 1].y - lut[i].y, lut[i + 1].x - lut[i].x) / DEG);

  // Benches in arc-length fractions (from the flags, mapped through the scaled run).
  const benches: Bench[] = [];
  for (let b = 0; b < 3; b++) {
    let first = -1, last = -1;
    benchFlags.forEach((f, i) => { if (f === b) { if (first < 0) first = i; last = i; } });
    const sA = cum[Math.max(0, first)] / length, sB2 = cum[Math.min(cum.length - 1, last + 1)] / length;
    benches.push({ sStart: sA, sMid: (sA + sB2) / 2, sEnd: sB2 });
  }

  // Platform: 1.5° from the lip.
  const lip = lut[N];
  const pHead = 1.5 * DEG;
  const plateauEnd = { x: lip.x + Math.cos(pHead) * spec.platformLen, y: lip.y + Math.sin(pHead) * spec.platformLen };
  const plateauLen = spec.platformLen;
  const plateauDir = { x: Math.cos(pHead), y: Math.sin(pHead) };
  const startDir = (() => { const d = { x: lut[4].x - lut[0].x, y: lut[4].y - lut[0].y }; const l = Math.hypot(d.x, d.y); return { x: d.x / l, y: d.y / l }; })();
  const endDir = (() => { const d = { x: lut[N].x - lut[N - 4].x, y: lut[N].y - lut[N - 4].y }; const l = Math.hypot(d.x, d.y); return { x: d.x / l, y: d.y / l }; })();

  const at = (s: number): V => {
    if (s <= 0) return { x: lut[0].x + startDir.x * s * length, y: lut[0].y + startDir.y * s * length };
    if (s >= 1) {
      const d = Math.min((s - 1) * length, plateauLen * 1.5);
      return { x: lip.x + plateauDir.x * d, y: lip.y + plateauDir.y * d };
    }
    const f = s * N, i = Math.floor(f), k = f - i;
    return { x: lut[i].x + (lut[i + 1].x - lut[i].x) * k, y: lut[i].y + (lut[i + 1].y - lut[i].y) * k };
  };
  const tangentAt = (s: number): V => {
    if (s <= 0) return startDir;
    if (s >= 1) {
      const k = Math.min(1, ((s - 1) * length) / 0.04);
      const x = endDir.x + (plateauDir.x - endDir.x) * k, y = endDir.y + (plateauDir.y - endDir.y) * k;
      const l = Math.hypot(x, y); return { x: x / l, y: y / l };
    }
    const e = 2 / N;
    const a = at(Math.max(0, s - e)), b = at(Math.min(1, s + e));
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  const normalAt = (s: number): V => { const t = tangentAt(s); return { x: -t.y, y: t.x }; };
  const angleAt = (s: number) => { const t = tangentAt(s); return Math.atan2(t.y, t.x) / DEG; };
  const groundY = (x: number): number => {
    if (x <= lut[0].x) return lut[0].y;
    if (x >= lip.x) {
      if (x >= plateauEnd.x) return plateauEnd.y;
      return lip.y + ((x - lip.x) / (plateauEnd.x - lip.x)) * (plateauEnd.y - lip.y);
    }
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (lut[mid].x < x) lo = mid; else hi = mid; }
    const k = (x - lut[lo].x) / (lut[hi].x - lut[lo].x || 1);
    return lut[lo].y + (lut[hi].y - lut[lo].y) * k;
  };

  // Offset-curve boulder centre, cached per radius.
  const centreCache = new Map<number, V[]>();
  const CN = 1024;
  const sampleS = (i: number) => -0.1 + (i / CN) * (1 + plateauLen * 1.4 / length + 0.1);
  const centreLUT = (R: number): V[] => {
    const key = Math.round(R * 1e6);
    const hit = centreCache.get(key);
    if (hit) return hit;
    const ground: V[] = [];
    for (let i = 0; i <= CN; i++) ground.push(at(sampleS(i)));
    const out: V[] = [];
    const span = Math.ceil((1.3 * R / (length * (1 + 0.1 + plateauLen * 1.4 / length + 0.1))) * CN) + 2;
    for (let i = 0; i <= CN; i++) {
      const s = sampleS(i), n = normalAt(Math.min(1.2, s));
      const c = { x: ground[i].x + n.x * R, y: ground[i].y + n.y * R };
      for (let pass = 0; pass < 2; pass++) {
        for (let jj = Math.max(0, i - span); jj <= Math.min(CN, i + span); jj++) {
          const dx = c.x - ground[jj].x, dy = c.y - ground[jj].y, d = Math.hypot(dx, dy);
          if (d < R && d > 1e-9) { c.x = ground[jj].x + (dx / d) * R; c.y = ground[jj].y + (dy / d) * R; }
        }
      }
      out.push(c);
    }
    centreCache.set(key, out);
    return out;
  };
  const centreAt = (s: number, R: number): V => {
    const lutC = centreLUT(R);
    const s0 = sampleS(0), s1 = sampleS(CN);
    const f = Math.min(CN - 1e-6, Math.max(0, ((s - s0) / (s1 - s0)) * CN));
    const i = Math.floor(f), k = f - i;
    return { x: lutC[i].x + (lutC[i + 1].x - lutC[i].x) * k, y: lutC[i].y + (lutC[i + 1].y - lutC[i].y) * k };
  };

  const pspec: PathSpec = { p0: lut[0], p1: lut[Math.round(N / 3)], p2: lut[Math.round((2 * N) / 3)], p3: lip, plateauEnd };
  return { spec: pspec, length, at, tangentAt, normalAt, angleAt, groundY, plateauEndS: 1 + plateauLen / length, benches, headings, centreAt };
}

// ---------- Progress mapping through the benches (§3.3.3) ----------

/** Monotone cubic Hermite (Fritsch–Carlson) through (xs, ys); xs strictly increasing, ys non-decreasing. */
export function monotoneCubic(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const d: number[] = [], m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const hgt = xs[i + 1] - xs[i], t = (x - xs[i]) / hgt;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hgt * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hgt * m[i + 1];
  };
}

/** p → boulder arc-length fraction: (0,s0) (¼,bench0) (½,bench1) (¾,bench2) (1,s1). */
export function benchProgressMap(path: RidgePath, s0: number, s1: number): (p: number) => number {
  const ys = [s0, ...path.benches.map((b) => b.sMid), s1];
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + 1e-4);
  const f = monotoneCubic([0, 0.25, 0.5, 0.75, 1], ys);
  return (p: number) => f(Math.min(1, Math.max(0, p)));
}

// ---------- Neighbouring range (§3.3.4) ----------

export interface RangeLayer { haze: number; density: [number, number]; height: [number, number]; slope: [number, number]; amp: number; freq: number; seed: number }
export const RANGE_LAYERS: RangeLayer[] = [
  { haze: 0.70, density: [3, 4], height: [0.70, 0.97], slope: [1.6, 2.4], amp: 0.06, freq: 6.0, seed: 11 },
  { haze: 0.45, density: [2, 3], height: [0.45, 0.80], slope: [1.2, 2.0], amp: 0.05, freq: 7.0, seed: 23 },
  { haze: 0.22, density: [2, 3], height: [0.25, 0.5], slope: [0.6, 1.1], amp: 0.035, freq: 8.0, seed: 37 },
];

export interface RangeFrame { horizonY: number; summit: V; baseY: number }

/** Skyline height (world y) of a range layer at world x, and the x of the peak that dominates there. */
export function rangeSkyline(layer: RangeLayer, x: number, f: RangeFrame): { y: number; peakX: number } {
  const hRef = f.summit.y - f.horizonY;
  const capAt = (px: number) => f.summit.y - 0.02 - (Math.abs(px - f.summit.x) < 0.12 ? 0.06 : 0);
  let best = -Infinity, peakX = x;
  const cell = Math.floor(x);
  for (let c = cell - 2; c <= cell + 2; c++) {
    const r = mulberry32((c * 7919 + layer.seed * 104729) >>> 0);
    const n = layer.density[0] + Math.floor(r() * (layer.density[1] - layer.density[0] + 1));
    for (let k = 0; k < n; k++) {
      const px = c + (k + 0.2 + r() * 0.6) / n;
      // Peaks that would rise above the true summit are lowered as a whole, so their tops stay pointed (no flat crowns).
      const ph = Math.min(f.horizonY + hRef * (layer.height[0] + r() * (layer.height[1] - layer.height[0])), capAt(px) - layer.amp * 0.5);
      const sl = layer.slope[0] + r() * (layer.slope[1] - layer.slope[0]);
      const y = ph - Math.abs(x - px) * sl;
      if (y > best) { best = y; peakX = px; }
    }
  }
  let y = best + layer.amp * (ridged(x * layer.freq + layer.seed) - 0.6) + 0.35 * layer.amp * (noise1(x * 4 * layer.freq + layer.seed * 3) - 0.5);
  y = Math.max(y, f.horizonY - 0.02);
  // Clarity: the true summit stays the highest point; near it, neighbours sit a further 0.06 lower.
  const cap = f.summit.y - 0.02 - (Math.abs(x - f.summit.x) < 0.12 ? 0.06 : 0);
  return { y: Math.min(y, cap), peakX };
}

/** Lower edge of a snow cap at x (world y): snowline with ragged fingers down the gullies. */
export function snowEdge(x: number, snowline: number): number {
  return snowline + 0.025 * (noise1(x * 9) * 2 - 1) * 0.8 + 0.012 * (noise1(x * 23 + 5) - 0.5) - 0.04 * Math.max(0, ridged(x * 22, 3) - 0.55);
}

/** Main mountain back side (summit → col → twin peak → serrated arête), world points left to right. */
export function backSide(layout: Layout, plateauEnd: V, baseY: number, rightX: number): V[] {
  const summitY = plateauEnd.y;
  const pts: V[] = [plateauEnd];
  const H = summitY - baseY;
  if (layout === 'landscape') {
    pts.push({ x: plateauEnd.x + 0.018, y: summitY - 0.045 });
    pts.push({ x: plateauEnd.x + 0.042, y: summitY - 0.115 });              // col
    pts.push({ x: plateauEnd.x + 0.062, y: summitY - 0.092 });
    pts.push({ x: plateauEnd.x + 0.088, y: baseY + 0.88 * H });           // twin peak
    pts.push({ x: plateauEnd.x + 0.112, y: baseY + 0.79 * H });
    // arête teeth stepping down to the right
    let x = plateauEnd.x + 0.112, y = baseY + 0.79 * H;
    for (let t = 0; t < 5; t++) {
      const up = 0.025 + hash1(t * 3.7 + 1) * 0.025, run = 0.035 + hash1(t * 5.1) * 0.02;
      pts.push({ x: x + run * 0.35, y: y + up * 0.5 });
      x += run; y -= 0.05 + hash1(t * 2.3) * 0.025;
      pts.push({ x, y });
    }
    pts.push({ x: Math.max(rightX, x + 0.1), y: baseY + 0.18 * H });
  } else {
    pts.push({ x: plateauEnd.x + 0.03, y: summitY - 0.06 });
    pts.push({ x: plateauEnd.x + 0.06, y: summitY - 0.12 });               // col
    pts.push({ x: plateauEnd.x + 0.12, y: baseY + 0.88 * H });            // twin (partly off screen)
    pts.push({ x: Math.max(rightX, plateauEnd.x + 0.3), y: baseY + 0.3 * H });
  }
  return pts;
}

// ---------- Foreground rocks (§3.3, L10) ----------
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface FgRock { cx: number; cy: number; r: number; seed: number }

/** Screen-space foreground rocks at the bottom corners, overlapping the frame edge (pure). */
export function foregroundRocks(layout: Layout, w: number, h: number, S: number): FgRock[] {
  if (layout === 'portrait') return [{ cx: -0.2 * 0.07 * S, cy: h + 0.25 * 0.07 * S, r: 0.07 * S, seed: 3 }];
  return [
    { cx: -0.35 * 0.10 * S, cy: h + 0.32 * 0.10 * S, r: 0.10 * S, seed: 1 },
    { cx: 0.07 * S, cy: h + 0.55 * 0.06 * S, r: 0.06 * S, seed: 2 },
    { cx: w + 0.35 * 0.09 * S, cy: h + 0.4 * 0.09 * S, r: 0.09 * S, seed: 5 },
  ];
}

/** Rock outline radius at angle a: noisy polygon with 11 vertices (radius varies 0.72–1.0). */
export function rockRadius(rock: FgRock, k: number): number {
  return rock.r * (0.72 + 0.28 * hash1(rock.seed * 13.1 + k * 3.7));
}

export function circleHitsBox(cx: number, cy: number, r: number, b: Box): boolean {
  const nx = Math.max(b.x0, Math.min(cx, b.x1)), ny = Math.max(b.y0, Math.min(cy, b.y1));
  return Math.hypot(nx - cx, ny - cy) < r;
}
