import { Router, Request, Response } from 'express';
import { sqlite } from '../db/index.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

/**
 * Investments read endpoints:
 *  - /performance: cumulative-% return series — portfolio (from investment-
 *    account balance_snapshots, contributions caveat accepted) vs the core
 *    benchmarks (Tiingo adjusted closes in benchmark_prices).
 *  - /holdings-blended: ONE row per symbol summed across accounts, grouped by
 *    asset class (symbol_meta), with range/today % from benchmark_prices.
 *  - /movers: day-over-day per-symbol change from holdings_history snapshots.
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

/** Latest price at-or-before a date (baseline lookups). */
function priceAt(symbol: string, date: string): number | null {
  const row = sqlite.prepare(
    'SELECT adj_close AS close FROM benchmark_prices WHERE symbol = ? AND date <= ? ORDER BY date DESC LIMIT 1',
  ).get(symbol, date) as { close: number } | undefined;
  return row?.close ?? null;
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

    // Portfolio series from investment-account balance snapshots, forward-
    // filled per account along the axis.
    const acctFilter = accountIds ? `AND a.id IN (${accountIds.map(() => '?').join(',')})` : '';
    const acctRows = sqlite.prepare(
      `SELECT a.id FROM accounts a WHERE a.classification = 'investment' AND a.is_active = 1 ${acctFilter}`,
    ).all(...(accountIds ?? [])) as { id: number }[];

    let portfolio: {
      series: number[]; rangePct: number | null; todayPct: number | null; currentValue: number;
    } | null = null;

    if (acctRows.length > 0) {
      const acctIds = acctRows.map((r) => r.id);
      const snaps = sqlite.prepare(`
        SELECT account_id, date, balance FROM balance_snapshots
        WHERE account_id IN (${acctIds.map(() => '?').join(',')})
        ORDER BY date, id
      `).all(...acctIds) as { account_id: number; date: string; balance: number }[];

      // Portfolio-only axis fallback while benchmarks backfill.
      const axis = dates.length > 0
        ? dates
        : [...new Set(snaps.filter((s) => s.date >= axisStart && s.date <= today).map((s) => s.date))].sort();

      if (axis.length >= 2 && snaps.length > 0) {
        const perAcct = new Map<number, { date: string; balance: number }[]>();
        for (const s of snaps) {
          const list = perAcct.get(s.account_id) ?? [];
          list.push({ date: s.date, balance: s.balance });
          perAcct.set(s.account_id, list);
        }
        const cursors = new Map<number, number>();
        const values: number[] = axis.map((d) => {
          let total = 0;
          for (const [acct, list] of perAcct) {
            let i = cursors.get(acct) ?? 0;
            while (i < list.length && list[i].date <= d) i++;
            cursors.set(acct, i);
            if (i > 0) total += list[i - 1].balance;
          }
          return total;
        });
        const firstIdx = values.findIndex((v) => v !== 0);
        if (firstIdx >= 0 && values.length - firstIdx >= 2) {
          const trimmed = values.slice(firstIdx);
          const base = trimmed[0];
          const series = trimmed.map((v) => round2(pct(v, base)));
          // Pad the leading zero region so the series aligns with `dates`.
          const padded = [...Array(firstIdx).fill(0) as number[], ...series];
          const lastV = trimmed[trimmed.length - 1];
          const prevV = trimmed[trimmed.length - 2];
          portfolio = {
            series: dates.length > 0 ? padded : series,
            rangePct: series[series.length - 1] ?? null,
            todayPct: prevV !== 0 ? round2(pct(lastV, prevV)) : null,
            currentValue: round2(lastV),
          };
        }
      }
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
    const userId = req.user!.userId;
    const today = new Date().toISOString().slice(0, 10);
    const rangeStart = rangeStartDate(range, today);

    const acctFilter = accountIds ? `AND sl.account_id IN (${accountIds.map(() => '?').join(',')})` : '';
    const rows = sqlite.prepare(`
      SELECT UPPER(h.symbol) AS symbol,
             MAX(h.description) AS name,
             SUM(h.shares) AS shares,
             SUM(h.market_value) AS value,
             MAX(sm.asset_class) AS asset_class
      FROM simplefin_holdings h
      JOIN simplefin_links sl ON h.simplefin_link_id = sl.id
      JOIN simplefin_connections sc ON sl.simplefin_connection_id = sc.id
      LEFT JOIN symbol_meta sm ON sm.symbol = UPPER(h.symbol)
      WHERE (sc.user_id IS NULL OR sc.user_id = ?) ${acctFilter}
      GROUP BY UPPER(h.symbol)
    `).all(userId, ...(accountIds ?? [])) as {
      symbol: string; name: string; shares: number; value: number; asset_class: string | null;
    }[];

    const totalValue = rows.reduce((s, r) => s + r.value, 0);

    const holdings = rows.map((r) => {
      const startPrice = priceAt(r.symbol, rangeStart);
      const latest = sqlite.prepare(
        'SELECT adj_close AS close FROM benchmark_prices WHERE symbol = ? ORDER BY date DESC LIMIT 2',
      ).all(r.symbol) as { close: number }[];
      const latestPrice = latest[0]?.close ?? null;
      const prevPrice = latest[1]?.close ?? null;
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

    // Total chip = true blended return over the range: back out each symbol's
    // implied start value from its end value + return, then compare aggregates.
    // (End-value weighting would overstate — winners weigh more after growing.)
    const weighted = holdings.filter((h) => h.rangePct != null && h.rangePct > -100);
    const endValue = weighted.reduce((s, h) => s + h.value, 0);
    const startValue = weighted.reduce((s, h) => s + h.value / (1 + h.rangePct! / 100), 0);
    const totalRangePct = startValue > 0 ? round2(((endValue / startValue) - 1) * 100) : null;

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

// GET /api/investments/movers?limit=4 — day change from holdings_history
router.get('/movers', (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '4'), 10) || 4, 1), 20);
    const userId = req.user!.userId;

    // PER-LINK snapshot pairs: each link contributes its own two latest dates,
    // so a connection that hasn't synced today still compares its last two
    // snapshots instead of vanishing from the aggregation (a global date pair
    // would misread any partial sync).
    const linkPairs = sqlite.prepare(`
      SELECT hh.simplefin_link_id AS link, MAX(hh.date) AS d0,
             (SELECT MAX(h2.date) FROM holdings_history h2
               WHERE h2.simplefin_link_id = hh.simplefin_link_id AND h2.date < MAX(hh.date)) AS d1
      FROM holdings_history hh
      JOIN simplefin_links sl ON hh.simplefin_link_id = sl.id
      JOIN simplefin_connections sc ON sl.simplefin_connection_id = sc.id
      WHERE sc.user_id IS NULL OR sc.user_id = ?
      GROUP BY hh.simplefin_link_id
    `).all(userId) as { link: number; d0: string; d1: string | null }[];

    const asOf = linkPairs.reduce<string | null>((m, p) => (m == null || p.d0 > m ? p.d0 : m), null);
    if (linkPairs.length === 0 || !linkPairs.some((p) => p.d1 != null)) {
      res.json({ data: { portfolio: null, movers: [], asOf } });
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
