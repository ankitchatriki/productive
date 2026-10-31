// Schema migrations (FOCUS_PLAN.md §4.3). Pure.
import { defaultFocusSettings } from '../storage/defaults';
import { defaultMountain } from './climb';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Upgrade any supported stored/imported shape to the current schema. Unknown input passes through
 *  untouched so validateAppData can report it. */
export function migrate(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  let r: Obj = raw;
  if (r.schemaVersion === 1) {
    const settings = isObj(r.settings)
      ? { ...r.settings, showSplash: true, focus: { ...defaultFocusSettings, lastChoice: { ...defaultFocusSettings.lastChoice } } }
      : r.settings;
    r = { ...r, schemaVersion: 2, settings, focus: null };
  }
  // v2 → v3 (ROUND3_ART §6.2): the never-ending mountain starts at its foot.
  if (r.schemaVersion === 2) r = { ...r, schemaVersion: 3, mountain: defaultMountain() };
  return r;
}
