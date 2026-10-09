import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';

// Optional extras facts: the benchmark switch and last update, Amazon's last
// match, and the admin-only reads. Every test runs on its own in-memory copy of a
// fresh install; data/ is never opened. Tiingo and the Amazon stages are faked,
// so nothing touches the network, a real token or an Amazon account.
const handle = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../src/db/index.js', async () => {
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/db/schema.js');
  return {
    get sqlite() { return handle.current; },
    get db() { return drizzle(handle.current as Database.Database, { schema }); },
  };
});
const amazon = vi.hoisted(() => ({ matched: 0, failMatch: false }));
vi.mock('../src/services/amazonIngest.js', () => ({
  amazonDir: () => path.join(os.tmpdir(), 'ledger-extras-test-no-amazon'),
  ingestAmazonFiles: () => ({ files: 0, orders: 0, charges: 0 }),
}));
vi.mock('../src/services/amazonMatch.js', () => ({
  matchAmazonCharges: () => {
    if (amazon.failMatch) throw new Error('sample match failure');
    return { matched: amazon.matched, ambiguous: 0, flagged: 0 };
  },
}));
vi.mock('../src/services/amazonNotes.js', () => ({ writeAmazonItemNotes: () => ({ written: 0, skipped: 0 }) }));
vi.mock('../src/services/amazonEnrich.js', () => ({ enrichMatchedTransactions: async () => ({ enriched: 0, split: 0, skipped: 0 }) }));

const FAKE_TOKEN = 'FAKE-TIINGO-TOKEN-7d3e';

let migrated: Buffer;
beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-extras-'));
  process.env.DATABASE_PATH = path.join(dir, 'ledger.db');
  try {
    const real = await vi.importActual<typeof import('../src/db/index.js')>('../src/db/index.js');
    handle.current = real.sqlite;
    const { runMigrations } = await import('../src/db/migrate.js');
    runMigrations(real.sqlite);
    real.sqlite.exec(`
      INSERT INTO users (id, username, password_hash, display_name, role) VALUES
        (1, 'sample-owner', 'x', 'Owner', 'owner'), (2, 'sample-admin', 'x', 'Admin', 'admin'), (3, 'sample-member', 'x', 'Member', 'member');
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
beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  delete process.env.TIINGO_TOKEN;
  amazon.matched = 0;
  amazon.failMatch = false;
  db = new Database(migrated);
  handle.current = db;
});
afterEach(() => {
  delete process.env.TIINGO_TOKEN;
  vi.restoreAllMocks();
});

const config = (key: string) => (db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;
const setConfig = (key: string, value: string) =>
  db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);

function fakeTiingo(fail: string[] = []) {
  return vi.fn(async (url: string | URL | Request) => {
    const symbol = String(url).match(/daily\/([^/]+)\/prices/)![1].toUpperCase();
    if (fail.includes(symbol)) return new Response('nope', { status: 500 });
    return new Response(JSON.stringify([{ date: '2026-10-08T00:00:00.000Z', adjClose: 100 }]), { status: 200 });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('benchmark price sync', () => {
  it('when switched off, makes no request, returns skipped disabled and records nothing', async () => {
    const { syncBenchmarkPrices } = await import('../src/services/benchmarks.js');
    process.env.TIINGO_TOKEN = FAKE_TOKEN;
    setConfig('benchmarks.enabled', '0');
    const fetchImpl = fakeTiingo();
    const r = await syncBenchmarkPrices(db, fetchImpl, { paceMs: 0 });
    expect(r).toEqual({ skipped: 'disabled', updatedSymbols: [], errors: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(config('benchmarks.last_updated_at')).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM benchmark_prices').get()).toEqual({ n: 0 });
  });

  it('with nothing stored it runs, and a clean run records the update time', async () => {
    const { syncBenchmarkPrices } = await import('../src/services/benchmarks.js');
    process.env.TIINGO_TOKEN = FAKE_TOKEN;
    const fetchImpl = fakeTiingo();
    const r = await syncBenchmarkPrices(db, fetchImpl, { paceMs: 0 });
    expect(r.skipped).toBeUndefined();
    expect(r.errors).toEqual([]);
    expect(fetchImpl).toHaveBeenCalled();
    expect(Date.parse(config('benchmarks.last_updated_at')!)).not.toBeNaN();
  });

  it('records the time when every symbol was already current', async () => {
    const { syncBenchmarkPrices } = await import('../src/services/benchmarks.js');
    process.env.TIINGO_TOKEN = FAKE_TOKEN;
    const today = new Date().toISOString().slice(0, 10);
    for (const s of ['SPY', 'VTI', 'BND']) db.prepare('INSERT INTO benchmark_prices (symbol, date, adj_close) VALUES (?, ?, 1)').run(s, today);
    const fetchImpl = fakeTiingo();
    await syncBenchmarkPrices(db, fetchImpl, { paceMs: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(config('benchmarks.last_updated_at')).not.toBeNull();
  });

  it('leaves the stored time alone after an error, or with no token whatever the switch says', async () => {
    const { syncBenchmarkPrices } = await import('../src/services/benchmarks.js');
    setConfig('benchmarks.last_updated_at', '2026-01-01T00:00:00.000Z');
    process.env.TIINGO_TOKEN = FAKE_TOKEN;
    const r = await syncBenchmarkPrices(db, fakeTiingo(['VTI']), { paceMs: 0 });
    expect(r.errors).toHaveLength(1);
    expect(config('benchmarks.last_updated_at')).toBe('2026-01-01T00:00:00.000Z');

    delete process.env.TIINGO_TOKEN;
    for (const enabled of ['1', '0']) {
      setConfig('benchmarks.enabled', enabled);
      const fetchImpl = fakeTiingo();
      expect((await syncBenchmarkPrices(db, fetchImpl, { paceMs: 0 })).skipped).toBe('no_token');
      expect(fetchImpl).not.toHaveBeenCalled();
    }
    expect(config('benchmarks.last_updated_at')).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('Amazon last match', () => {
  it('records the time and count when an enabled run finishes with new matches', async () => {
    const { runAmazonPipeline } = await import('../src/services/amazonPipeline.js');
    setConfig('amazon.enabled', '1');
    amazon.matched = 3;
    await runAmazonPipeline(db);
    expect(config('amazon.last_match_count')).toBe('3');
    expect(config('amazon.last_match_at')).toBe(config('amazon.last_ingest_at'));
  });

  it('leaves last match alone on a run with zero new matches, a failed run, and a disabled run', async () => {
    const { runAmazonPipeline } = await import('../src/services/amazonPipeline.js');
    setConfig('amazon.last_match_at', '2026-01-01T00:00:00.000Z');
    setConfig('amazon.last_match_count', '2');
    setConfig('amazon.last_ingest_at', '2026-01-01T00:00:00.000Z');

    setConfig('amazon.enabled', '1');
    amazon.matched = 0;
    await runAmazonPipeline(db);
    expect(config('amazon.last_ingest_at')).not.toBe('2026-01-01T00:00:00.000Z'); // it did run
    expect(config('amazon.last_match_at')).toBe('2026-01-01T00:00:00.000Z');
    expect(config('amazon.last_match_count')).toBe('2');

    amazon.matched = 4;
    amazon.failMatch = true;
    await runAmazonPipeline(db);
    expect(config('amazon.last_match_count')).toBe('2');

    setConfig('amazon.enabled', '0');
    setConfig('amazon.last_ingest_at', '2026-01-01T00:00:00.000Z');
    amazon.failMatch = false;
    expect(await runAmazonPipeline(db)).toEqual({ enabled: false });
    expect(config('amazon.last_ingest_at')).toBe('2026-01-01T00:00:00.000Z');
    expect(config('amazon.last_match_at')).toBe('2026-01-01T00:00:00.000Z');
    expect(config('amazon.last_match_count')).toBe('2');
  });
});

describe('Amazon failure alerts', () => {
  it('link to the Optional extras panel', async () => {
    const { notifyAmazonFailure } = await import('../src/services/notifications.js');
    notifyAmazonFailure(db, 'auth', 'Sample session expired');
    const rows = db.prepare("SELECT user_id, action_target FROM notifications WHERE type = 'amazon_failure' ORDER BY user_id").all();
    expect(rows).toEqual([{ user_id: 1, action_target: '/settings?panel=extras' }, { user_id: 2, action_target: '/settings?panel=extras' }]);
  });
});

describe('API', () => {
  type Call = (user: string, method: string, url: string, body?: unknown) => Promise<{ status: number; text: string }>;
  async function withServer(fn: (call: Call) => Promise<void>) {
    const { default: amazonRouter } = await import('../src/routes/amazon.js');
    const { default: benchmarkRouter } = await import('../src/routes/benchmarks.js');
    const users: Record<string, { userId: number; role: string }> = {
      owner: { userId: 1, role: 'owner' }, admin: { userId: 2, role: 'admin' }, member: { userId: 3, role: 'member' },
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = users[req.header('x-user')!]; next(); });
    app.use('/api/amazon', amazonRouter);
    app.use('/api/benchmarks', benchmarkRouter);
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    try {
      await fn(async (user, method, url, body) => {
        const res = await fetch(base + url, {
          method, headers: { 'x-user': user, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, text: await res.text() };
      });
    } finally { server.close(); }
  }

  it('Amazon status returns last match, null until recorded', async () => {
    await withServer(async (call) => {
      expect(JSON.parse((await call('admin', 'GET', '/amazon/status')).text).data).toMatchObject({ lastMatchAt: null, lastMatchCount: null });
      setConfig('amazon.last_match_at', '2026-10-08T06:00:00.000Z');
      setConfig('amazon.last_match_count', '5');
      const res = await call('owner', 'GET', '/amazon/status');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.text).data).toMatchObject({ lastMatchAt: '2026-10-08T06:00:00.000Z', lastMatchCount: 5, enabled: false, lastIngestAt: null });
    });
  });

  it('benchmark status and switch, never returning the token', async () => {
    await withServer(async (call) => {
      expect(JSON.parse((await call('admin', 'GET', '/benchmarks/status')).text).data)
        .toEqual({ configured: false, enabled: true, lastUpdatedAt: null });

      process.env.TIINGO_TOKEN = FAKE_TOKEN;
      setConfig('benchmarks.last_updated_at', '2026-10-08T06:00:00.000Z');
      const off = await call('owner', 'PUT', '/benchmarks/config', { enabled: false });
      expect(off.status).toBe(200);
      expect(JSON.parse(off.text).data).toEqual({ enabled: false });
      expect(config('benchmarks.enabled')).toBe('0');
      const status = await call('owner', 'GET', '/benchmarks/status');
      expect(JSON.parse(status.text).data).toEqual({ configured: true, enabled: false, lastUpdatedAt: '2026-10-08T06:00:00.000Z' });
      expect(status.text).not.toContain(FAKE_TOKEN);
      expect(off.text).not.toContain(FAKE_TOKEN);

      expect(JSON.parse((await call('admin', 'PUT', '/benchmarks/config', { enabled: true })).text).data).toEqual({ enabled: true });
      expect(config('benchmarks.enabled')).toBe('1');
      for (const body of [{ enabled: 'no' }, { enabled: 1 }, {}]) {
        expect((await call('owner', 'PUT', '/benchmarks/config', body)).status).toBe(400);
      }
      expect(config('benchmarks.enabled')).toBe('1');
    });
  });

  it('a member, or anyone signed out, is refused all three', async () => {
    await withServer(async (call) => {
      for (const user of ['member', 'nobody']) {
        const expected = user === 'member' ? 403 : 401;
        expect((await call(user, 'GET', '/amazon/status')).status).toBe(expected);
        expect((await call(user, 'GET', '/benchmarks/status')).status).toBe(expected);
        expect((await call(user, 'PUT', '/benchmarks/config', { enabled: false })).status).toBe(expected);
      }
      expect(config('benchmarks.enabled')).toBeNull();
    });
  });
});
