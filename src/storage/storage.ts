import type { AppData } from '../domain/types';

export interface Storage {
  load(): AppData | null;          // null = nothing stored or unparseable (raw copy kept under 'productive:v1:corrupt')
  save(data: AppData): void;       // throws on quota errors; store catches and shows banner
  clear(): void;
  subscribe(onExternalChange: (data: AppData) => void): () => void; // cross-tab 'storage' event
  approxBytes(): number;
}
