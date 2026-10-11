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
| 1 | Where the search, date and filter controls sit | a: page header (phone: sticky toolbar under the app bar, above the balance chart); b: Transactions card header (phone: inside the card, next to the list) | b. "2. Agreed, B." (2026-10-11): the controls sit beside the list they change |
| 2 | How active filters show | a: Filters badge, Date label and count line only; b: the same plus a summary line under the card header ("Dining/Eating Out, Fuel · Last month") with Clear | b. "3. B." (2026-10-11): search folds to an icon on desktop, so the line shows why the list is shorter |
| 3 | Count wording when every match fits | "11 of 11 matching" (both versions today) or "11 matching" | "11 matching"; "14 of 31 matching" only when matches exceed the 14 rows. "4. Agreed." (2026-10-11). Applied to both versions and re-inspected (b filtered, light 1440 and dark 390) |

Build details shared by both versions (not choices): the filter panel is Transactions'
`FilterPopover` without the Accounts tab; the date control is `DateRangePopover`; on phones
both popovers are fixed below the app bar as on Transactions. In version b the card clips
its contents and is about 690 px wide, so on desktop its popovers anchor to the card's
left edge and render outside the card, rather than right-anchored (an 820 px panel would
run over the sidebar). Apply shows the existing spinner in the list area while the list
reloads. No new kind of element: b's summary line reuses the card's row, text and
text-button styles; Robert is asked about it as decision 2.

Chosen: version b. Robert: "6. Approved." (2026-10-11, herdr), authorizing the PR.
Only his merge approves it for building. Design PR: use the linked PR on the design issue once created; the session adds
that link there after opening it. Only Robert merging that PR approves it for building;
chat approval, a critique PASS and a closed/unmerged PR do not.

## Alternatives
| Version | What differs / why rejected or chosen | Only this version had (lost) | Robert's OK to drop | Evidence |
| --- | --- | --- | --- | --- |
| a | Controls in the page header; no summary line. Not chosen: Robert picked b on decisions 2 and 3 | Controls in the page header (on phones a toolbar pinned under the app bar while scrolling); a card with no summary row, so the list starts slightly higher | "5. Okay to drop A." (2026-10-11) | [All-version manifest](screenshots/all/manifest.json), `a-*` images |
| b | Chosen: controls on the Transactions card, summary line under its header, "11 matching" | — | — | [All-version manifest](screenshots/all/manifest.json), `b-*` images |

A version is removed, replaced or left out at freeze only after Robert confirms what it
alone had can go.

All-version captures were completed and inspected before pruning versions/. Approved
state × theme × width evidence: [manifest](screenshots/approved/manifest.json).
Record actual counts, inspected image paths, offline proof and any capture limitations.

## Independent critique
- Maker: claude-bridge/claude-opus-5-5 (Anthropic). Reviewer: GPT-5.6 Terra (OpenAI),
  medium thinking, routed with `node /git/maestro/routing/route.ts role checker --maker
  claude-bridge/claude-opus-5-5`.
- Command: `node /git/maestro/scripts/read-only-run.ts "$PWD" review
  /git/maestro/skills/design-feature/reviewer-prompt.md "Design: <folder>. Images and
  manifest: /tmp/design-review-GbpdIg/versions. Maker: claude-bridge/claude-opus-5-5." --
  --model openai/gpt-5.6-terra --thinking medium` (exit 0, folder unchanged).
- Evidence: 88 of 88 images (2 versions × 11 states × 2 themes × 390/1440), all opened by
  the reviewer and by the maker.
- Verdict 2026-10-11: FIXES, one finding.
  1. The no-transactions state keeps "View all in Transactions", while the brief's state
     table lists its actions as "—". The live page shows the link in every state today,
     and #213 does not ask to remove it, so the prototypes kept it. Taken to Robert before
     showing the designs. Resolved 2026-10-11: Robert agreed to keep the link as today
     ("1. Agreed."); brief.md's state table now says so, and hiding it on empty accounts
     went to backlog.md as a separate change. No version changed, so no re-check needed.
- Not findings: the reviewer chose neither version, noted B's summary line costs vertical
  space on phone and A's controls sit apart from the list on desktop (both are decision
  1–2 trade-offs), and that behaviour (focus, Escape, URL state, retry) needs browser
  verification in the build.

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
