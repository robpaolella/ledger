# Handoff: design session for #106 (covers #107), second handoff

Temporary working note; delete it before the design PR.

Next session: Claude Opus 5.5, medium thinking (`route.ts role design-feature`).
Start command (new labelled tab in Ledger's herdr workspace):
`cd /git/ledger-worktrees/docs-106-design-uncategorized && pi --model claude-bridge/claude-opus-5-5 --thinking medium`
Prompt: "Read design/106-uncategorized/handoff.md, then continue /git/maestro/skills/design-feature/SKILL.md for #106 (covers #107) with Robert in this tab, from step 4's re-check and step 5's critique. Base: feature/platform-retheme. Do every remaining step yourself in this tab."

## Done
- Step 1: branch `docs/106-design-uncategorized` from `origin/feature/platform-retheme`, worktree above, `## Dispatch` on #106, #106 `status:in-progress`. #107 already needs-design and blocked by #106.
- Step 2: interview finished; Robert confirmed the brief ("Go ahead.", 2026-10-10). All decisions 1–8 are in `brief.md` (Confirmed decisions). Robert's words: 1 "for #1 A is fine"; 2 "A"; 3 "A"; 4 "Let's see both versions, yes."; 5 "A"; 6 "I thik Uncategorized still makes the most sense."; 7 "Agreed with A, but also put diagonal lines through it so that it's clear this is different."; 8 "Agreed, A."
- Step 3: hosts captured on fresh sample data (launch 2026-10-10, owner John, source commit ef3032a), site cleaned (`cleanup` PASS), offline proof done (16 images, no network requests). Files (untracked, ~3.4 MB each): `host-budget.html`, `host-reports.html`, `host-trends.html` (Reports with Trends + Timeline open), `host-dashboard.html`. Reports captures were trimmed to the first 3 transaction days (else 9 MB). Launch command: `LEDGER_LOGODEV_TOKEN_FILE=/nonexistent node .pi/skills/verify-ledger/run.mjs launch "$EVIDENCE"`; captures `snapshot.mjs capture` × {budget, reports, trends, dashboard} × {light,dark} × {390,1440}; theme set with the sidebar `button[title="Dark mode"]`. Evidence: `/tmp/ledger-evidence-iibXYs` (may be gone; not needed again). Fill brief.md "Host snapshot and offline proof" from this.
- Step 4: `versions/a.html` (row at end of each section) and `versions/b.html` (InlineNotification-style warning notice above the lists), `design.json` (9 states × light/dark). Untracked, ~1 MB each. They are built, not hand-edited: sources live outside git in `/git/ledger-worktrees/docs-106-design-uncategorized-build/` (`proto.js` behaviour, `proto.css`, `build.py`, captured page bodies). Rebuild with `cd …-build && python3 build.py /git/ledger-worktrees/docs-106-design-uncategorized/design/106-uncategorized/versions`.
- First full shots: `node /git/maestro/scripts/design.ts shots <folder> --out /tmp/design-review-fmaqBD/v1` (72 images, all inspected for budget/reports/trends/dashboard). Looked right: totals, rail, striped slice and legend, dashed Trends line with rescaled axis, timeline row, Dashboard note.

## Fixed after those shots, NOT yet re-checked (do this first)
1. Phone Budget A card: dropped the "—" planned cell so "$412 · 6 transactions" no longer truncates.
2. Dashboard Budget card "earned/spent" and "remaining" now also include the uncategorized money (selector rewritten in `updateEarnedSpent`). Verify the Budget page rail still updates too.
3. Notice (B) on phones: the "Review them" link moves to its own line (`.unc-notice-action`).
4. Sidebar now spans the full page height (`#root { position: relative }`).
Re-run shots to a fresh folder and inspect: a-budget-*-390, a-dashboard-*, b-budget-*-1440, b-reports-*-390, a-budget-light-1440.

## Notes for Robert / the critique
- Version A on desktop Budget puts the expense Uncategorized row at the very bottom of a long list, which is far from view; B's notice sits at the top. That's the real trade-off to show him.
- At typical size the striped slice in the Breakdown bar is a sliver (0.7%); it's obvious in `reports-large`.
- Pre-existing, not this design: on a 390 px phone the Reports Category breakdown rows cut off their amounts (only % shows). Add to backlog.md as a follow-up; don't fix here.
- The Dashboard Spending chart line isn't redrawn to include the extra money (prototype limitation; headline and note are right). Say so in decisions.md.
- The notice reuses `InlineNotification` (warning). Update brief.md's "New kinds of element" line: only the striped grey is new.
- PRODUCT.md should gain the sign rule for Uncategorized (decision 2); that's for #107/#114, note it in decisions.md Open items.

## Next steps
1. Re-check the four fixes (above), then fill brief.md's host section and `decisions.md` (copied template, still blank; maker `claude-bridge/claude-opus-5-5`, medium).
2. Step 5 critique: `evidence=$(mktemp -d /tmp/design-review-XXXXXX)`; shots to `$evidence/versions`; `node /git/maestro/routing/route.ts role checker --maker claude-bridge/claude-opus-5-5`; `node /git/maestro/scripts/read-only-run.ts "$PWD" review /git/maestro/skills/design-feature/reviewer-prompt.md "Design: <folder>. Images and manifest: $evidence/versions. Maker: claude-bridge/claude-opus-5-5." -- <pi args from route>`. Run it blocking.
3. Step 6: `design.ts open`, give Robert the link, ask decision by decision (here only one: row vs notice, plus anything the critique raises).
