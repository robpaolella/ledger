import Database from 'better-sqlite3';

/**
 * Migration: add users.over_budget_alerts — each person's own on/off for
 * over-budget alerts (Settings → Notifications). Defaults to on, so every
 * existing and new user keeps getting them until they switch it off.
 * Idempotent and additive; nothing is deleted.
 */
export function migrateNotificationPrefs(sqlite: Database.Database): void {
  const cols = new Set((sqlite.prepare("PRAGMA table_info('users')").all() as { name: string }[]).map((c) => c.name));
  if (cols.size === 0 || cols.has('over_budget_alerts')) return;
  sqlite.exec('ALTER TABLE users ADD COLUMN over_budget_alerts INTEGER NOT NULL DEFAULT 1');
}
