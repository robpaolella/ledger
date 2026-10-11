# Design decisions: phone tables and forms

- Design issue: #109; covered build issues: #110, #207, #227
- Revision: 1; replaces: none
- Maker: claude-bridge/claude-opus-5-5 (Anthropic), medium thinking

## Choice and approval
Chosen version and why. When versions differed on more than one independent decision,
Robert's pick for each, asked as its own numbered question; the chosen version combines
them, even if no single version had all of them:

| # | Decision | Options (version) | Robert's pick and why |
| --- | --- | --- | --- |
| 1 | <e.g. how names show> | <a: ...; b: ...> | <pick, reference/date> |

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
Pending (step 5).

Notes for the reviewer:
- The versions differ on one decision only: the 12-month pattern on phones for Budget Year
  and Reports Timeline (brief decision 13). Every other state is the same in A, B and C,
  and desktop matches today's app in all three.
- Pinned bars (Import Back/Next, the selection bar, the drill-down bar) appear mid-image in
  full-page captures because they stick to the bottom of the first screen.
- Wording drafted by the maker, not yet confirmed by Robert, to check:
  - Bulk delete sheet: "The 3 selected transactions ($142.50) will be removed from Ledger. You can't undo this."
  - Required-setup subtitle: "Your household requires a second sign-in step for admins. Set it up to continue."
  - Import step 1 on phones: "Choose your CSV file / Download it from your bank's website first."
  - Merge row: "Move its 93 transactions to another merchant, then delete Larkspindle Finance."
  - Security card copy: "Scan a QR code..." changed to "Add Ledger to an authenticator app...".

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
