import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The routes use the shared db handle, so point it at a scratch file before importing them.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-review-uncat-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

// Amazon enrichment: a configured model that confidently picks one category.
let amazonCategory = 0;
vi.mock('../src/services/llmCategorize.js', () => ({
  llmConfig: () => ({}),
  trustedConfidence: (raw: number) => raw,
  llmCategorizeItems: async (_db: unknown, opts: { items: { key: number }[] }) =>
    new Map(opts.items.map((it) => [it.key, { categoryId: amazonCategory, confidence: 0.95 }])),
}));

let sqlite: Database.Database;
let server: Server;
let base = '';
let acct = 0;
let food = 0;
let owner = 0;
const users: Record<'owner' | 'admin' | 'member', number> = { owner: 0, admin: 0, member: 0 };
let actingAs: keyof typeof users = 'owner';

const NEEDS_ONE = 'Choose a category for this transaction before marking it reviewed.';
const NEEDS_MANY = 'Choose a category for these transactions before marking them reviewed.';

function txn(categoryId: number | null = null, description = 'Test purchase'): number {
  return Number(sqlite.prepare(
    "INSERT INTO transactions (account_id, date, description, amount, category_id) VALUES (?, '2026-05-04', ?, 40, ?)",
  ).run(acct, description, categoryId).lastInsertRowid);
}

/** A transaction with an open auto review, as sync leaves it. */
function flagged(categoryId: number | null = null, description?: string): number {
  const id = txn(categoryId, description);
  sqlite.prepare("INSERT INTO transaction_reviews (transaction_id, status, reason, assignee_id) VALUES (?, 'open', 'auto_uncategorized', ?)").run(id, owner);
  sqlite.prepare('UPDATE transactions SET needs_review = 1 WHERE id = ?').run(id);
  return id;
}

const state = (id: number) => ({
  status: (sqlite.prepare('SELECT status FROM transaction_reviews WHERE transaction_id = ?').get(id) as { status: string }).status,
  needsReview: (sqlite.prepare('SELECT needs_review FROM transactions WHERE id = ?').get(id) as { needs_review: number }).needs_review,
});
const OPEN = { status: 'open', needsReview: 1 };
const RESOLVED = { status: 'resolved', needsReview: 0 };
const confirmations = (id: number) =>
  (sqlite.prepare("SELECT COUNT(*) AS n FROM category_feedback WHERE transaction_id = ? AND kind = 'confirmation'").get(id) as { n: number }).n;

async function send(method: string, url: string, body: unknown) {
  const res = await fetch(`${base}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as { data?: Record<string, unknown>; error?: string } };
}

beforeAll(async () => {
  ({ sqlite } = await import('../src/db/index.js'));
  (await import('../src/db/migrate.js')).runMigrations(sqlite);

  const user = sqlite.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES (?, 'x', ?, ?)");
  for (const role of ['owner', 'admin', 'member'] as const) users[role] = Number(user.run(role, role, role).lastInsertRowid);
  owner = users.owner;
  for (const perm of ['transactions.edit', 'transactions.bulk_edit']) {
    sqlite.prepare('INSERT INTO user_permissions (user_id, permission, granted) VALUES (?, ?, 1)').run(users.member, perm);
  }
  acct = Number(sqlite.prepare("INSERT INTO accounts (name, type, classification, owner) VALUES ('Checking', 'checking', 'liquid', 'owner')").run().lastInsertRowid);
  sqlite.prepare('INSERT INTO account_owners (account_id, user_id) VALUES (?, ?)').run(acct, owner);
  food = Number(sqlite.prepare("INSERT INTO categories (group_name, sub_name, display_name, type) VALUES ('Review Test', 'Food', 'Review Test: Food', 'expense')").run().lastInsertRowid);
  amazonCategory = food;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: users[actingAs], username: actingAs, displayName: actingAs, role: actingAs };
    next();
  });
  app.use('/reviews', (await import('../src/routes/reviews.js')).default);
  app.use('/transactions', (await import('../src/routes/transactions.js')).default);
  app.use('/category-rules', (await import('../src/routes/categoryRules.js')).default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('marking reviewed', () => {
  for (const role of ['owner', 'admin', 'member'] as const) {
    it(`refuses an uncategorized transaction and keeps its item open (${role})`, async () => {
      actingAs = role;
      const id = flagged();
      expect(await send('POST', '/reviews/resolve', { transactionId: id })).toEqual({ status: 400, body: { error: NEEDS_ONE } });
      expect(state(id)).toEqual(OPEN);
      expect(await send('PATCH', `/reviews/${id}`, { status: 'resolved', note: 'checked' })).toEqual({ status: 400, body: { error: NEEDS_ONE } });
      expect(state(id)).toEqual(OPEN);
      // Refused whole: the note in the same request is not saved either.
      expect(sqlite.prepare('SELECT note FROM transaction_reviews WHERE transaction_id = ?').get(id)).toEqual({ note: null });
      expect(confirmations(id)).toBe(0);
      actingAs = 'owner';
    });

    it(`resolves a categorized transaction (${role})`, async () => {
      actingAs = role;
      const a = flagged(food);
      const b = flagged(food);
      expect(await send('POST', '/reviews/resolve', { transactionId: a })).toEqual({ status: 200, body: { data: { resolved: 1, needsCategory: 0 } } });
      expect(state(a)).toEqual(RESOLVED);
      expect(confirmations(a)).toBe(1);
      expect((await send('PATCH', `/reviews/${b}`, { status: 'resolved' })).status).toBe(200);
      expect(state(b)).toEqual(RESOLVED);
      actingAs = 'owner';
    });
  }

  it('resolves once a category is assigned', async () => {
    const id = flagged();
    expect((await send('POST', '/reviews/resolve', { transactionId: id })).status).toBe(400);
    sqlite.prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(food, id);
    expect((await send('POST', '/reviews/resolve', { transactionId: id })).status).toBe(200);
    expect(state(id)).toEqual(RESOLVED);
  });

  it('bulk: resolves the categorized ones, keeps the rest open and counts them', async () => {
    const cat = [flagged(food), flagged(food)];
    const uncat = [flagged(), flagged(), flagged()];
    const res = await send('POST', '/reviews/resolve', { transactionIds: [uncat[0], cat[0], uncat[1], cat[1], uncat[2]] });
    expect(res).toEqual({ status: 200, body: { data: { resolved: 2, needsCategory: 3 } } });
    for (const id of cat) expect(state(id)).toEqual(RESOLVED);
    for (const id of uncat) { expect(state(id)).toEqual(OPEN); expect(confirmations(id)).toBe(0); }
  });

  it('bulk: refuses a selection of only uncategorized ones', async () => {
    const ids = [flagged(), flagged()];
    expect(await send('POST', '/reviews/resolve', { transactionIds: ids })).toEqual({ status: 400, body: { error: NEEDS_MANY } });
    for (const id of ids) expect(state(id)).toEqual(OPEN);
  });
});

describe('resolveReview guard', () => {
  it('leaves an uncategorized item open, and resolves categorized, split and linked-transfer ones', async () => {
    const { resolveReview } = await import('../src/services/reviews.js');
    const uncat = flagged();
    // A caller that cleared the cached flag first must not leave it out of step.
    sqlite.prepare('UPDATE transactions SET needs_review = 0 WHERE id = ?').run(uncat);
    expect(resolveReview(sqlite, { txnId: uncat, resolvedBy: owner })).toBe(false);
    expect(state(uncat)).toEqual(OPEN);

    const categorized = flagged(food);
    const split = flagged();
    sqlite.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, 40)').run(split, food);
    const from = flagged();
    const to = txn();
    sqlite.prepare("INSERT INTO transfer_links (from_transaction_id, to_transaction_id, amount, status) VALUES (?, ?, 40, 'linked')").run(from, to);
    for (const id of [categorized, split, from]) {
      expect(resolveReview(sqlite, { txnId: id, resolvedBy: owner })).toBe(true);
      expect(state(id)).toEqual(RESOLVED);
    }
  });
});

describe('paths that assign a category still close the item', () => {
  it('transaction edit (single category and splits)', async () => {
    const single = flagged();
    expect((await send('PUT', `/transactions/${single}`, { categoryId: food })).status).toBe(200);
    expect(state(single)).toEqual(RESOLVED);
    const split = flagged();
    expect((await send('PUT', `/transactions/${split}`, { splits: [{ categoryId: food, amount: 25 }, { categoryId: food, amount: 15 }] })).status).toBe(200);
    expect(state(split)).toEqual(RESOLVED);
  });

  it('bulk update', async () => {
    const ids = [flagged(), flagged()];
    expect((await send('POST', '/transactions/bulk-update', { ids, updates: { categoryId: food } })).status).toBe(200);
    for (const id of ids) expect(state(id)).toEqual(RESOLVED);
  });

  it('category rule applied to existing transactions', async () => {
    const id = flagged(null, 'RULETEST COFFEE');
    const res = await send('POST', '/category-rules', { matchType: 'contains', pattern: 'RULETEST', categoryId: food, applyToExisting: true });
    expect(res.status).toBe(201);
    expect(state(id)).toEqual(RESOLVED);
  });

  it('Amazon enrichment', async () => {
    const id = flagged();
    sqlite.prepare("INSERT INTO amazon_orders (order_number, order_date, raw_json, scraped_at) VALUES ('111-TEST', '2026-05-01', '{}', '2026-05-02')").run();
    sqlite.prepare("INSERT INTO amazon_order_items (order_number, title, unit_price, quantity) VALUES ('111-TEST', 'Coffee beans', 40, 1)").run();
    sqlite.prepare("INSERT INTO amazon_matches (transaction_id, order_number, amount) VALUES (?, '111-TEST', 40)").run(id);
    const { enrichMatchedTransactions } = await import('../src/services/amazonEnrich.js');
    expect((await enrichMatchedTransactions(sqlite)).enriched).toBe(1);
    expect(state(id)).toEqual(RESOLVED);
  });
});
