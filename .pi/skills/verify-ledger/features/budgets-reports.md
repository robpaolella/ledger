# Budgets and reports

## Sub-features

- Monthly budget amounts, actuals, category expansion and household/owner filtering.
- Budget templates, recurring items and pay-cycle flows when relevant to the change.
- Annual reports, monthly category detail and annual totals on phone.

## How to get to it (user POV)

Desktop sidebar: Budget (`/budget`) and Reports (`/reports`). Phone: Budget tab;
More → Reports. Dashboard income/expense summaries are another comparison point.

## Driving it with chrome-devtools-axi

- Snapshot Budget; select the launch month and a past populated month with the visible month/year controls. Expand
  a category and compare planned/actual values; recent months include several over-budget categories. Switch All/owner filters and confirm
  shared accounts are not counted twice in the household total.
- Edit one planned amount, save through the UI, reload and check persistence. Repeat
  as member: the default fixture permits budget editing. Capture empty future-month
  and populated launch-month states, not only the convenient one.
- Open Reports, choose the launch year, expand categories, and compare the launch month's totals with Budget.
  At 390 wide use the monthly detail/month selector and Annual Totals views; at 1440
  inspect the annual table. Capture refund/negative-actual display if affected.
- Open Recurring and confirm exactly Paycheck — John ($1,750 semi-monthly), Paycheck — Jane
  ($1,500 semi-monthly), and Rent ($1,400 monthly). Their amounts match the generated
  transactions and Rent's budget floor. For templates/pay-cycle work, prove saved results
  in a second monthly view rather than assuming the monthly edit proves it.

## Gotchas

Seed dates span the launch month (through today) and its preceding eight months. Shared
ownership is a junction, not a single owner field. Negative actuals are legitimate
refunds and must remain visible. Default member budget access is allowed; change
permissions through the owner UI on this throwaway instance to test a denied state.
