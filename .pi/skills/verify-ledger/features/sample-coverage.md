# Banks, merchants and sample coverage

These are the fixtures currently merged into `feature/platform-retheme`, not a
promise that every planned sample-data area is populated. Use the sidebar on desktop
or the header navigation menu on phone. Keep all verification synthetic.

| Area | Entry point | Available sample state and proof |
| --- | --- | --- |
| Banks/accounts | `/accounts`; Settings → Accounts (`/settings?panel=accounts`) | 20 accounts across 8 catalog institutions, with John, Jane and shared ownership. Inspect Joint Savings and John's Checking. With logo hydration configured, confirm bank images load at both widths and after reload. Missing upstream logos still use the existing fallback. |
| Merchants | Settings → Merchants (`/settings?panel=merchants`) | 35 national brands plus 150 invented merchants. Search Costco or Amazon for a cached logo; search Larkspindle for invented-name letter badges. The downloaded catalog count is not the number of merchants shown. |
| Reviews/rules | Review (`/reviews`); Settings → Merchants → Edit | Review may begin empty: populated queues and saved categorization rules are not seeded here yet. Merchant editing offers rule creation. Use real UI actions to create synthetic states when testing those flows. |
| Net worth/investments | `/accounts` (also the destination of `/net-worth`); `/investments` | Balance snapshots and five depreciable assets exist; retirement and brokerage accounts do not imply seeded holdings. Investments may show its empty state. Do not connect an outside account to populate it. |
| Amazon | Settings → Merchants → search Amazon; Transactions → search Amazon | Amazon exists as a national-brand merchant with transactions. Dedicated sample orders/items are not seeded here yet; merchant transactions are not proof of an order-import flow. |
| Notifications | Bell in desktop sidebar or phone header | The bell opens the existing notification panel. Dedicated sample unread/read notification scenarios are not seeded here yet; do not assume a badge proves those scenarios are covered. |

Capture bank and merchant logos at 390×844 and 1440×900. Confirm the images actually
loaded, not just that an image element exists, and reload/reopen the page to prove
scratch-local uploads persist. Doctor reports the cached image count without exposing
the key. No-key and unsuccessful-download runs should still show readable fallbacks.

Later sample-data tasks add their own coverage recipes when their fixtures merge;
this map deliberately does not claim unmerged review, investment, Amazon-order or
notification datasets exist.
