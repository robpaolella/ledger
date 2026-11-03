# Log: 229 shared phone touch targets

## 2026-10-11
- Phone (below 768px) sizes: Button/`buttonClasses` `max-md:min-h-11` (+ `min-w-11` icon-only), SegmentedControl 44px track with a 44px invisible per-button area, Switch and the new `.tap-area` class (index.css) give an invisible 44px area, `.tap-grow` / `.tap-grow-sq` for chips and other boxed buttons pages style themselves, app-bar icons (MobileHeader, PageHeader back link) 44px.
- Check: `work/229-touch-targets/tap-check.js` (run steps in its header). Reports controls under 44px and overlapping tap areas at 390px.
- Left for the page parts (hand-built buttons/links/Dropdown triggers, not shared components): Accounts range chips + Add + edit pencils, `Dropdown` triggers (Net worth, Date, 3 Months), Budget row buttons/collapse, Settings Edit/Create links, Bank Disconnect, Reports tabs, Transactions Filters/review chip.
- Tap check at 390 (owner, sample data), commit 8b27e75: no overlapping tap areas on any page checked (budget, dashboard, accounts, settings categories/bank/merchants/notifications, reports incl. Trends, recurring, investments, transactions). Shared controls (SegmentedControl on Accounts, Switch on Notifications, app-bar icons, Back link, Button-built buttons) all report 44px; the remaining under-44 entries are hand-built page controls listed above.
