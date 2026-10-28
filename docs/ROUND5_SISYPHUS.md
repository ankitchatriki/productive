# StruggleMore round 5: Sisyphus from scratch, a continuous walk, a forward roll

Owner: designer agent · Status: v1, ready to implement · Branch `round5` (from `round4` at 2576f82)

**Replaces** `docs/ROUND4_SISYPHUS.md` entirely, and `docs/ROUND3_ART.md` §3 (figure) and §4 (push cycle). Nothing in round 4's motion model carries over.

**Still applies from ROUND3_ART:**
- the black-figure style, palette and the rules in §1;
- the endless camera-tracked incline (§2, §5.1);
- the summit hidden until the block ends;
- the summit, break and next-climb set pieces (§5.2–5.4), which this doc retimes in §6;
- mountain state and persistence (§6);
- the HUD strip;
- reduced motion.

**The user's words (round 5):** *"The ball is still rolling backwards when moving up the hill. I want you to completely redesign Sisyphus, and make the motions fluid and not stopping and then going."*

**In one line:** a side-scroller walk cycle. The camera is locked to a distance `D` that grows at a constant speed. Every joint, both feet, the pelvis and the stone are **pure functions of `D`**. The feet are planted in world space, so they can't slide. The stone turns by `arc/R`, so it can't skid or turn back. Nothing in the cycle can stop, because nothing in it has state.

---

## 0. Decisions at a glance

| Question | Decision |
|---|---|
| Motion model | One phase variable `φ = (D / L) mod 1`. No step scheduler, no holds, no strain beats, no slips, no randomness while climbing. |
| Speed | `v = PACE_H = 0.1333 H/s` along the trail, constant and independent of block length. That's 39.6 px/s at 1440×900 and 21.9 px/s on a 390×844 phone. Never zero during a focus block. |
| Stride and period | Stride `L = 0.40 H` (two steps). Period `T = L/v = 3.0 s`: a 1.5 s step, 40 steps/min. That's a heavy tread made of four ~375 ms beats, in the motion-design skill's "Heavy 600–1200 ms" and "Premium 350–600 ms" bands. |
| Duty factor | Each foot is planted 62% of the cycle. Double support is 12% per step: the "heavy" walk signature, with always at least one foot down. |
| Camera | During climbing: `cam = trail.at(D) + offset`, rigid, no spring. The ground scrolls at exactly `v`, which is exactly the planted foot's backward speed on screen. |
| Stone | Centre at `trail.centreAt(D + ΔS, R)`, with `ΔS` constant. Rotation `rot = centreArc(D + ΔS)/R`, applied as `+rot` on the y-down canvas, so it turns **clockwise**. Monotonic increasing for the whole block. |
| Stone size | `R = 0.50 H`: the diameter equals his height, the "huge boulder" of the reference. |
| Figure size | Landscape `Hpx = 0.33·h`, so the push silhouette is ≈ 0.88 H ≈ **29% of viewport height** at 1440×900. Portrait `Hpx = min(0.21·h, 0.42·w)`. |
| Figure | Built new: 8-head heroic canon, an upright 17° lean, a long straight rear leg at toe-off (161–167°), and the front leg bent under the body (≈ 98° at contact). Arms are nearly straight (elbows 156–170°). The near arm passes **under** the beard and the far arm passes behind the head. **The head is drawn last.** |
| Detail | About 90 ochre strokes, each in a part-local frame and clipped to its part. Three LOD tiers. Fingers are separated by incise gaps. |
| Secondary motion | Analytic phase lags of the walk channels (periodic, seam-free) while climbing. Springs, seeded from those values, take over only in transitions. Breath runs on its own clock (4.2 s). |
| Transitions | Every blend is in parameter space and eased: speed ease-in 600 ms (smootherstep), ease-out 400 ms, pose blends 0.8–1.6 s (`cubic-bezier(0.4,0,0.2,1)`). Only block-end set pieces stop the walk. |
| Frame rate | 60 fps while climbing when the tab is focused and quality = 1, otherwise 30 fps. All motion is time-based. |

---

## 1. Diagnosis: why round 4 still read as backwards and stop-and-go

1. **The stone's speed surged and lagged; the ground didn't.**
   - `gait.ts` advances the stone with the pelvis through `KEY.travel`. The travel speed falls to **0.35 v̄** in the press and peaks at ≈ 1.6 v̄ at the step.
   - The camera (`sisyphus.ts` ~l.570) is a **feed-forward constant-speed** track, so the slope scrolls left at a steady v̄.
   - For about a third of every cycle the stone's centre therefore moves **left on screen**, backwards, while turning only a third as fast as the ground under it demands. A stone drifting backwards while its surface lags the ground reads as rolling backwards or skidding, even though `rot` was still clockwise.
2. **Real backward spins.** A strain beat every 4–8 cycles includes a 300 ms slip that turns the stone **counter-clockwise**, then a recover. That is literally rolling backwards, about once every 15–25 s.
3. **Stalls.** The strain beat drops the world to 25% speed for 3 s (V9). The press slows the pelvis to 0.35 v̄. The debt controller varies the period ±20–25% per cycle. Seeded per-cycle multipliers vary the stride ±5% and the cadence ±4%. Each of these produced the "stop, then go" pulse.
4. **The 30 fps cap while climbing** (`targetFps()`) steps a slow scroll in 1.3 px jumps every other vsync. That adds judder to an already uneven speed.
5. On `main`/`round3` the sign really was wrong (`g.rotate(-rot)`). Round 4 fixed the sign but kept 1–3.

**Root cause:** position, stone, ground and pose came from three different clocks (the gait state machine, the camera filter and the ratchet). **Round 5 has one clock, `D`.**

---

## 2. The figure, redesigned

### 2.1 Proportions (H = standing height = 1; one head unit hu = 0.125 H)

| Segment | Length (H) | Notes |
|---|---|---|
| Head (crown to chin, without beard) | 0.125 | The wedge beard adds 0.035 below the chin. |
| Neck (visible) | 0.035 | Thick: width 0.060. |
| Torso (hip joint → shoulder joint) | 0.310 | Shoulder joint at 0.83 H standing. |
| Thigh / shin | 0.245 / 0.240 | Hip joint at 0.52 H standing (with the 0.035 ankle height). |
| Foot | 0.145 | Heel → ankle 0.03, ankle → ball 0.075, ball → toe tip 0.04. |
| Upper arm / forearm | 0.190 / 0.160 | |
| Hand | 0.105 | Wrist → palm centre 0.045, wrist → fingertip 0.105. |

**Widths and depths** (profile, H):

| Part | Measurements |
|---|---|
| Torso | Chest depth 0.145 (pecs to scapula), waist 0.095, buttock-to-belly 0.120. **Chest : waist = 1.53**, a broad V. |
| Thigh | 0.090 at the top, 0.078 at mid, 0.052 at the knee. |
| Shin | Calf max 0.068 at 28% down the shin (back bulge 0.042, front 0.026), ankle 0.034. **Defined calves.** |
| Upper arm | Deltoid 0.060, mid 0.050, elbow 0.040. |
| Forearm | 0.048 at 25%, wrist 0.030. |
| Hand | Palm 0.040 wide. |

These are not round 4's parts rescaled. Every outline below is new.

### 2.2 Construction

- **Part frames.** Each part is a closed path in its bone-local frame:
  - `u` runs along the bone, `u ∈ [0, 1]` from the root joint to the end joint;
  - `v` is perpendicular, in H, with **+v = the figure's front or top** (the facing side for the torso, legs and head; the dorsal side for the arms).
- **Path rule.** Anchors are joined by **Catmull–Rom → cubic Bézier** with handle `(P[i+1] − P[i−1])/6`. Anchors marked `▲` are corners (handles zero on both sides).
- **Fill and seams.** Fill is `INK.black`. Where a part overlaps a black part behind it, its outline is stroked first with an `incise` ochre line, then filled. That is the black-figure separation (ROUND3_ART §1.3 rule 5).

**Torso** (root = hip joint, u·0.31 = along the spine; anchors as `(u·0.31, v)` in H, front side going up, then the back coming down):
- **Front:** groin `(0.000, 0.030)▲` → lower belly `(0.060, 0.056)` → navel `(0.120, 0.050)` → rib edge `(0.170, 0.062)` → under the pectoral `(0.215, 0.076)` → upper pectoral `(0.270, 0.068)` → clavicle notch `(0.300, 0.050)` → neck front `(0.335, 0.026)▲`.
- **Back:** neck back `(0.345, −0.030)▲` → trapezius `(0.305, −0.062)` → scapula `(0.240, −0.072)` → lumbar `(0.120, −0.044)` → small of the back `(0.075, −0.050)` → buttock max `(0.005, −0.074)` → buttock base `(−0.045, −0.046)` → crotch `(−0.040, 0.022)▲`.

**Head** (origin = cranium centre; `u` = head up-axis, `v` = facing; units H):
- **Profile:** crown `(0.062, 0.000)` → forehead `(0.044, 0.044)` → brow `(0.018, 0.058)▲` → nose bridge `(0.008, 0.055)` → nose tip `(−0.012, 0.073)▲` → nostril base `(−0.020, 0.058)` → upper lip `(−0.027, 0.060)` → mouth corner `(−0.031, 0.054)▲` → moustache/beard front `(−0.036, 0.063)` → **beard point `(−0.090, 0.046)▲`** (the black-figure wedge beard) → under-jaw beard `(−0.060, 0.002)` → jaw/ear root `(−0.030, −0.026)` → nape `(−0.046, −0.048)` → occiput hair mass `(0.004, −0.072)` → back crown `(0.046, −0.046)`.
- **Hair mass:** a separate black shape from the hairline `(0.040, 0.034)` over the crown to the nape `(−0.055, −0.055)`, overhanging the skull line by 0.006 so its edge reads as curls (scalloped: 7 bumps of radius 0.007).
- **Fillet:** a band 0.010 wide, from `(0.036, 0.040)` to `(−0.010, −0.070)`.

**Limbs** are tapered capsules built from width stations (`u`: +v half-width, −v half-width), joined by the same Catmull–Rom rule. Round end caps at the joints are **overlapped** by the next part. There's no visible gap and no "string of sausages".

| Part | Stations `u: (+v, −v)` |
|---|---|
| Thigh | `0: (0.045, 0.045) · 0.30: (0.042, 0.038) · 0.65: (0.036, 0.032) · 1: (0.027, 0.025)` (the rectus bulge is front-high, the hamstring back-low) |
| Shin | `0: (0.026, 0.024) · 0.28: (0.026, 0.042) · 0.60: (0.020, 0.028) · 1: (0.017, 0.017)` (the calf bulge is on the back) |
| Upper arm | `0: (0.032, 0.028) deltoid · 0.35: (0.028, 0.026) · 0.65: (0.024, 0.027) · 1: (0.020, 0.020)` |
| Forearm | `0: (0.022, 0.020) · 0.25: (0.026, 0.022) · 0.70: (0.019, 0.017) · 1: (0.015, 0.015)` |

**Foot** (sole-local: origin = ball, +x toward the toes; H):
- **Outline:** toe tip `(0.040, 0.004)` → toe top `(0.030, 0.018)` → instep `(−0.030, 0.034)` → ankle front `(−0.065, 0.048)` → ankle back `(−0.090, 0.046)` → heel round `(−0.105, 0.012)` → heel base `(−0.100, 0.000)▲` → sole to ball `(0.000, 0.000)`.
- **Toes:** three toe separations drawn as `fine` lines at x = 0.008, 0.018, 0.028.

**Hand** (palm-local: origin = palm centre, +x toward the fingertips, −y = the stone side; H):
- **Palm:** a pad `0.050 × 0.040`.
- **Fingers:** **four separate fingers**. In profile the index and middle are fully visible and the ring and little finger show as two narrower tips offset by 0.004.
  - Each finger is a lozenge 0.011 wide at its base and 0.008 at its tip, lengths 0.050 / 0.055 / 0.050 / 0.040, lying **flat on the stone**. Its sole follows the circle `R` (it is curved to the stone).
  - Neighbouring fingers are separated by a **0.0025 H incise gap**: ochre shows between them, so they can never merge into a claw (V6).
- **Thumb:** points up along the stone, length 0.040, spread 35° from the index.
- **Attachment:** the hand is **always built from the wrist**. The wrist joint is the hand's root, so it can't float (V4).

### 2.3 Drawing order (back to front)

1. Slope, grit and contact arc (existing).
2. **Stone** (sprite + rim notches, §4.3).
3. Far leg (thigh, shin, foot).
4. Far arm (upper arm, forearm), then the far hand (on the stone's back face, so it's visible over the stone).
5. Torso, then the loincloth back flap.
6. Near leg (thigh, shin, foot).
7. Loincloth wrap and front flap.
8. Near arm (upper arm, forearm), then the near hand.
9. **Head group, last:** neck, hair mass, head, beard, fillet, then the head linework.

The head group being last is the guarantee that the **face is never covered** (V1). Geometry (§2.4) keeps it clear, so the order is a safety net, not a crutch. Each group draws its fill, then its own ochre detail clipped to its own outline, before the next group starts. A near part's fill therefore covers the far part's lines, as it should.

### 2.4 Pose geometry: arms, head and stone

The positions below are at slope θ = 22°, in a frame whose origin is the ground point under the pelvis (H).

| Element | Placement |
|---|---|
| Pelvis | `(0, h0(θ))`, `h0(θ) = 0.400 − 0.0038·(θ − 22)`: 0.423 at 16°, 0.364 at 32° (fitted so the stance reach stays ≤ 0.985, §3.3). |
| Torso lean | `λ0(θ) = clamp(17 + 0.2·(θ − 22), 14, 20)` degrees from vertical. That's a modest, heroic lean; round 4 was 20–24°. |
| Shoulder | `pelvis + 0.31·(sin λ, cos λ)` ≈ `(0.091, 0.696)`. |
| Neck base | `shoulder + 0.03` along the torso axis. |
| Head axis | `λ + 18°` (≈ 35° from vertical): a bowed head, chin tucked. |
| Head centre | `neck base + 0.075` along the head axis ≈ `(0.143, 0.786)`. |
| Stone | Centre at `trail.centreAt(D + ΔS, R)`, `ΔS = 1.20 H` (constant; tune once at θ = 22° for a mean near-arm reach of 0.985). At 22° the centre is ≈ `(0.94, 0.83)`. |
| Near palm | On the stone at polar angle **ψN = 200°** (just below the back point): ≈ `(0.47, 0.66)`. The near arm descends gently from the shoulder and passes **under the beard**. |
| Far palm | **ψF = 186°** (higher, at about the centre's height): ≈ `(0.44, 0.78)`. The far arm rises 12° and passes **behind the head** (it's drawn earlier). |
| Arm reach | `|palm − shoulder| / (upper + fore + 0.045)` ≈ 0.985 → **elbow ≈ 160°**, so the arms read straight. Allowed band: elbow 156–170°. |

**Face clearance at 22°:** the nose tip at `(0.202, 0.745)` is **0.034 H** above the near arm's top edge (y ≈ 0.711). That's 10 px at 1440×900. The beard point `(0.131, 0.690)` lies over the near upper arm and is drawn on top with an incise contour. "Head bowed between the arms" is satisfied in depth: far arm behind, near arm in front, below the face.

The palms stay at the fixed polar angles ψ relative to the stone's centre. They do not rotate with the stone. The stone's surface therefore slides upward under the palms at `v`. That's how the classic image reads, and it's what shows the forward roll: the stone's marks pass up under the hands and over the top.

### 2.5 The four walk poses (per leg), θ = 22°

The leg's local phase is `p = (φ + o) mod 1`, with `o = 0` for the near leg and `o = 0.5` for the far leg. The values come from the curves in §3, solved by IK. They are a target table for the tests (±4°), not keys to interpolate. "Thigh" is the angle from vertical, + = forward. "Knee" is the interior angle. "Foot" is the heel peel relative to the ground, + = heel up.

| Pose (near leg) | p | Pelvis | Thigh | Knee | Foot | The other leg at the same moment |
|---|---|---|---|---|---|---|
| **Contact:** front foot lands flat, both feet down, widest base | 0.00 | mean | +38° | 98° | 0° | far leg p 0.50: late stance, knee 139° |
| **Down:** weight accepted, the body at its lowest | 0.08 | **low** (−0.009) | +32° | 101° | 0° | far p 0.58: rear leg 148°, heel peeling |
| **Passing:** the far foot swings past the near knee | 0.31 | rising | +6° | 133° | 0° | far p 0.81: swing, knee 113°, foot lifted 0.06 H |
| **Up:** the near leg drives, body at its highest, heel starts to peel | 0.45 | **high** (+0.009) | −3° | 140° | 14° | far p 0.95: reaching, knee 100°, toe up 4° |
| (Toe-off: the rear leg long and straight) | 0.62–0.63 | mean | −20° | **161–166°** | 28° | far p 0.12–0.13: its down pose |
| (Swing, early: the knee folds, the foot peels to 50°) | 0.70 | low | −7° | 129° | 50° | far p 0.20 |
| (Swing, passing) | 0.81 | rising | +11° | 113° | 4° | far p 0.31: its passing |
| (Swing, reach: foot reaching uphill, toe up) | 0.95 | high | +39° | 100° | −4° | far p 0.45: its up |

At 16° and 32° the knee ranges are 106–166° and 86–168°. The stance reach is ≤ 0.985 and the swing reach ≤ 0.995, which the soft IK handles (§3.3).

### 2.6 Arms through the cycle

The hands are fixed to the stone (§2.4), so the arms are IK. The shoulder moves with the pelvis bob and torso pitch (≈ ±0.012 H of shoulder-to-palm distance). It's absorbed in this order:
1. **Scapular protraction:** the shoulder point slides along the arm direction by up to ±0.008 H. It's drawn as the deltoid riding forward.
2. **Elbow flex:** the elbow takes the rest, within 156–170°.
3. **Palm creep:** ψ may slide by up to ±1.5° to stay inside the elbow band. That's invisible.

The result is a gentle elbow give of about 4° per step, peaking just after each "down" (weight accept). It reads as pressing.

### 2.7 Loincloth, hair, beard

- **Loincloth:** a short wrapped kilt from the pelvis to 0.06 below the crotch.
  - A **belt band** 0.016 wide with a knot at the front hip.
  - A front flap and a back flap, each **one rounded shape, never spikes** (V5). Each is a quadratic-sided trapezoid, hem width 0.07, hem corners rounded with r = 0.012.
  - Flap angle comes from §3.6.
  - Ochre: **4 fold lines** from the belt fanning to the hem (`contour`), plus a hem border of 7 small dots (`fine`).
- **Hair:** the scalloped mass (§2.2) carries **3 rows of curls**: 6 + 5 + 4 ochre spirals, r = 0.006 H, 1¼ turns each, laid along offset curves of the hairline. There are 3 nape ringlets.
- **Beard:** the wedge (§2.2) carries **6 wavy ochre strokes** from the jaw to the point, and a moustache stroke from the nostril base to the mouth corner.

### 2.8 Linework: list, weights, LOD

New figure line weights live in `artPalette.ts` as `FLW(Hpx)`. Scenery keeps `LW`.

```ts
export const FLW = (Hpx: number) => ({
  incise:  clamp(0.0060 * Hpx, 1.2, 2.0),  // black-on-black separations, finger gaps (1.8 px at Hpx 297)
  contour: clamp(0.0055 * Hpx, 1.1, 2.0),  // muscle and fold lines (1.6 px)
  fine:    clamp(0.0035 * Hpx, 0.8, 1.3),  // curls, beard strokes, toe lines, hem dots (1.0 px)
});
```

**Tiers:** T1 when `Hpx·zoom ≥ 230` (desktop climbing), T2 when 150–230 (phone, summit zoom), T3 when < 150 or quality ≤ 0.75.

| Part | Strokes (weight) | T1 | T2 | T3 |
|---|---|---|---|---|
| Head | almond eye (ochre fill, black pupil dot r 0.004) | ✓ | ✓ | ✓ |
| | brow arc (C) | ✓ | ✓ | ✓ |
| | ear C + inner hook (C) | ✓ | ✓ | C only |
| | nostril hook, lip line (F) | ✓ | ✓ | — |
| | moustache (F) | ✓ | ✓ | ✓ |
| | 6 beard strokes (F) | ✓ | 4 | 3 |
| | fillet double line (C) + 5 dots (F) | ✓ | ✓ | single line |
| | curl rows 6/5/4 (F) | ✓ | 6/5 | 6 |
| | 3 nape ringlets (F) | ✓ | ✓ | — |
| Torso | clavicle (C) | ✓ | ✓ | ✓ |
| | pectoral double arc (C) | ✓ | ✓ | single |
| | linea alba (C) | ✓ | ✓ | ✓ |
| | 3 rectus arc pairs (C) | ✓ | 2 | — |
| | inguinal line (C) | ✓ | ✓ | ✓ |
| | scapula arc, lat sweep (C) | ✓ | ✓ | lat only |
| | spine groove (F) | ✓ | — | — |
| Arms (each) | deltoid **open arc**, never a closed loop (C) | ✓ | ✓ | ✓ |
| | biceps/triceps split (C) | ✓ | ✓ | — |
| | elbow crease (F) | ✓ | ✓ | — |
| | 2 forearm lines (C) | ✓ | 1 | — |
| | 2 wrist bands (F) | ✓ | 1 | — |
| Hands | 3 finger gaps (I) | ✓ | ✓ | ✓ |
| | knuckle line (F) | ✓ | ✓ | — |
| | 4 nail ticks (F) | ✓ | — | — |
| | thumb crease (F) | ✓ | — | — |
| Legs (each) | glute arc (C) | ✓ | ✓ | ✓ |
| | 2 thigh lines (rectus/vastus) (C) | ✓ | 1 | — |
| | kneecap arc (C) | ✓ | ✓ | ✓ |
| | knee crease (F) | ✓ | ✓ | — |
| | calf double arc (gastrocnemius heads) (C) | ✓ | ✓ | single |
| | shin line (F) | ✓ | — | — |
| | ankle dot (F) | ✓ | ✓ | — |
| | Achilles line (F) | ✓ | ✓ | — |
| | 3 toe lines (F) | ✓ | 2 | — |
| Loincloth | belt double line + knot (C) | ✓ | ✓ | single |
| | 4 folds (C) | ✓ | 3 | 2 |
| | 7 hem dots (F) | ✓ | — | — |
| Separations | incise contour wherever black overlaps black (I) | ✓ | ✓ | ✓ |

(I = incise, C = contour, F = fine.) Totals: **≈ 92 strokes at T1, ≈ 62 at T2, ≈ 32 at T3.**

**Attachment rule:** every stroke is a polyline or Bézier in **one part's `(u, v)` frame** and is drawn **clipped to that part's outline**. Lines can never leave the body, even when a joint bends. Strokes that span a joint (the knee crease, the elbow crease) belong to the distal part and sit within `u < 0.12` of its root.

**Calm torso (V13):** the rectus arcs are short, horizontal-ish **pairs**, not ticks. There are no serratus ticks. The back contour is a single lat sweep, not a doubled outline.

**Cache:** the stroke path data is built once per tier as `Path2D` per part. Each frame applies the part transform and strokes the cached path.

---

## 3. The walk cycle as math

### 3.1 State

The whole climbing state is **one number**, `D` (H along the trail). Its speed is `Ḋ = v·e(t)`, where `e` is the speed envelope (§5). Everything below is evaluated from `D`, plus `t` for breath and wind only.

```
φ    = frac(D / L)                     L = 0.40 H
θ    = trail.angleAt(D)                (degrees; smooth along the trail)
p_i  = frac(φ + o_i)                   o_near = 0, o_far = 0.5
```

`smootherstep(x) = x³(6x² − 15x + 10)` on clamped x. It is C2: value, velocity and acceleration are all continuous at both ends. It's written `sm` below.

### 3.2 Feet: foot lock by construction

The constants are `β = 0.62` (duty), `c = 0.07 H` (the contact point ahead of the pelvis), and `L`.

For leg `i`, let `n_i` be the integer cycle index of its current stance, `n_i = floor(D/L + o_i)`. Its stance contact point is

```
S_contact(i) = (n_i − o_i)·L + c
```

- **Stance** (`p < β`): `ball_s = S_contact(i)`. That's a **constant**, so the ball's world position `trail.at(ball_s)` does not move.
  - The planted foot drifts by exactly 0 in world space. On screen it moves left at exactly the ground's speed, because the camera is locked to `D` (§3.7).
  - Heel peel (rotation about the ball): `a(p) = 28°·sm((p − 0.279)/0.341)`. The heel is flat until p = 0.279 (= 0.45β) and reaches 28° at toe-off.
- **Swing** (`p ≥ β`, `q = (p − β)/(1 − β)`):
  - `ball_s = S_contact(i) + L·sm(q)`. It lifts at the old contact and lands one stride ahead at the next, with world velocity and acceleration both zero at lift and at landing, so the trajectory is C2 across the boundaries.
  - **Lift** normal to the ground: `ℓ(q) = 0.06·198.8·q³(1 − q)⁵`. The peak is 0.06 H at q = 0.375, an early-peaked arc. It's C2 at both ends.
  - **Pitch:** `a(q) = (28 + 22·sm(q/0.2))·(1 − sm((q − 0.2)/0.45)) − 8·sm((q − 0.3)/0.3)·(1 − sm((q − 0.75)/0.25))`. The heel keeps peeling to 50° (toes last off), then the foot flattens, the toe lifts by 4–8° at mid-to-late swing, and the foot is flat again at landing.
  - The two pieces meet at `q = 0` with equal value (28°) and zero slope.
- **Ankle** from the ball: `ankle = ball − 0.075·d(α) + 0.035·n(α)`, where `α = θ_local − a` and `d`, `n` are the sole's direction and normal.

Since `S_contact` jumps by `L` exactly when that leg's swing ends, and the swing ends at `S_contact + L`, the foot position is continuous across every seam.

### 3.3 Pelvis

```
pelvis_s(D) = D + 0.002·sin(4π(φ − 0.08))                          // fore-aft surge ±0.002 H → speed ±6%
pelvis    = trail.at(pelvis_s) + (0, h0(θ) − 0.009·cos(4π(φ − 0.08)))  // bob: lowest at φ 0.08/0.58 (down), highest 0.33/0.83
pelvis pitch = −1.5°·cos(4π(φ − 0.14))                                    // hips tip as weight transfers; drawn on the torso base
```

These are single harmonics at twice the cycle frequency, so they're C∞ and periodic. The speed along the trail stays within **0.94–1.06 v**.

**Legs:** soft two-bone IK from the hip to the ankle, with the knee forward.
- Soft reach: if `r = dist/C > 0.975`, the effective reach becomes `0.975 + 0.02·(1 − exp(−(r − 0.975)/0.02))`, capped at 0.995. The solved ankle then lies on the line, short of the target by `< 0.002 H`.
- The constants above keep the **stance** reach ≤ 0.985, so the soft region never moves a planted foot. The stance target is exact. Only swing frames 0.62–0.64 enter the soft region.
- No knee flips: always choose the forward-knee solution.

### 3.4 Torso, neck, head

```
λ      = λ0(θ) + 0.8°·cos(4π(φ − 0.08 − 0.03))      // leans in after each down, 90 ms behind the pelvis
shoulder = pelvis + 0.31·(sin λ, cos λ) + breathRise(t)
headPitch = 18° + 1.2°·cos(4π(φ − 0.08 − 0.06))       // bow relative to the torso, 180 ms behind
```

- `breathRise(t) = 0.003·sin(2π t / 4.2)`.
- The neck bends as one joint. The head is rigid.

### 3.5 Stone and arms

```
sB     = D + ΔS                                     // ΔS = 1.20 H, constant
centre = trail.centreAt(sB, R)
rot    = trail.centreArc(sB, R) / R                 // radians, screen rotation = +rot (clockwise)
palmN  = centre + R·(cos ψN, sin ψN) (world y-up),  ψN = 200°
palmF  = centre + R·(cos ψF, sin ψF),               ψF = 186°
arms   = IK(shoulder → wrist) with protraction-then-elbow absorption (§2.6)
```

`ΔS` is constant (it does not vary with slope). The stone's speed is therefore `v` times the centre-curve/ground arc ratio, `1 + κR`, which is within ±0.5% on this trail. Arm reach across θ 16–32° is checked in F0. If the elbow leaves 156–170°, adjust `λ0(θ)`, never `ΔS`.

### 3.6 Secondary motion (layered, never interrupting)

While climbing every secondary channel is an **analytic phase-lagged copy** of a primary channel. It's periodic in φ, so it's seamless at the wrap and testable without simulation. The lags follow the follow-through skill's drag hierarchy: 2–4 frames at 24 fps per level, about 0.03 cycle (90 ms) per level at T = 3 s.

| Level | Channel | Formula (climbing) | Amplitude | Lag |
|---|---|---|---|---|
| Root | pelvis bob, surge | §3.3 | 0.009 H, 0.002 H | 0 |
| Primary | torso pitch | §3.4 | ±0.8° | 0.03 (90 ms) |
| Primary | elbow give | from IK | ≈ 4° | inherent |
| Secondary | head pitch | §3.4 | ±1.2° | 0.06 (180 ms) |
| Tertiary | beard swing (about the chin) | `−2.5°·cos(4π(φ − 0.08 − 0.10))` | ±2.5° | 0.10 (300 ms) |
| Tertiary | nape ringlets, fillet tail | `±3°·cos(4π(φ − 0.20))` + wind | ±3° | 0.12 |
| Tertiary | loincloth front flap | `0.35·(thighNear(φ − 0.12) − mean) + wind` | ≤ ±6° | 0.12 (360 ms) |
| Tertiary | loincloth back flap | `0.30·(thighFar(φ − 0.15) − mean) + 0.5°·bob'` | ≤ ±5° | 0.15 |
| Ambient | breath (chest depth) | `1 + 0.015·sin(2π t/4.2)` on the torso's front stations `u` 0.15–0.30 | ±1.5% | own clock |
| Ambient | wind on cloth, hair, fillet | `1.5°·(noise1(t/7.7) − 0.5)·2` | ±1.5° | own clock |

- **Periods never sync:** walk 3.0 s, breath 4.2 s, wind 7.7 s. Total ambient energy is about 15% of primary.
- **No overshoot** on the body. The tertiary channels' lagged sinusoids give the follow-through.
- **Outside climbing** (blends, summit, stand, sit), each tertiary channel is a spring (stiffness 120, damping 22, unit mass, ζ ≈ 1.0) driven by its parent channel. It is **initialised from the analytic value and its derivative** at the moment the walk ends, so the hand-off is C1.

### 3.7 Camera (climbing)

```
camTarget = trail.at(D) + (0, camYOffset)     // the ground point under the pelvis, not the pelvis
cam.pos   = camTarget                         // rigid: no spring, no feed-forward filter, no correction loop
```

- The ground therefore scrolls on screen at exactly `Ḋ·Hpx`, which is the planted foot's speed. The figure walks in place with only its own bob, ±2.7 px at 1440×900.
- **End clamp:** the soft-min clamp toward the crest is kept unchanged. It only engages in the last metres of a block, where the block-end set piece takes over anyway.
- Delete the `ffS / ffV / ffA / corr` filter (`sisyphus.ts` ~l.568–597).

### 3.8 Pseudo-code

```ts
// walk.ts — pure; world units H, y up.
export const WALK = { L: 0.40, beta: 0.62, c: 0.07, lift: 0.06, peel: 28, dS: 1.20, R: 0.50 };
export function walkPose(D: number, trail: Trail, t: number, out: WalkPose): WalkPose {
  const phi = frac(D / WALK.L), th = trail.angleAt(D);
  const pelvisS = D + 0.002 * Math.sin(4 * PI * (phi - 0.08));
  const g = trail.at(pelvisS);
  out.pelvis = { x: g.x, y: g.y + h0(th) - 0.009 * Math.cos(4 * PI * (phi - 0.08)) };
  for (const [i, o] of [[0, 0], [1, 0.5]] as const) {
    const p = frac(phi + o), n = Math.floor(D / WALK.L + o), sC = (n - o) * WALK.L + WALK.c;
    let ballS = sC, lift = 0, a: number;
    if (p < WALK.beta) a = WALK.peel * sm((p - 0.279) / 0.341);
    else { const q = (p - WALK.beta) / (1 - WALK.beta); ballS = sC + WALK.L * sm(q);
           lift = WALK.lift * 198.8 * q ** 3 * (1 - q) ** 5; a = swingPitch(q); }
    out.feet[i] = footFrom(trail, ballS, lift, a);           // ball, ankle, heel, toe
    out.legs[i] = softLegIK(out.pelvis, out.feet[i].ankle);  // knee forward
  }
  out.lean = lam0(th) + 0.8 * DEG * Math.cos(4 * PI * (phi - 0.11));
  out.shoulder = add(out.pelvis, scale(dirFromVertical(out.lean), 0.31), { x: 0, y: breathRise(t) });
  const sB = D + WALK.dS;
  out.centre = trail.centreAt(sB, WALK.R);
  out.rot = trail.centreArc(sB, WALK.R) / WALK.R;           // monotonic in D
  out.arms = armsToPalms(out.shoulder, out.centre, PSI_N, PSI_F); // protraction → elbow → ψ creep
  out.head = headFrom(out.shoulder, out.lean, 18 * DEG + 1.2 * DEG * Math.cos(4 * PI * (phi - 0.14)));
  out.secondary = lagged(phi, t);                            // §3.6 table
  return out;
}
```

---

## 4. Stone roll: rules, test and texture

### 4.1 Rules

1. **Screen rotation:** `ρ = +trail.centreArc(D + ΔS, R)/R`, applied with `g.rotate(ρ)` in **screen space** (y down) after `toScreen`. On a y-down canvas a positive angle is **clockwise**, which is the forward roll for a stone travelling up and to the right. Do not apply it inside the y-flipped world transform: a flip would reverse it.
2. **Monotonic:** during a focus block, `D` never decreases, because `Ḋ = v·e(t) ≥ 0` (§5). `centreArc` is increasing, so `ρ` never decreases. There is no slip, no ratchet and no "back" term anywhere in the code.
3. **No skid:** `Δρ·R` equals the stone centre's travel, and the stone's travel equals the ground scroll (within the `1 + κR` ratio). The surface at the contact point is stationary relative to the ground.
4. **Persistence:** `ρ` is derived from `D`, so a reload at the same `posM` gives the same angle. There is nothing to store.
5. **Summit and next climb:** the stone keeps `ρ = centreArc(sB)/R` with whatever `sB` the set piece moves it to. It only goes backwards if the stone physically moves backwards, which no beat does.

### 4.2 Test (`roll.test.ts`, rewritten; runs on the engine via `engineStub`)

```
capture 60 s of climbing at 60 Hz, 1440×900 (and repeat at 390×844):
  per frame: ρ (stats.rot), camera along-trail position s_cam, stone centre on screen, marker M
  M = screen position of the stone-local point (R·0.8, 0) after the rotate  // independent of stats
assert for every frame k > 0 while climbing:
  ρ[k] − ρ[k−1] > 0                                       // strictly increasing, sign = clockwise
  screenAngle(M[k] − c[k]) − screenAngle(M[k−1] − c[k−1]) > 0    // atan2 on the y-down screen: clockwise
  |(ρ[k]−ρ[k−1])·R / (s_cam[k]−s_cam[k−1]) − 1| < 0.03    // per frame: rolls with the ground (smooth)
assert over the whole 60 s:
  |(ρ[end]−ρ[0])·R / (s_cam[end]−s_cam[0]) − 1| < 0.01    // ±1% proportional to the ground scroll
  max_k |Δρ[k] − Δρ[k−1]| < 0.02·mean(Δρ)                 // no surges (at fixed dt)
```

The reviewer also repeats the pixel-mask rotation search from round 4 (REVIEW_ROUND4 "Roll check") on screenshots. It must report clockwise motion on 100% of frame pairs.

### 4.3 Texture: show the direction at a glance

The stone's art is rebuilt (`buildBoulderSprite` v5). It's flat `INK.black` with ochre incisions and **no rotational symmetry**.

- **Two rim notches:** small flat bites out of the silhouette, at 35° and 155° (stone-local), 0.06 R deep and 0.20 R wide. Against the bright sky the silhouette's notches move around the rim. That's the fastest cue for the direction of rotation.
- **Three strata chords** (`contour`):
  - long, near-parallel lines of length 1.5 R, 1.2 R and 0.8 R;
  - offset −0.35 R, +0.05 R and +0.45 R from the centre, with a slight wave (amplitude 0.02 R).
  - Their tilt visibly changes, about 14.5°/s.
- **One forked crack** (`contour` → `fine`): from the rim at 250° inward 0.55 R, forking at 60%.
- **Five comet chips** on a ring at 0.70 R, spanning 100° of arc (stone-local 300°–40°).
  - Each chip is a teardrop: a filled ochre head of radius 0.035 R and a tapering tail of length 0.16 R.
  - **The tails trail counter-clockwise**, so every head leads clockwise. They read as motion marks travelling over the top toward the slope ahead.
- **Speckle:** 14 small `fine` flecks, irregular. (Round 4 had more; fewer keeps the big marks dominant.)
- **Per-frame rotation:** 14.5°/s, 0.24° per frame at 60 fps. That's far from any temporal aliasing ("wagon-wheel") threshold, and there's no N-fold pattern to alias anyway.
- **Contact arc:** the screen-fixed contact arc stays as it is, without rotation.

---

## 5. Speed

| Viewport | Hpx | Ground speed along the slope | Notes |
|---|---|---|---|
| 1440×900 | 0.33·900 = 297 | **39.6 px/s** | Crosses the screen in ~36 s. Calm. |
| 1920×1080 | 356 | 47.5 px/s | |
| 3440×1440 (ultrawide) | 475 | 63.3 px/s | |
| 390×844 (phone, portrait) | min(0.21·844, 0.42·390) = 164 | **21.9 px/s** | |

- **Constant visual speed regardless of block length.**
  - `v = PACE_H` (the existing constant, so `posM`, the trail stage lengths and persistence don't change). A 25-minute and a 90-minute block walk at the same pace.
  - Metres and progress are still computed by the domain (`mountain.ts`) from focused time. The scene never derives metres from its visual `D`.
- **The visual integrator:**

  ```
  Ḋ = v · e(t) · (1 + 0.03·tanh((D_target − D)/0.3))     // ±3% max, so speed stays ≥ 0.97·v·e
  if |D_target − D| > 0.5 H  →  D = D_target (snap; only after a hidden tab, reload or new climb, never seen)
  ```

  `D_target` comes from `climb.posM` as now. The round-4 "debt controller" that changed the cadence ±35% is gone.
- **Envelope `e(t)`:**
  - **Focus or open:** 1.
  - **Block start or resume:** `e` rises 0 → 1 over **600 ms** with `sm`: entrance, decelerating into motion; motion-design Premium 350–600 ms.
  - **Pause:** `e` falls 1 → 0 over **400 ms** with `1 − sm` (the exit is about 70% of the entrance). Then everything stops: walk, stone, camera, breath and wind are frozen. The palette desaturates as now.
  - **During a focus block** `e = 1` except in those two ramps, so speed is never zero while focusing.
- **Why the feet can't slide during ramps:** everything is a function of `D`. Slowing `Ḋ` slows the cadence, the stone and the ground scroll together. A slow-down reads as him easing off, not as skating.

---

## 6. Transitions (eased blends from the cycle)

Only the block's end may stop the walk. Every blend interpolates **parameters**, never screen positions:
- pelvis position: lerp;
- joint angles: shortest-arc lerp;
- lean and head pitch: lerp.

The **planted feet stay where they are** and the legs are re-solved by IK, so no foot ever slides. The ease is `cubic-bezier(0.4, 0, 0.2, 1)` unless stated.

1. **Into the summit** (`complete`; replaces ROUND3_ART §5.2's first 2.8 s and round 4's 15 s walk-up, V3):
   - **0–1.2 s:** `e` eases from 1 to **2.0** (the cadence doubles: a triumphant last push; the stride stays L). Distance remaining to the stand point `D_stand` is about 2.45 + 0.4 H, so the walk takes **≈ 5.5 s** in total. The camera releases its clamp and starts the summit pull-back (existing zoom 1 → 0.62 over 3.5 s), so the figure **stays in frame**.
   - **The stop:** choose `D_stop = the first D ≥ D_stand − 0.05 with φ(D) = 0.06`. That's inside double support, both feet planted. Decelerate with a quintic (zero velocity and acceleration at `D_stop`) over the last 0.5 H. The stone stops with `D` at the same instant; it's heavy and doesn't settle-bounce.
   - **Stand blend** (1.2 s): pelvis to 0.50 H, lean 17° → 3°, head pitch 18° → −12° (the chin lifts; it arrives 150 ms after the torso). The near hand stays on the stone, moved to ψ = 150°, the upper flank. It's built from the wrist (V4). The far arm lowers to hang.
   - **Tertiary springs** are initialised from the cycle (§3.6) and settle by about 1 s.
   - **Then the idle:** breath and a weight shift every 6–9 s (eased 1.2 s), so the stand is not frozen (V11).
2. **Seated break:** from the stand, a 1.6 s blend to the existing seated pose (`solveSit`, re-proportioned), with the back against the stone. On break end, stand up in 1.0 s.
3. **Next climb:** keep the clean cut (REVIEW_ROUND3_ART U3): a 0.4 s crossfade to the col frame, figure posed at `walkPose(D0)` with φ chosen at 0.06 (double support), and `e = 0`. Then hold 0.3 s and ramp `e` 0 → 1 over 600 ms. The first step grows out of the standing push pose with no pop.
4. **Mini summit (open-ended loop wrap):** the same as (1) with no stars and a shorter pull-back, then (3).
5. **Reduced motion:** no walk.
   - Render the static key pose `walkPose(D)` at **φ = 0.62** (toe-off: the long straight rear leg and the front leg bent, the reference's pose).
   - **Re-posed every 10 s** at the current `D`, as an instant cut, with no breath, cloth or ramps.
   - The stone's angle follows `D` (a static frame).
   - The summit and break are cut to their final frames.

---

## 7. What to delete, replace and keep

**Delete:**

| File | What goes |
|---|---|
| `gait.ts` | The whole `Gait` class and its machinery: the state machine, `PHASE`, `KEY`, `strain()`, slip and recover, the ratchet (`sBfloor`, `sOff`), the debt-controlled period, seeded per-cycle multipliers, `trapRamp`, `travelStop`, `hold`/`strain` modes, `events.grit` on slips, and the 120 Hz sim with interpolation (not needed: the pose is a pure function). Keep `wind()` and the spline helpers only if `walk.ts` uses them; move them to `noise.ts`. |
| `rig.ts` | `RIG` (new proportions in `body.ts`), `solveHoldStatic`, `holdDForStone`, `stepToStand`, `boulderSFor`, `stoneDistance`, `hipCeiling`, `reachablePalm`, `armsToStone`, `farShoulder`, `lean0`, `h0`, `FRONT_FOOT`/`REAR_FOOT`/`REAR_HEEL`, `HAND_*`. |
| `figureArt.ts` | All of it: `STATIONS`, `HEAD_OUTLINE`, `handOutlines`, `FOOT_OUTLINE`, `DETAIL`, `ORDER`, `figureGeom`, `drawFigureArt`. |
| `chain.ts` | Verlet cloth is replaced by analytic lags plus springs (§3.6). |
| `sisyphus.ts` | Strain and slip stats (`strainT`), `frMode`, grit-on-slip, the `ffS`/`corr` camera filter, `ROLL_DIR` (fold the sign into the rule in §4.1 with a comment), `HEAVE_*`, and the round-4 `summitWalk` logic (replaced by §6.1). |
| Tests | `gait.test.ts`, `figure.test.ts` and `motion.clean.test.ts` are rewritten. `roll.test.ts`, `engine.motion.test.ts`, `summit.test.ts`, `setpieces.test.ts` and `climb.geom.test.ts` are updated to the new API. |

**New:**

| File | Contents |
|---|---|
| `walk.ts` | `walkPose(D, trail, t)`, foot and leg functions, the soft IK, the arms solver, the lag table, `WALK` constants. |
| `body.ts` | Proportions (§2.1), part outlines (§2.2), hand and foot shapes, stroke data (§2.8). |
| `figure.ts` | Builds the `Path2D` cache per tier and draws in the §2.3 order with clipping. |
| `poses.ts` | Stand, sit and blend in parameter space (§6). |

**Keep unchanged:**
- `trail.ts` (`at`, `centreAt`, `centreArc`), `mountain.ts`, and persistence and `ClimbInput`;
- `camera.ts` (`toScreen`, `clampCamX`, `follow` for set pieces). Change only the `camLayout` Hpx numbers: landscape `0.33·h`; portrait `min(0.21·h, 0.42·w)`; ultrawide caps the anchor as now;
- `artDraw.ts` sky, sun, moon, stars, clouds and strips; `artPalette.ts` (add `FLW`); `daylight2d.ts`; `ambient.ts` birds; `noise.ts`;
- HUD and strip components, the phase handling in `sisyphus.ts`, and the summit framing, palette and stars beats.

---

## 8. Coder milestones (F0–F3)

Each milestone lands as its own commit(s) with green `npx vitest run`, a clean `tsc` and a clean `npm run build`.

### F0: `walk.ts`, pure (no drawing)

Build `walkPose` and the constants. Unit tests sample 4,000 values of `D` over 10 strides at θ = 16°, 22°, 28° and 32°, plus a trail segment where θ varies.

- [ ] **Foot lock:** for each foot, while `p < β`, the ball's world position deviates < 1e-6 H from its contact position.
- [ ] **Seam continuity:** foot world position is continuous at every stance/swing boundary (|Δ| < 1e-6 H), with velocity continuous (finite-difference mismatch < 1% of `v`).
- [ ] **C1 joint angles:** hip, knee, foot pitch, elbow, shoulder, lean, head pitch and every §3.6 channel, sampled at φ = 1 − ε vs 0 + ε and at each leg's `β` seam:
  - |Δangle| < 0.05°;
  - first derivatives match within 2% of that channel's peak |d/dφ|;
  - over 1,000 samples per cycle, no second difference exceeds 6× the channel's median (no spikes).
- [ ] **Pose table:** knee, thigh and foot angles at the §2.5 phases match the table within ±4° at θ = 22°. The rear knee is ≥ 160° at p = 0.62–0.63 on all slopes. Stance reach is ≤ 0.985 and all reach ≤ 0.995.
- [ ] **Arms:** elbows within 156–170° and palm–stone gap < 0.002 H on all slopes. The shoulder's protraction offset is ≤ 0.008 H.
- [ ] **Speed:** the pelvis speed along the trail tangent is within [0.94, 1.06]·v at constant `Ḋ = v`.
- [ ] **Roll:** `rot(D)` is strictly increasing in `D`, and `d rot/dD · R` is within [0.99, 1.01] on the incline.

### F1: integrate the motion (old art as a placeholder only if it adapts in under an hour; otherwise draw stick limbs)

- [ ] **Code:** `sisyphus.ts` drives everything from the visual integrator (§5). The camera is rigid (§3.7), the stone uses §4.1, and there's 60 fps while climbing (§0). `gait.ts`, the strain and slip logic and the camera filter are deleted.
- [ ] **Speed (60 s capture at 1440×900 and 390×844, engine stub):** zero frames during climbing where the pelvis speed along the trail is < 0.90 or > 1.10 of the mean (outside the 600 ms ramp after a start or resume).
- [ ] **Roll:** the §4.2 roll test passes. ρ is strictly increasing on every frame, ±1% proportional to the ground scroll over 60 s, the per-frame ratio is within ±3%, and the screen marker turns clockwise.
- [ ] **Foot lock on screen:** a planted ball's screen position plus the camera's screen displacement drifts **< 1 px** over its stance (screen-space check).
- [ ] **Never stops:** the pelvis's screen-plus-camera speed is never 0 during focus. Pause stops everything within 400 ms, and resume reaches 95% speed by 600 ms.
- [ ] **Persistence:** a reload at the same `posM` reproduces φ, ρ and the pose within 1e-6.

### F2: the figure, drawn from scratch

- [ ] **Code:** `body.ts` and `figure.ts` per §2.2–2.8: the §2.3 order, the head group last, every stroke clipped to its part, and `FLW` weights and tiers.
- [ ] **Face clear:** on every frame of a 60 s capture, the face polygon (brow, eye, nose, lips, mouth corner, each dilated by 0.01 H) does not intersect the near upper arm, near forearm or near hand polygons. A static test also asserts that the head group is drawn last.
- [ ] **Size:** the figure's silhouette bounding box (stone excluded), at its smallest over the cycle, is ≥ **0.28·h** at 1440×900 and 1920×1080 and ≥ 0.15·h at 390×844. The figure plus stone fits inside the 16 px gutters at 390 px wide.
- [ ] **Containment:** every stroke's sample points lie inside its own part outline (point-in-path) for 100 sampled poses.
- [ ] **Fingers:** 4 finger shapes plus a thumb on each visible hand, with gaps ≥ 0.0025 H. At T1 each finger is ≥ 2.5 px wide at 1440×900.
- [ ] **Screenshots:** docs/screenshots/round5/ at 1440×900, 1920×1080 and 390×844 at φ = 0, 0.08, 0.31, 0.45 and 0.62, plus 4× head and hand crops. The reviewer judges the result against the reference (upright, broad, straight rear leg, readable profile, curls, beard, ochre folds).

### F3: transitions, secondary motion, performance

- [ ] **Secondary channels:** §3.6 channels and the transition springs are in place. A walk-to-stand hand-off has no velocity step: every channel's derivative is continuous within 5% at the hand-off frame.
- [ ] **Summit (§6.1):**
  - the figure stays fully on screen for the whole beat;
  - it's standing by ≤ 7 s after `complete`;
  - the feet don't slide (< 1 px) during the stand blend;
  - the near hand is attached to its wrist on every frame (gap 0).
- [ ] **Transitions (§6.2–6.5):** break, next-climb ramp, mini summit and reduced motion as specified. In reduced motion, no frame-to-frame motion except the 10 s re-pose.
- [ ] **Frame time** (Chromium, 1440×900, DPR 2, real clock, 60 s climbing):
  - the whole-scene average is ≤ 8 ms and p95 ≤ 12 ms;
  - the figure draw (fills + T1 strokes) averages ≤ 2.0 ms;
  - `walkPose` ≤ 0.2 ms.
  - If the average exceeds 10 ms over 90 frames, drop to 30 fps, then to T2. The motion stays time-based, so the speed is unchanged.
- [ ] **No regressions:** the palette, sky, clouds, birds, HUD strip, summit framing, stars, persistence, and the hidden-summit rule (the crest is never on screen during a block) all still hold.

---

## 9. How the skills were applied (short)

- **motion-design:**
  - Personality: Premium made heavy. 0% overshoot on the body and the stone; `cubic-bezier(0.4,0,0.2,1)` on blends.
  - Timing: 375 ms beats inside a 1.5 s step; entrance 600 ms and exit 400 ms on speed (exit ≈ 70% of entrance).
  - Ambient: breath 4.2 s and wind 7.7 s, not synced with the 3.0 s walk; ambient ≈ 15% of primary.
  - Checklist: "fine on the 100th view" means a strictly periodic cycle with no random events; no linear spatial easing except rotation-by-distance, the permitted linear case.
- **physics-intuition:**
  - Weight is shown by a long duty factor (62%), double support, a low bob, a knee that bends under load, an elbow give after each down, and a stone that never bounces.
  - "Heavy = slow to start and slow to stop" maps to the speed envelope and the quintic summit stop.
  - Nothing slides: feet lock in world space, and the stone rolls without skidding.
- **follow-through-overlapping:**
  - Drag hierarchy: pelvis (0) → torso (90 ms) → head (180 ms) → beard, hair and cloth (300–450 ms).
  - Flat, wide parts (the cloth flaps) drag most.
  - Settling only on tertiary parts, through springs initialised from the cycle at a hand-off.
