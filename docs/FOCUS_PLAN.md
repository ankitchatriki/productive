# Productive — Focus Mode & One-Screen Today (round 2 plan)

Owner: planner. Audience: coder (follows this literally), designer, reviewer.
Companion: `docs/FOCUS_DESIGN.md` (designer) owns **visuals**: scene art, animation, colours, typography, layout geometry. This document owns **behaviour, data, code structure and acceptance criteria**. Where the two touch (scene ids, the Today grid), this plan states constraints and the design doc fills them in. If they conflict on behaviour, this plan wins; on looks, the design doc wins.

Everything in `docs/PLAN.md` still holds unless changed here. Dependency rule unchanged: **no new npm packages** — scenes are hand-written Canvas 2D (or raw WebGL if the design doc asks), chime is synthesized with Web Audio (no audio files).

---

## 1. The request, restated

> "Every card should be visible, and then when I start studying everything should disappear and I want you to add an animation, a really cool animation … ice, fire, sun… and allow me to set time blocks as well."

1. **One-screen Today.** At desktop size Today shows every card with no page scroll.
2. **Focus mode.** Clocking in opens a full-screen overlay; the app UI disappears; an immersive time-lapse scene (ice melting, fire burning down, sun crossing the sky, …) shows the current block passing.
3. **Time blocks.** The user picks a block length when starting, and the app guides them through block → break → block.

### User stories

- **U1** As a student, when I clock in I pick how long this push is (25 / 50 / 90 min, until my planned block ends, a custom length, or open-ended), and my last choice is pre-selected so Enter starts it.
- **U2** While I study, I see only the scene, a countdown and what I'm working on. The controls fade away when I don't touch anything.
- **U3** When the block ends I hear a soft chime and choose: keep going, extend a few minutes, take a break, or clock out.
- **U4** Breaks count down too, but they are **not** logged as study time.
- **U5** I can pause (the phone rings). My timecard must not claim I studied while paused.
- **U6** I can leave the overlay without stopping; the timer keeps running and the nav pill shows it. One click brings the scene back.
- **U7** If I reload or close the tab, I come back to the same block, at the right progress.
- **U8** I can choose a scene, mute the chime and turn motion down in Settings.
- **U9** On my laptop I can see the whole Today page — timer, ring, section, plan, logged entries, week — at once.

---

## 2. Decisions (the short version)

| Question | Decision | Why |
|---|---|---|
| Does clocking in always go through the block picker? | **Yes** for the Clock in button, `Space` and the sidebar "Clock in". The picker opens with the last choice focused, so `Space` → `Enter` (or `Space` `Space`) starts. A setting `askBlockEachTime` (default `true`) lets the user skip the picker and use the remembered choice directly. | The user asked for time blocks on start; one extra keypress is the price. |
| Does starting always open the overlay? | Yes when `settings.focus.enterOnClockIn` is `true` (default). The picker also has a **"Just track"** option that starts the timer with no focus session and no overlay (v1 behaviour). | Some sessions (admin, reading on paper) don't want an immersive screen. |
| **Pause** | **Pause = clock out of the current entry; Resume = a new entry** for the same course/section/note. The focus session remembers how much of the block was already done, so block progress freezes during the pause and continues on resume. | A `TimeEntry` is one contiguous interval billed as study (PLAN 2, 4.6). A paused timer that later produced one long entry would bill the pause. Splitting keeps the timecard truthful, reuses the existing `timer/stop` logic (overlap trimming, <60 s discard) and needs no new field on `TimeEntry`. |
| **Breaks** | **Not logged.** Taking a break clocks out; the break is a countdown only. Starting the next block clocks in again (new entry). | Breaks are not study; Timecard/goals/streaks stay "time actually studied". |
| Block end with nobody at the keyboard | The **timer keeps running** past the end (phase `complete`, overtime shown). When the user then picks *Take a break* or *Clock out* after ≥ 2 min of overtime, they choose **"Stop at block end (14:50)"** or **"Stop now (14:57)"**. | Auto-stopping would lose real work; silently billing overtime might bill a walk to the kitchen. The user decides, with the exact instant offered. |
| Keep going | Starts a **new block of the same length from now**, same entry (no new entry, no gap). | Most natural "one more". |
| Extend +N | The current block becomes "N minutes from now" (`+5`, `+10`, `+15`). Same entry. | "Extend" means more time from where I am, not from where the block ended. |
| Open-ended | `blockMinutes = null`. No completion, no chime. Scene progress loops gently every 60 focused minutes (`open` phase; the design doc decides how a loop looks). Countdown shows elapsed instead. | Users who don't want a block still get the scene. |
| Leave overlay | `Esc` (or the ✕ button) hides the overlay; timer and session keep going; pill shows block remaining; clicking the pill (or Today's "Back to focus") reopens it. | U6. |
| Reload/close | Session is persisted in `AppData` next to `activeTimer`; overlay visibility is persisted too. All progress is derived from stored instants, so it is exact after reload. | U7. |
| Stale session on load | A session in `paused` or `break` whose `pausedAt` / `breakEndsAt` is more than **6 h** old is discarded on load (no data loss — nothing is running). | Don't greet tomorrow-me with yesterday's break. |
| Midnight | Nothing special: entries already split at midnight in aggregation; blocks are durations, not calendar slots. "Until my planned block ends" never crosses midnight because blocks end ≤ 24:00. | — |
| 10h banner | Unchanged rule (current entry ≥ 10 h) on Today. In focus mode a small non-modal notice appears in the HUD with the same "Stop at last activity…" action (exits overlay and opens the Entry dialog). Because pause/resume creates new entries, the rule applies to the current entry only. | Same truth rule everywhere. |

---

## 3. The flow, exactly

### 3.1 Clock in → block picker

Triggered by: Today's **Clock in** button, global `Space` (when no timer and no paused/break session), the nav's idle **Clock in**, and "Start focus" on Today while a plain timer is already running (§3.8).

`BlockPicker` is a `Modal` titled "Focus block" showing:

1. Target line: course · section (from Today's pickers / `effectiveTarget`). Not editable here (edit on Today).
2. **Options** (a radio group, arrow keys move, roving tabindex):
   - `25 min`, `50 min`, `90 min` (presets; fixed values).
   - **"Until 15:00 (planned)"** — shown only when `plannedBlockNow(data, now)` returns a block with ≥ 5 min left. Label uses the block's end time and course name: "Until 15:00 · Organic Chemistry (38 min)".
   - **Custom** — a number input, minutes, integer 5–240 (clamped on blur; invalid → inline error, Start disabled).
   - **Open-ended** — "No block, just focus".
3. Scene choice: a row of scene chips (ids from the scene registry, §6.3), defaulting to `settings.focus.scene`. Choosing one here also saves it as the new default.
4. Buttons: **Start** (primary, default; `Enter`), **Just track** (starts the timer with no focus session), **Cancel**.

Pre-selection = `settings.focus.lastChoice`. If `lastChoice.kind === 'planned'` but no planned block is active now, fall back to `settings.focus.defaultBlockMinutes` preset/custom. On Start, `lastChoice` is saved.

When `askBlockEachTime === false`, `Space`/Clock in skip the picker and start with `lastChoice` (same fallback). The picker is still reachable from Today via a "Block: 50 min ▾" button beside Clock in.

### 3.2 Default target change

`defaultTimerTarget` (src/state/timer.ts) gets a new first rule: if a `ScheduledBlock` for today contains now (`startMin ≤ nowMin < endMin`) and its course is active, the default target is that block's course and `block.sectionId` if set and not done, else today's assigned section if it belongs to the same course, else `null`. Existing rules follow unchanged.

### 3.3 Focus (phase `focus`)

- `activeTimer` runs (a normal v1 timer), `focus.phase = 'focus'`.
- Overlay shows: scene (progress = `blockProgress`), countdown `MM:SS` (or `H:MM:SS`) remaining, course · section, "Block 2" when `blocksCompleted ≥ 1`, controls.
- Controls (always in DOM, visually hidden after 3 s idle): **Pause**, **+5 min**, **Clock out**, **Exit focus view** (✕), **Fullscreen**, **Scene** menu, **Mute**.
- Switch section (`S` in the app, or the Switch dialog) while a session is active: `timer/switch` as v1 (adjacent entries), and the session's `target` updates; block progress is unaffected.

### 3.4 Pause → Resume

- **Pause**: dispatch `focus/pause` — the reducer stops the timer exactly like `timer/stop` (entry created, overlap trimming, <60 s discard), banks `focusedMs`, sets `phase = 'paused'`, `pausedAt = now`. The overlay dims the scene (design doc) and shows "Paused · 12:40 left" + **Resume** (focused) + **Clock out**.
- If the stopped piece was < 60 s, it is discarded as in v1 and the HUD shows "Under a minute — not logged" for 3 s. The banked block progress **still counts** that time (block progress measures focus, not billing) — accepted edge case.
- **Resume**: `focus/resume` — starts a new `activeTimer` with `session.target`, `startedAt = now`; `segmentStartedAt = now`; `phase = 'focus'`.
- **Clock out while paused**: ends the session (`focus/end`); nothing to stop.
- Pausing has no time limit; see stale rule (6 h) for reloads.

### 3.5 Block complete (phase `complete`)

Detected by `FocusController` (§6.1) when `blockRemainingMs ≤ 0`:
- dispatch `focus/complete { at: blockEndsAt(session) }` (the exact computed instant, not "when we noticed").
- chime (if `settings.focus.chime` and the completion was detected within 10 s of `at` — no chime when restoring an old completion after reload).
- aria-live announcement: "Block complete. 50 minutes done."
- Timer **keeps running**. Overlay shows the scene's finished state, "+M:SS over" counting up, and the panel:
  1. **Keep going** (default focus) — `focus/nextBlock { now }` with the same `blockMinutes`; same entry.
  2. **+5 / +10 / +15** — `focus/extend { now, minutes }`.
  3. **Take a break** with a length selector (5 / 10 / 15 / 20, default `settings.focus.breakMinutes`) — `focus/startBreak`.
  4. **Clock out**.
- For 3 and 4, if overtime ≥ 2 min, the button opens an inline two-choice step: "Stop at block end (14:50)" / "Stop now (14:57)". Otherwise stop = now.
- Controls do not auto-hide in `complete`.

### 3.6 Break (phase `break`)

- `focus/startBreak { now, stopAt, newEntryId, minutes }`: stops the timer at `stopAt` (entry as v1), `phase = 'break'`, `breakStartedAt = now`, `breakEndsAt = now + minutes`, `blocksCompleted += 1`.
- Overlay: scene in break mode (`setPhase('break')`, progress = `breakProgress`; design doc decides the look), "Break · 4:12 left", buttons **Start next block now**, **+5 min break**, **Clock out**.
- Break over (`now ≥ breakEndsAt`, detected by `FocusController`): chime (same 10 s rule), announce "Break over.", panel shows **Start next block** (default focus; uses the last block length; the picker's other lengths are offered as small chips) and **Clock out**. Nothing starts automatically; overtime on a break is shown ("+2:10") but costs nothing.
- **Start next block**: `focus/nextBlock { now, blockMinutes? }` — starts a new `activeTimer` (new entry) with `session.target`.
- **Clock out during break**: `focus/end`.
- Break time is never written anywhere except the session (which is discarded at the end).

### 3.7 Clock out (from anywhere)

- From overlay: `Clock out` → (overtime choice if `complete` ≥ 2 min) → `timer/stop` with `now` or `completedAt` → reducer clears `focus`. Overlay unmounts, the existing "Logged 50m to … · Undo" toast appears.
- From the pill / `Space` in the app / Today button: same `timer/stop`; session ends.
- Undo (`timer/restore`) restores the timer only, not the focus session (documented limitation; the user can re-enter focus from Today).

### 3.8 Leaving and re-entering the overlay

- `Esc`, ✕: `focus/setImmersive { immersive: false }`. Route underneath is unchanged. Fullscreen, if on, is exited.
- While a session exists and the overlay is hidden:
  - The **TimerPill** shows on every page **including Today**, with a second line: "18:20 left" (focus), "Paused" (paused), "+3:00 over" (complete), "Break 4:12" (break). Clicking the pill body re-opens the overlay (`immersive: true`) instead of navigating. During `paused`/`break` there is no `activeTimer`, so the pill renders from the session: course dot + state; its button is **Resume** / **Start next block** instead of Stop.
  - Today's timer card shows a **"Back to focus"** button and a slim block progress bar.
  - Global `Space`: running → clock out (v1); paused → resume; break → start next block. `S`, `N`, etc. unchanged.
- A plain (non-focus) running timer can enter focus: Today shows **"Start focus"** beside Clock out → opens `BlockPicker` (without "Just track") → `focus/start` attaches to the running timer; block starts now.

### 3.9 Reload / close during focus

State lives in `AppData.focus` (persisted with the 300 ms debounce + `pagehide` flush). On load:
1. Stale rule (§2) → `focus/end`.
2. Invariant repair in `validateAppData` (§4.4).
3. If `phase === 'focus'` and the block has already finished (`blockRemainingMs ≤ 0`): `FocusController` dispatches `focus/complete { at: blockEndsAt }` on its first tick, **no chime**, and the overlay shows the complete panel with the true overtime.
4. If `immersive`, the overlay mounts immediately (no animation-in). Fullscreen and wake lock are **not** restored (they need a user gesture); a "Fullscreen" control is visible as usual.

### 3.10 Other tabs

Cross-tab sync replaces state (v1 last-writer-wins), so a second tab follows the session. A tab chimes only if it dispatched `focus/complete` itself and the reducer actually changed phase (it ignores `focus/complete` when phase is already `complete`); a tab that receives the completed state through sync stays silent. Break-over chimes follow the same rule using a per-tab ref keyed on `breakEndsAt`, and only in a visible tab.

### 3.11 Keys in focus mode

The overlay has `role="dialog" aria-modal="true"`, so v1 global hotkeys are already suppressed by `shouldIgnoreHotkey`. The overlay registers its own handler (`keydown` on `document`, capture, only while it is the top-most dialog; ignored when focus is in an input):

| Key | focus | paused | complete | break |
|---|---|---|---|---|
| `Space` | Pause | Resume | — (button focus handles it) | — |
| `Enter` | activates focused control (native) | ← | ← | ← |
| `Esc` | Exit overlay (keep timer) | ← | ← | ← |
| `F` | Toggle fullscreen | ← | ← | ← |
| `M` | Mute/unmute chime (toggles `settings.focus.chime`) | ← | ← | ← |
| `E` | +5 min | — | +5 min | +5 min break |
| `K` | — | — | Keep going | Start next block |
| `B` | — | — | Take a break (default length) | — |
| `C` | Clock out | Clock out | Clock out (overtime step if needed) | Clock out |
| `?` | Toggle a small key-hint card | ← | ← | ← |

Any key or pointer move shows the controls. `Space` must `preventDefault()`. If the browser is in fullscreen, the first `Esc` is consumed by the browser (exits fullscreen); that is fine — a second `Esc` exits the overlay.

---

## 4. Data model

### 4.1 New types (`src/domain/types.ts`)

```ts
/** Scene ids come from the registry in src/focus/scenes/index.ts. The designer's FOCUS_DESIGN.md
 *  fixes the final list; until then: */
export type SceneId = 'ice' | 'fire' | 'sun';

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
  target: FocusTarget;               // what resume / next block clocks in to; kept in sync by timer/switch
  choice: BlockChoice['kind'];       // how the current block's length was chosen (display + analytics-free)
  blockMinutes: number | null;       // null = open-ended; integer 1..480 after extends
  blockStartedAt: IsoInstant;        // when the current block began
  focusedMsBefore: number;           // focus ms banked in this block from segments before the current one (pauses)
  segmentStartedAt: IsoInstant | null; // start of the current running segment; null in 'paused' and 'break'
  phase: FocusPhase;
  completedAt: IsoInstant | null;    // exact instant the current block reached 100%; set in 'complete'
  pausedAt: IsoInstant | null;       // set in 'paused'
  breakMinutes: number | null;       // set in 'break'
  breakStartedAt: IsoInstant | null; // set in 'break'
  breakEndsAt: IsoInstant | null;    // set in 'break'; +N extends it
  blocksCompleted: number;           // blocks finished in this session (for "Block 3")
  scene: SceneId;
  immersive: boolean;                // overlay shown
}

export type MotionPref = 'system' | 'full' | 'reduced';

export interface FocusSettings {
  defaultBlockMinutes: number;       // default 50; integer 5..240; used when lastChoice can't apply
  lastChoice: BlockChoice;           // default { kind: 'preset', minutes: 50 }
  askBlockEachTime: boolean;         // default true
  enterOnClockIn: boolean;           // default true — open the overlay when a focus block starts
  breakMinutes: number;              // default 10; integer 1..60
  chime: boolean;                    // default true
  scene: SceneId;                    // default: first id in the registry (design doc decides; 'fire' until then)
  motion: MotionPref;                // default 'system'
}
```

Changes to existing types:

```ts
export interface Settings {
  // …all v1 fields unchanged…
  focus: FocusSettings;
}

export interface AppData {
  schemaVersion: 2;                  // was 1
  // …v1 fields unchanged…
  activeTimer: ActiveTimer | null;
  focus: FocusSession | null;
}
```

### 4.2 Invariants (enforced by reducer, repaired by validation)

- `phase ∈ {'focus','complete'}` ⇔ `activeTimer !== null` and `segmentStartedAt !== null`.
- `phase ∈ {'paused','break'}` ⇔ `activeTimer === null` and `segmentStartedAt === null`.
- `phase === 'paused'` ⇒ `pausedAt !== null`. `phase === 'break'` ⇒ `breakStartedAt`, `breakEndsAt`, `breakMinutes` non-null. `phase === 'complete'` ⇒ `completedAt !== null` and `blockMinutes !== null`.
- `blockMinutes === null` ⇒ phase is never `complete`.
- `focus !== null` ⇒ `target.courseId` refers to an existing course.

### 4.3 Defaults and migration

`src/storage/defaults.ts`:
```ts
export const defaultFocusSettings: FocusSettings = {
  defaultBlockMinutes: 50,
  lastChoice: { kind: 'preset', minutes: 50 },
  askBlockEachTime: true,
  enterOnClockIn: true,
  breakMinutes: 10,
  chime: true,
  scene: DEFAULT_SCENE,   // exported from src/focus/scenes/ids.ts (pure, no canvas code)
  motion: 'system',
};
```
`defaultSettings.focus = defaultFocusSettings`; `emptyAppData()` returns `schemaVersion: 2, focus: null`.

New pure module `src/domain/migrate.ts`:
```ts
/** Upgrade any supported stored/imported shape to the current schema. Unknown input passes through
 *  untouched so validateAppData can report it. */
export function migrate(raw: unknown): unknown;
```
- `schemaVersion === 1` → copy, set `schemaVersion: 2`, `settings.focus = { ...defaultFocusSettings }`, `focus: null`.
- `schemaVersion === 2` → returned as is.
- Anything else → returned as is (validation rejects: "Unsupported schemaVersion … (expected 1 or 2)").

`validateAppData(raw)` calls `migrate(raw)` first. So `LocalStorageAdapter.load`, the cross-tab `storage` handler and Import all accept v1 and v2. Export always writes v2. The storage key stays **`productive:v1`** (it names the slot, not the schema; changing it would orphan data).

### 4.4 Validation additions (`src/domain/validate.ts`)

Repair rather than reject (the R9 spirit). Each repair pushes a warning.
- `settings.focus` missing or not an object → defaults. Each field out of range / wrong type → that field's default (`defaultBlockMinutes` 5..240 int; `breakMinutes` 1..60 int; booleans; `motion` enum; `scene` must be a known `SceneId`; `lastChoice` must match the union with valid minutes).
- `focus` not null and not an object → error (whole file invalid), same as `activeTimer`.
- `focus` object with any wrong-typed field, unknown course, or a broken invariant (§4.2) → **drop the session** (`focus: null`) with warning "Focus session was inconsistent and was cleared." The `activeTimer` is kept as is.
- `focus.target.sectionId` dangling or not in that course → `null` (like other dangling refs).

---

## 5. Pure logic, reducer, selectors

### 5.1 `src/domain/focus.ts` (pure; full unit tests in `focus.test.ts`)

All take `now: Date` (or ms) explicitly. `OPEN_LOOP_MS = 60 * 60_000`. `BLOCK_PRESETS = [25, 50, 90] as const`. `BREAK_PRESETS = [5, 10, 15, 20] as const`. `EXTEND_PRESETS = [5, 10, 15] as const`.

```ts
export function focusedMs(s: FocusSession, now: Date): number;
// focusedMsBefore + (segmentStartedAt ? max(0, now - segmentStartedAt) : 0)

export function blockProgress(s: FocusSession, now: Date): number;
// blockMinutes null → (focusedMs % OPEN_LOOP_MS) / OPEN_LOOP_MS
// else clamp(focusedMs / (blockMinutes*60000), 0, 1); 'complete' → 1

export function blockRemainingMs(s: FocusSession, now: Date): number | null;
// null when open-ended; else blockMs − focusedMs (may be negative = overtime)

export function blockEndsAt(s: FocusSession): IsoInstant | null;
// only while running ('focus'): segmentStartedAt + (blockMs − focusedMsBefore); else null

export function isBlockDue(s: FocusSession, now: Date): boolean;
// phase === 'focus' && blockMinutes !== null && blockRemainingMs ≤ 0

export function overtimeMs(s: FocusSession, now: Date): number;
// phase === 'complete' ? max(0, now − completedAt) : 0

export function breakProgress(s: FocusSession, now: Date): number;     // 0..1, 'break' only, else 0
export function breakRemainingMs(s: FocusSession, now: Date): number;  // may be negative
export function isBreakOver(s: FocusSession, now: Date): boolean;

export function plannedBlockNow(data: AppData, now: Date): { block: ScheduledBlock; minutesLeft: number } | null;
// today's blocks (current week plan) with startMin ≤ nowMin < endMin, nowMin = minutes since local midnight incl.
// fractional seconds; minutesLeft = floor(endMin − nowMin) (so 14:22:30 with end 15:00 → 37). If several, the one
// that started latest. null if none or minutesLeft < 5.

export function resolveBlockMinutes(choice: BlockChoice, data: AppData, now: Date, fallback: number): number | null;
// preset/custom → minutes; open → null; planned → plannedBlockNow?.minutesLeft ?? fallback

export function clampBlockMinutes(n: number): number;   // round, clamp 5..240; NaN → 50
export function clampBreakMinutes(n: number): number;   // round, clamp 1..60; NaN → 10

export function isStaleFocus(s: FocusSession, now: Date): boolean;
// 'paused': now − pausedAt > 6h; 'break': now − breakEndsAt > 6h; else false

export function formatCountdown(ms: number): string;
// ms ≥ 0: "4:05", "25:00", "1:02:05" (ceil to the second so 0.4 s left shows "0:01"); negative → "+3:12"

export function focusTitle(s: FocusSession, now: Date, courseName: string): string;
// focus: "▶ 18:20 · Organic Chemistry"; open: "▶ 42:10 · …" (elapsed); paused: "❚❚ Paused · …";
// complete: "✓ Block done · …"; break: "☕ Break 4:12"; break over: "☕ Break over"
```

Required tests (minimum): progress at 0, mid, exactly 1, over; progress after pause/resume (banked + new segment); open-ended loop wraps at 60 min; `blockEndsAt` after a pause shifts by the pause length; `isBlockDue` false while paused even if wall time passed; extend from overtime; break math incl. extend; `plannedBlockNow` none / inside / last 4 min (null) / two blocks / block on another day / no plan; `resolveBlockMinutes` planned fallback; clamps incl. NaN; `isStaleFocus` boundaries; `formatCountdown` 0, 59.4 s, 1 h, negative; cross-midnight block (start 23:40, 50 min) progresses normally across midnight.

### 5.2 Actions (`src/state/actions.ts`)

```ts
  | { type: 'focus/start'; now: IsoInstant; id: Id; target: FocusTarget; blockMinutes: number | null;
      choice: BlockChoice['kind']; scene: SceneId; immersive: boolean }
      // no activeTimer → also starts one (startedAt = now) with target; activeTimer running → attaches,
      // target := the timer's course/section/note. No-op if focus already exists.
  | { type: 'focus/pause'; now: IsoInstant; newEntryId: Id }         // 'focus' only
  | { type: 'focus/resume'; now: IsoInstant }                         // 'paused' only
  | { type: 'focus/complete'; at: IsoInstant }                        // 'focus' & blockMinutes ≠ null only
  | { type: 'focus/extend'; now: IsoInstant; minutes: number }        // 'focus' or 'complete'
  | { type: 'focus/nextBlock'; now: IsoInstant; blockMinutes?: number | null } // 'complete' or 'break'
  | { type: 'focus/startBreak'; now: IsoInstant; stopAt: IsoInstant; newEntryId: Id; minutes: number } // 'complete' or 'focus'
  | { type: 'focus/extendBreak'; minutes: number }                    // 'break' only
  | { type: 'focus/setImmersive'; immersive: boolean }
  | { type: 'focus/setScene'; scene: SceneId }
  | { type: 'focus/end' }                                             // focus := null; does NOT touch activeTimer
  | { type: 'focus/settings'; patch: Partial<FocusSettings> }         // merges into settings.focus
```

Reducer semantics (each action not valid for the current phase returns `state` unchanged):
- **focus/start**: as commented. New session: `blockStartedAt = segmentStartedAt = now`, `focusedMsBefore = 0`, `phase 'focus'`, `blocksCompleted 0`, all nullable fields null.
- **focus/pause**: run `timer/stop` with `{ now, newEntryId }`; `focusedMsBefore = focusedMs(s, now)`; `segmentStartedAt = null`; `phase 'paused'`; `pausedAt = now`.
- **focus/resume**: `activeTimer = { ...target, startedAt: now }`; `segmentStartedAt = now`; `pausedAt = null`; `phase 'focus'`.
- **focus/complete**: `phase 'complete'`, `completedAt = at`. Timer untouched.
- **focus/extend**: `blockMinutes = ceil(focusedMs(s, now) / 60000) + minutes`, capped at 480; `phase 'focus'`; `completedAt = null`. (Open-ended: no-op.)
- **focus/nextBlock**: `blocksCompleted += 1` **only from 'complete'** (break already counted it); `blockMinutes = action.blockMinutes !== undefined ? action.blockMinutes : s.blockMinutes`; `blockStartedAt = segmentStartedAt = now`; `focusedMsBefore = 0`; clear completed/break fields; `phase 'focus'`. From 'break' also starts `activeTimer` with `target`.
- **focus/startBreak**: `timer/stop` with `{ now: stopAt, newEntryId }`; `blocksCompleted += 1`; `phase 'break'`; `breakMinutes = minutes`; `breakStartedAt = now`; `breakEndsAt = now + minutes`; `segmentStartedAt = null`; `completedAt = null`.
- **focus/extendBreak**: `breakEndsAt += minutes`; `breakMinutes += minutes`. The UI offers +5 only while the break is still running (after break-over it offers Start next block / Clock out).
- **focus/end**: `focus = null`.
- **focus/settings**: `settings.focus = { ...settings.focus, ...patch }`.

Changes to existing cases:
- **timer/stop**: also `focus = null`.
- **timer/switch**: if `focus`, `focus.target = action.next`.
- **timer/start**: unchanged (a session can't exist without a timer in 'focus'/'complete'; if a session is `paused`/`break` and some path calls `timer/start`, also set `focus = null` — the UI never does this, it uses resume/nextBlock).
- **course/delete**: if `focus?.target.courseId === id` → `focus = null`.
- **section/delete**: `focus.target.sectionId === id` → `null`. (`SectionDeleteRecord` and `section/restore` don't need to restore the session target.)
- **data/replace**: unchanged.

Reducer tests: one per new action incl. its no-op guards; pause creates an entry and a later resume a second entry with a gap equal to the pause; pause < 60 s discards the entry but banks progress; startBreak with `stopAt = completedAt` ends the entry at the block end; nextBlock from break starts a new timer; timer/stop clears focus; timer/switch updates target; course delete clears session; invariants (§4.2) hold after every action in a scripted sequence (write an `assertFocusInvariants(state)` test helper).

### 5.3 Selectors (`src/state/selectors.ts`)

- `focusView(data, now)` → `{ session, phase, progress, remainingMs, overtimeMs, breakRemainingMs, breakOver, courseName, sectionTitle, blockLabel }` — the one object the overlay, pill and Today read. Pure, tested.
- `canEnterFocus(data)` → `!!data.activeTimer || data.focus?.phase === 'paused' || data.focus?.phase === 'break'`.

### 5.4 Timer actions hook (`src/state/timer.ts`)

Extend `useTimerActions` with `startFocus(opts)`, `pause()`, `resume()`, `extend(min)`, `keepGoing()`, `startBreak(minutes, stopAtBlockEnd)`, `nextBlock(minutes?)`, `endSession()`, `clockOut(stopAtBlockEnd?)`. Each builds `now`/ids and dispatches; clock-out and pause reuse the existing toast logic (`entryFromTimer` preview). `ui.toggleTimer` becomes: running → clockOut; `focus.phase === 'paused'` → resume; `'break'` → nextBlock; else → open `BlockPicker` (or start directly when `askBlockEachTime` is false).

---

## 6. Components and hooks

New folder `src/focus/` (React + browser APIs; logic stays in `domain/focus.ts`):

```
src/focus/
  FocusController.tsx     always mounted inside AppUiProvider; no UI except the portal
  FocusMode.tsx           the overlay (portal to document.body) + FocusMode.module.css
  FocusHud.tsx            countdown, target line, block n, 10h notice
  FocusControls.tsx       control bar (pause/resume, +5, clock out, scene, mute, fullscreen, exit)
  CompletePanel.tsx       keep going / extend / break (+length) / clock out (+overtime choice)
  BreakPanel.tsx          break running / break over
  BlockPicker.tsx         Modal (uses components/Modal)
  SceneCanvas.tsx         <canvas> host for a SceneEngine
  chime.ts                Web Audio synthesized chime: primeAudio() on a user gesture, playChime()
  scenes/
    types.ts              SceneEngine + SceneInfo interfaces
    ids.ts                SCENE_IDS, DEFAULT_SCENE, isSceneId — pure, imported by domain/validate & defaults
    index.ts              registry: SceneInfo[] (id, label, create)
    ice.ts, fire.ts, sun.ts  (or whatever FOCUS_DESIGN.md lists) — one engine each
  hooks/
    useIdle.ts            (ms) → boolean idle; resets on pointermove/keydown/touchstart; false while focus is inside controls
    useWakeLock.ts        (active: boolean) → best-effort screen wake lock
    useFullscreen.ts      (ref) → { isFullscreen, toggle } via Fullscreen API
    usePageVisible.ts     → boolean (document.visibilityState === 'visible')
    useFocusTrap.ts       extracted from Modal.tsx so Modal and FocusMode share one implementation
    useReducedMotion.ts   (pref: MotionPref) → boolean
```

### 6.1 FocusController

- Reads `data.focus`. If none → renders nothing, no timers.
- On mount: if `isStaleFocus` → `focus/end`.
- Ticks with `useNow(1000, !!session)` (1 s; browsers throttle hidden tabs to ~1/min, which is fine — completion uses exact instants). On each tick and on `visibilitychange` → visible: if `isBlockDue` → `focus/complete { at: blockEndsAt }`; if `isBreakOver` and not yet announced → chime + announce (track "announced for breakEndsAt" in a ref, not in data).
- Chime only if `settings.focus.chime`, the tab is the one that dispatched, and `now − at ≤ 10 s`.
- Sets `document.title` via `focusTitle` every tick while a session exists (replaces `TimerTitle`'s output while `focus` exists; `TimerTitle` keeps working when there is no session).
- Renders `<FocusMode/>` through `createPortal(…, document.body)` when `session.immersive`.

### 6.2 FocusMode overlay

- `position: fixed; inset: 0; z-index` above everything incl. toasts; `role="dialog" aria-modal="true" aria-label="Focus mode"`. While mounted, set `inert` on `#root > *` siblings? No — the portal is a sibling of `#root`; set `document.getElementById('root')!.inert = true` while open and restore on unmount (plus the focus trap for browsers without `inert`).
- `body` scroll locked (`overflow: hidden`) while open.
- Layers: `SceneCanvas` (full bleed, `aria-hidden="true"`), `FocusHud`, `FocusControls` / `CompletePanel` / `BreakPanel`, and a visually-hidden `aria-live="polite"` region (the app's existing one is under the inert root, so the overlay needs its own).
- Enter/exit transitions are the designer's; with reduced motion they are instant.
- Wake lock: `useWakeLock(visible && phase !== 'paused')`. Fullscreen: user-initiated only (button / `F`); leaving the overlay calls `document.exitFullscreen()` if active.
- Toasts raised while the overlay is open (e.g. "Under a minute — not logged") show inside the HUD, not through the app toast (which is inert).

### 6.3 Scene engine contract (`src/focus/scenes/types.ts`)

```ts
export type ScenePhase = 'focus' | 'paused' | 'complete' | 'break' | 'open';

export interface SceneInitOptions {
  reducedMotion: boolean;     // render calm/static frames; no continuous particle motion
  colorScheme: 'light' | 'dark';
  accent: string;             // course colour hex, if the design wants to tint
}

export interface SceneEngine {
  /** Attach to a canvas the host owns and sized already (CSS px × dpr). Start its own rAF loop. */
  mount(canvas: HTMLCanvasElement, opts: SceneInitOptions): void;
  /** 0..1. Called by the host at least once per second and on every phase change; engines interpolate between calls. */
  setProgress(p: number): void;
  setPhase(phase: ScenePhase): void;
  /** Host calls on ResizeObserver change with CSS pixel size and devicePixelRatio (capped at 2). */
  resize(width: number, height: number, dpr: number): void;
  /** Host calls with false when the page is hidden or the overlay is covered; engine stops its rAF loop. */
  setRunning(running: boolean): void;
  setReducedMotion(reduced: boolean): void;
  /** Stop loops, release listeners/GL resources. The host never reuses a destroyed engine. */
  destroy(): void;
}

export interface SceneInfo {
  id: SceneId;
  label: string;              // "Ice", "Fire", "Sun"
  description: string;        // one line for the picker / settings
  create(): SceneEngine;
}
```

Host rules (`SceneCanvas`): creates the engine on mount / scene change (destroy old first), owns the canvas size (ResizeObserver), passes `setRunning(visible)` from `usePageVisible`, sends `setProgress` every 1 s from `focusView` (and immediately on phase change and on becoming visible), maps phase → `ScenePhase` (`open` when `blockMinutes === null` and phase is `focus`). Engine errors (throw in `mount` or a missing canvas context) are caught: the host falls back to a plain CSS progress ring and logs once. Engines must render a correct frame from `setProgress(p)` alone (no reliance on having seen earlier progress), so reload at 70 % looks right instantly. Budget: ≤ 4 ms per frame at 1440×900, dpr 2, on a mid laptop; ≤ 30 fps when `reducedMotion` is false is acceptable if the design doc says so; with `reducedMotion` true, redraw only on `setProgress`/`setPhase`/`resize`.

Each engine ships with a tiny smoke test in `scenes/scenes.test.ts`: `create()` returns all methods; calling `destroy()` without `mount` doesn't throw. (No canvas in the node test env; drawing is checked by the reviewer visually.)

### 6.4 Settings page additions

A new **Focus** card: default block length (preset chips + custom), ask each time (checkbox), open focus mode on clock in (checkbox), break length (number 1–60), chime (checkbox + "Test" button), scene (chips with labels), motion (radio: Follow system / Full / Reduced). All via `focus/settings`.

### 6.5 TimerPill / Nav

- `Layout`: `showPill = !!data.activeTimer && !onToday || !!data.focus && !data.focus.immersive` (pill shows on Today too when a session exists and the overlay is hidden).
- TimerPill gains the second line and the click behaviour from §3.8; stop button becomes Resume/Start for paused/break (accessible names: "Resume focus", "Start next block").

---

## 7. One-screen Today

### 7.1 Scope

At viewport **≥ 1000 px wide and ≥ 700 px tall**, Today is a fixed-height dashboard: the page fits `100dvh` (inside the app shell, beside the sidebar) and the document does not scroll. Below either threshold the v1 stacked/flowing layout stays (phones scroll).

### 7.2 What stays and how it compacts (constraints for the designer)

All seven v1 content groups stay visible. Changes:

1. **Header** — title + subline stay; one row, ≤ 56 px. "Add entry" stays in the header; the duplicate "+ Add entry" in the Logged card is removed (replaced by the icon button only).
2. **Banners** — at most **one banner row** (≤ 44 px) is shown at a time, priority: storage error > 10h > carry-over > no plan. If more than one applies, the row shows the top one plus a "1 more" toggle that swaps to the next. Content of each banner unchanged.
3. **Timer card** — keeps pickers (idle) / target (running), readout, Clock in/out, Switch, and gains: "Block: 50 min ▾" (idle), "Start focus" or "Back to focus" (running), a slim block progress bar when a session exists. Readout shrinks to ≤ 56 px font. Hint `kbd`s may be hidden at this size (shortcuts overlay still lists them).
4. **Today's section** — **merged into the timer card** as one compact row at its bottom (title · course · logged/estimate bar · Mark done). The standalone section card is removed at ≥ 1000 px; below 1000 px it may stay standalone (designer's call).
5. **Progress ring** — stays, diameter 120–160 px, legend beside or below it, max 4 legend rows then "+N more".
6. **Today's plan (DayTimeline)** — stays; it must **fit its card without internal scroll** by (a) trimming the hour range to `[min(firstBlockOrEntryStart, nowHour − 1), max(lastEnd, nowHour + 1)]`, clamped to `gridStartHour..gridEndHour`, minimum 6 h span, rounded to whole hours; and (b) scaling `PX_PER_MIN` to the card's measured height (ResizeObserver), minimum 14 px/hour — if even that doesn't fit, the timeline scrolls internally with "now" kept in view. `DayTimeline` gets an optional `fitHeight?: number` prop; without it v1 behaviour is unchanged (used on mobile).
7. **Logged today** — stays; list **scrolls internally** when it overflows (it's the only card besides the timeline allowed to).
8. **This week** — stays; bars ≤ 40 px tall; total + streak inline.

Pure helper (tested): `timelineRange(blocks, pieces, now, gridStart, gridEnd): { startHour; endHour }` in `src/domain/plan.ts`.

### 7.3 Acceptance

- At **1280×800** and **1440×900** (Chromium, sidebar layout, both colour schemes) with the review fixture (3 entries incl. running timer, 4 blocks 09:00–18:00, carry-over banner, no-plan banner suppressed because a plan exists): `document.scrollingElement.scrollHeight ≤ window.innerHeight` and `scrollWidth ≤ innerWidth`; every card's heading is inside the viewport.
- Same with 15 logged entries: page still doesn't scroll; Logged list scrolls internally.
- Same with banners for 10h **and** carry-over: only one banner row, "1 more" toggles.
- At 999×800 and at 1280×690 the page may scroll and nothing is clipped.
- 375 px phone: v1 stacked order, scrolls, no horizontal scroll.

---

## 8. Accessibility

- **Focus trap** in the overlay and the picker (shared `useFocusTrap`); app root `inert` while the overlay is open; focus returns to the element that opened it (Clock in button / pill) on exit.
- **Initial focus**: focus phase → Pause; paused → Resume; complete → Keep going; break → Start next block now; break over → Start next block.
- **Esc** exits the overlay in every phase; ✕ button has `aria-label="Exit focus view (timer keeps running)"`.
- **Controls stay in the tab order when visually hidden**; any focus inside the control bar makes it visible (`:focus-within` + `useIdle` returns false). Never `display: none` / `visibility: hidden` on idle — use opacity and keep pointer events off until shown.
- **Live region** (overlay-owned, `aria-live="polite"`): "Block started, 50 minutes.", "Paused.", "Resumed.", "Block complete. 50 minutes done.", "Break started, 10 minutes.", "Break over.", "Clocked out, logged 1h 05m." The countdown itself is **not** live (`aria-live="off"`); it has `role="timer"` and an `aria-label` updated once a minute ("18 minutes left").
- **Reduced motion**: effective = `settings.focus.motion === 'reduced' || (motion === 'system' && matchMedia('(prefers-reduced-motion: reduce)'))`; `'full'` forces motion even when the OS asks for less (explicit user override). With reduced motion: engine gets `reducedMotion: true`, overlay transitions are instant, control fade is instant.
- Scene canvas is `aria-hidden`; the HUD conveys all state in text. Text over the scene meets 4.5:1 (design doc ensures a scrim).
- Block picker options are a real radio group (`fieldset` + `legend` "Block length"), custom input labelled "Custom minutes".
- All new buttons ≥ 44×44 px hit area on touch layouts.

---

## 9. Build order and acceptance criteria

Every milestone ends with `npm run typecheck`, `npm test`, `npm run build` clean, and is one or more commits on `focus-mode`. Reviewer checks the boxes.

### F0 — Schema v2, migration, focus domain
`types.ts` additions, `migrate.ts`, defaults, validation, `domain/focus.ts`, `scenes/ids.ts`.
- [ ] v1 JSON (e.g. a round-1 export) loads and imports; result has `schemaVersion: 2`, default `settings.focus`, `focus: null`; export writes v2.
- [ ] Unknown schemaVersion still rejected with a clear message.
- [ ] Invalid `settings.focus` fields are repaired to defaults with warnings; an inconsistent `focus` is dropped with a warning; activeTimer kept.
- [ ] All §5.1 tests present and passing (incl. pause shift, open loop, planned-block edges, cross-midnight, stale rule).

### F1 — Reducer, selectors, timer actions
- [ ] Every §5.2 action implemented with phase guards; tests listed in §5.2 pass; `assertFocusInvariants` holds through a scripted start → pause → resume → complete → break → nextBlock → extend → clock-out sequence.
- [ ] `timer/stop` clears the session; `timer/switch` updates the target; course delete clears it; section delete nulls the target section.
- [ ] `defaultTimerTarget` prefers the block active now (tested).
- [ ] `focusView` selector tested for each phase.

### F2 — Block picker and session lifecycle (placeholder scene)
`BlockPicker`, `FocusController`, `FocusMode` with a temporary CSS progress ring instead of a scene, HUD, controls, complete/break panels, chime, title, keys.
- [ ] Space on Today opens the picker with the last choice selected; Enter starts; overlay appears; the timer runs (Timecard shows a live interval after exit).
- [ ] "Until HH:MM (planned)" appears only while a planned block with ≥ 5 min left contains now, with the right minutes; Custom accepts 5–240 only; Just track starts a plain timer, no overlay; last choice remembered across reload.
- [ ] `askBlockEachTime` off → Space starts directly with the last choice.
- [ ] Pause produces an entry ending at the pause instant; Resume starts a new one; the gap appears on the Today timeline; countdown froze during the pause.
- [ ] With a faked clock: block end → chime (once), announcement, complete panel; Keep going continues the same entry; +10 at 3 min overtime gives 10:00 left; Break with ≥ 2 min overtime offers "Stop at block end"/"Stop now" and the entry ends at the chosen instant; break counts down, is not logged anywhere, "Break over" chimes; Start next block creates a new entry.
- [ ] Clock out from each phase works; toast with Undo appears after the overlay closes.
- [ ] Every key in §3.11 does what the table says; global hotkeys don't fire under the overlay.
- [ ] Tab title follows `focusTitle`.

### F3 — Leave/return, persistence, edge cases
- [ ] Esc hides the overlay; pill (also on Today) shows remaining/paused/break state; clicking it reopens; Today shows "Back to focus"; plain running timer → "Start focus" attaches without a new entry.
- [ ] Reload in each phase restores the same phase and progress (± 1 s) and the overlay if it was open; reload after the block ended while closed shows complete with correct overtime and **no** chime.
- [ ] Paused/break session older than 6 h is gone after reload.
- [ ] A block started 23:40 completes after midnight; entries split correctly on Today/Timecard.
- [ ] 10 h notice appears in the HUD and its action works.
- [ ] Second tab follows the session; only one chime per completion.

### F4 — Scenes
Scene engines per `FOCUS_DESIGN.md`, `SceneCanvas`, scene picker in BlockPicker/overlay/Settings, reduced motion, wake lock, fullscreen, visibility throttling.
- [ ] Each scene renders the correct state for any progress 0…1 instantly (check 0, 0.5, 0.9, 1 and after reload), and distinct `break`, `paused`, `complete`, `open` looks as specified by the design doc.
- [ ] Switching scene mid-block keeps progress; no leaked rAF loops (Performance panel: one loop after 5 switches).
- [ ] Hidden tab: no rAF callbacks; on return the scene jumps to the right progress.
- [ ] Reduced motion (OS setting and the `reduced` override) stops continuous animation; `full` overrides the OS setting.
- [ ] Wake lock requested while visible and active, released on exit/pause (no errors where unsupported). Fullscreen only via button/`F`; exiting the overlay exits fullscreen.
- [ ] Engine failure falls back to the ring without breaking the overlay.
- [ ] Frame time within the §6.3 budget at 1440×900 dpr 2.

### F5 — One-screen Today, Settings, accessibility pass
- [ ] §7.3 acceptance passes at all listed sizes, both colour schemes.
- [ ] Settings → Focus card edits every `FocusSettings` field; Test chime plays.
- [ ] §8: focus trap + `inert`, initial focus per phase, focus restored on exit, controls reachable by Tab while faded, live region messages, `role="timer"`, picker radio group, 4.5:1 text contrast over every scene and phase.
- [ ] No console errors; v1 acceptance criteria (PLAN.md §7) still pass — in particular Space clock-out from other pages, 10 h banner, export/import round-trip (now v2).

### Out of scope (round 2)
System notifications (Notification API), ambient sound loops, per-course scenes, statistics on blocks/breaks (sessions aren't stored after they end), auto-starting the next block after a break, Pomodoro long-break cycles, syncing blocks back into the Plan's `ScheduledBlock`s.
