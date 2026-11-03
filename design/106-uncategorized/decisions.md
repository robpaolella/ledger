# Design decisions: Uncategorized in totals

- Design issue: #238 (original design issue #106); covered build issues: #107, #234, #235
- Revision: 2; replaces: revision 1 (design issue #106)
- Maker: claude-bridge/claude-opus-5-5, medium thinking (two sessions; the second took over
  from step 4's re-check)

## Choice and approval
Chosen: **b**. Robert, 2026-10-10, this herdr tab: "Approved to proceed." (after answering
decisions 1–6 below). Dropping a confirmed: "5. Fine to drop." (see Alternatives).
The versions differ on one decision (1); 2–4 and 6 were open questions on shared behaviour:

| # | Decision | Options (version) | Robert's pick and why |
| --- | --- | --- | --- |
| 1 | How Uncategorized shows on Budget and Reports | a: a row at the end of each section (Income, Expenses), muted, striped icon, "N to review ›"; b: one warning notice above the lists, category list unchanged | **b**. Robert, 2026-10-10: "I agree that B is better." |
| 2 | Uncategorized spend lowers section Remaining and fills the Budget bars | yes (built) / no | **Yes**. Robert, 2026-10-10: "Yes." |
| 3 | Trends Uncategorized chip | show/hide its line like the other chips (built) / link to Review | **Show/hide**. Robert, 2026-10-10: "That's fine." |
| 4 | Link colour | `--warning` (built) / `--primary` | **`--warning` for B's notice**. Robert, 2026-10-10: "The yellow is good for B." |
| 6 | Dashboard Spending note's "Review" link colour | `--warning` (built) / `--primary` (recommended: a hint, not a warning) | **`--primary`**. Robert, 2026-10-10: "That's fine to make it blue." Changed in `proto.js`, rebuilt; a/b-dashboard shots at both widths and themes show it blue |

Frozen 2026-10-10: `versions/b.html` became `index.html` (`design.json` `versions` is
`{"approved":"index.html"}`). Approved evidence: `screenshots/approved/` (10 states × 2
themes × 2 widths, 40 images plus manifest; byte-identical to the final `b-*` shots in
`screenshots/all/`, all opened and checked). Picks 2–4 and 6 apply to the approved design
as built; nothing was combined from different versions, so no new behaviour and no
re-critique.

Shared by both versions (from the confirmed brief): striped grey slice and legend entry in
the Breakdown bar, dashed grey line with striped swatch in Trends, the Timeline row, the
Dashboard Spending note, and hiding everything when nothing is uncategorized.

## Alternatives
- **a** (row at the end of each section), rejected. Screenshots: `screenshots/all/a-*`
  (final alternatives, captured after the decision 6 colour change: 2 versions × 10 states ×
  2 themes × 2 widths, 80 images plus manifest, all opened and checked).
  Lost (only in a): an Uncategorized row inside the Budget and Reports lists so the list adds
  up on screen; separate per-side counts ("6 to review" / "1 to review"); its share on the
  Reports Summary ("<1%") and its own Timeline row; the phone card with its own Review button;
  Robert's comment cmt_9ca5986f idea (striped row at the top, folder emoji). Robert,
  2026-10-10: "5. Fine to drop."

## Independent critique
- Maker: claude-bridge/claude-opus-5-5 (medium). Reviewer: claude-bridge/claude-sonnet-5-5
  (high). Same-company review under Robert's standing approval of 2026-10-08: vendor openai
  was switched out until Tue 2026-10-13 21:33 PDT (`node scripts/usage.ts`), so
  `route.ts role checker --maker claude-bridge/claude-opus-5-5` waited (exit 2) and
  `--approved-same-vendor` routed Sonnet 5.5. Disclose this in the design PR.
- Command: `node /git/maestro/scripts/read-only-run.ts "$PWD" review
  /git/maestro/skills/design-feature/reviewer-prompt.md "Design: <folder>. Images and manifest:
  /tmp/design-review-2oC2Sh/versions. Maker: claude-bridge/claude-opus-5-5. …" -- --model
  claude-bridge/claude-sonnet-5-5 --thinking high` (exit 0, folder unchanged), 2026-10-10.
- Verdict: **FIXES**, 7 items (72 images, all present). Fixes, made in one batch:
  1. Phone tap targets under 44px (B notice link, Dashboard note, Breakdown legend entry).
     Notice link and note are now 44px on phones; the legend entry, bar slice and Trends chip
     are plain chart parts like their neighbours (Review links stay on the row/notice/note).
  2. A, Reports Summary on phones hid the Uncategorized amount; "0%" for $85. Row now reads
     "$412 · 6 to review" on phones; tiny shares show "<1%".
  3. B notice: green "+$85" failed contrast (3.18:1) and InlineNotification takes a plain
     message. Amounts now plain notice text; the "+" and "in" carry direction.
  4. Trends dashed line unjudgeable at typical size. Added state `reports-trends-large`.
     Chip behaviour: toggles its line like the other chips, provisional (Open items).
  5. A rows lacked a visible focus style. Added the 2px `--ring` focus; Tab reaches them.
  6. Brief omitted that rail, Dashboard Budget card and section Remaining include the money.
     Added to Covers; Remaining dropping is provisional, listed in Open items.
  7. Dashboard chart's this-month line didn't match the headline. Line, area and dot now
     scaled by the uncategorized share.
- Also tidied: decision 4's quoted wording points to the built "Draft wording".
- Not fixes (reviewer's trade-offs, for Robert): A reconciles on screen, B relies on the
  notice to explain the gap; A's phone expenses row is ~3,000px down; link colour is
  `--warning` while DESIGN.md links are `--primary`; the typical Breakdown stripe is a sliver.
- Fixes-only re-check (same reviewer and command, evidence `/tmp/design-review-2oC2Sh/fixes`,
  80 images, 2026-10-10): **FIXES**. 1, 2, 3, 5, 7 PASS. 4 and 6 passed on evidence but their
  questions for Robert weren't in the open lists; nit on 1: Dashboard note measured 43.5px.
  Maker then listed the questions in brief "Open decisions" and here, and set the note's
  `min-height: 44px`. Not re-run (one re-check only); reported to Robert.

## Comments and changes
| ID / source | Version / element | Original note | Agreed change and verification | Resolved |
| --- | --- | --- | --- | --- |
| Maker self-check, first shots (`/tmp/design-review-fmaqBD/v1`) | a, Budget phone card | "$412 · 6 transactions" truncated | Dropped the empty planned cell; rechecked a-budget-light-390 | 2026-10-10 |
| Maker self-check | a and b, Dashboard Budget card | earned/spent and remaining left out the uncategorized money | Included it; rechecked a-dashboard-light-1440 / dark-390 and the Budget page rail ($3,340 earned, $3,390 spent) | 2026-10-10 |
| Maker self-check | b, notice on phones | "Review them" squeezed beside the text | Moved to its own line; rechecked b-reports-light-390 | 2026-10-10 |
| Maker self-check | a and b, sidebar | stopped short on long pages | Spans full height; rechecked a/b-budget-light-1440 | 2026-10-10 |
| cmt_9ca5986f (Open Design) | a, `div.unc-row` (Budget Income row) | "I'd like to see a version of this where the Uncategorized row is at the top of the section, the entire row itself has the diagonal gray lines (but not so high contrast…), and use a folder emoji (maybe even grayed out…). This version might be too easy to miss. … perhaps a 'Includes uncategorized expenses' next to the section header in yellow…" | Not built. Robert, 2026-10-10: "I added comments on version A but I suggest ignoring them and just using B." Superseded by choosing b; a dropped with Robert's yes. Resolved in Open Design after the final sync | 2026-10-10 |
| Maker offline check | a and b, prototype bar | keyboard focus left the state picker after a change | Focus restored after re-render; offline check shows focus kept | 2026-10-10 |
| Robert, herdr (decision 6) | a and b, Dashboard Spending note | "That's fine to make it blue." | Note's "Review" link uses `--primary`; B's notice link stays `--warning`; checked in a/b-dashboard shots, both themes and widths | 2026-10-10 |

Final check of `index.html` (2026-10-10, headless Chrome, network emulated offline, 390 and
1440): state/theme from the URL set `data-state`/`data-theme`, keyboard state change kept
focus, theme picker and URL sync worked, 7 fonts loaded, no broken images, no external links,
zero non-local requests; notice links and Dashboard note 44px tall on phones. Synced to Open
Design; `design.ts comments` reports no open comments.

## Experiment
None.

## Open items
- PRODUCT.md should gain the side rule for Uncategorized (money out under Expenses, money in
  under Income; brief decision 2). Belongs to #107 (or its docs follow-up), not this design.
- The prototype scales the Dashboard Spending this-month line by the uncategorized share; the
  build draws the real daily series including uncategorized money.
- Pre-existing, not this design: on a 390 px phone the Reports Category breakdown rows cut off
  their amounts (only the % shows). Logged in backlog.md.

## Build handoff
Build version b as `index.html` shows it, with the picks above: one `InlineNotification`
(warning) above the Budget and Reports lists, category lists unchanged; uncategorized money
in every actual total including section Remaining and the Budget bars; striped Breakdown
slice and legend entry; dashed Trends line whose chip shows/hides it; Timeline row; Dashboard
Spending note with a `--primary` "Review" link; all hidden when nothing is uncategorized.
The only new kind of element is the grey diagonal-stripe fill (approved by merging this
design). See Open items for what the prototype fakes.

Merged folder/revision is the feature authority; DESIGN.md/live site govern site-wide
look. Reconcile issues and paused branches in prep before marking ready. Without a
conductor, the design session owns that follow-up. Later revisions use new issues/PRs.

## Revision 2 (2026-10-11, design issue #238)
Coverage only. #107 was split, so #234 (Budget and Dashboard) and #235 (Reports) now sit
under this same approved design; #233 (Review period link) needs none. No visual or wording
change: `index.html`, the states, themes and every screenshot are unchanged. Robert chose
this route, Q21 "A" (2026-10-11, recorded on #234 and #235). His answers on #107
(`## Robert's answers`, 2026-10-11) that apply to the covered screens:
- **Q18 Reports filters** (account filter counts only that account's uncategorized;
  category filter leaves uncategorized out): "Got it. I agree with your suggestion here."
- **Q19 Budget Year view** (no notice; it shows plans only): "Fine by me."
- **Q20 Mark reviewed on an uncategorized transaction** (the item stays open and asks the
  person to pick a category first): "Agreed, go with A."
