import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The routes use the shared db handle, so point it at a scratch file before importing them.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-review-period-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

let sqlite: Database.Database;
let server: Server;
let base = '';
const users: Record<'owner' | 'admin' | 'member', number> = { owner: 0, admin: 0, member: 0 };
let actingAs: keyof typeof users = 'owner';

const DATES = ['2026-04-30', '2026-05-01', '2026-05-15', '2026-05-31', '2026-06-01', '2025-05-10'];

async function dates(query: string): Promise<{ status: number; dates: string[]; total: number }> {
  const res = await fetch(`${base}/reviews?status=open${query}`);
  const body = (await res.json()) as { data?: { transaction: { date: string } }[]; total?: number };
  return { status: res.status, dates: (body.data ?? []).map((r) => r.transaction.date).sort(), total: body.total ?? 0 };
}

beforeAll(async () => {
  ({ sqlite } = await import('../src/db/index.js'));
  (await import('../src/db/migrate.js')).runMigrations(sqlite);

  const user = sqlite.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES (?, 'x', ?, ?)");
  for (const role of ['owner', 'admin', 'member'] as const) users[role] = Number(user.run(role, role, role).lastInsertRowid);
  const acct = Number(sqlite.prepare("INSERT INTO accounts (name, type, classification, owner) VALUES ('Checking', 'checking', 'liquid', 'owner')").run().lastInsertRowid);
  for (const date of DATES) {
    const id = Number(sqlite.prepare("INSERT INTO transactions (account_id, date, description, amount) VALUES (?, ?, 'Test purchase', 10)").run(acct, date).lastInsertRowid);
    sqlite.prepare("INSERT INTO transaction_reviews (transaction_id, status, reason) VALUES (?, 'open', 'auto_uncategorized')").run(id);
  }

  const app = express();
  app.use((req, _res, next) => {
    req.user = { userId: users[actingAs], username: actingAs, displayName: actingAs, role: actingAs };
    next();
  });
  app.use('/reviews', (await import('../src/routes/reviews.js')).default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('GET /reviews from/to', () => {
  for (const role of ['owner', 'admin', 'member'] as const) {
    it(`returns only the items inside the period, ends included (${role})`, async () => {
      actingAs = role;
      const r = await dates('&from=2026-05-01&to=2026-05-31');
      expect(r.status).toBe(200);
      expect(r.dates).toEqual(['2026-05-01', '2026-05-15', '2026-05-31']);
      expect(r.total).toBe(3);
      actingAs = 'owner';
    });
  }

  it('covers a year and a single day', async () => {
    expect((await dates('&from=2026-01-01&to=2026-12-31')).dates).toHaveLength(5);
    expect((await dates('&from=2026-05-15&to=2026-05-15')).dates).toEqual(['2026-05-15']);
  });

  it('returns nothing for an empty period', async () => {
    expect(await dates('&from=2020-01-01&to=2020-01-31')).toEqual({ status: 200, dates: [], total: 0 });
  });

  it('ignores an invalid period without an error', async () => {
    for (const q of [
      '&from=2026-05-01', '&to=2026-05-31', // only one end
      '&from=2026-05-31&to=2026-05-01', // from after to
      '&from=2026-02-30&to=2026-03-01', // not a real date
      '&from=May&to=June', '&from=&to=', '&from=2026-05-01&from=2026-05-02&to=2026-05-31',
    ]) {
      const r = await dates(q);
      expect(r.status, q).toBe(200);
      expect(r.dates, q).toHaveLength(DATES.length);
    }
  });
});
