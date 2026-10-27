# StruggleMore — Round 2 review

Reviewer: reviewer agent · Branch `focus-mode` at `f91f691` · 27 Oct 2026
Specs reviewed against: `docs/FOCUS_PLAN.md` (behaviour, F0–F5), `docs/STRUGGLEMORE_DESIGN.md` (brand, splash, Sisyphus scene, two-card Today, F4–F6), and `docs/FOCUS_DESIGN.md` where the newer spec doesn't override it.
Screenshots: `docs/review/round2/`.

## Verdict

**Not ready to ship as-is. There are 0 blockers and 3 major issues, all quick fixes.**

The engine underneath is solid. Phases, pause/resume, breaks, overtime choice, reload restore, the stale rule, migration and the rename all work, and the timecard stays truthful through every path I tried. The splash is right and the two-card Today fits the screen. Three things work against what the user actually asked for:

1. The focus-mode control bar **never fades**. The user asked that "everything should disappear", but the Pause / +5 / Clock out buttons stay on screen for the whole block (S1).
2. On a **phone**, those buttons sit right on top of the figure and the boulder, and the completion panel covers the summit moment (S2).
3. **Time blocks drift.** One "+10" turns a 25-minute block into a "39 min block", and every block after that is 39 minutes (S3).

## Build health

| Check | Result |
|---|---|
| `npm test` | 224 / 224 pass (21 files) |
| `npm run typecheck` | clean |
| `npm run build` | clean (JS 415 kB / 134 kB gzip) |
| Console errors during the full walkthrough | none |

## Findings

Ranked by severity. Everything here was reproduced in Chromium (Playwright, headless) with the fixture described under "Method". Items I could not verify are listed separately.

| ID | Sev | Title | Where | Actual vs expected | Repro | Suggested fix |
|---|---|---|---|---|---|---|
| S1 | **Major** | Focus controls never auto-hide | `FocusMode.tsx` initial focus + `FocusMode.module.css:30` `.hidden .fade:focus-within { opacity: 1 }` | **Actual:** the overlay focuses Pause on open (`data-autofocus`), and because focus is inside the control bar, `:focus-within` keeps it at opacity 1 indefinitely. Measured: opacity **1.00** after 5 s with no input. It only hides after a click on the scene background, which also moves focus out of the dialog to `<body>`. The top bar does fade. **Expected:** controls fade after 3 s idle (FOCUS_PLAN §3.3, U2) — "everything should disappear". | Clock in from Today, don't touch anything, wait 5 s. See `focus-idle-chrome-1440.png`. | Show the bar on `:focus-visible` inside it (keyboard focus), not `:focus-within`. Or have `useIdle` treat programmatic initial focus as idle until the first real keydown. Keep §8 working: Tab into the bar must still reveal it. |
| S2 | **Major** | Phone: the controls and the complete panel cover the figure and boulder | Portrait layout in `sisyphus.ts` (world bottom-anchored) and the overlay `.bottom` | **Actual (390×844):** the figure and boulder start in the bottom-left ~120 px, exactly where the Pause / +5 / Clock out pills sit. Because of S1 they stay there; even when faded on mobile they drop only to 0.35 opacity. At completion the "Summit" panel (~520 px tall) covers the figure on the plateau. The mountain fills only the lower ~40 % and the sky above is empty. The crouched figure is ~40 CSS px. The course label truncates to "OR…". **Expected:** portrait shows base to summit with a figure of 50 px or more, unobstructed (STRUGGLEMORE §3.3/§3.11); the readout belongs in the sky band and the controls must clear the figure. | Clock in at 390×844. See `focus-start-phone.png`, `focus-phone-idle.png`, `focus-phone-complete.png`, `anim-push-cycle-phone.png`. | Lift the portrait world (anchor the slope base at about 22 % of height, above the controls), or use `bottom` padding equal to the control-bar height in the world placement. On phones, put the complete panel in a compact sheet that clears the plateau, or move the camera so the summit sits above it. Let the label wrap to two lines, or show only the course, at <480 px. |
| S3 | **Major** | Extending changes the block length permanently and by odd amounts | `focus/extend` reducer (`blockMinutes = ceil(focusedMs) + N`), plus `keepGoing` / `nextBlock` inheriting `s.blockMinutes` | **Actual:** in a 25 min block at +3:16 overtime, **+10 gives 10:43 left** and the header says **"39 min block"**. After that, **Keep going · 39 min** and **Start next block · 39 min** both use 39. Planned "Until 15:00" also showed "39 min block". **Expected:** F2 acceptance says "+10 at 3 min overtime gives 10:00 left". The user's block length (the "time blocks" they asked for) should survive an extension. | 25 min block → let it complete → wait 3 min → +10. See `break-over-1440.png` ("Start next block · 39 min"). | Keep the chosen length (`baseBlockMinutes`) separate from the current target. Extend with exact milliseconds (`targetMs = focusedMs + N·60000`) and don't round up to a whole minute. Keep going / Next block should use the base length. The header should show the base length, e.g. "25 min block · +10". |
| S4 | Minor | Summit moment is small and its pose deviates from the spec | `sisyphus.ts` summit sequence and HUD | **Actual:** the boulder reaches the plateau, the sky goes golden → dusk and stars come out, and the sun is occluded. That part is good. But the figure **never steps onto the plateau**: it ends upright on the steep slope below the lip, with the near hand raised against the *side* of the stone (`anim-summit-zoom.png`, right). The whole moment fills about 120×90 px in the top-right corner at 1440×900. `Summit.` appears at t ≈ 0.3 s (`summit-0.png`), not at ≥ 3.6 s. **Expected (§3.7):** two steps onto the plateau, hand resting on top of the stone (120°), head looking out over the valley; heading at ≥ 3.6 s. | Let a block complete (page.clock fast-forward), then watch for 7 s. | Move the stand-up feet target onto the plateau (pelvis at the plateau start, not `s1 − offset`). Use the 120° hand target. Delay the HUD heading. Consider a 1.2–1.4× glow/vignette punch-in toward the summit during 1.0–3.0 s so the reward reads at a glance. |
| S5 | Minor | Break pose is on the slope, and the figure doesn't stand when the break ends | `sisyphus.ts` sit pose / break-over | **Actual:** during the break the figure sits on the slope below the lip and the boulder sits on the lip (`break-1440.png`). At "Break's over" it is still sitting (`break-over-1440.png`). **Expected (§3.8):** boulder on the summit plateau, the figure sitting with its back to the stone on the plateau, then standing up (1 s) when the break is over. | Complete → Take a break → fast-forward 10 min. | Place the sit pose on the plateau. Fire the `standup` sequence on the break-over transition (the host knows `breakOver`; pass it as a phase or flag). |
| S6 | Minor | Roll-back flashes a blue noon sky and jumps from night to golden | `sisyphus.ts:127` `palP = 0.86·(1 − smoothstep)` | **Actual:** the palette is interpolated backwards through the keyframes, so the sky goes golden → **noon blue** → dawn pink during the 2.8 s roll (`anim-rollback-keepgoing.png` frames 2–3, `anim-rollback-after-break.png` frames 2–3). The first roll-back frame also jumps from the post-summit night sky straight to golden. **Expected (§3.8):** cross-fade golden (or the current palette) → dawn. | Complete, wait 7 s, press K. | Cross-fade between two palette *snapshots* (current → dawn) instead of scrubbing `paletteP` backwards. |
| S7 | Minor | Focus isn't returned on exit, and clicking the scene drops focus out of the dialog | `FocusMode.tsx` close path, `useFocusTrap` | **Actual:** after Esc or Clock out, `document.activeElement` is `<body>`. Clicking the scene background moves focus to `<body>` while the overlay is open. **Expected (§8):** focus returns to the opener (Clock in / Back to focus / pill). The trap keeps focus inside. | Clock in, press Esc, then check `document.activeElement`. | On close, focus `[data-focus-origin]` (Back to focus, or the pill) after the overlay unmounts. Give the overlay root `tabIndex={-1}` and refocus it on `pointerdown` outside the controls. |
| S8 | Minor | The Start card has a large empty middle | `StartCard.tsx` / `TodayPage.module.css` | **Actual:** at 1280×800 there are about 220 px of blank card between the buttons and the TODAY block while running (`today-1280-light-base.png`), and about 320 px on a fresh install (`after-onboarding.png`). The Log card is mostly empty early in the day too. The day-one chip reads "Week 0:00 / 56:00 · **Behind**". Against "simple cards… most important stuff primarily" it reads as unfinished rather than calm. **Expected:** the spec pins TODAY to the bottom, so the gap is in-spec, but it's the most visible thing on the main screen. | Load Today with or without a timer at 1280×800. | Let the running readout use the space: centre the readout and block bar vertically, or scale the readout up (64–72 px) when space allows. Show the planned/next line and the section progress in that space. Don't show "Behind" for the current week before any day has passed (or show it neutral). |
| S9 | Minor | "Until 15:00" ends at 14:59 | `plannedBlockNow` floor + `resolveBlockMinutes` | **Actual:** choosing *Until 15:00* at 14:20:01 gives a 39 min block, "ends 2:59 PM". **Expected:** the label promises 15:00, so the block should end at the planned block's end instant. | Choose the Until chip at 14:20 and clock in. | For `planned`, compute `blockMs = blockEnd − now` (ms), not floored minutes (this ties into the S3 fix). |
| S10 | Nit | The planned chip's course stripe renders as a crescent | `TodayPage.module.css:32` | A 3 px `border-left` on a fully rounded pill draws a blue crescent (`today-planned-chip.png`). It looks like a rendering glitch. | — | Use a 8 px course-colour dot inside the chip. |
| S11 | Nit | Log rows: ragged columns and over-eager truncation | `LogCard.tsx` | The note column shifts with the time-range width. "Organic Che…" is truncated while ~150 px of the row is unused, so the section is never visible (`today-1280-light-many.png`). | — | Use a CSS grid with fixed time and duration columns and `minmax(0,1fr)` for Course · Section. |
| S12 | Nit | The paused readout says the number twice | `FocusHud.tsx` | "19:59" with "19:59 left" under it (`focus-paused-1440.png`). | Pause. | Use "left · paused" as the sub-line. |
| S13 | Nit | A stale immersive session skips the splash | `index.html` `shouldSkipSplash` | **Actual:** a paused session older than 6 h with `immersive: true` skips the splash, then the app discards the session, so the user lands on a plain Today with no quote. | Seed a paused session from 7 h ago with immersive true, then do a fresh load. | Apply the 6 h stale check in the inline script too (it only needs `phase`, `pausedAt` and `breakEndsAt`). |
| S14 | Nit | Small rendering artefacts in the push cycle | `sisyphus.ts` particles / shadow | Dust puffs read as bright white dots at the feet (`anim-push-cycle-desktop.png`, frames 1, 4, 6, 8). The boulder's contact-shadow ellipse is drawn above the slope line over the background ridge, so the stone looks like it hovers a few px. The figure's limbs show faint seams at the joints (mannequin look). | — | Tint the dust with `rockLit` at α ≤ 0.25. Clip the contact shadow to the mountain body. Draw the near-side limbs as one path (or stroke-join them) before the rim pass. |
| S15 | Nit | Space on Today starts immediately, so "Space, Enter" pauses at once | Today Space handler (per STRUGGLEMORE §4.2) | Starting directly from the selected chip is per spec. But initial focus lands on Pause, so the FOCUS_PLAN habit "Space → Enter" pauses within a second ("Under a minute — not logged"). | Today: Space, then Enter. | Swallow Enter for ~600 ms after the overlay opens, or don't autofocus Pause on a *fresh* start (see S1). |

### Not verified (honest gaps)

- **Open-ended loop wrap** (mini summit + roll-back at 60 min). I ran the open-ended 61-minute case only with reduced motion on, so I didn't see the wrap animation. Phase and readout were correct (1:00:44, still `focus`).
- **Chime audio, wake lock and the fullscreen API.** Calls ran without errors in headless; I couldn't hear or observe them.
- **Real-GPU frame times.** All numbers below are headless SwiftShader (no GPU).
- **Second-tab sync and a single chime per completion.** Not exercised this round.

## Acceptance checklist

**F0 — schema and migration**
- [x] A v1 blob (no `focus`, no `settings.focus`, no `showSplash`) loads as `schemaVersion: 2`, with default focus settings, `showSplash: true` and `focus: null`. All 5 entries are kept and the splash still shows.
- [x] Pure-logic tests are present and pass (`focus.test.ts`, 224 total).
- [x] Stale paused session (> 6 h) is discarded on load.

**F1 — reducer**
- [x] Phase guards hold through start → pause → resume → complete → extend → complete → break → next block → clock out (checked through stored state at each step).

**F2 — picker and lifecycle**
- [x] Inline chips form a radio group: arrow keys move, roving tabindex, labelled ("25 minutes", "Until 15:00, planned Organic Chemistry, 39 minutes", "No limit, open-ended").
- [x] Space on another page (Plan) opens the "Focus block" picker. Space on Today starts with the selected chip (per §4.2).
- [x] "Until HH:MM" appears only while a planned block is active (gone at 12:30, when the planned line reads "Next · Organic Chemistry at 14:00").
- [x] **Pause is truthful.** Paused at 14:25:03 → entry 14:20:01–14:25:03. Resumed at 14:28:04 → new entry. The countdown froze (19:59 for the whole pause).
- [x] Block end → complete panel, initial focus on Keep going, title "✓ Block done · …".
- [ ] **+10 at 3 min overtime gives 10:00 left.** Fails: it gives 10:43 (S3).
- [x] Break with ≥ 2 min overtime offers "Stop at block end (3:02 PM)" / "Stop now (3:29 PM)". The entry ended exactly at 15:02:02. The break is not logged anywhere. Break over shows "Break's over", and Start next block opens a new entry.
- [x] Clock out from complete with the overtime choice gets an "Logged 0:56 to Organic Chemistry · Undo" toast.
- [x] Keys: Space, K, B, C, M and Esc behave as in the table (I didn't press E or F). Global N and S don't fire under the overlay.
- [x] The tab title follows `focusTitle` (▶ / ❚❚ Paused / ✓ Block done / ☕ Break 9:59 / ☕ Break over).

**F3 — leave, return, persistence**
- [x] Esc hides the overlay. The pill shows on Today ("0:02:08 / 36:52 left · …") and clicking it reopens the overlay. Today shows "Back to focus" plus the block bar.
- [x] Reloading mid-block while immersive restores the overlay at the right remaining time (14:50) with no splash and no roll-back.
- [x] Reloading after the block ended while the overlay was closed gives `complete` at the exact block-end instant, the correct overtime and no chime.
- [x] The 10 h notice appears in the HUD (and as the Today banner with "1 more"). Its action exits and opens "Stop the timer at…".
- [ ] Focus returns to the opener on exit (S7).

**F4 — scene**
- [x] The scene renders the right state instantly at p = 0, 0.5, 0.98 and 1, and after a reload.
- [x] Distinct paused (desaturated brace), complete (dusk, stars), break (night, sitting, moon) and Daylight looks.
- [x] Hidden tab: **0 frames** in 2 s. On return it renders straight away.
- [x] Reduced motion: **0 frames** over 30 s of fast-forwarded time (static illustration). The roll-back is a cut.
- [x] dpr is clamped (1440×900 at dpr 2 gives a 1833×1146 back-buffer, about 2.1 MP), and the scene runs at 30 fps.
- [~] Summit and break beats deviate from the spec (S4, S5). Roll-back palette (S6).
- [~] Phone portrait: figure under 50 px and covered by the controls (S2).
- [x] HUD contrast measured from pixels at p = 0, 0.25, 0.5 and 0.9: digits 4.2–10:1 (large text, so the threshold is 3:1) and sub-line 5.8–6.7:1.

**F5 — Today (STRUGGLEMORE §4.5)**
- [x] 1280×800 and 1440×900, light and dark, in base, 16-entry and idle variants: `scrollHeight == innerHeight` and `scrollWidth == innerWidth`. The Log scrolls inside its card and the live row stays visible.
- [x] The TODAY block doesn't move between idle and running (y = 639 in both).
- [x] No ring and no DayTimeline on Today. The week chip matches Timecard/Review (7:49 / 56:00). The streak chip is hidden at 0 and shows "1-day streak" when the goal is met.
- [x] 999×800, 1280×690 and 375 px: no horizontal scroll and nothing clipped. At 390×844 the whole Start card is above the tab bar.
- [~] Clutter and emptiness (S8, S10, S11).

**F6 — rename and splash**
- [x] `grep -rn "Productive" src index.html README.md` finds nothing. Download filenames use `strugglemore-…`. No stray blue tokens. `--focus-ring` is fixed (`--focus-mode-ring` is only used inside the overlay).
- [x] The splash is inline in `index.html`, in Fraunces italic (it loaded in the test). The production build removed it **3.09–3.11 s after first paint** (≤ 3.2 s); with reduced motion it took 2.55 s.
- [x] Click or key skips it in about 220 ms. **Space during the splash is swallowed:** no timer, no picker, no navigation.
- [x] `?nosplash` and `showSplash: false` skip it, and so does an immersive session (but see S13). In-app navigation never shows it.
- [x] Settings → General has "Show the opening quote".

## Animation critique

I captured frames at 130 ms intervals at 1440×900 (dpr 2) and 390×844 (dpr 3). The contact sheets are in `docs/review/round2/anim-*.png`.

**Does it read as Sisyphus?** On desktop, yes. A dark, hunched figure leans into a large textured stone on a steep, rocky slope, with the summit cairn visible top-right. The stone is bigger than the figure, as in the reference, and it reads as a rock rather than a ball (lumpy outline, pits, cracks, fixed lighting while the texture turns). The hands are on the stone's lower-left surface in every frame of the push cycle (`anim-push-cycle-desktop.png`, frames 1–10), and the feet stay planted on the slope. The torso lean is about 45° from vertical with the arms driven up into the stone. It reads as effort, though the deep knee bend makes it look a little like a crouch or a kneel at a glance.

**Smoothness.** The 30 fps gait is smooth with no pops across 20 frames. The slip-back step is visible and is the best touch: it sells the load. There are faint joint seams on the limbs and bright dust dots at the feet (S14).

**Progress at a glance.** Good on desktop. The boulder's position on a fixed slope, with the cairn always visible, is an honest progress bar. The dotted "ahead" trail is faint but present. The sky warming from dusk-pink (p = 0) to blue noon (p = 0.5, `focus-p50.png`) to golden (`focus-p098-1440.png`) adds a second cue. The figure is small: about 55 px crouched at 1440×900 and about 110 px at 3440×1440.

**Summit.** The sky climax is lovely: golden, then the sun slides behind the summit, then dusk with stars (`anim-summit-sequence.png`). The figure's part underdelivers. It stops on the slope below the plateau with a hand on the stone's flank instead of standing on top (`anim-summit-zoom.png`), the moment happens in a small corner of a 1440 px frame, and the heading lands before the beat (S4).

**Roll-back.** It reads instantly, and spinning the stone back down the trail is a good wink to the myth (`anim-rollback-keepgoing.png`). It's spoiled by the blue-sky flash mid-roll (S6).

**Phone.** This is the weak spot. The scene is bottom-anchored, so the figure and stone sit under the control pills, the top half is empty sky, and the summit is hidden behind the complete panel (S2). As the user will first see it on a phone, it doesn't yet read as "a person pushing a giant rock up a hill".

**Frame times (headless, no GPU; indicative only).** Average draw time per frame from the engine's own stats over about 6 s:

| Viewport | dpr | Back-buffer | Avg ms | fps |
|---|---|---|---|---|
| 1440×900 | 2 | 1833×1146 | 2.1 | 29.5 |
| 1440×900 | 1 | 1440×900 | 1.9 | 29.0 |
| 390×844 | 3 | 585×1266 | 1.6 | 29.5 |
| 3440×1440 | 1 | 2240×938 (capped, upscaled 1.5×) | 5.1 | **14.1** |

1440×900 is within the 4 ms budget. Ultrawide is over budget and dropped to about 14 fps in headless. Adaptive quality never kicked in, because its trigger is a 22 ms average. Worth checking on real hardware.

## What's good

- **The timecard stays truthful through everything.** Pause splits entries at the exact instant. Breaks are never billed. "Stop at block end" ends the entry at the computed block end (15:02:02, not when it was noticed). Reload after an unseen completion gets the exact overtime and no chime.
- **Restore is solid.** Reloading mid-block lands straight back on the mountain at the right spot, with no splash and no spurious roll-back. Stale sessions are cleaned up.
- **The splash is done right.** It's inline, never waits on the bundle, totals about 3.1 s, and swallows the skip key, so Space can't start a timer.
- **The two-card Today fits exactly** at both target sizes in both themes, and the Log scrolls inside its card. Phone Today puts the whole Start card above the tab bar.
- **Power behaviour.** No rAF while hidden, no loop with reduced motion, dpr is capped, and the rendering is clean on desktop.
- **The rename is complete.** Strings, filenames, favicon, wordmark and tokens are all updated, and the storage keys are untouched.

## Method

- Vite dev server (`npm run dev`) for the walkthrough and `vite preview` for splash timing. Playwright 1.63 Chromium, headless, `timezoneId: UTC`, with `page.clock` installed at 2026-10-27 14:20 for the timed flows. Frame-time runs used no fake clock.
- Fixture: 3 courses (OChem, LinAlg, Physics), 3 entries today plus 2 yesterday, a week plan with blocks 09:00–10:45, 11:00–12:00, 14:00–15:00 and 16:00–17:00, an unfinished Monday section (carry-over banner) and a 48 h goal. Variants: running timer from 14:05, 15 extra entries, a 10 h timer, a v1 blob and a stale paused session.
- I wrote no code changes. The only files touched are this report and `docs/review/round2/`.
