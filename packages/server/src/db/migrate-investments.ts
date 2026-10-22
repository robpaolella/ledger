import Database from 'better-sqlite3';

/**
 * Migration: investments data foundation.
 *  - benchmark_prices: daily adjusted closes pulled from Tiingo for the core
 *    benchmarks (SPY/VTI/BND) plus every held symbol (powers range-% chips).
 *  - holdings_history: per-(link, symbol, date) snapshots captured at each
 *    SimpleFIN commit — simplefin_holdings itself only ever holds the latest
 *    snapshot (delete + reinsert), so day-over-day change needs this table.
 *    Seeded from the current holdings so movers have a baseline tomorrow.
 *  - symbol_meta: per-symbol asset class for the Investments holdings-table
 *    grouping (null → 'Uncategorized').
 * Idempotent.
 */
export function migrateInvestments(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS benchmark_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      adj_close REAL NOT NULL,
      UNIQUE(symbol, date)
    );

    CREATE TABLE IF NOT EXISTS holdings_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      simplefin_link_id INTEGER NOT NULL REFERENCES simplefin_links(id),
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      shares REAL NOT NULL,
      cost_basis REAL NOT NULL,
      market_value REAL NOT NULL,
      UNIQUE(simplefin_link_id, symbol, date)
    );
    CREATE INDEX IF NOT EXISTS idx_holdings_history_date ON holdings_history(date);

    CREATE TABLE IF NOT EXISTS symbol_meta (
      symbol TEXT PRIMARY KEY,
      asset_class TEXT
    );
  `);

  // Baseline: snapshot today's holdings under their sync date so the first
  // post-migration sync yields two dates and day-movers light up.
  sqlite.exec(`
    INSERT OR IGNORE INTO holdings_history (simplefin_link_id, symbol, date, shares, cost_basis, market_value)
    SELECT simplefin_link_id, UPPER(symbol), substr(updated_at, 1, 10), shares, cost_basis, market_value
    FROM simplefin_holdings
  `);
}
