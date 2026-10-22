import type Database from 'better-sqlite3';

/** Shared app_config key/value helpers (extracted from scheduler.ts). */

export function getConfig(sqlite: Database.Database, key: string): string | null {
  const row = sqlite.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setConfig(sqlite: Database.Database, key: string, value: string): void {
  sqlite.prepare(
    'INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}
