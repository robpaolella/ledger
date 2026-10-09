# Design decisions: Settings and permissions

- Design issue: #104; covered build issues: #105 (to be split after merge)
- Revision: 1; replaces: none
- Maker: claude-bridge/claude-opus-5-5 (Claude Opus 5.5), default thinking

## Approval
Robert approved version C on 2026-10-08 in this herdr tab. Asked "Before I freeze it, can I take
'looks good' as approved for version C?", he answered: "Yes." This authorizes the design PR only;
**only Robert merging that PR approves the design for building**. Design PR: see the
`## Design PR` comment on #104.

## Versions and the decisions they differ on
| # | Decision | Version A | Version B |
| --- | --- | --- | --- |
| 1 | Where automatic behaviour lives | Each in its subject's home: daily sync in Bank sync, Rules beside Merchants, AI/Amazon/benchmarks in Optional extras (Admin) | One "Automatic" page: daily sync, Rules, Optional extras and a pointer to your alerts; Bank sync keeps only connections |
| 2 | How a member's access opens on desktop | Inline: each member row expands "Access: Everyday" into the presets and Customize | Side panel: rows open a person on the right with role, access, sign-in and edit/delete |

Phones are identical in both: the Settings menu list, then a panel; people open in a bottom sheet.

## Choice and approval
Robert's picks (2026-10-08, herdr tab; numbering continues the interview):

| # | Decision | Options (version) | Robert's pick and why |
| --- | --- | --- | --- |
| 11 | Where automatic behaviour lives | A: each in its home; B: one Automatic page | A: "I agree, I like A better." |
| 12 | How a member opens on desktop | A: inline expand; B: side panel; recommended: B's behaviour in the existing pop-up window (`ResponsiveModal`) | Existing pop-up window: "That sounds fine to me." |
| 13 | Bank-sync alert wording | "You'll always hear when bank sync keeps failing or needs reconnecting, so it never stops quietly." | "That's also fine." |
| 14 | Rate-limit wording | "SimpleFIN's daily request limit was reached. Trying again at 9:30 am" | "Yes." |
| 15 | Sync-failure alerts for people without Bank sync | Send only to people who can see Bank sync; their Notifications page drops that line | "Yes, agreed." |
| 16 | Build scope | Keep the saved daily-sync switch, per-person over-budget choice, last-sync count and retry times, Amazon last match in #105 | "Agreed." |

Combined into version C (`versions/c.html`): A's homes and menu, people open in the existing
pop-up window on desktop and a bottom sheet on phones, with 13 and 15 applied. C adds no behaviour
beyond A and B (B's person view, presented in an existing component), so the critique is not repeated.

## Alternatives
| Version | What differs / why rejected or chosen | Only this version had (lost) | Robert's OK to drop | Evidence |
| --- | --- | --- | --- | --- |
| a | Each in its home; member access expands inline on desktop. Its homes were chosen (decision 11); the inline expand was not (decision 12) | Seeing and changing several members' access inline on desktop without opening anything | 17: "Sure." (2026-10-08) | [manifest](screenshots/all/manifest.json), `screenshots/all/a-*.png` |
| b | One "Automatic" page; desktop side panel. Rejected on decision 11 (one obvious home); its person view was kept but moved into the existing pop-up window | The single Automatic page listing every automatic behaviour; the desktop side panel (a new element) | 17: "Sure." (2026-10-08) | [manifest](screenshots/all/manifest.json), `screenshots/all/b-*.png` |
| c | Chosen: A's homes and menu, B's person view in the existing `ResponsiveModal`/`BottomSheet`, decisions 13 and 15 applied | n/a | n/a | `screenshots/all/c-*.png`; approved copy in `screenshots/approved/` |

All-version captures (300 images: 3 versions × 25 states × 2 themes × 2 widths, manifest complete,
every pixel width equals its viewport) were taken and inspected before `versions/` was removed.
Approved evidence: [manifest](screenshots/approved/manifest.json), 100 images (25 states × 2 themes
× 2 widths); 99 are byte-identical to the inspected C captures, and the remaining one
(`approved-loading-light-390.png`) differs only in the spinner's position and was opened. (Superseded by the 116-image re-capture after the pre-PR review; see below.)

Final offline proof of `index.html` (2026-10-08): fresh browser with network offline; all 50 (now 58)
state × theme URLs report matching `data-state`/`data-theme`; network log shows only `file:` and
`data:`; no console errors. The host snapshot (`host.html`) was removed after this proof; its
capture and offline check are recorded in `brief.md`.

## Independent critique
Robert approved same-company review while OpenAI is unavailable ("Yes. I approve all reviews by
Claude while OpenAI is unavailable."). Route: `node /git/maestro/routing/route.ts role checker
--maker claude-bridge/claude-opus-5-5 --approved-same-vendor` → Claude Sonnet 5.5, high thinking.

**Round 1 (2026-10-08): FIXES, 12 items.** Command:
`node /git/maestro/scripts/read-only-run.ts "$PWD" review /git/maestro/skills/design-feature/reviewer-prompt.md "<folder, evidence, maker>" -- --model claude-bridge/claude-sonnet-5-5 --thinking high`;
evidence `/tmp/design-review-UroWDa/versions` (144 images). Fixed in one batch:

1. People detail never pictured → new states `user-switches` and `user-actions` (long-named member, Customize open, sheet/panel scrolled).
2. Rules below stated size, no long-list answer → 40 rules; first 25 then "Show all 40 rules" (B: 5 on the Automatic page); `rules` shows a Delete in its confirm step; new `rules-search` (no match).
3. Phone rule rows truncated → wrap to two lines on phones.
4. Pattern (regex) rules missing → added "Description matches the pattern …" rows and "Ledger checks these in order and uses the first one that matches."
5. Phone touch targets → new row buttons, confirm buttons, role select and Customize get a 44px minimum on phones. The shared `Switch` keeps its look but gets an invisible 44px tap area on phones.
6. B pointer line hard-coded → computed from state; new states `daily-problems`, `daily-member`, `daily-paused` show the daily sync card (A: Bank sync; B: Automatic); B `bank-paused` now shows Bank sync with paused pills.
7. Rate-limit failure → added draft line "SimpleFIN's daily request limit was reached. Trying again at 9:30 am" (wording for Robert).
8. Extras only one state → new `extras-on`: AI off with a failed test ("Couldn't reach the Ollama server at that address."), Amazon and benchmarks set up, each with a switch.
9. Deep link for people without Bank sync → open question for Robert (see Open items).
10. Offline proof for versions → recorded below; "Prototype A/B" now shows on phones; dialogs move focus in, return it to the row and close on Escape.
11. New-elements list → B's desktop side panel added; phone person view relabelled as the existing BottomSheet.
12. "2FA" vs "Two-step sign-in" → "Two-step on" / "Reset two-step".

**Re-check (2026-10-08): FIXES, 3 small residuals** (items 1–4, 7–9, 11, 12 pass). After the
single allowed re-check, fixed without another review round and reported to Robert:
- 5: the brief promised 44px phone targets but the Switch was 26px → Switch tap area extended to 44px on phones.
- 6: the retry time was fixed at 6:45 am even for a member who can't see that connection → it now uses the earliest retry among the connections that person can see (Sam reads 9:30 am).
- 10: the proof record miscounted URLs → corrected to 100.

Offline proof for versions (2026-10-08): fresh browser session with `emulate --network Offline`;
all 100 version × state × theme URLs (2 × 25 × 2, at the default window size; widths are covered by the 200-image capture) report matching `data-state`/`data-theme` markers and the
dark class; network logs show only `file:` and `data:`; no console errors; a page fetch to an
owned local server fails. The CSP allows only inline script (`default-src 'none'`).

## Comments and changes
| ID / source | Version / element | Original note | Agreed change and verification | Resolved |
| --- | --- | --- | --- | --- |
| Open Design | all | none left (`design.ts comments` → "No open comments.") | n/a | n/a |
| herdr, decisions 11–16 | versions A/B | Robert's picks (table above) | Combined into C; C states inspected at both widths and themes | 2026-10-08 |
| herdr, decision 14 follow-up | rate-limit line | "How does that limit get decided? Simple FIN will notify Ledger?" | Answered: SimpleFIN refuses requests past ~24/day per connection (HTTP 429); Ledger already classifies that as a rate-limit failure. Build note: the shown retry time must be the real next retry from the backoff schedule | 2026-10-08 |
| herdr, "What should I check on C?" | C | Robert reviewed C | "Looks good." then "Yes." to approval | 2026-10-08 |

## Pre-PR review (2026-10-08)
General PR review per the ship/review skills: Claude Sonnet 5.5, high thinking, same-company under
Robert's approval (`read-only-run.ts . review /git/maestro/skills/review/reviewer-prompt.md …`).
Verdict: not ready, 2 blocking, 5 worth fixing, 3 nits. After approval, Robert agreed the changes
(2026-10-08, herdr: "19. Agreed. 20. Yes. 21. Agreed. 22. Agreed."):

1. Blocking: no "gave up for the day" status → decision 19 wording; new states `daily-gave-up`, `daily-off-failing`.
2. Blocking: not all 12 switches pictured → new states `user-switches-more` (Finance group) and `user-everyday-switches` (ticked switches).
3. Pending preset not visible → the picked preset is outlined with "Picked. Confirm below to apply."
4. Sample count mismatch → the "Accounts from SimpleFIN" count is now derived from the connections shown.
5. Benchmarks stored data → added to the build notes.
6. PRODUCT.md vs decision 1 → one line added to PRODUCT.md "Settings rules" (decision 21).
7. Loading/error only on Users → accepted (decision 22).
8. Nits: brief numbering fixed; the gap under Customize was an empty element, removed (the rest is the 44px phone tap height); "Couldn't load your settings" kept.

Approved evidence was re-captured: 116 images (29 states × 2 themes × 2 widths), all inspected via
contact sheets; existing states differ from the first capture only where the fixes apply and in the
prototype bar's state selector width. `screenshots/all/` is unchanged: it is the pre-pruning record
of A, B and C and predates the four new states.

## Experiment
None.

## Open items
None affecting the approved scope. Build notes for #105 (from decisions 15 and 16):
- Sync-failure alerts go only to people who can see Bank sync (`simplefin.manage` or
  `import.bank_sync`, or owner/admin); the alert's link should open Bank sync
  (`/settings?panel=bank`), replacing the old `?tab=banksync` target.
- New stored data: a saved daily-sync on/off (replacing the `DISABLE_DAILY_SYNC`-only switch),
  each person's over-budget alert choice, the last sync's time and new-transaction count,
  per-connection next retry time, and Amazon's last match. Migrations must work on existing
  databases.
- Investment benchmarks: a stored on/off and the last price update time (today only `TIINGO_TOKEN`
  controls it). Amazon's on/off already exists (`amazon.enabled`).
- Daily sync shows when today's retries have run out; per-connection "gave up" needs storing too.
- Member permissions on the server are unchanged; only names and grouping change.
- The sample times, counts and names are illustrative; the build shows real values.

## Build handoff
Merged folder/revision is the feature authority; DESIGN.md/live site govern site-wide
look. Reconcile issues and paused branches in prep before marking ready. Without a
conductor, the design session owns that follow-up. Later revisions use new issues/PRs.
