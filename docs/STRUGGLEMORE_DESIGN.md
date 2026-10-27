# StruggleMore: brand, opening splash, Sisyphus scene and two-card Today (design addendum)

Owner: designer agent · Status: v1, ready to implement · Amends `docs/DESIGN.md` (tokens, components), `docs/FOCUS_DESIGN.md` ("Daylight") and `docs/FOCUS_PLAN.md` §7 and §9 (F4–F5). Where this doc and an older one disagree on **looks, motion, naming or Today layout**, this doc wins. Behaviour in `FOCUS_PLAN.md` (phases, pause, break, keys, persistence) is unchanged unless stated here.

**In one line:** the app becomes **StruggleMore**. Each fresh load opens on one question, *"Would climbing up a mountain be impressive if the mountain was flat?"*. When you clock in, a figure pushes a boulder up a mountain, and the boulder's position on the slope is how far through your block you are. Today shrinks to two cards: **Start** and **Log**.

The user's reference was a sepia photo of Sisyphus straining against a huge boulder on a rocky slope. We take its **mood, palette and proportions** and nothing else. Everything is drawn in code. Nothing is traced, and no image assets are used.

---

## 1. Brand

### 1.1 Name and wordmark

- **Name in text:** `StruggleMore`, one word, with a capital S and a capital M. Use it in every UI string, `document.title`, the README and meta tags. In running prose ("StruggleMore keeps your data in this browser") it never breaks into "Struggle More".
- **Wordmark:** **Struggle** in Fraunces 600 roman, then **More** in Fraunces 600 *italic* in `--accent`, with no space and normal tracking (`-0.01em` at sizes of 20px and up). The italic gives the second word a forward lean, the way the figure leans into the stone. In the sidebar it's 18px. On the splash it's 13px caps-free, in `--splash-ink-muted`.
- **Mark (icon):** a 20×20 rounded square (`--radius-sm`, `--accent` fill) holding a white diagonal line at 30° (the slope) with a filled white circle sitting on it (the boulder, r = 4.5 in a 20 box). It replaces the clock icon in `Nav` and `WelcomePage`. The same drawing becomes `public/favicon.svg`:
  ```svg
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="7" fill="#a3461a"/><path d="M6 25 L26 13" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="18.6" cy="12.2" r="5.2" fill="#fff"/></svg>
  ```
  (The circle sits tangent to the line, uphill of centre.)
- **Collapsed sidebar (64px):** the mark only, with `aria-label="StruggleMore, go to Today"`.

### 1.2 Tone

Dry and stoic, never cheesy. The struggle is the point, so don't promise ease. **Brand voice appears in exactly four places:** the splash, the completion line in focus mode, the Log card's empty state and the roll-back caption (§3.10). Data screens (Timecard, Review, Plan, Settings) stay plain and factual, as in DESIGN.md §6.

| Where | Copy |
|---|---|
| Splash | *Would climbing up a mountain be impressive if the mountain was flat?* (no attribution, see §2.1) |
| Focus complete heading | `Summit.` with the existing line below it: `50 minutes on Organic Chemistry.` |
| Log empty state | `Nothing logged yet. The boulder is waiting.` |
| Roll-back caption (optional, §3.10) | `One must imagine Sisyphus happy. (Albert Camus)` |
| Tab title | `Today | StruggleMore`, `● 1:23 · OChem | StruggleMore`, `✓ Summit | StruggleMore` |

Keep the existing ` — ` separator in titles if changing it would ripple; `|` is a nicety. Pick one and use it everywhere.

### 1.3 Type

- **IBM Plex Sans and Plex Mono stay** for all UI, tables and numbers. They're the reason the timecard reads cleanly: tabular figures, a neutral sans and good small sizes. Swapping them would re-skin every screen for no functional gain.
- **Add Fraunces** (Google Fonts, variable, SIL OFL) as `--font-display`. It's used **only** for the wordmark, the splash quote and the focus-mode `Summit.` heading. Why Fraunces: it's an old-style serif with soft, warm, slightly chiselled forms, so it carries the sepia and classical-myth mood of the photo without the costume of a "Greek" display face. Its italic is expressive enough for the quote, and one variable file covers both uses. Load only what's used:
  `family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,400;1,9..144,600`
  appended to the existing Plex `<link>`, with `display=swap`. The fallback stack, `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`, is close enough that a late swap doesn't reflow the splash badly.

### 1.4 Palette shift

The photo is warm sepia: ochre stone, umber shadow, and a sky going from parchment to dusk. The app's "card stock" neutrals were already warm, so we **warm them a step further toward parchment**. The **accent moves from ink blue to burnt sienna**, the colour of sunlit stone. Status colours keep their meaning. "Behind" goes a little more ochre and "danger" a little cooler, so neither collides with the new accent. **Course colours (`--subj-*`) do not change**, because users already know their courses by colour. The heatmap moves to a single ochre-to-sienna ramp.

Contrast, measured (WCAG 2.1): `--accent #a3461a` on `--surface` 6.1:1, on `--bg` 5.4:1, on `--accent-soft` 5.0:1. White on accent is 6.1:1. `--text-muted` on surface is 7.1:1, `--text-subtle` is 5.7:1 and `--border-strong` is 3.8:1. In dark mode: accent `#e8956a` on surface 7.4:1, `--text-subtle` 5.2:1.

### 1.5 Token changes (`src/styles/tokens.css`)

Replace the matching values. Everything not listed (type scale, spacing, radii, motion, layout, `--subj-*`) stays as it is. The file header comment changes to "StruggleMore design tokens".

```css
:root {
  /* ---- Fonts ---- */
  --font-display: "Fraunces", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;

  /* ---- Neutral ramp (parchment) ---- */
  --n-0:   #fffdf9;  --n-25:  #fbf8f2;  --n-50:  #f6f1e7;  --n-100: #efe7d9;
  --n-150: #e6dccb;  --n-200: #d9cdb9;  --n-300: #bfb19b;  --n-400: #8b7d6b;
  --n-500: #6e6252;  --n-600: #5f5446;  --n-700: #463d32;  --n-800: #2e2820;  --n-900: #1f1a14;

  /* ---- Semantic surface/text (LIGHT) ---- */
  --bg: #f6f1e7;  --surface: #fffdf9;  --surface-2: #efe7d9;  --surface-3: #e6dccb;
  --border: #d9cdb9;  --border-strong: #8b7d6b;
  --text: #1f1a14;  --text-muted: #5f5446;  --text-subtle: #6e6252;  --text-inverse: #fffdf9;

  /* ---- Accent: burnt sienna ---- */
  --accent: #a3461a;  --accent-hover: #8a3a15;  --accent-active: #722f10;
  --accent-soft: #f6e6db;  --accent-text: #a3461a;  --on-accent: #ffffff;
  --focus-ring: #a3461a;

  /* ---- Status ---- */
  --ontrack: #1f7a3d;  --ontrack-soft: #e5f2e8;
  --behind:  #8f5a00;  --behind-soft:  #f8ecd2;
  --over:    #0b6f7a;  --over-soft:    #e0f1f3;
  --danger:  #a31d3d;  --danger-soft:  #f9e3e7;

  /* ---- Heatmap: ochre to sienna ---- */
  --heat-1: #f3e3cf;  --heat-2: #e6c39b;  --heat-3: #d39a5e;  --heat-4: #b86a2c;  --heat-5: #8a3a15;

  /* ---- Shadows ---- */
  --shadow-1: 0 1px 2px rgba(31, 26, 20, 0.07), 0 1px 1px rgba(31, 26, 20, 0.04);
  --shadow-overlay: 0 12px 32px rgba(31, 26, 20, 0.18), 0 2px 6px rgba(31, 26, 20, 0.08);
  --scrim: rgba(31, 26, 20, 0.45);
  --hatch: repeating-linear-gradient(135deg, transparent 0 6px, rgba(31,26,20,0.05) 6px 7px);

  /* ---- Splash (theme-independent: always dusk) ---- */
  --splash-bg-top:    #1c1510;
  --splash-bg-bottom: #4a3020;
  --splash-glow:      #c98a4a;
  --splash-ink:       #f4ead8;   /* 13.2:1 on #2b2118 */
  --splash-ink-muted: rgba(244, 234, 216, 0.62);
  --text-splash: clamp(28px, 4.4vw, 60px);  --lh-splash: 1.16;
  --dur-splash-in:   600ms;
  --dur-splash-hold: 2200ms;
  --dur-splash-out:  400ms;
  --dur-splash-skip: 200ms;

  /* ---- Focus chrome, re-warmed (replaces the round-2 values) ---- */
  --focus-glass:       rgba(28, 20, 14, 0.40);
  --focus-glass-solid: #241b14;
  --focus-accent:      #f0b48a;
  --focus-on-accent:   #1a110b;
  --focus-bg:          #120d0a;
  --focus-mode-ring:   #ffffff;  /* RENAMED from --focus-ring, see note */
}

/* DARK: put the same values in BOTH the prefers-color-scheme block and :root[data-theme="dark"] */
  color-scheme: dark;
  --bg: #15110d; --surface: #1d1813; --surface-2: #26201a; --surface-3: #302821;
  --border: #3a3129; --border-strong: #74685a;
  --text: #ede4d6; --text-muted: #b3a593; --text-subtle: #998b79; --text-inverse: #15110d;
  --accent: #e8956a; --accent-hover: #f0a882; --accent-active: #f5bb9a;
  --accent-soft: #3a2418; --accent-text: #e8956a; --on-accent: #1a110b; --focus-ring: #e8956a;
  --ontrack: #5cc283; --ontrack-soft: #1c2e22;
  --behind:  #e0a43a; --behind-soft:  #33281a;
  --over:    #4fc3cf; --over-soft:    #16302f;
  --danger:  #ff7a8a; --danger-soft:  #3a1f24;
  --heat-0: var(--surface-2);
  --heat-1: #2e2218; --heat-2: #5a3820; --heat-3: #8f5428; --heat-4: #c9773d; --heat-5: #f0a872;
  --shadow-1: 0 1px 2px rgba(0,0,0,0.45);
  --shadow-overlay: 0 16px 40px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4);
  --scrim: rgba(0,0,0,0.6);
  /* --subj-* dark values unchanged */
```

**Bug to fix while doing this:** the round-2 `:root` block currently sets `--focus-ring: #ffffff` **globally**. That overrides the accent focus ring on every page, which makes it invisible on light paper. Rename it to `--focus-mode-ring` and use it only inside the focus overlay (`.overlay { --focus-ring: var(--focus-mode-ring); }`).

**Shared components that pick the new look up for free:** buttons, chips, progress bars, ring, heatmap and nav selection all read tokens. The only hard-coded colour to replace is the favicon. Plan, Timecard, Courses, Review and Settings keep their structure exactly. The only other change is the wordmark in the nav.

---

## 2. Opening splash

### 2.1 Copy and attribution

The exact text: **Would climbing up a mountain be impressive if the mountain was flat?**

**No attribution.** An exact-phrase web search (27 Oct 2026) found no verifiable source, so the quote stands alone. Do not add a name, and do not add "Unknown" or "Anonymous" either.

### 2.2 Look

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │  bg: linear-gradient(180deg,
│                                                                      │      --splash-bg-top 0%, #2b2118 55%,
│            Would climbing up a mountain be impressive                │      --splash-bg-bottom 100%)
│                     if the mountain was flat?                        │  + radial glow --splash-glow at
│                                                                      │    (50%, 100%), r 70vmax, α .22
│                          ╱●                                          │  motif: 96×40 SVG, 28px below quote
│                        ╱                                             │
│                                                                      │
│                         StruggleMore                                 │  wordmark 13px, muted, bottom 40px
└──────────────────────────────────────────────────────────────────────┘
```

- **Quote:** Fraunces italic 400, `--text-splash` (28px on phone up to 60px), `--lh-splash`, `--splash-ink`, centred, `max-width: min(22ch, 88vw)` with `text-wrap: balance`. At most widths it breaks into two lines, after "impressive" and before "if". Optical size is automatic (opsz axis). Positioned at 44% of the viewport height (slightly above centre).
- **Motif:** an inline SVG, 96×40, `--splash-ink` at 0.55: a 1.5px line rising at 28° from bottom-left, with a 7px-radius disc (the boulder) resting on it a third of the way up. While the quote holds, the disc rolls **6px up the line**, rotating to match (`transform: translate(...) rotate(...)`), with `ease-in-out` over the full hold. It's barely moving, as it should be. No figure: at 96px a figure would read as clip art.
- **Wordmark:** at the bottom centre, 40px plus safe-area from the bottom, in `--splash-ink-muted`.
- **Theme:** the splash is always dusk, whatever the theme, so it matches the focus scene.
- **Accessibility:** the splash element is `role="presentation" aria-hidden="true"`. The app's `<h1>` underneath is already in the DOM. Screen readers skip the splash, which is fine because it's decorative.

### 2.3 Timing

| t | What happens |
|---|---|
| 0 | First paint of `index.html`, before any JS bundle. The splash markup is **inline in `index.html`** (`<div id="splash">` before `#root`) with inline critical CSS, so it appears instantly and never waits on React. |
| 0 → ≤ 350 ms | Wait for the quote font: `document.fonts.load('italic 400 48px Fraunces')` raced against a 350 ms timeout. Whichever comes first starts the fade-in, so the fade never shows a font swap. |
| +600 ms | The quote fades in: `opacity 0→1`, `translateY 6px→0`, `--ease-out`. The motif and wordmark follow 120 ms behind. |
| +2200 ms | Hold (the motif rolls during this time). |
| +400 ms | The whole splash fades out (`opacity 1→0`). Then `#splash` is removed from the DOM. |
| **Total** | **≤ 3.55 s worst case, 3.2 s typical.** To keep the ceiling at 3.2 s, shorten the hold by the font wait: `hold = 2200 − fontWait`. |

**Never blocks:** React mounts into `#root` underneath from the start. The splash is a fixed overlay (`z-index` above everything), and its timer starts at first paint, not when the app is ready. There's no extra delay if the app is fast and no waiting for it if it's slow. If the bundle somehow hasn't rendered when the splash ends, the splash still leaves (the app's own blank state shows), so the splash never adds to load time.

**Skip:** any `pointerdown`, `keydown` or `touchstart` on the window → fade out over `--dur-splash-skip` (200 ms), then remove. **The key that skips is swallowed** (`preventDefault` + `stopImmediatePropagation` in a capture listener registered before React's), so a `Space` meant to dismiss the splash doesn't also open the block picker. Listeners are removed when the splash goes.

**When it shows:** once per document load (fresh visit or reload). In-app navigation never shows it, because it's an SPA and the splash markup is gone after first use. It's **skipped entirely** (removed before first paint by a tiny inline script) when:
1. The URL has `?nosplash` (for the reviewer, screenshots and e2e).
2. The stored data (`localStorage['productive:v1']`, parsed in a `try`) has `focus.immersive === true`. Someone mid-block who reloads should land straight back on their mountain.
3. `settings.showSplash === false`. This is a new boolean, default `true`, in Settings → General: "Show the opening quote". Validation repairs a non-boolean to `true`.

**Reduced motion:** no translate, no motif roll, and every fade becomes 150 ms. The quote still holds for 2.2 s, so the total is about 2.5 s.

**Implementation note:** the splash script is about 30 lines of vanilla JS inline in `index.html`. React code shouldn't know about it, except the Settings toggle that writes `showSplash`. **Don't put the splash in `App.tsx`.** A React splash can't appear until the bundle has downloaded and run, so on a slow load the user would see a blank page first and then the splash, which is exactly the fake delay this spec forbids. `App.tsx` only needs to do nothing. If the inline script is ever unavailable (a test harness), the app works without a splash.

---

## 3. The Sisyphus focus scene

### 3.1 Decision

**`sisyphus` becomes the default scene.** A dusk-lit mountain fills the overlay. A stylised figure pushes a large boulder up its slope, and the boulder's position on the slope **is** block progress. The summit is always in view, so the goal is literally on screen.

**Daylight stays as an alternate, cheaply.** Ship it as the **Canvas 2D variant already specified in FOCUS_DESIGN §3.1 "Fallback"**: gradient sky, sun, three ridges, lake with glitter, stars. It shares this scene's palette and sky module, so it costs about 120 lines. The full WebGL shader is **dropped**. **Nightfall is dropped.** `SCENE_IDS = ['sisyphus', 'daylight']` and `DEFAULT_SCENE = 'sisyphus'`. Existing validation already repairs an unknown id such as `'nightfall'` to the default with a warning. F0 never reached `main`, so no migration is needed.

`SCENE_META.sisyphus = { label: 'Sisyphus', description: 'Push the boulder to the summit. It reaches the top as the block ends.', swatch: 'linear-gradient(160deg, #3a2a3e 0%, #c98a5a 55%, #3a2b20 56%, #1f1712 100%)' }`

### 3.2 Rendering approach

- **Canvas 2D**, not WebGL. A jointed figure is vector work (capsules, a polygon torso, a disc head) that Canvas 2D does crisply and simply. The sky and mountains are static enough to cache. No libraries and no image assets: the boulder texture is generated at runtime from noise.
- **Layers, all in one engine and one visible canvas:**
  1. `skyCache`: an offscreen canvas holding the sky gradient and stars. Rebuilt when the palette changes (at most every 2 s) or on resize.
  2. The sun, glow and moon, drawn every frame. They're cheap (two radial gradients).
  3. Clouds: three pre-rendered soft cloud sprites (offscreen, built once), drawn with drift.
  4. `landCache`: an offscreen canvas holding the 3 ridges, the mountain body, the slope rim, the summit cairn, and the trail done and ahead. Rebuilt every 2 s, or when the trail changes by ≥ 1 device px, or on resize.
  5. Every frame: the boulder's shadow, the far limbs, the torso and head, the boulder, the near limbs, particles.
  6. Grade: a vignette in a cached radial gradient, one `fillRect` per frame.
- **Sepia grade:** every palette colour goes through `grade(c) = mix(c, sepia(lum(c)), 0.25)`, where `sepia(l) = mix(#20160e, #f2dcb8, l)`. It's computed in JS when the palette is re-sampled, so it costs nothing per pixel. This is what makes the scene feel like the photo without copying it.

### 3.3 World, composition and camera

**Camera: fixed. The whole mountain, base to summit, is always in view.** That's the clarity argument. Position on the slope is the progress bar, and a panning camera would hide how far is left. Parallax is depth layering only (haze per layer). Nothing pans.

**World coordinates:** y points up, units are fractions of the world height `S` (in CSS px).

| Layout | Test | World box (w × h) | `S` (world height, px) | Placement |
|---|---|---|---|---|
| Landscape | `w/h ≥ 0.9` | 1.6 × 1.0 | `min(h, w / 1.5)` | bottom-anchored, centred horizontally. A viewport narrower than 1.6:1 crops ≤ 3% per side. Ultrawide shows extra ridges and ground left and right, generated procedurally to the full canvas width. |
| Portrait | `w/h < 0.9` | 0.75 × 1.0 | `min(0.9h, w / 0.72)` | bottom-anchored, centred. The sky fills everything above (≈ 300px on a 390×844 phone, where the HUD readout lives). |

`toScreen(x, y) = (ox + x·S, h − y·S)`, where `ox = (w − worldW·S)/2`.

**The slope path** is a cubic Bézier `P0…P3` in world units, plus a short summit plateau. It's arc-length parameterised with a 256-entry LUT built on resize, and `s ∈ [0,1]` is the fraction of length.

| | P0 | P1 | P2 | P3 (summit lip) | Plateau end | Angle base → top | Length |
|---|---|---|---|---|---|---|---|
| Landscape | (0.10, 0.12) | (0.62, 0.33) | (0.94, 0.52) | (1.24, 0.74) | (1.36, 0.755) | 22° → 36° | 1.30 |
| Portrait | (0.04, 0.10) | (0.30, 0.24) | (0.48, 0.40) | (0.64, 0.58) | (0.73, 0.59) | 28° → 48° | 0.77 |

The slope steepens toward the top, so the hardest part comes last. That suits the story, and it's why the progress easing (§3.6) slows near the summit.

**Composition, back to front:**

1. **Sky:** Daylight's palette keyframes (FOCUS_DESIGN §3.3 table) through `grade()`. A vertical gradient from zenith to the horizon at `Hy = 0.30` world, plus a horizon band. Stars use grid-hashed dots, visible only at dusk and night.
2. **Sun (moves with progress, §3.6):** a soft disc of radius `0.028·min(w,h)` with a two-term glow, same as Daylight. The moon appears in break and overtime.
3. **Clouds:** three flat, soft sprites (stacked ellipses with a blur filter, rendered once) in the band `Hy+0.10 … Hy+0.45`. They drift right at 4 px/s and wrap around.
4. **Ridges (3 layers):** each is `y = base + amp·ridgedNoise(xScreen/S · freq + seed)`, sampled every 6 px into a `Path2D` and filled to the bottom. Values: `base = [0.36, 0.27, 0.18]`, `amp = [0.14, 0.10, 0.06]`, `freq = [1.1, 2.0, 3.6]`, `haze = [0.70, 0.45, 0.22]`. Colour is `mix(ridgeNear, horizon, haze)`. The far ridges cover the full canvas width, which is what fills an ultrawide screen.
5. **Mountain body:** a polygon from the bottom-left, along the ground `(0, P0.y−0.01)`, to P0, along the path to the summit lip, across the plateau, then down the back side to `(worldW + margin, 0.42)` with ±0.02 noise, and down to the bottom-right. Fill it with a vertical gradient `rockLit` (top) → `rockShade` (bottom). Add 40–60 short **strata strokes** roughly parallel to the slope (hash-placed, 1px, α 0.12) and 25 small **scree flecks** near the path, for the rocky texture of the reference. The slope edge gets a 2px rim light in `sunCol` α 0.35 on the sun-facing side.
6. **Summit cairn:** three stacked flattened ellipses (widths 0.030, 0.022, 0.014 world) at the plateau's right end. It's the goal marker, and it's quieter than a flag.
7. **Trail:** along the path from the start point to the boulder's back edge, a 3px stroke in `rockShade` darkened 20% at α 0.35 (scuffed ground, "done"). From the boulder's front edge to the summit lip, dots every 1.6% of the path in `--focus-ink` at α 0.18 ("left to go"), the same idea as Daylight's dotted arc.
8. **Figure + boulder + particles:** §3.4 and §3.5.
9. **Vignette:** `1 − 0.28·r^2.2`, as in Daylight.

**Palette additions (pre-grade), interpolated by the same paletteP as the sky:**

| stop | rockLit | rockShade | figure | boulderBase |
|---|---|---|---|---|
| dawn | `#5a4a52` | `#1e1820` | `#120d10` | `#6a5a58` |
| noon | `#8a7258` | `#2e241c` | `#18110c` | `#9a8468` |
| golden | `#a2744a` | `#2c1e16` | `#1a110b` | `#b08660` |
| dusk | `#5a3e3a` | `#1a1216` | `#0f0a0c` | `#6e5048` |
| night | `#2a2430` | `#0e0b10` | `#08070a` | `#3a3440` |

The figure is always the darkest element, a near-silhouette, like the reference's strong shadow side. A rim light (§3.4) gives it form.

### 3.4 The figure

**Proportions, in units of standing height `H`.** `H = 0.085·S` in landscape (≈ 76px at 900 tall) and `0.10·S` in portrait (≈ 54px on a 390-wide phone).

| Part | Size | Drawn as |
|---|---|---|
| Head | r 0.065H | disc |
| Neck | 0.04H | (gap only; head centre sits 0.09H beyond the shoulder along the spine) |
| Torso (shoulder → hip) | 0.30H; width 0.17H at the shoulders, 0.12H at the hips | rounded quad (a slight chest bulge on the front edge: quadratic curve, bulge 0.02H) |
| Upper arm / forearm | 0.17H / 0.16H; width 0.058H → 0.044H | tapered capsules (two circles + tangent quad) |
| Thigh / shin | 0.245H / 0.245H; width 0.082H → 0.056H | tapered capsules |
| Foot | 0.11H long, 0.035H tall | rounded rect, heel at the ankle |
| Hand | r 0.03H | disc |

**Fill:** `figure` colour. **Far-side limbs** (the far arm and far leg) use `figure` lightened 10% toward `rockShade`, so the two sides separate. **Rim light:** after filling the near side, stroke the sun-facing contour with `sunCol` at α 0.30, 1.25px. A cheap version: redraw the near silhouette offset 1px toward the sun into a clip, `source-atop`. Turn it off below quality 0.75.

**Facing:** uphill (+x). **Body lean:** the torso makes **40° with world vertical** (oscillating 36°–44°, below). That's the reference's committed push, steep enough to read as effort even at phone size.

**Rig approach: keyframed pelvis and spine plus analytic two-bone IK for all four limbs.** The pelvis height, surge and torso lean are curves of the cycle phase φ. The feet follow keyframed targets on the ground, and the hands are pinned to contact points on the boulder. IK puts the knees and elbows where they need to be. This keeps the hands glued to the stone and the feet glued to the slope at any slope angle and any screen size, which hand-authored FK angles can't do.

- **Leg IK:** hip → foot target. Lengths `a = 0.245H` and `b = 0.245H`, target distance clamped to `≤ 0.995(a+b)`. Pick the solution with the **knee forward** (uphill side).
- **Arm IK:** shoulder → hand target. `a = 0.17H`, `b = 0.16H`. Pick the solution with the **elbow below** the shoulder-to-hand line, so the elbows are slightly bent and down.
- **Hand targets:** points on the boulder surface at fixed **non-rotating** angles from its centre: near hand at **208°**, far hand at **192°** (0° = +x, counter-clockwise), at radius `R + 0.008H`. Because they don't rotate with the stone, the hands stay put while the texture rolls under them.

**Where things sit.** `ground(x)` is the path's y at world x, found through the LUT. The boulder centre sits at arc-length position `sB`, pushed out along the path normal by `R`. The pelvis is at arc-length `sB − (0.95H + R·0.35)/L` along the path, at height `hipH(φ)` **vertically** above `ground(x)`. With these numbers, the outstretched arms reach the stone with about a 10° bend at the elbows.

**The strain cycle.** At the block's pace the true forward speed is about 1 px/s. A normal walk would make the feet skate. Instead the figure takes **short, labouring steps on loose scree: each planted foot slips back under the load.** The slipping is what sells the effort, and it explains the dust. The feet never skate on their own: each stance foot is locked to the ground and the ground "gives" (each slip throws dust).

Base cycle period `T = 2.6 s`, φ ∈ [0,1). The two feet are offset by 0.5. Foot positions are measured **along the slope**, relative to the pelvis's ground point.

| φ (per foot) | Foot | Target along slope | Lift |
|---|---|---|---|
| 0.00 → 0.30 | swing | −0.30H → +0.06H (easeInOut) | `0.06H·sin(π·u)`, u = local 0..1 |
| 0.30 → 0.55 | stance, **slip** | +0.06H → −0.14H (easeOut) | 0, emit dust ∝ slip speed |
| 0.55 → 1.00 | stance, grip | −0.14H → −0.30H (linear, slow push) | 0 |

Body curves (φ of the cycle, both feet):

```
hipH(φ)  = 0.47H − 0.015H·cos(4πφ)             // bobs twice per cycle, knees well bent
surge(φ) = 0.018H·max(0, sin(4πφ − 0.6))        // forward shove after each foot plants
lean(φ)  = 40° + 4°·sin(4πφ + π/2)              // 36°..44°, deepest at plant
headTilt = lean − 18°                            // face turned up toward the stone
boulderNudge = 0.6·surge(φ)                      // stone moves with the shove, then settles
boulderRot   = (sB·L + boulderNudge)/R          // rolling without slipping, world units
```

**Reduced-motion and paused key pose** (the IK at φ = 0.42, listed so a static frame matches the moving one): lean 42°, near foot at −0.10H, far foot at −0.28H, hipH 0.455H, head tilt 24°.

**Effort details:**

- **Speed variation:** each new cycle draws `T = 2.6 s × (1 + 0.24·(rand − 0.5)) × (1 + 0.25·sB)`. That's ±12% jitter, and up to 25% slower near the summit. Use a seeded PRNG (mulberry32, fixed seed), so the motion is deterministic for screenshots.
- **Strain pause:** after a random 5–9 cycles, freeze the gait at φ = 0.42 (both feet planted) for 1.6–2.4 s. During the pause: lean eases to 45°, hipH drops 0.02H, the head drops (headTilt eases to lean − 4°) and a tremor runs on the pelvis, hands and boulder (`0.006H·sin(2π·5t)`). Then a **heave**: the first cycle after the pause runs 25% faster and its surge is ×1.6.
- **Breathing** (paused, standing, sitting): the torso scales 1 ± 0.012 along its width over a 3.2 s period.

### 3.5 Boulder and particles

- **Size:** `R = 0.56H` (diameter 1.12H). As in the reference, the stone is taller than the hunched figure (≈ 0.7H tall at the shoulder) and close to a standing height. At 76px figure height the boulder is about 85px across.
- **Texture:** generated once per resize into an offscreen canvas of `2R × dpr × 1.5` px:
  1. A base fill of `boulderBase` (re-tinted by redrawing on palette change; or draw it neutral grey and tint at draw time with `globalCompositeOperation = 'multiply'` over a disc of `boulderBase`. Either is fine).
  2. **Value-noise mottling:** two octaves (cell size R/5 and R/12), mapped to ±14% luminance.
  3. **Six to nine pits:** small ellipses with a dark lower-left crescent and a light upper-right one.
  4. **Three crack polylines** (5–7 jittered segments, 1px, α 0.35).
  5. A slightly lumpy outline: the radius modulated by `1 + 0.035·noise(θ·3)`. Precompute 48 points and use them as the clip path. That makes it a rock, not a ball.
- **Draw:** `translate(centre) → rotate(boulderRot) → drawImage(texture)`. Then, **unrotated**, a lighting pass clipped to the outline: a radial highlight toward the sun direction (`sunCol` α 0.35), a terminator shade on the far side (α 0.5 of `rockShade`) and a 1.5px rim on the sun side. The light stays fixed while the texture turns, and that's what makes the rotation read.
- **Contact shadow:** a flattened ellipse under the stone (`rockShade` α 0.45, width 1.4R) and a smaller one under each planted foot.
- **Particles** (cap **60** live, a pooled array with no allocation per frame):
  - **Dust:** each slip phase emits 3–6 puffs at the slipping foot. Puffs are circles of r 0.01–0.025H that grow ×2.5 over a 0.9–1.4 s life. Velocity points back and down the slope at 0.15–0.35H/s plus a slight rise, and they fade with α 0.35 → 0. The colour is `rockLit` lightened 20%.
  - **Pebbles:** with a 15% chance per slip, one pebble (r 0.012–0.02H, `rockShade`) spawns at the foot and **rolls down the slope** along the path: gravity along the tangent at `g·sinθ` with `g = 2.2H/s²`, two small hops (velocity ×0.4), until it leaves the bottom of the screen or 3 s pass.
  - **Boulder grit:** during a heave, 2 tiny grains fall from the boulder's contact point.

### 3.6 Progress mapping

Let `p` be block progress, 0 → 1. `L` is the path length and `s` is arc-length fraction.

```
e(p)   = p + 0.10·sin(π·p)        // monotone (e' ≥ 0.69): moves visibly from the first minutes,
                                  // ≈30% faster at the start, ≈30% slower near the top (steep part)
sB(p)  = s0 + (s1 − s0)·e(p)      // boulder centre position along the path
s0     = (1.25H + R) / L           // the figure's back foot clears P0 at the start
s1     = 1 − (R·0.9) / L           // the boulder's leading edge touches the summit lip at p = 1
```

At 1440×900, a 25-minute block moves the stone about 1000 px, roughly 0.7 px/s. You can't see it moving second to second, but it's obvious minute to minute, and the trail (§3.3.7) shows done and remaining at a glance. The engine renders any `p` directly. Nothing accumulates, so a reload at 70% looks right on the first frame (FOCUS_PLAN §6.3).

**Sun and sky follow progress too:**

```
paletteP = 0.86·p                 // focus ends at Daylight's "golden hour" stop; sunset/dusk is the reward
sun path: quadratic Bézier in SCREEN space
  A = (0.10w, Hy_screen)          // rises behind the far ridges on the left
  C = (0.42w, 0.10h)              // high point
  B = (summitScreenX + 0.035w, summitScreenY − 0.11h)   // just above and behind the summit
sunPos = bez(A, C, B, p)
```

At p = 1 the sun sits just behind and above the summit, so the figure and stone arrive **into the sun**. Portrait uses `C = (0.40w, 0.08h)`, and B is the same rule.

### 3.7 Completion: the summit beat (`setPhase('complete')`, ≈ 6 s, plays once)

`instant: true`, as when restoring an old completion after a reload, jumps straight to the final frame.

| t (s) | Beat |
|---|---|
| 0.0 – 1.4 | **Last push:** the gait speeds up 20%, then the boulder rolls from `s1` over the lip onto the **plateau centre** (sB → plateau midpoint, easeOut). It rocks forward and back on a damped spring (±3° rotation, ±0.01H, ζ 0.35) and settles. Dust burst: 10 puffs. |
| 1.2 – 2.6 | **Stand up:** the figure takes two steps onto the plateau (normal IK gait at 1.5× speed), then lean eases 40° → 4°, hipH 0.47H → 0.53H (legs straight), the far hand drops to the side (arm hangs at 8° from the torso), and the near hand **rests on top of the boulder** (target at 120°, the top-left of the stone). headTilt eases to −8°: looking out over the valley, away from the climb. |
| 1.0 – 4.0 | **Sky climax:** paletteP 0.86 → 1.0 (golden → sunset → dusk). The sun sinks behind the summit: it slides 0.06h down, and the mountain occludes it. As it goes, figure and stone are **silhouetted inside the sun's glow** (glow radius ×1.6 during 1.0–3.0 s). The afterglow band and Belt of Venus behave as in Daylight. |
| 2.5 – 5.0 | Stars come out, brightest first (Daylight's rule). |
| ≥ 3.6 | The HUD shows `Summit.` (Fraunces 600, 28px, `--focus-ink`) above the existing complete panel (FOCUS_DESIGN §2.3, buttons unchanged). |
| after | Overtime idle: the figure stands. Every 6–9 s it shifts its weight (hip sway 0.01H over 1.2 s). Breathing continues. |

**Overtime** (phase `complete`, `p = overtime/60 min`): paletteP keeps going from dusk to night over the first 10 minutes. The moon rises from the left along Daylight's overtime path. The figure keeps standing.

### 3.8 Other phases

| Phase | Scene |
|---|---|
| `paused` | The gait stops in the **key pose** (§3.4), bracing the stone. Breathing only, no particles. Ambient motion (clouds) runs at 25%. The whole frame desaturates 35% and darkens 8% over 400 ms (a `saturation` composite of grey at α 0.35, or desaturate the palette in JS and rebuild the caches). The progress position is frozen. |
| `break` | Night palette, moon crossing with `p = breakProgress`. **The boulder stays on the summit.** The figure **sits** with its back against the stone: pelvis on the plateau, thighs 15° above horizontal, shins down, arms resting on the knees, head tilted 10° down. Breathing. Stars twinkle slowly. In the last 15% the pre-dawn glow rises on the left, as in Daylight. When the break is over, the figure stands up (1 s) and waits in the standing idle. |
| `open` (no block) | `p` loops every 60 focused minutes (FOCUS_PLAN). Each loop climbs base → summit with the same mapping. **When `p` wraps** (new p < old p − 0.5), play a **mini summit** (1.4 s: the last push and stand-up only, no sky climax and no stars) and then the **roll-back** (§3.10). The palette cross-fades from golden back to dawn over the 2.8 s roll-back. No chime and no HUD heading. |
| `focus` after `complete` or `break` (Keep going, or Start next block) | **Roll-back** (§3.10), then the gait resumes at `s0`. |

### 3.9 Phase table: what `setProgress(p)` means

`focus`/`open`/`paused` = block (or loop) progress. `complete` = overtime/60 min. `break` = break progress (as in `types.ts`). The engine needs no other state.

### 3.10 The roll-back: a wink to the myth

**Yes, the boulder rolls back down, but only at the start of the next climb.** It never happens at completion. The finish is a pure reward. The roll-back is the moment you choose to go again: **Keep going**, **Start next block**, or an open-ended loop wrap. It plays only when the engine itself sees `complete`/`break` → `focus` (or an open wrap) during its lifetime. A fresh mount always renders the right state directly, with no roll-back.

2.8 s at 60 fps:

| t (s) | Beat |
|---|---|
| 0.0 – 0.4 | The figure's resting hand lifts. The boulder tips backwards over the lip (rotates −10°, moves 0.02 along the path). |
| 0.4 – 2.0 | **The boulder rolls down the path** under gravity: `sB(t) = plateau − ½·g′·t²` with `g′` chosen so it reaches `s0` at t = 2.0. Rotation follows the distance (`/R`), so it spins fast and reads instantly. Dust trails at every 0.25 s, and the trail done stroke is wiped back as it passes. |
| 2.0 – 2.4 | At the base: two damped hops (0.06H, then 0.02H) and a dust burst of 8. |
| 0.6 – 0.9 | The summit figure fades out (opacity 1 → 0). |
| 2.1 – 2.5 | The figure fades in at the base, behind the stone, in the key pose. |
| 2.8 | The gait resumes. Progress mapping takes over (p ≈ 0). |

**Optional caption** (HUD, coder's choice, at most once per session): `One must imagine Sisyphus happy. (Albert Camus)` in Plex Sans 13 `--focus-ink-muted`. It fades in at 0.6 s and out at 3.6 s. Attribution: the closing line of Camus's *The Myth of Sisyphus* (1942, Justin O'Brien translation). **Reduced motion:** no roll. Cut straight to the base frame. Skip the caption too.

### 3.11 HUD placement over this scene

The figure's path runs from bottom-left to the upper right, and the lower-right triangle under the slope is solid dark rock.

- **Landscape:** the readout goes in the **lower-right, over the rock body**: right-aligned, `right: 8vw; bottom: 16vh`. That's guaranteed contrast without a scrim (rock is L* < 25 in every palette; `--focus-ink` there is ≥ 9:1). The controls stay bottom-centre (they clear the figure's start position, which is above 12% of the height). The course · section line stays top-left. `Summit.` sits above the readout.
- **Portrait:** the readout is **top-centre in the sky band**, at 18% of the height, with the existing text shadow plus a soft radial scrim (`rgba(0,0,0,0.22)`, 60vw). The controls stay at the bottom.
- The text over the scene must meet 4.5:1 in every phase. The reviewer checks dawn, noon, golden, dusk and night frames.

### 3.12 Performance, power and reduced motion

- **Frame cadence:** **30 fps** steady (the gait looks fine at 30). **60 fps** only during the summit beat, the roll-back and the splash-to-overlay transition. **15 fps** when `!document.hasFocus()`. **0** when `setRunning(false)` (hidden tab): cancel the rAF and keep nothing ticking. Gait time pauses while hidden, and progress always comes from `p`.
- **Resolution:** the engine clamps `dpr` to **1.5** (whatever the host passes) and caps the back-buffer at **2.1 MP**. Above that it scales down and lets CSS upscale. The figure stays acceptably crisp because it's large and dark on mid-tone.
- **Budget:** **≤ 4 ms per frame** total at 1440×900, dpr 2 → 1.5 on a mid laptop (FOCUS_PLAN §6.3). A typical frame is 2 blits, 2 gradients, about 12 capsule paths, 1 rotated `drawImage` and ≤ 60 particles. Cache rebuilds (≈ 3–6 ms) run at most every 2 s and never in the same frame as a particle burst; spread them with `requestIdleCallback` where available.
- **Adaptive quality:** if the rolling 90-frame average is above 22 ms, step down 1.0 → 0.75 → 0.5. Each step lowers the internal scale and disables, in order: the rim light, cloud sprites, pebbles. Never step back up within a session.
- **Resize:** rebuild the LUT, caches and boulder texture (debounced 100 ms by the host).
- **Reduced motion** (`setReducedMotion(true)` or the init option): **a static illustration.** No rAF loop. Draw one frame in the key pose, with no particles and no cloud drift. Redraw **only** on `setPhase`, on `resize`, or when `setProgress` has moved the boulder ≥ 1 device px **and** at least 60 s have passed since the last draw. That's about one redraw a minute, a 2% step on a 50-minute block. Completion is a single **1 s cross-fade** (10 fps, snapshot alpha) from the last climbing frame to the final standing-at-dusk-with-stars frame. Break shows the sitting pose, and the roll-back is a cut.

### 3.13 Pseudo-code

```ts
// scenes/sisyphus.ts (sketch, not final)
type V = { x: number; y: number };

function twoBoneIK(root: V, target: V, a: number, b: number, bendSign: 1 | -1): V /* joint */ {
  const dx = target.x - root.x, dy = target.y - root.y;
  const d = Math.min(Math.hypot(dx, dy), 0.995 * (a + b));
  const base = Math.atan2(dy, dx);
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const ang = base + bendSign * Math.acos(clamp(cosA, -1, 1));
  return { x: root.x + a * Math.cos(ang), y: root.y + a * Math.sin(ang) };
}

function footTarget(phi: number, pelvisS: number, H: number, L: number): { s: number; lift: number; slip: number } {
  // returns arc-length position, lift above ground, slip speed (for dust)
  if (phi < 0.30) { const u = phi / 0.30;  return { s: pelvisS + lerp(-0.30, 0.06, easeInOut(u)) * H / L, lift: 0.06 * H * Math.sin(Math.PI * u), slip: 0 }; }
  if (phi < 0.55) { const u = (phi - 0.30) / 0.25; return { s: pelvisS + lerp(0.06, -0.14, easeOut(u)) * H / L, lift: 0, slip: (1 - u) }; }
  const u = (phi - 0.55) / 0.45; return { s: pelvisS + lerp(-0.14, -0.30, u) * H / L, lift: 0, slip: 0 };
}

function solvePose(st: State): Pose {
  const { H, R, L } = st.dims;
  const nudge = 0.6 * surge(st.phi) * st.heave;
  const sB = st.boulderS + nudge / L;
  const bc = add(path.at(sB), mul(path.normalAt(sB), R));            // boulder centre
  const pelvisS = sB - (0.95 * H + 0.35 * R) / L;
  const g = path.at(pelvisS);
  const pelvis = { x: g.x + surge(st.phi) * st.heave, y: g.y + hipH(st.phi) + st.tremor };
  const lean = rad(st.leanDeg);                                       // from vertical, toward +x
  const shoulder = { x: pelvis.x + 0.30 * H * Math.sin(lean), y: pelvis.y + 0.30 * H * Math.cos(lean) };
  const head = { x: shoulder.x + 0.09 * H * Math.sin(lean), y: shoulder.y + 0.09 * H * Math.cos(lean) };
  const legs = [0, 0.5].map(off => {
    const f = footTarget((st.phi + off) % 1, pelvisS, H, L);
    const ft = add(path.at(f.s), { x: 0, y: f.lift });
    return { foot: ft, knee: twoBoneIK(pelvis, ft, 0.245 * H, 0.245 * H, kneeForward(pelvis, ft)), slip: f.slip };
  });
  const handAt = (deg: number) => add(bc, polar(R + 0.008 * H, rad(deg)));
  const arms = [208, 192].map(deg => {
    const hand = handAt(deg);
    return { hand, elbow: twoBoneIK(shoulder, hand, 0.17 * H, 0.16 * H, elbowDown(shoulder, hand)) };
  });
  return { pelvis, shoulder, head, legs, arms, boulder: { c: bc, rot: (sB * L) / R + st.rollExtra } };
}

// engine loop
function frame(now: number) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  if (now - last < 1000 / targetFps()) return;                       // 30 / 60 / 15
  const dt = Math.min(0.1, (now - last) / 1000); last = now;

  st.boulderS = sequence.active ? sequence.boulderS(now) : sB(displayP());  // §3.6 / §3.7 / §3.10
  advanceGait(st, dt);              // phi += dt / T; new cycle → new T, strain-pause countdown
  emitParticles(st, dt); stepParticles(dt);
  maybeRebuildCaches(now);          // palette every 2 s, trail on ≥1 device px change

  ctx.drawImage(skyCache, 0, 0);
  drawSunMoon(ctx, pal, sunPos(p));
  drawClouds(ctx, now);
  ctx.drawImage(landCache, 0, 0);   // ridges, mountain, cairn, trail
  const pose = solvePose(st);
  drawShadows(ctx, pose);
  drawLimb(ctx, pose.legs[1], farTint); drawArm(ctx, pose.arms[1], farTint);
  drawTorsoHead(ctx, pose);
  drawBoulder(ctx, pose.boulder, pal); // rotated texture + unrotated lighting
  drawLimb(ctx, pose.legs[0], figure); drawArm(ctx, pose.arms[0], figure);
  if (quality >= 0.75) drawRimLight(ctx, pose, sunDir);
  drawParticles(ctx);
  ctx.drawImage(vignetteCache, 0, 0);
}
```

Engine contract (`types.ts`) is unchanged. `setPhase(phase, { instant })` starts the summit beat, the roll-back or a pose change. Sequences are timestamp-driven, so a hidden tab that comes back mid-sequence finishes it at the right point (or snaps to the end if more than 6 s have passed).

---

## 4. Simplified Today: two cards

### 4.1 What stays, what goes

| Content | Fate |
|---|---|
| Timer card + Today's section card | **Merged into the Start card.** |
| Logged today | **Becomes the Log card.** |
| Progress ring vs daily goal | **Removed.** The **one key number** (`3:23 / 8:00`) and a **course-segmented progress bar** go in the Start card. The bar's segments use course colours, so the course split survives without a legend. Hovering or focusing a segment shows a tooltip `OChem 2:28`. |
| This week strip | **A chip in the header:** `Week 12:40 / 48:00`, coloured by status (ontrack/behind/over soft), linking to Timecard. |
| Streak | **A chip in the header:** `4-day streak` (hidden at 0). |
| Today's plan (DayTimeline) | **Moves off Today.** It already lives in Plan week (today's column is highlighted). On Today, the planned block shows up only as (a) the picker's "Until 15:00 (planned)" option and (b) a single muted line in the Start card: `Planned now · OChem until 15:00`, or `Next · LinAlg at 16:00`. A header text link reads `Plan →`. |
| Banners | **One single-line row at most** (≤ 40px), with the priority from FOCUS_PLAN §7.2: storage error > 10h > carry-over. The **no-plan banner leaves Today** and goes to Plan week, where it's actionable. |
| "+ Add entry" | It lives in the Log card's header (`+ Add`, `N`). The page header no longer has it. |

### 4.2 Desktop (1280×800; sidebar 232, content 1048 − 2×32 pad = 984)

**Idle:**
```
┌──────────┬────────────────────────────────────────────────────────────────────────────────────────┐
│Struggle  │ Today  Tue 27 Oct          [Week 12:40 / 48:00 · On track] [4-day streak]   Plan →    │ 40  (pad 24)
│   More   │                                                                                        │ 12
│          │ ⚠ "Magnetism" (planned Fri) isn't finished.          [Do it today] [Mark done] Dismiss│ 40  optional
│ ☀ Today  │                                                                                        │ 12
│ ▦ Plan   │┌ START ─────────────────────────────────────┐┌ LOG ─────────── 3:23 · 4 entries [+ Add N]┐│
│ ▤ Timecard││                                            ││ 9:00–10:40   ● OChem · Ch 4 – Sub…   1:40 ││
│ ◫ Courses ││  Course   [● Organic Chemistry        ▾]   ││ 11:00–11:55  ● LinAlg · §3 Deter…    0:55 ││
│ ▥ Review  ││  Section  [Ch 4 – Substitution        ▾]   ││ 13:10–13:58  ● OChem · Ch 4 – Sub…   0:48 ││
│          ││  Planned now · OChem until 15:00            ││ 14:05–14:25  ● Writing · Essay dr…   0:20 ││
│          ││                                            ││                                          ││
│          ││  Block  (25)(50•)(90)(Until 15:00)(Custom)(∞)││                                          ││  fills
│          ││                                            ││                                          ││  (≈ 648 with
│          ││  ┌──────────────────────────────────────┐  ││                                          ││   banner,
│          ││  │        ▶  Clock in            ␣       │  ││                 ↕ scrolls inside         ││   700 without)
│          ││  └──────────────────────────────────────┘  ││                                          ││
│          ││  ──────────────────────────────────────── ││                                          ││
│          ││  TODAY                                     ││                                          ││
│          ││  3:23 / 8:00                    4:37 to go ││                                          ││
│          ││  ▓▓▓▓▓▓▓▓▒▒▒▒░░░░░░░░░░░░░░░░░  [Behind]   ││                                          ││
│          ││  Section Ch 4: 2:28 of ~6:00   ✓ Mark done D││                                          ││
│ ⚙ Settings│└────────────────────────────────────────────┘└──────────────────────────────────────────┘│
└──────────┴────────────────────────────────────────────────────────────────────────────────────────┘
               Start 1.1fr  ·  gap 16  ·  Log 1fr                                                (pad 24)
```

**Running** (the Start card's top half changes; the TODAY block stays exactly where it was):
```
││ ● CLOCKED IN SINCE 13:10                   ││
││ ▌Organic Chemistry · Ch 4 – Substitution   ││
││            0:47:31                          ││  readout --text-display-compact (48px mono)
││ Block ▓▓▓▓▓▓▓▓▓▓░░░░░  18:20 left            ││  only when a focus session exists
││ [◐ Back to focus F] [■ Clock out ␣] [Switch S]││  "Start focus" instead of "Back to focus" for a plain timer
││ ───────────────────────────────────────── ││
││ TODAY  3:23 / 8:00 …  (unchanged)          ││
```

**Specs:**
- **Grid:** `height: 100dvh` minus the shell. `grid-template-rows: auto [auto] minmax(0, 1fr)`, `grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr)`, areas `"head head" "banner banner" "start log"`, `gap: 12px 16px`, `overflow: hidden`. It applies at `min-width: 1000px and min-height: 700px` (FOCUS_PLAN thresholds). Below that the cards stack: Start, then Log.
- **Start card:** padding 24. Its contents are a top-aligned column. The **TODAY block is pinned to the card bottom** (`margin-top: auto`), so the key number always sits in the same place, idle or running. The key number is `--font-mono` 32px/600 (`--text-3xl`) for logged time, with `/ 8:00` at 20px in `--text-muted`. The bar is 10px tall, `--radius-full`, with course-coloured segments of real logged time and the remainder `--surface-2`. A goal-met state turns the remainder into `--ontrack` at full width plus the `Met` chip. The section line is 13px muted with the Mark done ghost button (`D`).
- **Clock in button:** full card width, 56px tall, `--accent`, Plex Sans 16/600, `kbd ␣` inside at 0.7 opacity. Block chips are 36px, using the picker's options (FOCUS_PLAN §3.1). Selecting one sets `lastChoice`, and Clock in then starts with it directly, without opening the picker modal. The picker modal is still what `Space` opens from other pages (unchanged). This puts the picker inline on Today.
- **Log card:** a header with the title `Log` (`--text-lg` 600), `3:23 · 4 entries` in muted mono, and a `+ Add` button (`N`). The body is `flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain`. Rows are 40px: time range (mono 13, muted), course dot, `Course · Section` (truncate), note (truncate, muted, hidden below 1100px), duration (mono, right). Clicking a row or pressing `Enter` on it opens the Entry dialog (edit, delete inside). A pencil icon button appears on hover and on `:focus-within` (always visible on touch). The live row has the pulsing dot from the TimerPill and stays in view (keep the scroll at the bottom on update unless the user scrolled up). The empty state is centred: `Nothing logged yet. The boulder is waiting.` plus `[+ Add entry]`.
- **Header:** the title `Today` (`--text-2xl`) and the date muted inline. On the right: the two chips (`--chip-h` 32) and `Plan →`.

**Height budget at 800:** pad 24 + head 40 + 12 + [banner 40 + 12] + cards + pad 24 → the cards get **648px** with a banner and **700px** without. The Start card's idle content needs ≈ 470px and running ≈ 440px, so there's slack, and nothing scrolls. At 700px tall (the threshold) the cards get 548/600, still more than 470.

### 4.3 Phone (< 640px): scrolls, compact

```
┌──────────────────────────────┐
│ Today · Tue 27 Oct        [+]│ 44
│ [Week 12:40/48 ·On track][4d]│ 32  (chip row, horizontal scroll if needed)
│ ⚠ Magnetism unfinished  [⋯] │ 40  optional (actions in ⋯ menu)
│┌ START ─────────────────────┐│
││ [● Organic Chemistry     ▾]││
││ [Ch 4 – Substitution     ▾]││
││ (25)(50•)(90)(Until)(⋯)  →  ││  chip row scrolls horizontally
││ [      ▶ Clock in         ]││ 52
││ TODAY 3:23 / 8:00 4:37 to go││
││ ▓▓▓▓▓▒▒▒░░░░░░░░ [Behind]  ││
│└────────────────────────────┘│
│┌ LOG  3:23 · 4      [+ Add] ┐│
││ 9:00–10:40 ● OChem…   1:40 ││
││ 11:00–11:55 ● LinAlg… 0:55 ││
││ 13:10–now ● OChem…   0:48 ●││
││ Show all (5)                ││  last 3 + "Show all"
│└────────────────────────────┘│
│  ☀   ▦   ▤   ◫   ▥           │ tab bar
└──────────────────────────────┘
```

Target: the whole Start card, including the TODAY number, is visible above the tab bar on 390×844 without scrolling. Running state on phone: the readout is 40px, `[◐ Focus]` and `[■ Clock out]` sit side by side, and Switch goes in the `⋯` menu.

### 4.4 Removed and relocated code

- `ProgressRing` is no longer used on Today. Keep the component if Review or Courses use it, and delete it otherwise.
- The `DayTimeline` `fitHeight` work from FOCUS_PLAN §7.2(6) is **cancelled**. The `timelineRange` helper isn't needed for Today. Don't build it unless Plan wants it.
- The no-plan banner moves to the top of Plan week, unchanged in copy.
- FOCUS_DESIGN §5 (one-screen Today with 5 cards) is **superseded** by this section.

### 4.5 Reviewer acceptance checks (Today)

1. At **1280×800** and **1440×900**, light and dark, `?nosplash`, with the review fixture (3 entries including a running timer, 4 planned blocks, a carry-over banner): `document.scrollingElement.scrollHeight ≤ innerHeight`, `scrollWidth ≤ innerWidth`, and both card headings and the TODAY key number are fully inside the viewport.
2. Same with **15 logged entries**: the page doesn't scroll, the Log list scrolls inside its card, and the live row is visible.
3. Same with the 10h **and** carry-over conditions: exactly one banner row, the 10h banner shown, and "1 more" toggles to the next.
4. Idle → Clock in → running: the TODAY block doesn't move vertically (±2px).
5. The progress bar's segment widths match the course totals (±1px), tooltips name the course and time, and goal met shows the `Met` state.
6. The week chip and streak chip values equal the old This week and streak numbers for the same data. The streak chip is hidden at 0.
7. The Today page has no ring and no DayTimeline. Plan week shows the no-plan banner when there's no plan.
8. Clicking a Log row opens the Entry dialog with that entry, and Enter on a focused row does the same. `+ Add` and `N` open a new entry.
9. Block chips are a radio group (arrow keys move, roving tabindex). Clock in uses the selected chip, and Space on another page still opens the picker.
10. At 999×800 and 1280×690 the stacked layout scrolls with nothing clipped. At 375 px there's no horizontal scroll, and on 390×844 the Start card is fully above the tab bar.
11. axe: no new violations. Every text/background pair at ≥ 4.5:1 with the new tokens. The focus ring is visible on light paper (the `--focus-ring` bug from §1.5 is fixed).

---

## 5. Milestones for the coder (amends FOCUS_PLAN §9 F4–F5; adds F6)

Every milestone ends with `npm run typecheck`, `npm test` and `npm run build` clean, and is committed on `focus-mode`. **The repo stays `productive`**, and `package.json` `"name"` stays `productive`. **Storage keys don't change** (`productive:v1`, `productive:v1:corrupt`, `productive:focus:readout`, `productive:dismissed:*`). Renaming them would orphan the user's data.

### F4: Sisyphus scene (+ Daylight Canvas 2D alternate)

- **Scene id changes:**
  - `src/domain/types.ts`: `SceneId = 'sisyphus' | 'daylight'` (drop `'nightfall'`).
  - `scenes/ids.ts`: `SCENE_IDS = ['sisyphus', 'daylight']`, `DEFAULT_SCENE = 'sisyphus'`.
  - `meta.ts`: add the `sisyphus` entry (§3.1) and remove `nightfall`.
  - `storage/defaults.ts`: `settings.focus.scene` defaults to `'sisyphus'`.
  - `domain/validate(Focus).ts`: unchanged logic, but add a test that a stored `'nightfall'` is repaired to `'sisyphus'` with a warning.
  - `migrate.ts`: no schema bump. v1 → v2 migration writes the new default. Existing v2 data with `'daylight'` stays `'daylight'`, because it's a valid user choice and only branch builds ever wrote it.
  - `BlockPicker`, the overlay scene menu and the Settings scene chips render from `SCENE_IDS`, so they pick the new id up automatically. Check that the swatches read well.
- `scenes/palette.ts`: Daylight keyframes (FOCUS_DESIGN §3.3), the extra columns from §3.3 here, sRGB↔linear mixing, `grade()`. This file is pure and unit-tested: a stop at exact p returns that stop, and output is monotone between stops.
- `scenes/path.ts`: Bézier, arc-length LUT, `at(s)`, `normalAt(s)`, `groundY(x)`. Pure and tested: length within 1% of the §3.3 table, and the angles at the ends match it ±1°.
- `scenes/rig.ts`: `twoBoneIK`, `footTarget`, `solvePose`. Pure and tested: hands are at their targets within 0.5px when reachable, the knee is on the uphill side, and the foot is on the ground within 0.5px during stance.
- `scenes/sisyphus.ts`: the engine (§3.2–3.12). `scenes/daylight2d.ts`: FOCUS_DESIGN §3.1 fallback spec. `scenes/index.ts`: the registry. `SceneCanvas` as already planned.
- Acceptance (the F4 checks in FOCUS_PLAN §9 all apply), plus:
  - [ ] At p = 0, 0.25, 0.5, 0.9 and 1.0 (and after a reload at 0.7), the boulder is at `sB(p)` (±2px), the sun follows the §3.6 path, and the trail splits done from ahead at the boulder.
  - [ ] Phone portrait 390×844, desktop 1440×900 and ultrawide 3440×1440: summit and base both visible, figure height ≥ 50px, no stretched shapes.
  - [ ] The figure's hands stay on the boulder and its feet on the slope throughout the cycle (scrub with a debug `?scene-debug` slider). Lean stays within 36–45°. A strain pause appears within 25 s.
  - [ ] Completion plays the §3.7 beat once. `instant` jumps to the final frame. Break shows the sitting figure and the moon. Paused shows the brace pose, desaturated.
  - [ ] Keep going and Start next block trigger the roll-back. A fresh mount in `focus` never does. Open-ended wraps play mini summit + roll-back.
  - [ ] Reduced motion: no rAF loop running (Performance panel), a redraw about once a minute, completion as a 1 s cross-fade, no roll-back animation.
  - [ ] Frame time ≤ 4 ms at 1440×900 (internal dpr 1.5), 30 fps steady, no rAF while hidden, ≤ 60 particles.
  - [ ] HUD contrast ≥ 4.5:1 at dawn, noon, golden, dusk and night (§3.11).

### F5: two-card Today

- Rebuild `TodayPage` per §4: `StartCard` and `LogCard` components (new files under `src/components/` or `src/pages/today/`). Header chips. Single banner row with priority. No-plan banner moved to `PlanPage`.
- Inline block chips in the Start card share the option model with `BlockPicker` (extract `blockOptions(data, now)` if it isn't already pure).
- Segmented progress bar: extend `ProgressBar` with an optional `segments: { color, minutes, label }[]` prop, or add a small `SegmentBar`.
- Settings → Focus card as already planned in FOCUS_PLAN F5. The accessibility pass from FOCUS_PLAN §8 still applies.
- Acceptance: §4.5 checks 1–11, plus the existing F5 Settings and accessibility boxes.

### F6: rename, splash, re-skin

- **Tokens:** apply §1.5 (light and both dark blocks, identical), and fix `--focus-ring` → `--focus-mode-ring`.
- **Fonts:** add Fraunces to the `index.html` font link (§1.3).
- **Strings: `Productive` → `StruggleMore`** in `index.html` `<title>` and `<meta name="description">` ("StruggleMore: a personal study timecard."), `Nav.tsx` (brand label, aria-label, fallback title), `WelcomePage.tsx`, `useDocumentTitle.ts`, `state/ui.tsx` titles, `FocusController.tsx` title, `CorruptBanner.tsx`, the `localStorage.ts` console message, and `validate.ts` ("File is not a StruggleMore backup…", updating `validate.test.ts`). **Download filenames** become `strugglemore-backup-…json`, `strugglemore-timecard-…csv` and `strugglemore-unreadable-…json`. Import must still accept any filename.
- **Wordmark + mark** in Nav (expanded and collapsed) and WelcomePage (§1.1). `public/favicon.svg` is replaced (§1.1). There is no web manifest today. If one is added later, `name: "StruggleMore"`, `short_name: "StruggleMore"`, `theme_color: "#a3461a"`, `background_color: "#f6f1e7"`.
- **README:** the heading becomes `# StruggleMore`, with a one-line note: "Repository name: `productive`." Update any feature list to mention focus mode and the scene.
- **Splash:** inline markup, CSS and script in `index.html` (§2), plus `settings.showSplash` (type, default `true`, validation, a Settings → General toggle, and a migration default for existing v2 data). E2E and screenshots use `?nosplash`.
- **Focus copy:** the complete heading `Summit.`, the optional roll-back caption (§3.10) and the Log empty state (§1.2).
- Acceptance:
  - [ ] Fresh load: the quote appears within the first paint plus 350 ms in Fraunces italic, with no visible font swap. The total is ≤ 3.2 s (measure with a performance mark at removal). Any key, click or tap dismisses it in 200 ms, **and that key does not reach the app** (Space doesn't open the picker).
  - [ ] Navigating Today → Plan → Today never shows the splash. A reload shows it again. `?nosplash`, `showSplash: false` and a persisted immersive focus session each skip it with no flash.
  - [ ] The app renders underneath during the splash (React mounts at t ≈ 0). Throttled "Slow 4G" doesn't extend the splash beyond its timeline.
  - [ ] Reduced motion: no translate or roll, 150 ms fades.
  - [ ] `grep -rn "Productive" src index.html README.md` finds only the README's repo-name note. Storage keys are unchanged, and existing data loads.
  - [ ] All pages re-skinned through tokens only (no stray `#3446c9` or blue left: `grep -rni "3446c9\|8d9bff" src`). Contrast pairs from §1.4 hold.

**Order:** F4 → F5 → F6 is fine, but F6's token step is independent and small. The coder may do it first so F4/F5 screenshots already show the new palette.
