/**
 * Self-test for the Transfers > Transfer fold.
 * Run: npx tsx src/db/migrate-transfer-category-dedupe.selftest.ts
 */
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { migrateTransferCategoryDedupe } from './migrate-transfer-category-dedupe.js';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE category_groups (id INTEGER PRIMARY KEY, name TEXT, type TEXT);
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY, group_id INTEGER, group_name TEXT, sub_name TEXT,
      type TEXT, emoji TEXT, exclude_from_budget INTEGER DEFAULT 0
    );
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, category_id INTEGER);
    CREATE TABLE category_rules (id INTEGER PRIMARY KEY, category_id INTEGER);
  `);
  return db;
}
const addCat = (db: Database.Database, id: number, group_id: number, group_name: string, sub_name: string, type: string, emoji: string | null = null) =>
  db.prepare('INSERT INTO categories (id, group_id, group_name, sub_name, type, emoji) VALUES (?,?,?,?,?,?)')
    .run(id, group_id, group_name, sub_name, type, emoji);
const addTxns = (db: Database.Database, catId: number, n: number) => {
  for (let i = 0; i < n; i++) db.prepare('INSERT INTO transactions (category_id) VALUES (?)').run(catId);
};
const catIds = (db: Database.Database) => db.prepare('SELECT id FROM categories ORDER BY id').all().map((r) => (r as { id: number }).id);
const txnCount = (db: Database.Database, catId: number) => (db.prepare('SELECT COUNT(*) c FROM transactions WHERE category_id = ?').get(catId) as { c: number }).c;

function main() {
  // The real case: a hand-made expense-typed twin folds onto the transfer-typed row.
  {
    const db = freshDb();
    addCat(db, 75, 19, 'Transfers', 'Transfer', 'expense', '🔁');
    addCat(db, 78, 20, 'Transfers', 'Transfer', 'transfer', null);
    addTxns(db, 75, 27); addTxns(db, 78, 10);
    db.prepare('INSERT INTO category_rules (id, category_id) VALUES (1, 75)').run();
    migrateTransferCategoryDedupe(db);
    assert.deepEqual(catIds(db), [78], 'twin folded away');
    assert.equal(txnCount(db, 78), 37, 'transactions moved');
    assert.equal((db.prepare('SELECT category_id c FROM category_rules WHERE id=1').get() as { c: number }).c, 78, 'rule repointed');
    assert.equal((db.prepare('SELECT emoji e FROM categories WHERE id=78').get() as { e: string }).e, '🔁', 'emoji carried over');
  }

  // REGRESSION: the section also holds Credit Card Payment / Balance Adjustments.
  // Picking the lowest transfer-typed id folded Transfer INTO one of those.
  {
    const db = freshDb();
    addCat(db, 76, 20, 'Transfers', 'Credit Card Payment', 'transfer', '💳');
    addCat(db, 77, 20, 'Transfers', 'Balance Adjustments', 'transfer', '⚖️');
    addCat(db, 78, 20, 'Transfers', 'Transfer', 'transfer', '🔁');
    addTxns(db, 76, 23); addTxns(db, 77, 4); addTxns(db, 78, 37);
    migrateTransferCategoryDedupe(db);
    assert.deepEqual(catIds(db), [76, 77, 78], 'siblings are not duplicates — nothing folded');
    assert.equal(txnCount(db, 76), 23, 'Credit Card Payment untouched');
    assert.equal(txnCount(db, 78), 37, 'Transfer keeps its transactions');
  }

  // No transfer-typed Transfer leaf → refuse to fold anything.
  {
    const db = freshDb();
    addCat(db, 75, 19, 'Transfers', 'Transfer', 'expense', '🔁');
    addCat(db, 76, 20, 'Transfers', 'Credit Card Payment', 'transfer', '💳');
    addTxns(db, 75, 27);
    migrateTransferCategoryDedupe(db);
    assert.deepEqual(catIds(db), [75, 76], 'nothing canonical to fold onto');
    assert.equal(txnCount(db, 75), 27);
  }

  // Idempotent, and a no-op on a clean single-category install.
  {
    const db = freshDb();
    addCat(db, 78, 20, 'Transfers', 'Transfer', 'transfer', '🔁');
    addTxns(db, 78, 5);
    migrateTransferCategoryDedupe(db);
    migrateTransferCategoryDedupe(db);
    assert.deepEqual(catIds(db), [78]);
    assert.equal(txnCount(db, 78), 5);
  }

  console.log('migrate-transfer-category-dedupe selftest: all assertions passed');
}

main();
