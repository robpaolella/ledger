# Handoff: design #231 (Account detail filters), 2026-10-11

Delete this file before the design PR.

## Decisions
All in brief.md "Confirmed decisions" 1–4 (Robert confirmed the brief: "Confirmed.").

## Progress (design-feature skill steps)
- Step 1 done: issue #231 created (in-progress, risk:low, tier:hard); Dispatch comment posted
  (base feature/platform-retheme, folder /git/ledger-worktrees/docs-231-design-account-filters);
  #213 blocked by #231, stays status:needs-design. Branch has no upstream yet (unset on purpose).
- Step 2 done: interview and brief.
- Step 3 nearly done: host captured and app cleaned up; offline screenshots saved. Still to do:
  open and compare live-*.png against offline-*.png (all four), then copy
  `/tmp/ledger-evidence-J4PXt4/page.html` to `design/231-account-filters/host.html`.
- Evidence folder (outside git): `/tmp/ledger-evidence-J4PXt4`
  - page.html + page-{light,dark}-{390,1440}.html (editable host), live-*.png, offline-*.png
  - txfilter-dark-{390,1440}.html/.png, txdate-dark-{390,1440}.html/.png: real Transactions
    filter panel and date range, to lift markup for the versions
  - txns.json: the account's 330 sample transactions [date, merchant, amount, group, sub,
    type, logoPath]; cats.json: 57 categories [id, group, sub, type]; logos/: merchant
    logos (720 KB total; inline only the ones a state shows)
- design.json and decisions.md are still the untouched templates.

## Next step
Step 4: build versions on the host. Plan:
- a: controls in the page header (desktop: search icon, Date, Filters with count badge,
  "Clear", like Transactions; phone: search field + filter icon, date chip, as the
  Transactions phone toolbar), active filters shown only by the badge/count line.
- b: controls on the Transactions card header (title + count left; search, Date, Filters
  right; phone: same row inside the card), plus a plain summary line of the active
  filters under the card header.
- Independent decisions to ask Robert separately: (1) where the controls sit, (2) how
  active filters show.
- States: default, filters-open, date-open, filtered, many-matches, no-match,
  search-no-match, no-transactions, long-names, loading, error. Themes light, dark.
Then steps 5 (critique) and 6 (show Robert in Open Design).

## Next session
Claude Opus 5.5, medium thinking (`node /git/maestro/routing/route.ts role design-feature`).
Start in the ledger herdr workspace, in this tab's place, in
/git/ledger-worktrees/docs-231-design-account-filters:
`pi --model claude-bridge/claude-opus-5-5 --thinking medium`, with the prompt: "Read
/git/maestro/skills/design-feature/SKILL.md and design/231-account-filters/HANDOFF.md, then
continue design #231 with Robert from the next step."
