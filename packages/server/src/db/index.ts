import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_PATH || path.join(path.resolve(process.cwd(), 'data'), 'ledger.db');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite: Database.Database = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Ensure core tables exist on fresh databases (before migrations run)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    is_active INTEGER NOT NULL DEFAULT 1,
    twofa_enabled INTEGER NOT NULL DEFAULT 0,
    twofa_secret TEXT,
    twofa_backup_codes TEXT,
    twofa_enabled_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    permission TEXT NOT NULL,
    granted INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, permission)
  );

  CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS financial_institutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    domain TEXT,
    logo_url TEXT,
    color TEXT,
    is_system INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    last_four TEXT,
    type TEXT NOT NULL,
    classification TEXT NOT NULL,
    institution TEXT,
    institution_id INTEGER REFERENCES financial_institutions(id),
    owner TEXT NOT NULL,
    avatar_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS account_owners (
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    PRIMARY KEY (account_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT NOT NULL,
    sub_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    type TEXT NOT NULL,
    is_deductible INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    recurring_budget_mode TEXT DEFAULT 'set',
    emoji TEXT,
    exclude_from_budget INTEGER DEFAULT 0,
    group_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS merchants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vendor_logos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    domain TEXT,
    logo_url TEXT,
    color TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    note TEXT,
    category_id INTEGER REFERENCES categories(id),
    merchant_id INTEGER REFERENCES merchants(id),
    amount REAL NOT NULL,
    categorize_confidence REAL,
    needs_review INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transaction_splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    amount REAL NOT NULL,
    merchant_id INTEGER REFERENCES merchants(id),
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_splits_txn ON transaction_splits(transaction_id);
  CREATE INDEX IF NOT EXISTS idx_splits_cat ON transaction_splits(category_id);
  -- idx_splits_merchant is created in migrate-split-merchant.ts (AFTER the
  -- merchant_id column is added), so this DDL — which runs before migrations —
  -- never references a column that doesn't yet exist on an upgraded DB.

  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    month TEXT NOT NULL,
    amount REAL NOT NULL,
    override INTEGER NOT NULL DEFAULT 0,
    UNIQUE(category_id, month)
  );

  CREATE TABLE IF NOT EXISTS balance_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    date TEXT NOT NULL,
    balance REAL NOT NULL,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    purchase_date TEXT NOT NULL,
    cost REAL NOT NULL,
    lifespan_years REAL NOT NULL,
    salvage_value REAL NOT NULL,
    depreciation_method TEXT NOT NULL DEFAULT 'straight_line',
    declining_rate REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS dev_storage (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite, { schema });
export { sqlite, dataDir };

// Auto-seed categories on first run (empty database)
const catCount = sqlite.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
if (catCount.count === 0) {
  console.log('Fresh database detected — seeding default categories...');

  let sortOrder = 0;

  const incomeCategories = ['Take Home Pay', 'Interest Income', 'Other Income'];
  for (const name of incomeCategories) {
    db.insert(schema.categories).values({
      group_name: 'Income',
      sub_name: name,
      display_name: `Income: ${name}`,
      type: 'income',
      is_deductible: 0,
      sort_order: sortOrder++,
    }).run();
  }

  const expenseGroups: Array<{ group: string; subs: string[]; deductible?: boolean }> = [
    { group: 'Auto/Transportation', subs: ['Fuel', 'Service', 'Transportation', 'Other Auto/Transportation'] },
    { group: 'Clothing', subs: ['Clothes/Shoes', 'Laundry/Dry Cleaning', 'Other Clothing'] },
    { group: 'Daily Living', subs: ['Dining/Eating Out', 'Groceries', 'Personal Supplies', 'Pets', 'Other Daily Living'] },
    { group: 'Education', subs: ['Tuition', 'Other Education'] },
    { group: 'Entertainment', subs: ['Books/Magazine', 'Hobby', 'Other Entertainment'] },
    { group: 'Health', subs: ['Medicine/Drug', 'Doctor/Dentist/Optometrist', 'Hospital', 'Other Health'], deductible: true },
    { group: 'Household', subs: ['Rent', 'Furnishings', 'Appliances', 'Improvements', 'Maintenance', 'Other Household'] },
    { group: 'Insurance', subs: ['Auto', 'Health', 'Other'] },
    { group: 'Loan', subs: ['Auto', 'Personal Note', 'Other'] },
    { group: 'Tax Not Withheld', subs: ['Fed', 'Other'] },
    { group: 'Utilities', subs: ['Internet', 'Phone', 'Power', 'Water', 'Other'] },
  ];

  for (const { group, subs, deductible } of expenseGroups) {
    for (const sub of subs) {
      db.insert(schema.categories).values({
        group_name: group,
        sub_name: sub,
        display_name: `${group}: ${sub}`,
        type: 'expense',
        is_deductible: deductible ? 1 : 0,
        sort_order: sortOrder++,
      }).run();
    }
  }

  const seeded = sqlite.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
  console.log(`  Seeded ${seeded.count} categories.`);
}
