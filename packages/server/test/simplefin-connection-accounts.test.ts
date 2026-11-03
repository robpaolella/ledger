import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';

// Listing a connection's accounts also removes its links to inactive Ledger accounts,
// so the route is a POST. Every test runs on an in-memory copy of a fresh install
// (built in a temporary folder); data/ is never opened. SimpleFIN is faked.
const handle = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../src/db/index.js', async () => {
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/db/schema.js');
  return {
    get sqlite() { return handle.current; },
    get db() { return drizzle(handle.current as Database.Database, { schema }); },
  };
});
const sf = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('../src/services/simplefin.js', () => ({
  claimAccessUrl: vi.fn(),
  fetchAccounts: vi.fn(async (url: string) => {
    sf.calls.push(url);
    return {
      errors: [],
      accounts: [{
        id: 'sf-checking', name: 'Checking', currency: 'USD', balance: '1000.00', 'available-balance': '1000.00',
        'balance-date': 0, holdings: [], transactions: [], org: { domain: 'cu.example', name: 'Sample CU', url: '', id: 'cu' },
      }],
    };
  }),
}));

const SHARED = 'https://shared-user:shared-pass-0000@bridge.example/simplefin';
const PRIVATE = 'https://private-user:private-pass-0000@bridge.example/simplefin';

let migrated: Buffer;
beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-sf-accounts-'));
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

let db: Database.Database;
beforeEach(() => {
  sf.calls.length = 0;
  db = new Database(migrated);
  db.pragma('foreign_keys = ON');
  handle.current = db;
  db.exec(`
    INSERT INTO users (id, username, password_hash, display_name, role) VALUES
      (1, 'sample-owner', 'x', 'Owner', 'owner'), (2, 'sample-admin', 'x', 'Admin', 'admin'),
      (10, 'sample-member', 'x', 'Member', 'member'), (11, 'sample-other', 'x', 'Other', 'member');
    INSERT INTO user_permissions (user_id, permission, granted) VALUES
      (10, 'simplefin.manage', 0), (10, 'import.bank_sync', 0), (11, 'simplefin.manage', 0), (11, 'import.bank_sync', 0);
    INSERT INTO accounts (id, name, type, classification, owner, is_active) VALUES
      (1, 'Sample Checking', 'checking', 'liquid', 'Owner', 1), (2, 'Closed Brokerage', 'investment', 'investment', 'Owner', 0),
      (3, 'Other Checking', 'checking', 'liquid', 'Other', 1), (4, 'Other Closed', 'savings', 'liquid', 'Other', 0);
    INSERT INTO simplefin_connections (id, user_id, access_url, label) VALUES
      (1, NULL, '${SHARED}', 'Shared CU'), (2, 11, '${PRIVATE}', 'Other''s CU');
    INSERT INTO simplefin_links (id, simplefin_connection_id, simplefin_account_id, account_id, simplefin_account_name, auto_import) VALUES
      (1, 1, 'sf-checking', 1, 'Checking', 1), (2, 1, 'sf-brokerage', 2, 'Brokerage', 1),
      (3, 2, 'sf-other-checking', 3, 'Checking', 1), (4, 2, 'sf-old', 4, 'Old savings', 1);
    INSERT INTO simplefin_holdings (simplefin_link_id, symbol, description, shares, cost_basis, market_value, updated_at)
      VALUES (2, 'SMPL', 'Sample Fund', 1, 100, 110, '2026-01-01T00:00:00Z');
  `);
});

type Body = { data?: unknown; error?: string };
async function withServer(fn: (call: (user: string, method: string, url: string) => Promise<{ status: number; body: Body }>) => Promise<void>) {
  const { default: router } = await import('../src/routes/simplefin.js');
  const users: Record<string, { userId: number; role: string }> = {
    owner: { userId: 1, role: 'owner' }, admin: { userId: 2, role: 'admin' },
    member: { userId: 10, role: 'member' }, other: { userId: 11, role: 'member' },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = users[req.header('x-user')!]; next(); });
  app.use('/api/simplefin', router);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/simplefin`;
  try {
    await fn(async (user, method, url) => {
      const res = await fetch(base + url, { method, headers: { 'x-user': user, 'content-type': 'application/json' } });
      const text = await res.text();
      let body = text as unknown as Body;
      try { body = JSON.parse(text); } catch { /* not JSON (e.g. Express 404 page) */ }
      return { status: res.status, body };
    });
  } finally { server.close(); }
}

const linkIds = () => (db.prepare('SELECT id FROM simplefin_links ORDER BY id').all() as { id: number }[]).map((r) => r.id);
const holdingCount = () => (db.prepare('SELECT COUNT(*) AS n FROM simplefin_holdings').get() as { n: number }).n;

describe('POST /simplefin/connections/:id/accounts', () => {
  it('lists the accounts and removes links (with holdings) to inactive accounts', async () => {
    await withServer(async (call) => {
      const res = await call('owner', 'POST', '/connections/1/accounts');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{
        simplefinAccountId: 'sf-checking', name: 'Checking', balance: 1000, currency: 'USD', org: 'Sample CU',
        link: { id: 1, accountId: 1, lastSyncedAt: null, autoImport: 1 },
      }]);
      expect(sf.calls).toEqual([SHARED]);
    });
    expect(linkIds()).toEqual([1, 3, 4]); // only connection 1's orphan went
    expect(holdingCount()).toBe(0);
  });

  it('no longer answers GET, and GET removes nothing', async () => {
    await withServer(async (call) => {
      expect((await call('owner', 'GET', '/connections/1/accounts')).status).toBe(404);
    });
    expect(linkIds()).toEqual([1, 2, 3, 4]);
    expect(sf.calls).toEqual([]);
  });

  it('lets any signed-in user use a shared connection, including a member without SimpleFIN permissions', async () => {
    await withServer(async (call) => {
      for (const user of ['admin', 'member']) expect((await call(user, 'POST', '/connections/1/accounts')).status).toBe(200);
    });
    expect(linkIds()).toEqual([1, 3, 4]);
  });

  it("refuses someone else's personal connection, even for the owner and admin, and touches nothing", async () => {
    await withServer(async (call) => {
      for (const user of ['owner', 'admin', 'member']) {
        const res = await call(user, 'POST', '/connections/2/accounts');
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Not authorized to access this connection' });
      }
    });
    expect(linkIds()).toEqual([1, 2, 3, 4]);
    expect(sf.calls).toEqual([]);
  });

  it("lets a member use their own personal connection, cleaning only that connection's orphans", async () => {
    await withServer(async (call) => {
      expect((await call('other', 'POST', '/connections/2/accounts')).status).toBe(200);
    });
    expect(linkIds()).toEqual([1, 2, 3]);
    expect(holdingCount()).toBe(1);
  });

  it('answers 404 for a missing connection', async () => {
    await withServer(async (call) => {
      expect((await call('owner', 'POST', '/connections/99/accounts')).status).toBe(404);
    });
  });
});
