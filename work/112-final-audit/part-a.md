# Final audit, part A: Sign-in, Dashboard, Transactions, Account and Category detail, Accounts

Issue #280 (part of #112). Run on 2026-10-12 against commit `b51a8e6` (`feature/platform-retheme`, "phone Transactions review count as a full-width strip (#324)"), built and launched with `.pi/skills/verify-ledger` on its synthetic sample data (Doctor PASS; the launch month is October 2026, so "today" in the data is Oct 12).

**Bottom line:** 1 high and 14 medium problems, each filed as its own issue that blocks #112 (list below), plus 14 low findings. Nothing scrolls sideways on any audited page (806 captures), nothing is drawn off-screen, no image is broken, no money is formatted outside `Money`/`Change`/`formatMoney`, no colour is hard-coded on these pages, and the money-sign rules hold (refunds show as green +$, transfers in grey, liabilities as amounts owed, "$212.40 credit"). The high finding is a one-click, no-confirmation delete of a physical asset on Accounts. The rest cluster in four places: **failed loads shown as the wrong thing** (empty, "doesn't exist", forever-spinning), **phone sheets and tap targets**, **one misleading investments total**, and **member buttons hidden instead of disabled**.

## Severity

- **High**: a wrong money figure, data loss, a permission leak, a broken or unreachable flow, or a crash.
- **Medium**: a visible break from the rulebook or an approved design, content clipped or unreachable on phone, wrong or misleading wording, or a state with no way forward.
- **Low**: cosmetic polish. Low findings are listed here only (`## Low findings`); #112 copies them into `backlog.md`.

## How it was done

- Launched with the verify skill (own worktree, fresh evidence folder), then driven by script through Chrome (puppeteer-core against a headless Chrome, one browser profile per role) with real sign-in for owner (John), admin (Jane) and the limited member. Real clicks and typing in the app's own UI; the theme is switched by writing the app's own `ledger-theme` setting and reloading (the same value the Dark/Light control saves); no auth token was injected and no database edited. Setup and the two-step code step can't be reached with sample data, so the app's own status/login/confirm calls were answered locally for those screens only (marked below); everything else is the real server.
- Sizes: 390×844 and 1440×900 (`setViewport`, actual size read back). Tall pages were captured at full page height.
- Every capture also ran a script over the live page: page width vs screen width, anything past the right edge, clipped text, broken images, tiny text, money written with a leading minus, console errors and failed requests. Tap targets under 44px were then re-measured with `elementFromPoint` so invisible 44px tap areas (`tap-area`) count (a plain size check wrongly flagged Dashboard links and Accounts Totals/Percent). Sizes quoted in findings come from that second measure.
- Rulebook checks by reading the code: no hex/rgb colours in these pages or their components, no local money formatters (`toFixed`/`toLocaleString` only on counts and percentages), no `alert()`/`confirm()`.
- Keyboard: Escape and focus return were checked for every popover, menu and sheet on these pages at both widths (real key events, real mouse clicks). Tab order, screen readers and colour contrast were not measured.
- Roles: owner, admin and the one limited member (`member`: everyday permissions). Owner and admin differ from each other only by name, avatar and personal investment figures (compared state by state: page text and button lists identical otherwise). Member differences are listed under each page.
- The full capture set (806 captures with their measurements) stays outside git; `screenshots/part-a/` holds the images that back a finding (`H1`/`M…` names, M = the working numbers used while auditing) and one passing example per page (`P-…`).
- One real change to the sample data: while testing Delete on an asset (finding #341), the sample's 2022 Honda Civic was deleted, so Accounts captures taken afterwards show net worth $251,002.30 instead of $261,089.41.

## Coverage

Every page × role × theme × width has a row. Login and first-run Setup happen before anyone is signed in, so they have no role; their rows repeat the same captures for each role. "Captures" counts the states below at that width. The right column says where problems were found, by issue number.

| Page | Role | Theme | Width | What was checked | Result |
| --- | --- | --- | --- | --- | --- |
| Login | owner (signed out) | light | 390 | default, wrong password, server unreachable, two-step code, wrong code, backup code; 6 captures, no sideways scroll | Findings: #346, #355 |
| Login | owner (signed out) | light | 1440 | default, wrong password, server unreachable, two-step code, wrong code, backup code; 6 captures, no sideways scroll | Findings: #346 |
| Login | owner (signed out) | dark | 390 | default, wrong password, server unreachable, two-step code, wrong code, backup code; 6 captures, no sideways scroll | Findings: #346, #355 |
| Login | owner (signed out) | dark | 1440 | default, wrong password, server unreachable, two-step code, wrong code, backup code; 6 captures, no sideways scroll | Findings: #346 |
| Login | admin (signed out) | light | 390 | default, wrong password, server unreachable, two-step code, wrong code, backup code; 6 captures, no sideways scroll | Findings: #346, #355 |
| Login | admin (signed out) | light | 1440 | default, wrong password, server unreachable, two-step code, wrong code, backup code; 6 captures, no sideways scroll | Findings: #346 |
| Login | admin (signed out) | dark | 390 | default, wrong password, server unreachable, two-step code, wrong code, backup code; 6 captures, no sideways scroll | Findings: #346, #355 |
| Login | admin (signed out) | dark | 1440 | default, wrong password, server unreachable, two-step code, wrong code, backup code; 6 captures, no sideways scroll | Findings: #346 |
| Login | member (signed out) | light | 390 | default, wrong password, server unreachable, two-step code, wrong code, backup code; 6 captures, no sideways scroll | Findings: #346, #355 |
| Login | member (signed out) | light | 1440 | default, wrong password, server unreachable, two-step code, wrong code, backup code; 6 captures, no sideways scroll | Findings: #346 |
| Login | member (signed out) | dark | 390 | default, wrong password, server unreachable, two-step code, wrong code, backup code; 6 captures, no sideways scroll | Findings: #346, #355 |
| Login | member (signed out) | dark | 1440 | default, wrong password, server unreachable, two-step code, wrong code, backup code; 6 captures, no sideways scroll | Findings: #346 |
| Setup | owner (signed out) | light | 390 | first-run form, mismatched passwords (setup status mocked); 2 captures, no sideways scroll | No problems |
| Setup | owner (signed out) | light | 1440 | first-run form, mismatched passwords (setup status mocked); 2 captures, no sideways scroll | No problems |
| Setup | owner (signed out) | dark | 390 | first-run form, mismatched passwords (setup status mocked); 2 captures, no sideways scroll | No problems |
| Setup | owner (signed out) | dark | 1440 | first-run form, mismatched passwords (setup status mocked); 2 captures, no sideways scroll | No problems |
| Setup | admin (signed out) | light | 390 | first-run form, mismatched passwords (setup status mocked); 2 captures, no sideways scroll | No problems |
| Setup | admin (signed out) | light | 1440 | first-run form, mismatched passwords (setup status mocked); 2 captures, no sideways scroll | No problems |
| Setup | admin (signed out) | dark | 390 | first-run form, mismatched passwords (setup status mocked); 2 captures, no sideways scroll | No problems |
| Setup | admin (signed out) | dark | 1440 | first-run form, mismatched passwords (setup status mocked); 2 captures, no sideways scroll | No problems |
| Setup | member (signed out) | light | 390 | first-run form, mismatched passwords (setup status mocked); 2 captures, no sideways scroll | No problems |
| Setup | member (signed out) | light | 1440 | first-run form, mismatched passwords (setup status mocked); 2 captures, no sideways scroll | No problems |
| Setup | member (signed out) | dark | 390 | first-run form, mismatched passwords (setup status mocked); 2 captures, no sideways scroll | No problems |
| Setup | member (signed out) | dark | 1440 | first-run form, mismatched passwords (setup status mocked); 2 captures, no sideways scroll | No problems |
| Two-step setup | owner | light | 390 | intro, scan step, wrong code, backup codes (confirm call mocked); 4 captures, no sideways scroll | No problems |
| Two-step setup | owner | light | 1440 | intro, scan step, wrong code, backup codes (confirm call mocked); 4 captures, no sideways scroll | No problems |
| Two-step setup | owner | dark | 390 | intro, scan step, wrong code, backup codes (confirm call mocked); 4 captures, no sideways scroll | No problems |
| Two-step setup | owner | dark | 1440 | intro, scan step, wrong code, backup codes (confirm call mocked); 4 captures, no sideways scroll | No problems |
| Two-step setup | admin | light | 390 | intro, scan step, wrong code, backup codes (confirm call mocked); 4 captures, no sideways scroll | No problems |
| Two-step setup | admin | light | 1440 | intro, scan step, wrong code, backup codes (confirm call mocked); 4 captures, no sideways scroll | No problems |
| Two-step setup | admin | dark | 390 | intro, scan step, wrong code, backup codes (confirm call mocked); 4 captures, no sideways scroll | No problems |
| Two-step setup | admin | dark | 1440 | intro, scan step, wrong code, backup codes (confirm call mocked); 4 captures, no sideways scroll | No problems |
| Two-step setup | member | light | 390 | intro, scan step, wrong code, backup codes (confirm call mocked); 4 captures, no sideways scroll | No problems |
| Two-step setup | member | light | 1440 | intro, scan step, wrong code, backup codes (confirm call mocked); 4 captures, no sideways scroll | No problems |
| Two-step setup | member | dark | 390 | intro, scan step, wrong code, backup codes (confirm call mocked); 4 captures, no sideways scroll | No problems |
| Two-step setup | member | dark | 1440 | intro, scan step, wrong code, backup codes (confirm call mocked); 4 captures, no sideways scroll | No problems |
| Dashboard | owner | light | 390 | 4 states; 4 captures, no sideways scroll | Findings: #342, #354 |
| Dashboard | owner | light | 1440 | 5 states; 5 captures, no sideways scroll | Findings: #342 |
| Dashboard | owner | dark | 390 | 4 states; 4 captures, no sideways scroll | Findings: #342, #354 |
| Dashboard | owner | dark | 1440 | 5 states; 5 captures, no sideways scroll | Findings: #342 |
| Dashboard | admin | light | 390 | 4 states; 4 captures, no sideways scroll | Findings: #342, #354 |
| Dashboard | admin | light | 1440 | 5 states; 5 captures, no sideways scroll | Findings: #342 |
| Dashboard | admin | dark | 390 | 4 states; 4 captures, no sideways scroll | Findings: #342, #354 |
| Dashboard | admin | dark | 1440 | 5 states; 5 captures, no sideways scroll | Findings: #342 |
| Dashboard | member | light | 390 | 4 states; 4 captures, no sideways scroll | Findings: #342, #354 |
| Dashboard | member | light | 1440 | 5 states; 5 captures, no sideways scroll | Findings: #342 |
| Dashboard | member | dark | 390 | 4 states; 4 captures, no sideways scroll | Findings: #342, #354 |
| Dashboard | member | dark | 1440 | 5 states; 5 captures, no sideways scroll | Findings: #342 |
| Transactions | owner | light | 390 | 20 states; 20 captures, no sideways scroll | Findings: #343, #346, #350, #340 (filed by part C) |
| Transactions | owner | light | 1440 | 20 states; 20 captures, no sideways scroll | Findings: #343, #346, #350 |
| Transactions | owner | dark | 390 | 20 states; 20 captures, no sideways scroll | Findings: #343, #346, #350, #340 (filed by part C) |
| Transactions | owner | dark | 1440 | 20 states; 20 captures, no sideways scroll | Findings: #343, #346, #350 |
| Transactions | admin | light | 390 | 20 states; 20 captures, no sideways scroll | Findings: #343, #346, #350, #340 (filed by part C) |
| Transactions | admin | light | 1440 | 20 states; 20 captures, no sideways scroll | Findings: #343, #346, #350 |
| Transactions | admin | dark | 390 | 20 states; 20 captures, no sideways scroll | Findings: #343, #346, #350, #340 (filed by part C) |
| Transactions | admin | dark | 1440 | 20 states; 20 captures, no sideways scroll | Findings: #343, #346, #350 |
| Transactions | member | light | 390 | 20 states; 20 captures, no sideways scroll | Findings: #343, #346, #340 (filed by part C) |
| Transactions | member | light | 1440 | 20 states; 20 captures, no sideways scroll | Findings: #343, #346 |
| Transactions | member | dark | 390 | 20 states; 20 captures, no sideways scroll | Findings: #343, #346, #340 (filed by part C) |
| Transactions | member | dark | 1440 | 20 states; 20 captures, no sideways scroll | Findings: #343, #346 |
| Account detail | owner | light | 390 | 13 states; 13 captures, no sideways scroll | Findings: #345, #347, #348, #349, #353 |
| Account detail | owner | light | 1440 | 13 states; 13 captures, no sideways scroll | Findings: #345, #347, #348 |
| Account detail | owner | dark | 390 | 13 states; 13 captures, no sideways scroll | Findings: #345, #347, #348, #349, #353 |
| Account detail | owner | dark | 1440 | 13 states; 13 captures, no sideways scroll | Findings: #345, #347, #348 |
| Account detail | admin | light | 390 | 13 states; 13 captures, no sideways scroll | Findings: #345, #347, #348, #349, #353 |
| Account detail | admin | light | 1440 | 13 states; 13 captures, no sideways scroll | Findings: #345, #347, #348 |
| Account detail | admin | dark | 390 | 13 states; 13 captures, no sideways scroll | Findings: #345, #347, #348, #349, #353 |
| Account detail | admin | dark | 1440 | 13 states; 13 captures, no sideways scroll | Findings: #345, #347, #348 |
| Account detail | member | light | 390 | 13 states; 13 captures, no sideways scroll | Findings: #345, #347, #348, #349, #353 |
| Account detail | member | light | 1440 | 13 states; 13 captures, no sideways scroll | Findings: #345, #347, #348 |
| Account detail | member | dark | 390 | 13 states; 13 captures, no sideways scroll | Findings: #345, #347, #348, #349, #353 |
| Account detail | member | dark | 1440 | 13 states; 13 captures, no sideways scroll | Findings: #345, #347, #348 |
| Category detail | owner | light | 390 | 10 states; 10 captures, no sideways scroll | Findings: #331 (filed by part B: bare "Failed to load category") |
| Category detail | owner | light | 1440 | 10 states; 10 captures, no sideways scroll | Findings: #331 (filed by part B: bare "Failed to load category") |
| Category detail | owner | dark | 390 | 10 states; 10 captures, no sideways scroll | Findings: #331 (filed by part B: bare "Failed to load category") |
| Category detail | owner | dark | 1440 | 10 states; 10 captures, no sideways scroll | Findings: #331 (filed by part B: bare "Failed to load category") |
| Category detail | admin | light | 390 | 10 states; 10 captures, no sideways scroll | Findings: #331 (filed by part B: bare "Failed to load category") |
| Category detail | admin | light | 1440 | 10 states; 10 captures, no sideways scroll | Findings: #331 (filed by part B: bare "Failed to load category") |
| Category detail | admin | dark | 390 | 10 states; 10 captures, no sideways scroll | Findings: #331 (filed by part B: bare "Failed to load category") |
| Category detail | admin | dark | 1440 | 10 states; 10 captures, no sideways scroll | Findings: #331 (filed by part B: bare "Failed to load category") |
| Category detail | member | light | 390 | 10 states; 10 captures, no sideways scroll | Findings: #331 (filed by part B: bare "Failed to load category") |
| Category detail | member | light | 1440 | 10 states; 10 captures, no sideways scroll | Findings: #331 (filed by part B: bare "Failed to load category") |
| Category detail | member | dark | 390 | 10 states; 10 captures, no sideways scroll | Findings: #331 (filed by part B: bare "Failed to load category") |
| Category detail | member | dark | 1440 | 10 states; 10 captures, no sideways scroll | Findings: #331 (filed by part B: bare "Failed to load category") |
| Accounts | owner | light | 390 | 13 states; 13 captures, no sideways scroll | Findings: #344, #346, #341, #352, #349 |
| Accounts | owner | light | 1440 | 13 states; 13 captures, no sideways scroll | Findings: #344, #346, #341 |
| Accounts | owner | dark | 390 | 13 states; 13 captures, no sideways scroll | Findings: #344, #346, #341, #352, #349 |
| Accounts | owner | dark | 1440 | 13 states; 13 captures, no sideways scroll | Findings: #344, #346, #341 |
| Accounts | admin | light | 390 | 13 states; 13 captures, no sideways scroll | Findings: #344, #346, #341, #352, #349 |
| Accounts | admin | light | 1440 | 13 states; 13 captures, no sideways scroll | Findings: #344, #346, #341 |
| Accounts | admin | dark | 390 | 13 states; 13 captures, no sideways scroll | Findings: #344, #346, #341, #352, #349 |
| Accounts | admin | dark | 1440 | 13 states; 13 captures, no sideways scroll | Findings: #344, #346, #341 |
| Accounts | member | light | 390 | 13 states; 13 captures, no sideways scroll | Findings: #344, #346, #351, #352 |
| Accounts | member | light | 1440 | 13 states; 13 captures, no sideways scroll | Findings: #344, #346, #351 |
| Accounts | member | dark | 390 | 13 states; 13 captures, no sideways scroll | Findings: #344, #346, #351, #352 |
| Accounts | member | dark | 1440 | 13 states; 13 captures, no sideways scroll | Findings: #344, #346, #351 |

### States checked on each page (every one at 390 and 1440, light and dark, owner / admin / member, unless noted)

**Dashboard** (5)
- `dash`: Dashboard
- `dash-customize`: Customize mode (desktop only)
- `dash-networth-range`: Net worth range menu
- `dash-error`: Server unreachable
- `dash-loading`: Loading

**Transactions** (20)
- `tx`: List (default)
- `tx-search`: Search "Costco"
- `tx-nomatch`: Search with no match (empty)
- `tx-filters`: Filters panel
- `tx-date`: Date panel
- `tx-sort`: Sort menu
- `tx-add`: Add transaction
- `tx-add-invalid`: Add transaction, saved empty
- `tx-detail`: Transaction detail
- `tx-detail-split`: Split transaction detail
- `tx-select`: Select / bulk edit mode
- `tx-manual-import`: Manual import dialog
- `tx-filter-menu`: Filters sheet, type menu open
- `tx-filtered`: Category filter and date applied
- `tx-bulk-edit`: Bulk edit sheet (two selected)
- `tx-bulk-delete`: Bulk delete confirmation (two selected)
- `tx-delete-confirm`: Delete one transaction, confirmation
- `tx-splits`: Edit splits dialog
- `tx-error`: Server unreachable
- `tx-loading`: Loading

**Account detail** (13)
- `ad`: Account (Joint Checking)
- `ad-liability`: Liability with no transactions (Jane's Visa)
- `ad-filters`: Filters panel
- `ad-date`: Date panel
- `ad-update-balance`: Update balance
- `ad-balance-empty`: Update balance, field cleared
- `ad-txn`: Transaction detail
- `ad-filtered`: Category filter and date applied
- `ad-nomatch`: Search with no match
- `ad-liab-txns`: Liability with transactions (John's Visa)
- `ad-missing`: Account that does not exist
- `ad-error`: Server unreachable
- `ad-loading`: Loading

**Category detail** (10)
- `cd`: Category (Groceries)
- `cd-yearly`: Yearly view
- `cd-income`: Income category (Take Home Pay)
- `cd-group`: Category group (Daily Living)
- `cd-nodata`: Category with no transactions
- `cd-transfer`: Transfer category
- `cd-refund-only`: Refund-only category (Gifts: Holidays)
- `cd-missing`: Category that does not exist
- `cd-error`: Server unreachable
- `cd-loading`: Loading

**Accounts** (13)
- `ac`: Accounts (default)
- `ac-filters`: Filters panel
- `ac-add`: Add account
- `ac-range`: Net worth range / metric menu
- `ac-percent`: Summary as percent
- `ac-asset-add`: Add physical asset
- `ac-asset-edit`: Edit physical asset
- `ac-filtered`: Account filter applied
- `ac-collapsed`: Account groups collapsed
- `ac-asset-delete`: Delete asset, confirmation
- `ac-refresh`: Refresh all balances
- `ac-error`: Server unreachable
- `ac-loading`: Loading

Login states (signed out): default, wrong password, server unreachable, two-step code (login answered locally), wrong two-step code, backup code. First-run Setup (setup status answered locally): form, mismatched passwords. Two-step setup (real page, per role): intro, scan step with the real key and QR from the server, wrong code (real 400 from the server), backup codes (confirm call answered locally). A member also has these four, since the page opens for any signed-in person.

### Role and permission checks

- **Member, hidden as expected:** Delete transaction, bulk Select / Edit multiple, bulk delete, asset Edit/Delete (but see #351: Add account, asset Add and pencils are hidden rather than disabled). **Member, allowed as expected:** Add transaction, Manual import, Update balance, Refresh all, filters, search, all read views. A member sees the household's transactions and accounts (a household permission, not a privacy boundary).
- **Admin = owner** on all five pages (page text and controls identical apart from name and personal investment figures, see #342).
- **Delete, bulk delete, delete transaction** each ask before deleting (two-step); the exceptions are #341 (asset Delete) and #350 (Unsplit).

## Findings

All have a GitHub issue (`status:needs-prep`, blocking #112, base `feature/platform-retheme`). Screenshot names are in `screenshots/part-a/`.

| # | Severity | Page · who · width | Finding | Issue | Evidence |
| --- | --- | --- | --- | --- | --- |
| A1 | **High** | Accounts · owner, admin · both | Delete in the Edit asset window deletes the asset on one click, no confirmation (net worth drops $10,087.11) | #341 | `H1-asset-edit-dialog-owner-light-1440`, `H1-asset-deleted-no-confirm-owner-light-1440` |
| A2 | Medium | Dashboard · all roles · both | Investments card total differs per person ($74,917 owner, $80,878 admin, "Link an investment account…" for the member) and none matches Accounts ($155,794.13) | #342 | `M6-dashboard-investments-owner/admin/member-light-1440` |
| A3 | Medium | Transactions · all · both | "No transactions found for this period" shows while loading and after a failed load; no way forward | #343 | `M2-transactions-loading-…`, `M2-transactions-error-…` |
| A4 | Medium | Accounts · all · both | A failed load leaves a spinner forever | #344 | `M3-accounts-error-spinner-…` |
| A5 | Medium | Account detail · all · both | Any load failure says "This account doesn't exist" | #345 | `M4-account-detail-error-…` |
| A6 | Medium | Sign-in, Transactions, Accounts · all · both | Raw "Failed to fetch" / "fetch failed" shown to people | #346 | `M1-signin-failed-to-fetch-…`, `M1-refresh-fetch-failed-…` |
| A7 | Medium | Account detail · all · both | Balance chart y-axis repeats "$8k" five times | #347 | `M5-account-chart-axis-owner-light-1440` |
| A8 | Medium | Account detail · all · both | "Enter a valid balance" is a toast away from the field | #348 | `M9-update-balance-toast-…` |
| A9 | Medium | Accounts, Account detail · owner/admin (Update balance: all) · 390 | Add account and Update balance sheets autofocus their field (PRODUCT.md says not to) | #349 | `M8-add-account-autofocus-…`, `M8-update-balance-autofocus-…` |
| A10 | Medium | Transactions · owner, admin · both | Unsplit removes every split with one click | #350 | `M16-unsplit-button-…` |
| A11 | Medium | Accounts · member · both | Add account / asset Add / pencils hidden, PRODUCT.md says add/edit stay disabled outside Settings (Robert to confirm) | #351 | `M10-member-no-add-account-light-1440` |
| A12 | Medium | Accounts · all · 390 | Physical Assets rows cut the cost off ("cos…") | #352 | `M7-phone-asset-cost-cut-off-…` |
| A13 | Medium | Account detail · all · 390 | Filters 36px, search field 23px, Clear 20px, Clear search 32px | #353 | `M12-account-detail-toolbar-…` |
| A14 | Medium | Dashboard · all · 390 | Net worth range menu rows 36px | #354 | `M13-dashboard-range-menu-…` |
| A15 | Medium | Sign-in two-step · signed out · 390 | "Use a backup code" / "Back to sign in" 20px | #355 | `M14-signin-two-step-links-…` |

Already filed by the other parts and found here too, so not filed again: **#340** (phone controls under 44px in shared sheets: Transactions Filters sheet rows 36px, Manual import chips 36px, Date sheet calendar buttons 40px, Open splits 36px, Split 20px, Split across categories 20px; Add asset method buttons 34px) and **#331** (Category detail shows the bare line "Failed to load category" when its data call fails; with a failed call the Back to budget button is the only way forward). #327 says phone bottom sheets don't close on Escape: every sheet on these five pages (Filters, Date, Sort, Add transaction, Manual import, Update balance, Add account) closed on Escape at 390 in this run, so that issue is probably limited to other sheets.

## Checked against the designs

| Design | Where | Result |
| --- | --- | --- |
| `231-account-filters` | Account detail card: search, Date and Filters in the card header; summary line with Clear; "11 matching" wording; no-match, no-transactions, error states | Matches for default, filtered (badge, primary-border Date, summary line + Clear), search no-match ("Nothing matches “…”"), no-transactions ("No transactions for this account." + View all), and the in-card error. One deviation: when the **account itself** fails to load the page says "doesn't exist" (#345). |
| `310-filter-type-picker` | Phone Filters sheet: pinned search, "N filters selected", "Filter by: Categories ▾" menu, no picker on Accounts (one type) | Matches (Transactions and Account detail show the picker; Accounts shows none). |
| `319-transactions-review-strip` | Phone Transactions: one-line strip "45 transactions need review · Review ›" under the toolbar; filter icon with count badge, Date as a calendar icon with primary border when set; "Clear all" in the pinned toolbar; strip hidden in Select mode | Matches, light and dark. |
| `226-phone-sheets-rows` / `109-phone-tables-forms` | Sheets with drag handle, pinned footer, 92dvh; rows as card rows; 64px rows; Account detail and Category detail as card rows | Sheets and rows match. 44px rule: see #353, #354, #355, #340. Phone Physical Assets row: #352. |
| `106-uncategorized` | Dashboard Spending note "Includes $37 uncategorized · Review" (blue link, 44px tap area); Dashboard Budget card includes it | Matches. |
| `104-settings`, `309-budget-year-cards` | Settings (part C) and Budget Year (part B). The Budget Year error card is the pattern the fixes above reuse | Not on these pages. |

## Low findings

One line each (not filed):

- Phone search fields on Transactions and Account detail show a square focus outline inside the rounded field.
- Desktop Transactions search field has no accessible name (placeholder only).
- An empty search says it twice ("Nothing matches “zzqqxx”" and "No transactions" / "0 transactions" under it).
- Phone Add transaction: the Account select text is cut ("Jane's Checking (…") at 390.
- Add transaction opens with Account set to the first account in the list (Jane's Checking for John), not an account of the signed-in person.
- Add / Edit asset: "Acquired" uses the browser's own date input while every other date field uses the app's calendar; "Annual rate" slider is 17px tall on phones.
- Transaction detail on phones: "Copy statement" is 32px (not on #340's list).
- Category detail for a category with no data, or only refunds, draws the y-axis as "$1 $1 $0 $0".
- Category detail for a category that doesn't exist says "Failed to load category" instead of "Category not found" (the not-found wording exists in code but is never reached).
- Phone liability chart (Jane's Visa): x-axis labels touch ("Sep 12Sep 18").
- Category detail on desktop truncates the account name ("John's Mastercard (…") with room to spare.
- Add account and Update balance windows return focus to the page, not the button that opened them, after Escape (desktop).
- On desktop, toasts cover the top-right header buttons (Filters, Refresh all, Add account) until they time out.
- Add account fires four failing `/api/simplefin/connections/N/accounts` calls (500) on the sample's demo connections each time it opens; nothing shows on screen.

## Could not be checked with the sample data

Recorded as findings of this audit, not skipped:

- **First-run Setup, submit:** it only appears on an empty database. The form, its validation and both themes/widths were checked with the setup-status call answered locally; creating the owner end to end was not.
- **Two-step code at sign-in:** nobody in the sample has two-step on, so the code screen was reached by answering the sign-in call locally; entering a real code was not tested. The two-step **setup** page was real up to the final confirm.
- **Empty accounts / empty Dashboard / empty Transactions** (no data at all): not reachable (the seed always fills them). Per-account and per-search empty states were checked.
- **Other member permission presets** (View only, Everything except managing people): the sample has one limited member (everyday permissions).
- **Delete asset as admin:** same code path as owner (checked as owner); not repeated because the sample asset was gone after the owner test.
- Colour contrast, Tab order and screen-reader behaviour were not measured.
