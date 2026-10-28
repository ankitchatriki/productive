// Test kit: drive a scene engine frame by frame on a stub canvas (no pixels). Install in beforeAll, remove in
// afterAll. The main canvas's context records every rotate() argument (the boulder's canvas rotation).

export interface StubState { clock: number; rotates: number[] }
const state: StubState = { clock: 0, rotates: [] };
let rafQ: Array<(t: number) => void> = [];
const g = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};

function stubCtx(record = false): unknown {
  const target: Record<string, unknown> = { canvas: null };
  if (record) target.rotate = (a: number) => { state.rotates.push(a); };
  return new Proxy(target, {
    get: (o, k) => (k in o ? o[k as string] : () => undefined),
    set: (o, k, v) => { o[k as string] = v; return true; },
  });
}
export function stubCanvas(w = 1440, h = 900, record = false) {
  const ctx = stubCtx(record);
  return { width: 0, height: 0, clientWidth: w, clientHeight: h, getContext: () => ctx, style: {} };
}

export function installStubs() {
  for (const k of ['document', 'Path2D', 'requestAnimationFrame', 'cancelAnimationFrame', 'window']) saved[k] = g[k];
  g.document = { createElement: () => stubCanvas(), hasFocus: () => true };
  g.Path2D = class { moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} arc() {} ellipse() {} rect() {} addPath() {} };
  g.requestAnimationFrame = (cb: (t: number) => void) => { rafQ.push(cb); return rafQ.length; };
  g.cancelAnimationFrame = () => { rafQ = []; };
  g.window = { setTimeout: () => 0, clearTimeout: () => undefined };
  saved.now = globalThis.performance.now;
  globalThis.performance.now = () => state.clock;
}
export function removeStubs() {
  for (const [k, v] of Object.entries(saved)) if (k !== 'now') g[k] = v;
  globalThis.performance.now = saved.now as () => number;
}

export const stub = state;

/** Advance the clock by `sec` at `hz`, running queued frames; `each` sees the stats after every drawn frame. */
export function run(sec: number, each?: (stats: Record<string, unknown>) => void, stats?: Record<string, unknown>, hz = 60) {
  const end = state.clock + sec * 1000;
  while (state.clock < end) {
    state.clock += 1000 / hz;
    const q = rafQ; rafQ = [];
    const before = stats?.frames;
    for (const cb of q) cb(state.clock);
    if (each && stats && stats.frames !== before) each(stats);
  }
}

export async function makeEngine(w = 1440, h = 900, reduced = false, record = false) {
  const { createSisyphus } = await import('../sisyphus');
  const e = createSisyphus();
  e.mount(stubCanvas(w, h, record) as unknown as HTMLCanvasElement, { reducedMotion: reduced, colorScheme: 'dark', accent: '#a3461a' });
  e.resize(w, h, 1);
  return e;
}

/** A climb fed once a second at the pace (the domain's focused-time metres), recording every drawn frame. */
export async function captureClimb(w: number, h: number, startS: number, secs: number, opts: { lenS?: number; record?: boolean; each?: (s: Record<string, unknown>) => void } = {}) {
  const { M_PER_H, PACE_M } = await import('../../../domain/mountain');
  const lenS = opts.lenS ?? 1500;
  const lenM = lenS * PACE_M;
  const climb = (posM: number) => ({ stage: 1, stageStartM: 0, stageLenM: lenM, posM, fromSummit: false, summits: 0, atSummit: false });
  const e = await makeEngine(w, h, false, opts.record ?? false);
  let focused = startS;
  e.setClimb!(climb(focused * PACE_M)); e.setProgress(focused / lenS); e.setPhase('focus', { instant: true });
  const rows: Array<Record<string, unknown>> = [];
  const st = e.stats as unknown as Record<string, unknown>;
  for (let k = 0; k < secs; k++) {
    focused = Math.min(lenS, focused + 1);
    e.setClimb!(climb(focused * PACE_M)); e.setProgress(focused / lenS);
    run(1, (s) => { const r = { ...s, rotRec: state.rotates[state.rotates.length - 1] }; rows.push(r); opts.each?.(r); }, st);
  }
  return { e, rows, lenH: lenM / M_PER_H };
}
