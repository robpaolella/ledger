/** Seeds transaction-calibrated budgets, matching recurring items, and alerts. */
import type { Helpers } from './helpers.js';
import type { PeopleAccounts } from './people-accounts.js';
import type { Categories } from './categories.js';
import { findOrCreateMerchant } from '../merchants.js';
import { sampleMerchantName } from './merchants.js';

const FIXTURE_MONTHS = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03',
];

const EXPENSE_CATEGORIES = (CAT: Categories) => [
  CAT.rent, CAT.groceries, CAT.dining, CAT.fuel, CAT.pets, CAT.personalSupp,
  CAT.clothes, CAT.books, CAT.hobby, CAT.otherEnt, CAT.medicine, CAT.doctor,
  CAT.furnishings, CAT.maintenance, CAT.autoIns, CAT.autoLoan, CAT.internet,
  CAT.phone, CAT.power, CAT.water,
];

function expenseActuals(db: Helpers['db'], month: string): Map<number, number> {
  const [year, m] = month.split('-').map(Number);
  const end = `${month}-${String(new Date(year, m, 0).getDate()).padStart(2, '0')}`;
  const rows = db.prepare(`
    SELECT category_id, COALESCE(SUM(amount), 0) AS total
    FROM (
      SELECT t.category_id, t.amount FROM transactions t
      WHERE t.category_id IS NOT NULL AND t.date >= ? AND t.date <= ?
      UNION ALL
      SELECT ts.category_id, ts.amount FROM transaction_splits ts
      JOIN transactions t ON t.id = ts.transaction_id
      WHERE t.category_id IS NULL AND t.date >= ? AND t.date <= ?
    ) GROUP BY category_id
  `).all(`${month}-01`, end, `${month}-01`, end) as Array<{ category_id: number; total: number }>;
  return new Map(rows.map(row => [row.category_id, row.total]));
}

export function seedBudgets({ db, rel }: Helpers, CAT: Categories) {
  console.log('Creating budgets...');
  let budgetCount = 0;
  const expenses = EXPENSE_CATEGORIES(CAT);
  const actualsByMonth = FIXTURE_MONTHS.map(fixtureMonth => expenseActuals(db, rel(fixtureMonth)));
  // The launch month is intentionally clipped at today. Its budget must not
  // shrink with the launch day, so use the highest completed-month actual for
  // each category as a stable, transaction-calibrated target instead.
  const launchMonthTargets = new Map<number, number>();
  for (const categoryId of expenses) {
    launchMonthTargets.set(categoryId, Math.max(...actualsByMonth.slice(0, -1)
      .map(actuals => Math.max(0, actuals.get(categoryId) ?? 0))));
  }

  for (const [monthIndex, fixtureMonth] of FIXTURE_MONTHS.entries()) {
    const month = rel(fixtureMonth);
    const actuals = actualsByMonth[monthIndex];
    const overBudgetIds = new Set(expenses
      .filter(categoryId => categoryId !== CAT.rent && (actuals.get(categoryId) ?? 0) > 0)
      .slice(0, monthIndex < 6 ? 1 : monthIndex < 8 ? 3 : 0));
    for (const categoryId of expenses) {
      const actual = Math.max(0, actuals.get(categoryId) ?? 0);
      const target = monthIndex === FIXTURE_MONTHS.length - 1
        ? launchMonthTargets.get(categoryId) ?? 0
        : actual;
      // The two completed months before the launch month deliberately show
      // several overspends; older ones provide read notification history.
      const amount = categoryId === CAT.rent ? 1400 : +((target || 25) * (overBudgetIds.has(categoryId) ? 0.8 : 1.2)).toFixed(2);
      db.prepare('INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, ?)')
        .run(categoryId, month, amount);
      budgetCount++;
    }
    db.prepare('INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, ?)')
      .run(CAT.takeHomePay, month, 6500);
    budgetCount++;
  }

  console.log(`  Created ${budgetCount} budget entries`);
  return budgetCount;
}

/** Day of the month `daysAhead` days after `today` (YYYY-MM-DD), capped at month end, so a bill can fall due soon. */
function dayOfMonthAfter(today: string, daysAhead: number): number {
  const [y, m, d] = today.split('-').map(Number);
  // Stay in this month: the Recurring page shows one month at a time.
  return Math.min(d + daysAhead, new Date(y, m, 0).getDate());
}

export function seedRecurring(
  { db, rel, today, catId }: Helpers,
  { johnId, janeId, jChecking, jaChecking }: PeopleAccounts,
  CAT: Categories,
) {
  console.log('Creating recurring items...');
  const recurringDefs: Array<{
    type: 'income' | 'expense'; label: string; merchant: string; category: number; account: number;
    amount: number; freq: 'monthly' | 'semi_monthly' | 'every_n_months'; day?: number; days?: number[]; user: number;
    interval?: number; anchor?: string; start?: string; status?: 'active' | 'paused';
  }> = [
    { type: 'income', label: 'Paycheck — John', merchant: 'Direct Deposit — Payroll', category: CAT.takeHomePay, account: jChecking, amount: 1750, freq: 'semi_monthly', days: [2, 16], user: johnId },
    { type: 'income', label: 'Paycheck — Jane', merchant: 'Direct Deposit — Payroll', category: CAT.takeHomePay, account: jaChecking, amount: 1500, freq: 'semi_monthly', days: [2, 16], user: janeId },
    { type: 'expense', label: 'Rent', merchant: 'Oakwood Apartments', category: CAT.rent, account: jChecking, amount: 1400, freq: 'monthly', day: 1, user: johnId },
    // Extra states: due within three days, paused, and yearly (every 12 months). Each has
    // a matching generated transaction in the previous month (see transactions.ts).
    { type: 'expense', label: 'Health plan premium', merchant: 'Larkspindle Insurance', category: CAT.healthIns, account: jChecking, amount: 285, freq: 'monthly', day: dayOfMonthAfter(today, 2), start: rel('2026-02-01'), user: johnId },
    { type: 'expense', label: 'Monthly pledge', merchant: 'Pebblewisp Cafe', category: catId('Gifts', 'Donations'), account: jChecking, amount: 40, freq: 'monthly', day: 20, user: johnId, status: 'paused', start: rel('2026-02-01') },
    { type: 'expense', label: 'Estimated state tax', merchant: 'Ferncairn Finance', category: catId('Tax Not Withheld', 'State'), account: jChecking, amount: 640, freq: 'every_n_months', day: 15, interval: 12, anchor: rel('2026-02-15'), start: rel('2026-02-01'), user: johnId },
  ];
  for (const r of recurringDefs) {
    db.prepare(
      `INSERT INTO recurring_items (type, label, merchant_id, category_id, account_id, amount, freq_kind, day, days_json, interval, anchor_date, start_date, status, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(r.type, r.label, findOrCreateMerchant(sampleMerchantName(r.merchant), db), r.category, r.account, r.amount, r.freq,
      r.day ?? null, r.days ? JSON.stringify(r.days) : null, r.interval ?? null, r.anchor ?? null,
      r.start ?? rel('2025-07-01'), r.status ?? 'active', r.user);
  }
  console.log(`  Created ${recurringDefs.length} recurring items`);
}

export function seedBudgetAlerts({ db, rel }: Helpers, CAT: Categories) {
  console.log('Creating budget alerts...');
  const insertAlert = db.prepare('INSERT INTO budget_alerts (category_id, month) VALUES (?, ?)');
  const insertNotification = db.prepare(`
    INSERT INTO notifications (user_id, type, severity, title, body, action_label, action_target, dedupe_key, is_read)
    VALUES (?, 'budget_exceeded', 'warning', ?, ?, 'View budget', '/budget', ?, ?)
  `);
  const users = db.prepare('SELECT id FROM users WHERE is_active = 1').all() as Array<{ id: number }>;
  let alertCount = 0;

  for (const [monthIndex, fixtureMonth] of FIXTURE_MONTHS.entries()) {
    const month = rel(fixtureMonth);
    const actuals = expenseActuals(db, month);
    const budgets = db.prepare('SELECT category_id, amount FROM budgets WHERE month = ?').all(month) as Array<{ category_id: number; amount: number }>;
    for (const budget of budgets) {
      const category = db.prepare("SELECT display_name, type, exclude_from_budget FROM categories WHERE id = ?").get(budget.category_id) as { display_name: string; type: string; exclude_from_budget: number } | undefined;
      if (!category || category.type !== 'expense' || category.exclude_from_budget) continue;
      // Rent's recurring floor equals its seeded manual amount; the other recurring
      // expenses are in categories without budget rows, so only Rent needs the floor.
      const effectiveBudget = budget.category_id === CAT.rent ? Math.max(budget.amount, 1400) : budget.amount;
      const overage = (actuals.get(budget.category_id) ?? 0) - effectiveBudget;
      if (overage <= 0.005) continue;
      insertAlert.run(budget.category_id, month);
      const dedupeKey = `budget_exceeded:${budget.category_id}:${month}`;
      const body = `You've exceeded your ${category.display_name} budget by $${overage.toFixed(2)}.`;
      for (const user of users) {
        insertNotification.run(user.id, `Over budget: ${category.display_name}`, body, dedupeKey, monthIndex < 6 ? 1 : 0);
      }
      alertCount++;
    }
  }
  console.log(`  Created ${alertCount} budget alerts`);
  return alertCount;
}
