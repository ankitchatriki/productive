// Round 5 figure drawing (placeholder for F1: flat black limbs from the skeleton; F2 replaces it with the full art).
import type { V } from './path';
import { INK } from './artPalette';
import { handPoint, type Skel } from './walk';

export interface FigureView { toS: (v: V) => V; Hpx: number; zoom: number; scale: number; quality: number; stone?: { centre: V; R: number } }

export function figureTier(Hz: number, quality: number): 1 | 2 | 3 {
  if (Hz < 150 || quality <= 0.75) return 3;
  return Hz >= 230 ? 1 : 2;
}

export function drawFigure(g: CanvasRenderingContext2D, s: Skel, view: FigureView): void {
  const k = view.Hpx * view.zoom, S = view.toS;
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK.black; g.fillStyle = INK.black;
  const line = (a: V, b: V, wd: number) => { const p = S(a), q = S(b); g.lineWidth = wd * k; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); };
  for (const i of [1, 0] as const) {
    const l = s.legs[i], f = s.feet[i];
    line(l.hip, l.knee, 0.075); line(l.knee, l.ankle, 0.05); line(f.heel, f.toe, 0.035);
    if (i === 1) { const a = s.arms[1]; line(a.shoulder, a.elbow, 0.05); line(a.elbow, a.wrist, 0.04); line(a.wrist, handPoint(s.hands[1], { x: 0.05, y: 0.01 }, s.facing), 0.03); line(s.pelvis, s.shoulder, 0.12); }
  }
  const a = s.arms[0];
  line(a.shoulder, a.elbow, 0.05); line(a.elbow, a.wrist, 0.04); line(a.wrist, handPoint(s.hands[0], { x: 0.05, y: 0.01 }, s.facing), 0.03);
  line(s.shoulder, s.neck, 0.06);
  const c = S(s.head); g.beginPath(); g.arc(c.x, c.y, 0.065 * k, 0, Math.PI * 2); g.fill();
}
