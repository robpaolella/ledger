import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
// Importing the production merchant helper must never open its default database.
vi.mock('../src/db/index.js', () => ({ sqlite: undefined }));
import { seedPeopleAccounts } from '../src/db/demo-seed/people-accounts.js';
import { brandMerchants, inventedMerchants, sampleMerchantName, seedMerchants } from '../src/db/demo-seed/merchants.js';
import { INSTITUTIONS } from '../src/db/data/institutions.js';
import { VENDORS } from '../src/db/data/vendors.js';
import { createHelpers } from '../src/db/demo-seed/helpers.js';
import { createCategories } from '../src/db/demo-seed/categories.js';
import { seedTransactions } from '../src/db/demo-seed/transactions.js';

function fixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username, password_hash, display_name, role);
    CREATE TABLE app_config (key PRIMARY KEY, value);
    CREATE TABLE financial_institutions (id INTEGER PRIMARY KEY, name UNIQUE, domain);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name, last_four, type, classification, owner, institution_id, institution);
    CREATE TABLE account_owners (account_id, user_id);
    CREATE TABLE merchants (id INTEGER PRIMARY KEY, name UNIQUE, logo_url);
    CREATE TABLE vendor_logos (name, logo_url);
  `);
  for (const institution of INSTITUTIONS) db.prepare('INSERT INTO financial_institutions (name, domain) VALUES (?, ?)').run(institution.name, institution.domain);
  for (const vendor of VENDORS) db.prepare('INSERT INTO vendor_logos (name) VALUES (?)').run(vendor.name);
  return db;
}

function transactionFixture(now: Date) {
  const db = fixture();
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, group_name, sub_name, display_name, type, sort_order, exclude_from_budget DEFAULT 0);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id REFERENCES accounts(id), date, description, category_id REFERENCES categories(id), merchant_id REFERENCES merchants(id), amount, note);
  `);
  const groups: Record<string, string[]> = {
    Income: ['Take Home Pay', 'Interest Income', 'Other Income'],
    'Auto/Transportation': ['Fuel', 'Service', 'Transportation', 'Other Auto/Transportation'],
    Clothing: ['Clothes/Shoes', 'Laundry/Dry Cleaning', 'Other Clothing'],
    'Daily Living': ['Dining/Eating Out', 'Groceries', 'Personal Supplies', 'Pets', 'Other Daily Living'],
    Education: ['Tuition', 'Other Education'], Entertainment: ['Books/Magazine', 'Hobby', 'Other Entertainment'],
    Health: ['Medicine/Drug', 'Doctor/Dentist/Optometrist', 'Hospital', 'Other Health'],
    Household: ['Rent', 'Furnishings', 'Appliances', 'Improvements', 'Maintenance', 'Other Household'],
    Insurance: ['Auto', 'Health', 'Other'], Loan: ['Auto', 'Personal Note', 'Other'],
    'Tax Not Withheld': ['Fed', 'Other'], Utilities: ['Internet', 'Phone', 'Power', 'Water', 'Other'], Transfers: ['Transfer'],
  };
  for (const [group, subs] of Object.entries(groups)) for (const sub of subs) {
    db.prepare('INSERT INTO categories (group_name, sub_name, type, sort_order) VALUES (?, ?, ?, 0)')
      .run(group, sub, group === 'Income' ? 'income' : group === 'Transfers' ? 'transfer' : 'expense');
  }
  const people = seedPeopleAccounts(db);
  seedMerchants(db);
  const helpers = createHelpers(db, now);
  const categories = createCategories(helpers);
  createCategories(helpers); // Taxonomy additions are idempotent.
  seedTransactions(helpers, people, categories);
  return db;
}

describe('nine-month synthetic transactions', () => {
  it('meets volume, category, merchant and account targets with balanced transfer signs', () => {
    const db = transactionFixture(new Date(2026, 9, 31));
    const scalar = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    try {
      expect(scalar('SELECT COUNT(*) n FROM transactions')).toBe(1350);
      expect(db.prepare('SELECT COUNT(*) n FROM transactions GROUP BY substr(date, 1, 7)').all()).toEqual(Array(9).fill({ n: 150 }));
      expect(db.prepare('SELECT c.type, COUNT(*) n FROM transactions t LEFT JOIN categories c ON c.id = t.category_id GROUP BY c.type').all())
        .toEqual([{ type: null, n: 27 }, { type: 'expense', n: 1152 }, { type: 'income', n: 81 }, { type: 'transfer', n: 90 }]);
      expect(scalar("SELECT COUNT(*) n FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE a.type = 'credit'")).toBe(1080);
      expect(scalar("SELECT COUNT(DISTINCT account_id) n FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE a.type = 'credit'")).toBe(3);
      expect(scalar('SELECT COUNT(DISTINCT account_id) n FROM transactions')).toBe(19); // Fourth card intentionally quiet.
      expect(scalar('SELECT COUNT(*) n FROM transactions WHERE merchant_id IS NULL')).toBe(0);
      expect(scalar('SELECT COUNT(*) n FROM (SELECT merchant_id FROM transactions GROUP BY merchant_id HAVING COUNT(*) = 1)')).toBeGreaterThan(185 / 2);
      const topTen = scalar('SELECT SUM(n) n FROM (SELECT COUNT(*) n FROM transactions GROUP BY merchant_id ORDER BY n DESC LIMIT 10)');
      expect(topTen / 1350).toBeGreaterThanOrEqual(0.34);
      expect(topTen / 1350).toBeLessThanOrEqual(0.46);
      expect(scalar('SELECT COUNT(DISTINCT group_name) n FROM categories')).toBe(16);
      expect(db.prepare('SELECT group_name FROM categories GROUP BY group_name HAVING COUNT(*) NOT BETWEEN 3 AND 6').all()).toEqual([]);
      expect(db.prepare("SELECT t.id FROM transactions t JOIN categories c ON c.id = t.category_id WHERE (c.type = 'income' AND amount >= 0) OR (c.type = 'expense' AND amount <= 0)").all()).toEqual([]);
      expect(db.prepare("SELECT date FROM transactions t JOIN categories c ON c.id = t.category_id WHERE c.type = 'transfer' GROUP BY date HAVING SUM(amount) != 0 OR COUNT(*) != 2").all()).toEqual([]);
      expect(scalar("SELECT COUNT(*) n FROM transactions t JOIN categories c ON c.id = t.category_id WHERE c.sub_name = 'Take Home Pay'")).toBe(36);
      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally { db.close(); }
  });

  it.each([new Date(2026, 0, 1), new Date(2026, 1, 28), new Date(2028, 1, 29), new Date(2026, 9, 7)])('clips future dates and repeats exactly at %s', now => {
    const first = transactionFixture(now), second = transactionFixture(now);
    try {
      const rows = first.prepare('SELECT * FROM transactions ORDER BY id').all() as Array<{ date: string }>;
      expect(rows).toEqual(second.prepare('SELECT * FROM transactions ORDER BY id').all());
      const today = createHelpers(first, now).today;
      expect(rows.every(row => row.date <= today && !Number.isNaN(Date.parse(row.date)))).toBe(true);
      expect(new Set(rows.map(row => row.date.slice(0, 7))).size).toBe(9);
      expect(rows.length).toBeGreaterThan(1200);
      expect(rows.length).toBeLessThanOrEqual(1350);
    } finally { first.close(); second.close(); }
  });

  it('changes only dates when the window shifts, keeping past rows stable mid-month', () => {
    const a = transactionFixture(new Date(2026, 9, 31)), b = transactionFixture(new Date(2027, 0, 31));
    const early = transactionFixture(new Date(2026, 9, 7));
    try {
      const columns = 'account_id, description, category_id, merchant_id, amount, note';
      expect(a.prepare(`SELECT ${columns} FROM transactions ORDER BY id`).all()).toEqual(b.prepare(`SELECT ${columns} FROM transactions ORDER BY id`).all());
      expect(a.prepare(`SELECT date, ${columns} FROM transactions WHERE date <= '2026-10-07' ORDER BY id`).all())
        .toEqual(early.prepare(`SELECT date, ${columns} FROM transactions ORDER BY id`).all());
    } finally { a.close(); b.close(); early.close(); }
  });
});

describe('synthetic sample catalog', () => {
  it('preserves the original account references and links 20 accounts to eight existing institutions', () => {
    const db = fixture();
    try {
      const before = db.prepare('SELECT * FROM financial_institutions').all();
      expect(seedPeopleAccounts(db)).toEqual({ johnId: 1, janeId: 2, jChecking: 1, jVisa: 2, jaChecking: 3, jaSavings: 4, jaAmex: 5, jointSav: 6, j401k: 7, jaIRA: 8 });
      const accounts = db.prepare('SELECT name FROM accounts ORDER BY id').all();
      expect(accounts).toEqual([
        "John's Checking", "John's Visa", "Jane's Checking", "Jane's Savings", "Jane's Amex", 'Joint Savings', "John's 401(k)", "Jane's Roth IRA",
        "John's Savings", 'Joint Checking', "John's Brokerage", "Jane's Brokerage", "John's Roth IRA", "Jane's 401(k)", "John's Mastercard", "Jane's Visa",
        "John's Travel Savings", "Jane's Emergency Savings", "John's Venmo", "Jane's Venmo",
      ].map(name => ({ name })));
      expect(db.prepare('SELECT * FROM financial_institutions').all()).toEqual(before);
      expect(db.prepare('SELECT DISTINCT institution FROM accounts ORDER BY institution').all()).toEqual([
        'Ally Bank', 'American Express National Bank', 'Bank of America', 'Capital One', 'Chase', 'Fidelity', 'Vanguard', 'Venmo',
      ].map(institution => ({ institution })));
      expect(db.prepare('SELECT a.id FROM accounts a LEFT JOIN financial_institutions f ON f.id = a.institution_id WHERE f.id IS NULL OR a.institution != f.name OR f.domain IS NULL').all()).toEqual([]);
      expect(db.prepare('SELECT account_id FROM account_owners GROUP BY account_id HAVING COUNT(*) = 2').all()).toEqual([{ account_id: 6 }, { account_id: 10 }]);
      expect(db.prepare('SELECT COUNT(*) AS count FROM account_owners').get()).toEqual({ count: 22 });
    } finally { db.close(); }
  });

  it('fails loudly if an institution is missing instead of creating one', () => {
    const db = fixture();
    try {
      db.prepare("DELETE FROM financial_institutions WHERE name = 'Venmo'").run();
      expect(() => seedPeopleAccounts(db)).toThrow('Sample institution missing from catalog: Venmo');
      expect(db.prepare('SELECT * FROM accounts').all()).toEqual([]);
    } finally { db.close(); }
  });

  it('seeds exactly the intended merchants, matches brands, leaves logos empty and is repeatable', () => {
    const db = fixture();
    try {
      seedMerchants(db);
      seedMerchants(db);
      expect(brandMerchants).toHaveLength(35);
      expect(inventedMerchants).toHaveLength(150);
      const names = db.prepare('SELECT name FROM merchants ORDER BY name').all();
      expect(names).toEqual([...brandMerchants, ...inventedMerchants].sort().map(name => ({ name })));
      expect(db.prepare('SELECT name FROM merchants WHERE logo_url IS NOT NULL').all()).toEqual([]);
      const unmatched = db.prepare('SELECT m.name FROM merchants m LEFT JOIN vendor_logos v ON LOWER(v.name) = LOWER(m.name) WHERE v.name IS NULL ORDER BY m.name').all();
      expect(unmatched).toEqual([...inventedMerchants].sort().map(name => ({ name })));
      db.prepare("DELETE FROM vendor_logos WHERE name = 'Amazon'").run();
      expect(() => seedMerchants(db)).toThrow('Sample brand missing from vendor catalog: Amazon');
    } finally { db.close(); }
  });

  it('maps fixture descriptions without changing them and refuses unlisted merchants', () => {
    expect(sampleMerchantName('Direct Deposit — Payroll')).toBe('Larkspindle Workshop');
    expect(sampleMerchantName('Amazon — Phone Case')).toBe('Amazon');
    expect(sampleMerchantName('Amazon Refund — Phone Case')).toBe('Amazon');
    expect(sampleMerchantName('Rent — January')).toBe('Larkspindle Property Management');
    expect(sampleMerchantName('Oakwood Apartments')).toBe(sampleMerchantName('Rent — January'));
    expect(sampleMerchantName('Whole Foods Market')).toBe('Whole Foods');
    expect(sampleMerchantName('Duke Energy')).toBe('Larkspindle Energy');
    expect(() => sampleMerchantName('Unlisted shop')).toThrow('Unlisted sample merchant');
  });
});
