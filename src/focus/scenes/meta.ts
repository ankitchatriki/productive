import type { SceneId } from '../../domain/types';

/** Labels and preview swatches (no rendering code, safe to import anywhere). */
export const SCENE_META: Record<SceneId, { label: string; description: string; swatch: string }> = {
  sisyphus: {
    label: 'Sisyphus',
    description: 'Push the boulder to the summit. It reaches the top as the block ends.',
    swatch: 'linear-gradient(160deg, #3a2a3e 0%, #c98a5a 55%, #3a2b20 56%, #1f1712 100%)',
  },
  daylight: {
    label: 'Daylight',
    description: 'The sun rises as you start, crosses the sky and sets as the block ends.',
    swatch: 'linear-gradient(180deg, #2c5a8f 0%, #a9c7da 55%, #222c3a 56%, #2d4a66 100%)',
  },
};
