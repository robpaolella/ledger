import Database from 'better-sqlite3';

/**
 * Migration: Create budget_templates and budget_recurring tables.
 *
 * Idempotent — safe to run multiple times.
 */
export function migrateBudgetTemplatesRecurring(sqlite: Database.Database): void {
  // Create budget_templates table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS budget_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      amount REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id)
    );
  `);

  // Create budget_recurring table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS budget_recurring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      amount REAL,
      months TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create index on budget_recurring.category_id for join performance
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_budget_recurring_cat ON budget_recurring(category_id);
  `);
}
