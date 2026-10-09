import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/db/migrate.js';

// Runs the real startup migration chain on a throwaway copy of the v1.0.2 fixture, the way
// a v1.0.2 user's database is upgraded on first boot. The row-by-row "nothing lost" check is #111.
const FIXTURE = path.join(__dirname, 'fixtures', 'v1.0.2', 'ledger.db');

let tmpDir: string | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

function openCopy() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-v102-upgrade-'));
  const file = path.join(tmpDir, 'ledger.db');
  fs.copyFileSync(FIXTURE, file);
  const db = new Database(file);
  db.pragma('foreign_keys = ON'); // as db/index.ts opens it
  return db;
}

describe('upgrading a v1.0.2 database', () => {
  it('runs the full startup migration chain, and a second boot, without errors', () => {
    const errors = vi.spyOn(console, 'error'); // the chain logs, not throws, a failed transfer-linking pass
    const db = openCopy();
    try {
      expect(() => runMigrations(db)).not.toThrow();
      expect(() => runMigrations(db)).not.toThrow();
      expect(errors).not.toHaveBeenCalled();
      expect(db.prepare("SELECT emoji, exclude_from_budget FROM categories WHERE type = 'transfer'").all())
        .toEqual([{ emoji: '🔁', exclude_from_budget: 1 }]);
      expect(db.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 91 });
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    } finally { db.close(); }
  });
});
