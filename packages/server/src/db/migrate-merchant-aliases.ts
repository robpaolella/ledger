import Database from 'better-sqlite3';

/**
 * Migration: merchant_aliases — runtime "this statement name means that merchant"
 * mappings, written when the user merges one merchant into another so future
 * imports keep landing on the target instead of recreating the merged-away name.
 *
 * `alias_name` holds the NORMALIZED name (exactly what normalizeMerchantName
 * produces), so ingestion resolution is a single exact lookup. Distinct from the
 * bundled brand dictionary in services/merchantAliases.ts, which is developer-
 * authored and global; this table is the user's own, and only db/merchants.ts
 * `resolveMerchantId` consults it — user-typed names stay verbatim. Idempotent.
 */
export function migrateMerchantAliases(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS merchant_aliases (
      alias_name  TEXT PRIMARY KEY,
      merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_merchant_aliases_merchant ON merchant_aliases(merchant_id);
  `);
}
