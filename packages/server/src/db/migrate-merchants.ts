import Database from 'better-sqlite3';

/**
 * Migration: first-class merchants.
 *
 * Adds a `merchants` lookup table and a nullable `transactions.merchant_id` FK,
 * then backfills one merchant per distinct existing `description` (the raw
 * statement text stays put in `description`; `merchant_id` carries the clean,
 * dedup'd display name).
 *
 * Idempotent — safe to run on every startup:
 *  - CREATE TABLE / INDEX IF NOT EXISTS for the table + unique name index
 *  - column-presence guard (PRAGMA) before the ADD COLUMN
 *  - backfill only touches rows whose merchant_id is still NULL
 *
 * MUST run AFTER migrateTransactionSplits, which drops+recreates the
 * transactions table with a fixed column list that has no merchant_id.
 */
export function migrateMerchants(sqlite: Database.Database): void {
  const txExists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='transactions'"
  ).get() as { cnt: number };
  if (txExists.cnt === 0) return;

  // 1. merchants table + unique name index
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_name ON merchants(name);
  `);

  // 2. transactions.merchant_id (nullable FK — plain ADD COLUMN is fine for a
  //    nullable column; no table rebuild needed). The backfill runs EXACTLY
  //    ONCE — in the same run that first adds the column — so that a later,
  //    deliberate unlink (deleting a merchant, or clearing a transaction's
  //    merchant) is NOT resurrected on the next startup. After the column
  //    exists, NULL merchant_id is a legitimate user-chosen state, not
  //    "unmigrated data".
  const cols = sqlite.prepare("PRAGMA table_info('transactions')").all() as { name: string }[];
  if (!cols.some((c) => c.name === 'merchant_id')) {
    sqlite.exec('ALTER TABLE transactions ADD COLUMN merchant_id INTEGER REFERENCES merchants(id)');
    console.log('Added merchant_id column to transactions table.');

    // One-time backfill: one merchant per distinct non-empty description, then link.
    const run = sqlite.transaction(() => {
      sqlite.exec(`
        INSERT OR IGNORE INTO merchants (name)
        SELECT DISTINCT TRIM(description) FROM transactions WHERE TRIM(description) <> ''
      `);
      sqlite.exec(`
        UPDATE transactions
        SET merchant_id = (SELECT id FROM merchants WHERE name = TRIM(transactions.description))
        WHERE merchant_id IS NULL AND TRIM(description) <> ''
      `);
    });
    run();
    const linked = sqlite.prepare(
      'SELECT COUNT(*) as cnt FROM transactions WHERE merchant_id IS NOT NULL'
    ).get() as { cnt: number };
    console.log(`Backfilled merchants for ${linked.cnt} transactions.`);
  }

  // 3. Index on merchant_id — created unconditionally so fresh DBs (which get
  //    merchant_id inline from db/index.ts, skipping the ADD COLUMN block) also
  //    get the index.
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant_id)');
}
