/** Seeds deterministic, offline investment positions, prices, and daily history. */
import type { Helpers } from './helpers.js';

export type DailyBalances = Map<number, Map<string, number>>;

const POSITIONS = [
  ['AAPL', 'Apple Inc.', 'US Equity', 180],
  ['MSFT', 'Microsoft Corp.', 'US Equity', 410],
  ['NVDA', 'NVIDIA Corp.', 'US Equity', 125],
  ['AMZN', 'Amazon.com Inc.', 'US Equity', 165],
  ['GOOGL', 'Alphabet Inc. Class A', 'US Equity', 145],
  ['VTI', 'Vanguard Total Stock Market ETF', 'US Equity', 275],
  ['VXUS', 'Vanguard Total International Stock ETF', 'International Equity', 62],
  ['BND', 'Vanguard Total Bond Market ETF', 'Fixed Income', 73],
  ['SCHD', 'Schwab U.S. Dividend Equity ETF', 'US Equity', 81],
  ['VOO', 'Vanguard S&P 500 ETF', 'US Equity', 490],
] as const;

const BENCHMARKS = [
  ['SPY', 580],
  ...POSITIONS.map(([symbol, , , price]) => [symbol, price] as const),
] as const;

function fixtureDays(rel: Helpers['rel'], today: string): string[] {
  // Use the same shifted nine-month window as transactions, but advance through
  // actual calendar days after shifting. Shifting individual month-end fixture
  // dates would collapse (for example) July 29–31 into February 28.
  const days: string[] = [];
  const start = rel('2025-07-01');
  for (let time = Date.parse(`${start}T00:00:00.000Z`); time <= Date.parse(`${today}T00:00:00.000Z`); time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

function price(base: number, day: number, symbolIndex: number) {
  // A stable trend plus small, repeatable volatility — not a real quote.
  return Math.round(base * (1 + day * (0.00022 + symbolIndex * 0.000003) + Math.sin(day * 0.37 + symbolIndex) * 0.014) * 100) / 100;
}

export function seedInvestments({ db, rel, today }: Helpers) {
  console.log('Creating investment positions and price history...');
  const accounts = db.prepare("SELECT id, name, type, owner FROM accounts WHERE type IN ('investment', 'retirement') ORDER BY id")
    .all() as Array<{ id: number; name: string; type: string; owner: string }>;
  const users = db.prepare('SELECT id, display_name FROM users').all() as Array<{ id: number; display_name: string }>;
  const userId = (owner: string) => users.find(user => owner.includes(user.display_name))?.id;
  const days = fixtureDays(rel, today);
  const balances: DailyBalances = new Map(accounts.map(account => [account.id, new Map()]));
  const insertConnection = db.prepare('INSERT INTO simplefin_connections (user_id, access_url, label) VALUES (?, ?, ?)');
  const insertLink = db.prepare(`INSERT INTO simplefin_links
    (simplefin_connection_id, simplefin_account_id, account_id, simplefin_account_name, simplefin_org_name, last_synced_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const insertHolding = db.prepare(`INSERT INTO simplefin_holdings
    (simplefin_link_id, symbol, description, shares, cost_basis, market_value, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertHistory = db.prepare(`INSERT INTO holdings_history
    (simplefin_link_id, symbol, date, shares, cost_basis, market_value) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertPrice = db.prepare('INSERT INTO benchmark_prices (symbol, date, adj_close) VALUES (?, ?, ?)');
  const insertMeta = db.prepare('INSERT INTO symbol_meta (symbol, asset_class) VALUES (?, ?)');
  // Demo links exist solely to power local holdings screens. Mark today's pull
  // complete so the production scheduler never attempts their synthetic URLs.
  const setDailySyncComplete = db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES ('daily_sync.last_success', ?)");

  db.transaction(() => {
    setDailySyncComplete.run(today);
    for (const [symbol, , assetClass] of POSITIONS) insertMeta.run(symbol, assetClass);
    for (const [symbol, base] of BENCHMARKS) {
      for (const [dayIndex, date] of days.entries()) insertPrice.run(symbol, date, price(base, dayIndex, BENCHMARKS.findIndex(([candidate]) => candidate === symbol)));
    }
    for (const [accountIndex, account] of accounts.entries()) {
      const connectionId = Number(insertConnection.run(userId(account.owner) ?? null, `demo://investment-${account.id}`, `${account.name} sample feed`).lastInsertRowid);
      const linkId = Number(insertLink.run(connectionId, `demo-investment-${account.id}`, account.id, account.name, 'Sample Brokerage', days[days.length - 1] ?? today).lastInsertRowid);
      const accountBalances = balances.get(account.id)!;
      for (const [positionIndex, [symbol, description, , base]] of POSITIONS.entries()) {
        const shares = Math.round((4 + ((accountIndex * 7 + positionIndex * 3) % 17) + positionIndex / 10) * 1000) / 1000;
        const costBasis = Math.round(shares * base * (0.88 + (positionIndex % 4) * 0.015) * 100) / 100;
        for (const [dayIndex, date] of days.entries()) {
          const marketValue = Math.round(shares * price(base, dayIndex, positionIndex + 1) * 100) / 100;
          insertHistory.run(linkId, symbol, date, shares, costBasis, marketValue);
          accountBalances.set(date, Math.round(((accountBalances.get(date) ?? 0) + marketValue) * 100) / 100);
          if (dayIndex === days.length - 1) insertHolding.run(linkId, symbol, description, shares, costBasis, marketValue, `${date}T12:00:00.000Z`);
        }
      }
    }
  })();
  console.log(`  Created ${accounts.length * POSITIONS.length} positions, ${days.length} days of history, and ${BENCHMARKS.length} price series (offline)`);
  return { balances, days, positionCount: accounts.length * POSITIONS.length };
}
