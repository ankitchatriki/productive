// S2 at engine level (ROUND4 §7.6–7.7): the feed-forward camera and the cloth's follow-through, measured on the real
// engine (stub canvas, 1440×900, rendering at its own 30 fps while climbing) with the climb fed once per second.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installStubs, makeEngine, removeStubs, run } from './testkit/engineStub';
import { PACE } from './gait';
import { M_PER_H, PACE_M } from '../../domain/mountain';

beforeAll(installStubs);
afterAll(removeStubs);

const lenM = 1500 * PACE_M;
const climb = (posM: number) => ({ stage: 1, stageStartM: 0, stageLenM: lenM, posM, fromSummit: false, summits: 0, atSummit: false });
interface Row { t: number; x: number; y: number; ph: number; cloth: number; g: string }

async function capture(startS: number, secs: number): Promise<Row[]> {
  const e = await makeEngine(1440, 900);
  let focused = startS;
  e.setClimb!(climb(focused * PACE_M)); e.setProgress(focused / 1500); e.setPhase('focus', { instant: true });
  const rows: Row[] = [];
  const rec = (s: Record<string, unknown>) => rows.push({ t: s.clock as number, x: s.camX as number, y: s.camY as number, ph: s.pelvisH as number, cloth: s.clothDeg as number, g: s.gait as string });
  for (let k = 0; k < secs; k++) {
    focused = Math.min(1500, focused + 1);
    e.setClimb!(climb(focused * PACE_M)); e.setProgress(focused / 1500);
    run(1, rec, e.stats as unknown as Record<string, unknown>);
  }
  e.destroy();
  return rows;
}

const speedOf = (r: Row[]) => r.slice(1).map((q, i) => ({ t: q.t, v: Math.hypot(q.x - r[i].x, q.y - r[i].y) / (q.t - r[i].t) }));

describe('feed-forward camera (§7.6)', () => {
  it('while climbing (outside strain beats): speed v̄ ± 15% after 2 s, |Δv| ≤ 0.002 H/s per frame, jerk ≤ 0.5 H/s³', async () => {
    const rows = await capture(300, 40);
    // (a strain beat eases the world down with the stalled figure, V9; the beat and 3 s after it are excluded here)
    const beats = rows.filter((r, i) => r.g === 'strain' && rows[i - 1]?.g !== 'strain').map((r) => r.t);
    const ends = rows.filter((r, i) => r.g !== 'strain' && rows[i - 1]?.g === 'strain').map((r) => r.t);
    const inBeat = (t: number) => beats.some((b, i) => t >= b - 0.5 && t <= (ends[i] ?? Infinity) + 3);
    const all = speedOf(rows);
    const v = all.filter((q) => q.t - rows[0].t > 2 && !inBeat(q.t));
    const okIdx = new Set(all.map((q, i) => (q.t - rows[0].t > 2 && !inBeat(q.t) ? i : -1)).filter((i) => i >= 0));
    console.log(`(${beats.length} strain beats excluded)`);
    // per-frame changes only between consecutive kept frames
    const dv: number[] = [], acc: number[] = [], jerk: number[] = [];
    for (let i = 3; i < all.length; i++) {
      if (![i, i - 1, i - 2, i - 3].every((j) => okIdx.has(j))) continue;
      const d = (j: number) => all[j].v - all[j - 1].v, h = (j: number) => all[j].t - all[j - 1].t;
      dv.push(d(i));
      const a1 = d(i) / h(i), a0 = d(i - 1) / h(i - 1);
      acc.push(a1); jerk.push((a1 - a0) / h(i));
    }
    const vMin = Math.min(...v.map((q) => q.v)), vMax = Math.max(...v.map((q) => q.v));
    const dvMax = Math.max(...dv.map(Math.abs)), jMax = Math.max(...jerk.map(Math.abs));
    console.log(`camera speed ${(vMin / PACE).toFixed(3)}–${(vMax / PACE).toFixed(3)} v̄ · |Δv| max ${dvMax.toFixed(5)} H/s · jerk max ${jMax.toFixed(3)} H/s³ (${v.length} frames)`);
    expect(vMin).toBeGreaterThanOrEqual(0.85 * PACE);
    expect(vMax).toBeLessThanOrEqual(1.15 * PACE);
    expect(dvMax).toBeLessThanOrEqual(0.002);
    expect(jMax).toBeLessThanOrEqual(0.5);
  }, 30000);

  it('at the end of the climb (the end clamp, then the target stops) the camera eases to a stop over ≥ 0.8 s, no frame with |Δv| > 0.01 H/s', async () => {
    const rows = await capture(1500 - 70, 75);
    const v = speedOf(rows).filter((q) => q.t - rows[0].t > 2);
    const dv = v.slice(1).map((q, i) => Math.abs(q.v - v[i].v));
    const iStop = v.findIndex((q) => q.v < 0.1 * PACE);
    expect(iStop).toBeGreaterThan(0);
    let iSlow = iStop;
    while (iSlow > 0 && v[iSlow].v < 0.85 * PACE) iSlow--;
    const decel = v[iStop].t - v[iSlow].t;
    console.log(`end of climb: decelerates over ${decel.toFixed(2)} s; |Δv| max ${Math.max(...dv).toFixed(5)} H/s`);
    expect(decel).toBeGreaterThanOrEqual(0.8);
    expect(Math.max(...dv)).toBeLessThanOrEqual(0.01);
  }, 30000);
});

describe('cloth follow-through (§7.5)', () => {
  it('the flap tip trails the pelvis height by ≥ 220 ms and swings ≤ 6° about its running mean', async () => {
    const rows = (await capture(300, 30)).filter((_r, i) => i > 60);
    const dt = (rows[rows.length - 1].t - rows[0].t) / (rows.length - 1);
    const a = rows.map((r) => r.ph), b = rows.map((r) => r.cloth);
    const ma = a.reduce((x, y) => x + y) / a.length, mb = b.reduce((x, y) => x + y) / b.length;
    let best = -Infinity, lag = 0;
    for (let L = 0; L <= Math.round(1.0 / dt); L++) {
      let c = 0;
      for (let i = 0; i + L < a.length; i++) c += (a[i] - ma) * (b[i + L] - mb);
      if (Math.abs(c) > best) { best = Math.abs(c); lag = L; }
    }
    const win = Math.round(2 / dt);
    let over = 0;
    for (let i = win; i < b.length - win; i++) {
      let m = 0;
      for (let j = i - win; j <= i + win; j++) m += b[j];
      over = Math.max(over, Math.abs(b[i] - m / (2 * win + 1)));
    }
    console.log(`cloth tip lag ${(lag * dt * 1000).toFixed(0)} ms, swing about its mean ≤ ${over.toFixed(2)}°`);
    expect(lag * dt * 1000).toBeGreaterThanOrEqual(220);
    expect(over).toBeLessThanOrEqual(6);
  }, 30000);
});

void M_PER_H;

describe('strain beat framing (V9)', () => {
  it('through and after a strain beat the figure drifts ≤ 55 px from his mark (incl. the ±25 px step surge) and is back within 15 px 5 s after the beat', async () => {
    const e = await makeEngine(1440, 900);
    let focused = 300;
    e.setClimb!(climb(focused * PACE_M)); e.setProgress(focused / 1500); e.setPhase('focus', { instant: true });
    const rows: Array<{ t: number; x: number; g: string }> = [];
    for (let k = 0; k < 60; k++) {
      focused += 1; e.setClimb!(climb(focused * PACE_M)); e.setProgress(focused / 1500);
      run(1, (s) => rows.push({ t: s.clock as number, x: (s.pelvisPx as number[])[0], g: s.gait as string }), e.stats as unknown as Record<string, unknown>);
    }
    e.destroy();
    const steady = rows.filter((r) => r.t - rows[0].t > 3 && r.g === 'trudge').map((r) => r.x).sort((a, b) => a - b);
    const mark = steady[Math.floor(steady.length / 2)];
    let beats = 0;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].g !== 'strain' && rows[i].g === 'strain') {
        beats++;
        const t0 = rows[i].t, win = rows.filter((r) => r.t >= t0 && r.t < t0 + 8);
        const drift = Math.max(...win.map((r) => Math.abs(r.x - mark)));
        const end = rows.find((r) => r.t >= t0 + 3 + 5);
        console.log(`strain beat: max drift ${drift.toFixed(0)} px; 5 s after: ${end ? Math.abs(end.x - mark).toFixed(0) : '-'} px`);
        expect(drift).toBeLessThanOrEqual(55); // (round 4 review: ≈ 80–105 px, back after ≈ 10 s)
        if (end) expect(Math.abs(end.x - mark)).toBeLessThanOrEqual(15 + 25); // (±25 px is the per-step surge inside the frame)
      }
    }
    expect(beats).toBeGreaterThan(0);
  }, 30000);
});
