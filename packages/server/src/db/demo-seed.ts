/**
 * Demo seed script for screenshots / case study.
 * Run AFTER the regular seed: npm run seed && npx tsx src/db/demo-seed.ts
 *
 * Creates:
 *  - 2 users (John = owner, Jane = admin)
 *  - 20 accounts across 8 catalog institutions
 *  - 35 national-brand and 150 invented merchants
 *  - ~150 transactions/month for nine months, through today
 *  - Monthly budgets
 *  - Balance snapshots for net worth
 *  - Depreciable assets
 */

import Database from 'better-sqlite3';
import path from 'path';
import { createHelpers } from './demo-seed/helpers.js';
import { seedPeopleAccounts } from './demo-seed/people-accounts.js';
import { seedMerchants } from './demo-seed/merchants.js';
import { createCategories } from './demo-seed/categories.js';
import { seedTransactions } from './demo-seed/transactions.js';
import { seedBudgets, seedRecurring } from './demo-seed/budgets-recurring.js';
import { seedNetWorth } from './demo-seed/net-worth.js';
import { seedInvestments } from './demo-seed/investments.js';

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
    merchant_id INTEGER REFERENCES merchants(id),
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Ensure recurring_items table exists (not created by base seed)
db.exec(`
  CREATE TABLE IF NOT EXISTS recurring_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income','expense')),
    label TEXT NOT NULL,
    merchant_id INTEGER REFERENCES merchants(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    account_id INTEGER REFERENCES accounts(id),
    amount REAL,
    freq_kind TEXT NOT NULL CHECK (freq_kind IN ('monthly','semi_monthly','biweekly','weekly','every_n_months','custom_months')),
    day INTEGER, days_json TEXT, interval INTEGER, anchor_date TEXT, months_json TEXT,
    start_date TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
    user_id INTEGER REFERENCES users(id),
    effective_start TEXT, effective_end TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

const helpers = createHelpers(db);
const peopleAccounts = seedPeopleAccounts(db);
seedMerchants(db);
const CAT = createCategories(helpers);
seedTransactions(helpers, peopleAccounts, CAT);
const budgetCount = seedBudgets(helpers, CAT);
const investments = seedInvestments(helpers);
const { balances, assetDefs } = seedNetWorth(helpers, investments.balances, investments.days);
seedRecurring(helpers, peopleAccounts, CAT);

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
