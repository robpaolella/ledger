import path from 'node:path';
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

// Every table and column in a database built from tag v1.0.2 (see fixtures/v1.0.2/README.md).
// An exact match means nothing added after that tag (merchants, recurring_items, notifications,
// reviews, ...) is present, so the release upgrade test starts from the true old shape.
const V102_SCHEMA: Record<string, string> = {
  account_owners: 'account_id user_id',
  accounts: 'id name last_four type classification owner is_active created_at',
  app_config: 'id key value',
  assets: 'id name purchase_date cost lifespan_years salvage_value depreciation_method declining_rate created_at',
  balance_snapshots: 'id account_id date balance note',
  budget_recurring: 'id label category_id amount months created_at updated_at',
  budget_templates: 'id category_id amount created_at updated_at',
  budgets: 'id category_id month amount',
  categories: 'id group_name sub_name display_name type is_deductible sort_order',
  dev_storage: 'key value updated_at',
  dismissed_transfers: 'id account_id signature date amount description dismissed_at',
  simplefin_connections: 'id user_id access_url label created_at updated_at',
  simplefin_holdings: 'id simplefin_link_id symbol description shares cost_basis market_value updated_at',
  simplefin_links: 'id simplefin_connection_id simplefin_account_id account_id simplefin_account_name simplefin_org_name last_synced_at created_at',
  transaction_splits: 'id transaction_id category_id amount created_at',
  transactions: 'id account_id date description note category_id amount simplefin_transaction_id created_at',
  user_permissions: 'id user_id permission granted',
  users: 'id username password_hash display_name role is_active twofa_enabled twofa_secret twofa_backup_codes twofa_enabled_at created_at',
};

function openFixture() {
  return new Database(path.join(__dirname, 'fixtures', 'v1.0.2', 'ledger.db'), { readonly: true, fileMustExist: true });
}

describe('v1.0.2-era database fixture', () => {
  it('has exactly the tables and columns of tag v1.0.2', () => {
    const db = openFixture();
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
      const actual = Object.fromEntries(tables.map(({ name }) => [
        name, (db.pragma(`table_info(${name})`) as Array<{ name: string }>).map(column => column.name).join(' '),
      ]));
      expect(actual).toEqual(V102_SCHEMA);
      expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    } finally { db.close(); }
  });

  it('holds only the synthetic demo data', () => {
    const db = openFixture();
    try {
      expect(db.prepare('SELECT username FROM users ORDER BY id').all()).toEqual([{ username: 'john' }, { username: 'jane' }]);
      expect(db.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 91 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM simplefin_connections').get()).toEqual({ n: 0 });
    } finally { db.close(); }
  });
});
