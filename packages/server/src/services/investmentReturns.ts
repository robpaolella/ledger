import { sqlite } from '../db/index.js';

/**
 * Portfolio returns from holding prices (#379): today's holdings, valued at
 * their current market value, priced back through the range with the stored
 * daily prices (benchmark_prices). Money moved in or out of an account never
 * counts as gain or loss. Cash and holdings with no price history are left
 * out; a holding sold during the range is not counted.
 */

export interface SelectedHolding {
  symbol: string; name: string; shares: number; value: number; asset_class: string | null;
}

/** One row per symbol, summed across the selected accounts (all when null).
 *  Investments are household-visible: every person sees every account's
 *  holdings, whichever connection (shared or personal) syncs it. */
export function selectedHoldings(accountIds: number[] | null): SelectedHolding[] {
  const acctFilter = accountIds ? `WHERE sl.account_id IN (${accountIds.map(() => '?').join(',')})` : '';
  return sqlite.prepare(`
    SELECT UPPER(h.symbol) AS symbol,
           MAX(h.description) AS name,
           SUM(h.shares) AS shares,
           SUM(h.market_value) AS value,
           MAX(sm.asset_class) AS asset_class
    FROM simplefin_holdings h
    JOIN simplefin_links sl ON h.simplefin_link_id = sl.id
    LEFT JOIN symbol_meta sm ON sm.symbol = UPPER(h.symbol)
    ${acctFilter}
    GROUP BY UPPER(h.symbol)
  `).all(...(accountIds ?? [])) as SelectedHolding[];
}

export interface SymbolPrices {
  /** Latest price at or before the range start. */
  start: number | null;
  latest: number | null;
  /** The price before `latest`, for the Today figure. */
  prev: number | null;
  /** Prices from the start price's date onward, oldest first. */
  history: { date: string; close: number }[];
}

export function symbolPrices(symbol: string, rangeStart: string): SymbolPrices {
  const startRow = sqlite.prepare(
    'SELECT date, adj_close AS close FROM benchmark_prices WHERE symbol = ? AND date <= ? ORDER BY date DESC LIMIT 1',
  ).get(symbol, rangeStart) as { date: string; close: number } | undefined;
  const history = sqlite.prepare(
    'SELECT date, adj_close AS close FROM benchmark_prices WHERE symbol = ? AND date >= ? ORDER BY date',
  ).all(symbol, startRow?.date ?? rangeStart) as { date: string; close: number }[];
  return {
    start: startRow?.close ?? null,
    latest: history[history.length - 1]?.close ?? null,
    prev: history[history.length - 2]?.close ?? null,
    history,
  };
}

/** Blended % change from each holding's `from` price to its `to` price,
 *  weighted by what the holding is worth now: compare the summed current value
 *  with the summed value backed out to the `from` prices. (Weighting by current
 *  value alone would overstate: winners weigh more after growing.) Holdings
 *  without both prices are left out; null when none remain. */
export function blendedPct(items: { value: number; from: number | null; to: number | null }[]): number | null {
  let end = 0;
  let start = 0;
  for (const { value, from, to } of items) {
    if (from == null || to == null || from <= 0 || to <= 0) continue;
    end += value;
    start += value * (from / to);
  }
  return start > 0 ? ((end / start) - 1) * 100 : null;
}

export interface PortfolioReturns {
  /** Cumulative % per axis date, 0 on the first; empty when there is no axis. */
  series: number[];
  rangePct: number | null;
  todayPct: number | null;
}

/** The portfolio's range return, Today figure and series along `axis` (sorted
 *  dates; the first is at or before `rangeStart`, so the series starts at 0).
 *  Null when no holding has the prices for either figure. */
export function portfolioReturns(
  holdings: { symbol: string; value: number }[], rangeStart: string, axis: string[],
): PortfolioReturns | null {
  const priced = holdings.map((h) => ({ value: h.value, ...symbolPrices(h.symbol, rangeStart) }));
  const rangePct = blendedPct(priced.map((h) => ({ value: h.value, from: h.start, to: h.latest })));
  const todayPct = blendedPct(priced.map((h) => ({ value: h.value, from: h.prev, to: h.latest })));
  if (rangePct == null && todayPct == null) return null;

  // Each holding's value on day d is its current value scaled by price(d) /
  // latest price, so the last point equals rangePct. Days before the range
  // start use the start price.
  // history[0] is the start price, so a forward-filled cursor always has one.
  const inRange = priced.filter((h) => h.start != null && h.latest != null && h.start > 0 && h.latest > 0);
  const cursors = inRange.map(() => 0);
  let series: number[] = [];
  if (rangePct != null && axis.length > 0) {
    const values = axis.map((d) => {
      const on = d < rangeStart ? rangeStart : d;
      return inRange.reduce((sum, h, i) => {
        while (cursors[i] + 1 < h.history.length && h.history[cursors[i] + 1].date <= on) cursors[i]++;
        return sum + h.value * (h.history[cursors[i]].close / h.latest!);
      }, 0);
    });
    series = values.map((v) => ((v / values[0]) - 1) * 100);
  }
  return { series, rangePct, todayPct };
}
