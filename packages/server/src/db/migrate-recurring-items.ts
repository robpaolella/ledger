import Database from 'better-sqlite3';

/**
 * Migration: recurring_items (unified recurring income + expense/savings) and the
 * per-category recurring_budget_mode setting.
 *
 * Idempotent — safe to run on every startup:
 *  - CREATE TABLE / INDEX IF NOT EXISTS
 *  - column-presence guard (PRAGMA) before the categories ADD COLUMN
 *
 * CHECK constraints guard the enums (type / freq_kind / status); per-freq_kind
 * required fields are validated in the route layer so bad requests surface as 400.
 * `amount` is a positive magnitude (sign derived from the category type), nullable
 * to allow a "set at import" placeholder. NULL merchant_id/account_id are legit.
 *
 * Standalone-first (Option B): does NOT migrate pay_cycles / budget_recurring in —
 * built on the unification-ready superset schema so that can be a later fast-follow.
 */
export function migrateRecurringItems(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS recurring_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('income','expense')),
      label TEXT NOT NULL,
      merchant_id INTEGER REFERENCES merchants(id),
      category_id INTEGER NOT NULL REFERENCES categories(id),
      account_id INTEGER REFERENCES accounts(id),
      amount REAL,
      freq_kind TEXT NOT NULL CHECK (freq_kind IN ('monthly','semi_monthly','biweekly','weekly','every_n_months','custom_months')),
      day INTEGER,
      days_json TEXT,
      interval INTEGER,
      anchor_date TEXT,
      months_json TEXT,
      start_date TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
      user_id INTEGER REFERENCES users(id),
      effective_start TEXT,
      effective_end TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_recurring_cat ON recurring_items(category_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_recurring_account ON recurring_items(account_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_recurring_merchant ON recurring_items(merchant_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_recurring_status ON recurring_items(status);`);

  // Per-category budget-fold mode: 'set' (recurring is the floor) | 'add' (added on top).
  const catExists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='categories'"
  ).get() as { cnt: number };
  if (catExists.cnt > 0) {
    const cols = sqlite.prepare("PRAGMA table_info('categories')").all() as { name: string }[];
    if (!cols.some((c) => c.name === 'recurring_budget_mode')) {
      sqlite.exec("ALTER TABLE categories ADD COLUMN recurring_budget_mode TEXT DEFAULT 'set'");
      console.log('Added recurring_budget_mode column to categories table.');
    }
  }
}
