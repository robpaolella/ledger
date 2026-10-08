import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
vi.mock('../src/db/index.js', () => ({ sqlite: undefined }));
import { seedPeopleAccounts } from '../src/db/demo-seed/people-accounts.js';
import { seedMerchants } from '../src/db/demo-seed/merchants.js';
import { createHelpers } from '../src/db/demo-seed/helpers.js';
import { createCategories } from '../src/db/demo-seed/categories.js';
import { seedTransactions } from '../src/db/demo-seed/transactions.js';
import { seedBudgetAlerts, seedBudgets, seedRecurring } from '../src/db/demo-seed/budgets-recurring.js';
import { INSTITUTIONS } from '../src/db/data/institutions.js';
import { VENDORS } from '../src/db/data/vendors.js';

function seededBudgetFixture(now = new Date(2026, 9, 31)) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username, password_hash, display_name, role, is_active DEFAULT 1);
    CREATE TABLE app_config (key PRIMARY KEY, value);
    CREATE TABLE financial_institutions (id INTEGER PRIMARY KEY, name UNIQUE, domain);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name, last_four, type, classification, owner, institution_id, institution, is_active DEFAULT 1);
    CREATE TABLE account_owners (account_id, user_id);
    CREATE TABLE merchants (id INTEGER PRIMARY KEY, name UNIQUE, logo_url);
    CREATE TABLE vendor_logos (name, logo_url);
    CREATE TABLE categories (id INTEGER PRIMARY KEY, group_name, sub_name, display_name, type, sort_order, exclude_from_budget DEFAULT 0);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id REFERENCES accounts(id), date, description, category_id REFERENCES categories(id), merchant_id REFERENCES merchants(id), amount, note);
    CREATE TABLE transaction_splits (id INTEGER PRIMARY KEY, transaction_id REFERENCES transactions(id), category_id REFERENCES categories(id), amount, merchant_id REFERENCES merchants(id), note);
    CREATE TABLE budgets (id INTEGER PRIMARY KEY, category_id REFERENCES categories(id), month, amount, override DEFAULT 0);
    CREATE TABLE recurring_items (id INTEGER PRIMARY KEY, type, label, merchant_id REFERENCES merchants(id), category_id REFERENCES categories(id), account_id REFERENCES accounts(id), amount, freq_kind, day, days_json, interval, anchor_date, start_date, status, user_id REFERENCES users(id));
    CREATE TABLE budget_alerts (category_id REFERENCES categories(id), month, first_exceeded_at);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY, user_id REFERENCES users(id), type, severity, title, body, action_label, action_target, dedupe_key, is_read DEFAULT 0, UNIQUE(user_id, dedupe_key));
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
    db.prepare('INSERT INTO categories (group_name, sub_name, display_name, type, sort_order) VALUES (?, ?, ?, ?, 0)')
      .run(group, sub, `${group}: ${sub}`, group === 'Income' ? 'income' : group === 'Transfers' ? 'transfer' : 'expense');
  }
  const people = seedPeopleAccounts(db);
  seedMerchants(db);
  const helpers = createHelpers(db, now);
  const categories = createCategories(helpers);
  seedTransactions(helpers, people, categories);
  const budgets = seedBudgets(helpers, categories);
  seedRecurring(helpers, people, categories);
  const alerts = seedBudgetAlerts(helpers, categories);
  return { db, helpers, categories, budgets, alerts };
}

describe('demo budgets, recurring items, and notifications', () => {
  it('covers the rolling nine-month window with matching recurring entries', () => {
    const { db, helpers, budgets } = seededBudgetFixture();
    try {
      expect(budgets).toBe(189); // 20 expense categories plus Take Home Pay, nine months.
      expect(db.prepare('SELECT COUNT(DISTINCT month) AS n FROM budgets').get()).toEqual({ n: 9 });
      expect(db.prepare('SELECT month FROM budgets GROUP BY month ORDER BY month').all()).toEqual(
        ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'].map(helpers.rel).map(month => ({ month })),
      );
      expect(db.prepare('SELECT label, amount, freq_kind, status, start_date FROM recurring_items ORDER BY id').all()).toEqual([
        { label: 'Paycheck — John', amount: 1750, freq_kind: 'semi_monthly', status: 'active', start_date: helpers.rel('2025-07-01') },
        { label: 'Paycheck — Jane', amount: 1500, freq_kind: 'semi_monthly', status: 'active', start_date: helpers.rel('2025-07-01') },
        { label: 'Rent', amount: 1400, freq_kind: 'monthly', status: 'active', start_date: helpers.rel('2025-07-01') },
        { label: 'Health plan premium', amount: 285, freq_kind: 'monthly', status: 'active', start_date: helpers.rel('2025-07-01') },
        { label: 'Monthly pledge', amount: 40, freq_kind: 'monthly', status: 'paused', start_date: helpers.rel('2025-07-01') },
        { label: 'Estimated state tax', amount: 640, freq_kind: 'every_n_months', status: 'active', start_date: helpers.rel('2025-07-01') },
      ]);
      expect(db.prepare(`
        SELECT b.month FROM budgets b JOIN categories c ON c.id = b.category_id
        WHERE c.sub_name = 'Take Home Pay' AND b.amount != 6500
      `).all()).toEqual([]);
      expect(db.prepare(`
        SELECT r.label FROM recurring_items r
        LEFT JOIN transactions t ON t.account_id = r.account_id AND t.category_id = r.category_id
          AND ABS(t.amount) = r.amount
        GROUP BY r.id HAVING COUNT(t.id) = 0
      `).all()).toEqual([]);
    } finally { db.close(); }
  });

  it('creates exactly the split-aware over-budget alerts and per-user notifications', () => {
    const { db, helpers, alerts } = seededBudgetFixture();
    try {
      const expected = db.prepare(`
        SELECT b.category_id, b.month
        FROM budgets b JOIN categories c ON c.id = b.category_id
        LEFT JOIN (
          SELECT category_id, substr(date, 1, 7) AS month, SUM(amount) AS total FROM (
            SELECT t.category_id, t.date, t.amount FROM transactions t WHERE t.category_id IS NOT NULL
            UNION ALL
            SELECT ts.category_id, t.date, ts.amount FROM transaction_splits ts JOIN transactions t ON t.id = ts.transaction_id WHERE t.category_id IS NULL
          ) GROUP BY category_id, substr(date, 1, 7)
        ) a ON a.category_id = b.category_id AND a.month = b.month
        WHERE c.type = 'expense' AND c.exclude_from_budget = 0
          AND COALESCE(a.total, 0) > CASE WHEN c.sub_name = 'Rent' THEN MAX(b.amount, 1400) ELSE b.amount END + 0.005
        ORDER BY b.month, b.category_id
      `).all();
      const actual = db.prepare('SELECT category_id, month FROM budget_alerts ORDER BY month, category_id').all();
      expect(actual).toEqual(expected);
      expect(alerts).toBe(actual.length);
      const users = (db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_active = 1').get() as { n: number }).n;
      expect(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'budget_exceeded'").get()).toEqual({ n: actual.length * users });
      expect(db.prepare(`
        SELECT n.id FROM notifications n JOIN budget_alerts a ON n.dedupe_key = 'budget_exceeded:' || a.category_id || ':' || a.month
        WHERE n.severity != 'warning' OR n.action_label != 'View budget' OR n.action_target != '/budget'
          OR n.title NOT LIKE 'Over budget: %' OR n.body NOT LIKE 'You''ve exceeded your % budget by $%.%'
      `).all()).toEqual([]);
      expect(db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE is_read = 1').get()).toMatchObject({ n: expect.any(Number) });
      expect((db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE is_read = 1').get() as { n: number }).n).toBeGreaterThan(0);
      expect((db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE is_read = 0').get() as { n: number }).n).toBeGreaterThan(0);
      expect(db.prepare(`
        SELECT month, COUNT(*) AS n FROM budget_alerts
        WHERE month IN (?, ?) GROUP BY month ORDER BY month
      `).all(helpers.rel('2026-01'), helpers.rel('2026-02'))).toEqual([
        { month: helpers.rel('2026-01'), n: 3 },
        { month: helpers.rel('2026-02'), n: 3 },
      ]);
    } finally { db.close(); }
  });

  it('does not change budgets, alerts, or notifications as the launch month advances', () => {
    const first = seededBudgetFixture(new Date(2026, 9, 7));
    const second = seededBudgetFixture(new Date(2026, 9, 28));
    try {
      // The due-soon bill's day follows today by design; everything else must not move.
      expect(first.db.prepare("SELECT day FROM recurring_items WHERE label = 'Health plan premium'").get()).toEqual({ day: 9 });
      expect(second.db.prepare("SELECT day FROM recurring_items WHERE label = 'Health plan premium'").get()).toEqual({ day: 30 });
      for (const db of [first.db, second.db]) db.prepare("UPDATE recurring_items SET day = 0 WHERE label = 'Health plan premium'").run();
      for (const table of ['budgets', 'recurring_items', 'budget_alerts', 'notifications'] as const) {
        expect(first.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
          .toEqual(second.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
      }
    } finally { first.db.close(); second.db.close(); }
  });

  it('changes only rolling dates when the launch month shifts', () => {
    const first = seededBudgetFixture(new Date(2026, 9, 31));
    const second = seededBudgetFixture(new Date(2027, 0, 31));
    try {
      expect(first.db.prepare('SELECT category_id, amount FROM budgets ORDER BY id').all())
        .toEqual(second.db.prepare('SELECT category_id, amount FROM budgets ORDER BY id').all());
      const recurring = 'SELECT label, amount, freq_kind, day, days_json, interval, status FROM recurring_items WHERE label != \'Health plan premium\' ORDER BY id';
      expect(first.db.prepare(recurring).all()).toEqual(second.db.prepare(recurring).all());
      expect(first.db.prepare('SELECT category_id FROM budget_alerts ORDER BY rowid').all())
        .toEqual(second.db.prepare('SELECT category_id FROM budget_alerts ORDER BY rowid').all());
      expect(first.db.prepare('SELECT user_id, type, severity, title, body, action_label, action_target, is_read FROM notifications ORDER BY id').all())
        .toEqual(second.db.prepare('SELECT user_id, type, severity, title, body, action_label, action_target, is_read FROM notifications ORDER BY id').all());
      expect(first.db.prepare('SELECT month FROM budget_alerts ORDER BY rowid').all())
        .not.toEqual(second.db.prepare('SELECT month FROM budget_alerts ORDER BY rowid').all());
    } finally { first.db.close(); second.db.close(); }
  });

  it('reaches the extra verification states: due-soon, paused, yearly, uncategorized, refund-only', () => {
    const now = new Date(2026, 9, 30); // Two days ahead crosses the month end.
    const { db, helpers } = seededBudgetFixture(now);
    try {
      const month = helpers.today.slice(0, 7);
      const previous = helpers.rel('2026-02');
      const due = db.prepare("SELECT day FROM recurring_items WHERE status = 'active' AND freq_kind = 'monthly' AND label = 'Health plan premium'").get() as { day: number };
      expect(due.day).toBe(1); // Nov 1 is two days after Oct 30.
      expect(db.prepare("SELECT label FROM recurring_items WHERE status = 'paused'").all()).toEqual([{ label: 'Monthly pledge' }]);
      expect(db.prepare("SELECT interval, anchor_date FROM recurring_items WHERE freq_kind = 'every_n_months'").all())
        .toEqual([{ interval: 12, anchor_date: helpers.rel('2025-09-15') }]);
      const uncategorized = (m: string) => (db.prepare(`
        SELECT COUNT(*) AS n FROM transactions t
        WHERE t.category_id IS NULL AND substr(t.date, 1, 7) = ?
          AND NOT EXISTS (SELECT 1 FROM transaction_splits s WHERE s.transaction_id = t.id)
      `).get(m) as { n: number }).n;
      expect(uncategorized(month)).toBeGreaterThanOrEqual(2);
      expect(uncategorized(previous)).toBeGreaterThanOrEqual(2);
      // Refund-only: a negative expense row, no positive spending, and no budget this month.
      const refundOnly = db.prepare(`
        SELECT c.id FROM categories c JOIN transactions t ON t.category_id = c.id
        WHERE c.type = 'expense' AND substr(t.date, 1, 7) = ?
        GROUP BY c.id HAVING MAX(t.amount) < 0
      `).all(month) as Array<{ id: number }>;
      expect(refundOnly).toHaveLength(1);
      expect(db.prepare('SELECT COUNT(*) AS n FROM budgets WHERE category_id = ? AND month = ?').get(refundOnly[0].id, month)).toEqual({ n: 0 });
    } finally { db.close(); }
  });

  it('seeds identical data on repeated runs', () => {
    const first = seededBudgetFixture(new Date(2026, 9, 15));
    const second = seededBudgetFixture(new Date(2026, 9, 15));
    try {
      for (const table of ['transactions', 'transaction_splits', 'budgets', 'recurring_items', 'budget_alerts', 'notifications'] as const) {
        expect(first.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
          .toEqual(second.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
      }
    } finally { first.db.close(); second.db.close(); }
  });
});
