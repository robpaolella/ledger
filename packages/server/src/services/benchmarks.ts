import type Database from 'better-sqlite3';

/**
 * Tiingo end-of-day price sync. Tracks the core benchmarks (S&P 500 / total US
 * stock market / US bonds via ETF proxies) plus every symbol currently held,
 * storing split+dividend-ADJUSTED closes in benchmark_prices. Runs from the
 * daily scheduler; without TIINGO_TOKEN it skips cleanly and the read
 * endpoints degrade to null change fields.
 *
 * Budget: free tier = 1,000 req/day, 500 unique symbols/month. One request
 * per symbol per day (first run backfills ~2 years in the same single call).
 */

export const CORE_BENCHMARKS = ['SPY', 'VTI', 'BND'] as const;

// Real tickers/fund symbols only — skips cash pseudo-symbols and empty strings.
const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

export interface BenchmarkSyncResult {
  skipped?: 'no_token';
  updatedSymbols: string[];
  errors: string[];
}

export function trackedSymbols(sqlite: Database.Database): string[] {
  const held = (sqlite.prepare(
    'SELECT DISTINCT UPPER(symbol) AS s FROM simplefin_holdings',
  ).all() as { s: string }[]).map((r) => r.s);
  const set = new Set<string>(CORE_BENCHMARKS);
  for (const s of held) {
    if (SYMBOL_RE.test(s)) set.add(s);
  }
  return [...set];
}

interface TiingoRow { date: string; adjClose: number }

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let warnedNoToken = false;

export async function syncBenchmarkPrices(
  sqlite: Database.Database,
  fetchImpl: typeof fetch = fetch,
  opts?: { paceMs?: number },
): Promise<BenchmarkSyncResult> {
  // Free tier caps at 50 requests/HOUR (1,000/day). A portfolio can track
  // 60+ symbols, so pace real requests at ~45/hour — the daily job doesn't
  // care that a full pass takes over an hour, and already-current symbols
  // skip without a request (or a sleep).
  const paceMs = opts?.paceMs ?? 80_000;
  const token = process.env.TIINGO_TOKEN;
  if (!token) {
    if (!warnedNoToken) {
      console.warn('[benchmarks] TIINGO_TOKEN not set — skipping benchmark price sync');
      warnedNoToken = true;
    }
    return { skipped: 'no_token', updatedSymbols: [], errors: [] };
  }

  const today = new Date().toISOString().slice(0, 10);
  const symbols = trackedSymbols(sqlite);
  const updatedSymbols: string[] = [];
  const errors: string[] = [];

  const lastDateStmt = sqlite.prepare('SELECT MAX(date) AS d FROM benchmark_prices WHERE symbol = ?');
  const insert = sqlite.prepare(
    'INSERT OR REPLACE INTO benchmark_prices (symbol, date, adj_close) VALUES (?, ?, ?)',
  );

  for (const symbol of symbols) {
    try {
      const last = (lastDateStmt.get(symbol) as { d: string | null }).d;
      let startDate: string;
      if (last) {
        const next = new Date(`${last}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        startDate = next.toISOString().slice(0, 10);
        if (startDate > today) continue; // already current
      } else {
        const back = new Date();
        back.setFullYear(back.getFullYear() - 2); // covers the 1Y range + baseline
        startDate = back.toISOString().slice(0, 10);
      }

      const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol.toLowerCase())}/prices`
        + `?startDate=${startDate}&endDate=${today}&token=${encodeURIComponent(token)}`;
      const res = await fetchImpl(url, { headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) {
        throw new Error(`Tiingo ${res.status} for ${symbol}`);
      }
      const rows = await res.json() as TiingoRow[];
      if (!Array.isArray(rows)) throw new Error(`Tiingo returned non-array for ${symbol}`);

      const write = sqlite.transaction(() => {
        for (const r of rows) {
          const date = String(r.date).slice(0, 10);
          const adj = Number(r.adjClose);
          if (!date || !Number.isFinite(adj)) continue;
          insert.run(symbol, date, adj);
        }
      });
      write();
      if (rows.length > 0) updatedSymbols.push(symbol);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[benchmarks] ${symbol}: ${msg}`);
      errors.push(`${symbol}: ${msg}`);
    }
    // Pace only actual requests (already-current symbols `continue` past this).
    await sleep(paceMs);
  }

  return { updatedSymbols, errors };
}
