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
import { SAMPLE_AMAZON_MATCH_FIXTURES, seedTransactions } from '../src/db/demo-seed/transactions.js';
import { seedAmazonOrders } from '../src/db/demo-seed/amazon-orders.js';
import { seedReviewsRules } from '../src/db/demo-seed/reviews-rules.js';
import { buildCategorizer } from '../src/services/categorize.js';

function fixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username, password_hash, display_name, role);
    CREATE TABLE app_config (key PRIMARY KEY, value);
    CREATE TABLE financial_institutions (id INTEGER PRIMARY KEY, name UNIQUE, domain);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name, last_four, type, classification, owner, institution_id, institution, is_active DEFAULT 1);
    CREATE TABLE account_owners (account_id, user_id);
    CREATE TABLE merchants (id INTEGER PRIMARY KEY, name UNIQUE, logo_url);
    CREATE TABLE vendor_logos (name, logo_url);
  `);
  for (const institution of INSTITUTIONS) db.prepare('INSERT INTO financial_institutions (name, domain) VALUES (?, ?)').run(institution.name, institution.domain);
  for (const vendor of VENDORS) db.prepare('INSERT INTO vendor_logos (name) VALUES (?)').run(vendor.name);
  return db;
}

function transactionFixture(now: Date, withReviewData = false) {
  const db = fixture();
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, group_name, sub_name, display_name, type, sort_order, exclude_from_budget DEFAULT 0);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id REFERENCES accounts(id), date, description, category_id REFERENCES categories(id), merchant_id REFERENCES merchants(id), amount, note, needs_review DEFAULT 0);
    CREATE TABLE transaction_splits (id INTEGER PRIMARY KEY, transaction_id REFERENCES transactions(id), category_id REFERENCES categories(id), amount, merchant_id REFERENCES merchants(id), note);
    CREATE TABLE category_rules (id INTEGER PRIMARY KEY, match_type, pattern, category_id REFERENCES categories(id), priority DEFAULT 0, created_at);
    CREATE TABLE category_feedback (id INTEGER PRIMARY KEY, transaction_id REFERENCES transactions(id), description, merchant_id REFERENCES merchants(id), account_id REFERENCES accounts(id), amount, txn_date, prior_category_id REFERENCES categories(id), prior_source, prior_confidence, corrected_category_id REFERENCES categories(id), kind, user_id REFERENCES users(id), created_at);
    CREATE TABLE transaction_reviews (id INTEGER PRIMARY KEY, transaction_id UNIQUE REFERENCES transactions(id), status, reason, assignee_id REFERENCES users(id), note, flagged_by REFERENCES users(id), resolved_by REFERENCES users(id), created_at, resolved_at);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY, user_id REFERENCES users(id), type, severity, title, body, action_label, action_target, dedupe_key, is_read DEFAULT 0, created_at, UNIQUE(user_id, dedupe_key));
    CREATE TABLE amazon_orders (order_number TEXT PRIMARY KEY, order_date, total, subtotal, tax, raw_json, scraped_at);
    CREATE TABLE amazon_order_items (id INTEGER PRIMARY KEY, order_number REFERENCES amazon_orders(order_number), title, unit_price, quantity, asin, seller);
    CREATE TABLE amazon_charges (id INTEGER PRIMARY KEY, charge_date, amount, order_number REFERENCES amazon_orders(order_number), payment_method, is_refund DEFAULT 0);
    CREATE TABLE amazon_matches (transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id), order_number REFERENCES amazon_orders(order_number), charge_id REFERENCES amazon_charges(id), amount, matched_by, confidence, enriched_at, created_at);
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
  seedAmazonOrders(helpers);
  if (withReviewData) seedReviewsRules(helpers, people);
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
        .toEqual([{ type: null, n: 54 }, { type: 'expense', n: 1125 }, { type: 'income', n: 81 }, { type: 'transfer', n: 90 }]);
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
      expect(db.prepare("SELECT t.id FROM transactions t JOIN categories c ON c.id = t.category_id WHERE c.type = 'income' AND amount >= 0").all()).toEqual([]);
      expect(db.prepare("SELECT description FROM transactions t JOIN categories c ON c.id = t.category_id WHERE c.type = 'expense' AND amount <= 0").all())
        .toEqual([{ description: SAMPLE_AMAZON_MATCH_FIXTURES.refund.description }]);
      expect(db.prepare("SELECT date FROM transactions t JOIN categories c ON c.id = t.category_id WHERE c.type = 'transfer' GROUP BY date HAVING SUM(amount) != 0 OR COUNT(*) != 2").all()).toEqual([]);
      expect(scalar("SELECT COUNT(*) n FROM transactions t JOIN categories c ON c.id = t.category_id WHERE c.sub_name = 'Take Home Pay'")).toBe(36);
      expect(scalar('SELECT COUNT(DISTINCT transaction_id) n FROM transaction_splits')).toBe(27);
      expect(db.prepare('SELECT transaction_id FROM transaction_splits GROUP BY transaction_id HAVING COUNT(*) NOT BETWEEN 2 AND 3').all()).toEqual([]);
      expect(db.prepare('SELECT transaction_id FROM transaction_splits GROUP BY transaction_id HAVING COUNT(*) != COUNT(DISTINCT category_id)').all()).toEqual([]);
      expect(db.prepare(`
        SELECT t.id FROM transactions t JOIN transaction_splits ts ON ts.transaction_id = t.id
        JOIN accounts a ON a.id = t.account_id
        JOIN categories c ON c.id = ts.category_id
        WHERE t.category_id IS NOT NULL OR a.type != 'credit' OR c.type != 'expense'
        GROUP BY t.id
      `).all()).toEqual([]);
      expect(db.prepare(`
        SELECT t.id FROM transactions t JOIN transaction_splits ts ON ts.transaction_id = t.id
        GROUP BY t.id HAVING SUM(ROUND(ts.amount * 100)) != ROUND(t.amount * 100)
      `).all()).toEqual([]);
      expect(scalar('SELECT COUNT(*) n FROM transaction_splits WHERE merchant_id IS NOT NULL')).toBe(0);
      expect(scalar(`
        SELECT COUNT(*) n FROM transactions t JOIN merchants m ON m.id = t.merchant_id
        JOIN accounts a ON a.id = t.account_id
        WHERE m.name = 'Amazon' AND a.type = 'credit'
      `)).toBe(25);
      const amazon = (description: string) => db.prepare('SELECT amount FROM transactions WHERE description = ?').get(description) as { amount: number };
      expect(Math.round((amazon(SAMPLE_AMAZON_MATCH_FIXTURES.splitShipment.descriptions[0]).amount + amazon(SAMPLE_AMAZON_MATCH_FIXTURES.splitShipment.descriptions[1]).amount) * 100))
        .toBe(Math.round(SAMPLE_AMAZON_MATCH_FIXTURES.splitShipment.total * 100));
      expect(amazon(SAMPLE_AMAZON_MATCH_FIXTURES.refund.description).amount).toBe(SAMPLE_AMAZON_MATCH_FIXTURES.refund.amount);
      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally { db.close(); }
  });

  it.each([new Date(2026, 0, 1), new Date(2026, 1, 28), new Date(2028, 1, 29), new Date(2026, 9, 7)])('clips future dates and repeats exactly at %s', now => {
    const first = transactionFixture(now), second = transactionFixture(now);
    try {
      const rows = first.prepare('SELECT * FROM transactions ORDER BY id').all() as Array<{ date: string }>;
      expect(rows).toEqual(second.prepare('SELECT * FROM transactions ORDER BY id').all());
      expect(first.prepare('SELECT * FROM transaction_splits ORDER BY id').all())
        .toEqual(second.prepare('SELECT * FROM transaction_splits ORDER BY id').all());
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

describe('synthetic Amazon orders', () => {
  it('matches seeded card charges, including split, refund, and unmatched cases deterministically', () => {
    const first = transactionFixture(new Date(2026, 9, 31));
    const second = transactionFixture(new Date(2026, 9, 31));
    const scalar = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;
    try {
      expect(scalar(first, 'SELECT COUNT(*) n FROM amazon_orders')).toBe(25);
      expect(first.prepare('SELECT COUNT(*) n FROM amazon_order_items GROUP BY order_number HAVING COUNT(*) NOT BETWEEN 1 AND 4').all()).toEqual([]);
      expect(scalar(first, 'SELECT COUNT(*) n FROM amazon_matches')).toBe(25);
      expect(first.prepare(`
        SELECT m.transaction_id FROM amazon_matches m
        LEFT JOIN transactions t ON t.id = m.transaction_id
        LEFT JOIN amazon_orders o ON o.order_number = m.order_number
        LEFT JOIN amazon_charges c ON c.id = m.charge_id
        WHERE t.id IS NULL OR o.order_number IS NULL OR c.id IS NULL
      `).all()).toEqual([]);
      expect(first.prepare(`
        SELECT o.order_number FROM amazon_orders o
        JOIN amazon_charges c ON c.order_number = o.order_number
        GROUP BY o.order_number, o.total
        HAVING ROUND(o.total * 100) != SUM(ROUND(c.amount * 100))
      `).all()).toEqual([]);
      expect(first.prepare(`
        SELECT o.order_number FROM amazon_orders o
        JOIN amazon_order_items i ON i.order_number = o.order_number
        GROUP BY o.order_number, o.total
        HAVING ROUND(o.total * 100) != SUM(ROUND(i.unit_price * i.quantity * 100))
      `).all()).toEqual([]);
      const today = createHelpers(first, new Date(2026, 9, 31)).today;
      expect(first.prepare('SELECT order_number FROM amazon_orders WHERE order_date > ?').all(today)).toEqual([]);
      expect(first.prepare("SELECT order_number FROM amazon_orders WHERE order_number NOT GLOB '[0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9][0-9]'").all()).toEqual([]);

      const split = first.prepare(`
        SELECT m.order_number, SUM(m.amount) AS total, COUNT(*) AS charges
        FROM amazon_matches m
        JOIN transactions t ON t.id = m.transaction_id
        WHERE t.description IN (?, ?)
        GROUP BY m.order_number
      `).get(...SAMPLE_AMAZON_MATCH_FIXTURES.splitShipment.descriptions) as { order_number: string; total: number; charges: number };
      expect(split.order_number).toMatch(/^114-\d{7}-\d{7}$/);
      expect(split.charges).toBe(2);
      expect(Math.round(split.total * 100)).toBe(Math.round(SAMPLE_AMAZON_MATCH_FIXTURES.splitShipment.total * 100));
      expect(first.prepare(`
        SELECT i.title, i.unit_price FROM amazon_order_items i
        WHERE i.order_number = ? ORDER BY i.id
      `).all(split.order_number)).toEqual([
        { title: 'USB-C Hub', unit_price: 24.99 },
        { title: 'Laptop Stand', unit_price: 38.5 },
      ]);
      expect(scalar(first, `
        SELECT COUNT(*) n FROM amazon_charges c
        JOIN transactions t ON t.id = (SELECT transaction_id FROM amazon_matches WHERE charge_id = c.id)
        WHERE c.is_refund = 1 AND t.description = '${SAMPLE_AMAZON_MATCH_FIXTURES.refund.description}' AND c.amount = ${SAMPLE_AMAZON_MATCH_FIXTURES.refund.amount}
      `)).toBe(1);
      expect(first.prepare(`
        SELECT i.title, i.unit_price FROM amazon_order_items i
        JOIN amazon_matches m ON m.order_number = i.order_number
        JOIN transactions t ON t.id = m.transaction_id
        WHERE t.description = ?
      `).all(SAMPLE_AMAZON_MATCH_FIXTURES.refund.description)).toEqual([{ title: 'Desk Lamp', unit_price: -18.75 }]);
      expect(scalar(first, `
        SELECT COUNT(*) n FROM amazon_orders o
        WHERE NOT EXISTS (SELECT 1 FROM amazon_matches m WHERE m.order_number = o.order_number)
      `)).toBe(1);
      expect(first.pragma('foreign_key_check')).toEqual([]);

      for (const table of ['amazon_orders', 'amazon_order_items', 'amazon_charges', 'amazon_matches'] as const) {
        expect(first.prepare(`SELECT * FROM ${table} ORDER BY 1`).all())
          .toEqual(second.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
      }
    } finally {
      first.close();
      second.close();
    }
  });
});

describe('learned rules and review-task fixtures', () => {
  it('seeds deterministic, internally consistent review data and rules', () => {
    const first = transactionFixture(new Date(2026, 9, 31), true);
    const second = transactionFixture(new Date(2026, 9, 31), true);
    const clipped = transactionFixture(new Date(2026, 0, 1), true);
    const scalar = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;
    try {
      expect(scalar(first, 'SELECT COUNT(*) n FROM category_rules')).toBe(25);
      expect(first.prepare(`
        SELECT r.id FROM category_rules r
        LEFT JOIN merchants m ON m.id = CAST(r.pattern AS INTEGER)
        LEFT JOIN categories c ON c.id = r.category_id
        LEFT JOIN transactions t ON t.merchant_id = m.id AND t.category_id = r.category_id
        WHERE r.match_type != 'merchant' OR m.id IS NULL OR c.id IS NULL OR t.id IS NULL
      `).all()).toEqual([]);

      expect(first.prepare('SELECT kind, COUNT(*) n FROM category_feedback GROUP BY kind ORDER BY kind').all())
        .toEqual([{ kind: 'confirmation', n: 124 }, { kind: 'correction', n: 124 }, { kind: 'split_leg', n: 2 }]);
      expect(first.prepare(`
        SELECT f.id FROM category_feedback f
        LEFT JOIN transaction_splits ts ON ts.transaction_id = f.transaction_id AND ts.category_id = f.corrected_category_id
        WHERE f.kind = 'split_leg' AND ts.id IS NULL
      `).all()).toEqual([]);
      expect(scalar(first, `
        SELECT COUNT(*) n FROM category_feedback f JOIN transactions t ON t.id = f.transaction_id
        WHERE f.created_at < t.date
      `)).toBe(0);

      expect(first.prepare('SELECT status, COUNT(*) n FROM transaction_reviews GROUP BY status ORDER BY status').all())
        .toEqual([{ status: 'open', n: 45 }, { status: 'resolved', n: 255 }]);
      expect(scalar(first, 'SELECT COUNT(*) n FROM transactions WHERE needs_review = 1')).toBe(45);
      expect(first.prepare(`
        SELECT t.id FROM transactions t LEFT JOIN transaction_reviews r ON r.transaction_id = t.id AND r.status = 'open'
        WHERE t.needs_review != CASE WHEN r.id IS NULL THEN 0 ELSE 1 END
      `).all()).toEqual([]);
      expect(scalar(first, 'SELECT COUNT(*) n FROM transaction_reviews r JOIN transactions t ON t.id = r.transaction_id WHERE r.status = \'resolved\' AND (r.resolved_by IS NULL OR r.resolved_at IS NULL OR t.needs_review != 0)')).toBe(0);
      expect(scalar(first, 'SELECT COUNT(*) n FROM transaction_reviews r JOIN transactions t ON t.id = r.transaction_id WHERE r.status = \'open\' AND (r.assignee_id IS NULL OR t.needs_review != 1)')).toBe(0);
      expect(scalar(first, 'SELECT COUNT(*) n FROM transaction_reviews r JOIN transactions t ON t.id = r.transaction_id WHERE r.created_at < t.date')).toBe(0);
      expect(scalar(first, 'SELECT COUNT(*) n FROM transaction_reviews WHERE status = \'open\'') / scalar(first, 'SELECT COUNT(*) n FROM transactions')).toBeCloseTo(0.033, 2);

      expect(first.prepare(`
        SELECT n.user_id FROM notifications n
        WHERE n.dedupe_key = 'review:aggregate' AND (
          n.type != 'needs_review' OR n.title != 'Transactions need review' OR n.is_read != 0
          OR n.action_target != '/reviews?assignee=me'
          OR n.body != (SELECT COUNT(*) || ' transactions assigned to you need review' FROM transaction_reviews r WHERE r.status = 'open' AND r.assignee_id = n.user_id)
        )
      `).all()).toEqual([]);
      expect(scalar(first, "SELECT COUNT(*) n FROM notifications WHERE dedupe_key = 'review:aggregate'")).toBe(2);
      expect(first.pragma('foreign_key_check')).toEqual([]);

      const rule = first.prepare(`
        SELECT m.name, r.category_id FROM category_rules r JOIN merchants m ON m.id = CAST(r.pattern AS INTEGER) ORDER BY r.id LIMIT 1
      `).get() as { name: string; category_id: number };
      expect(buildCategorizer(first).categorize({ description: rule.name, amount: 12.34 })).toMatchObject({
        categoryId: rule.category_id, confidence: 1, source: 'rule',
      });
      for (const table of ['category_rules', 'category_feedback', 'transaction_reviews', 'notifications'] as const) {
        expect(first.prepare(`SELECT * FROM ${table} ORDER BY id`).all())
          .toEqual(second.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
      }
      expect(scalar(clipped, 'SELECT COUNT(*) n FROM transaction_reviews')).toBe(300);
      expect((clipped.prepare(`
        SELECT created_at AS date FROM category_rules UNION ALL
        SELECT created_at FROM category_feedback UNION ALL
        SELECT created_at FROM transaction_reviews UNION ALL
        SELECT resolved_at FROM transaction_reviews WHERE resolved_at IS NOT NULL UNION ALL
        SELECT created_at FROM notifications
      `).all() as { date: string }[]).every(row => row.date.slice(0, 10) <= '2026-01-01')).toBe(true);
    } finally {
      first.close();
      second.close();
      clipped.close();
    }
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
