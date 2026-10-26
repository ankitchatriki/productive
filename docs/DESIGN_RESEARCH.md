# Productive: design research

Researched 2026-10-26 by the designer agent. **Method note:** the session's egress policy refused direct page fetches (linear.app, toggl.com, getharvest.com and sunsama.com all returned `connect_rejected`). Everything below comes from web-search result summaries of vendor docs, help centres, App Store listings and reviews. Where a detail could not be confirmed it says so. I have not filled gaps from memory as if they were facts.

---

## 1. Time trackers / timesheets

### Toggl Track
- **Layout / timer:** the Timer page has a **timer bar across the top**: a description field ("What are you working on?") plus a play button. Entry views sit below it. Projects carry a user-chosen colour. Sources: [Toggl docs, Time tracking in Toggl 2.0](https://docs.toggl.com/time-tracking-in-toggl-2-0), [Toggl community](https://community.toggl.com/t/start-timer-on-task-record/3808), [dev.to guide](https://dev.to/stan8086/how-to-use-toggl-track-a-beginners-guide-2gc9)
- **Week/calendar:** the Calendar view sits on the Timer page and shows entries as blocks in a weekly grid, coloured by project, with navigation between weeks. Source: [Toggl blog, calendar view](https://toggl.com/blog/calendar-view-feature)
- **Timesheet:** an April 2025 release added a timesheet view for "structured logging and a weekly overview", built to make it easy to **spot and fill gaps**. Source: [toggl.com/track/easy-time-tracking](https://toggl.com/track/easy-time-tracking/)
- **User complaints (Capterra):** the calendar shows dates without weekday names, switching between the mini timer and the full view is clunky, and people leave timers running by accident and want an auto-cutoff. Source: [Capterra reviews p.3](https://www.capterra.com/p/247745/Toggl/reviews/?page=3)
- **Borrow:** one always-visible timer control at the top that reads as a sentence: *[what] [project colour dot] [elapsed] [stop]*.

### Harvest
- **Day vs week:** the running timer exists only in Day view. Week view is for bulk entry in a grid of rows × days. Source: [Harvest blog, day vs week view](https://www.getharvest.com/blog/a-different-view-tracking-time-in-the-day-view-or-in-the-week-view-of-the-timesheet) (search summary; the post may be dated)
- **Idle handling:** when the machine has been idle, Harvest asks whether to keep or remove that time, and sends the prompt by email as well as in the app. Source: [clockk.com summary](https://clockk.com/alt/does-harvest-report-idle-time)
- **Accessibility:** Forecast offers a colour-blind heatmap mode that swaps green for blue, giving a blue-to-yellow scale. Source: [Harvest help](https://help.getharvest.com/forecast/faqs/faq-list/color-blind-mode/)
- **Borrow:** split **live tracking (Today)** from **bulk review/edit (Timecard grid)**. Don't put a play button in every grid cell.

### Clockify
- **Calendar:** each entry is one block on a day × hour grid. Hour slots zoom to 30, 15 or 5 minutes. **Today's column header is tinted and a horizontal line marks the current time.** Drag block edges to resize, drag the whole block to move, and click or drag on empty space to create. Hover shows details, click opens the editor. Planned events from Google or Outlook can be overlaid "to compare what you had planned vs what you tracked". The view is pitched as a way to **find gaps and overlaps**. Sources: [Clockify help, calendar view](https://clockify.me/help/time-tracking/calendar-view), [Clockify features, calendar](https://clockify.me/features/calendar)
- **Idle detection:** after an inactivity threshold the timer keeps running, but the user resolves the idle minutes on return (discard, or discard and continue). Source: [Clockify help, idle detection](https://clockify.me/help/track-time-and-expenses/idle-detection-reminders)
- **Week timesheets across the category** (TimeCamp, Primatime, Ruddr, My Hours): rows = project/task, columns = days. **Row totals on the right, day totals in a footer row, grand total bottom-right.** My Hours puts a play icon at the end of each row that writes into today's cell. Sources: [TimeCamp](https://help.timecamp.com/help/week-timesheet), [Primatime](https://intercom.help/primatimeapp/en/articles/11917868-timesheet), [Ruddr](https://help.ruddr.io/time/the-week-view-for-time-tracking), [My Hours](https://intercom.help/my-hours/en/articles/2215696-2-4-start-tracking)
- **Borrow:** the planned vs actual overlay on one week grid, plus the today-column tint and the now-line.

### Timing / Rize (automatic Mac trackers)
- Timing: automatic tracking with a detailed, editable timeline, rule-based categorising and daily summaries. Reviewers praise the UI but say setup takes effort. Sources: [Capterra India](https://www.capterra.in/software/148873/timing), [MacSparky](https://www.macsparky.com/?p=17770)
- Rize: a vertical timeline lists focus and meeting blocks in time order, each with "Show details". Source: [Rize changelog](https://rize.io/blog/changelog-2020-12-17), [Rize vs Timing](https://rize.io/blog/rize-vs-timing)
- **Borrow:** a vertical **today timeline** of logged entries, each expandable. Skip auto-tracking (out of scope).

## 2. Calendar / time-blocking planners

### Sunsama
- A guided **daily planning ritual**: pull in tasks, estimate them, drag them onto the calendar. The highlight reviewers single out is the **overcommitment warning** when planned time is more than the day can hold. A weekly review shows where time went, carries unfinished work forward and sets next week's objectives. There's also a focus mode with a Pomodoro timer. Sources: [Sunsama guided planning](https://sunsama.com/features/guided-planning-and-reviews), [Asian Efficiency review](https://www.asianefficiency.com/schedule-management/sunsama-review/), [Brain Sensei review](https://brainsensei.com/sunsama-review/)
- A Sunsama roadmap request asks for timers to pause when the laptop sleeps, because people come back hours later to a running timer. Source: [Sunsama roadmap](https://roadmap.sunsama.com/improvements/p/pause-timer-when-closing-laptop-quitting-app-or-shutting-down-computer)
- **Borrow:** Plan Week as a short **guided ritual** (goals, then sections per day, then blocks, then confirm) with a live "planned 46h / goal 40h" overcommit warning.

### Akiflow / Motion
- Akiflow uses manual slotting with command-bar scheduling and gets praise for a "simple, clear" UI and a fast start. Motion auto-schedules but needs heavy setup. Sources: [Business Dive, Akiflow vs Motion](https://thebusinessdive.com/akiflow-vs-motion), [Morgen, Akiflow vs Motion](https://www.morgen.so/blog-posts/akiflow-vs-motion) (vendor-biased)
- **Borrow:** manual control and a fast start. No auto-scheduling and no long setup.

### Notion Calendar (ex-Cron)
- Drag tasks from a sidebar onto time slots to timebox them, and drag edges to resize. Overloaded days are flagged. Keyboard-first: `C` creates, `T` jumps to today, `W` switches to week view. Sources: [lilys.ai guide](https://lilys.ai/en/notes/time-blocking-20260129/notion-calendar-time-blocking-task-management), [itsourcecode guide](https://itsourcecode.com/notion/how-to-use-notion-calendar/) (low-quality guides, so treat as indicative). I found nothing usable on **Amie**.
- **Borrow:** single-key shortcuts (`T` for today, `←`/`→` for week) and a sidebar → grid drag for scheduling sections.

## 3. Minimal productivity tools

### Linear
- The 2024 redesign moved theme generation **from HSL to LCH** so colours look consistent across themes. It reduced visual noise in the sidebar, tabs, headers and panels, and increased hierarchy and density. A 2026 refresh **dimmed the sidebar so content leads**, compacted tabs and cut back on icons (third-party summary). Sources: [Linear blog, redesign](https://linear.app/now/how-we-redesigned-the-linear-ui), [Linear changelog 2024-03-20](https://linear.app/changelog/2024-03-20-new-linear-ui), [PlushCap summary 2026-03](https://www.plushcap.com/companies/linear/blog/summaries/2026/03). I could not confirm its typeface.
- **Command palette:** Cmd/Ctrl+K opens a dialog with a combobox. Rows are about 40px with icon, label and shortcut hint, results are grouped, recents show before typing, the same key closes it and focus returns afterwards. Linear uses the `cmdk` library. Sources: [Superhuman blog](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/), [command palette spec](https://cdn.jsdelivr.net/npm/@hegemonart/get-design-done@1.60.4/reference/components/command-palette.md), [techinterview.org](https://www.techinterview.org/post/3233475212/build-command-palette-cmd-k/)
- **Borrow:** a quiet, low-contrast sidebar with content at full contrast, and shortcut hints shown inside menus and the palette.

### Things 3
- Uses the system sans font, a muted palette and one accent (a blue for the add button, yellow for the Today star), circular completion controls and a single subtle shadow elevation. Layout and whitespace do the work. Sources: [Refero style reference](https://styles.refero.design/style/ec0f5bca-8367-49e7-b8aa-73b3fa09a4a0), [tessl things-ui-skills](https://tessl.io/registry/skills/github/ihlamury/design-skills/things-ui-skills) (unofficial, and the sources disagree on exact values)
- **Borrow:** one shadow level, one accent, and circular "done" controls for sections.

### Todoist (Productivity view)
- Daily and weekly goals default to 5 and 25 tasks and are editable. A **streak** counts consecutive days or weeks the goal was met, and the **longest streak** is shown too. You can exclude weekdays so weekends don't break a streak, and vacation mode keeps streaks safe. Source: [Todoist help, Productivity view](https://www.todoist.com/help/todoist/features/use-the-productivity-view-in-todoist-6S63uAa9), [Karma](https://todoist.com/help/articles/introduction-to-karma-OgWkWy)
- **Borrow:** current vs longest streak, configurable study days and a "day off" that doesn't break the streak.
- *Height:* I found no current results (the product shut down in 2025, which I did not verify further), so it's skipped.

## 4. Study / focus apps

### Session (Mac/iOS)
- Every session **starts with an intention** that then appears in the widget, Live Activity, notifications and blockers. Past intentions are suggested. Sessions shorter than 25 minutes still save. The developer plans to drop the pomodoro count in favour of **total focused time plus a distraction count**. A late-2025 redesign drew complaints that the "What's your focus?" prompt was hard to answer. Sources: [Session guide](https://stayinsession.com/learn/getting-started-with-session-pomodoro-app), [App Store](https://apps.apple.com/no/app/id1521432881), [Setapp reviews](https://setapp.com/apps/session/customer-reviews)
- **Borrow:** clock-in is pre-filled with today's section, so it's one click with no blocking prompt. Measure hours, not pomodoros.

### Flow (Mac)
- Menu-bar timer with no dock icon and a "minimalistic design". Stats sync and export to CSV. Source: [App Store, Flow](https://apps.apple.com/us/app/flow-focus-and-work-timer/id1423210932?l=en&mt=12)
- **Borrow:** a running timer that lives in persistent chrome (our shell and the browser tab title) as well as on its own screen.

### Forest / StudyStream
- Forest: gamified (a tree grows during focus and dies if you leave), with a collection showing all past focus. Source: [Forest App Store](https://apps.apple.com/app/866450515), [forestapp.cc](https://forestapp.cc/llms-full.txt)
- StudyStream: live video study rooms, Pomodoro timer, tasks, streak tracking and perks/achievements. Source: [App Store](https://apps.apple.com/app/id6461722416), [Gridfiti](https://gridfiti.com/online-study-room-websites/)
- **Borrow (lightly):** the "visible record of every minute" idea becomes our heatmap. Leave out gamified punishment, social features and achievements.

## 5. Heatmap accessibility
- Roselli's accessible GitHub-chart rebuild uses keyboard-focusable cells, screen-reader tooltips, an option to show volume by **fill area** instead of colour alone, and **cell borders at ≥3:1** (#949494 on white). Source: [Adrian Roselli](https://adrianroselli.com/2018/02/github-contributions-chart.html)
- Avoid green-to-red scales. Single-hue blue, or blue to yellow, is safer for colour-blind users. Sources: [Wistia](https://wistia.com/blog/heatmaps-for-colorblindness), [Caliper](https://www.caliper.com/learning/?p=347369), [Visa design system](https://design.visa.com/data-visualization/charts/heatmap/accessibility/)

---

## Patterns we will use (summary)
1. **Persistent timer in the chrome** (Toggl top bar, Flow menu bar), pre-filled with today's section (Session intention).
2. **Live tracking separate from bulk editing:** Today has the timer, Timecard has the grid (Harvest).
3. **Timesheet conventions:** rows = subjects, columns = days, row totals on the right, footer of day totals, grand total bottom-right, today column tinted (TimeCamp, Primatime, Clockify).
4. **Planned vs actual on one week grid** with a now-line and drag to create, move and resize (Clockify, Notion Calendar).
5. **Overcommit warning** during weekly planning, and a guided weekly ritual (Sunsama).
6. **Current and longest streak with a rest-day allowance** (Todoist).
7. **Quiet sidebar, single accent, one shadow, Cmd+K palette with shortcut hints** (Linear, Things).
8. **Accessible single-hue heatmap** with bordered cells and keyboard tooltips (Roselli).

## Anti-patterns to avoid
- **Silent runaway timers** (Toggl, Sunsama, Airtable complaints). Show the timer everywhere, put elapsed time in the tab title, and ask on return after a long gap, the way Clockify and Harvest handle idle time. Source for the Airtable request: [Airtable community](https://community.airtable.com/other-questions-13/time-tracker-any-way-to-implement-idle-alert-or-visually-indicate-time-is-tracking-17918)
- **Dates without weekday names** in week views (Toggl review). Always show "Mon 27".
- **One cumulative total that hides sessions.** Keep session-level entries visible and editable (Airtable request).
- **A blocking intention prompt** before starting (Session redesign complaints).
- **Red/green as the only signal.** Always pair colour with an icon or text label.
- **Heavy setup before first value** (Timing, Motion). Onboarding should reach a working Today screen in under a minute.
- **Gamified guilt** (dead trees, lost karma). Treat a missed day as data, not a punishment.
- **Icon overload and loud sidebars** (Linear's own 2026 correction).
