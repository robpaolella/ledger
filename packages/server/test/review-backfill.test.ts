import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The routes use the shared db handle, so point it at a scratch file before importing them.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-review-backfill-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

let sqlite: Database.Database;
let runMigrations: (db: Database.Database) => void;
let server: Server;
let base = '';
let checking = 0;
let savings = 0;
let food = 0;
const users: Record<'owner' | 'admin' | 'member', number> = { owner: 0, admin: 0, member: 0 };
let actingAs: keyof typeof users = 'owner';
let nextAmount = 10;

/** A transaction with a unique amount, so boot-time transfer linking never pairs it. */
function txn(opts: { categoryId?: number | null; account?: number; amount?: number } = {}): number {
  return Number(sqlite.prepare(
    "INSERT INTO transactions (account_id, date, description, amount, category_id) VALUES (?, '2026-05-04', 'Test purchase', ?, ?)",
  ).run(opts.account ?? checking, opts.amount ?? (nextAmount += 1.11), opts.categoryId ?? null).lastInsertRowid);
}

/** A review row in the given state, as an older version could leave it. */
function review(id: number, status: 'open' | 'resolved', note: string | null = null): number {
  const row = sqlite.prepare(
    "INSERT INTO transaction_reviews (transaction_id, status, reason, assignee_id, note, resolved_by, resolved_at) VALUES (?, ?, 'manual', ?, ?, ?, ?)",
  ).run(id, status, users.owner, note, status === 'resolved' ? users.owner : null, status === 'resolved' ? '2026-05-05T00:00:00.000Z' : null);
  sqlite.prepare('UPDATE transactions SET needs_review = ? WHERE id = ?').run(status === 'open' ? 1 : 0, id);
  return Number(row.lastInsertRowid);
}

function link(from: number, to: number, status: 'linked' | 'rejected' = 'linked') {
  const { amount } = sqlite.prepare('SELECT amount FROM transactions WHERE id = ?').get(from) as { amount: number };
  sqlite.prepare("INSERT INTO transfer_links (from_transaction_id, to_transaction_id, amount, linked_by, status) VALUES (?, ?, ?, 'manual', ?)").run(from, to, amount, status);
}

/** A pair across two accounts: money out of checking, into savings. */
function pair(): [number, number] {
  const amount = (nextAmount += 1.11);
  return [txn({ amount }), txn({ account: savings, amount: -amount })];
}

type Item = { id: number; status: string; assignee_id: number | null; note: string | null; resolved_at: string | null; needs_review: number };
const item = (txnId: number) => sqlite.prepare(`
  SELECT r.id, r.status, r.assignee_id, r.note, r.resolved_at, t.needs_review
  FROM transactions t LEFT JOIN transaction_reviews r ON r.transaction_id = t.id WHERE t.id = ?
`).get(txnId) as Item;
const count = (table: string) => (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const snapshot = () => ({
  reviews: sqlite.prepare('SELECT * FROM transaction_reviews ORDER BY id').all(),
  transactions: sqlite.prepare('SELECT id, needs_review, category_id FROM transactions ORDER BY id').all(),
});

async function send(method: string, url: string, body?: unknown) {
  const res = await fetch(`${base}${url}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as { data?: Record<string, unknown>; error?: string } };
}

beforeAll(async () => {
  ({ sqlite } = await import('../src/db/index.js'));
  ({ runMigrations } = await import('../src/db/migrate.js'));
  // A fresh database: the backfill runs with nothing to do.
  expect(() => runMigrations(sqlite)).not.toThrow();
  expect(count('transaction_reviews')).toBe(0);

  const user = sqlite.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES (?, 'x', ?, ?)");
  for (const role of ['owner', 'admin', 'member'] as const) users[role] = Number(user.run(role, role, role).lastInsertRowid);
  for (const perm of ['transactions.create', 'transactions.edit']) {
    sqlite.prepare('INSERT INTO user_permissions (user_id, permission, granted) VALUES (?, ?, 1)').run(users.member, perm);
  }
  const account = sqlite.prepare("INSERT INTO accounts (name, type, classification, owner) VALUES (?, ?, 'liquid', 'owner')");
  checking = Number(account.run('Checking', 'checking').lastInsertRowid);
  savings = Number(account.run('Savings', 'savings').lastInsertRowid);
  for (const a of [checking, savings]) sqlite.prepare('INSERT INTO account_owners (account_id, user_id) VALUES (?, ?)').run(a, users.owner);
  food = Number(sqlite.prepare("INSERT INTO categories (group_name, sub_name, display_name, type) VALUES ('Backfill Test', 'Food', 'Backfill Test: Food', 'expense')").run().lastInsertRowid);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: users[actingAs], username: actingAs, displayName: actingAs, role: actingAs };
    next();
  });
  app.use('/transactions', (await import('../src/routes/transactions.js')).default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('startup backfill', () => {
  it('opens an item for every uncategorized transaction on an existing database, reopening rather than duplicating', () => {
    const reviewedUncat = txn();
    const reviewedRow = review(reviewedUncat, 'resolved', 'looked at it');
    const noItem = txn();
    const alreadyOpen = txn();
    const openRow = review(alreadyOpen, 'open');
    const reviewedCat = txn({ categoryId: food });
    review(reviewedCat, 'resolved');
    const plainCat = txn({ categoryId: food });
    const split = txn();
    sqlite.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run(split, food, 5);
    const [linkedOut, linkedIn] = pair();
    link(linkedOut, linkedIn);
    const [rejectedOut, rejectedIn] = pair();
    link(rejectedOut, rejectedIn, 'rejected');

    const txnsBefore = count('transactions');
    const reviewsBefore = count('transaction_reviews');
    runMigrations(sqlite);

    // Reopened in place: same row, note kept, resolution cleared, assigned to the account owner.
    expect(item(reviewedUncat)).toEqual({ id: reviewedRow, status: 'open', assignee_id: users.owner, note: 'looked at it', resolved_at: null, needs_review: 1 });
    expect(item(noItem)).toMatchObject({ status: 'open', assignee_id: users.owner, needs_review: 1 });
    expect(item(alreadyOpen)).toMatchObject({ id: openRow, status: 'open', needs_review: 1 });
    for (const id of [rejectedOut, rejectedIn]) expect(item(id)).toMatchObject({ status: 'open', needs_review: 1 });
    // Categorized, split and linked-transfer rows are not uncategorized: left alone.
    expect(item(reviewedCat)).toMatchObject({ status: 'resolved', needs_review: 0 });
    for (const id of [plainCat, split, linkedOut, linkedIn]) expect(item(id)).toMatchObject({ id: null, needs_review: 0 });

    // Only the three missing items were added; nothing was deleted.
    expect(count('transactions')).toBe(txnsBefore);
    expect(count('transaction_reviews')).toBe(reviewsBefore + 3);
    expect(sqlite.prepare("SELECT body FROM notifications WHERE user_id = ? AND dedupe_key = 'review:aggregate'").get(users.owner))
      .toEqual({ body: '5 transactions assigned to you need review' });
  });

  it('changes nothing when it runs again', () => {
    txn();
    runMigrations(sqlite);
    const before = snapshot();
    runMigrations(sqlite);
    expect(snapshot()).toEqual(before);
  });
});

describe('routes', () => {
  for (const role of ['owner', 'admin', 'member'] as const) {
    it(`refuses a hand-created transaction with no category or splits, and creates nothing (${role})`, async () => {
      actingAs = role;
      const before = count('transactions');
      const res = await send('POST', '/transactions', { accountId: checking, date: '2026-05-06', description: 'Coffee', amount: 4.5 });
      expect(res).toEqual({ status: 400, body: { error: 'categoryId or splits required' } });
      expect(count('transactions')).toBe(before);
      actingAs = 'owner';
    });

    it(`gives no item to a hand-created categorized transaction (${role})`, async () => {
      actingAs = role;
      const res = await send('POST', '/transactions', { accountId: checking, date: '2026-05-06', description: 'Lunch', amount: 12, categoryId: food });
      expect(res.status).toBe(201);
      expect(item(Number(res.body.data!.id))).toMatchObject({ id: null, needs_review: 0 });
      actingAs = 'owner';
    });

    it(`opens an item for each leg left uncategorized when a link is removed (${role})`, async () => {
      actingAs = role;
      const [out, inc] = pair();
      link(out, inc);
      review(out, 'resolved');
      const [catOut, catIn] = pair();
      sqlite.prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(food, catIn);
      link(catOut, catIn);

      expect(await send('DELETE', `/transactions/${inc}/transfer-link`)).toEqual({ status: 200, body: { data: { unlinked: 1 } } });
      for (const id of [out, inc]) expect(item(id)).toMatchObject({ status: 'open', assignee_id: users.owner, needs_review: 1 });
      expect(await send('DELETE', `/transactions/${catOut}/transfer-link`)).toEqual({ status: 200, body: { data: { unlinked: 1 } } });
      expect(item(catOut)).toMatchObject({ status: 'open', needs_review: 1 });
      expect(item(catIn)).toMatchObject({ id: null, needs_review: 0 });
      actingAs = 'owner';
    });

    it(`opens an item for a former partner left uncategorized when a leg is relinked (${role})`, async () => {
      actingAs = role;
      const [out, oldIn] = pair();
      link(out, oldIn);
      const newIn = txn({ account: savings, amount: -(sqlite.prepare('SELECT amount FROM transactions WHERE id = ?').get(out) as { amount: number }).amount });

      expect((await send('POST', `/transactions/${out}/transfer-link`, { otherId: newIn })).status).toBe(201);
      expect(item(oldIn)).toMatchObject({ status: 'open', assignee_id: users.owner, needs_review: 1 });
      // The new pair is a linked transfer, so not uncategorized.
      for (const id of [out, newIn]) expect(item(id)).toMatchObject({ id: null, needs_review: 0 });
      actingAs = 'owner';
    });
  }

  it('leaves the link alone and opens nothing when there is no link to remove', async () => {
    const id = txn({ categoryId: food });
    const before = count('transaction_reviews');
    expect(await send('DELETE', `/transactions/${id}/transfer-link`)).toEqual({ status: 404, body: { error: 'No transfer link on this transaction' } });
    expect(count('transaction_reviews')).toBe(before);
  });
});
