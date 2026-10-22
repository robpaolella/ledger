# Design: set the Saved segment apart in the Reports breakdown bar

- Design issue: #411
- Revision: 1
- Replaces: none

## Job and audience
A household member opens Reports to see where a period's income went. The breakdown
bar starts with **Saved** (income minus expenses, the Net card's figure), then the top
expense groups, Other and Uncategorized. Saved is not a category and has no row in the
category breakdown below, yet today it is a solid green block that reads like any other
category (and sits next to teal Household, which looks similar). The visitor should be
able to tell at a glance that Saved is a calculated figure. Source: #410.

## Covers
| Build issue | Part of this feature | Out of scope |
| --- | --- | --- |
| #410 | How the Saved segment looks in the Reports breakdown bar (bar, legend, hover tooltip) | How Saved is calculated; adding Saved to the category list; other Reports sections |

## Boundaries and visual authority
- Robert asked for a quick, simple session (2026-10-19): show only the Breakdown card
  (bar + legend), not the whole page, with a few treatments for Saved beside the existing
  Uncategorized diagonal stripes; he picks one.
- DESIGN.md: status token `--positive` is "money in and under budget"; category hues
  `--c-*`; tinted fills are `color-mix` of a token into the surface; never colour alone,
  the label is always visible. Uncategorized's `.uncategorized-hatch(-bar)` in
  `packages/client/src/index.css` must not change.
- Host: `ReportsPage.tsx` flow bar (`flowSegs`, Breakdown card). Wording, order, hover
  tooltip text, percentages and widths stay as today. No new kind of element; only a
  new fill/edge treatment on an existing segment.

## States, themes and content
| State slug | Situation | Content | Behaviour |
| --- | --- | --- | --- |
| saved | Year to date, 14% saved, Uncategorized present | Saved $8,402 · 14.2% then 7 groups, Other, Uncategorized | Hover a segment: tooltip with name, amount, share (as today) |
| saved-small | A month where little was saved | Saved $112 · 1.9%, thin sliver | Treatment must still read on a narrow segment |
| over-income | A month where spending exceeded income | No Saved segment; label "Spent $…"; bar is expenses only | As today |

Loading, error, empty ("No spending in this period."), locked and no-permission states
are unchanged by this design and not shown: the treatment only applies when a Saved
segment exists. All roles that can see Reports see the same bar. Themes: light, dark.
Widths: 390×844 and 1440×900. Hover is mouse-only today; that stays.

## Host snapshot and offline proof
- Route `/reports`, owner `john`, Year to date, verify-ledger demo seed (Jan–Mar 2026
  synthetic data), source `origin/feature/platform-retheme` at 544ee94.
- Commands: `node .pi/skills/verify-ledger/run.mjs launch|doctor|cleanup "$EVIDENCE"`;
  `node .pi/skills/verify-ledger/snapshot.mjs capture "$EVIDENCE" reports-{light,dark}-{390,1440}`
  then `assemble "$EVIDENCE" page …` (page-snapshot.md). Evidence: /tmp/ledger-evidence-eaz9fG.
- Offline: app cleaned up (cleaned.json PASS), fresh browser session with network
  emulated Offline, page.html opened light/dark at 390 and 1440; matches live captures;
  no network resources loaded.
- Host parts used: `host.html` light-1440 view: the `<head>` stylesheet cascade (tokens,
  Tailwind, inlined fonts) and the Breakdown card (`div.border.border-line.rounded-card`
  containing the `Breakdown` button, the `relative flex mb-4` bar and its legend).

## Confirmed decisions
1. Robert confirmed the brief and the three directions on 2026-10-19 ("Yes, let's go with
   these three."): A Outline (pale green fill + solid green border), B Dots (green dot
   pattern on pale green), C Set apart (lighter green fill + wider gap after Saved).
   Uncategorized's stripes, wording, order, tooltip and percentages unchanged; legend keeps
   the 💰 emoji for Saved as today.
2. Versions are built from the captured head (styles, inlined fonts) of `host.html`'s
   light-1440 view, with the card rendered from synthetic data by a local script so the
   state/theme switcher works. The captured CSP gains only `script-src 'unsafe-inline'`.
3. Robert, 2026-10-19: hovering a segment must not stretch it; only the middle grows and
   the rounded corners keep their size. Hover now grows the segment 22px to 28px by
   moving its top and bottom edges, for every segment. `host.html` was removed after final
   offline proof (decisions.md).

## Real-site experiment
None.

## Open decisions
None. Robert chose A on 2026-10-19 (see decisions.md).
