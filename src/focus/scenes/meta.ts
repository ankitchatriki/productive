import type { SceneId } from '../../domain/types';

/** Labels and preview swatches (no rendering code, safe to import anywhere). */
export const SCENE_META: Record<SceneId, { label: string; description: string; swatch: string }> = {
  daylight: {
    label: 'Daylight',
    description: 'The sun rises as you start, crosses the sky and sets as the block ends.',
    swatch: 'linear-gradient(180deg, #2c5a8f 0%, #a9c7da 55%, #222c3a 56%, #2d4a66 100%)',
  },
  nightfall: {
    label: 'Nightfall',
    description: 'For late nights: the moon crosses a starry sky; dawn breaks when you finish.',
    swatch: 'linear-gradient(180deg, #0b0e1f 0%, #1d2140 55%, #0b0a12 56%, #10132a 100%)',
  },
};
