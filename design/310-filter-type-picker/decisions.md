# Design decisions: phone Filters sheet type picker and pinned search

- Design issue: #310; covered build issues: #307
- Revision: 1; replaces: none
- Maker: claude-bridge/claude-opus-5-5 (Claude Opus 5.5), thinking low

## Versions and what they differ on
One independent decision: **how the phone sheet chooses a filter type.** Everything else
(pinned search + "N filters selected" + picker, search hidden on Amount/Other, count
badges, checklist rows, selected-filters summary, footer, unchanged desktop pop-up) is
the same in all three.

| Version | Type picker |
| --- | --- |
| a | One row of the existing pill tabs that scrolls sideways, count badge on each, fade at the edge where more types sit |
| b | A full-width "Filter by: Categories ▾" button opening a menu of types with counts and a tick on the current one |
| c | Sheet opens on a list of types, each with a one-line summary of what's selected and a count; tapping one opens its list, with a back arrow in the title |

## Choice and approval
**Version B (dropdown)**, now `index.html`. One independent decision, asked as question 5:

| # | Decision | Options (version) | Robert's pick and why |
| --- | --- | --- | --- |
| 5 | How the phone sheet chooses a filter type | a: one scrolling row; b: dropdown; c: two-step list | b. Robert, 2026-10-12: "I think B is the best option. It just feels the cleanest and the most natural." |

Robert's confirmation, 2026-10-12 (questions 7 and 8): "7. Drop them both. 8. Approved."
That authorizes the PR. Design PR: see the `## Design PR` comment on #310. Only Robert merging
that PR approves it for building.

## Alternatives
| Version | What differs / why rejected or chosen | Only this version had (lost) | Robert's OK to drop | Evidence |
| --- | --- | --- | --- | --- |
| herdr, Robert 2026-10-12 | all / State control | "no matter which State I choose, nothing changes" | Couldn't reproduce at 390 (states switch). Likely the 1440 preview, where the desktop pop-up is the same in every state by design. Added a desktop-only note to the prototype bar: "Desktop pop-up is unchanged, so every state looks the same here. Switch to the 390 preview to see the states." Robert then chose without raising it again. | 2026-10-12, addressed |
| maker, at freeze | desktop view / sidebar logo | Logo gradient missing in light theme | The phone and desktop copies shared SVG ids; the desktop copy's ids are now suffixed `-d`. Desktop images recaptured. | 2026-10-12, fixed |
| a | Scrolling pill row; not chosen (types off the edge on Transactions) | Every type visible on the sheet at once; switch type in one tap without opening anything | "Drop them both", 2026-10-12 | [manifest](screenshots/all/manifest.json), `screenshots/all/a-*.png` |
| b | Dropdown; chosen | (kept) | n/a | `screenshots/all/b-*.png`, [approved](screenshots/approved/manifest.json) |
| c | Two-step list; not chosen (extra tap to switch type) | One-line summary under each type of what's selected | "Drop them both", 2026-10-12 | [manifest](screenshots/all/manifest.json), `screenshots/all/c-*.png` |

All-version captures (84 = 3 versions × 7 states × 2 themes × 2 widths) were completed and
checked before `versions/` was removed. The 42 phone images are byte-identical to the set the
maker and the independent reviewer inspected; the 42 desktop images changed only in the
prototype bar's note and a logo fix (see Comments and changes), and representative ones for
each version and theme were reopened. Approved: 28 images (7 states × 2 themes × 2 widths),
[manifest](screenshots/approved/manifest.json); all phone states inspected in both themes
across the review, desktop is the unchanged pop-up. `index.html` rechecked offline
(2026-10-12, network Offline, `file://`): state/theme from the URL, choosing Amount from the
menu hides the search, fonts load.

## Independent critique
- Reviewer: openai/gpt-5.6-terra, thinking medium (route `checker`; maker claude-bridge/claude-opus-5-5).
- Command: `node /git/maestro/scripts/read-only-run.ts <worktree> review /git/maestro/skills/design-feature/reviewer-prompt.md "<design folder, evidence, maker>" -- --model openai/gpt-5.6-terra --thinking medium`
- Evidence: 84 images + manifest from `design.ts shots` (`/tmp/design-review-hdQiOs/versions`).
- Verdict 2026-10-12: **FIXES**, one item. 1: version C has no pinned type picker inside a
  type's list (back arrow only), against confirmed decision 2. Fix: recorded C's exception in
  `brief.md` decision 2 (the extra tap is C's trade-off, shown to Robert in round 1); no
  prototype change.
- Fixes-only re-check 2026-10-12: **PASS** (finding 1 resolved; six C phone images re-inspected).

## Comments and changes
| ID / source | Version / element | Original note | Agreed change and verification | Resolved |
| --- | --- | --- | --- | --- |

## Experiment
None.

## Open items
None affecting the approved scope. For the build: the desktop pop-up stays as is; on
the Accounts page (one type) no picker is shown; the B menu closes with Escape or a tap
outside and moves focus back to its button.

## Build handoff
Merged folder/revision is the feature authority; DESIGN.md/live site govern site-wide
look. Reconcile #307 and paused branches in prep before marking it ready.
