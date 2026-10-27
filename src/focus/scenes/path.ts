// Slope path for the Sisyphus scene (STRUGGLEMORE §3.3). Pure; world units, y up.
export interface V { x: number; y: number }

export type Layout = 'landscape' | 'portrait';

export interface PathSpec { p0: V; p1: V; p2: V; p3: V; plateauEnd: V }

export const PATHS: Record<Layout, PathSpec> = {
  landscape: { p0: { x: 0.10, y: 0.12 }, p1: { x: 0.62, y: 0.33 }, p2: { x: 0.94, y: 0.52 }, p3: { x: 1.24, y: 0.74 }, plateauEnd: { x: 1.36, y: 0.755 } },
  portrait: { p0: { x: 0.04, y: 0.10 }, p1: { x: 0.30, y: 0.24 }, p2: { x: 0.48, y: 0.40 }, p3: { x: 0.64, y: 0.58 }, plateauEnd: { x: 0.73, y: 0.59 } },
};

export const WORLD: Record<Layout, { w: number; h: number }> = { landscape: { w: 1.6, h: 1 }, portrait: { w: 0.75, h: 1 } };

/** Layout rule: landscape when w/h ≥ 0.9. Returns the world-to-screen transform. */
export function layoutFor(w: number, h: number): { layout: Layout; S: number; ox: number } {
  const layout: Layout = w / h >= 0.9 ? 'landscape' : 'portrait';
  const S = layout === 'landscape' ? Math.min(h, w / 1.5) : Math.min(0.9 * h, w / 0.72);
  const ox = (w - WORLD[layout].w * S) / 2;
  return { layout, S, ox };
}

function bez(a: V, b: V, c: V, d: V, t: number): V {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}

const N = 256;

export interface SlopePath {
  spec: PathSpec;
  /** Arc length of the cubic (the climb), world units. */
  length: number;
  /** Point at arc-length fraction s. s ∈ [0,1] is the climb; s > 1 continues onto the plateau; s < 0 extends back along the start tangent. */
  at(s: number): V;
  /** Unit tangent (uphill). */
  tangentAt(s: number): V;
  /** Unit normal pointing out of the ground (left of the tangent). */
  normalAt(s: number): V;
  /** Slope angle in degrees. */
  angleAt(s: number): number;
  /** Ground height at world x (flat before P0, follows the climb, then the plateau). */
  groundY(x: number): number;
  /** s at the far end of the plateau. */
  plateauEndS: number;
}

export function buildPath(spec: PathSpec): SlopePath {
  const pts: V[] = [];
  const cum: number[] = [0];
  for (let i = 0; i <= N; i++) pts.push(bez(spec.p0, spec.p1, spec.p2, spec.p3, i / N));
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const length = cum[N];
  const plateauLen = Math.hypot(spec.plateauEnd.x - spec.p3.x, spec.plateauEnd.y - spec.p3.y);
  const plateauDir = { x: (spec.plateauEnd.x - spec.p3.x) / plateauLen, y: (spec.plateauEnd.y - spec.p3.y) / plateauLen };
  const startDir = (() => { const dx = spec.p1.x - spec.p0.x, dy = spec.p1.y - spec.p0.y; const l = Math.hypot(dx, dy); return { x: dx / l, y: dy / l }; })();

  const idxFor = (s: number) => {
    const target = s * length;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo] || 1;
    return { lo, hi, k: (target - cum[lo]) / seg };
  };

  const at = (s: number): V => {
    if (s <= 0) return { x: spec.p0.x + startDir.x * s * length, y: spec.p0.y + startDir.y * s * length };
    if (s >= 1) {
      const d = Math.min((s - 1) * length, plateauLen * 1.5);
      return { x: spec.p3.x + plateauDir.x * d, y: spec.p3.y + plateauDir.y * d };
    }
    const { lo, hi, k } = idxFor(s);
    return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * k, y: pts[lo].y + (pts[hi].y - pts[lo].y) * k };
  };

  const tangentAt = (s: number): V => {
    if (s <= 0) return startDir;
    if (s >= 1) {
      // Blend from the lip tangent into the plateau over a short distance so nothing snaps.
      const d = (s - 1) * length;
      const k = Math.min(1, d / 0.04);
      const tEnd = (() => { const dx = spec.p3.x - spec.p2.x, dy = spec.p3.y - spec.p2.y; const l = Math.hypot(dx, dy); return { x: dx / l, y: dy / l }; })();
      const x = tEnd.x + (plateauDir.x - tEnd.x) * k, y = tEnd.y + (plateauDir.y - tEnd.y) * k;
      const l = Math.hypot(x, y);
      return { x: x / l, y: y / l };
    }
    const e = 1 / N;
    const a = at(Math.max(0, s - e)), b = at(Math.min(1, s + e));
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };

  const normalAt = (s: number): V => { const t = tangentAt(s); return { x: -t.y, y: t.x }; };
  const angleAt = (s: number) => { const t = tangentAt(s); return (Math.atan2(t.y, t.x) * 180) / Math.PI; };

  const groundY = (x: number): number => {
    if (x <= spec.p0.x) return spec.p0.y;
    if (x >= spec.p3.x) {
      if (x >= spec.plateauEnd.x) return spec.plateauEnd.y;
      return spec.p3.y + ((x - spec.p3.x) / (spec.plateauEnd.x - spec.p3.x)) * (spec.plateauEnd.y - spec.p3.y);
    }
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].x < x) lo = mid; else hi = mid; }
    const k = (x - pts[lo].x) / (pts[hi].x - pts[lo].x || 1);
    return pts[lo].y + (pts[hi].y - pts[lo].y) * k;
  };

  return { spec, length, at, tangentAt, normalAt, angleAt, groundY, plateauEndS: 1 + plateauLen / length };
}

// ---------- Progress mapping (§3.6) ----------

/** e(p) = p + 0.10·sin(πp): monotone, a little faster early, slower on the steep top. */
export function easeProgress(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return q + 0.1 * Math.sin(Math.PI * q);
}

/** Boulder-centre arc-length fraction for progress p, given standing height H and boulder radius R. */
export function boulderS(p: number, H: number, R: number, L: number): number {
  const s0 = (1.25 * H + R) / L;
  const s1 = 1 - (R * 0.9) / L;
  return s0 + (s1 - s0) * easeProgress(p);
}

export function startS(H: number, R: number, L: number): number { return (1.25 * H + R) / L; }
export function summitS(R: number, L: number): number { return 1 - (R * 0.9) / L; }

/** Quadratic Bézier sun path in screen space (§3.6). */
export function sunPosition(p: number, w: number, h: number, horizonY: number, summit: V, layout: Layout): V {
  const A = { x: 0.1 * w, y: horizonY };
  const C = layout === 'portrait' ? { x: 0.4 * w, y: 0.08 * h } : { x: 0.42 * w, y: 0.1 * h };
  const B = { x: summit.x + 0.035 * w, y: summit.y - 0.11 * h };
  const t = Math.min(1, Math.max(0, p)), u = 1 - t;
  return { x: u * u * A.x + 2 * u * t * C.x + t * t * B.x, y: u * u * A.y + 2 * u * t * C.y + t * t * B.y };
}
