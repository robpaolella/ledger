/**
 * Self-test for budget-exceeded crossing-state notifications
 * (services/budgetAlerts.ts). No test runner in this repo; standalone
 * assertion script. Run with:
 *
 *   npx tsx packages/server/src/services/budgetAlerts.selftest.ts
 *
 * Exits non-zero when any assertion failed.
 *
 * budgetAlerts → recurringBudget imports the SHARED sqlite handle from
 * db/index.js (which opens DATABASE_PATH at import time), so DATABASE_PATH is
 * pointed at a fresh scratch file BEFORE the dynamic imports and that shared
 * handle is used for all setup — getRecurringFloors and the test then see the
 * same database.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-selftest-budget-alerts-'));
process.env.DATABASE_PATH = path.join(scratchDir, 'scratch.db');

// Pre-create categories with one inert row BEFORE db/index.js loads: its
// fresh-DB auto-seed inserts via the drizzle schema (which already has the
// post-migration emoji/exclude_from_budget columns) and would crash before
// migrateSettingsColumns can run. A non-empty table skips the seed.
{
  const pre = new Database(process.env.DATABASE_PATH);
  pre.exec(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name TEXT NOT NULL,
      sub_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      type TEXT NOT NULL,
      is_deductible INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      recurring_budget_mode TEXT DEFAULT 'set'
    );
  `);
  pre.prepare("INSERT INTO categories (group_name, sub_name, display_name, type) VALUES ('Selftest', 'Seed Guard', 'Selftest: Seed Guard', 'income')").run();
  pre.close();
}

const { sqlite } = await import('../db/index.js');
const { checkBudgetExceeded } = await import('./budgetAlerts.js');
const { migrateSettingsColumns } = await import('../db/migrate-settings-columns.js');
const { migrateNotifications } = await import('../db/migrate-notifications.js');
const { migrateTransactionReviews } = await import('../db/migrate-transaction-reviews.js');
const { migrateNotificationCenter } = await import('../db/migrate-notification-center.js');
const { migrateRecurringItems } = await import('../db/migrate-recurring-items.js');

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

migrateSettingsColumns(sqlite);   // categories.exclude_from_budget
migrateNotifications(sqlite);     // notifications table
migrateTransactionReviews(sqlite);
migrateNotificationCenter(sqlite); // budget_alerts ledger
migrateRecurringItems(sqlite);    // recurring_items (floor source)

// Two active users + one inactive (must never be notified).
sqlite.prepare(`
  INSERT INTO users (id, username, password_hash, display_name, role, is_active)
  VALUES (1, 'alice', 'x', 'Alice', 'owner', 1), (2, 'bob', 'x', 'Bob', 'member', 1), (3, 'carol', 'x', 'Carol', 'member', 0)
`).run();

const accountId = Number(sqlite.prepare(
  "INSERT INTO accounts (name, type, classification, owner) VALUES ('Selftest Checking', 'checking', 'asset', 'Alice')",
).run().lastInsertRowid);
const catId = Number(sqlite.prepare(
  "INSERT INTO categories (group_name, sub_name, display_name, type) VALUES ('Selftest', 'Alert Cat', 'Selftest: Alert Cat', 'expense')",
).run().lastInsertRowid);

const addTxn = (date: string, amount: number, categoryId: number) =>
  sqlite.prepare('INSERT INTO transactions (account_id, date, description, amount, category_id) VALUES (?, ?, ?, ?, ?)')
    .run(accountId, date, 'selftest txn', amount, categoryId);
const rowsFor = (dedupeKey: string) =>
  sqlite.prepare('SELECT user_id, body, is_read FROM notifications WHERE dedupe_key = ? ORDER BY user_id')
    .all(dedupeKey) as { user_id: number; body: string; is_read: number }[];
const ledgerCount = (categoryId: number, month: string) =>
  (sqlite.prepare('SELECT COUNT(*) AS c FROM budget_alerts WHERE category_id = ? AND month = ?')
    .get(categoryId, month) as { c: number }).c;

const M1 = '2026-03';
const key1 = `budget_exceeded:${catId}:${M1}`;
sqlite.prepare('INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, 100)').run(catId, M1);

console.log('under budget (100 budgeted, 90 actual) → no notification');
{
  addTxn('2026-03-10', 90, catId);
  checkBudgetExceeded(sqlite, { month: M1 });
  check('no notification rows', rowsFor(key1).length === 0);
  check('no budget_alerts ledger row', ledgerCount(catId, M1) === 0);
}

console.log('first crossing (actual 120) → unread notification per active user');
{
  addTxn('2026-03-15', 30, catId); // actual 120
  checkBudgetExceeded(sqlite, { month: M1, categoryIds: [catId] });
  const rows = rowsFor(key1);
  check('one row per ACTIVE user (inactive excluded)', rows.map((r) => r.user_id).join(',') === '1,2', rows);
  check('all unread', rows.every((r) => r.is_read === 0), rows);
  check('body ends "by $20.00."', rows.every((r) => r.body.endsWith('by $20.00.')), rows);
  check('exact body wording', rows[0]?.body === "You've exceeded your Selftest: Alert Cat budget by $20.00.", rows[0]);
  check('crossing recorded in budget_alerts', ledgerCount(catId, M1) === 1);
}

console.log('growth (actual 150) → body updates in place, read state preserved');
{
  sqlite.prepare('UPDATE notifications SET is_read = 1 WHERE dedupe_key = ? AND user_id = 1').run(key1);
  addTxn('2026-03-20', 30, catId); // actual 150
  checkBudgetExceeded(sqlite, { month: M1 });
  const rows = rowsFor(key1);
  check('bodies refresh to "$50.00."', rows.every((r) => r.body.endsWith('by $50.00.')), rows);
  check('previously-read row STAYS read (no re-ping)', rows.find((r) => r.user_id === 1)?.is_read === 1, rows);
  check('never-read row stays unread', rows.find((r) => r.user_id === 2)?.is_read === 0, rows);
}

console.log('user-cleared row is NOT resurrected by later growth');
{
  sqlite.prepare('DELETE FROM notifications WHERE dedupe_key = ? AND user_id = 1').run(key1);
  addTxn('2026-03-25', 10, catId); // actual 160
  checkBudgetExceeded(sqlite, { month: M1 });
  const rows = rowsFor(key1);
  check('deleted row not recreated', rows.length === 1 && rows[0].user_id === 2, rows);
  check('remaining row refreshed to "$60.00."', rows[0]?.body.endsWith('by $60.00.'), rows);
}

console.log('a new month alerts fresh');
{
  const M2 = '2026-04';
  const key2 = `budget_exceeded:${catId}:${M2}`;
  sqlite.prepare('INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, 100)').run(catId, M2);
  addTxn('2026-04-05', 120, catId);
  checkBudgetExceeded(sqlite, { month: M2 });
  const rows = rowsFor(key2);
  check('both active users alerted again', rows.map((r) => r.user_id).join(',') === '1,2', rows);
  check('fresh rows are unread', rows.every((r) => r.is_read === 0), rows);
  check('body scoped to the new month overage', rows.every((r) => r.body.endsWith('by $20.00.')), rows);
}

const floorCatId = Number(sqlite.prepare(
  "INSERT INTO categories (group_name, sub_name, display_name, type) VALUES ('Selftest', 'Floor Cat', 'Selftest: Floor Cat', 'expense')",
).run().lastInsertRowid);
const M3 = '2026-05';
const key3 = `budget_exceeded:${floorCatId}:${M3}`;

console.log('recurring floor raises the effective budget (stored 100, floor 200, actual 150 → no alert)');
{
  sqlite.prepare('INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, 100)').run(floorCatId, M3);
  sqlite.prepare(`
    INSERT INTO recurring_items (type, label, category_id, amount, freq_kind, day, status)
    VALUES ('expense', 'Selftest Rent', ?, 200, 'monthly', 15, 'active')
  `).run(floorCatId);
  addTxn('2026-05-10', 150, floorCatId);
  checkBudgetExceeded(sqlite, { month: M3 });
  check('no notification (150 < floored 200)', rowsFor(key3).length === 0);
  check('no ledger row', ledgerCount(floorCatId, M3) === 0);
}

console.log('override=1 bypasses the floor (stored 100 wins → alert of $50.00)');
{
  sqlite.prepare('UPDATE budgets SET override = 1 WHERE category_id = ? AND month = ?').run(floorCatId, M3);
  checkBudgetExceeded(sqlite, { month: M3 });
  const rows = rowsFor(key3);
  check('alert raised for both active users', rows.map((r) => r.user_id).join(',') === '1,2', rows);
  check('unread', rows.every((r) => r.is_read === 0), rows);
  check('overage against the STORED amount', rows[0]?.body === "You've exceeded your Selftest: Floor Cat budget by $50.00.", rows[0]);
}

sqlite.close();
fs.rmSync(scratchDir, { recursive: true, force: true });

if (failures > 0) { console.error(`\n${failures} assertion(s) failed.`); process.exit(1); }
console.log('\nAll budget-alert self-tests passed.');
