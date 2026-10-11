# Handoff: design session for #106 (covers #107), fourth handoff

Temporary working note; delete it before the design PR.

Next session: Claude Opus 5.5, medium thinking (`route.ts role design-feature`).
Start command (new labelled tab in Ledger's herdr workspace):
`cd /git/ledger-worktrees/docs-106-design-uncategorized && pi --model claude-bridge/claude-opus-5-5 --thinking medium`
Prompt: "Read design/106-uncategorized/handoff.md, then continue /git/maestro/skills/design-feature/SKILL.md for #106 (covers #107) in this tab at step 8 (Robert approved version b; finish the freeze and ship the design PR). Base: feature/platform-retheme. Do every remaining step yourself in this tab."

## Done
- Steps 1–5 and 6: see brief.md, decisions.md and the third handoff's history (git log / brief).
- Robert's answers (2026-10-10), all recorded in decisions.md (Choice and approval table,
  Alternatives, Comments and changes):
  1 = b; 2 = yes (Remaining drops); 3 = show/hide chip; 4 = yellow for B's notice;
  5 = fine to drop A (what A alone had is listed in Alternatives); 6 = Dashboard note
  "Review" link blue (`--primary`). Then: "Approved to proceed."
- Change made for 6: `proto.js` line ~332 (in `/git/ledger-worktrees/docs-106-design-uncategorized-build/`)
  gives the Dashboard note's `.unc-link` `style="color:var(--primary)"`; rebuilt both versions.
  B's notice link stays `--warning`.
- Robert's Open Design comment `cmt_9ca5986f` (on A) is recorded as not built, superseded
  by choosing b. Still **open in Open Design**: resolve it after the final sync.
- Step 8.1 started: all-version shots taken AFTER the colour change:
  `/tmp/design-review-wnBvwd/all` (80 PNGs + manifest.json; manifest checked complete:
  2 versions × 10 states × 2 themes × 2 widths, none tiny). Opened and checked so far:
  all 40 `a-*` images, plus `b-budget-{light,dark}-{1440,390}`. All fine; Dashboard
  "Review" shows blue.

## Next steps (step 8)
1. Open the remaining 36 `b-*` images in `/tmp/design-review-wnBvwd/all` (if /tmp is gone,
   re-run `node /git/maestro/scripts/design.ts shots "$folder" --out <new mktemp dir>/all`).
   Then `mkdir -p "$folder/screenshots/all" && cp -a <evidence>/all/. "$folder/screenshots/all/"`.
2. `cp versions/b.html index.html`; set design.json `versions` to `{"approved":"index.html"}`;
   remove `versions/` only after the copy and screenshots/all are verified.
3. Approved shots to `<evidence>/approved`, open every image (1 version × 10 × 2 × 2 = 40),
   copy to `screenshots/approved/`. Offline recheck of index.html (`/tmp/offline106/check.mjs`
   if it still exists, else headless Chrome with network off: markers, switcher, zero
   non-local requests). `design.ts sync`, then `design.ts resolve "$folder" cmt_9ca5986f`,
   then `comments` to confirm none open.
4. Finish decisions.md (comment row's Resolved column to the date; critique note that the
   combined design adds no new behaviour, so no re-critique; Build handoff). Update brief.md
   "Open decisions" to the answers and Robert's 2 / 3 / 4 / 6 picks (Remaining drops, chip
   toggles, notice yellow, Dashboard link `--primary`); "Draft wording" drop A lines.
   Delete `host-*.html` and this handoff. Check the staged diff for private data.
5. backlog.md line (phone Reports amount cut-off) is already committed in 760cd94.
6. Branch diverged from origin/feature/platform-retheme: run sync-branch, then ship skill.
   PR title `docs(design): Uncategorized in totals`, base feature/platform-retheme, closes #106,
   `Refs #107`; attach approved phone/desktop images; disclose same-company critique
   (Sonnet 5.5 under Robert's standing approval, openai out until 2026-10-13) and add the
   `## Robert's answers` comment per the route note. Then `## Design PR` comment on #106.
   Don't merge.
