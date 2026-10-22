/**
 * Self-test for the aggregate review notification (services/reviews.ts →
 * services/notifications.ts): ONE 'review:aggregate' row per user whose body
 * tracks their open-review count — increases re-ping (unread), decreases
 * refresh silently, zero deletes the row. No test runner in this repo;
 * standalone assertion script over an in-memory SQLite DB. Run with:
 *
 *   npx tsx packages/server/src/services/reviewsAggregate.selftest.ts
 *
 * Exits non-zero when any assertion failed. DATABASE_PATH is pointed at a
 * scratch file BEFORE the dynamic imports so no transitive import can ever
 * open the real database.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-selftest-reviews-'));
process.env.DATABASE_PATH = path.join(scratchDir, 'scratch.db');

const { flagReview, resolveReview, assignReview, REVIEW_AGG_DEDUPE } = await import('./reviews.js');
const { migrateNotifications } = await import('../db/migrate-notifications.js');
const { migrateTransactionReviews } = await import('../db/migrate-transaction-reviews.js');

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, role TEXT DEFAULT 'member', is_active INTEGER DEFAULT 1);
  CREATE TABLE transactions (id INTEGER PRIMARY KEY, description TEXT, category_id INTEGER, needs_review INTEGER DEFAULT 0);
`);
migrateNotifications(db);
migrateTransactionReviews(db);

db.prepare("INSERT INTO users (id, username) VALUES (1, 'alice'), (2, 'bob')").run();
for (let i = 1; i <= 4; i++) {
  db.prepare('INSERT INTO transactions (id, description) VALUES (?, ?)').run(i, `txn ${i}`);
}

const agg = (userId: number) =>
  db.prepare('SELECT body, is_read FROM notifications WHERE user_id = ? AND dedupe_key = ?')
    .get(userId, REVIEW_AGG_DEDUPE) as { body: string; is_read: number } | undefined;
const aggCount = (userId: number) =>
  (db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND dedupe_key = ?')
    .get(userId, REVIEW_AGG_DEDUPE) as { c: number }).c;
const markRead = (userId: number) =>
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND dedupe_key = ?').run(userId, REVIEW_AGG_DEDUPE);
const needsReview = (txnId: number) =>
  (db.prepare('SELECT needs_review AS n FROM transactions WHERE id = ?').get(txnId) as { n: number }).n;

console.log('two flags → ONE aggregate row, unread');
{
  flagReview(db, { txnId: 1, reason: 'manual', assigneeId: 1 });
  flagReview(db, { txnId: 2, reason: 'manual', assigneeId: 1 });
  check('exactly one notification row for user 1', aggCount(1) === 1);
  const r = agg(1);
  check('body = "2 transactions assigned to you need review"', r?.body === '2 transactions assigned to you need review', r);
  check('is_read = 0', r?.is_read === 0, r);
  check('needs_review cache set on both txns', needsReview(1) === 1 && needsReview(2) === 1);
}

console.log('resolve decreases the count silently — row STAYS read');
{
  markRead(1);
  resolveReview(db, { txnId: 1, resolvedBy: 2 });
  const r = agg(1);
  check('body drops to the 1-transaction wording', r?.body === '1 transaction assigned to you needs review', r);
  check('is_read stays 1 (no ping on decrease)', r?.is_read === 1, r);
  check('needs_review cache cleared', needsReview(1) === 0);
}

console.log('resolving the last open review deletes the row');
{
  resolveReview(db, { txnId: 2 });
  check('aggregate row deleted at count 0', aggCount(1) === 0);
}

console.log('assignReview moves counts between users');
{
  flagReview(db, { txnId: 3, reason: 'manual', assigneeId: 1 });
  flagReview(db, { txnId: 4, reason: 'manual', assigneeId: 1 });
  markRead(1);
  assignReview(db, 3, 2);
  const a = agg(1);
  check('old assignee count drops to 1', a?.body === '1 transaction assigned to you needs review', a);
  check('old assignee stays read (silent)', a?.is_read === 1, a);
  const b = agg(2);
  check('new assignee gets an aggregate row', aggCount(2) === 1);
  check('new assignee body counts the moved review', b?.body === '1 transaction assigned to you needs review', b);
  check('new assignee pinged (unread)', b?.is_read === 0, b);
}

console.log('re-flag with the SAME assignee does not flip read state');
{
  markRead(2);
  flagReview(db, { txnId: 3, reason: 'manual', assigneeId: 2 });
  const b = agg(2);
  check('body unchanged', b?.body === '1 transaction assigned to you needs review', b);
  check('is_read stays 1 (queue did not grow)', b?.is_read === 1, b);
  check('still a single row', aggCount(2) === 1);
}

db.close();
fs.rmSync(scratchDir, { recursive: true, force: true });

if (failures > 0) { console.error(`\n${failures} assertion(s) failed.`); process.exit(1); }
console.log('\nAll reviews-aggregate self-tests passed.');
