# Log: one-row phone toolbars (#294)

- 2026-10-12: Built to design `design/226-phone-sheets-rows/` (Version A + F1). Transactions phone toolbar is one 44px row
  (search icon, Date, Sort, Select, review chip); search expands in place with Filters inside (44px). "Clear all" line below
  the toolbar only while something is active. Review: search icon, Date, Users, Approve all in one row.
- Decisions: Sort always reads "Sort" on phones (the sheet ticks the choice; the border shows it is set), so the row cannot overflow.
  Date label truncates. `DateRangePopover.tsx` got a truncating label span (outside the expected paths; no look change on desktop).
- Select mode keeps today's search field plus "Select transactions" / Cancel rows.
