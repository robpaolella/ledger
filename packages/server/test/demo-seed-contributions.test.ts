import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';
import type { ReportContribution } from '@ledger/shared/src/types.js';

// The Reports route reads the database through this handle, so each test points it at its own
// in-memory sample database.
const handle = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../src/db/index.js', async () => {
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const schema = await import('../src/db/schema.js');
  return {
    get sqlite() { return handle.current; },
    get db() { return drizzle(handle.current as Database.Database, { schema }); },
  };
});
import { seedPeopleAccounts } from '../src/db/demo-seed/people-accounts.js';
import { seedMerchants } from '../src/db/demo-seed/merchants.js';
import { createHelpers } from '../src/db/demo-seed/helpers.js';
import { createCategories } from '../src/db/demo-seed/categories.js';
import { seedTransactions } from '../src/db/demo-seed/transactions.js';
import { COLLEGE_CATEGORY, RETIREMENT_CATEGORY, seedContributions } from '../src/db/demo-seed/contributions.js';
import { migrateContributions } from '../src/db/migrate-contributions.js';
import { migrateTransferLinks } from '../src/db/migrate-transfer-links.js';
import { INSTITUTIONS } from '../src/db/data/institutions.js';
import { VENDORS } from '../src/db/data/vendors.js';

// "Now" is the end of October 2026, so the nine seeded months run Feb to Oct 2026.
const NOW = new Date(2026, 9, 31);

function build(withContributions: boolean) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username, password_hash, display_name, role);
    CREATE TABLE app_config (key PRIMARY KEY, value);
    CREATE TABLE financial_institutions (id INTEGER PRIMARY KEY, name UNIQUE, domain);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name, last_four, type, classification, owner, institution_id, institution, is_active DEFAULT 1);
    CREATE TABLE account_owners (account_id, user_id);
    CREATE TABLE merchants (id INTEGER PRIMARY KEY, name UNIQUE, logo_url);
    CREATE TABLE vendor_logos (name, logo_url);
    CREATE TABLE categories (id INTEGER PRIMARY KEY, group_name, sub_name, display_name, type, sort_order, exclude_from_budget DEFAULT 0, is_deductible DEFAULT 0, emoji, group_id);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id REFERENCES accounts(id), date, description, category_id REFERENCES categories(id), merchant_id REFERENCES merchants(id), amount, note);
    CREATE TABLE transaction_splits (id INTEGER PRIMARY KEY, transaction_id REFERENCES transactions(id), category_id REFERENCES categories(id), amount, merchant_id REFERENCES merchants(id), note);
  `);
  migrateContributions(db);
  migrateTransferLinks(db);
  for (const institution of INSTITUTIONS) db.prepare('INSERT INTO financial_institutions (name, domain) VALUES (?, ?)').run(institution.name, institution.domain);
  for (const vendor of VENDORS) db.prepare('INSERT INTO vendor_logos (name) VALUES (?)').run(vendor.name);
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
    db.prepare('INSERT INTO categories (group_name, sub_name, display_name, type, sort_order) VALUES (?, ?, ?, ?, 0)')
      .run(group, sub, `${group}: ${sub}`, group === 'Income' ? 'income' : group === 'Transfers' ? 'transfer' : 'expense');
  }
  const people = seedPeopleAccounts(db);
  seedMerchants(db);
  const helpers = createHelpers(db, NOW);
  const categories = createCategories(helpers);
  seedTransactions(helpers, people, categories);
  if (withContributions) seedContributions(helpers, people);
  handle.current = db;
  return { db, people };
}

type Period = { kpis: Record<string, number>; contributions: ReportContribution[]; buckets: { label: string }[]; categories: unknown[] };
async function period(): Promise<Period> {
  const { default: reports } = await import('../src/routes/reports.js');
  const app = express();
  app.use('/api/reports', reports);
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/reports/period?start=2026-02-01&end=2026-10-31`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: Period }).data;
  } finally { server.close(); }
}

let open: Database.Database | undefined;
afterEach(() => { open?.close(); open = undefined; });

describe('contribution sample data', () => {
  it('tracks college savings into one joint account and retirement into two', () => {
    const { db, people } = build(true);
    open = db;
    const setups = db.prepare(`
      SELECT c.sub_name AS name, s.includes_external AS external, GROUP_CONCAT(a.name, '|') AS accounts
      FROM contribution_setups s JOIN categories c ON c.id = s.category_id
      JOIN contribution_setup_accounts sa ON sa.setup_id = s.id JOIN accounts a ON a.id = sa.account_id
      GROUP BY s.id ORDER BY c.sub_name`).all() as Array<{ name: string; external: number; accounts: string }>;
    expect(setups.map(s => ({ ...s, accounts: s.accounts.split('|').sort() }))).toEqual([
      { name: COLLEGE_CATEGORY[1], external: 0, accounts: ['Joint College Savings'] },
      { name: RETIREMENT_CATEGORY[1], external: 0, accounts: ["Jane's Roth IRA", "John's 401(k)"] },
    ]);
    expect(db.prepare('SELECT type, classification, owner FROM accounts WHERE id = ?').get(people.college))
      .toEqual({ type: 'investment', classification: 'investment', owner: 'John, Jane' });
    expect(db.prepare('SELECT COUNT(*) n FROM account_owners WHERE account_id = ?').get(people.college)).toEqual({ n: 2 });
  });

  it('records only the checking side of college savings, with a withdrawal and a reversal across a month end', () => {
    const { db } = build(true);
    open = db;
    const rows = db.prepare(`
      SELECT t.date, t.amount, a.name AS account FROM transactions t JOIN categories c ON c.id = t.category_id
      JOIN accounts a ON a.id = t.account_id
      WHERE c.sub_name = ? ORDER BY t.date, t.id`).all(COLLEGE_CATEGORY[1]) as Array<{ date: string; amount: number; account: string }>;
    expect(new Set(rows.map(r => r.account))).toEqual(new Set(['Joint Checking']));
    expect(rows.filter(r => r.amount === 500)).toHaveLength(9);
    expect(rows.filter(r => r.amount === -1200)).toHaveLength(1);
    const reversal = rows.filter(r => Math.abs(r.amount) === 400);
    expect(reversal.map(r => r.amount)).toEqual([400, -400]);
    expect(reversal[0].date.slice(0, 7)).not.toBe(reversal[1].date.slice(0, 7));
    expect(new Date(reversal[1].date).getTime() - new Date(reversal[0].date).getTime()).toBe(5 * 86_400_000);
  });

  it('links exactly one two-sided retirement contribution as a transfer pair', () => {
    const { db } = build(true);
    open = db;
    const links = db.prepare(`
      SELECT f.account_id AS fromAccount, t.account_id AS toAccount, f.amount AS fromAmount, t.amount AS toAmount, l.amount, l.status, f.category_id = t.category_id AS sameCategory
      FROM transfer_links l JOIN transactions f ON f.id = l.from_transaction_id JOIN transactions t ON t.id = l.to_transaction_id`).all();
    expect(links).toEqual([{ fromAccount: 1, toAccount: 7, fromAmount: 350, toAmount: -350, amount: 350, status: 'linked', sameCategory: 1 }]);
    expect(db.prepare(`SELECT COUNT(*) n FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE c.sub_name = ? AND t.account_id IN (7, 8)`).get(RETIREMENT_CATEGORY[1])).toEqual({ n: 1 });
  });

  it('lists both tracked categories in the Reports period data, each half of the reversal in its own month', async () => {
    const { db } = build(true);
    open = db;
    const data = await period();
    const months = data.buckets.map(b => b.label);
    expect(months).toEqual(['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
    expect(data.contributions.map(c => c.name)).toEqual([COLLEGE_CATEGORY[1], RETIREMENT_CATEGORY[1]]);
    const [college, retirement] = data.contributions;
    // Feb..Oct: 500 monthly; the 400 deposit lands in Jul and its reversal in Aug; the withdrawal is in Jun.
    expect(college.putIn).toEqual([500, 500, 500, 500, 500, 900, 500, 500, 500]);
    expect(college.takenOut).toEqual([0, 0, 0, 0, 1200, 0, 400, 0, 0]);
    expect(college.totalPutIn).toBe(4900);
    expect(college.totalTakenOut).toBe(1600);
    // Three one-sided gifts and the linked pair's paying side; the receiving leg never counts.
    expect(retirement.putIn).toEqual([0, 0, 300, 0, 250, 0, 300, 350, 0]);
    expect(retirement.totalPutIn).toBe(1200);
    expect(retirement.totalTakenOut).toBe(0);
  });

  it('leaves Income, Expenses, Net and Savings rate exactly as they were without the records', async () => {
    const without = build(false);
    const before = await period();
    without.db.close();
    const { db } = build(true);
    open = db;
    const after = await period();
    expect(before.contributions).toEqual([]);
    expect(after.kpis).toEqual(before.kpis);
    expect(after.categories).toEqual(before.categories);
    expect(after.kpis.income).toBeGreaterThan(0);
  });
});
