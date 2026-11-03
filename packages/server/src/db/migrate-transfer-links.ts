import Database from 'better-sqlite3';

/**
 * Migration: transfer_links — the two sides of one movement of money between the
 * user's own accounts, recorded as a single link so the pair can be shown as one
 * transaction (from → to) instead of two unexplained rows.
 *
 * Both legs stay in `transactions`: each account's balance and history depend on
 * its own row. The link is a display + provenance layer on top.
 *
 * `status` keeps an unlinked pair on file as 'rejected' so the detector cannot
 * immediately re-pair what the user just pulled apart. The unique indexes are
 * partial on status so a rejected leg is still free to link to a different
 * partner. Idempotent.
 */
export function migrateTransferLinks(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS transfer_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      -- from = the leg money LEFT (ledger sign positive), to = the leg it arrived on
      from_transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      to_transaction_id   INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      confidence REAL,
      linked_by TEXT NOT NULL DEFAULT 'auto',   -- auto | manual
      status TEXT NOT NULL DEFAULT 'linked',    -- linked | rejected
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      unlinked_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS transfer_links_from_idx
      ON transfer_links(from_transaction_id) WHERE status = 'linked';
    CREATE UNIQUE INDEX IF NOT EXISTS transfer_links_to_idx
      ON transfer_links(to_transaction_id) WHERE status = 'linked';
    -- One verdict per pair: re-linking a rejected pair flips this row back.
    CREATE UNIQUE INDEX IF NOT EXISTS transfer_links_pair_idx
      ON transfer_links(from_transaction_id, to_transaction_id);
  `);
}
