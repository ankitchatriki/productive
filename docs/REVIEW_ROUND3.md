# Review: round 3 (weekly card, longer Today, Sisyphus v2)

Reviewer, branch `round3` at `c858547`. I checked everything myself and did not trust commit messages. Screenshots are in `docs/review/round3/`.

## Verdict

**Changes requested, for the animation only.**

- **The weekly card and the longer Today are ready.** Every number on the card matched my hand calculation across five seeded weeks. All the links work, and the 1280×800 above-the-fold rule passes in all 12 combinations tested.
- **The scene is clearly better than round 2.** Light now changes with the time of day, the mountain has rock strata, the range has snow-capped peaks, the figure has a real body and the summit is a proper climax.
- **But the animation has four visible defects** that a user will see on every block:
  - the stone floats above the summit;
  - the figure sinks into the stone at the summit;
  - the stone has a pale "ghost" crescent on one side;
  - at 1280 and 1440 wide, the main mountain is still one flat-topped table ending in a cliff. The user asked for "a mountain with different tops", and at these sizes the different tops come only from the paper-cut peaks in the background.

**Counts:** 0 Blocker · 4 Major · 10 Minor · 8 Nit.

Build health: `npm test` passes 286/286 (27 files). `npm run typecheck` and `npm run build` are clean. No page errors or console errors appeared in any Playwright run.

---

## Findings

### Major

**T1 · The stone floats above the summit (Summit, Break, Overtime)**
- **Where:** `sisyphus.ts`, the boulder centre in the stand/sit modes, and the contact AO in `drawShadow`.
- **Actual:** At 1440×900, once the summit sequence settles, the bottom of the boulder is about 6 px above the platform, with sky showing in between. The dark contact-AO ellipse lies flat on the platform under it, so the stone looks like it is sitting on a plate. It stays like this for the whole overtime and break. At noon mid-climb the AO also reads as a separate disc under the stone.
  - Evidence: `summit-boulder-floating-3x.png`, `summit-sequence-18frames.png` frames 9–17, `boulder-noon-checker-4x.png`.
  - Pixel scan of column x=1220 in summit frame 14: stone to y=220, sky-tone band from y=220 to 226, AO from y=227 to 232, platform from y=233.
- **Expected:** The AO sits "exactly under the contact point (no offset)", and the stone sits on the ground (§3.2 contact AO; §3.10 settle). R4 also requires "the stone's AO touches the contact point (no gap)".
- **Repro:** Start a 25-minute block, then fast-forward past its end. Watch the summit at 1440×900.
- **Fix (unverified):** In stand/sit modes, compute the summit and plateau stone centre from `path.centreAt(s, R)`, or from `groundY + R`, the same way as during the climb. Check whether the settle spring (§3.10, ±0.01H) is left with a positive offset after it settles. The existing "never penetrates" test only covers the climb, so add a test that the stone touches the ground in stand/sit poses.

**T2 · At desktop sizes the main mountain still has one flat top and a cliff (the user's "different tops" ask is only partly met)**
- **Where:** `ridge.ts` (`RIDGES.landscape.summit` = (1.24, 0.74), `platformLen` 0.21, `backSide`) and the camera framing.
- **Actual:** At 1280×800 and 1440×900:
  - The climb ends in a long flat platform (a table top).
  - Right of the summit cairn the mountain drops as a sheer dark wall.
  - The col, the twin peak and the arête are off-screen or squeezed into a dark sliver about 100 px wide at the right edge.
  - The benches show only as gentle shoulders: they do not read as false summits from below, though the cairns help.
  - The only "different tops" are the evenly spaced, near-identical tent peaks with white caps in the background.

  On 3440×1440 and on a landscape phone, the back side does appear, but as a regular sawtooth staircase with five equal steps, which looks drawn with a ruler. On a portrait phone the neighbour peaks are almost invisible, and the summit and cairn sit on the right edge.
  - Evidence: `landscape-1280-p95-cliff-backside.png`, `landscape-1440-p50.png`, `ultrawide-3440-p50-scaled.png`, `phone-390-p0-p50-p95-summit.png`.
- **Expected:**
  - §3.3.1: the true summit is "a pointed rock block".
  - §3.3.6, landscape: "col + twin peak + 3–5 arête teeth, **all on screen**".
  - R5: "the back side is jagged with two shoulder steps".
- **Fix (unverified):**
  - Frame the landscape layout so that the summit lip lands at about 0.75–0.8 of the width and the twin peak and arête fit on screen. That means moving `summit.x`, or narrowing the world-to-screen scale.
  - Make the summit platform shorter and give it a pointed block behind the stone.
  - Vary the arête teeth more than the current hash ranges do (different heights and run lengths), and add an inset step or two.
  - Add the R5a/R5 geometry test that the twin peak's x lies inside the viewport at 1280×800 and 1440×900.

**T3 · At the summit the figure sinks into the stone and stands on the brink**
- **Where:** the summit "stand" pose (`solveStand` / summit beats in `sisyphus.ts`).
- **Actual:**
  - From the heave onward, the figure's head, shoulder and arm overlap the boulder disc. `summit-figure-overlaps-stone-3x.png` (summit frame 8) shows the head and arm drawn over the stone.
  - In the final pose (summit frames 12–17), the right side of the torso sits inside the stone's silhouette.
  - The feet are at the platform's left corner, so he stands on the edge of the cliff.
  - In summit frames 6–7 the heave pose briefly reads as a man lying flat on the slope and then leaping.
- **Expected:** §3.10 says "near hand rests on top of the stone, far arm hangs, chin lifts", with the figure clearly beside the stone on the summit platform.
- **Fix (unverified):** Offset the stand pose's pelvis x by at least R + 0.25H from the stone centre. Clamp the feet at least 0.04 inside the platform start. Add a test that the stand-pose torso polygon does not intersect the boulder circle.

**T4 · The boulder has a pale "ghost" crescent (it looks like a double exposure)**
- **Where:** the rim pass in `drawBoulder` (`sisyphus.ts` ~1087–1095).
- **Actual:** On the sun side the stone shows a pale crescent 4–8 px wide (at 1440@1x) that sits outside the textured face. It reads as a second, offset disc. It is visible at dawn (`boulder-ghost-rim-and-checker-4x.png`, the 12-frame sheet), at golden hour (summit frame 8), and at DPR 2.
- **Likely cause (unverified):**
  - The rim ring is built after `g.rotate(-rot)`, using the **unrotated** lumpy `boulderOutline` as the hole.
  - But the clip and the texture use the rotated outline.
  - As the stone rolls, the hole no longer matches the silhouette, so the mismatch shows as a wide band.
- **Expected:** A thin warm rim of `rimW` px (1.5–2.75) on the edge (§3.4 item 4, §3.8).
- **Fix (unverified):** Build the ring in the same rotated frame as the clip. For example, draw the rim before `g.rotate(-rot)` and rotate the offset vector L by `-rot`.

### Minor

**T5 · The boulder texture is a blocky checkerboard.** The mottling is drawn as flat `fillRect` squares per noise cell (`buildBoulderTexture`, two octaves), so it reads as a quilt of squares at 1× and 2×.
- Evidence: `boulder-noon-checker-4x.png`, `boulder-ghost-rim-and-checker-4x.png`.
- This was already there in round 2, but it stands out more now that the rest of the scene has texture.
- Fix: use interpolated value noise (bilinear across cells), or blur the cache once (`ctx.filter='blur(…)'` at build), or draw soft radial blobs.

**T6 · The TODAY block moves 9 px when you clock in with a block** (W2 allows ±2 px).
- Clocking in from idle with a 25-minute chip and `enterOnClockIn: false` moves the key number from y=672 to 681.
- Cause: the running state adds the Block progress row, and `Back to focus / Clock out / Switch` wraps to two rows at 1280 wide. The content is 279 px tall, but `.idle, .running { min-height: 268px }`.
- A running timer with no block stays within 2 px.
- Evidence: `start-idle.png`, `start-running.png`.
- Fix: raise `min-height` to 284 px, or keep the actions on one row at ≥1000 px wide.

**T7 · Week-bar contrast in the light theme fails the 3:1 rule** (W2 a11y row).
- Measured from computed styles:
  - a short past bar (`--week-bar-past` = heat-3) on its `--surface-2` track: **2.0:1**;
  - a rest-day fill on the card background: **2.42:1**;
  - goal-met: 4.37:1; today: 4.96:1.
- The dark theme passes everywhere (4.75–7.3:1). The text values are all ≥ 5.3:1.
- Fix: use heat-4 for past bars in light, or give the track a darker border.

**T8 · The W1 acceptance "Plan week → creates no plan" cannot pass as written.**
- In the no-plan state, clicking `Plan week →` leaves `weekPlans` at `[] → ['2026-10-26']` right away.
- Cause: `PlanPage` dispatches `plan/ensure` on mount. This predates round 3, and plan §1.4 itself says "Plan week creates it as it does today".
- The spec contradicts itself. The planner should either drop the acceptance row or make Plan create the plan lazily on the first edit.

**T9 · The milestone beat cannot be confirmed by eye, and the "skip for blocks under 15 min" rule is not implemented.**
- The bench cairns do light and stay lit after each crossing (`false-summits-25-50-75.png`).
- But in 500 ms frames through each crossing I could not see the look-up or the exhale at 1440×900 (the figure is about 45 px tall).
- `setProgress` triggers the beat on any live crossing. The engine is never told the block length, so a 10-minute block also gets beats.
- No test covers "plays once per crossing / never after a reload" (R5a).

**T10 · Several animation acceptance rows have no test.** None of these exist:
- R5a: the hands move continuously across a crest (< 1 px per frame); no snow within 0.02 of the path.
- R8: a box test that keeps clouds out from behind the stone across p = 0…1. Only the fade helper is tested.
- R9: `Summit.` timing, and `instant` rendering the final frame.
- R10: the perf and "no rebuild spike" checks. I measured these by hand below.

**T11 · Reduced motion still redraws at most once a minute.**
- `setProgress` keeps round 2's `moved >= 1 && t - lastDraw >= 60`.
- §3.11 asks for a redraw when the stone moves ≥ 2 px **or** every 30 s.
- In a 25-minute block at 1440 wide, the stone jumps about 60 px once a minute.

**T12 · The figure's silhouette has some odd details.**
- The two hair wisps stick up like antennae or horns in most frames.
- The far foot is drawn as a blue-grey loop that looks detached from the leg (frames 1–2 of `anim-push-12frames-130ms.png`).
- The figure is about 45 px tall next to a stone about 130 px across.
- He does read as a person straining, crouched with his arms locked. But at 1440 wide you can't make out the new detail (calf, deltoid, heel lift) without zooming in.

**T13 · Phone portrait (390×844) framing.**
- At p≈0 the figure is pressed against the left edge (x ≈ 10–50 px).
- The summit and cairn sit on the right edge.
- The neighbour peaks are faint grey bumps, so on a phone the "range with different tops" is effectively absent.
- Evidence: `phone-390-p0-p50-p95-summit.png`.

**T14 · The strata look like wallpaper, and the gullies look like drips.**
- The bed lines are evenly spaced, parallel waves running across the whole face. At 1280/1440 they read as corrugated sheet or contour stripes more than rock.
- The gully strips (§3.3.7) show up as vertical dark streaks through the strata. For example, under the figure in `landscape-1280-p95-cliff-backside.png` at x≈830.
- Fix: vary the spacing per band, fade the bands with depth, and break the gully strips with noise.

### Nits

- **T15 · The live part of today's bar is drawn from the bottom.** `.live` is positioned at `bottom: 0`, so it covers the oldest logged minutes instead of stacking on top of them. Example: Thursday shows 3:00 logged with 1:00 live, and the live tint covers the bottom third. Fix: give it `bottom: (ratio − live)·100%`.
- **T16 · Today mixes time formats.**
  - Up next uses 24h: `12:30–14:00`.
  - The Log uses 12h: `9:00 AM–11:00 AM`.
  - The Start card says `CLOCKED IN SINCE 12:00 PM`.

  The new Up next card makes the mismatch obvious (`today-A-1280x800.png`).
- **T17 · A rest day that hit the goal is announced as `…, goal met`**, without the `, rest day` that §1.5 asks for (`STATE_TEXT` by state only).
- **T18 · The week card goes over its 184 px budget in some states:** 200 px with no plan, 204–206 px on Sunday because of the end links. The fold still passes, since those states never had the banner in my runs.
- **T19 · The streak tooltip is a `title` on a span that can't be focused,** so keyboard and touch users can't reach it.
- **T20 · The figure vanishes during the roll-back.** While the stone rolls down at the start of the next block, there is no figure on screen for about 1 s; he reappears at the bottom (`break-rollback-reduced.png` frames 5–7). I didn't check whether round 2 did the same.
- **T21 · There is a hitch when focus opens:** the first frame takes 216 ms (1440@1), 315 ms (1440@2) and 216 ms (3440). A resize causes a 129 ms frame. This is known and acceptable, but it is visible as a stall on entry.
- **T22 · Screenshot names.** `docs/screenshots/round3/today-390.png` (W2 list) is named `today-390-full.png`. `compare-round2-round3-p0.5.png` puts round 2 without chrome next to round 3 with chrome; `compare-r2-r3-p05-reviewer.png` is a fairer pair.

---

## Weekly card: hand calculation versus the app

All seeds use the UTC timezone and are entered through `localStorage` (script in the scratchpad).

**Scenario A:** Thu 29 Oct 13:00. The plan has a 6 h daily goal and Wednesday as a rest day.
- Entries: Mon 6:30, Tue 3:00, Wed (rest day) 1:40, Thu 2:00, plus a timer running since 12:00.
- Goals: total, course hours, sections, goal-days and a second course-hours goal.
- `sectionByDay`: s1 done, s2 not done, s1 again, and one deleted id.

| Item | Hand calculation | App |
|---|---|---|
| Target | 6 study days × 6:00 = 36:00 | 36:00 ✓ |
| Total | 390+180+100+120+60 = 850 → 14:10 | 14:10 ✓ (and 14:12 two minutes later ✓) |
| Status | expected 2160×2/6 = 720 ≤ 850 → On track | On track ✓ |
| Pace | 1310 left, 4 days → ceil(327.5) = 5:28 | `21:50 to go · 5:28/day for 4 days` ✓ |
| Days | Mon hit, Tue short, Wed rest (1:40), Thu today, Fri–Sun future | ✓ (aria labels per §1.5) |
| Goals | course 9:30/10:00 on track, sections 1/3 on track, goal-days 1/4 behind (4th, hidden) | ✓, plus `+1 more` (→ `/review/2026-10-26`) |
| Sections | {s1 ✓, s2} → 1 / 2 | `Sections 1 / 2 done` ✓ |
| Streak | Tue broke it, Mon was the best → `No streak · best 1` | ✓ (Review also shows current 0, best 1) |
| Up next at 13:00 | the 09:00 block is gone; 12:30–14:00 Now; 4 rows + `+1 more` | ✓ |
| Matches Timecard / Review | Timecard week total 14:10; Review "14:10 of 36:00" | ✓ |

**Scenario B:** Monday 08:00, no plan, nothing logged this week. The app shows `0:00 / 56:00 · On track · Week starts today · 8:00/day`, `Default target (no plan)`, `No plan for this week yet` and `Plan week →`. There is no "Behind" anywhere. The streak reads `No streak · best 2`, from last Friday and Saturday ✓.

**Scenario C:** Sunday, daily goal 1 h, 1:10 logged every day. The app shows `8:10 / 7:00 · Met · +1:10 over` and a 7-day streak. `Review week →` goes to `/review/2026-10-26` and `Plan next week →` goes to `/plan/2026-11-02` ✓.

**Scenario D:** every day is a rest day. The app shows `2:00` with no target, no chip and no pace line ✓.

Clicks:
- A day bar opens `/timecard/2026-10-26` ✓.
- `Edit goals` opens `/plan/2026-10-26` ✓.
- `+N more` opens `/review/…` ✓.

## Acceptance checklist

### ROUND3_PLAN

| Row | Result | Evidence |
|---|---|---|
| W0: weekProgress with 16 cases, goalText/STATUS moved, todayBlocks tests, selector | **Pass** | `weekProgress.test.ts`, `goals.test.ts`, `plan.test.ts`. The ReviewPage diff only swaps imports and delegates `goalText`, with identical strings. |
| W1: total, target and status match; Timecard/Review agree | **Pass** | Scenario A table above |
| W1: running timer moves the total within 60 s | **Pass** | 14:10 → 14:12 after +2 min |
| W1: no plan: `Default target`, `Plan week →`, `weekPlans` unchanged | **Partial** | The UI passes. `weekPlans` changes because of PlanPage's ensure (T8). |
| W1: Monday shows no Behind | **Pass** | Scenario B |
| W1: met week + Sunday links | **Pass** | Scenario C |
| W1: rest days, today highlighted and announced, links | **Pass** (nit T17) | Scenario A aria labels |
| W1: streak text | **Pass** | |
| W1: header shows only title + date; grep finds nothing | **Pass** | `grep` returns no matches |
| W2: §3.3 fold at 1280×800: idle/running × 2/3/5 goals × light/dark, banner shown | **Pass** (12/12) | Week card bottom 304–306 (height 176–178 ≤ 184); Clock in at 696 / Clock out at 538; TODAY at 710–712 |
| W2: 1440×900 shows the top of the Log | **Pass** | Log heading at y=595 |
| W2: 15 entries: the page scrolls, Log has no inner scroll | **Pass** | `scrollHeight == clientHeight` (508), 12 rows + `Show all (15)` → 15 |
| W2: Up next hidden / Now / past blocks absent / +N more | **Pass** | Scenario A (hidden in B and D) |
| W2: TODAY moves ≤ ±2 px, week card does not move | **Partial** | Week card 0 px; TODAY 2 px with no block, **9 px with a block** (T6) |
| W2: one banner row, placed between header and week card | **Pass** | |
| W2: 999 px stack order; no horizontal scroll at 375; compact card at 390, Details toggles, Clock in above the tab bar | **Pass** | order head 24 / banner 76 / week 128 / start 318 / upnext 801 / log 1078; `aria-expanded` false→true; Clock in bottom ≈ 663 < tab bar 784 |
| W2: axe + 3:1 bar contrast | **Fail** in light theme (T7); axe not run (not installed) | |
| W2: screenshots | **Partial** (T22) | |

### ROUND3_DESIGN

| Row | Result | Evidence |
|---|---|---|
| R0: vendored skills | **Pass** | 3 folders, each with an MIT `LICENSE` and a `SOURCE.md` (repo, commit, unverified star count). Markdown only: no executable files, no scripts, no URLs or shell commands in the skill text. |
| R1: Today grid, Start compaction, no inner overflow, Log 12 + Show all | **Pass** | The design's grid was superseded by the plan's (Up next in the side column) |
| R2: WeekCard | **Pass** | Uses the plan's links (`/review`) where it differs from the design |
| R3: PlanTodayCard | n/a | Replaced by the plan's Up next |
| R4: light model | **Pass** | Long shadow at dawn and golden hour, short at noon, warm noon sky, wide rim at 0.95; continuity test present. Fails in part on "AO touches the contact" at the summit (T1). |
| R5a: ridge, benches, range, snow, beat | **Partial** | Bench centres at ¼ ½ ¾ verified visually (cairns under the stone at p=.25/.5/.75). Summit-highest and no-penetration tests present. Hands-continuity and snow tests missing; the beat could not be seen (T9, T10). Back-side framing fails (T2). |
| R5: surface, haze, foreground | **Partial** | Hatching gone, strata and joints present, no smudge, haze bands visible. Strata read as stripes (T14). "Back side jagged with two shoulder steps" not visible at desktop sizes (T2). The foreground-rock test is present. |
| R6: figure v2 | **Partial** | One outline per part with no seams; mass reads at 4×; hair and cloth exist; still the darkest element. Detached-looking far foot and antenna hair (T12). Overlaps the stone at the summit (T3). |
| R7: motion v2 | **Pass** | The tests cover the R7 rows (big slip in the first 30 s, chain lengths, determinism). The 12-frame sheet shows lean and head lag and stride variation. |
| R8: ambient | **Pass** (test gap T10) | Clouds drift; drift test ≤ 6 px; bird timing tested; ambient gated off when reduced or paused (code) |
| R9: summit v2 | **Partial** | Strain → crest → stand → rays → camera ease → stars all present (`summit-sequence-18frames.png`). Floating stone (T1) and overlap (T3). |
| R10: perf + reduced motion | **Pass** on numbers; **Partial** on the redraw rule (T11) | See the frame-time table |

## Frame times (headless Chromium, software rendering, no GPU, real clock, 6 s samples)

| Viewport | First frame | Average draw after warm-up | Max after warm-up | fps (capped at 30) | Quality |
|---|---|---|---|---|---|
| 1440×900 @1 | 216 ms | 2.8 ms | 6.9 ms | 30 | 1 |
| 1440×900 @2 | 315 ms | 3.7 ms | 6.4 ms | 29 | 1 |
| 390×844 @3 | 105 ms | 2.9 ms | 8.7 ms | 30 | 1 |
| 3440×1440 @1 | 216 ms | 2.1 ms | 10.2 ms | 24 | 1 (draw is cheap; compositing limits fps) |

- **Tint rebuilds:** they don't spike. The max frame stays under 11 ms with 1–2 staged rebuilds in the window.
- **Resize mid-block:** one 129 ms frame, then a correct re-layout (`resize` screenshot checked; no stale cache visible at 150 ms).
- **Hidden tab:** 0 frames rendered in 2 s.
- **Reduced motion:** the rAF loop does not run, and still frames redraw on progress (cadence: T11).

## Animation critique

I captured a 12-frame push cycle at 130 ms steps (`anim-push-12frames-130ms.png`), the three bench crossings (`false-summits-25-50-75.png`), an 18-frame summit sequence at 450 ms (`summit-sequence-18frames.png`), and break → roll-back plus reduced motion (`break-rollback-reduced.png`). I also checked phone, 1280, 1440, ultrawide and landscape-phone, and put round 2 and round 3 side by side at p=0.5 (`compare-r2-r3-p05-reviewer.png`).

**Better than round 2? Yes, clearly.**
- Round 2 was a brown sand dune with pencil hatching under a cold grey sky.
- Round 3 has:
  - light that moves from dawn mauve through warm noon to golden hour and dusk;
  - long cast shadows that tell the time at a glance;
  - a layered range with snow caps and haze between the ridges;
  - rock strata;
  - a summit with rays, a camera ease and stars.
- The push cycle is no longer mechanical. Across 12 frames the stride, lean and head lag vary, the stone gives back on each slip, and the figure reads as a crouched man straining with locked arms.
- The false-summit cairns sit exactly under the stone at 25%, 50% and 75%, and stay lit afterwards. That is a nice, honest progress cue.

**Does it look like a mountain with different tops? Partly.**
- The skyline now has many tops, but they belong to the background: evenly spaced, near-identical paper triangles with white caps.
- At 1280 and 1440 wide, the mountain the man actually climbs has one long flat top ending in a cliff. The twin peak and arête the design promised are off-screen.
- The three benches read as gentle shoulders, not false summits.
- On ultrawide the back side appears, but as a regular five-step sawtooth (T2).

**Glitches a user will notice:**
1. the stone floating on a dark plate at the summit (T1);
2. the figure merging into the stone at the summit, and standing on the brink (T3);
3. the pale ghost crescent on the stone all through the climb (T4);
4. the checkerboard texture on the stone (T5);
5. strata reading as striped wallpaper (T14);
6. the man vanishing during the roll-back (T20).

**Not seen:**
- no flicker or popping when caches rebuild;
- clouds never sat behind the stone;
- the figure's feet did not clip into the slope during the climb;
- the cairns were placed correctly.

## Regression check (round-2 loop)

All of these still work:
- The inline block chip plus Clock in opens focus mode.
- The controls fade to opacity 0 after 3 s idle.
- Space pauses (the timer stops) and resumes (it restarts). While the chrome is faded, the first key only reveals the controls, as designed.
- Esc closes the overlay and shows the `◐ Back to focus` pill.
- A reload restores the session, both non-immersive and immersive.
- At block end, Take a break asks "Stop at block end", then the break starts and an entry is written.
- After the break, Start next block returns to `focus`.

There were no page errors.

## What's good

- `weekProgress` is small and pure, reuses the existing domain functions, and its 16 test cases match the plan. Every number I checked by hand was right, including the running timer, the rest-day study, the first day of the week, and the met / last-day / all-rest edge cases.
- The week card is dense but legible and fits the 184 px budget with the banner shown. The phone compact card with `Details` is well judged, and every link goes where the plan says.
- Today now flows naturally. The Log grows with no inner scroller, Up next is useful, and the header is clean.
- The skills research is honest: star counts are marked unverified, licenses are kept, nothing is executable, and the skills chosen actually fit character animation.
- The scene is well engineered:
  - staged tint rebuilds with no spikes;
  - deterministic seeding;
  - a rendering loop that stops when the tab is hidden;
  - correct reduced-motion gating;
  - a 2–4 ms average draw in software rendering, well under the 6 ms budget.

## Resolution

Coder, 27 Oct 2026. The user changed the art direction mid-round: the focus scene will become an endless, camera-tracked climb in a Greek black-figure style, with the summit shown only when a block completes. So only the Today and weekly-card findings were fixed. Tests: 299 pass. Typecheck and build are clean.

| ID | Outcome | Commit |
|---|---|---|
| T1 | **Superseded by new art direction** (endless climb, black-figure style). Commit 7a86a9e has an interim fix: the stone drops onto its contact, and a test checks it rests within 1 px of the ledge. That code will be replaced. | 7a86a9e |
| T2 | **Superseded by new art direction.** The summit won't be visible during a block. Commit 7a86a9e has an interim multi-peak massif with tests for ≥ 3 peaks on screen at 1280, 1440, 1920 and 390, and an irregular arête. | 7a86a9e |
| T3 | **Superseded by new art direction.** Commit 7a86a9e has an interim summit ledge with no-overlap tests. | 7a86a9e |
| T4 | Superseded by new art direction. The interim rim-in-rotated-frame fix is in 7a86a9e. | — |
| T5 | Superseded by new art direction. The interim blurred mottling is in 7a86a9e. | — |
| T6 | **Fixed.** The Start card's top half reserves 288 px. Clocking in with a 25-minute block moves TODAY 0 px (it moved 9 px before). The 1280×800 fold still passes. | f16a993 |
| T7 | **Fixed.** Light-theme past bars use heat-4: 3.33:1 on the track and 4.0:1 on the card. Rest-day fills share the same colour. | f16a993 |
| T8 | **Resolved by decision, no code change.** Plan §1.4 says "Plan week creates it as it does today", and PlanPage has always ensured the plan on mount. The week card's button creates nothing itself; the plan only appears once the user lands on Plan week. The W1 row "weekPlans unchanged right after the click" is dropped as contradictory. A lazy create-on-first-edit can be a later round. | — |
| T9–T14 | Superseded by new art direction: the milestone beat and look-up, animation tests, reduced-motion redraw cadence, figure details, phone scene framing, strata and gullies. | — |
| T15–T22 (nits) | Not addressed this round. T15–T19 are Today nits, left for the next pass; T20–T22 are scene and screenshot nits, superseded. | — |
