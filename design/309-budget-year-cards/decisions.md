# Design decisions: Budget Year view in Month view's cards (phone); phone uncategorized notice

- Design issue: #309; covered build issues: #306
- Revision: 1; replaces: the phone Year layout in `design/226-phone-sheets-rows/` (desktop Year not replaced)
- Maker: claude-bridge/claude-opus-5-5, medium thinking

## Choice and approval
Picks so far (Robert, 2026-10-12):
- #5 Notice: **a** ("I like A the best. This is a good look.")
- #6 Year rows with nothing planned all year behind "Show N unbudgeted": keep ("I'm fine with keeping that.")
- #7 Year column look: **faint grey stripe** ("Faint grey stripe."). Robert asked to bring back the old layout's different colour for the year column, so it reads as fixed while the months change. Offered a stripe or plain grey text in the existing boxes; he chose the stripe. Applied to all versions (a shared change); the per-row grey boxes are gone. Restyle only, no new behaviour, so no repeat critique.
- #7 follow-up (Robert, 2026-10-12): "it feels like it's encroaching on the month column too much right now and should be more centered between the month and year columns. I also think the contrast is a bit too high on the light version. Maybe it could use a bit of border definition?" Changes: the stripe narrowed from 98px to 87px so its edge sits midway between the month buttons and the widest year figure; the tint went from full `--surface-2` to a half-strength mix with `--surface` (tried `--bg` first: fine in light, but a dark well in dark); a 1px `--line` hairline was added on its edge. Checked at 390 in light and dark.
- #8 Drop b and c (Robert): "Yeah, I'm fine with dropping B and C." What only they had: b's notice as a separate card below the band with a gap; c's notice as a second line inside the band, with shorter wording. Robert also said: "I don't want to start building yet." Not approved. Before replacing them, all round-1 versions (a, b, c × 8 states × 2 themes × 2 widths, with the 87px stripe) were captured to `screenshots/all/` (96 images + manifest).
- Round 2 (Robert): "Let's think through a few variants of this differentiation between month and year. I'm not sold yet." Versions a/b/c replaced by four year-column treatments, all with notice a: `stripe` (round-1 a as last revised), `divider`, `twoline`, `header`. See `brief.md`, Year-column treatment.
- #10 Year-column treatment: **twoline** (Robert: "I think the two-line version is actually my preference. It gives more horizontal space to the category names and feels a lot less crowded. Let's go with that."). I had recommended divider; Robert chose twoline for name space and less crowding. This supersedes #7 (stripe).

Original summary: Versions differ on one decision, the phone uncategorized notice:
- a: a full-width warning strip joined to the top of the "Left to budget" band
- b: the band stays under the controls; the notice is today's card below it, with a normal gap
- c: the notice is a second line inside the band

A second question goes to Robert: Year rows with nothing planned in any month of the selected year sit behind "Show N unbudgeted" (as in Month); rows planned in other months stay visible with "—" for the chosen month.

## Alternatives
Pending.

## Independent critique
- Reviewer: GPT-5.6 Terra (openai/gpt-5.6-terra, medium thinking), routed with `node /git/maestro/routing/route.ts role checker --maker claude-bridge/claude-opus-5-5`.
- Command: `node /git/maestro/scripts/read-only-run.ts <worktree> review /git/maestro/skills/design-feature/reviewer-prompt.md "Design: <folder>. Images and manifest: /tmp/design-review-QcgQMO/versions. ..." -- --model openai/gpt-5.6-terra --thinking medium` (exit 0, worktree unchanged).
- Verdict: FIXES. All 96 images readable and passing visually; the three versions differ only on the notice.
  1. The unbudgeted-rows rule is unresolved and its meaning unstated. Fix: meaning written into `brief.md` and above (whole selected year, count fixed as the month changes); the decision itself goes to Robert in step 6.
  2. The 1440 images show the framed phone page, so they can't prove desktop is unchanged. Fix: `brief.md` marks them presentation only, names `hosts/*.html` at 1440 as the unchanged desktop reference, and asks the build for before/after desktop captures.
- Re-check of fixes 1–2 (same reviewer and command, fixes only): PASS.
- Round 2 critique (new two-line composition): same reviewer, route and command, evidence `/tmp/design-review-QcgQMO/r2` (128 images: 4 versions × 8 states × 2 themes × 2 widths). Verdict: PASS. Noted trade-offs: two-line trades side-by-side comparison for room for long names and makes the year longer; header cap is easiest to scan at group level; divider is quietest.

## Comments and changes
None yet.

## Experiment
None.

## Open items
#11 Drop stripe, divider and header (awaiting Robert's yes). Not approved yet.

## Build handoff
The merged folder/revision is the feature authority; DESIGN.md and the live site govern the site-wide look.
