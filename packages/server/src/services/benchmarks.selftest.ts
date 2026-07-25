/**
 * Self-test for the Tiingo benchmark price sync (services/benchmarks.ts) using
 * an injected fetch stub — no network. No test runner in this repo; standalone
 * assertion script over an in-memory SQLite DB. Run with:
 *
 *   npx tsx packages/server/src/services/benchmarks.selftest.ts
 *
 * Exits non-zero when any assertion failed. DATABASE_PATH is pointed at a
 * scratch file BEFORE the dynamic imports so no transitive import can ever
 * open the real database. Runtime note: the sync sleeps 300ms per fetched
 * symbol (Tiingo pacing), so the full run takes a few seconds.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-selftest-benchmarks-'));
process.env.DATABASE_PATH = path.join(scratchDir, 'scratch.db');

const { syncBenchmarkPrices, trackedSymbols } = await import('./benchmarks.js');
const { migrateInvestments } = await import('../db/migrate-investments.js');

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const db = new Database(':memory:');
// Minimal holdings tables (matching migrate-simplefin.ts shapes) — migrate-investments
// seeds holdings_history from simplefin_holdings (whose FK needs simplefin_links;
// better-sqlite3 enforces foreign keys by default) and creates benchmark_prices.
db.exec(`
  CREATE TABLE simplefin_links (id INTEGER PRIMARY KEY AUTOINCREMENT);
  CREATE TABLE simplefin_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    simplefin_link_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    shares REAL NOT NULL DEFAULT 0,
    cost_basis REAL NOT NULL DEFAULT 0,
    market_value REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT ''
  );
`);
db.prepare('INSERT INTO simplefin_links (id) VALUES (1)').run();
migrateInvestments(db);

// Same "today" the module computes (UTC date).
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); };
const today = daysAgo(0);
const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS);

interface StubCall { symbol: string; startDate: string; endDate: string }
type StubReply = { ok: true; rows: { date: string; adjClose: number }[] } | { ok: false; status: number };
const calls: StubCall[] = [];
let responder: (symbol: string) => StubReply = () => { throw new Error('responder not set'); };
const fetchStub: typeof fetch = async (input) => {
  const url = new URL(String(input));
  const symbol = decodeURIComponent(url.pathname.match(/\/tiingo\/daily\/([^/]+)\/prices$/)?.[1] ?? '').toUpperCase();
  calls.push({ symbol, startDate: url.searchParams.get('startDate') ?? '', endDate: url.searchParams.get('endDate') ?? '' });
  const reply = responder(symbol);
  if (!reply.ok) return { ok: false, status: reply.status, json: async () => ({}) } as unknown as Response;
  return { ok: true, status: 200, json: async () => reply.rows } as unknown as Response;
};

const countFor = (symbol: string) =>
  (db.prepare('SELECT COUNT(*) AS c FROM benchmark_prices WHERE symbol = ?').get(symbol) as { c: number }).c;
const closeFor = (symbol: string, date: string) =>
  (db.prepare('SELECT adj_close AS v FROM benchmark_prices WHERE symbol = ? AND date = ?').get(symbol, date) as { v: number } | undefined)?.v;
const sorted = (xs: string[]) => [...xs].sort().join(',');

console.log('without TIINGO_TOKEN → skipped cleanly');
{
  delete process.env.TIINGO_TOKEN;
  const r = await syncBenchmarkPrices(db, fetchStub, { paceMs: 0 });
  check("skipped = 'no_token'", r.skipped === 'no_token', r);
  check('nothing fetched', calls.length === 0, calls);
  check('no symbols updated, no errors', r.updatedSymbols.length === 0 && r.errors.length === 0, r);
}

console.log('trackedSymbols = core ∪ held (uppercased, pseudo-symbols dropped)');
{
  const hold = db.prepare('INSERT INTO simplefin_holdings (simplefin_link_id, symbol, shares, cost_basis, market_value, updated_at) VALUES (1, ?, 1, 1, 1, ?)');
  hold.run('aapl', today);     // lowercase held symbol → AAPL
  hold.run('CUR:USD', today);  // cash pseudo-symbol → excluded
  check('SPY/VTI/BND + AAPL', sorted(trackedSymbols(db)) === 'AAPL,BND,SPY,VTI', trackedSymbols(db));
}

process.env.TIINGO_TOKEN = 'selftest-token';

console.log('first run → backfill startDate ≈ 2 years back, rows inserted');
{
  calls.length = 0;
  responder = () => ({ ok: true, rows: [
    { date: `${daysAgo(3)}T00:00:00.000Z`, adjClose: 100 },
    { date: `${daysAgo(2)}T00:00:00.000Z`, adjClose: 101 },
  ] });
  const r = await syncBenchmarkPrices(db, fetchStub, { paceMs: 0 });
  check('all 4 tracked symbols fetched', calls.length === 4, calls);
  check('startDate ≈ 2 years back', calls.every((c) => { const d = daysBetween(c.startDate, today); return d >= 725 && d <= 735; }), calls);
  check('endDate = today', calls.every((c) => c.endDate === today), calls);
  check('all symbols report updated', sorted(r.updatedSymbols) === 'AAPL,BND,SPY,VTI', r);
  check('no errors', r.errors.length === 0, r.errors);
  check('2 rows landed per symbol', ['SPY', 'VTI', 'BND', 'AAPL'].every((s) => countFor(s) === 2));
}

console.log('second run → incremental from MAX(date)+1 day');
{
  calls.length = 0;
  responder = () => ({ ok: true, rows: [{ date: `${daysAgo(1)}T00:00:00.000Z`, adjClose: 102 }] });
  const r = await syncBenchmarkPrices(db, fetchStub, { paceMs: 0 });
  check('startDate = MAX(date)+1', calls.length === 4 && calls.every((c) => c.startDate === daysAgo(1)), calls);
  check('one new row per symbol', ['SPY', 'VTI', 'BND', 'AAPL'].every((s) => countFor(s) === 3));
  check('no errors', r.errors.length === 0, r.errors);
}

console.log('overlapping re-run → INSERT OR REPLACE (no duplicates)');
{
  calls.length = 0;
  responder = () => ({ ok: true, rows: [{ date: `${daysAgo(1)}T00:00:00.000Z`, adjClose: 999 }] });
  await syncBenchmarkPrices(db, fetchStub, { paceMs: 0 });
  check('startDate = today (MAX is yesterday)', calls.every((c) => c.startDate === today), calls);
  check('row counts unchanged', ['SPY', 'VTI', 'BND', 'AAPL'].every((s) => countFor(s) === 3));
  check('close replaced in place', closeFor('SPY', daysAgo(1)) === 999, closeFor('SPY', daysAgo(1)));
}

console.log('one symbol failing (res.ok false) does not block the others');
{
  calls.length = 0;
  responder = (symbol) => symbol === 'SPY'
    ? { ok: false, status: 500 }
    : { ok: true, rows: [{ date: `${today}T00:00:00.000Z`, adjClose: 104 }] };
  const r = await syncBenchmarkPrices(db, fetchStub, { paceMs: 0 });
  check('SPY failure recorded in errors', r.errors.length === 1 && r.errors[0].startsWith('SPY:') && r.errors[0].includes('500'), r.errors);
  check('other symbols still updated', sorted(r.updatedSymbols) === 'AAPL,BND,VTI', r);
  check('rows landed for the others', ['VTI', 'BND', 'AAPL'].every((s) => countFor(s) === 4));
  check('no row landed for SPY', countFor('SPY') === 3);
}

console.log('already-current symbols are skipped without fetching');
{
  calls.length = 0;
  responder = (symbol) => {
    if (symbol !== 'SPY') throw new Error(`unexpected fetch for ${symbol}`);
    return { ok: true, rows: [{ date: `${today}T00:00:00.000Z`, adjClose: 105 }] };
  };
  const r = await syncBenchmarkPrices(db, fetchStub, { paceMs: 0 });
  check('only SPY (still behind) fetched', calls.length === 1 && calls[0].symbol === 'SPY', calls);
  check('SPY caught up, no errors', countFor('SPY') === 4 && r.errors.length === 0, r);
}

db.close();
fs.rmSync(scratchDir, { recursive: true, force: true });

if (failures > 0) { console.error(`\n${failures} assertion(s) failed.`); process.exit(1); }
console.log('\nAll benchmark-sync self-tests passed.');
