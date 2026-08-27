import type Database from 'better-sqlite3';
import { getRecurringFloors, effectiveBudgetedAmount } from './recurringBudget.js';
import { upsertNotification, activeUserIds } from './notifications.js';

/**
 * Budget-exceeded notifications with crossing-state semantics: the FIRST time
 * a category's month actual crosses its effective budget, every active user
 * gets an unread notification; later growth only refreshes the body (no
 * re-ping, and a user who cleared it stays clear until next month). The
 * budget_alerts table is the "already alerted this (category, month)" ledger.
 *
 * Callers wrap in try/catch — an alert failure must never fail the write that
 * triggered it.
 */

const EPSILON = 0.005; // ignore float dust

export function checkBudgetExceeded(
  sqlite: Database.Database,
  opts: { month: string; categoryIds?: number[] },
): void {
  const { month, categoryIds } = opts;
  const [year, m] = month.split('-').map(Number);
  if (!year || !m) return;
  const startDate = `${month}-01`;
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  const catFilter = categoryIds && categoryIds.length > 0
    ? `AND id IN (${categoryIds.map(() => '?').join(',')})`
    : '';
  const candidates = sqlite.prepare(`
    SELECT id, display_name FROM categories
    WHERE type = 'expense' AND COALESCE(exclude_from_budget, 0) = 0 ${catFilter}
  `).all(...(categoryIds ?? [])) as { id: number; display_name: string }[];
  if (candidates.length === 0) return;

  const budgetRows = sqlite.prepare(
    'SELECT category_id, amount, COALESCE(override, 0) AS override FROM budgets WHERE month = ?',
  ).all(month) as { category_id: number; amount: number; override: number }[];
  const budgetMap = new Map(budgetRows.map((b) => [b.category_id, b]));
  const floors = getRecurringFloors(month);

  // Split-aware actuals — the same UNION shape as /budgets/summary (no owner filter).
  const actuals = sqlite.prepare(`
    SELECT category_id, coalesce(sum(amount), 0) as total
    FROM (
      SELECT t.category_id, t.amount FROM transactions t
      WHERE t.category_id IS NOT NULL AND t.date >= ? AND t.date <= ?
      UNION ALL
      SELECT ts.category_id, ts.amount
      FROM transaction_splits ts JOIN transactions t ON ts.transaction_id = t.id
      WHERE t.category_id IS NULL AND t.date >= ? AND t.date <= ?
    )
    GROUP BY category_id
  `).all(startDate, endDate, startDate, endDate) as { category_id: number; total: number }[];
  const actualMap = new Map(actuals.map((a) => [a.category_id, a.total]));

  const alertExists = sqlite.prepare('SELECT 1 FROM budget_alerts WHERE category_id = ? AND month = ?');
  const insertAlert = sqlite.prepare('INSERT OR IGNORE INTO budget_alerts (category_id, month) VALUES (?, ?)');
  let users: number[] | null = null;

  for (const c of candidates) {
    const stored = budgetMap.get(c.id);
    const budgeted = effectiveBudgetedAmount(stored?.amount ?? 0, !!stored?.override, floors.get(c.id)?.amount);
    if (budgeted <= 0) continue;
    // Expense actuals are positive outflow magnitudes (refund rows net out).
    const actual = actualMap.get(c.id) ?? 0;
    const overage = actual - budgeted;
    if (overage <= EPSILON) continue;

    const body = `You've exceeded your ${c.display_name} budget by $${overage.toFixed(2)}.`;
    const dedupeKey = `budget_exceeded:${c.id}:${month}`;
    const firstCrossing = !alertExists.get(c.id, month);
    if (firstCrossing) {
      insertAlert.run(c.id, month);
      users ??= activeUserIds(sqlite);
      for (const userId of users) {
        upsertNotification(sqlite, userId, {
          type: 'budget_exceeded',
          severity: 'warning',
          title: `Over budget: ${c.display_name}`,
          body,
          actionLabel: 'View budget',
          actionTarget: '/budget',
          dedupeKey,
        });
      }
    } else {
      // Growth after the first crossing: refresh the number in place, silently.
      // UPDATE (not upsert) so a row the user cleared stays cleared this month.
      sqlite.prepare('UPDATE notifications SET body = ? WHERE dedupe_key = ?').run(body, dedupeKey);
    }
  }
}

/** Convenience sweep for write paths that touch several months at once. */
export function checkBudgetExceededForMonths(sqlite: Database.Database, months: Iterable<string>): void {
  const seen = new Set<string>();
  for (const month of months) {
    if (!month || seen.has(month)) continue;
    seen.add(month);
    try {
      checkBudgetExceeded(sqlite, { month });
    } catch (err) {
      console.error(`budget alert sweep failed for ${month}:`, err);
    }
  }
}
