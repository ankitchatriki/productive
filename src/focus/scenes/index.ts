import type { SceneId } from '../../domain/types';
import type { SceneInfo } from './types';
import { SCENE_META } from './meta';
import { createSisyphus } from './sisyphus';
import { createDaylight2D } from './daylight2d';

export const SCENES: Record<SceneId, SceneInfo> = {
  sisyphus: { id: 'sisyphus', ...SCENE_META.sisyphus, create: createSisyphus },
  daylight: { id: 'daylight', ...SCENE_META.daylight, create: createDaylight2D },
};
