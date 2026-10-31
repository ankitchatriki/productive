# StruggleMore — Round 3 plan: weekly progress card and a longer Today

Branch `round3` (from `focus-mode`). Owner: planner (behaviour and data). Visuals and the improved focus animation are in `docs/ROUND3_DESIGN.md` (designer). Where this plan gives a size budget, it is a constraint for the designer. The designer chooses everything else about how things look.

**The user's request:** "Make the main screen longer, also make the animation better ... also have a weekly progress card on the top."

**Summary of decisions**

1. A new **This week** card goes at the top of Today, above the Start card. It shows the week total against the weekly target, a Mon–Sun row of day bars, the plan's goals with their statuses, the streak, and sections done against sections assigned.
2. All of its numbers come from one new pure function, `weekProgress(data, now)`, in `src/domain/weekProgress.ts`. That function reuses `computeGoalProgress`, `allIntervals`, `minutesByDay`, `dailyGoalFor`, `isRestDate`, `createWeekPlan` and `computeStreaks`. It adds no new state, no new actions and no schema change.
3. **Today now scrolls vertically.** The round-2 rule "Today fits `100dvh` and the document does not scroll" (FOCUS_PLAN §7.1/§7.3, STRUGGLEMORE_DESIGN §4.2 grid and §4.5 checks 1–3) is **lifted on purpose**. Reviewer: do not flag page scroll on Today.
4. The above-the-fold rule still holds. At 1280×800 the weekly card **and** the Start card's primary button and TODAY number must be visible without scrolling (§3.3).
5. The header's `Week x / 48:00 · Behind` chip, the streak chip and the `Plan →` link are **removed**, because the weekly card replaces them. The inline week-status code in `TodayPage.tsx` (lines 46–56) is deleted.
6. A new, optional **Up next** card lists today's remaining planned blocks.

---

## 1. Weekly progress card ("This week")

### 1.1 Terms

- `ws = weekStartOf(toDateKey(now))`, `dates = weekDates(ws)`, `today = toDateKey(now)`.
- **Effective plan** `ep`: `data.weekPlans[ws]` if it exists, otherwise `createWeekPlan(ws, data.settings, now.toISOString())`. The fallback is built in memory only and is **never dispatched**. `hasPlan = !!data.weekPlans[ws]`.
- **Study day**: a date in `dates` with `!isRestDay(date, ep.restDays)`. A **rest day** is any other date. These match `isRestDate(date, data)` for the current week.
- **Day goal** `goalOf(d) = ep.dailyGoalMinutes`. This equals `dailyGoalFor(d, data)` for every d in the week.
- **Weekly target** `target = ep.dailyGoalMinutes × (number of study days)`. This is the sum of the daily goals over non-rest days from the WeekPlan snapshot, or from settings when there is no plan.
  - It is deliberately **not** the `totalHours` goal's `targetMinutes`. That goal can be edited on Plan week and then appears separately in the goals list.
  - If every day is a rest day, `target = 0`.
- **Intervals**: `allIntervals(data, now)`, which includes the running timer up to `now`. `byDay = minutesByDay(intervals)`.

### 1.2 What the card shows (data, top to bottom; the designer arranges it)

| # | Item | Computation | Display |
|---|---|---|---|
| A | Title + link | Static `This week` and the date range `formatDay(dates[0])–formatDay(dates[6])`. The title links to `/review/${ws}`. | `This week · 26 Oct – 1 Nov` |
| B | **Week total / target** | `total = Σ byDay(d) for d in dates`, so rest days count. `target` is as defined in §1.1. | `12:40 / 48:00` with `formatDuration` |
| C | **Week status** | `status = computeGoalProgress({ id: 'week-total', kind: 'totalHours', targetMinutes: target }, ep, data, now).status`. That is the same pace rule as every goal (PLAN §4.2), so the result is `met`, `on_track`, `behind` or `missed`. `missed` cannot happen in the current week. When `target === 0`, show `—` and no chip. | Status chip using the existing `STATUS_LABEL` and `STATUS_CHIP` (move them from `ReviewPage.tsx` to `src/domain/goals.ts` and export them). |
| D | **Pace line** | `remaining = max(0, target − total)`. `daysLeft` = study days with `d >= today`, today included. When `remaining > 0 && daysLeft > 0`: `perDay = ceil(remaining / daysLeft)`. | `35:20 to go · 7:04/day for 5 days`. When met: `+1:10 over`, or `Target met` at exactly 0. When `daysLeft === 0` and not met: `35:20 short`. |
| E | **Day row, Mon–Sun** | One entry per date: `{ date, minutes: byDay(d), goal: rest ? 0 : goalOf(d), rest, isToday, state }`, with `state` from §1.3. Bar fill = `min(1, minutes / goalOf(d))`. A rest day uses `goalOf(d)` as its reference too, so studying on a rest day still shows a bar. | Weekday letter, bar and `h:mm` per day. Rest days are marked "Rest" and look muted. Today is highlighted. |
| F | **Live contribution** | `liveMinutes` = the running timer's minutes that fall **today**: `minutesOnDate([runningInterval], today)`, or 0 with no timer. It is already included in B and E. It is exposed separately so today's bar can draw the live part differently, for example with a pulse. | The designer decides how today's bar shows it. The values update every minute while the timer runs; per-second updates are not needed. |
| G | **Goals** (only when `hasPlan`) | For each `g` in `ep.goals`, in plan order: `computeGoalProgress(g, ep, data, now)`. The label uses the `goalText` logic now in `ReviewPage.tsx` (§1.5: extract it). | `Total hours 12:40 / 40:00 · On track`, one row per goal. At most 3 rows on desktop, then `+N more`, which links to `/review/${ws}`. `Edit goals` links to `/plan/${ws}`. |
| H | **Streak** | `streaksAt(data, now)` gives `{ current, best }`. | `4-day streak · best 9`. When `current === 0 && best > 0`: `No streak · best 9`. When both are 0: hidden. |
| I | **Sections** (only when `hasPlan` and assigned > 0) | `assigned` = the distinct non-null ids in `Object.values(ep.sectionByDay)` that still exist in `data.sections`. `done` = the ones with `completedAt !== null`, whenever they were completed. | `Sections 2 / 5 done`. It links to `/plan/${ws}`. |

**Refresh.** The card's view model is memoised on `[data, minuteKey]`, where `minuteKey = Math.floor(now / 60000)`. It is not recomputed every second. When the timer starts or stops, `data` changes, so the card recomputes immediately.

### 1.3 Day state (`DayCell.state`)

Evaluate in this order:

1. `d > today` → `'future'`
2. `minutes > 0 && minutes >= goalOf(d)` → `'hit'`. This rule is identical to `computeStreaks`'s `hit`, and a rest day can be hit.
3. `d === today` → `'today'`, meaning in progress
4. `rest` → `'rest'`
5. `minutes > 0` → `'short'`
6. Otherwise → `'empty'`, a past study day with nothing logged

`isToday` is a separate flag, so a day can be both `'hit'` and today.

### 1.4 States

| State | Condition | Behaviour |
|---|---|---|
| **No plan this week** | `!hasPlan` | B–F and H still show, computed from the settings fallback. Below the day row, label the target `Default target (no plan)`. G and I are replaced by one line: `No plan for this week yet.` and a `Plan week →` button that goes to `/plan/${ws}`. It does **not** create the plan, because Plan week creates it as it does today. The no-plan banner stays on Plan week only. |
| **First day of the week** | No study day before today, so `elapsedStudyDays === 0` (usually Monday) | Status comes out `on_track` (expected = 0), unless the target is already met, which shows `met`. The pace line reads `Week starts today · 8:00/day`, using `perDay`. Goals show `On track` as `computeGoalProgress` returns them. There is never a "Behind" on day 1. |
| **Last day of the week** | `today === dates[6]` | Status and pace work as normal. Add the links `Review week →` (`/review/${ws}`) and `Plan next week →` (`/plan/${addDays(ws, 7)}`). |
| **Week target met** | `target > 0 && total >= target` | Status is `met`, and the pace line shows `+h:mm over` or `Target met`. The designer may add a "complete" treatment; note that the improved animation is the designer's area. On Sunday, also add the links from the last-day row. |
| **All rest days** | `target === 0` | B shows `12:40` with no `/ target`. Hide C and D. |
| **Nothing logged this week** | `total === 0` | The card still renders fully, with `0:00 / 48:00` and empty bars. It never shows an empty state. |

### 1.5 Interactions (decided)

- **Day cell** → it is a link to `/timecard/${ws}`, which opens the Timecard for that week. Timecard already highlights today's column. **No `?day=` parameter this round.** Future days are links too, because they show the same week. Each link has an accessible name such as `Tue 27 Oct: 3:23 of 8:00, in progress. Open timecard`. Rest days read `…, rest day`.
- **Goal row** → it is not interactive, to avoid 3+ tab stops. `Edit goals` goes to `/plan/${ws}` and `+N more` goes to `/review/${ws}`.
- **Card title** `This week` → `/review/${ws}`.
- **Sections line** → `/plan/${ws}`.
- **Streak** → a tooltip that reuses the existing chip's copy: "Days in a row you hit your daily goal. Rest days don't break it." It does not navigate.
- **Keyboard**: no new hotkeys. The tab order is title → day cells (7) → goals links → sections → Start card.

### 1.6 Code: reuse and new code

**Reuse unchanged:** `allIntervals`, `minutesByDay` and `minutesOnDate` (aggregate.ts); `computeGoalProgress` and `goalIsDuration` (goals.ts); `createWeekPlan`, `isRestDate` and `dailyGoalFor` (plan.ts); `weekDates`, `weekStartOf`, `isRestDay`, `addDays` and `toDateKey` (time.ts); `streaksAt` (selectors.ts).

**Move (refactor, no behaviour change):**

- `STATUS_LABEL` and `STATUS_CHIP` move from `ReviewPage.tsx` to `src/domain/goals.ts`. Leave `STATUS_ICON` in Review.
- `goalText(g, p, courseById)` moves from `ReviewPage.tsx` to `src/domain/goals.ts`, as `goalText(goal, progress, courseName: (id) => string): { name; value; chip }`. Review then imports it. Review's rendering must be byte-identical before and after.

**New: `src/domain/weekProgress.ts`** (pure, no React):

```ts
export type DayState = 'future' | 'hit' | 'today' | 'rest' | 'short' | 'empty';
export interface DayCell { date: DateKey; minutes: number; goal: number; rest: boolean; isToday: boolean; state: DayState; ratio: number /* 0..1 vs goalOf(d) */ }
export interface WeekProgress {
  weekStart: WeekKey;
  hasPlan: boolean;
  total: number;              // minutes, running timer included
  target: number;             // §1.1
  status: GoalProgress['status'] | null; // null when target === 0
  remaining: number;          // max(0, target - total)
  over: number;               // max(0, total - target)
  daysLeft: number;           // study days >= today
  perDay: number | null;      // ceil(remaining / daysLeft), null if remaining === 0 or daysLeft === 0
  firstDay: boolean;          // no study day before today
  lastDay: boolean;           // today === Sunday of ws
  liveMinutes: number;        // running timer minutes on today
  days: DayCell[];            // length 7, Mon..Sun
  goals: Array<{ goal: Goal; progress: GoalProgress }>; // [] when !hasPlan
  streak: { current: number; best: number };
  sections: { done: number; assigned: number } | null;  // null when !hasPlan or assigned === 0
}
export function weekProgress(data: AppData, now: Date): WeekProgress;
export function dayState(date: DateKey, today: DateKey, minutes: number, goal: number, rest: boolean): DayState;
```

The selector in `src/state/selectors.ts` is `export const weekProgressAt = (data: AppData, now: Date) => weekProgress(data, now);`, which follows the `streaksAt` pattern. The component lives in `src/pages/today/WeekCard.tsx` and gets `WeekProgress` and `courseName` as props. It reads no store data of its own, apart from `useNavigate` for the links.

### 1.7 Unit tests: `src/domain/weekProgress.test.ts`

Use the fixtures from `src/domain/fixtures.ts`. The week is Mon 2026-10-26 to Sun 2026-11-01, and settings are `dailyGoalMinutes: 480`, `restDays: []` unless the case says otherwise.

1. **No plan, nothing logged, Tue 10:00.** `hasPlan` false, `target` 3360, `total` 0, `goals` [], `sections` null. `days[0].state` is `'empty'`, `days[1]` is `'today'` with `isToday`, `days[2..6]` are `'future'`. `status` is `'behind'` (Monday elapsed, 0 < 480). `daysLeft` 6, `perDay` 560.
2. **Plan with rest Sunday** (`restDays: [6]`, daily 360). `target` = 6×360 = 2160. `days[6].rest` is true and `days[6].goal` is 0. On Sunday with 0 minutes, the state is `'today'` (today outranks rest), and on Tue that day is `'future'`.
3. **Rest day studied.** Plan rest `[5]`, Sat with 400 minutes, daily 360, now Sun. `days[5].state` is `'hit'` and `total` includes the 400.
4. **Rest day with some study under goal.** Sat 100 minutes, rest, now Sun: state `'rest'`.
5. **Short / empty.** Mon 200 minutes on a study day, now Tue: `'short'`. Mon 0 minutes: `'empty'`.
6. **Running timer.** Timer started Tue 09:00, now Tue 10:30, plus an entry Mon 08:00–10:00. `total` 210, `liveMinutes` 90, `days[1].minutes` 90.
7. **Timer across midnight.** Started Mon 23:00, now Tue 01:00. `liveMinutes` 60, `days[0].minutes` 60, `days[1].minutes` 60.
8. **First day.** Now Mon 12:00 with 0 minutes: `firstDay` true, `status` `'on_track'`. Now Mon with Mon set as a rest day and 0 minutes: still `firstDay` true. Now Tue when Mon was a rest day: `firstDay` true, because no *study* day has elapsed.
9. **Met / over.** Entries totalling 3400 against a 3360 target: `status` `'met'`, `over` 40, `remaining` 0, `perDay` null.
10. **Last day not met.** Now Sun 23:00 with total 2500: `lastDay` true, `daysLeft` 1, `perDay` 860, status `'behind'` (expected = 3360 × 6/7 = 2880). With total 3000, the status is `'on_track'` (3000 ≥ 2880).
11. **All rest days.** `restDays: [0..6]`: `target` 0, `status` null, `perDay` null.
12. **Goals pass-through.** A plan with a `courseHours` goal: `goals[i].progress` deep-equals `computeGoalProgress(goal, plan, data, now)`.
13. **Sections.** `sectionByDay` assigns s1 (done), s2 (not done), s1 again on a second day, and a deleted id: `{ done: 1, assigned: 2 }`. A plan with no assignments gives `sections` null.
14. **Streak pass-through.** `streak` deep-equals `streaksAt(data, now)`.
15. **Settings change does not change a planned week.** Plan daily 360, settings daily 600: `target` uses 360.
16. **`dayState` table test.** Cover every branch of §1.3, including `minutes === 0 && goal === 0` on a rest day giving `'rest'`, not `'hit'`.

Also update `ReviewPage`-related tests if they exist, and add `goals.test.ts` cases for `goalText`: a missed duration goal gives `Missed by h:mm`; met over gives `Met · +h:mm over`; a count goal gives `2 / 5`.

---

## 2. Longer Today

### 2.1 Scroll rule (explicit)

- **Lifted:** FOCUS_PLAN §7.1 and §7.3, and STRUGGLEMORE_DESIGN §4.2 (`height: 100dvh`, `overflow: hidden`, `minmax(0, 1fr)` rows) and §4.5 checks **1, 2 and 3** (the scroll-height parts). Today is now a normal flowing page at every size. The document scrolls vertically.
- **Kept:** no horizontal scroll at any width; one banner row with "1 more" (§4.5 check 3 minus the scroll clause); the TODAY block not moving between idle and running (check 4); checks 5 and 7–11. Check 6 is replaced by §4 W1 below.
- In `TodayPage.module.css`, delete the `@media (min-width: 1000px) and (min-height: 700px)` fixed-height block (`.today { height: 100dvh … overflow: hidden }`, `.start { overflow: hidden }`, and the `flex: 1` centring of `.idle`/`.running`). The Start card becomes as tall as its content. The idle/running content must still keep the TODAY block at the same vertical offset, for example with a `min-height` on the top half that the designer sets.

### 2.2 Order and layout

From top to bottom:

1. **Header**: `Today` plus the date only. The chips and `Plan →` are removed (§3).
2. **Banner row** (optional, at most one, same priority as now: storage error > 10h > carry-over). It sits **directly under the header, above the weekly card**. Banners are transient and actionable, so they come first. The weekly card is the first *card*. The 40px row is included in the budget in §3.3.
3. **This week card**, full content width.
4. **Start card | right column**, at ≥ 1000px wide; stacked below that.
   - Left: **Start card** (as now, 1.1fr).
   - Right column (1fr), stacked: an **Up next** card (only when it has rows), then the **Log card**.
5. Nothing else. No new cards beyond these.

Grid at ≥ 1000px: `grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr)`, areas `"head head" "banner banner" "week week" "start side"`. `side` is a flex column holding Up next and Log. The rows are `auto`, and `align-items: start`.

Below 1000px, the order is head → banner → week → Start → Up next → Log.

### 2.3 Data per card

| Card | Data | Source |
|---|---|---|
| This week | `WeekProgress` | `weekProgressAt(data, minuteNow)` memoised on `[data, minuteKey]` (§1) |
| Start | Unchanged props (`running`, `readout`, `todayMinutes`, `goal`, `rest`, `segments`, `todaySection`, …) | As now. The `Planned now / Next ·` line stays. |
| Up next | `todayBlocks(plan, today, nowMin)`: today's blocks sorted by `startMin`, with `endMin > nowMin` (current and upcoming only), each `{ block, courseName, sectionTitle, state: 'now' | 'next' }` | New pure function in `src/domain/plan.ts` (§2.4) |
| Log | Today's intervals, as now | As now |

### 2.4 Up next card

- **Shown** only when `plan` exists and `todayBlocks(...)` is non-empty. Otherwise it is not rendered at all: no empty state and no reserved space.
- **Rows:** up to 4 rows, then `+N more`, which links to `/plan/${ws}`. Each row reads `14:00–15:30 ● OChem · Ch 4 – Substitution`, with a `Now` tag on the current block. Rows are informational, not buttons. The card header has a `Plan →` link to `/plan/${ws}`; this is where the removed header link went.
- **Pure function:**
  ```ts
  export function todayBlocks(plan: WeekPlan | undefined, today: DateKey, nowMin: number): Array<{ block: ScheduledBlock; state: 'now' | 'next' }>
  ```
  Names are resolved in the component.
  **Tests in `plan.test.ts`:**
  - an undefined plan gives `[]`;
  - blocks on other days are excluded;
  - a block with `endMin <= nowMin` is excluded;
  - `startMin <= nowMin < endMin` gives `'now'`;
  - the output is sorted by `startMin`;
  - a block ending exactly at `nowMin` is excluded, and one starting exactly at `nowMin` is `'now'`.

### 2.5 Log card changes

- At ≥ 1000px, remove the internal scroll (`.logBody { overflow-y: auto; flex: 1; min-height: 0 }`). The list grows with its entries, and the page scrolls.
- Remove the "keep scroll at bottom on update" behaviour if the code has it, because there is no inner scroller left.
- The phone "last 3 + Show all (N)" behaviour stays.
- Rows, the empty state, `+ Add` and `N` are unchanged.

### 2.6 Carry-over banner

The banner's copy and actions are unchanged. Only its placement is fixed, as described in §2.2.

---

## 3. Removals, and the above-the-fold rule

### 3.1 Removed from Today

- The header **week chip** (`Week x / y · status`, `Link` to `/timecard`) and all of its inline maths in `TodayPage.tsx`: `weekMinutes`, `weekGoal`, `studyDays`, `elapsedStudy`, `expected`, `weekStatus` and `weekJudged`. The weekly card replaces it.
- The header **streak chip**, replaced by item H.
- The header **`Plan →` link**, replaced by the weekly card's links and Up next's `Plan →`. This leaves `.chips`, `.headChip` and `.planLink` styles unused, so delete them.
- The `minutesInDates` import and the `isRestDate` import in `TodayPage.tsx`, if either becomes unused (`isRestDate` is still used for `rest`, so keep that one).
- `LONG_RUN_MIN`, the banners and `useHotkeys({ d })` stay.

### 3.2 Not removed

- The Start card's TODAY block, which is today vs the daily goal. The weekly card's "today" bar duplicates it in summary, which is acceptable, because the TODAY block is the primary daily number.
- The `Planned now / Next ·` line in the Start card, even though Up next exists. It is the one-glance cue beside the button.

### 3.3 Above-the-fold acceptance (1280×800)

The viewport is 1280×800 (sidebar layout, `?nosplash`), with light and dark checked separately, and the page scrolled to the top. The review fixture is the existing one: 3 entries including a running timer, 4 planned blocks, a plan with 3 goals, and the carry-over banner **shown**. All of the following must be fully inside `[0, 800]`, measured with `getBoundingClientRect().bottom <= 800`:

1. the whole **This week** card;
2. the Start card's primary button (`Clock in`, or `Clock out` when running);
3. the Start card's TODAY key number (`3:23 / 8:00`).

Check this in both the idle and running states, and again with 2 goals and with 5 goals (`+2 more`). Budget for the designer: on desktop at ≥ 1000px, the weekly card is **≤ 184px tall** with the banner shown (24 pad + 40 head + 12 + 40 banner + 12 + **184** + 16 gap leaves ≈ 472px for the Start card's top-to-TODAY content). The goals list must therefore sit beside the day row, not below it.

On a 390×844 phone, the weekly card shows a **compact** variant: B, C, a mini 7-day row, and H inline. G, D and I go behind a `Details` disclosure, which is a `<button aria-expanded>` with collapsed state held in component state (not persisted). Acceptance: the `Clock in` button is fully above the tab bar without scrolling. This relaxes STRUGGLEMORE §4.5 check 10, which required "the whole Start card".

---

## 4. Milestones and acceptance criteria

Every milestone ends with `npm run typecheck`, `npm test` and `npm run build` clean, and is committed on `round3`. There is no schema change and there are no new storage keys.

### W0: Domain and selectors (no UI)

- Add `src/domain/weekProgress.ts` and `weekProgress.test.ts`, covering all 16 cases in §1.7.
- Move `STATUS_LABEL`, `STATUS_CHIP` and `goalText` into `goals.ts`, with tests. `ReviewPage` imports them and renders the same.
- Add `todayBlocks` to `plan.ts`, with the §2.4 tests.
- Add `weekProgressAt` to `selectors.ts`.
- **Acceptance:**
  - [ ] All new tests pass, and no existing test has changed apart from imports.
  - [ ] `git diff` touches no `.tsx` file except `ReviewPage.tsx`, and that change is imports only.
  - [ ] The Review page looks pixel-identical to before for the fixture (screenshot diff, or check by eye).

### W1: This week card and header cleanup

- Add `src/pages/today/WeekCard.tsx` (and its CSS module), rendered at the top of Today per §1.2–§1.5.
- Remove the header chips, `Plan →` and the inline week maths (§3.1).
- **Acceptance:**
  - [ ] With the fixture, the card's total, target and status match `weekProgress(data, now)`. The total equals Timecard's week total for the same week, and Review's `weekTotal` / `weeklyGoal` when the plan uses default goals.
  - [ ] A running timer moves the total and today's bar within 60 s. Stopping it does not change the total (entry minutes = the live minutes).
  - [ ] No plan: the card shows `Default target (no plan)` and a `Plan week →` button that goes to `/plan/<ws>`. Clicking it creates no plan until the user acts on Plan week, so `weekPlans` is unchanged right after the click.
  - [ ] Monday with no time logged: no `Behind` anywhere on the card.
  - [ ] Met week: `Met` plus `+h:mm over`. Sunday shows `Review week →` and `Plan next week →` with the correct URLs.
  - [ ] Rest days are marked, and today is highlighted and announced (accessible name per §1.5). Day cells go to `/timecard/<ws>`. `Edit goals` and `+N more` go to Plan and Review.
  - [ ] Streak text: `N-day streak · best M`, hidden at 0/0. It equals `streaksAt(...)`.
  - [ ] The header shows only `Today` and the date. `grep -n "chip-\${weekStatus}\|weekJudged" src` finds nothing.

### W2: Longer layout, Up next, Log growth

- Make Today flow (§2.1), add the grid from §2.2, add the Up next card (§2.4) and the Log changes (§2.5). Pick up the designer's visuals from `ROUND3_DESIGN.md`.
- **Acceptance:**
  - [ ] §3.3 above-the-fold checks pass at 1280×800 (idle and running; 2/3/5 goals; banner shown), light and dark.
  - [ ] At 1440×900, everything in §3.3 plus the top of the Log card is visible.
  - [ ] With 15 logged entries, the **page** scrolls and the Log card has no inner scrollbar (`logBody.scrollHeight === logBody.clientHeight`). The reviewer must **not** flag document scroll; it is intended (§2.1).
  - [ ] Up next is hidden with no plan, and also when all of today's blocks are past. With the fixture at 13:00, the current block shows `Now`, and past blocks are absent. More than 4 remaining blocks show `+N more`.
  - [ ] Idle → Clock in → running: the TODAY block moves by no more than ±2px, and the weekly card does not move.
  - [ ] There is still at most one banner row, and "1 more" toggles. The banner sits between the header and the weekly card.
  - [ ] At 999×800, the stacked order is head, banner, week, Start, Up next, Log. At 375px there is no horizontal scroll. At 390×844, the compact weekly card shows, `Details` toggles (`aria-expanded`), and `Clock in` is fully above the tab bar.
  - [ ] axe shows no new violations. Every day-bar state and status chip meets 4.5:1 for text, and 3:1 for bar fill against its track.
  - [ ] Screenshots go in `docs/screenshots/round3/`: `today-1280x800.png`, `today-1280x800-running.png`, `today-1440x900-dark.png`, `today-noplan-1280x800.png`, `today-390.png` and `today-15entries-1280x800-full.png` (full page).

### Out of scope (round 3)

- No `?day=` deep link into Timecard.
- No goal editing on Today.
- No new streak definition.
- No changes to the Plan, Timecard or Review pages beyond the `goalText` refactor.
- The focus animation is entirely the designer's area (`ROUND3_DESIGN.md`).
