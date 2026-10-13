# Final audit, part B (#281)

Budget, Reports, Reviews, Import, Recurring and Investments, checked as owner, admin and member, in light and dark, at 390 and 1440 wide, on the verify-ledger synthetic sample data.

- **Run on:** 2026-10-12 (launch month October 2026; the app's "today" is Oct 12, Oct 13 on the server's clock)
- **Against commit:** `b51a8e6354612efe6e3f7749789b365700027e64` (`feature/platform-retheme`, "phone Transactions review count as a full-width strip (#324)"), built and launched with `.pi/skills/verify-ledger` (Doctor PASS).
- **Checked against, in this order:** PRODUCT.md, DESIGN.md, AGENTS.md; the approved designs `104`, `106`, `109`, `226`, `231`, `309`, `310`, `319` where they touch these pages; then the app as it is. Also the money-sign rule and "no hardcoded colours".

## Severity

- **High:** a wrong money figure, data loss, a permission leak, a broken or unreachable flow, or a crash.
- **Medium:** a visible break from the rulebook or an approved design, content clipped or unreachable on phone, wrong or misleading wording, or a state with no way forward.
- **Low:** cosmetic polish. Low findings are listed in this file only (see `## Low findings`); #112 copies them into `backlog.md`.

## Bottom line

**1 high, 8 medium, 20 low.** The six pages are in good shape on desktop and phone in both themes: the Budget Month and Year views match design 309, the Filters sheet matches design 310, and nothing scrolls sideways at page level on any page, role, theme or width. Money figures agree across pages (Budget October income $3,255 and expenses $3,244 equal the Reports October column; Recurring's annual $20,860 and $78,000 re-add from the six items; Investments weights and totals re-add). The problems sit in three places: **Investments shows data the viewer shouldn't see** (high), **failed loads and empty states that say the wrong thing** (Reviews, Recurring, Budget, Reports), and **a few phone gaps** (Reports Summary amounts clipped, a squeezed Reviews filter).

## Findings that need a fix

Each has its own GitHub issue (labelled `status:needs-prep`, blocking #112, base `feature/platform-retheme`). Screenshot names are in `screenshots/part-b/`.

| # | Sev | Page | Roles | Theme / width | Finding | Issue | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | High | Investments | member, owner, admin | light and dark, 390 and 1440 | Picking one account in the Accounts filter shows that account's portfolio performance (and chart) even when its holdings are hidden as another person's personal connection; the Market card for All accounts is identical for John and Jane while their Holdings totals differ. Server: the performance endpoint isn't scoped by connection, the holdings endpoint is. | [#325](https://github.com/robpaolella/ledger/issues/325) | `member-light-1440-investments-other-persons-account.png`, `owner-light-1440-investments-other-persons-account.png`, `owner-light-1440-investments-other-persons-holdings.png` |
| B2 | Medium | Reports | all | light and dark, 390 | Category breakdown Summary on a phone shows only percentages; every dollar amount is pushed past the right edge (x 365–461 on a 390 screen) and clipped. | [#326](https://github.com/robpaolella/ledger/issues/326) | `owner-light-390-reports-summary-expanded.png`, `owner-dark-390-reports-summary-expanded.png` |
| B4 | Medium | Import (CSV review) | owner, admin, member | light, 390 and 1440 | Rows without a category can be ticked and counted ("3 of 3 selected") but are silently left out ("1 transaction will be imported"); nothing says why. | [#328](https://github.com/robpaolella/ledger/issues/328) | `owner-light-1440-import-catpicker.png`, `owner-light-1440-import-review.png` |
| B5 | Medium | Reviews | owner, admin, member (with edit) | light, 390 and 1440 | "Approve all" asks "Approve 44 transactions? This marks every transaction in the current view reviewed"; 26 uncategorized ones stay (18 cleared). Only a transient toast says so. | [#329](https://github.com/robpaolella/ledger/issues/329) | `owner-light-390-reviews-approve-all.png`, `owner-light-1440-reviews-approve-all.png`, `owner-light-1440-reviews-empty.png` |
| B6 | Medium | Reviews, Recurring | owner (code is role-independent) | light and dark, 390 and 1440 | When loading fails, Reviews shows "You're all caught up", 0 to review, $0.00 pending; Recurring shows $0.00 income and bills and "No recurring items this month." Only a disappearing toast says it failed. | [#330](https://github.com/robpaolella/ledger/issues/330) | `owner-light-1440-reviews-error.png`, `owner-light-390-reviews-error.png`, `owner-dark-390-reviews-error.png`, `owner-light-1440-recurring-error.png`, `owner-light-390-recurring-error.png` |
| B7 | Medium | Budget (Month), Reports, category detail | owner (code is role-independent) | light and dark, 390 and 1440 | When loading fails, Budget Month spins forever with only a toast ("Server error"); Reports is replaced by the bare line "Failed to load reports." with no header and no Try again. The Budget Year view already has the proper error card. | [#331](https://github.com/robpaolella/ledger/issues/331) | `owner-light-1440-budget-error.png`, `owner-light-390-budget-error.png`, `owner-light-1440-reports-error.png`, `owner-light-390-reports-error.png`, `owner-light-390-budget-category-error.png` |
| B8 | Medium | Investments | member, owner, admin | light, 390 and 1440 | A member is told "No holdings yet. Link an investment or retirement account in Settings → Bank Sync" while the household has six investment accounts; the Accounts filter lists all six; picking someone else's account shows Holdings Total $0.00 / 100.00%. | [#332](https://github.com/robpaolella/ledger/issues/332) | `member-light-390-investments.png`, `member-light-390-investments-accounts.png`, `owner-light-1440-investments-other-persons-holdings.png` |
| B9 | Medium | Reports (Export CSV) | all | any | The exported file writes money in as negative (`-3.00` for interest income) and spending as positive, with no Type column or note; the page shows income as +$3.00 in green. | [#333](https://github.com/robpaolella/ledger/issues/333) | (file content; excerpt in the issue) |
| B10 | Medium | Reviews | all | light, 390 | With a Users filter active the phone toolbar squeezes the Date filter to "D." and the Users filter to "Sampl… 1"; the Date button is unreadable. | [#334](https://github.com/robpaolella/ledger/issues/334) | `owner-light-390-reviews-filtered-empty.png` |

B3 was withdrawn: an early run saw Escape fail to close three phone sheets, but the code handles it and a fresh launch could not reproduce it (Reviews row sheet, Budget edit sheet with its field focused, Reports Date range sheet, Recurring Add sheet all closed on Escape). Its issue, [#327](https://github.com/robpaolella/ledger/issues/327), is closed as not planned and no longer blocks #112.

B8 and B1 share a cause (personal SimpleFIN connections scope holdings but not the account list or the performance line); B1 asks Robert to decide the household rule and B8 follows it.

## Coverage table

One row for every page × role × theme × width: 6 pages × 3 roles × 2 themes × 2 widths = 72 rows. "No problems" means the default view of that page was captured and read (or compared, for admin and member, see How it was checked) with no finding. Findings that only show in a state (a sheet, an error, an empty list) are in the states table below and are not repeated per row. Capture names are local files `<role>-<theme>-<width>-<page>.png` in the evidence folder; the ones kept in this folder are marked **kept**.

| Page | Role | Theme | Width | Result | Capture |
| --- | --- | --- | --- | --- | --- |
| Budget | owner | light | 390 | No problems (low: L1) | `owner-light-390-budget.png` **kept** |
| Budget | owner | light | 1440 | No problems | `owner-light-1440-budget.png` **kept** |
| Budget | owner | dark | 390 | No problems (low: L1) | `owner-dark-390-budget.png` **kept** |
| Budget | owner | dark | 1440 | No problems | `owner-dark-1440-budget.png` |
| Budget | admin | light | 390 | No problems (low: L1) | `admin-light-390-budget.png` |
| Budget | admin | light | 1440 | No problems | `admin-light-1440-budget.png` |
| Budget | admin | dark | 390 | No problems (low: L1) | `admin-dark-390-budget.png` |
| Budget | admin | dark | 1440 | No problems | `admin-dark-1440-budget.png` |
| Budget | member | light | 390 | No problems (low: L1) | `member-light-390-budget.png` |
| Budget | member | light | 1440 | No problems | `member-light-1440-budget.png` |
| Budget | member | dark | 390 | No problems (low: L1) | `member-dark-390-budget.png` |
| Budget | member | dark | 1440 | No problems | `member-dark-1440-budget.png` |
| Reports | owner | light | 390 | [#326](https://github.com/robpaolella/ledger/issues/326) (Summary amounts clipped) | `owner-light-390-reports.png` **kept** |
| Reports | owner | light | 1440 | No problems | `owner-light-1440-reports.png` **kept** |
| Reports | owner | dark | 390 | [#326](https://github.com/robpaolella/ledger/issues/326) (Summary amounts clipped) | `owner-dark-390-reports.png` **kept** |
| Reports | owner | dark | 1440 | No problems | `owner-dark-1440-reports.png` |
| Reports | admin | light | 390 | [#326](https://github.com/robpaolella/ledger/issues/326) (Summary amounts clipped) | `admin-light-390-reports.png` |
| Reports | admin | light | 1440 | No problems | `admin-light-1440-reports.png` |
| Reports | admin | dark | 390 | [#326](https://github.com/robpaolella/ledger/issues/326) (Summary amounts clipped) | `admin-dark-390-reports.png` |
| Reports | admin | dark | 1440 | No problems | `admin-dark-1440-reports.png` |
| Reports | member | light | 390 | [#326](https://github.com/robpaolella/ledger/issues/326) (Summary amounts clipped) | `member-light-390-reports.png` |
| Reports | member | light | 1440 | No problems | `member-light-1440-reports.png` |
| Reports | member | dark | 390 | [#326](https://github.com/robpaolella/ledger/issues/326) (Summary amounts clipped) | `member-dark-390-reports.png` |
| Reports | member | dark | 1440 | No problems | `member-dark-1440-reports.png` |
| Reviews | owner | light | 390 | No problems in the default view (low: L5) | `owner-light-390-reviews.png` **kept** |
| Reviews | owner | light | 1440 | No problems in the default view | `owner-light-1440-reviews.png` **kept** |
| Reviews | owner | dark | 390 | No problems in the default view (low: L5) | `owner-dark-390-reviews.png` **kept** |
| Reviews | owner | dark | 1440 | No problems in the default view | `owner-dark-1440-reviews.png` |
| Reviews | admin | light | 390 | No problems in the default view (low: L5) | `admin-light-390-reviews.png` |
| Reviews | admin | light | 1440 | No problems in the default view | `admin-light-1440-reviews.png` |
| Reviews | admin | dark | 390 | No problems in the default view (low: L5) | `admin-dark-390-reviews.png` |
| Reviews | admin | dark | 1440 | No problems in the default view | `admin-dark-1440-reviews.png` **kept** |
| Reviews | member | light | 390 | No problems in the default view (low: L5) | `member-light-390-reviews.png` |
| Reviews | member | light | 1440 | No problems in the default view | `member-light-1440-reviews.png` |
| Reviews | member | dark | 390 | No problems in the default view (low: L5) | `member-dark-390-reviews.png` |
| Reviews | member | dark | 1440 | No problems in the default view | `member-dark-1440-reviews.png` |
| Import | owner | light | 390 | No problems in the default view (Bank Sync tab) (low: L6, L16) | `owner-light-390-import.png` **kept** |
| Import | owner | light | 1440 | No problems in the default view (Bank Sync tab) (low: L16) | `owner-light-1440-import.png` **kept** |
| Import | owner | dark | 390 | No problems in the default view (Bank Sync tab) (low: L6, L16) | `owner-dark-390-import.png` **kept** |
| Import | owner | dark | 1440 | No problems in the default view (Bank Sync tab) (low: L16) | `owner-dark-1440-import.png` |
| Import | admin | light | 390 | No problems in the default view (Bank Sync tab) (low: L6, L16) | `admin-light-390-import.png` |
| Import | admin | light | 1440 | No problems in the default view (Bank Sync tab) (low: L16) | `admin-light-1440-import.png` **kept** |
| Import | admin | dark | 390 | No problems in the default view (Bank Sync tab) (low: L6, L16) | `admin-dark-390-import.png` |
| Import | admin | dark | 1440 | No problems in the default view (Bank Sync tab) (low: L16) | `admin-dark-1440-import.png` |
| Import | member | light | 390 | No problems in the default view (Bank Sync tab, 2 shared accounts only) (low: L6, L16) | `member-light-390-import.png` **kept** |
| Import | member | light | 1440 | No problems in the default view (Bank Sync tab, 2 shared accounts only) (low: L16) | `member-light-1440-import.png` |
| Import | member | dark | 390 | No problems in the default view (Bank Sync tab, 2 shared accounts only) (low: L6, L16) | `member-dark-390-import.png` |
| Import | member | dark | 1440 | No problems in the default view (Bank Sync tab, 2 shared accounts only) (low: L16) | `member-dark-1440-import.png` |
| Recurring | owner | light | 390 | No problems (low: L7) | `owner-light-390-recurring.png` **kept** |
| Recurring | owner | light | 1440 | No problems | `owner-light-1440-recurring.png` **kept** |
| Recurring | owner | dark | 390 | No problems (low: L7) | `owner-dark-390-recurring.png` **kept** |
| Recurring | owner | dark | 1440 | No problems | `owner-dark-1440-recurring.png` |
| Recurring | admin | light | 390 | No problems (low: L7) | `admin-light-390-recurring.png` |
| Recurring | admin | light | 1440 | No problems | `admin-light-1440-recurring.png` |
| Recurring | admin | dark | 390 | No problems (low: L7) | `admin-dark-390-recurring.png` |
| Recurring | admin | dark | 1440 | No problems | `admin-dark-1440-recurring.png` |
| Recurring | member | light | 390 | No problems (low: L7) | `member-light-390-recurring.png` |
| Recurring | member | light | 1440 | No problems | `member-light-1440-recurring.png` |
| Recurring | member | dark | 390 | No problems (low: L7) | `member-dark-390-recurring.png` |
| Recurring | member | dark | 1440 | No problems | `member-dark-1440-recurring.png` |
| Investments | owner | light | 390 | [#325](https://github.com/robpaolella/ledger/issues/325) (Market card not scoped to the viewer) (low: L4) | `owner-light-390-investments.png` **kept** |
| Investments | owner | light | 1440 | [#325](https://github.com/robpaolella/ledger/issues/325) (Market card not scoped to the viewer) (low: L4) | `owner-light-1440-investments.png` **kept** |
| Investments | owner | dark | 390 | [#325](https://github.com/robpaolella/ledger/issues/325) (Market card not scoped to the viewer) (low: L4) | `owner-dark-390-investments.png` **kept** |
| Investments | owner | dark | 1440 | [#325](https://github.com/robpaolella/ledger/issues/325) (Market card not scoped to the viewer) (low: L4) | `owner-dark-1440-investments.png` |
| Investments | admin | light | 390 | [#325](https://github.com/robpaolella/ledger/issues/325) (Market card not scoped to the viewer) (low: L4) | `admin-light-390-investments.png` |
| Investments | admin | light | 1440 | [#325](https://github.com/robpaolella/ledger/issues/325) (Market card not scoped to the viewer) (low: L4) | `admin-light-1440-investments.png` |
| Investments | admin | dark | 390 | [#325](https://github.com/robpaolella/ledger/issues/325) (Market card not scoped to the viewer) (low: L4) | `admin-dark-390-investments.png` |
| Investments | admin | dark | 1440 | [#325](https://github.com/robpaolella/ledger/issues/325) (Market card not scoped to the viewer) (low: L4) | `admin-dark-1440-investments.png` |
| Investments | member | light | 390 | [#332](https://github.com/robpaolella/ledger/issues/332) (empty state wording); [#325](https://github.com/robpaolella/ledger/issues/325) (low: L4) | `member-light-390-investments.png` **kept** |
| Investments | member | light | 1440 | [#332](https://github.com/robpaolella/ledger/issues/332) (empty state wording); [#325](https://github.com/robpaolella/ledger/issues/325) (low: L4) | `member-light-1440-investments.png` |
| Investments | member | dark | 390 | [#332](https://github.com/robpaolella/ledger/issues/332) (empty state wording); [#325](https://github.com/robpaolella/ledger/issues/325) (low: L4) | `member-dark-390-investments.png` |
| Investments | member | dark | 1440 | [#332](https://github.com/robpaolella/ledger/issues/332) (empty state wording); [#325](https://github.com/robpaolella/ledger/issues/325) (low: L4) | `member-dark-1440-investments.png` |

## States checked

Beyond the default view of each page. "RO member" is the sample member switched to **View only** through Settings → Users & permissions (switched back to Everyday afterwards).

| Page | State | Role | Theme / width | Result |
| --- | --- | --- | --- | --- |
| Budget | Month, populated; Today, month arrows; uncategorized notice strip with Review them link | owner, admin, member | light and dark, 390 and 1440 | No problems. October actuals tie to the Reports Timeline October column; the notice's $37 matches the $37 gap between row sums and the section total. |
| Budget | Year view (phone two-line cards; desktop 12-month table) | owner | light, 390 and 1440 | No problems; matches `design/309-budget-year-cards/` approved-year (`owner-light-1440-budget-year.png`). Nov and Dec 2026 (and later months) carry the planned amounts forward, so "planned in 2026" counts 11 months of the 9 seeded. |
| Budget | Edit planned amount (sheet on phone): save Fuel $440.25, "this month only", reload | owner, member | light and dark, 390 | No problems for the flow: persisted after reload (Fuel $440 planned, $300 remaining); sheet matches DESIGN.md; Escape closes it on a fresh launch (`member-dark-390-budget-edit.png`). |
| Budget | Category detail page (Fuel) | owner | light and dark, 390 and 1440 | No problems (low: L18). |
| Budget | Empty month (January 2026, before any budget) | owner | dark, 390 | Works; low L2 (`owner-dark-390-budget-emptymonth.png`). |
| Budget | View-only member: planned boxes | RO member | light and dark, 390 and 1440 | Amounts read-only (boxes disabled, tap does nothing); low L3 (`memberRO-light-390-budget.png`). |
| Budget | Failed load (Month) | owner | light and dark, 390 and 1440 | [#331](https://github.com/robpaolella/ledger/issues/331). |
| Reports | Breakdown, Trends (cumulative and monthly), Summary, Expand all, Timeline (phone one month at a time; desktop table) | owner, admin, member | light, 390 and 1440 (dark spot-checked) | Summary on phone: [#326](https://github.com/robpaolella/ledger/issues/326). Timeline and Trends: no problems. |
| Reports | Filters (phone sheet, desktop popover) and Date range (sheet and popover) | owner | light, 390 and 1440 | No problems; the Filters sheet matches `design/310-filter-type-picker/` approved-start (`owner-light-390-reports-filters.png`); the Date range sheet closes on Escape. |
| Reports | Drill-down (Daily Living) with the sticky pill | owner | light, 390 and 1440 | No problems (low: L8). |
| Reports | Empty period (custom range in 2030) | owner | light, 390 and 1440 | Works ("No spending in this period.", "No transactions in this period."); low L9 (`owner-light-1440-reports-empty.png`). |
| Reports | Export CSV | owner | n/a | [#333](https://github.com/robpaolella/ledger/issues/333). |
| Reports | Failed load | owner | light and dark, 390 and 1440 | [#331](https://github.com/robpaolella/ledger/issues/331). |
| Reviews | List, Date and Users filters, search (phone) | owner, admin, member | light and dark, 390 and 1440 | No problems (low L5, L12). With a Users filter on phone: [#334](https://github.com/robpaolella/ledger/issues/334). |
| Reviews | Phone review sheet (logo, category, note, assign, Mark reviewed); Mark reviewed persists (45 to 44, $1,615.36 to $1,545.94) | owner, member | light, dark, 390 | No problems; matches `design/226-phone-sheets-rows/`; closes on Escape (`owner-light-390-reviews-row-sheet.png`). |
| Reviews | Approve all confirmation and result | owner | light, 390 and 1440 | [#329](https://github.com/robpaolella/ledger/issues/329). |
| Reviews | Filtered empty ("No matches" with Clear filters) | owner | light, 390 | Works; low L10, and [#334](https://github.com/robpaolella/ledger/issues/334). |
| Reviews | Genuine "all caught up" empty list | owner | n/a | Not reachable on the sample data: the 26 uncategorized rows can't be approved in bulk, and clearing them one by one wasn't practical. Seen only during a simulated failure, where it is wrong ([#330](https://github.com/robpaolella/ledger/issues/330)). Recorded as low L17. |
| Reviews | Failed load | owner | light and dark, 390 and 1440 | [#330](https://github.com/robpaolella/ledger/issues/330). |
| Reviews | View-only member | RO member | light, 390 and 1440 | Approve all hidden, assignee and category controls read-only; no problems (`memberRO-light-1440-reviews.png`). |
| Import | Bank Sync tab: select and fetch step; fetch result (no new transactions on the demo feeds) | owner, admin, member | light and dark, 390 and 1440 | No problems; each role sees only the shared accounts and its own (owner 6 accounts, admin 5, member 2); fetch ends with "No new transactions in this window." (`owner-light-1440-import-fetch-result.png`). |
| Import | CSV: upload, map columns, review; parenthesized negative `(12.00)`; import persisted; second upload flags duplicates | owner | light, 390 and 1440 | Signs correct (-4.50 and (12.00) are money out, 250.00 is money in; Reports expenses rose $16.50). Issues: [#328](https://github.com/robpaolella/ledger/issues/328) (uncategorized rows) and low L13 (duplicate icon) (`owner-light-390-import-duplicates.png`). |
| Import | View-only member | RO member | light and dark, 390 and 1440 | Both tabs explain "You don't have permission to use this. Contact an admin to request access."; no problems (`memberRO-light-390-import.png`). |
| Recurring | This month list (due soon, due date passed), calendar, All recurring | owner, admin, member | light and dark, 390 and 1440 | No problems. The sample shows the six items the feature map names; totals re-add (annual $20,860.00 expenses, +$78,000.00 income, 5 active with the paused pledge excluded). |
| Recurring | Add recurring (sheet and modal); add "Synthetic Streaming" $15.99 persisted; edit and delete confirm (inline Confirm delete?) | owner, member | light and dark, 390 and 1440 | No problems; the phone Add sheet closes on Escape. |
| Recurring | Empty (all items deleted through the UI) | owner | light and dark, 390 and 1440 | Works; low L14 (`owner-dark-390-recurring-empty.png`). |
| Recurring | Failed load | owner | light and dark, 390 and 1440 | [#330](https://github.com/robpaolella/ledger/issues/330). |
| Recurring | View-only member | RO member | light, 1440 | Add recurring hidden, rows not editable; no problems (`memberRO-light-1440-recurring.png`). |
| Investments | Market and Allocation tabs, Holdings (by asset class), Accounts filter, period menu | owner, admin | light and dark, 390 and 1440 | Figures re-add (US Equity $69,490.23 + International $2,752.53 + Fixed Income $2,673.79 = $74,916.55, weights match). Low L4. Scoping: [#325](https://github.com/robpaolella/ledger/issues/325). |
| Investments | Member: empty state; Accounts filter; one account picked | member | light and dark, 390 and 1440 | [#332](https://github.com/robpaolella/ledger/issues/332) and [#325](https://github.com/robpaolella/ledger/issues/325). |
| Investments | Failed load | owner | light, 390 and 1440 | "Performance data unavailable." and "Holdings data unavailable." are honest; low L15. |

## Low findings

- L1. Budget phone: "Entertainment" breaks mid-word as "Entertainm / ent" (known; design 309 left it to a follow-up).
- L2. Budget phone: a month with no budget (for example January 2026) is 20 rows of dashes under a green "Left to budget —" band, with no hint to plan something; the way forward is "Show N unbudgeted".
- L3. Budget with a View-only member: the planned-amount boxes are disabled but look the same as editable ones, so tapping does nothing and nothing says why.
- L4. Investments: the last x-axis label of the chart is clipped ("Oct ·") at both widths.
- L5. Reviews phone: the row subtitle clips the note ("· C…", "Check thi…").
- L6. Import Bank Sync phone: account names truncate beside the owner badge ("John's Masterc…").
- L7. Recurring phone: the account name truncates ("John's Chec…").
- L8. Reports phone drill-down: the sticky pill truncates the category ("Dail…") and covers the last visible row.
- L9. Reports empty range: Net $0 still reads "▲ saved" in green; with a custom range the phone toolbar wraps to two rows.
- L10. Reviews "No matches" reuses the green check icon from "all caught up".
- L11. Every sheet and dialog opens with a focus ring on the close X (phone and desktop).
- L12. Reviews phone search field shows a double focus ring (outline plus box).
- L13. Import CSV review: the duplicate warning icon is explained only by a hover tooltip ("Likely Duplicate"), so phone users can't read it.
- L14. Recurring empty ("No recurring items yet.") doesn't point to the Add button (the + in the phone app bar).
- L15. Investments failed load has no Try again.
- L16. Import Bank Sync phone: row check boxes are 20×20 and the search field's inner input measures 81×20 (the surrounding row and field are 44px; the box itself is the small target).
- L17. Sample data has no genuine "all caught up" Reviews state (26 uncategorized rows can't be bulk-approved); it can only be seen by failing the load (B6).
- L18. Budget category detail desktop: the account label truncates ("John's Mastercard (…..").
- L19. Budget Year: "planned in 2026" totals count carried-forward future months (11 months of 9 seeded), which is correct for the plan but unexplained.
- L20. Import: the page opens on the Bank Sync tab although CSV Import is listed first.

## How it was checked

- Launched with `.pi/skills/verify-ledger` (`run.mjs launch`, Doctor PASS) on a fresh worktree after `npm ci`; driven with chrome-devtools-axi at `resize 390 844` and `resize 1440 900`, signing in through the real form as John (owner), Jane (admin) and Sample Member. Theme was set through the app's own saved theme setting (`ledger-theme`) after sign-in, not the toggle button.
- Each capture also ran a script over the live page: page width against screen width, elements past the right edge, every tappable element's real hit area (the page's `tap-area` extensions count: all measured at 44px except L16), and clipped text. Touch targets pass on all six pages at 390.
- **Read in full-size images:** every owner capture in the coverage table, plus the owner state captures listed above. Admin and member captures: every combination read as 12-up contact sheets (a layout and theme check, not text-level), a text comparison of each page against admin and member (differences only where expected: name, Import accounts, Investments), and full-size reads of the member Investments, Import and View-only captures, the admin Reviews, Import and Reports captures.
- Errors were simulated by making the page's `/api` GET calls return HTTP 500 in the browser (the server stayed healthy). The CSV was uploaded by setting the file input of the page from a synthetic file saved under the evidence folder; nothing else bypassed the UI.
- Money checks: Budget, Reports Timeline and the Review count tie out; the imported rows moved Reports expenses by exactly $16.50 (-4.50 and the parenthesized (12.00); the uncategorized +250.00 deposit was not imported, see [#328](https://github.com/robpaolella/ledger/issues/328)); Recurring's annual figures re-add; Investments weights and totals re-add. Hardcoded colours: none in the six pages and their components (the only literal is a black shadow); `lint:tokens` is part of `npm run validate`.
- Data changed on the throwaway database through the real UI: Fuel plan for October (438.16 to 440.25), one review marked reviewed, two synthetic rows imported by CSV ("Synthetic Cafe", "Synthetic Store Refund"), Approve all (18 cleared), all seven recurring items deleted (including one added), the sample member switched to View only and back to Everyday. Later captures therefore show 26 to review and slightly different Reports totals ($49,932 expenses, $6,092 net) than the first ones ($49,915, $6,109).
- Not reached: a genuine "all caught up" Reviews list (L17); a failing Bank Sync fetch (the demo feeds return no rows rather than errors).
- Only the screenshots that back a finding or a state are in `screenshots/part-b/` (about 70 images). The full capture set (about 210 images) stays local. All data is synthetic; no real data was used. The throwaway app was cleaned up with `run.mjs cleanup`.

