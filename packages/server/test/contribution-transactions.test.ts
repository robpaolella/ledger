import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';
import type { ReportContribution, ReportContributionTransaction } from '@ledger/shared/src/types.js';

// The list behind a contribution's figures (#418): GET
// /api/reports/contributions/:categoryId/transactions holds exactly the legs
// GET /api/reports/period counts. Every test runs on an in-memory copy of a fresh install (built in a
// temporary folder); data/ is never opened.
const handle = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../src/db/index.js', async () => {
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/db/schema.js');
  return {
    get sqlite() { return handle.current; },
    get db() { return drizzle(handle.current as Database.Database, { schema }); },
  };
});

let migrated: Buffer;
beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-contribution-transactions-'));
  process.env.DATABASE_PATH = path.join(dir, 'ledger.db');
  try {
    const real = await vi.importActual<typeof import('../src/db/index.js')>('../src/db/index.js');
    const { runMigrations } = await import('../src/db/migrate.js');
    runMigrations(real.sqlite);
    real.sqlite.pragma('journal_mode = DELETE'); // an in-memory copy can't open a WAL image
    migrated = real.sqlite.serialize();
    real.sqlite.close();
  } finally {
    delete process.env.DATABASE_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

// Accounts and owners: 1 John Checking (John), 2 Jane Checking (Jane), 3 Joint
// Checking (both), 4 Brokerage (John), 5 Roth IRA (Jane), 6 College 529 (Jane),
// 7 HSA (Jane).
const JOHN_CHECKING = 1, JANE_CHECKING = 2, JOINT = 3, BROKERAGE = 4, ROTH = 5, COLLEGE_529 = 6, HSA = 7;
let sql: Database.Database;
let investing: number; // tracked into Brokerage and Roth IRA (several accounts)
let college: number;   // tracked into College 529 only (one account)
let health: number;    // tracked into HSA and an account not in Ledger

beforeEach(() => {
  sql = new Database(migrated);
  sql.pragma('foreign_keys = ON');
  handle.current = sql;
  sql.exec(`
    INSERT INTO users (id, username, password_hash, display_name, role) VALUES
      (1, 'sample-owner', 'x', 'John', 'owner'), (2, 'sample-admin', 'x', 'Jane', 'admin');
    INSERT INTO accounts (id, name, type, classification, owner, is_active) VALUES
      (1, 'John Checking', 'checking', 'liquid', 'John', 1),
      (2, 'Jane Checking', 'checking', 'liquid', 'Jane', 1),
      (3, 'Joint Checking', 'checking', 'liquid', 'John', 1),
      (4, 'Brokerage', 'investment', 'investment', 'John', 1),
      (5, 'Roth IRA', 'retirement', 'investment', 'Jane', 1),
      (6, 'College 529', 'investment', 'investment', 'Jane', 1),
      (7, 'HSA', 'investment', 'investment', 'Jane', 1);
    INSERT INTO account_owners (account_id, user_id) VALUES (1, 1), (2, 2), (3, 1), (3, 2), (4, 1), (5, 2), (6, 2), (7, 2);
  `);
  const cat = sql.prepare(`INSERT INTO categories (group_name, sub_name, display_name, type, exclude_from_budget)
    VALUES (?, ?, ?, ?, 1)`);
  const add = (sub: string) => Number(cat.run('Test Transfers', sub, `Test Transfers: ${sub}`, 'transfer').lastInsertRowid);
  investing = add('Investing');
  college = add('College');
  health = add('Health');
  track(investing, [BROKERAGE, ROTH]);
  track(college, [COLLEGE_529]);
  track(health, [HSA], true);
});

function track(categoryId: number, accountIds: number[], external = false): void {
  const id = Number(sql.prepare('INSERT INTO contribution_setups (category_id, includes_external) VALUES (?, ?)')
    .run(categoryId, external ? 1 : 0).lastInsertRowid);
  for (const a of accountIds) sql.prepare('INSERT INTO contribution_setup_accounts (setup_id, account_id) VALUES (?, ?)').run(id, a);
}
function txn(accountId: number, date: string, amount: number, categoryId: number): number {
  return Number(sql.prepare('INSERT INTO transactions (account_id, date, description, amount, category_id) VALUES (?, ?, ?, ?, ?)')
    .run(accountId, date, `Txn ${date} ${amount}`, amount, categoryId).lastInsertRowid);
}
const link = (from: number, to: number, amount: number, status = 'linked') =>
  sql.prepare('INSERT INTO transfer_links (from_transaction_id, to_transaction_id, amount, status) VALUES (?, ?, ?, ?)').run(from, to, amount, status);


type Row = ReportContributionTransaction;
async function call(path: string, query: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const { default: reports } = await import('../src/routes/reports.js');
  const app = express();
  app.use('/api/reports', reports);
  const server = app.listen(0);
  try {
    const qs = new URLSearchParams({ start: '2026-01-01', end: '2026-03-31', ...query });
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/reports/${path}?${qs}`);
    return { status: res.status, body: await res.json() };
  } finally { server.close(); }
}
async function list(categoryId: number, query: Record<string, string> = {}): Promise<{ data: Row[]; total: number }> {
  const r = await call(`contributions/${categoryId}/transactions`, query);
  expect(r.status).toBe(200);
  return r.body;
}
const sums = (rows: Row[]) => ({
  putIn: rows.filter((r) => r.direction === 'putIn').reduce((n, r) => n + r.amount, 0),
  takenOut: rows.filter((r) => r.direction === 'takenOut').reduce((n, r) => n + r.amount, 0),
});
/** The list's sums must equal the period figures for the same filters. */
async function expectMatchesFigures(categoryId: number, query: Record<string, string> = {}) {
  const fig = (await call('period', query)).body.data.contributions as ReportContribution[];
  const f = fig.find((c) => c.categoryId === categoryId);
  const { data, total } = await list(categoryId, { limit: '1000', ...query });
  expect(total).toBe(data.length);
  expect(sums(data)).toEqual({ putIn: f?.totalPutIn ?? 0, takenOut: f?.totalTakenOut ?? 0 });
  return data;
}

describe('counting cases', () => {
  it('lists a one-sided contribution from the paying account to the single-account destination', async () => {
    const id = txn(JOHN_CHECKING, '2026-01-15', 200, college);
    const data = await expectMatchesFigures(college);
    expect(data).toEqual([expect.objectContaining({
      transactionId: id, splitId: null, date: '2026-01-15', accountId: JOHN_CHECKING, accountName: 'John Checking',
      destinationAccountId: COLLEGE_529, destinationAccountName: 'College 529', amount: 200, direction: 'putIn',
      merchant: null, description: 'Txn 2026-01-15 200',
    })]);
  });

  it('lists a linked pair once, on its paying leg, with the partner as destination', async () => {
    link(txn(JOHN_CHECKING, '2026-01-10', 300, investing), txn(BROKERAGE, '2026-01-11', -300, investing), 300);
    const data = await expectMatchesFigures(investing);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ accountId: JOHN_CHECKING, destinationAccountId: BROKERAGE, direction: 'putIn' });
  });

  it('lists the incoming checking leg of a linked withdrawal as taken out', async () => {
    const out = txn(BROKERAGE, '2026-02-01', 80, investing);
    const back = txn(JOHN_CHECKING, '2026-02-02', -80, investing);
    link(out, back, 80);
    const data = await expectMatchesFigures(investing);
    expect(data).toEqual([expect.objectContaining({
      transactionId: back, accountId: JOHN_CHECKING, destinationAccountId: BROKERAGE, amount: 80, direction: 'takenOut',
    })]);
  });

  it('never lists a receiving-side copy or a move between chosen accounts', async () => {
    txn(BROKERAGE, '2026-01-11', -300, investing);
    txn(BROKERAGE, '2026-01-12', 50, investing);
    txn(ROTH, '2026-01-12', -50, investing);
    expect((await list(investing)).data).toEqual([]);
    await expectMatchesFigures(investing);
  });

  it('lists a split leg by its own amount and merchant, not the other legs', async () => {
    sql.prepare("INSERT INTO merchants (id, name) VALUES (1, 'Vanguard')").run();
    const other = Number(sql.prepare("INSERT INTO categories (group_name, sub_name, display_name, type) VALUES ('Food', 'Groceries', 'Food: Groceries', 'expense')").run().lastInsertRowid);
    const t = Number(sql.prepare('INSERT INTO transactions (account_id, date, description, amount) VALUES (?, ?, ?, ?)')
      .run(JOHN_CHECKING, '2026-02-05', 'Mixed', 150).lastInsertRowid);
    const leg = Number(sql.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount, merchant_id) VALUES (?, ?, ?, 1)').run(t, investing, 100).lastInsertRowid);
    sql.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run(t, other, 50);
    const data = await expectMatchesFigures(investing);
    expect(data).toEqual([expect.objectContaining({ transactionId: t, splitId: leg, amount: 100, merchant: 'Vanguard', description: 'Mixed' })]);
  });

  it('lists a reversal as taken out and skips zero-amount legs', async () => {
    txn(JOHN_CHECKING, '2026-01-10', 100, college);
    txn(JOHN_CHECKING, '2026-01-20', -40, college);
    txn(JOHN_CHECKING, '2026-01-25', 0, college);
    const data = await expectMatchesFigures(college);
    expect(data).toHaveLength(2);
    expect(sums(data)).toEqual({ putIn: 100, takenOut: 40 });
  });

  it('lists a card-funded contribution on the card account', async () => {
    sql.exec("INSERT INTO accounts (id, name, type, classification, owner, is_active) VALUES (8, 'Visa', 'credit_card', 'liability', 'John', 1)");
    txn(8, '2026-03-01', 90, college);
    const data = await expectMatchesFigures(college);
    expect(data[0]).toMatchObject({ accountName: 'Visa', amount: 90 });
  });

  it('lists only the asked category', async () => {
    txn(JOHN_CHECKING, '2026-01-10', 100, college);
    txn(JOHN_CHECKING, '2026-01-11', 70, investing);
    expect((await list(college)).data).toHaveLength(1);
    expect((await list(investing)).data).toHaveLength(1);
  });

  it('is empty when nothing counted in range', async () => {
    txn(JOHN_CHECKING, '2025-01-10', 100, college);
    expect(await list(college)).toEqual({ data: [], total: 0 });
  });

  it('gives a plain-English 404 for an untracked or unknown category', async () => {
    const plain = Number(sql.prepare("INSERT INTO categories (group_name, sub_name, display_name, type) VALUES ('Food', 'Groceries', 'Food: Groceries', 'expense')").run().lastInsertRowid);
    for (const id of [String(plain), '99999', 'abc', `${college}junk`, `${college}.5`]) {
      const r = await call(`contributions/${id}/transactions`);
      expect(r.status).toBe(404);
      expect(r.body.error).toMatch(/not set up/);
    }
  });

  it('asks for dates', async () => {
    const r = await call(`contributions/${college}/transactions`, { start: 'nope' });
    expect(r.status).toBe(400);
  });
});

describe('filters keep the list equal to the figures', () => {
  beforeEach(() => {
    link(txn(JOHN_CHECKING, '2026-01-10', 300, investing), txn(ROTH, '2026-01-11', -300, investing), 300);
    txn(JOHN_CHECKING, '2026-01-20', 100, investing);
    txn(JANE_CHECKING, '2026-02-01', 55.5, investing);
    txn(JOINT, '2026-02-10', -20, investing);
    sql.prepare("INSERT INTO merchants (id, name) VALUES (1, 'Fidelity')").run();
    sql.prepare('UPDATE transactions SET merchant_id = 1 WHERE date = ?').run('2026-02-01');
  });

  it.each([
    ['paying account', { accountIds: String(JOHN_CHECKING) }, 2],
    ['destination account', { accountIds: String(ROTH) }, 1],
    ['person', { owner: 'Jane' }, 3],
    ['merchant', { merchantIds: '1' }, 1],
    ['category', { categoryIds: 'X' }, 4],
    ['amount over', { amountOp: 'gt', amountValue: '100' }, 1],
    ['amount between', { amountOp: 'bt', amountMin: '50', amountMax: '150' }, 2],
    ['debits only', { txnType: 'debits' }, 3],
    ['credits only', { txnType: 'credits' }, 1],
    ['date range', { end: '2026-01-31' }, 2],
  ])('%s', async (_n, query, count) => {
    const q = { ...query } as Record<string, string>;
    if (q.categoryIds === 'X') q.categoryIds = String(investing);
    const data = await expectMatchesFigures(investing, q);
    expect(data).toHaveLength(count);
  });

  it('lists nothing under the income/expense type filter, like the figures', async () => {
    expect((await list(investing, { catType: 'expense' })).data).toEqual([]);
  });
});

describe('sorting and paging', () => {
  beforeEach(() => {
    txn(JOHN_CHECKING, '2026-01-10', 50, college);
    txn(JOHN_CHECKING, '2026-01-10', 20, college);
    txn(JOHN_CHECKING, '2026-01-10', -20, college);
    txn(JOHN_CHECKING, '2026-02-10', 300, college);
    txn(JOHN_CHECKING, '2026-03-10', 10, college);
  });
  const pick = (r: { data: Row[] }) => r.data.map((x) => `${x.date}:${x.direction === 'putIn' ? '+' : '-'}${x.amount}`);

  it('sorts by date, newest first by default, ties by transaction id', async () => {
    expect(pick(await list(college))).toEqual(['2026-03-10:+10', '2026-02-10:+300', '2026-01-10:+50', '2026-01-10:+20', '2026-01-10:-20']);
  });
  it('sorts by date ascending', async () => {
    expect(pick(await list(college, { sortOrder: 'asc' }))[0]).toBe('2026-01-10:+50');
  });
  it('sorts by amount both ways', async () => {
    expect((await list(college, { sortBy: 'amount', sortOrder: 'desc' })).data.map((r) => r.amount)).toEqual([300, 50, 20, 20, 10]);
    expect((await list(college, { sortBy: 'amount', sortOrder: 'asc' })).data.map((r) => r.amount)).toEqual([10, 20, 20, 50, 300]);
  });
  it('thenBy absAmount orders within a date', async () => {
    expect(pick(await list(college, { thenBy: 'absAmount', thenOrder: 'asc', sortOrder: 'asc' })).slice(0, 3))
      .toEqual(['2026-01-10:+20', '2026-01-10:-20', '2026-01-10:+50']);
    expect(pick(await list(college, { thenBy: 'absAmount', thenOrder: 'desc', sortOrder: 'asc' })).slice(0, 3))
      .toEqual(['2026-01-10:+50', '2026-01-10:+20', '2026-01-10:-20']);
  });
  it('pages continue without repeating or skipping, with the full total', async () => {
    const all = (await list(college)).data.map((r) => r.transactionId);
    const p1 = await list(college, { limit: '2', offset: '0' });
    const p2 = await list(college, { limit: '2', offset: '2' });
    const p3 = await list(college, { limit: '2', offset: '4' });
    expect([p1.total, p2.total, p3.total]).toEqual([5, 5, 5]);
    expect([...p1.data, ...p2.data, ...p3.data].map((r) => r.transactionId)).toEqual(all);
    expect((await list(college, { limit: '2', offset: '10' })).data).toEqual([]);
  });
  it('clamps limit and falls back on bad values', async () => {
    expect((await list(college, { limit: '0' })).data).toHaveLength(1);
    expect((await list(college, { limit: 'x', offset: '-5' })).data).toHaveLength(5);
  });
});
