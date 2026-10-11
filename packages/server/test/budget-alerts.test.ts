import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-budget-alerts-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

let sqlite: Database.Database;
let mod: typeof import('../src/services/budgetAlerts.js');

beforeAll(async () => {
  ({ sqlite } = await import('../src/db/index.js'));
  (await import('../src/db/migrate.js')).runMigrations(sqlite);
  sqlite.exec(`
    INSERT INTO users (id, username, password_hash, display_name, role) VALUES (1, 'u1', 'x', 'User 1', 'owner');
    INSERT INTO accounts (id, name, type, classification, owner) VALUES (1, 'Sample Checking', 'checking', 'liquid', 'User 1');
  `);
  mod = await import('../src/services/budgetAlerts.js');
});

afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

describe('monthLabel', () => {
  it('spells out the month and year', () => {
    expect(mod.monthLabel('2026-05')).toBe('May 2026');
    expect(mod.monthLabel('2026-12')).toBe('December 2026');
  });
});

describe('over-budget alert wording', () => {
  it('names the month in sentence case', () => {
    const cat = Number(sqlite.prepare(
      "INSERT INTO categories (group_name, sub_name, display_name, type) VALUES ('Food', 'Groceries', 'Food: Groceries', 'expense')",
    ).run().lastInsertRowid);
    sqlite.prepare('INSERT INTO budgets (category_id, month, amount, override) VALUES (?, ?, 100, 0)').run(cat, '2026-05');
    sqlite.prepare("INSERT INTO transactions (account_id, date, description, amount, category_id) VALUES (1, '2026-05-10', 'Sample spend', 125.5, ?)").run(cat);
    mod.checkBudgetExceeded(sqlite, { month: '2026-05' });
    const row = sqlite.prepare('SELECT title, body FROM notifications WHERE user_id = 1').get() as { title: string; body: string };
    expect(row.title).toBe('Over budget: Food: Groceries');
    expect(row.body).toBe("You've exceeded your Food: Groceries budget for May 2026 by $25.50.");
  });
});
