/**
 * Self-test for Amazon charge↔transaction matching. In-memory DB.
 * Run: npx tsx src/services/amazonMatch.selftest.ts
 */
import Database from 'better-sqlite3';
import assert from 'node:assert';
import { matchAmazonCharges } from './amazonMatch.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT, owner TEXT);
    CREATE TABLE account_owners (account_id INTEGER, user_id INTEGER);
    CREATE TABLE merchants (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER, date TEXT, description TEXT,
      merchant_id INTEGER, amount REAL, category_id INTEGER, needs_review INTEGER DEFAULT 0
    );
    CREATE TABLE transaction_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER UNIQUE, status TEXT,
      reason TEXT, assignee_id INTEGER, note TEXT, flagged_by INTEGER, resolved_by INTEGER,
      flagged_at TEXT, resolved_at TEXT, updated_at TEXT
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT, severity TEXT,
      title TEXT, body TEXT, action_label TEXT, action_target TEXT, dedupe_key TEXT,
      is_read INTEGER DEFAULT 0, created_at TEXT
    );
    CREATE UNIQUE INDEX notifications_user_dedupe_idx ON notifications(user_id, dedupe_key);
    CREATE TABLE amazon_orders (order_number TEXT PRIMARY KEY, order_date TEXT, total REAL, subtotal REAL, tax REAL, raw_json TEXT, scraped_at TEXT);
    CREATE TABLE amazon_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT, charge_date TEXT, amount REAL,
      order_number TEXT, payment_method TEXT, is_refund INTEGER DEFAULT 0
    );
    CREATE TABLE amazon_matches (
      transaction_id INTEGER PRIMARY KEY, order_number TEXT, charge_id INTEGER,
      amount REAL, matched_by TEXT DEFAULT 'auto', confidence REAL, enriched_at TEXT, created_at TEXT
    );
  `);
  db.prepare("INSERT INTO users (id, role) VALUES (1, 'owner')").run();
  db.prepare("INSERT INTO merchants (id, name) VALUES (1, 'Amazon')").run();
  db.prepare("INSERT INTO accounts (id, name, owner) VALUES (1, 'Card', 'robert')").run();
  return db;
}

const addTxn = (db: Database.Database, date: string, amount: number, merchantId: number | null = 1): number =>
  Number(db.prepare('INSERT INTO transactions (account_id, date, description, merchant_id, amount) VALUES (1, ?, ?, ?, ?)')
    .run(date, 'AMZN MKTP', merchantId, amount).lastInsertRowid);

const addOrder = (db: Database.Database, num: string, date: string, total: number | null) =>
  db.prepare("INSERT INTO amazon_orders VALUES (?, ?, ?, NULL, NULL, '{}', '')").run(num, date, total);

const addCharge = (db: Database.Database, date: string, amount: number, order: string | null) =>
  db.prepare('INSERT INTO amazon_charges (charge_date, amount, order_number) VALUES (?, ?, ?)').run(date, amount, order);

function main() {
  // --- exact charge match within window ---
  let db = makeDb();
  const t1 = addTxn(db, '2026-07-21', 54.32);
  addOrder(db, '111-1', '2026-07-20', 54.32);
  addCharge(db, '2026-07-20', 54.32, '111-1');
  let r = matchAmazonCharges(db);
  assert.equal(r.matched, 1, 'exact match');
  const m = db.prepare('SELECT * FROM amazon_matches WHERE transaction_id = ?').get(t1) as { order_number: string };
  assert.equal(m.order_number, '111-1');

  // idempotency: rerun matches nothing new
  r = matchAmazonCharges(db);
  assert.equal(r.matched, 0, 'idempotent rerun');

  // --- outside window → no match ---
  db = makeDb();
  addTxn(db, '2026-07-28', 20.0);
  addOrder(db, '111-2', '2026-07-01', 20.0);
  addCharge(db, '2026-07-10', 20.0, '111-2');
  r = matchAmazonCharges(db);
  assert.equal(r.matched, 0, 'outside window');

  // --- ambiguity: two same-amount charges near one txn → flag, no match ---
  db = makeDb();
  const ta = addTxn(db, '2026-07-21', 15.0);
  addOrder(db, '111-3', '2026-07-20', 15.0);
  addOrder(db, '111-4', '2026-07-21', 15.0);
  addCharge(db, '2026-07-20', 15.0, '111-3');
  addCharge(db, '2026-07-21', 15.0, '111-4');
  r = matchAmazonCharges(db);
  assert.equal(r.matched, 0, 'ambiguous charges → no match');
  assert.equal(r.flagged, 1, 'ambiguous → flagged');
  const rev = db.prepare('SELECT status, note FROM transaction_reviews WHERE transaction_id = ?').get(ta) as { status: string; note: string };
  assert.equal(rev.status, 'open');
  assert.ok(rev.note.includes('Amazon'), 'review note mentions Amazon');
  r = matchAmazonCharges(db);
  assert.equal(r.flagged, 0, 'no duplicate flags on rerun');

  // --- ambiguity: two same-amount txns near one charge → neither matched ---
  db = makeDb();
  addTxn(db, '2026-07-20', 30.0);
  addTxn(db, '2026-07-21', 30.0);
  addOrder(db, '111-5', '2026-07-20', 30.0);
  addCharge(db, '2026-07-20', 30.0, '111-5');
  r = matchAmazonCharges(db);
  assert.equal(r.matched, 0, 'rival txns → no match');
  assert.equal(r.ambiguous, 2);

  // --- order-total fallback when no charge rows for the order ---
  db = makeDb();
  const tf = addTxn(db, '2026-07-22', 99.99);
  addOrder(db, '111-6', '2026-07-21', 99.99);
  r = matchAmazonCharges(db);
  assert.equal(r.matched, 1, 'order fallback');
  const mf = db.prepare('SELECT charge_id, confidence FROM amazon_matches WHERE transaction_id = ?').get(tf) as { charge_id: number | null; confidence: number };
  assert.equal(mf.charge_id, null);
  assert.equal(mf.confidence, 0.8);

  // --- refunds skipped; non-Amazon merchants skipped ---
  db = makeDb();
  addTxn(db, '2026-07-21', 12.0);
  addOrder(db, '111-7', '2026-07-20', 12.0);
  addCharge(db, '2026-07-20', 12.0, '111-7');
  db.prepare('UPDATE amazon_charges SET is_refund = 1').run();
  db.prepare("DELETE FROM amazon_orders WHERE order_number = '111-7'").run(); // kill fallback too… keep order? need total path off
  r = matchAmazonCharges(db);
  assert.equal(r.matched, 0, 'refund charges ignored');

  db = makeDb();
  db.prepare("INSERT INTO merchants (id, name) VALUES (2, 'Target')").run();
  addTxn(db, '2026-07-21', 44.0, 2);
  addOrder(db, '111-8', '2026-07-20', 44.0);
  addCharge(db, '2026-07-20', 44.0, '111-8');
  r = matchAmazonCharges(db);
  assert.equal(r.matched, 0, 'non-Amazon merchant ignored');

  console.log('amazonMatch selftest: all assertions passed');
}

main();
