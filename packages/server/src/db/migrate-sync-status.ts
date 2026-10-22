import Database from 'better-sqlite3';

/**
 * Migration: add per-account daily-sync status/error/attempt columns to
 * simplefin_links so the auto-pull job can record failures (surfaced via
 * notifications + Settings). Idempotent.
 */
export function migrateSyncStatus(sqlite: Database.Database): void {
  const exists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='simplefin_links'"
  ).get() as { cnt: number };
  if (exists.cnt === 0) return;

  const cols = new Set((sqlite.prepare("PRAGMA table_info('simplefin_links')").all() as { name: string }[]).map((c) => c.name));
  const add = (name: string, type: string) => {
    if (!cols.has(name)) { sqlite.exec(`ALTER TABLE simplefin_links ADD COLUMN ${name} ${type}`); }
  };
  add('last_sync_status', 'TEXT');
  add('last_sync_error', 'TEXT');
  add('last_sync_attempt_at', 'TEXT');
}
