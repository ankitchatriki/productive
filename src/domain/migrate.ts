// Schema migrations (FOCUS_PLAN.md §4.3). Pure.
import { defaultFocusSettings } from '../storage/defaults';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Upgrade any supported stored/imported shape to the current schema. Unknown input passes through
 *  untouched so validateAppData can report it. */
export function migrate(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  if (raw.schemaVersion === 1) {
    const settings = isObj(raw.settings)
      ? { ...raw.settings, showSplash: true, focus: { ...defaultFocusSettings, lastChoice: { ...defaultFocusSettings.lastChoice } } }
      : raw.settings;
    return { ...raw, schemaVersion: 2, settings, focus: null };
  }
  return raw;
}
