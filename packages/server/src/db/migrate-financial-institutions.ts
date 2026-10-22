import Database from 'better-sqlite3';
import { INSTITUTIONS } from './data/institutions.js';

/**
 * Migration: first-class `financial_institutions` table + `accounts.institution_id`.
 *
 * Idempotent:
 *  - CREATE TABLE IF NOT EXISTS for the table.
 *  - PRAGMA-guarded ALTER TABLE accounts ADD COLUMN institution_id.
 *  - Seed / top-up the popular US institutions additively (by name + domain), so an
 *    existing install picks up newly shipped institutions on upgrade. A seeded row
 *    the user deletes WILL be re-added on the next startup (curated seed data);
 *    user-added rows and edits to existing rows are never touched.
 *  - Backfill accounts.institution_id from the legacy free-text accounts.institution,
 *    matching a seeded row by name (case-insensitive) or creating a user row —
 *    so no synced/edited account loses its institution identity.
 *
 * Runs after migrateAccountInstitution (which adds accounts.institution).
 */
export function migrateFinancialInstitutions(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS financial_institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      domain TEXT,
      logo_url TEXT,
      color TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const acctExists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='accounts'"
  ).get() as { cnt: number };

  if (acctExists.cnt > 0) {
    const cols = sqlite.prepare("PRAGMA table_info('accounts')").all() as { name: string }[];
    if (!cols.some((c) => c.name === 'institution_id')) {
      sqlite.exec('ALTER TABLE accounts ADD COLUMN institution_id INTEGER REFERENCES financial_institutions(id)');
    }
  }

  // --- Seed / top-up popular institutions ---
  // Additive by name (UNIQUE) + domain, so an existing install picks up newly
  // shipped institutions on upgrade rather than only seeding a fresh DB. Edits to
  // existing rows and user-added rows (is_system=0) are never touched (INSERT OR
  // IGNORE). Deleting a seeded row and restarting re-adds it — acceptable for
  // curated seed data.
  {
    const startSort = ((sqlite.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM financial_institutions').get() as { m: number }).m) + 1;
    const insert = sqlite.prepare(
      'INSERT OR IGNORE INTO financial_institutions (name, domain, color, is_system, sort_order) VALUES (?, ?, ?, 1, ?)'
    );
    const seenDomain = new Set<string>(
      (sqlite.prepare("SELECT LOWER(TRIM(domain)) as d FROM financial_institutions WHERE domain IS NOT NULL AND TRIM(domain) <> ''").all() as { d: string }[]).map((r) => r.d)
    );
    let added = 0;
    const seed = sqlite.transaction(() => {
      let i = startSort;
      for (const inst of INSTITUTIONS) {
        const domain = (inst.domain || '').trim().toLowerCase();
        if (domain && seenDomain.has(domain)) continue; // skip a domain we already have
        if (domain) seenDomain.add(domain);
        const info = insert.run(inst.name.trim(), domain || null, (inst.color || '').trim() || null, i++);
        if (info.changes > 0) added++;
      }
    });
    seed();
    if (added > 0) console.log(`Seeded ${added} financial institution(s).`);
  }

  // --- Backfill accounts.institution_id from legacy free-text institution ---
  if (acctExists.cnt > 0) {
    const toBackfill = sqlite.prepare(`
      SELECT DISTINCT institution FROM accounts
      WHERE institution_id IS NULL AND institution IS NOT NULL AND TRIM(institution) <> ''
    `).all() as { institution: string }[];

    if (toBackfill.length > 0) {
      const findByName = sqlite.prepare('SELECT id FROM financial_institutions WHERE LOWER(name) = LOWER(?)');
      const createInst = sqlite.prepare('INSERT OR IGNORE INTO financial_institutions (name, is_system) VALUES (?, 0)');
      const linkAccounts = sqlite.prepare(
        'UPDATE accounts SET institution_id = ? WHERE institution_id IS NULL AND LOWER(TRIM(institution)) = LOWER(TRIM(?))'
      );
      const backfill = sqlite.transaction(() => {
        for (const { institution } of toBackfill) {
          const name = institution.trim();
          let row = findByName.get(name) as { id: number } | undefined;
          if (!row) {
            createInst.run(name);
            row = findByName.get(name) as { id: number } | undefined;
          }
          if (row) linkAccounts.run(row.id, name);
        }
      });
      backfill();
      console.log(`Backfilled institution_id for ${toBackfill.length} distinct legacy institution name(s).`);
    }
  }
}
