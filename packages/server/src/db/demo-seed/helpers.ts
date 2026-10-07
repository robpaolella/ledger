/** Shared date shifting, category lookup, and transaction/split insertion helpers. */
import type Database from 'better-sqlite3';
import { findOrCreateMerchant } from '../merchants.js';

export function createHelpers(db: Database.Database) {
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Relative dates: the fixtures below are written against Jan–Mar 2026. Shift
  // every date so the last fixture month (2026-03) lands on the current month,
  // which keeps "this month" views populated whenever the demo is seeded.
  // ---------------------------------------------------------------------------
  const FIXTURE_LAST = { y: 2026, m: 3 };
  const now = new Date();
  const MONTH_SHIFT = (now.getFullYear() - FIXTURE_LAST.y) * 12 + (now.getMonth() + 1 - FIXTURE_LAST.m);
  function rel(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    const idx = y * 12 + (m - 1) + MONTH_SHIFT;
    const ny = Math.floor(idx / 12);
    const nm = (idx % 12) + 1;
    if (d === undefined) return `${ny}-${String(nm).padStart(2, '0')}`;
    const last = new Date(ny, nm, 0).getDate();
    return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
  }

  function catId(groupName: string, subName: string): number {
    const row = db.prepare(
      'SELECT id FROM categories WHERE group_name = ? AND sub_name = ?'
    ).get(groupName, subName) as { id: number } | undefined;
    if (!row) throw new Error(`Category not found: ${groupName} / ${subName}`);
    return row.id;
  }

  function insertTx(
    accountId: number,
    date: string,
    description: string,
    categoryId: number,
    amount: number,
    note?: string
  ): number {
    // Demo descriptions are already clean merchant names ("Costco", "Netflix"), so
    // link them 1:1 the way a user-entered transaction would be.
    const merchantId = findOrCreateMerchant(description, db);
    const res = db.prepare(
      'INSERT INTO transactions (account_id, date, description, category_id, merchant_id, amount, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(accountId, rel(date), description, categoryId, merchantId, amount, note ?? null);
    return Number(res.lastInsertRowid);
  }

  function insertSplit(txId: number, categoryId: number, amount: number) {
    db.prepare(
      'INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)'
    ).run(txId, categoryId, amount);
  }


  return { db: db as Database.Database, rel, catId, insertTx, insertSplit };
}

export type Helpers = ReturnType<typeof createHelpers>;
