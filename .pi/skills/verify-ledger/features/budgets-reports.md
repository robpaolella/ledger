# Budgets and reports

## Sub-features

- Monthly budget amounts, actuals, category expansion and shared accounts.
- Recurring items when relevant to the change.
- Contributions card on Reports (money put in / taken out of tracked accounts; never in any total).
- Annual reports, monthly category detail and annual totals on phone.

## How to get to it (user POV)

Desktop sidebar: Budget (`/budget`) and Reports (`/reports`). Phone: Budget tab;
More → Reports. Dashboard income/expense summaries are another comparison point.

## Driving it with chrome-devtools-axi

- Snapshot Budget; select the launch month and a past populated month with the visible month/year controls. Expand
  a category and compare planned/actual values; recent months include several over-budget categories. Confirm
  shared accounts are not counted twice in the household total.
- Edit one planned amount, save through the UI, reload and check persistence. Repeat
  as member: the default fixture permits budget editing. Capture empty future-month
  and populated launch-month states, not only the convenient one.
- Open Reports, choose the launch year, expand categories, and compare the launch month's totals with Budget.
  At 390 wide use the monthly detail/month selector and Annual Totals views; at 1440
  inspect the annual table. Capture refund/negative-actual display if affected.
- Open Recurring and confirm exactly Paycheck — John ($1,750 semi-monthly), Paycheck — Jane
  ($1,500 semi-monthly), and Rent ($1,400 monthly). Their amounts match the generated
  transactions and Rent's budget floor.
- Contributions: first track a Transfers category in Settings → Contributions (see the
  Settings notes). On Reports the Contributions card shows each tracked category with
  "Put in" and "Taken out" figures and a "Not in totals" tag, in Summary and Timeline
  (phone: one month at a time). Confirm KPI cards, breakdown bar, Net and Savings rate do
  not change with it. Click a row to drill in: the pill reads "Contributions › name", and
  the Transactions card lists from → to rows. Money taken out reads "tracked account →
  paying account" (the client flips the server's accountName/destinationAccountName for
  display). Filtering to one account shows only that account's contributions.
- If the Transactions list on Reports fails to load it shows an error with "Try again",
  not "No transactions"; check it with the network offline.

## Gotchas

Seed dates span the launch month (through today) and its preceding eight months. Shared
ownership is a junction, not a single owner field. Negative actuals are legitimate
refunds and must remain visible. Default member budget access is allowed; change
permissions through the owner UI on this throwaway instance to test a denied state.
