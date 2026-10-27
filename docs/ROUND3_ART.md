# StruggleMore round 3 art: black-figure style, an endless climb, and a new push cycle

Owner: designer agent · Status: v1, ready to implement · Branch `round3` · **Replaces** the scene parts of `docs/ROUND3_DESIGN.md` §3 (looks, light, terrain framing, figure, motion, summit) and `docs/STRUGGLEMORE_DESIGN.md` §3.3–3.10 (camera, progress mapping, roll-back). Where they disagree with this doc, this doc wins. The Today page, the weekly card and the HUD controls are unchanged.

**The user's words:**

1. *"The person moving animation is weird. You see how this design/drawing is — replicate this."* They shared a flat illustration in the idiom of Greek black-figure pottery: a terracotta sky, cream and ochre scrolled clouds, a black figure, a black boulder and a black slope, with thin ochre interior lines.
2. *"While I am working I should not see the end. It should be this incline the whole time with visible progress made each second. The point is not to see the end goal until I finish the timer. Then when I restart the timer it should start on the next climb on the same mountain. It should be never ending."*

We treat the image as a **style reference only**. Everything below is original artwork in that idiom. Nothing is traced or copied from it.

**In one line:** A close-up of a heroic black-figure Sisyphus, about a quarter of the screen tall, pushing a huge black stone up an endless incline under a terracotta sky. The camera tracks him and the ground scrolls past every second. The top of the climb appears only when the block ends. The next block starts from the saddle beyond that top and climbs the next section of the same endless mountain.

---

## 0. Decisions at a glance

| Question | Decision |
|---|---|
| Style | Flat black-figure: flat fills, thin ochre/cream linework, no gradients (one subtle stepped sky band), no blur, no glow, no soft shadows. Depth comes from overlap and tone. |
| Camera | **A tracking close-up.** The figure's standing height H is **24% of viewport height** on desktop (≥ 22% guaranteed) and 16–17% on a phone. The camera follows the climber along an endless procedural incline. |
| Seeing the end | **Never during a block.** The incline ahead never crests on screen. In the last seconds the camera stops and the climber walks into the right side of the frame, so the crest stays just off-screen. When the block completes, the camera pulls back and reveals this climb's summit. |
| Progress every second | The ground and its flecks, stones and tufts scroll past at about 29 px/s (1440×900). Cloud and range parallax moves too. The steps themselves are real travel, and the stone turns by exactly the distance travelled. A calm HUD strip shows **altitude in metres** plus a **Greek-key meander** that fills over the block. |
| Mountain model | **One continuous, seeded, never-ending trail.** Each focus block is one *climb* (a stage). A completed climb ends at a summit. The next climb starts in the saddle (col) beyond it. Position persists in app data (`mountain`, schema v3). |
| Pace | A constant **0.133 H per focused second** for every block length (about 0.24 m/s along the trail at H = 1.8 m). The climb's length is `blockSeconds × pace`. Extending the block makes the climb longer with no jump. |
| Partial blocks | **Progress is kept, never lost.** Clock out mid-block and the climber stays where he stopped. The next block continues up the same incline, and its summit appears at its own end. Nothing slides back. |
| Roll-back (round 2) | **Removed.** On the next block the stone rolls *forward* off the summit into the col and the climb continues. It's a nod to the myth without punishing anyone. |
| Push cycle | Keyframed step-and-hold cycle with planted feet (foot-lock plus two-bone IK only to keep them planted). The swing leg is keyframed FK, blended into IK at contact. A step scheduler ties the steps to real distance, so there is no treadmill sliding. Arms stay locked, with a spring-driven elbow give. There's an occasional strain-and-slip beat. |

---

## 1. Art direction

### 1.1 Palette tokens (focus scene only)

These are canvas colours, not app tokens. They don't go in `src/styles/tokens.css`. The HUD keeps its own tokens, with the one change in §2.6.

```ts
// src/focus/scenes/artPalette.ts
export const INK = {
  black:      '#15100D',   // figure, boulder, main slope (warm near-black; never pure #000 next to terracotta: it vibrates)
  ochre:      '#CF9450',   // primary linework on black: muscle contours, folds, flecks
  ochreDeep:  '#B9783C',   // cloud swirls on cream, fine detail on ochre masses
  cream:      '#F1E4C4',   // stars, sun, lit cairn tops, HUD-strip fill, highlights on black
  salmon:     '#E3936A',   // sparse accent flecks (1 in 6 slope flecks), sun ring 2
} as const;

/** Time-of-day stops (flat colours, mixed in OKLab between neighbouring stops). */
export interface ArtStop {
  sky: string;        // main flat sky
  band: string;       // horizon band (one step lighter or warmer)
  far: string;        // far range (lightest land)
  mid: string;        // mid range
  near: string;       // near range (darkest before the black slope)
  cloudFront: string; // cream mass
  cloudBack: string;  // ochre mass
  sun: string;        // disc + rings
}
export const ART_STOPS: Array<{ p: number; name: string; v: ArtStop }> = [
  { p: 0.00, name: 'dawn',      v: { sky: '#C46A35', band: '#D8874C', far: '#EBCB97', mid: '#D49A5A', near: '#7A3A1B', cloudFront: '#F4E6C6', cloudBack: '#DDB37A', sun: '#F6E7C4' } },
  { p: 0.45, name: 'day',       v: { sky: '#B85A2A', band: '#C9703A', far: '#E6C590', mid: '#C98A4C', near: '#6E3218', cloudFront: '#F1E2BF', cloudBack: '#D9A35E', sun: '#F4E3BE' } },
  { p: 0.80, name: 'ember',     v: { sky: '#9A3F1E', band: '#B4542A', far: '#D9A86E', mid: '#B26F3A', near: '#5A2512', cloudFront: '#EBCB9F', cloudBack: '#C98A50', sun: '#F2D7A6' } },
  { p: 0.93, name: 'last-light',v: { sky: '#6E2E22', band: '#9A4426', far: '#B88A68', mid: '#8A5236', near: '#3E1B12', cloudFront: '#D9B596', cloudBack: '#A86E4E', sun: '#EFC890' } },
  { p: 1.00, name: 'dusk',      v: { sky: '#2E2B4D', band: '#5A3448', far: '#6E6280', mid: '#4E4566', near: '#2A2340', cloudFront: '#A89AA8', cloudBack: '#6F6482', sun: '#F1E4C4' } },
];
export const NIGHT: ArtStop = { sky: '#1F1F38', band: '#2B2A48', far: '#4A4566', mid: '#373352', near: '#211D33', cloudFront: '#7E7690', cloudBack: '#544D6C', sun: '#F1E4C4' };
export const PREDAWN_BAND = '#7A3A2C';   // the band warms back toward ember in the last 15% of a break
```

**Mapping:** `artP = 0.86·p` in focus and open, exactly as before (dawn → ember across the block). The summit beat runs 0.86 → 1.00 (last light → dusk). Overtime goes dusk → `NIGHT` over 10 minutes. A break holds `NIGHT` and warms `band` to `PREDAWN_BAND` in its last 15%. **Paused:** mix every stop 35% toward its own OKLab lightness (grey) and darken 8%. That's a palette operation, not a filter.

**Contrast checks** (the reviewer measures them): `cream` on `black` is 15.8:1. `ochre` on `black` is 7.4:1, so lines read at 1.5 px. `black` on `sky@day` is 4.0:1, which is fine for big shapes (non-text). See §2.6 for HUD text.

### 1.2 Line weights

All widths are in CSS px and scale with the figure, so a phone keeps the same look.

```ts
export const LW = (Hpx: number) => ({
  contour: clamp(0.0075 * Hpx, 1.25, 2.25),  // muscle/fold lines on the figure (1.6 px at H 216)
  incise:  clamp(0.0070 * Hpx, 1.25, 2.0),   // separation line where black overlaps black (§3.4)
  fleck:   clamp(0.0070 * Hpx, 1.25, 2.0),   // slope and boulder flecks
  swirl:   1.75,                             // cloud spirals
  ring:    1.5,                              // sun rings, star crosses
});
```

`lineCap = 'round'` and `lineJoin = 'round'` everywhere. No dashes in the scene.

### 1.3 Rules

1. **Flat fills only.** Every shape is one solid colour. No `createLinearGradient` or `createRadialGradient` anywhere in the scene, except **one** allowed exception: the sky band edge, a **stepped** two-tone band (two flat rectangles, not a gradient).
2. **No blur, glow, haze, vignette, soft shadow, rim light, bounce light, AO or `filter`.** No `shadowBlur`. No `globalCompositeOperation` other than `source-over`, plus the one `destination-in` mask in the figure layer (§3.4).
3. **Alpha only for whole elements appearing or leaving:** a star popping in, a cross-fade cut. Never for shading.
4. **Depth by overlap and tone.** Back to front, each layer is darker: sky → far (lightest) → mid → near → black. Clouds interleave (§2.3). The figure, the stone and the slope are the same black and separate only by ochre linework.
5. **Black on black needs a line.** Wherever the figure overlaps the stone or the slope, or a near limb overlaps a far limb, an ochre `incise` line separates them. That's the black-figure incision (§3.4).
6. **Time of day is told by flat colour,** by the sun's position, and by ranges and clouds sinking as you climb (§2.4). Nothing is lit or shaded.

### 1.4 Showing time of day without light

- **Sky:** a flat colour over a flat horizon band. The band occupies the lower 22% of the visible sky above the near range, with a crisp edge. It steps from terracotta to ember to dusk indigo through `ART_STOPS`.
- **Sun:** a flat `sun` disc (r = 0.055·h) with **two concentric line rings** (r × 1.45 in `sun`, r × 1.85 in `salmon`, both `ring` width), the archaic sun motif. It follows the existing Bézier path in screen space, rising left and arcing right (`sunPosition`, re-anchored: B = (0.86w, 0.20h) in landscape). It never sets during a block. At the summit it sinks behind the summit block (§5).
- **Stars:** appear only at the summit beat, in overtime and in breaks. They're small cream **crosses** (two `ring` lines, 4–9 px), with about a third drawn as 2 px dots.
- **Moon** (overtime, break): a flat cream crescent (two discs, subtracted with `evenodd`) with one ring.

---

## 2. Composition: an endless incline, tracked

### 2.1 Why a tracking close-up (and not a wide shot)

- The reference is a close-up, and the user wants the figure **much** larger. At 24% of viewport height the boulder is about 240 px across at 1440×900, and every limb, curl and fold line reads.
- The user now wants **no visible end** and **visible progress each second**. A wide shot of the whole mountain shows the end by definition, and at a block's pace the stone moves under 1 px/s. A tracking camera on an endless incline gives both: the ground scrolls at about 29 px/s, and the top only exists once you get there.
- **Rejected:** a fixed wide shot with a large figure. At H = 24% of the viewport the whole climb would be about 5 body lengths, so it reads as a hillock, and the end is always on screen.

### 2.2 Layout per viewport

`Hpx` is the figure's standing height in CSS px. The **anchor** is the screen point where the pelvis's ground point sits (on the slope surface under the pelvis) while the camera tracks.

| Viewport | Hpx | Anchor (pelvis ground point) | Boulder Ø (1.12 H) | Notes |
|---|---|---|---|---|
| 1440×900 | 0.24 h = **216** | (0.35 w, 0.64 h) = (504, 576) | 242 | Boulder centre ≈ 0.50 w. About 2.7 H of incline is visible ahead of the stone. |
| 1920×1080 | **259** | (0.35 w, 0.64 h) | 290 | |
| 1280×800 | **192** | (0.35 w, 0.64 h) | 215 | |
| ultrawide 3440×1440 | 0.24 h = 346 | (0.5 w − 0.15·1.8 h, 0.64 h) = (1331, 922) | 388 | Anchor x is capped so lead room stays ≤ 6.5 H ahead. |
| phone portrait 390×844 | min(0.17 h, 0.36 w) = **140** (16.6%) | (0.27 w, 0.66 h) = (105, 557) | 157 | Boulder right edge ≈ 0.85 w. |
| phone landscape 844×390 | 0.26 h = 101 | (0.33 w, 0.66 h) | 113 | |

**General rule** (`camera.ts`): landscape means `w/h ≥ 0.9` (as now).
- Landscape: `Hpx = 0.24·h` and `anchor = (min(0.35·w, 0.5·w − 0.27·h), 0.64·h)`.
- Portrait: `Hpx = min(0.17·h, 0.36·w)` and `anchor = (0.27·w, 0.66·h)`.
- World units are **H units** (H = 1), and `toScreen(v) = anchor + (v − camPos)·Hpx` with y flipped. `S` and `layoutFor` in `path.ts` are retired for this scene. Daylight keeps them.

**What fills the frame** (1440×900, typical 24° incline): the slope surface runs from the lower left (about y 0.82 h at x 0) through the anchor, up to about y 0.18 h at the right edge.
- Below the surface it's solid black, roughly the lower-right half of the frame.
- Above it is sky, with the range layers and clouds.
- The **HUD readout** (right: 8vw; bottom: 16vh) and the **controls** (bottom centre) sit on black, so contrast is guaranteed.
- The header (top-left) sits on sky and gets a cartouche (§2.6).

### 2.3 Layer stack (back to front)

| # | Layer | Drawn as | Cache |
|---|---|---|---|
| L0 | Sky + horizon band | 2 `fillRect`s | none (per frame) |
| L1 | Sun / moon + rings, stars | disc + 2 stroked arcs; star crosses in one path | none |
| L2 | **Far range** | flat `far` silhouette, tall tent peaks with ridged teeth (`rangeSkyline`, kept) | strip bitmap |
| L3 | **Cloud bank, back** | 2 big masses (two-tone + swirls) | strip bitmap |
| L4 | **Mid range** | flat `mid` | strip bitmap |
| L5 | **Cloud masses, front** | 2–3 masses in the upper sky, drifting | one bitmap per cloud |
| L6 | **Near range** | flat `near`, jagged multi-peak skyline (varied heights 0.4–1.0 of the layer max, uneven spacing) | strip bitmap |
| L7 | Birds (optional) | 3–5 black "m" strokes | none |
| L8 | **Main slope** | black body + ochre surface flecks + stones + tufts | `Path2D` chunks, world units |
| L9 | **Boulder** | sprite (disc + rim flecks + chips), rotated; contact arc | bitmap sprite |
| L10 | **Figure** | figure layer with incisions (§3.4), blitted | small offscreen canvas per frame |
| L11 | Grit chips | ≤ 12 flat ochre specks | none |

**Range clarity rule (no "end" in the background):** range peaks may vary as much as they like, but **no range layer ever shows a peak above the slope surface ahead of the boulder** within 1.5 H of the climb line, and the near range never touches the slope's skyline. They read as other mountains in the distance, not as the top of this one. This is asserted in the geometry test (§8).

### 2.4 Altitude parallax: you rise above the world

Let `alt` be the climber's altitude within the current climb, normalised: `altK = (yClimber − yStageStart) / (yStageEnd − yStageStart)`, from 0 to 1. Each background layer sinks as you climb, so you look down on the ranges and then on the clouds by the end. This is a second, calm cue for progress that doesn't reveal the summit.

```
layerY(layer) = baseY(layer) + k(layer) · altK · h
horizontal parallax: layerX = −f(layer) · camPos.x · Hpx  (+ cloud drift)
```

| Layer | baseY (fraction of h, where its base sits) | k (sink over a climb) | f (x parallax) |
|---|---|---|---|
| Far range | 0.42 | 0.08 | 0.02 |
| Cloud bank back | 0.40 | 0.20 | 0.03 |
| Mid range | 0.48 | 0.18 | 0.05 |
| Cloud masses front | 0.14–0.32 (per mass) | 0.30 | 0.06 + drift 4 px/s |
| Near range | 0.52 | 0.32 | 0.10 |

Between climbs, the next climb starts in a col slightly lower than the summit. `altK` resets to 0, so the world rises back up around you. That reads honestly: you've come down into a saddle and the next ascent begins. The reset happens under the next-climb transition (§5.4), so it never pops.

### 2.5 Clouds (black-figure cumulus)

Each mass is built once per size and tint into its own bitmap, roughly 0.5 w × 0.18 h.

```
mass = union of:
  base:     a flat rounded slab (height 0.25·mh), bottom edge straight or with 2–3 shallow scallops
  scallops: 5–9 circles along the top, radii 0.18–0.42·mh, centres on a gentle arc, larger toward the middle
  tail:     one end finishes in a curl: a circle r 0.16·mh with a spiral cut-in
back tone:  the same union, offset (+0.05·mw, −0.10·mh), scaled 1.04, filled cloudBack, drawn first
front tone: filled cloudFront
swirls:     in 3–5 of the scallops, an Archimedean spiral r = a·θ, 1.25 turns,
            outer radius 0.55–0.7 of that scallop's radius, stroked ochreDeep at LW.swirl;
            plus 1–2 "comma" strokes (a 0.6-turn spiral) at the boundary where front and back meet.
```

**Placement** (landscape): front masses at about (0.10 w, 0.18 h), (0.62 w, 0.12 h) and (0.88 w, 0.30 h). Two back-bank masses sit along the horizon band behind the mid range. **Portrait:** two front masses fill the empty sky above the climb, at 0.08 h and 0.30 h.

The masses drift right to left at 4 px/s (back bank 2 px/s) and wrap. They can pass behind the stone and the figure: black on cream reads beautifully. The round-3 rule that faded clouds behind the stone is dropped.

### 2.6 HUD changes (the only HUD changes)

- **Cartouche:** any HUD text over sky (the top-left course line, and the portrait readout) sits on a black cartouche: `INK.black` at α 0.88, radius 6, padding 6×10, text in `cream`. That's at least 12:1 on any sky stop. Text over the black slope is cream with no cartouche. The existing text shadows are removed in this scene.
- **Climb strip** (new; replaces the round-3 sky scrim). It's drawn by the HUD as inline SVG, `aria-hidden` (the timer already speaks). It sits directly under the readout and is right-aligned with it in landscape, centred in portrait. Width = the readout's width (≈ 240 px desktop, 180 px phone).
  - **Line 1:** `↑ 1,284 m · Climb 7` in Plex Sans 13, `cream` at 0.8. The metres are **altitude** (vertical), rounded down to whole metres, with tabular numerals.
  - **Line 2:** a **Greek-key meander band**, 10 px tall, of 12 key units (16 on ≥ 1920). The completed portion of the block is stroked `cream` at 1.5 px. The rest is `ochre` at 0.35. The current unit draws in progressively, along its own polyline, by the fraction of that unit. On a 25-minute block one unit is about 2 min 5 s, so the active stroke grows a visible pixel every few seconds.
  - **Open-ended blocks:** the band fills over each 60 focused minutes (the open loop).
  - **Reduced motion:** the same strip, updated with the readout.

> The meander shows how much of **this block** is done (it isn't a distance to a summit), and nothing in the scene shows how far the top is. The user's "don't see the end" is about the mountain. The timer already tells them the time left.

---

## 3. The figure

### 3.1 Proportions (heroic, 8 heads)

`h = H/8` is one head unit. Lengths are measured between joint centres.

| Part | Length | In H | Profile half-depths, front / back (in h) at stations along the bone | Notes |
|---|---|---|---|---|
| Head (crown → chin) | 1.0 h | 0.125 | skull depth 0.9 h | egg tilted along the head axis, with a beard |
| Neck (shoulder joint → skull pivot) | 0.5 h | 0.0625 | 0.30 / 0.30 | thick: trapezius slope on the back |
| Torso (hip joint → shoulder joint) | 2.4 h | 0.30 | front: hip 0.55 · waist (t .35) **0.45** · pec (t .7) **0.72** · t .9 0.62 · shoulder 0.45. back: buttock 0.70 · lumbar (t .3) **0.45** · lats (t .7) 0.64 · trapezius (t .95) 0.60 · neck 0.40 | broad chest, **narrow waist** |
| Upper arm | 1.5 h | 0.19 | deltoid cap (t .1) **0.44** · biceps (t .55) 0.30 · elbow 0.18 / triceps (t .4) 0.32 · elbow 0.18 | |
| Forearm | 1.3 h | 0.16 | t .25 0.27 → wrist 0.14 / t .25 0.25 → wrist 0.14 | |
| Hand | wrist → palm centre 0.4 h, → fingertips 0.75 h | 0.05 / 0.094 | paddle 0.38 h wide; thumb lobe | palm laid flat on the stone |
| Thigh | 1.95 h | 0.245 | quad bulge (t .3) **0.46** → knee 0.26 / glute–hamstring (t .15) 0.48 → knee 0.26 | |
| Knee | — | — | patella bump 0.06 h on the front | |
| Shin | 1.9 h | 0.235 | shin line 0.18 → ankle 0.13 / **calf (t .25) 0.42** → ankle 0.14 | defined calves |
| Foot | heel → ball 0.75 h, ball → toe 0.3 h; ankle height 0.3 h | 0.13 total | heel radius 0.2 h | barefoot |
| **Boulder** R | **4.5 h** | **0.56** | — | Ø ≈ 1.12 H, a little taller than the figure |

The standing heights check out: ankle 0.3 + shin 1.9 + thigh 1.95 puts the hip joint at 4.15 h, the shoulder joint at 6.55 h and the crown at 8.0 h.

### 3.2 Construction for Canvas 2D

**Parts as bezier shapes in bone-local space.** Each part is a closed path built once per `Hpx` (module-level cache keyed by `Math.round(Hpx)`), as a `Path2D` in local coordinates:
- the origin is at the proximal joint, x runs along the bone toward the distal joint, and +y is the part's **front**;
- the outline goes through the stations in §3.1 as a cubic Catmull-Rom loop (tension 0.5) converted to bezier segments;
- each part extends past its joints with a rounded cap of radius equal to the joint's half-depth, so the union is smooth at every joint.

Parts:
- `torso` (includes the pelvis mass and a gentle S-curve spine: the mid-back bows 0.15 h outward);
- `neck`;
- `head` (egg plus a **beard** lobe under the jaw, scalloped with 4 bumps of r 0.08 h, and a **curls cap**: the back and top outline replaced by 7–9 scallops of r 0.09–0.12 h);
- `upperArm`, `foreArm`, `hand`, `thigh`, `shin`, `foot`;
- `cloth` (the loincloth, built per frame from its chains; see §3.5).

**Per-frame assembly.** For each body part:
1. compute the bone matrix `M = translate(joint)·rotate(boneAngle)·scale(1, side)`;
2. `group.addPath(partPath, M)` into its **group** `Path2D`.

The groups are the **far leg**, **far arm**, **core** (torso, neck, head), **near leg**, **cloth** and **near arm**. One group is one fill, so there are no seams inside a limb. All parts wind the same way under nonzero, so the union never punches holes. `Path2D.addPath(path, DOMMatrix)` is supported in Chromium, Firefox and Safari 14.1+. As a fallback, transform the point lists in JS.

**Draw order:** boulder (L9) → figure layer: far leg → far arm → core → near leg → cloth → near arm. The **far arm is drawn over the boulder**, because both hands push on the stone's near face.

### 3.3 Interior contour lines (ochre)

The contour lines are stroked `ochre` at `LW.contour`, defined in each part's local frame, so they move, bend and breathe with the part. Each is a short open cubic.

| Part | Lines (near side; the far side only gets the knee and calf lines) |
|---|---|
| Torso | pectoral underline (armpit → sternum arc); linea alba (short vertical); 3 short transverse ab arcs; 2 serratus ticks under the armpit; the inguinal "V" ends under the cloth's top edge |
| Upper arm | deltoid cap curve (a horseshoe around the shoulder head); biceps–triceps separation line |
| Forearm | one brachioradialis curve near the elbow |
| Hand | 3 finger separations (0.25 h long) |
| Thigh | vastus lateralis curve along the front; a hamstring line at the back near the knee |
| Knee | patella arc |
| Shin | gastrocnemius inner curve (calf split); an Achilles line above the heel |
| Foot | toe line; ankle bone dot (r 0.03 h, filled ochre) |
| Head | **frontal almond eye** on the profile face (the black-figure convention): almond 0.22 h with a 0.06 h dot; ear as a 1-turn spiral; a hairline arc from the temple to behind the ear; 4–6 curl spirals (0.75 turn, r 0.05 h) in the hair; 3 short beard strands |
| Cloth | see §3.5 |

**Breath:** the torso's front depth is scaled by `breath` (1 ± 0.015). The pec and ab lines ride with it.

### 3.4 Incision (black on black)

The black-figure look depends on the incised line where one black shape crosses another. It's done in a small **figure layer** (an offscreen canvas sized to the figure's bounding box plus 0.15 H, at the scene's back-buffer scale, about 450×380 device px at 1440×900 @1.5):

```
for group in [farLeg, farArm, core, nearLeg, cloth, nearArm]:
  layer.lineWidth = 2 * LW.incise;  layer.strokeStyle = ochre;  layer.stroke(group)   // halo
  layer.fillStyle = black;           layer.fill(group)                                // body
  strokeContours(group)                                                               // §3.3 lines
// Remove the outer halo (it must not show on sky), keep the inner ones:
layer.globalCompositeOperation = 'destination-in'; layer.fill(unionOfAllGroups); reset to source-over
// Main canvas: the figure's outline is incised only where it lies over the stone or the slope:
ctx.save(); ctx.clip(boulderDisc ∪ slopeBodyNearFigure)
ctx.lineWidth = 2 * LW.incise; ctx.strokeStyle = ochre; ctx.stroke(unionOfAllGroups)
ctx.restore()
ctx.drawImage(layer, …)
```

The result:
- the near arm is outlined over the torso and the head (the head sits between the arms) and over the stone;
- the near leg is outlined over the far leg;
- the cloth hem is outlined over the thighs;
- the soles get a thin ochre line where they stand on the black slope;
- against the sky the silhouette stays clean.

### 3.5 Loincloth (and optional fillet)

- **Wrap:** a band around the pelvis, from the hip joint to 0.55 h below it, following the torso's local frame. Its top edge is a slight downward curve toward the front.
- **Flaps:** a **front flap** and a **back flap**, each a 3-link Verlet chain (`chain.ts`, kept). Link 0.30 h, damping 0.82, maxBend 30°, windK 0.6. Each is filled as a tapering ribbon (0.45 h → 0.25 h wide) and added to the `cloth` group.
- **Fold lines** (ochre `contour`): 3–4 lines fan out from a knot at the front hip across the wrap. Each flap gets 2 lines along its length. The hem is a **double line** (two parallel strokes 0.08 h apart), the classic black-figure border.
- **Optional fillet** (quality 1 only): a headband line (ochre) with a 2-link ribbon tail behind the head, link 0.25 h, windK 1.0. It's the only "hair" motion. The curls are compact and don't move.

### 3.6 Rest pose: the hold, which is the key pose

This pose is defined on a reference slope of θ = 22°. Angles are in degrees from **world vertical**, positive leaning uphill (+x). Lengths are along the path, in H.

| Item | Value | Rule for other slopes θ |
|---|---|---|
| Torso lean | **20°** | `lean0(θ) = 17 + 0.30·(θ − 18)`, clamped to 15–25° |
| Pelvis height above the ground under it | 0.395 H | solved: the highest value with the rear leg at ≤ 0.985 extension and the front knee ≥ 80° |
| Front foot (ball) | **+0.10 H** ahead of the pelvis ground point, flat on the ground | × `cos θ / cos 22°` |
| Rear foot (ball) | **−0.24 H** behind, heel lifted **25°** (on the ball of the foot) | × `cos θ / cos 22°` |
| Front leg | thigh ≈ +45° from the slope normal, knee interior ≈ 90° | IK output, checked ±6° |
| Rear leg | thigh ≈ −24°, knee interior ≈ 172° (straight, long) | IK output |
| Arms | **locked**: shoulder → wrist at 0.995 of the chain length (elbow interior ≈ 170°), elbows bend downward | fixed |
| Arm direction | comes out at ≈ slope − 2° (about 20° above horizontal on 22°): pushing through the stone's centre, parallel to the slope | follows from the boulder solve (§4.5) |
| Hands | palms flat on the stone at the point facing the shoulder. Near hand offset −0.015 H across the arm axis, far hand +0.02 H, so both read. | — |
| Neck / head | neck 70° from vertical (thrust forward), head axis 100° (chin tucked, face down). The head centre ends up about (+0.11 H, +0.01 H) from the shoulder: **below the arm line, between the arms** | — |
| Shoulder | protracted 0.01 H toward the stone | — |

**Strong negative shapes.** These three gaps must stay open in the hold pose; the reviewer checks them on a silhouette:
- the triangle between the two legs;
- the gap between the arms, the chest and the stone (a sky wedge under the arms);
- the wedge between the rear leg and the slope.

---

## 4. The push cycle (fixing the "weird" motion)

### 4.1 What was wrong

The round-3 gait was a free IK treadmill. The figure must stay beside a stone that moves under 1 px/s, so the feet **slid backward while planted** (the "slip" phase of `footTarget`). The hips bobbed on a sine regardless of support, and the arms re-solved every frame, so the elbows wobbled. The pose was also a deep 46° crouch.

The fix:
1. **Real travel:** the climb pace is now a real walking distance, so every step moves the body forward over a planted foot.
2. **A step-and-hold cycle** with keyframes.
3. **Foot-lock:** IK is used only to keep planted feet planted.
4. The stone is solved from the shoulders and turns by exactly its own travel.

### 4.2 Pace and the step scheduler

- **Pace:** `v = 0.133 H/s` of trail per focused second, for every block length.
- **Target position:** `Dtarget = stageStart + focusedSec·v`, along the trail in H. It comes from `setClimb` (§6.2).
- **Stride:** `σ(θ) = (0.10 + 0.24)·cos θ / cos 22° = 0.34 H` at 22°. Each step moves the pelvis one stride: the rear foot swings ahead to become the new front foot.
- **Step duration:** `Tstep(θ) = 0.95 s · (1 + 0.5·(θ − 20)/25)`, giving 0.95–1.25 s.

Average cadence at 22° is one step per σ/v = 2.55 s. The scheduler groups steps in **pairs**: two steps in about 1.9 s (a step pair is the **period of 1.6–2.2 s**), then a **hold** of about 3.2 s in the key pose. The rhythm is the same for every block length, because the pace is constant.

```
debt = Dtarget − D            // D = pelvis base position (H along the trail), advanced only by completed steps
hold:
  if holdT ≥ 0.35 s and debt ≥ 1.5σ  → start a step pair
  if a strain beat is due and holdT ≥ 1.0 s and debt < 1.2σ → strain beat (§4.7)
  else idle (§4.8)
after each step: if it was the first of a pair → next step immediately (gap 0.08 s)
                 else if debt ≥ 0.8σ → keep walking (catch-up), else hold
|debt| > 4σ (reload, hidden tab, extend after a long pause, clock change) → snap:
  re-plant the feet in the hold pose at Dtarget; if the scene is visible, 300 ms cross-fade
```

Debt stays within about ±1.6σ in steady state. **Rule:** the stone and the body only move during steps, the strain beat and the summit beat. So the stone **never rolls without travel**.

### 4.3 Step keyframes

In a step, u runs from 0 to 1 over `Tstep`. The **stance leg** starts as the front leg and ends as the rear leg. The **swing leg** starts as the rear leg and ends as the front leg. Leg angles are in degrees from the **local slope normal** (+ forward). The knee is the interior angle. Foot pitch is relative to the ground, with + meaning heel up. The stance values are **IK outputs** (checks, ±6°). The swing values are **FK keys** (§4.4).

| Phase | u | Pelvis travel (× σ) | Pelvis height Δ (H) | Lean Δ (°) | Stance leg: thigh / knee / foot | Swing leg: thigh / knee / foot |
|---|---|---|---|---|---|---|
| Hold / contact | 0.00 | 0.00 | 0 | 0 | +45 / 92 / 0 | −24 / 172 / +25 (on the ball) |
| Load (anticipation) | 0.10 | 0.03 | **−0.006** | +1 | +44 / 90 / 0 | −25 / 174 / +32 |
| **Push-off** (toe-off) | 0.20 | 0.12 | −0.004 | **+3** | +38 / 105 / 0 | −27 / 176 / +40 |
| **Passing** | 0.45 | 0.55 | **+0.014** (vault) | +1 | +12 / 150 / 0 | +15 / 85 / −15 (toe hangs), clearance peak 0.07 H at u 0.40 |
| **Reach** | 0.68 | 0.85 | +0.004 | 0 | −8 / 165 / +8 | +42 / 100 / −5 |
| **Contact** | 0.80 | 0.95 | −0.004 | −1 | −16 / 170 / +18 | +46 / 90 / 0 (foot plants flat) |
| Weight accept | 0.90 | 0.985 | **−0.016** | −1.5 | −20 / 171 / +22 | +45 / 88 / 0 |
| End = hold (legs swapped) | 1.00 | 1.00 | 0 | 0 | −24 / 172 / +25 | +45 / 92 / 0 |

**Interpolation:** monotone cubic (Fritsch–Carlson) through each column, so there's no overshoot in travel. The stance heel lift rises smoothly from u 0.45 to 1.0, rotating the foot **about its ball** (the ball stays fixed).

**Easing** (motion-design skill, a heavy "premium" personality with no overshoot on the body):
- the body uses `cubic-bezier(0.45, 0, 0.55, 1)`-like in-out;
- pelvis velocity is zero at contact and peaks in passing;
- springs only on the stone's settle and the cloth.

### 4.4 Legs: foot-lock for stance, keyed FK for swing

- **Stance foot:** at plant, store the **ball point** in world coordinates on the ground line (`trail.at(sPlant)`) and the ground angle there. During stance the ball never moves. The foot pitch rotates the heel and ankle about the ball. **Two-bone IK** (`twoBoneIK`, kept) solves hip → ankle, with the knee on the uphill side.
- **Pelvis ceiling:** if any stance ankle is beyond 0.99 of leg reach, **lower the pelvis** (never move the foot). The pelvis height is `min(keyed height, the highest height that keeps every stance ankle within 0.985·(thigh + shin))`.
- **Swing foot:**
  - for u in 0.20–0.62, pure **FK** from the keyed thigh and knee angles (relative to the local normal at the pelvis);
  - from 0.62 to 0.80, blend to **IK** toward the plant target with `smoothstep(0.62, 0.80, u)`;
  - the plant target is the ball point at `pelvisS(u = 1) + 0.10 H·k`, so contact lands exactly.
  - **Clearance guard:** if the FK ankle comes within 0.03 H of the ground, raise the IK weight until it clears.
  - **Arc:** the peak is early (u 0.40). The knee leads up and forward, then the shin reaches.

### 4.5 Torso, arms and the boulder

- **Pelvis:** `pelvisS = D + σ·travel(u)`, with `pelvis = trail.at(pelvisS) + up·(h0(θ) + Δh(u) + breathΔ + strainΔ)`. The camera tracks the **pelvis base without the bob** (§4.9).
- **Torso lean:** `lean = lean0(θ̄) + Δlean(u − 0.05 s/Tstep) + 1.5°·noise(t·0.21)`. Here θ̄ is the slope averaged over the footprint and filtered over 1.2 s. The torso lags the pelvis by 50 ms.
- **Shoulder:** `pelvis + 0.30·(sin lean, cos lean) + tangent·0.01·drive(u)`, where `drive` peaks at push-off (protraction into the shove).
- **Boulder target:** find `sB` on the trail where `|centreAt(sB, R) − shoulder| = A`, with `A = 0.995·armChain + R + palm`. It's a bisection on `[pelvisS + 0.5 H, pelvisS + 3 H]`. `centreAt` is the offset curve, kept from `ridge.ts`.
- **Boulder actual:** a **critically damped** spring on `sB` toward the target (ω = 14 rad/s), **never ahead of the target**. The stone has inertia, so when the pelvis surges at push-off the stone lags by about 70 ms.
- **Arms and elbows:** the arms solve to the actual stone, so a lag shortens the shoulder → hand distance and **the elbows give**: interior about 170° → 158° on each push, then they re-lock as the stone catches up. Clamp the extension to [0.94, 0.995]. Below 0.94 the shoulder is pulled forward instead (no hand ever leaves the stone).
- **Hands:** `u = norm(centre − shoulder)`, so the palm centre is `centre − u·(R + 0.012 H)` ± the cross offsets in §3.6, with the palm axis tangent to the stone. Under load the palm widens ×1.08. The hand takes the squash; the stone never does.
- **Rotation:** `boulderRot = arcLen(centreCurve, 0 → sB_actual) / R`, measured from the stage start (kept modulo 2π). **Exactly the distance travelled.** It turns back a little when the stone gives back.
- **Head:** rigid on the neck, plus a pitch channel `Δpitch(u)` (−3° at push-off, +2° at accept) delayed **100 ms**. The head's position bob comes through the shoulder, so it also lags.
- **Drag hierarchy** (follow-through skill, offsets per level): pelvis 0 → torso 50 ms → arms/stone about 70 ms (spring) → head 100 ms → cloth 200–300 ms (chains).

### 4.6 Micro-variation

Each step draws seeded multipliers:
- σ × (1 ± 0.06), `Tstep` × (1 ± 0.08), clearance × (1 ± 0.15), lean ± 1.5°.

**Breathing** runs independently: inhale 1.5 s, exhale 1.9 s, so the 3.4 s period is co-prime with the steps. Chest depth × (1 ± 0.015) and shoulders ± 0.004 H.

### 4.7 The strain beat (physics-intuition: weight, gravity, recovery)

The strain beat is seeded to every 4–8 holds. It's never in the first 30 s of a climb, and it's **every 3–5 holds in the last 30% of a climb** (the grind gets harder). Feet stay planted throughout: the legs absorb everything.

| t (s) | Beat | Values |
|---|---|---|
| 0.0–0.5 | **Brace** (anticipation) | lean +5°, pelvis −0.02 H (ease-in), breath holds at full inhale |
| 0.5–1.4 | **Hold** | tremor 0.002 H at 9 Hz on the pelvis and hands; rear heel +8° |
| 1.4–1.7 | **Slip:** the stone wins. Ease-**in** (accelerating: gravity) | stone −0.05 H along the trail and **rotates back by that distance**. Pelvis back 0.05 H: the front knee folds to about 80° and the rear knee to about 160°. Elbows buckle to about 145° (extension 0.95). Head drops 6°. 2–3 grit chips fall from the contact point. |
| 1.7–2.0 | **Catch:** a sudden stop with a 10% overshoot, ζ 0.5 | the stone settles. One sharp exhale (shoulders −0.006 H). |
| 2.0–2.6 | **Recover:** slow and heavy, ease-in-out | the pelvis drives forward 0.05 H, the arms re-lock, lean back to +1° |
| 2.6–3.0 | **Settle** into the hold | — |

The net travel is zero, so the stone ends where it started. The strain beat **doesn't count toward the debt**: progress still comes from time, and the next pair catches up.

### 4.8 Hold idles (one every 3–5 s while holding)

Idles are seeded, never repeat the same one twice in a row, and are all ≤ 1.2 s:
- **re-grip:** one hand slides 0.03 H around the stone and re-plants;
- **weight shift:** pelvis ± 0.01 H along the trail, absorbed by the knees;
- **heel pump:** the rear heel lowers 10° and lifts again;
- **look up the slope:** head −12°, held for 0.8 s, then back.

### 4.9 Camera

- **Tracking:** `camPos` follows the point `trail.at(D + σ·travel(u))` with the pelvis bob removed, through a critically damped filter (ω = 2.2 rad/s). The figure visibly advances within the frame on each step, by up to about 0.3σ, and the world catches up smoothly. There's no rotation and no zoom during a block.
- **Hide the end:** let `crestS` be the start of this climb's crest fillet. Every frame, clamp the camera so the right edge of the view shows at most `crestS − 0.3 H` of trail. That means `camPos.x ≤ trail.at(crestS − 0.3H).x − (w − anchor.x)/Hpx`.
  - At 1440×900 the clamp engages in the last ~2.7 H of the climb, about the last 20 s. The camera stops there and the climber walks into the right third of the frame.
  - Ranges and clouds keep their parallax (driven by `camPos`, so they stop too). Only the climber moves, which reads as tension at the end.
- **Reduced motion:** no filter, `camPos` set directly (§7).

### 4.10 Pseudo-code

```ts
// gait.ts: pure, seeded; step(dt, Dtarget) mutates state; pose() is a pure read.
interface Foot { ballS: number; ball: V; ground: number /*rad*/; heel: number /*rad*/; planted: boolean }
interface GaitState {
  mode: 'hold' | 'step' | 'strain' | 'idle' | 'snap';
  D: number; u: number; t: number; holdT: number;
  front: 0 | 1;                 // which leg (0 near, 1 far) is the front foot
  feet: [Foot, Foot];
  pairLeft: number;             // steps left in this pair
  var: { sigma: number; T: number; clear: number; lean: number };
  sB: number; sBv: number;      // boulder (actual) along the trail, spring state
  strainT: number; idle: IdleKind | null; idleT: number;
  breathT: number; rng: () => number;
}

function step(g: GaitState, dt: number, Dtarget: number, trail: Trail) {
  const debt = Dtarget - g.D;
  if (Math.abs(debt) > 4 * sigma(trail, g.D)) return snapTo(g, Dtarget, trail);
  switch (g.mode) {
    case 'hold': case 'idle':
      g.holdT += dt;
      if (g.holdT >= 0.35 && debt >= 1.5 * sigma(trail, g.D)) startStep(g, trail, /*pair*/ 2);
      else if (strainDue(g) && g.holdT >= 1.0) { g.mode = 'strain'; g.strainT = 0; }
      else tickIdle(g, dt);
      break;
    case 'step':
      g.u += dt / g.var.T;
      if (g.u >= 1) {
        plantSwingFoot(g, trail);          // ball at final target, planted = true
        g.D += g.var.sigma; g.front ^= 1; g.u = 0; g.pairLeft--;
        const d2 = Dtarget - g.D;
        if (g.pairLeft > 0 || d2 >= 0.8 * g.var.sigma) startStep(g, trail, Math.max(g.pairLeft, 1));
        else { g.mode = 'hold'; g.holdT = 0; }
      }
      break;
    case 'strain':
      g.strainT += dt; if (g.strainT >= 3.0) { g.mode = 'hold'; g.holdT = 0; }
      break;
  }
  springBoulder(g, dt, trail);             // critically damped toward boulderTarget(pose), never ahead
  g.breathT += dt; g.t += dt;
}

function pose(g: GaitState, trail: Trail, H = 1): Pose {
  const k = g.mode === 'step' ? g.u : 0;
  const sig = g.var.sigma;
  const pelvisS = g.D + sig * KEY.travel(k) + strainPelvisS(g);
  const theta = footprintSlope(trail, pelvisS);                // filtered
  const base = trail.at(pelvisS);
  let hipY = h0(theta) + KEY.hipDy(k) + breathDy(g) + strainDy(g) + idleDy(g);
  const stance = g.feet[g.front], swing = g.feet[g.front ^ 1];
  const ankles = [ankleOf(stance, KEY.stanceHeel(k))];         // rotate about the ball
  if (g.mode !== 'step' || k < 0.20 || k >= 0.80) ankles.push(ankleOf(swing, KEY.swingHeel(k)));
  hipY = Math.min(hipY, ceilingFor(base, ankles, 0.985 * (THIGH + SHIN)));
  const pelvis = { x: base.x, y: base.y + hipY };
  const lean = lean0(theta) + KEY.lean(k - 0.05 / g.var.T) + g.var.lean + strainLean(g);
  const shoulder = add(pelvis, polar(TORSO, lean), mul(trail.tangentAt(pelvisS), 0.01 * KEY.drive(k)));
  // legs
  const stanceLeg = ik2(pelvis, ankles[0], THIGH, SHIN, 'kneeUphill');
  let swingLeg: Limb;
  if (g.mode === 'step' && k >= 0.20 && k < 0.80) {
    const fk = fkLeg(pelvis, trail.normalAt(pelvisS), KEY.swingThigh(k), KEY.swingKnee(k));
    const target = ankleAtPlant(trail, g.D + sig + 0.10 * cosRatio(theta), 0);
    const wIK = Math.max(smoothstep(0.62, 0.80, k), clearanceNeed(fk, trail));
    swingLeg = blendLimb(fk, ik2(pelvis, target, THIGH, SHIN, 'kneeUphill'), wIK);
  } else swingLeg = ik2(pelvis, ankles[1], THIGH, SHIN, 'kneeUphill');
  // stone + arms
  const centre = trail.centreAt(g.sB, R);
  const dir = norm(sub(centre, shoulder));
  const hands = [-0.015, 0.02].map((o) => add(sub(centre, mul(dir, R + 0.012)), mul(perp(dir), o)));
  const arms = hands.map((hd) => ik2(shoulder, wristFor(hd, dir), UPPER, FORE, 'elbowDown'));
  const head = headFrom(shoulder, lean, lagged(g, 'headPitch', 0.10));
  return { pelvis, shoulder, head, lean, legs: order(stanceLeg, swingLeg, g.front), arms,
           boulder: centre, boulderRot: trail.centreArc(g.sB) / R, breath: breathK(g) };
}
```

---

## 5. Block end, summit, overtime, break, next climb

### 5.1 Terrain of a climb (`trail.ts`)

The trail is one continuous polyline in H units, built **stage by stage** from the persisted mountain state (§6). Stage k is generated from `seed = hash(MOUNTAIN_SEED, k)` and starts at the stored start point.

```
stage k geometry (left → right):
  prefix (only if it starts from a summit): the previous summit's ledge tail (1.5 H, from stage k−1's seed)
       + a descent into the col: 3.5 H at −10°→−4°, a concave fillet r ≥ 1.2 H
  start point = col bottom (or, after a partial block, simply the point where the climber stopped)
  incline:   length = stageLen (= blockSeconds·v; grows on extend), heading drawn by a turtle walk
             heading(s) = 22° + 6°·noise1(s/18 + seed) + 4°·(s/stageLen)  (steeper toward the end)
             clamped to [16°, 32°]; fine roughness amp 0.004 H, wavelength ≥ 1.5 H
             NO benches and NO local maxima: heading ≥ 14° everywhere, so no crest ever reads as a top
  crest:     at crestS = stageEnd − 0.3 H: the heading eases to 2° over 0.9 H (convex fillet r ≥ 2.2 R)
  summit:    a flat-topped summit ledge 2.6 H long (heading 0–2°), with a black cairn at its far end
  back side: drops into the next col: −28° for 2.5 H, easing to −10° (this is the next stage's prefix)
  beyond:    the first 6 H of the next stage's incline (generated from seed k+1 so it matches later):
             visible only in the summit's wide shot, so you can see that the mountain goes on
```

The functions `buildRidgePath`'s turtle walk, heading low-pass fillet and offset-curve `centreAt` are reused with a new spec. The arc-length LUT goes to 16 samples per H, in a `Float32Array`, built per stage plus one neighbour. The LUT is extended lazily as `stageLen` grows.

**Surface detail** is placed by arc-length hash, so the same ground always looks the same. These are the "progress each second" cues:
- **Flecks:** 14 per H. Each is a short ochre stroke 0.02–0.06 H long, parallel to the surface, 0.01–0.10 H below it. Density falls with depth. 1 in 6 are `salmon`.
- **Stones:** one every 0.8–2 H. A small black rounded polygon (0.04–0.10 H) sitting on the surface line, with a 1.25 px ochre top edge.
- **Tufts:** one every 2–4 H. Three short black strokes rising from the surface, with an ochre tip.
- **Cracks:** one every 3–6 H. A deeper ochre polyline, 3 segments, 0.15–0.3 H.

They pass at about 29 px/s at 1440 and about 19 px/s on a phone: always moving, never fast.

### 5.2 Summit beat (`setPhase('complete')`, 6.0 s, plays once)

| t (s) | Primary | Camera and world |
|---|---|---|
| 0.0–0.5 | **Last strain** (§4.7 brace, shortened) | The camera clamp still holds. |
| 0.5–1.6 | **Heave:** two quick steps (×1.4). The stone crests the fillet, rolls onto the ledge (slow-in), and **settles on a damped spring** (±0.01 H, two oscillations, ζ 0.35). Rotation follows distance. 3–4 grit chips. | **Pull back** starts: zoom 1.0 → 0.62 and pan up and right to frame the whole summit (ledge + cairn + back side + the next incline's start), ease-in-out over 3.5 s. |
| 1.2–2.8 | **Stand:** two steps onto the ledge, then lean 20° → 3° and the legs straighten. The **near hand rests flat on the stone's upper flank** (150°). The far arm hangs. The head arrives 150 ms after the torso. The cloth swings forward and settles. | **Clouds part:** the two front masses nearest the summit slide apart (±0.18 w, ease-in-out 2.5 s). The cloud bank sinks 0.06 h. |
| 1.0–4.0 | **Chin lifts 12°**: he looks out over the range. One deep breath. | Palette 0.86 → 1.0 (last light → dusk). **The sun sinks behind the summit ledge's far side**: the black ground covers it, and the rings expand once (r × 1.0 → × 1.25) as it goes. |
| 2.5–5.0 | — | **Stars** pop in, brightest first: each scales 0 → 1 over 200 ms with a slight ease-out-back. |
| ≥ 3.6 | HUD `Summit.` (unchanged) | The camera holds. |
| after | **Overtime idle:** a weight shift every 6–9 s, breathing, and the fillet ribbon in the wind | dusk → night over 10 min. The moon rises on the left. |

**Summit framing** (zoom 0.62). The figure stays ≥ 15% of h (H ≈ 0.149 h at 1440×900).
- Landscape: the ledge sits at about (0.55 w, 0.58 h), with the back side and the next incline's base visible to the right and the cloud sea below.
- Portrait: zoom 0.72, with the ledge at (0.45 w, 0.62 h).
- The HUD's complete panel stays bottom-centre, over black or cloud. Panel text sits on its own surface, as now.

### 5.3 Break

The camera stays at summit framing. The figure **sits** with its back against the stone on the ledge, facing downhill (left): thighs 15° above horizontal, shins down, forearms on the knees, head bowed 10°. Contour lines stay on, and the eye is hidden. The palette is `NIGHT`, stars twinkle in size (± 15%, 4–7 s periods), and the moon crosses with break progress. In the last 15% the band warms toward `PREDAWN_BAND`. When the break ends he stands (1 s) and waits in the standing idle.

### 5.4 The next climb (replaces the round-2 roll-back)

This plays when the engine sees `complete`/`break` → `focus`, on Keep going or Start next block. It lasts 3.2 s. On a fresh mount the engine goes straight to the right frame (the climber in the col, in the hold pose).

| t (s) | Beat |
|---|---|
| 0.0–0.4 | His resting hand pushes. The stone tips over the ledge's far edge (rotates by distance). |
| 0.4–1.8 | **The stone rolls forward down the back side into the col** under gravity (`s = s0 + ½·g′·t²`, g′ chosen so it arrives at 1.8 s). Rotation follows distance, and grit trails behind. This is the myth's roll, but **forward**. |
| 0.6–2.0 | He follows down the descent: four steps at ×1.3. The hold pose is re-established behind the stone in the col by 2.0 s. |
| 1.0–2.6 | Camera: zoom 0.62 → 1.0, panning down to the tracking anchor (ease-in-out). Palette cross-fades to dawn (artP → 0). `altK` resets under this move, so the ranges and clouds rise back around him. |
| 2.6–3.2 | The gait resumes. The climb strip shows `Climb k+1`, the meander empties, and the metres carry on. |

**Open-ended loop wrap** (every 60 focused minutes): a **mini summit** (heave + stand only, 2.4 s, no stars, a shorter pull back to zoom 0.8), then §5.4 runs straight away. **Reduced motion:** cut to the col frame.

---

## 6. The never-ending mountain: state and persistence

### 6.1 Model

- **One mountain** per user: `MOUNTAIN_SEED` is fixed (0x5157), so every user gets the same, endless mountain, and it never resets.
- **Position** is a distance along the trail in metres (H = 1.8 m), so `posM = posH·1.8`. **Altitude** is the vertical metres (`Σ Δy·1.8`), shown in the HUD.
- **A climb (stage)** is one focus block. Stage k has `startM`, `lenM = blockSeconds·v·1.8` (`v·1.8` ≈ 0.24 m/s) and `fromSummit`.

**What counts**, decided to be **motivating, never punishing**:

| Case | Effect on the mountain |
|---|---|
| Focus time in a block | moves the climber at the pace |
| Pause, break, overtime | no movement (he holds, rests or stands on the summit). Overtime still counts as study time on the timecard, as now. |
| Block completes | position = the end of the climb. `summits += 1`, `atSummit = true`. |
| **Clock out mid-block** (or abandon, or the tab closes and the session is ended) | **progress is kept**: position = where he stopped, `atSummit = false`. The next block continues up the same incline from there. Its own summit appears at its own end. **Nothing rolls back.** |
| Extend (+5/+10/+15 or Keep going in-block) | the climb gets longer (`lenM` grows). Position is continuous, the crest moves away out of sight, and nothing jumps. |
| Open-ended block | moves at the pace. Every 60 focused minutes is a climb (mini summit, next climb). Clock out keeps progress. |
| Time logged by hand or via the plain timer (no focus mode) | does not move the mountain. Only focus mode climbs. |
| Daylight scene | the mountain still advances (it's study, not a scene). Daylight just doesn't draw it. |

### 6.2 Data and API (for the coder; planner to confirm)

```ts
// src/domain/types.ts: AppData schema v3
export interface MountainState {
  seed: number;          // 0x5157
  stage: number;         // index of the current/last climb (0-based); increments at each block start
  posM: number;          // climber position along the trail, metres (persisted at block end / clock out / every 60 s while focusing)
  altM: number;          // altitude, metres, at posM (derived from trail geometry, stored for the HUD and stats)
  stageStartM: number;   // where the current climb started
  stageStartAltM: number;
  fromSummit: boolean;   // current climb began in a col after a summit (adds the prefix geometry)
  atSummit: boolean;     // the last climb completed
  summits: number;       // completed climbs (shown as "Climb N" = summits + 1 during a block)
}
// AppData.mountain: MountainState   (default { seed: 0x5157, stage: 0, posM: 0, altM: 0, stageStartM: 0, stageStartAltM: 0, fromSummit: false, atSummit: false, summits: 0 })
```

- **Migration v2 → v3:** add the default `mountain`. Optional nicety: seed `summits` with the count of past completed focus blocks (if derivable) so long-time users don't start at Climb 1. `validate.ts` checks the field types and non-negative numbers. Export and import carry the field. CSV doesn't.
- **Engine API:** add one optional method to `SceneEngine` (`types.ts`); Daylight ignores it:
  ```ts
  setClimb(c: { stage: number; stageStartM: number; stageLenM: number; posM: number;
                fromSummit: boolean; summits: number }): void;
  ```
  `setProgress(p)` still drives the sky and the meander.
  - `FocusController` computes `posM = stageStartM + focusedMs/1000 · 0.24` on every progress tick and calls `setClimb`.
  - It persists `posM` and `altM` at block end, at clock out, and every 60 s while focusing. Throttled, and the existing storage debounce applies.
- **On block start:**
  - `stage += 1`;
  - `fromSummit = atSummit`;
  - `stageStartM = posM` (plus the prefix length if `fromSummit`, since the col bottom is the start);
  - `atSummit = false`;
  - store `stageStartAltM`.
- **Reload mid-block** renders directly from `setClimb` (pure geometry plus the snap rule). **Reload after a completion** renders the summit (`instant`).

---

## 7. Reduced motion, performance, DPR

### 7.1 Reduced motion (`prefers-reduced-motion` or the in-app override)

There's no rAF loop. Each redraw is a still frame: the **hold pose**, the camera set directly (no filter, with the end clamp still applied), and the chains solved to rest. There are no particles, no cloud drift and no idles.
- **Redraw cadence:** every **15 s** while focusing, or immediately on a phase change or resize. Each redraw is a hard cut. The figure stays at the same screen spot, so only the ground and the ranges change (about 430 px of ground at 1440).
- The climb strip (metres + meander) and the timer carry second-by-second progress.
- **Summit:** a 400 ms cross-fade to the final summit frame.
- **Next climb:** a cut to the col.
- **Break:** the seated still.

### 7.2 Performance

**Target:** ≥ 30 fps headless at 1440×900 @2 (back-buffer capped by DPR 1.5), with average draw ≤ 5 ms and no frame > 25 ms after the first. Frame cadence stays as it is now: 30 fps, 60 during the summit and next-climb beats, 15 when unfocused, 0 when hidden.

| Per frame | Budget (ms) |
|---|---|
| Sky band + sun rings + stars (fills and strokes) | 0.3 |
| Range and cloud-bank strips (4 `drawImage` with fractional offsets) | 0.8 |
| Front cloud masses (3 `drawImage`) | 0.3 |
| Slope: black body fill + fleck/stone/tuft paths for the visible chunks (`Path2D` in H units under a camera `setTransform`) | 0.8 |
| Boulder sprite (1 rotated `drawImage`) + contact arc | 0.3 |
| Figure: ~14 `addPath`, 6 group strokes and fills, ~40 contour strokes in one batched path per group, 1 `destination-in` fill, 1 clipped stroke, 1 blit | 1.8 |
| Chains (2 flaps + fillet, 3 links, ≤ 3 substeps) + gait solve (4 two-bone IK + 1 bisection) | 0.3 |
| **Total** | **≈ 4.6** |

**Caches:**
- **Strip bitmaps** (far range, cloud bank, mid range, near range): each is `w + 2·margin` wide (margin 0.5 w). Re-render a strip only when its parallax offset passes `margin/2` (about every 60–300 s), or on a palette step (staged: at most one strip per frame, double-buffered, with the existing staged-rebuild generator kept).
- **Cloud mass bitmaps:** one per mass, rebuilt on a palette step (staged).
- **Boulder sprite:** a disc with ragged outline noise (± 0.006 R), **rim flecks** (90–110 short ochre strokes tangent to the outline, 1–6 px inside the edge, denser on the lower half) and 4–5 interior chips. Built once per size at 2× and rotated with the stone, so rolling reads clearly. Plus a non-rotating world-frame contact arc: a broken ochre arc, 200°–340° of the outline, `LW.fleck`. That separates the black stone from the black slope.
- **Slope chunks:** `Path2D` geometry per 8 H of trail (body polygon + fleck path + stones + tufts), built lazily, LRU of 8. Each chunk takes ≤ 1 ms to build, at most one per frame.
- **Figure part paths:** module-level, keyed by rounded `Hpx`.

**First-frame hitch** (review: 216–315 ms). The cause was the synchronous `ImageData` noise texture, strata and every cache built at mount. The fix:
- the noise texture is deleted;
- mount builds only the trail LUT for the current stage (module-cached by stage key), the boulder sprite, the figure part paths and the visible slope chunks;
- the sky is plain fills;
- strips and clouds build staged over the next 4–6 frames, under the existing 600 ms overlay fade-in, so they never visibly pop.
- **Target first frame ≤ 40 ms** headless at 1440×900 @1.5.

**DPR:** `min(1.5, dpr)`, a 2.1 MP back-buffer cap (1.3 MP above 3 MP of CSS area), unchanged. Line widths are CSS px times the scale.

**Quality tiers** (the existing trigger, a 90-frame average > 22 ms):
- **0.75:** drops the fillet, birds, star twinkle and hold idles, and cloud drift updates every 2nd frame;
- **0.5:** drops the contour lines on far limbs, the cloud swirls (strips rebuilt without them) and the incision clip stroke (the halo-only path is kept), and the chains run 1 substep.

---

## 8. What to delete and what to keep

**Delete** (code and tests):
- **The light model:** `light.ts` (`LightState`, `LIGHT_STOPS`, `NIGHT_LIGHT`) and every consumer: key highlight, terminator, bounce, **rim** and edge-light passes (`drawEdgeLight`, `rimLayer`), cast shadows and contact AO (`drawShadow`), the sun glow and rays.
- **The grade:** the vignette, the soft-light wash, `grade()` and `gradePalette` in this scene.
- **Haze bands**, lit ridge tops and snow caps (`snowEdge`, `drawRange`'s haze and snow parts).
- **Strata, ledges, joints, gullies, scree and the detail `ImageData` texture** (`buildDetail`, `drawSurface`, `surfaceDetail`).
- **The foreground blurred rocks** (`foregroundRocks`, `buildForeground`).
- **Boulder mottling, pits, cracks, lichen and the ghost crescent** (`buildBoulderTexture`'s contents).
- **Dust puffs** (the radial sprite); grit chips replace them.
- **Wind streaks**, camera drift (`cameraDrift`) and hair wisps.
- **The free IK treadmill gait:** `footTarget` slip, `hipH`/`surge`/`leanDeg` sines, `pelvisOffset`, `solvePush`.
- **Big-slip foot slides.**
- **The round-2 roll-back sequence.**
- **On-screen false summits, benches, bench cairns and the milestone beat**, plus `benchProgressMap` for this scene. The user doesn't want to see milestones ahead.
- **On-screen summit, twin and arête during a block** (the coder has already been told to stop that work). `backSide` survives only as a reference for the summit back side in §5.1.

**Keep:**
- `noise.ts` and `mulberry32`;
- `twoBoneIK` and `reach`;
- the turtle walk, heading low-pass fillet and offset-curve `centreAt` from `buildRidgePath` (re-specced in `trail.ts`);
- `monotoneCubic` (keyframe interpolation);
- `rangeSkyline` (background ranges, recoloured flat);
- `chain.ts` (cloth and fillet);
- `wind()` and the seeded breathing from `motion.ts`;
- `birdSchedule` (birds become black strokes);
- the phase and sequence framework, staged rebuilds, quality tiers, the hidden-tab stop and the frame cadence;
- `solveStand` and `solveSit` (re-proportioned);
- the summit ledge idea (`summitLayout` rules: the back foot inside the lip, the stone R + 0.25 H beyond the pelvis).

**Cairns** survive only on the summit: a small black stack (3 stones, 0.22/0.16/0.10 H wide), each with a 1.25 px ochre top edge, and the top stone filled `cream` once that summit is reached.

---

## 9. Coder milestones (A0–A4)

The scene code is all in `src/focus/scenes/`. Each milestone says which files are rewritten (R), replaced (→ new file), deleted (D) or kept (K).

### A0: Flat black-figure foundation (static layers)

**Files:**
- `palette.ts` R: ART stops + OKLab mix + the paused desaturate. `artPalette.ts` is new (or folded into `palette.ts`).
- `light.ts` D, `light.test.ts` D.
- `sisyphus.ts` R, sky and land parts: delete `drawShadow`, `drawEdgeLight`, `buildDetail`, `drawSurface`, `surfaceDetail`, `buildForeground`, the vignette and grade, sun glow and rays, `drawStreaks`. Rewrite `drawSun` (disc + rings), `buildCloudMasks`/`buildClouds`/`drawClouds` (scalloped two-tone + swirls), `drawRange` (flat strips) and `buildBoulderShape`/`buildBoulderTexture`/`drawBoulder` (sprite + rim flecks + contact arc).
- `ambient.ts`: delete `cameraDrift`, keep birds and rects.
- `ridge.ts`: delete `foregroundRocks`, `snowEdge`, `rockRadius` and `circleHitsBox`, if unused.

**Acceptance:**
- `grep -E "createLinearGradient|createRadialGradient|shadowBlur|filter\s*=|soft-light|overlay"` in `src/focus/scenes/` (excluding `daylight2d.ts`) returns nothing.
- Screenshots at p = 0, 0.5, 0.95 and the summit show a flat terracotta → ember → dusk sky, two-tone swirl clouds, and three flat ranges, lighter with distance.
- The boulder is black with rim flecks that **rotate** with the stone (a 2-frame diff at different rotations differs only within the disc).
- The HUD course line has a cartouche, with ≥ 4.5:1 measured.

### A1: The endless trail, tracking camera, climb state

**Files:**
- `trail.ts` is new: stage geometry, LUT, `centreAt`, surface-detail hashing, chunks. It reuses the turtle/fillet/`centreAt` code moved out of `ridge.ts`. `ridge.ts` shrinks to `rangeSkyline` + `monotoneCubic` + the turtle helpers.
- `camera.ts` is new: `Hpx`, anchor, the tracking filter, the end clamp, summit framing.
- `path.ts` K for Daylight only (`layoutFor`, `sunPosition` stay for it). Sisyphus uses `camera.ts` and its own `sunPos`.
- `types.ts`: add `setClimb`.
- `SceneCanvas.tsx` / `FocusController.tsx`: compute and pass the climb, and persist.
- `src/domain/types.ts`, `migrate.ts`, `validate.ts`, `storage/defaults.ts`: schema v3 `mountain`.
- `FocusHud.tsx` + CSS: the climb strip (metres + meander).
- Tests: `ridge.test.ts`, `scenes.geom.test.ts` and `summit.test.ts` R for the new geometry.

**Acceptance:**
- `Hpx ≥ 0.22·h` at 1280×800, 1440×900 and 1920×1080. ≥ 0.16·h on 390×844.
- **The end is never on screen during focus:**
  - for p sampled every 0.5% from 0 to 1 at all four viewports, no trail point with heading < 14° lies inside the viewport;
  - the crest fillet start is ≥ 0.3 H beyond the right edge;
  - no range peak rises above the slope's skyline ahead of the stone.
- **Visible progress:** at 1440×900 the ground features move ≥ 20 px per real second on average while focusing (25- and 50-minute blocks alike).
- **Determinism and continuity:**
  - same `MountainState` gives an identical frame;
  - extending a block never moves the climber backward;
  - clock out mid-block and then a new block resumes at the same `posM` with no col prefix;
  - completing a block gives `fromSummit` and the col prefix, with the previous summit's back side matching across the stage seam (C0 continuity, heading jump < 1°).
- Migration v2 → v3 is covered by tests; import/export round-trips `mountain`.
- The climb strip shows altitude and the meander. The meander's active unit grows visibly within 10 s.

### A2: The black-figure Sisyphus (construction + key pose)

**Files:**
- `figure.ts` → `figureArt.ts` (part `Path2D`s in bone space, groups, contour lines, incision layer). `figure.test.ts` R.
- `rig.ts` R: keep `twoBoneIK`/`reach`. New proportions (§3.1). `solveHold` (the key pose), `solveStand` and `solveSit` re-proportioned. Delete `solvePush`, `pelvisOffset`, `footTarget`, `hipH`, `surge`, `leanDeg`, `handAngles`.
- `chain.ts` K: the loincloth flaps + fillet. Delete the hair-wisp use in `sisyphus.ts` (`drawHair`), and rewrite `drawCloth`.

**Acceptance:**
- The hold pose at θ = 22° matches §3.6: lean 20 ± 2°, front knee 90 ± 8°, rear knee ≥ 165°, elbows ≥ 165°, head centre below the shoulder → hand line.
- **Boulder–hand contact:** each palm centre is within **2 px** of `R + palm` from the stone centre at 1440×900.
- **No limb self-intersection:** for each limb, its two bone segments don't cross, and knee and elbow interior angles stay in [35°, 179°]. No figure joint other than the hands is inside `R + 0.02 H` of the stone centre. The feet don't penetrate the ground (≤ 0.5 px).
- The three negative shapes (§3.6) are open: a flood fill from a point in each finds sky.
- A silhouette screenshot shows incision lines only over black (sampling 20 points on the outer outline over sky finds no ochre).
- The figure layer composite costs ≤ 2 ms average.

### A3: The push cycle

**Files:**
- `motion.ts` → `gait.ts`: step scheduler, keyframe tables, foot-lock, swing FK→IK, boulder spring, strain beat, idles, micro-variation. It keeps `wind()` and breathing. `motion.test.ts` R.
- `sisyphus.ts` R: `advanceGait`/`pushPose` call `gait.step`/`gait.pose`. `updateCamera` and `setCam` use `camera.ts`. The particles become grit chips (delete the dust sprite).

**Acceptance** (a headless frame-sequence harness on pure `gait` + `trail`: 120 s at 1/30 s, at 1440×900 scale, for 25- and 50-minute paces, slopes 16–32°):
- **Foot-lock:** every frame where a foot is flagged planted, its ball point moves **< 1 px** relative to the ground (world coordinates × `Hpx`).
- **No rolling without travel:** with `Dtarget` frozen (pause), the stone's rotation changes by < 0.1° per second outside strain beats. Over the run, `boulderRot · R` equals the stone centre's arc length within 0.5%.
- **Period:** step pair duration 1.6–2.2 s at 18–26°. Debt stays within ±2σ apart from snaps.
- Pelvis vertical velocity is ~0 at contact. The pelvis height minimum falls within u 0.85–0.95.
- The head-pitch lag (cross-correlation) is 80–120 ms behind the torso lean.
- Elbow interior is ≥ 155° outside strain beats and dips by 6–14° within 0.25 s of each push-off.
- A strain beat happens in the first 2 minutes (seeded), and the stone returns to within 0.5 px of its pre-slip position.
- The A2 contact, intersection and penetration checks hold on every frame.
- A 12-frame sheet at 150 ms shows: hold → push-off (rear heel up) → passing (knee forward, clear negative space) → reach → contact. The reviewer judges "not weird".

### A4: Summit, break, next climb, reduced motion, performance

**Files:**
- `sisyphus.ts` R: `startSeq` sequences for summit (§5.2), next climb (replacing `rollback`), mini summit, and the break pose. `standPose`/`sitPose` updated. `drawBirds` restyled as black strokes. `skyState` R for ART stops, stars and the moon.
- `daylight2d.ts` K (untouched).
- `index.ts`/`meta.ts` K.

**Acceptance:**
- **Summit:** the crest appears only after `setPhase('complete')`. The final frame shows the ledge, the cairn, the back side and the next incline's start. The figure ≥ 15% of h. The stone rests on the ledge (gap ≤ 1 px, the round-3 T1 class). The figure doesn't overlap the stone except the resting palm (T3 class).
- **Next climb:** after Keep going, the stone rolls forward into the col and the gait resumes within 3.2 s. `stage` increments. Nothing rolls back to an earlier position.
- **Break:** seated pose, night palette, pre-dawn band in the last 15%.
- **Reduced motion:** no rAF; redraws every 15 s and on phase changes; hold pose; summit cross-fade 400 ms.
- **Performance** (headless Chromium, software): ≥ 30 fps at 1440×900 @1 and @2. Average draw ≤ 5 ms. Max after warm-up ≤ 25 ms. **First frame ≤ 40 ms.** 390×844 @3 ≥ 30 fps. Hidden tab renders 0 frames.
- **Screenshots** for the reviewer: p = 0, 0.25, 0.5, 0.75, 0.98 (the clamp engaged), summit at 1 s / 3 s / 6 s, overtime, break, next climb at 0.8 s / 2 s, phone portrait at p 0.5 and the summit, all in `docs/screenshots/round3-art/`.
