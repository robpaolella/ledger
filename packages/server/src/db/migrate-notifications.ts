import Database from 'better-sqlite3';

/**
 * Migration: create the per-user notifications table + the category_rules table
 * (explicit user-managed auto-categorization rules). Idempotent.
 */
export function migrateNotifications(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT,
      action_label TEXT,
      action_target TEXT,
      dedupe_key TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_idx ON notifications(user_id, dedupe_key);

    CREATE TABLE IF NOT EXISTS category_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_type TEXT NOT NULL DEFAULT 'merchant',
      pattern TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_category_rules_priority ON category_rules(priority);
  `);
}
