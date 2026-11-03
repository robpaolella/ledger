import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The routes use the shared db handle, so point it at a scratch file before importing them.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-recurring-'));
process.env.DATABASE_PATH = path.join(scratch, 'test.db');

let sqlite: Database.Database;
let server: Server;
let base = '';

type Entry = { id: number; label: string; accountLogoUrl: string | null; accountColor: string | null; accountName: string | null };

async function get<T>(url: string): Promise<T[]> {
  const res = await fetch(`${base}${url}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: T[] | { occurrences: T[] } }).data as T[];
}

beforeAll(async () => {
  ({ sqlite } = await import('../src/db/index.js'));
  (await import('../src/db/migrate.js')).runMigrations(sqlite);

  const inst = Number(sqlite.prepare("INSERT INTO financial_institutions (name, logo_url, color) VALUES ('Sample Bank', '/uploads/institution-1.webp', '#123456')").run().lastInsertRowid);
  const bare = Number(sqlite.prepare("INSERT INTO financial_institutions (name) VALUES ('Plain Credit Union')").run().lastInsertRowid);
  const acct = sqlite.prepare("INSERT INTO accounts (name, type, classification, owner, institution_id, avatar_url) VALUES (?, 'checking', 'liquid', 'owner', ?, ?)");
  const viaInst = Number(acct.run('Via Institution', inst, null).lastInsertRowid);
  const ownImage = Number(acct.run('Own Image', inst, '/uploads/account-9.webp').lastInsertRowid);
  const noLogo = Number(acct.run('No Logo', bare, null).lastInsertRowid);
  const cat = Number(sqlite.prepare("INSERT INTO categories (group_name, sub_name, display_name, type) VALUES ('Recurring Test', 'Bills', 'Recurring Test: Bills', 'expense')").run().lastInsertRowid);

  const item = sqlite.prepare("INSERT INTO recurring_items (type, label, category_id, account_id, amount, freq_kind, day, status, start_date) VALUES ('expense', ?, ?, ?, 10, 'monthly', 15, 'active', '2020-01-01')");
  item.run('Inst logo', cat, viaInst);
  item.run('Own image', cat, ownImage);
  item.run('No logo', cat, noLogo);
  item.run('No account', cat, null);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 1, username: 'owner', displayName: 'owner', role: 'owner' };
    next();
  });
  app.use('/recurring', (await import('../src/routes/recurring.js')).default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

const EXPECTED: Record<string, { accountLogoUrl: string | null; accountColor: string | null }> = {
  'Inst logo': { accountLogoUrl: '/uploads/institution-1.webp', accountColor: '#123456' },
  'Own image': { accountLogoUrl: '/uploads/account-9.webp', accountColor: '#123456' },
  'No logo': { accountLogoUrl: null, accountColor: null },
  'No account': { accountLogoUrl: null, accountColor: null },
};

describe('recurring account logo data', () => {
  it('returns the account logo and institution colour on each item', async () => {
    const items = await get<Entry>('/recurring');
    expect(items).toHaveLength(4);
    for (const it of items) expect(it).toMatchObject(EXPECTED[it.label]);
  });

  it('returns the same fields on each occurrence', async () => {
    const res = await fetch(`${base}/recurring/occurrences?month=2026-05`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { occurrences: Entry[] & { label: string }[] } };
    expect(data.occurrences).toHaveLength(4);
    for (const o of data.occurrences) expect(o).toMatchObject(EXPECTED[o.label]);
  });
});
