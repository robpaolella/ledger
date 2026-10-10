import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { notifySyncFailure } from '../src/services/notifications.js';

// Plain in-memory tables: the service only needs these four, and takes the raw handle.
let db: Database.Database;
const SHARED = 1;
const PERSONAL_OWNER = 2; // personal connection of user 3 (a member with Bank sync)
const PERSONAL_VIEWER = 3; // personal connection of user 4 (View-only member)

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE user_permissions (user_id INTEGER, permission TEXT, granted INTEGER);
    CREATE TABLE simplefin_connections (id INTEGER PRIMARY KEY, user_id INTEGER);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY, user_id INTEGER, type TEXT, severity TEXT, title TEXT, body TEXT,
      action_label TEXT, action_target TEXT, dedupe_key TEXT, is_read INTEGER DEFAULT 0, UNIQUE (user_id, dedupe_key));
    INSERT INTO users (id, role, is_active) VALUES
      (1, 'owner', 1), (2, 'admin', 1), (3, 'member', 1), (4, 'member', 1),
      (5, 'member', 1), (6, 'member', 0), (7, 'admin', 0), (8, 'member', 1);
    INSERT INTO user_permissions VALUES
      (3, 'simplefin.manage', 1), (4, 'import.bank_sync', 0), (4, 'simplefin.manage', 0),
      (5, 'import.bank_sync', 1), (6, 'import.bank_sync', 1), (8, 'transactions.create', 1);
    INSERT INTO simplefin_connections (id, user_id) VALUES (1, NULL), (2, 3), (3, 4);
  `);
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
