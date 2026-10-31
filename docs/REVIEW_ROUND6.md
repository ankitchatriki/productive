# Review: round 6 (photographic Sisyphus)

Reviewer · branch `round6` at 7fcc495 · reviewed against `docs/ROUND6_PLAN.md` §10, `docs/REVIEW_ROUND5.md` Z1–Z5 and the user's reference photo.
Captures were taken in headless Chromium with SwiftShader GL, driven by `page.clock`. They are saved under the session scratchpad at `review6/`. No images are committed.

## Verdict

**The engineering is ready to ship. The art does not yet meet the user's bar ("done really well and artistically"). It needs one more round, focused on four things: the cliff, the figure, the sky and the stone's surface.**

Round 6 is a real change of direction, and most of the hard infrastructure is right:
- one key light shared by every form;
- a stone whose surface rolls under fixed lighting;
- a print pass whose sepia split-tone matches the reference within 1–2 levels in every value band;
- no outlines anywhere;
- a calm serif HUD.

The motion carried over from round 5 is clean, and Z1 is fixed.

Next to the reference, though, the frame still reads as **a 3D render with a photo filter**, not a photograph:
- **The rock** is a brushed, streaky clay surface. It has no fracture planes, ledges or gully, and it sits under a ruler-straight crest.
- **The sky** is an empty gradient with one dark smudge.
- **The stone** looks like a bump-mapped golf ball, not a lunar sphere with maria.
- **The figure** is a pale artist's mannequin made of tubes.

The print pass is doing most of the work. The subjects underneath it need to carry the realism.

Overall art score: **4.5 / 10**. Round 5 was about 2/10 for this brief, so this is a big step, but it is not there.

## Art scorecard

| Element | Score | Notes (all measured at 1440×900 unless stated) |
|---|---|---|
| Mood: photograph or render? | **5** | The toning, grain and vignette say "old print". The rock, stone and figure under them say "Blender viewport". At thumbnail size it reads as a print; at full size it reads as CG. |
| Composition | **5** | **Good:** the rock fraction is 0.53 (target 0.42–0.58), there is a large empty sky upper left, the figure is about 0.15 h, and the stone is Ø 1.5 H. **Not good:** <br>• The crest is a straight 22.7° line from corner to corner (95% of samples within ±10 px of a fitted line), with no level shoulder on the left and no convexity. The reference profile is level at about 0.70 h for x < 0.2, then 25–28°. <br>• The stone centre is at (0.49, 0.39); the target is (0.60, 0.315). <br>• The cliff reads as an inclined ramp seen from above, not as a vertical wall below a crest. |
| Tone | **6** | **Good:** the split-tone is excellent (R−B by L band: ours 8/13/17/22/26/26/24, the reference 8/13/18/22/27/25/25), and the chroma mean is 21 (reference 21). **Not good:** <br>• The range is pulled into the mids: p1 28–30 (target 15–28) and p99 188–192 (target 198–216). <br>• The histogram is not bimodal: it is a flat 8–13% per bin from L 32 to 176, and the 80–112 band holds 16–22% (target < 20; reference 10%). <br>• The top-left corner is burned 49% below the top-centre sky (target 22–40%). |
| Cliff | **3** | It has no cleavage planes with hard lit and shadow edges, no sub-horizontal ledges, no dark gully slot, no lit lip and no snow or scree wedge in frame. The texture is anisotropic value noise that reads as brushed metal, wet clay or wood grain. The rock band-pass sd is 15 (target ≥ 16; reference 18). |
| Sky | **3** | The 3–40 px band-pass sd is **2.2–2.6** (reference **6.5**). That technically passes "≤ 9", but it means there is no cloud structure at all: a gradient plus one dark blob above the stone that looks like a lens smudge. There is no lighter rift and no emulsion mottle, and the crest glow is weak (no sky pixel above 207). |
| Stone | **5** | **Good:** the light is right (horizontal profile: left 10% L 181, right 10% L 42; vertical: top 148, bottom 32), and it rolls clockwise. **Not good:** <br>• All of the stone's visible structure is bump relief. Its albedo is nearly flat; the albedo-only debug render is close to a uniform disc. <br>• The craters are a uniform, dense, high-frequency field with hard relief. <br>• It has no maria patches, the limb is razor clean, and the terminator is narrower than in the reference. <br>• Reads as: golf ball, asteroid render, plaster. |
| Figure | **3** | It reads as **a mannequin or wooden artist's doll**: <br>• uniform tapered tubes with visible capsule joints at the knees and elbows; <br>• no waist or ribcage taper, no buttock, calf or deltoid forms at reading size; <br>• tube feet; a pale bald head the same tone as the skin; a lighter "wrap" band that reads as underwear. <br>**Pose:** a crouch with both knees deeply bent. The reference has a straight rear leg on a 25–30° diagonal and a front lunge. The head is not bowed between the arms. <br>The numbers technically pass (figure mean L 110, left-to-right modelling gap 45–58 levels, bbox 0.15–0.17 h), but it does not read as a person. |
| Print effects | **6** | The grain amplitude is in band (1–3 px sd 2.7–3.6 L), but it is **too fine and too uniform**: its autocorrelation at 2 px is 0.08, against 0.54 in the reference, so it reads as sensor noise, not film clumps. On the phone the grain sd is 6.5 L (target 1.5–4). The top-left vignette is too heavy. The crackle, scratches and foxing (plan §3.6) are missing except for rare specks. The softness is about right. |

## Prioritised art fixes (to close the gap to the reference)

**A1. The cliff: planar fractured rock instead of streaked noise.** In `CLIFF_FS`:

1. Remove the albedo term `0.70 * (fbm(vec2(q.x*14.0, q.y*6.0),3)-0.5)`. That stretched high-frequency fbm is the source of the brushed streaks.
2. Make each cell of `facets()` a true **plane**: height `h = dot(cellNormal.xy, qw - cellCentre) + cellOffset`. Light it with the plane's analytic normal (tilt range about ±0.6), not the eased `smoothstep(0.0, 0.08, big.z)`.
3. Make the edges hard: the facet-boundary transition should be at most 1 device px wide, with a 1–2 px dark seam only on right- and down-facing breaks.
4. Use two joint sets:
   - cleavage at 75–82° (the current 8° from vertical is fine), with cells 0.25–0.5 H wide and 1.2–2.5 H tall;
   - **ledges**: every 0.25–0.6 H (jittered per column band), a height step whose top is lit (+0.25 L) for 2–3 px and whose underside falls into shadow (×0.45) for 4–8 px.
5. Keep at most 2 octaves of the fine `rockDetail` relief and halve its gradient weight. The crispness should come from the edges, not from noise.
6. Add one deterministic **dark gully** per 8–14 H of world x: 0.5–1 H wide at the crest, widening 1.5× by 3 H down, L 18–25, with the facets inside it darkened ×0.4.
7. Restore a visible lit lip 1–3 px under the crest.

The targets are the same as the plan's: the rock band-pass sd ≥ 18 and the darkest slots at L 18–25.

**A2. The crest and composition: break the ruler line and move the subject to the third.**
- Give the trail's heading a slow world-space variation: about ±6° at a wavelength of 8–12 H, plus a short level shoulder of 3–5 H before each steep section. The silhouette then has convex and concave runs while it stays exactly the trail under the contacts.
- Add bigger crest notches *outside* the contact windows. The plan's 0.03 H is too small to see: use 0.06–0.12 H deep and 0.3–0.6 H wide, about one per 4 H.
- Darken the first 0.15–0.35 H below the lip (×0.6), then lift it slightly. This reads as the top edge of a near-vertical face, not as a ramp.
- Move the landscape anchor so the stone centre lands at about **(0.58–0.62 w, 0.31–0.34 h)**. Re-check the hidden-summit clamp afterwards.

**A3. The figure: a person, not a doll.** In `figurePrims.ts` and the figure shader:
- **Values:** skin albedo 0.23 → **0.16** (target figure mean L 80–95 against the sky's 175); hair 0.085 → **0.05**, as a cap covering the back and top of the cranium.
- **Delete the `wrap` primitive.** At 130 px it reads as underwear; the reference figure is nude and indistinct.
- **Anatomy** (radii in H, in the same primitive budget):
  - a waist taper (abdomen 0.050–0.055 against the ribcage's 0.078);
  - a buttock ellipsoid behind the pelvis (0.055);
  - quadriceps and hamstring masses on the thigh: a 0.068 → 0.042 taper with a front bulge at u = 0.35;
  - a calf bulge at 30% down the shin (0.036);
  - a deltoid cap plus a biceps swell;
  - feet as flat wedges: heel radius 0.022, ball 0.014, sole flat on the ground, not round tubes.
- **Blend:** raise the smooth-union `k` from 0.018 to about 0.03 so the joints don't show as capsule ends.
- **Pose** (`walk.ts` / `poses.ts` constants):
  - the rear leg reaches knee ≥ 165° at mid-stance;
  - the front thigh is near horizontal at φ ≈ 0.6;
  - the torso leans 30–40° from vertical (currently about 20°);
  - the head axis is 50–60° from vertical, tucked between the arms.

  Re-verify the walk tables. These are within the ±5% length envelope.
- **Shading:** drop the back rim term (it outlines the body), use wrap 0.12 → 0.25, and add a 0.6–0.8 px blur (motion softness) in the figure pass.

**A4. The stone: lunar albedo, less bump.** In `stone.ts`:
- Bump gain `6.0` → **2.0**.
- Albedo:
  - the maria term `-0.05*smoothstep(...)` → **−0.14**, at a lower frequency (`fbm3(m*0.9)`), so there are 2–4 large dark patches;
  - overall albedo range clamp [0.24, 0.58] → **[0.18, 0.62]**;
  - add a ring of +0.04 albedo on crater rims, so craters show in tone as well as relief.
- Crater density: drop the `c3` octave at all qualities; `c2` prob 0.22 → **0.10**; `c1` prob 0.16 → 0.12, with a few larger shallow basins (`m*1.6`, depth 0.2).
- Wrap 0.45 → **0.65**, for a terminator band about 35% of R as measured on the reference.
- A soft 1.2–1.5 px limb.
- Target: the albedo-only render's sd is ≥ 0.06 in scene units, so the plan's albedo roll check works (see K5).

**A5. The sky: real overcast texture.** In `SKY_FS`:
- `billow` weight 0.14 → **0.40** and `mott` 0.03 → **0.06**. Add a second mottle at 1–3% of frame width.
- Reduce `big`'s amplitude 1.25 → 0.8. The single dark blob is that low-octave term at too much gain.
- Add a lighter diagonal rift (a band along the ridge direction, +0.06).
- Target sky band-pass sd **5–8**, the reference's 6.5. The plan's ≤ 9 cap still holds.
- Raise the crest glow (`glow` ×1.5, falloff 0.12 → 0.08) so the band hugging the ridge reaches L 200–210.

**A6. The tone and vignette: a bimodal print.**
- Push the rock down (`r *= 0.26` → **0.20**) so the rock lobe peaks at L 32–48, and lift the sky via A5's glow. That empties the 80–112 trough to about 10% and gets p1 ≈ 21 and p99 ≈ 205.
- Vignette: the radial term 0.34 → **0.24** and the top burn 0.07 → 0.05, so the top-left corner lands 30–35% below mid-sky (it is 49–62% now).

**A7. Grain and paper: film, not sensor noise.**
- Build the grain from a clumped field: two octaves of value noise at css/3.2 and css/1.6 (weights 0.7/0.3). Aim for an autocorrelation of 0.5 at 2 CSS px and 0.0 at 4 px.
- Reduce `amp` 0.075 → **0.05**, and check the phone (DPR 2) against the 1.5–4 L band.
- Implement the plan's paper channels: Voronoi crackle (2–3%) and 6–10 hairline scratches (+5%), weighted to the upper left and static.

The order matters: **A1 → A3 → A5 → A4**. Those four take the score from about 4.5 to about 7. A2, A6 and A7 are cheaper and take it the rest of the way.

## Engineering findings

| Id | Severity | Finding |
|---|---|---|
| K1 | **Major** | **The quality governor measures CPU time, not frame time.** The tier trigger in `sisyphus.ts` (`record()`, `avgMs > 10`) is fed the duration of `sceneFrame()`, which is JS plus GL command submission. A GPU-bound device never steps down. On SwiftShader the scene ran at **3–6 fps at Q1 indefinitely** with `avgMs` at 3–4 ms, and the "> 22 ms → Canvas 2D" escape (plan §3.7) can never fire. **Fix:** drive the tiers from the rAF interval (a 90-frame average of `t − lastFrame`) or from `EXT_disjoint_timer_query`, and switch to Canvas 2D when the interval stays above 45 ms at Q0.5. |
| K2 | Minor | **A lost context leaves a white screen.** After `loseContext()` the canvas shows pure white (255) until it is restored, and stays white if no restore event arrives. Meanwhile the loop keeps running (frames 4 → 96 while lost). Restoring works, and two losses switch to Canvas 2D (verified). **Fix:** fill the overlay with `--focus-bg` (dark sepia) behind the canvas; if no restore arrives within 2–3 s, fall back to Canvas 2D; and pause the loop while lost. |
| K3 | Minor | **Phone ground speed is 14.7 px/s**, just under the plan's ≥ 15 px/s at 390×844. Desktop is 20.8 px/s. |
| K4 | Minor | **Z3 is improved but not gone.** The peak knee acceleration is **28× the median** (desktop) and 25× (phone), at φ ≈ 0.145 and 0.645 (toe-off), down from 45× in round 5. |
| K5 | Minor | **The albedo-only roll check doesn't work.** The `__stoneAlbedo` render has so little contrast that the rotation search locks onto only 0.19× the true rate. The **lit** render passes: 20/20 frame pairs clockwise, and the measured rate is 0.997× the model (0.177 rad/s). A4 fixes this. |
| K6 | Minor | **He never visibly reaches the summit.** With `END_LEAD` = 9.6 H, the summit beat opens with a cross-faded camera jump of about 7 H, and he settles on the slope below the plateau with the stone not on top. The hidden-summit rule and the "stands by ≤ 7 s" target (6.0 s measured) hold, but the arrival reads as a cut. Consider a slower 2–3 s dolly across the last few H, under the cross-fade. |
| K7 | Nit | **The stone's angle resets on the next climb** (ρ 546.8 → 1.96 rad). It is hidden by the cross-fade and the new seed, but the plan says ρ continues. |
| K8 | Nit | **The plan's paper texture is missing.** The crackle and scratch channels (§3.6, G/B) are not implemented; only the low-frequency unevenness and rare specks are. |
| K9 | Nit | **CPU frame time is borderline and real-GPU performance is unknown.** CPU per frame is 3.0 ms at DPR 1 and 3.6–4.0 ms at DPR 2 on SwiftShader (target ≤ 3 ms); this may be inflated by software GL submission. GPU time is unmeasured, so **Z5 stays open**. The first frame takes 26–34 ms. |

**What I checked and passed:**
- `npx vitest run`: 361/361 pass. `tsc` is clean and `npm run build` is clean.
- Bundle: JS 456.7 → 470.7 KB minified (+14 KB, budget 45 KB). CSS +2 KB.
- No image files are added in `bca643b..7fcc495`.
- Nothing outside focus mode changes except `mountain.ts` `END_LEAD` and its test, so Today is unaffected.

## Measurements

**Roll** (1440×900, lit render, 300 ms steps, rotation search over the stone disc):
- 20/20 pairs clockwise; 3.05°/step against the model's 3.06° (**0.997×**).
- Model checks (60 Hz, 9.3 s):
  - ρ strictly increasing;
  - surface speed / centre speed = 1.000 (per-frame range 0.999–1.001), desktop and phone.

**Fluidity** (60 Hz virtual clock, 560 steps desktop and 400 steps phone):

| Measure | Desktop | Phone |
|---|---|---|
| Ground scroll (px/s) | 20.76–20.79 (constant) | 14.65–14.66 |
| Pelvis speed (× the mean) | 0.92–1.04, 0% outside 0.90–1.10 (Z4 fixed; was 0.86–1.14) | 0.92–1.05 |
| Camera speed (× the mean) | 0.999–1.001 | |
| Planted-ball drift in the world | **0** (8 stances) | **0** (5 stances) |

**Z1** (the last 45 s of a 50-minute block, 250 ms steps):
- The camera keeps scrolling to the final second. The pelvis stays at screen x 555 ± 2 px and y 476 ± 2 throughout. **Fixed.**
- The summit gait starts at block end, he stands 6.0 s later, and the zoom is 0.62. The crest stays straight in every focus frame (summit hidden).

**Reduced motion:** frame differences in the scene region are exactly 0 for 0.5 → 6 s, one re-pose at about 9.5 s, then 0 again. **OK.**

**Canvas 2D fallback** (forced by making `getContext('webgl*')` return null):
- 32 fps at 1440×900 and 39 fps at 390×844 (DPR 2); CPU per frame 0.8–1.9 ms.
- It looks simpler: a dark silhouette figure (closer to the reference's values than the GL figure), a smooth billiard-ball stone and flat rock. It is an acceptable fallback.

**Tone:**

| Measure | Reference | 1440 p05 | 1440 p50 | 1920 p50 | 390 p50 | Target |
|---|---|---|---|---|---|---|
| p1 / p99 | 21 / 208 | 30 / 188 | 28 / 189 | 32 / 192 | 29 / 202 | 15–28 / 198–216 |
| Share of pixels in L 80–112 | 10.3% | 21.8% | 15.6% | 19.7% | 15.0% | < 20% |
| Rock fraction | 0.51 | 0.60 | 0.53 | 0.53 | 0.31 | 0.42–0.58 |
| Sky band-pass sd | 6.5 | 2.6 | 2.2 | 2.4 | 4.7 | ≤ 9 (ref 6.5) |
| Rock band-pass sd | 18.4 | 15.3 | 14.9 | 16.0 | 15.0 | ≥ 16 |
| Chroma mean / p95 | 21 / 30 | 20 / 26 | 21 / 27 | 22 / 27 | 23 / 27 | 12–30 / ≤ 36 |
| Top-left corner vs top-centre | −18% | −51% | −49% | −50% | −21% | −22…−40% |

**Figure** (measured with and without the figure in the same frame, at six phases):
- mean L 109–114 against sky 183–191;
- sd 41–45;
- lit third against shadowed third: 127–141 vs 82–95.

**Performance (real clock, SwiftShader):**

| Renderer, size | fps | CPU per frame | First frame |
|---|---|---|---|
| GL, 1440×900 DPR 1 | 5.9 | 3.0–3.2 ms | 26 ms |
| GL, DPR 2 | 3.1 | 3.6–4.0 ms | 34 ms |
| Canvas 2D | 32–39 | | |

## What's good

- **The direction is right.** The vector-vase look is gone completely, with no lines, rings, swirls or ochre. The scene is built on one light and value structure, as the plan asked.
- **Toning is the strongest part.** The value-dependent split-tone and the low chroma are essentially indistinguishable from the reference.
- **The architecture is sound:**
  - the FrameModel/renderer split, with tests running on models;
  - a world-anchored cliff panorama built a strip per frame;
  - a half-resolution sky;
  - a baked equirectangular stone, so the surface rotates under a fixed light;
  - double-loss fallback to Canvas 2D;
  - reduced motion as a true still.
- **The motion is exemplary.** The roll is clockwise and matched at 0.997×, feet are perfectly locked, the camera is rigid, the pelvis band is tightened, Z1 is fixed and the next-climb cross-fade is clean.
- **The HUD restyle** (Fraunces small caps, hairline strip, mat buttons) suits the print, and its cream on rock is legible.
- **The stone's lighting** matches the reference's fitted key direction and profile, and the breathing scale and pose read calmly.

**Telling captures** (scratchpad `review6/`):
- `side-by-side-full.png`: the reference beside 1440 p50;
- `fig4x-ref-vs-ours.png`: the figure at 4×;
- `stone2x-ref-vs-ours.png`: the stone and figure at 2×;
- `rock3x-ref-vs-ours.png`: the rock texture at 3×;
- `grain3x-ref-1440-390.png`: the grain at 3×;
- `sheet-summit-seq.png`: the summit sequence;
- `sheet-states.png`: summit, break, reduced motion and the Canvas 2D fallback.

## Resolution (coder, round 6 art fixes)

Commits on `round6`: A1 `ecfaa4b`, A2 `49bc7ef`, A3 `4d6e6b1`, A4 `47e939f`, A5 `ce05940`, A6 `b53a78b`. Each step was re-rendered beside the reference at the same scale. Captures are in the session scratchpad `round6b-shots/`; none are committed.

**Art (measured at 1440×900, p0.5)**

| Fix | What changed | Result |
|---|---|---|
| A1 Cliff | Flat-plane Voronoi facets on three scales and two joint directions, lit by their own normals. Hard edges come from changes of light, not drawn seams. Also: buttress ribs, sub-horizontal ledges, one gully per ~11 H, a lit lip with a dark band under it. The streaked albedo is removed. | Rock band-pass sd 21.9 (target ≥ 18; reference 18.4). Rock lobe at L 40. Rock histogram close to the reference's. |
| A3 Figure (A2 commit) | Lunge: stride 0.60 H, lean 33°, head axis 54–60°. The heel rises onto the ball; the ball is fixed and its ankle is reached exactly. Skin 0.16, hair cap 0.05, the wrap band deleted. Waist, buttock, quadriceps, calf and biceps masses; wedge feet. k = 0.05, no rim, flatter modelling, 1.5 px soft edge. | Rear knee 164–166° at toe-off; knee peak acceleration 13–16× its median (K4). Figure mean L 87 against sky 204. |
| A5 Sky (A3 commit) | Big blob 1.25 → 0.55, billow 0.30, a cell field 10–40 px across, two mottles, a lighter rift, crest glow ×1.5 with falloff 0.08. Vignette 0.24 / 0.05 (A6). Birds every 35–80 s. | Sky reads as overcast with structure. 1–12 px DoG sd 3.1–3.5 vs the reference's 5.9 (same metric). Top-left −23% in a still. |
| A4 Stone | Bump 2, maria −0.14, mottling at three scales plus pitted speckle, range [0.18, 0.62], lighter crater rims, fewer craters, shallow basins, wrap 0.55, 1.3 px limb. | Lunar maria and mottling. The albedo-only render has structure (L sd 13), which fixes K5. |
| A2 Crest and composition (A5 commit) | Heading gets ±3° at 13 H plus 3 H shoulders easing toward 17°. One 0.06–0.12 H notch per ~4 H, outside the contacts. Anchor (0.46 w, 0.54 h). END_LEAD 10.4. | Convex and concave runs. Stone centre ≈ (0.56, 0.30). Rock fraction 0.44. Summit stays hidden (tests on six viewports). |

**Engineering**

- **K1:** the governor uses the rAF interval. Headless SwiftShader now steps 60 → 30 fps → Q 0.75 → Q 0.5, then hands off to Canvas 2D after about 55 s, which then runs at about 30 fps.
- **K2:** a lost context shows a dark base; with no restore within 1 s the scene falls back.
- **K3:** phone ground speed is 15.2 px/s.
- **K7:** ρ continues into the next climb.
- All of these are covered by tests.

**Deviations**

- **Rear knee 164–166°, not ≥ 165° everywhere:** it can't go higher without bringing back the toe-off flick or giving up exact planted feet.
- **Smaller crest heading variation (±3°, not ±6°):** larger curvature makes the stone's surface run up to 5% off the ground. The roll tests now check the physical no-slip condition (d ρ · R equals the centre's arc within 1%) and check the ground within 6%.
- **Lead ahead of the stone relaxed from 3.5 H to 3 H** to put the stone on the third.
- **The thigh spike bound is 11×:** the lunge reverses the thigh faster at toe-off.
- **K6 not done:** the stand spot is about 10 H past block end, so a walked arrival at 2× pace would take about 38 s against the 7 s stand rule. The cross-faded cut stays.
- **K8 skipped:** crackle and scratches risk reading as drawn lines.
- **A7 partly done:** clumped two-octave grain only.
