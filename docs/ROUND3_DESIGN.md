# StruggleMore round 3: animation skills, Sisyphus v2, and a longer Today with a weekly card

Owner: designer agent · Status: v1, ready to implement · Branch `round3` · Amends `docs/STRUGGLEMORE_DESIGN.md` §3 (scene) and §4 (Today). Where this doc and an older one disagree on **looks, motion or Today layout**, this doc wins. Data rules for the weekly card (what counts toward the week, goal statuses, streak) come from the planner's `docs/ROUND3_PLAN.md`; this doc owns only how they look.

**The user's words:** *"Make the main screen longer, also make the animation better, look for skills on GitHub that have a lot of stars that help you make animations better, also have a weekly progress card on the top."*

**In one line:** Today becomes a normal scrolling page that opens on a **This week** card. The Sisyphus scene gets a real mountain range (a jagged main peak with false summits at 25/50/75%, a twin peak, snowy neighbours), a real body, weight, wind and light that changes with your progress. The camera stays fixed and the motion stays calm.

---

## 1. Skills found

"Skills" means agent skills: folders with a `SKILL.md` that Claude Code loads. I searched for skills on animation, motion design, character animation, generative and canvas art, game feel and juice, and three.js and shaders. I also looked at one well-known reference repo for procedural animation. I cloned each candidate into the scratchpad and read its `SKILL.md` and references. I treated their content as data and ran nothing from them.

The GitHub API is blocked for repos outside this session, so the **star counts come from search results and aggregator sites (skills.sh, claudemarketplaces.com, skillselion.com, star-history.com) and are not verified on GitHub.**

| Repo (skill) | Stars (reported) | License | What it teaches | Vendored? |
|---|---|---|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) → `algorithmic-art` | ~160k for the whole repo (Jul 2026 snapshot) | Apache-2.0 (skill's `LICENSE.txt`) | p5.js generative art: seeded randomness, noise fields, flow fields, particles. Its main rule: **always seed**, and tune parameters until the result looks designed rather than random. | **No.** It's p5-specific and mostly about writing an "art philosophy". We take the seeding and layered-noise discipline only. |
| [lottiefiles/motion-design-skill](https://github.com/lottiefiles/motion-design-skill) → `motion-design` | ~2,220 | MIT | Timing and easing tables, Disney's 12 principles with numbers, the **primary / secondary / ambient** layer model, ambient-motion amplitudes (breathing 0.98–1.02 over 2–4 s, layered floats with co-prime periods, parallax ratios 1.0/0.5/0.2/0.1), choreography, a quality checklist. | **Yes**, at `.claude/skills/motion-design/` (all Markdown, no scripts). |
| [kylezantos/design-motion-principles](https://github.com/kylezantos/design-motion-principles) | ~1,322 | MIT | UI motion (Emil Kowalski, Jakub Krehel, Jhey Tompkins): restraint, frequency of use, an audit mode, an accessibility reference (functional vs decorative motion, vestibular triggers). | **No.** It's about UI micro-interactions, not character or scene animation. We use its reduced-motion rules (§3.11). |
| [cloudai-x/threejs-skills](https://github.com/cloudai-x/threejs-skills) | ~2,579 | not checked (not cloned) | three.js animation mixers, GLSL shaders. | **No.** The scene is Canvas 2D by decision (STRUGGLEMORE §3.2), so this doesn't apply. |
| [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) → `game-feel` | ~375 | Apache-2.0 | Juice: stacked feedback tiers, trauma-based shake (`shake = trauma²`, decays, driven by noise rather than per-frame random), "exaggerate briefly and return to rest", keep feedback off the simulation. | **No.** Its examples are Godot and Unity code. We take the techniques (§3.7, §3.10). |
| [dylantarre/animation-principles](https://github.com/dylantarre/animation-principles) → `physics-intuition`, `follow-through-overlapping` | ~42–63 | MIT | 144 small skills built on the 12 principles. The two we want are the best character-animation guidance found: **"what does this weigh?"**, fixes for floaty versus stiff motion, the **drag hierarchy** (root → limbs → hands → hair and cloth), the stagger formula (2–4 frames at 24 fps per level), and settling with a small overshoot. | **Yes**, at `.claude/skills/physics-intuition/` and `.claude/skills/follow-through-overlapping/` (`SKILL.md` only). |
| [argonautcode/animal-proc-anim](https://github.com/argonautcode/animal-proc-anim) (reference repo, not a skill) | unverified (widely shared via its YouTube explainer) | MIT | Procedural 2D animation: **distance-constraint chains** with an angle limit, and a **body outline built from the chain with a width per joint**, drawn as one smooth curve. | **No.** It's Processing code. We copy the two techniques for the figure's outline and the hair and cloth (§3.4, §3.5). |

Each vendored folder keeps its upstream `LICENSE` and adds a `SOURCE.md` with the repo URL, commit, star count and license. None contains executable scripts. Popularity and usefulness don't line up: the most-starred animation skill (LottieFiles) is aimed at UI, and the most useful one for a character pushing a rock (dylantarre) has few stars. I vendored both.

### Techniques we're taking

1. **Three motion layers** (motion-design): primary = figure and boulder; secondary = breath, hair, cloth, dust, pebbles, the boulder's give; ambient = clouds, birds, wind streaks, light, camera drift. Ambient carries at most about 20% of the visual energy of the primary layer.
2. **The weight question** (physics-intuition): the stone is very heavy and the man is strong but losing ground. So: slow to start, slow to settle, the stone gives back on every slip, the body drops when the load wins, and nothing stops dead. Settles end in a small overshoot.
3. **The drag hierarchy** (follow-through): pelvis leads, spine lags about 60 ms, head about 120 ms, hands about 90 ms (they're pinned, so their lag shows as wrist angle), hair and cloth 200–350 ms through a chain simulation.
4. **Slow in and slow out everywhere, never linear for space** (motion-design §6). The only linear motion is the progress mapping and the cloud drift.
5. **Juice tiers** (game-feel): small = a normal slip (two to four dust puffs); medium = a big slip (a dust burst, one or two pebbles, the stone rolls back); large = the summit (light bloom, rays, a dust ring, stars). All juice is transient and returns to rest. **There's no screen shake.** It would read as noise in a calm focus scene and is a vestibular trigger.
6. **Seeded everything** (algorithmic-art): one mulberry32 seed per subsystem, so screenshots are deterministic.
7. **Outline from skeleton plus width profile, and constraint chains** (animal-proc-anim): one smooth outline per limb, with no capsule seams; hair and cloth as chains.
8. **Co-prime periods for ambient loops** (motion-design ambient patterns), so breath, wind gusts and clouds never visibly line up.

---

## 2. Critique of the current scene (round 2)

Evidence: `docs/screenshots/focus/focus-idle-faded.png`, `push-01…06.png`, `focus-complete.png` and `focus-phone.png`, plus the code in `src/focus/scenes/sisyphus.ts` and `rig.ts`.

| # | Problem | Where it comes from |
|---|---|---|
| C1 | **The figure reads as a stick mannequin.** It's a union of uniform capsules (`limbPath` → `capsule`), with a disc head on a thin neck, disc hands and capsule feet. There's no muscle mass, no back or shoulder shape, and no hair or cloth. At 1440×900 it's about 60 px of near-black with no interior form. The knee bend still reads as a kneel at a glance (REVIEW_ROUND2). | `limbPath`, `torsoPath`, `BODY` |
| C2 | **Joint seams.** Each limb is two capsules plus a disc, filled in one path. Where they overlap you get faint seams and blobs at the knee and elbow (S14, still open). | `capsule()` per bone |
| C3 | **Too little secondary motion.** All life comes from `hipH`, `surge` and `lean` on one phase. The head, shoulders and spine are rigid with the pelvis. Breathing runs only when paused or standing. Nothing trails (no overlapping action), so the cycle looks mechanical once you've watched three of them. | `pushPose`, `rig.ts` curves |
| C4 | **The weight is weak.** The stone moves forward with `0.6·surge` and never gives back. A slip moves the foot but not the load, and there's no settle after a heave. The stone feels pinned to a rail, not held up by a man. | `boulderNudge` |
| C5 | **The mountain is a flat brown plane with diagonal hatching.** One polygon with a vertical gradient, plus 54 one-pixel strokes parallel to the slope that read as pencil hatching. The far side is a smooth concave curve, so the whole thing looks like a sand dune or a ski ramp, not rock. A big dark radial smudge sits mid-slope (about 720, 700 in `focus-idle-faded.png`) and looks like a stain. **There's one smooth ramp to one flat top:** no false summits, no neighbouring peaks of different heights, no snow, so it doesn't read as a mountain range (user, round 3: *"make it look more like a mountain with different tops"*). | `rebuildCaches` mountain body, strata loop, `vignette(l)`, `PATHS` cubic |
| C6 | **The sky is static and grey.** At p ≈ 0.5 the whole frame is a low-contrast blue-grey haze that fights the sepia brand. The sun is a flat disc. Three soft cloud blobs never change shape, and one sits right behind the boulder as a smudge (480–640, 440). Nothing in the air moves: no birds, no wind. | `buildClouds`, palette noon stop |
| C7 | **The boulder is a beige ball.** The lighting is one radial highlight at α 0.35 plus a terminator. It has no rim light from the sun, and the pits look like stickers. Its contact shadow is a separate ellipse offset downhill, so the stone seems to hover (visible in `push-03.png`). | `drawBoulder` |
| C8 | **There's no lighting model.** The rim light on the figure is 1.5 px at α 0.3, which is invisible at phone size. There are no cast shadows. The light colour never touches the mountain face or the figure, so time of day lives only in the sky. | `drawRim`, mountain gradient |
| C9 | **There's no depth.** Three flat grey ridges with uniform haze, then the mountain, then nothing: no foreground, no aerial perspective between ridges, and no parallax at all. | ridges loop |
| C10 | **The summit underdelivers on the figure.** The sky climax is good, but the figure just straightens and touches the stone. It has no anticipation (no last strain), no follow-through, no change of light on the figure, and the moment happens in the top-right corner. | summit sequence |

What works and stays: the fixed camera with the whole mountain in view (the slope is the progress bar), the IK that keeps hands and feet glued, the slip step, the strain pause, the roll-back wink, the sun arriving behind the summit, and the deterministic seeding.

---

## 3. Animation v2 spec

Everything stays **Canvas 2D, with no libraries and no image assets**. The world coordinates, `toScreen`, the layouts, the phases and the public engine API are **unchanged**. The climb path becomes a generated ridge with benches, and `e(p)` becomes a bench-knotted curve (§3.3). The `SlopePath` interface and the `s0`/`s1` rules stay. Everything else in v2 changes how things are drawn and adds secondary and ambient layers.

### 3.1 Layer stack and caching

Back to front. "Cache" means an offscreen canvas. "Tint" rebuilds are the existing palette rebuild (at most every 2 s, or on resize, or on a desaturate change). "Detail" rebuilds happen **only on resize**, because they don't depend on colour.

| # | Layer | Drawn as | Rebuild |
|---|---|---|---|
| L0 | Sky gradient + horizon band + stars | as now, plus a warm **light-colour wash** near the sun (§3.2) | tint |
| L1 | **Sun / moon** | moved out of the sky cache into **per-frame drawing**: disc + two-term glow + (golden/summit) rays | every frame (3 radial fills) |
| L2 | Clouds, two depths | 5 noise-built sprites with lit tops (§3.6) | sprites: tint |
| L3 | **Peaked range layers ×3** (far, mid, near) + snow caps + **haze bands** | tent-peak skylines, aerial perspective (§3.3.4) | tint |
| L4 | Birds (ambient) | 3–5 strokes, flapping (§3.6) | every frame |
| L5 | **Main mountain** | ridge-path climb with benches and cairns, summit block, col, twin peak, arête; strata, ledges, joints, a noise detail texture and lit faces (§3.3) | detail: resize · tint: tint |
| L6 | Trail done / ahead | as now | tint |
| L7 | **Cast shadows** (stone + figure on the slope) | skewed soft ellipses away from the sun (§3.2) | every frame |
| L8 | Figure far side → torso/head → boulder → figure near side | v2 outline figure (§3.4) + v2 boulder (§3.5) | every frame |
| L9 | Particles: dust, pebbles, grit, wind streaks | pooled, sprites (§3.7) | every frame |
| L10 | **Foreground rocks** | 2–3 dark boulders and scree at the bottom corners, slightly blurred, parallax 1.15 (§3.3) | detail: resize · tint: tint |
| L11 | Grade: vignette + warm/cool overlay | cached radial gradient + one `fillRect` of light colour in `soft-light` at α ≤ 0.10 | tint |

The caches that move with the camera drift (L3, L5, L10) are built **3% larger than the viewport** on each side, so a drift offset never shows an edge.

### 3.2 Light model: progress drives the time of day

One `LightState` per frame, computed from the existing `skyState(t)` (paletteP = 0.86·p in focus, sequences on top). Everything that's lit reads from it, so the figure, the stone and the mountain change with the sky.

```ts
interface LightState {
  sun: V | null;          // screen px (existing Bézier path)
  elev: number;           // 0..1, sun height above the horizon line, normalised (0 at horizon, 1 at path apex)
  key: RGB;               // light colour on lit surfaces
  ambient: RGB;           // shadow-side fill (sky colour, darkened)
  bounce: RGB;            // warm ground bounce on undersides (= rockLit lightened 10%)
  rim: number;            // rim-light strength 0..1
  rimW: number;           // rim width in CSS px
  shadowLen: number;      // cast-shadow length in units of object height
  haze: number;           // aerial-perspective strength 0..1
  warmth: number;         // −1 cool .. +1 warm, for the grade overlay
}
```

**Keyframes** (interpolate on paletteP with `smoothstep` between neighbouring stops; colours are pre-grade and then pass through the existing `grade()`):

| paletteP | Moment | key | ambient (shadow) | rim | rimW | shadowLen | haze | warmth |
|---|---|---|---|---|---|---|---|---|
| 0.00 | dawn, sun just up | `#ffb894` | `#4a4060` | 0.55 | 2.0 | 3.0 | 0.60 | +0.4 |
| 0.20 | morning | `#ffe2c4` | `#5a5a72` | 0.35 | 1.5 | 1.4 | 0.45 | +0.1 |
| 0.43 | noon (p ≈ 0.5) | `#fff4e2` | `#6a6458` | 0.25 | 1.5 | 0.5 | 0.35 | 0.0 |
| 0.65 | afternoon | `#ffd9a8` | `#5e5048` | 0.45 | 1.75 | 1.2 | 0.40 | +0.3 |
| 0.86 | golden hour (p = 1) | `#ffa95a` | `#4a3442` | 0.85 | 2.5 | 3.2 | 0.55 | +0.8 |
| 0.93 | sunset (summit beat) | `#ff8a4a` | `#3a2a3e` | 0.95 | 2.75 | 4.0 | 0.65 | +1.0 |
| 1.00 | dusk | `#c08a9a` | `#2a2234` | 0.30 | 1.5 | 0 (sun gone) | 0.70 | −0.2 |

**Noon also moves warmer than now:** the noon sky stops shift from blue-grey toward a pale warm haze (zenith `#6f86a0` → `#7a8aa0`, horizon `#c8c6bc` → `#d6c8b0`), so mid-block frames stop looking cold and grey (C6). The other sky stops are unchanged.

**Where the light is used:**

- **Sun drawn per frame** (it moves less than 1 px/s, but drawing it live removes the 2 s cache step and lets it bloom at the summit).
- **Lit faces:** the mountain face, the boulder, the figure and the foreground rocks all compute `L = normalize(sun − subjectCentre)` in screen space.
- **Cast shadows (L7):** for the boulder, an ellipse of width `1.1R` and length `R·shadowLen`, laid along the ground **away from the sun** (the slope tangent, sign = −sign(L.x)), with α `0.35·(1 − haze·0.4)`, drawn with a radial gradient fade so it's soft-edged. For the figure, the same rule with a length `0.5H·shadowLen` from the feet midpoint. At dawn and golden hour the shadows run long down or up the slope, which makes time readable at a glance. At noon they shrink under the stone.
- **Contact AO:** a tight dark ellipse (width `0.8R`, height `0.10R`, α 0.55) **exactly under the contact point** (no offset), plus one per planted foot (width `0.09H`). This fixes the hovering stone (C7).
- **Golden-hour rim (p ≥ 0.7):** `rim` and `rimW` follow the table, so near the end the figure and stone get a bright warm edge, and the slope crest gets a 2 px `key` stroke at α `0.25 + 0.4·rim`. This is the "you're nearly there" cue.

### 3.3 Terrain v2: a mountain range with different tops (fixes C5, C9)

User request (round 3, second message): *"make it look more like a mountain with different tops."* Today the scene is one smooth ramp up to one flat summit. v2 makes it a **range**: a main mountain with a jagged skyline, false summits and a twin peak, in front of neighbouring peaks of different heights in hazy layers, the tallest with snow. The climb stays the clearest line in the frame, and the **true summit stays the highest point on screen**, so "how far is left" still reads at a glance.

#### 3.3.1 Anatomy (landscape, left to right)

```
                                   TRUE SUMMIT (highest point on screen, snow-dusted rock, cairn)
          far range (haze .70)          /\_            twin peak (0.88 of summit height above base)
     /\    /\/\       /\               /   \__  col   /\
 _/\/  \__/    \_/\__/  \___     ___/  bench3 \/\__/  \/\_   ← serrated arête descending right
    mid range (haze .45)    \/\_/  ___/ ◆ 75%            \/\__
          /\/\_    _/\_      ___/ bench2                      \__ near foothills (haze .22)
 ___/\/\_/     \__/  ___/ ◆ 50%
                 ___/ bench1
           _____/ ◆ 25%
   P0 ____/   (◆ = small cairn on each false summit)
```

- **The climb ridge** (the path) runs from P0 up the left skyline of the main mountain. It's broken into **four pitches separated by three benches**, the false summits. From below, each bench is a convex crest that hides what's beyond, so it reads as a top. Then the next, steeper pitch appears behind it.
- **The true summit** is a pointed rock block above the last pitch. The boulder rests on a short summit platform (the existing plateau, shortened to just what the standing and sitting poses need), with the cairn at its far end.
- **The back side:** from the summit, a steep drop into a **col** (a notch, 0.10–0.14 below the summit), up to a **twin peak** at 0.88 of the summit's height above the base, then a **serrated arête** of 3–5 teeth stepping down to the right edge. This gives the main mountain several tops of its own.
- **Neighbouring peaks** stand behind in three atmospheric layers (§3.3.4).

#### 3.3.2 Should false summits mark progress? Yes: 25%, 50% and 75%

The benches are placed so the boulder reaches the **centre of bench k exactly at p = k/4**. This is cheap, because the mapping already goes through a curve, and it's honest: the mountain itself becomes a quartered progress bar. It also fits the brand. Each false summit is the splash question made literal: *the mountain wasn't flat, and it isn't over.*

**Milestone beat** (about 1.4 s, plays when the boulder crosses a bench centre in `focus` or `open`; never on a fresh mount or reload, never in reduced motion, and skipped for blocks shorter than 15 minutes):

| t (s) | Beat |
|---|---|
| 0.0–0.4 | The gait finishes its current step. The lean eases from about 30° (bench lean, §3.3.5) to 22°, and the pelvis rises 0.02H. |
| 0.4–1.0 | **Look up:** headTilt eases to −10°, toward the next pitch and the true summit. The shoulders drop with one exhale (breath ×1.025, then release). The bench cairn gets a key-colour rim (α 0 → 0.6) and keeps it for the rest of the block, so passed milestones stay lit. |
| 1.0–1.4 | **Re-brace:** the lean returns to the push curve and the gait resumes from the key pose. |

There's no HUD text, no sound and no particles: it's a small rest, not a celebration (juice tier "small"). The progress mapping keeps running underneath, and the stone moves less than 1 px during the beat, so nothing has to catch up afterwards.

**Simpler fallback**, if the beat feels busy in review: keep the bench placement and the lit cairns, and drop the pose beat. Progress mapping and geometry stay identical either way.

#### 3.3.3 Generating the climb path (deterministic, seeded)

The path is generated once per layout from a **fixed seed** (`TERRAIN_SEED = 0x5157` per layout), so it's the same in every session and every screenshot. The peaks still vary along their length. It replaces the cubic `PathSpec` in `path.ts` but **keeps the `SlopePath` interface** (`at`, `tangentAt`, `normalAt`, `angleAt`, `groundY`, `length`, `plateauEndS`, `spec.p0`, `spec.plateauEnd`), so `rig.ts` and the engine keep working.

```ts
interface RidgeSpec {              // per layout, hand-set; the seed only jitters within these bounds
  p0: V; summit: V;                // fixed anchors (landscape p0 (0.10,0.12), summit lip (1.24,0.74); portrait p0 (0.04,0.10), lip (0.532,0.494))
  pitchDeg: [number, number][];    // 4 pitches, [startDeg, endDeg]: landscape [20,25] [24,30] [29,36] [35,42]; portrait [26,31] [30,37] [36,43] [41,48]
  benchLen: number;                // along-path length of each bench: landscape 0.075, portrait 0.05
  benchDeg: [number, number];      // bench gradient range [3, 7]: never flat, never downhill
  jitterDeg: number;               // ±3° seeded jitter on each pitch angle
  roughAmp: number; roughWave: number; // fine surface undulation: 0.003 amplitude, wavelength ≥ 0.08
  platformLen: number;             // summit platform: landscape 0.20, portrait 0.17
}

buildRidgePath(spec, rng = mulberry32(TERRAIN_SEED)):
  1. Turtle walk from p0: for each pitch i, the heading rises linearly from pitchDeg[i][0] to [1] (± jitter).
     After pitches 0–2, append a bench (heading eases down to benchDeg, holds, then eases back up).
     Each pitch's run starts at 1.0 and is varied by ±15% (seeded).
  2. Fillet every heading change with a minimum radius: convex crests r ≥ 2.2·R (boulder radius), concave
     hollows r ≥ 1.2·H. Do it by low-pass filtering the heading (a moving average over the needed arc
     length), not with sharp corners.
  3. Scale the walk uniformly about p0 so its end lands on `summit` (solve the scale, then a small shear
     on x if needed; re-check the angle bounds after scaling).
  4. Add the fine undulation along the normal: roughAmp·noise1(s·L/roughWave + seed). Its curvature is
     bounded, so it never breaks the fillet rule, and it's too small for the feet to show it as steps.
  5. Append the summit platform (heading 1–2°), then build the arc-length LUT (512 entries, up from 256).
  6. Record benches[k] = { sStart, sMid, sEnd } and summitS.
  Constraints, asserted in tests: heading ∈ [2°, 45°] landscape / [2°, 50°] portrait everywhere;
  heading never decreases by more than 1° outside the bench ease-ins; x is strictly increasing;
  the max gradient matches what the stride code handles today (strideScale and the pelvisY ceiling).
```

**Progress mapping through the benches.** Replace `e(p)` with a monotone piecewise curve through the knots `(0, s0)`, `(¼, benches[0].sMid)`, `(½, benches[1].sMid)`, `(¾, benches[2].sMid)`, `(1, s1)`, using monotone cubic Hermite interpolation (Fritsch–Carlson) so speed is continuous and never negative. Inside each quarter, the stone naturally slows on the steep end of a pitch and speeds up on the bench, which is the same "hardest part last" feel `e(p)` gave. `s0` and `s1` keep their current definitions. A reload at any p still renders directly, because the mapping is a pure function.

#### 3.3.4 The neighbouring range (three layers)

The three noise ridges are replaced by **peaked skylines**, so the neighbours have distinct tops rather than rolling hills:

```
skyline_i(x) = max over peaks k of [ h_k − |x − x_k|·slope_k ]     // a tent per peak, pointed tops
             + a_i·ridged(x·f_i + seed_i)                           // jagged edges
             + 0.35·a_i·noise1(x·4·f_i)                             // fine teeth
peaks are placed per integer world cell (hash-seeded, 0–2 peaks per cell), so ultrawide extends with no seams.
```

| Layer | Haze | Peaks per world unit | Height range (fraction of the true summit's height above the horizon) | slope_k | Snow |
|---|---|---|---|---|---|
| Far | 0.70 | 3–4 | 0.70–0.97 | 1.6–2.4 | yes, above the snowline |
| Mid | 0.45 | 2–3 | 0.45–0.80 | 1.2–2.0 | only the tallest one or two |
| Near foothills | 0.22 | 2–3 | 0.20–0.45 | 0.8–1.4 | no |

**Clarity rules (asserted in the geometry test):**

- No point of any range layer is higher on screen than `summitScreenY + 0.02·S`. The true summit always wins.
- Within ±0.12 world in x of the true summit, far-layer peaks are capped 0.06 lower, so the summit's silhouette is set against sky and haze, not another peak.
- A far peak may sit behind the twin peak or the arête, never behind the summit block.

**Snow caps.** Snowline: landscape world y 0.62, portrait 0.47. For every peak above it, fill from the skyline down to a ragged lower edge `snowline + 0.025·fbm(x·9)`, with fingers running down gullies (subtract `0.04·max(0, ridged(x·22))`). Split each cap along a line dropping from the peak: the sun side in `mix(#efe6da, key, 0.35)`, the shade side in `mix(#c9c3cf, ambient, 0.45)`. The caps also take their layer's haze. **On the main mountain**, the twin peak gets a full cap. The true summit gets only a **dusting** (snow patches in hollows on the back face and in a few strata ledges). **No snow within 0.02 below the climb path**, so the figure, boulder and trail always sit on rock and stay readable.

#### 3.3.5 Contact where the gradient changes

The current rule, "boulder centre = ground point + normal·R", is only right on straight or convex ground. With benches and fillets the stone must sit believably everywhere:

- **Boulder centre from an offset curve.** At build time, for each LUT sample compute `c = g + n·R`. Then, for every ground sample within ±1.3R of arc length, if `|c − g_j| < R`, push `c` away from `g_j` until the distance is R (two passes). Store this as `centreLUT`. Its arc length drives the rotation (`boulderRot = arcLen(centre)/R`), so the stone doesn't spin faster through a hollow. In a concave hollow the stone touches at **two points**, so the AO (§3.2) draws two contact ellipses there.
- **Hands follow the stone, not the ground under the feet.** `handAngles` uses the slope **averaged over the figure's footprint** (from the back foot to the stone's contact), smoothed with a 0.4 s critically damped filter. So the hands slide smoothly around the stone as it crests a bench instead of jumping.
- **Lean follows the gradient with look-ahead (anticipation).** `lean = pushLean(φ) + 0.6·(θ_ahead − 30°)`, clamped to 26°–52°, where `θ_ahead` is the slope at `sB + 0.5H` along the path, filtered over 1.2 s. The body starts digging in before the steeper pitch arrives and straightens slightly as the bench approaches. On a bench the lean settles around 30° (relief); on the last pitch around 50°.
- **Stride follows the local slope:** this already exists (`strideScale` by cos θ). Add +10% stride on benches. Each foot rotates to the slope under it (`groundAngleAt`), so a foot planted across a crest tilts correctly.
- **The pelvis height** keeps today's reach ceiling (`pelvisY` samples the path at the stride extremes), which handles concave and convex ground for free.
- **Over a crest** (onto a bench), the stone briefly rolls `0.012H` ahead of the push (a positive spring target in §3.7c for 0.5 s) and the figure takes one quicker step to catch up. **Into a hollow** (the start of a steeper pitch), the first two cycles have 10% shorter strides and a deeper hip. These two small moments make the gradient change feel like it has weight.

#### 3.3.6 Portrait versus landscape

| | Landscape | Portrait |
|---|---|---|
| Climb ridge | 4 pitches, 3 benches, `benchLen` 0.075, angles 20°→42° | 4 pitches, 3 benches, `benchLen` 0.05, angles 26°→48° (steeper, as today) |
| Main mountain back side | col + twin peak + 3–5 arête teeth, all on screen | col + twin peak, with the twin **partly cut off** at the right edge (world w 0.75); no arête |
| Range layers | far 3–4, mid 2–3, near 2–3 peaks per world unit, full width | far 2, mid 2, near 1 visible; peaks taller relative to the frame to fill the empty sky above the climb |
| Snowline | y 0.62 | y 0.47 |
| Milestones | same 25/50/75 bench rule | same |
| Clarity check | summit highest; cairn visible | summit highest; cairn and summit clear of the readout box (existing portrait lift rule) |

The seed is per layout, so turning a phone sideways changes the mountain (as it already changes the path today). Each layout is stable across sessions.

#### 3.3.7 Silhouette of the main mountain

The climb side is exactly the generated path, because the feet stand on it. Everywhere else the outline becomes rock:

- **Back side:** summit → col → twin peak → arête teeth (each tooth a tent of 0.03–0.06 height with `0.006·noise1(x·45)` chatter), then down to the right edge.
- **Left base:** a low foothill bump (`0.03·ridged`) so the climb starts from rubble, not a ruler line.
- **Gullies:** 3–4 darker vertical channels down the climb face below each bench (a gradient strip, α 0.15, `ambient` colour), plus scree fans at their feet. They visually anchor each false summit.

**Faces and lighting.** Split the body into two faces: the **climb face** (left of the summit, facing the viewer and the sun's arc) and the **back face** (right of the summit). Each is filled with its own linear gradient, perpendicular to its average slope:

```
climbFace: from crest (rockLit·key·(0.55 + 0.45·max(0, dot(nClimb, L)))) to base (rockShade mixed 30% with ambient)
backFace:  one step darker: rockShade → darken(rockShade, 0.25), with the same rule (it faces away for most of the arc)
```

The two faces meet along a soft ridge line from the summit down to the right foothill, which gives the mountain **volume** instead of a flat plane.

**Strata, not hatching.** Delete the 54 strokes. Instead, in mountain-local coordinates `(u` = along the path, `v` = depth below the surface along the normal`)`:

```
for k in 0 .. N-1 (N = 9 landscape, 7 portrait):
  v_k(u) = 0.035 + k·0.055 + 0.012·fbm(u·3.2 + k·7.1, 3 octaves)      // wavy bed lines, roughly parallel to the slope
  band k (between v_k and v_k+1): fill at ±6% luminance (alternate light/dark, plus hash1(k)·4%)
  ledge: stroke along v_k, 1.2 px, key colour α 0.18 on top edge (catches light)
  under-ledge: stroke 2 px below, rockShade α 0.22 (shadow line)
```

Clip all of it to the mountain body. **Joints:** 18–26 short dark cracks **perpendicular** to the strata (lengths 0.01–0.03), placed by hash, each a 2–3 segment jittered polyline at α 0.25, with a 1 px lit edge on the sun side. These perpendicular joints are what make the surface read as stone rather than sand.

**Detail texture (resize-only cache).** A greyscale canvas at **half resolution**, filled with `0.5 + 0.22·fbm(x/18, y/18, 4 octaves) + 0.08·hash(x, y)` (fine grit), written through `ImageData` once. At tint time, draw it over the faces with `globalCompositeOperation = 'overlay'` at α 0.35. This costs one `drawImage` per tint rebuild and gives the surface grain without per-frame noise.

**Scree near the path.** 40 small flat polygons (4–6 vertices, 0.004–0.012 wide), hash-placed within 0.06 below the path, each with a lit top edge in key colour α 0.3 and a dark lower edge. They sit **below** the walking line so they never intersect the feet.

**Remove the dark mid-slope smudge.** Don't apply the radial vignette to the land cache. Apply the vignette once, globally, at L11.

**Range layers with aerial perspective.** On top of the peaked skylines of §3.3.4, add:

- **Haze bands:** above each ridge's mean base, a vertical gradient strip of the horizon colour from α `0.35·haze` (at the ridge line) to 0 (0.06 S above). Stacked, these create the "valley mist between ridges" depth.
- **Lit ridge tops:** a 1 px top stroke in key colour at α `0.15·(1 − hazeᵢ)`.
- **Warmer far colours:** ridge colour = `mix(ridgeNear, horizon, hazeᵢ)`, then mix 15% toward `key`, so the ridges join the sepia family instead of the current cold grey.

**Foreground rocks (L10).** Two or three large dark rock shapes, each a noisy polygon with 9–12 vertices (radius 0.06–0.11 S), at the bottom-left corner and the bottom-right corner, overlapping the frame edge by 30–50%. The fill is `darken(rockShade, 0.35)` with a 1.5 px key-colour rim on the sun side at α `0.4·rim`, and a 1.5 px blur (`ctx.filter = 'blur(1.5px)'`, applied once at cache time) for a shallow depth of field. They **must not cover**: the path from P0 to the summit, the HUD readout box, or the control bar. Check with the boxes `s0 - 0.05 … plateauEnd` and the HUD rectangle from `src/focus`. In portrait, use only one rock, at bottom-left, at radius 0.07 S.

### 3.4 The figure v2 (fixes C1, C2)

**Approach: outline from skeleton plus width profile** (animal-proc-anim). The IK rig in `rig.ts` stays as it is: it still produces the pelvis, shoulder, head, knees, elbows, hands and feet. Drawing changes. For each limb we sample the bone chain and offset left and right by a **width profile**, then draw **one closed smooth path** through those points with quadratic midpoints (Catmull-Rom style). A whole limb (thigh and shin, through the knee) is one path, so there are no seams (S14 closed).

**Width profiles** (half-widths in units of H, front and back separately, sampled at t = 0, 0.25, 0.5, 0.75, 1 along each bone):

| Part | Front (side facing uphill or out) | Back | Notes |
|---|---|---|---|
| Thigh | .056 .062 .060 .050 .040 | .052 .056 .050 .044 .038 | quad mass in front |
| Knee | .036 | .036 | a single narrow point at the joint gives a clear knee |
| Shin | .034 .036 .030 .024 .020 | .036 **.046** .040 .028 .020 | **calf bulge at the back**; it grows ×1.08 during the push phase (muscle "squash", volume kept by narrowing the front 4%) |
| Upper arm | .034 **.042** .036 .030 .026 | .030 .034 .032 .028 .026 | deltoid at the top front, biceps |
| Forearm | .028 .032 .028 .022 .018 | .026 .030 .026 .020 .018 | |
| Torso | hip .085 → waist .075 → chest **.100** → shoulder .095 | back profile: hip .080 → lumbar .070 → **upper back .115** (trapezius hump) → neck .050 | the spine is a 3-point curve (pelvis → mid-back offset 0.02H outward → shoulder), so the back rounds under load |
| Neck | .040 → .034 | | angled forward 20° from the spine: the head juts toward the stone |

**Head:** an egg (ellipse rx 0.060H, ry 0.072H, long axis along headTilt) with a **brow notch** and a **jaw corner** on the face side (two small inward bends of 0.008H). The face points at the stone. **Hair:** a dark cap mass over the top and back (an ellipse 0.064H × 0.05H, offset back 0.012H), plus **two wisps**, each a 3-link chain (§3.5), rooted at the back of the head.

**Hands:** a mitten (palm ellipse 0.040H × 0.030H, plus a thumb nub of r 0.012H at 35° from the palm axis), with the palm axis **tangent to the stone** at the contact point, so the hand lies flat on the rock. Under load (push phase peak), the palm widens ×1.12 and the wrist bends 6° more: the hand takes the "squash", not the stone.

**Feet:** a wedge (heel r 0.022H, toe r 0.014H, length 0.12H). During the grip-stance push (φ 0.55 → 1.0 of that foot), the **heel lifts**: the foot rotates about the toe by `0 → 22°` with easeIn, which is the push-off that sells the drive. The heel is back down before the slip phase starts.

**Cloth:** a short wrap or loincloth at the hips, drawn as a 4-link chain anchored at the front hip and a 4-link chain at the back hip, filled as one ribbon, width 0.05H tapering to 0.02H. Link length 0.03H. It swings with the pelvis (follow-through) and blows with the wind.

**Values and lighting** (all from `LightState`):

1. **Base fill:** `figure` (still the darkest element in the frame, as now).
2. **Far side** (far arm, far leg): `mix(figure, ambient, 0.25)`, a little lighter and cooler, so the two sides separate.
3. **Bounce light:** on the near silhouette, a 0.02H band along the **underside** (the side facing the ground normal), in `bounce` colour at α 0.14. It's the warm rock lighting the man from below, and it gives the torso and arms roundness.
4. **Rim light:** the existing offset-silhouette technique, now with width `rimW` (1.5–2.75 px), colour `key` and α `rim·0.8`. Apply it to the boulder too.
5. **Muscle highlights** (quality 1 only): 3 short strokes on the sun side, on the deltoid, the upper back and the calf, α `0.10·rim`. These are "solid drawing" hints, not detail.

Draw order is unchanged: far limbs → torso/head/hair/cloth back chain → boulder → near limbs → cloth front chain → rim pass.

### 3.5 Chains for hair and cloth (overlapping action)

A Verlet chain with distance and angle constraints (the animal-proc-anim technique, simplified). Pooled vectors, with no allocation per frame:

```ts
// per chain: pts[0] is pinned to its anchor on the body every frame
step(dt):                                   // fixed substep 1/60 s, at most 3 substeps per frame
  for i in 1..n: v = (p[i] - prev[i]) * damping(0.86)
                 prev[i] = p[i]
                 p[i] += v + (gravity(0, -0.9H/s²) + wind(t)·windK) * dt²
  repeat 2:                                 // constraint passes
    for i in 1..n: p[i] = p[i-1] + normalize(p[i] - p[i-1]) * linkLen
                   limit angle between links to ±maxBend (hair 35°, cloth 25°)
```

`windK`: hair 1.0, cloth 0.6. Because the chains integrate real motion, they **lag the body automatically**: when the pelvis surges, the cloth swings back and then catches up, which is the 200–350 ms drag at the bottom of the hierarchy. With reduced motion, or for a static snapshot, solve the chains to rest (20 iterations with the wind at its mean) so the frame is stable.

### 3.6 Ambient layer: sky, clouds, birds, wind, camera drift

**Wind.** One global `wind(t) = 0.06H/s · (0.7 + 0.6·noise1(t·0.13))`, pointing +x (uphill, into the figure's back), with **gusts** when `noise1(t·0.13 + 40) > 0.72`: ×1.8 over 2–4 s with slow-in and slow-out. It drives the cloud speed, hair, cloth, dust drift and wind streaks. One source, so everything agrees.

**Clouds v2.** Five sprites, each built at tint time on a small canvas (about 240×80 px at dpr 1): fill by `fbm(x/40, y/22)` thresholded with a soft edge (smoothstep 0.45–0.70), with an elliptical falloff mask. Colour the sprite by height: the **top 35% in `mix(horizon, key, 0.6)`** (lit by the sun) and the bottom in `mix(zenith, ambient, 0.4)` (shaded). Two depth rows: far (3 sprites, scale 0.7, speed 2.5 px/s × wind factor, α 0.55) and near (2 sprites, scale 1.0, speed 5 px/s, α 0.75). Clouds **never pass behind the boulder or the figure**: the band is `Hy + 0.22 … Hy + 0.48` in landscape, and if a cloud's box intersects the boulder's screen box, fade it to α 0.25 over 1 s. Wrap at the screen edges.

**Birds.** One loose group of 3–5 birds crosses the sky **every 70–140 s** (seeded), right to left, high (0.12–0.30 h from the top), over 18–26 s, on a gentle sine arc. Each bird is two quadratic strokes in an "m" shape, span 0.010 S, colour `darken(zenith, 0.55)` at α 0.7 (a silhouette). Flap: wing angle `±28°·sin(2π·3.2t + φᵢ)` for 1.2–2 s, then **glide** (wings at +8°) for 1.5–3 s, with each bird on its own phase. They spread in a loose V, with small independent bobbing (`±0.004 S`, period 2.1 / 2.6 / 3.3 s, co-prime). Off in reduced motion, paused, break, quality < 1, and during the summit beat (they would steal focus).

**Wind streaks.** At most 3 at a time. Each is a thin 0.6 px line, 0.04–0.08 S long, sliding uphill along the slope at `wind × 6`, 0.01–0.04 S above the surface, with α rising and falling 0 → 0.10 → 0 over 1.5 s. They spawn more often during gusts (every 2 s; every 6 s otherwise). They make the air feel alive without competing.

**Camera drift (parallax).** The camera stays fixed in meaning: the whole mountain is always in view. Add only a **breathing drift**: `camX = 0.004·w·sin(2πt/47)` and `camY = 0.002·h·sin(2πt/61)`. Layers offset by depth factor: sky 0, clouds-far 0.15, ridges 0.25 / 0.4 / 0.55, mountain + figure 1.0, foreground rocks 1.15. Maximum mountain movement is ±6 px at 1440, so progress reading is unaffected. This is the only source of parallax, and it's **off in reduced motion and paused**.

### 3.7 Motion v2: the push cycle

The `rig.ts` gait (`T = 2.6 s`, foot table, strain pause, heave) stays. Add:

**a) Lagged channels (drag hierarchy).** Evaluate the body curves at delayed phases:

```
pelvis:     hipH(φ), surge(φ)                         // root, leads
spineLean:  leanDeg(φ − 0.023)                         // ≈ 60 ms at T = 2.6 s
head:       headTilt(φ − 0.046) + 3°·noise1(t·0.4)     // ≈ 120 ms, plus a slow look-around
shoulders:  0.006H·max(0, sin(4π(φ − 0.035)))          // rise at each shove
```

**b) Anticipation before each step.** In the 0.12 s before a foot leaves the ground (φ 0.95 → 1.0 for that foot), the pelvis dips `0.008H` and the stone backs off `0.004H` as the load shifts onto the planted leg. The lift then starts from that dip.

**c) The stone gives back (weight, C4).** Replace `boulderNudge = 0.6·surge` with a **damped spring** on an offset `g` along the path (world units):

```
target(φ) = +0.6·surge(φ)                    // pushed forward on each shove
          − 0.010H·slip(φ)                   // rolls back while the planted foot slips
g'' = ω²·(target − g) − 2ζω·g'               // ω = 7 rad/s, ζ = 0.55: slight overshoot, settles in ≈ 0.5 s
sBdraw = sB(p) + g / L                        // progress itself is untouched
boulderRot = (sBdraw·L)/R                     // so the texture turns back a little on each slip
```

**d) Big slip (medium juice, about 1 in 7 cycles, seeded, never in the first 2 cycles after a strain pause).** During that cycle's slip phase: the foot slides an extra `0.08H`, the pelvis drops `0.015H` (easeOut, 0.25 s), the arms straighten (the elbow IK target moves 0.01H toward the stone), and the spring target adds `−0.030H`, so the stone rolls back visibly. Then a **recovery**: the next grip phase runs 15% slower, with the lean 3° deeper. Emit 6–8 dust puffs plus 1–2 pebbles.

**e) Breathing during the push.** An independent cycle: inhale 1.5 s, exhale 1.9 s (period 3.4 s, co-prime with the gait). Chest width ×(1 ± 0.015), shoulders ±0.004H. During a **strain pause**, the breath **holds** at full inhale (the tremor runs). On the heave it releases in a sharp 0.5 s exhale with the shoulders dropping 0.006H. That's a micro-story in every pause: brace, hold, shove, breathe out.

**f) Micro-variation (no two cycles alike).** At each new cycle draw seeded multipliers: stride ×(1 ± 0.10), lean +(±2°), surge ×(1 ± 0.20), lift ×(1 ± 0.15). Add slow noise drift: lean `±1.5°·noise1(t·0.21)`, hip height `±0.004H·noise1(t·0.17 + 9)`.

**g) Arcs.** The swing foot already follows `sin(π·u)` lift. Bias it so the **highest point is at u = 0.4** (`lift·sin(π·u^0.8)`): the knee comes up and forward early, then the foot reaches down. The head traces a small arc rather than a straight bob, because it combines the lagged lean and hip channels.

**h) Effort timing near the summit.** This already exists (T up to 25% slower). Add: the strain pause comes **more often** above sB = 0.7 (every 3–6 cycles instead of 5–9), and big slips stop above sB = 0.9 (the last stretch is a grind, not a stumble).

### 3.8 Boulder v2 (fixes C7)

- **Texture:** keep the noise mottling, lumpy outline and cracks. **Replace the sticker pits:** each pit is a soft radial gradient (dark centre α 0.35, fading out) with a lit lip on the side toward the *texture's* fixed up-light. Add **lichen flecks**: 10–14 tiny dots, `mix(boulderBase, #7a7a52, 0.4)`, α 0.35.
- **Lighting pass** (unrotated, clipped to the outline), from `LightState`:
  1. a key highlight: radial at `0.45R` toward L, colour `key`, α `0.30 + 0.15·rim`;
  2. a terminator shade: radial on the far side, colour `ambient` (not rockShade), α 0.55, so the shadow side takes the sky colour;
  3. **bounce:** a crescent on the lower edge near the ground, `bounce` α 0.18 (light reflecting back up from the slope);
  4. **rim:** the rim pass (§3.4) with `rimW`, at golden hour making a bright warm edge;
  5. **contact AO and cast shadow:** §3.2.
- **No squash on the stone.** It's rock, so solid drawing says no. The body takes the squash (hands, calves, elbows).
- **Grit:** during the heave and the big slip, 2–3 grains fall from the contact point and bounce once.

### 3.9 Particles v2

- **One dust sprite**, built at tint time: a 32 px radial puff, **two-tone**, with the side toward the sun in `mix(rockLit, key, 0.5)` and the other side in `mix(rockLit, ambient, 0.4)`. Draw each puff with `drawImage`, scaled and rotated toward L. This is cheaper than gradients and lit correctly.
- **Dust motion:** initial velocity back and down the slope (0.15–0.35 H/s), with `vx *= 0.92` per 1/60 s (ease-out drag), plus `wind × 0.5` and a slight rise. Radius grows ×2.5 with easeOut, α follows `0.35·(1 − u)²`.
- **Pebbles:** keep rolling down the path, with **restitution 0.35** on each hop, spin ∝ speed, and a tiny 1–2 puff burst at each bounce. At most 3 live.
- **Cap:** 60 live, pooled, as now. Wind streaks come from the same pool.

### 3.10 The summit beat v2 (fixes C10)

Total length **6.0 s** (unchanged). The HUD heading still arrives at 3.6 s. New beats are in bold:

| t (s) | Primary | Secondary / juice | Light & camera |
|---|---|---|---|
| 0.0–0.5 | **Anticipation: a last strain.** The gait freezes in the key pose, the pelvis drops 0.02H, the lean deepens to 50°, the breath holds, the tremor runs. | The stone backs 0.01H. | Rim already high (golden hour). |
| 0.5–1.6 | **Heave:** one fast cycle (×1.4), then the stone crests the lip (slow-in), rolls to the plateau centre and **settles on a damped spring** (±3°, ±0.01H, ζ 0.35). | **Large juice:** a dust ring of 12 puffs from the contact point and 2 pebbles back down the slope. Big exhale. | **Camera ease-in starts:** scale 1.00 → 1.04 about the summit point over 3.5 s (easeInOut). |
| 1.2–2.8 | **Stand up:** two steps onto the plateau, the lean eases 40° → 4°, the legs straighten. **Follow-through:** the head arrives 150 ms after the torso, the hair and cloth swing forward and settle (chain), the shoulders drop. | | **Light burst:** sun glow radius ×1.0 → ×2.2 (easeOut 1.2 s), then back to ×1.5. **Rays:** 7 soft wedges fan out from the sun behind the summit, α 0 → 0.10 → 0.05, rotating 0.3°/s. The rim reaches its max (0.95, 2.75 px) on the figure and the stone. |
| 2.8–4.0 | **Pose:** the near hand rests on top of the stone. The far arm hangs. **Chin lifts 12° toward the sun** (appeal: he's looking out, not down). One deep breath (chest ×1.03 over 2 s). | The wind gusts once (×1.8), and the hair and cloth stream toward the valley. | The sun sinks behind the summit (as now); the figure and stone are silhouetted in the glow. |
| 2.5–5.0 | | Stars, brightest first (as now). | **Vignette deepens** 0.28 → 0.38 (easeInOut 2.5 s). |
| ≥ 3.6 | HUD `Summit.` (unchanged). | | The camera holds at 1.04. |
| after | Overtime idle: weight shifts every 6–9 s, breathing, wind in hair. | Birds may return after 30 s. | The camera eases back to 1.00 over 4 s when the user acts (Keep going, Break, Clock out), before the roll-back. |

`instant: true` (restored completion) jumps straight to the final frame: camera 1.04, standing pose, chains solved to rest. The mini summit (open loop) uses only beats 0.0–2.8, with no rays, no camera move and no stars, as now.

### 3.11 Reduced motion, paused, phone

- **`prefers-reduced-motion` / in-app override:** there's no animation loop (as now). Each redraw is a **still frame** with the full v2 lighting, strata, foreground, cast shadows and chains solved to rest, in the key pose. There's no camera drift, no birds, no streaks and no particles. The frame redraws when progress changes enough to move the stone by 2 px or more, or once per 30 s, whichever comes first. The summit becomes a 400 ms cross-fade to the final frame (camera 1.00, no rays animation; rays drawn static at α 0.05). This follows the motion-design rule: decorative motion is fully removed and functional state (stone position, light) remains.
- **Paused:** as now (desaturate 35%, key pose, breathing only). The camera drift, birds, streaks and chains freeze (the chains settle to rest over 1 s, then stop).
- **Phone (portrait):** figure H 0.10·S as now. One foreground rock. The cloud band moves up (`Hy + 0.30 … Hy + 0.55`) into the empty sky above the climb, so the top half has gentle life. Birds fly at 0.30–0.45 h, below the readout. Rim widths are in CSS px, so they stay visible.

### 3.12 Performance budget

The target is unchanged: **≥ 30 fps headless at 1440×900** (DPR 2, back-buffer 1833×1146 after the existing 1.5 cap), with average draw ≤ 6 ms. The existing adaptive quality, DPR cap (`min(1.5, dpr)`) and the 1.3 MP cap above 3 MP all stay.

| Per frame | Budget (ms, headless) |
|---|---|
| Blit sky, ridges, mountain, foreground caches (4 `drawImage`, with the drift offset) | 1.2 |
| Sun + glow (+ rays at the summit) | 0.3 |
| Clouds (5 `drawImage`) + birds (≤ 5 paths) + streaks | 0.4 |
| Cast shadows + AO | 0.3 |
| Figure: ~6 outline paths + hair/cloth chains (≤ 3 substeps × 4 chains × 4 links) + rim pass (one offscreen composite) | 1.8 |
| Boulder: texture + 4 lighting fills | 0.6 |
| Particles ≤ 60 sprite `drawImage` | 0.6 |
| Grade (vignette + overlay `fillRect`) | 0.3 |
| **Total** | **≈ 5.5** |

Tint rebuild (every 2 s at most): sky, ridges, mountain faces + strata + detail overlay, foreground, 5 cloud sprites and the dust sprite. Budget ≤ 12 ms, **spread across frames**: rebuild one cache per frame in a fixed order, double-buffered, so no single frame spikes. The detail-texture `ImageData` build is resize-only (≤ 25 ms at half resolution, done once; on resize the old cache is scaled until the new one is ready).

**Quality tiers** (the existing trigger, avg > 22 ms over 90 frames):

| Quality | Drops |
|---|---|
| 1.0 | nothing |
| 0.75 | birds, wind streaks, muscle highlights, rays (static α 0.05 instead); chains 1 substep; particle cap 36 |
| 0.5 | camera drift, foreground blur (re-cache without the filter), detail overlay, cloud sprites (fall back to 3 flat ones); chains solved to rest every 4th frame; particle cap 20; rim pass every 2nd frame |

---

## 4. Today v2: longer, with a weekly card on top

### 4.1 Decisions

> **Reconciled with `docs/ROUND3_PLAN.md`** (pushed in parallel). Where content differs, the plan wins: the header also drops `Plan →` (the card's `Edit goals` links to `/plan`), the streak reads `N-day streak · best M`, the card adds a **sections done / assigned** row under the goals, the phone card is compact with a `Details` toggle, and the card under Start is the plan's **Up next** (current and upcoming blocks only, `now`/`next`). So §4.6's `done`/`later`/`missed` states are dropped, and `Clock in` must sit fully above the tab bar at 390×844. The visuals below (grid, bars, spacing, tokens) apply to the plan's content as-is.

- **Today scrolls.** Remove the one-screen lock (`height: 100dvh; overflow: hidden` in the `min-width: 1000px and min-height: 700px` block). Cards take their **natural height**. No card scrolls internally. This is what removes the Start card's empty middle: it was stretched to fill the viewport, and `.idle/.running { flex: 1; justify-content: center }` plus `.todayBlock { margin-top: auto }` then floated the content in whitespace (see `today-1440x900.png`).
- **New order:** header → banner → **This week** card (full width) → **Start** (left) + **Log** (right) → **Today's plan** (left, under Start).
- The header's **Week chip and streak chip move into the week card**, so nothing appears twice. The header keeps the title, the date and `Plan →`.

### 4.2 Desktop (≥ 1000 px wide; 1440×900 shown, content max 1100, padding 32)

```
┌ Today  Tue 27 Oct ─────────────────────────────────────────────────────────────── Plan → ┐
│ ⚠ "Ch 4 – Substitution" (planned Mon) isn't finished.     [Do it today] [Mark done] Dismiss │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ THIS WEEK · 26 Oct – 1 Nov                                          [ 4-day streak ]      │
│ 21:40 / 48:00      ██████████████░░░░░░░░░░░░░░░░░░░    45% · 26:20 to go  [On track]     │
│ ┌──────────────── Mon–Sun vs daily goal ────────────────┐  GOALS                           │
│ │      ▆▆                                               │  ● 48 h this week     [On track] │
│ │ - - -██- - -▆▆- - - - - - - - - - - - - - - 8:00 - -  │  ● 5 goal days · 3/5  [Behind]   │
│ │  ██  ██  ▓▓  ░░  ░░  ░░   ·                           │  ● OChem 10 h · 6:20  [On track] │
│ │ 8:12 9:05 4:23  —   —   —  rest                       │  All goals →                     │
│ │ Mon  Tue [Wed] Thu Fri  Sat Sun                       │                                  │
│ └───────────────────────────────────────────────────────┘                                  │
├─────────────────────────────────────────────┬─────────────────────────────────────────────┤
│▌START                                       │ Log  4:23 · 3 entries               [+ Add N] │
│▌ What      [● Organic Chemistry · Ch 4  ▾]  │ 09:02–10:40 ● OChem · Ch 4          1:38  ✎  │
│▌ Block     (25) (50) (90) (Until 15:00) [__]│ 11:00–12:05 ● LinAlg · §3           1:05  ✎  │
│▌ [        Clock in   Space                ] │ 13:10–now   ● OChem · Ch 4          1:40  ●  │
│▌ ─────────────────────────────────────────  │                                               │
│▌ TODAY  4:23 / 8:00   ████████░░░░░  3:37 to go                                           │
│▌ Section §3 Determinants 27:27 of ~10:00  ✓ Mark done D                                    │
├─────────────────────────────────────────────┤                                               │
│ TODAY'S PLAN                                │                                               │
│ 09:00–10:45 ● OChem · Ch 4      ✓ 1:38      │                                               │
│ 11:00–12:00 ● LinAlg · §3       ✓ 1:05      │                                               │
│ 14:00–15:00 ● Physics · Waves   now  [Start]│                                               │
│ 16:00–17:00 ● OChem · Ch 5      later       │                                               │
└─────────────────────────────────────────────┴─────────────────────────────────────────────┘
```

**Grid:**

```css
.today {
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  grid-template-areas: "head head" "banner banner" "week week" "start log" "plan log";
  grid-template-rows: auto auto auto auto 1fr;   /* plan row absorbs the leftover; log spans both */
  align-items: start;                             /* cards never stretch to fill: no floating content */
  gap: var(--space-4);                            /* 16 between cards, up from 12, since the page now breathes */
  padding-bottom: var(--space-12);
}
```

### 4.3 The weekly progress card

Component `WeekCard` (`src/pages/today/WeekCard.tsx`). It uses the `.card` surface. Data comes from ROUND3_PLAN: week minutes, week goal, per-day minutes (logged plus the live timer), daily goal, rest days, goals with `computeGoalProgress`, and streak.

**Row 1, the header:** eyebrow `THIS WEEK · 26 Oct – 1 Nov` (the existing eyebrow style, `--text-xs`, caps, `--text-muted`). Right-aligned: a `{n}-day streak` chip, hidden at 0, with the same tooltip as today's header chip. The whole card header links to `/timecard` (as the old Week chip did), via the date-range text only, so the card isn't one giant link.

**Row 2, the week total:** `21:40` in Plex Mono `--text-3xl` semibold, then ` / 48:00` in `--text-xl` `--text-muted` (the same pattern as `.keyNumber`/`.keyGoal`). Then the existing `ProgressBar` (height 8, flexible width) and on the right `45% · 26:20 to go` (`--text-sm`, mono numbers) plus a status chip (`chip-ontrack` / `chip-behind` / `chip-met`, neutral before a study day has passed, as in S8). When the goal is met: `48:00 / 48:00`, a full bar in `--ontrack`, and the chip `Met`. Over the goal: the bar overflows in `--over` with `+3:10 over`.

**Row 3, left: the Mon–Sun bars.** Reuse `BarChart` (`goal` = daily goal, `highlight` = today, `ghost` = planned minutes for days not yet past, `current` = the live day), with `height={148}`. Rules on top of what it already does:

- **Today:** its bar fill is `--accent`, the label is bold with an accent underline (2 px), and the value shows the live running total (it updates once a minute, not every second).
- **Past days:** bars in `--heat-3` (light) / `--heat-4` (dark). Days that met the goal get `--ontrack` fill.
- **Future days:** hatched ghost bars for planned minutes; no value; label `—`.
- **Rest days:** no bar, label `rest` in `--text-subtle`, and the goal line breaks over that slot.
- **Over the goal:** the part above the goal line is drawn in `--over`.
- Clicking a bar opens `/timecard` on that day (the existing `onBarClick`).

**Row 3, right: goals.** Up to 3 goals, each one row of 32 px: a course dot (or a neutral dot for total goals), the label (`48 h this week`, `5 goal days · 3/5`, `OChem 10 h · 6:20`) and a status chip on the right. If there are more than 3: `All goals →` links to `/review`. With no goals: `No goals this week. Set one →` (to the goals UI the planner names).

**Size:** about 220 px tall at 1440 wide. The bars column is `minmax(0, 1.6fr)`, the goals column `minmax(240px, 1fr)`, gap `--space-6`, and the columns are separated by a 1 px `--border` rule.

**Accessibility:** the bars keep `BarChart`'s `ariaLabel` ("Hours per day this week against the daily goal"). The card is a `<section aria-labelledby>` with its eyebrow as the heading (an `h2` styled as an eyebrow).

### 4.4 Start card, compacted

The content groups stay the same. Only the spacing changes:

- Remove `flex: 1; justify-content: center` from `.idle/.running`, and `margin-top: auto` from `.todayBlock`. Gaps: `--space-4` within a group, `--space-5` between the action group and the TODAY strip.
- **Idle:** the `What` and `Block` rows (as now), then the `Clock in` button (56 px, full width), then the TODAY strip (`4:23 / 8:00`, a bar, `to go`, and the section line). Height is about 300 px.
- **Running:** the eyebrow `CLOCKED IN SINCE 13:10`, the target, the readout at **64 px** (fixed, no longer `clamp(…8vh…)`), the actions row, then the TODAY strip. Height is about 330 px.
- The 4 px course-colour left border stays.
- **Acceptance:** no vertical run of empty space over 40 px inside the card in either state.

### 4.5 Log card

The Log card has natural height, with no internal scroll and no `max-height`. It shows up to **12 rows**. If there are more: a `Show all {n}` ghost button expands it in place. On the right column the Log card spans the Start and Plan rows. When the log is short, the card still has `min-height: 100%` of the Start card's height (`align-self: stretch` on `.log` only), so the two top cards line up. The empty state is unchanged: `Nothing logged yet. The boulder is waiting.`

### 4.6 Today's plan card (if ROUND3_PLAN includes it)

`PlanTodayCard`: today's planned blocks from the week plan. Each row is 40 px: the time range (mono, `--text-muted`), a course dot, `Course · Section`, then the state on the right:

- `✓ 1:38`: done (logged minutes), in `--ontrack`
- `now`: an accent chip, plus a `Start` button that pre-selects this block in the Start card and focuses `Clock in`
- `next`: a neutral chip, also with `Start`
- `later`: text only
- `missed`: `--text-subtle`, struck through

If nothing is planned: `Nothing planned today.` plus `Plan →`. If the planner drops this card, the grid becomes `"start log"` and the plan row is removed.

### 4.7 Phone (< 768 px): one column

```
┌ (title hidden) [Plan →] ┐
│ ⚠ banner (wraps)        │
├─────────────────────────┤
│ THIS WEEK  [4-day streak]│
│ 21:40 / 48:00  [On track]│
│ █████████░░░░░░  26:20 to go
│ ▆ ▆ ▓ ░ ░ ░ ·            │   bars height 96, 7 slots, labels M T W T F S S
│ M T W T F S S            │
│ ● 48 h week   [On track] │   max 2 goals, then "All goals →"
│ ● 5 goal days 3/5 [Behind]
├─────────────────────────┤
│▌START (as now)           │
├─────────────────────────┤
│ TODAY'S PLAN             │
├─────────────────────────┤
│ Log                      │
└─────────────────────────┘   + tab bar
```

Order on phone: **week → start → plan → log**. The week card is compact (about 250 px), so the Start card's Clock-in button still lands near the fold on a 390×844 screen. Its top edge should be within the first 520 px, so the button is reachable with one short scroll at most.

### 4.8 Tokens (add to `src/styles/tokens.css`, light and both dark blocks)

```css
:root {
  --week-bar-past:  var(--heat-3);
  --week-bar-today: var(--accent);
  --week-bar-met:   var(--ontrack);
  --week-bar-over:  var(--over);
  --week-goal-line: var(--border-strong);
  --week-card-bars-h: 148px;
  --week-card-bars-h-phone: 96px;
  --today-readout: 64px;
}
/* dark */
  --week-bar-past: var(--heat-4);
```

There are no new colours. Everything maps to existing tokens, so both themes and contrast are inherited.

---

## 5. Coder milestones

Each milestone ends green (typecheck, tests, build) with screenshots in `docs/screenshots/round3/`. The Today milestones (R1–R3) and scene milestones (R4–R9) are independent and can run in parallel.

| ID | Scope | Acceptance |
|---|---|---|
| **R0** | Vendored skills (done in this commit) | `.claude/skills/{motion-design,physics-intuition,follow-through-overlapping}` exist, each with `LICENSE` + `SOURCE.md`, no scripts. |
| **R1** | Today grid v2 + Start compaction (§4.1, §4.2, §4.4, §4.5) | At 1440×900 and 1280×800 the page scrolls (document height > viewport when the week card is present). No element inside Start or Log has `overflow: auto`. In both Start states there's no empty vertical run over 40 px (measure the gaps between child boxes). The Week/streak chips are gone from the header. Log shows 12 rows + `Show all`. Both themes. |
| **R2** | `WeekCard` (§4.3) with ROUND3_PLAN data | Fixture week (Mon 8:12, Tue 9:05, Wed 4:23 live, Sun rest, goal 48 h, daily 8 h): the bars show today highlighted, Mon/Tue as goal-met in `--ontrack`, Sun labelled `rest` with no goal line, Thu–Sat as hatched ghosts. The total reads `21:40 / 48:00`, and the chip is the planner's status. The live day updates within 60 s while running. Bar click → `/timecard` that day. Phone 390: card ≤ 260 px tall, Start's top within 520 px. |
| **R3** | `PlanTodayCard` (§4.6), if planned | States done/now/next/later/missed render from the fixture. `Start` pre-selects the block and focuses Clock in. |
| **R4** | Light model (§3.2): `LightState`, sun per frame, cast shadows, contact AO, warm noon, golden rim | Snapshots at p = 0, 0.5 and 0.95: the rim on the figure is visibly wider and warmer at 0.95 than at 0.5 (sample pixels on the sun side). The boulder shadow is long at 0 and 0.95 and short at 0.5. The stone's AO touches the contact point (no gap). Unit test: `lightState(paletteP)` is continuous (no jump over 5% in any channel between p steps of 0.01). |
| **R5a** | Ridge path + range terrain (§3.3.1–3.3.7): `buildRidgePath`, bench progress knots, offset-curve boulder centre, look-ahead lean, peaked range layers, snow, milestone beat | Path tests per layout: heading bounds, fillet radii, strictly increasing x, determinism (same seed ⇒ identical LUT). `sB(¼)`, `sB(½)` and `sB(¾)` land on the bench centres within 0.5 px, and the mapping is monotone. The stone never penetrates the ground (min distance from centre to ground ≥ 0.99R across s). The hands move continuously across a crest (max jump < 1 px per frame). Range geometry: the true summit is the highest skyline point at 1440×900, 1280×800, 390×844 and 3440×1440, and no snow lies within 0.02 of the path. The milestone beat plays once per bench crossing and never after a reload. |
| **R5** | Mountain surface + range haze + foreground (§3.3) | The diagonal hatching is gone. Strata bands and perpendicular joints are visible. The back side is jagged with two shoulder steps. There's no mid-slope dark smudge. The haze bands are visible between ridges. The foreground rocks never overlap the path box or the HUD/control boxes at 1440×900, 1280×800, 390×844 or 3440×1440 (geometry test, like `scenes.geom.test.ts`). |
| **R6** | Figure v2 drawing (§3.4) | One path per limb (no seams at 4× zoom). Calf, deltoid, upper-back mass and the jutting head are readable in a 4× crop at 1440. Hands lie tangent on the stone. The heel lifts in the grip phase. Hair and cloth exist. The figure is still the darkest element. Geometry tests: the outline is closed, there are no NaN points, and the hands and feet stay within 0.5 px of their IK targets. |
| **R7** | Motion v2 (§3.5, §3.7, §3.8, §3.9): lag channels, anticipation, spring give, big slip, breathing, micro-variation, chains, dust v2, pebble bounce | A 20-frame contact sheet at 130 ms shows the head lagging the torso and the cloth trailing the pelvis. A big slip occurs within the first 30 s at the fixed seed: the stone visibly rolls back and recovers. The chain link lengths stay within ±1% over 10 s, with no NaN. Same seed ⇒ identical frames (determinism test). |
| **R8** | Ambient (§3.6): wind, clouds v2, birds, streaks, camera drift | Clouds never sit behind the stone (box test across p = 0…1). Birds appear within 140 s at the fixed seed and never during the summit. The camera drift is ≤ 6 px at 1440. All ambient is off with reduced motion and paused. |
| **R9** | Summit v2 (§3.10) | The sequence sheet shows the strain hold → crest + dust ring → stand with follow-through → chin up, hand on stone, rays, camera at 1.04, vignette deeper. `Summit.` still at 3.6 s ± 0.1. `instant: true` renders the final frame directly. |
| **R10** | Perf + reduced motion (§3.11, §3.12) | Headless 1440×900 at dpr 1 and 2: ≥ 29 fps, avg ≤ 6 ms. 390×844 at dpr 3: ≥ 29 fps. 3440×1440: no worse than round 2 (≈ 22 fps) and quality steps down. With reduced motion: no rAF loop, the still frame has the full lighting, and it redraws on progress. No single frame over 33 ms caused by a tint rebuild (rebuilds spread across frames). |

**Out of scope:** WebGL, image assets, sound, and any change to the progress mapping, phases or timer behaviour.
