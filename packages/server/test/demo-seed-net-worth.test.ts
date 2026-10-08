import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
// The production merchant helper imports the default database unless this is mocked.
vi.mock('../src/db/index.js', () => ({ sqlite: undefined }));
import { createHelpers } from '../src/db/demo-seed/helpers.js';
import { seedInvestments } from '../src/db/demo-seed/investments.js';
import { CARD_IN_CREDIT, seedNetWorth } from '../src/db/demo-seed/net-worth.js';

type Row = Record<string, number | string>;

function fixture(now: Date) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, display_name TEXT NOT NULL);
    CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT, type TEXT NOT NULL, owner TEXT NOT NULL);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), date TEXT NOT NULL, amount REAL NOT NULL);
    CREATE TABLE balance_snapshots (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), date TEXT NOT NULL, balance REAL NOT NULL, note TEXT);
    CREATE TABLE assets (id INTEGER PRIMARY KEY, name TEXT, purchase_date TEXT, cost REAL, lifespan_years REAL, salvage_value REAL, depreciation_method TEXT, declining_rate REAL);
    CREATE TABLE simplefin_connections (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), access_url TEXT, label TEXT);
    CREATE TABLE simplefin_links (id INTEGER PRIMARY KEY, simplefin_connection_id INTEGER REFERENCES simplefin_connections(id), simplefin_account_id TEXT UNIQUE, account_id INTEGER REFERENCES accounts(id), simplefin_account_name TEXT, simplefin_org_name TEXT, last_synced_at TEXT);
    CREATE TABLE simplefin_holdings (id INTEGER PRIMARY KEY, simplefin_link_id INTEGER REFERENCES simplefin_links(id), symbol TEXT, description TEXT, shares REAL, cost_basis REAL, market_value REAL, updated_at TEXT);
    CREATE TABLE holdings_history (id INTEGER PRIMARY KEY, simplefin_link_id INTEGER REFERENCES simplefin_links(id), symbol TEXT, date TEXT, shares REAL, cost_basis REAL, market_value REAL);
    CREATE TABLE benchmark_prices (id INTEGER PRIMARY KEY, symbol TEXT, date TEXT, adj_close REAL);
    CREATE TABLE symbol_meta (symbol TEXT PRIMARY KEY, asset_class TEXT);
  `);
  db.prepare('INSERT INTO users (id, display_name) VALUES (1, ?), (2, ?)').run('John', 'Jane');
  const accountTypes = ['checking', 'credit', 'checking', 'savings', 'credit', 'savings', 'retirement', 'retirement', 'savings', 'checking', 'investment', 'investment', 'retirement', 'retirement', 'credit', 'credit', 'savings', 'savings', 'checking', 'checking'];
  const insertAccount = db.prepare('INSERT INTO accounts (id, name, type, owner) VALUES (?, ?, ?, ?)');
  for (const [index, type] of accountTypes.entries()) insertAccount.run(index + 1, index === 15 ? CARD_IN_CREDIT : `Account ${index + 1}`, type, index % 2 ? 'Jane' : 'John');
  const helpers = createHelpers(db, now);
  const insertTransaction = db.prepare('INSERT INTO transactions (account_id, date, amount) VALUES (?, ?, ?)');
  insertTransaction.run(1, helpers.rel('2025-07-03'), -500);
  insertTransaction.run(1, helpers.rel('2025-08-12'), 125);
  insertTransaction.run(2, helpers.rel('2025-07-04'), 240);
  insertTransaction.run(2, helpers.rel('2025-08-05'), -180);
  insertTransaction.run(4, helpers.rel('2025-09-14'), -75);
  const investments = seedInvestments(helpers);
  seedNetWorth(helpers, investments.balances, investments.days);
  return { db, days: investments.days };
}

describe('demo net-worth sample', () => {
  it('derives liquid and card snapshots from transactions and investment snapshots from holdings', () => {
    const { db, days } = fixture(new Date(2026, 9, 31));
    try {
      expect(days.length).toBeGreaterThan(240);
      const accounts = db.prepare('SELECT id, type FROM accounts').all() as Array<{ id: number; type: string }>;
      for (const account of accounts) {
        const snapshots = db.prepare('SELECT date, balance FROM balance_snapshots WHERE account_id = ? ORDER BY date').all(account.id) as Array<{ date: string; balance: number }>;
        const expectedStart = account.id >= 15 ? 60 : account.id >= 9 ? 30 : 0;
        expect(snapshots).toHaveLength(days.length - expectedStart);
        expect(snapshots[0].date).toBe(days[expectedStart]);
        for (let index = 1; index < snapshots.length; index++) {
          const change = Math.round((snapshots[index].balance - snapshots[index - 1].balance) * 100) / 100;
          if (['checking', 'savings', 'credit'].includes(account.type)) {
            const amount = db.prepare('SELECT COALESCE(SUM(amount), 0) AS amount FROM transactions WHERE account_id = ? AND date > ? AND date <= ?')
              .get(account.id, snapshots[index - 1].date, snapshots[index].date) as { amount: number };
            expect(change + amount.amount).toBeCloseTo(0, 2);
          } else {
            const value = db.prepare(`SELECT COALESCE(SUM(h.market_value), 0) AS value FROM holdings_history h
              JOIN simplefin_links l ON l.id = h.simplefin_link_id WHERE l.account_id = ? AND h.date = ?`)
              .get(account.id, snapshots[index].date) as { value: number };
            expect(snapshots[index].balance).toBe(Math.round(value.value * 100) / 100);
          }
        }
      }
      expect(db.prepare('SELECT COUNT(*) AS count FROM simplefin_holdings').get()).toEqual({ count: 60 });
      expect(db.prepare("SELECT value FROM app_config WHERE key = 'daily_sync.last_success'").get()).toEqual({ value: '2026-10-31' });
    } finally { db.close(); }
  });

  it('gives one card a positive (credit) latest balance and leaves other cards owed', () => {
    const { db } = fixture(new Date(2026, 9, 31));
    try {
      const latest = db.prepare(`
        SELECT a.name, s.balance FROM accounts a JOIN balance_snapshots s ON s.account_id = a.id
        WHERE a.type = 'credit' AND s.date = (SELECT MAX(date) FROM balance_snapshots WHERE account_id = a.id)
        ORDER BY a.id
      `).all() as Array<{ name: string; balance: number }>;
      expect(latest.filter(card => card.balance > 0)).toEqual([{ name: CARD_IN_CREDIT, balance: 212.4 }]);
      expect(latest.filter(card => card.balance < 0)).toHaveLength(3);
    } finally { db.close(); }
  });

  it('covers every held symbol and core benchmark every day, with values repeatable apart from the date shift', () => {
    const first = fixture(new Date(2026, 9, 31));
    const second = fixture(new Date(2027, 9, 31));
    try {
      const symbols = first.db.prepare(`SELECT symbol FROM simplefin_holdings GROUP BY symbol
        UNION SELECT 'SPY' UNION SELECT 'VTI' UNION SELECT 'BND' ORDER BY symbol`).all() as Array<{ symbol: string }>;
      for (const { symbol } of symbols) {
        expect(first.db.prepare('SELECT COUNT(*) AS count FROM benchmark_prices WHERE symbol = ?').get(symbol)).toEqual({ count: first.days.length });
      }
      const prices = (db: Database.Database) => db.prepare('SELECT symbol, adj_close FROM benchmark_prices ORDER BY symbol, date').all() as Row[];
      expect(prices(second.db)).toEqual(prices(first.db));
      expect(first.db.prepare('SELECT COUNT(*) AS count FROM assets').get()).toEqual({ count: 5 });
    } finally {
      first.db.close();
      second.db.close();
    }
  });
});
