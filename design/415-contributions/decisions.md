# Design decisions: Contributions in Settings and Reports

- Design issue: #415; covered build issues: #419, #420
- Revision: 1; replaces: none (or merged folder/revision)
- Maker: claude-bridge/claude-opus-5-5 (Claude Opus 5.5), design tabs `design-415`, `design-415-2` and successor

## Choice and approval
Chosen version and why. When versions differed on more than one independent decision,
Robert's pick for each, asked as its own numbered question; the chosen version combines
them, even if no single version had all of them:

| # | Decision | Options (version) | Robert's pick and why |
| --- | --- | --- | --- |
| 1 | Where Contributions sits on Reports | a: a section inside the Category breakdown table; b: its own card below it, with Put in / Taken out figures and its own Summary/Timeline toggle | **b**: "I prefer B." (herdr, 2026-10-19) |
| 2 | Settings → Contributions list | a: compact rows in one card; b: one card per contribution listing its accounts | **a**: "I prefer A." (herdr, 2026-10-19) |
| 3 | Drill-in highlights the row and lists its transactions with a pill; no focus view of the table | (both) | OK: "That's fine." (herdr, 2026-10-19) |
| 4 | New element kinds (Not in totals tag, two-figure row, from → to line, piggy-bank nav icon) and phone adaptations (figures line under the name, two-line drill pill) | (both) | OK: "This is fine." (herdr, 2026-10-19) |

Picks come from different versions, so `versions/combined.html` (design.json `combined`) takes Reports from B and
Settings from A. It adds no behaviour neither version had, so no new critique (design-feature step 6). Check: all
72 combined captures in `/tmp/design-review-VYjbyA/versions` are pixel-identical below the prototype bar to their
source version (B for reports-*, A for the rest; ImageMagick AE = 0).

**Chosen: the combined version** (`index.html`): Reports from B (Contributions as its own card below Category
breakdown, with Put in / Taken out figures and its own Summary/Timeline toggle), Settings from A (compact rows in
one card). Reasons: B's card shows most clearly that this money isn't spending and has room for its own toggle;
A's rows suit a household tracking a few contributions and match the Categories list.

Robert's confirmation (herdr, 2026-10-19): "5. Approved. 6. Drop them." This authorizes the PR. Design PR: see the
`## Design PR` comment on #415. Only Robert merging that PR approves the design for building.

## Alternatives
| Version | What differs / why rejected or chosen | Only this version had (lost) | Robert's OK to drop | Evidence |
| --- | --- | --- | --- | --- |
| a | Settings list chosen (kept in combined); Reports placement not chosen | Contributions as a section inside the Category breakdown table, including its Timeline section with the section sums in the heading | "6. Drop them." (herdr, 2026-10-19) | [All-version manifest](screenshots/all/manifest.json), `screenshots/all/a-*` |
| b | Reports placement chosen (kept in combined); Settings list not chosen | Settings list as one card per contribution listing its accounts | "6. Drop them." (herdr, 2026-10-19) | [All-version manifest](screenshots/all/manifest.json), `screenshots/all/b-*` |
| combined | Chosen; became `index.html` | — | — | `screenshots/all/combined-*`, [approved manifest](screenshots/approved/manifest.json) |

All-version captures (216 = 3 versions × 18 states × light/dark × 390/1440, `design.ts shots`, from the final
sources) were completed and their manifest checked complete before `versions/` was removed. A and B images were
inspected in the earlier visual pass and critique runs (changed states re-inspected after fixes); combined matched
its sources pixel for pixel. Approved evidence: 72 images, [manifest](screenshots/approved/manifest.json), checked
complete, pixel-identical to the combined captures, and viewed as light/dark × 390/1440 contact sheets.
Offline proof of `index.html`: its Content-Security-Policy is `default-src 'none'` with data-only images and fonts,
it contains no http(s) resource references, and loaded in a browser with all 6 fonts and every image present,
`data-state` set and no console errors. Host snapshots (`hosts/`) removed at freeze; the captures stay outside
the repo.

## Independent critique
- Run 1, 2026-10-19: maker claude-bridge/claude-opus-5-5; reviewer openai/gpt-5.6-terra, thinking medium
  (`route.ts role checker`). Command: `node /git/maestro/scripts/read-only-run.ts <worktree> review
  /git/maestro/skills/design-feature/reviewer-prompt.md "Design: <folder>. Images and manifest:
  /tmp/design-review-vAwkPC/versions. Maker: claude-bridge/claude-opus-5-5. …" -- --model openai/gpt-5.6-terra
  --thinking medium`. Exit 0, worktree unchanged. Full output: `/tmp/design-review-vAwkPC/critique.txt`.
  All 144 manifest images inspected by the reviewer.
- **Verdict: FIXES.**
  1. reports-filtered: the page shows an active account filter while every figure outside Contributions stays
     unfiltered (the prototype note says so). Fix: draw the filtered page truthfully, or don't show a global filter.
  2. Version A Timeline: the Contributions heading has the tag but not the section's Put in / Taken out sums
     (confirmed decision 4). Fix: add them to A's Timeline heading at both widths.
  3. The two independent decisions are coupled (A = in-table + compact rows; B = own card + per-contribution
     cards). Reviewer asks for the missing combinations. **Maker's answer (not fixed):** design-feature step 4
     says not to add versions to separate independent decisions; step 6 asks each decision as its own question
     and combines Robert's picks into one version. Robert can judge Reports and Settings separately because they
     are separate pages.
- Fixes made in one batch: (1) reports-filtered now uses a real capture of Reports filtered to Jane's Brokerage
  (fresh sample-data launch `/tmp/ledger-evidence-LFnipD`, cleaned up), plus the brokerage contribution rows in its
  Transactions list; (2) A's Timeline heading shows Put in / Taken out (right-aligned on desktop, a line under the
  label on phone).
- Run 2 (fixes-only re-check), 2026-10-19: same maker, reviewer, routing and command shape, evidence
  `/tmp/design-review-pMhjYf/versions` (144 images). Exit 0, worktree unchanged. Output:
  `/tmp/design-review-pMhjYf/critique.txt`. **Verdict: PASS**: fixes 1 and 2 resolved; item 3 resolved by the
  recorded process answer; no regressions.

## Comments and changes
| ID / source | Version / element | Original note | Agreed change and verification | Resolved |
| --- | --- | --- | --- | --- |
| herdr, 2026-10-19 | Decisions 1–4 | Picks: Reports B, Settings A, drill OK, new elements OK | Combined version built and checked (see Choice) | 2026-10-19 |

No Open Design comments were left (`design.ts comments`: none open).

## Experiment
None. No real-site experiment was needed.

## Open items
None affecting the approved scope.

## Build handoff
Merged folder/revision is the feature authority; DESIGN.md/live site govern site-wide
look. Reconcile issues and paused branches in prep before marking ready. Without a
conductor, the design session owns that follow-up. Later revisions use new issues/PRs.
