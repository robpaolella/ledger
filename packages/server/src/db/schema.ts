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
  institution: text('institution'), // legacy free-text bank/brokerage name (kept as backfill source for institution_id)
  institution_id: integer('institution_id').references(() => financialInstitutions.id), // first-class institution (drives the logo)
  owner: text('owner').notNull(), // legacy — kept for backward compat; use account_owners instead
  avatar_url: text('avatar_url'), // per-account image override (null = fall back to institution logo, then colored initial)
  is_active: integer('is_active').default(1),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === Financial Institutions ===
// Reusable bank/brokerage/card/fintech identity. Seeded with ~200 popular US
// institutions (is_system=1); users can add their own (is_system=0). logo_url
// points at a cached file under /uploads (fetched once from logo.dev by domain,
// or uploaded); null = render a brand-colored monogram.
export const financialInstitutions = sqliteTable('financial_institutions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  domain: text('domain'), // primary web host for logo.dev lookup + dedupe, e.g. 'chase.com'
  logo_url: text('logo_url'), // '/uploads/institution-<id>.webp' or null (→ monogram)
  color: text('color'), // brand hex for the monogram fallback
  is_system: integer('is_system').notNull().default(0), // 1 = seeded, 0 = user-added
  sort_order: integer('sort_order').default(0),
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
  type: text('type').notNull(), // income, expense, savings
  is_deductible: integer('is_deductible').default(0),
  sort_order: integer('sort_order').default(0),
  // How recurring items on this category fold into its monthly budget:
  // 'set' = recurring is the floor (max(manual, recurring)); 'add' = manual + recurring.
  recurring_budget_mode: text('recurring_budget_mode').default('set'),
  // Per-leaf emoji (null = fall back to lib/categoryMeta group map).
  emoji: text('emoji'),
  // When 1, the category is skipped in budget planning + report rollups.
  exclude_from_budget: integer('exclude_from_budget').default(0),
  // First-class group identity. group_name is kept synced as a denormalized
  // mirror so budget/report/transaction readers need no changes.
  group_id: integer('group_id').references(() => categoryGroups.id),
});

// First-class category group. A group belongs to exactly one section (type).
// Categories link via group_id; categories.group_name mirrors the group name.
export const categoryGroups = sqliteTable('category_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // income, expense, savings
  name: text('name').notNull(),
  // Owner-chosen swatch token (e.g. 'c-rose'); null = fall back to the derived hue.
  color: text('color'),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === Merchants ===
// First-class vendor/payee. transactions.description keeps the raw statement
// text; transactions.merchant_id links to the clean, dedup'd display name.
export const merchants = sqliteTable('merchants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  logo_url: text('logo_url'),
  // 1 = the user said "never ask again" to the always-categorize prompt here.
  suppress_rule_suggest: integer('suppress_rule_suggest').notNull().default(0),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === Vendor Logos ===
// Catalog of popular vendors → cached logo. Seeded from db/data/vendors.ts and
// hydrated once from logo.dev. A merchant whose canonical name matches (case-
// insensitive) auto-adopts the cached logo (merchants.logo_url), so users never
// upload logos for common brands. Kept separate from `merchants` so the seed
// list never clutters the user's actual merchant list.
export const vendorLogos = sqliteTable('vendor_logos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(), // canonical merchant name (see merchantAliases.ts)
  domain: text('domain'),
  logo_url: text('logo_url'), // '/uploads/vendor-<id>.webp' or null
  color: text('color'),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === Transactions ===
export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account_id: integer('account_id').notNull().references(() => accounts.id),
  date: text('date').notNull(),
  description: text('description').notNull(),
  // Verbatim bank-provided statement text (SimpleFIN rawDescription / CSV raw
  // row). `description` stays the payee-preferred display+matching string.
  bank_description: text('bank_description'),
  note: text('note'),
  category_id: integer('category_id').references(() => categories.id),
  merchant_id: integer('merchant_id').references(() => merchants.id),
  amount: real('amount').notNull(),
  simplefin_transaction_id: text('simplefin_transaction_id').unique(),
  // Auto-categorization: confidence of the assigned category (0–1, null = manual),
  // and a flag for low-confidence rows queued for user review.
  categorize_confidence: real('categorize_confidence'),
  needs_review: integer('needs_review').default(0),
  // Origin of the auto-assigned category: rule | merchant-history | text-history
  // | heuristic | llm (null = manual/unknown).
  categorize_source: text('categorize_source'),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === Category Feedback ===
// Durable log of user categorization decisions (corrections/confirmations/split
// legs). Snapshots txn fields so rows survive transaction deletion; feeds the
// LLM categorizer's few-shot context.
export const categoryFeedback = sqliteTable('category_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transaction_id: integer('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
  description: text('description').notNull(),
  bank_description: text('bank_description'),
  merchant_id: integer('merchant_id').references(() => merchants.id),
  account_id: integer('account_id').references(() => accounts.id),
  amount: real('amount').notNull(),
  txn_date: text('txn_date'),
  prior_category_id: integer('prior_category_id').references(() => categories.id),
  prior_source: text('prior_source'),
  prior_confidence: real('prior_confidence'),
  corrected_category_id: integer('corrected_category_id').notNull().references(() => categories.id),
  kind: text('kind').notNull().default('correction'), // correction | confirmation | split_leg
  user_id: integer('user_id').references(() => users.id),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === Amazon Order Enrichment ===
// Populated by the host-side scraper sidecar (scripts/amazon) via
// services/amazonIngest; charges are the Amazon Transactions-page rows
// (per-shipment amounts) used to match ledger transactions.
export const amazonOrders = sqliteTable('amazon_orders', {
  order_number: text('order_number').primaryKey(),
  order_date: text('order_date').notNull(),
  total: real('total'),
  subtotal: real('subtotal'),
  tax: real('tax'),
  raw_json: text('raw_json').notNull(),
  scraped_at: text('scraped_at').notNull(),
});

export const amazonOrderItems = sqliteTable('amazon_order_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  order_number: text('order_number').notNull().references(() => amazonOrders.order_number, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  unit_price: real('unit_price'),
  quantity: integer('quantity').default(1),
  asin: text('asin'),
  seller: text('seller'),
});

export const amazonCharges = sqliteTable('amazon_charges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  charge_date: text('charge_date').notNull(),
  amount: real('amount').notNull(),
  order_number: text('order_number').references(() => amazonOrders.order_number),
  payment_method: text('payment_method'),
  is_refund: integer('is_refund').default(0),
});

export const amazonMatches = sqliteTable('amazon_matches', {
  transaction_id: integer('transaction_id').primaryKey().references(() => transactions.id, { onDelete: 'cascade' }),
  order_number: text('order_number').notNull().references(() => amazonOrders.order_number),
  charge_id: integer('charge_id').references(() => amazonCharges.id),
  amount: real('amount').notNull(),
  matched_by: text('matched_by').notNull().default('auto'), // auto | manual
  confidence: real('confidence'),
  enriched_at: text('enriched_at'),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === Transaction Splits ===
export const transactionSplits = sqliteTable('transaction_splits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transaction_id: integer('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  category_id: integer('category_id').notNull().references(() => categories.id),
  amount: real('amount').notNull(),
  // Per-split (full-Monarch model): each split leg can carry its OWN merchant
  // and note. NULL merchant_id = inherit the parent transaction's merchant.
  merchant_id: integer('merchant_id').references(() => merchants.id),
  note: text('note'),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === Budgets ===
export const budgets = sqliteTable('budgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category_id: integer('category_id').notNull().references(() => categories.id),
  month: text('month').notNull(),
  amount: real('amount').notNull(),
  // Per-month override: intentionally budget BELOW the recurring floor this month
  // (e.g. a month with no paycheck). When 1, the recurring floor is not applied.
  override: integer('override').notNull().default(0),
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
  // Daily auto-pull status per account: 'ok' | 'error' (null = never attempted).
  last_sync_status: text('last_sync_status'),
  last_sync_error: text('last_sync_error'),
  last_sync_attempt_at: text('last_sync_attempt_at'),
  // Daily scheduler imports transactions for this link (balances always sync).
  auto_import: integer('auto_import').notNull().default(1),
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

// === Budget Templates ===
export const budgetTemplates = sqliteTable('budget_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category_id: integer('category_id').notNull().references(() => categories.id),
  amount: real('amount').notNull(),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
  updated_at: text('updated_at').default('CURRENT_TIMESTAMP'),
}, (table) => [
  uniqueIndex('budget_templates_category_idx').on(table.category_id),
]);

// === Budget Recurring ===
export const budgetRecurring = sqliteTable('budget_recurring', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  category_id: integer('category_id').notNull().references(() => categories.id),
  amount: real('amount'),
  months: text('months').notNull(), // JSON array of month numbers, e.g. '[1,7]'
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
  updated_at: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// === Dismissed Transfers ===
export const dismissedTransfers = sqliteTable('dismissed_transfers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account_id: integer('account_id').notNull().references(() => accounts.id),
  signature: text('signature').notNull(),
  date: text('date').notNull(),
  amount: real('amount').notNull(),
  description: text('description').notNull(),
  dismissed_at: text('dismissed_at').default('CURRENT_TIMESTAMP'),
}, (table) => [
  uniqueIndex('dismissed_transfers_acct_sig_idx').on(table.account_id, table.signature),
]);

// === Notifications (per-user, persistent) ===
// General-purpose in-app notification center. First driver: daily-sync failures.
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),        // sync_failure | needs_review | ...
  severity: text('severity').notNull().default('info'), // info | success | warning | error
  title: text('title').notNull(),
  body: text('body'),
  action_label: text('action_label'),  // e.g. 'Retry'
  action_target: text('action_target'),// e.g. '/settings?tab=banksync' or an account id
  dedupe_key: text('dedupe_key'),       // collapse repeats (e.g. 'sync_failure:acct:12')
  is_read: integer('is_read').notNull().default(0),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
}, (table) => [
  uniqueIndex('notifications_user_dedupe_idx').on(table.user_id, table.dedupe_key),
]);

// === Category Rules (explicit merchant/description → category, user-managed) ===
// Highest-priority layer of auto-categorization; overrides learned + heuristic.
export const categoryRules = sqliteTable('category_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  match_type: text('match_type').notNull().default('merchant'), // merchant | contains | regex
  pattern: text('pattern').notNull(),                            // merchant_id (as text) or text pattern
  category_id: integer('category_id').notNull().references(() => categories.id),
  priority: integer('priority').notNull().default(0),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
});

// === Transaction Reviews (assignable "needs review" task, 1:1 with a transaction) ===
// transactions.needs_review is the denormalized cache; the open/resolved status +
// assignee/note/history live here. Kept in sync by services/reviews.ts.
export const transactionReviews = sqliteTable('transaction_reviews', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transaction_id: integer('transaction_id').notNull().unique().references(() => transactions.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('open'),          // open | resolved
  reason: text('reason').notNull(),                           // auto_uncategorized | auto_low_confidence | manual
  assignee_id: integer('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  note: text('note'),
  flagged_by: integer('flagged_by').references(() => users.id, { onDelete: 'set null' }), // null = auto-flagged
  resolved_by: integer('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
  resolved_at: text('resolved_at'),
});

// === Pay Cycles (dynamic take-home income schedules) ===
// Feeds the budget import wizard's "Expected Income" step. amount is the
// per-paycheck take-home, stored POSITIVE (income budget rows are positive,
// unlike income transactions which are stored negative).
export const payCycles = sqliteTable('pay_cycles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  category_id: integer('category_id').notNull().references(() => categories.id), // target income category
  user_id: integer('user_id').references(() => users.id), // nullable — owner/attribution
  frequency: text('frequency').notNull(), // weekly | biweekly | semi_monthly | monthly
  amount: real('amount').notNull(), // per-paycheck take-home, positive
  anchor_date: text('anchor_date'), // 'YYYY-MM-DD' phase reference (weekly/biweekly)
  day_of_month_1: integer('day_of_month_1'), // semi_monthly first day (0 = last day of month)
  day_of_month_2: integer('day_of_month_2'), // semi_monthly second day (0 = last day of month)
  day_of_month: integer('day_of_month'), // monthly day (0 = last day of month)
  effective_start: text('effective_start'), // 'YYYY-MM-DD' inclusive lower bound, nullable
  effective_end: text('effective_end'), // 'YYYY-MM-DD' inclusive upper bound, nullable
  is_active: integer('is_active').notNull().default(1),
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
  updated_at: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// === Recurring Items ===
// Unified recurring income + expense (+ savings) — the superset of pay_cycles +
// budget_recurring. The engine expands each item into dated occurrences per month
// and they overlay the budget live (see routes/recurring.ts + Budget integration).
export const recurringItems = sqliteTable('recurring_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // 'income' | 'expense' (savings uses expense/outflow sign)
  label: text('label').notNull(),
  merchant_id: integer('merchant_id').references(() => merchants.id), // nullable
  category_id: integer('category_id').notNull().references(() => categories.id),
  account_id: integer('account_id').references(() => accounts.id), // nullable
  amount: real('amount'), // per-occurrence positive magnitude, nullable (unset)
  freq_kind: text('freq_kind').notNull(), // monthly|semi_monthly|biweekly|weekly|every_n_months|custom_months
  day: integer('day'), // monthly/every-N/custom day-of-month (0 = last day)
  days_json: text('days_json'), // semi_monthly two days, e.g. '[1,15]'
  interval: integer('interval'), // every_n_months
  anchor_date: text('anchor_date'), // 'YYYY-MM-DD' phase ref (weekly/biweekly/every-N)
  months_json: text('months_json'), // custom_months 1-based, e.g. '[3,11]'
  start_date: text('start_date'), // 'YYYY-MM-DD'
  status: text('status').notNull().default('active'), // 'active' | 'paused'
  user_id: integer('user_id').references(() => users.id), // nullable owner attribution
  effective_start: text('effective_start'), // nullable inclusive lower bound
  effective_end: text('effective_end'), // nullable inclusive upper bound
  created_at: text('created_at').default('CURRENT_TIMESTAMP'),
  updated_at: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// === Benchmark Prices ===
// Daily split/dividend-adjusted closes from Tiingo — core benchmarks
// (SPY/VTI/BND) plus every held symbol. Powers the Investments performance
// chart + per-holding range-% chips. Pulled by the daily scheduler.
export const benchmarkPrices = sqliteTable('benchmark_prices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull(),
  date: text('date').notNull(),
  adj_close: real('adj_close').notNull(),
}, (table) => [
  uniqueIndex('benchmark_prices_symbol_date_idx').on(table.symbol, table.date),
]);

// === Holdings History ===
// Per-(link, symbol, date) snapshots captured at each SimpleFIN commit.
// simplefin_holdings only keeps the latest snapshot (delete + reinsert), so
// day-over-day change (dashboard movers, portfolio Today %) lives here.
export const holdingsHistory = sqliteTable('holdings_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  simplefin_link_id: integer('simplefin_link_id').notNull().references(() => simplefinLinks.id),
  symbol: text('symbol').notNull(),
  date: text('date').notNull(),
  shares: real('shares').notNull(),
  cost_basis: real('cost_basis').notNull(),
  market_value: real('market_value').notNull(),
}, (table) => [
  uniqueIndex('holdings_history_link_symbol_date_idx').on(table.simplefin_link_id, table.symbol, table.date),
]);

// === Symbol Meta ===
// Per-symbol asset class for the Investments holdings-table grouping
// (null → 'Uncategorized'). User-editable via PATCH /api/investments/symbols.
export const symbolMeta = sqliteTable('symbol_meta', {
  symbol: text('symbol').primaryKey(),
  asset_class: text('asset_class'),
});

// === Budget Alerts ===
// Crossing-state ledger for budget-exceeded notifications: one row per
// (category, month) = "already alerted" — later overage growth updates the
// notification body without re-pinging or resurrecting a cleared one.
export const budgetAlerts = sqliteTable('budget_alerts', {
  category_id: integer('category_id').notNull().references(() => categories.id),
  month: text('month').notNull(),
  first_exceeded_at: text('first_exceeded_at').default('CURRENT_TIMESTAMP'),
}, (table) => [
  uniqueIndex('budget_alerts_category_month_idx').on(table.category_id, table.month),
]);
