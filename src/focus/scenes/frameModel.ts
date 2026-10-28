// What the Sisyphus engine hands its renderer each frame (ROUND6_PLAN §3.2): plain data, no drawing. The tests run
// on these models; the GL and Canvas renderers turn them into a toned print.
import type { V } from './path';
import type { Skel } from './walk';

export interface BirdModel { x: number; y: number; span: number; flap: number; bank: number }

export interface FrameModel {
  /** CSS size and the device pixel ratio the renderer should use. */
  w: number; h: number; dpr: number;
  /** Ambient clock (s): sky evolution and grain; frozen when paused and in reduced motion. */
  t: number;
  /** Camera: world (H) point at the anchor (CSS px), zoom, and H in CSS px at zoom 1. */
  cam: { x: number; y: number; zoom: number; ax: number; ay: number; Hpx: number };
  /** Per-stage seed: each climb has its own rock. */
  seed: number;
  /** Screen y (CSS px) of the crest for each CSS column (length = ceil(w)). */
  ridge: Float32Array;
  /** World x of the crest's contact windows (feet, stone): the silhouette is exactly the trail there. */
  contacts: number[];
  /** World x beyond which the far side falls away into haze (the summit's back), or +∞. */
  hazeFromX: number;
  stone: { c: V; R: number; rot: number };
  /** The figure's skeleton (world, H), or null. */
  skel: Skel | null;
  sky: { drift: number; evolve: number; glow: number; burn: number; open: number; openX: number; openY: number; moon: number; moonX: number; moonY: number };
  tone: { exposure: number; warmth: number };
  birds: BirdModel[];
  /** 0..1: the previous frame's scene shows through (a cut); grain and paper never cross-fade. */
  xfade: number;
  /** Take a snapshot of the scene as it is now, before this frame (a cut begins). */
  cut: boolean;
  reduced: boolean;
  quality: number;
  /** Debug: render the stone's albedo only (no light) for the roll search. */
  debugAlbedo?: boolean;
}
