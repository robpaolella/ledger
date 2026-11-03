import Database from 'better-sqlite3';

/**
 * Migration: add `accounts.institution` and backfill it from the linked
 * SimpleFIN org name.
 *
 * Idempotent — the ADD COLUMN is guarded by a PRAGMA check, and the backfill
 * only touches rows whose institution is still NULL (so a user who later clears
 * or edits an institution won't have it overwritten on the next startup).
 */
export function migrateAccountInstitution(sqlite: Database.Database): void {
  const tableExists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='accounts'"
  ).get() as { cnt: number };
  if (tableExists.cnt === 0) return;

  const cols = sqlite.prepare("PRAGMA table_info('accounts')").all() as { name: string }[];
  if (cols.some((c) => c.name === 'institution')) return;

  sqlite.exec('ALTER TABLE accounts ADD COLUMN institution TEXT');

  // Backfill from simplefin_links.simplefin_org_name (one link per account).
  const linksExist = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='simplefin_links'"
  ).get() as { cnt: number };
  if (linksExist.cnt > 0) {
    sqlite.exec(`
      UPDATE accounts
      SET institution = (
        SELECT sl.simplefin_org_name FROM simplefin_links sl
        WHERE sl.account_id = accounts.id AND sl.simplefin_org_name IS NOT NULL
        LIMIT 1
      )
      WHERE institution IS NULL
    `);
  }
  console.log('Added institution column to accounts table (backfilled from SimpleFIN org names).');
}
