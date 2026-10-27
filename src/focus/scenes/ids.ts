// Pure scene ids (no canvas code) — imported by domain validation and defaults.
import type { SceneId } from '../../domain/types';

export const SCENE_IDS: readonly SceneId[] = ['sisyphus', 'daylight'];
export const DEFAULT_SCENE: SceneId = 'sisyphus';

export function isSceneId(v: unknown): v is SceneId {
  return typeof v === 'string' && (SCENE_IDS as readonly string[]).includes(v);
}
