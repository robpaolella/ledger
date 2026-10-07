/** Seeds monthly budgets and recurring household bills/paychecks. */
import type { Helpers } from './helpers.js';
import type { PeopleAccounts } from './people-accounts.js';
import type { Categories } from './categories.js';
import { findOrCreateMerchant } from '../merchants.js';
import { sampleMerchantName } from './merchants.js';

export function seedBudgets({ db, rel }: Helpers, CAT: Categories) {
  // ---------------------------------------------------------------------------
  // 6. Monthly Budgets (for all 3 months)
  // ---------------------------------------------------------------------------
  console.log('Creating budgets...');

  const monthlyBudgets: Array<[number, number]> = [
    [CAT.takeHomePay, 6500],
    [CAT.rent,         1400],
    [CAT.groceries,     600],
    [CAT.dining,        150],
    [CAT.fuel,          120],
    [CAT.pets,          100],
    [CAT.internet,       80],
    [CAT.phone,          85],
    [CAT.power,         150],
    [CAT.water,          50],
    [CAT.autoIns,       130],
    [CAT.healthIns,     210],
    [CAT.autoLoan,      315],
    [CAT.personalSupp,   60],
    [CAT.otherDaily,     75],
    [CAT.clothes,        75],
    [CAT.books,          25],
    [CAT.hobby,          30],
    [CAT.otherEnt,       40],
    [CAT.medicine,       30],
    [CAT.doctor,         50],
    [CAT.maintenance,    50],
    [CAT.transport,     100],
  ];

  const months = ['2026-01', '2026-02', '2026-03'];
  let budgetCount = 0;

  for (const month of months) {
    for (const [catIdVal, amount] of monthlyBudgets) {
      db.prepare(
        'INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, ?)'
      ).run(catIdVal, rel(month), amount);
      budgetCount++;
    }
  }

  console.log(`  Created ${budgetCount} budget entries`);


  return budgetCount;
}

export function seedRecurring(
  { db, rel }: Helpers,
  { johnId, janeId, jChecking, jaChecking, jVisa }: PeopleAccounts,
  CAT: Categories,
) {
  // ---------------------------------------------------------------------------
  // 8b. Recurring items — the household's fixed bills + paychecks, so the
  //     Recurring page and the budget's recurring floors have something to show.
  // ---------------------------------------------------------------------------
  console.log('Creating recurring items...');
  const recurringDefs: Array<{
    type: 'income' | 'expense'; label: string; merchant: string; category: number; account: number;
    amount: number; freq: 'monthly' | 'semi_monthly'; day?: number; days?: number[]; user: number;
  }> = [
    { type: 'income',  label: 'Paycheck — John',   merchant: 'Direct Deposit — Payroll', category: CAT.takeHomePay, account: jChecking,  amount: 1750, freq: 'semi_monthly', days: [2, 16], user: johnId },
    { type: 'income',  label: 'Paycheck — Jane',   merchant: 'Direct Deposit — Payroll', category: CAT.takeHomePay, account: jaChecking, amount: 1500, freq: 'semi_monthly', days: [2, 16], user: janeId },
    { type: 'expense', label: 'Rent',              merchant: 'Oakwood Apartments',       category: CAT.rent,        account: jChecking,  amount: 1800, freq: 'monthly', day: 1,  user: johnId },
    { type: 'expense', label: 'Car payment',       merchant: 'Honda Financial — Car Payment', category: CAT.autoLoan, account: jChecking, amount: 312, freq: 'monthly', day: 10, user: johnId },
    { type: 'expense', label: 'Health insurance',  merchant: 'BlueCross BlueShield',     category: CAT.healthIns,   account: jaChecking, amount: 210, freq: 'monthly', day: 15, user: janeId },
    { type: 'expense', label: 'Auto insurance',    merchant: 'GEICO — Auto Insurance',   category: CAT.autoIns,     account: jChecking,  amount: 128, freq: 'monthly', day: 15, user: johnId },
    { type: 'expense', label: 'Phone',             merchant: 'T-Mobile',                 category: CAT.phone,       account: jaChecking, amount: 85,  freq: 'monthly', day: 8,  user: janeId },
    { type: 'expense', label: 'Electricity',       merchant: 'Duke Energy',              category: CAT.power,       account: jChecking,  amount: 118, freq: 'monthly', day: 6,  user: johnId },
    { type: 'expense', label: 'Internet',          merchant: 'Spectrum',                 category: CAT.internet,    account: jChecking,  amount: 70,  freq: 'monthly', day: 12, user: johnId },
    { type: 'expense', label: 'Netflix',           merchant: 'Netflix',                  category: CAT.otherEnt,    account: jVisa,      amount: 15.49, freq: 'monthly', day: 20, user: johnId },
  ];
  for (const r of recurringDefs) {
    db.prepare(
      `INSERT INTO recurring_items (type, label, merchant_id, category_id, account_id, amount, freq_kind, day, days_json, start_date, status, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
    ).run(r.type, r.label, findOrCreateMerchant(sampleMerchantName(r.merchant), db), r.category, r.account, r.amount, r.freq,
      r.day ?? null, r.days ? JSON.stringify(r.days) : null, rel('2026-01-01'), r.user);
  }
  console.log(`  Created ${recurringDefs.length} recurring items`);

}

