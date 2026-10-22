import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';
import type { ReportContribution } from '@ledger/shared/src/types.js';

// Account and person filters on contribution figures in GET /api/reports/period
// (#421): a contribution is found under either of its accounts, like a card
// payment. Every test runs on an in-memory copy of a fresh install (built in a
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-contribution-filters-'));
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

async function contributions(query: Record<string, string> = {}): Promise<ReportContribution[]> {
  const { default: reports } = await import('../src/routes/reports.js');
  const app = express();
  app.use('/api/reports', reports);
  const server = app.listen(0);
  try {
    const qs = new URLSearchParams({ start: '2026-01-01', end: '2026-03-31', ...query });
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/reports/period?${qs}`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: { contributions: ReportContribution[] } }).data.contributions;
  } finally { server.close(); }
}
// Totals per tracked category, for the default Jan–Mar range.
const totals = async (query: Record<string, string> = {}) => Object.fromEntries((await contributions(query))
  .map((c) => [c.name, { putIn: c.totalPutIn, takenOut: c.totalTakenOut }]));
const byAccount = (...ids: number[]) => totals({ accountIds: ids.join(',') });
const byPerson = (owner: string) => totals({ owner });

describe('account filter', () => {
  it('finds a contribution under the account it was paid from', async () => {
    txn(JOHN_CHECKING, '2026-01-10', 500, investing);
    expect(await byAccount(JOHN_CHECKING)).toEqual({ Investing: { putIn: 500, takenOut: 0 } });
    expect(await byAccount(JANE_CHECKING)).toEqual({});
  });

  it('finds a linked contribution under its partner account, not the setup\'s other account', async () => {
    link(txn(JOHN_CHECKING, '2026-01-10', 300, investing), txn(BROKERAGE, '2026-01-11', -300, investing), 300);
    expect(await byAccount(BROKERAGE)).toEqual({ Investing: { putIn: 300, takenOut: 0 } });
    expect(await byAccount(ROTH)).toEqual({});
  });

  it('finds a linked withdrawal under the account it came from (the partner is the out leg)', async () => {
    link(txn(BROKERAGE, '2026-02-01', 80, investing), txn(JOHN_CHECKING, '2026-02-02', -80, investing), 80);
    expect(await byAccount(BROKERAGE)).toEqual({ Investing: { putIn: 0, takenOut: 80 } });
    expect(await byAccount(JOHN_CHECKING)).toEqual({ Investing: { putIn: 0, takenOut: 80 } });
  });

  it('finds an unlinked contribution under a single-account setup\'s account', async () => {
    txn(JOHN_CHECKING, '2026-01-15', 200, college);
    txn(JOHN_CHECKING, '2026-03-01', -25, college);
    expect(await byAccount(COLLEGE_529)).toEqual({ College: { putIn: 200, takenOut: 25 } });
  });

  it('finds an unlinked contribution into a several-account setup only under the paying account', async () => {
    txn(JOHN_CHECKING, '2026-01-20', 100, investing);
    expect(await byAccount(BROKERAGE)).toEqual({});
    expect(await byAccount(ROTH)).toEqual({});
    expect(await byAccount(JOHN_CHECKING)).toEqual({ Investing: { putIn: 100, takenOut: 0 } });
  });

  it('gives no destination when the setup also names an account not in Ledger', async () => {
    txn(JANE_CHECKING, '2026-02-10', 60, health);
    expect(await byAccount(HSA)).toEqual({});
    expect(await byAccount(JANE_CHECKING)).toEqual({ Health: { putIn: 60, takenOut: 0 } });
  });

  it('takes no destination from a rejected link', async () => {
    link(txn(JOHN_CHECKING, '2026-02-10', 40, investing), txn(ROTH, '2026-02-10', -40, investing), 40, 'rejected');
    expect(await byAccount(ROTH)).toEqual({});
    expect(await byAccount(JOHN_CHECKING)).toEqual({ Investing: { putIn: 40, takenOut: 0 } });
  });

  it('treats a rejected link as unpaired, so a single-account setup still gives its account', async () => {
    // The partner is a receiving copy for another setup, so it never counts itself.
    link(txn(JOHN_CHECKING, '2026-02-10', 45, college), txn(HSA, '2026-02-10', -45, health), 45, 'rejected');
    expect(await byAccount(HSA)).toEqual({});
    expect(await byAccount(COLLEGE_529)).toEqual({ College: { putIn: 45, takenOut: 0 } });
  });

  it('prefers the linked partner over a single-account setup\'s account', async () => {
    link(txn(JOHN_CHECKING, '2026-02-10', 45, college), txn(HSA, '2026-02-10', -45, health), 45);
    expect(await byAccount(COLLEGE_529)).toEqual({});
    expect(await byAccount(HSA)).toEqual({ College: { putIn: 45, takenOut: 0 } });
  });

  it('counts once when the filter names both sides', async () => {
    link(txn(JOHN_CHECKING, '2026-01-10', 300, investing), txn(BROKERAGE, '2026-01-11', -300, investing), 300);
    txn(JOHN_CHECKING, '2026-01-15', 200, college);
    expect(await byAccount(JOHN_CHECKING, BROKERAGE, COLLEGE_529)).toEqual({
      College: { putIn: 200, takenOut: 0 }, Investing: { putIn: 300, takenOut: 0 },
    });
  });
});

describe('person filter', () => {
  it('finds a contribution for the owner of the paying account', async () => {
    txn(JOHN_CHECKING, '2026-01-10', 500, investing);
    expect(await byPerson('John')).toEqual({ Investing: { putIn: 500, takenOut: 0 } });
    expect(await byPerson('Jane')).toEqual({});
  });

  it('finds a contribution for the owner of the destination, linked or single-account', async () => {
    link(txn(JOHN_CHECKING, '2026-01-10', 300, investing), txn(ROTH, '2026-01-11', -300, investing), 300);
    txn(JOHN_CHECKING, '2026-01-15', 200, college);
    txn(JOHN_CHECKING, '2026-01-20', 100, investing); // unlinked, several accounts: John only
    expect(await byPerson('Jane')).toEqual({
      College: { putIn: 200, takenOut: 0 }, Investing: { putIn: 300, takenOut: 0 },
    });
    expect(await byPerson('John')).toEqual({
      College: { putIn: 200, takenOut: 0 }, Investing: { putIn: 400, takenOut: 0 },
    });
  });

  it('finds a contribution from a jointly owned account for each owner', async () => {
    txn(JOINT, '2026-02-01', 70, investing);
    expect(await byPerson('John')).toEqual({ Investing: { putIn: 70, takenOut: 0 } });
    expect(await byPerson('Jane')).toEqual({ Investing: { putIn: 70, takenOut: 0 } });
  });

  it('narrows by person and account together', async () => {
    link(txn(JOHN_CHECKING, '2026-01-10', 300, investing), txn(ROTH, '2026-01-11', -300, investing), 300);
    txn(JANE_CHECKING, '2026-01-12', 90, investing);
    expect(await totals({ owner: 'Jane', accountIds: String(ROTH) })).toEqual({ Investing: { putIn: 300, takenOut: 0 } });
    expect(await totals({ owner: 'John', accountIds: String(JANE_CHECKING) })).toEqual({});
  });

  it('counts each contribution once in the household view', async () => {
    link(txn(JOHN_CHECKING, '2026-01-10', 300, investing), txn(ROTH, '2026-01-11', -300, investing), 300);
    link(txn(JOINT, '2026-02-01', 70, investing), txn(BROKERAGE, '2026-02-01', -70, investing), 70);
    txn(JANE_CHECKING, '2026-01-15', 200, college);
    txn(JANE_CHECKING, '2026-02-10', 60, health);
    expect(await totals()).toEqual({
      College: { putIn: 200, takenOut: 0 }, Health: { putIn: 60, takenOut: 0 }, Investing: { putIn: 370, takenOut: 0 },
    });
  });
});
