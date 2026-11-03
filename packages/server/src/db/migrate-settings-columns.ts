import Database from 'better-sqlite3';

/**
 * Additive columns for the revamped Settings page. All idempotent ALTER-ADD
 * (safe on the live DB): per-leaf category emoji + an exclude-from-budget flag,
 * an account avatar url, and a merchant logo url. Defaults preserve current
 * behavior (no exclusions; avatars/logos fall back to colored initials).
 */
export function migrateSettingsColumns(sqlite: Database.Database): void {
  const cols = (t: string) => new Set((sqlite.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name));

  const cat = cols('categories');
  if (!cat.has('emoji')) sqlite.exec('ALTER TABLE categories ADD COLUMN emoji TEXT');
  if (!cat.has('exclude_from_budget')) sqlite.exec('ALTER TABLE categories ADD COLUMN exclude_from_budget INTEGER DEFAULT 0');

  const acc = cols('accounts');
  if (!acc.has('avatar_url')) sqlite.exec('ALTER TABLE accounts ADD COLUMN avatar_url TEXT');

  const mer = cols('merchants');
  if (!mer.has('logo_url')) sqlite.exec('ALTER TABLE merchants ADD COLUMN logo_url TEXT');
}
