import { useStorageInfo } from '../state/store';
import { downloadText } from '../utils/download';

/** Shown when saved data couldn't be read at startup (review R9). */
export function CorruptBanner() {
  const { corruptCopy, dismissCorrupt } = useStorageInfo();
  if (!corruptCopy) return null;
  return (
    <div className="banner banner-danger" role="alert" style={{ margin: 16 }}>
      <span className="banner-text">Your saved data couldn't be read, so Productive started empty. The original was kept; download it before it's lost.</span>
      <button type="button" className="btn btn-sm" onClick={() => downloadText(`productive-unreadable-${new Date().toISOString().slice(0, 10)}.json`, corruptCopy, 'application/json')}>Download raw copy</button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={dismissCorrupt}>Dismiss</button>
    </div>
  );
}
