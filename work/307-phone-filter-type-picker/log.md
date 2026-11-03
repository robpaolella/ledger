# Log: #307 phone Filters type picker

- 2026-10-12: Built design 310 revision 1 (version B). Phone only: pinned search, count line and "Filter by" dropdown via a new optional `pinned` area on `BottomSheet`. Desktop pop-up markup unchanged (header/nav/list/selected panes just split into variables).
- Type counts and per-page type lists live in `filterModel.ts`, tested in `packages/server/test/filter-type-picker.test.ts`.
