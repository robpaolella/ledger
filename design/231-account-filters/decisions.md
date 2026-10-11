# Design decisions: Account detail transaction filters

- Design issue: #231; covered build issues: #213
- Revision: 1; replaces: none (or merged folder/revision)
- Maker: claude-bridge/claude-opus-5-5 (Anthropic), medium thinking

## Choice and approval
Chosen version and why. When versions differed on more than one independent decision,
Robert's pick for each, asked as its own numbered question; the chosen version combines
them, even if no single version had all of them:

| # | Decision | Options (version) | Robert's pick and why |
| --- | --- | --- | --- |
| 1 | Where the search, date and filter controls sit | a: page header (phone: sticky toolbar under the app bar, above the balance chart); b: Transactions card header (phone: inside the card, next to the list) | Pending (step 6) |
| 2 | How active filters show | a: Filters badge, Date label and count line only; b: the same plus a summary line under the card header ("Dining/Eating Out, Fuel · Last month") with Clear | Pending (step 6) |
| 3 | Count wording when every match fits | "11 of 11 matching" (both versions today) or "11 matching" | Pending (step 6) |

Build details shared by both versions (not choices): the filter panel is Transactions'
`FilterPopover` without the Accounts tab; the date control is `DateRangePopover`; on phones
both popovers are fixed below the app bar as on Transactions. In version b the card clips
its contents and is about 690 px wide, so on desktop its popovers anchor to the card's
left edge and render outside the card, rather than right-anchored (an 820 px panel would
run over the sidebar). Apply shows the existing spinner in the list area while the list
reloads. No new kind of element: b's summary line reuses the card's row, text and
text-button styles; Robert is asked about it as decision 2.

Robert's exact confirmation and date/reference authorizing the
PR. Design PR: use the linked PR on the design issue once created; the session adds
that link there after opening it. Only Robert merging that PR approves it for building;
chat approval, a critique PASS and a closed/unmerged PR do not.

## Alternatives
| Version | What differs / why rejected or chosen | Only this version had (lost) | Robert's OK to drop | Evidence |
| --- | --- | --- | --- | --- |
| a | <reason> | <features no kept version has, or none> | <his words, date/reference> | [All-version manifest](screenshots/all/manifest.json) and named images |

A version is removed, replaced or left out at freeze only after Robert confirms what it
alone had can go.

All-version captures were completed and inspected before pruning versions/. Approved
state × theme × width evidence: [manifest](screenshots/approved/manifest.json).
Record actual counts, inspected image paths, offline proof and any capture limitations.

## Independent critique
Maker and other-company reviewer, exact launch command, evidence path, verdict and date.
Numbered findings, fixes and the single fixes-only re-check. Retain the final verdict.

## Comments and changes
| ID / source | Version / element | Original note | Agreed change and verification | Resolved |
| --- | --- | --- | --- | --- |
| <Open Design ID or herdr reference> | <target> | <note> | <result> | <date/status> |

## Experiment
None, or Robert's permission, question, branch/preview, chosen behaviour, rejected
attempts, static-version updates and unmerged/closed experiment PR. Code reuse: forbidden
unless specific parts are explicitly authorized here. Keep the branch as a primary source.

## Open items
None affecting the approved scope. Preserve any deferred, out-of-scope questions explicitly.

## Build handoff
Merged folder/revision is the feature authority; DESIGN.md/live site govern site-wide
look. Reconcile issues and paused branches in prep before marking ready. Without a
conductor, the design session owns that follow-up. Later revisions use new issues/PRs.
