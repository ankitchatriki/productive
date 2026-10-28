// The Canvas 2D fallback (ROUND6_PLAN §3.8): modest but photographic. Baked at mount (sky, a tileable rock texture,
// the stone's albedo, grain); per frame: the sky, the rock clipped under the crest, the stone's albedo rotated with
// a fixed (non-rotating) shading overlay, gradient-shaded limbs with no strokes, grain and a vignette.
import type { FrameModel } from '../frameModel';
import type { Renderer, RendererStats } from './renderer';
import { printDensity, toneAt } from './tone';
import { figurePrims } from './figurePrims';
import { hash1, mulberry32, noise2, fbm2 } from '../noise';

const css = (L: number, exposure = 1, warmth = 0, k = 1) => { const [r, g, b] = toneAt(printDensity(L, exposure) * k, warmth); return `rgb(${r},${g},${b})`; };

export class CanvasRenderer implements Renderer {
  readonly kind = '2d' as const;
  stats: RendererStats = { kind: '2d' };
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private s = 1;
  private rock: HTMLCanvasElement | null = null;
  private albedo: HTMLCanvasElement | null = null;
  private grain: HTMLCanvasElement | null = null;
  private snap: HTMLCanvasElement | null = null;

  mount(canvas: HTMLCanvasElement): boolean {
    this.canvas = canvas;
    let g: CanvasRenderingContext2D | null = null;
    try { g = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null; } catch { g = null; }
    if (!g) return false;
    this.g = g;
    return true;
  }
  private mk(w: number, h: number) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  private bake() {
    const id = (c: HTMLCanvasElement) => c.getContext('2d')!;
    // a tileable 256² rock luminance texture (vertical cleavage), pre-lit, toned dark
    const N = 256;
    this.rock = this.mk(N, N);
    const rg = id(this.rock); const im = rg.createImageData?.(N, N);
    if (im && im.data instanceof Uint8ClampedArray) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = x / N, v = y / N;
        const t = (a: number, b: number) => fbm2(Math.cos(2 * Math.PI * a) * 1.5 + Math.sin(2 * Math.PI * b) * 0.3, Math.sin(2 * Math.PI * a) * 1.5 + b * 4, 4);
        const l = 0.12 + 0.18 * t(u * 3, v) + 0.05 * noise2(x * 0.3, y * 0.9);
        const [r, g2, b] = toneAt(printDensity(l));
        im.data.set([r, g2, b, 255], (y * N + x) * 4);
      }
      rg.putImageData(im, 0, 0);
    }
    // the stone's albedo disc (rotated per frame), and grain
    this.albedo = this.mk(256, 256);
    const ag = id(this.albedo); const ai = ag.createImageData?.(256, 256);
    if (ai && ai.data instanceof Uint8ClampedArray) {
      const r = mulberry32(31);
      const crat = Array.from({ length: 70 }, () => ({ x: r() * 2 - 1, y: r() * 2 - 1, rr: 0.02 + r() * r() * 0.12 }));
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const px = x / 128 - 1, py = y / 128 - 1;
        if (px * px + py * py > 1.02) continue;
        let a = 0.40 + 0.18 * (fbm2(px * 2.2 + 5, py * 2.2, 4) - 0.5);
        for (const c of crat) { const d = Math.hypot(px - c.x, py - c.y) / c.rr; if (d < 1) a -= 0.08 * (1 - d * d); else if (d < 1.3) a += 0.04; }
        const v = Math.max(0, Math.min(255, Math.round(a * 255 / 0.6)));
        ai.data.set([v, v, v, 255], (y * 256 + x) * 4);
      }
      ag.putImageData(ai, 0, 0);
    }
    this.grain = this.mk(128, 128);
    const gg = id(this.grain); const gi = gg.createImageData?.(128, 128);
    if (gi && gi.data instanceof Uint8ClampedArray) { for (let i = 0; i < 128 * 128; i++) { const v = 128 + Math.round((hash1(i * 0.7131) - 0.5) * 120); gi.data.set([v, v, v, 255], i * 4); } gg.putImageData(gi, 0, 0); }
  }
  resize(w: number, h: number, dpr: number) {
    this.s = Math.min(1.5, dpr);
    if (this.canvas) { this.canvas.width = Math.round(w * this.s); this.canvas.height = Math.round(h * this.s); }
    if (!this.rock) this.bake();
  }
  snapshot() {
    if (!this.canvas) return;
    this.snap = this.mk(this.canvas.width, this.canvas.height);
    this.snap.getContext('2d')?.drawImage(this.canvas, 0, 0);
  }
  draw(m: FrameModel) {
    const g = this.g;
    if (!g || !this.canvas) return;
    if (m.cut) this.snapshot();
    const { w, h } = m, e = m.tone.exposure, wm = m.tone.warmth;
    g.setTransform(this.s, 0, 0, this.s, 0, 0);
    // sky: brighter toward the crest, burned at the top
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, css(0.50, e, wm)); sky.addColorStop(0.35, css(0.68, e, wm)); sky.addColorStop(0.7, css(0.82, e, wm)); sky.addColorStop(1, css(0.86, e, wm));
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    // rock under the crest
    const zH = m.cam.Hpx * m.cam.zoom;
    g.save();
    g.beginPath(); g.moveTo(0, h + 2);
    const cr = m.crest.length ? m.crest : m.ridge;
    for (let i = 0; i < cr.length; i += 2) g.lineTo(i, cr[i]);
    g.lineTo(w, cr[cr.length - 1]); g.lineTo(w, h + 2); g.closePath();
    g.clip();
    g.fillStyle = css(0.12, e, wm); g.fillRect(0, 0, w, h);
    if (this.rock) {
      const pat = g.createPattern(this.rock, 'repeat');
      if (pat) {
        const ox = -m.cam.x * zH, oy = m.cam.y * zH;
        if (typeof DOMMatrix !== "undefined") pat.setTransform?.(new DOMMatrix([1.6, 0, 0, 2.4, ox % 410, oy % 615]));
        g.fillStyle = pat; g.globalAlpha = 0.9; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
      }
    }
    g.restore();
    // stone: rotated albedo, then a fixed light overlay
    const sx = m.cam.ax + (m.stone.c.x - m.cam.x) * zH, sy = m.cam.ay - (m.stone.c.y - m.cam.y) * zH, Rp = m.stone.R * zH;
    g.save();
    g.beginPath(); g.arc(sx, sy, Rp, 0, Math.PI * 2); g.clip();
    g.fillStyle = css(0.30, e, wm); g.fillRect(sx - Rp, sy - Rp, 2 * Rp, 2 * Rp);
    if (this.albedo) { g.translate(sx, sy); g.rotate(m.stone.rot); g.globalAlpha = 0.55; g.drawImage(this.albedo, -Rp, -Rp, 2 * Rp, 2 * Rp); g.globalAlpha = 1; g.setTransform(this.s, 0, 0, this.s, 0, 0); }
    const lit = g.createRadialGradient(sx - 0.45 * Rp, sy - 0.4 * Rp, 0.1 * Rp, sx - 0.1 * Rp, sy - 0.05 * Rp, 1.25 * Rp);
    lit.addColorStop(0, 'rgba(235,225,205,0.45)'); lit.addColorStop(0.55, 'rgba(120,110,95,0.0)'); lit.addColorStop(1, 'rgba(20,17,13,0.75)');
    g.fillStyle = lit; g.fillRect(sx - Rp, sy - Rp, 2 * Rp, 2 * Rp);
    g.restore();
    // figure: limbs as round-capped strokes of their own width (a fill, not an outline), lit back to dark front
    if (m.skel) {
      const S = (x: number, y: number) => [m.cam.ax + (x - m.cam.x) * zH, m.cam.ay - (y - m.cam.y) * zH];
      g.lineCap = 'round';
      for (const p of figurePrims(m.skel)) {
        const [ax, ay] = S(p.a.x, p.a.y), [bx, by] = S(p.b.x, p.b.y);
        const base = p.albedo * (p.side < 0 ? 0.7 : 0.95);
        const gr = g.createLinearGradient(ax - 0.06 * zH, ay - 0.06 * zH, ax + 0.06 * zH, ay + 0.06 * zH);
        gr.addColorStop(0, css(base * 1.25, e, wm)); gr.addColorStop(1, css(base * 0.5, e, wm));
        g.strokeStyle = gr; g.lineWidth = (p.ra + p.rb) * zH;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
    }
    for (const b of m.birds) { g.fillStyle = css(0.11, e, wm); g.beginPath(); g.ellipse(b.x, b.y, b.span, b.span * 0.12, b.bank, 0, Math.PI * 2); g.fill(); }
    if (this.snap && m.xfade > 0) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = m.xfade; g.drawImage(this.snap, 0, 0); g.globalAlpha = 1; g.setTransform(this.s, 0, 0, this.s, 0, 0); }
    // vignette and grain
    const vg = g.createRadialGradient(0.56 * w, 0.52 * h, 0.3 * Math.max(w, h), 0.56 * w, 0.52 * h, 0.85 * Math.max(w, h));
    vg.addColorStop(0, 'rgba(15,12,9,0)'); vg.addColorStop(1, 'rgba(15,12,9,0.42)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    if (this.grain) { const pat = g.createPattern(this.grain, 'repeat'); if (pat) { g.globalAlpha = 0.06; g.fillStyle = pat; g.fillRect(0, 0, w, h); g.globalAlpha = 1; } }
  }
  destroy() { this.g = null; this.canvas = null; this.rock = this.albedo = this.grain = this.snap = null; }
}
