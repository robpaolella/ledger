import Database from 'better-sqlite3';

/**
 * Migration: add simplefin_links.auto_import — whether the daily scheduler
 * auto-imports transactions for this link. Balances/holdings always sync
 * regardless. Idempotent; the backfill runs only when the column is first
 * added so later boots never clobber user toggles.
 */
export function migrateAutoImport(sqlite: Database.Database): void {
  const exists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='simplefin_links'"
  ).get() as { cnt: number };
  if (exists.cnt === 0) return;

  const cols = new Set((sqlite.prepare("PRAGMA table_info('simplefin_links')").all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('auto_import')) {
    sqlite.exec("ALTER TABLE simplefin_links ADD COLUMN auto_import INTEGER NOT NULL DEFAULT 1");
    // Investment accounts default off — the pipeline never imports their
    // transactions anyway (transfer-mirror double-counting).
    sqlite.exec(`UPDATE simplefin_links SET auto_import = 0
                 WHERE account_id IN (SELECT id FROM accounts WHERE classification = 'investment')`);
  }
}
