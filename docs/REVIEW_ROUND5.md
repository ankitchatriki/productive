# Review: round 5 (forward roll, fluid walk, new figure)

Reviewer agent · branch `round5` at `bca643b` · spec `docs/ROUND5_SISYPHUS.md` · images in the reviewer scratchpad (not committed): `/tmp/claude-0/-home-user-productive/737d4954-0664-55aa-bd30-7194f4df71e7/scratchpad/review5/`

**Scope:** partway through this review the user rejected the black-figure look. The coordinator then dropped the drawing critique. This review covers what carries over to round 6:
- the roll;
- fluidity;
- regressions.

## Verdict

**The motion model is good and should be kept. Fix one end-of-block framing problem (Z1).**
- **The roll is fixed.** In the real app the stone turns clockwise on 100% of frames at 1440×900 and at 390×844. Its surface moves with the ground within about 2%, so it rolls and does not skid.
- **The walk never stops.** Ground speed is constant to 0.1%. Planted feet don't slide (0.001 px), and the palms stay on the stone (gap 0).
- **One visible flaw remains (Z1):** in the last ~13 s of a block the ground stops scrolling and he walks across the screen.

| Ask | Answer |
|---|---|
| Ball rolls forward, not backwards | **Yes.** Clockwise on every frame, surface speed matches the ground, no reverse anywhere (pause, resume, start, summit, next climb). |
| Completely redesign Sisyphus | **Yes, done from scratch.** The look has since been rejected, so I did not judge it. |
| Fluid motion, no stop-and-go | **Yes while climbing; partly overall.** The speed never dips below 0.87× the mean, and the ramps are smooth. Two exceptions: the end-of-block camera stop (Z1) and a knee flick at each toe-off (Z3). |

Tests: 343/343 pass. `tsc` is clean and `npm run build` is clean.

## How I tested

- **The app:** a `vite` dev server serving an isolated `git worktree` at `bca643b`. The shared checkout picked up another agent's uncommitted round-6 edits during the review (`BREATH_U` import error), so I didn't use it.
- **The browser:** Playwright Chromium with `page.clock` paused and stepped exactly. I went through onboarding and clocked in a 25-minute block.
- **Instrumentation:** only at serve time. A route rewrite of the served `sisyphus.ts` pushes the screen positions of the joints, feet, palms, stone centre and camera after each `drawFigure`. No repo files were changed.
- **Roll check (pixels only):**
  - The stone's ochre marks are unwrapped to polar coordinates (0.22–0.84 R). The sector under the hands is excluded.
  - For each frame pair I searched for the rotation that best matches the next frame (0.1° steps, sub-step fit).
  - Ground scroll comes from sliding the grit band under the slope surface along the slope, image to image.
  - The engine's data is used only to locate the stone.
- **Captures:**
  - 25 s at 1440×900 and 15 s at 390×844, with a screenshot every 100 ms and every rendered frame logged (60 fps);
  - a full 25-minute block: start, pause and resume, the last 100 s, summit, break, break over, next climb;
  - reduced motion;
  - real-clock performance at DPR 2.

## Measurements

**Roll (pixel tracking, frame pairs every 100 ms)**

| | 1440×900 | 390×844 |
|---|---|---|
| Clockwise pairs | **249/249** | **149/149** |
| Rotation, deg/s (min / mean / max) | 14.9 / 15.4 / 16.0 | 14.7 / 15.5 / 16.9 |
| Pixel vs engine `rot` (max difference) | 0.06° | 0.14° |
| Ground scroll (median) | 40.6 px/s | 22.4 px/s |
| Stone surface speed (median) | 39.9 px/s | 22.2 px/s |
| Surface ÷ ground (median, p5–p95) | **0.98** (0.94–1.01) | **0.99** (0.85–1.14; grit is sparser on the phone) |
| Stone's on-screen drift | < 0.03 px per step | < 0.01 px per step |

- **Engine per frame:** `rot` never decreases. `Δrot·R ÷ ground` is 0.996–1.002.
- **Transitions:** no reverse at start, pause, resume, summit or break. There is one discontinuity at the next-climb cut, which is hidden under the cross-fade.
- **Visual impression:** the strata visibly tip from `\` through `|` to `/` while the grit streams left underneath. It reads as rolling forward. See `d1440-roll-strip.png`.

**Fluidity (every rendered frame, 25 s at 1440×900 and 15 s at 390×844)**

| Metric | Result |
|---|---|
| `D` speed ÷ pace | 1.006–1.008 (25 s); 0.992–0.999 over the last 80 s of the block |
| Ground (camera) speed | 39.84–39.93 px/s (min ÷ mean 0.999) |
| Pelvis world speed | 35.4 / 40.6 / 46.4 px/s (min / mean / max): **0.87–1.14 × the mean**, never near 0 |
| Pelvis along the slope tangent | 0.86–1.14 × the mean (the spec's F0 says 0.94–1.06, see Z4) |
| Pelvis on-screen bob | 1.9 px in x, 6.2 px in y |
| Cycle seams (φ wrap) | Pelvis speed 0.94 of the mean at every seam: no hitch. Head, shoulder and pelvis acceleration max is ≤ 1.6× the median. |
| Foot slide while planted | **0.001 px** (both feet, both sizes) |
| Palm to stone surface | 0.00 px. Polar angle range 0.8°, so the palms creep but don't slide. |
| Block start | 0 → 95% of speed in 0.48 s |
| Pause | stops within about 0.2 s |
| Resume | 0 → 95% in about 0.5 s; smootherstep, no overshoot |
| Next climb | 0.5 s hold, then 0 → 97% in 0.45 s |
| Knee, ankle and heel acceleration | max is **45×, 27× and 19× the median**, all at toe-off (Z3). Elbows, wrists and hands are ≤ 3.6×. |

**Regressions**

| Check | Result |
|---|---|
| Summit hidden during the block | **OK.** The slope runs off the top-right edge until 25:00 (`seq/d-late-35.png`, `seq/d-late-40.png`). |
| Summit reveal | **OK.** Pull-back to zoom 0.62 over about 3.5 s. The figure is on screen on every frame, and he is standing by 6.8 s. |
| Break | **OK.** 0.4 s cross-fade to the seated pose; the break panel and timer are correct. |
| Next climb | **OK.** Cross-fade, then "Climb 2", then the eased start. |
| Controls auto-hide | **OK.** Hidden after 3 s idle, back on pointer move (`seq/c-controls-after-idle.png`). |
| Today and week card | **OK.** The block is logged (W 0:25, total 0:25 / 56:00). |
| Reduced motion | **OK.** 0 changed pixels between 1 s steps, except the 10 s re-pose (2 cuts in 23 s). |
| Performance (real clock, DPR 2, headless) | Scene JS averages 1.3–1.8 ms; the figure draw is about 1.0 ms; `walkPose` is about 0.1 ms. Delivered fps was only 23–26 against a 60 cap. That's probably headless software raster, so it's unverified on real hardware (Z5). |

## Findings

### Major

**Z1: in the last ~13 s of a block the ground stops scrolling and the figure walks across the screen. At 25:00 the figure ends up under the timer card.**
- **Where:** `sisyphus.ts` `updateCamera`. This is the soft-min end clamp (`limitX`, width 0.3 H) with the camera anchor fixed.
- **Actual:** in the last 100 s at 1440×900:
  - horizontal ground scroll is 37 px/s until T−17 s, then 31 → 18 → 6 → 2 → 0.4 px/s;
  - the pelvis moves from screen x 527 to x 949, and the stone centre to x 1231 (its right edge at about 1380 of 1440);
  - when the block completes, the big "25:00" readout and card draw over the figure (`seq/d-late-40.png`).

  To the viewer the world stops and he speeds off to the right. That's the "stop, then go" feel the user complained about, now at every block end.
- **Expected:** the camera keeps tracking him until the summit set piece, and the summit stays hidden (§3.7, §6.1).
- **Repro:** 25-minute block, `page.clock.fastForward` to 25:00 − 100 s, then run normally and log `cam.x` and the pelvis's screen x.
- **Suggested direction (unverified):**
  - make the trail's crest sit at least a screen-width beyond the block-end `D` (stage length plus lead), so the clamp never engages during a block;
  - or start the summit framing shift (anchor and zoom) at T−15 s, so the camera keeps moving.

### Minor

**Z2: the summit push triples the cadence; the spec says double it.**
- **Where:** `sisyphus.ts:26`, `SUMMIT_E = 3.0`. The spec (§6.1) says 2.0.
- **Measured:** the speed rises 1 → 3.0 × pace over about 1.2 s, holds for about 2.5 s, then the quintic stop.
- **Effect:** at three times the step rate it reads as a scramble, not a triumphant last push. This carries over to whatever figure walks next.

**Z3: the knee flicks at every toe-off.**
- **Where:** `walk.ts` stance → swing at p ≈ 0.62–0.66, `legIK` soft region.
- **Measured at 1440×900:** the knee opens to 170°, then folds back within about 100 ms. Its screen velocity reverses from (−92, +73) to (+193, −35) px/s in 6 frames. Peak acceleration is 4,845 px/s², 45× the median. The ankle peaks at 27× and the heel at 19×.
- **Effect:** twice per 3 s cycle, a small snap that the eye catches on an otherwise smooth walk.
- **Suggested direction (unverified):** cap the toe-off reach lower (for example `SOFT_IK` about 0.975), or ease the swing's first 10% so the knee decelerates into extension.

**Z4: the pelvis speed band is wider than the spec says.**
- **Where:** `walk.ts`, `bob` is applied in world y.
- **Measured:** along the slope tangent the pelvis runs at 0.86–1.14 × the mean. F0 says 0.94–1.06. The coder's test checks `pelvis_s` (the surge only); the vertical bob projects onto the slope.
- **Effect:** it isn't a visible stall (the minimum is 0.87). Either relax the spec or apply the bob along the slope normal.

### Nit

**Z5: performance is unverified on real hardware.**
- Headless Chromium at DPR 2 delivered 23–26 fps even though the scene's JS takes about 1.5 ms per frame. I believe this is software raster.
- The coordinator should confirm 60 fps on a real GPU, because a slow scroll at 25 fps judders.

**Z6: the F2 screenshots are missing.** `docs/screenshots/round5/` was never committed, although F2 asks for it. This is moot now that the look is being replaced.

**Carry-over note (from the dropped drawing pass):** the palm origin sits exactly on the stone, but the fingers splay up and away from the surface. Only the heel of the hand touches the stone (`hand-overlay.png`). The round-6 figure should press the whole palm and fingers along the stone's curve.

## What's good

- **One distance clock.** `D` drives the walk, the stone and a rigid camera. This is the right architecture and fixed every round-4 cause at once: the roll is monotonic and skid-free, nothing slips or strains, and nothing stalls.
- **The roll.** Pixel tracking agrees with the engine to 0.06–0.14°.
- **Locked feet.** Planted feet are locked to 0.001 px.
- **Seamless cycle.** There is no hitch at the cycle wrap.
- **Calm ramps.** Start, pause and resume all ease smoothly.
- **Persistence.** The walk resumes after a long `fastForward` under a cross-fade.
- **Set pieces and reduced motion** work end to end in the real app.

## Images (scratchpad, not committed)

- `d1440-roll-strip.png`: the stone every 0.5 s; the strata tilt clockwise.
- `d1440-cycle.png`, `ph390-cycle.png`: one 3 s cycle at 0.2 s steps.
- `seq/d-late-35.png`, `seq/d-late-40.png`: Z1, the figure drifting right and then sitting under the 25:00 card.
- `seq-sheet.png`: end of block → summit → break → next climb.
- `hand-overlay.png`: the stone circle and palm points over the hand.
