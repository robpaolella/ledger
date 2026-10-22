# Ledger v2.0.0

<!-- Draft for Robert to edit, then paste into the GitHub release. Delete this comment first. -->

Ledger v2.0.0 is a full retheme. Every page now looks and behaves the same way, in light and dark, on a phone and on a desktop. Money is shown one consistent way everywhere, and the phone has its own layouts, with bottom sheets, larger tap targets and one-row toolbars, instead of a squeezed desktop. Every page was checked as the owner, an admin and a limited member before release, and Settings now shows each person only what they can use.

## What's new

**Dashboard**
- Customize mode: drag cards into the order you want, then tap Done, or Reset layout to start over.
- Spending and Budget cards now count money that has no category yet, with a note and a link straight to Review.

**Transactions**
- Open any transaction in a clear detail window (a bottom sheet on a phone), with keyboard access throughout.
- On a phone: select several transactions to edit or delete them together, Filters, Date and Sort open as bottom sheets, and the review count is a full-width strip.
- Ask before splitting is undone, so a split is not lost by accident.

**Budget**
- Saving a budget asks whether it is for this month only or this month and after, and budgets carry forward on every page that uses them.
- Group headers have icon tiles, and colours match meaning.
- On a phone, the Year view shows one month at a time.
- A notice shows how much uncategorized money is counted in the totals.

**Accounts**
- Add an account from the Accounts page.
- Filter an account's transactions on its detail page, and carry those filters into Transactions.
- Credit card balances show as the amount owed, and a card in credit counts as money you have in net worth.
- Deleting an asset asks first.

**Reports**
- Uncategorized money is shown on Reports, with a Saved segment and a plainer breakdown bar.
- On a phone the Timeline shows one month or week at a time.
- The transactions list loads 50 at a time.
- The CSV export has a Type column.

**Reviews and Recurring**
- Every uncategorized transaction has a Review item, and Review can be opened for a date period.
- Approve all has a clearer confirmation, and Mark reviewed explains why an uncategorized transaction can't be marked.
- Recurring has account logos, a readable list with an Edit column, a phone calendar with a dot on each busy day, and honest "Due date passed" wording.

**Import**
- CSV rows are checked and imported all-or-nothing, so a bad file never leaves a half-finished import.
- Unreadable amounts are flagged instead of importing as $0.00, and rows skipped for lack of a category are explained.
- On a phone, import has its own step layout and review cards.

**Investments**
- Holdings are grouped rows on a phone.
- Everyone in the household sees every household investment account, and empty selections say so honestly instead of showing $0.00.
- The Market card's return, its Today figure and the chart's portfolio line now come from your holdings' prices, so money you put in or take out no longer counts as gain or loss. They match the Holdings Total.

**Settings, people and sign-in**
- A grouped Settings menu that shows only what you can use.
- New panels: Notifications (including a per-person over-budget alert), Rules (search, delete and muted merchants), Optional extras (AI, Amazon and benchmark cards), and Bank sync with one honest status per connection and a Daily sync card.
- Member access comes in clear levels, with honestly named switches. Each person opens in a pop-up window or bottom sheet.
- Sign-in, first-time setup and two-step screens follow your theme. On a phone, two-step setup leads with the setup key.
- Sync-failure alerts go only to people who can see Bank sync.
- A proper browser tab icon and a home-screen icon.

## Improved

- Plain-English wording for reviews, filters, empty searches, logo fetching and the "can't reach Ledger or your bank" message.
- Pages that fail to load show a Try again card instead of an empty page or blank totals.
- Better contrast for muted text, the light warning colour and the dark primary button.
- Date filters accept typed dates, and their calendar is no longer clipped.
- At least 44px tap targets across Settings, sheets, the dashboard menu, Budget, Accounts, Reports, Recurring and sign-in links on a phone.
- Delete confirmations no longer break the footer of the window they open in.
- Charts on a phone have clearer labels and sensible heights. Budget amounts and day totals are larger, and long Budget names wrap.
- Categories without their own emoji or colour use their group's.

## Upgrading

- **Your data upgrades itself.** Start v2.0.0 on an existing v1.0.x database and it updates the database on first start. This was tested against a v1.0.2 database with every row checked afterwards.
- **Back up first.** Stop Ledger, then copy the whole folder where Ledger keeps its data (the one your Docker setup shares with the container) somewhere safe. Copy everything in it, including the files ending in `-wal` and `-shm`, because the newest changes live there. Don't rely on the built-in backup command, which misses them.
- **Docker:** the standard Docker setup uses `robpaolella/ledger:latest`, so pull and restart. To pin a version, use the `v2.0.0` tag on Docker Hub or GHCR.
- **Nothing else to change.** No new settings or environment variables are required, and your sign-ins and your two-step setup carry over.
- To go back, stop Ledger, restore your copy of the data folder and start the older image.
