# Productive: focus mode and one-screen Today — design spec

Owner: designer agent · Status: v1, ready to implement · Builds on `docs/DESIGN.md` (tokens, components) · Behaviour spec: `docs/FOCUS_PLAN.md` (planner, written in parallel; if the two disagree on *behaviour*, the plan wins; on *looks and motion*, this doc wins)

**In one line:** Today fits on one screen. When you clock in, the timecard folds away and a **procedural day-cycle sky** fills the window: the sun rises at the start of your focus block, crosses the sky as the block passes, and sets as it ends, and then the stars come out.

---

## 1. Research summary and decision

### 1.1 What exists, and what people respond to

| Pattern | Examples | How time reads | What motivates | Risks / notes |
|---|---|---|---|---|
| **Growth (living thing)** | Forest, Flora, Focus Plant | Seed becomes a tree over the session. Finished sessions build a forest. | Visible stakes and loss aversion (leaving kills the tree). A collection that grows. Real-tree tie-ins. [Forest App Store][forest], [ClickUp review][clickup], [Flora review][flora-bob] | Forest owns this image. The tree is small on screen, so it's a poor fit for "full-screen and immersive". The punitive dead tree clashes with our principle *calm, not gamified*. Focus Plant goes further into game rewards (raindrops, worlds) [Focus Plant][focusplant], [comparison][fvfp]. |
| **Depletion (something runs out)** | Time Timer red disk, hourglass, Sundae (ice cream melts, candle burns), Melty, FreezeFocus, Ice Study, Ice Focus | The amount left is the time left, so you read it without digits. | You can read it at a glance with no numbers to parse. It helps with time blindness and ADHD (claims are anecdotal) [Time Timer][timetimer], [visual-timer guide][gp], [Sundae][sundae] | **Ice melting is crowded now:** at least five App Store apps are built on it [Melty][melty], [FreezeFocus][freeze], [Ice Focus][icefocus]. Depletion can feel like pressure ("time is running out") rather than progress. |
| **Ambient scenes** | Tide (ocean, rain, forest), LifeAt (100+ lofi/HD scenes), Lofi.co, Lofi Cafe | Usually they don't show time at all. A separate small timer sits on top. | Calm atmosphere and a sense of "a place to work" [Tide][tide], [LifeAt/Lofi.co via Gridfiti][gridfiti] | The scene doesn't encode progress, so you still watch digits. Looping video is heavy. |
| **Generative / adaptive** | Endel (each soundscape has its own generative visual) | Doesn't show time | Endless and never repeats. Feels personal [Endel][endel], [Readymag on Endel][readymag] | Effectiveness numbers are company-sponsored [Endel][endel]. |
| **Breath / bloom** | Apple Watch Breathe/Mindfulness, Vision Pro Mindfulness | A shape expands and contracts with the breath | A meditative rhythm [Mindfulness listing][mindful], [9to5Mac][9to5] | It's a rhythm, not a progress display. It would distract if it looped for 50 minutes. |
| **Minimal timer** | Pomofocus, Session, Flow, Be Focused | Digits and a ring | Fast and plain. Tasks and pomodoro counts [Pomofocus][pomofocus], [Session][session] | No atmosphere, which is the thing the user is asking for. |
| **Sky / sun** | Sun-clock apps (Sol, Zenrise, Sunrise Sunset Widget) | The sun's position stands for the time of day | Everyone already reads the sun as a clock [search summary][sunsearch] | **No focus timer we found is built around the sky.** That gap is open. |

**Takeaways that shaped the decision**

1. **The best progress visuals need no digits.** Time Timer, hourglasses and ice timers work because the *amount* is the time [Time Timer][timetimer]. Our animation must encode progress just as plainly, and digits are optional.
2. **Growth motivates more than depletion.** Forest and Flora frame time as *building something*. Depletion timers frame it as *losing something*. We want a journey that *arrives* somewhere, not a countdown to zero.
3. **Ambient scenes are loved but don't carry progress.** Tide and LifeAt prove people want a full-screen *place*. They also keep a separate timer because their scene doesn't change with time.
4. **Avoid punishment and gamification.** It fits DESIGN.md §1.5. ClickUp's review says gamification fails when it "feels silly to you" [ClickUp][clickup].
5. **Motion safety.** Large motion that scales, zooms, pans or spins can trigger vestibular symptoms. Opacity and colour changes generally don't. Moving content longer than 5 s needs a way to pause or stop it (WCAG 2.2.2) [web.dev motion][webdev], [MDN via Pleo][pleo].
6. **Power.** Browsers throttle or stop `requestAnimationFrame` in background tabs, but the policy varies and changes, so we pause ourselves on `visibilitychange` [Chromium blog][chromium], [motion.dev][motiondev]. iOS throttles rAF in Low Power Mode [motion.dev][motiondev].

### 1.2 Decision: "Daylight", a procedural day-cycle sky

One block of focus is one day. At clock-in the sun rises on the left over layered mountain ridges and a still lake. It arcs across the sky as the block passes: morning, noon, golden hour. It touches the right-hand horizon as the block ends. Then the sky turns violet, the stars fade in, and a single shooting star crosses. That is the completion moment.

Why it beats the alternatives:

- **It reads at a glance.** Everyone already reads the sun as a clock: low left is the start, overhead is halfway, low right means almost done. A faint dotted arc shows the path still ahead, so it also works as a progress bar. Colour temperature adds a second cue (cool dawn, white noon, amber dusk).
- **It moves toward something.** You aren't draining a tank. You're travelling through a day toward evening, which is a reward state. Stars that appear only when you finish make a calm reward that isn't a game: no points and no dead trees.
- **It looks good at any moment.** Every frame is a landscape painting, so there is no ugly half-melted state.
- **It's calm.** The sun moves about one screen-width over 25–90 minutes, far below the threshold of noticeable motion. Clouds drift and the water shimmers faintly. Nothing pulses and nothing flashes.
- **It's open ground.** No focus timer we found uses a sky ([search][sunsearch]), while ice ([Melty][melty], [FreezeFocus][freeze]) and trees ([Forest][forest]) are taken.
- **It's cheap to build.** One fragment shader, about 150 lines of GLSL, with no assets, no libraries and no textures. Night is the same shader with the sun below the horizon, so **breaks and overtime come free** (night sky and a moon), and focus and break become day and night.

Rejected: **ice melting** (crowded, reads as loss, and convincing refraction is expensive); **growing tree** (Forest's identity, small on screen, and branching L-systems are harder to make beautiful at every frame); **candle** (pure depletion and visually small); **fire/embers** (flicker and constant particle motion distract, and particles cost CPU).

**Alternate scene (optional, same shader):** *Nightfall* swaps the roles for late-night studying. The moon crosses a starry sky and the completion is the first blue of dawn on the right. It's a uniform flag and a palette set, so it's cheap. Ship it only if Daylight is done and solid. Settings → Focus → Scene: `Daylight` | `Nightfall` | `Auto` (Nightfall when you clock in between 21:00 and 05:00).

---

## 2. Focus mode experience, beat by beat

Times are from the moment the user activates **Start focus**. Durations and easings are tokens (§6).

### 2.0 Assumptions about behaviour (confirm against FOCUS_PLAN.md)
- Clocking in with a block starts the normal timer **and** enters focus mode. A setting "Open focus mode when I clock in" defaults to on.
- **Esc** leaves focus mode but **does not clock out**. The timer keeps running and the ClockPill shows it (DESIGN.md §1.1, the clock is always visible). The ClockPill gets a "◐ Focus" button that returns to focus mode.
- When the block ends, the timer **does not stop on its own**. The user picks Break, Keep going or Clock out. If they ignore it, it becomes overtime (§2.4).

### 2.1 Transition in (≈1.3 s, interruptible)

| t (ms) | What happens |
|---|---|
| 0 | The Start focus button shows its pressed state. The `<FocusSky>` canvas mounts in a `position:fixed; inset:0; z-index: 100` layer, already rendering the **dawn frame (p = 0)**, with `clip-path: circle(0px at <button centre>)`. |
| 0–280 | Every Today card except the timer card fades out: `opacity 1→0`, `translateY 0→6px`, `scale 1→0.985`, staggered **24 ms** per card in reading order, `--ease-in` (focus). The sidebar fades with the last card. |
| 120–920 | **The day opens from where you pressed.** The clip-path circle grows to `circle(150vmax)` over `--dur-focus-open` (800 ms), `--ease-focus` (`cubic-bezier(0.65, 0, 0.35, 1)`). The timer card fades under it. |
| 700–1300 | The overlay chrome fades in (`opacity 0→1`, 400 ms) with the sun already half above the horizon. The overlay's readout starts at the block length (`50:00`). |
| 1300 | Steady state. The app root gets `inert` and `aria-hidden` behind the overlay, focus moves to the overlay's primary control, and `document.title` = `"47:12 left · Organic Chemistry"`. |

**Reduced motion:** no clip-path circle and no translate or scale. The cards and the sky cross-fade over 240 ms.
**Interruptible:** pressing Esc during the transition reverses from the current point.
**Real fullscreen** is not requested by default (Esc would then be eaten by the browser). **F** toggles `requestFullscreen()` on the overlay, with a hint in the controls.

### 2.2 Steady state

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ORGANIC CHEMISTRY · CH 4 – SUBSTITUTION                                    ⛶ F   ✕ Esc│ ← top bar, auto-hides
│                                                                                      │
│                                 ·  ·  ·  ·  ◯  ·  ·  ·  ·                            │ ← sun, dotted arc ahead
│                     ·  ·  ·  ·                            ·  ·  ·                     │
│            ·  ·  ·        ~~ clouds drift ~~                       ·  ·              │
│     ·  ·                                                                    ·        │
│ ─────/\────/\/\─────────/\──────────────────/\/\/\──────────/\────────────────────── │ ← ridges, 3 layers
│ ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ ∣ glitter ∣ ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ │ ← lake, reflection
│                                      27:48                                           │ ← readout, stays (dim)
│                               left · ends 9:40 PM                                    │
│                       [ ❚❚ Pause  P ]  [ ■ Clock out  O ]                             │ ← controls, auto-hide
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Readout:** centred in the lower third, sitting on the lake: `--font-mono` 400, `clamp(48px, 7vw, 88px)`, `--focus-ink` at 0.92. Tabular. `mm:ss` under an hour and `h:mm:ss` above. A caption below in Plex Sans 14 `--focus-ink-muted`: `left · ends 9:40 PM`. Clicking the readout (or **T**) cycles **remaining → elapsed → hidden**. Hidden leaves only the sky, Time Timer style, and the choice is remembered. A soft text shadow `0 1px 12px rgba(0,0,0,0.35)` keeps it legible over the bright noon sky and the water glitter.
- **Top bar:** course · section in Plex Sans 12/600 caps (`--tracking-caps`), `--focus-ink-muted`, top-left at 24px (phone: 16px + safe-area). Top-right: ghost icon buttons for fullscreen (F) and exit focus (Esc), labelled "Exit focus (timer keeps running)".
- **Controls:** a row of two pill buttons on a frosted backing: `background: var(--focus-glass)`, `backdrop-filter: blur(12px)` (no blur under `prefers-reduced-transparency`; fall back to a solid `--focus-glass-solid`), radius-full, height 44px, Plex Sans 14/500 `--focus-ink`. **Pause** (P; behaviour from the plan) and **Clock out** (O). An inline `kbd` hint sits in each button at 0.6 opacity.
- **Auto-hide:** after **3 s** with no pointer movement, key press or touch, the top bar and controls fade to 0 over 600 ms and the cursor is hidden (`cursor: none` on the overlay). The readout dims from 0.92 to 0.55 but stays visible unless the user chose hidden. Any `pointermove` beyond 4px, `keydown` or `touchstart` brings everything back in 160 ms. Chrome never hides while an element inside it has keyboard focus, or while a dialog is open.
- **Screen readers:** the overlay is a `role="dialog" aria-modal="true" aria-label="Focus mode"`. The canvas is `aria-hidden`. A polite live region announces at 50%, at 5 minutes left and at completion ("Halfway through your 50 minute block"). It is never announced per second.
- **Pause visual:** progress freezes, ambient motion drops to 25% speed, the sky desaturates 35% (a `u_pause` uniform mixes toward luminance over 400 ms), and the readout shows `PAUSED` in caps above the digits.

### 2.3 Block complete (the climax, ≈6 s, plays once)

Triggered when `p` reaches 1. `u_complete` animates 0→1 over **6000 ms** (linear in time; each effect below has its own easing):

| u_complete | Visual |
|---|---|
| 0.00–0.25 | The sun slips fully below the right-hand horizon. The water glitter stretches long and then fades. |
| 0.10–0.45 | **Afterglow:** the band above the horizon flares crimson to magenta (`--sky-afterglow`). A soft violet "Belt of Venus" band rises opposite (left) and fades. |
| 0.25–0.85 | **Stars come out** from brightest to faintest: each star has a hash brightness `b`, and it appears when `u_complete > 0.25 + 0.6*(1-b)`. The evening star (§3.4) is already there. |
| 0.55–0.70 | **One shooting star** crosses the upper third, left to right and slightly down, 0.9 s long with a fading tail. It is the only fast motion in the whole feature, and it's skipped under reduced motion. |
| 0.60→1.0 | The overlay shows **"Block complete"** in Plex Sans 20/600 above the readout, which now reads `50:00` and stops counting down. |
| 0.70 | The **completion card** fades and rises (8px, 400 ms) at the bottom: `Nice work: 50 minutes on Organic Chemistry.` with buttons **[Take a 10-min break  B]** (primary, `--focus-accent`), **[Keep going +25  K]**, and **[Clock out  O]**. Chrome auto-hide is suspended until the user picks one. |

**Chime (optional):** a soft two-note bell made with WebAudio, so no asset. Sine oscillators at 659 Hz then 988 Hz, 180 ms apart, each with an exponential decay over 1.6 s, peak gain 0.06, through a low-pass at 3 kHz. It plays only if Settings → Focus → "Chime at end of block" is on (default **on**) and the AudioContext was created or resumed inside a user gesture (the Start focus click). If `audioCtx.state !== 'running'` at completion, it stays silent. Never autoplay.

Also on completion: `document.title` → `"✓ Block done · Productive"`. If the tab is hidden, fire a `Notification` only if permission was already granted (never prompt here).

### 2.4 Overtime (block over, user did nothing)

The scene stays at night. The readout switches to `+3:12` in `--focus-ink-muted` with the caption `past your 50 min block`. A **thin crescent moon** rises on the left and crosses over **60 minutes** of overtime (`p_moon = overtime / 60min`, clamped), using the same arc as the sun at 60% of its height. The completion card shrinks to a pill `Block done · [Break] [Keep going] [Clock out]` that follows chrome auto-hide.

### 2.5 Break state

**Take a break** clocks out or pauses per the plan and starts a break countdown (default 5 min after 25, 10 min after 50 or 90, editable). The scene is **night**. The moon crosses over the break length (`p_moon = elapsed/breakLen`) and the stars twinkle slowly. The readout is `9:12 break` in `--focus-ink-muted`. In the **last 15%** of the break, a pre-dawn glow (`--sky-predawn`) grows on the *left* horizon, signalling "a new day is coming". When the break ends, the sky sits at the dawn frame (p = 0, sun just below the horizon) and the card reads `Break's over. Ready for the next block?` with **[Start 50 min]** (repeats the last block, Enter) and **[Exit focus]**. Day after night gives the pomodoro rhythm without a single digit.

### 2.6 Transition out (≈700 ms)

On **Esc**, **Clock out**, or **Exit focus**:
1. 0–160 ms: the overlay chrome fades out.
2. 80–620 ms: the sky clip-path shrinks to `circle(0 at <timer card centre>)` over `--dur-focus-close` (540 ms, `--ease-focus`). Under reduced motion it's a 240 ms cross-fade.
3. 300–700 ms: the Today cards fade back in, staggered 24 ms, `translateY 6px→0`, `--ease-out`. On Clock out, the usual "Logged 0:50 to Organic Chemistry · Undo" toast appears (DESIGN.md §4.12).
4. When done, the canvas unmounts, which releases the WebGL context (`WEBGL_lose_context.loseContext()`), and focus returns to the timer card's primary button.

---

## 3. The animation: "Daylight" in implementable detail

### 3.1 Rendering approach
- **Primary:** WebGL 1 (or WebGL2 when available, but use the GLSL ES 1.00 subset so one shader serves both) with a single full-screen triangle and **one fragment shader**. No textures and no framebuffers. All shapes are analytic or value-noise.
- **Fallback:** if `getContext('webgl')` fails or `webglcontextlost` fires twice, use **Canvas 2D**: a linear-gradient sky from the same palette, a radial-gradient sun and glow, the three ridge silhouettes as precomputed `Path2D` polygons (1D value noise sampled every 8px, rebuilt on resize), the lake as a flipped gradient with 12 glitter dashes, and stars as `fillRect` dots. No clouds. Redraw at **10 fps** at most.
- **Last resort / reduced data:** a CSS `linear-gradient` from the current keyframe colours, updated each minute.
- **Component:** `<FocusSky progress={p} complete={c} mode="day|night" moonProgress paused reducedMotion />` with a self-contained rAF loop. React does not re-render per frame: props go into a ref and the loop reads them.

### 3.2 Scene composition (bottom to top, all in one shader)
Coordinates: `uv` in 0..1 (origin bottom-left), `aspect = w/h`, `q = vec2(uv.x*aspect, uv.y)` for isotropic shapes. Horizon at `H = 0.36` (phone portrait `0.40`).

1. **Sky gradient:** `mix(horizonCol, zenithCol, pow(y', 0.6))` where `y' = (uv.y - H)/(1 - H)`. Add a warm **sun-side scatter** term: `sunCol * glowAmt * exp(-dist(q, sunQ) * 3.0)` plus a broad horizon band `bandCol * exp(-abs(uv.y - H) * 14.0)`.
2. **Stars:** grid-hashed points (cell size 1/140 of the shorter side). Each cell gets a random offset, brightness `b`, and twinkle phase. Twinkle `0.75 + 0.25*sin(t*0.8 + phase)` (slow, never flashing). Masked above `H + 0.02` and by `starVis`.
3. **Sun:** a disc with `smoothstep(r, r*0.92, d)` (soft edge), colour `sunCol`, plus a two-term glow `0.35*exp(-d*9.0) + 0.15*exp(-d*2.5)`.
4. **Moon (night modes):** a disc minus an offset disc for the crescent, `--sky-moon` colour, with a small glow.
5. **Clouds:** 4-octave fbm in `q * vec2(1.2, 3.0) + vec2(t*0.004, 0)` (wide, flat cumulus bands), thresholded with `smoothstep(0.55, 0.8, n)`. Coverage is 25% at most, limited to the band `H+0.08 … H+0.45`. Lit colour = `mix(cloudShade, sunCol, litAmt)` where `litAmt` rises near the sun and when the sun is low (pink undersides at dawn and dusk).
6. **Ridges, three layers, far to near:** height `h_i(x) = H + base_i + amp_i * ridgedFbm(x*aspect*freq_i + seed_i)` with 5 octaves.
   `base = [0.035, 0.015, -0.005]`, `amp = [0.10, 0.075, 0.05]`, `freq = [1.4, 2.6, 4.5]`. Colour `mix(ridgeNear, horizonCol, haze_i)` with `haze = [0.70, 0.45, 0.18]` for atmospheric perspective. A thin rim light on each ridge top faces the sun: `+ sunCol * 0.25 * rimMask * (1 - e)`.
7. **Lake** (below `H - 0.02`, from the bottom up to the nearest ridge foot): reflect by sampling the sky, sun and ridges at `uv.y' = 2*Hwater - uv.y` with a horizontal ripple offset `0.004*sin(uv.y*220.0 + t*1.2) * depthFade`. Darken by 0.72 and tint toward `waterTint`. **Glitter path:** under `sunX`, `sparkle = step(0.985, hash(floor(vec2(uv.x*300, uv.y*90 + t*0.6))))`, masked by `exp(-abs(uv.x - sunX)*18)`, intensity `0.6*(1 - e) + 0.25` (stronger when the sun is low).
8. **Vignette and grain:** `col *= 1 - 0.28*pow(length(uv - 0.5)*1.25, 2.2)`. Add ±1/255 hash dither to kill gradient banding (important on large dark skies).

### 3.3 Progress mapping (p ∈ [0,1] = elapsed / blockLength)

```
e      = sin(PI * p)                                   // sun elevation 0..1..0
sunX   = mix(0.10, 0.90, p)                            // across the width (uv space)
sunY   = H - 0.025 + e * arcH                          // arcH = 0.46 desktop, 0.40 phone
sunR   = baseR * (1.0 + 0.22 * (1.0 - e))              // baseR = 0.036 * min(w,h)/h; bigger near horizon
glow   = 0.55 + 0.45 * (1.0 - e)                       // more glow when low
arcAhead = dotted arc from p to 1, alpha 0.10 (desktop) 0.14 (phone), dots every 1.6% of path
starVis  = smoothstep(0.93, 1.0, p) * 0.25 + u_complete * 0.75
eveningStar = smoothstep(0.88, 0.92, p)                // ONE bright star appears at 90%: "almost there"
pal    = palette(p)                                    // keyframes below, smoothstep-blended
```
The dotted path ahead of the sun is a 1D distance-to-curve test on the parametric arc, so no geometry is needed. It's the precise "how much is left" cue. Dots behind the sun are not drawn.

**Palette keyframes.** Every stop defines zenith, horizon, sun, the far and near ridge colours, and the water tint. The palette is deliberately **muted and low-luminance**: the brightest sky pixel stays below about L* 72, so a noon sky in a dark room at 11 PM doesn't glare. Focus mode is always dark-chromed (§3.7).

| stop p | name | zenith | horizon | sun | ridge far | ridge near | water tint |
|---|---|---|---|---|---|---|---|
| 0.00 | dawn | `#1d2340` | `#c88a8f` | `#ffc9a3` | `#4a3f5c` | `#1a1726` | `#2a2540` |
| 0.12 | sunrise | `#2b3a66` | `#e6a98a` | `#ffe0b8` | `#55506e` | `#1c1c2b` | `#2c3350` |
| 0.30 | morning | `#2f5687` | `#9fc0d6` | `#fff4e0` | `#5d6f86` | `#202836` | `#2b4560` |
| 0.50 | noon | `#2c5a8f` | `#a9c7da` | `#fffaf0` | `#647891` | `#222c3a` | `#2d4a66` |
| 0.72 | afternoon | `#2d4f80` | `#c9c0a8` | `#ffe9c2` | `#6a6c7c` | `#252633` | `#33415a` |
| 0.86 | golden hour | `#2b3d6b` | `#e8a868` | `#ffc27a` | `#6b5566` | `#241c27` | `#3a3346` |
| 0.96 | sunset | `#24284f` | `#e07a52` | `#ff9a5c` | `#5a3f55` | `#1d1521` | `#33263a` |
| 1.00 | dusk (complete) | `#141832` | `#8a4a6e` | `#ff7a4a` | `#2e2640` | `#110e18` | `#1c1a2c` |
| night | night / break | `#0b0e1f` | `#1d2140` | moon `#e8e6f0` | `#1a1a2c` | `#0b0a12` | `#10132a` |
| predawn | end of break | `#121631` | `#5a4a6e` | (none) | `#2a2440` | `#0f0d16` | `#171a32` |

Blend: find the neighbouring stops `a, b` and `k = smoothstep(0, 1, (p - a.p)/(b.p - a.p))`, then mix in **linear RGB** (convert from sRGB in JS, upload as uniforms once per second, since progress changes slowly; the shader doesn't need the whole table). The afterglow colour `--sky-afterglow #d0507a` and the Belt of Venus `#7a5a9a` are used by `u_complete`.

### 3.4 Ambient motion (independent of progress, all slow)
| Element | Motion | Speed |
|---|---|---|
| Clouds | drift right | 0.004 uv/s (about 6 px/s at 1440 wide, below 1° visual angle per s) |
| Cloud shape | fbm domain-warp evolves | `t*0.01` |
| Water ripples | sinusoidal offset | 1.2 rad/s, 4px max amplitude |
| Glitter | re-hashes | 0.6 rows/s |
| Sun glow | "breath" ±3% | 9 s period |
| Stars | twinkle | 0.8 rad/s, ±25% brightness (never on/off) |

Nothing translates fast, nothing zooms, and nothing rotates. Sub-pixel sun motion (e.g. 1120px over 50 min ≈ 0.37 px/s) gets fractional rendering for free in a shader, so it never stutters.

### 3.5 Frame-rate and power strategy
- **Cadence:** a rAF loop with a time gate. **60 fps during transitions and the completion sequence. 30 fps in steady state**: the fastest ambient motion is 6 px/s, so 30 vs 60 fps is visually identical and costs half the GPU time. **10 fps** when `!document.hasFocus()` (the user is reading a PDF in another window next to it).
- **Hidden:** on `visibilitychange` → `document.hidden`, cancel rAF entirely. Progress is derived from timestamps, never accumulated, so resuming is exact.
- **Resolution:** `scale = min(devicePixelRatio, 1.5) * quality`. Also cap the canvas backbuffer at **2.1 MP** (≈1920×1080). On a 5K or ultrawide screen we render below native and CSS upscales. The scene is soft, so upscaling doesn't show, and the readout is DOM text, so it stays crisp.
- **Adaptive quality:** keep a rolling average of frame time over 90 frames (use `EXT_disjoint_timer_query` if available, else rAF delta). If the average is above 22 ms, step `quality` 1.0 → 0.75 → 0.6 → 0.5, and also drop cloud octaves 4 → 3. Never step back up within a session (no oscillation).
- **Budget:** under **3 ms GPU per frame** at 1080p on integrated graphics (Intel Iris Xe / Apple M1 class). JS under 0.3 ms per frame (set 6 uniforms, one draw). Target **under 5% CPU and no fan** on an M1 MacBook Air in steady state, to be verified by the coder with Activity Monitor or Chrome's Performance panel.
- **Resize:** `ResizeObserver` on the canvas, debounced 100 ms.
- **Context loss:** handle `webglcontextlost` with `preventDefault` and rebuild on `restored`. Fall back to Canvas 2D after the second loss.
- **Wake lock (phone/tablet):** optionally `navigator.wakeLock.request('screen')` while focus mode is visible (Settings → Focus → "Keep screen on", default off on phone because of battery). Release on hidden or exit.

### 3.6 prefers-reduced-motion (and the in-app override)
Settings → Focus → **Scene motion:** `Full` · `Calm` · `Still`. The default follows the OS: `reduce` maps to **Still**.
- **Still:** no ambient motion (t frozen at a fixed seed), and **one frame is rendered per minute** (and on resize, pause or state change). The sun still moves, in 1-minute steps, which are 2% steps for a 50-minute block, so it stays readable. Completion is a **1 s cross-fade** from the dusk frame to the starry frame. No shooting star, and every transition is an opacity cross-fade (§2.1, §2.6).
- **Calm:** ambient motion at 40% speed, no shooting star, no glitter re-hash.
- The **Pause** control also halts ambient motion, which satisfies WCAG 2.2.2 for moving content longer than 5 s [web.dev][webdev].
- No luminance change is faster than 1 s, so there's nothing near the 3-flashes threshold (WCAG 2.3.1).

### 3.7 Theme
**Focus mode is always dark-chromed**, whatever the app theme. The overlay sets `color-scheme: dark` and uses the `--focus-*` tokens (§6). The sky itself is the "light". Even at noon it is muted (L* ≤ 72) so it never glares in a dark room. Light-theme users get the same scene, because the paper-white app around it is gone anyway.

### 3.8 Scaling: phone to ultrawide
- **Ridge noise is sampled in `x*aspect`**, so mountains keep their proportions. An ultrawide just shows more range.
- **Sun path:** `sunX ∈ [0.10, 0.90]` of width on desktop. On ultrawide (aspect > 2.2) use `[0.18, 0.82]` so the sun stays within comfortable peripheral view. On phone portrait use `[0.14, 0.86]`, `arcH = 0.40`, and `H = 0.40`, so the arc is tall and reads clearly on a narrow screen.
- **Sun radius** comes from `min(w,h)`, so it's 22–30px on a phone and 34–46px on a desktop.
- **Readout** is `clamp(48px, 7vw, 88px)`. On phone landscape (height < 480) the readout moves to the top-right, so the sun arc has room.
- **Safe areas:** pad the top bar and controls with `env(safe-area-inset-*)`.
- **Phone controls** are always visible (there's no hover). They still fade to 0.35 after 3 s and come back to full on tap. The first tap on the sky only reveals the controls and never activates anything.

### 3.9 Shader sketch (GLSL ES 1.00, abridged, for orientation, not final)
```glsl
precision mediump float;
uniform vec2  u_res;      uniform float u_t;        // ambient seconds (wrapped at 3600)
uniform float u_p;        uniform float u_complete; // progress, completion 0..1
uniform float u_night;    uniform float u_moonP;    // 0 = day, 1 = night; moon progress
uniform float u_pause;    uniform float u_seed;
uniform vec3  u_zen, u_hor, u_sun, u_rFar, u_rNear, u_water;  // current palette (linear RGB)
const float H = 0.36; const float PI = 3.14159265;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)) + u_seed) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+1.),f.x), f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=.5; } return s; }
float ridge(float x, float f, float s){ float a=.5,v=0.; for(int i=0;i<5;i++){ v+=a*(1.-abs(noise(vec2(x*f,s))*2.-1.)); f*=2.; a*=.5; } return v; }

vec3 sky(vec2 uv, float aspect, vec2 sunUV, float e){
  float y = clamp((uv.y-H)/(1.-H), 0., 1.);
  vec3 c = mix(u_hor, u_zen, pow(y, .6));
  vec2 d = (uv - sunUV) * vec2(aspect, 1.);
  float dist = length(d);
  c += u_sun * (.35*exp(-dist*9.) + .15*exp(-dist*2.5)) * (.55 + .45*(1.-e)) * (1.-u_night);
  c += u_sun * smoothstep(.036, .033, dist) * (1.-u_night);             // disc
  // clouds
  vec2 q = vec2(uv.x*aspect, uv.y) * vec2(1.2, 3.) + vec2(u_t*.004, 0.);
  float cl = smoothstep(.55,.8, fbm(q + fbm(q + u_t*.01))) * smoothstep(H+.06,H+.14,uv.y) * smoothstep(H+.5,H+.3,uv.y);
  c = mix(c, mix(u_rFar*1.4, u_sun, .5*(1.-e) + .4*exp(-dist*3.)), cl*.55);
  // stars (starVis computed on CPU into u_complete/u_night mix)
  vec2 g = uv*vec2(aspect,1.)*140.; vec2 id=floor(g); float b=hash(id);
  float star = step(.992, b) * smoothstep(.06,.0,length(fract(g)-.5)) * (.75+.25*sin(u_t*.8+b*40.));
  float vis = max(u_night, smoothstep(.93,1.,u_p)*.25 + u_complete*.75);
  c += star * vis * step(.25 + .6*(1.-fract(b*97.)), max(u_complete, u_night)) * smoothstep(H, H+.1, uv.y);
  return c;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res; float aspect = u_res.x/u_res.y;
  float e = sin(PI*u_p);
  vec2 sunUV = vec2(mix(.10,.90,u_p), H - .025 + e*.46 - u_complete*.06);
  vec3 col = sky(uv, aspect, sunUV, e);
  // ridges far -> near
  float x = uv.x*aspect;
  float h0 = H+.035+.10*ridge(x,1.4,u_seed), h1 = H+.015+.075*ridge(x,2.6,u_seed+7.), h2 = H-.005+.05*ridge(x,4.5,u_seed+13.);
  col = mix(col, mix(u_rNear,u_hor,.70), step(uv.y,h0));
  col = mix(col, mix(u_rNear,u_hor,.45), step(uv.y,h1));
  col = mix(col, mix(u_rNear,u_hor,.18), step(uv.y,h2));
  // lake: reflect around water line with ripple (re-evaluate sky; ridges reflected similarly)
  float W = H - .02;
  if (uv.y < W) {
    vec2 r = vec2(uv.x + .004*sin(uv.y*220. + u_t*1.2), 2.*W - uv.y);
    vec3 refl = sky(r, aspect, sunUV, e) * .72;
    col = mix(u_water, refl, .65);
    float glit = step(.985, hash(floor(vec2(uv.x*300., uv.y*90. + u_t*.6))));
    col += u_sun * glit * exp(-abs(uv.x - sunUV.x)*18.) * (.25 + .6*(1.-e)) * (1.-u_night);
  }
  col *= 1. - .28*pow(length(uv-.5)*1.25, 2.2);                        // vignette
  col = mix(col, vec3(dot(col, vec3(.2126,.7152,.0722))), u_pause*.35); // pause desat
  col = pow(col, vec3(1./2.2));                                          // linear -> sRGB
  col += (hash(gl_FragCoord.xy + u_t) - .5) / 255.;                      // dither
  gl_FragColor = vec4(col, 1.);
}
```
The dotted path ahead, the afterglow band, the shooting star and the moon are left out of the sketch for brevity. Each is 5–10 lines and follows §3.2 and §2.3. Use `highp` if the device supports it in fragment shaders, because `mediump` on some phones makes the noise blocky. The ridges should use `smoothstep(h+0.0015, h-0.0015, uv.y)` instead of `step`, so the silhouette edges are antialiased.

---

## 4. Time-block picker

### 4.1 Where
It sits **inside the Timer card on Today when the timer is stopped**, between the section line and the Clock in button. When running it's replaced by the running readout (§5). The same picker appears in the "Keep going" and "Start next block" cards (with fewer options) and in the command palette ("Start 25 / 50 / 90 min focus").

### 4.2 Layout (desktop, stopped state of the Timer card)
```
┌ TIMER ─────────────────────────────────────────────────────────────────────────────┐
│ TODAY'S SECTION                                                                    │
│ ▌Organic Chemistry · Ch 4 – Substitution        2:28 / ~6:00 ▓▓▓▓▓░░░░  [Change]   │
│                                                                                    │
│ FOCUS BLOCK                                                                        │
│ ( 25 )  (● 50 )  ( 90 )  ( Until 11:00 · 1h 12m )  ( ∞ No limit )  ( ✎ Custom )     │
│                                                       [ ▶ Start focus · 50 min ]   │
│                                                            I                       │
└────────────────────────────────────────────────────────────────────────────────────┘
```
- **Chips:** a `role="radiogroup"` with the label "Focus block". Each chip is `role="radio"`, height 32, padding 0 12, radius-full, Plex Mono 13/500 for the numbers ("25", "50", "90") with a `min` unit suffix in Sans 12 `--text-muted`. Unselected: `--surface` bg, 1px `--border-strong`. Selected: `--accent-soft` bg, 1.5px `--accent` border, `--accent-text`, plus a 6px dot. Hover: `--surface-2`.
- **Presets:** **25** (classic pomodoro), **50** (default; the 50/10 rhythm suits study sessions), **90** (deep work), **Until {end of current/next planned block}** (shown only when today's plan has a block that is current or starts within 15 min; label `Until 11:00 · 1h 12m`, using the plan's subject colour as a 3px left edge), **∞ No limit** (the sky cycles one "day" per 60 min, with a quiet mini-completion each hour and no chime or card), and **Custom**.
- **Custom:** the chip turns into an inline `DurationInput` (existing component), 72px wide, accepting `40`, `1:15`, `75m`, clamped to **5–240 min**. Enter confirms, Esc reverts. The value is remembered as the Custom chip's label ("40").
- **Primary button:** `lg` primary as in DESIGN.md §4.3, label `▶ Start focus · 50 min` (updates live). The secondary text button "Clock in without focus" (subtle, 13px) sits beside it for users who just want the timer.
- **Memory:** the last chosen preset and custom value persist (a user setting in the store, not ad-hoc localStorage, per the existing storage layer).
- **Keyboard:** Tab goes into the group to the selected chip. ←/→ move and select (roving tabindex). Home/End go to the first and last chip. Enter or `I` anywhere on Today starts focus with the selection. With the timer card focused, digits **1–6** pick chips directly (hinted with `kbd` on hover/focus only, to keep it quiet).
- **Phone:** the chips go in a horizontally scrollable row (`overflow-x:auto; scroll-snap-type:x`, 16px gutter, fade mask on the right edge), with a full-width primary button below.

### 4.3 Mid-block options
In the completion card, **Keep going** offers `+25` (default), `+50` and `+15` as a split button. The new block runs as a fresh day (dawn → dusk), so every block gets its own sunset.

---

## 5. One-screen Today

### 5.1 Goal and rules
At **1440×900 and 1280×800** (and anything taller or wider), Today shows every card **with no page scroll**. The page is a CSS grid that fills `100dvh`. Cards with long content (the plan timeline and the logged list) **scroll inside themselves**. Below a viewport height of **720px**, or a width under 1024px, the grid relaxes to normal page flow (scrolling allowed).

Changes from the current screen (see `docs/screenshots/today-desktop.png`):
1. **Merge "Today's section" into the Timer card** as its top line (title, progress bar, and Mark done or Change). This saves a whole card (≈150px).
2. **The Timer card goes horizontal:** identity and section on the left, readout and buttons on the right. The readout drops from 56px to **48px** (`--text-display-compact`). `kbd` hints go *inside* the buttons instead of below them.
3. **Ring card:** the ring drops from 168px to **132px**, with the legend to its right instead of below.
4. **Today's plan:** the day timeline keeps its design but goes in a **scroll-within-card** body. It auto-scrolls so "now" sits at 35% from the top, the planned/logged column header is sticky, and the hour row is `--hour-h-compact: 28px`. The footer (planned · actual · adherence) is pinned.
5. **Logged today:** the list scrolls inside the card, with the newest/live row kept in view (scroll to bottom on update unless the user scrolled up). Rows are 36px.
6. **This week:** a single 56px strip: 7 mini bars (20px tall, 28px wide) inline, then `3:23 / 48:00`, the status chip, the streak chip, and `View timecard →`.
7. **Page header:** the subtitle goes inline with the title (`Today  Mon 26 Oct · 3:23 logged · 4:37 to go`), and **+ Add entry** stays at the right. That's 40px tall in total.
8. **Nudge banner** (unfinished section): compact, 40px, single line, with the actions as small buttons. It's inside the grid as an `auto` row, so when present it takes height from the plan and logged row and never pushes the page into a scroll.

### 5.2 Desktop wireframe (1280×800, sidebar 232px, content 1000px wide)
```
┌──────────┬───────────────────────────────────────────────────────────────────────────────────────┐
│Productive│ Today  Mon 26 Oct · 3:23 logged · 4:37 to go                          [+ Add entry]   │ 40  (pad-top 24)
│          │                                                                                       │ 12
│ ☀ Today  │ ⚠ "Magnetism" (planned for Fri) isn't finished.     [Do it today] [Mark done] Dismiss │ 40  (optional)
│ ▦ Plan   │                                                                                       │ 12
│ ▤ Timecard│┌ TIMER (2fr) ────────────────────────────────────────────┐┌ RING (1fr) ─────────────┐│
│ ◫ Courses ││ ● CLOCKED IN SINCE 8:10 PM                              ││   ╭───╮  ● OChem  2:28 ││
│ ▥ Review  ││ ▌Organic Chemistry                      0:47:31          ││  │3:23│  ● LinAlg 0:55 ││
│          ││  Ch 4 – Substitution            this session · 3:23 today ││  │of 8│                 ││ 204
│          ││  2:28 / ~6:00 ▓▓▓▓▓░░░░░  ✓ Mark done D                   ││   ╰───╯  [4:37 to go]   ││
│          ││                     [■ Clock out ␣] [Switch S] [◐ Focus F]││  132px ring            ││
│          │└──────────────────────────────────────────────────────────┘└─────────────────────────┘│
│          │                                                                                       │ 16
│          │┌ TODAY'S PLAN ─────────────── Edit plan → ┐┌ LOGGED TODAY ─────────────── + Add entry ┐│
│          ││ PLANNED          LOGGED        (sticky) ││ 9:00–10:40  ▌OChem · Ch 4 – Sub…   1:40 ✎ ││
│          ││ 19:00 ┊                                 ││ 11:00–11:55 ▌LinAlg · §3 Determ…   0:55 ✎ ││
│          ││ 20:00 ┊            ▌Organic Chem…        ││ 8:10–now    ▌OChem · Ch 4 – Sub…   0:48 ●││ 1fr
│          ││ 21:00 ●━━━━━━━━━━━━━━━━━━━━━━━━━ now     ││                                          ││ (≈ 292 here,
│          ││ 22:00 ┊                    ↕ scrolls     ││                          ↕ scrolls        ││  ≈ 392 at 900)
│          ││ Planned 6:00 · Actual 3:23 · Adherence 28%││                                          ││
│          │└──────────────────────────────────────────┘└──────────────────────────────────────────┘│
│ ⚙ Settings│                                                                                      │ 16
│ ⌨ Shortcuts│┌ THIS WEEK  ▆ ▁ ▁ ▁ ▁ ▁ ▨   M T W T F S S    3:23 / 48:00  [0-day streak]  View timecard → ┐│ 56
│          │└───────────────────────────────────────────────────────────────────────────────────────┘│ (pad-bottom 24)
└──────────┴───────────────────────────────────────────────────────────────────────────────────────┘
```
**Height budget (800px):** 24 + 40 + 12 + [40 + 12 banner] + 204 + 16 + **plan/logged** + 16 + 56 + 24 = 444 fixed, which leaves **356px** for plan and logged with the banner (408 without it). At 900px: 456 / 508. The row's minimum is **240px**. If the viewport can't give that, it falls back to page scroll (`@media (max-height: 719px)`).

**Grid sketch (CSS, for the coder):**
```css
@media (min-width: 1024px) and (min-height: 720px) {
  .today {
    height: 100dvh; box-sizing: border-box; padding: var(--space-6) var(--space-8);
    display: grid; gap: var(--space-4);
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    grid-template-rows: auto auto var(--today-row1-h) minmax(240px, 1fr) auto;
    grid-template-areas: "head head" "nudge nudge" "timer ring" "plan logged" "week week";
    overflow: hidden;
  }
  .today:not(:has(.nudge)) { grid-template-rows: auto var(--today-row1-h) minmax(240px,1fr) auto;
                             grid-template-areas: "head head" "timer ring" "plan logged" "week week"; }
  .plan, .logged { display: flex; flex-direction: column; min-height: 0; }
  .planBody, .loggedBody { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
  /* plan & logged split the bottom row 1fr / 1fr: wrap them in a subgrid row or place via areas */
}
```
(For browsers without `:has()`, the page sets a `data-nudge` attribute on `.today` instead.) The plan and logged row uses `grid-template-columns: 1fr 1fr` through a nested grid spanning both columns, so it isn't forced to the 2fr/1fr split.

**Wider screens (≥1600px):** content max-width rises to 1360px. The bottom row becomes three columns: **plan 1.2fr | logged 1fr | week (vertical card, 1fr)**. The week strip leaves the bottom, and the plan and logged cards get the extra height.

### 5.3 Phone (< 640px)
Vertical scroll is fine, but everything is compact:
- Header: title + date on one line, with **+** as an icon button.
- **Timer card first.** Stopped: the section line, then the block chips (scroll row), then a full-width Start focus button. Running: readout 40px, with Clock out and **◐ Focus** side by side (Switch section goes in a `⋯` menu).
- **Ring + week combined card:** ring 96px on the left. Right: logged/goal numbers, then the 7 mini bars underneath.
- **Today's plan:** card body max-height **280px** with internal scroll, auto-scrolled to now.
- **Logged today:** collapsed to the last 3 entries plus "Show all (n)".
- The nudge banner keeps its current design but with tighter padding (12px).

Target: the Timer card and the Ring card are fully visible above the tab bar on a 390×844 phone without scrolling.

---

## 6. Tokens to add (`src/styles/tokens.css`)

```css
/* ==========================================================
   Focus mode + compact Today (round 2)
   Focus mode is always dark-chromed; these do NOT change per theme.
   ========================================================== */
:root {
  /* ---- Focus overlay chrome ---- */
  --focus-ink:          #f4f1ea;                 /* readout, button text (on sky) */
  --focus-ink-muted:    rgba(244, 241, 234, 0.70);
  --focus-ink-subtle:   rgba(244, 241, 234, 0.45);
  --focus-glass:        rgba(14, 16, 32, 0.38);  /* frosted control backing */
  --focus-glass-solid:  #161a2e;                 /* no backdrop-filter / reduced transparency */
  --focus-glass-border: rgba(255, 255, 255, 0.14);
  --focus-accent:       #b8c1ff;                 /* primary action in focus (ink-blue, night-tuned) */
  --focus-on-accent:    #11131f;
  --focus-ring:         #ffffff;                 /* keyboard focus ring on sky */
  --focus-text-shadow:  0 1px 12px rgba(0, 0, 0, 0.35);
  --focus-bg:           #0b0e1f;                 /* shown before first frame / fallback */

  /* ---- Sky palette anchors (shader reads the full table from JS; these are for CSS fallback) ---- */
  --sky-dawn-zenith:    #1d2340;  --sky-dawn-horizon:    #c88a8f;
  --sky-noon-zenith:    #2c5a8f;  --sky-noon-horizon:    #a9c7da;
  --sky-golden-zenith:  #2b3d6b;  --sky-golden-horizon:  #e8a868;
  --sky-dusk-zenith:    #141832;  --sky-dusk-horizon:    #8a4a6e;
  --sky-night-zenith:   #0b0e1f;  --sky-night-horizon:   #1d2140;
  --sky-predawn:        #5a4a6e;
  --sky-afterglow:      #d0507a;
  --sky-venus-belt:     #7a5a9a;
  --sky-sun-noon:       #fffaf0;
  --sky-sun-low:        #ff9a5c;
  --sky-moon:           #e8e6f0;

  /* ---- Focus motion ---- */
  --dur-focus-stagger:   24ms;    /* per-card delay when cards fold away */
  --dur-focus-cards:     280ms;   /* card fade/scale out */
  --dur-focus-open:      800ms;   /* sky clip-path circle grows */
  --dur-focus-chrome-in: 400ms;   /* overlay text/controls appear */
  --dur-focus-close:     540ms;   /* sky clip-path circle shrinks */
  --dur-chrome-reveal:   160ms;   /* controls back on mouse move */
  --dur-chrome-hide:     600ms;   /* controls fade after idle */
  --delay-chrome-idle:   3000ms;  /* idle time before hiding */
  --dur-complete:        6000ms;  /* sunset -> stars sequence */
  --dur-reduced-fade:    240ms;   /* all transitions under reduced motion */
  --ease-focus:          cubic-bezier(0.65, 0, 0.35, 1);  /* symmetric, cinematic */
  --ease-in:             cubic-bezier(0.4, 0, 1, 1);

  /* ---- Focus type ---- */
  --text-focus-readout: clamp(48px, 7vw, 88px);
  --text-focus-label:   12px;     /* course · section caps */

  /* ---- Compact Today ---- */
  --text-display-compact: 48px; --lh-display-compact: 52px;  /* Today readout, one-screen layout */
  --today-row1-h:      204px;     /* timer + ring row */
  --ring-size-compact: 132px;
  --ring-size-phone:   96px;
  --hour-h-compact:    28px;      /* plan timeline hour row inside Today */
  --week-strip-h:      56px;
  --chip-h:            32px;      /* block picker chips */
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-focus-open: var(--dur-reduced-fade);
    --dur-focus-close: var(--dur-reduced-fade);
    --dur-focus-cards: var(--dur-reduced-fade);
    --dur-focus-stagger: 0ms;
    --dur-complete: 1000ms;
  }
}
```

---

## 7. Implementation checklist for the coder
- [ ] `FocusSky` component: WebGL shader, then a Canvas 2D fallback, then a CSS gradient. A rAF loop with the 60/30/10/0 fps gating, the DPR and 2.1 MP cap, adaptive quality, and context-loss handling.
- [ ] Palette table in TS (sRGB hex → linear) with a `palette(p)` blend, unit-tested at the stops and in between.
- [ ] `FocusOverlay`: dialog semantics, readout modes (remaining/elapsed/hidden), chrome auto-hide, keyboard (Esc, P, O, F, T, B, K, Enter), and the live-region milestones.
- [ ] Transitions in and out (clip-path circle from the button / to the timer card) and reduced-motion variants.
- [ ] Completion sequence, overtime moon, break night with pre-dawn, WebAudio chime gated on the setting and a running context.
- [ ] Block picker radiogroup in the Timer card, with remembered presets and a Custom DurationInput.
- [ ] One-screen Today grid with Today's section merged into the Timer card, scroll-within plan and logged cards, compact week strip, and the `max-height: 719px` fallback.
- [ ] Settings → Focus: Open on clock-in, Scene (Daylight / Nightfall / Auto, if Nightfall ships), Scene motion (Full / Calm / Still), Chime, Keep screen on.
- [ ] Verify: 1440×900 and 1280×800 show no page scrollbar with and without the nudge banner. Steady-state CPU under 5% on a laptop. Rendering stops when the tab is hidden (check in the Performance panel).

---

## Sources
[forest]: https://apps.apple.com/au/app/forest-focus-for-productivity/id866450515
[clickup]: https://clickup.com/learn/topic/productivity/tools/forest/
[flora-bob]: https://www.businessofbusiness.com/articles/flora-focus-productivity-app-review/
[focusplant]: https://apps.apple.com/app/id1459096306
[fvfp]: https://www.ispringsolutions.com/upload/iblock/c2d/r4wyf7islilxyfko7cuujjpfmh5untvu/Forest-vs-Focus-Plant.pdf
[timetimer]: https://apps.apple.com/us/app/-/id332520417
[gp]: https://goalsandprogress.com/focus-with-visual-timers/
[sundae]: https://www.producthunt.com/p/sundae-2/sundae-2
[melty]: https://mwm.ai/apps/melty-focus-timer/6757390304
[freeze]: https://mwm.ai/apps/freeze-focus-study-timer/6783211985
[icefocus]: https://apps.apple.com/us/app/-/id6760374241
[tide]: https://apps.apple.com/app/tide-focus-timer-white-noise/id1077776989
[gridfiti]: https://gridfiti.com/aesthetic-study-websites/
[endel]: https://endel.io/
[readymag]: https://blog.readymag.com/tune-in-drop-out-how-endel-helps-get-into-the-flow-via-immersive-soundscapes-5ab08d932687/
[mindful]: https://apps.apple.com/bh/app/mindfulness/id1560383515
[9to5]: https://9to5mac.com/2021/09/09/chill-out-with-these-iphone-wallpapers-inspired-by-the-new-mindfulness-app-in-watchos-8/
[pomofocus]: https://pomofocus.io/llms.txt
[session]: https://apps.apple.com/us/app/session-%E7%95%AA%E8%8C%84%E9%92%9F%E4%B8%93%E6%B3%A8%E8%AE%A1%E6%97%B6%E5%99%A8/id1521432881?l=vi
[sunsearch]: https://apps.apple.com/app/id6752858587
[webdev]: https://web.dev/learn/accessibility/motion
[pleo]: https://telescope.pleo.io/foundations/motion/motion.accessibility
[chromium]: https://blog.chromium.org/2011/03/getting-smoother-animated-web-content.html
[motiondev]: https://motion.dev/magazine/when-browsers-throttle-requestanimationframe

- Forest (App Store): https://apps.apple.com/au/app/forest-focus-for-productivity/id866450515 · ClickUp review: https://clickup.com/learn/topic/productivity/tools/forest/
- Flora review (Business of Business): https://www.businessofbusiness.com/articles/flora-focus-productivity-app-review/ · Common Sense Media: https://www.commonsensemedia.org/app-reviews/flora-focus-habit-tracker
- Focus Plant (App Store): https://apps.apple.com/app/id1459096306 · Forest vs Focus Plant: https://www.ispringsolutions.com/upload/iblock/c2d/r4wyf7islilxyfko7cuujjpfmh5untvu/Forest-vs-Focus-Plant.pdf
- Time Timer (App Store): https://apps.apple.com/us/app/-/id332520417 · Visual timers guide: https://goalsandprogress.com/focus-with-visual-timers/
- Sundae (Product Hunt): https://www.producthunt.com/p/sundae-2/sundae-2 · Melty: https://mwm.ai/apps/melty-focus-timer/6757390304 · FreezeFocus: https://mwm.ai/apps/freeze-focus-study-timer/6783211985 · Ice Focus: https://apps.apple.com/us/app/-/id6760374241
- Tide: https://apps.apple.com/app/tide-focus-timer-white-noise/id1077776989 · LifeAt / Lofi.co (Gridfiti): https://gridfiti.com/aesthetic-study-websites/ , https://gridfiti.com/lofi-co-alternatives
- Endel: https://endel.io/ · Readymag on Endel: https://blog.readymag.com/tune-in-drop-out-how-endel-helps-get-into-the-flow-via-immersive-soundscapes-5ab08d932687/
- Apple Mindfulness: https://apps.apple.com/bh/app/mindfulness/id1560383515 · 9to5Mac: https://9to5mac.com/2021/09/09/chill-out-with-these-iphone-wallpapers-inspired-by-the-new-mindfulness-app-in-watchos-8/
- Pomofocus: https://pomofocus.io/llms.txt · Session: https://apps.apple.com/us/app/session-%E7%95%AA%E8%8C%84%E9%92%9F%E4%B8%93%E6%B3%A8%E8%AE%A1%E6%97%B6%E5%99%A8/id1521432881?l=vi
- Sun-clock apps (Zenrise): https://apps.apple.com/app/id6752858587 · Sunrise Sunset Widget: https://apps.apple.com/us/app/-/id1324943279
- web.dev, Animation and motion: https://web.dev/learn/accessibility/motion · Pleo motion accessibility: https://telescope.pleo.io/foundations/motion/motion.accessibility
- Chromium blog (rAF in background tabs): https://blog.chromium.org/2011/03/getting-smoother-animated-web-content.html · motion.dev (rAF throttling): https://motion.dev/magazine/when-browsers-throttle-requestanimationframe
