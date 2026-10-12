# Design decisions: Phone, part 2 (sheets, touch targets, rows)

- Design issue: #226; covered build issues: #228, #229, #230
- Revision: 1; replaces: none
- Maker: claude-bridge/claude-opus-5-5 (Claude Opus 5.5), both design sessions

## Choice and approval
Robert picked Version A on every decision (herdr, this tab, 2026-10-11), so A is the chosen
version as it stands; no combined version is needed.

| # | Decision | Options (version) | Robert's pick and why |
| --- | --- | --- | --- |
| V1 | Transaction, Review and Recurring detail on phones | a/c: bottom sheet; b: full page with back arrow | A/C sheet: "A/C, agreed." (matches every other phone form, keeps the list in place) |
| V2 | Filters and Date on phones | a: bottom sheets, tabs/presets wrap; b/c: fitted pop-ups with edge fade and chevron | A: "I agree, I like A." |
| V3 | What gives way in a narrow row | a: "•• 4417"; b: account capped at 40%; c: account leaves the row | A: "I like version A." |
| V4 | Pinned Transactions and Review toolbars | a: one 44px row; b: hides on scroll, Approve all in app bar; c: only search pinned | A: "I like A." |

Robert's confirmation (herdr, this tab, 2026-10-11): "A is approved, drop the others." This
authorizes the PR. Design PR: use the linked PR on the design issue once created; the session adds
that link there after opening it. Only Robert merging that PR approves it for building;
chat approval, a critique PASS and a closed/unmerged PR do not.

## Alternatives
| Version | What differs / why rejected or chosen | Only this version had (lost) | Robert's OK to drop | Evidence |
| --- | --- | --- | --- | --- |
| a | Chosen: Robert's pick on V1–V4 | Kept as `index.html` | n/a | [All-version manifest](screenshots/all/manifest.json), `screenshots/all/a-*.png` |
| b | Rejected: Robert chose A on V1, V2, V3 and V4 | Full-page detail with a back arrow; account text capped at 40% of a row; toolbar that hides on scroll; Approve all in the app bar; fitted Filters/Date pop-ups with edge fade and chevron (shared with c) | "A is approved, drop the others." (herdr, this tab, 2026-10-11), given after this list | [All-version manifest](screenshots/all/manifest.json), `screenshots/all/b-*.png` |
| c | Rejected: Robert chose A on V2, V3 and V4 (V1 sheet is shared with A) | No account text in narrow rows; only search pinned above the list; fitted Filters/Date pop-ups with edge fade and chevron (shared with b) | Same message as b | [All-version manifest](screenshots/all/manifest.json), `screenshots/all/c-*.png` |

A version is removed, replaced or left out at freeze only after Robert confirms what it
alone had can go.

All-version captures were completed and inspected before pruning versions/. Approved
state × theme × width evidence: [manifest](screenshots/approved/manifest.json).
All-version capture: 336 images (3 versions × 28 states × 2 themes × 2 widths), manifest
complete, every image opened before `versions/` was removed. Approved capture: 112 images
(28 states × 2 themes × 2 widths), manifest complete, every image opened (phone as contact
sheets of all states in both themes, desktop likewise). The approved images match the inspected
`a-*` images byte for byte except (1) the six Settings desktop images, after the freeze fix
below, and (2) `reports-list-more`, whose loading spinner is animated, so each capture catches a
different frame. Offline proof for `index.html` after the fix: app stopped, headless Chrome with a
dead proxy, all host names unresolvable and a network log; all 28 states selected, then Dark and
Tap areas, each updating the page, URL and markers (`states 28`, no failures). The only network
attempts in the log were Chrome's own update/account services, all failed. Capture limitation:
the rejected versions' Settings desktop images still show the old sidebar highlight (see below).

## Versions and offline proof (before critique, 2026-10-11)
Versions a, b and c are generated from the captured hosts (brief "Host snapshot") by a build
script outside the repo; 28 states × light/dark × 390/1440 = 336 captures via
`design.ts shots` (manifest checked: 336 entries, every version × state × theme × width).
Maker inspection: every phone state in all three versions and both themes; Version A's desktop
states in both themes (B and C desktop differ only by the prototype bar's version label).
Automated phone check in all 84 version × state pairs: no tappable control under 44px, and no
two tap areas overlap except (a) rows partly scrolled under a pinned sheet footer, which are
clipped there, and (b) the date field's calendar icon inside its field, as the app has today.
Role check by content: Everyday member detail has no "Delete transaction"; View-only Review
detail has no "Mark reviewed"; View-only Review list has no "Approve all".

Offline proof (versions): app stopped; headless Chrome with a dead proxy and all host names
unresolvable, network log on. In each version every one of the 28 states was selected from the
State control, then Dark from Theme and the Tap areas box: each change updated the page, the
URL (`?state=…&theme=…`) and `data-state`/`data-theme`. The files contain no web addresses
and carry `default-src 'none'`; the only network attempts in the log were Chrome's own
update/account services, all failed.

## Independent critique
- 2026-10-11. Maker claude-bridge/claude-opus-5-5; reviewer openai/gpt-5.6-terra, thinking medium
  (routed with `node /git/maestro/routing/route.ts role checker --maker claude-bridge/claude-opus-5-5`).
- Command: `node /git/maestro/scripts/read-only-run.ts <worktree> review
  /git/maestro/skills/design-feature/reviewer-prompt.md "Design: <folder>. Images and manifest:
  /tmp/design-review-SJp0g4/versions. Maker: claude-bridge/claude-opus-5-5. …" -- --model
  openai/gpt-5.6-terra --thinking medium` (exit 0; worktree unchanged).
- Evidence: 336 images and manifest in `/tmp/design-review-SJp0g4/versions`; all opened by the reviewer.
- Verdict: **FIXES**, one item. 1. `decisions.md` "Open items" said none while V1–V4 await Robert.
  Fixed: Open items now lists V1–V4 as awaiting his separate choices; choice table left unfilled.
- Fixes-only re-check (same model and launcher, 2026-10-11): **PASS** for fix 1. Final verdict: PASS.
- Reviewer's other notes: versions differ in interaction, not decoration; existing look kept; roles and
  edge cases covered; desktop unchanged outside the stated changes; sample data only.

## Comments and changes
| ID / source | Version / element | Original note | Agreed change and verification | Resolved |
| --- | --- | --- | --- | --- |
| Open Design | n/a | No comments were left in Open Design | n/a | n/a |
| Maker, at freeze (2026-10-11) | `index.html`, Settings states, desktop sidebar | The prototype left "Transactions" highlighted on Settings pages; the app highlights nothing there (Settings has no sidebar entry, `Sidebar.tsx`) | Prototype script now clears the highlight when a page has no sidebar entry. Regenerated file differs from the approved one only in that script; re-capture changed only the six Settings desktop images, inspected. Matches today's app, so no new behaviour and no repeat critique | Done 2026-10-11 |

## Experiment
None. No real-site experiment was needed. Code reuse: none authorized.

## Open items
None affecting the approved scope.

## Build handoff
Merged folder/revision is the feature authority; DESIGN.md/live site govern site-wide
look. Reconcile issues and paused branches in prep before marking ready. Without a
conductor, the design session owns that follow-up. Later revisions use new issues/PRs.
