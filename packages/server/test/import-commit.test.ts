import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

// Every test runs on its own in-memory database. Services that still read the
// default handle (recurring budget floors) see the same test database, and the
// production file is never opened.
const handle = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../src/db/index.js', () => ({ get sqlite() { return handle.current; } }));

import { commitImport, IMPORT_FAILED_MESSAGE, type ImportCommitRow } from '../src/services/importCommit.js';

const ACCOUNT = 1;
const GROCERIES = 1;
const DINING = 2;
const MISSING = 999;

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, role TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE account_owners (account_id INTEGER REFERENCES accounts(id), user_id INTEGER REFERENCES users(id));
    CREATE TABLE categories (id INTEGER PRIMARY KEY, display_name TEXT, type TEXT, exclude_from_budget INTEGER DEFAULT 0);
    CREATE TABLE merchants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, logo_url TEXT);
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL REFERENCES accounts(id),
      date TEXT NOT NULL, description TEXT NOT NULL, bank_description TEXT, note TEXT,
      category_id INTEGER REFERENCES categories(id), merchant_id INTEGER REFERENCES merchants(id),
      amount REAL NOT NULL, simplefin_transaction_id TEXT UNIQUE, categorize_confidence REAL,
      needs_review INTEGER DEFAULT 0, categorize_source TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE transaction_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id), amount REAL NOT NULL,
      merchant_id INTEGER REFERENCES merchants(id), note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE transaction_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id),
      status TEXT NOT NULL DEFAULT 'open', reason TEXT NOT NULL, assignee_id INTEGER REFERENCES users(id),
      note TEXT, flagged_by INTEGER, resolved_by INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, resolved_at TEXT
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info', title TEXT NOT NULL, body TEXT, action_label TEXT, action_target TEXT,
      dedupe_key TEXT, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, dedupe_key)
    );
    CREATE TABLE budgets (id INTEGER PRIMARY KEY, category_id INTEGER, month TEXT, amount REAL, override INTEGER DEFAULT 0);
    CREATE TABLE budget_alerts (category_id INTEGER, month TEXT, PRIMARY KEY (category_id, month));
    CREATE TABLE recurring_items (
      id INTEGER PRIMARY KEY, label TEXT, category_id INTEGER, amount REAL, freq_kind TEXT, day INTEGER,
      days_json TEXT, interval INTEGER, anchor_date TEXT, months_json TEXT, start_date TEXT,
      status TEXT, effective_start TEXT, effective_end TEXT
    );

    INSERT INTO users (id, username, role) VALUES (1, 'sample-owner', 'owner');
    INSERT INTO accounts (id, name) VALUES (${ACCOUNT}, 'Sample Checking');
    INSERT INTO account_owners VALUES (${ACCOUNT}, 1);
    INSERT INTO categories (id, display_name, type) VALUES
      (${GROCERIES}, 'Daily Living: Groceries', 'expense'),
      (${DINING}, 'Daily Living: Dining/Eating Out', 'expense');
    -- A small Groceries budget, so a valid import crosses it and notifies.
    INSERT INTO budgets (category_id, month, amount) VALUES (${GROCERIES}, '2026-03', 50);
    -- Forced failure: any row described 'FAIL HERE' aborts its insert.
    CREATE TRIGGER fail_on_marker BEFORE INSERT ON transactions WHEN NEW.description = 'FAIL HERE'
      BEGIN SELECT RAISE(ABORT, 'forced failure'); END;
  `);
  return db;
}

let db: Database.Database;
beforeEach(() => {
  db = fixture();
  handle.current = db;
});

const TABLES = ['transactions', 'transaction_splits', 'transaction_reviews', 'merchants', 'notifications', 'budget_alerts'];
const snapshot = () => Object.fromEntries(TABLES.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));

const rows: ImportCommitRow[] = [
  { date: '2026-03-02', description: 'SAMPLE GROCER #12', categoryId: GROCERIES, amount: 80, confidence: 0.5, source: 'heuristic' },
  { date: '2026-03-03', description: 'Sample Diner', note: 'lunch', categoryId: DINING, amount: 12.5 },
  { date: '2026-03-04', description: 'Sample Market', amount: 30, splits: [{ categoryId: GROCERIES, amount: 20 }, { categoryId: DINING, amount: 10 }] },
];

describe('commitImport', () => {
  it('writes the rows, splits and review flags of a valid import and returns the count', () => {
    expect(commitImport(db, { accountId: ACCOUNT, transactions: rows })).toEqual({ ok: true, imported: 3 });

    const txns = db.prepare('SELECT * FROM transactions ORDER BY id').all() as Record<string, unknown>[];
    expect(txns.map((t) => [t.description, t.bank_description, t.category_id, t.amount, t.note, t.needs_review, t.categorize_confidence, t.categorize_source]))
      .toEqual([
        ['SAMPLE GROCER #12', 'SAMPLE GROCER #12', GROCERIES, 80, null, 1, 0.5, 'heuristic'],
        ['Sample Diner', 'Sample Diner', DINING, 12.5, 'lunch', 0, null, null],
        ['Sample Market', 'Sample Market', null, 30, null, 0, null, null],
      ]);
    expect(txns.every((t) => t.account_id === ACCOUNT && t.merchant_id != null)).toBe(true);
    expect(db.prepare('SELECT transaction_id, category_id, amount FROM transaction_splits ORDER BY id').all())
      .toEqual([
        { transaction_id: txns[2].id, category_id: GROCERIES, amount: 20 },
        { transaction_id: txns[2].id, category_id: DINING, amount: 10 },
      ]);
    expect(db.prepare('SELECT transaction_id, status, reason, assignee_id FROM transaction_reviews').all())
      .toEqual([{ transaction_id: txns[0].id, status: 'open', reason: 'auto_low_confidence', assignee_id: 1 }]);
    // Groceries: 80 + 20 split against a 50 budget, so the owner is notified after the commit.
    expect(db.prepare("SELECT dedupe_key FROM notifications WHERE type = 'budget_exceeded'").all())
      .toEqual([{ dedupe_key: `budget_exceeded:${GROCERIES}:2026-03` }]);
  });

  it('imports nothing and sends no budget alert when a write fails part-way', () => {
    const before = snapshot();
    const failing = [...rows, { date: '2026-03-05', description: 'FAIL HERE', categoryId: GROCERIES, amount: 5 }];
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = commitImport(db, { accountId: ACCOUNT, transactions: failing });

    expect(result).toEqual({ ok: false, status: 500, error: IMPORT_FAILED_MESSAGE });
    expect(IMPORT_FAILED_MESSAGE).toMatch(/nothing was imported/i);
    expect(snapshot()).toEqual(before);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  const rejections: [string, unknown, RegExp][] = [
    ['an unknown account', { accountId: MISSING, transactions: rows }, /account doesn't exist/],
    ['an unknown row category', { accountId: ACCOUNT, transactions: [rows[1], { ...rows[0], categoryId: MISSING }] }, /category for "SAMPLE GROCER #12" doesn't exist/],
    ['an unknown split category', { accountId: ACCOUNT, transactions: [{ ...rows[2], splits: [{ categoryId: GROCERIES, amount: 20 }, { categoryId: MISSING, amount: 10 }] }] }, /split category for "Sample Market" doesn't exist/],
    ['a malformed account id', { accountId: { id: ACCOUNT }, transactions: rows }, /account doesn't exist/],
    ['a malformed row category id', { accountId: ACCOUNT, transactions: [{ ...rows[0], categoryId: true }] }, /category for "SAMPLE GROCER #12" doesn't exist/],
    ['a malformed split category id', { accountId: ACCOUNT, transactions: [{ ...rows[2], splits: [{ categoryId: {}, amount: 20 }, { categoryId: DINING, amount: 10 }] }] }, /split category for "Sample Market" doesn't exist/],
    ['a non-string date', { accountId: ACCOUNT, transactions: [{ ...rows[1], date: 20260303 }] }, /requires date, description, and amount/],
    ['a non-numeric row amount', { accountId: ACCOUNT, transactions: [{ ...rows[1], amount: '12.50' }] }, /amount for "Sample Diner" isn't a valid number/],
    ['a non-finite row amount', { accountId: ACCOUNT, transactions: [{ ...rows[1], amount: Infinity }] }, /amount for "Sample Diner" isn't a valid number/],
    ['a NaN row amount', { accountId: ACCOUNT, transactions: [{ ...rows[1], amount: NaN }] }, /amount for "Sample Diner" isn't a valid number/],
    ['a non-finite split amount', { accountId: ACCOUNT, transactions: [{ ...rows[2], splits: [{ categoryId: GROCERIES, amount: Infinity }, { categoryId: DINING, amount: 10 }] }] }, /split amount for "Sample Market" isn't a valid number/],
    ['a non-numeric split amount', { accountId: ACCOUNT, transactions: [{ ...rows[2], splits: [{ categoryId: GROCERIES, amount: '20' }, { categoryId: DINING, amount: 10 }] }] }, /split amount for "Sample Market" isn't a valid number/],
    ['splits that do not sum to the amount', { accountId: ACCOUNT, transactions: [{ ...rows[2], splits: [{ categoryId: GROCERIES, amount: 20 }, { categoryId: DINING, amount: 5 }] }] }, /Split amounts must equal transaction amount for "Sample Market"/],
  ];

  it.each(rejections)('rejects %s with its own message and writes nothing', (_name, input, message) => {
    const before = snapshot();
    const result = commitImport(db, input as Parameters<typeof commitImport>[1]);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect((result as { error: string }).error).toMatch(message);
    expect(snapshot()).toEqual(before);
  });

  it('gives each rejection a distinct message', () => {
    const messages = new Set(rejections.map(([, input]) => (commitImport(db, input as Parameters<typeof commitImport>[1]) as { error: string }).error));
    // Malformed and unknown ids share a message, as do non-numeric, infinite and
    // NaN amounts at each level (row, split).
    expect(messages.size).toBe(7);
  });
});
