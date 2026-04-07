/**
 * Demo seed script for screenshots / case study.
 * Run AFTER the regular seed: npm run seed && npx tsx src/db/demo-seed.ts
 *
 * Creates:
 *  - 2 users (John = owner, Jane = admin)
 *  - 8 accounts across both users (checking, savings, credit, investment)
 *  - ~100 transactions (Jan–Mar 2026) including splits
 *  - Monthly budgets
 *  - Balance snapshots for net worth
 *  - Depreciable assets
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'ledger.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure transaction_splits table exists (not created by base seed)
db.exec(`
  CREATE TABLE IF NOT EXISTS transaction_splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    amount REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function catId(groupName: string, subName: string): number {
  const row = db.prepare(
    'SELECT id FROM categories WHERE group_name = ? AND sub_name = ?'
  ).get(groupName, subName) as { id: number } | undefined;
  if (!row) throw new Error(`Category not found: ${groupName} / ${subName}`);
  return row.id;
}

function insertTx(
  accountId: number,
  date: string,
  description: string,
  categoryId: number,
  amount: number,
  note?: string
): number {
  const res = db.prepare(
    'INSERT INTO transactions (account_id, date, description, category_id, amount, note) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(accountId, date, description, categoryId, amount, note ?? null);
  return Number(res.lastInsertRowid);
}

function insertSplit(txId: number, categoryId: number, amount: number) {
  db.prepare(
    'INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)'
  ).run(txId, categoryId, amount);
}

// ---------------------------------------------------------------------------
// 1. Users
// ---------------------------------------------------------------------------
console.log('Creating users...');

const johnHash = bcrypt.hashSync('password1', 10);
const janeHash = bcrypt.hashSync('password1', 10);

db.prepare(
  `INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)`
).run('john', johnHash, 'John', 'owner');

db.prepare(
  `INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)`
).run('jane', janeHash, 'Jane', 'admin');

const johnId = (db.prepare("SELECT id FROM users WHERE username = 'john'").get() as any).id;
const janeId = (db.prepare("SELECT id FROM users WHERE username = 'jane'").get() as any).id;

// Mark setup complete
db.prepare(
  `INSERT OR REPLACE INTO app_config (key, value) VALUES ('setup_complete', 'true')`
).run();

console.log(`  John (id=${johnId}, owner), Jane (id=${janeId}, admin)`);

// ---------------------------------------------------------------------------
// 2. Accounts
// ---------------------------------------------------------------------------
console.log('Creating accounts...');

interface Acct { name: string; last_four: string; type: string; classification: string; owners: number[] }

const accountDefs: Acct[] = [
  { name: "John's Checking",   last_four: '4821', type: 'checking',   classification: 'liquid',     owners: [johnId] },
  { name: "John's Visa",       last_four: '7733', type: 'credit',     classification: 'liability',  owners: [johnId] },
  { name: "Jane's Checking",   last_four: '9102', type: 'checking',   classification: 'liquid',     owners: [janeId] },
  { name: "Jane's Savings",    last_four: '5540', type: 'savings',    classification: 'liquid',     owners: [janeId] },
  { name: "Jane's Amex",       last_four: '1008', type: 'credit',     classification: 'liability',  owners: [janeId] },
  { name: 'Joint Savings',     last_four: '6200', type: 'savings',    classification: 'liquid',     owners: [johnId, janeId] },
  { name: "John's 401(k)",     last_four: '3310', type: 'retirement', classification: 'investment', owners: [johnId] },
  { name: "Jane's Roth IRA",   last_four: '8841', type: 'retirement', classification: 'investment', owners: [janeId] },
];

const acctIds: Record<string, number> = {};

for (const a of accountDefs) {
  const res = db.prepare(
    'INSERT INTO accounts (name, last_four, type, classification, owner) VALUES (?, ?, ?, ?, ?)'
  ).run(a.name, a.last_four, a.type, a.classification, a.owners.map(id => id === johnId ? 'John' : 'Jane').join(', '));
  const acctId = Number(res.lastInsertRowid);
  acctIds[a.name] = acctId;
  for (const uid of a.owners) {
    db.prepare('INSERT INTO account_owners (account_id, user_id) VALUES (?, ?)').run(acctId, uid);
  }
}

console.log(`  Created ${Object.keys(acctIds).length} accounts`);

// Shorthand references
const jChecking  = acctIds["John's Checking"];
const jVisa      = acctIds["John's Visa"];
const jaChecking = acctIds["Jane's Checking"];
const jaSavings  = acctIds["Jane's Savings"];
const jaAmex     = acctIds["Jane's Amex"];
const jointSav   = acctIds["Joint Savings"];
const j401k      = acctIds["John's 401(k)"];
const jaIRA      = acctIds["Jane's Roth IRA"];

// ---------------------------------------------------------------------------
// 3. Category IDs
// ---------------------------------------------------------------------------
const CAT = {
  takeHomePay:   catId('Income', 'Take Home Pay'),
  interestInc:   catId('Income', 'Interest Income'),
  fuel:          catId('Auto/Transportation', 'Fuel'),
  autoService:   catId('Auto/Transportation', 'Service'),
  transport:     catId('Auto/Transportation', 'Transportation'),
  dining:        catId('Daily Living', 'Dining/Eating Out'),
  groceries:     catId('Daily Living', 'Groceries'),
  personalSupp:  catId('Daily Living', 'Personal Supplies'),
  pets:          catId('Daily Living', 'Pets'),
  otherDaily:    catId('Daily Living', 'Other Daily Living'),
  clothes:       catId('Clothing', 'Clothes/Shoes'),
  books:         catId('Entertainment', 'Books/Magazine'),
  hobby:         catId('Entertainment', 'Hobby'),
  otherEnt:      catId('Entertainment', 'Other Entertainment'),
  medicine:      catId('Health', 'Medicine/Drug'),
  doctor:        catId('Health', 'Doctor/Dentist/Optometrist'),
  rent:          catId('Household', 'Rent'),
  furnishings:   catId('Household', 'Furnishings'),
  maintenance:   catId('Household', 'Maintenance'),
  autoIns:       catId('Insurance', 'Auto'),
  healthIns:     catId('Insurance', 'Health'),
  autoLoan:      catId('Loan', 'Auto'),
  internet:      catId('Utilities', 'Internet'),
  phone:         catId('Utilities', 'Phone'),
  power:         catId('Utilities', 'Power'),
  water:         catId('Utilities', 'Water'),
};

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

// ---------------------------------------------------------------------------
// 6. Monthly Budgets (for all 3 months)
// ---------------------------------------------------------------------------
console.log('Creating budgets...');

const monthlyBudgets: Array<[number, number]> = [
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
    ).run(catIdVal, month, amount);
    budgetCount++;
  }
}

console.log(`  Created ${budgetCount} budget entries`);

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
  ).run(acctId, date, balance, note ?? null);
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
    declining_rate: 0.20,
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
    declining_rate: 0.30,
  },
];

for (const a of assetDefs) {
  db.prepare(
    `INSERT INTO assets (name, purchase_date, cost, lifespan_years, salvage_value, depreciation_method, declining_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(a.name, a.purchase_date, a.cost, a.lifespan_years, a.salvage_value, a.depreciation_method, a.declining_rate ?? null);
}

console.log(`  Created ${assetDefs.length} depreciable assets`);

// ---------------------------------------------------------------------------
// 9. Jane's member permissions (she's admin so these are mainly for display)
// ---------------------------------------------------------------------------
// No need — admins bypass all permission checks.

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

const finalTxCount = (db.prepare('SELECT COUNT(*) as c FROM transactions').get() as any).c;
const finalAcctCount = (db.prepare('SELECT COUNT(*) as c FROM accounts').get() as any).c;
const finalUserCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;

console.log('\n✅ Demo seed complete!');
console.log(`   Users:        ${finalUserCount}`);
console.log(`   Accounts:     ${finalAcctCount}`);
console.log(`   Transactions: ${finalTxCount}`);
console.log(`   Budgets:      ${budgetCount}`);
console.log(`   Balances:     ${balances.length}`);
console.log(`   Assets:       ${assetDefs.length}`);
console.log('\n   Login as john/password1 (owner) or jane/password1 (admin)');

db.close();
