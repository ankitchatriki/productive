import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import styles from './BlockPicker.module.css';
import { Modal } from '../components/Modal';
import { useStore } from '../state/store';
import { clampBlockMinutes, plannedBlockNow } from '../domain/focus';
import { blockOptions, choiceFor, optionKeyFor, type OptionKey } from './blockOptions';
import { colorVar } from '../domain/colors';
import type { BlockChoice, SceneId } from '../domain/types';
import { SCENE_IDS } from './scenes/ids';
import { SCENE_META } from './scenes/meta';

export interface PickerResult { choice: BlockChoice; scene: SceneId; justTrack: boolean }

interface BlockPickerProps {
  open: boolean;
  /** 'attach' = a plain timer is already running (no "Just track"). */
  mode: 'start' | 'attach';
  targetLabel: string;
  onStart: (r: PickerResult) => void;
  onClose: () => void;
}

export function BlockPicker({ open, mode, targetLabel, onStart, onClose }: BlockPickerProps) {
  const data = useStore();
  const fs = data.settings.focus;
  const planned = useMemo(() => (open ? plannedBlockNow(data, new Date()) : null), [open, data]);
  const plannedCourse = planned ? data.courses.find((c) => c.id === planned.block.courseId) : undefined;
  const [sel, setSel] = useState<OptionKey>('50');
  const [custom, setCustom] = useState('40');
  const [customErr, setCustomErr] = useState('');
  const [scene, setScene] = useState<SceneId>(fs.scene);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const k = optionKeyFor(fs.lastChoice, !!planned, fs.defaultBlockMinutes);
    setSel(k);
    setCustom(String(fs.lastChoice.kind === 'custom' ? fs.lastChoice.minutes : k === 'custom' ? fs.defaultBlockMinutes : 40));
    setCustomErr('');
    setScene(fs.scene);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const options = blockOptions(data, new Date()).map((o) => ({
    ...o,
    node: o.key === '25' || o.key === '50' || o.key === '90'
      ? <><span className={styles.num}>{o.label}</span><span className={styles.unit}>min</span></>
      : o.key === 'planned'
        ? <>Until <span className={styles.num}>{o.label.replace('Until ', '')}</span> · {plannedCourse?.name ?? 'planned'} <span className={styles.unit}>({o.minutes} min)</span></>
        : o.key === 'custom' ? <>✎ Custom</> : <>∞ No limit</>,
  }));

  const customMinutes = Number(custom);
  const customValid = Number.isInteger(customMinutes) && customMinutes >= 5 && customMinutes <= 240;
  const canStart = sel !== 'custom' || customValid;

  const choice = (): BlockChoice => choiceFor(sel, clampBlockMinutes(customMinutes));
  const start = (justTrack = false) => {
    if (!justTrack && !canStart) { setCustomErr('Enter whole minutes from 5 to 240.'); return; }
    onStart({ choice: choice(), scene, justTrack });
  };

  const onGroupKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.key === sel);
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start(); return; }
    else return;
    e.preventDefault();
    setSel(options[next].key);
    groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  const startLabel = sel === 'open' ? 'Start focus' : sel === 'custom' ? `Start focus · ${customValid ? customMinutes : '–'} min` : sel === 'planned' ? `Start focus · ${planned?.minutesLeft ?? ''} min` : `Start focus · ${sel} min`;

  return (
    <Modal open={open} onClose={onClose} title="Focus block" size="md" initialFocusSelector='[role="radio"][aria-checked="true"]'
      footer={
        <div className={styles.footer} style={{ width: '100%' }}>
          {mode === 'start' && <button type="button" className="btn btn-ghost" onClick={() => start(true)}>Just track</button>}
          <span className={styles.spacer} />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => start()} disabled={!canStart}>▶ {startLabel}</button>
        </div>
      }>
      <p className={styles.target}><span className="truncate">{targetLabel}</span></p>
      <fieldset className={styles.fieldset}>
        <legend className={`section-title ${styles.legend}`}>Block length</legend>
        <div ref={groupRef} role="radiogroup" aria-label="Block length" className={styles.chips} onKeyDown={onGroupKey}>
          {options.map((o) => (
            <button key={o.key} type="button" role="radio" aria-checked={sel === o.key} aria-label={o.aria} tabIndex={sel === o.key ? 0 : -1}
              className={`${styles.chip} ${o.key === 'planned' ? styles.planned : ''}`} style={o.key === 'planned' ? { ['--c' as string]: colorVar(plannedCourse?.color) } : undefined}
              onClick={() => setSel(o.key)}>
              {o.node}
            </button>
          ))}
        </div>
        {sel === 'custom' && (
          <div className={styles.custom}>
            <label htmlFor="custom-minutes" className="label">Custom minutes</label>
            <input id="custom-minutes" className="input input-num" inputMode="numeric" value={custom} aria-invalid={!customValid || undefined}
              onChange={(e) => { setCustom(e.target.value.replace(/[^\d]/g, '')); setCustomErr(''); }}
              onBlur={() => { if (custom !== '') setCustom(String(clampBlockMinutes(Number(custom)))); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); start(); } }} />
            {(customErr || !customValid) && <span className="error">{customErr || 'Enter whole minutes from 5 to 240.'}</span>}
          </div>
        )}
      </fieldset>
      <fieldset className={styles.fieldset}>
        <legend className={`section-title ${styles.legend}`}>Scene</legend>
        <div className={styles.scenes} role="radiogroup" aria-label="Scene">
          {SCENE_IDS.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={scene === id} className={`${styles.chip} ${styles.scene}`} onClick={() => setScene(id)} title={SCENE_META[id].description}>
              <span className={styles.swatch} style={{ background: SCENE_META[id].swatch }} aria-hidden="true" />
              {SCENE_META[id].label}
            </button>
          ))}
        </div>
      </fieldset>
    </Modal>
  );
}
