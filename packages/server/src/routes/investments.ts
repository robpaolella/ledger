import { Router, Request, Response } from 'express';
import { sqlite } from '../db/index.js';
import { requirePermission } from '../middleware/permissions.js';
import { blendedPct, portfolioReturns, selectedHoldings, symbolPrices } from '../services/investmentReturns.js';

const router = Router();

/**
 * Investments read endpoints:
 *  - /performance: cumulative-% return series — portfolio (today's holdings
 *    priced back through the range, so contributions and withdrawals never
 *    count; services/investmentReturns.ts) vs the core benchmarks (Tiingo
 *    adjusted closes in benchmark_prices).
 *  - /holdings-blended: ONE row per symbol summed across accounts, grouped by
 *    asset class (symbol_meta), with range/today % from benchmark_prices.
 *  - /movers: day-over-day per-symbol change from holdings_history snapshots,
 *    plus the household investment total the Accounts page shows.
 *  - PATCH /symbols/:symbol: set a symbol's asset class.
 */

const BENCHMARKS = [
  { id: 'sp500', name: 'S&P 500', symbol: 'SPY' },
  { id: 'us_stocks', name: 'US Stocks', symbol: 'VTI' },
  { id: 'us_bonds', name: 'US Bonds', symbol: 'BND' },
] as const;

type Range = '1M' | '3M' | '6M' | 'YTD' | '1Y';

function parseRange(raw: unknown): Range {
  const r = String(raw ?? '3M').toUpperCase();
  return (['1M', '3M', '6M', 'YTD', '1Y'].includes(r) ? r : '3M') as Range;
}

function rangeStartDate(range: Range, today: string): string {
  const d = new Date(`${today}T00:00:00`);
  switch (range) {
    case '1M': d.setMonth(d.getMonth() - 1); break;
    case '3M': d.setMonth(d.getMonth() - 3); break;
    case '6M': d.setMonth(d.getMonth() - 6); break;
    case '1Y': d.setFullYear(d.getFullYear() - 1); break;
    case 'YTD': return `${today.slice(0, 4)}-01-01`;
  }
  return d.toISOString().slice(0, 10);
}

function parseAccountIds(raw: unknown): number[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ids = raw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));
  return ids.length > 0 ? ids : null;
}

const pct = (v: number, base: number): number => (base === 0 ? 0 : ((v / base) - 1) * 100);
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Symbol's prices as a sorted [date, adjClose][] within [start, end]. */
function priceSeries(symbol: string, startInclusive: string, end: string): { date: string; close: number }[] {
  return sqlite.prepare(`
    SELECT date, adj_close AS close FROM benchmark_prices
    WHERE symbol = ? AND date >= ? AND date <= ? ORDER BY date
  `).all(symbol, startInclusive, end) as { date: string; close: number }[];
}

// GET /api/investments/performance?range=3M[&accountIds=1,2]
router.get('/performance', (req: Request, res: Response) => {
  try {
    const range = parseRange(req.query.range);
    const accountIds = parseAccountIds(req.query.accountIds);
    const today = new Date().toISOString().slice(0, 10);
    const rangeStart = rangeStartDate(range, today);

    // Axis = SPY trading dates in range (plus one baseline row at-or-before
    // the range start so % starts at 0 on day one).
    const baselineRow = sqlite.prepare(
      "SELECT date FROM benchmark_prices WHERE symbol = 'SPY' AND date <= ? ORDER BY date DESC LIMIT 1",
    ).get(rangeStart) as { date: string } | undefined;
    const axisStart = baselineRow?.date ?? rangeStart;
    const dates = (sqlite.prepare(
      "SELECT DISTINCT date FROM benchmark_prices WHERE symbol = 'SPY' AND date >= ? AND date <= ? ORDER BY date",
    ).all(axisStart, today) as { date: string }[]).map((r) => r.date);

    let backfilling = dates.length === 0 || !baselineRow;

    // Benchmark series along the axis (forward-filled), cumulative % from
    // each symbol's own first in-axis value.
    const benchmarks = BENCHMARKS.map((b) => {
      const rows = priceSeries(b.symbol, axisStart, today);
      if (rows.length < 2) {
        backfilling = true;
        return { id: b.id, name: b.name, symbol: b.symbol, series: [] as number[], rangePct: null, todayPct: null };
      }
      const priceMap = new Map(rows.map((r) => [r.date, r.close]));
      let last: number | null = null;
      const values: (number | null)[] = dates.map((d) => {
        const v = priceMap.get(d);
        if (v != null) last = v;
        return last;
      });
      const base = values.find((v): v is number => v != null) ?? null;
      if (base == null) {
        backfilling = true;
        return { id: b.id, name: b.name, symbol: b.symbol, series: [] as number[], rangePct: null, todayPct: null };
      }
      const series = values.map((v) => round2(pct(v ?? base, base)));
      const lastTwo = rows.slice(-2);
      const todayPct = lastTwo.length === 2 ? round2(pct(lastTwo[1].close, lastTwo[0].close)) : null;
      return { id: b.id, name: b.name, symbol: b.symbol, series, rangePct: series[series.length - 1] ?? null, todayPct };
    });

    // Portfolio: return figures from holding prices (the same calculation as
    // the Holdings Total); current value from the latest balance snapshots.
    const acctFilter = accountIds ? `AND a.id IN (${accountIds.map(() => '?').join(',')})` : '';
    const acctRows = sqlite.prepare(
      `SELECT a.id FROM accounts a WHERE a.classification = 'investment' AND a.is_active = 1 ${acctFilter}`,
    ).all(...(accountIds ?? [])) as { id: number }[];

    let portfolio: {
      series: number[]; rangePct: number | null; todayPct: number | null; currentValue: number;
    } | null = null;

    const returns = acctRows.length > 0 ? portfolioReturns(selectedHoldings(accountIds), rangeStart, dates) : null;
    if (returns) {
      const acctIds = acctRows.map((r) => r.id);
      const current = sqlite.prepare(`
        SELECT COALESCE(SUM((
          SELECT bs.balance FROM balance_snapshots bs
          WHERE bs.account_id = a.id ORDER BY bs.date DESC, bs.id DESC LIMIT 1
        )), 0) AS total
        FROM accounts a WHERE a.id IN (${acctIds.map(() => '?').join(',')})
      `).get(...acctIds) as { total: number };
      portfolio = {
        series: returns.series.map(round2),
        rangePct: returns.rangePct == null ? null : round2(returns.rangePct),
        todayPct: returns.todayPct == null ? null : round2(returns.todayPct),
        currentValue: round2(current.total),
      };
    }

    res.json({ data: { range, dates, portfolio, benchmarks, backfilling } });
  } catch (err) {
    console.error('GET /investments/performance error:', err);
    res.status(500).json({ error: 'Failed to compute performance' });
  }
});

// GET /api/investments/holdings-blended?range=3M[&accountIds=1,2]
router.get('/holdings-blended', (req: Request, res: Response) => {
  try {
    const range = parseRange(req.query.range);
    const accountIds = parseAccountIds(req.query.accountIds);
    const today = new Date().toISOString().slice(0, 10);
    const rangeStart = rangeStartDate(range, today);

    const rows = selectedHoldings(accountIds);

    const totalValue = rows.reduce((s, r) => s + r.value, 0);

    const prices = new Map(rows.map((r) => [r.symbol, symbolPrices(r.symbol, rangeStart)]));
    const holdings = rows.map((r) => {
      const { start: startPrice, latest: latestPrice, prev: prevPrice } = prices.get(r.symbol)!;
      return {
        symbol: r.symbol,
        name: r.name,
        assetClass: r.asset_class ?? 'Uncategorized',
        price: r.shares > 0 ? round2(r.value / r.shares) : null,
        quantity: r.shares,
        value: round2(r.value),
        weightPct: totalValue > 0 ? round2((r.value / totalValue) * 100) : 0,
        rangePct: startPrice != null && latestPrice != null ? round2(pct(latestPrice, startPrice)) : null,
        todayPct: prevPrice != null && latestPrice != null ? round2(pct(latestPrice, prevPrice)) : null,
      };
    }).sort((a, b) => b.value - a.value);

    const groupMap = new Map<string, typeof holdings>();
    for (const h of holdings) {
      const list = groupMap.get(h.assetClass) ?? [];
      list.push(h);
      groupMap.set(h.assetClass, list);
    }
    const groups = [...groupMap.entries()]
      .map(([assetClass, hs]) => {
        const value = hs.reduce((s, h) => s + h.value, 0);
        return {
          assetClass,
          value: round2(value),
          weightPct: totalValue > 0 ? round2((value / totalValue) * 100) : 0,
          holdings: hs,
        };
      })
      .sort((a, b) => b.value - a.value);

    // Total chip = blended return over the range, the same calculation as the
    // Market card's portfolio return.
    const blended = blendedPct(rows.map((r) => ({ value: r.value, from: prices.get(r.symbol)!.start, to: prices.get(r.symbol)!.latest })));
    const totalRangePct = blended == null ? null : round2(blended);

    res.json({
      data: {
        range,
        totalValue: round2(totalValue),
        total: { value: round2(totalValue), rangePct: totalRangePct },
        groups,
      },
    });
  } catch (err) {
    console.error('GET /investments/holdings-blended error:', err);
    res.status(500).json({ error: 'Failed to load holdings' });
  }
});

/** Sum of every active investment account's latest balance — the same figure
 *  as the Accounts Investments group (/networth/summary), so the Dashboard
 *  headline always agrees with it. Null when the household has no such account. */
function householdInvestmentTotal(): number | null {
  const row = sqlite.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM((
      SELECT bs.balance FROM balance_snapshots bs
      WHERE bs.account_id = a.id ORDER BY bs.date DESC, bs.id DESC LIMIT 1
    )), 0) AS total
    FROM accounts a WHERE a.classification = 'investment' AND a.is_active = 1
  `).get() as { n: number; total: number };
  return row.n > 0 ? round2(row.total) : null;
}

// GET /api/investments/movers?limit=4 — day change from holdings_history
router.get('/movers', (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '4'), 10) || 4, 1), 20);
    const investmentTotal = householdInvestmentTotal();

    // PER-LINK snapshot pairs: each link contributes its own two latest dates,
    // so a connection that hasn't synced today still compares its last two
    // snapshots instead of vanishing from the aggregation (a global date pair
    // would misread any partial sync). Every link counts: investments are
    // household-visible, personal connections included.
    const linkPairs = sqlite.prepare(`
      SELECT hh.simplefin_link_id AS link, MAX(hh.date) AS d0,
             (SELECT MAX(h2.date) FROM holdings_history h2
               WHERE h2.simplefin_link_id = hh.simplefin_link_id AND h2.date < MAX(hh.date)) AS d1
      FROM holdings_history hh
      JOIN simplefin_links sl ON hh.simplefin_link_id = sl.id
      GROUP BY hh.simplefin_link_id
    `).all() as { link: number; d0: string; d1: string | null }[];

    const asOf = linkPairs.reduce<string | null>((m, p) => (m == null || p.d0 > m ? p.d0 : m), null);
    if (linkPairs.length === 0 || !linkPairs.some((p) => p.d1 != null)) {
      res.json({ data: { investmentTotal, portfolio: null, movers: [], asOf } });
      return;
    }

    const rowsAt = sqlite.prepare(`
      SELECT UPPER(symbol) AS symbol, SUM(shares) AS shares, SUM(market_value) AS value
      FROM holdings_history WHERE simplefin_link_id = ? AND date = ?
      GROUP BY UPPER(symbol)
    `);
    const agg = (get: (p: { link: number; d0: string; d1: string | null }) => string | null) => {
      const map = new Map<string, { shares: number; value: number }>();
      for (const p of linkPairs) {
        const date = get(p);
        if (!date) continue;
        for (const r of rowsAt.all(p.link, date) as { symbol: string; shares: number; value: number }[]) {
          const cur = map.get(r.symbol) ?? { shares: 0, value: 0 };
          cur.shares += r.shares;
          cur.value += r.value;
          map.set(r.symbol, cur);
        }
      }
      return map;
    };
    const curMap = agg((p) => p.d0);
    const prevMap = agg((p) => p.d1);

    const nameRows = sqlite.prepare(
      'SELECT UPPER(symbol) AS symbol, MAX(description) AS name FROM simplefin_holdings GROUP BY UPPER(symbol)',
    ).all() as { symbol: string; name: string }[];
    const nameMap = new Map(nameRows.map((r) => [r.symbol, r.name]));

    // Portfolio day change on the same PER-SHARE basis as the movers: only
    // symbols held on both days count, valued at current shares — so
    // contributions/new positions never read as market gains.
    let total0 = 0;
    let changeValue = 0;
    let changeBase = 0;
    const movers = [];
    for (const [symbol, r] of curMap) {
      total0 += r.value;
      const prev = prevMap.get(symbol);
      if (!prev || r.shares <= 0 || prev.shares <= 0) continue;
      const p0 = r.value / r.shares;
      const p1 = prev.value / prev.shares;
      if (p1 === 0) continue;
      changeValue += (p0 - p1) * r.shares;
      changeBase += p1 * r.shares;
      movers.push({
        symbol,
        name: nameMap.get(symbol) ?? symbol,
        price: round2(p0),
        // Per-share basis so contributions buying shares don't fake movement.
        dayChangePct: round2(pct(p0, p1)),
        dayChangeValue: round2((p0 - p1) * r.shares),
      });
    }
    movers.sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct));

    res.json({
      data: {
        asOf,
        investmentTotal,
        portfolio: changeBase > 0
          ? {
              value: round2(total0),
              dayChangeValue: round2(changeValue),
              dayChangePct: round2(pct(changeBase + changeValue, changeBase)),
            }
          : null,
        movers: movers.slice(0, limit),
      },
    });
  } catch (err) {
    console.error('GET /investments/movers error:', err);
    res.status(500).json({ error: 'Failed to compute movers' });
  }
});

// PATCH /api/investments/symbols/:symbol — set asset class
router.patch('/symbols/:symbol', requirePermission('accounts.edit'), (req: Request, res: Response) => {
  try {
    const symbol = String(req.params.symbol ?? '').toUpperCase().trim();
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const { assetClass } = req.body as { assetClass?: string | null };
    const clean = assetClass && assetClass.trim() ? assetClass.trim() : null;
    sqlite.prepare(`
      INSERT INTO symbol_meta (symbol, asset_class) VALUES (?, ?)
      ON CONFLICT(symbol) DO UPDATE SET asset_class = excluded.asset_class
    `).run(symbol, clean);
    res.json({ data: { symbol, assetClass: clean } });
  } catch (err) {
    console.error('PATCH /investments/symbols/:symbol error:', err);
    res.status(500).json({ error: 'Failed to update symbol' });
  }
});

export default router;
