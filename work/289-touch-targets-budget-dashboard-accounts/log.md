# Log: #289 phone touch targets, Budget / Dashboard / Accounts

2026-10-12
- Used 229a's `.tap-area` (text links, chevrons, collapse toggles, "Show N unbudgeted"), `.tap-grow` (Today, planned-amount buttons, dashboard header pills, Add) and `.tap-grow-sq` (Accounts range chips, pencil).
- Budget row names keep truncation by moving `truncate` onto an inner span, since overflow clips the `.tap-area` pseudo-element.
- Tap check at 390 (`work/229-touch-targets/tap-check.js`): Dashboard, Budget, Accounts all `tooSmall []`, `overlaps []`.
- Review (GPT-5.6 Terra): first pass FIXES (evidence only: needed full-length captures, focus proof); re-check passed.
- Captures need a tall viewport (390x4200 / 1440x3000): the app scrolls inside a fixed-height container, so `--full-page` only gives one screen.
