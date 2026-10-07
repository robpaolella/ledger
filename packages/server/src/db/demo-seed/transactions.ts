/** Seeds all demo transactions and their category splits. */
import type { Helpers } from './helpers.js';
import type { PeopleAccounts } from './people-accounts.js';
import type { Categories } from './categories.js';

export function seedTransactions(
  { insertTx, insertSplit }: Helpers,
  { jChecking, jaChecking, jointSav, jVisa, jaAmex }: PeopleAccounts,
  CAT: Categories,
) {
  // ---------------------------------------------------------------------------
  // 4. Transactions (~100 across Jan–Mar 2026)
  // ---------------------------------------------------------------------------
  console.log('Creating transactions...');
  let txCount = 0;

  // Helper to batch-insert transactions
  function txs(rows: Array<[number, string, string, number, number, string?]>) {
    for (const [acct, date, desc, cat, amt, note] of rows) {
      insertTx(acct, date, desc, cat, amt, note);
      txCount++;
    }
  }

  // ---- JANUARY 2026 ----

  // Income
  txs([
    // John's paycheck (bi-weekly)
    [jChecking, '2026-01-02', 'Direct Deposit — Payroll',    CAT.takeHomePay, -1750],
    [jChecking, '2026-01-16', 'Direct Deposit — Payroll',    CAT.takeHomePay, -1750],
    // Jane's paycheck (bi-weekly)
    [jaChecking, '2026-01-02', 'Direct Deposit — Payroll',   CAT.takeHomePay, -1500],
    [jaChecking, '2026-01-16', 'Direct Deposit — Payroll',   CAT.takeHomePay, -1500],
    // Interest on joint savings
    [jointSav, '2026-01-31', 'Interest Payment',             CAT.interestInc, -12.47],
  ]);

  // Rent (split from John's checking)
  txs([
    [jChecking, '2026-01-01', 'Rent — January',              CAT.rent, 1400],
  ]);

  // Utilities
  txs([
    [jChecking,  '2026-01-05', 'Xfinity Internet',           CAT.internet, 79.99],
    [jChecking,  '2026-01-06', 'Duke Energy',                 CAT.power, 142.30],
    [jChecking,  '2026-01-07', 'City Water Dept',             CAT.water, 48.60],
    [jaChecking, '2026-01-08', 'T-Mobile',                    CAT.phone, 85.00],
  ]);

  // Groceries
  txs([
    [jVisa,    '2026-01-03', 'Trader Joe\'s',                 CAT.groceries, 87.42],
    [jVisa,    '2026-01-10', 'Costco',                        CAT.groceries, 156.23],
    [jaAmex,   '2026-01-07', 'Whole Foods Market',            CAT.groceries, 63.18],
    [jaAmex,   '2026-01-14', 'Publix',                        CAT.groceries, 52.90],
    [jaAmex,   '2026-01-22', 'Trader Joe\'s',                 CAT.groceries, 71.34],
  ]);

  // Gas
  txs([
    [jVisa,    '2026-01-04', 'Shell',                         CAT.fuel, 42.10],
    [jVisa,    '2026-01-18', 'Chevron',                       CAT.fuel, 38.75],
    [jaAmex,   '2026-01-12', 'BP',                            CAT.fuel, 35.20],
  ]);

  // Dining
  txs([
    [jVisa,    '2026-01-09', 'Chipotle',                      CAT.dining, 14.85],
    [jaAmex,   '2026-01-11', 'Starbucks',                     CAT.dining, 6.45],
    [jVisa,    '2026-01-17', 'Olive Garden',                   CAT.dining, 58.30],
    [jaAmex,   '2026-01-24', 'Panera Bread',                  CAT.dining, 12.70],
  ]);

  // Pets
  txs([
    [jaAmex,   '2026-01-06', 'PetSmart — Dog Food',           CAT.pets, 44.99],
    [jaAmex,   '2026-01-20', 'Banfield Pet Hospital',         CAT.pets, 85.00, 'Annual checkup'],
  ]);

  // Insurance
  txs([
    [jChecking, '2026-01-15', 'GEICO — Auto Insurance',       CAT.autoIns, 128.00],
    [jaChecking, '2026-01-15', 'BlueCross BlueShield',        CAT.healthIns, 210.00],
  ]);

  // Auto loan
  txs([
    [jChecking, '2026-01-10', 'Honda Financial — Car Payment', CAT.autoLoan, 312.00],
  ]);

  // Other / daily living
  txs([
    [jVisa,    '2026-01-13', 'Amazon — Phone Case',           CAT.otherDaily, 18.99],
    [jaAmex,   '2026-01-19', 'Target — Household Supplies',   CAT.personalSupp, 34.21],
    [jVisa,    '2026-01-25', 'CVS Pharmacy',                  CAT.medicine, 22.50],
  ]);

  // Entertainment
  txs([
    [jVisa,    '2026-01-21', 'AMC Theatres',                  CAT.otherEnt, 28.00],
    [jaAmex,   '2026-01-28', 'Barnes & Noble',                CAT.books, 16.49],
  ]);

  // ---- FEBRUARY 2026 ----

  // Income
  txs([
    [jChecking, '2026-02-02', 'Direct Deposit — Payroll',     CAT.takeHomePay, -1750],
    [jChecking, '2026-02-16', 'Direct Deposit — Payroll',     CAT.takeHomePay, -1750],
    [jaChecking, '2026-02-02', 'Direct Deposit — Payroll',    CAT.takeHomePay, -1500],
    [jaChecking, '2026-02-16', 'Direct Deposit — Payroll',    CAT.takeHomePay, -1500],
    [jointSav, '2026-02-28', 'Interest Payment',              CAT.interestInc, -13.02],
  ]);

  // Rent
  txs([
    [jChecking, '2026-02-01', 'Rent — February',              CAT.rent, 1400],
  ]);

  // Utilities
  txs([
    [jChecking,  '2026-02-05', 'Xfinity Internet',            CAT.internet, 79.99],
    [jChecking,  '2026-02-06', 'Duke Energy',                  CAT.power, 128.45],
    [jChecking,  '2026-02-07', 'City Water Dept',              CAT.water, 46.20],
    [jaChecking, '2026-02-08', 'T-Mobile',                     CAT.phone, 85.00],
  ]);

  // Groceries
  txs([
    [jVisa,    '2026-02-01', 'Costco',                         CAT.groceries, 142.87],
    [jaAmex,   '2026-02-05', 'Whole Foods Market',             CAT.groceries, 58.63],
    [jVisa,    '2026-02-11', 'Trader Joe\'s',                  CAT.groceries, 93.10],
    [jaAmex,   '2026-02-18', 'Publix',                         CAT.groceries, 47.22],
    [jaAmex,   '2026-02-25', 'ALDI',                           CAT.groceries, 39.85],
  ]);

  // Gas
  txs([
    [jVisa,    '2026-02-03', 'Shell',                          CAT.fuel, 39.80],
    [jVisa,    '2026-02-17', 'Costco Gas',                     CAT.fuel, 36.12],
    [jaAmex,   '2026-02-10', 'BP',                             CAT.fuel, 33.45],
  ]);

  // Dining
  txs([
    [jaAmex,   '2026-02-06', 'Starbucks',                     CAT.dining, 7.20],
    [jVisa,    '2026-02-13', 'Five Guys',                     CAT.dining, 19.45],
    [jaAmex,   '2026-02-14', 'The Melting Pot',               CAT.dining, 112.00, 'Valentine\'s dinner'],
    [jVisa,    '2026-02-22', 'Chick-fil-A',                   CAT.dining, 11.32],
  ]);

  // Pets
  txs([
    [jaAmex,   '2026-02-09', 'Chewy.com — Dog Treats',        CAT.pets, 29.99],
  ]);

  // Insurance
  txs([
    [jChecking, '2026-02-15', 'GEICO — Auto Insurance',       CAT.autoIns, 128.00],
    [jaChecking,'2026-02-15', 'BlueCross BlueShield',          CAT.healthIns, 210.00],
  ]);

  // Auto loan
  txs([
    [jChecking, '2026-02-10', 'Honda Financial — Car Payment', CAT.autoLoan, 312.00],
  ]);

  // Other spending
  txs([
    [jaAmex,   '2026-02-04', 'Amazon — Kitchen Scale',        CAT.otherDaily, 24.99],
    [jVisa,    '2026-02-08', 'Walgreens',                     CAT.medicine, 15.80],
    [jaAmex,   '2026-02-20', 'Target — Toiletries',           CAT.personalSupp, 27.43],
    [jVisa,    '2026-02-12', 'Guitar Center — Strings',       CAT.hobby, 12.99],
  ]);

  // Travel in Feb
  txs([
    [jVisa,    '2026-02-21', 'Delta Airlines',                CAT.transport, 289.00, 'Weekend trip to NYC'],
    [jVisa,    '2026-02-22', 'Marriott NYC',                  CAT.otherDaily, 185.00, 'Hotel — 1 night'],
  ]);

  // Clothing
  txs([
    [jaAmex,   '2026-02-16', 'Nordstrom Rack',                CAT.clothes, 64.50],
  ]);

  // ---- MARCH 2026 ----

  // Income
  txs([
    [jChecking, '2026-03-02', 'Direct Deposit — Payroll',     CAT.takeHomePay, -1750],
    [jaChecking,'2026-03-02', 'Direct Deposit — Payroll',     CAT.takeHomePay, -1500],
  ]);

  // Rent
  txs([
    [jChecking, '2026-03-01', 'Rent — March',                 CAT.rent, 1400],
  ]);

  // Utilities
  txs([
    [jChecking,  '2026-03-05', 'Xfinity Internet',            CAT.internet, 79.99],
    [jChecking,  '2026-03-06', 'Duke Energy',                  CAT.power, 118.75],
    [jChecking,  '2026-03-07', 'City Water Dept',              CAT.water, 44.10],
    [jaChecking, '2026-03-08', 'T-Mobile',                     CAT.phone, 85.00],
  ]);

  // Groceries
  txs([
    [jVisa,    '2026-03-01', 'Trader Joe\'s',                  CAT.groceries, 76.55],
    [jaAmex,   '2026-03-04', 'Whole Foods Market',             CAT.groceries, 69.12],
    [jVisa,    '2026-03-08', 'Costco',                         CAT.groceries, 134.60],
  ]);

  // Gas
  txs([
    [jVisa,    '2026-03-02', 'Shell',                          CAT.fuel, 41.30],
    [jaAmex,   '2026-03-06', 'Chevron',                        CAT.fuel, 37.15],
  ]);

  // Dining
  txs([
    [jaAmex,   '2026-03-03', 'Starbucks',                     CAT.dining, 5.95],
    [jVisa,    '2026-03-07', 'Taco Bell',                     CAT.dining, 9.48],
  ]);

  // Insurance & loan
  txs([
    [jChecking, '2026-03-10', 'Honda Financial — Car Payment', CAT.autoLoan, 312.00],
    [jChecking, '2026-03-15', 'GEICO — Auto Insurance',       CAT.autoIns, 128.00],
    [jaChecking,'2026-03-15', 'BlueCross BlueShield',          CAT.healthIns, 210.00],
  ]);

  // Pets
  txs([
    [jaAmex,   '2026-03-05', 'PetSmart — Dog Food',           CAT.pets, 44.99],
  ]);

  // Other
  txs([
    [jVisa,    '2026-03-04', 'Home Depot — Air Filters',      CAT.maintenance, 32.48],
    [jaAmex,   '2026-03-06', 'Amazon — Book',                 CAT.books, 14.99],
    [jVisa,    '2026-03-03', 'Doctor Copay',                  CAT.doctor, 40.00],
  ]);

  // Refund (negative expense)
  txs([
    [jVisa,    '2026-03-05', 'Amazon Refund — Phone Case',    CAT.otherDaily, -18.99],
  ]);

  console.log(`  Created ${txCount} transactions`);

  // ---------------------------------------------------------------------------
  // 5. Split transactions
  // ---------------------------------------------------------------------------
  console.log('Creating split transactions...');

  // Costco run: groceries + household supplies + pet food
  const splitTx1 = insertTx(jVisa, '2026-01-26', 'Costco — Mixed', CAT.groceries, 178.45);
  insertSplit(splitTx1, CAT.groceries, 112.50);
  insertSplit(splitTx1, CAT.personalSupp, 38.96);
  insertSplit(splitTx1, CAT.pets, 26.99);
  txCount++;

  // Target run: clothing + daily living
  const splitTx2 = insertTx(jaAmex, '2026-02-27', 'Target — Mixed', CAT.otherDaily, 89.47);
  insertSplit(splitTx2, CAT.clothes, 42.00);
  insertSplit(splitTx2, CAT.personalSupp, 22.49);
  insertSplit(splitTx2, CAT.otherDaily, 24.98);
  txCount++;

  // Costco Feb: groceries + furnishings
  const splitTx3 = insertTx(jVisa, '2026-02-15', 'Costco — Mixed', CAT.groceries, 203.88);
  insertSplit(splitTx3, CAT.groceries, 148.90);
  insertSplit(splitTx3, CAT.furnishings, 54.98);
  txCount++;

  // Amazon order: hobby + books
  const splitTx4 = insertTx(jaAmex, '2026-03-02', 'Amazon — Mixed Order', CAT.hobby, 67.97);
  insertSplit(splitTx4, CAT.hobby, 39.99);
  insertSplit(splitTx4, CAT.books, 27.98);
  txCount++;

  console.log(`  Total transactions: ${txCount}`);

}

