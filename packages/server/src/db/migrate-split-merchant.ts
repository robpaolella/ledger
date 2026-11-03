import Database from 'better-sqlite3';

/**
 * Migration: per-split merchant + note (full-Monarch split model).
 *
 * Adds two nullable columns to `transaction_splits`:
 *  - `merchant_id` (FK → merchants): each split leg can carry its OWN merchant.
 *    NULL = inherit the parent transaction's merchant (resolved at read/count/
 *    filter time via COALESCE, never eagerly copied — so a parent rename keeps
 *    propagating to inherited legs).
 *  - `note`: each split leg can carry its own note (the parent's note is the
 *    statement-level note).
 *
 * Idempotent — safe to run on every startup:
 *  - no-op if the transaction_splits table doesn't exist yet
 *  - column-presence guard (PRAGMA) before each ADD COLUMN
 *  - NO backfill (NULL is a legitimate "inherit parent" state, not unmigrated
 *    data), mirroring migrate-merchants' philosophy
 *  - index created unconditionally with IF NOT EXISTS
 *
 * A nullable ADD COLUMN with a REFERENCES clause is legal in-place in SQLite
 * (no table rebuild). MUST run AFTER migrateTransactionSplits (creates the
 * table) and migrateMerchants (ensures the merchants FK target exists).
 */
export function migrateSplitMerchant(sqlite: Database.Database): void {
  const tblExists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='transaction_splits'"
  ).get() as { cnt: number };
  if (tblExists.cnt === 0) return;

  const cols = sqlite.prepare("PRAGMA table_info('transaction_splits')").all() as { name: string }[];
  const has = (name: string) => cols.some((c) => c.name === name);

  if (!has('merchant_id')) {
    sqlite.exec('ALTER TABLE transaction_splits ADD COLUMN merchant_id INTEGER REFERENCES merchants(id)');
    console.log('Added merchant_id column to transaction_splits table.');
  }
  if (!has('note')) {
    sqlite.exec('ALTER TABLE transaction_splits ADD COLUMN note TEXT');
    console.log('Added note column to transaction_splits table.');
  }

  // Index created unconditionally so fresh DBs (which get merchant_id inline from
  // db/index.ts, skipping the ADD COLUMN block) also get the index.
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_splits_merchant ON transaction_splits(merchant_id)');
}
