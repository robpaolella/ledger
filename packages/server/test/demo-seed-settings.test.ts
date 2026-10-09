import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
// The production merchant helper imports the default database unless this is mocked.
vi.mock('../src/db/index.js', () => ({ sqlite: undefined }));
import { INSTITUTIONS } from '../src/db/data/institutions.js';
import { VENDORS } from '../src/db/data/vendors.js';
import { seedPeopleAccounts } from '../src/db/demo-seed/people-accounts.js';
import { seedMerchants } from '../src/db/demo-seed/merchants.js';
import { createHelpers } from '../src/db/demo-seed/helpers.js';
import { createCategories } from '../src/db/demo-seed/categories.js';
import { seedTransactions } from '../src/db/demo-seed/transactions.js';
import { seedAmazonOrders } from '../src/db/demo-seed/amazon-orders.js';
import { seedReviewsRules } from '../src/db/demo-seed/reviews-rules.js';
import { seedInvestments } from '../src/db/demo-seed/investments.js';
import { seedSettings } from '../src/db/demo-seed/settings.js';
import { FAILURE_SENTENCES } from '../src/services/simplefinSync.js';
import { buildCategorizer } from '../src/services/categorize.js';

function fixture(now: Date) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username, password_hash, display_name, role);
    CREATE TABLE app_config (key PRIMARY KEY, value);
    CREATE TABLE financial_institutions (id INTEGER PRIMARY KEY, name UNIQUE, domain);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name, last_four, type, classification, owner, institution_id, institution, is_active DEFAULT 1);
    CREATE TABLE account_owners (account_id, user_id);
    CREATE TABLE merchants (id INTEGER PRIMARY KEY, name UNIQUE, logo_url, suppress_rule_suggest INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE vendor_logos (name, logo_url);
    CREATE TABLE categories (id INTEGER PRIMARY KEY, group_name, sub_name, display_name, type, sort_order, exclude_from_budget DEFAULT 0);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id REFERENCES accounts(id), date, description, category_id INTEGER REFERENCES categories(id), merchant_id INTEGER REFERENCES merchants(id), amount, note, needs_review DEFAULT 0);
    CREATE TABLE transaction_splits (id INTEGER PRIMARY KEY, transaction_id REFERENCES transactions(id), category_id REFERENCES categories(id), amount, merchant_id REFERENCES merchants(id), note);
    CREATE TABLE category_rules (id INTEGER PRIMARY KEY, match_type, pattern, category_id REFERENCES categories(id), priority DEFAULT 0, created_at);
    CREATE TABLE category_feedback (id INTEGER PRIMARY KEY, transaction_id REFERENCES transactions(id), description, merchant_id REFERENCES merchants(id), account_id REFERENCES accounts(id), amount, txn_date, prior_category_id REFERENCES categories(id), prior_source, prior_confidence, corrected_category_id REFERENCES categories(id), kind, user_id REFERENCES users(id), created_at);
    CREATE TABLE transaction_reviews (id INTEGER PRIMARY KEY, transaction_id UNIQUE REFERENCES transactions(id), status, reason, assignee_id REFERENCES users(id), note, flagged_by REFERENCES users(id), resolved_by REFERENCES users(id), created_at, resolved_at);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY, user_id REFERENCES users(id), type, severity, title, body, action_label, action_target, dedupe_key, is_read DEFAULT 0, created_at, UNIQUE(user_id, dedupe_key));
    CREATE TABLE amazon_orders (order_number TEXT PRIMARY KEY, order_date, total, subtotal, tax, raw_json, scraped_at);
    CREATE TABLE amazon_order_items (id INTEGER PRIMARY KEY, order_number REFERENCES amazon_orders(order_number), title, unit_price, quantity, asin, seller);
    CREATE TABLE amazon_charges (id INTEGER PRIMARY KEY, charge_date, amount, order_number REFERENCES amazon_orders(order_number), payment_method, is_refund DEFAULT 0);
    CREATE TABLE amazon_matches (transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id), order_number REFERENCES amazon_orders(order_number), charge_id REFERENCES amazon_charges(id), amount, matched_by, confidence, enriched_at, created_at);
    CREATE TABLE simplefin_connections (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), access_url TEXT NOT NULL, label TEXT NOT NULL, sync_status TEXT, sync_error_kind TEXT, sync_message TEXT, sync_attempt_at TEXT);
    CREATE TABLE simplefin_links (id INTEGER PRIMARY KEY, simplefin_connection_id INTEGER NOT NULL REFERENCES simplefin_connections(id), simplefin_account_id TEXT UNIQUE, account_id INTEGER NOT NULL REFERENCES accounts(id), simplefin_account_name TEXT, simplefin_org_name TEXT, last_synced_at TEXT, last_sync_status TEXT, last_sync_error TEXT, last_sync_attempt_at TEXT);
    CREATE TABLE simplefin_holdings (id INTEGER PRIMARY KEY, simplefin_link_id INTEGER REFERENCES simplefin_links(id), symbol TEXT, description TEXT, shares REAL, cost_basis REAL, market_value REAL, updated_at TEXT);
    CREATE TABLE holdings_history (id INTEGER PRIMARY KEY, simplefin_link_id INTEGER REFERENCES simplefin_links(id), symbol TEXT, date TEXT, shares REAL, cost_basis REAL, market_value REAL);
    CREATE TABLE benchmark_prices (id INTEGER PRIMARY KEY, symbol TEXT, date TEXT, adj_close REAL);
    CREATE TABLE symbol_meta (symbol TEXT PRIMARY KEY, asset_class TEXT);
  `);
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
    db.prepare('INSERT INTO categories (group_name, sub_name, type, sort_order) VALUES (?, ?, ?, 0)')
      .run(group, sub, group === 'Income' ? 'income' : group === 'Transfers' ? 'transfer' : 'expense');
  }
  const people = seedPeopleAccounts(db);
  seedMerchants(db);
  const helpers = createHelpers(db, now);
  const categories = createCategories(helpers);
  seedTransactions(helpers, people, categories);
  seedAmazonOrders(helpers);
  seedReviewsRules(helpers, people);
  seedInvestments(helpers);
  seedSettings(helpers, people);
  return db;
}

const scalar = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;
const NOON = new Date(2026, 9, 31, 12, 0);

describe('Settings sample data', () => {
  it("seeds a connection in each status, with Ledger's stored sentences and one with no links", () => {
    const db = fixture(NOON);
    try {
      expect(db.prepare(`
        SELECT sync_status status, sync_error_kind kind, sync_message message, COUNT(*) n
        FROM simplefin_connections GROUP BY sync_status, sync_error_kind, sync_message ORDER BY sync_status, sync_error_kind
      `).all()).toEqual([
        { status: 'failed', kind: 'other', message: FAILURE_SENTENCES.other, n: 1 },
        { status: 'failed', kind: 'rate_limit', message: FAILURE_SENTENCES.rate_limit, n: 1 },
        { status: 'reconnect_needed', kind: 'auth', message: FAILURE_SENTENCES.auth, n: 1 },
        { status: 'working', kind: null, message: null, n: 7 },
      ]);
      expect(db.prepare(`
        SELECT c.label FROM simplefin_connections c LEFT JOIN simplefin_links l ON l.simplefin_connection_id = c.id
        GROUP BY c.id HAVING COUNT(l.id) = 0
      `).all()).toEqual([{ label: 'Sample new feed' }]);
      expect(scalar(db, 'SELECT COUNT(*) n FROM simplefin_connections WHERE sync_attempt_at IS NULL')).toBe(0);
      expect(scalar(db, 'SELECT COUNT(DISTINCT COALESCE(user_id, 0)) n FROM simplefin_connections')).toBe(3); // shared + both people
      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('can never reach the network: every access URL is demo://', () => {
    const db = fixture(NOON);
    try {
      expect(scalar(db, "SELECT COUNT(*) n FROM simplefin_connections WHERE access_url NOT LIKE 'demo://%'")).toBe(0);
      expect(scalar(db, 'SELECT COUNT(*) n FROM simplefin_connections')).toBe(10);
      expect(db.prepare("SELECT value FROM app_config WHERE key = 'daily_sync.last_success'").get()).toEqual({ value: '2026-10-31' });
      expect(db.prepare("SELECT value FROM app_config WHERE key = 'daily_sync.enabled'").get()).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('stores a daily-sync last run at the latest 5:31 am that is not in the future', () => {
    const lastRun = (now: Date) => {
      const db = fixture(now);
      try {
        const row = db.prepare("SELECT value FROM app_config WHERE key = 'daily_sync.last_run'").get() as { value: string };
        return JSON.parse(row.value) as { day: string; at: string; transactionsImported: number; connections: number; connectionsWithProblems: number };
      } finally {
        db.close();
      }
    };
    const afternoon = lastRun(NOON);
    expect(afternoon).toMatchObject({ day: '2026-10-31', transactionsImported: 7, connections: 10, connectionsWithProblems: 3 });
    expect(new Date(afternoon.at)).toEqual(new Date(2026, 9, 31, 5, 31));
    // Before 5:31 the run is still yesterday's.
    const early = lastRun(new Date(2026, 9, 31, 4, 0));
    expect(early.day).toBe('2026-10-30');
    expect(new Date(early.at)).toEqual(new Date(2026, 9, 30, 5, 31));
  });

  it('has 40 rules including contains and pattern rules, and 3 muted merchants with no rule', () => {
    const db = fixture(NOON);
    try {
      expect(scalar(db, 'SELECT COUNT(*) n FROM category_rules')).toBe(40);
      expect(db.prepare('SELECT match_type, COUNT(*) n FROM category_rules GROUP BY match_type ORDER BY match_type').all())
        .toEqual([{ match_type: 'contains', n: 3 }, { match_type: 'merchant', n: 34 }, { match_type: 'regex', n: 3 }]);
      expect(scalar(db, 'SELECT COUNT(*) n FROM category_rules r LEFT JOIN categories c ON c.id = r.category_id WHERE c.id IS NULL')).toBe(0);
      expect(scalar(db, "SELECT COUNT(*) n FROM category_rules WHERE match_type = 'merchant' AND CAST(pattern AS INTEGER) NOT IN (SELECT id FROM merchants)")).toBe(0);
      for (const row of db.prepare("SELECT pattern FROM category_rules WHERE match_type = 'regex'").all() as { pattern: string }[]) {
        expect(() => new RegExp(row.pattern, 'i')).not.toThrow();
      }
      expect(db.prepare(`
        SELECT m.id FROM merchants m WHERE m.suppress_rule_suggest = 1
          AND EXISTS (SELECT 1 FROM category_rules r WHERE r.match_type = 'merchant' AND r.pattern = CAST(m.id AS TEXT))
      `).all()).toEqual([]);
      expect(scalar(db, 'SELECT COUNT(*) n FROM merchants WHERE suppress_rule_suggest = 1')).toBe(3);
      // Each contains rule matches a real merchant name.
      const categorizer = buildCategorizer(db);
      for (const rule of db.prepare("SELECT pattern FROM category_rules WHERE match_type = 'contains'").all() as { pattern: string }[]) {
        const merchant = db.prepare('SELECT name FROM merchants WHERE lower(name) LIKE ? ORDER BY id').get(`%${rule.pattern}%`) as { name: string };
        expect(merchant).toBeDefined();
        expect(categorizer.categorize({ description: merchant.name, amount: 10 }).source).toBe('rule');
      }
    } finally {
      db.close();
    }
  });

  it('is deterministic for the same day', () => {
    const first = fixture(NOON);
    const second = fixture(NOON);
    try {
      for (const table of ['simplefin_connections', 'simplefin_links', 'category_rules', 'merchants', 'app_config'] as const) {
        expect(first.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).toEqual(second.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
      }
    } finally {
      first.close();
      second.close();
    }
  });
});
