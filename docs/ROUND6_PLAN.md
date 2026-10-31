# StruggleMore round 6: a photographic, fine-art Sisyphus

Owner: planner · Status: v1, for the designer and the coder · Branch `round6` (from `round5` at bca643b)

**The user's words (round 6):** *"Look at how this [reference] is — the current design looks too animated and fake, lines all over the place. Have the entire redesign be like this and make sure it is done really well and artistically."*

**In one line:** throw away the black-figure vase look (flat ochre fields, outline strokes, swirl clouds, sun rings, tent mountains). Replace it with a **monochrome, sepia-toned, photographic** scene rendered procedurally on the GPU. A small, softly modelled human figure pushes a huge cratered stone sphere up the crest of a massive fractured cliff, under a mottled overcast sky, with grain, vignette and print toning. **The round-5 motion engine is kept**: one distance clock `D`, foot lock, a forward roll by `arc/R`, a rigid camera, a hidden summit and persistence. Only its size constants and the renderer change.

**Reference:** `scratchpad/ref6/reference.png` (1106×946) and `reference-figure-3x.png`. It is a **mood and style reference only**. Nothing from it is copied, traced, sampled into a texture or committed. Every pixel the app shows is generated from seeded noise and geometry at runtime.

**Repo rule for this round:** no image files are committed. That includes screenshots, which go to the session scratchpad and are linked from the review doc, not checked in. No binary assets and no new npm dependencies. The shaders are TypeScript string constants.

---

## 0. Decisions at a glance

| Question | Decision |
|---|---|
| Look | Monochrome luminance scene, then one **print pass**: tone curve → sepia toning ramp → grain → vignette → paper. No hue anywhere except the toning. |
| Renderer | **WebGL fragment shaders** (GLSL ES 1.00, so one code path runs on a WebGL2 or a WebGL1 context), with a reduced **Canvas 2D fallback** (§3.8). |
| What the engine produces | `sisyphus.ts` keeps the clock, the camera and the set pieces, and emits a plain **`FrameModel`** per frame. A `Renderer` (GL or 2D) draws it. The tests run on the `FrameModel`. |
| Composition | The ridge is a long diagonal from lower left to upper right at the trail's 16–32° heading (typically ≈ 24°). The **cliff mass fills about half the frame** below it, and the sky fills the rest. The figure and stone sit just right of centre on the crest. |
| Figure scale | Standing height `H`: landscape **0.17·h** (153 px at 900 h). Portrait **min(0.13·h, 0.30·w)** (110 px at 390×844). That is about half of round 5 and close to the reference's 14–16%. |
| Stone | `R = 0.75 H` (Ø = 1.5 × his height; the reference measures 1.5–1.6). It is lunar: cratered, mottled albedo, soft terminator, lit from the upper left. The texture rotates by `+rot` (clockwise) with the **lighting fixed**. |
| Figure rendering | **2.5D ray-cast round cones** (tapered capsules with real depth) plus a few muscle ellipsoids, smooth-blended per pixel. Lambert with wrap lighting from the same key light, soft self-shadow and AO, and no outline anywhere. |
| Motion | Unchanged from round 5 (`walk.ts`): `L`, `β`, `T = 3.0 s`, foot lock, `Ḋ = v·e(t)`, a rigid camera and `rot = centreArc/R`. Only `R`, `dS` (re-solved) and a few pose angles change (§4.4). |
| Speed | `PACE_H` unchanged in H/s, so on-screen ground speed halves with the smaller figure: **20 px/s** at 1440×900 and **15 px/s** on a phone. The rock texture makes that motion obvious every second. |
| Frame rate | 60 fps while climbing on a capable device and 30 otherwise, as now. GPU budget ≤ 6 ms at 1440×900 at DPR 1.5. |
| HUD | A serif (Fraunces, already loaded) in warm cream, with small caps and hairlines. The controls are quiet print-mat buttons. |

---

## 1. Reference analysis

All numbers were measured on `reference.png` with PIL. `L` is Rec.709 luma on 0–255. Positions are given as fractions of frame width (x) and height (y), with y down.

### 1.1 Composition

- **Frame:** 1106×946, aspect **1.17:1**, close to square. Our frames are 16:10 and 9:19.5, so we keep the *relationships* below, not the crop.
- **The ridge line** is the single dominant line. Measured crest heights:

  | x | 0.05 | 0.10 | 0.20 | 0.30 | 0.40 | 0.45 | 0.70 | 0.80 | 0.90 | 0.95 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | crest y | 0.70 | 0.70 | 0.68 | 0.63 | 0.57 | 0.54 | 0.38 | 0.32 | 0.26 | 0.24 |

  - On the left (x < 0.2) it is almost level, at about 3°. Then it is a steady incline of **≈ 25–28° in pixel space**, slightly convex near the figure, flattening to ≈ 22° at the far right.
  - The line enters around y 0.70 on the left and leaves around y 0.23 on the right. **It cuts the frame into two triangles of almost equal area: 51% of pixels are rock** (`blur12(L) < 115`).
- **The thirds:**
  - The stone's centre is at **(0.60, 0.315)**, almost exactly on the upper-right third intersection (0.67, 0.33).
  - The figure's feet are at x 0.45–0.51 and y 0.53, near the centre.
  - The empty sky upper-left (x < 0.45, y < 0.5) is **≈ 28% of the frame and holds only the two birds.** That negative space is what makes it read as art: the struggle is small against a large empty sky.
- **Scale:**

  | Element | Measured size |
  |---|---|
  | Stone | Ø ≈ **228 px = 0.206 W = 0.24 H**; top at y 0.19, bottom at y 0.437. |
  | Figure, in pose | Crown at y 0.393 to the rear foot at y 0.534: **≈ 133 px = 14% of frame height**, bent. Standing, it would be ≈ 150 px (16%). |
  | Ratio | Stone Ø : standing height ≈ **1.5 : 1**. |
  | Birds | Wingspan ≈ 40–50 px (≈ 4% of W), at (0.30, 0.21) and (0.20, 0.29). |

- **Placement:**
  - The figure is downhill of the stone. The stone sits on the crest about 1.2 standing heights uphill of the feet, so **the stone's bottom is level with his shoulders**. On a 25° slope the stone is *above* him: the image's weight is overhead.
  - The hands meet the stone at polar angle **≈ 225–230°** (y-up), in its lower-left quadrant.
- **Depth:** there is none beyond the sky. There are no distant ranges, no foreground props and no sun. This is two planes: the cliff and the sky. The figure and stone are the only things on the crest.
- **Reading order:** the bright sky band along the ridge leads the eye from lower left up the crest to the stone. The stone is the brightest solid object and the largest dark-to-light transition. The eye then drops to the small figure.

### 1.2 Tone

- **Range: there is no true black and no true white.**
  - Percentiles of L: p0.5 **19**, p1 21, p5 31, p10 36, p25 55, p50 **118**, p75 166, p90 184, p95 196, p99 208, p99.5 **211**.
  - So the print's black point is ≈ 0.075 and its white point ≈ 0.83. That compressed range is the matte, aged-silver-print feel.
- **The histogram is bimodal** (16 bins over 0–255, % of pixels):
  `0.1, 5.7, 14.5, 9.8, 7.6, 5.5, 4.8, 6.2, 8.0, 8.4, 12.2, 10.7, 5.6, 0.9, 0, 0`.
  - A rock lobe peaks at L 32–48.
  - A sky lobe peaks at L 160–192.
  - A shallow trough at L 80–112 holds the stone, the lit rock edges and the figure.
- **Tone by region:**

  | Region | L mean | sd | p5–p95 | Mean RGB |
  |---|---|---|---|---|
  | Sky, top band (y < 0.10) | 146 | 22 | 113–185 | (156,143,129) |
  | Sky, mid | 161–167 | 11 | 140–185 | (175,162,149) |
  | Sky, luminous band above the right crest | **192** | 14 | 168–213 | (200,191,174) |
  | Cliff, lit faces (right) | 66 | 30 | 31–125 | (72,65,55) |
  | Cliff, shadow slot (centre) | 74 | 29 | 35–126 | (80,73,61) |
  | Cliff, bottom-left corner | **31** | 16 | 17–66 | (33,31,27) |
  | Snow/scree patch | 111 | 57 | 35–186 | (117,110,101) |
  | Stone | 121 | 47 | 37–184 | (130,119,103) |
  | Figure | ≈ 60–110 (shadow side), ≈ 150 (lit back and shoulder) | | | |

- **Where the darkest and lightest are:**
  - **Darkest:** the bottom-left corner of the cliff (vignette plus shadow), the deep cleft under the crest left of the figure, and the stone's lower-right core shadow (L ≈ 45).
  - **Lightest:** the stone's lit left limb (L ≈ 200), the sky band hugging the crest on the right (≈ 200–213), and the snow patch (≈ 186).
  - The brightest sky sits **against** the ridge, so the crest silhouette has its maximum contrast exactly where the climb happens. The upper sky is darker (burned in).
- **The contrast curve:**
  - Strong global separation between rock and sky (≈ 4:1 in L).
  - **Compressed within each lobe**: the sky's sd is only 11–14, while the rock carries its contrast as *local* texture (sd 30–36).
  - Shadows have a long, soft toe (no crushed blacks). Highlights roll off with a shoulder before 0.83.
- **Toning:** a warm sepia that varies with value (a split tone). The colour of each L band:

  | L band | Mean RGB | R−B | G−B |
  |---|---|---|---|
  | 0–40 | (35,31,25) | 10 | 6 |
  | 40–70 | (59,53,44) | 15 | 9 |
  | 70–100 | (90,83,71) | 19 | 12 |
  | 100–130 | (126,115,102) | 24 | 13 |
  | 130–160 | (157,144,129) | **28** | 15 |
  | 160–190 | (185,173,160) | 25 | 13 |
  | 190–220 | (208,200,184) | 25 | 16 |

  - Darks are a near-neutral warm grey. **Mids are the warmest.** Highlights turn creamy (G rises relative to B).
  - The mean chroma (max − min channel) is only 21, p95 30. It is barely coloured, which is why it reads as a toned photograph rather than an orange illustration.

### 1.3 Light

- **The key is soft overcast, from the upper left, at moderate elevation.**
  - On the stone, a horizontal profile through the centre runs: left limb ≈ 199 → 140 (¼ across) → 125 (middle) → 100 (⅗) → 55 at the right limb.
  - A vertical profile runs ≈ 165 at the top → 150 → 80 (70% down) → 40 at the bottom.
  - Fitting Lambert gives a light direction of about **(−0.55, +0.45, 0.70)** in screen x-right, y-up, z-toward-viewer.
  - The terminator is very **soft** (a wide penumbra spanning ≈ 35% of the radius). There is no specular and no hard cast shadow.
- **The sky is a light source too:**
  - There is a luminous band low along the ridge on the right, as if brighter sky sits beyond the cliff.
  - It gives a faint **edge glow** where the crest and the stone's top meet the sky. A thin, slightly lighter halo, 2–4 px wide, separates dark rock from sky, typical of an aged print or a composite.
- **On the cliff, light catches upward- and left-facing edges:** ledge tops and the left edges of fractures. Vertical clefts facing right fall into deep shadow.
- **On the figure,** the back, shoulders and the top of the near thigh are lit. The chest and belly facing the stone are in shadow. That is exactly what the soft upper-left key predicts.

### 1.4 Texture, element by element

**Sky:**
- **Large, soft overcast masses:**
  - Stratocumulus, horizontally stretched (about 2.5:1).
  - Low contrast: L sd of the 3–40 px band-pass ≈ 5–8, against 22 for the rock.
  - Darker billows in the upper third, a lighter rift diagonally through the middle, and the brightest sky near the crest on the right.
- **Mottling at two scales:** cloud forms at 1/4–1/2 of the frame, and a finer blotchy "emulsion" mottle at about 1–3% of the frame.
- **Print damage:** faint light hairline scratches and crackle in the upper left, a few pale specks, and slight unevenness. Very low amplitude (ΔL ≈ 4–10), and **static**, because they belong to the paper.

**Cliff:**
- A massive near-vertical wall seen almost frontally below the crest.
- **Fracture structure:**
  - Strong **vertical cleavage**: elongated slabs and fissures running from top to bottom, tilted about 70–85° from horizontal.
  - Cut by sub-horizontal **ledges and joints** every 3–8% of the frame height.
  - The rock texture's band-pass sd is **≈ 22** at the 3–40 px scale and 11 at the 1–3 px scale: high-frequency crispness that the sky lacks.
- **Big forms:**
  - One very dark vertical **gully or shadow slot** under the figure (x 0.55–0.65), widening downward.
  - Buttresses either side.
  - A thin **lighter lip** right at the crest, where the top surface catches the sky.
  - A **snow or scree slab** at the lower left (x 0.18–0.30, y 0.70–0.88), a bright wedge (L up to 186) with a hard top edge and soft streaks below.
- **Value:** the rock is mostly L 30–70, with lit fracture edges reaching 120–145.

**Stone:**
- **Lunar:**
  - A mottled albedo with darker "maria" patches;
  - many small craters (from 1 to 5% of the radius) with darker bowls and lighter rims;
  - scattered pits;
  - a few larger shallow depressions (10–15% of R).
- **The limb** is slightly ragged and lighter on the lit side (rim brightening), not a perfect vector circle.
- **The bottom-right quadrant** is a deep core shadow (L ≈ 45) with almost no bounce light, so the texture disappears into it.
- There is a faint lighter rim of sky between the stone and the ground. That's a compositing artefact: **we must not copy it**; we give a real contact (§5.4).

**Figure:**
- **A realistic adult in profile, facing right, at about 7–7.5 heads.** No lines at all.
- **Form** is shown only by soft value modelling: a lit back, shadowed front, a darker head of hair, and slight motion softness.
- **Pose, joint by joint** (measured):

  | Joint | Pose |
  |---|---|
  | Head | Bowed forward and down, almost between the arms, face hidden. |
  | Torso | Fairly upright, leaning ≈ 15–25° forward from the hip, with a slight arch in the lower back. |
  | Arms | Nearly straight, almost horizontal (elevation 0–10°), reaching from the shoulder to the stone's lower-left quadrant. |
  | Hands | Flat on the stone, small. |
  | Front leg | A deep lunge: the thigh is almost horizontal, the knee ≈ 90°, the shin near vertical, the foot flat on the crest. |
  | Rear leg | Long and straight, a diagonal ≈ 25–30° from vertical, driving from the ball of the foot with the heel lifted. |

- **Silhouette readability is excellent** even at 133 px. The open triangle between the legs, the gap under the arms and the bowed head all read against the bright sky.

### 1.5 Atmosphere and depth

- Almost no aerial perspective, because there is no distance. The only depth cue is that the **upper rock near the crest is slightly lighter and lower in contrast** than the base of the cliff (haze against the bright sky), and the bottom of the frame is heavier (vignette plus shadow).
- The birds are small, dark and slightly soft: they are far.

### 1.6 Photographic artefacts

- **Grain:**
  - Fine and soft: the autocorrelation of the high-pass in the sky is 0.78, 0.47, 0.20 and 0.02 at 1, 2, 3 and 4 px, so the **clumps are about 2–3 px** at this resolution.
  - The amplitude is **σ ≈ 2.2–2.9 L** in the sky's 1–3 px band. It's stronger in the midtones and nearly invisible in the deepest darks.
  - It's not coloured.
- **Vignette:**
  - Corners are darker by **≈ 30–35%**: top-left sky ≈ 105–111 against 165 mid-sky.
  - The top band is darker than the middle (a burned-in sky), and the bottom-left corner is the darkest region.
  - The vignette is **asymmetric**: heavier on the top and left, with the top-right glow left alone. It's a hand-burned print, not a lens falloff.
- **Softness:** the whole image is slightly soft (no 1-px detail). The figure looks a touch motion-blurred.
- **Paper:** faint crackle, scratches and foxing specks, plus a very low-frequency unevenness of tone (±3%).
- **Toning:** a warm split tone (§1.2), with **no colour noise.**

### 1.7 Why it reads as *art* and not *animation*

1. **One light, honoured everywhere:** the same upper-left soft key models the stone, figure and rock. Round 5 had no light at all, only flat fills.
2. **Value structure over line:** forms are described by tone and texture, never by outlines. **There is not a single drawn line in the reference.**
3. **A compressed, toned range and grain:** the eye accepts it as a physical print. Flat RGB fills with pure black (`#141010`) and saturated orange scream "vector".
4. **Scale and emptiness:** the figure is small, the stone big, and the sky large and empty. The struggle is quiet.
5. **Natural irregularity:** fracture noise, mottled clouds and a cratered sphere, with no repeated stamps, spirals or symbols.
6. **Stillness:** the image is still. Our scene moves, but slowly and without cartoon secondary motion (no flapping cloth, no swirls, no twinkle, no ring pulses).

---

## 2. What is wrong with the current (round 5) look, specifically

Compared against `round5-shots/p05-desktop.png` and `crop4-final.png`:

| # | Current | Why it reads fake |
|---|---|---|
| W1 | Saturated orange sky `#B95A2C`-ish, flat. | It's a hue, not a tone. The reference sky is a mottled warm grey with L 146–192 and chroma < 30. |
| W2 | Tent-shaped mountain ranges in flat ochres and browns. | They're geometric, stylised and repeated. The reference has no distant ranges at all. |
| W3 | Cumulus as circle unions with **spiral swirls** and outlines. | Decorative symbols ("lines all over the place"). Real overcast is soft, mottled and edgeless. |
| W4 | A sun disc with **concentric rings**. | A graphic icon. Overcast light has no visible sun. |
| W5 | The slope is a **flat black wedge with ochre dashes** and tufts. | No mass and no material. It should be a cliff face with fractured rock, ledges and light. |
| W6 | The figure is a black silhouette with ~90 **ochre contour strokes**, a beard, curls and a fillet. | A vase painting. The user explicitly rejects lines. It needs a realistic body modelled in light. |
| W7 | The figure is huge (Hpx 0.33 h, 29% of height); the stone is Ø 1 H, black, with ochre strata, comet chips and notches. | Too big, so there's no negative space. A flat disc with graphic marks has no volume. |
| W8 | No light direction anywhere; pure flat fills. | Nothing has form. |
| W9 | No grain, toning, vignette or softness: crisp vector edges at DPR resolution. | It reads as a UI illustration. |
| W10 | Secondary motion tuned for a cartoon (beard swing, ringlets, cloth flaps, star twinkle). | Adds busyness. The reference is still and dignified. |

**What is right and stays:** the walk's mechanics (foot lock, constant speed, a forward roll matched to the ground), the endless incline and hidden summit, persistence, and the HUD's calm structure.

---

## 3. Rendering strategy

### 3.1 Options evaluated

| Option | Realism | Performance | Risk | Verdict |
|---|---|---|---|---|
| **A. Canvas 2D with offscreen noise textures** (rock and sky baked into canvases, the stone as a rotated pre-lit sprite, the figure as gradient-filled paths) | Medium-low. You can't relight a rotating stone; a rotated pre-lit sprite also rotates its lighting, which reads as a spinning disc. Baked rock must be re-baked as the camera moves (CPU `ImageData` at about 1 MP is 30–80 ms). Grain needs a full-screen `ImageData` composite or a blend pass. | Poor at DPR 1.5 with per-pixel work. Fine if everything is pre-baked, but then nothing has light. | High risk of "cheap". | Fallback only. |
| **B. WebGL fragment shaders for everything** (sky, cliff, stone, figure and post as full-screen or quad passes) | High. Per-pixel fBm, ridged and cellular noise, normals from height fields, true sphere shading with texture rotation independent of the light, a ray-cast figure, a proper tone curve and grain. | Good: a laptop iGPU does 1–2 MP at < 5 ms with sane octave counts and caching. | Medium: GLSL precision on phones, context loss, and testability. | **Chosen.** |
| **C. Hybrid**: GL backgrounds and post, figure in Canvas 2D uploaded as a texture each frame | Medium. A 2D figure has no per-pixel normals; gradients fake it poorly. | A per-frame `texImage2D` of a ~400×400 canvas costs about 0.3–1 ms. | Two pipelines. | Rejected; the figure goes in GL (§4). |

**Why B:**
- The three things that make the reference read as a photograph all need per-pixel computation every frame or per tile: (1) a single light shading every form, (2) the stone's surface rotating *under* fixed light, and (3) a film-like tone, grain and vignette pass.
- WebGL is available on > 98% of browsers, including iOS Safari and Android Chrome.
- It's also the cheapest way to get softness: render the expensive passes below DPR and let bilinear upscaling plus grain hide it. The reference itself is soft.

### 3.2 Architecture

```
src/focus/scenes/
  sisyphus.ts        engine: clock D, envelope, camera, phases, set pieces → FrameModel (no drawing)
  frameModel.ts      NEW  type FrameModel { cam, viewport, ridge, stone, figure, sky, birds, tone, flags }
  render/
    renderer.ts      NEW  interface Renderer { mount, resize, draw(model), destroy, stats }
    glRenderer.ts    NEW  WebGL1/2 context, programs, FBOs, tile cache, passes (§3.3)
    shaders/*.ts     NEW  GLSL as template strings: common.glsl (hash, noise, fbm, ridged, voronoi), sky, cliff, stone, figure, birds, post
    canvasRenderer.ts NEW Canvas 2D fallback (§3.8)
    tone.ts          NEW  tone curve + toning ramp + per-phase grade presets (pure, testable)
    figurePrims.ts   NEW  skeleton → round-cone/ellipsoid primitive list (pure, testable)
```

- `walk.ts`, `poses.ts`, `trail.ts`, `camera.ts` and `noise.ts` stay pure.
- The engine stub (`testkit/engineStub.ts`) gets a **null renderer** that records each `FrameModel`. Every existing motion, roll and set-piece test runs on models, not pixels.
- Pixel checks (§10) run in headless Chromium, in the reviewer's harness.

### 3.3 Passes and their cost (1440×900 CSS, DPR 1.5 → about 2160×1350 device pixels; the budget is for a mid laptop iGPU)

| # | Pass | Resolution | Updates | Cost target |
|---|---|---|---|---|
| 1 | **Sky** → `skyFBO` | 0.5 × backbuffer | Every 2nd frame while climbing, every frame during set pieces. Cloud drift is ≤ 3 CSS px/s, so a 30 Hz update is invisible. | ≤ 0.8 ms |
| 2 | **Cliff tiles** → tile atlas | 256×256 device px per tile, at the current zoom | Only tiles newly entering the view, **≤ 1 tile per frame** (pre-fetched 1 tile ahead of the camera's motion). | ≤ 1.0 ms per new tile, 0 otherwise |
| 3 | **Composite**: sky, then the cliff tiles (with the ridge mask from the ridge texture), then the edge glow | full backbuffer | every frame | ≤ 0.8 ms |
| 4 | **Stone** | scissored quad of 2.3 R × 2.3 R | every frame | ≤ 0.6 ms |
| 5 | **Figure** | scissored quad around the figure's bounds plus 4 px | every frame | ≤ 0.8 ms |
| 6 | **Birds** | tiny quads | when visible | ≤ 0.05 ms |
| 7 | **Print pass**: tone curve, toning LUT, vignette, paper, grain | full backbuffer | every frame | ≤ 0.6 ms |
| | **Total GPU** | | | **≤ 4.6 ms typical, 6 ms worst (a tile frame)** |
| | **CPU** (walk pose, model, uniforms, the ridge texture upload) | | | ≤ 1.0 ms |

- **The scene is rendered into `sceneFBO` (RGBA8)** as a single channel of linear-ish *scene luminance* in R. The G channel carries a material id/mask, used by the print pass for grain amplitude and the edge glow; B and A are free. Only the print pass produces colour.
- **DPR:**
  - backbuffer `min(dpr, 1.5)`, with a total cap of **2.4 MP** (1.6 MP on phones: `max(w,h) < 900` CSS or coarse pointer);
  - sky and cloud pass at 0.5×;
  - tiles at 1× backbuffer;
  - stone and figure at 1× backbuffer (they need the crispness);
  - the slight upscale softness *is* the look.
- **Quality tiers** (the existing 90-frame average trigger):

  | Tier | Changes |
  |---|---|
  | **Q1** | Everything as above. |
  | **Q0.75** | Backbuffer ×0.8, sky every 3rd frame, cliff octaves −1, figure AO off, grain refresh halved. |
  | **Q0.5** | Backbuffer ×0.65, 30 fps cap, stone crater octaves −1, birds off, the paper texture baked into the post LUT. |

### 3.4 Coordinates, determinism and the endless ridge

- **World space is H units, y up, as now.** All procedural lookups use **world coordinates**, so the rock, the snow patches and the crater pattern are fixed to the world. Re-rendering a tile at the same world rect gives identical pixels: **deterministic and seamless.**
- **Precision:** a stage's world coordinates reach a few hundred H, and float32 is fine to about 1e-4 there. Still, pass `worldOrigin = floor(cam.pos / 64)·64` from the CPU (in double precision) and compute in the shader in `p = world − worldOrigin` (small numbers). Hash noise with `p + fract(worldOrigin / 289.0) * 289.0`; the 289-periodic permutation keeps it consistent across origin shifts. Require `highp` in fragment shaders when `GL_FRAGMENT_PRECISION_HIGH` is set, else drop to Q0.75's octave counts (mediump banding is less visible with fewer octaves).
- **Seed:** `seed = hash(MOUNTAIN_SEED, stage)`. Each climb (stage) has its own rock, while a reload at the same `posM` reproduces the identical frame.
- **The ridge silhouette = the trail.** This is critical, because the feet and stone stand on it.
  - The CPU fills a **ridge texture**: 1 × N (N = backbuffer width / 2), RGBA8, with the screen-y of the trail encoded in 16 bits (RG), sampled linearly. It's evaluated with `trail.groundY` at each column per frame (≈ 0.1 ms for 1080 columns; cache the binary-search bracket).
  - The shader reads `ridgeY(x)` and computes `depthBelow = y − ridgeY(x)` in pixels.
- **Crest roughness (visual only):**
  - The silhouette gets bites `rough(xw) ≤ 0`, as a 1D ridged noise in world x with amplitude 0.010 H, so the edge never rises above the walking line.
  - The amplitude is multiplied by a **contact window**, `1 − smoothstep(0.15, 0.6, |xw − x_feet|)`, and the same around the stone's contact. So the crest is exactly the trail under the feet and the stone (no floating, no sinking), and broken and rocky elsewhere.
  - Occasional bigger notches (one per ≈ 6 H, 0.03 H deep, 0.2 H wide) sit only outside both windows.
- **The cliff's face below the crest** is a height field `hf(p)` in world space (§6.2). It does not depend on the trail except for a "crest lip" term within 0.08 H below the ridge.
- **Hidden summit rule (kept):** the crest beyond `crestS − 0.3` is never in the frame during a block. The existing camera end clamp stays. The new composition shows *more* of the incline ahead, so the coder must **re-check that the clamp distance uses the new Hpx**.
  - Ahead of the stone's right edge: landscape ≈ **4 H** (stone edge at ≈ 0.57 w); portrait ≈ **0.8 H**.
  - The trail's crest geometry (`END_LEAD = 2.45 H`, crest fillet) may need `END_LEAD` raised so that the moment the clamp engages is still covered by the block-end beat. Rule: **the clamp must engage only in the last `END_LEAD/PACE_H` seconds of the block.** If it would engage earlier, raise `END_LEAD` in `mountain.ts`. That changes no persisted state, because `posM` is stage-relative.

### 3.5 Tile cache (pass 2), concretely

- **Tiles** are 256×256 device pixels, keyed by `(ix, iy, zoomKey, seed, qualityKey)`, where `ix = floor(worldX·HpxDev·zoom / 256)` and likewise `iy`.
- **Atlas:** one 2048×2048 RGBA8 atlas holding 64 slots, with LRU eviction. A typical 2160×1350 view needs 9 × 6 = 54 tiles. With a 1-tile prefetch in the camera's direction (+x, +y along the slope) the working set is about 60; phones need about 20.
- **Contents:** each tile stores the **rock luminance** (R) and the **rock normal's x and y** (G, B), for the edge glow and for pass-3 lighting tweaks. The ridge mask is *not* baked; pass 3 applies it per frame from the ridge texture, so roughness under the moving contact windows stays live.
- **Hold-off:** the camera scrolls at ≈ 30 device px/s, so a new tile column is needed every ≈ 8 s. The budget is trivial.
- **Zoom changes** (summit pull-back 1 → 0.62, next climb back to 1): during the transition, render the cliff **live** (no tiles) at 0.6× resolution, with octaves −1, inside the 60 fps set-piece window. Re-tile at the final zoom over the next frames, crossfading tile by tile. The set pieces already justify a heavier frame.
- **First frame:** render the visible tiles live in one pass (≈ 4–8 ms) and populate the atlas over the next 10 frames, under the existing 600 ms overlay fade-in. **Target first frame ≤ 60 ms**, shader compile included. Compile programs asynchronously when `KHR_parallel_shader_compile` is available; show the scene after the first successful draw.

### 3.6 The print pass (pass 7), exactly

The input is scene luminance `Ls ∈ [0, 1+]` (scene-referred, roughly linear, with the sky ≈ 0.7–0.9 and the rock ≈ 0.10–0.30).

```glsl
// 1. Exposure + tone curve (filmic toe/shoulder) → print density, then into [black, white]
float e   = Ls * exposure;                              // exposure per phase (§7)
float t   = e / (e + 0.18) * 1.18;                      // soft shoulder (Reinhard-ish), 0.18 → 0.5
t         = smoothstep(0.0, 1.0, pow(t, 1.10));          // toe + gentle S in the mids
float P   = mix(0.075, 0.830, t);                        // print black point ≈ L19, white ≈ L212
// 2. Vignette (asymmetric burn, §1.6): in normalised uv with aspect correction
vec2  q   = (uv - vec2(0.56, 0.52)) * vec2(aspect, 1.0);
float vig = 1.0 - 0.34 * smoothstep(0.35, 1.05, length(q * vec2(0.95, 1.10)))
                - 0.10 * smoothstep(0.55, 0.0, uv.y)       // burned top band (y-down uv)
                - 0.06 * smoothstep(0.45, 0.0, uv.x);      // heavier left
P *= vig;
// 3. Paper: low-freq tone unevenness ±3%, crackle/scratches/foxing (static, seeded, generated once into paperTex)
P = P * (1.0 + 0.03 * (paper.r - 0.5)) + paperMarks(paper.gba) * 0.035;
// 4. Grain: luminance-weighted, clumped (≈1.5–2 CSS px), monochrome
float g   = grainTex(uvGrain).r - 0.5;                   // tileable 256² blue-ish noise blurred 1px, generated on mount
float amp = 0.030 * (4.0 * P * (1.0 - P)) + 0.004;       // strongest in mids: σ ≈ 2.5–3 L-levels at mid grey
P += g * amp;
// 5. Toning: P → RGB through a 256×1 LUT (built in tone.ts from §1.2 stops + per-phase warmth)
gl_FragColor = vec4(texture2D(toneLUT, vec2(P, 0.5)).rgb, 1.0);
```

- **Toning LUT stops** (P → sRGB 0–255), from the measurements:

  | P | sRGB |
  |---|---|
  | 0.075 | (22,20,16) |
  | 0.14 | (36,32,26) |
  | 0.23 | (60,54,45) |
  | 0.35 | (91,84,72) |
  | 0.50 | (127,116,103) |
  | 0.62 | (158,145,130) |
  | 0.73 | (186,174,161) |
  | 0.82 | (209,201,185) |
  | 0.86 | (219,211,196) |

  Interpolate in linear light. The per-phase **warmth** `w ∈ [−1, 1]` scales (R−B, G−B) by `1 + 0.35·w` around the luma.
- **Grain motion:**
  - The grain is a **static print grain** whose sampling offset jumps to a new random position every **0.5 s**, blended over 0.5 s between two offsets (no 24 Hz flicker, which reads as video noise).
  - In reduced motion it is fixed.
  - It's never coloured.
  - The grain is in **CSS-pixel units**, so it has the same visual size at DPR 1 and 2: `uvGrain = fragCoord / (dpr * 1.6) / 256`.
- **Paper texture** (`paperTex`, 512², generated once on the GPU at mount):
  - R: 3-octave low-frequency noise.
  - G: crackle, from the Voronoi cell edges of a stretched domain, thresholded thin, at an amplitude of only 2–4%.
  - B: 6–10 hairline scratches (long, thin, slightly curved, bright at +6%, mostly in the upper-left quadrant of the frame, mapped by uv).
  - A: foxing specks (sparse, 1–3 px, ±5%).
  - Mapped to **screen uv**, so it does not scroll with the world: it's the print, not the scene.
- **Edge glow** (in pass 3, before the print pass): where sky meets rock or stone, add `+0.05·exp(−d/2.5 px)` on the *sky* side. That's the faint halo of §1.3.
- **Softness:** an optional 3-tap tent blur on the scene before toning at Q1 (radius 0.6 device px), so nothing is razor sharp. The figure and stone are rendered with a 1.2 px wide anti-aliased edge (§4.3).

### 3.7 GL robustness

- Request `webgl2` with `{alpha:false, antialias:false, depth:false, stencil:false, premultipliedAlpha:false, preserveDrawingBuffer:false, powerPreference:'default'}`. Fall back to `webgl` with the same options, then to the Canvas 2D renderer.
- Shaders are GLSL ES 1.00 (`#version 100`, `texture2D`, `gl_FragColor`), so one source works on both. Only RGBA8 textures and FBOs: no float textures, no extensions required. `OES_standard_derivatives` is optional (used for AA if present; otherwise analytic AA from known pixel size).
- Handle `webglcontextlost` with `preventDefault()`: stop the loop, and on `webglcontextrestored` rebuild programs, textures and tiles. If a context is lost **twice in 60 s**, switch to Canvas 2D for the session.
- Detect slow GPUs: if the first 90 frames average > 22 ms at Q0.5, switch to the Canvas 2D renderer (which is cheaper because it's mostly static).
- **Testability:** `glRenderer` exposes `stats` (gpu ms via `EXT_disjoint_timer_query(_webgl2)` when available, else CPU ms around `gl.finish()` only when `__flushTiming` is set), the tile builds and the current tier.

### 3.8 Canvas 2D fallback (keep it modest)

Used when WebGL is unavailable or fails. It must still look photographic, just simpler.
- **At mount and on resize,** bake with `ImageData` in an idle-sliced generator (≤ 8 ms per slice):
  - a sky canvas, at 0.5 res, already toned;
  - a **tileable** rock texture, 512² world-mapped, pre-lit, at 0.5 res. It's tiled under the ridge clip path, offset by the camera (the texture repeats every 512 px, but rock tolerates it);
  - a stone **albedo disc** (rotated with `rot`), with a **separate, non-rotating shading overlay** (radial-gradient terminator, multiply). That keeps the lighting fixed while the texture rotates;
  - a grain canvas (256², drawn with a pattern at `globalAlpha 0.10` using `overlay`);
  - a vignette (radial gradient, multiply).
- **The figure:** filled tapered capsule paths per limb with a linear gradient across each limb (lit back to shadowed front). Same palette ramp, no strokes.
- **Fallback targets:** ≥ 30 fps on a 2018 laptop; no tonal checks beyond the range limits.

---

## 4. The figure

### 4.1 Proportions: a realistic adult at 7.5 heads

Change `body.ts` (the lengths the walk uses stay within ±5% so the walk tables still hold):

| Segment | Round 5 (H) | Round 6 (H) | Note |
|---|---|---|---|
| Head (crown–chin) | 0.125 | **0.133** | 7.5 heads. No beard wedge, no fillet, no curls. |
| Neck | 0.035 | 0.040 | Width 0.052. |
| Torso (hip joint–shoulder joint) | 0.310 | 0.300 | |
| Thigh / shin | 0.245 / 0.240 | 0.245 / 0.240 | Unchanged (keeps the walk's IK and pose tables). |
| Upper arm / forearm / hand | 0.190 / 0.160 / 0.105 | 0.186 / 0.150 / 0.100 | Realistic, not heroic. |
| Shoulder width (depth in profile: chest front–scapula) | 0.145 | 0.125 | Chest : waist 1.35, an athletic build, not a 1.53 hero V. |

### 4.2 Primitive model: 2.5D round cones

The skeleton from `walk.ts`/`poses.ts` (2D joints in world H, y up) is lifted to 3D with a fixed **depth z per side**: near limbs at z = +0.06 H, the torso at 0, far limbs at −0.06 H. The camera is orthographic along −z.

`figurePrims.ts` turns the skeleton into ≤ 24 primitives:

| Primitive | Type | Radii (H) at the ends (a → b) |
|---|---|---|
| Thigh ×2 | round cone | 0.062 → 0.040 (hip → knee) |
| Shin ×2 | round cone | 0.038 → 0.024; plus a **calf ellipsoid** centred 30% down, r (0.050 long, 0.030 wide), offset 0.012 to the back |
| Foot ×2 | round cone | heel 0.022 → ball 0.016, plus a toe cone 0.016 → 0.010 |
| Pelvis | ellipsoid | (0.10, 0.075, 0.09), pitched with the pelvis |
| Glutes | 2 ellipsoids | r 0.055, behind the hip joint |
| Abdomen | round cone | pelvis → rib base, 0.070 → 0.075 |
| Ribcage | ellipsoid | (0.090 deep, 0.115 tall, 0.085 wide), plus a **pectoral ellipsoid** (front-upper) |
| Lats/scapula | ellipsoid | on the back, so the back reads broad and lit |
| Neck | round cone | 0.028 → 0.024 |
| Head | ellipsoid | cranium (0.064, 0.072, 0.060), plus a jaw ellipsoid (0.040) forward-down; a **nose bump** cone 0.010; hair as a darker-albedo cap ellipsoid over the cranium back |
| Upper arm ×2 | round cone | 0.034 → 0.024, plus a **deltoid ellipsoid** r 0.040 at the shoulder |
| Forearm ×2 | round cone | 0.028 → 0.018 |
| Hand ×2 | flattened ellipsoid | (0.050, 0.022, 0.035), oriented flat against the stone at ψ; fingers are not modelled (invisible at this size) |

**Optional modesty wrap** (default **on**, a designer's call): a short close-fitting loincloth as a slightly lighter-albedo (+0.06) band ellipsoid around the pelvis. It's invisible as a "costume" at this scale, and it avoids anatomical modelling. **No genital or nipple modelling, ever.**

### 4.3 Shading: per pixel, inside the figure's quad

```glsl
// for each primitive k (sorted near→far by z is not needed: take max surface z)
//   ray: o = (px, py, +10), d = (0,0,-1)  (orthographic)
//   round cone: iq's sdRoundCone intersection / or analytic: closest point on axis segment → local radius r(u)
//   2.5D shortcut (fast, good enough): dist2D = distance from pixel to segment ab, u = clamped projection,
//   r = mix(ra, rb, u); if dist2D < r: zSurf = zAxis(u) + sqrt(r² − dist2D²); n = normalize(vec3(pixel − axisPt(u), zSurf − zAxis(u)))
// blend: smooth max of surfaces → organic joins (k = 0.015 H) — 'smooth union' on height zSurf:
//   z = smax(z, zk, 0.015); n blended by the same weight
float lambert = max(0.0, dot(n, Lkey));          // Lkey = normalize(-0.55, 0.45, 0.70)
float wrap    = (dot(n, Lkey) + 0.35) / 1.35;     // soft wrap for overcast
float sky     = 0.5 + 0.5 * n.y;                  // hemispheric fill from the bright sky above
float ao      = occlusion(pixel, z)               // cheap: how many primitives lie above (z higher) within 0.03 H → darken ≤ 25%
float L = albedo * (0.62 * clamp(wrap,0.,1.) + 0.20 * sky + 0.06) * ao;
// far side: albedo ×0.80 and ao more (the far arm and leg sit in his own shadow) — they read darker, giving depth
// rim: +0.06 * pow(1.0 - n.z, 3.0) * step(0.0, n.x * -1.0)  (thin light rim on the back edge, against the sky, §1.3)
```

- **Albedo** (scene luminance): skin 0.36, hair 0.16, wrap 0.42.
- **Resulting printed values:**
  - lit back and shoulders P ≈ 0.55–0.62 (L ≈ 140–158);
  - shadowed chest and belly P ≈ 0.25–0.32 (L ≈ 64–82);
  - far limbs P ≈ 0.20–0.28.

  That matches §1.4: a mid-dark figure reading against sky at L ≈ 165–190.
- **Edges:** coverage `α = smoothstep(r + 0.6px, r − 0.6px, dist)`, with no outline. Composite over the background in the scene FBO.
- **Contact shadow under each planted foot:** a soft dark ellipse on the crest, 0.12 × 0.02 H, at −15% luminance, fading with heel lift.
- **Motion softness (optional, Q1 only):** blend 2 sub-samples of the figure, the pose at `D` and at `D − 0.004 H`, at 0.5 weight. That's barely-there motion blur; it reads photographic. Cut it if the budget is tight.

### 4.4 Pose: keep the round-5 cycle, tune for the reference

**The timing, phases, foot lock, IK, duty factor, pelvis bob and arm IK are all unchanged.** These are the only changes:

| Parameter | Round 5 | Round 6 | Why |
|---|---|---|---|
| `WALK.R` (`BODY.R`) | 0.50 | **0.75** | The stone is Ø 1.5 H (§1.1). |
| `WALK.dS` | 1.20 | **re-solve** so the mean ψ0 (facing angle) is ≈ **212–220°** at θ = 22–26°, with the elbow band 156–170° held (`standOff`/`placeAt` already solve δ; the coder adds a one-off search for `dS` at θ = 24° and freezes it; expect ≈ 1.35–1.5 H) | The hands meet the lower-left quadrant; the stone sits above him. |
| `lam0(θ)` (torso lean) | 17 + 0.2(θ−22), clamp 14–20 | **20 + 0.2(θ−22)**, clamp 17–24 | Measured 15–25°; a little more lean reads as effort without the old "heroic upright". |
| Head pitch (bow vs torso) | 18° ± 1.2° | **34° ± 1.5°** | The head is bowed between the arms (§1.4). Check the face is not inside the near arm: the near arm passes *below* the head now. |
| `PSI_BIAS`, `PSI_SPREAD`, `FAR_LIFT` | 8.5°, 7°, 9° | **4°, 5°, 6°** | Arms nearly horizontal and parallel, as in the reference; less spread is needed on a bigger stone. |
| Front-knee contact angle | 98° | 90–100° (no change needed; check) | A deep lunge. |
| Rear knee at toe-off | 161–166° | ≥ 160° (kept) | The long straight driving leg is the reference's key line. |
| Secondary motion | beard, ringlets, fillet, two cloth flaps, breath, wind | **breath only** (chest ellipsoid scale ±1.5%), plus head pitch and torso lean lags (kept) | No cartoon follow-through. Delete the beard, ringlet and flap channels. |

- **Reduced motion** keeps round 5's static key pose at φ = 0.62 (toe-off: the reference's pose), re-posed every 10 s.
- **Silhouette checks:** at φ = 0.62 the negative spaces must exist and be ≥ 3 px wide at 1440×900:
  - between the legs (a triangle);
  - under the arms (sky between the forearm and the thigh);
  - between the head and the near arm.

  Test it on the rendered alpha mask.

### 4.5 Scale decision

| Viewport | `Hpx` | Figure in push pose (≈ 0.92 H) | Stone Ø | Anchor (pelvis ground point) | Lead room ahead of the stone |
|---|---|---|---|---|---|
| 1440×900 | 0.17 h = **153** | 141 px = **15.7% h** | 230 px = 25.5% h | (0.38 w, 0.60 h) | ≈ 4 H |
| 1920×1080 | 184 | 169 px | 275 px | (0.38 w, 0.60 h) | |
| 1280×800 | 136 | 125 px | 204 px | (0.38 w, 0.60 h) | |
| 3440×1440 (ultrawide) | 0.17 h = 245 | | 367 px | x capped at `0.5 w − 0.20 h` | |
| 390×844 (phone portrait) | min(0.13 h, 0.30 w) = **110** (117 cap) | 101 px = 12% h | 165 px = **42% of width** | (0.27 w, 0.63 h) | ≈ 0.8 H |
| 844×390 (phone landscape) | 0.20 h = 78 | | 117 px | (0.36 w, 0.62 h) | |

- **Why not the reference's exact 14%:** on 16:10 the frame is wider, so the same height fraction reads smaller. 0.17 h keeps the head ≈ 20 px tall at 1440×900, enough for the bowed-head silhouette, with ≈ 45% of the frame as empty sky.
- **Phone:** 110 px is the floor for a readable limb structure (thigh ≈ 7 px wide). Below that, simplify: the AO is dropped and the muscle ellipsoids merged.
- **The ridge's screen line** through the anchor at θ ≈ 24° crosses x = 0 at ≈ 0.87 h and x = w at ≈ 0.16 h on 1440×900. That splits the frame into rock and sky like the reference: **rock fraction 0.45–0.55**, tested.

---

## 5. The stone

### 5.1 Geometry and placement

- Radius `R = 0.75 H`. The centre is `trail.centreAt(D + dS, R)`, as in round 5, and **`rot = trail.centreArc(D + dS, R) / R`**. That's monotonic, applied as clockwise on the y-down screen (round 5 §4.1), with all round-5 roll rules unchanged.
- The stone quad is screen-aligned, `2.3 R` square, centred on the centre. The shader gets `centrePx`, `Rpx`, `rot` (wrapped to `[0, 2π)` on the CPU in double precision, so float precision never degrades), the light direction and the seed.

### 5.2 Surface: rotation that reads as rolling

For the pixel `p` relative to the centre (y-up, in units of R):

```glsl
float r2 = dot(p,p); if (r2 > 1.0) discard-or-AA;
vec3 nV  = vec3(p, sqrt(1.0 - r2));           // view-space normal (fixed frame: lighting lives here)
// Roll axis = screen z (the stone travels in the image plane). Rolling forward up-right = clockwise on screen.
// The material point under this pixel is the view normal rotated BACK by the roll: rotate by -rot about z (y-up),
// which equals +rot clockwise on y-down screen applied to the texture. (Sign is verified by the marker test, §10.)
vec3 nM  = vec3( cos(rot)*nV.x - sin(rot)*nV.y,     // y-up: rotate by +rot CCW to undo a CW roll
                 sin(rot)*nV.x + cos(rot)*nV.y,
                 nV.z );
```

- Every texture lookup uses `nM`, the **3D point on the unit sphere**. That gives seam-free texturing with no poles or UV wrap. The lighting uses `nV`.
- Because the roll axis points at the viewer, the visible hemisphere's markings turn rigidly around the centre **while the terminator, highlight and core shadow stay put**. That separation is what makes a 2D disc read as a rolling ball rather than a spinning sticker.
- Rotation speed at 1440×900: `v/R = 0.1333 / 0.75 = 0.178 rad/s` ≈ **10.2°/s**. A crater at 0.7 R moves ≈ 20 px/s: clearly visible, calm.
- **Sign check for the coder:**
  - On a y-up stone-local frame, the forward roll for a stone moving +x on the ground is **clockwise**, i.e. the material angle *decreases* over time in y-up maths.
  - A material feature at local angle `α0` appears at view angle `α0 − rot`. The texture lookup for view angle `αV` therefore uses material angle `αV + rot`, which is the rotation by `+rot` CCW in the y-up frame above.
  - Verify with the §10 marker test: a crater must cross the top of the stone moving **right**, toward the uphill direction.

### 5.3 Crater and albedo model (all in `nM` space, seeded)

- **Albedo:**
  - `0.40 + 0.10·fbm(nM·2.2, 4 oct)` gives large maria-like patches;
  - `− 0.05·smoothstep(0.55, 0.75, fbm(nM·1.3 + 7))` adds 2–3 big dark seas;
  - `+ 0.03·fbm(nM·18, 3)` adds a fine speckle;
  - the result is clamped to 0.28–0.55.
- **Craters:** 3 octaves of 3D cellular noise (Worley F1), at cell scales 1/3, 1/7 and 1/16 of the diameter, each cell keeping its crater with probability 0.35/0.5/0.6.
  - The crater radius is `0.35–0.48 × cell` (hash).
  - Profile `c(d)` in units of the crater radius `rc`:
    - bowl: `−0.6·(1 − d²)` for d < 1;
    - raised rim: `+0.25·exp(−((d − 1)/0.18)²)`;
    - ejecta brightening: `+0.04·albedo` for 1 < d < 1.8.
  - The bowl floor is slightly darker in albedo (−0.05).
- **Height** `hs = Σ amp_o·c_o + 0.15·ridged(nM·9)` (the rough rock). The amplitudes per octave are 0.030, 0.015 and 0.007 (in units of R).
- **Bump normal:** perturb `nV` by the gradient of `hs`, computed in material space and rotated back with the inverse rotation. Use central differences on the tangent plane, 3 extra `hs` evaluations; at Q0.5 use 2 octaves and analytic crater gradients.
- **Limb:**
  - A ragged silhouette: radius `R·(1 + 0.006·noise(angleM·40))`, in *material* angle, so the bumps on the outline also travel with the roll. That's a strong rotation cue against the sky.
  - Plus a **rim brightening** on the lit side: `+0.06·pow(1 − nV.z, 4)·max(0, dot(nV.xy, Lkey.xy))`.
- **Lighting:**

  ```
  wrap = clamp((dot(nB, Lkey) + 0.20) / 1.20, 0, 1)   // soft terminator ≈ 35% of R wide
  L = albedo·(0.80·wrap^1.2 + 0.10·(0.5 + 0.5·nB.y) + 0.02)
  ```

  This gives a lit-limb P ≈ 0.78 (L ≈ 200), a centre ≈ 0.60–0.65 and a lower-right core ≈ 0.16 (L ≈ 45), all inside the §1.2 targets. There's no specular.

### 5.4 Contact and the ground

- A soft **contact shadow** on the crest under the stone: an ellipse 0.9 R × 0.06 R, darkening the rock lip by up to 30%. Plus an **occlusion crescent** on the stone's lowest 8% (bottom-of-sphere AO, −20%).
- **There is no sky gap** under the stone (unlike the reference composite). The stone sits on the ridge texture's line exactly; that is already guaranteed by `centreAt`.
- **Grit:** at Q1, 1–3 tiny pebbles (2–3 px, rock-toned) occasionally trickle from under the stone down the crest. A deterministic schedule (one every 8–20 s, by hash of D), rolling down-slope for 1.5 s and fading. Optional; cut first.

---

## 6. Sky, cliff, birds and atmosphere

### 6.1 Sky shader (pass 1)

The domain is `u = screenPx / h` (resolution independent), plus `drift` and parallax.

```glsl
vec2 sp   = vec2(u.x * 0.40, u.y) + vec2(driftX + 0.03 * camX, 0.0);   // stretched 2.5:1, slow drift
vec2 w    = vec2(fbm(sp * 1.6 + 3.1), fbm(sp * 1.6 + 8.7));            // domain warp
float big = fbm(sp * 2.2 + 0.8 * w, 5);                                 // cloud masses
float mott= fbm(u * 28.0, 3);                                           // emulsion mottle (screen-fixed-ish)
float base= mix(0.64, 0.80, smoothstep(0.85, 0.20, u.y));               // brighter toward the crest/horizon
float glow= 0.10 * exp(-max(0.0, ridgeYuv(u.x) - u.y) / 0.10);          // luminous band hugging the ridge (§1.3)
float Ls  = base + 0.14 * (big - 0.5) + 0.025 * (mott - 0.5) + glow
          - 0.10 * smoothstep(0.30, 0.0, u.y);                           // darker billows at the top
```

- Target printed values (with the print pass): upper sky L ≈ 120–150, mid sky 155–175, the crest band 185–205. **The sky's sd within a 25% window must be ≤ 16.**
- **Drift:**
  - `driftX` advances by **0.004·h per second** during focus (≈ 3.6 px/s at 900 h).
  - It's 0 when paused, and in reduced motion it's frozen at a value seeded by the block.
  - The cloud field also evolves very slowly: a 3rd noise coordinate increasing by 0.002/s, so forms subtly change shape rather than sliding like a wallpaper.
- **Camera parallax:** 0.03 in x, 0.02 in y. The sky barely moves with the climb, as distant cloud should.
- **Altitude cue (kept from ROUND3_ART §2.4, re-expressed):** with `altK` ∈ [0, 1] over a climb, the crest glow strengthens (+0.04) and the upper sky lightens (+0.03). It's a subtle sense of rising toward light. There are no ranges to sink.

### 6.2 The cliff (pass 2, tiles)

For `p` in world H (relative to `worldOrigin`) and `d` = depth below the ridge in H (from the ridge texture at that x):

```glsl
// anisotropic domain: vertical cleavage → features stretched in y (y-scale 0.35), tilted ~8° from vertical
vec2 q   = rot2(0.14) * p;
vec2 qa  = vec2(q.x * 3.2, q.y * 1.1);
float slab   = ridged(qa * 1.6, 5);                       // fractured faces
float joints = 1.0 - smoothstep(0.0, 0.06, abs(fract(q.y * 1.8 + 0.4 * fbm(q*0.8)) - 0.5));  // sub-horizontal ledges
float gully  = smoothstep(0.55, 0.85, fbm1(p.x * 0.35 + seed));   // big vertical shadow slots (§1.4), 1D in x
float hf     = 0.60*slab + 0.25*fbm(q*6.0, 4) - 0.35*gully*smoothstep(0.0, 0.6, d) + 0.15*joints;
// normal from height (finite diff, eps = 1 px) → light
vec3 n   = normalize(vec3(-dhdx * 2.2, -dhdy * 2.2, 1.0));
float lit= clamp((dot(n, Lkey) + 0.15) / 1.15, 0.0, 1.0);
float alb= 0.20 + 0.06 * fbm(p * 2.0, 3) - 0.05 * gully;
float Ls = alb * (0.25 + 1.05 * lit) * mix(1.0, 0.55, smoothstep(0.0, 3.5, d))   // darker with depth below the crest
         + 0.05 * exp(-d / 0.05);                                                // lit crest lip (§1.4)
Ls = mix(Ls, 0.30, 0.10 * exp(-d / 1.2));                                        // haze: upper rock lighter, lower contrast
```

- **Targets:** rock body L ≈ 30–70 with lit edges 110–145; deepest slots L ≈ 18–25; the band-pass sd at the 3–40 px scale ≥ 18 (against the sky ≤ 8).
- **Snow or scree patches:**
  - The world x is hashed per 12 H cell; 1 in 3 cells gets a patch.
  - The patch is a sheared parallelogram with its long axis on the cleavage direction, 0.4–0.9 H wide and 0.8–1.6 H tall, starting 0.6–1.5 H below the crest. The edges are noisy, and the bottom fades in streaks (`fbm` along the cleavage).
  - Albedo 0.62, lit with the same normal (so it has form).
  - Patches **never** touch the crest within 0.4 H (no confusion with a summit snowcap).
- **Crest lip:** a 2–5 px lighter band directly under the silhouette. Where the crest has a contact window (feet, stone) the lip is exactly on the trail line.

### 6.3 Birds (pass 6)

- **Schedule:** the existing `birdSchedule` (seeded), re-tuned:
  - **1–3 birds** per group (weights 0.45 / 0.35 / 0.20);
  - a group every **70–180 s**;
  - each crossing takes 25–45 s;
  - band y ∈ [0.10, 0.35] h landscape, [0.12, 0.30] h portrait;
  - never inside the stone or figure boxes, or within 0.12 h above the crest.
- **Shape:**
  - A dark (P ≈ 0.20–0.28; distance haze lifts them from black) soft silhouette, built from two tapered wing cones and a body ellipse, drawn with the same AA in a tiny quad.
  - Wingspan **0.030–0.045 h** (27–40 px at 900 h; on phones 0.020 h).
  - The wings have a slight dihedral and a gull-like bend.
- **Motion:** gliding on gentle arcs (`y += 0.01·h·sin(t/7)`). Every 6–12 s, **2–3 slow flaps** (0.45 s each, eased). The glide angle banks ±6°.
- **Off** in reduced motion, at quality < 1, during summit beats and when paused.

### 6.4 Time-of-block light (subtle, stays monochrome)

The progress `p` of the block drives only *exposure*, *warmth* and *glow*:

| Moment | exposure | warmth `w` | crest glow | upper-sky burn | Feel |
|---|---|---|---|---|---|
| Block start (p = 0) | 1.00 | −0.20 (slightly cooler, a neutral silver) | 0.08 | 0.10 | early, flat overcast |
| Mid (p = 0.5) | 1.02 | 0.00 | 0.10 | 0.10 | the reference |
| Late (p = 0.9) | 1.05 | +0.25 (warmer mids) | 0.13 | 0.07 | light opening ahead |
| Summit beat | → 1.08 | → +0.40 | 0.16, with the clouds thinning above the summit | 0.05 | release |
| Overtime (+10 min) | → 0.88 | +0.15 | 0.06 | 0.14 | dusk |
| Break | 0.80 | −0.30 (cool, selenium-ish) | 0.04 | 0.16 | night print, dim and quiet |
| Paused | ×0.92 | → −0.45 over 0.4 s (near neutral grey) | — | — | the photograph "goes cold" |

All of these change at most **1% per 10 s** while climbing, so they're never noticeable as animation.

---

## 7. Summit, break, next climb, reduced motion and phone, in this style

**Timings and the motion logic follow round 5 §6** (the last push with `e → 2`, the quintic stop in double support, the stand blend, the pull-back to zoom 0.62, sit, next-climb crossfade). Restyled:

- **Summit reveal (`complete`):**
  - Under the camera's pull-back (zoom 1 → 0.62 over 3.5 s), the crest rolls over into a **broad rock ledge**: the trail's fillet and ledge. The ledge gets the cliff shader with a flatter top and a lighter lip. Beyond it, the back side falls away into **haze**: the rock fades to sky-tone with depth, `mix(rock, 0.70, 1 − exp(−dist/2.5 H))`.
  - The **clouds open above the summit**: the sky shader's `big` term is thinned in a soft ellipse above the ledge, and the glow rises (+0.06). The stone's lit limb and his back catch slightly more light (exposure 1.08, warmth +0.40), eased over 3 s.
  - There are **no stars, rays or rings.** The HUD's `Summit.` arrives at ≥ 3.6 s as now.
  - The cliff tiles render live during the zoom (§3.5).
- **Overtime:** a slow dusk. The exposure drifts to 0.88 over 10 min and the upper sky burns darker. A faint pale disc of a hidden sun or moon *behind* the cloud (a soft glow, radius 0.08 h, +0.04) may appear low on the right. **No graphic disc.**
- **Break:**
  - Seated against the stone on the ledge (round 5 `sitParams`, with the new proportions).
  - A cool, dim print (exposure 0.80, warmth −0.30), the clouds still. A **soft moon glow** through the cloud crosses with the break's progress: just a brighter patch in the sky field, no disc edge, no stars.
  - In the last 15% of the break, the warmth eases back toward 0.
- **Next climb:**
  - The round-5 sequence (a 0.4 s crossfade to the col frame, then hold, then the `e` ramp).
  - The new stage's `seed` gives new rock. The crossfade happens in the **scene FBO**, so grain and paper stay continuous: they're the print, not the scene, so they must not crossfade.
- **Reduced motion:**
  - No loop, as now. Each redraw (every 10 s, or on a phase change or resize) renders a still `FrameModel` at the toe-off pose.
  - Grain is static, the sky drift is frozen, there are no birds, and the paper stays on.
  - Summit and break cut (or use a 400 ms crossfade) to their final frames.
  - **The GL renderer must support single-frame rendering** without a running loop. Tiles still cache.
- **Phone:**
  - The §4.5 layout. The backbuffer is capped at 1.6 MP.
  - The sky is rendered at 0.5×, every 3rd frame.
  - The figure uses the merged-ellipsoid LOD below 120 px.
  - Birds have a 0.020 h span.
  - The HUD sits at the bottom over the dark cliff (the lower-right is rock in portrait as well, because the ridge runs from (0, 0.69 h) to (w, 0.48 h) at 24°). The controls get the safe-area insets as now.

---

## 8. UI chrome over the photograph

The HUD must look like **a caption on a print**, not app chrome.

- **Type:**
  - **Fraunces**, already loaded. Extend the Google Fonts URL to include `wght 300..400` roman, with `opsz` up to 144.
  - **Timer:** Fraunces 300, opsz 144, `font-variant-numeric: lining-nums tabular-nums` (verify Fraunces has tabular figures; if not, wrap each digit in a fixed-width `ch` span). Size `clamp(44px, 6.2vw, 84px)`, `letter-spacing: 0.01em`.
  - **Labels** (`LEFT · ENDS 10:40`, `CLIMB 3`, `412 M`): Fraunces 400 at 11–12 px, uppercase, `letter-spacing: 0.16em` (faux small caps), or `font-variant-caps: all-small-caps` where it renders well.
  - Drop IBM Plex Mono for the readout in the focus overlay; the app elsewhere keeps its fonts.
- **Colour tokens** (focus overlay only, defined on `.overlay`):
  - `--focus-ink: #E8DEC9` (warm cream, the print's paper white);
  - `--focus-ink-muted: rgba(232,222,201,0.62)`;
  - `--focus-ink-dark: #2B241B` (for any text over the bright sky);
  - `--focus-hair: rgba(232,222,201,0.28)`;
  - `--focus-glass: rgba(26,22,17,0.32)`;
  - `--focus-glass-border: rgba(232,222,201,0.22)`;
  - `--focus-accent: #E2D6BE`, `--focus-on-accent: #241E16`;
  - `--focus-text-shadow: 0 1px 10px rgba(16,13,10,0.55)`.
- **Placement:**
  - The readout and the climb strip stay bottom-centre or bottom-right **over the cliff**, which is dark, so cream on rock gives contrast ≥ 7:1 (test it).
  - The top-left header sits on sky (L ≈ 120–150 after the vignette). Use cream with the text-shadow there (contrast ≥ 4.5:1 at the burned top; test it). If it fails, use a tiny dark scrim (`linear-gradient(to bottom, rgba(20,16,12,0.35), transparent 90px)`).
- **Climb strip:**
  - A 1 px hairline rule in `--focus-hair` with a cream tick for progress (no pill bar).
  - Metres and the climb number in small caps: `412 m  ·  CLIMB 3`.
  - The progress tick advances every second (visible-progress rule).
- **Controls:**
  - Rectangular print-mat buttons: height 40 px, radius 2 px, 1 px `--focus-glass-border`, background `--focus-glass` with `backdrop-filter: blur(6px)`. Text is Fraunces 400, 13 px, uppercase, tracking 0.12em.
  - The primary button has a cream fill with dark ink.
  - Focus ring: 1.5 px cream, 3 px offset.
  - **Auto-hide as now** (fade 600 ms, reveal 200 ms). `prefers-reduced-transparency` → solid `rgba(26,22,17,0.85)`.
- **Panels** (complete, break): the same mat style, with a hairline border and no rounded-pill shapes. Headings in Fraunces italic 400 (`Summit.`).
- **No change to HUD logic or copy** beyond styling, except the climb-strip markup if the hairline needs it.

---

## 9. Risks and mitigations

| Risk | Mitigation | Cut order if needed |
|---|---|---|
| **Procedural realism looks cheap or "noise-y"** (the most likely failure) | Value structure first: get the **big shapes and tones** right (rock vs sky lobes, crest glow, gully, stone terminator) before adding detail. Use few octaves with an anisotropic domain; never mix a cartoon cue back in. Review at 50% zoom and squinting: the reference and our frame should have the same value map. The designer delivers a **greyscale value study** (a downsampled 64×40 L map) as the acceptance target in P1. | — |
| The figure reads as a "mannequin" or "blob" | Silhouette-first tests (§4.4); the muscle ellipsoids (calf, glute, deltoid, lats) define the anatomy; the far side is darker; the rim light is on the back. The designer tunes radii from a turnaround study at 4×. | Drop the motion blur first, then AO. |
| Phone GPU too slow, or mediump precision banding | Tiles; the sky at 0.5× every 3rd frame; the 1.6 MP cap; quality tiers; local coordinates; octave drop at mediump. | Q0.5, then the Canvas 2D renderer. |
| Shader compile hitch at mount | Small programs (6), compiled async (`KHR_parallel_shader_compile`), under the overlay's 600 ms fade. The first frame shows after a successful draw. | Pre-warm on the focus picker's hover. |
| Context loss on mobile backgrounding | Rebuild on restore; 2 losses → Canvas 2D. | — |
| Tests break because pixels are now GL | The `FrameModel` split; a null renderer in the stub; the roll, fluidity and summit tests run on models. Pixel tests only in the reviewer's Chromium harness. | — |
| Smaller figure makes the walk look slow or static | The rock moves at 20 px/s with strong texture, and the stone's craters at 20 px/s. Check "progress visible every second": ≥ 15 px of ground motion per second on every viewport. | Raise Hpx to 0.19 h if it fails. |
| Hidden-summit clamp engages earlier with more lead room | §3.4 rule; raise `END_LEAD` if needed. | — |
| Bundle size | Shaders as strings, ≈ 25–35 KB unminified. No libraries. | — |
| "Nude figure" sensitivities | No anatomical detail; a modesty wrap on by default; small scale. | — |

**What to cut if the round runs long** (in order): the grit pebbles, then the figure motion blur, then the paper scratches and crackle (keep the tone unevenness), then the bird flaps (glide only), then the snow patches, then the tile cache (go live-render at 0.6× with Q0.75 octaves). **Never cut:** the print pass, the lit stone with fixed light, the figure with no outlines, or the roll and motion guarantees.

---

## 10. Milestones (P0–P5) and acceptance checks

Each milestone is its own commit(s) with green `npx vitest run`, a clean `tsc` and a clean `npm run build`. Screenshots go to the scratchpad, **never the repo**. "Tonal" measurements use the reviewer's headless Chromium capture at 1440×900 (DPR 1) and 390×844 (DPR 2), mid-block (`p ≈ 0.5`), with Rec.709 luma.

### P0: architecture, layout constants, the GL bootstrap and the print pass

- [ ] **Code:** `FrameModel`, the `Renderer` interface, `glRenderer` (context, programs, FBO, async compile, context loss), `tone.ts`, and the **print pass** applied to a temporary flat test scene (sky as a gradient, rock as flat 0.2). The null renderer in `engineStub`.
- [ ] **Constants:** `BODY` per §4.1, `WALK.R = 0.75`, `dS` re-solved (§4.4) and frozen, new `camLayout` (§4.5), `lam0`, head pitch, ψ constants.
- [ ] **Carried over (engine tests on models), unchanged thresholds from ROUND5 §8:**
  - foot lock < 1e-6 H;
  - seam continuity;
  - C1 joint angles;
  - the speed band 0.94–1.06 v;
  - roll: ρ strictly increasing every frame, ±1% vs ground over 60 s, per-frame ±3%;
  - persistence reproduces φ and ρ within 1e-6;
  - elbows 156–170°, palm gap < 0.002 H at R = 0.75.
- [ ] **Hidden summit:** a sweep over a full block at 1440×900, 1920×1080, 3440×1440 and 390×844 shows the crest at `crestS − 0.3` never inside the viewport during `focus`. The clamp engages only in the final `END_LEAD/PACE_H` s.
- [ ] **Tone:** the `tone.ts` LUT reproduces the §3.6 stops within ±3 per channel. The print-pass output of a 0–1 ramp spans **L 18–22 → 208–214**, with no value outside [15, 216].
- [ ] **Fallback:** forcing `webgl` and `webgl2` to fail selects the Canvas renderer; forcing a context loss restores the scene.

### P1: sky and the endless cliff

- [ ] **Code:** the sky shader (§6.1), the cliff shader (§6.2), the ridge texture, crest roughness with contact windows, the lip, gullies, snow patches, the tile cache, the edge glow.
- [ ] **Seamless and deterministic:**
  - rendering the same world rect at two camera positions gives identical tile pixels (max |Δ| ≤ 1 level);
  - a 60 s scroll capture shows no tile seams (the column-difference spike at tile boundaries is ≤ 1.5× the median column difference);
  - a reload at the same `posM` gives identical frames (max |Δ| ≤ 2 levels, grain disabled for the test).
- [ ] **The crest under the contacts:** within the contact windows, the rendered silhouette is within ±1 px of `trail` projected.
- [ ] **Tonal targets (full frame, figure and stone masked out):**
  - p1 ∈ [15, 28]; p99 ∈ [198, 216]; no pixel > 220;
  - histogram bimodal: rock lobe peak in L 25–65, sky lobe peak in L 150–200, with the 80–112 band holding < 20% of pixels;
  - rock fraction (`blur12 < 115`) ∈ [0.42, 0.58] at 1440×900;
  - the sky's 3–40 px band-pass sd is ≤ 9 and the rock's ≥ 16;
  - mean chroma (max − min channel) is 12–30 and p95 ≤ 36.
- [ ] **Vignette:** the mean of the corner 8% boxes is 22–40% below the centre-sky mean at the same height band.
- [ ] **Grain:** in a flat-sky 200×200 box, the 1–3 px band-pass sd is 1.5–4 L levels, and its autocorrelation at 4 CSS px is < 0.1. **No chroma noise:** per-pixel (R−B) sd in the box ≤ 1.5.
- [ ] **No lines:** a Canny/Sobel scan finds **no straight or circular edge runs > 40 px of constant width ≤ 2 px** anywhere (excludes the ridge, a ≥ 3-octave edge). That's the "no lines all over the place" check.
- [ ] **No round-5 look left:** no sun disc or rings, no ranges, no swirl clouds, no ochre (no pixel with hue 15–40° and chroma > 50).

### P2: the stone

- [ ] **Code:** the stone shader (§5.2–5.4), the contact shadow, AO, the ragged material limb.
- [ ] **Size:** the measured diameter at 1440×900 is 225–235 px (Ø 1.5 H); on 390×844, 160–170 px. The stone plus figure fit inside 16 px gutters on the phone.
- [ ] **Light:** on the stone's horizontal profile through its centre, the left 10% has mean L ≥ 175 and the right 10% ≤ 70. The vertical profile is top > bottom by ≥ 80 levels. The terminator band (the L 35–65% of range) is ≥ 25% of the diameter wide (soft).
- [ ] **The roll in pixels (carried from REVIEW_ROUND4/5):**
  - a rotation search on consecutive frames (masking the stone, matching the *albedo-only* debug render with lighting disabled through a debug uniform) finds a **clockwise** rotation on 100% of frame pairs;
  - the measured angular rate is within ±5% of `v/R` (0.178 rad/s);
  - a tracked crater crosses the top of the stone moving right;
  - the lit-render terminator stays fixed: its centroid angle drifts < 2° over 30 s.
- [ ] **No skid:** the stone's surface speed at the contact equals the ground scroll within ±3% (from the model test, carried).

### P3: the figure

- [ ] **Code:** `figurePrims.ts` (pure) and the figure shader (§4.2–4.3), the foot contact shadows, breath. Delete the beard, ringlet, fillet and cloth channels.
- [ ] **No outlines:** in a 4× crop the figure's edge profile (luma across the boundary, sampled normal to it at 50 points) has **no dark or bright line**. The edge transition is monotonic from figure to sky, with no overshoot > 6 levels, over 1–2.5 px.
- [ ] **Modelling present:** inside the figure mask the luma sd is ≥ 18. The lit back and shoulders (upper-left facing) are ≥ 45 levels brighter than the chest and belly (stone-facing). The far limbs' mean is ≤ the near limbs' mean − 10.
- [ ] **Values:** figure mean L ∈ [70, 120], against an adjacent sky ∈ [150, 200].
- [ ] **Size:** the push-pose bounding box (stone excluded), at its smallest over the cycle, is 0.14–0.17 h at 1440×900 and 1920×1080, and ≥ 0.11 h at 390×844.
- [ ] **Silhouette:** at φ = 0.62 the negative spaces of §4.4 exist (≥ 3 px). The head is bowed (head axis ≥ 45° from vertical), the rear knee ≥ 160°, and the hands touch the stone (an alpha gap of 0 px).
- [ ] **Proportions:** in the model, head : standing height = 1 : 7.5 ± 0.2.
- [ ] **Fluidity carried (ROUND5 F1):**
  - zero climbing frames with pelvis speed outside 0.90–1.10 of the mean;
  - a planted foot's screen drift < 1 px over its stance;
  - never zero speed during focus;
  - pause to stop ≤ 400 ms, resume to 95% by 600 ms.

### P4: atmosphere, set pieces, reduced motion, phone, HUD

- [ ] **Birds:** groups of 1–3, every 70–180 s, never over the stone or figure boxes, off in reduced motion and paused.
- [ ] **Time-of-block:** the mean (R−B) of mid-tones rises by 3–8 levels from p = 0 to p = 0.9. No frame-to-frame jump > 0.5 level in any grade parameter.
- [ ] **Summit:**
  - stands by ≤ 7 s;
  - feet don't slide during the stand blend (< 1 px);
  - figure on screen;
  - the clouds open, and the exposure rises;
  - no stars, rings or sun disc;
  - `Summit.` at ≥ 3.6 s.
- [ ] **Break:** a seated pose, exposure ≈ 0.80 (the mid-sky mean drops 15–30 levels), cool warmth (mid-tone R−B ≤ 18).
- [ ] **Next climb:** the crossfade happens in the scene, and the grain does not crossfade (the grain field's correlation across the crossfade frames is > 0.9). The new stage's rock differs; the stone's ρ continues per round 5.
- [ ] **Reduced motion:** no frame-to-frame change except the 10 s re-pose; grain static; a still-frame render works with no loop.
- [ ] **Phone (390×844, DPR 2 → backbuffer ≤ 1.6 MP):** the layout of §4.5; the HUD over rock; the controls within the safe area.
- [ ] **HUD:**
  - Fraunces is in use;
  - cream ink on rock has contrast ≥ 7:1 and the header on the sky ≥ 4.5:1;
  - the climb strip is a hairline;
  - the controls are mat-style and auto-hide (unchanged timing);
  - visible progress every second: the timer, the strip tick, and ≥ 15 px/s of ground motion.

### P5: performance, fallback polish, cleanup

- [ ] **Frame time** (Chromium, real GPU, 1440×900, DPR 2 → 1.5 cap, 60 s climbing):
  - CPU avg ≤ 3 ms;
  - GPU avg ≤ 5 ms (timer query) and p95 ≤ 8 ms;
  - 60 fps with ≤ 1% dropped frames.
- [ ] **Phone** (Chrome DevTools mid-tier mobile emulation, or a real phone if available): ≥ 30 fps sustained at Q0.75 or better, and the first frame ≤ 120 ms.
- [ ] **First frame on desktop** ≤ 60 ms, including the compile (or the compile hidden under the fade). Tile builds ≤ 1 per frame after the first 10 frames.
- [ ] **Canvas 2D fallback:** ≥ 30 fps; tone range within [15, 220]; no outline strokes on the figure.
- [ ] **Deletions done** (below). Bundle growth ≤ 45 KB minified. `git ls-files` shows **no new image files**.

### Files: kept, changed, replaced, deleted

| File | Fate |
|---|---|
| `walk.ts`, `poses.ts` | **Keep.** Constants per §4.4; remove the beard, ringlet, flap and fillet secondary channels from `poses.ts` and `sisyphus.ts`. |
| `trail.ts`, `camera.ts`, `noise.ts`, `ambient.ts` | **Keep.** `camLayout` numbers per §4.5. `ambient.ts` gets the §6.3 schedule. |
| `body.ts` | **Change:** §4.1 proportions plus primitive radii; drop the outline anchors and stroke data. |
| `sisyphus.ts` | **Refactor:** the engine only (clock, camera, phases, set pieces → `FrameModel`). All `g.*` drawing moves out. Drop strips, clouds, the sun, the moon, stars, the cairn drawing and the cloud drift. |
| `figure.ts` | **Replace** with `render/figurePrims.ts` (pure) plus the figure shader. Delete `FLW`, the tiers, `LOCAL_LINES` and the stroke caches. Keep `figureGeometry`-style test hooks, now returning the primitive silhouette. |
| `artDraw.ts`, `artPalette.ts` | **Delete** (sky fills, sun rings, moon, stars, cloud masses, strips, the boulder sprite, the contact arc, ochre tokens). Move `clamp`, `mixOk` and `contrast` to a small util if still used. |
| `art.test.ts` | **Delete**; replaced by `tone.test.ts` and `figurePrims.test.ts`. |
| `daylight2d.ts`, `palette.ts`, `path.ts` | **Untouched** (Daylight scene). |
| `roll.test.ts`, `walk.test.ts`, `motion.test.ts`, `engine.test.ts`, `setpieces.test.ts`, `climb.geom.test.ts`, `scenes.geom.test.ts`, `figure.test.ts` | **Update** to the `FrameModel`/null-renderer API and the new constants; thresholds unchanged unless stated above. |
| New | `frameModel.ts`, `render/renderer.ts`, `render/glRenderer.ts`, `render/canvasRenderer.ts`, `render/tone.ts`, `render/figurePrims.ts`, `render/shaders/{common,sky,cliff,stone,figure,birds,post}.ts`, tests `tone.test.ts`, `figurePrims.test.ts`, `frameModel.test.ts`. |
| `FocusMode.module.css`, `index.html` (font URL), `FocusHud.tsx`/`ClimbStrip.tsx` (markup only if needed) | **Restyle** per §8. |
| `docs/ROUND3_ART.md` §1, §2.3–2.5, §3; `docs/ROUND5_SISYPHUS.md` §2.2–2.8, §4.3 | **Superseded** by this doc. Their motion, endless-climb, set-piece timing and persistence sections still apply. |

### Who does what

- **Designer** (`docs/ROUND6_DESIGN.md`):
  - a value study (target luminance map at 64×40) for 1440×900 and 390×844;
  - the final numbers for the noise parameters, the figure radii and the toning stops after look-dev in a scratch harness;
  - the HUD tokens;
  - the bird silhouette.

  The designer may adjust any value in this plan within the §10 acceptance ranges.
- **Coder:** P0–P5 in order, one PR-sized commit or more per milestone.
- **Reviewer** (`docs/REVIEW_ROUND6.md`):
  - runs the §10 checks;
  - repeats round 5's roll and fluidity measurements on the new renderer;
  - does a side-by-side value comparison against the reference (downsample both to 64×40 L and compare the histograms' lobe positions). Not a pixel match: we must not copy the image.
