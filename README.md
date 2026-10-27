# StruggleMore

> Would climbing up a mountain be impressive if the mountain was flat?

Repository name: `productive`.

A personal, local-first study timecard. Every minute of study is a **time entry** billed to a **course** and usually a **section**; you work through one section per day towards a daily goal (8 hours by default), plan the week on Monday, and review it on Sunday. Think Strava crossed with a consultant's timesheet.

All data stays in your browser (`localStorage`). Export a JSON backup from Settings now and then.

## Run it

```bash
npm install
npm run dev        # start the dev server (http://localhost:5173)
npm test           # run the unit tests (Vitest)
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
npm run typecheck  # TypeScript only
```

The build uses a relative base (`./`) and hash routing, so `dist/` works from any sub-path, including GitHub Pages.

## Features

- **Today** — one-key clock in/out (`Space`), switch section without a gap, live progress ring against your daily goal, today's assigned section with *Mark done*, a planned-vs-logged day timeline with adherence %, an editable list of today's entries, week strip and streak.
- **Carry-over** — if yesterday's section isn't finished you choose: do it today (the rest of the week shifts forward), mark it done, or dismiss.
- **Plan week** — weekly goals (total hours, hours on a course, sections completed, days hitting the goal), rest days, one section per day with auto-assign, and a drag-to-create week grid of time blocks (move, resize, copy last week). Phones get a one-day view with an *Add block* form.
- **Timecard** — courses × days timesheet with section sub-rows, a per-cell entry panel for fixing or adding time, day totals that turn green when the goal is hit, a statement summary, CSV export and a print view.
- **Courses & sections** — colours, archive, bulk "add many" (`Title | hours`), reorder, estimates with logged-vs-estimate bars.
- **Review & insights** — goal results (met / on track / behind / missed), planned vs actual by day, course breakdown, sections planned vs done, a weekly reflection, current and best streak, a 26-week heatmap and 12-week totals.
- **Settings** — daily goal and rest-day defaults, week-grid hours, JSON export/import with validation, reset.
- **Focus mode:** clock in for a block (25/50/90 min, planned, custom or open) and a full-screen scene plays: a figure pushes a boulder up a slope as the block runs, reaches the summit when it's done, and walks back down on a break. Canvas 2D, original artwork, a calmer Daylight scene as an alternative, and a static frame with reduced motion. `F` enters, `Esc` leaves.
- Opening quote on load (skip with any key; turn it off in Settings → General; `?nosplash` skips it).
- Keyboard shortcuts (`?` lists them), visible focus, dark mode via `prefers-color-scheme`, works from 360px phones to desktop.

## Stack

Vite, React 18, TypeScript (strict), react-router-dom v6 (HashRouter), plain CSS (CSS modules + design tokens), Vitest. No other runtime dependencies; charts are hand-rolled SVG.

Pure domain logic lives in `src/domain/` and is unit tested; specs are in `docs/PLAN.md` and `docs/DESIGN.md`.
