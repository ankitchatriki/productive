# Productive v1: review

Reviewer: reviewer agent · Branch: `build-v1` at `fd7065c` · Date: 2026-10-26
Method: read PLAN.md, DESIGN.md and all of `src/`; ran `npm test` (135 tests, all pass), `npm run typecheck` (clean) and `npm run build` (clean, 323 kB JS / 101 kB gzip). Drove the production build (`vite preview`) with Playwright in Chromium using a faked clock (`page.clock`) and `timezoneId: Europe/London`, at 1280px, 400px, 375px and 360px, in light and dark mode. Ran extra domain checks (DST, shift, streaks, pacing, import validation) from a scratch bundle under `TZ=Europe/London` and `TZ=America/Santiago`. Screenshots are in `docs/review/`.

## Verdict

**Ship after fixing the three Major findings. None of them is a blocker.** The core loop works end to end for a new user: onboarding, a course with sections, planning a week (goals, a section per day, drag-made blocks), clocking in, switching and clocking out, manual entries with every validation rule, Timecard totals, and Review goal statuses that match PLAN 4.2. The domain logic is solid. Midnight splitting, DST days, Sunday-to-Monday splits, goal pacing, streaks and carry-over all behaved correctly in every case I tried. Persistence, reload with a running timer, export/import round-trip and the 10h+ banner all work. Dark mode and the 360–400px layouts look clean, with no horizontal scroll on any page. The Major problems are:

- Undo restores a stale snapshot of the whole app, so it can silently delete work done after the action it undoes.
- The phone Timecard shows `NaN:NaN` after you change the week.
- On desktop you can't create a time block without a mouse, which fails the M9 keyboard criterion.

The other findings are edge-case correctness and polish.

## Findings

Severity counts: **Blocker 0 · Major 3 · Minor 6 · Nit 6**

| ID | Sev | Title | Where | What happens vs. what should happen | Repro | Suggested fix |
|---|---|---|---|---|---|---|
| R1 | Major | Undo restores a stale whole-app snapshot and discards later changes | `src/state/timer.ts:54` (clock-out Undo), `src/pages/CourseDetailPage.tsx:71-74` (section delete Undo) | Clock-out's Undo dispatches `data/replace` with the `data` captured *before* the clock-out. Anything done during the 8s toast window disappears without warning. **Observed:** I clocked out, added a manual 06:00–07:00 entry, then clicked Undo. Entries went 7 → 5, the manual entry was gone and the timer was back. Section-delete Undo does the same with `snapshot`, which can also undo a clock-out that happened in between. PLAN §3 "Undo… restores the exact object". | Run a timer → Space (clock out) → `N`, add any valid entry → click Undo on the "Logged…" toast. | Undo should reverse only its own change. For clock-out: delete the created entry by id and restore `activeTimer` (a new `timer/restore` action, or `entry/delete` + `timer/start`). For section delete: re-insert the section, then restore `sectionId` on only the entries, blocks and plan days the delete changed (record those ids when deleting). |
| R2 | Major | Phone Timecard shows `NaN:NaN` and no selected day after changing week | `src/pages/TimecardPage.tsx:44, 203-224` | `phoneDay` is initialised once and never reset when `weekStart` changes. In another week, `dates.indexOf(phoneDay)` is −1, so `tc.dayTotals[-1]` is `undefined`. The page shows "Day total **NaN:NaN** / NaN:NaN", "Nothing logged on Wed 28 Oct" (a date from the other week) and no tab selected. Screenshot `review/12-phone-timecard-prev-week.png`. | Width 400 → `#/timecard` → tap ‹ (or press `[`). | Key the body on `weekStart` (`<TimecardBody key={weekStart}/>`, as PlanPage already does), or reset `phoneDay` in an effect when `weekStart` changes. `extraRows` has the same stale-state problem (see R14). |
| R3 | Major | No keyboard way to create a time block on desktop | `src/pages/PlanPage.tsx:351`, `src/components/WeekGrid.tsx:217-222` | On desktop, blocks can only be created by pointer drag or click on a grid column. The columns have no `tabIndex` (measured `-1`) and "+ Add block" is rendered only when `isPhone`. Keyboard users can edit, move and delete existing blocks, but can't make one, so M9's "All interactive elements are keyboard-reachable" and the user's "schedule a week of time blocks" fail for them. | 1280px → `#/plan` → Tab through the Time blocks panel: no control creates a block. | Show the "+ Add block" button (it opens the existing `BlockPopover` form) at every width, defaulting to today or Monday. Optionally make day columns focusable with Enter = add a 60-minute block. |
| R4 | Minor | "Do it today" shift loses a section that sits on a rest day | `src/domain/plan.ts:37-44` (`shiftPlanFrom`) | Each section moves to "the next non-rest day after its own day", so two sources can land on the same target. **Verified:** Wed is a rest day; Tue=A, Wed=B, Thu=C; shift from Tue with X gives Tue=X, Thu=B, Fri=C. **A is gone and isn't in `dropped`**, so no toast. PLAN 3.2 allows assigning sections to rest days. | Unit check in a scratch bundle (see Method); in the UI: mark Wed as a rest day, assign Tue/Wed/Thu, trigger carry-over on Tue. | Collect the sections assigned from `today` onward in order, then lay them out over the remaining non-rest days after `today`; overflow → `dropped`. Add a test for this case. |
| R5 | Minor | Onboarding: going back to step 1 and forward again creates a duplicate course | `src/pages/WelcomePage.tsx:72, 42-56` (`step2`) | The "Edit" button on step 1 stays visible on steps 2 and 3. Clicking Next again re-runs `step2`, which adds another course with new sections. **Observed:** courses `['Physics','Physics']`, 4 sections. Also, changing the daily goal after step 2 updates settings but not the week plan that was already created. | Fresh profile → Next → name "Physics", sections "A\nB" → Next → Edit (step 1) → Next → Next. | In `step2`, if `courseId` is already set, update that course and its sections instead of adding new ones (or hide "Edit" once the course exists). Re-apply goal and rest days to the plan when step 1 is re-submitted. |
| R6 | Minor | Import accepts semantically broken data | `src/domain/validate.ts:24-26, 54-65` | Accepted without error: duplicate entry ids, overlapping entries (double billing, which the app otherwise forbids), and `gridStartHour: 30, gridEndHour: -5`. The last one collapses the Plan week grid to zero height, so no blocks can be made (screenshot `review/11-import-bad-grid-hours.png`). Unvalidated settings are passed straight through. | Settings → Import a backup with one duplicated entry and grid hours 30/−5 → Replace → open Plan. | Range-check settings (0 ≤ start < end ≤ 24, goal 1–1440 min) and block minutes (multiples of 15, within 0–1440). Reject duplicate ids. Report overlapping entries as errors, or at least as warnings. |
| R7 | Minor | Timecard cell panel and Entry dialog stack as two modals | `src/pages/TimecardPage.tsx:278-290` | Clicking ✎ in the cell panel opens the Entry dialog *on top of* the still-open cell panel modal. Two `role="dialog"` elements exist and two focus-trap keydown handlers run. Esc closes only the top one. Screenshot `review/13-timecard-stacked-dialogs.png`. | `#/timecard` → click any non-empty cell → click ✎. | Close the panel before opening the Entry dialog and reopen it on close, or edit inline inside the panel. DESIGN 4.12 specifies a drawer here. |
| R8 | Minor | Today's streak ignores the running timer, so Today and Review can disagree | `src/pages/TodayPage.tsx:74` (verified by code; not reproduced in the browser) | `computeStreaks(data, today)` is called without `now`, so a day completed only through the running timer isn't counted on Today. Review passes `now` (`ReviewPage.tsx:46`) and counts it. | Hit today's goal with the timer still running: Today shows N-day streak, Review shows N+1. | Pass `now` (a minute-granular value is enough) on Today too. |
| R9 | Minor | One bad field in storage discards the whole dataset on load | `src/storage/localStorage.ts:38-47` + `validateAppData` | Load runs the full import validator. Any single invalid value (e.g. a goal target that serialises to `null`) moves *everything* to `productive:v1:corrupt` and starts empty, and no UI says so or offers recovery. This matches PLAN M2 literally. I found no current UI path that writes invalid data (Chrome clears `1e400` in number inputs), but it is fragile. | Hand-edit `productive:v1` to set one goal's `targetMinutes` to `null`, then reload: empty app, no notice. | On load, show a banner when a corrupt copy exists, with "Download the raw copy". Consider cleaning repairable fields (drop the bad goal) instead of rejecting the whole file. |
| R10 | Nit | Goal count input has no upper bound | `src/pages/PlanPage.tsx:288-289` | `max={999}` is only a hint, and `onChange` accepts `1e30` (observed stored as `1e+30`). | Plan → Sections-completed target → type `1e30`. | Clamp in `onChange` (`Math.min(999, n)`). |
| R11 | Nit | Courses page with only archived courses shows an empty "Active courses" grid | `src/pages/CoursesPage.tsx:55` (by code) | The empty state is shown only when `courses.length === 0`. With everything archived, the user sees a heading and nothing below it. | Archive every course. | Base the check on visible courses and keep the "Show archived" toggle. |
| R12 | Nit | CSV cells aren't protected against spreadsheet formula injection | `src/domain/csv.ts:264-267` | A note starting with `=`, `+`, `-` or `@` is exported as-is. The data is the user's own, so the risk is low. | Note `=1+1` → Export CSV → open in Excel. | Prefix such cells with `'`. |
| R13 | Nit | Phone Timecard empty week shows the empty-state card *and* the day card | `src/pages/TimecardPage.tsx:114-229` | Redundant; see `review/12-phone-timecard-prev-week.png`. | Phone, empty week. | Hide the day card (or the empty state) when `tc.rows.length === 0`. |
| R14 | Nit | Timecard "+ Add row" selections carry over to other weeks | `src/pages/TimecardPage.tsx:41` | `extraRows` isn't reset when the week changes. Same cause as R2. | Add a row, press `]`. | Same fix as R2. |
| R15 | Nit | Chart and heatmap labels | `ReviewPage.tsx:228`, `Heatmap.tsx` | 12-week axis labels read "7 Sept" (en-GB `Intl` short month). The 26-week heatmap has no month or week labels, so it's hard to place a cell without hovering. | `#/review` | Use a fixed 3-letter month. Add month labels above the heatmap columns. |
| R16 | Nit | DST tests cover one time zone only | `vite.config.ts` (`test.env.TZ = 'Europe/London'`) | Fine for UK users. My ad-hoc run under `America/Santiago` also passed, but the suite doesn't exercise a zone where midnight itself is skipped. | — | Optionally run `time.test.ts` under a second TZ. |

Checked and **not** a problem: the `1`–`6`, `[`, `]`, `T`, `?`, `N`, `S` and `D` shortcuts work; non-Monday URLs normalise; unknown routes redirect; switching sections produces adjacent entries with no gap; reload immediately after Clock in (within the 300ms debounce) keeps the timer thanks to the `pagehide` flush; the "Also apply to this week?" prompt appears; export → import round-trips byte-identical data; deleting a course with entries is blocked with an "Archive instead" dialog.

## Acceptance criteria

Legend: ✅ pass · ⚠️ partial · ❌ fail

**M0 — Scaffold**
- ✅ Nav shown; all 8 routes render; unknown route → Today (`#/nope` → `#/`).
- ✅ Bottom tab bar below 720px; no horizontal scroll at 400/375/360 on Today, Plan, Timecard, Courses, Course detail, Review and Settings (measured `scrollWidth == clientWidth`).
- ✅ Build works from a sub-path (served `dist` at `/app/`, app booted with no failed requests).

**M1 — Domain core + tests**
- ✅ Tests cover `weekStartOf`, `splitByLocalDay` (same day, cross-midnight, multi-day, DST start and end), overlap/touching, `parseBulkSections`, and every 4.6 validation message. My independent DST checks match.

**M2 — Store + storage**
- ✅ Reducer tests for every action, including section-delete side effects, <60s discard and overlap trimming.
- ✅ Reload keeps all data and a running timer.
- ✅ Corrupt JSON → empty start plus a raw copy under `productive:v1:corrupt` (unit-tested; see R9 for the UX gap).

**M3 — Courses & Sections**
- ✅ Create, rename, recolour, archive; delete blocked with a message when entries exist (observed).
- ✅ Add one / Add many with `| hours`; ↑/↓ reorder; tick done; delete with Undo. ⚠️ The delete Undo has the snapshot bug in R1.
- ✅ Logged hours, status chip, and an amber estimate bar when over (by code and screenshot).

**M4 — Today**
- ✅ Space clocks in/out from any page and is ignored in fields; the timer pill shows on non-Today pages.
- ✅ Ring includes the running timer and ticks; "Goal hit" / overtime chip; "Rest day" label.
- ✅ Switch creates adjacent entries (`11:30:07.182Z` end = next start).
- ✅ Entry dialog rejects overlap, future end, >16h and end ≤ start with inline messages; "Ends next day" works; edit and delete work.
- ✅ 23:30–00:30 counts 0.50 on each day in Timecard.
- ✅ 10h+ banner appears; "Stop at last activity…" prefills and clocks out at the chosen end.

**M5 — Plan Week**
- ✅ Opening a week creates a plan with default goals (36:00 = 6h × 6, 6 days).
- ✅ Goals CRUD for all four kinds; course selects list only non-archived courses.
- ✅ Per-day section select; Auto-assign fills from today with the next unfinished sections in order.
- ✅ Drag-create snaps to 15 min; click makes 60 min; popover edits and deletes; move across days and resize work; an overlapping drop snaps back with a toast; per-day and week totals are correct.
- ✅ Copy last week's blocks and goals, with a confirm when overwriting (by code).
- ✅ Mobile: day tabs plus "Add block" form.
- ✅ `[`/`]` change the week, the URL updates, and non-Monday URLs normalise.
- ❌ Desktop keyboard users can't create blocks (R3), which fails the M9 cross-cutting criterion.

**M6 — Today plan integration**
- ✅ Assigned section shown; picker defaults to it; Mark done (also `D`); timeline shows planned vs actual with adherence (75% observed, correct).
- ⚠️ Carry-over banner and shift work as in 4.3 (observed shift and the "Ch 4 moved off this week" toast); Dismiss lasts for the session. Shift loses a section in the rest-day case (R4).
- ✅ "No plan for this week" banner links to Plan.

**M7 — Timecard**
- ✅ Row, column and grand totals match the entries; cross-midnight and Sunday→Monday splits are correct.
- ⚠️ Section sub-rows including "General"; cell click opens the entry list with edit/add, but it stacks dialogs (R7).
- ✅ Day totals turn green when ≥ that day's goal (with a hidden "(goal met)" text and ✓).
- ✅ CSV has the specified columns, one row per overlapping entry; the print view shows only grid + summary (`review/15-timecard-print.png`).
- ❌ Phone view breaks after a week change (R2).

**M8 — Review & Insights**
- ✅ Goal statuses match 4.2: met, on_track, behind, missed, early-missed dailyGoalDays and future week (fixture tests plus my pacing checks for Mon/Tue/Sun/next week/previous week).
- ⚠️ Streak current/best match 4.4 (tests plus my rest-day check: Sat hit, Sun rest, Mon hit, Tue unfinished → 2). Today ignores the running timer (R8).
- ✅ Week chart with goal line and hatched planned ghosts; sections planned vs done with ○/✓/✗ and "carried"; course breakdown; reflection autosaves ("Saved").
- ✅ 26-week heatmap with 5 levels and a goal-met dot; the 12-week chart renders with empty data.

**M9 — Settings, onboarding, polish**
- ⚠️ Export gives valid JSON named `productive-backup-YYYY-MM-DD.json`; import round-trips identically; invalid JSON and invalid schema list errors and change nothing; Reset needs `RESET`. Semantically broken files are still accepted (R6).
- ✅ Changing the daily goal asks "Also apply to this week?"; past weeks keep their snapshot.
- ⚠️ Fresh browser → `#/welcome`; the 3 steps produce a course, sections and a plan assigned from today (Mon/Tue left empty on a Wednesday start); lands on Today; Skip works. Going back duplicates the course (R5).
- ⚠️ All 4.9 empty states are present; the `?` overlay lists every shortcut; buttons have accessible names; focus is visible. Desktop keyboard users can't create blocks (R3).
- ⚠️ Usable at 375px on every page with no console errors, except the phone Timecard after a week change (R2).

## Design conformance

- **Tokens:** `src/styles/tokens.css` matches DESIGN 2.2 exactly (diffed the `:root` block). Component CSS uses `var(--…)` everywhere. The only raw hex values are the sanctioned toast-action colours and print-only greys.
- **Typography:** IBM Plex Sans/Mono are linked. Durations, clock times and table numbers are mono with tabular figures, and durations use `h:mm` throughout. The Timecard defaults to decimal `2.50` with an `h:mm` toggle (PLAN 3.3 wins over DESIGN 4.7). Page titles, eyebrows and card titles follow the scale.
- **Colour and states:** "planned = hatched outline, logged = solid" is applied consistently on the Today timeline, the Plan grid and the Review chart. Status chips always carry an icon and text, not colour alone. Today's column tint, the now-line and the rest-day hatch are all present. Dark mode (`review/dark-*.png`) has good contrast and no unthemed surfaces.
- **Copy:** Sentence case and calm tone, with "Clock in/out", "Logged", "Planned", "Rest day" and "Entry" used consistently. Errors say what to do ("End time must be after start time."). Minor drift: some toasts and banners use an em dash ("Under a minute — not logged.") where DESIGN prefers a `·` separator, and the review goal chip says "Behind" without the amount ("Behind 3:20" in DESIGN 4.5).
- **Deviations that are reasonable because PLAN takes precedence:** shortcuts follow PLAN §5 (Space, 1–6, `[`/`]`), not DESIGN's `I`/`O`/`G x`; there's no ⌘K palette or theme switcher (PLAN marks the theme switcher out of scope); the long-run guard is the PLAN 10h banner, not DESIGN's 4h modal; the Timecard has no GOAL/Δ columns; the nav breakpoint is 720px (PLAN) rather than the 768/1200 sidebar/rail split.
- **Gaps relative to DESIGN:** the Timecard cell editor is a modal, not a right-side drawer (and it stacks, R7); the Plan sections sidebar with drag-onto-day is not implemented (selects are used instead, which is fine and accessible); the heatmap is small (12px cells) and has no month labels (R15).

## What's good

- The domain layer is clean and pure and the tests are meaningful: `splitByLocalDay`, goal pacing and streaks are correct under DST and across midnight, and every PLAN rule has a matching test.
- The timer is robust. It survives reload (with a `pagehide` flush), trims overlaps, discards entries under a minute, and handles midnight on Today (`↩ 0:00–now`, ring restarting from the post-midnight part). Switching leaves no gaps.
- The Plan week grid is good to use: drag-create, move across days, resize, a snap-back toast on overlap, and keyboard arrows to move blocks.
- Phone layouts (day tabs, the "Week totals" toggle, the bottom tab bar with "More") are well done, and there is no horizontal scroll down to 360px.
- Accessibility basics are in place: labelled controls, `aria-pressed` rest-day chips, a roving-tabindex heatmap, polite live regions, and focus trap and focus restore in modals.

## Resolution

Fixes by the coder agent on `build-v1`. Each logic fix has a regression test; `npm test` is at 152 passing tests, and typecheck and build are clean.

| ID | Outcome | Commit | Notes |
|---|---|---|---|
| R1 | Fixed | a93b9d8 | Undo no longer restores a snapshot of the whole app. Clock-out Undo uses the new `timer/restore` action, which removes only that entry and restores the timer. It does nothing if a newer timer is running. Section-delete Undo uses `section/restore` with a record of exactly what the delete changed: the entries, blocks and plan days that pointed at the section. The goal-remove and clear-sections Undos were also made targeted (`plan/insertGoal`, `plan/fillDays`). Tests are in `reducer.test.ts`. |
| R2 | Fixed | c6ddc6e | The Timecard body is keyed on `weekStart`, so the selected phone day, added rows and open panel all reset when the week changes. Checked in the browser: no `NaN`, and a day tab is selected. |
| R3 | Fixed | f45269f | "Add block" is shown at every width. It opens the block form (day, start and end time, course, section), which can be used entirely from the keyboard. The help text lists the block keyboard controls. |
| R4 | Fixed | 2cc8152 | `shiftPlanFrom` never puts a section on a day already taken by an earlier section. Sections that fall off Sunday all go to `dropped`. Tests: the rest-day collision case and the overflow case. |
| R5 | Fixed | a936d87 | Onboarding now runs through a pure `onboardingActions` function. Re-running step 2 updates the same course, replaces its sections and rebuilds this week's plan. Re-submitting step 1 also updates the existing plan's goal, rest days and default goals. Tests are in `state/onboarding.test.ts`. |
| R6 | Fixed | f375552 | Import now checks ranges: grid hours 0 ≤ start < end ≤ 24, daily goal 1–1440 minutes, goal targets > 0. Blocks must start and end on 15-minute steps within the day and must not overlap. Duplicate ids and overlapping entries are reported as errors. Tests are in `validate.test.ts`. |
| R7 | Fixed | c6ddc6e | The cell panel closes while the Entry dialog is open and reopens when it closes, so only one dialog exists at a time. A modal was kept rather than a drawer. |
| R8 | Fixed | d353c23 | Today and Review share `streaksAt(data, now)`, which includes the running timer. Test in `selectors.test.ts`. |
| R9 | Fixed | f375552 | An invalid goal is dropped with a warning instead of rejecting the whole dataset. When stored data is still unreadable, a banner on every screen, including Welcome, offers "Download raw copy" and "Dismiss". Tests are in `localStorage.test.ts`. |
| R10 | Fixed | 0167ac4 | Count targets are clamped (1–999, or 1–7 for days). |
| R11 | Fixed | 0167ac4 | With only archived courses, the Courses page shows the empty state plus a "Show archived" link. |
| R12 | Fixed | 0167ac4 | CSV cells starting with `= + - @` are prefixed with `'`. Tested. |
| R13 | Fixed | c6ddc6e | The phone day card is hidden for an empty week. |
| R14 | Fixed | c6ddc6e | Fixed by the same change as R2. |
| R15 | Fixed | 0167ac4 | Month names are fixed three-letter abbreviations ("Sep"), and the heatmap has month labels above its columns. |
| R16 | Skipped | — | Optional. Vitest's `test.env.TZ` applies to the whole run, so adding a second time zone would need a separate project or script. The reviewer's ad-hoc `America/Santiago` run already passed. |
