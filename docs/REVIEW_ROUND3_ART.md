# Review: round 3 art (black-figure endless climb)

Reviewer agent · branch `round3` at `d54fc46` · reviewed against `docs/ROUND3_ART.md` (A0–A4) and the user's three asks.
Screenshots and frame sheets for every flagged item are in `docs/review/round3-art/`.

## Verdict

**Changes requested. No blockers, 5 major, 8 minor, 2 nits.**

The core ask works. For a whole 25-minute block, at all five viewports, the summit never appears on screen. The crest stays at least 0.30 H past the right edge. The ground scrolls at about 29 px/s, so every 1 s frame differs from the one before. A new block continues on the same mountain. Progress is kept across clock-out, reload and pause. The climbing gait is calm, with planted feet, and it no longer looks "weird" while climbing.

What's left is mostly at the edges of the climb:

- the summit pose has a foot that has come off the leg;
- +5 from the summit briefly shows the *next* summit while you're working;
- the next-climb camera move breaks the frame;
- the background ranges get flat shelves in exactly the seconds before the summit;
- reduced motion has no ranges or clouds at all.

The user will see every one of these within one or two blocks.

Checks run: `npm test` (309/309), `tsc --noEmit` and `vite build` are clean. Real app driven with Playwright (`vite preview`, `page.clock`) at 1280×800, 1440×900, 1920×1080, 390×844 and 3440×1440.

## Findings

### Major

**U1 · Summit stand: the rear foot comes off the leg** (`rig.ts` `stepToStand` → `solveStand`)
- **Actual:** in the final standing pose on the summit, the rear shin ends in mid-air and the foot lies on the ground about 20 px behind it at 1440×900. This pose stays on screen for all of overtime, so it's the picture the user gets as a reward. `u1-summit-stand.png`, `u1-summit-severed-foot-crop.png`.
- **Measured** (vite-node on the real trail, `stepToStand(…, k = 1)`): the near leg's IK end is 0.15 H from its drawn ankle for hold positions D = 201.6–202.1. That's 17–20 px at zoom 0.62. The far leg is exact.
- **Cause (verified by code read):** the stand keeps the hold's front-foot x as the new rear foot (`feetX`). The new pelvis at `centre.x − R − 0.25` is beyond leg reach from it, so `legIK` clamps the leg (`reach`) while the foot is still drawn at the ground.
- **Expected:** the feet stay on the legs, as in the A2 penetration/contact rules.
- **Fix (unverified):** choose the rear-foot x inside 0.985·leg of the stand pelvis (or move the pelvis back), and add a test that the leg end equals the foot's ankle for `solveStand`/`stepToStand`.

**U2 · +5 from the summit shows the next summit, hides the climber and moves him backward** (`reducer.ts` `focus/extend` from `complete`; `sisyphus.ts` `beginNext(resume)` / `updateCamera`)
- **Repro:** finish a block, wait about 8 s on the summit, press E (+5).
- **Actual, three parts:**
  1. For about 2.5 s while the timer reads 5:00 and 4:59, the camera frames the summit of the *extended* climb, which is 5 minutes of climbing ahead, at night with the moon. Neither the figure nor the stone is in frame. Then it cuts to the dawn incline (`u2-extend-from-summit-shows-new-summit.png`). That breaks the user's core rule: "not see the end goal until I finish the timer."
  2. The climber's position jumps from the ledge (s = 202.08) back to 201.02 H, about 230 px backward.
  3. Overtime counts as climbing distance. After +5, `posM` = 359.91 + 73.9 m, which is 5 min + 8 s at 0.24 m/s. So after 10 minutes of overtime he would teleport about 144 m forward. The spec (§6.1) says overtime gives no movement.
- **Cause:** the new `targetMs` is based on `focusedMs` (overtime included), and `summitFrame()` is computed on the rebuilt, longer trail.
- **Fix (unverified):** on extend from `complete`, keep `posM` at the reached end (or start a fresh stage from there), don't count overtime as distance, and cut or cross-fade straight to the tracking frame instead of zooming from `summitFrame()` of the new trail.

**U3 · Next climb: the camera move breaks the frame and the figure vanishes** (`sisyphus.ts` `beginNext`, `updateCamera` `from` for `next`, `pose.alpha`)
- **Repro:** press Keep going on the summit, or Start next block after a break. Shots at 200 ms → 6 s: `u3-next-climb-sequence.png`.
- **Actual:**
  - From about 1.4 s to 2.6 s the black slope drops to a thin wedge in the lower right. The bottom 40–60% of the screen is a flat brown fill from the near range, and the stone sits half off the bottom-left edge. It looks like a rendering failure.
  - The figure disappears as the sequence starts and fades in at the col at 1.75–2.3 s (`alpha`). It never "follows down the descent: four steps" (§5.4).
  - The same glitch happens at the hourly wrap of an open-ended block (U8).
- **Cause:** the camera "from" pose blends `trail.at(sStart·0.55)` at zoom 0.62 with the tracking position. Midway, that frame points far above the trail.
- **Fix (unverified):** blend between two framings that both contain the trail (for example, key the camera on the stone's centre while it rolls), and animate the figure's descent instead of using alpha.

**U4 · Background ranges get flat shelves and a fake "shoulder" next to the climber in the last ~20 s, and again at each climb's start** (`sisyphus.ts` `buildStripFor` `capY`)
- **Actual:** at every viewport, once the end clamp engages (about T−20 s), the far range shows two artifacts:
  - a horizontal table-top with a vertical step;
  - a straight tan wedge just above the black slope near the right edge, at a shallower angle.

  The wedge reads as the slope easing into a crest, which is the "end" cue the spec tried to avoid. See `u4-range-cap-shelf-1440-end.png` (1440, T 24:59) and `u4-range-cap-shelf-more.png` (1920 and 3440 at T 24:58, and the col start of the next climb).
- **Cause:** the cap is a fixed 16° line through the *tracking anchor*. During the clamp the climber walks right and up, away from the anchor, and on the col fillet the slope is shallower than 16°. So the cap clips peaks into shelves and leaves a wedge.
- **Fix (unverified):** cap against the real slope skyline per column (`sAtScreenX` → screen y) with a margin, and lower peaks smoothly instead of clipping them.

**U5 · Reduced motion: no ranges and no clouds, ever** (`sisyphus.ts` `drawNow` / `cacheBudget`)
- **Actual:** with `prefers-reduced-motion`, the scene is sky, sun, slope, stone and figure only. The far, mid and near ranges and all cloud masses are missing, both at block start and 40 s later (`u5-reduced-motion-no-ranges.png`). `__sceneStats.frames` stays at 0.
- **Cause:** `drawNow()` calls `sceneFrame()` without `record()`, so `stats.frames` stays 0. Then `cacheBudget = stats.frames === 0 ? 0 : …` never allows a strip or cloud build. For the same reason, `crossfade()` (which requires `frames > 0`) never runs, so the 400 ms summit cross-fade in reduced motion can't happen.
- **Fix (unverified):** count still frames in `stats.frames`, or give `drawNow` its own cache budget that builds everything synchronously.

### Minor

**U6 · The summit framing doesn't deliver the payoff.** In the final summit frame (1440 and 1920), the "Summit." readout panel covers the back side, and the next incline's start is not visible (§5.2/A4 ask for ledge, cairn, back side and next incline). In portrait the back side runs off-screen behind the panel. The summit itself is a low rounded knoll, well below the background peaks, with clouds at or above ledge height, so "he looks out over the range… the cloud sea below" doesn't happen. `u1-summit-stand.png`, `u6-phone-end-and-summit.png`. Suggest framing so the ranges and clouds sit below the ledge at summit (sink the layers further at altK = 1 or during the pull-back), and keep the panel clear of the back side.

**U7 · The climb strip fades out with the chrome after 3 s,** together with the timer readout (`.readoutBox.fade`, which predates this round). In normal motion the scene still shows progress. In reduced motion nothing on screen changes for 15 s between redraws, but §7.1 counts on the strip and timer to carry second-by-second progress (`u7-focus-hud-faded.png`; measured frame diffs of 0.0% for 3 of every 4 five-second samples). Keep the strip visible (dimmed) in reduced motion at least.

**U8 · Open-ended blocks never get a summit.** At the 60-minute wrap the scene jumps straight to the next climb (gait s 479.7 → 0.0, no `mini` sequence; `startSeq('mini')` is never called). §5.4 asks for a 2.4 s mini summit first. It then shows the U3 camera glitch. `u8-open-ended-wrap-no-mini-summit.png`. The state is right: stage 2, summits 1, position kept on clock-out.

**U9 · Paused: the horizon band isn't desaturated.** `drawSky(…, ss.band)` passes the undesaturated band, so a saturated orange stripe shows through the grey paused palette (`u9-paused-band-not-desaturated.png`). Pass `stop.band` (unverified).

**U10 · The figure is built more compactly than the spec, which weakens the "upright heroic" read.**
- `REAR_FOOT = 0.19` (spec 0.24), so the stride is 0.28 H instead of 0.34. Measured on the hold pose, the legs are closer together and the negative triangle between them is narrow.
- The neck is at 95° and the head axis at 115° (spec 70°/100°), so the head is pushed low and tucked under the arm.
- The two arms are offset by only about 7 px, so they read as a single arm (`motion-4x-hold-pose.png`).

The measured key-pose numbers are inside tolerance: lean 21.5–22.5°, front knee 84–87°, rear knee 170°, elbows 171°/173°, head below the arm line. Suggest moving back to 0.24 and 70°/100° and widening the far-hand offset so both arms read.

**U11 · The next climb opens with a 400 ms double exposure.** The summit snapshot cross-fades over the col frame, so two stones and a ghost figure show (`u11-next-climb-double-exposure.png`).

**U12 · Stand transition: the far hand floats off the stone** for about a second. It points at the stone from about 10 px away (`u12-stand-transition-far-hand-floats.png`, summit +4 s).

**U13 · Coming back to a hidden tab snaps the climber** about 8.7 H with no cross-fade (§4.2 asks for 300 ms). Rendering correctly stopped while hidden (0 frames in 65 s). The camera then catches up smoothly over about 2 s.

### Nits

**U14 ·** The boulder's rim flecks and the slope flecks read as regular dashes (a dashed outline and road markings) rather than the reference's speckle. Varying length and spacing more, and adding dots, would get closer.

**U15 ·** `camLayout` switches anchors at `w/h > 2` instead of the spec's `min(0.35 w, 0.5 w − 0.27 h)`. The spec's formula and its own 3440 table row disagree; the coder followed the table. Harmless, but the planner should confirm.

## Acceptance checklist

| Check | Result | Evidence |
|---|---|---|
| **A0** grep for gradients / shadowBlur / filter / soft-light | Pass | none outside `daylight2d.ts` |
| A0 flat sky dawn → ember → dusk, two-tone swirl clouds, three flat ranges | Pass | `end-of-block-1440-sequence.png` |
| A0 rim flecks rotate with the stone | Pass (visual) | stone flecks differ frame to frame in `motion-24-frames-hold-to-pair.png` |
| A0 cartouche on the course line | Pass | cream on 0.88 black, visible in all summit frames |
| **A1** Hpx ≥ 0.22 h desktop, ≥ 0.16 h phone | Pass | `camLayout`: 0.24 h; 390×844 → 140 px (0.166 h) |
| A1 end never on screen during focus | **Pass** at all 5 viewports | geometry sweep below |
| A1 no range peak above the slope ahead | Partial | the cap holds, but U4 shelves and wedge |
| A1 ground moves ≥ 20 px/s | Pass | ≈ 29 px/s by construction; every 1 s pair differs (1.7–4.9% of pixels) |
| A1 extend never moves the climber backward | **Fail** from the summit (U2); pass mid-block | +5 mid-block: s 23.461 → 23.555, continuous |
| A1 clock out mid-block → next block resumes at the same posM, no prefix | Pass | posM 424.995 → stage 3 starts at 424.995, `fromSummit` false |
| A1 completed block → col prefix, seam C0 | Pass | stage 2 starts at 380.88 m, `fromSummit` true; tests |
| A1 migration v2 → v3 | Pass | seeded v2 blob → v3 with default `mountain`, app loads |
| A1 export/import round-trips `mountain` | Pass | stage 7 / 1234.5 m exported and re-imported; posM −3 rejected with a clear message |
| A1 climb strip altitude + meander | Pass, but fades (U7) | "↑ 147 m · Climb 2" after Keep going |
| **A2** hold pose angles | Pass | lean 21.5–22.5°, front knee 84–87°, rear 170°, elbows ≥ 171° |
| A2 contact / intersection / penetration | Pass in climb (tests + 4× crops); **fail in the stand pose (U1)** | |
| A2 negative shapes open | Pass, narrow (U10) | `motion-4x-hold-pose.png` |
| A2 incision only over black | Pass (visual) | clean silhouette on sky |
| **A3** foot-lock, rotation = distance, lag, elbow give | Pass (tests); no sliding seen in 100 ms crops | `motion-crop-*.png` |
| A3 period 1.6–2.2 s | Pass (borderline) | pair ≈ 2.2 s, hold ≈ 1.8 s at 24–27° (paused clock) |
| A3 strain beat in the first minutes, stone returns | Pass (visual) | `motion-strain-beat.png` |
| A3 12-frame sheet "not weird" | Pass for climbing | see motion critique |
| **A4** crest only after complete | Pass, except U2 | |
| A4 final frame: ledge, cairn, back side, next incline; figure ≥ 15% h | Partial (U6) | next incline not visible; the panel covers the back side |
| A4 stone rests on the ledge, no overlap but the resting palm | Pass (stone); **fail (foot, U1)** | |
| A4 next climb: forward roll, gait within 3.2 s, stage +1 | Partial (U3) | stage 1 → 2, hold by 3.2 s, but camera glitch and figure vanish |
| A4 break: seated, night, pre-dawn band | Pass | seated against the stone, moon, stands when the break is over |
| A4 reduced motion: no rAF, 15 s redraws, hold pose | Partial (U5) | 15 s cadence correct; ranges and clouds missing |
| A4 performance | Pass | 1440@1: first frame 27.8 ms, avg 3.7, max 6.5, 30 fps · 1440@2: 36.3 / 4.4 / 11.4 · 390@3: 33.7 / 4.6 / 21.3 · 3440@1: 35.1 / 4.0 / 7.0 |
| A4 hidden tab renders 0 frames | Pass | 0 frames in 65 s hidden |

**End-hidden geometry sweep** (real app, `__sceneStats.camX`/`sLocal` sampled every 30 s, then every 1–2 s over the last 90 s; furthest visible trail point vs crest fillet start `crestS` = 202.1 H):

| Viewport | Samples | Smallest margin to crest | Shallowest visible heading ahead |
|---|---|---|---|
| 1440×900 | 129 | 0.30 H (T 24:45) | 18.1° |
| 1280×800 | 129 | 0.30 H | 18.1° |
| 1920×1080 | 127 | 0.30 H | 18.1° |
| 390×844 | 130 | 0.62 H | 18.1° |
| 3440×1440 | 126 | 0.30 H | 18.1° |

**Regressions** (quick pass, no new issues):
- block picker → focus works;
- pause writes a truthful entry (09:00:02–09:01:05) and the climber holds still while paused;
- resume restarts the timer;
- the controls fade after 3 s;
- Esc closes to the pill;
- the Today weekly card renders.

## Motion critique

**Climbing (`motion-24-frames-hold-to-pair.png`, `motion-crop-step-to-hold.png` f18–29, `motion-crop-hold-to-step.png` f30–41, 100 ms apart on a paused clock):**
- The cycle reads as a deliberate two-step shove and then a brace: pair about 2.2 s, hold about 1.8 s.
- Planted feet stay on their ground point while the world scrolls. There's no treadmill slide.
- Step-to-hold (f21→22) and hold-to-step (f39→40) have no pop.
- The arms stay locked and the stone stays under the hands, with no float or penetration.
- The strain beat (`motion-strain-beat.png`) is legible but subtle.

This fixes the round-3 "weird" complaint.

The remaining weirdness is in the set pieces:
- the detached foot in the summit pose (U1);
- the far hand floating during the stand (U12);
- the figure vanishing and fading back in during the next climb and during +5 from the summit (U3, U2);
- the double-exposed stone (U11).

**Against the reference:**
- The pose is a forward-leaning brace with locked arms and a long, straight rear leg (knee 170°).
- But the short stride, the low tucked head and the single-reading arm make him look more like a crouched sprinter than the reference's tall heroic pusher (U10).
- At 216 px he is small next to a 242 px stone, which is per spec but emphasises the slight build.

## Style fidelity vs the reference

**Faithful:**
- flat terracotta sky with a stepped band;
- cream/ochre scalloped clouds with spirals;
- black figure, black stone and black slope separated only by ochre incision;
- ochre interior contours, a loincloth with a double hem, curls and an almond eye;
- the sun with two rings;
- star crosses at the summit.

No gradients, blur or glow.

**Weaker:**
- the stone's rim and the slope's flecks are regular dashes, not speckle (U14);
- the musculature is thin and the head is small, so the heroic mass of the reference isn't there (U10);
- the summit is a modest hump below the backdrop (U6).

The HUD strip is readable and calm (cream Plex on black, the Greek key filling cleanly) when it's visible (U7).

## What's good

- The core promise holds: the summit stays hidden for the full block at every viewport, and the reveal only happens on completion.
- Visible progress every second without busy-ness: the ground, parallax and steps all move with travel.
- Mountain state is solid. It's persisted every 60 s, at pause and at clock-out; v3 migration, validation, and export/import all work. Stages continue on one seeded trail with matching seams, and partial blocks keep their progress.
- The gait is a big step up: keyed, seeded, foot-locked and well tested (14 harness tests).
- Performance is comfortably inside budget, and the first frame is down from about 250 ms to under 40 ms.
- The old light model, textures and roll-back are deleted as planned.

## Resolution

Coder, fix round on `round3`. Every major and minor finding (U1–U13) is fixed. U14 is mostly fixed, and U15 is left for the planner. Each finding was checked in the real app (Playwright) or on the real trail before it was fixed. 314 tests pass, and `tsc` and `vite build` are clean.

| # | Outcome | Commit |
|---|---|---|
| U1 | **Fixed.** The standing pose and every frame of the step-through lower the pelvis under the leg-reach ceiling, so each leg ends exactly at its foot (also through overtime). Test: leg end = ankle ≤ 1 px across the step-through and for hold positions around the ledge. | d09a422 |
| U12 | **Fixed.** The far hand stays flat on the stone while the weight comes off it, then releases and drops; it spends ≤ 0.18 s near the stone (test). | d09a422 |
| U2 | **Fixed. Decision: +5 from the summit keeps the summit until the extension ends.** The mountain state is untouched and the scene stays in the summit tableau (dusk). Pauses, saves and clock-outs add no distance, and the extension ending doesn't count the summit twice. The next block starts in the col beyond this summit, so no other crest is ever shown during an extension. Tests: in the reducer, the drawn climb is identical across 8 min of overtime and the +5; on the engine (stub canvas), the framing and position stay fixed and he stays standing through the extension and after it ends. | c1c541c |
| U3, U11 | **Fixed (clean cut).** The next climb is a single-frame cut to the col: the climber is already braced behind the stone, the camera is on its tracking frame, and every cache is rebuilt for that frame. There's no pan through empty sky, no fade and no double exposure. Engine test: every drawn frame of the transition has the figure fully drawn and on screen, zoom 1, and the slope at 20–80 % of the frame. Pixel check in the app: the largest single colour in the transition frames is the slope black (46 %, the same as any climbing frame); no flat range fill dominates. The §5.4 forward roll is dropped in favour of the cut. | f7e2d2a |
| U8 | **Fixed.** At each hour of an open-ended block the climb holds on its summit for 8 s while he heaves onto the ledge and stands, then cuts to the col. Domain and engine tests. | f7e2d2a |
| U5 | **Fixed.** Reduced-motion stills count as frames and build every strip and cloud at once. Engine test: 3 ranges and ≥ 3 clouds drawn. | f7e2d2a |
| U4 | **Fixed.** Ahead of the stone, each range column is limited against the *real* slope skyline with a soft minimum. Peaks keep their shape and sink behind the slope, with no shelves and no wedge, including at the col start. Strips rebuild when the stone or the skyline moves. Test: the soft cap is strictly increasing and never exceeds the limit. | 6dfb6f3 |
| U10 + motion note | **Fixed.** The torso lean rises to 16° at 22° and the head goes back to 70°/100°. The stride is longer (+0.08 / −0.22 H, rear foot on the ball at 30°) and the rear leg is straight at 170°. The far shoulder and hand are offset so both arms read. Feet stay locked and hands stay on the stone: all harness checks hold. The pelvis is 0.36 H, because leg reach caps it with a longer stride. | cb762d4 |
| U6 | **Fixed.** In the summit framing the ranges and cloud sea sink below the ledge, and the ledge moves left so the cairn and the back side clear the panel. | de4934b |
| U7 | **Fixed.** In reduced motion the readout and climb strip stay visible (60 %) when the chrome hides. | de4934b |
| U9 | **Fixed.** Paused greys the horizon band. | de4934b |
| U13 | **Fixed.** Returning to a tab far behind re-plants the climber under a cross-fade. | de4934b |
| U14 | **Partly fixed.** The rim and slope flecks are now uneven: dots and strokes of varied length. | this commit |
| U15 | **Not changed.** The anchor follows the spec table; the planner should confirm. | — |

Performance (headless, 1440×900 @2): about 4.4 ms on average while climbing. In the last ~20 s, when the end clamp engages, the range strips rebuild more often and the average rises to about 6.4 ms, still 28–30 fps.

Retaken screenshots in `docs/screenshots/round3-art/`:
- `focus-p0.5.png`, `phone-p0.5.png`, `reduced-p0.5.png`;
- `push-01…12.png` and `push-sheet.png`;
- `summit-reveal.png`;
- `next-climb-sheet.png` (summit, then 5 frames after Keep going) and `next-col-start.png`.
