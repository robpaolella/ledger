import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';

// The Dashboard Investments headline is the household total and equals the Accounts
// Investments group total for every role (Robert, 2026-10-12), whatever personal
// connections the viewer has. Every test runs on an in-memory copy of a fresh install
// (built in a temporary folder); data/ is never opened.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-movers-total-'));
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
});

beforeEach(() => {
  const db = new Database(migrated);
  db.pragma('foreign_keys = ON');
  handle.current = db;
  // Connection 1 is shared, 2 belongs to Jane (admin). The owner and the members have
  // no personal connection. Account 3 has a balance but no linked holdings; account 4
  // is closed; account 5 is checking.
  db.exec(`
    INSERT INTO users (id, username, password_hash, display_name, role) VALUES
      (1, 'sample-owner', 'x', 'John', 'owner'), (2, 'sample-admin', 'x', 'Jane', 'admin'),
      (10, 'sample-member', 'x', 'Sam', 'member');
    INSERT INTO accounts (id, name, type, classification, owner, is_active) VALUES
      (1, 'Joint Brokerage', 'investment', 'investment', 'John', 1),
      (2, 'Jane''s Brokerage', 'investment', 'investment', 'Jane', 1),
      (3, 'Old 401k', 'retirement', 'investment', 'John', 1),
      (4, 'Closed IRA', 'investment', 'investment', 'John', 0),
      (5, 'Checking', 'checking', 'liquid', 'John', 1);
    INSERT INTO balance_snapshots (account_id, date, balance) VALUES
      (1, '2026-10-11', 1900), (1, '2026-10-12', 2000.25),
      (2, '2026-10-12', 2400), (2, '2026-10-12', 2500.5),
      (3, '2026-09-30', 10000.1),
      (4, '2026-10-12', 99999),
      (5, '2026-10-12', 5000);
    INSERT INTO simplefin_connections (id, user_id, access_url, label) VALUES
      (1, NULL, 'https://shared:secret@bridge.example/simplefin', 'Shared CU'),
      (2, 2, 'https://jane:secret@bridge.example/simplefin', 'Jane''s bank');
    INSERT INTO simplefin_links (id, simplefin_connection_id, simplefin_account_id, account_id, simplefin_account_name, auto_import) VALUES
      (1, 1, 'sf-joint', 1, 'Joint', 1), (2, 2, 'sf-jane', 2, 'Jane', 1);
    INSERT INTO simplefin_holdings (simplefin_link_id, symbol, description, shares, cost_basis, market_value, updated_at) VALUES
      (1, 'VTI', 'Total Stock', 10, 1800, 2000, '2026-10-12T00:00:00Z'),
      (2, 'BND', 'Total Bond', 20, 1400, 1500, '2026-10-12T00:00:00Z');
    INSERT INTO holdings_history (simplefin_link_id, symbol, date, shares, cost_basis, market_value) VALUES
      (1, 'VTI', '2026-10-11', 10, 1800, 1980), (1, 'VTI', '2026-10-12', 10, 1800, 2000),
      (2, 'BND', '2026-10-11', 20, 1400, 1520), (2, 'BND', '2026-10-12', 20, 1400, 1500);
  `);
});

const db = () => handle.current as Database.Database;
const users: Record<string, { userId: number; role: string }> = {
  owner: { userId: 1, role: 'owner' }, admin: { userId: 2, role: 'admin' }, member: { userId: 10, role: 'member' },
};
type Movers = { investmentTotal: number | null; portfolio: { value: number } | null; movers: unknown[]; asOf: string | null };

async function get(route: 'investments' | 'networth', user: string, url: string): Promise<{ status: number; text: string }> {
  const { default: router } = route === 'investments'
    ? await import('../src/routes/investments.js')
    : await import('../src/routes/networth.js');
  const app = express();
  app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = users[user]; next(); });
  app.use(`/api/${route}`, router);
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/${route}${url}`);
    return { status: res.status, text: await res.text() };
  } finally { server.close(); }
}

async function movers(user: string): Promise<Movers> {
  const res = await get('investments', user, '/movers');
  expect(res.status).toBe(200);
  return (JSON.parse(res.text) as { data: Movers }).data;
}

describe('Dashboard Investments headline total', () => {
  it('equals the Accounts Investments total for every role, with or without a personal connection', async () => {
    const summary = await get('networth', 'owner', '/summary');
    const accountsTotal = (JSON.parse(summary.text) as { data: { investmentTotal: number } }).data.investmentTotal;
    // Latest balance per active investment account: 2000.25 + 2500.5 + 10000.1.
    expect(accountsTotal).toBeCloseTo(14500.85, 2);

    for (const user of Object.keys(users)) {
      const data = await movers(user);
      expect(data.investmentTotal).toBe(14500.85);
      // Movers and the Today change stay holdings-based.
      expect(data.portfolio?.value).toBe(3500);
      expect(data.movers).toHaveLength(2);
    }
  });

  it('shows the total before any day change exists', async () => {
    db().exec("DELETE FROM holdings_history WHERE date = '2026-10-11'");
    for (const user of Object.keys(users)) {
      const data = await movers(user);
      expect(data).toMatchObject({ investmentTotal: 14500.85, portfolio: null, movers: [], asOf: '2026-10-12' });
    }
  });

  it('shows the total when nothing has synced holdings', async () => {
    db().exec('DELETE FROM holdings_history; DELETE FROM simplefin_holdings');
    const data = await movers('member');
    expect(data).toMatchObject({ investmentTotal: 14500.85, portfolio: null, movers: [], asOf: null });
  });

  it('is null when the household has no active investment account', async () => {
    db().exec("UPDATE accounts SET is_active = 0 WHERE classification = 'investment'");
    expect((await movers('owner')).investmentTotal).toBeNull();
  });

  it('counts an investment account with no balance yet as zero', async () => {
    db().exec('DELETE FROM balance_snapshots WHERE account_id = 3');
    expect((await movers('owner')).investmentTotal).toBe(4500.75);
  });

  it('carries no connection details', async () => {
    for (const user of Object.keys(users)) {
      const res = await get('investments', user, '/movers?limit=20');
      for (const leak of ['secret', 'bridge.example', 'Shared CU', 'Jane\'s bank', 'access', 'connection', 'label']) {
        expect(res.text).not.toContain(leak);
      }
    }
  });
});
