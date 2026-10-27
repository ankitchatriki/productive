// Verlet chains for hair and cloth (ROUND3_DESIGN §3.5): pinned root, distance + angle constraints. Pure, world units (y up).
import type { V } from './path';

export interface Chain { p: V[]; prev: V[]; link: number; maxBend: number; windK: number }

export function makeChain(anchor: V, n: number, link: number, maxBendDeg: number, windK: number, dir: V = { x: 0, y: -1 }): Chain {
  const p: V[] = [], prev: V[] = [];
  for (let i = 0; i <= n; i++) { const q = { x: anchor.x + dir.x * link * i, y: anchor.y + dir.y * link * i }; p.push(q); prev.push({ ...q }); }
  return { p, prev, link, maxBend: (maxBendDeg * Math.PI) / 180, windK };
}

function constrain(c: Chain, rootDir: V) {
  const { p, link } = c;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1];
      let dx = p[i].x - a.x, dy = p[i].y - a.y;
      let d = Math.hypot(dx, dy);
      if (!(d > 1e-9)) { dx = 0; dy = -1; d = 1; }
      // angle limit relative to the previous link (or the root direction)
      const pd = i >= 2 ? { x: a.x - p[i - 2].x, y: a.y - p[i - 2].y } : rootDir;
      const pa = Math.atan2(pd.y, pd.x);
      let ang = Math.atan2(dy, dx) - pa;
      while (ang > Math.PI) ang -= 2 * Math.PI;
      while (ang < -Math.PI) ang += 2 * Math.PI;
      if (Math.abs(ang) > c.maxBend) ang = Math.sign(ang) * c.maxBend;
      const fa = pa + ang;
      p[i] = { x: a.x + Math.cos(fa) * link, y: a.y + Math.sin(fa) * link };
    }
  }
}

/** One fixed 1/60 s substep. `rootDir` is the direction the first link hangs from the body. */
export function stepChain(c: Chain, anchor: V, rootDir: V, dt: number, gravity: number, windX: number, damping = 0.86) {
  const { p, prev } = c;
  p[0] = { ...anchor }; prev[0] = { ...anchor };
  for (let i = 1; i < p.length; i++) {
    const vx = (p[i].x - prev[i].x) * damping, vy = (p[i].y - prev[i].y) * damping;
    prev[i] = { ...p[i] };
    p[i] = { x: p[i].x + vx + windX * c.windK * dt * dt, y: p[i].y + vy - gravity * dt * dt };
  }
  constrain(c, rootDir);
}

/** Static frame: settle to rest (heavily damped iterations with the wind at its mean). */
export function solveRest(c: Chain, anchor: V, rootDir: V, gravity: number, windX: number) {
  for (let k = 0; k < 60; k++) {
    stepChain(c, anchor, rootDir, 1 / 60, gravity * 4, windX * 4, 0.2);
  }
  for (let i = 0; i < c.p.length; i++) c.prev[i] = { ...c.p[i] };
}
