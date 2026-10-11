import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Readers use the shared db handle, so point it at a scratch file before importing them.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-net-worth-liabilities-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

let sqlite: Database.Database;
let server: Server;
let base = '';
const card: Record<'owed' | 'zero' | 'credit' | 'history', number> = { owed: 0, zero: 0, credit: 0, history: 0 };
let checking = 0;

async function get<T>(url: string): Promise<T> {
  const res = await fetch(base + url);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: T }).data;
}
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
// Only the checking account and the chosen card count, so each case is isolated.
const onlyCard = (key: keyof typeof card) => {
  sqlite.prepare("UPDATE accounts SET is_active = CASE WHEN id IN (?, ?) THEN 1 ELSE 0 END").run(checking, card[key]);
};

type Summary = { netWorth: number; liabilityTotal: number; accounts: { accountId: number; balance: number }[] };
type Point = { date: string; netWorth: number; liability: number };

beforeAll(async () => {
  ({ sqlite } = await import('../src/db/index.js'));
  (await import('../src/db/migrate.js')).runMigrations(sqlite);
  const app = express();
  app.use('/networth', (await import('../src/routes/networth.js')).default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const addAccount = (name: string, type: string, classification: string) => Number(sqlite.prepare(
    "INSERT INTO accounts (name, type, classification, owner) VALUES (?, ?, ?, 'Alex')",
  ).run(name, type, classification).lastInsertRowid);
  const snap = sqlite.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)');
  checking = addAccount('Checking', 'checking', 'liquid');
  snap.run(checking, daysAgo(30), 1000);
  // Stored sign: owed is negative, a card in credit is positive.
  for (const [key, balance] of [['owed', -300], ['zero', 0], ['credit', 212.4]] as const) {
    card[key] = addAccount(`Card ${key}`, 'credit', 'liability');
    snap.run(card[key], daysAgo(30), balance);
  }
  // A card that moves from owing $500 to $100 in credit.
  card.history = addAccount('Card history', 'credit', 'liability');
  snap.run(card.history, daysAgo(20), -500);
  snap.run(card.history, daysAgo(5), 100);
});

afterAll(() => {
  server?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('net worth with liability balances', () => {
  it.each([
    ['owed', 'money owed lowers net worth', 700, 300],
    ['zero', 'a zero balance contributes nothing', 1000, 0],
    ['credit', 'a credit balance raises net worth', 1212.4, -212.4],
  ] as const)('%s: %s', async (key, _label, netWorth, liabilityTotal) => {
    onlyCard(key);
    const summary = await get<Summary>('/networth/summary');
    expect(summary.netWorth).toBeCloseTo(netWorth, 2);
    expect(summary.liabilityTotal).toBeCloseTo(liabilityTotal, 2);
    expect(Object.is(summary.liabilityTotal, -0)).toBe(false);
    // The account keeps its stored sign; nothing is rewritten.
    expect(summary.accounts.find((a) => a.accountId === card[key])!.balance).toBe(key === 'owed' ? -300 : key === 'zero' ? 0 : 212.4);

    const { points } = await get<{ points: Point[] }>('/networth/history?range=1m');
    const today = points[points.length - 1];
    expect(today.netWorth).toBeCloseTo(netWorth, 2);
    expect(today.liability).toBeCloseTo(liabilityTotal, 2);
  });

  it('history counts each date by the balance stored then: owed, then in credit', async () => {
    onlyCard('history');
    const { points } = await get<{ points: Point[] }>('/networth/history?range=1m');
    const at = (d: string) => points.filter((p) => p.date <= d).pop()!;
    // Before the card's first snapshot it contributes nothing.
    expect(at(daysAgo(25))).toMatchObject({ netWorth: 1000, liability: 0 });
    expect(at(daysAgo(10))).toMatchObject({ netWorth: 500, liability: 500 });
    expect(at(daysAgo(0))).toMatchObject({ netWorth: 1100, liability: -100 });
  });
});
