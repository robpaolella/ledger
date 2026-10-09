# Banks, merchants and sample coverage

These are the fixtures currently merged into `feature/platform-retheme`, not a
promise that every planned sample-data area is populated. Use the sidebar on desktop
or the header navigation menu on phone. Keep all verification synthetic.

| Area | Entry point | Available sample state and proof |
| --- | --- | --- |
| Banks/accounts | `/accounts`; Settings → Accounts (`/settings?panel=accounts`) | 20 accounts across 8 catalog institutions, with John, Jane and shared ownership. Inspect Joint Savings and John's Checking. With logo hydration configured, confirm bank images load at both widths and after reload. Missing upstream logos still use the existing fallback. |
| Merchants | Settings → Merchants (`/settings?panel=merchants`) | 35 national brands plus 150 invented merchants. Search Costco or Amazon for a cached logo; search Larkspindle for invented-name letter badges. The downloaded catalog count is not the number of merchants shown. |
| Reviews/rules | Review (`/reviews`); Settings → Merchants → Edit | About 25 merchant-matched learned rules, 250 categorization feedback entries (corrections, confirmations, and split legs), and 300 assigned review tasks are seeded. About 45 tasks remain open and their transactions appear in Needs Review; the rest are resolved. Merchant editing still offers rule creation. |
| Net worth/investments | `/accounts` (also the destination of `/net-worth`); `/investments` | Daily balance snapshots and five depreciable assets exist. Investments has 60 holdings with daily history and offline benchmark prices for SPY, VTI, BND, and held symbols; inspect populated history without connecting an outside account. |
| Amazon | Settings → Merchants → search Amazon; Transactions → search Amazon | 25 invented orders with 1–4 generic items are seeded from 25 Amazon card transactions. This includes a refunded Desk Lamp charge, one USB-C Hub + Laptop Stand order split across two charges, and one unmatched order for the existing unmatched-orders view. |
| Budget, Recurring, notifications | Budget (`/budget`), Recurring, and the bell in desktop sidebar or phone header | Nine months of budgets cover 20 expense categories plus Take Home Pay, calibrated against transactions. Recent months include over-budget categories. Recurring has six items: the two paychecks, $1,400 Rent, a Health plan premium due within the next three days (its day follows the seeding date, capped at the month end), a paused Monthly pledge, and a yearly Estimated state tax (every 12 months). The three extras start last month, each with one matching charge then. The bell has read older and mostly unread recent Over budget warnings, each taking you to Budget. |
| Settings: Bank sync and Rules | Settings → Bank sync; Settings → Rules (`/settings`) | Ten synthetic SimpleFIN connections, all with `demo://` addresses that cannot make a network request: the six investment feeds (working, shared or personal to John or Jane), plus Sample checking feed (shared, sync failed, linked to Joint Checking), Sample card feed (John's, sync failed with rate limit, linked to John's Mastercard), Sample savings feed (shared, reconnect needed, linked to Joint Savings) and Sample new feed (shared, working, no linked accounts). Messages are the sentences Ledger stores. A person's personal connections show only to them, so John sees 7 of the 10 and Jane 6; every status is visible to both. The links put a last-synced date on those three accounts on `/accounts`. Daily sync is on with a stored last run (7 new transactions, 10 connections, 3 with problems) at the latest 5:31 am, today's pull marked done so the next run is tomorrow and the scheduler stays idle. Rules shows 40 rules (34 merchant, 3 contains, 3 pattern) and 3 merchants set to "don't ask again" that have no rule. |

Other states for verification: each month, including this one, has at least two uncategorized Venmo rows on the 1st. Jane's Visa has no transactions and a positive latest balance ($212.40, a card in credit; other cards are owed and negative). Gifts: Holidays has only a Target refund this month and no budget. `packages/server/test/fixtures/v1.0.2/` holds a synthetic database in the shape tag v1.0.2 produced (users john/jane), with its rebuild steps, for upgrade checks.

Capture bank and merchant logos at 390×844 and 1440×900. Confirm the images actually
loaded, not just that an image element exists, and reload/reopen the page to prove
scratch-local uploads persist. Doctor reports the cached image count without exposing
the key. No-key and unsuccessful-download runs should still show readable fallbacks.

Settings recipes and limits:

- **`bank-empty`:** Settings → Bank sync → Disconnect every connection through the real UI. The seed deliberately does not start there.
- **`rules-empty`:** Settings → Rules → delete every rule through the real UI. Same: the seed starts with 40.
- **Member without Bank sync access:** the standard Sample Member has Bank sync on, so `GET /api/simplefin/daily-sync` answers 200. Switch off the member's Bank sync permissions through Settings → Users & Permissions first to reach the 403.
- **Daily sync off:** switch it off through the real switch; the seed leaves it on.
- **Not reachable by the seed:** retry times, "N tries today" and "gave up for today". The server derives these from the scheduler's memory of today, not from stored rows. Sync now on a sample connection fails without a network request (the `demo://` address) and flips that connection to failed, so use a throwaway launch.
- **Not seeded:** optional extras (Amazon and benchmarks set up) and notification settings.

Later sample-data tasks add their own coverage recipes when their fixtures merge;
this map deliberately does not claim unmerged review, investment, Amazon-order or
notification datasets exist.
