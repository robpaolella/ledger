import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';

// Every test runs on its own in-memory copy of a fresh install (built the way the
// server builds one, in a temporary folder); the v1.0.2 fixture is only read and
// data/ is never opened. SimpleFIN is faked per access URL.
const handle = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../src/db/index.js', async () => {
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/db/schema.js');
  return {
    get sqlite() { return handle.current; },
    get db() { return drizzle(handle.current as Database.Database, { schema }); },
  };
});
const sf = vi.hoisted(() => ({ behaviour: new Map<string, 'ok' | 'auth' | 'rate_limit' | 'leak'>(), calls: [] as string[] }));
vi.mock('../src/services/simplefin.js', () => ({
  claimAccessUrl: vi.fn(),
  fetchAccounts: vi.fn(async (url: string) => {
    sf.calls.push(url);
    const b = sf.behaviour.get(url) ?? 'ok';
    if (b === 'auth') throw new Error('SimpleFIN authentication failed. You may need to reauthenticate.');
    if (b === 'rate_limit') throw new Error('SimpleFIN rate limit exceeded. Try again later (limit: ~24 requests/day).');
    if (b === 'leak') throw new Error(`request to ${url}/accounts failed, reason: ECONNRESET`);
    const accounts = url === CU ? [{
      id: 'sf-cu-checking', name: 'Checking', currency: 'USD', balance: '1000.00', 'available-balance': '1000.00',
      'balance-date': Math.floor(Date.now() / 1000), holdings: [], org: { domain: 'cu.example', name: 'Sample CU', url: '', id: 'cu' },
      transactions: [1, 2].map((n) => ({
        id: `sf-txn-${Date.now()}-${n}`, posted: 0, amount: '-12.50', description: `SAMPLE GROCER ${n}`, payee: 'Sample Grocer',
        memo: '', transacted_at: Math.floor(Date.now() / 1000),
      })),
    }] : [];
    return { errors: [], accounts };
  }),
}));
vi.mock('../src/services/benchmarks.js', () => ({ syncBenchmarkPrices: vi.fn(async () => {}) }));
vi.mock('../src/services/amazonPipeline.js', () => ({ runAmazonPipeline: vi.fn(async () => {}) }));

const SECRET = 'S3CRET-TOKEN-9f1c';
const CU = `https://sample-user:${SECRET}@bridge.example/simplefin`;
const CARD = 'https://card-user:card-pass-0000@bridge.example/simplefin';
const EMPTY = 'https://empty-user:empty-pass-0000@bridge.example/simplefin';
const FIXTURE = path.join(__dirname, 'fixtures', 'v1.0.2', 'ledger.db');
const at = (d: number, h: number, m = 0) => new Date(2026, 2, d, h, m); // local server time
const MIN = 60_000;

let migrated: Buffer;
beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-bank-sync-'));
  process.env.DATABASE_PATH = path.join(dir, 'ledger.db');
  try {
    const real = await vi.importActual<typeof import('../src/db/index.js')>('../src/db/index.js');
    handle.current = real.sqlite;
    const { runMigrations } = await import('../src/db/migrate.js');
    runMigrations(real.sqlite);
    real.sqlite.exec(`
      INSERT INTO users (id, username, password_hash, display_name, role) VALUES (1, 'sample-owner', 'x', 'Owner', 'owner'), (2, 'sample-admin', 'x', 'Admin', 'admin');
      INSERT INTO accounts (id, name, type, classification, owner) VALUES (1, 'Sample Checking', 'checking', 'liquid', 'Owner'), (2, 'Sample Card', 'credit', 'liability', 'Owner');
    `);
    real.sqlite.pragma('journal_mode = DELETE'); // an in-memory copy can't open a WAL image
    migrated = real.sqlite.serialize();
    real.sqlite.close();
  } finally {
    delete process.env.DATABASE_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

let db: Database.Database;
let sched: typeof import('../src/services/scheduler.js');
let daily: typeof import('../src/services/dailySync.js');
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at(10, 6));
  delete process.env.DISABLE_DAILY_SYNC;
  sf.behaviour.clear();
  sf.calls.length = 0;
  db = new Database(migrated);
  db.pragma('foreign_keys = ON');
  handle.current = db;
  db.exec(`
    INSERT INTO simplefin_connections (id, user_id, access_url, label) VALUES
      (1, NULL, '${CU}', 'Sample CU'), (2, NULL, '${CARD}', 'Sample Card'), (3, NULL, '${EMPTY}', 'No accounts yet');
    INSERT INTO simplefin_links (simplefin_connection_id, simplefin_account_id, account_id, simplefin_account_name, auto_import)
      VALUES (1, 'sf-cu-checking', 1, 'Checking', 1), (2, 'sf-card', 2, 'Card', 1);
  `);
  sched = await import('../src/services/scheduler.js');
  daily = await import('../src/services/dailySync.js');
});
afterEach(() => {
  vi.useRealTimers();
});

const conn = (id: number) => {
  const row = db.prepare('SELECT * FROM simplefin_connections WHERE id = ?').get(id) as Parameters<typeof daily.connectionSyncState>[1];
  return daily.connectionSyncState(db, row, sched.getRetrySnapshot());
};
const info = () => daily.dailySyncInfo(db, [1, 2, 3], sched.getRetrySnapshot());
const tickAt = async (d: Date) => { vi.setSystemTime(d); await sched.tick(); };
const iso = (d: Date) => d.toISOString();

describe('migration', () => {
  const COLUMNS = ['sync_status', 'sync_error_kind', 'sync_message', 'sync_attempt_at'];
  const columns = (d: Database.Database) => (d.pragma('table_info(simplefin_connections)') as { name: string }[]).map((c) => c.name);

  it('a fresh install has the sync columns, and the full chain runs again without losing rows', async () => {
    const { runMigrations } = await import('../src/db/migrate.js');
    expect(columns(db)).toEqual(expect.arrayContaining(COLUMNS));
    const before = db.prepare('SELECT * FROM simplefin_connections ORDER BY id').all();
    runMigrations(db);
    runMigrations(db);
    expect(db.prepare('SELECT * FROM simplefin_connections ORDER BY id').all()).toEqual(before);
  });

  it('runs on a copy of the v1.0.2 fixture twice with no data lost', async () => {
    const { migrateDailySync } = await import('../src/db/migrate-daily-sync.js');
    const old = new Database(fs.readFileSync(FIXTURE)); // in-memory copy; the file is never written
    old.exec("INSERT INTO simplefin_connections (user_id, access_url, label) VALUES (NULL, 'https://x', 'Existing')");
    const dump = () => Object.fromEntries((old.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
      .map(({ name }) => [name, old.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get()]));
    const before = dump();
    migrateDailySync(old);
    migrateDailySync(old);
    expect(dump()).toEqual(before);
    expect(columns(old)).toEqual(expect.arrayContaining(COLUMNS));
    expect(old.prepare('SELECT label, sync_status, sync_message FROM simplefin_connections').all())
      .toEqual([{ label: 'Existing', sync_status: null, sync_message: null }]);
  });

  it('is a no-op before the SimpleFIN tables exist', async () => {
    const { migrateDailySync } = await import('../src/db/migrate-daily-sync.js');
    expect(() => migrateDailySync(new Database(':memory:'))).not.toThrow();
  });
});

describe('daily-sync switch', () => {
  it('defaults on, skips while off, and takes effect without a restart', async () => {
    expect(info().enabled).toBe(true);
    daily.setDailySyncEnabled(db, false);
    await tickAt(at(10, 6));
    expect(sf.calls).toHaveLength(0);
    expect(info().nextRun).toBeNull();
    daily.setDailySyncEnabled(db, true); // after today's 05:30: the next tick catches up
    await tickAt(at(10, 6, 1));
    expect(sf.calls).toHaveLength(3);
  });

  it('DISABLE_DAILY_SYNC=1 wins over a saved "on"', async () => {
    daily.setDailySyncEnabled(db, true);
    process.env.DISABLE_DAILY_SYNC = '1';
    await tickAt(at(10, 6));
    expect(sf.calls).toHaveLength(0);
    expect(info()).toMatchObject({ enabled: true, forcedOff: true, nextRun: null });
  });
});

describe('connection state and retries', () => {
  it('records a failure with the real backoff, gives up on the fifth try, and starts afresh the next day', async () => {
    sf.behaviour.set(CARD, 'rate_limit');
    let t = at(10, 6);
    await tickAt(t);
    expect(conn(2)).toMatchObject({
      status: 'failed', kind: 'rate_limit', message: "SimpleFIN's daily request limit was reached.",
      triesToday: 1, gaveUp: false, nextRetryAt: iso(new Date(t.getTime() + 15 * MIN)),
    });
    expect(conn(3).status).toBe('working'); // no linked accounts, still recorded
    expect(info().nextRun).toEqual({ at: iso(new Date(t.getTime() + 15 * MIN)), reason: 'retry' });
    expect(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'sync_failure'").get()).toEqual({ n: 0 });

    for (const [tries, gap] of [[2, 15], [3, 60], [4, 180]] as const) {
      t = new Date(t.getTime() + gap * MIN);
      await tickAt(new Date(t.getTime() - MIN)); // not due yet: nothing fetched
      await tickAt(t);
      const next = [60, 180, 360][tries - 2];
      expect(conn(2)).toMatchObject({ triesToday: tries, gaveUp: false, nextRetryAt: iso(new Date(t.getTime() + next * MIN)) });
    }
    expect((db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'sync_failure'").get() as { n: number }).n).toBeGreaterThan(0);
    expect(sf.calls.filter((u) => u === CARD)).toHaveLength(4);

    await tickAt(new Date(t.getTime() + 360 * MIN));
    expect(conn(2)).toMatchObject({ status: 'failed', triesToday: 5, gaveUp: true, nextRetryAt: iso(at(11, 5, 30)) });
    expect(info().nextRun).toEqual({ at: iso(at(11, 5, 30)), reason: 'gave_up' });

    vi.setSystemTime(at(11, 4)); // a new day: yesterday's flags are not current
    expect(conn(2)).toMatchObject({ status: 'failed', triesToday: 0, gaveUp: false, nextRetryAt: iso(at(11, 5, 30)) });
    expect(info().nextRun).toEqual({ at: iso(at(11, 5, 30)), reason: 'scheduled' });
  });

  it('clears the failure when a fetch succeeds', async () => {
    sf.behaviour.set(CARD, 'rate_limit');
    await tickAt(at(10, 6));
    sf.behaviour.set(CARD, 'ok');
    await tickAt(at(10, 6, 15));
    expect(conn(2)).toMatchObject({ status: 'working', kind: null, message: null, nextRetryAt: null, gaveUp: false, triesToday: 0 });
    expect(info().nextRun).toEqual({ at: iso(at(11, 5, 30)), reason: 'scheduled' });
  });

  it('shows reconnect needed with no retry for an auth failure, beside a different failure', async () => {
    sf.behaviour.set(CU, 'auth');
    sf.behaviour.set(CARD, 'rate_limit');
    await tickAt(at(10, 6));
    expect(conn(1)).toMatchObject({ status: 'reconnect_needed', kind: 'auth', nextRetryAt: null, gaveUp: false });
    expect(conn(2)).toMatchObject({ status: 'failed', kind: 'rate_limit', nextRetryAt: iso(at(10, 6, 15)) });
    await tickAt(at(10, 6, 15)); // the retry skips the auth failure
    expect(sf.calls.filter((u) => u === CU)).toHaveLength(1);
    expect(info().lastRun).toMatchObject({ connections: 3, connectionsWithProblems: 2 });
  });

  it('switching daily sync off clears the retry time but keeps the failure', async () => {
    sf.behaviour.set(CARD, 'rate_limit');
    await tickAt(at(10, 6));
    daily.setDailySyncEnabled(db, false);
    expect(conn(2)).toMatchObject({ status: 'failed', kind: 'rate_limit', nextRetryAt: null });
  });

  it('a manual sync records state too', async () => {
    const { runSyncPipeline } = await import('../src/services/simplefinSync.js');
    sf.behaviour.set(CARD, 'auth');
    await runSyncPipeline({ userId: 1, startDate: '2026-03-01', endDate: '2026-03-10' });
    expect(conn(2)).toMatchObject({ status: 'reconnect_needed', kind: 'auth' });
    expect(conn(1)).toMatchObject({ status: 'working' });
  });
});

describe('last run and next run', () => {
  it('stores time, imports, connections and problems; accumulates same-day retries', async () => {
    vi.setSystemTime(at(10, 5));
    expect(info()).toMatchObject({ runTime: '05:30', lastRun: null, nextRun: { at: iso(at(10, 5, 30)), reason: 'scheduled' } });
    await tickAt(at(10, 5, 29)); // before the target: nothing runs
    expect(sf.calls).toHaveLength(0);

    sf.behaviour.set(CARD, 'rate_limit');
    await tickAt(at(10, 5, 31));
    expect(info().lastRun).toEqual({ at: iso(at(10, 5, 31)), transactionsImported: 2, connections: 3, connectionsWithProblems: 1 });
    sf.behaviour.set(CARD, 'ok');
    await tickAt(at(10, 5, 46));
    expect(info().lastRun).toEqual({ at: iso(at(10, 5, 46)), transactionsImported: 2, connections: 3, connectionsWithProblems: 0 });
  });
});

describe('API', () => {
  async function withServer(fn: (call: (user: string, method: string, url: string, body?: unknown) => Promise<{ status: number; text: string }>) => Promise<void>) {
    const { default: router } = await import('../src/routes/simplefin.js');
    const users: Record<string, { userId: number; role: string }> = {
      owner: { userId: 1, role: 'owner' }, admin: { userId: 2, role: 'admin' },
      manager: { userId: 10, role: 'member' }, syncer: { userId: 11, role: 'member' }, none: { userId: 12, role: 'member' },
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = users[req.header('x-user')!]; next(); });
    app.use('/api/simplefin', router);
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/simplefin`;
    try {
      await fn(async (user, method, url, body) => {
        const res = await fetch(base + url, {
          method, headers: { 'x-user': user, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, text: await res.text() };
      });
    } finally { server.close(); }
  }

  beforeEach(() => {
    db.exec(`
      INSERT INTO users (id, username, password_hash, display_name, role) VALUES
        (10, 'sample-manager', 'x', 'Manager', 'member'), (11, 'sample-syncer', 'x', 'Syncer', 'member'), (12, 'sample-none', 'x', 'None', 'member');
      DELETE FROM user_permissions WHERE user_id IN (10, 11, 12);
      INSERT INTO user_permissions (user_id, permission, granted) VALUES
        (10, 'simplefin.manage', 1), (10, 'import.bank_sync', 0), (11, 'simplefin.manage', 0), (11, 'import.bank_sync', 1),
        (12, 'simplefin.manage', 0), (12, 'import.bank_sync', 0);
    `);
  });

  it('lets Bank sync viewers read and connection managers write', async () => {
    await withServer(async (call) => {
      for (const user of ['owner', 'admin', 'manager', 'syncer']) expect((await call(user, 'GET', '/daily-sync')).status).toBe(200);
      expect((await call('none', 'GET', '/daily-sync')).status).toBe(403);
      for (const user of ['owner', 'admin', 'manager']) expect((await call(user, 'PUT', '/daily-sync', { enabled: true })).status).toBe(200);
      for (const user of ['syncer', 'none']) expect((await call(user, 'PUT', '/daily-sync', { enabled: false })).status).toBe(403);
      expect((await call('owner', 'PUT', '/daily-sync', { enabled: 'no' })).status).toBe(400);
      expect((await call('owner', 'PUT', '/daily-sync', {})).status).toBe(400);
      const off = await call('manager', 'PUT', '/daily-sync', { enabled: false });
      expect(JSON.parse(off.text).data).toMatchObject({ enabled: false, nextRun: null });
      expect(daily.dailySyncOn(db)).toBe(false);
    });
  });

  it('keeps the existing connection fields and removes state with the connection', async () => {
    sf.behaviour.set(CARD, 'rate_limit');
    await tickAt(at(10, 6));
    await withServer(async (call) => {
      const list = JSON.parse((await call('owner', 'GET', '/connections')).text).data;
      expect(list[1]).toMatchObject({ id: 2, label: 'Sample Card', isShared: true, linkedAccountCount: 1, lastSyncedAt: null,
        syncState: { status: 'failed', kind: 'rate_limit', triesToday: 1, nextRetryAt: iso(at(10, 6, 15)) } });
      expect(list[0]).toHaveProperty('lastSyncedAt');
      expect((await call('owner', 'DELETE', '/connections/2')).status).toBe(200);
      expect(JSON.parse((await call('owner', 'GET', '/connections')).text).data.map((c: { id: number }) => c.id)).toEqual([1, 3]);
    });
  });

  it('never stores or returns the access URL, even when the error names it', async () => {
    const logged: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => { logged.push(args.join(' ')); });
    sf.behaviour.set(CU, 'leak');
    await tickAt(at(10, 6));
    await tickAt(at(10, 6, 15)); // second failure raises the notification
    await withServer(async (call) => {
      const responses = await Promise.all([
        call('owner', 'GET', '/connections'), call('owner', 'GET', '/daily-sync'), call('owner', 'GET', '/linked-accounts'),
        call('owner', 'POST', '/sync', { startDate: '2026-03-01', endDate: '2026-03-10' }),
      ]);
      for (const r of responses) { expect(r.status).toBe(200); expect(r.text).not.toContain(SECRET); }
    });
    expect(conn(1)).toMatchObject({ status: 'failed', kind: 'other', message: "SimpleFIN didn't return this connection's data." });
    expect((db.prepare("SELECT body FROM notifications WHERE type = 'sync_failure'").get() as { body: string }).body).not.toContain(SECRET);
    // The only place the secret lives is the connection's own access_url.
    db.exec(`UPDATE simplefin_connections SET access_url = 'redacted'`);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    for (const { name } of tables) expect(JSON.stringify(db.prepare(`SELECT * FROM "${name}"`).all())).not.toContain(SECRET);
    expect(logged.join('\n')).not.toContain(SECRET);
    spy.mockRestore();
  });
});
