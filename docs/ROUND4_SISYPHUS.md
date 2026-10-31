# StruggleMore round 4: Sisyphus redesign, a richer drawing, and a forward roll

Owner: designer agent · Status: v1, ready to implement · Branch `round4` · **Replaces** `docs/ROUND3_ART.md` §3 (the figure) and §4.2–4.8 (the push cycle), and adds a figure detail layer and boulder detail. Everything else in ROUND3_ART stands: the black-figure style, the palette, the endless camera-tracked incline, the summit hidden until the block ends, the clean cut to the next climb (REVIEW_ROUND3_ART U3), mountain state. Where they disagree, this doc wins.

**The user's words:**
1. *"[LottieFiles/motion-design-skill] add this skill and redesign Sisyphus, also make the ball roll forward not backwards."*
2. *"Make the drawing of Sisyphus more detailed — right now it doesn't look all that detailed."*
3. *"Also make the movements cleaner."*

The skill is vendored unmodified at `.claude/skills/motion-design/` (upstream f9a8a04). This redesign also uses `.claude/skills/physics-intuition` and `.claude/skills/follow-through-overlapping`.

**In one line:** an upright, broad-shouldered black-figure hero whose rear leg and back form one straight 20° spear, arms locked nearly level into the stone, head bowed between them. He trudges in a continuous, heavy one-step rhythm and never freezes. The stone rolls **clockwise**, forward, by exactly the distance it travels. The incised cracks and strata on the stone make that roll readable. He is drawn with a full set of ochre anatomical incisions, scaled by level of detail.

---

## 0. Decisions at a glance

| Question | Decision |
|---|---|
| Motion personality | **Premium**, made heavy: 0% overshoot on body and stone, signature easing `cubic-bezier(0.4, 0, 0.2, 1)`, durations × 1.2 for rigid stone (420 / 600 / 960 ms palette). |
| Emotion | "Struggle with dignity" = **Weight** (slow, cubic in-out, 600–1200 ms, downward dips) carried by **Confidence** (one straight, purposeful diagonal path for the stone and the body's line of action). |
| Rhythm | **Continuous single-step trudge** with a loaded *press* phase, not step-pair-and-freeze. Period P = σ / v ≈ 3.1 s at 22°. Pelvis and stone never stop while climbing (speed ≥ 0.35 v̄). |
| Pose | Pelvis **0.43 H** above the ground (was 0.36). Torso lean **20°** from vertical. Rear leg straight (knee ≥ 168°), collinear with the torso. Front knee ~106° under the body. Arms ~14° above horizontal, palms just below the stone's 9 o'clock. Head between the arms. |
| Size | Landscape `Hpx = 0.26·h` (was 0.24). Boulder R = **4.2 h = 0.525 H** (was 4.5 h). The push silhouette is ≥ 22% of viewport height on desktop and ≥ 15% on a phone. |
| Roll | **Bug fix:** canvas rotation = `+centreArc(sB)/R`. Rolling right/uphill = clockwise. A slip rolls back counter-clockwise, then forward again. Outside a slip, `sB` is ratcheted so it never decreases. |
| Detail | A bone-attached **ochre detail layer** of ~70 incision strokes in three LOD tiers. New hands with spread fingers, gripping toes, a Greek profile with an almond eye, curl rows, a knotted belt, pleats and a dotted hem. Strain veins draw on. Extra cost ≤ 1.5 ms per frame. |
| Clean motion | Fixed 120 Hz sim with render interpolation, C1 blends in parameter space, soft-reach IK with no bend flips, a constant-speed feed-forward camera, and calm secondary amplitudes. Measured by joint-angle, acceleration, jerk and discontinuity limits over 10 s captures (§7). |
| Boulder | The sprite gains 3 incised strata, 2 forked cracks and 2 chipped facets (asymmetric), with the speckle thinned. A short, screen-fixed contact arc that doesn't rotate. |

---

## 1. How the skills are applied (specific, file by file)

### motion-design `SKILL.md` 8-step checklist, answered

| Step | Answer for Sisyphus |
|---|---|
| 1 Emotional target | Struggle with dignity: heavy but never defeated. |
| 2 Personality | Premium (see below). It overrides the "Playful for illustrations" default because the app is a study tool seen for hours ("Seen 100x/day → fast, subtle", decision-framework). |
| 3 Primary property | **Position** (pelvis travel up the slope = progress, "Rightward = progression", "Upward = aspiration"). **Rotation** is the stone's secondary ("Continuous = ongoing activity", property-selection). |
| 4 Duration | Heavy / sad-serious tier: 600 ms+ beats (disney-principles §9). Cycle 3.1 s. |
| 5 Easing family | On-screen in-out for the body. Decelerate (MD3 Decelerate `(0,0,0,1)` → softened to `(0.2,0,0,1)`) for a foot landing (an "entrance"). Accelerate `(0.3,0,1,1)` for a slip (gravity: an "exit"). Sine for loops. |
| 6 Hero | The figure's pelvis and legs during a step; the stone's roll during the press. One hero per beat. |
| 7 Secondary + ambient | Secondary: stone lag, elbow give, head lag, beard, cloth. Ambient: breath, lean noise, wind on cloth and fillet. |
| 8 1/3 rules | The stone moves ~0.4 H per cycle (≈ 10% of the screen width). Only the legs and pelvis are in primary motion at once, about 1/3 of the 8 moving parts. |

### `director/core-philosophy.md`
- **Three pillars:** emotion (§0); narrative = setup (anticipation) → action (step) → resolution (press), per cycle (§4.2); craft = physics, arcs, drag hierarchy (§4.4–4.6).
- **Three layers with amplitudes:** primary = pelvis travel and leg swing (100%). Secondary = elbow give (≈ 30% of knee flexion), stone lag, head pitch ±3° (≈ 35% of lean change), cloth swing. Ambient = breath ±1.5% chest depth and lean noise ±0.4°, ≤ 15% of primary vertical motion (breath shoulder rise 0.004 H vs pelvis excursion 0.026 H).
- **"Nothing starts and stops all at once"** is the reason for dropping the hold freeze (§4.1).
- **Secondary offset 50–100 ms** from primary, with different easing: torso 60 ms, stone ~80 ms (spring), head 120 ms.

### `director/motion-personality.md`
- **Premium:** duration 350–600 ms, `(0.4,0,0.2,1)`, 0% overshoot, "squash-stretch: never", "generous pauses". The pause becomes the press, which is slow but never frozen.
- **Brand motion identity for the figure:**
  - signature easing `(0.4, 0, 0.2, 1)` on 80% of channels;
  - duration palette ×1.2 (rigid material): **quick 420 ms** (head nod, regrip, toe-off), **standard 600 ms** (recover, catch settle), **slow 960 ms** (press, swing action);
  - one consistent "entrance" (foot plant): decelerate onto a flat sole, no bounce.
- **Mixing archetypes:** 90% Premium. The strain beat borrows one Corporate trait (a firm stop, 0–3%) and is still not bouncy.

### `director/emotion-mapping.md`
- **Sadness/Weight** row: cubic ease-in-out, 600–1200 ms, "drooping curves". These map to the pelvis dips at weight accept (−0.014 H), the bowed head and the 960 ms phases.
- **Confidence** row: "direct, decisive, straight". This maps to the line of action (rear ball → hip → shoulder) as one straight 20° stroke, and the stone's path as a straight diagonal.
- **Path as language:** "Straight diagonal = dynamic, purposeful" for the climb; "Vertical up = growth, achievement" for the summit chin lift (12° up, §3.4); "Vertical down = settling" for the seated break.
- **Intensity: low** while climbing (seen all session). **Medium** for strain and slip (once every 4–8 cycles). **High** only at the summit.

### `director/disney-principles.md`

| Principle | Applied as |
|---|---|
| 1 Squash/stretch | **None** on the body or stone (Premium + rigid). The only volume change is the palm widening ×1.06 under load and the stance calf bulging +6% at push-off, with the shin back depth taking it (volume preserved). |
| 2 Anticipation | Before each step, a **350 ms load**: pelvis sinks 0.010 H, lean +1.5°, rear heel drops 6° then fires. That's ≈ 10–15% of the step's vertical action (the low end of 10–20%, Premium "subtle tension"). It's a sink, never a retreat, so the stone never back-rolls outside a slip. |
| 3 Staging | Profile silhouette with three open negative spaces (§3.3). The far arm and leg sit back by an incision, and nothing in the background moves faster than him. |
| 4 Pose to pose | The body is keyed pose to pose (§3.4 keys). Cloth, beard and hair are straight-ahead (springs and Verlet). |
| 5 Follow-through/overlap | Drag hierarchy with offsets of 60 / 120 / 180 / 250–350 ms (§4.5), inside the 50–150 ms child delay per level. |
| 6 Slow in/out | No linear spatial motion. Travel is a keyed monotone cubic, and the foot plants on `(0.2,0,0,1)`. |
| 7 Arcs | The swing foot follows an early-peaked arc (peak 0.065 H at 40% of swing). The knee leads up and forward. The head bob follows the shoulder arc, and the hands' path is the stone's arc. |
| 8 Secondary action | Breathing, elbow give (170° → 164°), beard sway, cloth, the rear heel peeling during the press. |
| 9 Timing | Heavy: 960 ms swing action, a 3.1 s cycle, slip 300 ms (fast = gravity wins), recover 600 ms (slow = effort). |
| 10 Exaggeration | 0–5% (Premium). Only the strain tremor (0.0015 H) and the slip's knee fold are pushed slightly past realism. |
| 11 Solid drawing | Bone lengths constant, part widths constant (except breath, calf), detail lines in bone-local frames so they keep volume (§6). |
| 12 Appeal | Heroic V torso (chest:waist depth 1.7:1), clear profile, no jerks. The hold pop and the backwards spin, two "appeal killers", are removed. |

### `director/choreography.md` and `patterns/multi-element.md`
- **Counter-motion:** the hero moves right/up while the ground and ranges scroll left at the existing parallax ratios (1.0 / 0.5 / 0.2). The stone turns clockwise and the grit drifts down-left ("Rotates CW → ambient CCW/opposite").
- **Attention budget:** max 2–3 elements in active motion. During the step: legs + pelvis (hero), with the stone trailing. During the press: the stone (slow roll) + breath.
- **Leave 100–200 ms of stillness after resolution:** the press's slowest point (speed 0.35 v̄) is the "breathing room". It's slowed, not stopped.
- **Timing overlap 25% ("brisk")** between the end of the press and the anticipation of the next step.

### `director/narrative-structure.md`
- **Scaling to duration, 800 ms+ row** (anticipation 20 / action 30–35 / reaction 15–20 / resolution 25–30). Our cycle is anticipation 11% (Premium "subtle tension", deliberately at the low end), action 33%, reaction 25%, resolution (press) 31%.
- **Multi-beat "Cycle: depart → peak → return → repeat"** structures the trudge. **"Build-Up"** structures the strain beat; **"Impact: sudden action → ripple → slow settle"** structures the slip.

### `director/decision-framework.md` and `context-adaptation.md`
- **Purpose:** "Create atmosphere: subtle, continuous" plus "Explain relationship" (progress). **Audience:** "Stressed → calm motion"; "Task-focused → minimal". So there are no surprises, and drama is kept for the summit.
- **Direction:** rightward/upward = progression. The slip is the only leftward motion (regression), lasts 300 ms, and is undone.
- **Evaluation "Fine on 100th viewing?":** a single repeating 3.1 s cycle with seeded variation (§4.7). No sharp events more than once per 12 s.
- **Mobile:** reduced complexity. The phone gets LOD L2, 2-link cloth flaps and no fillet tail. Durations can't shrink by 0.8× because the pace is tied to real distance; the phone keeps the same pace.
- **Reduced motion:** "Continuous ambient → static", "never auto-play loops". So reduced motion shows the static key pose, re-posed once per second, with no breath and no cloth.
- **Dark mode / night** (summit, break): line colour unchanged. Ambient amplitude is reduced 20% (breath ±1.2%).
- **Performance:** "animation logic <10 ms/frame". The detail layer is ≤ 1.5 ms (§6.6).

### `reference/timing-easing-tables.md`

| Channel | Value from the tables |
|---|---|
| Body channels (lean, pelvis height, head pitch) | Gentle float / Premium `(0.4, 0, 0.2, 1)` between keys |
| Foot plant (last 150 ms of swing) | Decelerate family, `(0.2, 0, 0, 1)` |
| Slip (300 ms) | MD3 Accelerate `(0.3, 0, 1, 1)` |
| Catch (300 ms) | spring, stiffness 300, damping 26 (between "Very stiff" and "Standard"), ζ ≈ 0.75 → ≤ 3% overshoot (Corporate 0–3%) |
| Recover (600 ms) | `(0.4, 0, 0.2, 1)` |
| Stone follow | critically damped (ζ = 1, ω = 12 rad/s): "Rigid: 1.2×, 0% overshoot" |
| Beard, fillet tail | "Gentle" spring: stiffness 120, damping 22 (ζ ≈ 0.9 at unit mass) |
| Cloth flaps | Verlet (chain.ts), damping 0.82; settles in ~300 ms |
| Strain veins draw on / off | on 450 ms `(0.2,0,0,1)`; off 300 ms `(0.3,0,1,1)` (exit = 65–75% of entrance) |
| Stone rotation | **linear in distance** (rotation is the permitted linear case), but the distance itself is eased |
| Overshoot budget | 0% climbing (Premium, Error/rigid row), ≤ 3% catch |

### `reference/quality-checklist.md` items this doc commits to
- **Visual:** elements > 40 px (the figure is ≥ 198 px; the hands are 26 px but carry no motion of their own); readable at full speed; three layers; natural arcs; the 1/3 distance rule (the stone moves 10% of the width per cycle); the 1/3 density rule.
- **Technical:** no linear spatial easing; follow-through 50–150 ms per level; entrance ≥ exit (vein draw-on 450 ms vs draw-off 300 ms).
- **Emotional:** target set first; one personality; setup → action → resolution per cycle; same motion for the same beat every time; fine on the 100th view.
- **Performance:** transforms only per frame (cached detail paths); ≤ 20 animated elements; 60 fps target, 30 fps acceptable.
- **Accessibility:** reduced-motion alternative (§4.9); the pause control already stops loops > 5 s; progress is never conveyed by motion alone (HUD altitude and meander).

### `patterns/ambient-continuous.md`
- **Breathing:** chest depth 0.985–1.015 ("Waiting/idle 0.98–1.02, 3000 ms" row, tightened), period **3.6 s** (inhale 1.6 s, exhale 2.0 s), sine. Shoulders rise 0.004 H on the inhale.
- **Layered periods that never sync:** cycle 3.08 s, breath 3.6 s, lean noise 4.8 s, wind gust 7.7 s ("different durations prevent sync").
- **Floating rotation ±2–3°:** the cloth flaps idle-sway ±3° on wind, offset 30% from breath.
- **Total ambient ≤ 20%** of the primary's visual energy.

### `physics-intuition`
- **"What does this weigh?"** The stone is about 3× the figure. So the stone accelerates late (spring lag ~80 ms), stops late, never bounces, and the body absorbs everything through the knees and elbows.
- **"Heavy = slow to start, slow to stop":** pelvis velocity rises over 350 ms of anticipation and decays over the 770 ms accept.
- **"Force requires windup":** the anticipation sink (§4.3).
- **"Floaty" fixes:** more ease-in at start (load), more ease-out at stops (accept dip), settling (the stone spring and cloth).
- **"Stiff" fixes:** parts arrive at different times (drag hierarchy); arcs on every trajectory.
- **Gravity in the slip:** accelerating ease-in.

### `follow-through-overlapping`
- **Drag hierarchy:** root = pelvis (0 ms) → primary = torso (60 ms), arms/stone (~80 ms spring) → secondary = head (120 ms), hands (locked; they ride the stone) → tertiary = beard (180 ms), nape curls and fillet tail (250 ms), loincloth flaps (250–350 ms).
- **Stagger formula** (2–4 frames at 24 fps per level, 83–167 ms): torso 1.5 frames, head 3 frames, beard 4.3 frames, cloth 6–8 frames. Each level sits inside the formula's window.
- **Settling curve:** tertiary parts overshoot once (≤ 4° beard, ≤ 6° cloth), with one micro counter-swing, then ease to rest. The body itself never overshoots.
- **Common mistakes avoided:** no "everything stopping simultaneously" (the step ends with the stone, then head, then beard, then cloth arriving); no "excessive follow-through" (beard ≤ 4°).

---

## 2. Critique of the current figure and motion

Frames: `docs/screenshots/round3-art/focus-p0.5.png` (1440×900), `push-sheet.png` (f0–f11), `push-04.png`, `phone-p0.5.png`, `summit-reveal.png`.

1. **It reads as a crouch because the pelvis is low.** The hold pelvis is 0.36 H with a 0.48 H leg, so hip height is 69% of standing (focus-p0.5: hip ~85 px above the front foot at Hpx 216). Both knees are bent in most sheet frames (f3–f6, f9–f11), giving a sprinter's Z rather than the reference's long straight rear leg.
2. **The arms reach up.** Because the shoulders are low (pelvis 0.36 + a torso leaning 38° off the slope normal), the stone centre sits above the shoulder line. Both arms climb at ~30–40° to a contact at the stone's lower-left, about 8 o'clock (push-04: hands at ~(310, 200), stone centre (425, 140)). The reference's palms are at shoulder height with near-level arms.
3. **The line of action is broken.** Shin forward, thigh back, torso forward, arms up: four directions. Nothing reads as one push.
4. **Silhouette and mass are slight.** Limbs are thin, forearms taper to sticks, and chest:waist depth is only 1.5:1. The near and far arms merge into one thick bar (push-04), so "both arms extended" doesn't read. In passing frames (f4, f10) the leg triangle closes into one black mass, and the sky wedge under the arms is a sliver.
5. **The head is wrong.** The 70° neck thrust juts the head forward like a turtle. The skull is small, and its most legible feature at 216 px is the **ear spiral, which reads as a goggle/ring** (focus-p0.5 at ~(527, 432); phone-p0.5 at ~(120, 465)). The face profile (brow, nose, beard edge) doesn't separate from the neck.
6. **The hands and feet are lumps.** The hand is a 9-point blob with 3 sub-pixel lines, and no fingers read on the stone. The feet are small wedges with no toes; the rear foot pivot reads as a point.
7. **The cloth is a boxy band** with vertical stripes reading as a skirt or diaper (focus-p0.5 at ~(505, 505)). The flaps are tiny spikes. The hard horizontal at the waist cuts the V-taper.
8. **Hair and beard are rigid**, so the only follow-through is two cloth spikes. The body "stops all at once" (follow-through skill, mistake 1).
9. **The rhythm is shuffle-shuffle-freeze.** A step pair takes ~2 s, then a 1.8–3.2 s hold with the stone and pelvis fully stopped (REVIEW_ROUND3_ART motion critique). Troubleshooting would call this "looks robotic / everything synced". During the hold the stone doesn't turn at all, so for 40–60% of the time there's no roll to read.
10. **The stone spins backwards.** `drawBoulder` does `g.rotate(-rot)` while `rot = centreArc(sB)/R` grows with travel. In canvas y-down coordinates that's counter-clockwise for a stone moving right. The rim speckle is also nearly rotationally uniform, so even correct rotation reads weakly. The fixed, dashed 140° contact arc fights the rotating flecks (a wagon-wheel effect).
11. **Detail:** there are ~25 contour lines in total, mostly 3–4 px long at 216 px, so the figure reads as a flat silhouette. The reference has rich ochre interior linework: abdominal grid, curls, fingers, pleats.

---

## 3. The redesigned Sisyphus

### 3.1 Proportions (8 heads, heroic, H = 8 h, h = 0.125 H)

| Part | Length (h) | Profile half-depths front / back (h) at stations along the bone | Change vs round 3 |
|---|---|---|---|
| Head (crown → chin, beard extra) | 1.05 | skull depth 0.95; beard wedge 0.35 below the chin | +5%, a real face profile (§6.3) |
| Neck | 0.45 | 0.34 / 0.34; trapezius flare 0.55 at t 0 (back) | thicker, shorter |
| Torso (hip joint → shoulder joint) | 2.5 | front: hip 0.55 · waist (t .35) **0.42** · pec (t .68) **0.80** · t .9 0.66 · shoulder 0.48. back: buttock 0.74 · lumbar (t .3) **0.44** · lats (t .66) **0.70** · trapezius (t .95) 0.62 · neck 0.42 | chest:waist depth **1.74:1** (was 1.51) |
| Upper arm | 1.45 | deltoid (t .1) **0.50** · biceps (t .55) 0.34 · elbow 0.20 / triceps (t .4) 0.36 · elbow 0.20 | heavier |
| Forearm | 1.25 | t .25 **0.30** → wrist 0.15 / t .25 0.28 → wrist 0.15 | no stick taper |
| Hand | wrist → palm centre 0.40, → fingertips 0.85 | palm 0.42 wide; 4 fingers 0.10 wide; thumb 0.30 | new construction (§6.4) |
| Thigh | 2.0 | quad (t .3) **0.52** → knee 0.28 / glute–hamstring (t .15) **0.54** → knee 0.28 | heavier |
| Shin | 1.95 | shin 0.19 → ankle 0.13 / **calf (t .25) 0.48** → ankle 0.14 | defined calf |
| Foot | heel → ball 0.75, ball → toe 0.35; ankle 0.3 | heel r 0.2; toes as a separate pitched segment | gripping toes |
| **Boulder** R | **4.2** (0.525 H) | — | Ø 1.05 H, about the figure's height (reference) |

Standing check: ankle 0.3 + shin 1.95 + thigh 2.0 = hip 4.25 h; shoulder 6.75 h; neck top 7.2 h; crown 8.0 h. `LEG_CHAIN = 0.494 H`, `ARM_CHAIN = 0.3375 H`.

**Size on screen** (`camera.ts`):
- Landscape: `Hpx = 0.26·h` (234 px at 900). The push silhouette (rear ball → top of the shoulders) is ≈ 0.86 H tall, so ≈ **22.4%** of viewport height. The stone is Ø 246 px.
- Portrait: `Hpx = min(0.19·h, 0.40·w)` (156 px at 390×844), so the silhouette is ≈ 134 px, **15.9%**. The stone's right edge is at ≈ 0.86 w with anchor x = 0.25 w.
- The anchor y and the end clamp are unchanged. Re-run the ROUND3_ART §4.9 end-clamp test at the new Hpx.

### 3.2 Silhouette construction

Keep the round-3 pipeline (bone-local capsule outlines → Catmull-Rom loops → grouped flat fills → ochre halo incision; `figureArt.ts`) with these changes:
- **Stations as above.** The torso gets a convex back arch (mid-back bows out 0.12 h) and a **V-taper**: the waist station sits under the cloth's belt line, so the belt reads as the narrowest point.
- **Shoulder mass:** a separate `deltoid` lobe (ellipse 0.55 × 0.42 h, centred 0.12 h along the upper arm, long axis on the bone) is added to each arm group, so the shoulder reads as a ball and the near arm separates from the torso by its halo.
- **Far side recessed:** the far arm's shoulder is offset 0.03 H back and up along the torso normal, and the far hand sits 0.05 H higher around the stone. The far leg's foot is 0.015 H higher. Both arms then read as two parallel bars with a 0.02 H ochre-haloed gap at the forearms.
- **Head:** a new outline (§6.3) with a straight Greek profile (forehead and nose on one line), a brow notch, lips and a spade beard. The crown is a curl cap of 9 scallops of r 0.09–0.12 h.
- **Hands and feet:** new outlines (§6.4, §6.5).
- **Cloth:** a short wrap plus belt plus two flaps (§6.7). The top edge is the belt, dipping 0.06 h toward the front. The hem is a gentle curve, not a straight band.
- **Bezier rule:** every outline is a closed Catmull-Rom (tension 0.5) through its stations, with caps of radius = the joint half-depth. Contour and detail lines are open Catmull-Rom curves (§6).

### 3.3 Line of action and negative space

- **Line of action (key pose):** one straight stroke from the rear ball → hip → shoulder at **20° ± 3° from vertical**, the "spear". The arms are a second, near-level stroke at **14° ± 4° above horizontal** into the stone's centre. The angle between the spear and the arms is ~124°. The head sits in that crook.
- **Three negative shapes must stay open** (reviewer checks on a silhouette render):
  - the leg triangle: at least 0.06 H between the inner thigh lines at knee height, open in ≥ 90% of cycle frames;
  - the arm wedge (under the near arm, in front of the chest, left of the stone): near elbow ≥ 0.09 H from the chest outline;
  - the wedge between the rear leg and the slope: the rear knee ≥ 0.12 H above the ground.

### 3.4 Key poses

Conventions: reference slope θ = 22°. Distances are along the trail (t) and its normal (n), in H. **Lean** is the torso (hip → shoulder) angle from **world vertical**, + = uphill. **Thigh/shin** angles are measured from the downward slope normal, + = forward (uphill). **Knee/elbow** are interior angles. **Foot pitch** is relative to the ground, + = heel up. The neck is measured from world vertical. The head axis is from world vertical, with 90° = crown pointing straight forward. Stance values are IK outputs (check ±5°). Swing values are FK keys.

**Pelvis height rule:** `h0(θ) = 0.43 + 0.004·max(0, 22 − θ)`, capped by `hipCeiling` at `LEG_MAX = 0.996`. **Lean rule:** `lean0(θ) = 20 + 0.25·(θ − 22)`, clamped to 16–24°. **Feet:** front ball +0.12, rear ball −0.29, × cos θ / cos 22°. **Stride** σ = 0.41 H at 22°.

| Pose | Pelvis n (H) | Lean | Front leg: thigh / knee / foot | Rear leg: thigh / knee / foot | Arms (elbow) | Neck / head axis | Notes |
|---|---|---|---|---|---|---|---|
| **Push-hold (key)**: end of press, max extension | **0.43** | **20°** | +43 / **106** / 0 (flat, ball +0.12) | −38 / **170** / +30 (on the ball, −0.29) | **170°**, direction ≈ 14° above horizontal | 58° / 105° | Head centre ≈ shoulder + (0.11, 0.015) H, on the near arm line. Palms at ≈ 194° on the stone (just below 9 o'clock). |
| Press start | 0.43 | 19.5° | +48 / 112 / 0 | −33 / 166 / +22 | 171° | 58° / 104° | Pelvis 0.05 H behind the key position; the press creeps forward to the key. |
| Anticipation (load) | 0.42 | 21.5° | +46 / 104 / 0 | −37 / 168 / +24 (heel drops 6°) | 167° (gives 3°) | 58° / 107° | The calf loads like a spring. |
| Push-off (toe-off) | 0.424 | 23° | +36 / 116 / 0 | −42 / **176** / +44 | 165° | 58° / 102° (−3° pitch, lags 120 ms) | The rear ankle extends; the stone surges. |
| **Step passing** | **0.442** (vault +0.012) | 21° | stance: +6 / 150 / +4 | swing: +12 / **82** / −15 (toe down), clearance 0.065 H | 166° | 58° / 104° | The knee leads; the shin hangs. |
| Reach | 0.436 | 20° | stance −12 / 162 / +12 | swing +40 / 104 / −4 | 168° | 58° / 105° | |
| **Step contact** | 0.426 | 19.5° | swing → new front: +44 / 104 / 0 (flat plant on `(0.2,0,0,1)`) | stance → new rear: −28 / 165 / +20 | 168° | 58° / 106° | |
| Weight accept | **0.416** (dip −0.014) | 19° | +46 / 100 / 0 | −30 / 166 / +22 | 164° (stone lag; elbows give 6°) | 58° / 107° (+2°, lags) | The beard and cloth swing forward. |
| **Strain** (brace → hold) | 0.405 | **25°** | +48 / 96 / 0 | −36 / 168 / +38 | 165° | 60° / 112° (deeper bow) | Tremor 0.0015 H at 9 Hz on pelvis and hands. Veins draw on (§6.8). |
| **Slip** (lowest point) | 0.385 | 28° | +50 / **88** / 0 | −34 / **158** / +34 | **148°** | 62° / 116° | Pelvis back 0.05 H; the stone rolls back CCW (§5). |
| Recover → key | 0.43 | 20° | key | key | 170° | key | |
| **Summit stand** | 0.50 | 3° | weight leg: +4 / 174 / 0 | free leg: −10 / 162 / +10, feet 0.22 apart | near hand flat on the stone's upper flank at 140°, elbow 158°; far arm hangs, elbow 165° | 15° / **−12°** (chin up 12°) | Contrapposto: pelvis tilt 3° toward the free leg, chest up 2%. |
| **Seated break** (facing −1) | 0.06 (on the buttocks) | −10° (leaning back on the stone) | both thighs 15° above horizontal, knees 75°, feet flat | — | forearms on the knees, elbows 95° | 20° / 112° (bowed 12°) | The eye becomes a closed lid line; breath slows to 4.5 s. |

At the key pose the rear-leg direction (ankle → hip) works out to 20.8° from vertical, collinear with the 20° torso: that's the spear. With pelvis 0.43, shoulder n ≈ 0.65 and stone centre n = 0.525, the arm drop is ≈ 0.12 over ≈ 0.91 → −7.5° in the slope frame → +14.5° in the world. That gives level arms at shoulder height without the figure folding.

---

## 4. Motion redesign

### 4.1 Decision: continuous trudge, not step-and-hold

**Continuous single-step trudge with a loaded press.** Reasons:
- core-philosophy: "nothing starts and stops all at once";
- follow-through: "everything stopping simultaneously = robotic";
- decision-framework: "fine on the 100th viewing" (a freeze-then-shuffle draws the eye on every restart);
- the roll needs continuous travel to be readable (§5).

Real heavy pushing is step → re-brace → step, with the load never released. The press is that re-brace: both feet planted, the pelvis creeping forward 0.05 H while the rear heel peels up 22° → 30°. It's slow (0.35–0.5 v̄) but never zero.

The round-3 rules stay: no foot sliding, and the stone only moves with real travel.

### 4.2 Cycle timing (θ = 22°, P = σ / v = 0.41 / 0.133 = **3.08 s**)

Phases are fractions of P, with ms at 22°. P scales with slope through σ (`cosRatio`) and the debt controller (§4.7).

| Phase | u | ms | Narrative act | Pelvis travel (× σ) | What happens | Easing |
|---|---|---|---|---|---|---|
| **Press** | 0.00–0.31 | 0–950 | resolution (25–30%) | 0.00 → 0.12 | both feet planted; pelvis creeps; rear heel peels 22 → 30°; breath dominant; the stone rolls slowly | travel slope 0.35 → 0.45 v̄; channels sine |
| **Anticipation** | 0.31–0.42 | 950–1300 | anticipation (≈ 11%) | 0.12 → 0.15 | sink −0.010 H, lean +1.5°, rear heel −6°, elbows give 3° | `(0.4,0,0.2,1)` in, held 50 ms ("tension: hold compressed ~50 ms") |
| **Action: push-off → swing → contact** | 0.42–0.75 | 1300–2310 | action (33%) | 0.15 → 0.88 | toe-off at 0.44; passing at 0.58 (vault); reach at 0.70; contact at 0.75 | travel peaks at 2.1 v̄ at u 0.55; swing foot on an arc; plant on `(0.2,0,0,1)` over the last 150 ms |
| **Reaction: weight accept** | 0.75–1.00 | 2310–3080 | reaction + start of resolution (25%) | 0.88 → 1.00 | dip −0.014 H at u 0.80; stone lag catches; elbows re-lock; head (120 ms), beard (180 ms), cloth (250–350 ms) arrive in turn | `(0.4,0,0.2,1)` |

**Travel curve:** a monotone cubic (`keyCurve`) through (0, 0), (0.31, 0.12), (0.42, 0.15), (0.55, 0.42), (0.75, 0.88), (0.88, 0.97), (1, 1), with **end slopes set to 0.35** (in σ per cycle × P) instead of zero, so the velocity is continuous across cycles. Fritsch–Carlson keeps it monotone, so the stone never back-rolls.

**Pelvis height Δ keys** (H): u 0 → 0; 0.38 → −0.010; 0.46 → −0.006; 0.58 → +0.012; 0.70 → +0.006; 0.80 → −0.014; 1 → 0. **Lean Δ** (°): 0 → −0.5; 0.38 → +1.5; 0.46 → +3; 0.58 → +1; 0.75 → −0.5; 1 → −0.5 (the press slowly returns to the key).

### 4.3 Anticipation before each step
Over 350 ms: the pelvis sinks 0.010 H, the lean deepens 1.5°, the rear heel drops 6° (the calf pre-loads) and the elbows give 3°. All of it is the opposite of the coming lift and shove. It holds for 50 ms, then fires: the heel goes 24° → 44° in 160 ms on `(0.2,0,0,1)`. **There is no backward pelvis travel**, so the stone's rotation stays ≥ 0.

### 4.4 Legs (foot-lock kept)
- **Stance foot:** the ball is locked in world space at plant (`trail.at(sPlant)`). The heel and ankle rotate about the ball, and two-bone IK runs hip → ankle with the knee uphill. `hipCeiling` lowers the pelvis, never moves a foot.
- **Swing foot:** FK from the keys for u 0.44–0.66, blending to IK with `smoothstep(0.66, 0.75, u)`. The arc's peak is 0.065 H at swing-u 0.40, and the knee leads. The clearance guard is kept (≥ 0.02 H above the ground).
- **Toes:** the toe segment pitches about the ball. On a planted flat foot the toes curl −8° into the ground (grip). On the rear foot, at heel ≥ 20°, the toes stay flat on the ground while the foot rises (dorsiflexed toes). That's the push off the ball of the foot.

### 4.5 Torso, arms, head: overlap and follow-through

| Level | Element | Lag behind pelvis | Mechanism |
|---|---|---|---|
| root | pelvis | 0 | keys |
| primary | torso lean | 60 ms | history buffer (as now, 50 → 60 ms) |
| primary | stone | ≈ 80 ms effective | critically damped spring on `sB`, ω = 12, toward the ratcheted target (§5.2) |
| primary | arms | ride the stone | IK to the stone; the elbow takes up the stone lag (170° → 164° at accept, clamp extension [0.93, 0.995]) |
| secondary | head pitch | 120 ms | delayed pitch channel: −3° at push-off, +2° at accept |
| tertiary | beard | 180 ms | angular spring about the chin (stiffness 120, damping 22). Input = −head angular acceleration × 0.004 + wind. Clamp ±4°. |
| tertiary | nape curls, fillet tail | 250 ms | 2-link Verlet, link 0.22 h, damping 0.85, maxBend 25° |
| tertiary | loincloth flaps, belt-knot tails | 250–350 ms | Verlet chains (`chain.ts`): front and back flaps 3 links (phone: 2), knot tails 2 links |

- **Hands stay on the stone** (≤ 2 px). The palm widens ×1.06 under load. The hands are the stone's, not the arm's: no hand moves except for a regrip during an idle at the summit.
- **Breathing** (ambient): chest depth × (1 ± 0.015), shoulders ± 0.004 H, period 3.6 s (1.6 in / 2.0 out). It holds at full inhale during the brace and exhales sharply at the catch.

### 4.6 Strain and slip-recover (every 4–8 cycles, every 3–5 in the last 30% of a climb, never in the first 30 s)
The beat takes 3.0 s and replaces one press (its travel is paused and caught up afterwards).
- **0–500 ms brace:** lean → 25°, pelvis −0.025 H on `(0.4,0,0.2,1)`, veins begin drawing on.
- **500–1400 ms hold:** tremor 0.0015 H at 9 Hz, rear heel +8°.
- **1400–1700 ms slip:** stone −0.05 H on `(0.3,0,1,1)` (gravity), so the stone rolls back **CCW 5.5°**. The front knee goes to 88°, the rear knee to 158°, the elbows to 148°, the head drops 8°. 2–3 grit chips fall.
- **1700–2000 ms catch:** spring (300/26, ≤ 3% overshoot). One sharp exhale.
- **2000–2600 ms recover:** the pelvis and stone drive 0.05 H forward on `(0.4,0,0.2,1)`, so the stone rolls forward **CW 5.5°**. The veins draw off (300 ms).
- **2600–3000 ms settle:** back into the press.

Net travel is zero.

### 4.7 Micro-variation and scheduling
- **Seeded per step:** σ × (1 ± 0.05), P × (1 ± 0.04), clearance × (1 ± 0.15), key lean ± 1°, anticipation depth × (1 ± 0.2).
- **Lean noise:** ±0.4° at 0.21 Hz.
- **No identical consecutive cycles.**
- **Debt controller:** `P_i = clamp(σ_i / (v·(1 + 0.35·clamp(debt/σ, −1, 1))), 0.8·P0, 1.25·P0)`. Snap at |debt| > 4σ, as in round 3, with the 300 ms cross-fade.
- **Idles:** the round-3 hold idles are retired while climbing (there's no hold). They live on at the summit stand: regrip, weight shift, look out.

### 4.8 Summit and set pieces
The ROUND3_ART §5.2 beats are kept, with the stone's rotation always taken from `sB` (§5). The stand (§3.4) arrives 150 ms after the torso settles. The chin lifts 12° over 960 ms on `(0.4,0,0.2,1)` ("Vertical up = achievement"). The cloth and beard swing forward and settle. The next climb stays a clean cut (U3).

### 4.9 Reduced motion
The key pose is re-posed once per second at the target; there's no breath, cloth or beard motion. The stone's rotation is still `centreArc(sB)/R`, so its texture is consistent with its position.

---

## 5. Boulder roll

### 5.1 The rule
For a disc rolling without slipping on a curve, the disc's rotation equals **the arc length of its centre's path / R**. That holds on both convex (crest) and concave (col) ground, so `centreArc` is exact.

On screen the canvas is y-down, so a **positive** `ctx.rotate` is **clockwise**. A stone travelling toward +x screen with the ground below it turns clockwise. Therefore:

```
// world → screen rotation; dir = sign of d(screenX)/ds along the trail (always +1 in this app's layouts,
// kept explicit so a future mirrored layout stays correct)
rotCanvas = dir * trail.centreArc(sB, R) / R
ctx.rotate(+rotCanvas)        // FIX: was ctx.rotate(-rot) — counter-clockwise = rolling backwards
```

Angular speed is ω = (d centreArc / dt) / R. At the mean pace that's 0.133 / 0.525 = 0.25 rad/s ≈ 14.5°/s (rim speed ≈ 33 px/s at 1440×900). At the step peak it's ≈ 0.53 rad/s; during the press ≈ 0.09–0.11 rad/s (rim ≈ 11 px/s).

### 5.2 Per state

| State | sB behaviour | Rotation on screen |
|---|---|---|
| Press, anticipation, step, accept | **Ratchet:** `sBtarget = max(sBprev, solveFromShoulder())`, then the ω = 12 spring. The arms absorb any shoulder dip (elbow give), so the stone never backs up. | Δrot ≥ 0, **clockwise**, ω = v_stone / R |
| Strain brace and hold | constant (the shoulder dips into elbow give) | 0 |
| **Slip** | decreases by 0.05 H (accelerating) | **counter-clockwise**, −0.095 rad total |
| Catch | spring (≤ 3% overshoot) | follows sB exactly: a tiny CW/CCW wobble ≤ 0.3° |
| Recover | increases by 0.05 H | **clockwise**, +0.095 rad, net 0 |
| Summit heave and crest | increases (crest is convex; the formula holds) | clockwise |
| Summit settle on the ledge | damped spring ±0.01 H (ζ 0.35, two oscillations) | tracks sB: CW/CCW alternation of ±1.1°, **in phase with its travel** |
| Summit stand, overtime, break | constant | 0 |
| Next climb | **cut** (U3): rot is recomputed from the new stage's `centreArc`. A discontinuity is allowed only on the cut frame. If the §5.4 forward roll down the back side ever returns, sB increases → clockwise (moving right, even downhill, is CW). | — |
| Tab-return snap | jumps under the 300 ms cross-fade | excluded from the test |
| Paused | frozen | 0 |
| Reduced motion | set once per second | consistent with position |
| Phone portrait / landscape | same transform, no mirroring, `dir = +1` | same signs (tested) |

**Grit** spawns at the contact point and leaves down-left (−tangent, +normal), consistent with a clockwise roll (as now).

### 5.3 Texture cues

**Rotating with the stone (in the sprite):**
- **3 incised strata:** gently curved chords at signed offsets +0.35 R, +0.55 R and −0.45 R from the centre, at angles 20°, 35° and 200°. Each spans 0.9–1.3 R, with ±0.01 R waviness, at `LW.contour`. They don't pass through the centre and they aren't parallel, so the orientation is never ambiguous.
- **2 forked cracks** from the rim at 70° and 250°, lengths 0.30 R and 0.22 R, each forking at 60% (fork 0.08 R at 35°).
- **2 chipped facets:** flat notches in the outline at 130° and 310°, 0.025 R deep with a 0.18 R chord. The silhouette itself turns, and the halo shows it against the black slope.
- **6 pock arcs** (r 0.02 R).
- **The rim speckle is kept but thinned by 30%**, so the long features dominate.
- **Asymmetry rule:** no feature within 40° of a feature at +180°, so a half-turn is distinguishable.

**Not rotating (screen-fixed):**
- The **contact arc**, cut to **70°** centred on the contact normal: 3 short dashes. It represents dust and contact, not texture. It's drawn after the sprite, inside a band ≤ 3 px from the rim, so it can't be mistaken for flecks.

**Strobe guard:** at 30 fps the peak per-frame rotation is 0.018 rad, below 1/3 of the minimum angular spacing between major features (≥ 0.35 rad) and below the mean speckle spacing (~0.06 rad). So there's no wagon-wheel effect.

### 5.4 Test spec (`roll.test.ts`, engine stub canvas that records every `rotate()` and the `sB` passed to `drawBoulder`)

```
for layout in [1440×900, 390×844]:
  run the engine on a seeded trail: 60 s climbing (≥ 19 cycles) + a scripted strain beat + the summit sequence
  sample every frame at 60 Hz → arrays sB[i], rotArg[i] (the value passed to ctx.rotate), state[i]
  for each i (skip the cut frame and snap frames):
    dA = centreArc(sB[i+1]) − centreArc(sB[i]);  dR = rotArg[i+1] − rotArg[i]
    if |dA| > 1e-7:  expect sign(dR) == sign(dA)           // forward travel ⇒ clockwise (positive)
    expect |dR − dA / R| < 1e-6                             // exactly the distance travelled
    if state[i] ∉ {slip, catch, summitSettle}: expect dA ≥ −1e-9   // ratchet: never back-rolls
  expect some i in slip with dR < 0, and the recover window's Σ dR ≈ −(slip Σ dR) (±1e-4)
  expect max |dR| at 30 fps < 0.02 rad                     // strobe guard
  pixel check: track the sprite point at the stone's top (rotating marker); while the stone moves right,
    the marker's screen x minus the centre's screen x must increase (top of a CW-rolling disc moves forward)
```

---

## 6. The detail layer ("make the drawing more detailed")

### 6.1 Idiom
In black-figure painting, detail is **incised**: thin lines of the ground colour cut through the black, never shading. So every detail is an ochre (`INK.ochre`) open stroke **inside** a part's silhouette. Each line ends ≥ 0.03 h short of the outline, so it never touches the edge, except at the hem and the belt, which run edge to edge. There are no fills except the eye dot, the ankle dots and the hem dots.

### 6.2 Line weights (CSS px, scale with the figure: `Hz = Hpx·zoom`)

```
LW.contour = clamp(0.0075·Hz, 1.2, 1.8)   // muscle groups, silhouette-scale features (1.76 px at Hz 234)
LW.fine    = clamp(0.0050·Hz, 1.0, 1.4)   // fingers, curls, ab grid, pleats, tendons (1.17 px at 234)
LW.vein    = clamp(0.0042·Hz, 1.0, 1.2)   // strain veins only
LW.incise  = clamp(0.0070·Hz, 1.25, 2.0)  // halo where black overlaps black (unchanged)
```

Round caps and joins. The eye dot is r 0.05 h, ankle dots r 0.035 h, hem dots r 0.025 h.

### 6.3 Attachment (how the lines deform with the rig)
- Each line is a list of points `(t, y)` in its **part's bone frame**: t = 0–1 along the bone, y in head units toward the part's front/anterior (the same frame as `STATIONS`). It's transformed per frame by the bone frame, so it moves, bends and breathes with the part.
- Torso front-side y values are multiplied by `breath`.
- **Joint-spanning lines** (patella, elbow point, gluteal fold) use a **joint frame**: origin at the joint, direction = the normalized mean of the two bone directions, so they bend halfway.
- Head lines use the head frame (`up`, `face`); hand lines use the palm frame; foot lines use the foot frame (with the toe segment's own pitch).
- Muscle bulges that change (calf at push-off, biceps under strain) move their line's y with the same multiplier as the station.

### 6.4 Catalogue (bone-local points; tier = the lowest LOD that draws it; C = contour, F = fine)

**Torso** (t from hip to shoulder; y + front):

| Feature | Points (t, y) | W | Tier |
|---|---|---|---|
| Pectoral underline | (0.60, 0.78) (0.66, 0.55) (0.74, 0.25) | C | L1 |
| Clavicle / upper pec | (0.92, 0.56) (0.96, 0.26) | F | L3 |
| Linea alba | (0.30, 0.44) (0.56, 0.50) | F | L2 |
| Abdominal grid: 3 transverse arcs | t = 0.34, 0.42, 0.50: (t, 0.46) (t+0.015, 0.33) (t, 0.20) | F | L2 |
| External oblique | (0.20, 0.40) (0.30, 0.14) (0.44, −0.04) | C | L2 |
| Iliac line (above the belt) | (0.17, 0.46) (0.11, 0.22) | C | L1 |
| Serratus: 3 rib ticks | t = 0.52, 0.57, 0.62: (t, 0.20) (t−0.03, 0.34) | F | L3 |
| Latissimus edge | (0.40, −0.42) (0.62, −0.56) (0.80, −0.55) | C | L2 |
| Spine groove | (0.30, −0.40) (0.56, −0.45) | F | L3 |
| Shoulder blade | (0.72, −0.50) (0.80, −0.33) (0.88, −0.43) | F | L3 |
| Trapezius into the neck | (0.92, −0.56) (1.04, −0.30) | C | L1 |

**Neck:** sternocleidomastoid (0.0, 0.22) → (1.0, −0.10), F, L2. **Strain only:** external jugular vein (0.15, 0.04) (0.45, 0.08) (0.8, 0.0), one kink, `vein`.

**Upper arm** (y + anterior):

| Feature | Points | W | Tier |
|---|---|---|---|
| Deltoid horseshoe | (0.02, 0.40) (0.30, 0.34) (0.36, 0.0) (0.30, −0.30) (0.05, −0.38) | C | L1 |
| Deltoid split (anterior/posterior heads) | (0.08, 0.0) (0.28, 0.02) | F | L3 |
| Biceps–triceps separation | (0.40, 0.02) (0.88, 0.04) | C | L1 |
| Biceps belly | (0.45, 0.24) (0.70, 0.27) (0.85, 0.16) | F | L3 |
| Triceps horseshoe | (0.50, −0.25) (0.62, −0.10) (0.78, −0.22) | F | L2 |
| Elbow point (joint frame) | tick 0.12 h on the posterior side | F | L3 |

**Forearm:**

| Feature | Points | W | Tier |
|---|---|---|---|
| Brachioradialis | (0.04, 0.16) (0.30, 0.25) (0.62, 0.10) | C | L1 |
| Flexor tendons ×2 | (0.62, 0.05) (0.95, 0.04); (0.66, −0.04) (0.95, −0.05) | F | L3 |
| Wrist wrap (leather cuff) | two cross-lines at t 0.88 and 0.95, edge to edge, plus 3 dots between | F | L2 |
| **Strain:** forearm vein | (0.25, 0.10) (0.45, 0.14) (0.62, 0.06) (0.85, 0.08) | vein | L2 |
| **Strain:** tendons tighten | flexor tendons extend to t 0.55 and shift 0.02 h toward the surface | F | L3 |

**Hand (new construction, palm frame: x along the stone tangent toward "up the stone", y outward from the stone):**
- Palm pad: 0.42 × 0.20 h.
- **Four fingers spread flat on the stone**, fanned at 0°, 8°, 16° and 24° from the tangent, lengths 0.42, 0.46, 0.44 and 0.36 h, width 0.10 h, with rounded tips. Each finger is a separate lobe in the hand outline, so the incision halo draws the gaps between fingers over the black stone.
- **Thumb** at −40°, 0.30 h, wrapping toward the stone's equator.
- **Knuckle row:** 4 short arcs (0.06 h) at the finger roots (F, L3).
- **Nails:** none (too small).
- L1 falls back to a mitten with 2 separation lines.

**Thigh:**

| Feature | Points | W | Tier |
|---|---|---|---|
| Quadriceps front line | (0.12, 0.30) (0.50, 0.40) (0.80, 0.27) | C | L2 |
| Vastus medialis teardrop | (0.76, 0.30) (0.90, 0.18) (0.84, 0.05) | C | L1 |
| IT band | (0.20, 0.00) (0.90, 0.02) | F | L3 |
| Hamstring | (0.60, −0.30) (0.95, −0.16) | C | L2 |
| Gluteal fold (joint frame at the hip, below the hem) | (0.06, −0.50) (0.20, −0.34) | C | L2 |

**Knee** (joint frame): patella oval 0.18 × 0.14 h on the front (C, L1); patellar tendon tick (F, L3).

**Shin:**

| Feature | Points | W | Tier |
|---|---|---|---|
| Calf diamond, outer (gastrocnemius) | (0.08, −0.30) (0.28, −0.44) (0.55, −0.14) | C | L1 |
| Calf diamond, inner split | (0.12, −0.10) (0.30, −0.24) (0.48, −0.10) | F | L2 |
| Tibia edge | (0.15, 0.16) (0.80, 0.10) | F | L3 |
| Achilles | (0.70, −0.12) (0.97, −0.12) | C | L1 |
| Ankle bone | filled dot at the lateral malleolus | dot | L1 |

**Foot (foot frame; toe segment pitched about the ball):**
- **Heel pad arc** (F, L3) and **arch line** (F, L3).
- **Toes:** 3 separations on the toe segment (F, L2). The big toe is 0.04 h proud.
- **Gripping:** on a planted flat foot the toe tips bend −8° into the ground. On the rear foot (heel ≥ 20°) the toes stay flat on the ground while the foot rises, with a crease line at the ball (F, L2).

**Head** (head frame, h; x chin → crown, y toward the face):
- **Profile silhouette:** a straight Greek profile with forehead and nose on one line (nose tip 0.10 h beyond the face plane), a 0.04 h brow notch, a small lip notch, and a spade beard (wedge 0.35 h below the chin pointing forward-down, 5 scallops). The beard's front edge sits 0.03 h off the neck, so the halo separates it.
- **Eye:** a frontal almond 0.22 h (C) with a filled iris dot r 0.05 h (L1). The brow line is above (F, L2).
- **Ear:** a C-shape 0.16 h with one inner curl (F, L1). This replaces the ring spiral that read as goggles.
- **Hair:** a fillet (headband) as a double line 0.06 h apart from the forehead to behind the ear (F, L2). **Curl rows:** 3 rows following the skull, with 6 / 5 / 4 small spiral curls (r 0.05 h, 0.75 turn, alternating handedness) at L3; at L2 one row of 5 plus the hairline arc; at L1 the hairline arc only.
- **Beard:** 3 rows of 4 short S-strokes (0.10 h) at L3; 2 rows of 3 at L2. The moustache line is F, L2.
- **Nape curls:** 3 curl lobes on a 2-link chain behind the neck, which provides the hair follow-through (L2).

**Loincloth** (torso frame, plus chains):
- **Knotted belt:** a band 0.14 h tall at t ≈ −0.02…0.05, with twist hatching (diagonal F strokes every 0.08 h, L2). A **knot** at the front hip (an ellipse 0.14 × 0.10 h with a cross stroke) and **two knot tails** (2-link chains, 0.16 h links, tapered ribbons; L1).
- **Wrap:** the belt down to 0.6 h below the hip joint, as **two layers**: the front layer's edge is a C line slanting from the knot to the hem. Between them, **4 pleats** fan from the knot to the hem (F, L2 shows 2 of them).
- **Hem border:** a double line 0.08 h apart, edge to edge (C, L1), with a **dot row** between (r 0.025 h every 0.12 h; L3). A meander would be under 2 px at desktop, so dots are used, as on the vase borders. The meander stays in the HUD.
- **Flaps:** front and back, each with 2 fold lines along its length (F, L2).

### 6.5 Strain details
During the strain beat these **draw on** from their root over 450 ms on `(0.2,0,0,1)`, as a growing stroke (dash-offset or partial polyline; never an opacity fade): the neck vein, the forearm vein on the near arm, a temple vein (head frame, 0.12 h, L3). At the same time the tendons tighten (§6.4), the biceps belly line deepens 0.02 h, and the calf inner split shifts 0.03 h (the muscle flexes). They draw off over 300 ms on `(0.3,0,1,1)` at recover. At the summit the veins are off.

### 6.6 Level of detail, caching and budget
- **Tiers by on-screen figure size `Hz = Hpx·zoom` and `quality`:**
  - **L3:** Hz ≥ 200 and quality ≥ 0.75 → everything (≈ 70 strokes, ≤ 600 vertices). Desktop climbing.
  - **L2:** 130 ≤ Hz < 200, or quality 0.5–0.75 → drop the L3 items (≈ 45 strokes). Phone portrait (156) and the summit framing (234 × 0.62 = 145).
  - **L1:** Hz < 130 or quality < 0.5 → the L1 items only (≈ 22 strokes, round-3 density).
- **Spacing rule:** if two parallel detail lines would be closer than 3 CSS px on screen, the higher-tier one is dropped.
- **Hysteresis:** switch tiers at ±8 px around the thresholds, and never change tier mid-step (only at the press).
- **Far side:** the far arm and far leg draw only L1 items at every tier, plus the hand's finger lobes.
- **Cache:**
  - per part × tier, a `Float32Array` of local points and stroke ranges, built once per (tier, `round(Hz)`);
  - per frame, transform points by the bone/joint frames (≈ 600 multiply-adds), then append them to **one `Path2D` per (group, weight)**. That's ≤ 6 groups × 3 weights = **≤ 18 stroke calls**, plus one dot fill per group.
  - Head, hand and foot detail are rigid within their frame, so they can use cached local `Path2D` + `addPath(p, DOMMatrix)` where supported, with a JS transform fallback.
  - Curl spirals are pre-flattened to 10-point polylines in the cache.
- **Budget:** the detail layer adds **≤ 1.5 ms per frame** (median over 600 frames, headless Chromium, 1440×900 @2), and the whole figure stays ≤ 3.0 ms. Phone (L2) adds ≤ 1.0 ms. Report it in `__sceneStats.figureMs`.

### 6.7 Boulder detail
See §5.3. It's all baked into the sprite (one `drawImage` + `rotate`, so the cost is unchanged). The sprite is rebuilt only when `round(Rpx)` or the DPR changes.

---

## 7. Clean motion ("make the movements cleaner")

Clean means three things: nothing jitters, nothing pops, and less happens at once. These rules apply to every state: climbing, strain, summit, stand, break and transitions.

### 7.1 Simulation: fixed timestep plus interpolation
- **Fixed step:** the gait, springs, chains and stone advance at a fixed **dt = 1/120 s**, with at most 12 substeps per rendered frame. A longer gap uses the existing snap (|debt| > 4σ) under its cross-fade.
- **Interpolation:** the renderer draws the state interpolated between the last two sim states, `α = accumulator / dt`. It lerps parameters (s, heights, angles), never IK outputs.
- So a 30 fps dip or a 144 Hz display gives the same motion, sampled differently: no stutter, no speed-ups.
- The sim is deterministic: the same seed and the same focused-time input produce the same poses (tests drive it directly).

### 7.2 No jitter
- **No per-frame randomness on the rig.** `rng()` is drawn only at cycle boundaries (§4.7 multipliers, at the start of the press). Continuous variation comes only from smooth noise (`noise1`, C1) at ≤ 0.25 Hz with the amplitudes in §7.5. The strain tremor (9 Hz, 0.0015 H) is the single exception and lives only inside the strain hold.
- **Every driven channel is C1:** keyed channels use monotone cubics or eased blends. Anything that reacts (stone, head lag, beard, elbow give, camera) goes through a **critically damped or over-damped spring**, never a raw follow. Only the beard, cloth and curls may oscillate, and they stay within §7.5.
- **Locked elbows are not re-solved from noisy inputs.** The shoulder is computed from the pelvis base without the tremor (as round 3 does), and the stone ratchet plus spring (§5.2) feeds the arms. The elbow angle is low-passed (ω = 18 rad/s) before IK places the hand.

### 7.3 No popping between states
- **Blend parameters, then solve.** Every transition (climb ↔ strain, climb → summit heave, heave → stand, stand → sit, sit → stand, reduced ↔ full, pause → resume) cross-blends the **pose parameters** (pelvis s and height, lean, foot targets, heel pitches, head pitch, hand angles on the stone). It does that with a C1 Hermite whose start slope equals the current parameter velocity, then IK solves the blended parameters. It never blends two solved skeletons.
- **Durations** come from the palette: quick 420 ms (head, hand regrip), standard 600 ms (strain in and out, stand → idle), slow 960 ms (heave → stand, sit ↔ stand). The easing is `(0.4, 0, 0.2, 1)`.
- **No step ↔ hold seam:** with the continuous trudge (§4.1) there's no hold to enter while climbing. The travel curve's end slopes match (§4.2), so cycle boundaries are C1 too.
- **Pause/resume:** pause freezes the sim. Resume continues from the frozen state at the frozen velocities. Any time debt is caught up through the debt controller (§4.7), never by jumping.
- **Allowed discontinuities:** only the next-climb cut frame (U3) and a snap under its cross-fade. Tests exclude exactly those frames and nothing else.

### 7.4 No IK snapping
- **Soft reach:** above 0.97 of the chain length, the target distance is eased with `d' = Lmax − (Lmax − d0)·exp(−(d − d0)/(Lmax − d0))`, where d0 = 0.97 L and Lmax = `LEG_MAX`·L (arms 0.995 L). The knee and elbow then approach straight asymptotically and never lock with a click. The `hipCeiling` lowers the pelvis through the same soft curve.
- **Consistent bend:** of the two IK solutions, pick the one **closest to last step's joint**. The forward vector (knee uphill, elbow down) is only the tie-break on the first frame. A knee or elbow can never flip sides; tested by the sign of the cross product (thigh × shin) staying constant.
- **Swing FK → IK** blends over 9% of the cycle (`smoothstep(0.66, 0.75)`) on the foot target, not the joint angles. The clearance guard lifts the ankle through a spring (ω = 30), never a per-frame clamp jump.

### 7.5 Arcs and calm amplitudes
- **Arcs, not lines:** the pelvis follows the trail plus the keyed height. Its path is an arc per step (vault at passing, dip at accept), with no straight segments between keys because the channels are cubic. The head and shoulders inherit that arc, lagged. The swing ankle follows the early-peaked arc of §4.4. The hands follow the stone's arc.
- **Secondary and ambient amplitudes** (patterns/ambient-continuous.md, ≤ 20% of primary):

| Channel | Max amplitude | Notes |
|---|---|---|
| Pelvis height (primary) | 0.026 H peak to peak | per cycle |
| Breath | chest ±1.5%, shoulders ±0.004 H | 3.6 s sine |
| Lean noise | ±0.4° | 0.21 Hz noise |
| Head pitch (secondary) | −3° / +2° per cycle | lagged 120 ms |
| Elbow give | 6° | spring |
| Beard | ±4° | spring |
| Cloth flaps | ±6° | Verlet |
| Nape curls, fillet tail | ±8° | Verlet |
| Wind on cloth | ±3° | 7.7 s gusts |

- **Removed:** the round-3 hold idles while climbing, the rear-heel pump and the look-up. They live on only at the summit stand, one every 6–9 s.
- **Attention budget:** at any instant at most one primary element (legs + pelvis, or the stone in the press) and two secondaries are visibly moving. Tertiary parts stay within the amplitudes above.

### 7.6 Camera smoothing
- **Target:** the camera follows a **feed-forward constant-speed target**, `camTarget = trail.at(Dtarget − 0.15σ)`, where `Dtarget` grows linearly with focused time. A gentle correction is added toward the pelvis base (critically damped, ω = 1.2 rad/s). The world scrolls at a steady ≈ v̄, and the figure's per-step surge plays out inside the frame (±0.1σ). The camera doesn't echo the surge.
- **No stepwise follow:** the end clamp (§4.9 ROUND3_ART) engages through a soft minimum (blend width 0.3 H) instead of a hard `min`. So the camera eases to a stop over ≈ 1 s rather than braking in one frame.

### 7.7 Measurable acceptance (reviewer)
Capture **10 s at 60 Hz** (600 samples) on a seeded trail at 1440×900, from the deterministic sim via the interpolated render state. Take three captures: steady climbing; a window containing a full strain beat; a window containing the summit heave → stand. Positions are in H, angles in degrees. Derivatives are finite differences at 60 Hz (velocity Δ/dt, acceleration Δ²/dt², jerk Δ³/dt³).

| Metric | Limit (climbing) | Limit (strain/slip, summit) |
|---|---|---|
| Max frame-to-frame joint-angle change, swing knee/hip | ≤ 4.5° | ≤ 4.5° |
| … stance knee/hip, ankle pitch | ≤ 1.5° | ≤ 3.0° |
| … elbows | ≤ 0.8° | ≤ 2.5° |
| … torso lean | ≤ 0.3° | ≤ 0.9° |
| … head axis | ≤ 0.5° | ≤ 1.0° |
| Pelvis acceleration \|a\| | ≤ 1.6 H/s² | ≤ 3.0 H/s² |
| Pelvis jerk \|j\| (3rd derivative) | ≤ 12 H/s³ | ≤ 30 H/s³ |
| Hands (palm centres) jerk | ≤ 12 H/s³ | ≤ 30 H/s³ |
| Head centre jerk | ≤ 15 H/s³ | ≤ 35 H/s³ |
| Spike rule, all of the above | max ≤ 4 × the 95th percentile of the same series (catches single-frame pops even under the absolute limit) | same |
| Discontinuities at state changes | at each logged state change i: \|x[i+1] − x[i]\| ≤ 1.5 × the median per-frame step of that series over ±10 frames, for every joint angle and the pelvis/hands/head positions | same |
| Stance foot drift | < 1 px | < 1 px |
| Hands to stone surface | ≤ 2 px | ≤ 2 px |
| IK bend flips | 0 (cross-product sign constant per limb) | 0 |
| Camera speed while climbing | within v̄ ± 15% after the first 2 s; \|Δv\| per frame ≤ 0.002 H/s; camera jerk ≤ 0.5 H/s³ | end clamp: decelerates over ≥ 0.8 s, no frame with \|Δv\| > 0.01 H/s |
| Frame-rate robustness | rerun the climbing capture rendering at 30 fps and at an irregular 20–60 fps schedule: the interpolated pelvis path matches the 60 fps path to ≤ 0.5 px at shared timestamps | — |

The tests live in `motion.clean.test.ts` (sim-level, no canvas). They print each series' max and p95 so the reviewer can see the margins.

---

## 8. Coder milestones

### S0: Forward roll and boulder detail
- `drawBoulder`: `ctx.rotate(+dir·centreArc(sB)/R)`. Add the `sB` ratchet and the ω = 12 spring (§5.2). The arms absorb the shoulder dip.
- Sprite: strata, cracks, facets and pocks; speckle −30%. Contact arc cut to 70°, screen-fixed.
- **Accept:**
  - [ ] `roll.test.ts` per §5.4 at 1440×900 and 390×844: sign(Δrot) = sign(Δarc) on every frame; |Δrot − Δarc/R| < 1e-6; no backward Δarc outside slip/catch/summit-settle; the slip window has Δrot < 0 and the recover window cancels it; strobe < 0.02 rad/frame at 30 fps; the top-marker pixel check passes.
  - [ ] A 6-frame strip (`docs/screenshots/round4/roll-strip.png`, 250 ms apart) shows a crack visibly advancing clockwise.

### S1: Figure redesign (static) and detail layer
- New `RIG` lengths, `STATIONS`, deltoid lobes, head/hand/foot outlines, cloth (§3.1–3.2).
- `h0`, `lean0`, feet and LEG_MAX per §3.4. `headFrom` neck 58°, axis 105°. `Hpx` 0.26 h / portrait `min(0.19 h, 0.40 w)`, R = 4.2 h.
- The detail layer per §6 with tiers, caches and line weights.
- **Accept** (key pose, θ ∈ {16°, 22°, 28°}):
  - [ ] **Torso lean** 20° ± 1° at 22°, in the range 16–24° across slopes. The pelvis is 0.42–0.44 H.
  - [ ] Rear knee ≥ 168°, front knee 100–112°. Line of action: |angle(rear ball → hip) − lean| ≤ 6°.
  - [ ] Arms 10–18° above horizontal, elbows 168–172°.
  - [ ] **Head between the arms:** head centre ≤ 0.035 H perpendicular from the near arm's shoulder → wrist line, 0.07–0.15 H along it. The crown is ≥ 0.05 H from the stone.
  - [ ] **Hand–stone contact** ≤ 2 px for both palms. No finger lobe penetrates the stone by more than 1 px.
  - [ ] Push silhouette height ≥ 22% of viewport at 1280×800, 1440×900 and 1920×1080; ≥ 15% at 390×844 and 844×390.
  - [ ] The three negative spaces of §3.3 are open on a silhouette render.
  - [ ] **4× crop** of the figure at 1440×900 (`docs/screenshots/round4/detail-4x.png`) shows every L3 feature: deltoid horseshoe and split, biceps/triceps line, forearm tendons, wrist wrap, 4 spread fingers + thumb with knuckles, pectoral line, ab grid, oblique, iliac line, serratus ticks, lats, trapezius, gluteal fold, quad line + teardrop, patella, calf diamond, Achilles, ankle dot, toes and heel, Greek profile with almond eye, C ear, fillet, curl rows, beard strokes, knotted belt with tails, pleats, double hem with dots. A phone crop shows L2.
  - [ ] Every detail vertex lies inside its own part outline (inset 0.02 h) — automated in `figure.test.ts`.

### S2: Motion (the trudge)
- The cycle per §4.2–4.7: continuous travel curve with non-zero end slopes, anticipation, swing arc, drag hierarchy (torso 60, head 120, beard 180, curls 250, cloth 250–350 ms), breathing 3.6 s, strain and slip-recover, micro-variation, debt controller.
- Clean motion per §7: fixed 120 Hz step with interpolation, parameter-space blends, soft reach and nearest-solution IK, feed-forward camera.
- **Accept:**
  - [ ] Every §7.7 metric is within its limit on all three captures (`motion.clean.test.ts`), including the 30 fps and irregular-frame-rate reruns.
  - [ ] **Stance foot drift < 1 px** (screen, 1440×900) for every planted ball, every frame, over 60 s.
  - [ ] Hand–stone contact ≤ 2 px on every frame, including slip and catch.
  - [ ] **Torso lean** stays within 17–27° while climbing (≤ 29° in a slip).
  - [ ] Head between the arms (S1 metric) on ≥ 95% of frames; always during the press.
  - [ ] Pelvis speed ≥ 0.35 v̄ on every climbing frame outside the strain beat (no freeze). Stone rim speed ≥ 8 px/s at 1440×900.
  - [ ] Measured lags (cross-correlation against pelvis height): head 100–140 ms, beard 150–220 ms, cloth tip ≥ 220 ms. Beard ≤ 4°, cloth ≤ 6° overshoot.
  - [ ] The leg triangle is open on ≥ 90% of frames.
  - [ ] **24-frame sheet** of one cycle at P/24 spacing (`docs/screenshots/round4/cycle-24.png`, numbered, cropped to figure + stone, 1440×900), plus `strain-12.png` (12 frames over the 3 s beat) and `phone-cycle-12.png`.

### S3: Set pieces, LOD, performance, review
- Summit stand, seated break and the summit idles with the new rig. Strain veins. LOD hysteresis. Reduced motion. Cache build.
- **Accept:**
  - [ ] Summit stand per §3.4: lean 0–6°, the near palm on the stone ≤ 2 px, feet on the legs (U1 test kept).
  - [ ] Seated break pose per §3.4, figure fully on screen.
  - [ ] The roll test passes through summit heave/settle; next climb cut frames excluded.
  - [ ] Detail lines stay attached across the 24-frame sheet. Strain veins draw on (not fade) and are gone at the summit.
  - [ ] Phone renders L2, the summit framing renders L2, desktop climbing renders L3.
  - [ ] **Frame time:** detail ≤ +1.5 ms (desktop), figure total ≤ 3.0 ms, scene average ≤ 7 ms (headless 1440×900 @2).
  - [ ] Reduced motion: the static key pose, no breath or cloth loops, stone texture consistent with position.
  - [ ] All existing tests (gait, figure, summit, climb geometry) are updated to the new constants and pass. `tsc` and `vite build` are clean.
  - [ ] Retake `docs/screenshots/round4/`: `focus-p0.5.png`, `phone-p0.5.png`, `summit-reveal.png`, `break.png`, `detail-4x.png`, `cycle-24.png`, `roll-strip.png`.
