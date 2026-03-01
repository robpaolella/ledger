import Database from 'better-sqlite3';

/**
 * Migration: Create transaction_splits table and make transactions.category_id nullable.
 *
 * Idempotent — safe to run multiple times.
 */
export function migrateTransactionSplits(sqlite: Database.Database): void {
  // Skip if transactions table doesn't exist yet (fresh DB before seed)
  const tableExists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='transactions'"
  ).get() as { cnt: number };
  if (tableExists.cnt === 0) return;

  // Create transaction_splits table if it doesn't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS transaction_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      amount REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes if they don't exist
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_splits_txn ON transaction_splits(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_splits_cat ON transaction_splits(category_id);
  `);

  // Note: SQLite doesn't support ALTER COLUMN to drop NOT NULL.
  // For existing databases, category_id remains NOT NULL at the SQLite level,
  // but the Drizzle schema allows null. New databases created from index.ts
  // will have the nullable column. For existing DBs, we handle NULL category_id
  // at the application layer — split transactions store category_id as NULL
  // only in new DBs; in migrated DBs we can use a sentinel approach or
  // recreate the table. For simplicity, we recreate if needed.
  const colInfo = sqlite.prepare("PRAGMA table_info('transactions')").all() as {
    name: string; notnull: number;
  }[];
  const catCol = colInfo.find(c => c.name === 'category_id');
  if (catCol && catCol.notnull === 1) {
    // Need to recreate the table to make category_id nullable
    sqlite.exec('PRAGMA foreign_keys = OFF;');
    const txn = sqlite.transaction(() => {
      sqlite.exec(`
        CREATE TABLE transactions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL REFERENCES accounts(id),
          date TEXT NOT NULL,
          description TEXT NOT NULL,
          note TEXT,
          category_id INTEGER REFERENCES categories(id),
          amount REAL NOT NULL,
          simplefin_transaction_id TEXT UNIQUE,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO transactions_new
          SELECT id, account_id, date, description, note, category_id, amount,
                 CASE WHEN simplefin_transaction_id = '' THEN NULL ELSE simplefin_transaction_id END,
                 created_at
          FROM transactions;
        DROP TABLE transactions;
        ALTER TABLE transactions_new RENAME TO transactions;
      `);
    });
    txn();
    sqlite.exec('PRAGMA foreign_keys = ON;');
    console.log('Migration: Made transactions.category_id nullable for split support.');
  }
}
