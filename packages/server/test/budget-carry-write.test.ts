import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The route uses the shared db handle, so point it at a scratch file before importing it.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-budget-carry-write-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

let sqlite: Database.Database;
let getStoredPlans: typeof import('../src/services/budgetPlan.js').getStoredPlans;
let server: Server;
let base = '';
let catCount = 0;

type Row = { id: number; month: string; amount: number; override: number };
type MonthSub = { categoryId: number; manual: number; budgeted: number; overridden: boolean };

/** A fresh category with the given rows ([month, amount, override?]). */
function newCat(rows: [string, number, number?][] = []): number {
  const id = Number(sqlite.prepare(
    "INSERT INTO categories (group_name, sub_name, display_name, type) VALUES ('Carry Write', ?, ?, 'expense')",
  ).run(`Cat ${++catCount}`, `Carry Write: Cat ${catCount}`).lastInsertRowid);
  for (const [month, amount, override] of rows) {
    sqlite.prepare('INSERT INTO budgets (category_id, month, amount, override) VALUES (?, ?, ?, ?)').run(id, month, amount, override ?? 0);
  }
  return id;
}
const rowsOf = (categoryId: number) =>
  sqlite.prepare('SELECT id, month, amount, override FROM budgets WHERE category_id = ? ORDER BY month').all(categoryId) as Row[];
const planAt = (categoryId: number, month: string) => getStoredPlans(sqlite, month, [categoryId]).get(categoryId)?.amount;

async function save(body: Record<string, unknown>): Promise<number> {
  const res = await fetch(`${base}/budgets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.status;
}
async function summarySub(categoryId: number, month: string): Promise<MonthSub> {
  const res = await fetch(`${base}/budgets/summary?month=${month}`);
  const { data } = (await res.json()) as { data: { expenseGroups: { groupName: string; subs: MonthSub[] }[] } };
  return data.expenseGroups.find((g) => g.groupName === 'Carry Write')!.subs.find((s) => s.categoryId === categoryId)!;
}

beforeAll(async () => {
  ({ sqlite } = await import('../src/db/index.js'));
  (await import('../src/db/migrate.js')).runMigrations(sqlite);
  ({ getStoredPlans } = await import('../src/services/budgetPlan.js'));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId: 1, username: 'alex', displayName: 'Alex', role: 'owner' }; next(); });
  app.use('/budgets', (await import('../src/routes/budgets.js')).default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('"This month only" (scope month)', () => {
  it('changes only the edited month and saves the next month at its pre-edit amount', async () => {
    const id = newCat([['2026-03', 300]]);
    expect(await save({ categoryId: id, month: '2026-05', amount: 500, scope: 'month' })).toBe(201);
    expect(rowsOf(id).map((r) => [r.month, r.amount, r.override])).toEqual([
      ['2026-03', 300, 0], ['2026-05', 500, 0], ['2026-06', 300, 0],
    ]);
    expect([planAt(id, '2026-04'), planAt(id, '2026-05'), planAt(id, '2026-06'), planAt(id, '2031-01')]).toEqual([300, 500, 300, 300]);
  });

  it('is the default when scope is absent, and copies a pre-edit amount from the month\'s own row', async () => {
    const id = newCat([['2026-05', 300]]);
    expect(await save({ categoryId: id, month: '2026-05', amount: 450 })).toBe(200);
    expect(rowsOf(id).map((r) => [r.month, r.amount])).toEqual([['2026-05', 450], ['2026-06', 300]]);
  });

  it('leaves an existing next-month row alone', async () => {
    const id = newCat([['2026-03', 300], ['2026-06', 200, 1]]);
    const before = rowsOf(id).find((r) => r.month === '2026-06');
    await save({ categoryId: id, month: '2026-05', amount: 500, scope: 'month' });
    expect(rowsOf(id).find((r) => r.month === '2026-06')).toEqual(before);
    expect(rowsOf(id)).toHaveLength(3);
  });

  it('copies nothing when there was no earlier plan', async () => {
    const id = newCat();
    await save({ categoryId: id, month: '2026-05', amount: 500, scope: 'month' });
    expect(rowsOf(id).map((r) => r.month)).toEqual(['2026-05']);
    expect(planAt(id, '2026-04')).toBeUndefined();
  });

  it('rolls December into January of the next year', async () => {
    const id = newCat([['2026-06', 300]]);
    await save({ categoryId: id, month: '2026-12', amount: 500, scope: 'month' });
    expect(rowsOf(id).map((r) => [r.month, r.amount])).toEqual([['2026-06', 300], ['2026-12', 500], ['2027-01', 300]]);
  });

  it('never carries the override flag into the copy', async () => {
    const id = newCat([['2026-05', 40, 1]]);
    await save({ categoryId: id, month: '2026-05', amount: 30, override: 1 });
    expect(rowsOf(id).map((r) => [r.month, r.amount, r.override])).toEqual([['2026-05', 30, 1], ['2026-06', 40, 0]]);
  });
});

describe('"This month and after" (scope forward)', () => {
  it('updates existing later rows in place and clears their override, leaving past months alone', async () => {
    const id = newCat([['2026-03', 300], ['2026-06', 200, 1], ['2026-09', 250]]);
    const before = rowsOf(id);
    expect(await save({ categoryId: id, month: '2026-05', amount: 500, scope: 'forward' })).toBe(201);
    const after = rowsOf(id);
    expect(after.filter((r) => r.month !== '2026-05')).toEqual([
      before[0],
      { ...before[1], amount: 500, override: 0 },
      { ...before[2], amount: 500, override: 0 },
    ]);
    expect(after).toHaveLength(4);
    expect([planAt(id, '2026-04'), planAt(id, '2026-07'), planAt(id, '2030-01')]).toEqual([300, 500, 500]);
  });

  it('with $0 makes later months read $0', async () => {
    const id = newCat([['2026-03', 300], ['2026-08', 200]]);
    await save({ categoryId: id, month: '2026-05', amount: 0, scope: 'forward' });
    expect([planAt(id, '2026-04'), planAt(id, '2026-06'), planAt(id, '2026-08'), planAt(id, '2027-03')]).toEqual([300, 0, 0, 0]);
    expect((await summarySub(id, '2027-03')).budgeted).toBe(0);
  });
});

describe('rejected and failed saves write nothing', () => {
  it.each([
    ['an override with scope forward', { amount: 30, override: 1, scope: 'forward' }],
    ['an unknown scope', { amount: 500, scope: 'year' }],
    ['a null scope', { amount: 500, scope: null }],
  ])('%s is a 400', async (_why, body) => {
    const id = newCat([['2026-03', 300]]);
    const before = rowsOf(id);
    expect(await save({ categoryId: id, month: '2026-05', ...body })).toBe(400);
    expect(rowsOf(id)).toEqual(before);
  });

  it.each([
    ['month', 'INSERT', "NEW.month = '2026-06'"],
    ['forward', 'UPDATE', "NEW.month = '2026-09'"],
  ])('scope %s rolls back when a later write fails', async (scope, op, when) => {
    const id = newCat([['2026-05', 300], ['2026-09', 250]]);
    const before = rowsOf(id);
    sqlite.exec(`CREATE TRIGGER fail_save BEFORE ${op} ON budgets WHEN NEW.category_id = ${id} AND ${when}
      BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    try {
      expect(await save({ categoryId: id, month: '2026-05', amount: 500, scope })).toBe(500);
    } finally {
      sqlite.exec('DROP TRIGGER fail_save');
    }
    expect(rowsOf(id)).toEqual(before);
  });
});

describe('carry-forward around the write', () => {
  it('a deleted month reads the latest earlier plan, not $0', async () => {
    const id = newCat([['2026-03', 300], ['2026-05', 500]]);
    const may = rowsOf(id).find((r) => r.month === '2026-05')!;
    expect((await fetch(`${base}/budgets/${may.id}`, { method: 'DELETE' })).status).toBe(200);
    expect(planAt(id, '2026-05')).toBe(300);
    expect(await summarySub(id, '2026-05')).toMatchObject({ manual: 300, budgeted: 300 });
  });

  it('the recurring floor and an override never carry into the next month', async () => {
    const id = newCat();
    sqlite.prepare(`INSERT INTO recurring_items (type, label, category_id, amount, freq_kind, day, start_date)
      VALUES ('expense', 'Gym', ?, 100, 'monthly', 1, '2025-01-01')`).run(id);
    await save({ categoryId: id, month: '2026-05', amount: 40, override: 1 });
    expect(await summarySub(id, '2026-05')).toMatchObject({ manual: 40, budgeted: 40, overridden: true });
    expect(await summarySub(id, '2026-06')).toMatchObject({ manual: 40, budgeted: 100, overridden: false });

    // A month-only edit after it copies the stored 40, not the floor, and without the override.
    await save({ categoryId: id, month: '2026-06', amount: 150 });
    expect(rowsOf(id).map((r) => [r.month, r.amount, r.override])).toEqual([['2026-05', 40, 1], ['2026-06', 150, 0], ['2026-07', 40, 0]]);
    expect(await summarySub(id, '2026-07')).toMatchObject({ manual: 40, budgeted: 100, overridden: false });
  });
});
