import Database from 'better-sqlite3';

/**
 * Migration: add transactions.bank_description — the verbatim bank-provided
 * statement text. `description` stays the payee-preferred display/matching
 * string (merchant resolution, duplicate detection, search all key off it).
 * No backfill by design: historical SimpleFIN rows keep their raw text in
 * `note` where it already landed; the panel falls back to `description`.
 * Idempotent.
 */
export function migrateBankDescription(sqlite: Database.Database): void {
  const cols = new Set(
    (sqlite.prepare("PRAGMA table_info('transactions')").all() as { name: string }[]).map((c) => c.name),
  );
  if (!cols.has('bank_description')) {
    sqlite.exec('ALTER TABLE transactions ADD COLUMN bank_description TEXT');
  }
}
