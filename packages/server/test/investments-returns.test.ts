import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';

// Investment returns come from holding prices (#379): money moved in or out of an
// account never counts as gain, and the Market card agrees with the Holdings Total.
// Every test runs on an in-memory copy of a fresh install; data/ is never opened.
const handle = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../src/db/index.js', async () => {
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/db/schema.js');
  return {
    get sqlite() { return handle.current; },
    get db() { return drizzle(handle.current as Database.Database, { schema }); },
  };
});

const TODAY = '2026-10-22';

let migrated: Buffer;
beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-investment-returns-'));
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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  db = new Database(migrated);
  db.pragma('foreign_keys = ON');
  handle.current = db;
  // Account 1 is on the shared connection, 2 on Jane's (admin) personal one,
  // 3 on Sam's (member) personal one.
  db.exec(`
    INSERT INTO users (id, username, password_hash, display_name, role) VALUES
      (1, 'sample-owner', 'x', 'John', 'owner'), (2, 'sample-admin', 'x', 'Jane', 'admin'),
      (10, 'sample-member', 'x', 'Sam', 'member');
    INSERT INTO accounts (id, name, type, classification, owner, is_active) VALUES
      (1, 'Joint Brokerage', 'investment', 'investment', 'John', 1),
      (2, 'Jane''s 401(k)', 'investment', 'investment', 'Jane', 1),
      (3, 'Sam''s Roth IRA', 'investment', 'investment', 'Sam', 1);
    INSERT INTO simplefin_connections (id, user_id, access_url, label) VALUES
      (1, NULL, 'https://shared:x@bridge.example/simplefin', 'Shared CU'),
      (2, 2, 'https://jane:x@bridge.example/simplefin', 'Jane''s bank'),
      (3, 10, 'https://sam:x@bridge.example/simplefin', 'Sam''s bank');
    INSERT INTO simplefin_links (id, simplefin_connection_id, simplefin_account_id, account_id, simplefin_account_name, auto_import) VALUES
      (1, 1, 'sf-joint', 1, 'Joint', 1), (2, 2, 'sf-jane', 2, 'Jane', 1), (3, 3, 'sf-sam', 3, 'Sam', 1);
    INSERT INTO simplefin_holdings (simplefin_link_id, symbol, description, shares, cost_basis, market_value, updated_at) VALUES
      (1, 'VTI', 'Total Stock', 10, 1800, 2200, '${TODAY}T00:00:00Z'),
      (2, 'VTI', 'Total Stock', 5, 900, 1100, '${TODAY}T00:00:00Z'),
      (2, 'BND', 'Total Bond', 20, 1400, 1530, '${TODAY}T00:00:00Z'),
      (3, 'SPY', 'S&P 500', 2, 900, 1050, '${TODAY}T00:00:00Z');
  `);
});
afterEach(() => { vi.useRealTimers(); });

/** Every calendar day from 2026-06-01 to today. */
const DAYS = (() => {
  const out: string[] = [];
  for (let d = new Date('2026-06-01T00:00:00Z'); d.toISOString().slice(0, 10) <= TODAY; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
})();

/** Flat at `base` until August, then a straight line to base × (1 + gain) today. */
function setPrices(symbol: string, base: number, gain: number) {
  const ramp = DAYS.filter((d) => d >= '2026-08-01');
  const insert = db.prepare('INSERT INTO benchmark_prices (symbol, date, adj_close) VALUES (?, ?, ?)');
  for (const d of DAYS) {
    const i = ramp.indexOf(d);
    insert.run(symbol, d, i < 0 ? base : base * (1 + gain * ((i + 1) / ramp.length)));
  }
}

function snapshot(accountId: number, date: string, balance: number) {
  db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run(accountId, date, balance);
}

const users: Record<string, { userId: number; role: string }> = {
  owner: { userId: 1, role: 'owner' }, admin: { userId: 2, role: 'admin' }, member: { userId: 10, role: 'member' },
};

async function get<T>(url: string, user = 'owner'): Promise<T> {
  const { default: router } = await import('../src/routes/investments.js');
  const app = express();
  app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = users[user]; next(); });
  app.use('/api/investments', router);
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/investments${url}`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: T }).data;
  } finally { server.close(); }
}

type Perf = {
  dates: string[];
  portfolio: { series: number[]; rangePct: number | null; todayPct: number | null; currentValue: number } | null;
};
type Blended = { total: { rangePct: number | null } };

/** The Market card and the Holdings Total for one selection. */
async function both(query = '') {
  const perf = await get<Perf>(`/performance?range=3M${query}`);
  const holdings = await get<Blended>(`/holdings-blended?range=3M${query}`);
  return { perf, portfolio: perf.portfolio, total: holdings.total.rangePct };
}

/** Holdings Total by hand: back each current value out to its start price. */
const expected = (parts: [value: number, gain: number][]) => {
  const end = parts.reduce((s, [v]) => s + v, 0);
  const start = parts.reduce((s, [v, g]) => s + v / (1 + g), 0);
  return ((end / start) - 1) * 100;
};

function monthlyContributions(accountId: number, from: number, step: number) {
  ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', TODAY].forEach((d, i) => snapshot(accountId, d, from + step * i));
}

describe('investment returns ignore money moved in or out', () => {
  it('steady contributions with flat prices give 0%, and a deposit today is not a gain', async () => {
    for (const s of ['VTI', 'BND', 'SPY']) setPrices(s, 100, 0);
    monthlyContributions(1, 2000, 500);
    snapshot(1, '2026-10-21', 3400); // the day before today's 1,000 deposit
    const { perf, portfolio, total } = await both();
    expect(portfolio).not.toBeNull();
    expect(portfolio!.rangePct).toBe(0);
    expect(portfolio!.todayPct).toBe(0);
    expect(portfolio!.series.every((v) => v === 0)).toBe(true);
    expect(portfolio!.series).toHaveLength(perf.dates.length);
    expect(total).toBe(0);
    // The current value is still the latest balance total.
    expect(portfolio!.currentValue).toBe(4000);
  });

  it('a price gain with no flows matches the Holdings Total', async () => {
    setPrices('VTI', 200, 0.10);
    setPrices('BND', 75, 0.02);
    setPrices('SPY', 500, 0.05);
    const { perf, portfolio, total } = await both();
    const want = expected([[3300, 0.10], [1530, 0.02], [1050, 0.05]]);
    expect(portfolio!.rangePct).toBeCloseTo(want, 2);
    expect(Math.abs(portfolio!.rangePct! - total!)).toBeLessThanOrEqual(0.01);
    // The chart starts at 0% on the first day and ends at the range return.
    expect(portfolio!.series).toHaveLength(perf.dates.length);
    expect(portfolio!.series[0]).toBe(0);
    expect(portfolio!.series[portfolio!.series.length - 1]).toBe(portfolio!.rangePct);
    // Today is the blended last-day price change.
    const day = (g: number, n: number) => (1 + g) / (1 + g * ((n - 1) / n)) - 1;
    const n = DAYS.filter((d) => d >= '2026-08-01').length;
    expect(portfolio!.todayPct).toBeCloseTo(expected([[3300, day(0.10, n)], [1530, day(0.02, n)], [1050, day(0.05, n)]]), 2);
  });

  it('a withdrawal mid-range leaves the return unchanged', async () => {
    setPrices('VTI', 200, 0.10);
    setPrices('BND', 75, 0.02);
    setPrices('SPY', 500, 0.05);
    snapshot(2, '2026-07-01', 5000);
    const before = (await both('&accountIds=2')).portfolio!;
    snapshot(2, '2026-09-15', 2630); // 2,370 taken out
    snapshot(2, TODAY, 2630);
    const after = (await both('&accountIds=2')).portfolio!;
    expect(after.series).toEqual(before.series);
    expect(after.rangePct).toBe(before.rangePct);
    expect(after.todayPct).toBe(before.todayPct);
    expect(after.rangePct).toBeCloseTo(expected([[1100, 0.10], [1530, 0.02]]), 2);
  });

  it('an account opened mid-range counts as if it had been there all along', async () => {
    setPrices('SPY', 500, 0.05);
    // First balance well after the range start, when SPY had already risen most
    // of the way: measured from that day, the return would be about 2%.
    snapshot(3, '2026-09-20', 1030);
    snapshot(3, TODAY, 1050);
    const { perf, portfolio, total } = await both('&accountIds=3');
    expect(portfolio!.rangePct).toBeCloseTo(5, 2);
    expect(portfolio!.rangePct).toBe(total);
    expect(portfolio!.series[0]).toBe(0);
    expect(portfolio!.series).toHaveLength(perf.dates.length);
  });

  it('no price history gives an empty return, like today\'s no-data state', async () => {
    setPrices('SPY', 500, 0.05); // the chart's date axis only; Jane holds VTI and BND
    snapshot(2, '2026-07-01', 2000);
    snapshot(2, TODAY, 2630);
    const { portfolio, total } = await both('&accountIds=2');
    expect(portfolio).toBeNull();
    expect(total).toBeNull();
  });

  it('holdings without price history are left out of the return', async () => {
    setPrices('VTI', 200, 0.10);
    setPrices('SPY', 500, 0.05); // BND has no prices
    const { portfolio, total } = await both('&accountIds=2');
    expect(portfolio!.rangePct).toBeCloseTo(10, 2);
    expect(total).toBe(portfolio!.rangePct);
  });

  it('the chart still runs from 0% to the Market return when the S&P history starts late or lags', async () => {
    // No S&P price at or before the range start, and none for the last two days.
    setPrices('VTI', 200, 0.10);
    setPrices('BND', 75, 0.02);
    // A jump the day after the range start, before the chart's first date.
    db.exec("INSERT OR REPLACE INTO benchmark_prices (symbol, date, adj_close) VALUES ('VTI', '2026-07-23', 220), ('BND', '2026-07-23', 80)");
    const insert = db.prepare('INSERT INTO benchmark_prices (symbol, date, adj_close) VALUES (?, ?, 500)');
    for (const d of DAYS) if (d >= '2026-07-25' && d <= '2026-10-20') insert.run('SPY', d);
    const { perf, portfolio, total } = await both('&accountIds=2');
    expect(perf.dates[0]).toBe('2026-07-25');
    expect(perf.dates[perf.dates.length - 1]).toBe('2026-10-20');
    expect(portfolio!.series[0]).toBe(0);
    expect(portfolio!.series[portfolio!.series.length - 1]).toBe(portfolio!.rangePct);
    expect(portfolio!.rangePct).toBe(total);
    expect(portfolio!.rangePct).toBeCloseTo(expected([[1100, 0.10], [1530, 0.02]]), 2);
  });

  it('Today uses the last two prices even when the earlier one is before the range (YTD on 1 January)', async () => {
    vi.setSystemTime(new Date('2027-01-01T12:00:00Z'));
    db.exec(`
      INSERT INTO benchmark_prices (symbol, date, adj_close) VALUES
        ('VTI', '2026-12-30', 100), ('VTI', '2026-12-31', 110),
        ('SPY', '2026-12-30', 500), ('SPY', '2026-12-31', 500);
    `);
    for (const range of ['YTD', '1M']) {
      const perf = await get<Perf>(`/performance?range=${range}&accountIds=1`);
      expect(perf.portfolio!.todayPct).toBe(10);
      const rows = await get<{ groups: { holdings: { symbol: string; todayPct: number | null }[] }[] }>(
        `/holdings-blended?range=${range}&accountIds=1`);
      expect(rows.groups[0].holdings[0].todayPct).toBe(10);
    }
  });

  it('an account on someone\'s personal connection gives the same figure to owner, admin and member', async () => {
    setPrices('VTI', 200, 0.10);
    setPrices('BND', 75, 0.02);
    setPrices('SPY', 500, 0.05);
    for (const q of ['', '&accountIds=2', '&accountIds=3']) {
      const seen = [];
      for (const user of Object.keys(users)) seen.push(await get<Perf>(`/performance?range=3M${q}`, user));
      expect(seen[0].portfolio).not.toBeNull();
      for (const s of seen.slice(1)) expect(s).toEqual(seen[0]);
    }
  });
});
