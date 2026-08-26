import Database from 'better-sqlite3';
import { sqlite as defaultSqlite } from './index.js';
import { normalizeMerchantName } from '../services/merchantNormalize.js';

/**
 * Resolve a merchant name to a merchant id, creating the merchant if needed.
 *
 * Returns null for empty/blank names (so a transaction can be merchant-less).
 * Names are matched exactly (case-sensitive) so the caller controls dedup via
 * the exact string. Safe to call inside a better-sqlite3 transaction — pass the
 * same handle so the lookup/insert stays atomic with surrounding writes.
 */
export function findOrCreateMerchant(name: string | null | undefined, sqlite: Database.Database = defaultSqlite): number | null {
  const clean = (name ?? '').trim();
  if (!clean) return null;

  const existing = sqlite.prepare('SELECT id FROM merchants WHERE name = ?').get(clean) as { id: number } | undefined;
  if (existing) return existing.id;

  // INSERT OR IGNORE guards against a race on the UNIQUE(name) index; re-select
  // to get the id whether we inserted or lost the race.
  sqlite.prepare('INSERT OR IGNORE INTO merchants (name) VALUES (?)').run(clean);
  const row = sqlite.prepare('SELECT id, logo_url FROM merchants WHERE name = ?').get(clean) as { id: number; logo_url: string | null };

  // Auto-adopt a cached logo from the vendor catalog (popular brands) if this
  // merchant has none yet. Wrapped defensively so merchant creation never fails
  // if the catalog table isn't present.
  if (!row.logo_url) {
    try {
      const v = sqlite.prepare('SELECT logo_url FROM vendor_logos WHERE LOWER(name) = LOWER(?) AND logo_url IS NOT NULL').get(clean) as { logo_url: string } | undefined;
      if (v?.logo_url) sqlite.prepare('UPDATE merchants SET logo_url = ? WHERE id = ? AND logo_url IS NULL').run(v.logo_url, row.id);
    } catch { /* catalog not ready — ignore */ }
  }
  return row.id;
}

/**
 * Resolve a merchant id from a RAW bank/statement string, normalizing it first
 * (strip processor prefixes/store#/etc., map known brands) so noisy variants of
 * one vendor collapse to a single merchant row. Use this at ingestion (bank sync,
 * CSV import) — NOT for user-typed names, which are stored verbatim via
 * findOrCreateMerchant so the user stays in control of their own spelling.
 *
 * A user-recorded alias (written when they merge one merchant into another) wins
 * over creating the normalized name, so a merge keeps holding for transactions
 * that arrive later.
 */
export function resolveMerchantId(raw: string | null | undefined, sqlite: Database.Database = defaultSqlite): number | null {
  const canonical = normalizeMerchantName(raw);
  if (!canonical) return null;
  // Guarded like the vendor_logos lookup above: a CLI entry point that skipped
  // migrations must still be able to import, just without alias routing.
  try {
    const alias = sqlite.prepare(`
      SELECT ma.merchant_id AS id FROM merchant_aliases ma
      JOIN merchants m ON m.id = ma.merchant_id
      WHERE ma.alias_name = ?
    `).get(canonical) as { id: number } | undefined;
    if (alias) return alias.id;
  } catch { /* alias table not ready — fall through */ }
  return findOrCreateMerchant(canonical, sqlite);
}
