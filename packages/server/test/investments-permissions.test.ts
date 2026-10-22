import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';

// Investments are household-visible (Robert, 2026-10-12): every signed-in person sees
// every investment account's holdings, whichever connection (shared or personal) syncs
// it. Connection details stay with their owner. Every test runs on an in-memory copy of
// a fresh install (built in a temporary folder); data/ is never opened.
const handle = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../src/db/index.js', async () => {
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/db/schema.js');
  return {
    get sqlite() { return handle.current; },
    get db() { return drizzle(handle.current as Database.Database, { schema }); },
  };
});
vi.mock('../src/services/simplefin.js', () => ({ claimAccessUrl: vi.fn(), fetchAccounts: vi.fn() }));

let migrated: Buffer;
beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-investments-'));
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
  // Connection 1 is shared, 2 belongs to Jane (admin), 3 to Sam (member).
  db.exec(`
    INSERT INTO users (id, username, password_hash, display_name, role) VALUES
      (1, 'sample-owner', 'x', 'John', 'owner'), (2, 'sample-admin', 'x', 'Jane', 'admin'),
      (10, 'sample-member', 'x', 'Sam', 'member'), (11, 'sample-viewer', 'x', 'Viewer', 'member');
    INSERT INTO accounts (id, name, type, classification, owner, is_active) VALUES
      (1, 'Joint Brokerage', 'investment', 'investment', 'John', 1),
      (2, 'Jane''s Brokerage', 'investment', 'investment', 'Jane', 1),
      (3, 'Sam''s Roth IRA', 'investment', 'investment', 'Sam', 1);
    INSERT INTO simplefin_connections (id, user_id, access_url, label) VALUES
      (1, NULL, 'https://shared:x@bridge.example/simplefin', 'Shared CU'),
      (2, 2, 'https://jane:x@bridge.example/simplefin', 'Jane''s bank'),
      (3, 10, 'https://sam:x@bridge.example/simplefin', 'Sam''s bank');
    INSERT INTO simplefin_links (id, simplefin_connection_id, simplefin_account_id, account_id, simplefin_account_name, auto_import) VALUES
      (1, 1, 'sf-joint', 1, 'Joint', 1), (2, 2, 'sf-jane', 2, 'Jane', 1), (3, 3, 'sf-sam', 3, 'Sam', 1);
    INSERT INTO simplefin_holdings (simplefin_link_id, symbol, description, shares, cost_basis, market_value, updated_at) VALUES
      (1, 'VTI', 'Total Stock', 10, 1800, 2000, '2026-10-12T00:00:00Z'),
      (2, 'VTI', 'Total Stock', 5, 900, 1000, '2026-10-12T00:00:00Z'),
      (2, 'BND', 'Total Bond', 20, 1400, 1500, '2026-10-12T00:00:00Z'),
      (3, 'SPY', 'S&P 500', 2, 900, 1200, '2026-10-12T00:00:00Z');
    INSERT INTO holdings_history (simplefin_link_id, symbol, date, shares, cost_basis, market_value) VALUES
      (1, 'VTI', '2026-10-11', 10, 1800, 1980), (1, 'VTI', '2026-10-12', 10, 1800, 2000),
      (2, 'VTI', '2026-10-11', 5, 900, 990), (2, 'VTI', '2026-10-12', 5, 900, 1000),
      (2, 'BND', '2026-10-11', 20, 1400, 1520), (2, 'BND', '2026-10-12', 20, 1400, 1500),
      (3, 'SPY', '2026-10-11', 2, 900, 1180), (3, 'SPY', '2026-10-12', 2, 900, 1200);
  `);
});

type Body = { data?: unknown; error?: string };
const users: Record<string, { userId: number; role: string }> = {
  owner: { userId: 1, role: 'owner' }, admin: { userId: 2, role: 'admin' },
  member: { userId: 10, role: 'member' }, viewer: { userId: 11, role: 'member' },
};
const VIEWERS = Object.keys(users);

async function get(route: 'investments' | 'simplefin', user: string, url: string): Promise<{ status: number; body: Body }> {
  const { default: router } = route === 'investments'
    ? await import('../src/routes/investments.js')
    : await import('../src/routes/simplefin.js');
  const app = express();
  app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = users[user]; next(); });
  app.use(`/api/${route}`, router);
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/${route}${url}`);
    return { status: res.status, body: await res.json() as Body };
  } finally { server.close(); }
}

/** The same response for every role, returned once. */
async function sameForEveryone(route: 'investments' | 'simplefin', url: string): Promise<unknown> {
  const results = [];
  for (const user of VIEWERS) {
    const res = await get(route, user, url);
    expect(res.status).toBe(200);
    results.push(res.body.data);
  }
  for (const r of results.slice(1)) expect(r).toEqual(results[0]);
  return results[0];
}

type Blended = { totalValue: number; groups: { holdings: { symbol: string; quantity: number; value: number }[] }[] };
const symbols = (d: Blended) => d.groups.flatMap((g) => g.holdings.map((h) => [h.symbol, h.quantity, h.value]))
  .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

describe('investment holdings are household-visible', () => {
  it('holdings-blended counts personal connections for owner, admin and members alike', async () => {
    const all = await sameForEveryone('investments', '/holdings-blended') as Blended;
    expect(all.totalValue).toBe(5700);
    expect(symbols(all)).toEqual([['BND', 20, 1500], ['SPY', 2, 1200], ['VTI', 15, 3000]]);

    // One account on someone else's personal connection: real holdings, not $0.00.
    const jane = await sameForEveryone('investments', '/holdings-blended?accountIds=2') as Blended;
    expect(jane.totalValue).toBe(2500);
    expect(symbols(jane)).toEqual([['BND', 20, 1500], ['VTI', 5, 1000]]);
  });

  it('movers include every connection for every role', async () => {
    const data = await sameForEveryone('investments', '/movers?limit=10') as { movers: { symbol: string }[]; asOf: string };
    expect(data.asOf).toBe('2026-10-12');
    expect(data.movers.map((m) => m.symbol).sort()).toEqual(['BND', 'SPY', 'VTI']);
  });

  it('the Net Worth holdings list shows every account for every role', async () => {
    const data = await sameForEveryone('simplefin', '/holdings') as {
      accountHoldings: { accountId: number; holdings: { symbol: string; marketValue: number }[] }[];
    };
    expect(data.accountHoldings.map((a) => [a.accountId, a.holdings.map((h) => [h.symbol, h.marketValue])])).toEqual([
      [2, [['BND', 1500], ['VTI', 1000]]],
      [1, [['VTI', 2000]]],
      [3, [['SPY', 1200]]],
    ]);
  });
});

describe('connection details stay with their owner', () => {
  const visible = { owner: [1], admin: [1, 2], member: [1, 3], viewer: [1] };

  it('the connection list shows only shared connections and the viewer\'s own', async () => {
    for (const [user, ids] of Object.entries(visible)) {
      const res = await get('simplefin', user, '/connections');
      expect(res.status).toBe(200);
      expect((res.body.data as { id: number }[]).map((c) => c.id).sort()).toEqual(ids);
    }
  });

  it('the linked-accounts list shows only shared connections and the viewer\'s own', async () => {
    for (const [user, ids] of Object.entries(visible)) {
      const res = await get('simplefin', user, '/linked-accounts');
      expect(res.status).toBe(200);
      expect((res.body.data as { connectionId: number }[]).map((c) => c.connectionId).sort()).toEqual(ids);
    }
  });
});
