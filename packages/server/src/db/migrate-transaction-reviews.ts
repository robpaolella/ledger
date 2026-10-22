import Database from 'better-sqlite3';

/**
 * Migration: create the `transaction_reviews` task table (assignable review of a
 * transaction — assignee, note, status, who flagged, who/when resolved). 1:1 with
 * a transaction (UNIQUE transaction_id; a reopen reuses the row). Idempotent.
 *
 * Backfill: seed one OPEN review per already-flagged transaction so the review
 * queue reflects current state. `transactions.needs_review` stays the denormalized
 * cache of "an open review exists" (kept in sync by services/reviews.ts).
 */
export function migrateTransactionReviews(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS transaction_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'open',
      reason TEXT NOT NULL,
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      note TEXT,
      flagged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_status ON transaction_reviews(status);
    CREATE INDEX IF NOT EXISTS idx_reviews_assignee ON transaction_reviews(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_status_assignee ON transaction_reviews(status, assignee_id);
  `);

  // Backfill open reviews for existing flagged rows that don't have one yet.
  sqlite.exec(`
    INSERT OR IGNORE INTO transaction_reviews (transaction_id, status, reason)
    SELECT t.id, 'open',
           CASE WHEN t.category_id IS NULL THEN 'auto_uncategorized' ELSE 'auto_low_confidence' END
    FROM transactions t
    WHERE t.needs_review = 1
      AND NOT EXISTS (SELECT 1 FROM transaction_reviews r WHERE r.transaction_id = t.id);
  `);
}
