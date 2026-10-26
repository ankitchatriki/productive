import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './SettingsPage.module.css';
import { useDispatch, useStorageInfo, useStore } from '../state/store';
import { useUi } from '../state/ui';
import { useToast } from '../hooks/useToast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { exportJson, importJson } from '../storage/json';
import { emptyAppData } from '../storage/defaults';
import { defaultGoals } from '../domain/goals';
import { goalsAreDefault } from '../domain/plan';
import { WEEKDAY_SHORT, formatDuration, toDateKey, weekStartOf } from '../domain/time';
import type { AppData, Settings, Weekday } from '../domain/types';
import { downloadText } from '../utils/download';
import { DurationInput } from '../components/DurationInput';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';

function hourLabel(h: number) {
  if (h === 24) return 'Midnight';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2020, 0, 1, h));
}

export function SettingsPage() {
  useDocumentTitle('Settings');
  const data = useStore();
  const dispatch = useDispatch();
  const ui = useUi();
  const toast = useToast();
  const navigate = useNavigate();
  const { storage } = useStorageInfo();
  const fileRef = useRef<HTMLInputElement>(null);
  const s = data.settings;
  const ws = weekStartOf(toDateKey(new Date()));
  const plan = data.weekPlans[ws];

  const [applyAsk, setApplyAsk] = useState<Pick<Settings, 'dailyGoalMinutes' | 'restDays'> | null>(null);
  const [importState, setImportState] = useState<{ data: AppData; warnings: string[]; name: string } | null>(null);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');

  const changeGoalSettings = (patch: Partial<Pick<Settings, 'dailyGoalMinutes' | 'restDays'>>) => {
    dispatch({ type: 'settings/update', patch });
    const next = { dailyGoalMinutes: patch.dailyGoalMinutes ?? s.dailyGoalMinutes, restDays: patch.restDays ?? s.restDays };
    if (plan && (plan.dailyGoalMinutes !== next.dailyGoalMinutes || plan.restDays.join() !== next.restDays.join())) setApplyAsk(next);
  };
  const applyToThisWeek = () => {
    if (!plan || !applyAsk) return;
    const patch: Partial<typeof plan> = { dailyGoalMinutes: applyAsk.dailyGoalMinutes, restDays: [...applyAsk.restDays] };
    if (goalsAreDefault(plan)) patch.goals = defaultGoals(ws, applyAsk.dailyGoalMinutes, applyAsk.restDays);
    dispatch({ type: 'plan/update', weekStart: ws, patch, now: new Date().toISOString() });
    setApplyAsk(null);
    toast.show("Applied to this week's plan.");
  };
  const toggleRest = (d: Weekday) => {
    const restDays = (s.restDays.includes(d) ? s.restDays.filter((x) => x !== d) : [...s.restDays, d]).sort() as Weekday[];
    if (restDays.length > 6) return;
    changeGoalSettings({ restDays });
  };

  const exportData = () => {
    downloadText(`productive-backup-${toDateKey(new Date())}.json`, exportJson(data), 'application/json');
    toast.show('Backup exported.');
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const r = importJson(text);
    if ('errors' in r) { setImportErrors(r.errors); setImportState(null); }
    else { setImportErrors(null); setImportState({ ...r, name: file.name }); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const confirmImport = () => {
    if (!importState) return;
    dispatch({ type: 'data/replace', data: importState.data });
    toast.show(`Imported ${importState.data.entries.length} entries from ${importState.name}.`);
    setImportState(null);
  };
  const reset = () => {
    dispatch({ type: 'data/replace', data: emptyAppData() });
    setResetOpen(false);
    setResetText('');
    navigate('/welcome');
  };

  const kb = Math.max(1, Math.round(storage.approxBytes() / 1024));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Everything is stored in this browser. Export a backup now and then.</p>
        </div>
      </div>

      <div className={styles.wrap}>
        <section className={styles.group} aria-labelledby="g-goals">
          <h2 id="g-goals" className="section-title">Goals</h2>
          <div className={styles.row}>
            <div><label htmlFor="set-goal" className={styles.label}>Daily goal</label><p className="help">Default for new weeks. Past weeks keep their own goal.</p></div>
            <div className={styles.control}><DurationInput id="set-goal" value={s.dailyGoalMinutes} step={15} min={15} max={24 * 60} ariaLabel="daily goal" onCommit={(m) => m && changeGoalSettings({ dailyGoalMinutes: m })} /></div>
          </div>
          <div className={styles.row}>
            <div><span className={styles.label} id="set-rest">Default rest days</span><p className="help">Pressed = rest day. Rest days don't break your streak.</p></div>
            <div className={`daychips ${styles.control}`} role="group" aria-labelledby="set-rest">
              {WEEKDAY_SHORT.map((w, i) => (
                <button key={w} type="button" className="daychip" aria-pressed={s.restDays.includes(i as Weekday)} onClick={() => toggleRest(i as Weekday)}>{w}</button>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.group} aria-labelledby="g-display">
          <h2 id="g-display" className="section-title">Week grid</h2>
          <div className={styles.row}>
            <div><span className={styles.label}>Visible hours</span><p className="help">Range shown on Plan week and Today's timeline.</p></div>
            <div className={`${styles.control} row`} style={{ flexWrap: 'nowrap' }}>
              <label htmlFor="grid-start" className="visually-hidden">Grid start</label>
              <select id="grid-start" className="select" value={s.gridStartHour} onChange={(e) => dispatch({ type: 'settings/update', patch: { gridStartHour: Number(e.target.value) } })}>
                {Array.from({ length: 24 }, (_, h) => h).filter((h) => h < s.gridEndHour).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
              <span className="muted">to</span>
              <label htmlFor="grid-end" className="visually-hidden">Grid end</label>
              <select id="grid-end" className="select" value={s.gridEndHour} onChange={(e) => dispatch({ type: 'settings/update', patch: { gridEndHour: Number(e.target.value) } })}>
                {Array.from({ length: 24 }, (_, h) => h + 1).filter((h) => h > s.gridStartHour).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className={styles.group} aria-labelledby="g-data">
          <h2 id="g-data" className="section-title">Data</h2>
          <div className={styles.row}>
            <div><span className={styles.label}>Export all data (JSON)</span><p className="help">Storage used: <span className="num">~{kb} KB</span> · {data.entries.length} entries</p></div>
            <div className={styles.control}><button type="button" className="btn" onClick={exportData}><Icon name="download" /> Export</button></div>
          </div>
          <div className={styles.row}>
            <div><label htmlFor="import-file" className={styles.label}>Import data</label><p className="help">Replaces everything with a backup file.</p></div>
            <div className={styles.control}>
              <input ref={fileRef} id="import-file" type="file" accept="application/json,.json" className="visually-hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Import…</button>
            </div>
          </div>
          {importErrors && (
            <div className="banner banner-danger" role="alert">
              <div className="banner-text">
                <strong>That file can't be imported. Nothing was changed.</strong>
                <ul className={styles.errors}>{importErrors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>
                {importErrors.length > 8 && <p>…and {importErrors.length - 8} more.</p>}
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setImportErrors(null)}>Dismiss</button>
            </div>
          )}
          <div className={styles.row}>
            <div><span className={styles.label}>Reset all data</span><p className="help">Deletes courses, entries and plans from this browser.</p></div>
            <div className={styles.control}><button type="button" className="btn btn-danger-ghost" onClick={() => setResetOpen(true)}><Icon name="trash" /> Reset…</button></div>
          </div>
        </section>

        <section className={styles.group} aria-labelledby="g-kb">
          <h2 id="g-kb" className="section-title">Keyboard</h2>
          <div className={styles.row}>
            <div><span className={styles.label}>View shortcuts</span><p className="help">Press <kbd>?</kbd> anywhere.</p></div>
            <div className={styles.control}><button type="button" className="btn" onClick={ui.openShortcuts}><Icon name="keyboard" /> Open</button></div>
          </div>
        </section>
      </div>

      <ConfirmDialog open={!!applyAsk} title="Also apply to this week?" confirmLabel="Apply to this week" onCancel={() => setApplyAsk(null)} onConfirm={applyToThisWeek}>
        <p>Future weeks will use {applyAsk ? formatDuration(applyAsk.dailyGoalMinutes) : ''} a day{applyAsk && applyAsk.restDays.length ? ` with ${applyAsk.restDays.map((d) => WEEKDAY_SHORT[d]).join(', ')} off` : ''}. This week's plan currently uses {plan ? formatDuration(plan.dailyGoalMinutes) : ''} a day. Past weeks are not changed.</p>
      </ConfirmDialog>

      <ConfirmDialog open={!!importState} title="Replace all data?" confirmLabel="Replace data" danger onCancel={() => setImportState(null)} onConfirm={confirmImport}>
        <p>This replaces all current data with <strong>{importState?.name}</strong>: {importState?.data.courses.length} courses, {importState?.data.sections.length} sections, {importState?.data.entries.length} entries.</p>
        {importState && importState.warnings.length > 0 && (
          <div className="banner banner-behind"><div className="banner-text"><strong>Warnings</strong><ul className={styles.errors}>{importState.warnings.slice(0, 6).map((w) => <li key={w}>{w}</li>)}</ul></div></div>
        )}
      </ConfirmDialog>

      <ConfirmDialog open={resetOpen} title="Reset all data?" confirmLabel="Reset all data" danger confirmDisabled={resetText !== 'RESET'}
        onCancel={() => { setResetOpen(false); setResetText(''); }} onConfirm={reset}>
        <p>This permanently deletes every course, section, entry and plan in this browser. Export a backup first if you might need it.</p>
        <div className="field">
          <label htmlFor="reset-confirm">Type <strong>RESET</strong> to confirm</label>
          <input id="reset-confirm" className="input" value={resetText} onChange={(e) => setResetText(e.target.value)} autoComplete="off" />
        </div>
      </ConfirmDialog>
    </div>
  );
}
