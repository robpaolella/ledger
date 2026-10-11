# Design: Account detail transaction filters

- Design issue: #231
- Revision: 1
- Replaces: none
- Source plan: build issue #213 (split from #101, Robert 2026-10-10)

## Job and audience
Someone in the household opens one account (a card, a checking account) to answer a
question about it: "what did we spend at Costco on this card last month?", "where did
that $480 charge come from?". Today the page shows the 14 most recent transactions and
a "Filters" button that only jumps to Transactions. Success: they narrow this account's
list on the page itself and see how many transactions match, and can still go to
Transactions with the same filters for the full list or edits.

Robert's reference: Monarch's filter panel (screenshot on #213), the same layout as
Ledger's existing Transactions filter panel.

## Covers
| Build issue (or planned slice) | Part of this feature | Out of scope |
| --- | --- | --- |
| #213 | Search, date range and the filter panel on Account detail; the list, count and empty states responding to them; "View all in Transactions" carrying the filters | Transactions page's own filters; the rest of #101's wording; editing transactions from Account detail |

## Boundaries and visual authority
- PRODUCT.md: Principles ("polishes and makes consistent what's there"), Money rules
  (display through `Money`), Safety and access. DESIGN.md and `packages/client/src/index.css`
  for the look.
- Host: `/accounts/:id` (`AccountDetailPage.tsx`). Reused as they are: the Transactions
  page's filter panel (`FilterPopover`) without its Accounts tab, its search control, its
  date range control (`DateRangePopover`), its "Clear" text button, `Button` outline style
  with the count badge, `ListRow` on phones.
- Must not change: the balance chart card, the Summary card ("Total transactions" stays the
  account's full total, not the filtered count), the Update balance window, the page
  header's breadcrumb, row layout and money display.
- No new kind of element is intended. If a version shows one, it is named in decisions.md
  for Robert's approval.

## States, themes and content
Sample account: "John's Visa (…7733)", a Chase credit card with 330 transactions in the
demo seed (Groceries 91, Dining 73, Personal Supplies 23, Fuel 19; merchants such as
Walmart, Target, Whole Foods, Costco, Publix, Chipotle). Synthetic demo-seed data only.

| State slug | Role / situation | Content range and exact wording | Actions / feedback |
| --- | --- | --- | --- |
| default | Any role, no filters | 14 rows; count "14 most recent" | Search, Date, Filters; "View all in Transactions" |
| filters-open | Filter panel open on Categories | Tabs: Categories, Merchants, Amount, Other; "N filters selected" | Clear / Cancel / Apply |
| date-open | Date range open | Same presets as Transactions | Apply / clear date |
| filtered | Two categories + "Last month" applied | 9 rows; count "9 of 9 matching" (or "14 of 52 matching" when over 14) | Filters badge "2"; "Clear" shown; link carries filters |
| many-matches | Amount filter matching more than 14 | 14 rows; "14 of 37 matching" | Link opens Transactions with the same filters |
| no-match | Filters match nothing | "No transactions match these filters" + Clear | Clear restores the default list |
| search-no-match | Search typed, nothing found | `Nothing matches “{search}”` (long search text truncates) | Clear restores the default list |
| no-transactions | Account with no transactions | "No transactions for this account." No search/date/filter controls | "View all in Transactions" stays, as today (Robert, 2026-10-11) |
| long-names | Long merchant and category names | 40+ character merchant, long category | Truncate with ellipsis, amounts never wrap |
| loading | List reloading after Apply | Existing spinner treatment in the list area | Controls stay usable |
| error | List failed to load | "Couldn't load transactions." + "Try again" | Retry reloads |

Roles: owner, admin and member see and use the filters identically. Member permissions
limit editing, and this list has no editing, so there is no locked or no-permission
state. The prototypes include a role note rather than three identical states.

Themes: light and dark. Widths: 390×844 (phone) and 1440×900 (desktop). Keyboard: every
control reachable by Tab, Escape closes the panel and date range, focus returns to the
button that opened it.

## Host snapshot and offline proof
- Source commit: `1262e55` on `feature/platform-retheme`; verify-ledger skill
  `.pi/skills/verify-ledger/SKILL.md`, launch date 2026-10-11 (demo seed shifted to it).
- Commands: `npm ci`; `node .pi/skills/verify-ledger/run.mjs launch "$EVIDENCE"` (Doctor PASS);
  owner `john` signed in through the real login form; Accounts → John's Visa → `/accounts/2`;
  `snapshot.mjs capture` for page-light-390, page-light-1440, page-dark-1440, page-dark-390
  (theme set with the sidebar Dark mode button); `snapshot.mjs assemble "$EVIDENCE" page …`;
  then `run.mjs cleanup "$EVIDENCE"` (PASS, scratch folder gone).
- Reference captures of the real Transactions controls (dark, 390 and 1440): filter panel
  open (`txfilter-*`) and date range open (`txdate-*`), for faithful reuse in the versions.
- Offline: `page.html` opened from `file://` in a fresh named browser with network emulated
  Offline; screenshots saved at both widths and themes; no resources loaded over the network.
  Compared with the live captures: both phone images are byte-identical; desktop differs by
  2 (light) and 75 (dark) anti-aliased pixels, with no visible difference. Saved as
  `host.html` in this folder.
- Evidence (outside git): `/tmp/ledger-evidence-J4PXt4`.

## Confirmed decisions
Robert, 2026-10-11, this herdr tab:
1. Filters: reuse the Transactions filter panel without the Accounts tab (Categories,
   Merchants, Amount, Other), plus the search and date range controls Transactions has.
   ("Whatever you recommend here.")
2. List size: keep the short list of up to 14 rows, showing matches only, with a count
   "14 of 52 matching"; "View all in Transactions" carries the same filters. ("Agreed.")
3. Empty wording: filters with no match "No transactions match these filters" + Clear;
   search with no match `Nothing matches “{search}”`; an account with no transactions keeps
   "No transactions for this account." with no filter controls. ("Agreed.")
4. Load error: "Couldn't load transactions." with a "Try again" button, instead of today's
   misleading "No transactions for this account." ("Sounds good.") Brief confirmed:
   "Confirmed." (2026-10-11).

## Real-site experiment
None.

## Open decisions
None yet; placement of the controls and how active filters show are compared across the
versions and asked as numbered questions after the critique.
