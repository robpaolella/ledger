# Transactions and import

## Sub-features

- Transaction search, account/type/category/date filters, pagination, manual add/edit.
- Splits, refunds, transfers, bulk editing and deletion (role-dependent).
- CSV upload/mapping/review/import; duplicate and transfer detection; bank-sync tab.

## How to get to it (user POV)

Desktop: Transactions or Import in the sidebar. Dashboard also has Transaction
and View All. Phone: Transactions tab and floating + Transaction; More → Import.
Routes are `/transactions`, `/import`, and `/` for the dashboard entry points.

## Driving it with chrome-devtools-axi

- As John, snapshot Transactions. Fill **Search transactions...** with `Costco`;
  expect matching rows/cards; clear it and expect 91 seeded transactions again.
- Choose **Add Transaction** (phone: **+ Transaction**), fill the visible account,
  date, description, category and amount controls. Use a unique synthetic description.
  Save, search for it, reload, and reopen it: all entered values must persist.
- Open **Amazon — Mixed Order** to inspect split categories. Search **Amazon Refund**
  to confirm a negative expense remains an expense, not income.
- Import: choose CSV, upload a synthetic CSV saved under the evidence folder via
  `upload @<current-file-input-ref> <path>`, map date/description/amount columns,
  select a seeded account, review category/duplicate/transfer flags, then import.
  Return to Transactions and find the new rows. Repeat the CSV to prove duplicate
  handling. Use a tiny file, e.g. Date,Description,Amount with one synthetic purchase.
- As member, Add Transaction remains available; Bulk Edit/delete must not be available.
  Capture the allowed and restricted states rather than treating hidden controls as errors.

## Gotchas

Use All Time or a January–March 2026 date range for seed data. Select category type,
not amount sign, to distinguish income/expense. Bank and card CSV signs differ;
include parenthesized negatives if changing import parsing. Never upload real CSVs
or configure SimpleFIN. Transfers and splits need their own proof when touched;
this starter recipe is not a substitute for the reimbursement-splits e2e check.
