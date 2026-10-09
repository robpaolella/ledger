import type Database from 'better-sqlite3';
import { isValidMonth } from '../utils/validate.js';

export interface StoredPlan {
  amount: number;          // stored amount (before recurring floors)
  override: boolean;       // only from the month's own row; never carried
  budgetId: number | null; // the month's own row, or null when inherited
}

/**
 * Carry-forward read rule, shared by every reader of the `budgets` table: a
 * category's plan for `month` is its latest row at or before that month, with
 * no end date. A saved $0 is a plan. No row at or before the month = no plan.
 * Recurring floors are applied separately (effectiveBudgetedAmount).
 */
export function getStoredPlans(sqlite: Database.Database, month: string, categoryIds?: number[]): Map<number, StoredPlan> {
  const plans = new Map<number, StoredPlan>();
  if (!isValidMonth(month)) return plans;
  const catFilter = categoryIds ? `AND b.category_id IN (${categoryIds.map(() => '?').join(',') || 'NULL'})` : '';
  const rows = sqlite.prepare(`
    SELECT b.id, b.category_id, b.month, b.amount, COALESCE(b.override, 0) AS override
    FROM budgets b
    WHERE b.month = (SELECT max(b2.month) FROM budgets b2 WHERE b2.category_id = b.category_id AND b2.month <= ?)
      ${catFilter}
  `).all(month, ...(categoryIds ?? [])) as { id: number; category_id: number; month: string; amount: number; override: number }[];
  for (const r of rows) {
    const own = r.month === month;
    plans.set(r.category_id, { amount: r.amount, override: own && !!r.override, budgetId: own ? r.id : null });
  }
  return plans;
}
