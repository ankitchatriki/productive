import { FallbackRing } from './FallbackRing';
import type { ScenePhase } from './scenes/types';
import type { SceneId } from '../domain/types';

export interface SceneCanvasProps {
  sceneId: SceneId;
  phase: ScenePhase;
  progress: number;
  completedAt: string | null;
  reducedMotion: boolean;
  running: boolean;
  accent: string;
}

/** Scene host. (F2: placeholder ring; scenes arrive in F4.) */
export function SceneCanvas({ progress, phase }: SceneCanvasProps) {
  return <FallbackRing progress={progress} phase={phase} />;
}
