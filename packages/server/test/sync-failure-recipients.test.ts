import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// The real schema, built the way the server builds it, in a scratch file (never data/).
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-sync-recipients-')), 'test.db');

let db: Database.Database;
let notifySyncFailure: typeof import('../src/services/notifications.js').notifySyncFailure;
const SHARED = 1;
const PERSONAL_OWNER = 2; // personal connection of user 3 (a member with Bank sync)
const PERSONAL_VIEWER = 3; // personal connection of user 4 (View-only member)

beforeAll(async () => {
  ({ sqlite: db } = await import('../src/db/index.js'));
  (await import('../src/db/migrate.js')).runMigrations(db);
  ({ notifySyncFailure } = await import('../src/services/notifications.js'));
});

beforeEach(() => {
  db.exec(`
    DELETE FROM notifications; DELETE FROM simplefin_links; DELETE FROM simplefin_connections;
    DELETE FROM user_permissions; DELETE FROM users;
  `);
  const user = db.prepare('INSERT INTO users (id, username, password_hash, display_name, role, is_active) VALUES (?, ?, ?, ?, ?, ?)');
  [[1, 'owner', 1], [2, 'admin', 1], [3, 'member', 1], [4, 'member', 1], [5, 'member', 1], [6, 'member', 0], [7, 'admin', 0], [8, 'member', 1]]
    .forEach(([id, role, active]) => user.run(id, `u${id}`, 'x', `User ${id}`, role, active));
  const perm = db.prepare('INSERT INTO user_permissions (user_id, permission, granted) VALUES (?, ?, ?)');
  [[3, 'simplefin.manage', 1], [4, 'import.bank_sync', 0], [4, 'simplefin.manage', 0],
    [5, 'import.bank_sync', 1], [6, 'import.bank_sync', 1], [8, 'transactions.create', 1]]
    .forEach(([u, p, g]) => perm.run(u, p, g));
  const conn = db.prepare('INSERT INTO simplefin_connections (id, user_id, access_url, label) VALUES (?, ?, ?, ?)');
  [[1, null], [2, 3], [3, 4]].forEach(([id, u]) => conn.run(id, u, `demo://sample-${id}`, `Sample ${id}`));
});

const fail = (connectionId: number) =>
  notifySyncFailure(db, { connectionId, label: 'Sample Bank', message: 'down', kind: 'other' });
const recipients = () =>
  (db.prepare("SELECT user_id FROM notifications WHERE type = 'sync_failure' ORDER BY user_id").all() as { user_id: number }[])
    .map((r) => r.user_id);

describe('sync-failure alert recipients', () => {
  it('shared connection: owner, admin and members with Bank sync; not View-only or inactive users', () => {
    fail(SHARED);
    expect(recipients()).toEqual([1, 2, 3, 5]);
  });

  it('every alert opens Bank sync', () => {
    fail(SHARED);
    const targets = db.prepare('SELECT DISTINCT action_target AS t FROM notifications').all();
    expect(targets).toEqual([{ t: '/settings?panel=bank' }]);
  });

  it('personal connection: only its owner, and only if they can see Bank sync', () => {
    fail(PERSONAL_OWNER);
    expect(recipients()).toEqual([3]);
    db.exec('DELETE FROM notifications');
    fail(PERSONAL_VIEWER);
    expect(recipients()).toEqual([]);
  });

  it('removed access stops alerts at once, with no cache to wait out', () => {
    db.exec("UPDATE user_permissions SET granted = 0 WHERE user_id = 3");
    fail(SHARED);
    expect(recipients()).toEqual([1, 2, 5]);
  });

  it('a connection that no longer exists notifies nobody', () => {
    fail(99);
    expect(recipients()).toEqual([]);
  });
});
