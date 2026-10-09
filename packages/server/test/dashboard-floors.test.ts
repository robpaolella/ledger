import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Readers use the shared db handle, so point it at a scratch file before importing them.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-dashboard-floors-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

let sqlite: Database.Database;
let server: Server;
let base = '';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(base + url);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: T }).data;
}
type BudgetSummary = {
  expenseGroups: { groupName: string; subs: { budgeted: number }[] }[];
  totals: { budgetedExpenses: number };
};
const groupBudgeted = (s: BudgetSummary, name: string) =>
  s.expenseGroups.find((g) => g.groupName === name)!.subs.reduce((t, x) => t + x.budgeted, 0);

// Rent: floor 100, stored 40 and overridden in 2026-01, carried (not overridden) after.
// Gym: floor 30 and no plan row. Food: plain plan 200, no floor. Pay: income plan 5000.
beforeAll(async () => {
  ({ sqlite } = await import('../src/db/index.js'));
  (await import('../src/db/migrate.js')).runMigrations(sqlite);
  const app = express();
  app.use('/budgets', (await import('../src/routes/budgets.js')).default);
  app.use('/dashboard', (await import('../src/routes/dashboard.js')).default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const addCat = (group: string, sub: string, type: string) => Number(sqlite.prepare(
    'INSERT INTO categories (group_name, sub_name, display_name, type) VALUES (?, ?, ?, ?)',
  ).run(group, sub, `${group}: ${sub}`, type).lastInsertRowid);
  const rent = addCat('Floor Home', 'Rent', 'expense');
  const gym = addCat('Floor Home', 'Gym', 'expense');
  const food = addCat('Floor Food', 'Groceries', 'expense');
  const pay = addCat('Floor Income', 'Pay', 'income');
  const budget = sqlite.prepare('INSERT INTO budgets (category_id, month, amount, override) VALUES (?, ?, ?, ?)');
  budget.run(rent, '2026-01', 40, 1);
  budget.run(food, '2026-01', 200, 0);
  budget.run(pay, '2026-01', 5000, 0);
  const recurring = sqlite.prepare(`INSERT INTO recurring_items (type, label, category_id, amount, freq_kind, day, start_date)
    VALUES ('expense', ?, ?, ?, 'monthly', 1, '2025-01-01')`);
  recurring.run('Rent', rent, 100);
  recurring.run('Gym', gym, 30);
  sqlite.prepare("INSERT INTO accounts (name, type, classification, owner) VALUES ('Checking', 'checking', 'liquid', 'Alex')").run();
  const txn = sqlite.prepare("INSERT INTO transactions (account_id, date, description, category_id, amount) VALUES (1, ?, 'Spend', ?, 10)");
  for (const month of ['2026-01', '2026-02']) for (const c of [rent, gym, food]) txn.run(`${month}-05`, c);
});

afterAll(() => {
  server?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

type ByGroup = { groupName: string; totalBudgeted: number }[];
const dashboardGroup = (rows: ByGroup, name: string) => rows.find((r) => r.groupName === name)!.totalBudgeted;

describe('Dashboard budget figures match Budget', () => {
  it('uses the stored sub-floor amount in the overridden month, with the floor-only gym', async () => {
    const budget = await get<BudgetSummary>('/budgets/summary?month=2026-01');
    const groups = await get<ByGroup>('/dashboard/spending-by-category?month=2026-01');
    expect(groupBudgeted(budget, 'Floor Home')).toBe(40 + 30);
    expect(dashboardGroup(groups, 'Floor Home')).toBe(70);
    expect(dashboardGroup(groups, 'Floor Food')).toBe(200);
  });

  it('raises the carried amount to the floor in the month after the override', async () => {
    const budget = await get<BudgetSummary>('/budgets/summary?month=2026-02');
    const groups = await get<ByGroup>('/dashboard/spending-by-category?month=2026-02');
    expect(groupBudgeted(budget, 'Floor Home')).toBe(100 + 30);
    expect(dashboardGroup(groups, 'Floor Home')).toBe(130);
  });

  it.each(['2025-12', '2026-01', '2026-02'])('totalBudgetedExpenses equals Budget totals for %s', async (month) => {
    const budget = await get<BudgetSummary>(`/budgets/summary?month=${month}`);
    const summary = await get<{ totalBudgetedExpenses: number }>(`/dashboard/summary?month=${month}`);
    expect(summary.totalBudgetedExpenses).toBe(budget.totals.budgetedExpenses);
  });

  it('leaves income plans out of totalBudgetedExpenses', async () => {
    const summary = await get<{ totalBudgetedExpenses: number }>('/dashboard/summary?month=2026-01');
    expect(summary.totalBudgetedExpenses).toBe(40 + 30 + 200);
    const before = await get<{ totalBudgetedExpenses: number }>('/dashboard/summary?month=2025-12');
    expect(before.totalBudgetedExpenses).toBe(100 + 30); // floors alone, no plan rows yet
  });
});
