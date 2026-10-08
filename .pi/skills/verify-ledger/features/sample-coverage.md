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
| Amazon | Settings → Merchants → search Amazon; Transactions → search Amazon | Amazon exists as a national-brand merchant with transactions. Dedicated sample orders/items are not seeded here yet; merchant transactions are not proof of an order-import flow. |
| Budget, Recurring, notifications | Budget (`/budget`), Recurring, and the bell in desktop sidebar or phone header | Nine months of budgets cover 20 expense categories plus Take Home Pay, calibrated against transactions. Recent months include over-budget categories. Recurring has exactly the two paychecks and $1,400 Rent. The bell has read older and mostly unread recent Over budget warnings, each taking you to Budget. |

Capture bank and merchant logos at 390×844 and 1440×900. Confirm the images actually
loaded, not just that an image element exists, and reload/reopen the page to prove
scratch-local uploads persist. Doctor reports the cached image count without exposing
the key. No-key and unsuccessful-download runs should still show readable fallbacks.

Later sample-data tasks add their own coverage recipes when their fixtures merge;
this map deliberately does not claim unmerged review, investment, Amazon-order or
notification datasets exist.
