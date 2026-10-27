# Review: round 4 (Sisyphus redesign, detail, clean motion, forward roll)

Reviewer agent · branch `round4` at `0eeb114` · spec `docs/ROUND4_SISYPHUS.md` · images in `docs/review/round4/`

## Verdict

**Not done yet. Send it back for one more round on the drawing and the summit.**

- **The roll is fixed.** I tracked the stone's incised strata in the screenshots, independently of the engine, at 1440×900 and 390×844. The stone turns clockwise whenever it moves forward, counter-clockwise only during a slip, and the recover cancels the slip exactly. The stone never slides.
- **The climbing motion is much cleaner.** The trudge is continuous, the planted feet stay locked (< 0.12 px), there are no knee or elbow flips, the camera is smooth and there are no visible pops between states.
- **The drawing does not yet meet "more detailed" or the reference:**
  - the face, the most detailed part, is hidden behind the near arm on every climbing frame, and the head reads as a helmet or goggle loop;
  - the rear leg never straightens (max 145°, spec ≥ 168°), so he still reads as crouched;
  - the loincloth flaps hang as icicle spikes;
  - the fingers merge into one claw.
- **The summit sequence regressed:**
  - the figure walks off screen for about 5 s, and the walk-up takes about 15 s;
  - in the stand, the near hand floats about 18 px away from its wrist.

The S1 key-pose tests pass on `solveHoldStatic`, a pose the scene never renders. That's why the tests are green while the screen disagrees.

| Severity | Count |
|---|---|
| Blocker | 0 |
| Major | 6 |
| Minor | 5 |
| Nit | 2 |

Tests: 335/335 pass (`npx vitest run`). `tsc` is clean and `npm run build` is clean (474 kB JS).

The vendored skill `.claude/skills/motion-design/` is byte-identical to upstream `LottieFiles/motion-design-skill@f9a8a04` `skills/motion-design/` (`diff -r` is clean). The only additions are the upstream `LICENSE` (identical) and a `SOURCE.md`.

---

## How I tested

- **Real app:** `vite` dev server, Playwright Chromium with `page.clock` installed, driven frame by frame (33 ms steps, the scene runs at 30 fps while climbing).
- **Instrumentation:** done at serve time only. A Playwright route rewrote the served `sisyphus.ts` to push the rendered pose (screen points of every joint, foot, palm, the stone centre, `rot`, `sB`, gait state, camera) into `window.__cap` after each `drawFigureArt` call. No repo files were changed.
- **Captures:**
  - 150 s at 1440×900 and 100 s at 390×844: about 4,700 frames, 7 strain beats each;
  - a 5-minute custom block through the summit, the stand, "Keep going" and the next climb;
  - reduced motion;
  - 4× crops (DPR 4) at 1440×900, 1920×1080 and 390×844;
  - perf at DPR 2 and 3 with the real clock.
- **Roll check:** the stone's ochre pixels were masked inside 0.86 R. For each frame pair, I searched for the rotation that best maps one mask onto the next (0.25° steps). This is independent of the engine's `rot`.

---

## Findings

### Major

**V1 (Major): the face is hidden behind the near arm, so the head reads as a helmet or goggle loop**
- **Where:** `figureArt.ts`. The head outline and its detail go into `groups.core`, and `ORDER` draws `nearArm` last. The pose puts the head centre on the near upper arm. The spec's own "head between the arms" rule (≤ 0.035 H from the shoulder → wrist line) makes that happen.
- **Actual:**
  - On every climbing frame the near upper arm and deltoid cover the head. Measured head-centre distance from the near arm line: median 0.023 H (≈ 5 px at 1440×900), against a head radius of ≈ 15 px.
  - What shows is the deltoid horseshoe as a big ochre loop on a black dome. It reads as a helmet, goggles or a shield. Only a fringe of beard strokes pokes out under the arm.
  - The almond eye, Greek profile, fillet and the three curl rows are invisible at every size.
- **Expected:** a readable profile, beard and hair curls (§6.4 head; S1 "4× crop shows … Greek profile with almond eye, C ear, fillet, curl rows, beard strokes").
- **Evidence:** `review/round4/zoom-head.png`, `detail-1440-press-4x.png`, `detail-1920-4x.png`, `detail-phone-390-4x.png`. The coder's own `docs/screenshots/round4/detail-4x.png` shows the same.
- **Repro:** start any block at 1440×900 and screenshot at DPR 4.
- **Partly verified fix:** I rewrote the served module so the head outline, head lines and head dots go into a new `head` group appended to `ORDER` (drawn last). The curls and beard then show (`experiment-head-last-wide-flaps.png`). But the head still points crown-forward with the face toward the ground, so the profile still doesn't read. Two more changes are needed; I haven't verified them:
  - a less bowed head axis (about 70–80° instead of 105°);
  - the head centre moved to just **below** the near arm line, as in the reference.

**V2 (Major): the rear leg never straightens, so he is still crouched rather than upright and heroic**
- **Where:**
  - the gait pose (`gait.ts` `pose()`), used for climbing and also for reduced motion;
  - `figure.test.ts`, which checks `rig.ts` `solveHoldStatic`. The scene never renders that pose; it's only used by `holdDForStone` for the summit stand distance.
- **Actual (real app, 1440×900, 150 s):**
  - Interior knee angle (hip–knee–ankle) ranges 76–145° on both legs. At the press (u < 0.3) the rear knee median is **139°** (max 145°) and the front knee median 98°.
  - Reduced motion (the "static key pose") renders rear 138° and front 91°.
  - Both knees are visibly bent in all 24 frames of a cycle (`cycle24-figure.png`), a squat W-stance. There is no straight rear-leg-and-back "spear".
- **Expected:**
  - spec §3.4 key pose: rear knee **170°** (≥ 168°), front knee 106° (100–112°);
  - S1 line of action within 6°;
  - the reference: rear leg long and straight.
- **Repro:** instrument the pose as above, or measure the angle on any screenshot. Compare `rm-*.png` reduced motion with the spec table.
- **Fix (unverified):** make the gait's press and anticipation keys solve to the §3.4 table (rear knee 166–176° through the press) and re-point the S1 tests at the pose the gait actually renders, for example `gait.pose()` at u = 0.25, not `solveHoldStatic`.

**V3 (Major): at the summit the figure walks off screen and the walk-up takes about 15 s**
- **Where:** `sisyphus.ts` summit walk plus the summit camera framing (zoom drops to 0.62).
- **Actual (1440×900, 5-minute block, clock t):**
  - The summit sequence starts at 305.8 s. By 309 s the camera has zoomed out and panned to the summit, and the figure is **entirely off screen** (pelvis x = −79 px). Only half the stone shows at the left edge.
  - The figure is off screen or clipped until about 314–316 s.
  - The walk-up lasts until 321.0 s (15.2 s, which looks like the `st > 14` fallback rather than "arrived").
  - The spec's summit sequence is 6 s.
- **Evidence:** `summit-figure-offscreen.png`, `summit-sequence-24.png`.
- **Repro:** custom 5-minute block, let it run out, and screenshot every 0.5 s from 0 to 16 s after the chime.
- **Fix (unverified):** frame the summit shot to include the figure's current position, i.e. pan and zoom over the walk instead of cutting to the ledge. Also find out why "arrived" never fires; the walk target may not converge.

**V4 (Major): in the summit stand the near hand is detached from the arm**
- **Where:** `rig.ts` `stepToStand`, the near arm.
- **Actual:** in the stand the near palm sits on the stone (1.7 px) but **25.2 px** from its wrist. The normal wrist-to-palm offset at that zoom is 7.3 px, so there is an ≈ 18 px gap. The arm itself is raised overhead and ends in the air, and the hand floats on the stone's rim.
- **Expected:** §3.4 summit stand, "near hand flat on the stone's upper flank at 140°, elbow 158°", with the hand attached.
- **Evidence:** `summit-stand-detached-hand.png`, `summit-stand.png`.
- **Repro:** as V3; wait for "stand" (after about 15 s).
- **Fix (unverified):** solve the near-arm IK to the palm target (wrist = palm − palm offset), as the climbing pose does, rather than placing the palm independently. Add a test that checks wrist-to-palm distance equals `RIG.palm`-based constant in every pose.

**V5 (Major): the loincloth flaps read as hanging icicles or fangs**
- **Where:** `figureArt.ts` chain flaps, `const wd = (tail ? … : 0.17 - 0.13 * k) * h`. That's a taper from 0.34 h to 0.08 h to a point, plus 2 fold lines down the middle.
- **Actual:** two or three black points with ochre stripes hang below the hem in every frame, at every size. They are the most eye-catching shape on the figure. At the passing pose they look like teeth (`detail-1440-passing-4x.png`). The user explicitly called out this kind of shape.
- **Expected:** soft cloth flaps (§6.4).
- **Verified fix:** with the taper changed to `0.17 - 0.04 * k` (served-module rewrite), the flaps render as short rectangular cloth tabs with no spikes (`experiment-head-last-wide-flaps.png`). A rounded end cap would look better still.

**V6 (Major): the fingers don't read; the hand is a claw or blade**
- **Where:** `figureArt.ts` `handOutlines`. The four finger lobes are fanned 0°/−5°/−10°/−15° and all point "up the stone".
- **Actual:**
  - At every tested size, the finger lobes pile into one pointed black spike above the palm, with a hook-shaped incision.
  - The knuckle row and finger gaps are below a pixel. Nothing reads as fingers or a thumb.
  - The far hand sits right behind it.
- **Evidence:** `zoom-hand.png`, `detail-1920-4x.png`.
- **Expected:** "4 spread fingers + thumb with knuckles" visible in the 4× crop.
- **Fix (unverified):**
  - fan the fingers wider (the spec says 0/8/16/24°, but the code uses 0/−5/−10/−15°);
  - lay them **along** the stone's curve, not stacked;
  - draw an explicit incised gap between the lobes.

### Minor

**V7 (Minor): some §7.7 climbing limits are exceeded at push-off**
- **Measured:** in the app at 31 fps, 150 s, trudge frames only. The values are per-frame changes scaled to the spec's 60 Hz basis (my sampling is 31 fps).
- **Actual:**

| Metric | Measured | Limit | Over the limit |
|---|---|---|---|
| Pelvis acceleration | max 2.29 H/s² | 1.6 | 74 frames, all at u ≈ 0.5 |
| Pelvis jerk | max 24 H/s³, p95 12.4 | 12 | 235 frames, u 0.4–0.6 |
| Head axis | 0.62°/frame | 0.5 | — |
| Elbow | 0.81°/frame | 0.8 | at the limit |

- **Comment:** none of these shows as a visible pop. The step surge is a bit snappy, not jerky. The coder's sim-level test passes, probably because of a different window or seed.

**V8 (Minor): the climb stalls after every strain beat**
- **Actual:**
  - Right after each strain beat ends, the "trudge" runs about 0.5 s with pelvis speed under 0.35 v̄ (min 0.001 H/s, 16–18 frames, u 0.00–0.05).
  - Together with the 1.3 s brace and hold, that's about 2 s of near-stillness every 16–23 s.
- **Expected:** S2, "Pelvis speed ≥ 0.35 v̄ on every climbing frame outside the strain beat".

**V9 (Minor): during a strain beat the hero drifts about 80 px left in the frame and takes about 10 s to come back**
- **Actual:**
  - The camera keeps its constant speed (§7.6, by design) while the figure stalls for 3 s. The pelvis screen x goes from a steady 450–472 to a minimum of 367 (≈ 0.35 H) and only recovers to ~450 about 10 s later.
  - With a beat every 16–23 s, he spends about half of each strain cycle off his mark. It's noticeable in `strain24-figure.png` with a fixed crop.

**V10 (Minor): the figure is over its frame-time budget, but not because of the detail layer**
- **Actual:**

| Viewport | `figureMs` median | p95 | `detailMs` median | Scene `avgMs` |
|---|---|---|---|---|
| 1440×900 @2 | 4.0 | 5.5 | 0.3 | 5.4 |
| 390×844 @3 | 3.7 | — | 0.3 | — |

- **Expected:** figure ≤ 3.0 ms, detail ≤ 1.5 ms, scene ≤ 7 ms.
- **Comment:** this matches the coder's 4.2 ms. The overrun is in the silhouette pass:
  - 6 grouped halo stroke + fill passes;
  - a full-bbox `destination-in` union fill;
  - an offscreen layer copy.

  The detail layer is not the cause. Scene time is fine. Note that headless `performance.now()` here is coarse (0.1 ms).

**V11 (Minor): the summit stand is frozen**
- **Actual:** the pose is identical to the pixel for 24 s (pelvis, hands, head unchanged). The §4.7 summit idles (regrip, weight shift, look out every 6–9 s) never play.

### Nits

**V12 (Nit):** at every strain → trudge switch the head axis steps 0.21° in one frame, against a local median of 0.11°. That's 1.9× the median, over the §7.7 1.5× rule. It's invisible.

**V13 (Nit):** at 1× the serratus and rib ticks read as a little "///" scratch cluster mid-torso, and the long back contour lines look like outline doubling rather than muscles. At 4× they're anatomically placed (pectoral, linea alba, obliques, lats, scapula), but at viewing size the torso reads as "scratched" rather than "muscled".

---

## Acceptance checklist (my measurements, not the coder's tests)

### S0: Forward roll and boulder detail

| Check | Result | Evidence |
|---|---|---|
| sign(Δrot) = sign(travel); never back-rolls outside slip, catch and summit settle | **Pass** | 4,543 moving frames. Back-rotation appears only in `strain` (slip) and summit settle. Pixel tracking matches the engine to 0.15° mean error, with 100% sign agreement on 69 frame pairs at desktop and 69 at phone. |
| Rotation equals distance / R | **Pass** | Rim roll vs travel differs by at most 0.013 px per frame: no sliding. |
| Slip CCW, recover cancels it | **Pass** | Pixels show −5.4° then +5.5°. |
| Strobe < 0.02 rad/frame | **Pass** | Max 0.0186 rad. |
| Strip shows a crack advancing clockwise | **Pass** | `roll-verify.png` |

### S1: Figure redesign and detail layer

| Check | Result | Evidence |
|---|---|---|
| Lean 20 ± 1° | **Pass** | Press median 20.4°; climbing range 18.8–24.4°. |
| Rear knee ≥ 168°, front 100–112° | **Fail** | Rear 139° median (max 145°), front 98° (V2). |
| Arms 10–18° above horizontal, elbows 168–172° | **Partial** | Arm median 18.2° (15–24°). Elbows 168.5° in reduced motion. |
| Head between the arms | **Pass by the metric, fail in effect** | 100% of frames, but the near arm hides the head (V1). |
| Hand contact ≤ 2 px | **Pass** | Palm offset steady at 2.2–3.4 px, spread 1.2 px. |
| Silhouette ≥ 22% (landscape) / ≥ 15% (portrait) | **Pass** | 24.4% at 1280×800, 1920×1080 and 844×390; 17.8% at 390×844. |
| Leg triangle open | **Pass** | Knees ≥ 0.06 H apart on 95.9% of frames. |
| 4× crop shows every L3 feature | **Fail** | Head features are hidden (V1), fingers don't read (V6). |
| Phone shows L2 | **Pass** | Tier 2. |

### S2: Motion (the trudge)

| Check | Result | Evidence |
|---|---|---|
| §7.7 metrics | **Partial** | V7. |
| Stance foot drift < 1 px | **Pass** | ≤ 0.12 px while locked. |
| Hand contact on every frame, including slip | **Pass** | |
| Lean 17–27° | **Pass** | |
| No IK flips | **Pass** | Cross-product sign is constant on all 4 limbs over 4,721 frames. |
| Pelvis ≥ 0.35 v̄ outside the strain beat | **Fail** | V8. |
| Camera within v̄ ± 15%, smooth | **Pass** | 0.117–0.150 against a mean of 0.131 H/s. Max \|Δv\| 0.001 H/s per frame; jerk ≤ 0.35 H/s³. |
| Drag-hierarchy lags | **Not measured** | |
| Sheets | **Pass** | Present: `cycle24-figure.png`, `strain24-figure.png`. |

### S3: Set pieces, LOD, performance

| Check | Result | Evidence |
|---|---|---|
| Summit stand | **Fail** | V4 (detached hand), V11 (static). |
| Summit sequence keeps the figure on screen | **Fail** | V3. |
| Seated break | **Not re-tested** | The coder's `break.png` looks right. |
| Roll through summit heave and settle | **Pass** | |
| Next climb is a clean cut, then continues | **Pass** | `next-climb-12.png` |
| LOD | **Pass** | L3 desktop, L2 phone and summit, L1 at 844×390. |
| Frame time | **Fail** | Figure 4.0 ms (V10). |
| Reduced motion | **Pass** | Static, stone texture consistent (`reduced-motion.png`); but its knees are V2's. |
| tsc, build and tests | **Pass** | |
| Screenshots retaken | **Pass** | |

### Regressions

| Check | Result | Evidence |
|---|---|---|
| Summit never visible during a block | **Pass** | Frames every 30 s over a 5-minute block: `block-every-30s.png`. |
| Controls auto-hide | **Pass** | `controls-hidden.png` |
| Today and week card | **Pass** | Fine at 1280×800 and 390×844 with a running block. |

---

## Does it meet the user's three asks?

1. **"Add this skill and redesign Sisyphus, also make the ball roll forward not backwards": Partly.**
   - The skill is in, unmodified, and the spec applies it file by file.
   - The ball now rolls forward. I proved it from pixels at desktop and phone, and it rolls back only during the slip. That part is a clear yes.
   - The redesign is only partly there. He is broader with more muscle, but the pose is still a two-knees-bent squat (rear knee ≤ 145°). The reference's upright figure with a long straight rear leg is not on screen, and the summit stand has a detached hand.
2. **"Make the drawing of Sisyphus more detailed": Partly, leaning no for a close look.**
   - There are many more ochre lines on the torso, arms and legs, and they are bone-attached and stable.
   - But the face, the one place a viewer looks first, is covered by the arm and reads as a helmet loop. The hands are claws. The loincloth's most visible feature is a pair of icicle spikes.
   - At 1× the extra linework mostly reads as texture or scratches.
3. **"Also make the movements cleaner": Yes for the climb, partly overall.**
   - The climb is genuinely cleaner: no freeze-shuffle, locked feet, no flips, a smooth camera, no pops.
   - Against that: small spec overages at push-off, a ~0.5 s stall after each strain, the figure drifting back in frame for ~10 s after each strain, and a summit sequence where he leaves the screen for ~5 s.

## Drawing critique (with crops)

- **Head** (`zoom-head.png`, `detail-1920-4x.png`):
  - There's no readable face profile, eye, curls or fillet. What you see is the near deltoid's horseshoe incision over a black dome, which reads as a helmet or goggles.
  - Drawn on top (experiment), the curls do read as a curly cap, which is promising. But the face points at the ground.
- **Hands** (`zoom-hand.png`): one pointed spike plus a hook. No fingers or thumb read.
- **Feet:** decent. There's a heel, a sole line, an ankle dot and a short toe segment; the gripping toes don't read at 1×. (The dark sticks near the heels in some crops are grass tufts on the slope, not the foot.)
- **Loincloth** (`detail-1440-passing-4x.png`):
  - The knotted belt with twist hatching and the dotted double hem are nice and period-appropriate.
  - The pleat fan converging on the knot reads as a starburst.
  - The two or three tapered flaps read as icicles or fangs (V5).
- **Muscle linework:**
  - At 4× it's anatomically placed: deltoid horseshoe, biceps–triceps split, brachioradialis, wrist wrap, quad line and vastus teardrop, patella oval, calf diamond, Achilles.
  - The legs read best. The torso reads as scattered ticks at 1× (V13).
- **Proportions and pose vs the reference:**
  - Broader shoulders and a narrower waist are an improvement.
  - The figure is still small next to the stone: the stone is 246 px across against a 219 px figure at 1440×900.
  - The pose is a crouched squat with both knees bent, the head buried in the shoulder and arms climbing about 18° to the stone. The reference is upright and heroic with a straight rear leg, the head below the arms and level arms.

## Motion critique

- **Continuous trudge:** no freeze, a ~3.1 s cycle, the swing knee leads, and the planted ball stays locked while the heel peels. This is the biggest improvement this round (`cycle24-figure.png`).
- **Strain beat** (`strain24-figure.png`): the brace, tremor, slip and recover read clearly, and the slip spins the stone back. Two catches:
  - every 16–23 s the figure then sits still about 2 s and slides about 80 px back in frame (V8, V9);
  - seven slips in 150 s is a lot over a 25-minute session (about 80 slips).
- **Camera:** steady and calm.
- **Summit:** the cut to the night summit at about 3.7 s is fine. Then the hero is off screen for ~5 s, takes ~15 s to arrive, and stands frozen with a detached hand (V3, V4, V11).
- **Next climb:** a clean cut, and he keeps climbing.

## Roll verification

Method: mask the ochre texture inside the stone, search for the screen rotation that best maps frame k onto frame k+6 (≈ 0.2 s), and compare with the engine's Δrot.

| Phase (desktop) | Pixel rotation per 0.2 s | Direction |
|---|---|---|
| Press | +1.0 to +2.0° | clockwise |
| Step | +4 to +5.75° | clockwise |
| Strain brace and hold | 0° | — |
| Slip | −0.5, −3.0, −2.0° | counter-clockwise |
| Recover | +2.0, +3.25° | clockwise |

- Phone 390×844 gives the same signs; mean error against the engine is 0.29°.
- The engine data agrees: across 4,700 frames, back-rotation appears only in `strain` (slip) and the summit settle (allowed). The next-climb cut is the only jump.
- The rim roll equals the centre travel to 0.013 px per frame, so the stone never slides.
- `roll-verify.png` shows the strata turning clockwise across a step (top row) and the slip and recover (bottom row).

## What's good

- The forward roll is right, with readable strata, cracks and facets, and no wagon-wheel effect.
- The climb motion is continuous and calm, the feet are locked, there are no IK flips, and the camera is smooth.
- Detail lines are bone-attached and never swim off their parts across the cycle. The LOD tiers switch correctly.
- The belt, hem and leg linework are period-appropriate.
- Summit is never visible during a block, the next climb continues, controls auto-hide and Today is unaffected (round 4 touched only `src/focus/scenes/`).
- The spec's skill application is thorough, and the vendored skill is exactly upstream.
