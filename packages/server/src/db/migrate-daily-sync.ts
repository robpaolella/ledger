import Database from 'better-sqlite3';

/**
 * Migration: per-connection sync state on simplefin_connections, so a
 * connection with no linked accounts still has one and deleting the
 * connection removes it. Additive and idempotent.
 */
export function migrateDailySync(sqlite: Database.Database): void {
  const exists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='simplefin_connections'"
  ).get() as { cnt: number };
  if (exists.cnt === 0) return;

  const cols = new Set((sqlite.prepare("PRAGMA table_info('simplefin_connections')").all() as { name: string }[]).map((c) => c.name));
  for (const name of ['sync_status', 'sync_error_kind', 'sync_message', 'sync_attempt_at']) {
    if (!cols.has(name)) sqlite.exec(`ALTER TABLE simplefin_connections ADD COLUMN ${name} TEXT`);
  }
}
