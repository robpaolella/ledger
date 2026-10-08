/** Seeds daily account balance snapshots and depreciable assets. */
import type { Helpers } from './helpers.js';
import type { DailyBalances } from './investments.js';

/** The card with no transactions that keeps a statement credit (a positive balance). */
export const CARD_IN_CREDIT = "Jane's Visa";

export function seedNetWorth(
  { db }: Helpers,
  investmentBalances: DailyBalances,
  days: string[],
) {
  console.log('Creating daily balance snapshots...');
  const accounts = db.prepare('SELECT id, name, type FROM accounts ORDER BY id').all() as Array<{ id: number; name: string; type: string }>;
  const transactionSum = db.prepare('SELECT COALESCE(SUM(amount), 0) AS amount FROM transactions WHERE account_id = ? AND date <= ?');
  const insertBalance = db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)');
  const balances: Array<[number, string, number]> = [];

  db.transaction(() => {
    for (const [index, account] of accounts.entries()) {
      const isInvestment = ['investment', 'retirement'].includes(account.type);
      // Later-added sample accounts appear during the fixture window, rather
      // than making every account look like it has nine months of history.
      const startDay = index >= 14 ? 60 : index >= 8 ? 30 : 0;
      // Cards begin as liabilities; other transaction-backed accounts begin as assets.
      // it has no transactions, so it keeps a statement credit: stored positive (asset).
      const openingBalance = account.name === CARD_IN_CREDIT ? 212.4
        : account.type === 'credit' ? -(900 + index * 175) : 2_400 + index * 675;
      for (const date of days.slice(startDay)) {
        const balance = isInvestment
          ? investmentBalances.get(account.id)?.get(date)
          : Math.round((openingBalance - (transactionSum.get(account.id, date) as { amount: number }).amount) * 100) / 100;
        if (balance === undefined) throw new Error(`Missing investment balance for account ${account.id} on ${date}`);
        insertBalance.run(account.id, date, balance);
        balances.push([account.id, date, balance]);
      }
    }
  })();
  console.log(`  Created ${balances.length} daily balance snapshots`);

  console.log('Creating depreciable assets...');
  const assetDefs: Array<{
    name: string;
    purchase_date: string;
    cost: number;
    lifespan_years: number;
    salvage_value: number;
    depreciation_method: string;
    declining_rate?: number;
  }> = [
    { name: '2022 Honda Civic', purchase_date: '2022-06-15', cost: 26500, lifespan_years: 8, salvage_value: 6000, depreciation_method: 'declining_balance', declining_rate: 20 },
    { name: 'MacBook Pro 14"', purchase_date: '2024-09-01', cost: 1999, lifespan_years: 5, salvage_value: 200, depreciation_method: 'straight_line' },
    { name: 'Samsung Washer/Dryer Set', purchase_date: '2023-11-20', cost: 1800, lifespan_years: 10, salvage_value: 100, depreciation_method: 'straight_line' },
    { name: 'Living Room Furniture Set', purchase_date: '2023-03-10', cost: 3200, lifespan_years: 12, salvage_value: 300, depreciation_method: 'straight_line' },
    { name: 'iPad Pro', purchase_date: '2025-01-15', cost: 1099, lifespan_years: 4, salvage_value: 150, depreciation_method: 'declining_balance', declining_rate: 30 },
  ];

  for (const asset of assetDefs) {
    db.prepare(
      `INSERT INTO assets (name, purchase_date, cost, lifespan_years, salvage_value, depreciation_method, declining_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(asset.name, asset.purchase_date, asset.cost, asset.lifespan_years, asset.salvage_value, asset.depreciation_method, asset.declining_rate ?? null);
  }
  console.log(`  Created ${assetDefs.length} depreciable assets`);
  return { balances, assetDefs };
}
