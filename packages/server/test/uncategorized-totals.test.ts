import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The routes use the shared db handle, so point it at a scratch file before importing them.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-uncategorized-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

let sqlite: Database.Database;
let server: Server;
let base = '';
let acctA = 0; // owned by Alex
let acctB = 0; // owned by Blair
let food = 0;

const get = async <T>(url: string): Promise<T> => {
  const res = await fetch(`${base}${url}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: T }).data;
};

function txn(accountId: number, date: string, amount: number, categoryId: number | null = null): number {
  return Number(sqlite.prepare(
    'INSERT INTO transactions (account_id, date, description, amount, category_id) VALUES (?, ?, ?, ?, ?)',
  ).run(accountId, date, `Txn ${date} ${amount}`, amount, categoryId).lastInsertRowid);
}

type Unc = { count: number; moneyOut: number; moneyIn: number };
type Summary = { totals: { actualIncome: number; actualExpenses: number; budgetedIncome: number; budgetedExpenses: number; leftToBudget: number }; uncategorized: Unc };
type Period = { kpis: { income: number; expenses: number; net: number; savingsRate: number }; uncategorized: Unc & { buckets: Unc[] }; categories: { categoryId: number; total: number }[] };
type Series = { days: { day: number; cumulative: number }[]; uncategorized: Unc };

const ZERO = { count: 0, moneyOut: 0, moneyIn: 0 };

beforeAll(async () => {
  ({ sqlite } = await import('../src/db/index.js'));
  (await import('../src/db/migrate.js')).runMigrations(sqlite);

  const user = sqlite.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES (?, 'x', ?, 'owner')");
  const alex = Number(user.run('alex', 'Alex').lastInsertRowid);
  const blair = Number(user.run('blair', 'Blair').lastInsertRowid);
  const acct = sqlite.prepare("INSERT INTO accounts (name, type, classification, owner) VALUES (?, 'checking', 'liquid', ?)");
  acctA = Number(acct.run('Alex Checking', 'Alex').lastInsertRowid);
  acctB = Number(acct.run('Blair Card', 'Blair').lastInsertRowid);
  sqlite.prepare('INSERT INTO account_owners (account_id, user_id) VALUES (?, ?)').run(acctA, alex);
  sqlite.prepare('INSERT INTO account_owners (account_id, user_id) VALUES (?, ?)').run(acctB, blair);

  const cat = sqlite.prepare("INSERT INTO categories (group_name, sub_name, display_name, type) VALUES (?, ?, ?, ?)");
  food = Number(cat.run('Uncat Test', 'Food', 'Uncat Test: Food', 'expense').lastInsertRowid);
  const salary = Number(cat.run('Uncat Income', 'Salary', 'Uncat Income: Salary', 'income').lastInsertRowid);
  const transfer = Number(cat.run('Uncat Transfer', 'Move', 'Uncat Transfer: Move', 'transfer').lastInsertRowid);
  sqlite.prepare("INSERT INTO budgets (category_id, month, amount) VALUES (?, '2026-05', 200), (?, '2026-05', 1000)").run(food, salary);

  // May 2026: categorized, uncategorized both ways on both accounts, a split,
  // a categorized transfer and an uncategorized but linked transfer pair.
  txn(acctA, '2026-05-01', -1000, salary);
  txn(acctA, '2026-05-03', 100, food);
  txn(acctA, '2026-05-04', 40);                 // uncategorized, money out (week 1)
  const split = txn(acctB, '2026-05-05', 60);   // split: counted under Food, not uncategorized
  sqlite.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, 60)').run(split, food);
  txn(acctB, '2026-05-10', -25);                // uncategorized, money in (week 2)
  txn(acctB, '2026-05-20', 10);                 // uncategorized, money out (week 3)
  txn(acctA, '2026-05-12', 500, transfer);
  const from = txn(acctA, '2026-05-15', 300);
  const to = txn(acctB, '2026-05-15', -300);
  sqlite.prepare("INSERT INTO transfer_links (from_transaction_id, to_transaction_id, amount, status) VALUES (?, ?, 300, 'linked')").run(from, to);

  // One-sided months: June money in only, July money out only.
  txn(acctA, '2026-06-08', -30);
  txn(acctA, '2026-07-09', 45);

  // September: categorized spending and both directions of uncategorized on one day.
  txn(acctA, '2026-09-14', 20, food);
  txn(acctA, '2026-09-14', 7);
  txn(acctB, '2026-09-14', -3);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId: alex, username: 'alex', displayName: 'Alex', role: 'owner' }; next(); });
  app.use('/budgets', (await import('../src/routes/budgets.js')).default);
  app.use('/reports', (await import('../src/routes/reports.js')).default);
  app.use('/dashboard', (await import('../src/routes/dashboard.js')).default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('Budget summary', () => {
  it('counts uncategorized money once, out under Expenses and in under Income; Left to budget unchanged', async () => {
    const d = await get<Summary>('/budgets/summary?month=2026-05');
    expect(d.uncategorized).toEqual({ count: 3, moneyOut: 50, moneyIn: 25 });
    expect(d.totals.actualExpenses).toBe(100 + 60 + 50);
    expect(d.totals.actualIncome).toBe(1000 + 25);
    expect(d.totals.leftToBudget).toBe(d.totals.budgetedIncome - d.totals.budgetedExpenses);
  });

  it('follows the owner filter', async () => {
    const d = await get<Summary>('/budgets/summary?month=2026-05&owner=Blair');
    expect(d.uncategorized).toEqual({ count: 2, moneyOut: 10, moneyIn: 25 });
  });

  it('handles one-sided months and returns zeros when nothing is uncategorized', async () => {
    expect((await get<Summary>('/budgets/summary?month=2026-06')).uncategorized).toEqual({ count: 1, moneyOut: 0, moneyIn: 30 });
    const july = await get<Summary>('/budgets/summary?month=2026-07');
    expect(july.uncategorized).toEqual({ count: 1, moneyOut: 45, moneyIn: 0 });
    expect(july.totals.actualExpenses).toBe(45);
    expect((await get<Summary>('/budgets/summary?month=2026-08')).uncategorized).toEqual(ZERO);
  });
});

describe('Reports period', () => {
  const may = '/reports/period?start=2026-05-01&end=2026-05-31';

  it('adds uncategorized money to the KPIs once and returns it per bucket', async () => {
    const d = await get<Period>(may);
    expect(d.uncategorized).toMatchObject({ count: 3, moneyOut: 50, moneyIn: 25 });
    expect(d.uncategorized.buckets.slice(0, 3)).toEqual([
      { count: 1, moneyOut: 40, moneyIn: 0 },
      { count: 1, moneyOut: 0, moneyIn: 25 },
      { count: 1, moneyOut: 10, moneyIn: 0 },
    ]);
    expect(d.kpis).toMatchObject({ income: 1025, expenses: 210, net: 815 });
    // Never a real category row.
    expect(d.categories.every((c) => c.categoryId != null)).toBe(true);
    expect(d.categories.find((c) => c.categoryId === food)?.total).toBe(160);
  });

  it('with an account filter counts only that account', async () => {
    const d = await get<Period>(`${may}&accountIds=${acctB}`);
    expect(d.uncategorized).toMatchObject({ count: 2, moneyOut: 10, moneyIn: 25 });
    expect(d.kpis).toMatchObject({ income: 25, expenses: 70 });
  });

  it('with a category filter leaves uncategorized out, even alongside an account filter', async () => {
    for (const q of [`&categoryIds=${food}`, `&groupNames=Uncat%20Test`, `&categoryIds=${food}&accountIds=${acctB}`]) {
      const d = await get<Period>(`${may}${q}`);
      expect(d.uncategorized).toMatchObject(ZERO);
      expect(d.uncategorized.buckets.every((b) => b.count === 0)).toBe(true);
    }
    expect((await get<Period>(`${may}&categoryIds=${food}`)).kpis).toMatchObject({ income: 0, expenses: 160 });
  });

  it('with a type filter keeps only the matching side', async () => {
    expect((await get<Period>(`${may}&catType=expense`)).uncategorized).toMatchObject({ count: 2, moneyOut: 50, moneyIn: 0 });
    expect((await get<Period>(`${may}&catType=income`)).uncategorized).toMatchObject({ count: 1, moneyOut: 0, moneyIn: 25 });
  });

  it('returns zeros when nothing is uncategorized', async () => {
    const d = await get<Period>('/reports/period?start=2026-08-01&end=2026-08-31');
    expect(d.uncategorized).toMatchObject(ZERO);
    expect(d.uncategorized.buckets.every((b) => b.count === 0 && b.moneyOut === 0 && b.moneyIn === 0)).toBe(true);
  });

  it('buckets by month over a longer range', async () => {
    const d = await get<Period>('/reports/period?start=2026-05-01&end=2026-07-31');
    expect(d.uncategorized.buckets).toEqual([
      { count: 3, moneyOut: 50, moneyIn: 25 },
      { count: 1, moneyOut: 0, moneyIn: 30 },
      { count: 1, moneyOut: 45, moneyIn: 0 },
    ]);
  });
});

describe('one day holding categorized spending and uncategorized money both ways', () => {
  it('keeps money out and money in apart on every endpoint', async () => {
    const sep = { count: 2, moneyOut: 7, moneyIn: 3 };
    const budget = await get<Summary>('/budgets/summary?month=2026-09');
    expect(budget.uncategorized).toEqual(sep);
    expect(budget.totals).toMatchObject({ actualExpenses: 27, actualIncome: 3 });
    const report = await get<Period>('/reports/period?start=2026-09-01&end=2026-09-30');
    expect(report.uncategorized.buckets[1]).toEqual(sep);
    expect(report.kpis).toMatchObject({ income: 3, expenses: 27 });
    const series = await get<Series>('/dashboard/spending-series?month=2026-09');
    expect(series.days.find((x) => x.day === 14)!.cumulative).toBe(27);
    expect(series.uncategorized).toEqual(sep);
  });
});

describe('Dashboard spending series', () => {
  it('adds uncategorized money out to the real daily series, once', async () => {
    const d = await get<Series>('/dashboard/spending-series?month=2026-05');
    const at = (day: number) => d.days.find((x) => x.day === day)!.cumulative;
    expect([at(3), at(4), at(5), at(19), at(20), at(31)]).toEqual([100, 140, 200, 200, 210, 210]);
    expect(d.uncategorized).toEqual({ count: 3, moneyOut: 50, moneyIn: 25 });
  });

  it('leaves money in out of spending, and returns zeros when nothing is uncategorized', async () => {
    const june = await get<Series>('/dashboard/spending-series?month=2026-06');
    expect(june.days[june.days.length - 1].cumulative).toBe(0);
    expect(june.uncategorized).toEqual({ count: 1, moneyOut: 0, moneyIn: 30 });
    expect((await get<Series>('/dashboard/spending-series?month=2026-08')).uncategorized).toEqual(ZERO);
  });
});
