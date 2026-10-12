# Design decisions: Budget Year view in Month view's cards (phone); phone uncategorized notice

- Design issue: #309; covered build issues: #306
- Revision: 1; replaces: the phone Year layout in `design/226-phone-sheets-rows/` (desktop Year not replaced)
- Maker: claude-bridge/claude-opus-5-5, medium thinking

## Choice and approval
- Approved version: **twoline** (now `index.html`), with notice a. Robert, 2026-10-12: "11. Drop the others. This version is approved." Approval here prepares the PR; Robert's merge approves the design for building.
- Reason: Robert chose two-line rows because "It gives more horizontal space to the category names and feels a lot less crowded." I had recommended divider (closest to Month's two columns, no new element).

Picks per decision (Robert, 2026-10-12):
- #5 Notice placement: **a**, a full-width strip joined to the top of the "Left to budget" band ("I like A the best. This is a good look.").
- #6 Year rows with nothing planned all year behind "Show N unbudgeted": **keep** ("I'm fine with keeping that.").
- #7 Year column look: **faint grey stripe** ("Faint grey stripe."), later revised on Robert's feedback, then superseded by #10.
- #7 follow-up: "it feels like it's encroaching on the month column too much right now and should be more centered between the month and year columns. I also think the contrast is a bit too high on the light version. Maybe it could use a bit of border definition?" Stripe narrowed (98px to 87px), tint halved, 1px `--line` hairline added (tried `--bg`: a dark well in dark mode).
- #8 Drop notice versions b and c: **yes** ("Yeah, I'm fine with dropping B and C."). Robert added: "I don't want to start building yet."
- Round 2 request: "Let's think through a few variants of this differentiation between month and year. I'm not sold yet."
- #10 Year treatment: **twoline** ("I think the two-line version is actually my preference... Let's go with that.").
- #11 Drop stripe, divider and header: **yes** ("Drop the others.").

## Alternatives
Complete evidence for every rejected version (8 states × light/dark × 390/1440, with manifests) is in `screenshots/all/`.
- Round 1, `screenshots/all/round-1/` (versions a, b, c; Year with the 87px stripe):
  - b lost: the notice as a separate card below the band, with a normal gap. Robert confirmed the drop (#8).
  - c lost: the notice as a second line inside the band, with shorter wording ("They're counted in these totals."). Robert confirmed the drop (#8).
  - a's notice is kept; a's year stripe was superseded in round 2.
- Round 2, `screenshots/all/round-2/` (versions stripe, divider, twoline, header; all notice a):
  - All three rejected versions lost the year as its own column beside the month, for side-by-side scanning. Robert confirmed the drop (#11).
  - stripe lost: the faint `--surface-2` stripe with a hairline down the year column.
  - divider lost: the thin hairline between the month and year columns.
  - header lost: the tinted "2026" tile above each section's year column.

## Independent critique
- Reviewer: GPT-5.6 Terra (openai/gpt-5.6-terra, medium thinking), routed with `node /git/maestro/routing/route.ts role checker --maker claude-bridge/claude-opus-5-5`.
- Command: `node /git/maestro/scripts/read-only-run.ts <worktree> review /git/maestro/skills/design-feature/reviewer-prompt.md "Design: <folder>. Images and manifest: /tmp/design-review-QcgQMO/versions. ..." -- --model openai/gpt-5.6-terra --thinking medium` (exit 0, worktree unchanged).
- Verdict: FIXES. All 96 images readable and passing visually; the three versions differ only on the notice.
  1. The unbudgeted-rows rule is unresolved and its meaning unstated. Fix: meaning written into `brief.md` and above (whole selected year, count fixed as the month changes); the decision itself goes to Robert in step 6.
  2. The 1440 images show the framed phone page, so they can't prove desktop is unchanged. Fix: `brief.md` marks them presentation only, and asks the build for before/after desktop captures.
- Re-check of fixes 1–2 (same reviewer and command, fixes only): PASS.
- Round 2 critique (new two-line composition): same reviewer, route and command, evidence `/tmp/design-review-QcgQMO/r2` (128 images: 4 versions × 8 states × 2 themes × 2 widths). Verdict: PASS. Noted trade-offs: two-line trades side-by-side comparison for room for long names and makes the year longer; header cap is easiest to scan at group level; divider is quietest.

## Comments and changes
- No Open Design comments were left; all feedback came in herdr (recorded above).
- After approval, one consistency fix: the year-loading skeleton still showed two number columns; it now shows a name bar, a second-line bar and one month bar, matching the approved layout. Only the four year-loading screenshots changed.
- Prototype-only fix: switching state now resets expanded/collapsed groups so they don't carry over. No screenshots changed.
- Pre-PR review fix (GPT-5.6 Terra, blocking #1): names in both views now wrap to at most two lines, breaking after "/", as the current base does (#314), instead of truncating. Year names already fit at 390, so only the eight Month screenshots changed. Trailing whitespace from the capture was stripped (nit). Mid-word breaks such as "Entertainm/ent" match the base's current behaviour and are left to a follow-up.

## Experiment
None.

## Open items
None affecting the approved scope.

## Build handoff
The merged folder/revision is the feature authority; DESIGN.md and the live site govern the site-wide look.
- Approved file `index.html`, evidence `screenshots/approved/` (8 states × light/dark × 390/1440). The 1440 images show the phone design framed; desktop Budget must not change, proven by before/after desktop captures.
- The year second line is a new use of existing parts (12px `--text-3` text under a name); Robert's merge grants it.
- Base changes since the capture (6af785f), reconciled 2026-10-12 against `origin/feature/platform-retheme` @ 9d79fa3:
  - #311 (gap between the uncategorized notice and the band on phones) is superseded on phones by notice a: the notice strip joins the top of the band with no gap, as Robert chose (#5).
  - #314 wraps phone Budget names to at most two lines, breaking after "/" (`wrapName`, `line-clamp-2`). Keep that in both views; in Year the year line sits under the (possibly wrapped) name. `index.html` shows this wrapping.
  - #312 sets phone Budget amounts to 15px. Keep that; the design's 14px month buttons reflect the older capture. The year line stays 12px.
