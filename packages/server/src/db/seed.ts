import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'path';
import fs from 'fs';

const defaultDir = path.resolve(process.cwd(), 'data');
const dbPath = process.env.DATABASE_PATH || path.join(defaultDir, 'ledger.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Delete existing DB for clean seed
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('Deleted existing database.');
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema });

async function seed() {
  console.log('Creating tables...');

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

    CREATE TABLE IF NOT EXISTS dev_storage (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      last_four TEXT,
      type TEXT NOT NULL,
      classification TEXT NOT NULL,
      owner TEXT NOT NULL,
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
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      note TEXT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      amount REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      month TEXT NOT NULL,
      amount REAL NOT NULL,
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

    CREATE TABLE IF NOT EXISTS dismissed_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      signature TEXT NOT NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS dismissed_transfers_acct_sig_idx
      ON dismissed_transfers(account_id, signature);
  `);

  // --- Categories ---
  console.log('Seeding categories...');

  let sortOrder = 0;

  // Income categories (all under group_name "Income")
  const incomeCategories = [
    'Take Home Pay', 'Interest Income', 'Other Income',
  ];

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

  // Expense categories
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

  // Count results
  const catCount = sqlite.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
  const incCount = sqlite.prepare("SELECT COUNT(*) as count FROM categories WHERE type = 'income'").get() as { count: number };
  const expCount = sqlite.prepare("SELECT COUNT(*) as count FROM categories WHERE type = 'expense'").get() as { count: number };
  const dedCount = sqlite.prepare('SELECT COUNT(*) as count FROM categories WHERE is_deductible = 1').get() as { count: number };

  console.log(`\nSeed complete!`);
  console.log(`  Categories: ${catCount.count} (${incCount.count} income, ${expCount.count} expense)`);
  console.log(`  Deductible categories: ${dedCount.count}`);
  console.log(`\nDatabase seeded. Visit the app to create your admin account.`);

  sqlite.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
