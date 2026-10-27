import { useState } from 'react';
import styles from './SettingsPage.module.css';
import { useDispatch, useStore } from '../state/store';
import { BLOCK_PRESETS, clampBlockMinutes, clampBreakMinutes } from '../domain/focus';
import type { FocusSettings, MotionPref } from '../domain/types';
import { SCENE_IDS } from '../focus/scenes/ids';
import { SCENE_META } from '../focus/scenes/meta';
import { playChime, primeAudio } from '../focus/chime';

/** Settings → Focus (FOCUS_PLAN §6.4). */
export function FocusSettingsCard() {
  const data = useStore();
  const dispatch = useDispatch();
  const fs = data.settings.focus;
  const set = (patch: Partial<FocusSettings>) => dispatch({ type: 'focus/settings', patch });
  const [custom, setCustom] = useState(String(fs.defaultBlockMinutes));
  const [brk, setBrk] = useState(String(fs.breakMinutes));
  const isPreset = (BLOCK_PRESETS as readonly number[]).includes(fs.defaultBlockMinutes);
  return (
    <section className={styles.group} aria-labelledby="g-focus">
      <h2 id="g-focus" className="section-title">Focus</h2>
      <div className={styles.row}>
        <div><span className={styles.label} id="def-block">Default block length</span><p className="help">Used when your last choice can't apply.</p></div>
        <div className={`${styles.control} row`} role="group" aria-labelledby="def-block">
          {BLOCK_PRESETS.map((m) => (
            <button key={m} type="button" className="daychip" aria-pressed={fs.defaultBlockMinutes === m} onClick={() => { set({ defaultBlockMinutes: m }); setCustom(String(m)); }}>{m}</button>
          ))}
          <label className="visually-hidden" htmlFor="def-custom">Custom default minutes</label>
          <input id="def-custom" className="input input-num" style={{ width: 76 }} inputMode="numeric" value={custom} aria-describedby="def-block"
            onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={() => { const m = clampBlockMinutes(Number(custom)); setCustom(String(m)); set({ defaultBlockMinutes: m }); }} />
          {!isPreset && <span className="xs muted">custom</span>}
        </div>
      </div>
      <div className={styles.row}>
        <label htmlFor="ask-block" className={styles.label}>Ask for a block length each time I clock in</label>
        <input id="ask-block" type="checkbox" className={styles.control} checked={fs.askBlockEachTime} onChange={(e) => set({ askBlockEachTime: e.target.checked })} />
      </div>
      <div className={styles.row}>
        <label htmlFor="enter-focus" className={styles.label}>Open focus mode when a block starts</label>
        <input id="enter-focus" type="checkbox" className={styles.control} checked={fs.enterOnClockIn} onChange={(e) => set({ enterOnClockIn: e.target.checked })} />
      </div>
      <div className={styles.row}>
        <label htmlFor="break-min" className={styles.label}>Break length (minutes)</label>
        <input id="break-min" className={`input input-num ${styles.control}`} style={{ width: 90 }} inputMode="numeric" value={brk}
          onChange={(e) => setBrk(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={() => { const m = clampBreakMinutes(Number(brk)); setBrk(String(m)); set({ breakMinutes: m }); }} />
      </div>
      <div className={styles.row}>
        <label htmlFor="chime" className={styles.label}>Chime at the end of a block or break</label>
        <div className={`${styles.control} row`}>
          <input id="chime" type="checkbox" checked={fs.chime} onChange={(e) => set({ chime: e.target.checked })} />
          <button type="button" className="btn btn-sm" onClick={() => { primeAudio(); window.setTimeout(() => playChime(), 60); }}>Test</button>
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label} id="scene-label">Scene</span>
        <div className={`${styles.control} row`} role="radiogroup" aria-labelledby="scene-label">
          {SCENE_IDS.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={fs.scene === id} className="daychip" title={SCENE_META[id].description} onClick={() => set({ scene: id })}>
              <span aria-hidden="true" style={{ display: 'inline-block', width: 22, height: 14, borderRadius: 3, marginRight: 6, verticalAlign: 'middle', background: SCENE_META[id].swatch }} />
              {SCENE_META[id].label}
            </button>
          ))}
        </div>
      </div>
      <fieldset className={styles.row} style={{ border: 0, margin: 0 }}>
        <legend className={styles.label} style={{ float: 'left', padding: 0 }}>Scene motion</legend>
        <div className={`${styles.control} row`}>
          {([['system', 'Follow system'], ['full', 'Full'], ['reduced', 'Reduced']] as Array<[MotionPref, string]>).map(([v, label]) => (
            <label key={v} className="check"><input type="radio" name="motion" value={v} checked={fs.motion === v} onChange={() => set({ motion: v })} /> {label}</label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
