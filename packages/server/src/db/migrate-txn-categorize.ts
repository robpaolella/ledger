import Database from 'better-sqlite3';

/**
 * Migration: add auto-categorization confidence + needs-review flag to
 * transactions. Idempotent (column-presence guarded ADD COLUMN).
 */
export function migrateTxnCategorize(sqlite: Database.Database): void {
  const exists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='transactions'"
  ).get() as { cnt: number };
  if (exists.cnt === 0) return;

  const cols = new Set((sqlite.prepare("PRAGMA table_info('transactions')").all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('categorize_confidence')) {
    sqlite.exec('ALTER TABLE transactions ADD COLUMN categorize_confidence REAL');
    console.log('Added categorize_confidence column to transactions.');
  }
  if (!cols.has('needs_review')) {
    sqlite.exec('ALTER TABLE transactions ADD COLUMN needs_review INTEGER DEFAULT 0');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_needs_review ON transactions(needs_review)');
    console.log('Added needs_review column to transactions.');
  }
}
