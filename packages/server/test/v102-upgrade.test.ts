import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/db/migrate.js';

// Runs the real startup migration chain on a throwaway copy of the v1.0.2 fixture, the way
// a v1.0.2 user's database is upgraded on first boot. Besides the boot/integrity checks, it
// snapshots every row of every fixture table before migrating, then proves that each table still
// exists and each original row is still there (matched by primary key) with every original column
// value unchanged. Columns and tables the migrations add are allowed; a deliberate change to an
// existing value must be listed in INTENDED_CHANGES below with its reason, or the test fails.
const FIXTURE = path.join(__dirname, 'fixtures', 'v1.0.2', 'ledger.db');

let tmpDir: string | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

type Row = Record<string, unknown>;
type Snapshot = Record<string, { pk: string[]; rows: Row[] }>;

// Deliberate changes to existing values: "table.column" -> reason. Empty unless a migration
// is meant to rewrite fixture data; an unexplained difference fails the test.
const INTENDED_CHANGES: Record<string, string> = {};

function snapshot(db: Database.Database): Snapshot {
  const out: Snapshot = {};
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  for (const { name } of tables) {
    const cols = db.pragma(`table_info("${name}")`) as { name: string; pk: number }[];
    const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
    // A table with no declared primary key is matched on its SQLite rowid.
    const key = pk.length ? pk : ['rowid'];
    const rows = db.prepare(`SELECT rowid AS rowid, * FROM "${name}"`).all() as Row[];
    out[name] = { pk: key, rows };
  }
  return out;
}

const rowKey = (pk: string[], r: Row) => pk.map((k) => `${k}=${String(r[k])}`).join(', ');

function openCopy() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-v102-upgrade-'));
  const file = path.join(tmpDir, 'ledger.db');
  fs.copyFileSync(FIXTURE, file);
  const db = new Database(file);
  db.pragma('foreign_keys = ON'); // as db/index.ts opens it
  return db;
}

// The full startup migration chain can take over Vitest's default 5s on a busy machine.
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
      // Contributions start empty: every category is untracked.
      expect(db.prepare('SELECT COUNT(*) AS n FROM contribution_setups').get()).toEqual({ n: 0 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM contribution_setup_accounts').get()).toEqual({ n: 0 });
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    } finally { db.close(); }
  });

  it('loses nothing: every original table and row survives with its values unchanged', () => {
    const db = openCopy();
    try {
      const before = snapshot(db);
      runMigrations(db);
      const after = snapshot(db);
      const problems: string[] = [];
      for (const [table, { pk, rows }] of Object.entries(before)) {
        if (!after[table]) { problems.push(`table ${table} is gone`); continue; }
        const now = new Map(after[table].rows.map((r) => [rowKey(pk, r), r]));
        for (const row of rows) {
          const key = rowKey(pk, row);
          const found = now.get(key);
          if (!found) { problems.push(`${table} [${key}] was deleted`); continue; }
          for (const [col, value] of Object.entries(row)) {
            if (col === 'rowid' && !(pk.length === 1 && pk[0] === 'rowid')) continue;
            if (INTENDED_CHANGES[`${table}.${col}`]) continue;
            if (!Object.is(found[col], value)) {
              problems.push(`${table} [${key}] column ${col}: ${JSON.stringify(value)} became ${JSON.stringify(found[col])}`);
            }
          }
        }
      }
      expect(problems).toEqual([]);

      // Counts are read from the fixture. Only additions are allowed: the transfer category the
      // migrations create, and the app_config marker that the one-time category-order backfill ran.
      const extra: Record<string, number> = { categories: 1, app_config: 1 };
      for (const [table, { rows }] of Object.entries(before)) {
        expect(after[table].rows.length, `${table} row count`).toBe(rows.length + (extra[table] ?? 0));
      }

      // The release-bar numbers, so a changed fixture is noticed.
      const counts = Object.fromEntries(Object.entries(before).map(([t, v]) => [t, v.rows.length]));
      expect(counts).toMatchObject({
        users: 2, accounts: 8, account_owners: 9, transactions: 91, transaction_splits: 10,
        budgets: 66, categories: 43, assets: 5, balance_snapshots: 24, app_config: 3,
      });
      expect(after.users.rows.map((u) => [u.username, u.role]).sort()).toEqual(
        before.users.rows.map((u) => [u.username, u.role]).sort());
    } finally { db.close(); }
  });

  it('sorts categories alphabetically once, then keeps an order the household saves', () => {
    const db = openCopy();
    const subs = () => (db.prepare("SELECT id, sub_name FROM categories WHERE type = 'expense' AND group_name = 'Utilities' ORDER BY sort_order, id")
      .all() as { id: number; sub_name: string }[]);
    try {
      expect(db.prepare("SELECT 1 FROM app_config WHERE key = 'categories.sort_order_set'").get()).toBeUndefined();
      runMigrations(db);
      const names = subs().map((r) => r.sub_name);
      expect(names.length).toBeGreaterThan(1);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));

      const saved = subs().reverse();
      const setOrder = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
      saved.forEach((r, i) => setOrder.run(i, r.id));
      runMigrations(db);
      runMigrations(db);
      expect(subs().map((r) => r.sub_name)).toEqual(saved.map((r) => r.sub_name));
    } finally { db.close(); }
  });

  it('keeps retired features\' tables and rows exactly as they were', () => {
    const db = openCopy();
    try {
      // Pay cycles have no table in a v1.0.2 database; budget templates (and their recurring
      // items) do, and are empty in the fixture, so this asserts they survive and stay untouched.
      // Savings (also retired) needs no check: v1.0.2 had no savings category type, so that fold never runs here.
      const retired = ['budget_templates', 'budget_recurring'];
      for (const t of retired) {
        expect(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t), `${t} exists`).toBeTruthy();
      }
      const dump = () => retired.map((t) => db.prepare(`SELECT * FROM "${t}"`).all());
      const before = dump();
      runMigrations(db);
      expect(dump()).toEqual(before);
    } finally { db.close(); }
  });
}, 60_000);
