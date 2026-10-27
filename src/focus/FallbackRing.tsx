import styles from './FocusMode.module.css';
import type { ScenePhase } from './scenes/types';

/** Plain progress ring shown when no scene engine can run (FOCUS_PLAN §6.3). */
export function FallbackRing({ progress, phase }: { progress: number; phase: ScenePhase }) {
  const r = 90;
  const c = 2 * Math.PI * r;
  const p = phase === 'complete' ? 1 : Math.max(0, Math.min(1, progress));
  const color = phase === 'break' ? 'var(--sky-moon)' : phase === 'complete' ? 'var(--sky-afterglow)' : 'var(--focus-accent)';
  return (
    <div className={styles.fallback}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
        <circle cx="100" cy="100" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${p * c} ${c}`} transform="rotate(-90 100 100)" opacity={phase === 'paused' ? 0.5 : 1} />
      </svg>
    </div>
  );
}
