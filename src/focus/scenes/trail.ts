// Endless trail for the Sisyphus scene (ROUND3_ART §5.1): a stage's geometry as a SlopePath (s in H, length 1).
import { SAMPLES_PER_H, buildStage, stageAt, type StageGeom, type StageSpec } from '../../domain/mountain';
import type { SlopePath, V } from './path';
import { hash1 } from './noise';

export interface Trail extends SlopePath {
  geom: StageGeom;
  centreAt(s: number, R: number): V;
  /** Arc length of the boulder-centre curve from s = 0 to s (for rotation by distance). */
  centreArc(s: number, R: number): number;
}

export function makeTrail(spec: StageSpec): Trail {
  const g = buildStage(spec);
  const at = (s: number): V => stageAt(g, s);
  const tangentAt = (s: number): V => {
    const e = 1 / SAMPLES_PER_H;
    const a = at(s - e), b = at(s + e);
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  const normalAt = (s: number): V => { const t = tangentAt(s); return { x: -t.y, y: t.x }; };
  const angleAt = (s: number) => { const t = tangentAt(s); return (Math.atan2(t.y, t.x) * 180) / Math.PI; };
  const groundY = (x: number): number => {
    const xs = g.xs, ys = g.ys;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid; else hi = mid; }
    const k = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
    return ys[lo] + (ys[hi] - ys[lo]) * k;
  };
  /** Offset-curve centre: ground + n·R, pushed out of any ground sample closer than R (concave spots). */
  const centreAt = (s: number, R: number, coarse = false): V => {
    const p = at(s), n = normalAt(s);
    const c = { x: p.x + n.x * R, y: p.y + n.y * R };
    const span = 1.3 * R, step = coarse ? 2 / SAMPLES_PER_H : 1 / SAMPLES_PER_H;
    for (let pass = 0; pass < (coarse ? 1 : 2); pass++) {
      for (let d = -span; d <= span; d += step) {
        const q = at(s + d);
        const dx = c.x - q.x, dy = c.y - q.y, dist = Math.hypot(dx, dy);
        if (dist < R && dist > 1e-9) { c.x = q.x + (dx / dist) * R; c.y = q.y + (dy / dist) * R; }
      }
    }
    return c;
  };
  const arcCache = new Map<number, Float32Array>();
  const centreArc = (s: number, R: number): number => {
    const key = Math.round(R * 1e5);
    let tab = arcCache.get(key);
    if (!tab) {
      const n = Math.ceil((g.s1 - g.s0) * 4) + 1;
      tab = new Float32Array(n);
      let prev = centreAt(g.s0, R, true);
      for (let i = 1; i < n; i++) { const c = centreAt(g.s0 + i / 4, R, true); tab[i] = tab[i - 1] + Math.hypot(c.x - prev.x, c.y - prev.y); prev = c; }
      arcCache.set(key, tab);
    }
    const f = Math.min(tab.length - 1.000001, Math.max(0, (s - g.s0) * 4));
    const i = Math.floor(f), k = f - i;
    const i0 = Math.round(-g.s0 * 4);
    return tab[i] + (tab[i + 1] - tab[i]) * k - tab[Math.min(tab.length - 1, i0)];
  };
  return {
    geom: g,
    spec: { p0: at(0), p1: at(1), p2: at(2), p3: at(g.ledgeStart), plateauEnd: at(g.ledgeEnd) },
    length: 1,
    at, tangentAt, normalAt, angleAt, groundY,
    plateauEndS: g.ledgeEnd,
    centreAt, centreArc,
  };
}

/** Surface detail placed by global arc-length hash (§5.1): flecks, stones, tufts, cracks. */
export interface Detail { kind: 'fleck' | 'stone' | 'tuft' | 'crack'; s: number; depth: number; size: number; salmon: boolean; seed: number }

export function detailsIn(sA: number, sB: number, startH: number): Detail[] {
  const out: Detail[] = [];
  const h = (n: number) => hash1(n * 0.6180339 + 17.17);
  // flecks: 14 per H
  for (let i = Math.floor((startH + sA) * 14); i <= Math.ceil((startH + sB) * 14); i++) {
    const s = i / 14 - startH + (h(i) - 0.5) / 14;
    const r = h(i + 0.5);
    out.push({ kind: 'fleck', s, depth: 0.02 + Math.pow(h(i + 0.3), 1.2) * 0.16, size: h(i + 0.9) < 0.3 ? 0.006 : 0.012 + Math.pow(h(i + 0.7), 1.5) * 0.06, salmon: r < 1 / 6, seed: i });
  }
  // stones every ~1.4 H, tufts every ~3 H, cracks every ~4.5 H (cells with jitter)
  const cells = (every: number, kind: Detail['kind'], salt: number) => {
    for (let i = Math.floor((startH + sA) / every) - 1; i <= Math.ceil((startH + sB) / every) + 1; i++) {
      const s = (i + h(i * salt + 0.1) * 0.8) * every - startH;
      if (s < sA - 1 || s > sB + 1) continue;
      out.push({ kind, s, depth: 0, size: h(i * salt + 0.9), salmon: false, seed: i * salt });
    }
  };
  cells(1.4, 'stone', 3.1);
  cells(3, 'tuft', 5.3);
  cells(4.5, 'crack', 7.9);
  return out;
}
