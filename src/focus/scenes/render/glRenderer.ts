// The WebGL renderer (ROUND6_PLAN §3.3, §3.7): a WebGL2 or WebGL1 context running GLSL ES 1.00 programs. The scene
// (sky, cliff, stone, figure, birds) is rendered as luminance into an RGBA8 buffer; one print pass tones it.
import type { FrameModel } from '../frameModel';
import type { Renderer, RendererStats } from './renderer';
import { toneLUT } from './tone';
import { QUAD_VS } from './shaders/common';
import { POST_FS, COPY_FS } from './shaders/post';
import { BG_FS } from './shaders/bg';
import { STONE_FS } from './shaders/stone';
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
  private w = 0; h = 0; dpr = 1; dev = { w: 1, h: 1, s: 1 };
  private hasSnap = false;
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
        bg: this.program(QUAD_VS, BG_FS), post: this.program(QUAD_VS, POST_FS), copy: this.program(QUAD_VS, COPY_FS),
        stone: this.program(QUAD_VS, STONE_FS), figure: this.program(QUAD_VS, FIGURE_FS), bird: this.program(QUAD_VS, BIRD_FS),
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
    const om = (v: number) => ((v % 289) + 289) % 289;
    // ridge texture: crest screen y per CSS column, 1/8 px precision
    const N = m.ridge.length;
    if (!this.ridgeBuf || this.ridgeBuf.length !== N * 4) this.ridgeBuf = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      const v = Math.max(0, Math.min(65535, Math.round((m.ridge[i] + m.h) * 8)));
      this.ridgeBuf[i * 4] = v >> 8; this.ridgeBuf[i * 4 + 1] = v & 255; this.ridgeBuf[i * 4 + 2] = 0; this.ridgeBuf[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.ridgeTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.ridgeBuf);
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
      gl.uniform2f(this.loc(pr, 'uOrigin'), om(ox), om(oy));
      gl.uniform1f(this.loc(pr, 'uSeed'), (m.seed % 997) * 0.731);
      gl.uniform1f(this.loc(pr, 'uQuality'), m.quality);
    };
    // 1–3. sky and cliff
    gl.disable(gl.BLEND);
    this.pass(this.progs.bg, this.scene, [0, 0, 1, 1], (pr) => {
      common(pr);
      this.bindTex(0, this.ridgeTex!); gl.uniform1i(this.loc(pr, 'uRidge'), 0);
      gl.uniform1f(this.loc(pr, 'uRidgeN'), N);
      gl.uniform4f(this.loc(pr, 'uSky'), m.sky.drift, m.sky.evolve, m.sky.glow, m.sky.burn);
      gl.uniform4f(this.loc(pr, 'uOpen'), m.sky.open, m.sky.openX, m.sky.openY, 0);
      gl.uniform4f(this.loc(pr, 'uMoon'), m.sky.moon, m.sky.moonX, m.sky.moonY, 0.08 * m.h);
      const c = [0, 1, 2, 3].map((i) => (m.contacts[i] ?? 1e6) - ox);
      gl.uniform4f(this.loc(pr, 'uContacts'), c[0], c[1], c[2], c[3]);
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
    });
    if (m.xfade <= 0) this.hasSnap = false;
  }

  destroy() {
    this.canvas?.removeEventListener?.('webglcontextlost', this.onLost as EventListener);
    this.canvas?.removeEventListener?.('webglcontextrestored', this.onRestored as EventListener);
    this.gl = null; this.canvas = null;
  }
}
