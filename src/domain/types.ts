// Domain types — copied verbatim from docs/PLAN.md §2.
export type Id = string;
export type IsoInstant = string;   // "2026-10-26T14:03:00.000Z"
export type DateKey = string;      // "2026-10-26" (local)
export type WeekKey = DateKey;     // always a Monday
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Mon..Sun

export interface Course {
  id: Id;
  name: string;            // "Organic Chemistry"
  color: string;           // one of COURSE_COLORS (8 fixed hex values in domain/colors.ts)
  archived: boolean;       // archived courses are hidden from pickers but kept in history
  createdAt: IsoInstant;
}

export interface Section {
  id: Id;
  courseId: Id;
  title: string;                   // "Ch 4 – Stereochemistry"
  order: number;                   // 0-based position within course; contiguous after any reorder/delete
  estimatedMinutes: number | null; // optional estimate, used for a progress bar only
  completedAt: IsoInstant | null;  // non-null === done
  notes: string;                   // free text, default ""
}
// Derived (never stored): status = completedAt ? 'done' : loggedMinutes > 0 ? 'in_progress' : 'todo'
export type SectionStatus = 'todo' | 'in_progress' | 'done';

export interface TimeEntry {
  id: Id;
  courseId: Id;              // required — every minute bills to a course
  sectionId: Id | null;      // optional — null = general work on the course
  start: IsoInstant;
  end: IsoInstant;           // end > start, end <= now, (end - start) <= 16h
  note: string;              // default ""
  source: 'timer' | 'manual';
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface ActiveTimer {
  courseId: Id;
  sectionId: Id | null;
  startedAt: IsoInstant;
  note: string;
}

export interface ScheduledBlock {
  id: Id;
  date: DateKey;             // must fall within its WeekPlan's week
  startMin: number;          // minutes after local midnight, multiple of 15
  endMin: number;            // > startMin, <= 1440, multiple of 15
  courseId: Id;
  sectionId: Id | null;
  label: string;             // optional display text, default ""
}

export type Goal =
  | { id: Id; kind: 'totalHours'; targetMinutes: number }
  | { id: Id; kind: 'courseHours'; courseId: Id; targetMinutes: number }
  | { id: Id; kind: 'sectionsCompleted'; courseId: Id | null; targetCount: number } // null = any course
  | { id: Id; kind: 'dailyGoalDays'; targetCount: number };

export interface WeekPlan {
  weekStart: WeekKey;
  dailyGoalMinutes: number;               // snapshot of settings at creation; editable on Plan page
  restDays: Weekday[];                    // snapshot of settings at creation; editable on Plan page
  goals: Goal[];
  sectionByDay: Record<DateKey, Id | null>; // exactly the 7 dates of the week as keys
  blocks: ScheduledBlock[];
  reviewNote: string;                     // end-of-week reflection, default ""
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface Settings {
  dailyGoalMinutes: number;   // default 480
  restDays: Weekday[];        // default [] (user can pick e.g. [6] for Sunday)
  gridStartHour: number;      // default 6  (week grid visible range)
  gridEndHour: number;        // default 24
  onboarded: boolean;         // default false
}

export interface AppData {
  schemaVersion: 1;
  settings: Settings;
  courses: Course[];
  sections: Section[];
  entries: TimeEntry[];
  weekPlans: Record<WeekKey, WeekPlan>;
  activeTimer: ActiveTimer | null;
}

export interface GoalProgress {
  goalId: Id;
  current: number;          // minutes or count, same unit as target
  target: number;
  ratio: number;            // current / target, clamped to [0, 1] for display
  status: 'met' | 'on_track' | 'behind' | 'missed';
}
