import Database from 'better-sqlite3';
import { VENDORS } from './data/vendors.js';

/**
 * Migration: `vendor_logos` catalog + backfill of existing merchants' logos.
 *
 * Idempotent:
 *  - CREATE TABLE IF NOT EXISTS.
 *  - Additive top-up seed (by name UNIQUE + domain), same policy as institutions.
 *  - Backfill: any merchant with no logo whose name matches a catalog entry that
 *    HAS a cached logo adopts it. Re-runs harmlessly once logos are hydrated.
 *
 * Runs after merchants exists (raw DDL creates it before migrations).
 */
export function migrateVendorLogos(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS vendor_logos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      domain TEXT,
      logo_url TEXT,
      color TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // --- Seed / top-up the catalog (additive, keyed by NAME) ---
  // Dedup is by name only (the merchant-match key), NOT domain — distinct vendor
  // names legitimately share a domain (Amazon + Amazon Prime → amazon.com,
  // Costco + Costco Gas → costco.com); dropping by domain would strip the plain
  // 'Amazon'/'Costco' rows that most merchants match on. INSERT OR IGNORE on the
  // UNIQUE(name) index handles re-runs.
  {
    const insert = sqlite.prepare('INSERT OR IGNORE INTO vendor_logos (name, domain, color) VALUES (?, ?, ?)');
    let added = 0;
    const seed = sqlite.transaction(() => {
      for (const v of VENDORS) {
        const domain = (v.domain || '').trim().toLowerCase();
        const info = insert.run(v.name.trim(), domain || null, (v.color || '').trim() || null);
        if (info.changes > 0) added++;
      }
    });
    seed();
    if (added > 0) console.log(`Seeded ${added} vendor logo catalog entrie(s).`);
  }

  // --- Backfill existing merchants from the catalog (only where a logo exists) ---
  const merchantsExist = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='merchants'"
  ).get() as { cnt: number };
  if (merchantsExist.cnt > 0) {
    const res = sqlite.prepare(`
      UPDATE merchants
      SET logo_url = (
        SELECT vl.logo_url FROM vendor_logos vl
        WHERE LOWER(vl.name) = LOWER(merchants.name) AND vl.logo_url IS NOT NULL
        LIMIT 1
      )
      WHERE logo_url IS NULL
        AND EXISTS (
          SELECT 1 FROM vendor_logos vl
          WHERE LOWER(vl.name) = LOWER(merchants.name) AND vl.logo_url IS NOT NULL
        )
    `).run();
    if (res.changes > 0) console.log(`Backfilled logos onto ${res.changes} existing merchant(s) from the vendor catalog.`);
  }
}
