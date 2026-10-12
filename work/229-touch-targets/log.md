# Log: 229 shared phone touch targets

## 2026-10-11
- Phone (below 768px) sizes: Button/`buttonClasses` `max-md:min-h-11` (+ `min-w-11` icon-only), SegmentedControl 44px track with a 44px invisible per-button area, Switch and the new `.tap-area` class (index.css) give an invisible 44px area, `.tap-grow` / `.tap-grow-sq` for chips and other boxed buttons pages style themselves, app-bar icons (MobileHeader, PageHeader back link) 44px.
- Check: `work/229-touch-targets/tap-check.js` (run steps in its header). Reports controls under 44px and overlapping tap areas at 390px.
- Left for the page parts (hand-built buttons/links/Dropdown triggers, not shared components): Accounts range chips + Add + edit pencils, `Dropdown` triggers (Net worth, Date, 3 Months), Budget row buttons/collapse, Settings Edit/Create links, Bank Disconnect, Reports tabs, Transactions Filters/review chip.
