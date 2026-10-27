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
  showSplash: boolean;        // default true (StruggleMore §2: opening quote)
  focus: FocusSettings;       // round 2 (schema v2)
}

export interface AppData {
  schemaVersion: 2;
  settings: Settings;
  courses: Course[];
  sections: Section[];
  entries: TimeEntry[];
  weekPlans: Record<WeekKey, WeekPlan>;
  activeTimer: ActiveTimer | null;
  focus: FocusSession | null;
}

// ---------- Focus mode (docs/FOCUS_PLAN.md §4) ----------

/** Scene ids from the registry (STRUGGLEMORE_DESIGN §3.1): Sisyphus (default) and Daylight. */
export type SceneId = 'sisyphus' | 'daylight';

export type FocusPhase = 'focus' | 'paused' | 'complete' | 'break';

export type BlockChoice =
  | { kind: 'preset'; minutes: 25 | 50 | 90 }
  | { kind: 'custom'; minutes: number }   // integer 5..240
  | { kind: 'planned' }                    // "until my planned block ends"
  | { kind: 'open' };                      // no block length

export interface FocusTarget {
  courseId: Id;
  sectionId: Id | null;
  note: string;
}

export interface FocusSession {
  id: Id;
  target: FocusTarget;
  choice: BlockChoice['kind'];
  blockMinutes: number | null;         // null = open-ended; the chosen block length (kept through extends)
  /** Exact target for the current block in focus ms, when it differs from blockMinutes (extend, planned "Until"). */
  targetMs?: number | null;
  /** Minutes added with +N to the current block (shown as "· +N"). */
  extendedMinutes?: number;
  blockStartedAt: IsoInstant;
  focusedMsBefore: number;             // focus ms banked in this block before the current segment
  segmentStartedAt: IsoInstant | null; // null in 'paused' and 'break'
  phase: FocusPhase;
  completedAt: IsoInstant | null;
  pausedAt: IsoInstant | null;
  breakMinutes: number | null;
  breakStartedAt: IsoInstant | null;
  breakEndsAt: IsoInstant | null;
  blocksCompleted: number;
  scene: SceneId;
  immersive: boolean;
}

export type MotionPref = 'system' | 'full' | 'reduced';

export interface FocusSettings {
  defaultBlockMinutes: number;       // default 50; integer 5..240
  lastChoice: BlockChoice;           // default { kind: 'preset', minutes: 50 }
  askBlockEachTime: boolean;         // default true
  enterOnClockIn: boolean;           // default true
  breakMinutes: number;              // default 10; integer 1..60
  chime: boolean;                    // default true
  scene: SceneId;                    // default 'sisyphus'
  motion: MotionPref;                // default 'system'
}

export interface GoalProgress {
  goalId: Id;
  current: number;          // minutes or count, same unit as target
  target: number;
  ratio: number;            // current / target, clamped to [0, 1] for display
  status: 'met' | 'on_track' | 'behind' | 'missed';
}
