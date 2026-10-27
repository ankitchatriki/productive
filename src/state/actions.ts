import type { ActiveTimer, AppData, BlockChoice, Course, DateKey, FocusSettings, FocusTarget, Goal, Id, IsoInstant, SceneId, ScheduledBlock, Section, Settings, TimeEntry, WeekKey, WeekPlan } from '../domain/types';

export type Action =
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'course/add'; course: Course }
  | { type: 'course/update'; id: Id; patch: Partial<Omit<Course, 'id'>> }
  | { type: 'course/delete'; id: Id }                       // reducer no-ops if entries exist
  | { type: 'section/addMany'; sections: Section[] }
  | { type: 'section/update'; id: Id; patch: Partial<Omit<Section, 'id' | 'courseId'>> }
  | { type: 'section/move'; id: Id; direction: -1 | 1 }
  | { type: 'section/delete'; id: Id }
  | { type: 'section/setDone'; id: Id; done: boolean; now: IsoInstant }
  | { type: 'entry/add'; entry: TimeEntry }
  | { type: 'entry/update'; entry: TimeEntry }
  | { type: 'entry/delete'; id: Id }
  | { type: 'timer/start'; timer: ActiveTimer }
  | { type: 'timer/stop'; now: IsoInstant; newEntryId: Id } // creates entry per 4.7
  | { type: 'timer/switch'; now: IsoInstant; newEntryId: Id; next: Omit<ActiveTimer, 'startedAt'> }
  | { type: 'plan/ensure'; weekStart: WeekKey; now: IsoInstant }
  | { type: 'plan/update'; weekStart: WeekKey; patch: Partial<Omit<WeekPlan, 'weekStart'>>; now: IsoInstant }
  | { type: 'plan/assignSection'; weekStart: WeekKey; date: DateKey; sectionId: Id | null }
  | { type: 'plan/shiftFrom'; date: DateKey; sectionId: Id }
  | { type: 'block/upsert'; weekStart: WeekKey; block: ScheduledBlock }
  | { type: 'block/delete'; weekStart: WeekKey; id: Id }
  | { type: 'data/replace'; data: AppData }
  // Targeted undo actions (reverse only their own change; see review R1).
  | { type: 'timer/restore'; timer: ActiveTimer; removeEntryId: Id | null }
  | { type: 'section/restore'; record: SectionDeleteRecord }
  | { type: 'plan/insertGoal'; weekStart: WeekKey; goal: Goal; index: number; now: IsoInstant }
  | { type: 'plan/fillDays'; weekStart: WeekKey; sectionByDay: Record<DateKey, Id | null> }
  // Focus mode (FOCUS_PLAN.md §5.2)
  | { type: 'focus/start'; now: IsoInstant; id: Id; target: FocusTarget; blockMinutes: number | null; targetMs?: number | null;
      choice: BlockChoice['kind']; scene: SceneId; immersive: boolean }
  | { type: 'focus/pause'; now: IsoInstant; newEntryId: Id }
  | { type: 'focus/resume'; now: IsoInstant }
  | { type: 'focus/complete'; at: IsoInstant }
  | { type: 'focus/extend'; now: IsoInstant; minutes: number }
  | { type: 'focus/nextBlock'; now: IsoInstant; blockMinutes?: number | null }
  | { type: 'focus/startBreak'; now: IsoInstant; stopAt: IsoInstant; newEntryId: Id; minutes: number }
  | { type: 'focus/extendBreak'; minutes: number }
  | { type: 'focus/setImmersive'; immersive: boolean }
  | { type: 'focus/setScene'; scene: SceneId }
  | { type: 'focus/end' }
  | { type: 'focus/settings'; patch: Partial<FocusSettings> };

/** What a section delete changed, so Undo can put back exactly that. */
export interface SectionDeleteRecord {
  section: Section;
  entryIds: Id[];
  blocks: Array<{ weekStart: WeekKey; blockId: Id }>;
  days: Array<{ weekStart: WeekKey; date: DateKey }>;
  timer: boolean;
}                // import, reset, undo-restore, cross-tab sync
