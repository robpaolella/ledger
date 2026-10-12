import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TXN_PAGE, hasMoreTxns, pageQuery, pagingHint, sortQuery } from '../../client/src/lib/reportsPaging';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-reports-paging-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

let server: Server;
let base = '';

// 3 days x 3 transactions; amounts chosen so absolute order differs from signed order.
const ROWS: [string, number][] = [
  ['2026-05-03', 5], ['2026-05-03', -40], ['2026-05-03', 20],
  ['2026-05-02', 7], ['2026-05-02', -9], ['2026-05-02', 1],
  ['2026-05-01', 3], ['2026-05-01', 30], ['2026-05-01', -2],
];

async function load(query: Record<string, string>) {
  const q = new URLSearchParams({ startDate: '2026-05-01', endDate: '2026-05-31', ...query });
  const body = (await (await fetch(`${base}/transactions?${q}`)).json()) as { data: { date: string; amount: number }[]; total: number };
  return { rows: body.data.map((r) => `${r.date}:${r.amount}`), total: body.total };
}

beforeAll(async () => {
  const { sqlite } = await import('../src/db/index.js');
  (await import('../src/db/migrate.js')).runMigrations(sqlite);
  sqlite.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES ('o', 'x', 'o', 'owner')").run();
  const acct = Number(sqlite.prepare("INSERT INTO accounts (name, type, classification, owner) VALUES ('Checking', 'checking', 'liquid', 'owner')").run().lastInsertRowid);
  const ins = sqlite.prepare("INSERT INTO transactions (account_id, date, description, amount) VALUES (?, ?, 'T', ?)");
  for (const [d, a] of ROWS) ins.run(acct, d, a);
  const app = express();
  app.use((req, _res, next) => { req.user = { userId: 1, username: 'o', displayName: 'o', role: 'owner' }; next(); });
  app.use('/transactions', (await import('../src/routes/transactions.js')).default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('Reports paging helpers', () => {
  it('pages 50 at a time from what is loaded', () => {
    expect(pageQuery('date_desc', 0)).toMatchObject({ limit: '50', offset: '0' });
    expect(pageQuery('date_desc', 100)).toMatchObject({ limit: '50', offset: '100' });
    expect(TXN_PAGE).toBe(50);
  });

  it('shows "N of total" only while more remain', () => {
    expect(pagingHint(50, 412)).toBe('50 of 412 transactions');
    expect(pagingHint(1000, 1412)).toBe('1,000 of 1,412 transactions');
    expect(pagingHint(412, 412)).toBeNull();
    expect(pagingHint(0, 0)).toBeNull();
    expect(hasMoreTxns(30, 30)).toBe(false);
    expect(hasMoreTxns(50, 412)).toBe(true);
  });

  it('maps each sort to a server ordering', () => {
    expect(sortQuery('date_asc')).toEqual({ sortBy: 'date', sortOrder: 'asc' });
    expect(sortQuery('amt_desc')).toMatchObject({ sortOrder: 'desc', thenBy: 'absAmount', thenOrder: 'desc' });
    expect(sortQuery('amt_asc')).toMatchObject({ sortOrder: 'desc', thenBy: 'absAmount', thenOrder: 'asc' });
  });
});

describe('GET /transactions as Reports pages it', () => {
  const sorts = ['date_desc', 'date_asc', 'amt_desc', 'amt_asc'] as const;

  for (const sort of sorts) {
    it(`pages of 4 join up to the one-shot order (${sort})`, async () => {
      const q = (offset: number, limit: number) => ({ ...sortQuery(sort), limit: String(limit), offset: String(offset) });
      const whole = await load(q(0, 50));
      expect(whole.total).toBe(9);
      const paged = [...(await load(q(0, 4))).rows, ...(await load(q(4, 4))).rows, ...(await load(q(8, 4))).rows];
      expect(paged).toEqual(whole.rows);
    });
  }

  it('Highest/Lowest keep days newest first and order each day by absolute amount', async () => {
    const hi = (await load({ ...sortQuery('amt_desc'), limit: '50' })).rows;
    expect(hi).toEqual(['2026-05-03:-40', '2026-05-03:20', '2026-05-03:5', '2026-05-02:-9', '2026-05-02:7', '2026-05-02:1', '2026-05-01:30', '2026-05-01:3', '2026-05-01:-2']);
    const lo = (await load({ ...sortQuery('amt_asc'), limit: '50' })).rows;
    expect(lo.slice(0, 3)).toEqual(['2026-05-03:5', '2026-05-03:20', '2026-05-03:-40']);
  });

  it('Oldest lists the earliest day first', async () => {
    const r = (await load({ ...sortQuery('date_asc'), limit: '50' })).rows;
    expect(r[0].startsWith('2026-05-01')).toBe(true);
    expect(r[8].startsWith('2026-05-03')).toBe(true);
  });

  it('reports the full total with a short page and none for an empty range', async () => {
    expect((await load({ limit: '2' })).total).toBe(9);
    expect(await load({ startDate: '2020-01-01', endDate: '2020-01-31' })).toEqual({ rows: [], total: 0 });
  });
});
