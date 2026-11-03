import Database from 'better-sqlite3';

/**
 * Migration: Amazon order-enrichment tables. Orders + line items come from the
 * host-side scraper sidecar (scripts/amazon); charges are the Amazon
 * Transactions-page rows (per-shipment amounts — the matching key against
 * ledger transactions); amazon_matches links a ledger transaction to its
 * order/charge. Idempotent.
 */
export function migrateAmazon(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS amazon_orders (
      order_number TEXT PRIMARY KEY,
      order_date TEXT NOT NULL,
      total REAL,
      subtotal REAL,
      tax REAL,
      raw_json TEXT NOT NULL,
      scraped_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS amazon_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL REFERENCES amazon_orders(order_number) ON DELETE CASCADE,
      title TEXT NOT NULL,
      unit_price REAL,
      quantity INTEGER DEFAULT 1,
      asin TEXT,
      seller TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_amz_items_order ON amazon_order_items(order_number);
    CREATE TABLE IF NOT EXISTS amazon_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      charge_date TEXT NOT NULL,
      amount REAL NOT NULL,
      order_number TEXT REFERENCES amazon_orders(order_number),
      payment_method TEXT,
      is_refund INTEGER DEFAULT 0,
      UNIQUE(charge_date, amount, order_number)
    );
    CREATE TABLE IF NOT EXISTS amazon_matches (
      transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
      order_number TEXT NOT NULL REFERENCES amazon_orders(order_number),
      charge_id INTEGER REFERENCES amazon_charges(id),
      amount REAL NOT NULL,
      matched_by TEXT NOT NULL DEFAULT 'auto',
      confidence REAL,
      enriched_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // note_written_at: set once the item list has been offered to the ledger
  // transaction's note. Stamped even when the note was left alone (user already
  // wrote one), so a note the user later clears is never silently refilled.
  const cols = new Set(
    (sqlite.prepare('PRAGMA table_info(amazon_matches)').all() as { name: string }[]).map((c) => c.name),
  );
  if (!cols.has('note_written_at')) {
    sqlite.exec('ALTER TABLE amazon_matches ADD COLUMN note_written_at TEXT');
  }
}
