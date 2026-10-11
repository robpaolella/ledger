# Design decisions: phone tables and forms

- Design issue: #109; covered build issues: #110, #207, #227
- Revision: 1; replaces: none
- Maker: claude-bridge/claude-opus-5-5 (Anthropic), medium thinking

## Choice and approval
**Chosen: version A** (one month at a time, with a year or range total column). The versions
differed on one decision only (13); 19 was raised from Robert's comment on A. Decisions 1–12
are recorded in `brief.md`; 14–18 (wording) under Comments and changes.

| # | Decision | Options (version) | Robert's pick and why |
| --- | --- | --- | --- |
| 13 | 12-month layout on phones (Budget Year, Reports Timeline) | a: one month at a time with month arrows plus a year/range total column; b: totals only, tap a category for a month-tile grid; c: swipeable table with pinned names | **A**. Robert, herdr 2026-10-11: "I agree, version A is the best." |
| 19 | Month/Year selector on phones | a: keep it, Year labelled as the plan ("Planned · this month", columns "Oct" / "2026"); b: drop it on phones; c: keep it unchanged | **Keep the selector** (a, as now in version A). Robert, herdr 2026-10-11: "let's keep A. I see the annual column now, I like that." then "lets keep the Month/Year label as it is." |

Robert's confirmation, herdr 2026-10-11, answering "20. OK to drop B and C?" and "21. Is the
design approved?": "20. Yes. 21. Approved." The design PR is linked from the design issue
(`## Design PR` comment). Only Robert merging that PR approves the design for building; chat
approval, a critique PASS and a closed or unmerged PR do not.

## Alternatives
| Version | What differs / why rejected or chosen | Only this version had (lost) | Robert's OK to drop | Evidence |
| --- | --- | --- | --- | --- |
| a | Chosen: every category stays on screen with the month and the year/range total; no sideways scrolling; matches the desktop rows | — (kept as `index.html`) | — | [All-version manifest](screenshots/all/manifest.json), `screenshots/all/a-*.png` |
| b | Rejected: totals only; months open as a tile grid per category, so one month across all categories can't be seen | Total-only rows with a tap-to-open month-tile grid | Robert, herdr 2026-10-11: "20. Yes." | `screenshots/all/b-budget-year-*.png`, `b-timeline*-*.png` |
| c | Rejected: the only version that scrolls sideways, against the phone rule; narrow pinned names wrap; total only at the end of the swipe | Swipeable month table with pinned category names | Robert, herdr 2026-10-11: "20. Yes." | `screenshots/all/c-budget-year-*.png`, `c-timeline*-*.png` |

A version is removed, replaced or left out at freeze only after Robert confirms what it
alone had can go.

All-version captures were completed and inspected before pruning versions/: 312 images
(3 versions × 26 states × 2 themes × 390/1440), manifest checked complete against
`design.json`. Inspected as per-state contact sheets (every state at both widths, both themes;
B and C alongside A for the Budget Year, Timeline, loading and error states, where they differ)
plus individual desktop images. Approved evidence: 104 images (26 states × 2 themes × 2 widths),
[manifest](screenshots/approved/manifest.json) checked complete; every approved image is
byte-identical to the inspected `a-*` capture of the same entry.

Offline proof of `index.html` (2026-10-11): headless Chrome with network offline loaded all 104
state × theme × width pages from `file://` with no page errors, no blank screens, no sideways
overflow and no network requests; the six-box code input passed its keyboard checks (typing,
Backspace, arrows, paste) in twofa-key, twofa-error and twofa-required. Capture limitation:
full-page images show pinned bars (Import Back/Next, the selection bar, the drill-down bar)
mid-image, because they stick to the bottom of the first screen.

## Independent critique
Maker: claude-bridge/claude-opus-5-5 (Anthropic). Reviewer: openai/gpt-5.6-terra, medium
thinking (`route.ts role checker`). Command: `node /git/maestro/scripts/read-only-run.ts
<worktree> review /git/maestro/skills/design-feature/reviewer-prompt.md "Design: <folder>.
Images and manifest: /tmp/design-review-2Wblzo/versions. Maker: claude-bridge/claude-opus-5-5."
-- --model openai/gpt-5.6-terra --thinking medium`. Evidence: 312 images (3 versions × 26
states × 2 themes × 2 widths), all opened by the reviewer. Verdict 2026-10-11: **FIXES**.

1. The five maker-drafted wordings (listed below) need Robert's decision before he picks a
   version. Fix: asked Robert (decisions 14–18); he agreed with every recommendation, so four
   stay and the required-setup subtitle reverts to today's app wording. Recorded under
   Comments and changes.
2. The prototype's six-box code input lacked `TotpCodeInput`'s paste, Backspace and arrow-key
   behaviour (DESIGN.md "Six-box code input"). Fix: ported the same contract (auto-advance,
   multi-digit fill, paste from box 1, Backspace clears or moves back, Left/Right arrows,
   select on focus; Verify enables only with six digits). Proof, offline file pages in headless
   Chrome: every version × twofa-key 390, twofa-error 1440, twofa-required 390, all checks
   passed, no page errors; full 312-page smoke and class checks re-run clean.

Re-check (fixes only), same reviewer and command, evidence /tmp/design-review-noMpfP/versions,
2026-10-11: **PASS** on both fixes (12 twofa-required captures inspected; keyboard contract read
from the HTML against `TotpCodeInput.tsx` plus the recorded offline proof).

Notes given to the reviewer:
- The versions differ on one decision only: the 12-month pattern on phones for Budget Year
  and Reports Timeline (brief decision 13). Every other state is the same in A, B and C,
  and desktop matches today's app in all three.
- Pinned bars (Import Back/Next, the selection bar, the drill-down bar) appear mid-image in
  full-page captures because they stick to the bottom of the first screen.
- Wording drafted by the maker, to check (since decided, see Comments and changes):
  - Bulk delete sheet: "The 3 selected transactions ($142.50) will be removed from Ledger. You can't undo this."
  - Required-setup subtitle: "Your household requires a second sign-in step for admins. Set it up to continue."
  - Import step 1 on phones: "Choose your CSV file / Download it from your bank's website first."
  - Merge row: "Move its 93 transactions to another merchant, then delete Larkspindle Finance."
  - Security card copy: "Scan a QR code..." changed to "Add Ledger to an authenticator app...".

## Comments and changes
| ID / source | Version / element | Original note | Agreed change and verification | Resolved |
| --- | --- | --- | --- | --- |
| herdr, decision 14 | All / bulk-delete sheet (phone) | "The 3 selected transactions ($142.50) will be removed from Ledger. You can't undo this." | Robert: "I agree with all of your wording" (2026-10-11). Kept. | 2026-10-11 |
| herdr, decision 15 | All / twofa-required subtitle | Draft "Your household requires a second sign-in step for admins. Set it up to continue." | Robert agreed to use today's app wording: "Your administrator requires a second sign-in step for your account." Changed in all versions. | 2026-10-11 |
| herdr, decision 16 | All / import-upload (phone) | "Choose your CSV file / Download it from your bank's website first." | Robert agreed. Kept. | 2026-10-11 |
| herdr, decision 17 | All / merchant-edit merge row (phone) | "Move its 93 transactions to another merchant, then delete Larkspindle Finance." | Robert agreed. Kept. | 2026-10-11 |
| herdr, decision 18 | All / Security two-factor card | "Scan a QR code…" becomes "Add Ledger to an authenticator app…" | Robert agreed. Kept. | 2026-10-11 |
| Open Design cmt_23077cb2 (pin 1) | a.html / Budget Month-Year selector (phone) | "It's currently set to year, but the design for mobile only shows one month at a time. Is there a point in having this selector at all now on mobile?" | Decision 19: selector kept on phones; version A's Year view labels the bar "Planned · this month" and the columns "Oct" / "2026" so it reads as the plan. Checked at 390 in both themes; smoke test re-run clean. | 2026-10-11 resolved |

## Experiment
None.

## Open items
None affecting the approved scope. Name truncation in transaction rows on phones stays as
today; it belongs to part 2 (#226).

## Build handoff
The merged folder and revision are the feature authority; DESIGN.md and the live site govern
the site-wide look. Reconcile issues and paused branches in prep before marking ready. The
conductor owns that follow-up. Later revisions use new issues and PRs.

Notes for the builds:
- Reports Timeline on phones uses the same pattern as Budget Year (A): a month or week switcher
  bar above the table and a range total column. Desktop is unchanged.
- Budget Year on phones keeps the Month/Year selector; its bar reads "Planned · this month" (or
  "Planned · past month, locked") and the columns read the month and the year, e.g. "Oct" / "2026".
- The prototype's six-box code input mirrors `TotpCodeInput`; reuse that component.
- The required two-factor setup page keeps today's subtitle.
