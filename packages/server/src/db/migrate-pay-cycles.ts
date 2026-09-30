import Database from 'better-sqlite3';

/**
 * Migration: Create pay_cycles table (dynamic take-home income schedules).
 *
 * Idempotent — safe to run multiple times.
 *
 * The CHECK constraint guards only the frequency enum; per-frequency required
 * fields (anchor_date for weekly/biweekly, day_of_month* for the others) are
 * validated in the route layer so a bad request surfaces as a 400, not a 500.
 * `amount` is the per-paycheck take-home, stored POSITIVE.
 */
export function migratePayCycles(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pay_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      user_id INTEGER REFERENCES users(id),
      frequency TEXT NOT NULL CHECK (frequency IN ('weekly','biweekly','semi_monthly','monthly')),
      amount REAL NOT NULL,
      anchor_date TEXT,
      day_of_month_1 INTEGER,
      day_of_month_2 INTEGER,
      day_of_month INTEGER,
      effective_start TEXT,
      effective_end TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_pay_cycles_cat ON pay_cycles(category_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_pay_cycles_user ON pay_cycles(user_id);`);
}
