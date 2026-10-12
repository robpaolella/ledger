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
- Year-column treatment (round 2, Robert: "Let's think through a few variants of this differentiation between month and year. I'm not sold yet."). All versions use notice a; they differ only in how Year separates the moving month from the fixed year:
  - **stripe**: a faint stripe down the year column of each card, half-strength `--surface-2` (`color-mix(in srgb, var(--surface-2) 50%, var(--surface))`) with a 1px `--line` hairline, 87px from the card's right edge (midway between the month buttons at 102px and the widest year figure at ~70px). Year figures `--text-2`.
  - **divider**: no fill; the same 1px `--line` hairline only, year figures in `--text-3` (closest to today's Year).
  - **twoline**: no year column. Each group and category shows its year total as a 12px `--text-3` line under its name ("$14,851 in 2026", or "Nothing in 2026"); the section heading shows "$97,968 planned in 2026" under its name. Only the month column sits on the right, so names get the freed width.
  - **header**: no row treatment; the "2026" label and section total sit on a small tinted cap (the stripe's tint, `--line` border, 10px corners) above the year column. Year figures `--text-3`.
  Stripe and header cap are each a new kind of element and need Robert's yes if chosen (stripe already had it).

## States, themes and content
| State slug | Role / situation | Content | Actions / feedback |
| --- | --- | --- | --- |
| month-notice | Owner, Month, October 2026, 2 uncategorized ($37 out) | Notice: "**2 transactions have no category yet** ($37 out). They're counted in the totals below." with "Review them ›" (c shortens to "They're counted in these totals.") | Review them goes to Review for the month |
| month-clear | Owner, Month, nothing uncategorized | No notice; band directly under the controls | — |
| year | Owner, Year, October (this month) | Columns OCT and 2026; section totals under the column labels; month plan is an edit button; year total per version (see Year-column treatment) | Tap month plan to edit (opens today's edit sheet); stepper changes month; Show/Hide N unbudgeted |
| year-past | Owner, July 2026 | Stepper subline "Planned · past month, locked"; month values plain text, not buttons | No editing |
| year-empty | Owner, 2027 (future, nothing planned) | Note "Nothing planned for 2027 yet."; every value "—"; all rows behind "Show N unbudgeted" | — |
| year-viewonly | Member without budget editing | Note "You can view this budget. Ask an admin if you need to change it."; month values plain | No editing |
| year-loading | Any | Skeleton band and three skeleton cards in the card layout | — |
| year-error | Any | "Couldn't load your budget" card with Try again (today's wording) | Try again reloads |

- Months before any data: January 2026 in the sample has no plans, so stepping back to January shows "—" for every month value.
- Content range: from a single income row up to 14 expense groups with 3–6 categories each. Long names ("Doctor/Dentist/Optometrist", "Auto/Transportation") truncate with an ellipsis, as in Month view.
- Income vs expense: same card treatment; section headings "Income" and "Expenses".
- Themes: light and dark. Widths: 390×844 is the design. At 1440×900 the prototype shows the phone design in a 390×844 frame, because desktop is unchanged. Those 1440 images are presentation only: they do not show or prove the desktop Budget page. The unchanged desktop reference is the real capture in `hosts/month.html` and `hosts/year.html` at 1440; the build proves desktop is untouched with before/after 1440 captures of Month and Year.
- Keyboard: every control is a real button with a label (collapse/expand names the group; the edit button names the category, month and value).

## Host snapshot and offline proof
- Source: `feature/platform-retheme` at 6af785f, verify-ledger skill (`.pi/skills/verify-ledger/SKILL.md`).
- Commands: `npm ci`, `node .pi/skills/verify-ledger/run.mjs launch "$EVIDENCE"` (Doctor PASS), sign in as john/password1 at 390×844, `/budget` (launch month October 2026). Captured with `snapshot.mjs capture` at light/dark × 390/1440 for Month (`month-*`) and Year (`year-*`), then assembled with `snapshot.mjs assemble`. Theme set with the sidebar Dark mode / Light mode control. `run.mjs cleanup` reported PASS (the app was stopped).
- Offline proof: `hosts/month.html` and `hosts/year.html` were opened from `file://` with network emulated offline, at 390 and 1440 in both themes. They rendered with fonts and images, and no network resources loaded.
- Versions (`stripe`, `divider`, `twoline`, `header`) are built from the Month capture `month-light-390.html` (its stylesheet, fonts, app shell and phone header). The Budget content after the page header (from `div[role=status]` to the end of the page root) is replaced with `#proto-page`, rendered by local script from synthetic sample data. The CSP gains only `script-src 'unsafe-inline'`, and `default-src 'none'` remains.
- Host parts used: `#mobile-bar-title span` (header title), `button[aria-pressed]` (Month/Year control), the phone group card markup (`.rounded-card` group cards, row and pill classes), `MonthSwitcher` markup from `hosts/year.html` (`aria-label="Previous month"`), and `div[role=status]` (notice) from `hosts/month.html`.

## Confirmed decisions
1. Phone only; desktop unchanged; no server work (Robert, 2026-10-12).
2. The columns keep today's Year contents: the chosen month's plan and the year's plan, labelled with the month (e.g. OCT) and the year (Robert: "follow what is already shown in those columns now and theme it differently").
3. Navigation stays as today (Robert: "We shouldn't need to change it").
4. The month stepper sits where Month view has its "Left to budget" band (Robert, plan confirmed: "Yes, build it").
5. The notice stays on Month view only. Three looks to compare in versions a/b/c (Robert: "Show me the versions and I'll comment on it").

## Real-site experiment
None.

## Open decisions
- Notice look: a, b or c (versions).
- Year rows with nothing planned in any month of the selected year sit behind "Show N unbudgeted", like Month. A row planned in some other month but not the chosen one stays visible, with "—" in the month column. The count does not change as the month stepper moves. Today's Year view lists every category. Robert to confirm.
