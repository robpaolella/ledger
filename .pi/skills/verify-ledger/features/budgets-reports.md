# Budgets and reports

## Sub-features

- Monthly budget amounts, actuals, category expansion and household/owner filtering.
- Budget templates, recurring items and pay-cycle flows when relevant to the change.
- Annual reports, monthly category detail and annual totals on phone.

## How to get to it (user POV)

Desktop sidebar: Budget (`/budget`) and Reports (`/reports`). Phone: Budget tab;
More → Reports. Dashboard income/expense summaries are another comparison point.

## Driving it with chrome-devtools-axi

- Snapshot Budget; select March 2026 with the visible month/year controls. Expand
  a category and compare planned/actual values; switch All/owner filters and confirm
  shared accounts are not counted twice in the household total.
- Edit one planned amount, save through the UI, reload and check persistence. Repeat
  as member: the default fixture permits budget editing. Capture empty future-month
  and populated March states, not only the convenient one.
- Open Reports, choose 2026, expand categories, and compare March totals with Budget.
  At 390 wide use the monthly detail/month selector and Annual Totals views; at 1440
  inspect the annual table. Capture refund/negative-actual display if affected.
- For templates/recurring/pay-cycle work, open the corresponding visible Budget
  controls and prove their saved result in a second monthly view; extend this map
  with the exact new path rather than assuming the monthly edit proves it.

## Gotchas

Seed dates are fixed, not today. A current-month empty state is expected. Shared
ownership is a junction, not a single owner field. Negative actuals are legitimate
refunds and must remain visible. Default member budget access is allowed; change
permissions through the owner UI on this throwaway instance to test a denied state.
