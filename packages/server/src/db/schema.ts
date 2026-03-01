import { sqliteTable, text, integer, real, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';

// === Users ===
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  display_name: text('display_name').notNull(),
  role: text('role').notNull().default('member'),
  is_active: integer('is_active').notNull().default(1),
  twofa_enabled: integer('twofa_enabled').notNull().default(0),
  twofa_secret: text('twofa_secret'),
  twofa_backup_codes: text('twofa_backup_codes'),
  twofa_enabled_at: text('twofa_enabled_at'),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === User Permissions ===
export const userPermissions = sqliteTable('user_permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  permission: text('permission').notNull(),
  granted: integer('granted').notNull().default(0),
}, (table) => [
  uniqueIndex('user_permissions_user_perm_idx').on(table.user_id, table.permission),
]);

// === App Config ===
export const appConfig = sqliteTable('app_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
});

// === Dev Storage (QA checklists, dev tool state) ===
export const devStorage = sqliteTable('dev_storage', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_at: text('updated_at').notNull(),
});

// === Accounts ===
export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  last_four: text('last_four'),
  type: text('type').notNull(), // checking, savings, credit, investment, retirement, venmo, cash
  classification: text('classification').notNull(), // liquid, investment, liability
  owner: text('owner').notNull(), // legacy — kept for backward compat; use account_owners instead
  is_active: integer('is_active').default(1),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === Account Owners (junction table) ===
export const accountOwners = sqliteTable('account_owners', {
  account_id: integer('account_id').notNull().references(() => accounts.id),
  user_id: integer('user_id').notNull().references(() => users.id),
}, (table) => [
  primaryKey({ columns: [table.account_id, table.user_id] }),
]);

// === Categories ===
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  group_name: text('group_name').notNull(),
  sub_name: text('sub_name').notNull(),
  display_name: text('display_name').notNull(),
  type: text('type').notNull(), // income, expense
  is_deductible: integer('is_deductible').default(0),
  sort_order: integer('sort_order').default(0),
});

// === Transactions ===
export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account_id: integer('account_id').notNull().references(() => accounts.id),
  date: text('date').notNull(),
  description: text('description').notNull(),
  note: text('note'),
  category_id: integer('category_id').references(() => categories.id),
  amount: real('amount').notNull(),
  simplefin_transaction_id: text('simplefin_transaction_id').unique(),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === Transaction Splits ===
export const transactionSplits = sqliteTable('transaction_splits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transaction_id: integer('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  category_id: integer('category_id').notNull().references(() => categories.id),
  amount: real('amount').notNull(),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === Budgets ===
export const budgets = sqliteTable('budgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category_id: integer('category_id').notNull().references(() => categories.id),
  month: text('month').notNull(),
  amount: real('amount').notNull(),
}, (table) => [
  uniqueIndex('budgets_category_month_idx').on(table.category_id, table.month),
]);

// === Balance Snapshots ===
export const balanceSnapshots = sqliteTable('balance_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account_id: integer('account_id').notNull().references(() => accounts.id),
  date: text('date').notNull(),
  balance: real('balance').notNull(),
  note: text('note'),
});

// === SimpleFIN Connections ===
export const simplefinConnections = sqliteTable('simplefin_connections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id),
  access_url: text('access_url').notNull(),
  label: text('label').notNull(),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
  updated_at: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// === SimpleFIN Account Links ===
export const simplefinLinks = sqliteTable('simplefin_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  simplefin_connection_id: integer('simplefin_connection_id').notNull().references(() => simplefinConnections.id),
  simplefin_account_id: text('simplefin_account_id').notNull().unique(),
  account_id: integer('account_id').notNull().references(() => accounts.id),
  simplefin_account_name: text('simplefin_account_name').notNull(),
  simplefin_org_name: text('simplefin_org_name'),
  last_synced_at: text('last_synced_at'),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === SimpleFIN Holdings ===
export const simplefinHoldings = sqliteTable('simplefin_holdings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  simplefin_link_id: integer('simplefin_link_id').notNull().references(() => simplefinLinks.id),
  symbol: text('symbol').notNull(),
  description: text('description').notNull(),
  shares: real('shares').notNull(),
  cost_basis: real('cost_basis').notNull(),
  market_value: real('market_value').notNull(),
  updated_at: text('updated_at').notNull(),
});

// === Assets ===
export const assets = sqliteTable('assets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  purchase_date: text('purchase_date').notNull(),
  cost: real('cost').notNull(),
  lifespan_years: real('lifespan_years').notNull(),
  salvage_value: real('salvage_value').notNull(),
  depreciation_method: text('depreciation_method').notNull().default('straight_line'),
  declining_rate: real('declining_rate'),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});
