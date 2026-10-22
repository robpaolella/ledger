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

export type SaveScope = 'month' | 'forward';

/** The calendar month after `month` (YYYY-MM), rolling December into January. */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Save a category's plan for `month` in one transaction, under the carry-forward rule:
 * - 'month': only this month changes. If the next month has no row of its own and there
 *   was a plan before the edit, it is saved at that pre-edit amount (never overridden).
 * - 'forward': this month and every existing later row take the amount; later rows are
 *   updated in place with their override cleared, never deleted.
 * Returns the edited month's row and whether it was newly created.
 */
export function saveBudgetPlan(
  sqlite: Database.Database,
  p: { categoryId: number; month: string; amount: number; override: 0 | 1; scope: SaveScope },
): { row: { id: number; category_id: number; month: string; amount: number; override: number }; created: boolean } {
  return sqlite.transaction(() => {
    const before = getStoredPlans(sqlite, p.month, [p.categoryId]).get(p.categoryId);
    const existing = sqlite.prepare('SELECT id FROM budgets WHERE category_id = ? AND month = ?')
      .get(p.categoryId, p.month) as { id: number } | undefined;
    let id: number;
    if (existing) {
      sqlite.prepare('UPDATE budgets SET amount = ?, override = ? WHERE id = ?').run(p.amount, p.override, existing.id);
      id = existing.id;
    } else {
      id = Number(sqlite.prepare('INSERT INTO budgets (category_id, month, amount, override) VALUES (?, ?, ?, ?)')
        .run(p.categoryId, p.month, p.amount, p.override).lastInsertRowid);
    }

    if (p.scope === 'forward') {
      sqlite.prepare('UPDATE budgets SET amount = ?, override = 0 WHERE category_id = ? AND month > ?')
        .run(p.amount, p.categoryId, p.month);
    } else if (before) {
      const next = nextMonth(p.month);
      sqlite.prepare(`INSERT INTO budgets (category_id, month, amount, override)
        SELECT ?, ?, ?, 0 WHERE NOT EXISTS (SELECT 1 FROM budgets WHERE category_id = ? AND month = ?)`)
        .run(p.categoryId, next, before.amount, p.categoryId, next);
    }
    return { row: { id, category_id: p.categoryId, month: p.month, amount: p.amount, override: p.override }, created: !existing };
  })();
}
