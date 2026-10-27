// "Daylight" alternate scene, Canvas 2D (FOCUS_DESIGN §3.1 fallback spec): gradient sky,
// sun on an arc, three ridges, a lake with glitter, stars. Redraws at ≤ 10 fps.
import type { SceneEngine, SceneInitOptions, ScenePhase } from './types';
import { NIGHT, PREDAWN, css, gradePalette, lighten, mixPalette, mixRGB, palette } from './palette';
import { hash2, ridged, smoothstep } from './noise';

export function createDaylight2D(): SceneEngine {
  let canvas: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null;
  let w = 0, h = 0, d = 1, raf = 0, last = 0, t = 0;
  let progress = 0, phase: ScenePhase = 'focus', reduced = false, running = false, mounted = false;
  let completeAt = 0;

  function draw() {
    if (!ctx || !canvas) return;
    const H = h < w ? 0.64 : 0.6; // horizon from the top (screen fraction)
    const hy = h * H;
    let pal = palette(phase === 'complete' ? 1 : phase === 'break' ? 0 : progress);
    let starVis = phase === 'complete' ? Math.min(1, (performance.now() / 1000 - completeAt) / 3) : smoothstep(0.93, 1, progress) * 0.25;
    let moonP = -1;
    if (phase === 'break') {
      pal = mixPalette(NIGHT, PREDAWN, smoothstep(0.85, 1, progress));
      starVis = 1; moonP = progress;
    } else if (phase === 'complete' && progress > 0) {
      pal = mixPalette(pal, NIGHT, Math.min(1, progress * 6) * 0.85);
      moonP = progress;
    }
    pal = gradePalette(pal, 0.15);
    const g = ctx;
    g.setTransform(d, 0, 0, d, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, css(pal.zenith)); sky.addColorStop(1, css(pal.horizon));
    g.fillStyle = sky; g.fillRect(0, 0, w, hy);
    // stars
    if (starVis > 0.01) {
      const cell = Math.min(w, h) / 140;
      for (let y = 0; y < hy; y += cell) for (let x = 0; x < w; x += cell) {
        const b = hash2(x / cell, y / cell);
        if (b < 0.992) continue;
        g.fillStyle = `rgba(255,248,235,${starVis * (0.4 + 0.6 * hash2(y, x)) * (reduced ? 1 : 0.75 + 0.25 * Math.sin(t * 0.8 + b * 40))})`;
        g.fillRect(x, y, 1.4, 1.4);
      }
    }
    // sun / moon
    const p = phase === 'complete' ? 1.03 : progress;
    if (phase !== 'break') {
      const e = Math.sin(Math.PI * Math.min(1, p));
      const sx = w * (0.1 + 0.8 * Math.min(1, p)), sy = hy + 0.025 * h - e * 0.46 * h * (h < w ? 1 : 0.85);
      const r = 0.036 * Math.min(w, h);
      const glow = g.createRadialGradient(sx, sy, 0, sx, sy, r * 9);
      glow.addColorStop(0, css(pal.sun, 0.5)); glow.addColorStop(1, css(pal.sun, 0));
      g.fillStyle = glow; g.fillRect(sx - r * 9, sy - r * 9, r * 18, r * 18);
      g.fillStyle = css(lighten(pal.sun, 0.1)); g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
      // dotted path ahead
      g.fillStyle = 'rgba(244,241,234,0.12)';
      for (let q = Math.min(1, p) + 0.016; q <= 1; q += 0.016) {
        const ee = Math.sin(Math.PI * q);
        g.beginPath(); g.arc(w * (0.1 + 0.8 * q), hy + 0.025 * h - ee * 0.46 * h * (h < w ? 1 : 0.85), 1.4, 0, Math.PI * 2); g.fill();
      }
    }
    if (moonP >= 0) {
      const mx = w * (0.1 + 0.8 * moonP), my = hy - Math.sin(Math.PI * moonP) * 0.28 * h, r = 0.022 * Math.min(w, h);
      g.fillStyle = 'rgba(232,230,240,0.95)'; g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = css(pal.zenith); g.beginPath(); g.arc(mx + r * 0.45, my - r * 0.2, r * 0.95, 0, Math.PI * 2); g.fill();
    }
    // ridges
    const bases = [0.035, 0.015, -0.005], amps = [0.10, 0.075, 0.05], freqs = [1.4, 2.6, 4.5], hazes = [0.7, 0.45, 0.18];
    for (let i = 0; i < 3; i++) {
      g.fillStyle = css(mixRGB(pal.ridgeNear, pal.horizon, hazes[i]));
      g.beginPath(); g.moveTo(0, hy);
      for (let x = 0; x <= w + 8; x += 8) {
        const y = bases[i] + amps[i] * ridged((x / h) * freqs[i] + 7 * (i + 1));
        g.lineTo(x, hy - y * h);
      }
      g.lineTo(w, hy); g.closePath(); g.fill();
    }
    // lake: flipped sky gradient, darker, with glitter under the sun
    const lake = g.createLinearGradient(0, hy, 0, h);
    lake.addColorStop(0, css(mixRGB(pal.water, pal.horizon, 0.45)));
    lake.addColorStop(1, css(pal.water));
    g.fillStyle = lake; g.fillRect(0, hy, w, h - hy);
    if (phase !== 'break') {
      const sx = w * (0.1 + 0.8 * Math.min(1, p));
      for (let i = 0; i < 12; i++) {
        const y = hy + 6 + ((i * 37 + (reduced ? 0 : Math.floor(t * 0.6) * 11)) % Math.max(1, (h - hy) * 0.8));
        const len = 10 + (i % 4) * 8;
        g.fillStyle = css(pal.sun, 0.35);
        g.fillRect(sx - len / 2 + Math.sin(i * 7.1) * 18, y, len, 1.5);
      }
    }
    // vignette
    const vr = Math.hypot(w, h) * 0.62;
    const vg = g.createRadialGradient(w / 2, h / 2, vr * 0.35, w / 2, h / 2, vr);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    if (phase === 'paused') { g.fillStyle = 'rgba(20,16,12,0.25)'; g.fillRect(0, 0, w, h); }
  }

  function loop(ts: number) {
    raf = 0;
    if (!running || !mounted) return;
    if (ts - last >= 100) { t += (ts - last) / 1000; last = ts; draw(); }
    if (!reduced) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (reduced) draw(); else if (!raf && running && mounted) raf = requestAnimationFrame(loop); };

  return {
    mount(c: HTMLCanvasElement, opts: SceneInitOptions) {
      canvas = c; ctx = c.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas 2D unavailable');
      reduced = opts.reducedMotion; mounted = true; running = true;
      w = c.clientWidth || 800; h = c.clientHeight || 600;
      kick();
    },
    setProgress(p: number) { progress = Math.min(1, Math.max(0, p)); if (reduced) draw(); },
    setPhase(next: ScenePhase) { if (next === 'complete' && phase !== 'complete') completeAt = performance.now() / 1000; phase = next; draw(); },
    resize(width: number, height: number, dpr: number) {
      w = width; h = height; d = Math.min(1.5, dpr);
      if (w * h * d * d > 2.1e6) d = Math.sqrt(2.1e6 / (w * h));
      if (canvas) { canvas.width = Math.round(w * d); canvas.height = Math.round(h * d); }
      draw();
    },
    setRunning(r: boolean) { running = r; if (!r && raf) { cancelAnimationFrame(raf); raf = 0; } else kick(); },
    setReducedMotion(r: boolean) { reduced = r; if (r && raf) { cancelAnimationFrame(raf); raf = 0; } kick(); },
    destroy() { mounted = false; running = false; if (raf) cancelAnimationFrame(raf); raf = 0; canvas = null; ctx = null; },
  };
}
