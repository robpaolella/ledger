# Handoff: design session for #106 (covers #107), third handoff

Temporary working note; delete it before the design PR.

Next session: Claude Opus 5.5, medium thinking (`route.ts role design-feature`).
Start command (new labelled tab in Ledger's herdr workspace):
`cd /git/ledger-worktrees/docs-106-design-uncategorized && pi --model claude-bridge/claude-opus-5-5 --thinking medium`
Prompt: "Read design/106-uncategorized/handoff.md, then continue /git/maestro/skills/design-feature/SKILL.md for #106 (covers #107) with Robert in this tab, at step 6 (waiting on Robert's four decisions and Open Design comments). Base: feature/platform-retheme. Do every remaining step yourself in this tab."

## Done (steps 1–5, step 6 started)
- Steps 1–3: see brief.md (Confirmed decisions; Host snapshot and offline proof, now filled).
- Step 4: versions `a` (row at end of each section) and `b` (InlineNotification-style notice
  above the lists), untracked, in `versions/`. design.json now has 10 states (added
  `reports-trends-large`). Built, never hand-edited: sources outside git in
  `/git/ledger-worktrees/docs-106-design-uncategorized-build/` (`proto.js`, `proto.css`,
  `build.py`, captured bodies). Rebuild:
  `cd /git/ledger-worktrees/docs-106-design-uncategorized-build && python3 build.py /git/ledger-worktrees/docs-106-design-uncategorized/design/106-uncategorized/versions`
- Offline proof for versions: `node /tmp/offline106/check.mjs <versions dir>` (headless Chrome,
  network offline; checks markers, keyboard switcher, URL sync, phone tap heights, row focus).
  Last run: zero non-local requests, taps ≥44px, 2px focus ring. Script is in /tmp (may vanish;
  results are recorded in brief.md).
- Step 5: critique done and recorded in decisions.md ("Independent critique"). Same-company
  (Sonnet 5.5 high) under Robert's standing approval of 2026-10-08, openai out until Tue
  2026-10-13 21:33 PDT — disclose in the PR (and a `## Robert's answers` comment per the route
  note). Verdict FIXES (7); all fixed; one fixes-only re-check: 5 PASS, 2 were records-only
  (questions not in open lists) plus a 43.5px nit; both fixed after the re-check, not re-run;
  Robert was told. Evidence: `/tmp/design-review-2oC2Sh/{versions,fixes}`, reviews in
  `critique.txt`, `recheck.txt` there.
- backlog.md: added the pre-existing phone Reports amount cut-off line (uncommitted).
- Step 6: `design.ts open` done; link given to Robert:
  http://192.168.50.10:7456/projects/b8c674f3-b6b2-4b2e-9098-8747aca706f7/conversations/758d8b09-eda7-4bb2-941a-a0f0f975b3f2
  Comment reminder already given once (don't repeat). Robert asked for and got a numbered
  review checklist (A desktop → A phone → B → dark → comments → answer decisions).
  The Open Design copy was synced by `open` before the final `.unc-note` min-height rebuild;
  run `design.ts sync` before/with the next change.

## Waiting on Robert (also in brief.md "Open decisions" and decisions.md "Open items")
1. Row (A) or notice (B) — recommended B.
2. Uncategorized spend lowers section Remaining and fills bars — built yes, recommended yes.
3. Trends chip show/hide its line or link to Review — built show/hide, recommended.
4. Link colour `--warning` or `--primary` — recommended `--primary` for A rows and the
   Dashboard note; B's notice keeps its warning tone.

## Next steps
1. When Robert answers or says "check": `node /git/maestro/scripts/design.ts comments "$folder"`,
   record each in decisions.md (Comments and changes), edit `proto.js`/`proto.css`, rebuild,
   reshoot affected states at both widths, `sync`, `resolve` addressed IDs.
2. Record his pick per decision in decisions.md's table. If decision 4 changes link colour,
   update proto.css `.unc-link` (and the A row chevron colour in `reportsSummary`).
3. Before dropping a version, name what only it had and get his yes (step 6/8 rules).
4. On "approved": step 8 (all-version shots → screenshots/all, index.html, approved shots,
   delete host-*.html and this handoff, ship). Branch has diverged (2 own commits; base has 6 new) from
   origin/feature/platform-retheme: run sync-branch before the PR.
