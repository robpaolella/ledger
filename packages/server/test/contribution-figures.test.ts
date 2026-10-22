import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';
import type { ReportContribution } from '@ledger/shared/src/types.js';

// Contribution figures in GET /api/reports/period (#417). Every test runs on an
// in-memory copy of a fresh install (built in a temporary folder); data/ is never opened.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-contribution-figures-'));
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

// Accounts: 1 Joint Checking (John), 2 Brokerage and 3 Roth IRA (the setup's chosen
// accounts), 4 Visa card (Jane), 5 Jane Checking (Jane).
const CHECKING = 1, BROKERAGE = 2, ROTH = 3, CARD = 4, JANE_CHECKING = 5;
let sql: Database.Database;
let investing: number; // Transfers > Investing, tracked into Brokerage and Roth IRA
let college: number;   // Transfers > College, tracked into an account not in Ledger
let untracked: number; // Transfers > Savings, not tracked
let cardPayment: number;
let groceries: number;
let fees: number;
let salary: number;

beforeEach(() => {
  sql = new Database(migrated);
  sql.pragma('foreign_keys = ON');
  handle.current = sql;
  sql.exec(`
    INSERT INTO users (id, username, password_hash, display_name, role) VALUES
      (1, 'sample-owner', 'x', 'John', 'owner'), (2, 'sample-admin', 'x', 'Jane', 'admin');
    INSERT INTO accounts (id, name, type, classification, owner, is_active) VALUES
      (1, 'Joint Checking', 'checking', 'liquid', 'John', 1),
      (2, 'Brokerage', 'investment', 'investment', 'John', 1),
      (3, 'Roth IRA', 'retirement', 'investment', 'Jane', 1),
      (4, 'Visa', 'credit', 'liability', 'Jane', 1),
      (5, 'Jane Checking', 'checking', 'liquid', 'Jane', 1);
    INSERT INTO account_owners (account_id, user_id) VALUES (1, 1), (2, 1), (3, 2), (4, 2), (5, 2);
  `);
  const cat = sql.prepare(`INSERT INTO categories (group_name, sub_name, display_name, type, exclude_from_budget)
    VALUES (?, ?, ?, ?, ?)`);
  const add = (group: string, sub: string, type: string) =>
    Number(cat.run(group, sub, `${group}: ${sub}`, type, type === 'transfer' ? 1 : 0).lastInsertRowid);
  investing = add('Test Transfers', 'Investing', 'transfer');
  college = add('Test Transfers', 'College', 'transfer');
  untracked = add('Test Transfers', 'Savings', 'transfer');
  cardPayment = add('Test Transfers', 'Credit Card Payment', 'transfer');
  groceries = add('Test Food', 'Groceries', 'expense');
  fees = add('Test Food', 'Fees', 'expense');
  salary = add('Test Pay', 'Salary', 'income');
});

function track(categoryId: number, accountIds: number[], external = false): void {
  const id = Number(sql.prepare('INSERT INTO contribution_setups (category_id, includes_external) VALUES (?, ?)')
    .run(categoryId, external ? 1 : 0).lastInsertRowid);
  for (const a of accountIds) sql.prepare('INSERT INTO contribution_setup_accounts (setup_id, account_id) VALUES (?, ?)').run(id, a);
}
const trackAll = () => { track(investing, [BROKERAGE, ROTH]); track(college, [], true); };

function txn(accountId: number, date: string, amount: number, categoryId: number | null, merchantId: number | null = null): number {
  return Number(sql.prepare('INSERT INTO transactions (account_id, date, description, amount, category_id, merchant_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(accountId, date, `Txn ${date} ${amount}`, amount, categoryId, merchantId).lastInsertRowid);
}
function split(accountId: number, date: string, legs: [number, number][]): number {
  const id = txn(accountId, date, legs.reduce((s, [, a]) => s + a, 0), null);
  for (const [c, a] of legs) sql.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run(id, c, a);
  return id;
}
const link = (from: number, to: number, amount: number, status = 'linked') =>
  sql.prepare('INSERT INTO transfer_links (from_transaction_id, to_transaction_id, amount, status) VALUES (?, ?, ?, ?)').run(from, to, amount, status);
const merchant = (name: string) => Number(sql.prepare('INSERT INTO merchants (name) VALUES (?)').run(name).lastInsertRowid);

type Period = { buckets: { label: string }[]; contributions: ReportContribution[]; [k: string]: unknown };
async function period(query: Record<string, string> = {}): Promise<Period> {
  const { default: reports } = await import('../src/routes/reports.js');
  const app = express();
  app.use('/api/reports', reports);
  const server = app.listen(0);
  try {
    const qs = new URLSearchParams({ start: '2026-01-01', end: '2026-03-31', ...query });
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/reports/period?${qs}`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: Period }).data;
  } finally { server.close(); }
}
// Jan, Feb, Mar buckets for the default range.
const figures = async (query: Record<string, string> = {}) => (await period(query)).contributions
  .map((c) => ({ id: c.categoryId, putIn: c.putIn, takenOut: c.takenOut, totalPutIn: c.totalPutIn, totalTakenOut: c.totalTakenOut }));
const one = (id: number, putIn: number[], takenOut: number[]) => ({
  id, putIn, takenOut, totalPutIn: putIn.reduce((a, b) => a + b, 0), totalTakenOut: takenOut.reduce((a, b) => a + b, 0),
});

describe('which transactions count', () => {
  beforeEach(trackAll);

  it('counts a one-sided contribution from the paying account, with category details', async () => {
    txn(CHECKING, '2026-01-10', 500, investing);
    txn(CHECKING, '2026-02-10', 250, college); // paid into an account not in Ledger
    const data = await period();
    expect(data.buckets.map((b) => b.label)).toEqual(['Jan', 'Feb', 'Mar']);
    expect(data.contributions).toEqual([
      { categoryId: college, groupName: 'Test Transfers', name: 'College', putIn: [0, 250, 0], takenOut: [0, 0, 0], totalPutIn: 250, totalTakenOut: 0, accounts: [], external: true },
      { categoryId: investing, groupName: 'Test Transfers', name: 'Investing', putIn: [500, 0, 0], takenOut: [0, 0, 0], totalPutIn: 500, totalTakenOut: 0, accounts: expect.any(Array), external: false },
    ]);
  });

  it('counts a linked two-sided contribution once', async () => {
    link(txn(CHECKING, '2026-01-10', 300, investing), txn(BROKERAGE, '2026-01-11', -300, investing), 300);
    expect(await figures()).toEqual([one(investing, [300, 0, 0], [0, 0, 0])]);
  });

  it('ignores an unlinked receiving copy, including a rejected link', async () => {
    txn(CHECKING, '2026-01-10', 200, investing);
    txn(BROKERAGE, '2026-01-12', -200, investing);
    link(txn(CHECKING, '2026-02-10', 40, investing), txn(ROTH, '2026-02-10', -40, investing), 40, 'rejected');
    expect(await figures()).toEqual([one(investing, [200, 40, 0], [0, 0, 0])]);
  });

  it('counts nothing for a move between two chosen accounts', async () => {
    link(txn(BROKERAGE, '2026-01-10', 100, investing), txn(ROTH, '2026-01-10', -100, investing), 100);
    expect(await figures()).toEqual([]);
  });

  it('counts a split leg by its own amount, not the fee leg', async () => {
    split(CHECKING, '2026-02-03', [[investing, 1000], [fees, 10]]);
    expect(await figures()).toEqual([one(investing, [0, 1000, 0], [0, 0, 0])]);
  });

  it('shows a full reversal across buckets as both put in and taken out', async () => {
    txn(CHECKING, '2026-01-30', 400, investing);
    txn(CHECKING, '2026-02-02', -400, investing);
    expect(await figures()).toEqual([one(investing, [400, 0, 0], [0, 400, 0])]);
  });

  it('shows a partial reversal across buckets, never netted', async () => {
    txn(CHECKING, '2026-01-15', 250, investing);
    txn(CHECKING, '2026-03-01', -50, investing);
    expect(await figures()).toEqual([one(investing, [250, 0, 0], [0, 0, 50])]);
  });

  it('shows a same-day equal in and out as both', async () => {
    txn(CHECKING, '2026-03-05', 75, investing);
    txn(CHECKING, '2026-03-05', -75, investing);
    expect(await figures()).toEqual([one(investing, [0, 0, 75], [0, 0, 75])]);
  });

  it('counts a card-funded contribution when charged, not the later card payment', async () => {
    txn(CARD, '2026-01-20', 150, investing);
    link(txn(CHECKING, '2026-02-15', 150, cardPayment), txn(CARD, '2026-02-15', -150, cardPayment), 150);
    expect(await figures()).toEqual([one(investing, [150, 0, 0], [0, 0, 0])]);
  });

  it('counts nothing seen only on the receiving account', async () => {
    txn(ROTH, '2026-01-05', -600, investing);
    txn(BROKERAGE, '2026-02-05', 80, investing); // a withdrawal seen only on the chosen side
    expect(await figures()).toEqual([]);
  });

  it('never counts untracked transfers or uncategorized transactions', async () => {
    txn(CHECKING, '2026-01-10', 80, untracked);
    txn(CHECKING, '2026-01-11', 90, null);
    txn(CHECKING, '2026-01-12', 95, groceries);
    const data = await period();
    expect(data.contributions).toEqual([]);
  });

  it('leaves out activity outside the range and zero amounts', async () => {
    txn(CHECKING, '2025-12-31', 10, investing);
    txn(CHECKING, '2026-04-01', 20, investing);
    txn(CHECKING, '2026-01-10', 0, investing);
    expect(await figures()).toEqual([]);
  });

  it('uses the weekly buckets for a short range', async () => {
    txn(CHECKING, '2026-03-09', 60, investing);
    const data = await period({ start: '2026-03-01', end: '2026-03-14' });
    expect(data.buckets.map((b) => b.label)).toEqual(['Wk 1', 'Wk 2']);
    expect(data.contributions[0]).toMatchObject({ putIn: [0, 60], takenOut: [0, 0], totalPutIn: 60 });
  });
});

describe('filters', () => {
  let shop = 0;
  beforeEach(() => {
    trackAll();
    shop = merchant('Vanguard');
    txn(CHECKING, '2026-01-10', 500, investing, shop); // John's account
    txn(CHECKING, '2026-02-10', -120, investing);
    txn(JANE_CHECKING, '2026-02-12', 50, investing);   // Jane's account
    txn(JANE_CHECKING, '2026-03-01', 30, college);
  });

  it('applies the date range to the counted transaction', async () => {
    expect(await figures({ start: '2026-02-01', end: '2026-03-31' })).toEqual([
      one(college, [0, 30], [0, 0]), one(investing, [50, 0], [120, 0]),
    ]);
  });

  it('keeps only the chosen categories, by id or by group name', async () => {
    expect(await figures({ categoryIds: String(college) })).toEqual([one(college, [0, 0, 30], [0, 0, 0])]);
    expect((await figures({ groupNames: 'Test Transfers' })).map((c) => c.id)).toEqual([college, investing]);
    expect(await figures({ categoryIds: String(groceries), groupNames: 'Test Food' })).toEqual([]);
  });

  it('applies merchant and amount filters', async () => {
    expect(await figures({ merchantIds: String(shop) })).toEqual([one(investing, [500, 0, 0], [0, 0, 0])]);
    expect(await figures({ amountOp: 'gt', amountValue: '100' })).toEqual([one(investing, [500, 0, 0], [0, 120, 0])]);
    expect(await figures({ amountOp: 'eq', amountValue: '30' })).toEqual([one(college, [0, 0, 30], [0, 0, 0])]);
    expect(await figures({ amountOp: 'bt', amountMin: '40', amountMax: '130' })).toEqual([one(investing, [0, 50, 0], [0, 120, 0])]);
  });

  it('returns no contributions under the income or expense type filter', async () => {
    expect(await figures({ catType: 'income' })).toEqual([]);
    expect(await figures({ catType: 'expense' })).toEqual([]);
  });

  it('keeps only put in for debits and only taken out for credits', async () => {
    expect(await figures({ txnType: 'debits' })).toEqual([
      one(college, [0, 0, 30], [0, 0, 0]), one(investing, [500, 50, 0], [0, 0, 0]),
    ]);
    expect(await figures({ txnType: 'credits' })).toEqual([one(investing, [0, 0, 0], [0, 120, 0])]);
  });

  it('filters accounts and people on the paying side', async () => {
    expect(await figures({ accountIds: String(JANE_CHECKING) })).toEqual([
      one(college, [0, 0, 30], [0, 0, 0]), one(investing, [0, 50, 0], [0, 0, 0]),
    ]);
    expect(await figures({ owner: 'John' })).toEqual([one(investing, [500, 0, 0], [0, 120, 0])]);
    // Unlinked into a setup with several accounts: found only under the paying account.
    expect(await figures({ accountIds: String(BROKERAGE) })).toEqual([]);
  });
});

describe('existing figures', () => {
  it('are identical with and without tracked setups, under every filter', async () => {
    sampleData();
    const queries: Record<string, string>[] = [
      {}, { start: '2026-01-01', end: '2026-01-31' }, { owner: 'Jane' }, { accountIds: `${CHECKING},${CARD}` },
      { groupNames: 'Test Transfers,Test Food' }, { txnType: 'debits' }, { txnType: 'credits' },
      { catType: 'income' }, { catType: 'expense' }, { amountOp: 'gt', amountValue: '60' },
      { owner: 'John' }, { accountIds: String(BROKERAGE) }, { accountIds: `${BROKERAGE},${ROTH}` },
      { owner: 'Jane', accountIds: `${CHECKING},${BROKERAGE}` },
    ];
    const strip = ({ contributions: _c, ...rest }: Period) => rest;
    const before = await Promise.all(queries.map((q) => period(q).then(strip)));
    trackAll();
    const after = await Promise.all(queries.map((q) => period(q)));
    expect(after.map(strip)).toEqual(before);
    expect(after[0].contributions.length).toBeGreaterThan(0);
    // The plain (no filter) figures, so a matching "before" can't be an empty one.
    expect(before[0]).toMatchObject({
      kpis: { income: 3000 + 15, expenses: 205 + 40 + 10, net: 3015 - 255 },
      uncategorized: { count: 2, moneyOut: 40, moneyIn: 15 },
    });
  });

  function sampleData(): void {
    txn(CHECKING, '2026-01-01', -3000, salary);
    txn(CHECKING, '2026-01-05', 120, groceries);
    txn(CARD, '2026-02-05', 85, groceries);
    txn(CHECKING, '2026-01-06', 40, null);
    txn(JANE_CHECKING, '2026-02-06', -15, null);
    split(CHECKING, '2026-02-03', [[investing, 1000], [fees, 10]]);
    link(txn(CHECKING, '2026-01-10', 300, investing), txn(BROKERAGE, '2026-01-11', -300, investing), 300);
    txn(JANE_CHECKING, '2026-03-01', 30, college);
    txn(CARD, '2026-03-02', 70, investing);
    link(txn(CHECKING, '2026-03-15', 155, cardPayment), txn(CARD, '2026-03-15', -155, cardPayment), 155);
  }
});
