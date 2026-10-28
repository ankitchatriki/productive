// The WebGL renderer (ROUND6_PLAN §3.3, §3.7): a WebGL2 or WebGL1 context running GLSL ES 1.00 programs. The scene
// (sky, cliff, stone, figure, birds) is rendered as luminance into an RGBA8 buffer; one print pass tones it.
import type { FrameModel } from '../frameModel';
import type { Renderer, RendererStats } from './renderer';
import { toneLUT } from './tone';
import { QUAD_VS } from './shaders/common';
import { POST_FS, COPY_FS } from './shaders/post';
import { SKY_FS, CLIFF_FS, COMP_FS } from './shaders/bg';
import { STONE_FS, STONE_BAKE_FS } from './shaders/stone';
import { FIGURE_FS, MAX_PRIMS } from './shaders/figure';
import { BIRD_FS } from './shaders/bird';
import { figurePrims, figureBounds } from './figurePrims';

type GL = WebGLRenderingContext;
interface Prog { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }
interface Target { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }

const OPTS: WebGLContextAttributes = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'default' };

export class GLRenderer implements Renderer {
  readonly kind = 'gl' as const;
  stats: RendererStats = { kind: 'gl', lost: 0 };
  onFail?: () => void;
  private canvas: HTMLCanvasElement | null = null;
  private gl: GL | null = null;
  private progs: Record<string, Prog> = {};
  private quad: WebGLBuffer | null = null;
  private scene: Target | null = null;
  private snap: Target | null = null;
  private ridgeTex: WebGLTexture | null = null;
  private lutTex: WebGLTexture | null = null;
  private lutWarmth = NaN;
  private ridgeBuf: Uint8Array | null = null;
  private crestTex: WebGLTexture | null = null;
  private crestBuf: Uint8Array | null = null;
  private paperTex: WebGLTexture | null = null;
  private stoneTex: WebGLTexture | null = null;
  private stoneSeed = NaN;
  private w = 0; h = 0; dpr = 1; dev = { w: 1, h: 1, s: 1 };
  private hasSnap = false;
  /** The sky at half resolution, refreshed every other frame while climbing. */
  private skyT: Target | null = null;
  private frameNo = 0;
  /** The cliff: a world-anchored panorama, double-buffered and rebuilt a strip per frame ahead of the camera. */
  private pano: Array<{ t: Target; x0: number; y0: number; ppH: number; key: string; built: number } | null> = [null, null];
  private front = 0;
  /** Set pieces (zooming): a wide panorama, rebuilt only when the view leaves it or the scale drifts. */
  private live: { t: Target; x0: number; y0: number; ppH: number; key: string } | null = null;
  private livePending: { t: Target; x0: number; y0: number; ppH: number; key: string; built: number } | null = null;
  private cliffRidge: WebGLTexture | null = null;
  private cliffRidgeBuf: Uint8Array | null = null;
  tileBuilds = 0;
  private lostAt: number[] = [];
  private onLost = (e: Event) => { e.preventDefault(); this.lostAt.push(performance.now()); this.stats.lost = (this.stats.lost ?? 0) + 1; this.gl = null; if (this.lostAt.filter((t) => performance.now() - t < 60000).length >= 2) this.onFail?.(); };
  private onRestored = () => { if (this.canvas) { this.init(this.canvas); this.resize(this.w, this.h, this.dpr); } };

  mount(canvas: HTMLCanvasElement): boolean {
    this.canvas = canvas;
    if (!this.init(canvas)) return false;
    canvas.addEventListener?.('webglcontextlost', this.onLost as EventListener, false);
    canvas.addEventListener?.('webglcontextrestored', this.onRestored as EventListener, false);
    return true;
  }

  private init(canvas: HTMLCanvasElement): boolean {
    let gl: GL | null = null;
    try { gl = (canvas.getContext('webgl2', OPTS) as unknown as GL | null) ?? (canvas.getContext('webgl', OPTS) as GL | null); } catch { gl = null; }
    if (!gl || typeof gl.createShader !== 'function') return false;
    this.gl = gl;
    try {
      const ext = gl.getExtension('KHR_parallel_shader_compile');
      void ext;
      this.progs = {
        sky: this.program(QUAD_VS, SKY_FS), cliff: this.program(QUAD_VS, CLIFF_FS), comp: this.program(QUAD_VS, COMP_FS),
        post: this.program(QUAD_VS, POST_FS), copy: this.program(QUAD_VS, COPY_FS),
        stone: this.program(QUAD_VS, STONE_FS), stoneBake: this.program(QUAD_VS, STONE_BAKE_FS), figure: this.program(QUAD_VS, FIGURE_FS), bird: this.program(QUAD_VS, BIRD_FS),
      };
    } catch (err) {
      console.warn('Sisyphus GL programs failed; falling back.', err);
      this.gl = null;
      return false;
    }
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.ridgeTex = this.texture(1, 1, gl.NEAREST);
    this.cliffRidge = this.texture(1, 1, gl.NEAREST);
    this.crestTex = this.texture(1, 1, gl.NEAREST);
    this.paperTex = this.paper();
    this.stoneTex = null; this.stoneSeed = NaN;
    this.lutTex = this.texture(256, 1, gl.LINEAR);
    this.lutWarmth = NaN;
    this.scene = null; this.snap = null; this.hasSnap = false;
    return true;
  }

  private program(vs: string, fs: string): Prog {
    const gl = this.gl!;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (gl.getShaderParameter(s, gl.COMPILE_STATUS) !== true) throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (gl.getProgramParameter(p, gl.LINK_STATUS) !== true) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return { p, u: new Map() };
  }
  private loc(pr: Prog, name: string) { if (!pr.u.has(name)) pr.u.set(name, this.gl!.getUniformLocation(pr.p, name)); return pr.u.get(name)!; }
  private texture(w: number, h: number, filter: number): WebGLTexture {
    const gl = this.gl!;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  private target(w: number, h: number): Target {
    const gl = this.gl!;
    const tex = this.texture(w, h, gl.LINEAR);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  /** The print's paper: a static low-frequency unevenness, generated once (it belongs to the print, not the scene). */
  private paper(): WebGLTexture {
    const gl = this.gl!, N = 128, buf = new Uint8Array(N * N * 4);
    const vn = (x: number, y: number) => { const h = (i: number, j: number) => { const t = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return t - Math.floor(t); }; const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); return (h(ix, iy) * (1 - ux) + h(ix + 1, iy) * ux) * (1 - uy) + (h(ix, iy + 1) * (1 - ux) + h(ix + 1, iy + 1) * ux) * uy; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0, a = 0.5, f = 4 / N, n = 0;
      for (let o = 0; o < 3; o++) { v += a * vn(x * f + o * 7.1, y * f - o * 3.3); n += a; a *= 0.5; f *= 2; }
      const c = Math.round((v / n) * 255);
      buf.set([c, c, c, 255], (y * N + x) * 4);
    }
    const t = this.texture(N, N, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  }
  /** The stone's surface (albedo, height) in material space, an equirectangular 1024×512 map baked once per climb. */
  private bakeStone(seed: number, quality: number) {
    const gl = this.gl!;
    const W = 1024, H = 512;
    const t = this.target(W, H);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.disable(gl.BLEND);
    this.pass(this.progs.stoneBake, t, [0, 0, 1, 1], (pr) => {
      gl.uniform2f(this.loc(pr, 'uSize'), W, H);
      gl.uniform1f(this.loc(pr, 'uSeed'), (seed % 997) * 0.731);
      gl.uniform1f(this.loc(pr, 'uQuality'), quality);
    });
    this.stoneTex = t.tex; this.stoneSeed = seed;
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w; this.h = h; this.dpr = dpr;
    // backbuffer min(dpr, 1.5), capped at 2.4 MP (1.6 MP on a phone)
    let s = Math.min(dpr, 1.5);
    const cap = Math.max(w, h) < 900 ? 1.6e6 : 2.4e6;
    if (w * h * s * s > cap) s = Math.sqrt(cap / (w * h));
    this.dev = { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), s };
    if (this.canvas) { this.canvas.width = this.dev.w; this.canvas.height = this.dev.h; }
    if (!this.gl) return;
    this.scene = this.target(this.dev.w, this.dev.h);
    this.snap = this.target(this.dev.w, this.dev.h);
    this.skyT = this.target(Math.max(1, Math.round(this.dev.w / 2)), Math.max(1, Math.round(this.dev.h / 2)));
    this.live = this.livePending = null;
    this.pano = [null, null];
    this.hasSnap = false;
  }

  /** Device px per CSS px actually used. */
  get scale() { return this.dev.s; }

  snapshot() {
    const gl = this.gl;
    if (!gl || !this.scene || !this.snap) return;
    this.pass(this.progs.copy, this.snap, [0, 0, 1, 1], (pr) => { this.bindTex(0, this.scene!.tex); gl.uniform1i(this.loc(pr, 'uTex'), 0); });
    this.hasSnap = true;
  }

  private bindTex(unit: number, t: WebGLTexture) { const gl = this.gl!; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
  /** Draw a quad (rect in 0..1 of the target, y up) with a program into a target (null = the canvas). */
  private pass(pr: Prog, tgt: Target | null, rect: number[], setup: (pr: Prog) => void) {
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fb : null);
    gl.viewport(0, 0, tgt ? tgt.w : this.dev.w, tgt ? tgt.h : this.dev.h);
    gl.useProgram(pr.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f(this.loc(pr, 'uRect'), rect[0] * 2 - 1, rect[1] * 2 - 1, rect[2] * 2 - 1, rect[3] * 2 - 1);
    setup(pr);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  draw(m: FrameModel) {
    const gl = this.gl;
    if (!gl || !this.scene) return;
    if (m.cut) this.snapshot();
    const { w: DW, h: DH, s } = this.dev;
    const zH = m.cam.Hpx * m.cam.zoom;
    // world origin (multiple of 64 H): the shaders work in small relative numbers; the hash domain stays continuous
    const ox = Math.floor(m.cam.x / 64) * 64, oy = Math.floor(m.cam.y / 64) * 64;
    // ridge texture: crest screen y per CSS column, 1/8 px precision
    const N = m.ridge.length;
    if (!this.ridgeBuf || this.ridgeBuf.length !== N * 4) this.ridgeBuf = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      const v = Math.max(0, Math.min(65535, Math.round((m.ridge[i] + m.h) * 8)));
      this.ridgeBuf[i * 4] = v >> 8; this.ridgeBuf[i * 4 + 1] = v & 255; this.ridgeBuf[i * 4 + 2] = 0; this.ridgeBuf[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.ridgeTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.ridgeBuf);
    if (!this.crestBuf || this.crestBuf.length !== N * 4) this.crestBuf = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      const v = Math.max(0, Math.min(65535, Math.round((m.crest[i] + m.h) * 8)));
      this.crestBuf[i * 4] = v >> 8; this.crestBuf[i * 4 + 1] = v & 255; this.crestBuf[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.crestTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.crestBuf);
    if (m.seed !== this.stoneSeed || !this.stoneTex) this.bakeStone(m.seed, m.quality);
    if (Math.abs(m.tone.warmth - this.lutWarmth) > 0.004 || Number.isNaN(this.lutWarmth)) {
      gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, toneLUT(m.tone.warmth));
      this.lutWarmth = m.tone.warmth;
    }
    const rel = (x: number, y: number) => [x - ox, y - oy];
    const common = (pr: Prog) => {
      gl.uniform2f(this.loc(pr, 'uRes'), DW, DH);
      gl.uniform1f(this.loc(pr, 'uDpr'), s);
      gl.uniform1f(this.loc(pr, 'uH'), m.h);
      const [cx, cy] = rel(m.cam.x, m.cam.y);
      gl.uniform4f(this.loc(pr, 'uCam'), cx, cy, zH, m.cam.zoom);
      gl.uniform2f(this.loc(pr, 'uAnchor'), m.cam.ax, m.cam.ay);
      gl.uniform1f(this.loc(pr, 'uSeed'), (m.seed % 997) * 0.731);
      gl.uniform1f(this.loc(pr, 'uQuality'), m.quality);
    };
    // 1. the sky, half resolution, every other frame while climbing (every frame in set pieces)
    gl.disable(gl.BLEND);
    const setRidge = (pr: Prog, tex: WebGLTexture, n: number, off: number) => {
      this.bindTex(0, tex); gl.uniform1i(this.loc(pr, 'uRidge'), 0);
      gl.uniform1f(this.loc(pr, 'uRidgeN'), n); gl.uniform1f(this.loc(pr, 'uRidgeOff'), off);
    };
    const setPieces = m.cam.zoom < 0.999 || m.xfade > 0;
    if (this.frameNo % 2 === 0 || setPieces || m.reduced || this.frameNo < 2) {
      const sk = this.skyT!;
      this.pass(this.progs.sky, sk, [0, 0, 1, 1], (pr) => {
        gl.uniform2f(this.loc(pr, 'uRes'), sk.w, sk.h);
        gl.uniform1f(this.loc(pr, 'uDpr'), s * (sk.w / DW));
        gl.uniform1f(this.loc(pr, 'uH'), m.h);
        gl.uniform1f(this.loc(pr, 'uSeed'), (m.seed % 997) * 0.731);
        setRidge(pr, this.ridgeTex!, N, m.h);
        gl.uniform4f(this.loc(pr, 'uSky'), m.sky.drift, m.sky.evolve, m.sky.glow, m.sky.burn);
        gl.uniform4f(this.loc(pr, 'uOpen'), m.sky.open, m.sky.openX, m.sky.openY, 0);
        gl.uniform4f(this.loc(pr, 'uMoon'), m.sky.moon, m.sky.moonX, m.sky.moonY, 0.08 * m.h);
      });
    }
    this.frameNo++;
    // 2. the cliff: world-anchored, so it is built once and scrolled
    const pxPerH = zH * s;
    const view = { x0: m.cam.x - m.cam.ax / zH, x1: m.cam.x + (m.w - m.cam.ax) / zH, y0: m.cam.y + m.cam.ay / zH, y1: m.cam.y - (m.h - m.cam.ay) / zH };
    const buildCliff = (tgt: Target, x0: number, y0: number, ppH: number, rows: [number, number] | null) => {
      // the crest line in the target's own pixels
      const n = tgt.w;
      if (!this.cliffRidgeBuf || this.cliffRidgeBuf.length !== n * 4) this.cliffRidgeBuf = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) {
        const y = (y0 - m.groundY(x0 + (i + 0.5) / ppH)) * ppH;
        const v = Math.max(0, Math.min(65535, Math.round((y + tgt.h) * 8)));
        this.cliffRidgeBuf[i * 4] = v >> 8; this.cliffRidgeBuf[i * 4 + 1] = v & 255; this.cliffRidgeBuf[i * 4 + 3] = 255;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.cliffRidge);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.cliffRidgeBuf);
      const rect = rows ? [0, 1 - rows[1], 1, 1 - rows[0]] : [0, 0, 1, 1];
      this.pass(this.progs.cliff, tgt, rect, (pr) => {
        gl.uniform2f(this.loc(pr, 'uTarget'), tgt.w, tgt.h);
        gl.uniform1f(this.loc(pr, 'uPxPerH'), ppH);
        gl.uniform2f(this.loc(pr, 'uW0'), x0 - ox, y0 - oy);
        gl.uniform2f(this.loc(pr, 'uOrigin'), ox, oy);
        gl.uniform1f(this.loc(pr, 'uSeed'), (m.seed % 997) * 0.731);
        gl.uniform1f(this.loc(pr, 'uQuality'), m.quality);
        setRidge(pr, this.cliffRidge!, n, tgt.h);
      });
      this.tileBuilds++;
    };
    let cliff: { t: Target; x0: number; y0: number; ppH: number };
    if (m.cam.zoom !== 1) {
      // zooming (summit, next climb): one wide panorama (0.35 of a view of margin each side, 0.8× resolution), kept
      // while it covers the view at a scale within -28%/+55% of the camera's. A new one is built a strip per frame
      // while an older panorama still covers the view (the pull-back starts slowly), so no frame pays for a whole cliff.
      const ew = view.x1 - view.x0, eh = view.y0 - view.y1;
      const wantKey = `${m.seed}|${m.quality}`;
      type P = { t: Target; x0: number; y0: number; ppH: number; key: string };
      const covers = (p: P | null, lo: number, hi: number): p is P => !!p && p.key === wantKey && p.ppH <= pxPerH * hi && p.ppH >= pxPerH * lo
        && view.x0 >= p.x0 && view.x1 <= p.x0 + p.t.w / p.ppH && view.y0 <= p.y0 && view.y1 >= p.y0 - p.t.h / p.ppH;
      const free = (p: P | null) => { if (p) { gl.deleteFramebuffer(p.t.fb); gl.deleteTexture(p.t.tex); } };
      if (!covers(this.live, 0.72, 1.55)) {
        let pend = this.livePending;
        if (pend && !covers(pend, 0.72, 1.55)) { free(pend); pend = null; }
        if (!pend) {
          const ppH = Math.min(0.8 * pxPerH, 4096 / (1.7 * ew), 4096 / (1.7 * eh));
          const TW = Math.max(1, Math.round(1.7 * ew * ppH)), TH = Math.max(1, Math.round(1.7 * eh * ppH));
          pend = { t: this.target(TW, TH), x0: view.x0 - 0.35 * ew, y0: view.y0 + 0.35 * eh, ppH, key: wantKey, built: 0 };
        }
        const fp = this.pano[this.front];
        const regular: P | null = fp && fp.key.startsWith(`${m.seed}|`) && fp.key.endsWith(`|${m.quality}`) ? { t: fp.t, x0: fp.x0, y0: fp.y0, ppH: fp.ppH, key: wantKey } : null;
        const stopgap = covers(this.live, 0.6, 2) ? this.live : covers(regular, 0.6, 2) ? regular : null;
        const STRIPS = 12;
        if (stopgap) { buildCliff(pend.t, pend.x0, pend.y0, pend.ppH, [pend.built / STRIPS, (pend.built + 1) / STRIPS]); pend.built++; }
        else { buildCliff(pend.t, pend.x0, pend.y0, pend.ppH, null); pend.built = STRIPS; }
        if (pend.built >= STRIPS) { free(this.live); this.live = pend; this.livePending = null; }
        else this.livePending = pend;
        const show = covers(this.live, 0.6, 2) ? this.live : stopgap!;
        cliff = { t: show.t, x0: show.x0, y0: show.y0, ppH: show.ppH };
      } else {
        const l = this.live;
        cliff = { t: l.t, x0: l.x0, y0: l.y0, ppH: l.ppH };
      }
    } else {
      const M = Math.round(0.28 * Math.max(DW, DH));                 // margin around the view (device px)
      const PW = DW + 2 * M, PH = DH + 2 * M;
      const key = `${m.seed}|${pxPerH.toFixed(4)}|${PW}x${PH}|${m.quality}`;
      const contains = (p: { x0: number; y0: number; key: string } | null, slack: number) => !!p && p.key === key
        && view.x0 >= p.x0 + slack / pxPerH && view.x1 <= p.x0 + (PW - slack) / pxPerH && view.y0 <= p.y0 - slack / pxPerH && view.y1 >= p.y0 - (PH - slack) / pxPerH;
      const fresh = () => ({ x0: view.x0 - M / pxPerH, y0: view.y0 + M / pxPerH });
      const STRIPS = 12;
      const f = this.pano[this.front];
      if (!contains(f, 0)) {
        // first frame or a jump: build the whole panorama now
        const r = fresh();
        const t = f && f.t.w === PW && f.t.h === PH ? f.t : this.target(PW, PH);
        buildCliff(t, r.x0, r.y0, pxPerH, null);
        this.pano[this.front] = { t, x0: r.x0, y0: r.y0, ppH: pxPerH, key, built: STRIPS };
        this.pano[1 - this.front] = null;
      } else if (!contains(f, M / 2) || (this.pano[1 - this.front] && this.pano[1 - this.front]!.built < STRIPS)) {
        // within half a margin of the edge: build the next panorama, centred on the view, one strip per frame
        let b = this.pano[1 - this.front];
        if (!b || b.key !== key || b.built >= STRIPS) {
          const r = fresh();
          const t = b && b.t.w === PW && b.t.h === PH ? b.t : this.target(PW, PH);
          b = { t, x0: r.x0, y0: r.y0, ppH: pxPerH, key, built: 0 };
          this.pano[1 - this.front] = b;
        }
        buildCliff(b.t, b.x0, b.y0, pxPerH, [b.built / STRIPS, (b.built + 1) / STRIPS]);
        b.built++;
        if (b.built >= STRIPS && contains(b, 0)) { this.front = 1 - this.front; this.pano[1 - this.front] = null; }
      }
      const fp = this.pano[this.front]!;
      cliff = { t: fp.t, x0: fp.x0, y0: fp.y0, ppH: pxPerH };
    }
    this.stats.tiles = this.tileBuilds;
    // 3. composite: sky, the cliff under the broken crest, the edge glow
    this.pass(this.progs.comp, this.scene, [0, 0, 1, 1], (pr) => {
      common(pr);
      setRidge(pr, this.crestTex!, N, m.h);
      this.bindTex(1, this.skyT!.tex); gl.uniform1i(this.loc(pr, 'uSkyTex'), 1);
      this.bindTex(2, cliff.t.tex); gl.uniform1i(this.loc(pr, 'uCliffTex'), 2);
      gl.uniform4f(this.loc(pr, 'uCliffMap'), cliff.x0 - ox, cliff.y0 - oy, cliff.ppH, 0);
      gl.uniform2f(this.loc(pr, 'uCliffSize'), cliff.t.w, cliff.t.h);
      gl.uniform1f(this.loc(pr, 'uHazeX'), Number.isFinite(m.hazeFromX) ? m.hazeFromX - ox : 1e6);
    });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const toCss = (x: number, y: number) => [m.cam.ax + (x - m.cam.x) * zH, m.cam.ay - (y - m.cam.y) * zH];
    const rectCss = (x0: number, y0: number, x1: number, y1: number) => [Math.max(0, x0 / m.w), Math.max(0, 1 - y1 / m.h), Math.min(1, x1 / m.w), Math.min(1, 1 - y0 / m.h)];
    // 4. stone
    {
      const [sx, sy] = toCss(m.stone.c.x, m.stone.c.y), Rp = m.stone.R * zH;
      const r = rectCss(sx - 1.25 * Rp, sy - 1.25 * Rp, sx + 1.25 * Rp, sy + 1.25 * Rp);
      if (r[2] > r[0] && r[3] > r[1]) this.pass(this.progs.stone, this.scene, r, (pr) => {
        common(pr);
        gl.uniform3f(this.loc(pr, 'uStone'), sx, sy, Rp);
        const rot = ((m.stone.rot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        gl.uniform1f(this.loc(pr, 'uRot'), rot);
        gl.uniform1f(this.loc(pr, 'uAlbedoOnly'), m.debugAlbedo ? 1 : 0);
        this.bindTex(1, this.stoneTex!); gl.uniform1i(this.loc(pr, 'uSurf'), 1);
        this.bindTex(0, this.ridgeTex!); gl.uniform1i(this.loc(pr, 'uRidge'), 0);
        gl.uniform1f(this.loc(pr, 'uRidgeN'), N);
      });
    }
    // 5. figure
    if (m.skel) {
      const prims = figurePrims(m.skel);
      const b = figureBounds(prims);
      const [x0, y1] = toCss(b.x0, b.y0), [x1, y0] = toCss(b.x1, b.y1);
      const pad = 0.12 * zH + 4;
      const r = rectCss(x0 - pad, y0 - pad, x1 + pad, y1 + pad);
      if (r[2] > r[0] && r[3] > r[1]) this.pass(this.progs.figure, this.scene, r, (pr) => {
        common(pr);
        const A = new Float32Array(MAX_PRIMS * 4), B = new Float32Array(MAX_PRIMS * 4), C = new Float32Array(MAX_PRIMS * 4);
        prims.slice(0, MAX_PRIMS).forEach((q, i) => {
          const [ax, ay] = rel(q.a.x, q.a.y), [bx, by] = rel(q.b.x, q.b.y);
          A.set([ax, ay, q.az, q.ra], i * 4); B.set([bx, by, q.bz, q.rb], i * 4); C.set([q.albedo, q.kind, q.side, q.squash], i * 4);
        });
        gl.uniform4fv(this.loc(pr, 'uA[0]'), A); gl.uniform4fv(this.loc(pr, 'uB[0]'), B); gl.uniform4fv(this.loc(pr, 'uC[0]'), C);
        gl.uniform1i(this.loc(pr, 'uN'), Math.min(prims.length, MAX_PRIMS));
        const fc = m.skel!.feet.map((f) => rel(f.ball.x, f.ball.y));
        gl.uniform4f(this.loc(pr, 'uFeet'), fc[0][0], fc[0][1], fc[1][0], fc[1][1]);
        gl.uniform2f(this.loc(pr, 'uPeel'), m.skel!.feet[0].peel, m.skel!.feet[1].peel);
        this.bindTex(0, this.ridgeTex!); gl.uniform1i(this.loc(pr, 'uRidge'), 0);
        gl.uniform1f(this.loc(pr, 'uRidgeN'), N);
      });
    }
    // 6. birds
    for (const bd of m.birds) {
      const r = rectCss(bd.x - bd.span, bd.y - bd.span, bd.x + bd.span, bd.y + bd.span);
      this.pass(this.progs.bird, this.scene, r, (pr) => {
        common(pr);
        gl.uniform4f(this.loc(pr, 'uBird'), bd.x, bd.y, bd.span, bd.flap);
        gl.uniform1f(this.loc(pr, 'uBank'), bd.bank);
      });
    }
    gl.disable(gl.BLEND);
    // 7. the print
    this.pass(this.progs.post, null, [0, 0, 1, 1], (pr) => {
      this.bindTex(0, this.scene!.tex); gl.uniform1i(this.loc(pr, 'uScene'), 0);
      this.bindTex(1, this.snap!.tex); gl.uniform1i(this.loc(pr, 'uSnap'), 1);
      this.bindTex(2, this.lutTex!); gl.uniform1i(this.loc(pr, 'uLut'), 2);
      gl.uniform2f(this.loc(pr, 'uRes'), DW, DH);
      gl.uniform1f(this.loc(pr, 'uDpr'), s);
      gl.uniform1f(this.loc(pr, 'uXfade'), this.hasSnap ? m.xfade : 0);
      gl.uniform1f(this.loc(pr, 'uExposure'), m.tone.exposure);
      gl.uniform1f(this.loc(pr, 'uGrainT'), m.t);
      gl.uniform1f(this.loc(pr, 'uSoft'), m.quality >= 1 ? 0.6 : 0.0);
      gl.uniform1f(this.loc(pr, 'uPaperSeed'), (m.seed % 101) * 0.37 + 3.0);
      this.bindTex(3, this.paperTex!); gl.uniform1i(this.loc(pr, 'uPaper'), 3);
    });
    if (m.xfade <= 0) this.hasSnap = false;
  }

  destroy() {
    this.canvas?.removeEventListener?.('webglcontextlost', this.onLost as EventListener);
    this.canvas?.removeEventListener?.('webglcontextrestored', this.onRestored as EventListener);
    this.gl = null; this.canvas = null;
  }
}
