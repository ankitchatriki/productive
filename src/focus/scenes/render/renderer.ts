// The renderer contract (ROUND6_PLAN §3.2): the engine builds a FrameModel; a GL, Canvas 2D or null renderer draws it.
import type { FrameModel } from '../frameModel';

export interface RendererStats { kind: string; gpuMs?: number; tiles?: number; tier?: number; lost?: number }

export interface Renderer {
  readonly kind: 'gl' | '2d' | 'null';
  stats: RendererStats;
  /** Bind to the canvas; false when this renderer cannot run there (e.g. no WebGL). */
  mount(canvas: HTMLCanvasElement): boolean;
  resize(w: number, h: number, dpr: number): void;
  /** Copy the current scene for a cross-fade. */
  snapshot(): void;
  draw(m: FrameModel): void;
  destroy(): void;
  /** Called by the renderer when it cannot continue (context lost twice): the engine falls back. */
  onFail?: () => void;
}

/** Records every model (the tests' renderer). */
export class NullRenderer implements Renderer {
  readonly kind = 'null' as const;
  stats = { kind: 'null' };
  models: FrameModel[] = [];
  keep = 1;
  mount() { return true; }
  resize() {}
  snapshot() {}
  draw(m: FrameModel) { this.models.push(m); if (this.models.length > this.keep) this.models.shift(); }
  destroy() { this.models = []; }
}

export type RendererFactory = () => Renderer[];
let override: RendererFactory | null = null;
/** Tests install a factory (e.g. the null renderer); the engine otherwise tries GL, then Canvas 2D. */
export function setRendererFactory(f: RendererFactory | null) { override = f; }
export function rendererOverride(): RendererFactory | null { return override; }
