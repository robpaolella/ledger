/** Seeds account balance snapshots and depreciable assets. */
import type { Helpers } from './helpers.js';
import type { PeopleAccounts } from './people-accounts.js';

export function seedNetWorth(
  { db, rel }: Helpers,
  { jChecking, jaChecking, jaSavings, jointSav, jVisa, jaAmex, j401k, jaIRA }: PeopleAccounts,
) {
  // ---------------------------------------------------------------------------
  // 7. Balance Snapshots (for net worth)
  // ---------------------------------------------------------------------------
  console.log('Creating balance snapshots...');

  // Balances as of March 1, 2026
  const balances: Array<[number, string, number, string?]> = [
    // [accountId, date, balance, note]
    // Liquid accounts (positive = asset)
    [jChecking,  '2026-03-01', 3245.80],
    [jaChecking, '2026-03-01', 4120.55],
    [jaSavings,  '2026-03-01', 8500.00],
    [jointSav,   '2026-03-01', 15230.47],

    // Credit cards (negative = liability)
    [jVisa,      '2026-03-01', -1842.33],
    [jaAmex,     '2026-03-01', -967.15],

    // Investment accounts (positive = asset)
    [j401k,      '2026-03-01', 42680.00],
    [jaIRA,      '2026-03-01', 18950.00],

    // Add a couple earlier snapshots for trend lines
    [jChecking,  '2026-02-01', 2980.40],
    [jaChecking, '2026-02-01', 3850.20],
    [jaSavings,  '2026-02-01', 8500.00],
    [jointSav,   '2026-02-01', 15217.45],
    [jVisa,      '2026-02-01', -1520.10],
    [jaAmex,     '2026-02-01', -780.44],
    [j401k,      '2026-02-01', 41200.00],
    [jaIRA,      '2026-02-01', 18400.00],

    [jChecking,  '2026-01-01', 3100.00],
    [jaChecking, '2026-01-01', 3500.00],
    [jaSavings,  '2026-01-01', 8500.00],
    [jointSav,   '2026-01-01', 15200.00],
    [jVisa,      '2026-01-01', -1200.00],
    [jaAmex,     '2026-01-01', -450.00],
    [j401k,      '2026-01-01', 39800.00],
    [jaIRA,      '2026-01-01', 17850.00],
  ];

  for (const [acctId, date, balance, note] of balances) {
    db.prepare(
      'INSERT INTO balance_snapshots (account_id, date, balance, note) VALUES (?, ?, ?, ?)'
    ).run(acctId, rel(date), balance, note ?? null);
  }

  console.log(`  Created ${balances.length} balance snapshots`);

  // ---------------------------------------------------------------------------
  // 8. Depreciable Assets
  // ---------------------------------------------------------------------------
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
    {
      name: '2022 Honda Civic',
      purchase_date: '2022-06-15',
      cost: 26500,
      lifespan_years: 8,
      salvage_value: 6000,
      depreciation_method: 'declining_balance',
      declining_rate: 20, // percent/yr (runtime + create route treat rate as 1–99)
    },
    {
      name: 'MacBook Pro 14"',
      purchase_date: '2024-09-01',
      cost: 1999,
      lifespan_years: 5,
      salvage_value: 200,
      depreciation_method: 'straight_line',
    },
    {
      name: 'Samsung Washer/Dryer Set',
      purchase_date: '2023-11-20',
      cost: 1800,
      lifespan_years: 10,
      salvage_value: 100,
      depreciation_method: 'straight_line',
    },
    {
      name: 'Living Room Furniture Set',
      purchase_date: '2023-03-10',
      cost: 3200,
      lifespan_years: 12,
      salvage_value: 300,
      depreciation_method: 'straight_line',
    },
    {
      name: 'iPad Pro',
      purchase_date: '2025-01-15',
      cost: 1099,
      lifespan_years: 4,
      salvage_value: 150,
      depreciation_method: 'declining_balance',
      declining_rate: 30, // percent/yr
    },
  ];

  for (const a of assetDefs) {
    db.prepare(
      `INSERT INTO assets (name, purchase_date, cost, lifespan_years, salvage_value, depreciation_method, declining_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(a.name, a.purchase_date, a.cost, a.lifespan_years, a.salvage_value, a.depreciation_method, a.declining_rate ?? null);
  }

  console.log(`  Created ${assetDefs.length} depreciable assets`);


  return { balances, assetDefs };
}

