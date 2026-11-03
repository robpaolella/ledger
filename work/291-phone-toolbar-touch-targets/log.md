# Log: 291 phone toolbar touch targets

## 2026-10-12
- Reports, Recurring, Review and Investments toolbar controls are 44px on phones, using `.tap-grow`, `.tap-grow-sq`, `.tap-area` (index.css, unchanged) and the shared-pattern track for Reports' MiniToggle. Desktop untouched: all are phone-only.
- `DateRangePopover` trigger (shared with Transactions) also gets `tap-grow`: it is the Reports "Year to date" button.
- Tap check at 390 on sample data, before: 40+ controls under 44px; after: none on Reports (breakdown, trends, timeline), Recurring (month list, calendar), Review, Investments; no overlaps.
- Known false positive: Recurring "All recurring" row-name buttons report ~21px high; their real tap area is the whole row (`after:absolute inset-0`), which the script can't see. Rows belong to T28e.
