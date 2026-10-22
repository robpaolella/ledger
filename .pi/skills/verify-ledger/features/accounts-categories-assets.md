# Accounts, categories and assets

## Sub-features

- Account owners, type/classification, add/edit and dependency-aware deletion.
- Income/expense category groups, subcategories and ordering.
- Net worth, balance snapshots, investment holdings and depreciable assets.

## How to get to it (user POV)

Settings (`/settings`) has Accounts and Categories sections on desktop and drill-through
buttons on phone. Accounts (`/accounts`) shows net worth; `/net-worth` redirects there.
Use the sidebar or phone header menu. Investments has its own `/investments` page.
Dashboard net-worth/liquid-assets cards are additional entry points.

## Driving it with chrome-devtools-axi

- As owner, open Settings → Accounts; inspect Joint Savings (shared ownership).
  Choose Add Account, enter a synthetic name, type, classification and owners, save,
  reload and reopen. Confirm its availability in the Transaction account selector.
- Categories: Add Category, supply a group and subcategory, save, and find it in the
  transaction category picker and Budget. Verify ordering if changing drag/drop.
- Accounts: inspect balances and physical assets; open an account for its details.
  Investments: inspect holdings if present (the current seed has investment accounts,
  but no holdings). Save a synthetic balance through the available account controls,
  reload, and compare Dashboard net worth.
- Add Asset, fill the visible purchase/date/cost fields and depreciation method,
  save and reopen. Test straight-line and declining balance separately when touched.
- As member, account/category/asset creation must be disabled while Update Balances
  is allowed. Capture both widths; phone assets should be cards, not a cramped table.

## Gotchas

Never use real institution logins or balances. Assets are time-sensitive, so record
the observation date. Balances are not transactions: do not flip their signs. Test
cancel before confirming a destructive action; use the UI's inline confirmation,
never browser alerts or direct database deletion.
