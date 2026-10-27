import { useEffect, useState } from 'react';
import styles from './FocusMode.module.css';

interface ClimbStripProps {
  /** Altitude in metres. */
  altM: number;
  /** "Climb N". */
  climbNo: number;
  /** How much of this block is done, 0..1 (open-ended: of each 60 focused minutes). */
  fraction: number;
}

const H = 10;

/** One Greek-key unit as two polylines: the baseline, then the hook. */
function unitPolys(x0: number, u: number): Array<Array<[number, number]>> {
  return [
    [[x0, H], [x0 + u, H]],
    [[x0, H], [x0, 0.75], [x0 + 0.78 * u, 0.75], [x0 + 0.78 * u, 7], [x0 + 0.3 * u, 7], [x0 + 0.3 * u, 3.6], [x0 + 0.55 * u, 3.6]],
  ];
}

const plen = (p: Array<[number, number]>) => p.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);

/** The first `k` (0..1) of a set of polylines, by length, as SVG path data. */
function partial(polys: Array<Array<[number, number]>>, k: number): string {
  const total = polys.reduce((a, p) => a + plen(p), 0);
  let left = total * Math.min(1, Math.max(0, k));
  let d = '';
  for (const p of polys) {
    if (left <= 0) break;
    d += `M${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length; i++) {
      const seg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (seg <= left) { d += `L${p[i][0]} ${p[i][1]}`; left -= seg; continue; }
      const t = left / seg;
      d += `L${p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t} ${p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t}`;
      left = 0;
      break;
    }
  }
  return d;
}

/** The climb strip (ROUND3_ART §2.6): altitude and climb number, and a Greek-key meander that fills over the block. */
export function ClimbStrip({ altM, climbNo, fraction }: ClimbStripProps) {
  const [units, setUnits] = useState(() => (typeof window !== 'undefined' && window.innerWidth >= 1920 ? 16 : 12));
  useEffect(() => {
    const on = () => setUnits(window.innerWidth >= 1920 ? 16 : 12);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const W = 240, u = W / units;
  const f = Math.min(1, Math.max(0, fraction)) * units;
  const full = Math.floor(f);
  const all: string[] = [], done: string[] = [];
  for (let i = 0; i < units; i++) {
    const polys = unitPolys(i * u, u);
    all.push(partial(polys, 1));
    if (i < full) done.push(partial(polys, 1));
    else if (i === full) done.push(partial(polys, f - full));
  }
  return (
    <div className={styles.climb} aria-hidden="true">
      <div className={styles.climbLine}>↑ {Math.max(0, Math.floor(altM)).toLocaleString('en-US')} m · Climb {climbNo}</div>
      <svg className={styles.meander} viewBox={`-1 -1 ${W + 2} ${H + 2}`} preserveAspectRatio="none" width="100%" height={H + 2}>
        <path d={all.join('')} className={styles.meanderRest} />
        <path d={done.join('')} className={styles.meanderDone} />
      </svg>
    </div>
  );
}
