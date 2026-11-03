import Database from 'better-sqlite3';

/**
 * Migration: budgets.override — per-month escape hatch to intentionally budget
 * BELOW the recurring floor for a single month (e.g. a month with no paycheck).
 * When override = 1, the budget overlay does not raise that month's budget to the
 * recurring minimum. Idempotent: guarded ADD COLUMN. Nullable-safe default 0.
 */
export function migrateBudgetOverride(sqlite: Database.Database): void {
  const exists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='budgets'"
  ).get() as { cnt: number };
  if (exists.cnt === 0) return;

  const cols = sqlite.prepare("PRAGMA table_info('budgets')").all() as { name: string }[];
  if (!cols.some((c) => c.name === 'override')) {
    sqlite.exec('ALTER TABLE budgets ADD COLUMN override INTEGER NOT NULL DEFAULT 0');
    console.log('Added override column to budgets table.');
  }
}
