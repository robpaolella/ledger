import Database from 'better-sqlite3';

/**
 * Migration: category_feedback — a durable log of the user's categorization
 * decisions (corrections, confirmations, split-leg assignments). Feeds the
 * LLM categorizer's few-shot context. Rows snapshot the transaction fields so
 * they survive transaction deletion. Also adds transactions.categorize_source
 * so the prior's origin (rule/merchant-history/…/llm) can be recorded.
 * Idempotent.
 */
export function migrateCategoryFeedback(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS category_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      bank_description TEXT,
      merchant_id INTEGER REFERENCES merchants(id),
      account_id INTEGER REFERENCES accounts(id),
      amount REAL NOT NULL,
      txn_date TEXT,
      prior_category_id INTEGER REFERENCES categories(id),
      prior_source TEXT,
      prior_confidence REAL,
      corrected_category_id INTEGER NOT NULL REFERENCES categories(id),
      kind TEXT NOT NULL DEFAULT 'correction',
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_merchant ON category_feedback(merchant_id, id);
    CREATE INDEX IF NOT EXISTS idx_feedback_kind ON category_feedback(kind, id);
  `);

  const cols = new Set((sqlite.prepare("PRAGMA table_info('transactions')").all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('categorize_source')) {
    sqlite.exec('ALTER TABLE transactions ADD COLUMN categorize_source TEXT');
  }
}
