import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Readers use the shared db handle, so point it at a scratch file before importing them.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-budget-carry-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

let sqlite: Database.Database;
let getStoredPlans: typeof import('../src/services/budgetPlan.js').getStoredPlans;
let checkBudgetExceeded: typeof import('../src/services/budgetAlerts.js').checkBudgetExceeded;
let server: Server;
let base = '';
const cat: Record<'carry' | 'other' | 'floor', number> = { carry: 0, other: 0, floor: 0 };

async function get<T>(url: string): Promise<T> {
  const res = await fetch(base + url);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: T }).data;
}
type Groups<S> = { expenseGroups: { groupName: string; subs: S[] }[] };
type MonthSub = { categoryId: number; manual: number; budgeted: number; overridden: boolean; budgetId: number | null };
type AnnualSub = { categoryId: number; manual: number[]; planned: number[]; overridden: boolean[] };
const testSub = <S extends { categoryId: number }>(d: Groups<S>, id: number) =>
  d.expenseGroups.find((g) => g.groupName === 'Carry Test')!.subs.find((x) => x.categoryId === id)!;

beforeAll(async () => {
  ({ sqlite } = await import('../src/db/index.js'));
  (await import('../src/db/migrate.js')).runMigrations(sqlite);
  ({ getStoredPlans } = await import('../src/services/budgetPlan.js'));
  ({ checkBudgetExceeded } = await import('../src/services/budgetAlerts.js'));
  const app = express();
  app.use('/budgets', (await import('../src/routes/budgets.js')).default);
  app.use('/dashboard', (await import('../src/routes/dashboard.js')).default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const addCat = (sub: string) => Number(sqlite.prepare(
    "INSERT INTO categories (group_name, sub_name, display_name, type) VALUES ('Carry Test', ?, ?, 'expense')",
  ).run(sub, `Carry Test: ${sub}`).lastInsertRowid);
  cat.carry = addCat('Carry');
  cat.other = addCat('Other');
  cat.floor = addCat('Floor');
  const budget = sqlite.prepare('INSERT INTO budgets (category_id, month, amount, override) VALUES (?, ?, ?, ?)');
  budget.run(cat.carry, '2025-11', 300, 1);
  budget.run(cat.carry, '2026-03', 0, 0);
  budget.run(cat.carry, '2026-05', 450, 0);
  budget.run(cat.other, '2025-12', 50, 0);
  budget.run(cat.floor, '2026-01', 40, 1);
  sqlite.prepare(`INSERT INTO recurring_items (type, label, category_id, amount, freq_kind, day, start_date)
    VALUES ('expense', 'Gym', ?, 100, 'monthly', 1, '2025-01-01')`).run(cat.floor);
  sqlite.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES ('alex', 'x', 'Alex', 'owner')").run();
  const account = Number(sqlite.prepare("INSERT INTO accounts (name, type, classification, owner) VALUES ('Checking', 'checking', 'liquid', 'Alex')").run().lastInsertRowid);
  const txn = sqlite.prepare("INSERT INTO transactions (account_id, date, description, category_id, amount) VALUES (?, ?, 'Shop', ?, ?)");
  txn.run(account, '2026-02-10', cat.carry, 350);
  txn.run(account, '2031-01-10', cat.carry, 500);
});

afterAll(() => {
  server?.close();
  vi.useRealTimers();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('getStoredPlans', () => {
  it.each([
    ['2025-10', 'no backward fill before the first row', undefined],
    ['2025-11', "the month's own row wins, with its override", { amount: 300, override: true, own: true }],
    ['2025-12', 'the override does not carry', { amount: 300, override: false, own: false }],
    ['2026-02', 'carries across a year boundary', { amount: 300, override: false, own: false }],
    ['2026-03', 'a saved $0 is a plan', { amount: 0, override: false, own: true }],
    ['2026-04', 'a saved $0 carries as $0', { amount: 0, override: false, own: false }],
    ['2026-05', 'a later row replaces the carried plan', { amount: 450, override: false, own: true }],
    ['2031-01', 'carries with no end date', { amount: 450, override: false, own: false }],
    ['2026-13', 'an invalid month has no plan', undefined],
  ])('%s: %s', (month, _why, want) => {
    const plan = getStoredPlans(sqlite, month).get(cat.carry);
    if (!want) return expect(plan).toBeUndefined();
    expect(plan).toMatchObject({ amount: want.amount, override: want.override });
    expect(plan!.budgetId !== null).toBe(want.own);
  });

  it('filters to the requested categories', () => {
    expect([...getStoredPlans(sqlite, '2026-02', [cat.other]).keys()]).toEqual([cat.other]);
    expect(getStoredPlans(sqlite, '2026-02', []).size).toBe(0);
  });

  it('reads every existing row exactly as stored', () => {
    const rows = sqlite.prepare('SELECT id, category_id, month, amount, override FROM budgets').all() as
      { id: number; category_id: number; month: string; amount: number; override: number }[];
    for (const r of rows) {
      expect(getStoredPlans(sqlite, r.month).get(r.category_id)).toEqual({ amount: r.amount, override: !!r.override, budgetId: r.id });
    }
  });
});

describe('every budget reader agrees on the carried plan', () => {
  it.each([
    ['2026-02', 300, 50], // carried from 2025-11 and 2025-12, no row this month
    ['2031-01', 450, 50], // carried from 2026-05 and 2025-12
  ])('%s', async (month, carry, other) => {
    const before = sqlite.prepare('SELECT * FROM budgets ORDER BY id').all();
    const floorBudgeted = 100; // the floor category's carried 40 is raised to its $100 recurring floor

    const list = await get<{ category_id: number }[]>(`/budgets?month=${month}`);
    expect(list.find((r) => r.category_id === cat.carry)).toMatchObject({ id: null, month, amount: carry });

    const summary = await get<Groups<MonthSub>>(`/budgets/summary?month=${month}`);
    expect(testSub(summary, cat.carry)).toMatchObject({ manual: carry, budgeted: carry, budgetId: null });

    const annual = await get<Groups<AnnualSub>>(`/budgets/annual?year=${month.slice(0, 4)}`);
    expect(testSub(annual, cat.carry).manual[Number(month.slice(5)) - 1]).toBe(carry);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${month}-15T12:00:00`));
    const detail = await get<{ plannedPerMonth: number }>(`/budgets/category-detail?categoryId=${cat.carry}`);
    vi.useRealTimers();
    expect(detail.plannedPerMonth).toBe(carry);

    // Only the test categories have budget rows or floors, so the Dashboard total is theirs.
    const dash = await get<{ totalBudgetedExpenses: number }>(`/dashboard/summary?month=${month}`);
    expect(dash.totalBudgetedExpenses).toBe(carry + other + floorBudgeted);

    const spending = await get<{ groupName: string; totalBudgeted: number }[]>(`/dashboard/spending-by-category?month=${month}`);
    expect(spending.find((g) => g.groupName === 'Carry Test')!.totalBudgeted).toBe(carry + other + floorBudgeted);

    checkBudgetExceeded(sqlite, { month, categoryIds: [cat.carry] });
    const note = sqlite.prepare('SELECT body FROM notifications WHERE dedupe_key = ?').get(`budget_exceeded:${cat.carry}:${month}`) as { body: string };
    expect(note.body).toContain(`by $50.00`); // 350 - 300 and 500 - 450

    expect(sqlite.prepare('SELECT * FROM budgets ORDER BY id').all()).toEqual(before);
  });
});

describe('recurring floors on the carried plan', () => {
  it('applies the override only to its own month, then raises the carried amount to the floor', async () => {
    const pick = async (month: string) => testSub(await get<Groups<MonthSub>>(`/budgets/summary?month=${month}`), cat.floor);
    expect(await pick('2026-01')).toMatchObject({ manual: 40, budgeted: 40, overridden: true });
    expect(await pick('2026-02')).toMatchObject({ manual: 40, budgeted: 100, overridden: false, budgetId: null });

    const sub = testSub(await get<Groups<AnnualSub>>('/budgets/annual?year=2026'), cat.floor);
    expect(sub.planned.slice(0, 3)).toEqual([40, 100, 100]);
    expect(sub.overridden.slice(0, 3)).toEqual([true, false, false]);
  });
});
