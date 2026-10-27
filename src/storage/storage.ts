import type { AppData } from '../domain/types';

export interface Storage {
  load(): AppData | null;          // null = nothing stored or unparseable (raw copy kept under 'productive:v1:corrupt')
  save(data: AppData): void;       // throws on quota errors; store catches and shows banner
  clear(): void;
  subscribe(onExternalChange: (data: AppData) => void): () => void; // cross-tab 'storage' event
  approxBytes(): number;
  /** Raw text kept from an unreadable load in this session, if any (review R9). */
  corruptCopy?(): string | null;
  /** Forget the kept corrupt copy. */
  discardCorrupt?(): void;
}
