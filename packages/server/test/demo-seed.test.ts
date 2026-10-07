import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
// Importing the production merchant helper must never open its default database.
vi.mock('../src/db/index.js', () => ({ sqlite: undefined }));
import { seedPeopleAccounts } from '../src/db/demo-seed/people-accounts.js';
import { brandMerchants, inventedMerchants, sampleMerchantName, seedMerchants } from '../src/db/demo-seed/merchants.js';
import { INSTITUTIONS } from '../src/db/data/institutions.js';
import { VENDORS } from '../src/db/data/vendors.js';

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
