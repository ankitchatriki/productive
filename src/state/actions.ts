import type { ActiveTimer, AppData, Course, DateKey, Goal, Id, IsoInstant, ScheduledBlock, Section, Settings, TimeEntry, WeekKey, WeekPlan } from '../domain/types';

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
  | { type: 'plan/fillDays'; weekStart: WeekKey; sectionByDay: Record<DateKey, Id | null> };

/** What a section delete changed, so Undo can put back exactly that. */
export interface SectionDeleteRecord {
  section: Section;
  entryIds: Id[];
  blocks: Array<{ weekStart: WeekKey; blockId: Id }>;
  days: Array<{ weekStart: WeekKey; date: DateKey }>;
  timer: boolean;
}                // import, reset, undo-restore, cross-tab sync
