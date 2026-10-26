# Productive: design spec

Owner: designer agent · Status: v1, ready to implement · Research: `docs/DESIGN_RESEARCH.md`
Stack assumptions: React + TypeScript + plain CSS with custom properties. Desktop first, and it must work down to 360px wide.

**Visual direction in one line:** a well-made paper timecard turned into software. Warm off-white "card stock" surfaces, ink-blue as the single accent, a monospaced readout for every number that is a duration, ruled tables with hairline borders, and almost no shadow.

---

## 1. Design principles

1. **The clock is always visible.** If a timer is running, the user can see it from every screen (shell pill, tab title) and stop it in one action. A forgotten timer is the worst failure in this category, so it should never happen silently.
2. **Numbers are the interface.** Hours logged, planned and remaining are the content. Durations use tabular monospaced figures, align right in tables, and always use one format (`h:mm` by default). Decoration never competes with a number.
3. **Planned vs actual, side by side.** Every place that shows time shows it against intent: ring vs 8h goal, cell vs plan, week vs 40h. Use the same two visual treatments everywhere: *planned = outline/hatched* and *logged = solid*.
4. **One click to start, a minute to plan.** Clock in is pre-filled with today's section and doesn't open a prompt. Weekly planning is a short guided ritual, not a form.
5. **Calm, not gamified.** Streaks and heatmaps are records, not rewards or punishments. A missed day reads as neutral information. Colour always comes with a text or icon label.

---

## 2. Design tokens

### 2.1 Fonts
**IBM Plex Sans** for UI text and **IBM Plex Mono** for durations, clock times and numeric table cells. This is deliberate. IBM began partly as the International Time Recording Company, a maker of punch clocks, so Plex fits the timecard idea. It has true tabular figures, a slightly mechanical feel and a matching mono, and it is not Inter.

```html
<!-- index.html <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### 2.2 Ready-to-paste token block (`src/styles/tokens.css`)

```css
/* ==========================================================
   Productive design tokens
   Light is the default. Dark applies via prefers-color-scheme
   unless the user forces light with [data-theme="light"].
   [data-theme="dark"] forces dark. Set data-theme on <html>.
   ========================================================== */
:root {
  color-scheme: light;

  /* ---- Fonts ---- */
  --font-sans: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;

  /* ---- Type scale (size / line-height) ---- */
  --text-2xs: 11px;  --lh-2xs: 16px;   /* kbd hints, heatmap axis */
  --text-xs: 12px;   --lh-xs: 16px;    /* captions, table headers (uppercase) */
  --text-sm: 13px;   --lh-sm: 18px;    /* secondary text, sidebar items */
  --text-md: 14px;   --lh-md: 20px;    /* BODY default */
  --text-lg: 16px;   --lh-lg: 24px;    /* card titles, inputs on phone */
  --text-xl: 20px;   --lh-xl: 28px;    /* section headings */
  --text-2xl: 24px;  --lh-2xl: 32px;   /* page titles */
  --text-3xl: 32px;  --lh-3xl: 40px;   /* stat tile values */
  --text-display: 56px; --lh-display: 64px; /* Today timer readout (mono) */
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --tracking-caps: 0.06em;             /* for uppercase labels */

  /* ---- Spacing (4px base) ---- */
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* ---- Radii ---- */
  --radius-xs: 3px;    /* kbd, heatmap cells, tags */
  --radius-sm: 6px;    /* buttons, inputs, time blocks */
  --radius-md: 10px;   /* cards, tables, modals */
  --radius-lg: 14px;   /* drawers, command palette */
  --radius-full: 999px;

  /* ---- Borders ---- */
  --border-width: 1px;
  --border-width-strong: 2px;   /* today column edge, focus-ring offset */

  /* ---- Motion ---- */
  --dur-instant: 80ms;   /* hover/press colour */
  --dur-fast: 140ms;     /* small UI: toggles, menus */
  --dur-base: 220ms;     /* drawers, modals, toasts */
  --dur-slow: 400ms;     /* progress ring fill */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

  /* ---- Layout ---- */
  --sidebar-w: 232px;
  --sidebar-w-collapsed: 64px;
  --topbar-h: 56px;
  --tabbar-h: 60px;          /* phone bottom nav */
  --content-max: 1200px;
  --hour-h: 48px;            /* week grid row height per hour (desktop) */

  /* ---- Neutral ramp (warm "card stock") ---- */
  --n-0:   #ffffff;
  --n-25:  #fbfaf7;
  --n-50:  #f7f5f0;
  --n-100: #f0ede6;
  --n-150: #e8e4db;
  --n-200: #dcd8ce;
  --n-300: #c4bfb4;
  --n-400: #8f8a80;
  --n-500: #6c6760;
  --n-600: #5e5a52;
  --n-700: #45423c;
  --n-800: #2e2c28;
  --n-900: #1c1b18;

  /* ---- Semantic surface/text (LIGHT) ---- */
  --bg:            #f7f5f0;   /* app background */
  --surface:       #ffffff;   /* cards, tables, sidebar */
  --surface-2:     #f0ede6;   /* table header, hover row, inset wells */
  --surface-3:     #e8e4db;   /* pressed, selected neutral */
  --border:        #dcd8ce;   /* hairlines */
  --border-strong: #8f8a80;   /* input borders, heatmap cell outline (>=3:1) */
  --text:          #1c1b18;   /* primary text */
  --text-muted:    #5e5a52;   /* secondary text */
  --text-subtle:   #6c6760;   /* placeholders, captions, zero cells */
  --text-inverse:  #ffffff;

  /* ---- Accent: ink blue ---- */
  --accent:        #3446c9;
  --accent-hover:  #2a3aa8;
  --accent-active: #22308c;
  --accent-soft:   #e8ebfb;   /* today column tint, selected nav bg */
  --accent-text:   #3446c9;   /* links, accent text on surfaces */
  --on-accent:     #ffffff;
  --focus-ring:    #3446c9;

  /* ---- Status semantics ---- */
  --ontrack:       #1f7a3d;  --ontrack-soft: #e5f2e8;   /* On track / Met */
  --behind:        #965300;  --behind-soft:  #fbefdc;   /* Behind pace */
  --over:          #0b6f7a;  --over-soft:    #e0f1f3;   /* Overtime (past goal) */
  --danger:        #b4232c;  --danger-soft:  #fbe6e6;   /* destructive, errors */

  /* ---- Subject palette (courses). Solid = dots, bars, block edge.
         Soft = block fill / chip bg with --text on top. ---- */
  --subj-1: #2f6bd8;  --subj-1-soft: #e7eefb;   /* blue    */
  --subj-2: #c4570c;  --subj-2-soft: #fbeadf;   /* orange  */
  --subj-3: #2b8040;  --subj-3-soft: #e4f1e7;   /* green   */
  --subj-4: #c0337a;  --subj-4-soft: #f9e4ee;   /* magenta */
  --subj-5: #0e8585;  --subj-5-soft: #ddf0f0;   /* teal    */
  --subj-6: #7548cc;  --subj-6-soft: #ece5f9;   /* violet  */
  --subj-7: #9a7300;  --subj-7-soft: #f5edd6;   /* ochre   */
  --subj-8: #80563a;  --subj-8-soft: #f0e7e1;   /* brown   */

  /* ---- Heatmap (single-hue ink, 0 = empty) ---- */
  --heat-0: var(--surface-2);
  --heat-1: #e3e7fb;
  --heat-2: #b7c0f2;
  --heat-3: #8392e6;
  --heat-4: #4c5fd6;
  --heat-5: #2a3aa8;

  /* ---- Shadows (one elevation + overlay) ---- */
  --shadow-1: 0 1px 2px rgba(28, 27, 24, 0.06), 0 1px 1px rgba(28, 27, 24, 0.04);
  --shadow-overlay: 0 12px 32px rgba(28, 27, 24, 0.16), 0 2px 6px rgba(28, 27, 24, 0.08);
  --scrim: rgba(28, 27, 24, 0.40);

  /* ---- Hatch pattern for planned blocks ---- */
  --hatch: repeating-linear-gradient(135deg, transparent 0 6px, rgba(28,27,24,0.05) 6px 7px);
}

/* ---------- DARK (system) ---------- */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #141412; --surface: #1c1b19; --surface-2: #252421; --surface-3: #2e2d29;
    --border: #33312d; --border-strong: #6b675f;
    --text: #edebe5; --text-muted: #aaa69c; --text-subtle: #8e8a81; --text-inverse: #141412;
    --accent: #8d9bff; --accent-hover: #a4afff; --accent-active: #b8c1ff;
    --accent-soft: #23264a; --accent-text: #8d9bff; --on-accent: #11131f; --focus-ring: #8d9bff;
    --ontrack: #5cc283; --ontrack-soft: #1c2e22;
    --behind:  #e9a23b; --behind-soft:  #33281a;
    --over:    #4fc3cf; --over-soft:    #16302f;
    --danger:  #ff7a7f; --danger-soft:  #3a1f21;
    --subj-1: #6d9cf5; --subj-1-soft: #222c40;
    --subj-2: #f08a45; --subj-2-soft: #3a2a1f;
    --subj-3: #5cbf72; --subj-3-soft: #20321f;
    --subj-4: #ec74ae; --subj-4-soft: #3a2230;
    --subj-5: #3fc0c0; --subj-5-soft: #183333;
    --subj-6: #a88bf2; --subj-6-soft: #2b2540;
    --subj-7: #d6ad2e; --subj-7-soft: #38301a;
    --subj-8: #c49274; --subj-8-soft: #33281f;
    --heat-0: var(--surface-2);
    --heat-1: #262b4a; --heat-2: #33408a; --heat-3: #4c5fd6; --heat-4: #7d8df5; --heat-5: #b3bdff;
    --shadow-1: 0 1px 2px rgba(0,0,0,0.4);
    --shadow-overlay: 0 16px 40px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4);
    --scrim: rgba(0,0,0,0.6);
    --hatch: repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,0.06) 6px 7px);
  }
}

/* ---------- DARK (forced) — keep identical to the block above ---------- */
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #141412; --surface: #1c1b19; --surface-2: #252421; --surface-3: #2e2d29;
  --border: #33312d; --border-strong: #6b675f;
  --text: #edebe5; --text-muted: #aaa69c; --text-subtle: #8e8a81; --text-inverse: #141412;
  --accent: #8d9bff; --accent-hover: #a4afff; --accent-active: #b8c1ff;
  --accent-soft: #23264a; --accent-text: #8d9bff; --on-accent: #11131f; --focus-ring: #8d9bff;
  --ontrack: #5cc283; --ontrack-soft: #1c2e22;
  --behind:  #e9a23b; --behind-soft:  #33281a;
  --over:    #4fc3cf; --over-soft:    #16302f;
  --danger:  #ff7a7f; --danger-soft:  #3a1f21;
  --subj-1: #6d9cf5; --subj-1-soft: #222c40;
  --subj-2: #f08a45; --subj-2-soft: #3a2a1f;
  --subj-3: #5cbf72; --subj-3-soft: #20321f;
  --subj-4: #ec74ae; --subj-4-soft: #3a2230;
  --subj-5: #3fc0c0; --subj-5-soft: #183333;
  --subj-6: #a88bf2; --subj-6-soft: #2b2540;
  --subj-7: #d6ad2e; --subj-7-soft: #38301a;
  --subj-8: #c49274; --subj-8-soft: #33281f;
  --heat-0: var(--surface-2);
  --heat-1: #262b4a; --heat-2: #33408a; --heat-3: #4c5fd6; --heat-4: #7d8df5; --heat-5: #b3bdff;
  --shadow-1: 0 1px 2px rgba(0,0,0,0.4);
  --shadow-overlay: 0 16px 40px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4);
  --scrim: rgba(0,0,0,0.6);
  --hatch: repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,0.06) 6px 7px);
}

/* ---------- Base ---------- */
html { background: var(--bg); }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: var(--lh-md);
  -webkit-font-smoothing: antialiased;
}
.num, time, td.num, .duration {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1, "zero" 0;
}
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-radius: var(--radius-xs);
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0ms !important; animation-duration: 0ms !important; }
}
```

**Subject colour assignment:** a course stores `colorIndex: 1..8`. New courses get the lowest unused index, wrapping after 8. Reference colours as `var(--subj-${i})` and `var(--subj-${i}-soft)`. Never put text in a subject *solid* colour. Text always uses `--text` on the `-soft` tint, and the solid colour is reserved for dots, bars and the 3px left edge of blocks.

### 2.3 Contrast check (WCAG 2.1 AA)
Computed with the WCAG relative-luminance formula (script in the designer's scratchpad). Everything listed passes.

| Pair | Light | Dark | Requirement |
|---|---|---|---|
| `--text` on `--bg` / `--surface` / `--surface-2` | 15.8 / 17.2 / 14.7 | 15.5 / 14.4 / 13.0 | 4.5 ✔ |
| `--text-muted` on bg / surface / surface-2 | 6.3 / 6.9 / 5.9 | 7.6 / 7.1 / 6.4 | 4.5 ✔ |
| `--text-subtle` on bg / surface / surface-2 | 5.1 / 5.6 / 4.8 | 5.4 / 5.0 / 4.5 | 4.5 ✔ |
| `--accent-text` on bg / surface | 6.7 / 7.3 | 7.3 / 6.8 | 4.5 ✔ |
| `--on-accent` on `--accent` (primary button) | 7.3 | 7.3 | 4.5 ✔ |
| `--ontrack` on surface / on `--ontrack-soft` | 5.4 / 4.65 | 7.8 / 6.5 | 4.5 ✔ |
| `--behind` on surface / on soft | 5.9 / 5.2 | 8.0 / 6.6 | 4.5 ✔ |
| `--over` on surface / on soft | 5.9 / 5.1 | 8.2 / 6.7 | 4.5 ✔ |
| `--danger` on surface / on soft | 6.5 / 5.5 | 6.8 / 6.0 | 4.5 ✔ |
| `--text` on any `--subj-N-soft` | 14.1–14.8 | 11.0–12.2 | 4.5 ✔ |
| `--subj-N` solid on surface (non-text marks) | 4.35–6.3 | 6.3–8.1 | 3.0 ✔ |
| `--border-strong` on surface (input outline, heat cell) | 3.4 | 3.1 | 3.0 ✔ (1.4.11) |
| `--heat-3..5` on surface | 2.9 / 5.4 / 9.3 | 3.2 / 5.7 / 9.5 | heat-1/2 are below 3:1, so **every heat cell gets a 1px `--border` outline and has a text tooltip**. Colour is never the only channel. |

`--border` (hairline) is decorative at about 1.3:1. Never rely on it alone to mark an interactive control's boundary. Inputs use `--border-strong`.

---

## 3. App shell

### 3.1 Navigation
**Left sidebar on desktop, icon rail on tablet, bottom tab bar on phone.** The sidebar is deliberately quiet: `--surface` background, `--text-muted` labels, and the active item gets `--accent-soft` background with `--text` label and an accent icon. Content carries the contrast.

Breakpoints (use `min-width` queries, but design starts at desktop):
| Name | Width | Nav |
|---|---|---|
| `lg` | ≥1200px | Sidebar 232px, labels visible |
| `md` | 768–1199px | Icon rail 64px, label shown as tooltip on hover/focus |
| `sm` | <768px | No sidebar. Top bar 56px with page title, plus bottom tab bar 60px |

Nav items, in order, with lucide-style 18px stroke icons (1.5px stroke) and their shortcuts:
1. Today (`sun`), `G T`
2. Plan week (`calendar-range`), `G P`
3. Timecard (`table`), `G C`
4. Review (`bar-chart-3`), `G R`
5. Courses (`book-open`), `G S`
6. *(bottom group)* Settings (`settings`), `G ,`

Phone tab bar: Today · Plan · Timecard · Review · More. "More" opens a bottom sheet with Courses, Settings and Shortcuts. Tab items are 48px min touch target, icon above a 11px label, and the active one uses `--accent-text`.

```
Desktop sidebar (232px)
┌──────────────────────┐
│ ▣ Productive         │  wordmark 16/600, 20px mark
│                      │
│ ☀ Today          G T │  item: 36px tall, radius-sm, px-3
│ ▦ Plan week      G P │  kbd hint only on hover, --text-subtle
│ ▤ Timecard       G C │
│ ▥ Review         G R │
│ ▢ Courses        G S │
│                      │
│        (flex)        │
│ ┌──────────────────┐ │
│ │● 1:23:45      ■  │ │  ← ClockPill (running), see 3.2
│ │ Lin. Alg · §4.2  │ │
│ └──────────────────┘ │
│ ⚙ Settings       G , │
│ ⌘K Search & commands │  --text-subtle, opens palette
└──────────────────────┘
```

### 3.2 Persistent running-timer indicator ("ClockPill")
- **Desktop/tablet:** pinned at the bottom of the sidebar above Settings. On the rail it collapses to a 40×40 dot-plus-time stack showing `1:23` with no seconds.
- **Phone:** a 48px bar fixed directly **above** the tab bar, full width, shown only while running. It's hidden on the Today screen because the big timer is already visible there.
- Contents: 8px subject dot that pulses (opacity 1 → 0.4, 2s, off under reduced motion), elapsed time in `--font-mono` 14/500 `h:mm:ss`, the section name truncated with an ellipsis, and a square **Clock out** icon button (32px, aria-label "Clock out").
- Clicking the body goes to Today. Clicking ■ clocks out immediately and shows the toast "Logged 1:23 to Linear Algebra · Undo".
- Style: `--surface-2` background, 1px `--border`, radius-md, plus a 3px left border in the subject solid colour.
- When stopped, the slot shows a ghost button "▶ Clock in" (secondary, small) for today's section. If there's no section today, it shows "No section today" in subtle text, linking to Plan week.
- **Tab title:** while running, `document.title = "● 1:23 · Linear Algebra — Productive"`, updated each minute. When stopped, it's `"Today — Productive"` (page name).
- **Long-run guard:** if a timer has run more than 4h with no interaction, or the app regains focus after the device slept for more than 30 min, show the *Still studying?* modal (see 4.12): "Keep all 5:12", "Keep until 3:40 PM" (time picker, defaulting to the last-activity time), or "Discard".

### 3.3 Page header pattern
Every page starts with the same header row, max width `--content-max`, padding `--space-8` top and `--space-6` sides (`--space-4` on phone).

```
┌───────────────────────────────────────────────────────────────────┐
│ Timecard                               ‹  Week of Mon 27 Oct  ›  [This week] [Export] │
│ 32:15 logged of 40:00 planned                                      │
└───────────────────────────────────────────────────────────────────┘
```
- Title: `--text-2xl` / 600. Subtitle: `--text-md`, `--text-muted`, with durations in mono.
- Right side: period switcher (icon buttons ‹ ›, date label 14/500 that opens a date picker, "This week"/"Today" ghost button), then page actions (max 2, primary on the far right).
- On phone, the title moves into the 56px top bar (`--text-lg` 600). Period switcher sits on its own row below, full width, label centered. Actions collapse into a `⋯` menu in the top bar.
- Date labels always include the weekday: "Mon 27 Oct", never "27/10".

### 3.4 Command palette and shortcuts (recommended)
**Yes, ship a Cmd/Ctrl+K palette.** It's cheap, it fits the minimal-productivity genre and it teaches shortcuts.
- Opens centered, 560px wide (phone: full width, top-anchored, 16px margins), radius-lg, `--surface`, `--shadow-overlay`, over `--scrim`.
- 48px search input (no border, bottom hairline), placeholder "Type a command or search…".
- Grouped results with an `--text-xs` uppercase caps-tracked group label. Groups: **Timer** (Clock in to {today's section}, Clock out, Add manual entry), **Go to** (screens), **Sections** (search by course/section name, which selects and offers "Clock in to…"), **Theme** (Light / Dark / System).
- Rows 40px: 16px icon, label, right-aligned `kbd` hint. The highlighted row gets `--surface-2` background. Arrow keys move, Enter runs, Esc or the same shortcut closes, and focus returns to the trigger.
- With an empty query, show "Recent" (last 5 commands).

Global shortcuts (ignored while focus is in an input, textarea or contenteditable):
| Key | Action |
|---|---|
| `⌘K` / `Ctrl K` | Command palette |
| `I` | Clock in (today's section) |
| `O` | Clock out |
| `N` | New manual entry |
| `G` then `T/P/C/R/S/,` | Go to Today / Plan / Timecard / Review / Courses / Settings |
| `←` `→` | Previous / next day or week (on period pages) |
| `T` | Jump to today / this week |
| `?` | Shortcut sheet (modal listing all of the above) |
| `Esc` | Close top overlay |

`kbd` style: `--font-mono` 11px, padding 1px 5px, 1px `--border`, radius-xs, `--surface-2` background, `--text-muted`.

---

## 4. Components

General rules: interactive elements need a minimum 32px hit target on desktop and 44px on phone (pad the hit area if the visual is smaller). Every interactive element uses the global `:focus-visible` ring. Disabled means 0.45 opacity, `cursor: not-allowed`, no hover change, and `aria-disabled`.

### 4.1 Buttons
| Variant | Rest | Hover | Active (pressed) | Use |
|---|---|---|---|---|
| **Primary** | bg `--accent`, text `--on-accent` | bg `--accent-hover` | bg `--accent-active`, translateY(1px) | One per view: Clock in, Save plan |
| **Secondary** | bg `--surface`, 1px `--border-strong`, text `--text` | bg `--surface-2` | bg `--surface-3` | Most actions |
| **Ghost** | transparent, text `--text-muted` | bg `--surface-2`, text `--text` | bg `--surface-3` | Toolbar, period switcher |
| **Danger** | bg `--danger`, text `--text-inverse` (light) / `#1c1b18` (dark) | darken via `filter: brightness(0.92)` | brightness(0.85) | Confirm delete only |
| **Clock** | see 4.3 | | | |

Sizes: `sm` is 28px tall, 13px text, px 10, 16px icon. `md` (default) is 36px, 14px/500, px 14. `lg` is 44px, 16px/500, px 20. Icon-only buttons are square at the same heights. Radius-sm everywhere. Icon gap 6px. Transition `background-color var(--dur-instant)`.
Loading: the label stays and is replaced visually by a 14px spinner while the width stays fixed.

### 4.2 Inputs
- Text/number/select: 36px tall (phone 44px with 16px font to avoid iOS zoom), bg `--surface`, 1px `--border-strong`, radius-sm, px 12, placeholder `--text-subtle`.
- Hover: border `--text-muted`. Focus: border `--accent` plus `box-shadow: 0 0 0 3px var(--accent-soft)` (instead of the outline ring). Error: border `--danger`, with a 12px message below in `--danger` and a leading ⚠ icon. Disabled: bg `--surface-2`.
- Label above: 13px/500 `--text`, 6px gap. Help text below: 12px `--text-subtle`.
- **Duration input:** mono font, accepts `1:30`, `1.5`, `90m` or `1h30`, normalised on blur to `1:30`. Right-aligned text, suffix "h" in subtle.
- **Hours stepper** (goal setting): duration input plus `−`/`+` ghost icon buttons that step by 0:30.
- Checkbox 16px radius-xs. Radio 16px. Toggle switch 32×18, track `--n-300` / `--accent` when on, knob white.
- Segmented control (e.g. Planned · Logged · Both): 32px, `--surface-2` track, selected segment `--surface` with `--shadow-1`, 13px/500.

### 4.3 Timer / clock-in control (Today hero)
The main object in the app. Two states.

```
STOPPED                                            RUNNING
┌──────────────────────────────────────────┐      ┌──────────────────────────────────────────┐
│ TODAY'S SECTION                          │      │ ● CLOCKED IN since 9:12 AM               │
│ ▌Linear Algebra                          │      │ ▌Linear Algebra                          │
│ ▌§4.2 Eigenvalues & eigenvectors  [Change]│     │ ▌§4.2 Eigenvalues & eigenvectors         │
│                                          │      │                                          │
│            0:00:00                       │      │            1:23:45                       │
│                                          │      │      this session · 4:05 today           │
│   [ ▶  Clock in ]        + Add entry     │      │   [ ■  Clock out ]   [Switch section]    │
│              I                           │      │              O                           │
└──────────────────────────────────────────┘      └──────────────────────────────────────────┘
```
- Card: `--surface`, 1px `--border`, radius-md, padding 24 (phone 16), 4px left edge in the subject solid colour.
- Eyebrow: 12px/600 uppercase, tracking-caps, `--text-muted`. When running it reads "● CLOCKED IN since 9:12 AM", with the dot in `--ontrack` and pulsing.
- Course 16/600, section 14 `--text-muted`. "Change" is a ghost sm button that opens a section picker popover (search plus a list grouped by course).
- Readout: `--font-mono`, `--text-display` (56px; phone 44px), weight 500, `h:mm:ss`, `--text` when running and `--text-subtle` when stopped. Use `aria-live="off"` on the ticking digits. Put a visually hidden `aria-live="polite"` region elsewhere that announces "Clocked in" / "Clocked out, logged 1 hour 23 minutes".
- **Clock in button:** `lg` primary, min width 180px, ▶ icon. **Clock out button:** `lg`, bg `--text` (near-black, or near-white in dark), text `--bg`, ■ icon. It must read as clearly different from Clock in, not just a recolour of the same button. Keyboard hint (`kbd`) centered under the button at 11px.
- Switching section while running clocks out the current entry and clocks in the new one in a single step. Toast: "Switched. Logged 0:42 to Physics."
- Time entries snap nothing. Store exact timestamps and display `h:mm`.

### 4.4 Progress vs daily goal
**Ring on Today, bars everywhere else.**

*Daily ring (Today):* 168px diameter (phone 128px), 12px stroke. The track is `--surface-3`. The fill is `--accent` and is drawn as a **segmented arc per subject** (each subject's logged time in its solid colour, in log order, 2px gaps). That way the ring doubles as a breakdown.
- Center: logged `4:05` in mono 28/500, then "of 8:00" 13px `--text-muted`, then a status chip below (see 4.5 chips).
- Past 100%: the ring closes, and a second inner ring (8px stroke, 6px inset) starts in `--over` for overtime. The center shows "+0:45 over" in `--over`.
- Animate stroke-dashoffset over `--dur-slow` `--ease-out` on change. While running, update the arc at most once every 60s.
- `role="img"` with `aria-label="4 hours 5 minutes logged of 8 hour goal, on track"`.

*Bar (goal cards, timesheet footers, course rows):* 6px tall (8px in goal cards), radius-full, track `--surface-3`, fill in the semantic or subject colour. A planned marker is a 2px tall-by-12px vertical tick in `--text-muted` at the plan/pace position. Overflow past 100% is clamped visually at 100%, and the fill switches to `--over` with a "+1:30" label.

### 4.5 Goal card + status chip
Status logic (designer recommendation; defer to PLAN.md if it differs):
- `expected = goal × (study days elapsed incl. today's progress fraction ÷ study days planned this week)`
- **On track:** logged ≥ 90% of expected. **Behind:** logged < 90% of expected. **Met:** logged ≥ goal. **Overtime:** logged > goal by ≥ 10%. **Not started:** week hasn't begun or goal is 0.

Status chip: 22px tall, radius-full, px 8, 12px/500, leading 12px icon. Background is the `-soft` token, text the solid token.
| Status | Icon | Tokens | Label |
|---|---|---|---|
| On track | `check` circle | ontrack / ontrack-soft | "On track" |
| Met | `check-check` | ontrack / ontrack-soft | "Met" |
| Behind | `alert-triangle` | behind / behind-soft | "Behind 3:20" |
| Overtime | `plus-circle` | over / over-soft | "+2:10 over" |
| Not started | `circle-dashed` | text-muted / surface-2 | "Not started" |

```
┌─────────────────────────────────────┐
│ ● Linear Algebra        [⚠ Behind 3:20]│   dot = subject colour; title 14/600
│ 6:40 / 10:00                         │   mono 20/500 + "/ 10:00" muted
│ ████████████░░░░░░│░░░░              │   bar 8px; tick = expected pace
│ 3:20 to go · ~1:07/day for 3 days    │   12px muted helper
└─────────────────────────────────────┘
```
- Card: `--surface`, 1px `--border`, radius-md, padding 16, min-width 240, grid `repeat(auto-fill, minmax(240px, 1fr))`, gap 12.
- Section goals ("Finish §4.1–4.3") use the same card with a checklist (circular check controls, Things-style) instead of the bar, and the header shows "2 / 3 sections".
- The total weekly goal card (40h) spans 2 columns on desktop and uses `--text-3xl` mono for the logged number.
- Hover: border `--border-strong` (only if clickable, in which case it opens Review filtered to that goal).

### 4.6 Week grid with time blocks (Plan week + Review/Timecard "Calendar" toggle)
```
        Mon 27   Tue 28   Wed 29 ▸ Thu 30   Fri 31   Sat 1    Sun 2
        LinAlg   Physics  Chem     LinAlg   ...                      ← "section of the day" chip row
        §4.2     §2.1     §7.3     §4.3
  8 AM ┼────────┼────────┼────────┼────────┼────────┼────────┼────────┤
       │┌──────┐│        │        │░░░░░░░░│        │        │        │
  9 AM ││LinAlg││┌┄┄┄┄┄┄┐│        │░today░░│        │        │        │
       ││ 2:00 ││┆Phys  ┆│        │═══════ now-line (accent, 2px, dot at left)
 10 AM │└──────┘│┆plan  ┆│        │        │        │        │        │
       │        │└┄┄┄┄┄┄┘│        │        │        │        │        │
```
- Structure: CSS grid, a 56px time gutter plus 7 equal columns (min 120px desktop). Rows are hours from the configurable day start/end (default 7 AM to 11 PM) at `--hour-h` 48px. Half-hour lines are dashed `--border` at 50% opacity, hour lines solid `--border`.
- Header row (sticky): weekday 12px/600 uppercase `--text-muted` plus date 20px/500 mono. **Today's** header gets `--accent-text` and its whole column gets a `--accent-soft` background at 50% opacity.
- **Section-of-the-day row** (sticky under the header, 44px): a chip per day with the course in subject-soft colours and the section number. Drop target for dragging sections from the sidebar list. An empty day shows a dashed outline "+ Section".
- **Now-line:** 2px `--accent` across today's column, with an 8px dot at its left edge. Position updates every minute.
- **Planned block:** absolute positioned, inset 2px left/right. Background is `var(--hatch)` over transparent, border 1px **dashed** subject solid colour, radius-sm, text `--text` at 12px (course name 600, duration mono below). Drag the body to move and drag the 6px top/bottom handles to resize (cursor `ns-resize`). Snap to 15 minutes. Click or drag on empty space to create a planned block (opens a popover with course/section picker plus start/end).
- **Logged block (actual):** subject-soft fill, a 3px solid left border in the subject solid colour, radius-sm, `--shadow-1`. When overlay mode is **Both**, logged blocks are inset 30% from the left so the hatched plan stays visible behind them on the left. That makes planned vs actual readable at a glance. The running entry grows live and has a pulsing bottom edge.
- **Overlay toggle** in the page header: segmented `Planned · Logged · Both` (Plan week defaults to Planned, Timecard calendar to Both).
- **Day footer (sticky bottom):** `5:30 / 8:00` mono 12px per column, colour-coded with a status icon.
- **Overcommit warning:** if planned total > weekly goal + 10%, or any day's planned > 10h, show an inline banner above the grid: `⚠ Planned 46:00 — 6:00 more than your 40:00 goal.` Use `--behind-soft` background, `--behind` icon and text, radius-md.
- Blocks shorter than 30 minutes show only a coloured bar with the full text in a tooltip.
- Keyboard: blocks are focusable. Arrow up/down moves by 15 minutes, Shift+arrow resizes, Delete removes (with undo toast), Enter opens the editor.
- **Phone:** show **one day** at a time with a horizontal day strip above it (7 pills, `Mon 27` stacked, swipe or tap). Same block rendering, columns full width. Creating a block uses tap then a bottom-sheet editor, with no drag-to-create (drag to move stays, via long-press).

### 4.7 Timesheet table (Timecard)
```
┌──────────────────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬────────┬────────┬────────┐
│ SUBJECT          │ MON27│ TUE28│ WED29│▸THU30│ FRI31│ SAT 1│ SUN 2│  TOTAL │   GOAL │      Δ │
├──────────────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┼────────┼────────┼────────┤
│ ● Linear Algebra │ 2:00 │   –  │ 1:30 │ 3:10 │   –  │   –  │   –  │   6:40 │  10:00 │  −3:20 │
│ ● Physics        │ 3:15 │ 4:00 │   –  │   –  │   –  │   –  │   –  │   7:15 │   8:00 │  −0:45 │
│ ● Chemistry      │   –  │ 2:30 │ 6:00 │ 0:55 │   –  │   –  │   –  │   9:25 │   8:00 │  +1:25 │
├──────────────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┼────────┼────────┼────────┤
│ DAY TOTAL        │ 5:15 │ 6:30 │ 7:30 │ 4:05 │   –  │   –  │   –  │  23:20 │  40:00 │ −16:40 │
│ vs 8:00          │ ▃▃▃░ │ ▃▃▃▃░│ ▃▃▃▃▃│ ▃▃░░ │      │      │      │        │        │        │
└──────────────────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴────────┴────────┴────────┘
```
- Container: `--surface`, 1px `--border`, radius-md, overflow hidden. Table `border-collapse: separate; border-spacing: 0`.
- Header: 36px, bg `--surface-2`, 12px/600 uppercase caps-tracked `--text-muted`, sticky top. Day headers show `MON` plus the date `27`.
- Body rows: 44px, a 1px `--border` bottom hairline, vertical hairlines **only** before TOTAL (2px `--border`) to separate data from summary. Row hover: `--surface-2`.
- First column: 220px min, sticky left, subject dot (8px circle) plus course name 14/500, with the section name in 12px muted if grouped by section (toggle "Group by: Course · Section").
- Numeric cells: right-aligned, `--font-mono` 14 tabular, padding-right 12. **Zero shows `–` in `--text-subtle`.** TOTAL is 600 weight. Δ uses `--ontrack` (≥0), `--behind` (<0) or `--over` (>+10%), always signed (`+1:25` / `−3:20`, using a real minus sign U+2212).
- **Today column:** `--accent-soft` background in all rows plus a 2px `--accent` top border on its header. Future days' cells show the planned hours in `--text-subtle` italic, with a tooltip "Planned".
- **Cell interaction:** hover shows a pencil cursor and a `--border-strong` inset outline. Click opens the **Entries drawer** (4.12) listing that subject's sessions for that day (start–end, duration, note) with edit/delete and "+ Add entry". Cells don't use inline typing for totals, because the total is derived from entries. The drawer is the edit surface.
- Footer: DAY TOTAL row (600, `--surface-2` bg) plus a "vs 8:00" row of 40×6 mini bars (4.4) per day.
- Empty week: see 4.10.
- **Phone:** the table becomes a **day-first list**: a day selector strip, then the subjects for that day as rows `● Course ………… 2:00`, then the day total vs 8:00 bar. A toggle "Week totals" shows the subject × TOTAL/GOAL/Δ table (4 columns, which fits at 360px). Never horizontally scroll the full 11-column grid on phone.
- Hours format setting: `h:mm` (default) or decimal `6.75`. Every duration render goes through one `formatDuration(ms, fmt)` helper.

### 4.8 Section list item (Courses & Sections, pickers)
```
┌───────────────────────────────────────────────────────────────────┐
│ ◯  §4.2  Eigenvalues & eigenvectors       Thu 30   3:10 / ~4:00  ⋯ │
└───────────────────────────────────────────────────────────────────┘
```
- 48px row (phone 56px), px 12, hairline bottom. Hover `--surface-2`, and a drag handle `⋮⋮` appears at the left on hover for reordering.
- A circular 18px completion control on the left (Things-style). Empty is a 1.5px `--border-strong` ring. Done is filled `--ontrack` with a white check, the title switches to `--text-muted` with line-through, and the check pops (scale 0.8 → 1 over `--dur-fast`).
- Section number in mono 13 `--text-muted`, title 14/500, then right-aligned metadata: scheduled day chip (if planned this week), logged / estimated in mono 13, and a `⋯` menu (Edit, Schedule…, Clock in now, Delete).
- **Current/today's** section gets a 3px subject-colour left edge and a "Today" chip in `--accent-soft`/`--accent-text`.
- Selected (in pickers): bg `--accent-soft`, check icon right.

### 4.9 Stat tile
```
┌──────────────────────┐
│ CURRENT STREAK       │  12px/600 caps, --text-muted
│ 12 days              │  value: mono 32/500 + unit 14 muted
│ Longest 21 · ↑ 3     │  12px muted; delta coloured + arrow icon
└──────────────────────┘
```
- `--surface`, 1px `--border`, radius-md, padding 16, min-height 104. Grid `repeat(auto-fit, minmax(180px, 1fr))`, gap 12. On phone, 2 columns.
- Optional 24px-tall sparkline at the bottom (1.5px stroke `--accent`, no axes).
- Deltas: up is good for hours, and they use the semantic colour **plus** a ↑/↓ arrow and a sign.

### 4.10 Heatmap cell (Review)
- GitHub-style year/term grid: columns = weeks, rows = Mon–Sun. Cell 12×12 (phone 10×10), gap 3, radius-xs (2px).
- Fill levels by hours that day: `0` → `--heat-0`, `<2h` → 1, `2–4h` → 2, `4–6h` → 3, `6–8h` → 4, `≥8h` (daily goal met) → 5. **Every cell** gets `outline: 1px solid var(--border); outline-offset: -1px`.
- A goal-met day (≥ 8h) also shows a 3px dot in `--surface` at the center, so meeting the goal doesn't depend on colour alone.
- Today's cell: 1.5px `--text` outline. Future cells: transparent with a dashed `--border` outline.
- Each cell is a `<button>` (roving tabindex across the grid, arrow keys move) with tooltip and aria-label "Thu 30 Oct: 4:05 logged, goal 8:00". Clicking jumps to Timecard for that week.
- Legend under the grid, right-aligned: "Less ▢▢▢▢▢▢ More" at 11px.
- Rest days (configured non-study days) render with the hatch pattern and are excluded from streak breaks.

### 4.11 Empty states
Centered in the content area, max-width 360px, a 40px outline icon in `--text-subtle`, a title of 16/600, one sentence of 14 `--text-muted`, and one primary button (and optionally one ghost link). No illustrations.
| Where | Title | Body | Action |
|---|---|---|---|
| Today, no plan | No section for today | Pick one to clock in against, or plan your week. | **Choose section** · Plan week |
| Timecard, empty week | Nothing logged this week | Clock in from Today and your hours land here. | **Go to Today** |
| Courses, none | Add your first course | Courses hold sections. Every hour you log belongs to one. | **Add course** |
| Review, <7 days data | Not enough history yet | Review fills in after a few days of logged time. | **Go to Today** |
| Plan week, blank | Plan this week | Set your hours, pick a section for each day, block out time. | **Start planning** |

### 4.12 Toasts, modals, drawers
**Toast:** bottom-center on desktop (24px from bottom). On phone it sits above the tab bar and ClockPill. Max width 420, `--text` bg with `--bg` text (inverted), radius-md, padding 12/16, `--shadow-overlay`, 14px. An optional single action button on the right (text button in `--accent` dark-variant colour: use `#b8c1ff` in light theme and `--accent-active`-ish `#22308c` in dark, i.e. the *opposite* theme's accent, so it stays readable on the inverted bg). Auto-dismiss after 5s (8s if it has an Undo), pause on hover/focus, stack max 3. Enter: translateY(8px) → 0 plus fade over `--dur-base`. Use `role="status"`.
Every destructive or timer-stopping action gets **Undo** instead of a confirm dialog. The exception is deleting a course with logged time, which needs a modal.

**Modal:** centered, width 440 (sm) / 560 (md), radius-lg, `--surface`, `--shadow-overlay`, over `--scrim`, padding 24. Title 18/600, body 14, footer right-aligned: secondary Cancel plus primary/danger action. Esc and scrim click close it (except the long-run guard). Trap focus and return it on close. Enter: scale 0.98 → 1 plus fade, `--dur-base`. Phone: becomes a bottom sheet (full width, radius-lg on top corners only, drag handle 36×4).

**Drawer (Entries / Edit entry):** right side, 400px wide, full height, `--surface`, left border 1px `--border`, `--shadow-overlay`, slide in from the right over `--dur-base` `--ease-out`. Scrim at 50% of `--scrim`. Header: title plus close ✕. Body scrolls. Footer is sticky with actions. Phone: full-screen sheet from the bottom.

**Entry editor fields:** Course/section picker, Date, Start time, End time (or Duration, and changing one updates the other), Note (textarea, 3 rows), with Delete (danger ghost, left) and Save (primary, right) in the footer.

**Still studying? (long-run guard)** modal: title "Still clocked in?", body "Your timer for Linear Algebra has run 5:12. When did you stop?", options as stacked full-width secondary buttons: "Keep all 5:12", "Stop at [3:40 PM ▾]", "Discard this session", plus primary "I'm still studying".

---

## 5. Screens

All desktop wireframes assume the 232px sidebar on the left, which is omitted below. Content max width is 1200px, centered, side padding 24.

### 5.1 Today
```
┌ Today ─────────────────────────────────────────────────────────────── ‹ Thu 30 Oct › [Today] ┐
│ 4:05 logged · 3:55 to go                                                                     │
├──────────────────────────────────────────────────────────┬───────────────────────────────────┤
│ TIMER CARD (4.3)                                         │   ◯ ring 168px (4.4)              │
│  TODAY'S SECTION                                         │      4:05                         │
│  ▌Linear Algebra · §4.2 Eigenvalues          [Change]    │     of 8:00                       │
│            1:23:45                                       │   [✓ On track]                    │
│   [■ Clock out]  [Switch section]                        │   ● LinAlg 3:10 ● Phys 0:55       │
├──────────────────────────────────────────────────────────┴───────────────────────────────────┤
│ TODAY'S PLAN                                              │ LOGGED TODAY             + Add entry│
│ 9:00–11:00  ▌Linear Algebra  §4.2   (planned block)       │ 9:12–10:40 ▌LinAlg §4.2   1:28   ⋯ │
│ 13:00–15:00 ▌Linear Algebra  §4.2                         │ 11:00–11:55▌Physics §2.1  0:55   ⋯ │
│ 16:00–17:00 ▌Physics review                               │ 13:02–now  ▌LinAlg §4.2   1:23 ● │
│                                                           │                                   │
├───────────────────────────────────────────────────────────┴───────────────────────────────────┤
│ THIS WEEK  ████████████░░░░░░░ 23:20 / 40:00  [⚠ Behind 2:40]                 View timecard → │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```
- Row 1: a 2fr / 1fr grid, with the timer card and the ring card (ring plus a subject legend with durations).
- Row 2: a 1fr / 1fr grid. **Today's plan** is a compact list of today's planned blocks (time range in mono 13, subject edge). The current block is highlighted with `--accent-soft`, and clicking a block's ▶ clocks in to it. **Logged today** is a vertical timeline list of entries (Rize/Timing style), newest at the bottom, with the running one live and a ⋯ menu offering Edit / Delete.
- Row 3: a full-width weekly progress strip (bar plus status chip plus link).
- Navigating to a past day turns the timer card into a read-only summary ("Logged 7:40 on Wed 29") with "+ Add entry".
- **Phone:** single column in this order: timer card (readout 44px, buttons full width), ring (128px, beside the logged number in a 2-col row), Logged today, Today's plan, week strip. The ClockPill is hidden on this screen.

### 5.2 Plan week (Monday ritual)
A three-step stepper at the top, which the user can revisit at any time (it isn't a wizard you get locked into). Step state is held in the URL hash (`#goals`, `#sections`, `#blocks`).
```
┌ Plan week ────────────────────────────────────────── ‹ Week of Mon 27 Oct › [This week] [Save plan] ┐
│ ① Goals ──── ② Sections ──── ③ Time blocks                    Planned 38:00 / goal 40:00          │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ① GOALS                                                                                          │
│  Weekly total   [ 40:00 ][−][+]      Daily goal [ 8:00 ]    Study days  [M][T][W][T][F][S][S]     │
│  ┌ Linear Algebra ─┐ ┌ Physics ─────┐ ┌ Chemistry ───┐ ┌ + Add subject goal ┐                    │
│  │ [10:00] h       │ │ [ 8:00] h    │ │ [ 8:00] h    │ │                    │                    │
│  │ Sections: 4.1–4.3│ │ 2.1, 2.2    │ │ 7.3          │ └────────────────────┘                    │
│  └─────────────────┘ └──────────────┘ └──────────────┘   Unassigned: 14:00                       │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ②+③ SCHEDULE                                                                                    │
│ ┌ SECTIONS (220px) ┐ ┌──── WEEK GRID (4.6) with section-of-day row + planned blocks ───────────┐ │
│ │ Search…          │ │ Mon 27  Tue 28  Wed 29  Thu 30 ...                                      │ │
│ │ LINEAR ALGEBRA   │ │ [LinAlg§4.1][Phys§2.1][Chem§7.3][LinAlg§4.2] [+]  [+]  [+]              │ │
│ │ ⋮⋮ §4.1 ...      │ │  …time rows with hatched planned blocks…                                │ │
│ │ ⋮⋮ §4.2 ...      │ │                                                                          │ │
│ │ PHYSICS          │ │ footer: 8:00  6:00  8:00  8:00  8:00  –  –                              │ │
│ └──────────────────┘ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```
- The stepper is clickable text tabs with a number badge. ✓ replaces the number when a step is complete: goals set, every study day has a section, ≥1 block per study day. It's a progress hint only, and saving is always allowed.
- The **planned total vs goal** readout at the top right updates live. It turns `--behind` with ⚠ when it's more than 10% over (overcommit) or more than 10% under the goal ("2:00 unplanned").
- Subject goal cards use hours steppers. "Unassigned: 14:00" shows weekly total minus the sum of subject goals (muted, or `--behind` if negative).
- Sections sidebar: sections grouped by course, draggable onto the section-of-day row (sets the day's section) or onto the grid (creates a 1h planned block for that section). Clicking a day chip opens a picker as the non-drag alternative, which is required for keyboard and phone users.
- Optional action in the header `⋯` menu: "Copy last week's blocks".
- The plan auto-saves (debounced 600ms, with a "Saved" text flash in the header). The **Save plan** button marks the week as planned and gives a toast: "Week planned. 38:00 across 6 days."
- **Phone:** the steps stack vertically as collapsible sections. The grid is a single-day view (4.6 phone). The sections sidebar becomes the "+ Section" picker sheet.

### 5.3 Timecard
```
┌ Timecard ──────────────────────────────── ‹ Week of Mon 27 Oct › [This week]  [Table|Calendar] [Export CSV] ┐
│ 23:20 logged · 40:00 goal · 31:00 planned                                                                    │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Group by: Course ▾]                                                       [⚠ Behind 2:40 on pace]            │
│ TIMESHEET TABLE (4.7)                                                                                        │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ENTRIES THIS WEEK (collapsible, default collapsed)                                                           │
│ Thu 30  13:02–now   ▌LinAlg §4.2  1:23 ●                                                                     │
│ Thu 30  11:00–11:55 ▌Physics §2.1 0:55                                                     ⋯                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
- `Table | Calendar` segmented. Calendar shows the week grid (4.6) in **Both** overlay mode, read-mostly: logged blocks are draggable to fix times, planned blocks aren't editable here and link to Plan week.
- Export CSV columns: date, start, end, duration_minutes, course, section, note.
- **Phone:** see the 4.7 phone layout. Calendar becomes the single-day view.

### 5.4 Courses & Sections
```
┌ Courses ─────────────────────────────────────────────────────────────────────────── [+ Add course] ┐
│ 3 courses · 24 sections · 9 done                                                                    │
├──────────────────────────┬──────────────────────────────────────────────────────────────────────────┤
│ COURSES (280px)          │ ● Linear Algebra                                  [Edit] [⋯]            │
│ ▌● Linear Algebra  6/10  │ 42:15 logged all time · 6:40 this week · 6 of 10 sections done          │
│  ● Physics         2/8   │ ████████████░░░░░░                                                       │
│  ● Chemistry       1/6   │ SECTIONS                                              [+ Add section]   │
│                          │ ◉ §4.0 Review of matrices              done    3:10                     │
│                          │ ◯ §4.2 Eigenvalues & eigenvectors [Today] Thu 30   3:10 / ~4:00   ⋯     │
│                          │ ◯ §4.3 Diagonalisation                 Fri 31   –   / ~4:00   ⋯         │
│                          │ + Add section (inline input row; Enter adds, keeps focus)               │
└──────────────────────────┴──────────────────────────────────────────────────────────────────────────┘
```
- Master-detail. A course row in the left list: subject dot, name 14/500, "6/10" mono muted. The selected one gets an `--accent-soft` bg and a 3px subject left edge.
- Course editor (modal md): Name, Code (optional, e.g. "MATH 221"), Colour (8 swatches as 28px circles, selected with 2px ring `--text` offset 2px, each with an aria-label of the colour name), Weekly default hours (optional).
- Sections: inline add row, drag to reorder, an estimate field (duration) shown as "~4:00".
- Archive instead of delete when a course has logged time. Archived courses sit in a collapsed "Archived (1)" group.
- **Phone:** the course list is the screen. Tapping a course pushes the detail screen (back arrow in the top bar).

### 5.5 Review
```
┌ Review ─────────────────────────────── [Week|Month|Term]  ‹ Week of Mon 20 Oct ›  ┐
│ Last week: 38:30 of 40:00 · 4 of 5 goals met                                       │
├────────────┬────────────┬────────────┬────────────┬───────────────────────────────┤
│ LOGGED     │ DAILY AVG  │ STREAK     │ GOALS MET  │  (stat tiles 4.9)             │
│ 38:30      │ 6:25       │ 12 days    │ 4 / 5      │                               │
│ ↓ 1:30 vs  │ 8:00 goal  │ Longest 21 │            │                               │
├────────────┴────────────┴────────────┴────────────┴───────────────────────────────┤
│ GOAL RESULTS                                                                       │
│ [goal card: Weekly total ✓ Met] [LinAlg ⚠ Missed by 1:20] [Physics +1:10 over] ... │
├───────────────────────────────────────────────┬───────────────────────────────────┤
│ PLANNED VS ACTUAL (per day, grouped bars)     │ BY SUBJECT (horizontal bars)       │
│  Mon ▒▒▒▒█████  Tue ...                       │ ● LinAlg ███████ 12:40            │
│  hatched = planned, solid = logged, 8h line   │ ● Physics █████ 9:10              │
├───────────────────────────────────────────────┴───────────────────────────────────┤
│ CONSISTENCY  (heatmap 4.10, last 26 weeks)                    Less ▢▢▢▢▢▢ More    │
├───────────────────────────────────────────────────────────────────────────────────┤
│ TREND  (line: weekly hours, last 12 weeks, dashed line = weekly goal)              │
└───────────────────────────────────────────────────────────────────────────────────┘
```
- Charts: plain SVG components or a light library. Planned bars use the hatch pattern with a `--border-strong` outline, logged bars are solid `--accent` (or subject colour in "By subject"). The goal reference line is 1px dashed `--text-muted` with a label at the end. Axis text is 11px `--text-subtle`, gridlines `--border`. No chart legends hidden behind hover: label directly.
- For past weeks, goal cards read "Met", "Missed by 1:20" (behind tokens) or "+1:10 over". On-track/behind only applies to the current week.
- Streak definition shown in a tooltip on the tile: "Days in a row you hit your daily goal. Rest days don't break it."
- **Phone:** tiles in a 2×2 grid, everything else stacked, heatmap shows the last 13 weeks and scrolls horizontally *inside its own container* (the only allowed horizontal scroll).

### 5.6 Settings
Single column, max-width 640, grouped sections with a 12px caps heading and hairline-separated rows of label (left) + control (right). On phone, controls drop below labels.
```
GOALS
  Default weekly goal           [ 40:00 ]
  Daily goal                    [  8:00 ]
  Study days                    [M][T][W][T][F][S][S]
  Week starts on                (•) Monday ( ) Sunday
TIMER
  Remind me if clocked in over  [ 4:00 ]
  Ask what happened after sleep [toggle on]
DISPLAY
  Theme                         [System | Light | Dark]   → sets html[data-theme] (System removes it)
  Hours format                  [6:45 | 6.75]
  Week grid hours               [7 AM ▾] to [11 PM ▾]
DATA
  Export all data (JSON)        [Export]
  Import data                   [Import…]
  Erase all data                [Erase…] (danger, confirm modal requiring typing "erase")
KEYBOARD
  View shortcuts                [Open]  ?
```

### 5.7 First-run onboarding
Full-screen, centered card (max-width 520), no sidebar, progress dots at the top. Three steps, about 60 seconds total, with every step skippable ("Skip for now" ghost link).
```
┌───────────────────────────────────────────────┐
│ ● ○ ○                                          │
│ Set up your timecard                           │  24/600
│ What are you studying this term?               │  14 muted
│                                                │
│ [ Linear Algebra        ] ● (colour auto)  ✕   │
│ [ Physics               ] ●                ✕   │
│ [ + Add course          ]                      │
│                                                │
│                         [Skip for now] [Next →]│
└───────────────────────────────────────────────┘
Step 2  "Your hours"     weekly goal [40:00], daily goal [8:00], study days toggles.
Step 3  "Today's section" pick a course, then type a section name ("§1.1 Intro") → [Clock in now] (primary) or [Go to Today].
```
- Finishing drops the user on Today. If they clocked in during step 3, the timer is already running.
- Sample data isn't loaded. Empty states handle the rest.
- **Phone:** the card becomes full-screen with the buttons pinned to the bottom.

---

## 6. Copy and tone

**Voice:** a calm, precise timekeeper. Short, plain and factual. Sentence case everywhere (not Title Case). No exclamation marks, no emoji, and no guilt.

**Vocabulary (use consistently):**
| Use | Not |
|---|---|
| Clock in / Clock out | Start session / Stop / Begin focus |
| Logged (past time) | Tracked, recorded, studied |
| Planned | Scheduled, target |
| Goal | Target, quota |
| Planned vs actual | Expected vs real |
| Entry (one session) | Session log, record |
| Timecard | Timesheet (fine in body text, but the screen is "Timecard") |
| Section | Chapter, topic, unit |
| Overtime / "+1:10 over" | Exceeded, surplus |
| Behind / On track / Met / Missed by | Failed, bad, lagging |
| Rest day | Day off, skip |

**Patterns:**
- Lead with the number: "4:05 logged · 3:55 to go", not "You have studied for 4 hours and 5 minutes".
- Durations are `h:mm` (`0:45`, `12:30`). Clock times are `9:12 AM` (follow locale via `Intl.DateTimeFormat`). Dates are `Thu 30 Oct`. Use a middle dot `·` to separate facts.
- Buttons are verbs: "Clock in", "Save plan", "Add section", "Export CSV".
- Toasts state what happened and offer Undo: "Logged 1:23 to Linear Algebra · Undo", "Entry deleted · Undo", "Week planned. 38:00 across 6 days."
- Behind or missed states are neutral and offer a way forward: "Behind 2:40. About 0:54 a day gets you back on pace."
- Empty states are one sentence of what and one action (see 4.11).
- Errors say what to do: "End time must be after start time." / "Enter hours like 1:30 or 1.5."
- Confirmations use specific nouns: "Delete Linear Algebra and its 42:15 of logged time?" with the button "Delete course".

---

## 7. Implementation notes for the coder
- Put tokens in `src/styles/tokens.css`, imported first. Component CSS files only reference `var(--…)`, never raw hex (except the toast action noted in 4.12).
- Theme: on load, read the saved preference and set `document.documentElement.dataset.theme = "light" | "dark"`, or delete it for System.
- One `formatDuration(ms, format: "hmm" | "decimal")` and one `formatDay(date) → "Thu 30 Oct"` helper, used everywhere.
- Ticking: one `setInterval(1000)` in a timer context drives the Today readout and the ClockPill seconds. Rings, bars and the title update on minute boundaries only.
- Icons: `lucide-react`, 18px in nav and 16px inline, stroke 1.5 (or equivalent inline SVGs).
- Respect `prefers-reduced-motion` (handled globally in the token base).
- Minimum supported width is 360px, with no page-level horizontal scroll. Wide tables switch layout instead of scrolling (4.7).
