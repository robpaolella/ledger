# Design decisions: Budget Year view in Month view's cards (phone); phone uncategorized notice

- Design issue: #309; covered build issues: #306
- Revision: 1; replaces: the phone Year layout in `design/226-phone-sheets-rows/` (desktop Year not replaced)
- Maker: claude-bridge/claude-opus-5-5, medium thinking

## Choice and approval
Picks so far (Robert, 2026-10-12):
- #5 Notice: **a** ("I like A the best. This is a good look.")
- #6 Year rows with nothing planned all year behind "Show N unbudgeted": keep ("I'm fine with keeping that.")
- #7 Year column look: **faint grey stripe** ("Faint grey stripe."). Robert asked to bring back the old layout's different colour for the year column, so it reads as fixed while the months change. Offered a stripe or plain grey text in the existing boxes; he chose the stripe. Applied to all versions (a shared change); the per-row grey boxes are gone. Restyle only, no new behaviour, so no repeat critique.

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

## Comments and changes
None yet.

## Experiment
None.

## Open items
None; awaiting Robert's "approved".

## Build handoff
The merged folder/revision is the feature authority; DESIGN.md and the live site govern the site-wide look.
