# Design: Budget Year view in Month view's cards (phone); phone uncategorized notice

- Design issue: #309
- Revision: 1
- Replaces: the phone Year layout in `design/226-phone-sheets-rows/` (approved for #271); the desktop Year layout is not replaced.
- Source plan: #306

## Job and audience
A household member on their phone opens Budget and switches between Month and Year. Today, Year is one big table. It "makes it feel like completely separate information" (Robert, 2026-10-12). The job: switching Month ↔ Year should feel like the same page, with the same group cards, where only the two number columns change. Separately, the yellow "no category yet" notice should sit well with the "Left to budget" bar on phones.

## Covers
| Build issue | Part of this feature | Out of scope |
| --- | --- | --- |
| #306 | Phone Year view restyled in phone Month view's group cards; phone uncategorized notice treatment | Desktop Month and Year (unchanged); server changes; the notice's gap fix (#304); tap targets (#289); Budget category detail and history |

## Boundaries and visual authority
- `DESIGN.md` and `.github/design-system.jsx` govern the look. Everything is reused from the existing phone Budget page: group cards, row layout, the Planned edit button, the pill shape of the Remaining column, the section headings with mono column labels, the month stepper (`MonthSwitcher`), the empty-year and view-only notes, and the loading and error cards.
- Phone only (Robert, 2026-10-12: "Desktop shouldn't be changing at all. this is strictly mobile"). No server work: the columns keep today's Year contents ("Just follow what is already shown in those columns now and theme it differently").
- Navigation is unchanged. The month stepper moves one month within the year and stops at January and December. The header arrows move a year, and Today returns to the current month.
- Month view's layout is unchanged; only the notice's placement and look are in question.
- Year layout (approved, Robert #10: two-line rows): there is no year column. The section heading shows the month label (e.g. OCT) and the section's month total on the right, and "$97,968 planned in 2026" (or "Nothing planned in 2027") in 12px `--text-3` under the section name. Each group header and category row shows its year total as a 12px `--text-3` line under its name ("$14,851 in 2026", or "Nothing in 2026"); group lines are semibold. The right side holds only the month figure: the group's month total, and each category's month plan as today's edit button (plain text when locked). Category names get the freed width and are no longer cut short at 390px. This comes from the round-2 comparison of stripe, divider, two-line and header-cap treatments (see `decisions.md`).

## States, themes and content
| State slug | Role / situation | Content | Actions / feedback |
| --- | --- | --- | --- |
| month-notice | Owner, Month, October 2026, 2 uncategorized ($37 out) | Notice: "**2 transactions have no category yet** ($37 out). They're counted in the totals below." with "Review them ›" shown as a full-width strip joined to the top of the "Left to budget" band (notice a) | Review them goes to Review for the month |
| month-clear | Owner, Month, nothing uncategorized | No notice; band directly under the controls | — |
| year | Owner, Year, October (this month) | OCT column on the right with section month totals; year totals as a second line under each section, group and category name; month plan is an edit button | Tap month plan to edit (opens today's edit sheet); stepper changes month; Show/Hide N unbudgeted |
| year-past | Owner, July 2026 | Stepper subline "Planned · past month, locked"; month values plain text, not buttons | No editing |
| year-empty | Owner, 2027 (future, nothing planned) | Note "Nothing planned for 2027 yet."; every value "—"; all rows behind "Show N unbudgeted" | — |
| year-viewonly | Member without budget editing | Note "You can view this budget. Ask an admin if you need to change it."; month values plain | No editing |
| year-loading | Any | Skeleton band and three skeleton cards; each row has a name bar, a shorter second-line bar and one month bar | — |
| year-error | Any | "Couldn't load your budget" card with Try again (today's wording) | Try again reloads |

- Months before any data: January 2026 in the sample has no plans, so stepping back to January shows "—" for every month value.
- Content range: from a single income row up to 14 expense groups with 3–6 categories each. Long names ("Doctor/Dentist/Optometrist", "Auto/Transportation") show in full in Year at 390px. The build keeps the base's newer name wrapping (#314: up to two lines, breaking after "/") in both views, with the year line under the name; see `decisions.md`, Build handoff.
- Income vs expense: same card treatment; section headings "Income" and "Expenses".
- Themes: light and dark. Widths: 390×844 is the design. At 1440×900 the prototype shows the phone design in a 390×844 frame, because desktop is unchanged. Those 1440 images are presentation only: they do not show or prove the desktop Budget page. The build proves desktop is untouched with before/after 1440×900 captures of Month and Year in both themes, taken from the base branch and the build branch with the verify-ledger skill.
- Keyboard: every control is a real button with a label (collapse/expand names the group; the edit button names the category, month and value).

## Host snapshot and offline proof
- Source: `feature/platform-retheme` at 6af785f, verify-ledger skill (`.pi/skills/verify-ledger/SKILL.md`).
- Commands: `npm ci`, `node .pi/skills/verify-ledger/run.mjs launch "$EVIDENCE"` (Doctor PASS), sign in as john/password1 at 390×844, `/budget` (launch month October 2026). Captured with `snapshot.mjs capture` at light/dark × 390/1440 for Month (`month-*`) and Year (`year-*`), then assembled with `snapshot.mjs assemble`. Theme set with the sidebar Dark mode / Light mode control. `run.mjs cleanup` reported PASS (the app was stopped).
- Final offline proof of `index.html` (2026-10-12): opened from `file://` with network emulated offline at 390×844; only the file itself and inline `data:` fonts loaded; fonts loaded; state/theme markers matched the URL; the month stepper, Show/Hide unbudgeted and the state switcher worked and updated the URL.
- Offline proof: the host snapshots (`hosts/month.html`, `hosts/year.html`, removed from the final folder once the approved file had its own offline proof) were opened from `file://` with network emulated offline, at 390 and 1440 in both themes. They rendered with fonts and images, and no network resources loaded.
- `index.html` (approved, from version `twoline`) and the earlier versions were built from the Month capture `month-light-390.html` (its stylesheet, fonts, app shell and phone header). The Budget content after the page header (from `div[role=status]` to the end of the page root) is replaced with `#proto-page`, rendered by local script from synthetic sample data. The CSP gains only `script-src 'unsafe-inline'`, and `default-src 'none'` remains.
- Host parts used: `#mobile-bar-title span` (header title), `button[aria-pressed]` (Month/Year control), the phone group card markup (`.rounded-card` group cards, row and pill classes), `MonthSwitcher` markup from `hosts/year.html` (`aria-label="Previous month"`), and `div[role=status]` (notice) from `hosts/month.html`.

## Confirmed decisions
1. Phone only; desktop unchanged; no server work (Robert, 2026-10-12).
2. The columns keep today's Year contents: the chosen month's plan and the year's plan, labelled with the month (e.g. OCT) and the year (Robert: "follow what is already shown in those columns now and theme it differently").
3. Navigation stays as today (Robert: "We shouldn't need to change it").
4. The month stepper sits where Month view has its "Left to budget" band (Robert, plan confirmed: "Yes, build it").
5. The notice stays on Month view only, as a strip joined to the top of the band (notice a; Robert: "I like A the best. This is a good look.").
6. Year rows with nothing planned in any month of the selected year sit behind "Show N unbudgeted", like Month. A row planned in another month but not the chosen one stays visible with "—" for the month. The count does not change as the month stepper moves. Today's Year view lists every category (Robert: "I'm fine with keeping that.").
7. Year shows the year totals as a second line under each name, not as a column (Robert: "I think the two-line version is actually my preference. It gives more horizontal space to the category names and feels a lot less crowded.").

## Real-site experiment
None.

## Open decisions
None.
