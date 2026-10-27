// The block-length options shared by the picker modal and Today's inline chips (FOCUS_PLAN §3.1). Pure.
import type { AppData, BlockChoice } from '../domain/types';
import { BLOCK_PRESETS, plannedBlockNow } from '../domain/focus';
import { minToHHMM } from '../domain/time';

export type OptionKey = '25' | '50' | '90' | 'planned' | 'custom' | 'open';

export interface BlockOption {
  key: OptionKey;
  label: string;
  aria: string;
  /** Course id of the planned block (for its colour edge). */
  courseId?: string;
  minutes: number | null;
}

export function blockOptions(data: Pick<AppData, 'weekPlans' | 'courses'>, now: Date): BlockOption[] {
  const planned = plannedBlockNow(data, now);
  const opts: BlockOption[] = BLOCK_PRESETS.map((m) => ({ key: String(m) as OptionKey, label: `${m}`, aria: `${m} minutes`, minutes: m }));
  if (planned) {
    const course = data.courses.find((c) => c.id === planned.block.courseId);
    const end = minToHHMM(planned.block.endMin);
    opts.push({ key: 'planned', label: `Until ${end}`, aria: `Until ${end}, planned ${course?.name ?? ''}, ${planned.minutesLeft} minutes`, courseId: planned.block.courseId, minutes: planned.minutesLeft });
  }
  opts.push({ key: 'custom', label: 'Custom', aria: 'Custom length', minutes: null });
  opts.push({ key: 'open', label: '∞', aria: 'No limit, open-ended', minutes: null });
  return opts;
}

/** Which option a stored choice selects (planned falls back to the default length when no block is active). */
export function optionKeyFor(choice: BlockChoice, plannedAvailable: boolean, fallback: number): OptionKey {
  if (choice.kind === 'preset') return String(choice.minutes) as OptionKey;
  if (choice.kind === 'custom') return 'custom';
  if (choice.kind === 'open') return 'open';
  if (plannedAvailable) return 'planned';
  return (BLOCK_PRESETS as readonly number[]).includes(fallback) ? (String(fallback) as OptionKey) : 'custom';
}

export function choiceFor(key: OptionKey, customMinutes: number): BlockChoice {
  if (key === '25' || key === '50' || key === '90') return { kind: 'preset', minutes: Number(key) as 25 | 50 | 90 };
  if (key === 'custom') return { kind: 'custom', minutes: customMinutes };
  if (key === 'planned') return { kind: 'planned' };
  return { kind: 'open' };
}

/** "Planned now · OChem until 15:00" / "Next · LinAlg at 16:00" / null. */
export function plannedLine(data: Pick<AppData, 'weekPlans' | 'courses'>, now: Date, todayKey: string, weekStart: string): string | null {
  const plan = data.weekPlans[weekStart];
  if (!plan) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const blocks = plan.blocks.filter((b) => b.date === todayKey).sort((a, b) => a.startMin - b.startMin);
  const name = (id: string) => data.courses.find((c) => c.id === id)?.name ?? 'Course';
  const cur = blocks.filter((b) => b.startMin <= nowMin && nowMin < b.endMin).pop();
  if (cur) return `Planned now · ${name(cur.courseId)} until ${minToHHMM(cur.endMin)}`;
  const next = blocks.find((b) => b.startMin > nowMin);
  return next ? `Next · ${name(next.courseId)} at ${minToHHMM(next.startMin)}` : null;
}
