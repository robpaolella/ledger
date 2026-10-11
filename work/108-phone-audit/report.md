# Phone audit (#108)

Every page of Ledger at 390×844 against the DESIGN.md "Phone checklist", on the
verify-ledger synthetic sample data. Branch `docs/108-phone-audit`, built from
`feature/platform-retheme` at `50ba6a7`. Captured 2026-10-10 (the launch month is
October 2026, so "today" in the data is Oct 10).

**Bottom line:** the phone app is in good shape for everyday use: nothing scrolls
sideways at page level (136 captures checked), and the add/edit sheets, Settings menu,
account detail, budget edit and sign-in are right. The problems cluster in five places:
**wide tables that were never turned into card rows** (6 of them, 3 unreadable), **side
drawers and pop-ups where the checklist wants bottom sheets**, **tap targets of 20–36px**,
**amount fields and a few forms without proper styling or keyboards**, and a handful of
real bugs (6 filed as issues).

## How it was done

- Launched with `.pi/skills/verify-ledger` (Doctor PASS), driven with chrome-devtools-axi at
  `resize 390 844` in a fresh named browser, real sign-in for each role. Theme switched
  with the app's own Dark/Light mode control.
- Each capture also ran a script over the live page: page width vs screen width, every
  tappable element's size (against 44px), element positions past the right edge,
  inputs' keyboard and autofill attributes, and amount font sizes. Findings below quote
  those numbers. Tall pages were captured by resizing the window to the page height.
- Roles: John (owner) light and dark for every page and state; Jane (admin) and Sample
  Member on every page whose content or actions differ, in light (see Roles).
- Only the screenshots that back a finding are in `screenshots/`. The full capture set
  (about 200 images plus the measurements) stays local, as the issue asks. No real data
  was used. Merchant and bank logos in the pictures come from the optional logo cache.
- Data changed during the audit through the real UI: one CSV import ("Synthetic Cafe",
  $4.50, hence 46 reviews and slightly different totals in later captures), one category
  change on "Mossquill Pet Clinic", and the admin two-step requirement switched on to
  reach the forced setup page.

## Severity

- **Blocks use**: the task can't be completed or the information can't be read on a phone.
- **Annoying**: works, but is awkward, clipped or hard to hit.
- **Polish**: small and cosmetic.

Checklist numbers: **1** Touch targets, **2** Thumb reach, **3** No sideways scrolling,
**4** Sheets instead of pop-ups, **5** Right keyboard, **6** Sticky action buttons,
**7** Readable numbers, **W** "Wide tables become card rows".

## Page coverage

"Light" and "dark" are owner (John) captures at 390×844; names are the local files in the
evidence folder (`owner-light-<name>.png`, `owner-dark-<name>.png`, with `-full` for the
whole-page version).

| Page / state | Owner light | Owner dark | Admin | Member | Result |
| --- | --- | --- | --- | --- | --- |
| Sign in (`/login`) | `login-light-390` | `login-dark-390` | same | same | Passes: 44px fields, `username` / `current-password` autofill, no auto-capitalisation |
| Two-step setup (`/setup-2fa`) | n/a | n/a | `admin-light-setup2fa`, `-qr` | n/a | Keypad and one-time-code are right; QR is the only prominent path (F30). Shown by switching on the admin requirement; dark not captured |
| First-run setup (`/setup`) | not reachable | | | | Only appears on an empty database; the seed always has users. Not captured |
| Two-step code at sign-in | not reachable | | | | Needs a TOTP for a user with two-step enabled; not driven |
| Dashboard `/` | `dashboard` | `dashboard` | same | same | Passes; F21 |
| Accounts `/accounts` (and `/net-worth` redirect) | `accounts` | `accounts` | same | no Add account button, as intended | F15, F24, F36 |
| Account detail `/accounts/:id` | `accounts-detail` | `accounts-detail` | same | same | Passes (best page in the app). Update balance sheet: F06 |
| Add account sheet | `acc-add` | | | button hidden for member | Passes (pinned footer, numeric last four) |
| Physical assets: add sheet | `acc-asset-add` | | | hidden for member | F06 |
| Transactions `/transactions` | `transactions` | `transactions` | same | same | F36, F40, F35 |
| Add transaction sheet | `tx-add` | `tx-add` | same | same | Passes, except F14 |
| Filters, Date, Sort popovers | `tx-filters`, `tx-date`, `tx-sort` | | | | F12, F13 |
| Transaction detail, Split, rule prompt | `tx-detail`, `tx-split`, `tx-rule-prompt` | `tx-detail` | same | `member-light-tx-detail` | F01, F05, F07, F08; member F02 |
| Manual import sheet | | | | `member-light-tx-manualimport` | Passes |
| Review `/reviews` | `reviews` | `reviews` | same | same | F09, F11, F42 |
| Review detail, Approve all, Date menu | `reviews-detail`, `-approveall`, `-date` | `reviews-detail` | | | F09, F11 |
| Budget, Month `/budget` | `budget` | `budget` | same | same | F20, F36, F37 |
| Budget, edit planned amount (sheet) | `budget-edit` | | | | Passes (pinned footer, decimal keypad) |
| Budget, Year | `budget-year` | `budget-year` | | | F04 |
| Budget category detail `/budget/category` | `budget-category` | `budget-category` | | | Passes; amounts 13px (F37) |
| Recurring, This month (list) | `recurring` | `recurring` | same | same | Passes |
| Recurring, Calendar | `rec-cal` | | | | F19 |
| Recurring, All recurring | `rec-all` | `rec-all` | | | F16 |
| Recurring, Add sheet and item detail | `rec-add`, `rec-detail` | | | | F10, F29 |
| Reports `/reports` | `reports`, `rep-filters`, `rep-date`, `rep-trends`, `rep-timeline` | `reports` | | `member-light-reports` | F17, F38, F39 |
| Investments `/investments` | `investments`, `inv-accounts`, `inv-holding` | `investments` | same | same | F18, F38 |
| Import: CSV (upload, map, review) | `import-csv`, `-map`, `-review` | | | | F03, F33, F34 |
| Import: Bank sync | `import` | `import` | same | same | Passes |
| Notifications and nav drawer | `notifications`, `nav-drawer` | | | | Pass |
| Settings menu `/settings` | `settings-index` | `settings-index` | `admin-light-settings-index` | `member-light-settings-index` | Passes: 50px rows. Member sees Profile, Security, Notifications, Bank sync, Merchants, Rules; admin adds Accounts, Categories, Users, Extras |
| Profile, Security, Notifications | `settings-profile`, `-security`, `-notifications` | same | | | F25. Security sheet for two-step: F30 |
| Settings → Accounts, Bank sync | `settings-accounts`, `settings-bank`, `set-acct-add`, `set-bank-add`, `set-bank-edit` | same | admin sees 6 of 10 connections; member 3 (shared only, "Ask an admin to reconnect") | same | F26. Sheets pass |
| Settings → Categories | `settings-categories`, `set-cat-edit`, `set-cat-create` | same | | panel hidden | F23 |
| Settings → Merchants, Rules | `settings-merchants`, `-rules`, `set-merch-edit` | same | | same | F26, F32 |
| Settings → Users & permissions | `settings-users`, `set-user-john`, `-member`, `-add` | same | `admin-light-set-user-*` | panel hidden | Sheets pass; F41 |
| Settings → Optional extras | `settings-extras` | same | | hidden | F31 |

Roles: owner and admin phone layouts are identical apart from data (compared captures
page by page); admin and owner differ only in Settings (admin can't open the owner's
row, F41; admin sees fewer bank connections). The member differs in actions: no Add
account / Add category, no Users or Extras, no Accounts or Categories in Settings,
transaction detail opens (they can edit) but shows a Delete button they can't use (F02).
Admin and member passes were light only. Dark was checked for the owner.

Dark theme: no finding is dark-only. Colours, contrast and surfaces hold up in every dark
capture; every issue below appears in both themes unless stated.

## Findings

Screenshots are in `screenshots/` (light unless noted). IDs F01–F06 have their own fix issues.

### Area 1. Sheets, panels and pop-ups (checklist 4)

| # | Page / state | Role | Theme | Finding | Item | Severity | Screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | Transactions → detail → Split | owner | both | **Bug.** The Category dropdown is 0px wide (merchant box fixed at 150px, amount at 104px), so a split can't be given a category on a phone. The editor is also a centred pop-up. Fix issue #204 | 3, 4 | Blocks use | `owner-light-tx-split.png` |
| F05 | Transactions → change a category → "Always categorize…?" | owner | light | **Bug.** The prompt is one cramped pill: the sentence wraps into a narrow column, "Never" runs off the right edge, 36px buttons, and it sits over the detail panel's buttons. Fix issue #208 | 1, 3, 4 | Annoying | `owner-light-tx-rule-prompt.png` |
| F07 | Transactions → row detail (and bulk edit) | all | both | Detail is a 440px right-hand drawer, which becomes a full-screen page on a phone: no drag handle, no scrim, no swipe-down to close, close button top right. Everything else with fields (add, edit, accounts, settings) is a proper sheet | 4 | Annoying | `owner-light-tx-detail.png`, `owner-dark-reviews-detail.png` |
| F08 | Split editor shell | owner | light | Centred pop-up with 40px buttons and the original transaction squeezed to "M…" | 4, 6 | Polish | `owner-light-tx-split.png` |
| F09 | Review → row detail | owner | both | Right drawer about 365px wide with a 25px sliver of scrim; same drawer-vs-sheet issue as F07 | 4 | Annoying | `owner-light-reviews-detail.png` |
| F10 | Recurring → item detail | owner | light | Full-width right drawer | 4 | Polish | `owner-light-rec-detail.png` |
| F11 | Review → Approve all confirm | owner | light | Centred pop-up with 40px buttons; the checklist wants a sheet | 4 | Polish | `owner-light-reviews-approveall.png` |
| F12 | Transactions, Reports → Filters and Date popovers | owner | light | Fit the screen, but the tab strip ("Categories / Merchants / Accounts / Amou…") and the date presets ("This month / Last month / Th…") are clipped with no cue that they scroll; filter rows are 36px, presets 43px | 1, 3 | Annoying | `owner-light-tx-filters.png`, `owner-light-tx-date.png` |
| F13 | Transactions → Sort menu | owner | light | Menu touches the left screen edge and its corner is cut off; rows 40px | 1, 4 | Polish | `owner-light-tx-sort.png` |
| F14 | Add transaction → Account dropdown | owner | light | The open list is wider than its field and is cut off at the right edge ("Jane's Emergency Savin…"); long account names are also cut in the field itself | 3, 4 | Annoying | `owner-light-tx-add-category.png` |

### Area 2. Wide tables that are not card rows (W, checklist 3 and 7)

| # | Page / state | Role | Theme | Finding | Item | Severity | Screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F03 | Import → CSV → step 3 Review & Categorize | owner | light | **Bug.** Header cells overlap ("DESCRIPTIONCATEGORY"), the description text and the amount column aren't visible at all, so you can't see what you're importing. Fix issue #206 | W, 3, 7 | Blocks use | `owner-light-import-csv-review.png` |
| F04 | Budget → Year | owner | both | **Bug.** Twelve month columns crushed into 390px: headings and amounts print on top of each other ("$6,500$6,500…"). Fix issue #207 (needs a design decision) | W, 3, 7 | Blocks use | `owner-light-budget-year.png`, `owner-dark-budget-year.png` |
| F16 | Recurring → All recurring | owner | both | Five-column table squeezed into rows: names cut to "Paycheck…" (John's and Jane's are indistinguishable), frequency wraps over two lines | W, 3, 7 | Blocks use | `owner-light-rec-all.png` |
| F17 | Reports → Category breakdown → Timeline | owner | light | Month columns scroll sideways inside the card with no cue; amounts are cut off ("$6,59", "$2,49") | W, 3 | Annoying | `owner-light-rep-timeline.png` |
| F18 | Investments → Holdings | owner | both | A 700px table in a 356px card scrolls sideways; quantity, value and gain are off screen. The "By asset class" chip wraps to three lines | W, 3, 7 | Annoying | `owner-light-inv-holding.png` |
| F19 | Recurring → Calendar | owner | light | Each day is about 50px; items show as an emoji and "$." so name and amount can't be read, and there's no way to see a day's items | 7 | Annoying | `owner-light-rec-cal.png` |

### Area 3. Touch targets (checklist 1)

| # | Page / state | Role | Theme | Finding | Item | Severity | Screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F20 | Budget → Month | owner | both | Planned-amount buttons 76×36, collapse chevron 32px, "Show 1 unbudgeted" row 28px, Month/Year toggle 32px, subcategory name buttons 23px tall | 1 | Annoying | `owner-light-budget.png` |
| F21 | Dashboard | owner | light | "Most recent", "Needs your attention" and "23 assigned to you →" are 20–23px tall; the period dropdown is 40px | 1 | Polish | `owner-light-dashboard.png` |
| F22 | Transactions toolbar | owner | light | Filters icon is 36×36 | 1 | Polish | `owner-light-transactions.png` |
| F23 | Settings → Categories | owner | light | "Edit" 23×20, "Create group" 84×20, "Create category" rows short, drag handle 15×15 | 1 | Annoying | `owner-light-settings-categories.png` |
| F24 | Accounts | owner | light | Period chips (1M…ALL), Totals/Percent, asset "Add" are 32px; the asset edit pencil is 32px | 1 | Polish | `owner-light-accounts.png` |
| F25 | Settings switches | owner | light | Daily sync, over-budget alerts, two-step and AI switches are 44×26 | 1 | Polish | `owner-light-settings-bank.png` |
| F26 | Settings → Bank sync, Merchants | owner | light | Edit and Reconnect buttons are 34px; Rules "Delete" 40px | 1 | Polish | `owner-light-settings-bank.png` |
| F27 | Reports, Recurring, Review, Investments toolbars | owner | light | Segmented controls and chips are 25–32px (Breakdown/Trends 31, Summary/Timeline 32, "Expand all" 20, Recurring tabs 25–27, Investments Market/Allocation 32) | 1 | Polish | `owner-light-rep-trends.png` |

### Area 4. Forms, keyboards and pinned buttons (checklist 5 and 6)

| # | Page / state | Role | Theme | Finding | Item | Severity | Screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F06 | Accounts → account → Update balance; Add asset (Cost, Salvage) | member, owner | light | **Bug.** Amount fields have no field styling (bare browser input / floating "$0.00"); add-asset save button reads "Save changes". Fix issue #209 | 1, 7 | Annoying | `member-light-acct-update-balance.png`, `owner-light-acc-asset-add.png` |
| F29 | Recurring → Add / Edit sheet | owner | light | Cancel and Save are at the end of the scrolling form (top at 908px on an 844px screen), not in a pinned footer. Category, Day, Account and Start date use the browser's own controls, unlike every other form | 6 | Annoying | `owner-light-rec-add.png` |
| F30 | Settings → Security → Enable two-factor; forced setup page | owner, admin | light | The first thing is a QR code to scan, which a phone can't scan from its own screen; the working path is a 14px "Can't scan? Enter the key manually" link, 20px tall. (Code boxes are right: numeric, one-time-code) | 1, 2 | Annoying | `owner-light-set-2fa.png`, `admin-light-setup2fa-qr.png` |
| F31 | Settings → Optional extras; Bank sync token | owner | light | Ollama address and model have no URL keyboard or auto-capitalisation off; the SimpleFIN token field is a plain text area (no keyboard hints set) | 5 | Polish | `owner-light-settings-extras.png` |
| F32 | Settings → Merchants → Edit merchant | owner | light | Three footer buttons fill the width; "Save changes" touches the right screen edge | 6 | Polish | `owner-light-set-merch-edit.png` |
| F33 | Import → CSV → step 2 Map columns | owner | light | "Next" is top right of the card and scrolls away; sign-convention options wrap and clip. Steps 1–3 labels wrap | 2, 6 | Annoying | `owner-light-import-csv-map.png` |
| F34 | Import → CSV → step 1 | owner | light | "Drop your CSV file here" is desktop wording (no drag and drop on a phone); reads "1 transactions" on step 3 (see F03) | – | Polish | `owner-light-import-csv.png` |
| F35 | Transactions → bulk edit | all | n/a | There is no way to select several rows on a phone, so bulk edit can't be reached. The checklist says heavy tasks may be simpler, not missing | – | Annoying | (code: phone branch has no selection) |

### Area 5. Rows, truncation and numbers (checklist 3 and 7)

| # | Page / state | Role | Theme | Finding | Item | Severity | Screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F36 | Transactions, Budget category, Reports list, Accounts | owner | both | The account name in monospace takes a big share of the right side of each row, so descriptions are cut to "Larkspindle Fin…" and "Pebblewisp …". Same on Accounts (names cut to "John's Travel Savings (…1…"), Budget group names ("Auto/Tran…", "Entertain…", "Tax Not W…") and Review reasons ("Uncategorize…") | 3, 7 | Polish | `owner-light-transactions.png`, `owner-light-budget.png` |
| F37 | Budget and day totals | owner | both | List-row amounts are 15px as required, but Budget planned/remaining are 14px, category detail has 13px, day-group totals on Transactions 12px | 7 | Polish | `owner-light-budget.png`, `owner-light-transactions.png` |
| F38 | Reports → Trends; Investments chart | owner | light | The trends chart is about 100px tall with crowded axis labels and similar line colours; the Investments x-axis ends "Oct '" cut off | 7 | Polish | `owner-light-rep-trends.png`, `owner-light-inv-holding.png` |
| F39 | Reports | owner | light | The transaction list at the bottom is up to 1,000 rows (the page is 6,000px tall) | – | Polish | (local `owner-light-reports-full`) |
| F40 | Transactions toolbar | owner | light | The pinned search, Date, Sort and review row takes 117px under a 56px bar: 173px of an 844px screen stays covered while scrolling | 2 | Polish | `owner-light-transactions.png` |
| F42 | Review toolbar | owner | both | Search, Date and Users fill the first line and "Approve all" sits alone on the second | 3 | Polish | `owner-light-reviews-date.png` |

### Area 6. Permissions on the phone

| # | Page / state | Role | Theme | Finding | Item | Severity | Screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F02 | Transactions → detail → Delete transaction | member | light | **Bug.** The member (no delete permission) sees the Delete button; using it ends in "Failed to delete transaction". Fix issue #205 | – | Annoying | `member-light-tx-detail.png` |
| F15 | Accounts app bar | all | both | The filter and refresh icon buttons have no accessible name | – | Polish | `owner-light-accounts.png` |
| F41 | Settings → Users & permissions | admin | light | The owner's row shows a chevron but does nothing when an admin taps it | 1 | Polish | `admin-light-set-user-john.png` |

## What passes (so nobody redoes it)

- No page scrolls sideways at 390 (136 captures).
- Add transaction, Add account, Budget amount edit, Manual import, Update balance (apart from F06), every Settings sheet (Users, Add user, Bank connection, Category, Merchant, Two-step): real bottom sheets with a handle, pinned footer, scroll body.
- Keyboards: money fields use the decimal keypad; the last four of a card and the code boxes use the number pad; sign-in and new/current password use the right autofill; username turns auto-capitalisation off.
- App-bar title and actions, nav drawer (44px rows), notifications, page toolbars pinned under the app bar on Transactions, Budget, Reports, Review, Recurring.
- Account detail, Settings menu and Dashboard read well; list-row amounts are 15px, right-aligned, and the description is what truncates.

## Areas for design sessions and builds

Each area can be designed or built on its own. Suggested order is by how much each one blocks.

1. **Wide tables to card rows** (F03, F04, F16, F17, F18, F19). Biggest gap: six pages, three unreadable. One design decision on how a 12-month grid and a calendar look on a phone, then the card-row rule from DESIGN.md applies. Start with the Import review (F03) and Budget Year (F04) fix issues.
2. **Sheets instead of drawers and pop-ups** (F01 split, F05, F07–F14). Move the transaction detail, Review detail, Recurring detail, Split and the confirm dialogs onto `ResponsiveModal` / `BottomSheet`; fit the popover tab strips and menus on screen. Needs Robert's decision on whether the detail is a sheet or a full page.
3. **Touch targets** (F20–F27). Mostly one rule applied in many places (a 44px hit area around small controls). Budget Month and Categories first.
4. **Forms and keyboards** (F06, F29–F35). Field styling for amount inputs, pinned footer in the Recurring sheet, key-first two-step setup on phones, URL and token keyboards, thumb-reach Next on Import, and a decision on a phone version of bulk edit.
5. **Rows, truncation and numbers** (F36–F42). Give descriptions more room, lift Budget amounts to 15px, tidy the pinned stack and chart sizes.
6. **Permissions on the phone** (F02, F15, F41). Small fixes; F02 has its own issue.

## Fix issues filed

| Issue | Finding | Title |
| --- | --- | --- |
| #204 | F01 | Split transaction category dropdown is invisible on phones |
| #205 | F02 | Hide Delete transaction from members without delete permission |
| #206 | F03 | CSV import review hides description and amount on phones |
| #207 | F04 | Budget Year view overlaps text on phones (needs design) |
| #208 | F05 | "Always categorize" prompt is clipped on phones |
| #209 | F06 | Amount fields in Update balance and Add asset sheets have no field styling |

## Limits

- Real phones use the system picker for native selects and the on-screen keyboard shrinks
  the screen; neither shows in a desktop browser at 390 wide. Keyboard findings come from
  the input attributes, not from watching a keyboard.
- Touch gestures (swipe to close a sheet, drag to reorder categories) were not exercised;
  only the controls and their sizes.
- Dark theme was captured for the owner only. Admin and member were captured in light.
- Not reachable on sample data: first-run Setup, the sign-in two-step code step.
- Sizes below 44px are measured from the page; app-bar icon buttons (40px) are allowed
  by DESIGN.md and are not listed.
