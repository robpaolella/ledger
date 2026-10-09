/**
 * The full, ordered migration chain. Runs on every server boot and after the
 * base seed creates a fresh database, so a brand-new install ends up with the
 * same schema as a long-lived one (seed inserts go through the Drizzle schema,
 * which reflects every migration below).
 */
import type Database from 'better-sqlite3';
import { migrateAccountOwners } from './migrate-account-owners.js';
import { migrateSimplefin } from './migrate-simplefin.js';
import { migrateAssetsDepreciation } from './migrate-assets-depreciation.js';
import { migrateRolesPermissions } from './migrate-roles-permissions.js';
import { migrateDevStorage } from './migrate-dev-storage.js';
import { migrate2FA } from './migrate-2fa.js';
import { migrateCategorySortOrder } from './migrate-category-sort-order.js';
import { migrateTransactionSplits } from './migrate-transaction-splits.js';
import { migrateBudgetTemplatesRecurring } from './migrate-budget-templates-recurring.js';
import { migrateDismissedTransfers } from './migrate-dismissed-transfers.js';
import { migratePayCycles } from './migrate-pay-cycles.js';
import { migrateMerchants } from './migrate-merchants.js';
import { migrateMerchantAliases } from './migrate-merchant-aliases.js';
import { migrateMerchantRulePrefs } from './migrate-merchant-rule-prefs.js';
import { migrateTransferLinks } from './migrate-transfer-links.js';
import { migrateSavingsRetire } from './migrate-savings-retire.js';
import { linkTransfers } from '../services/transferLinker.js';
import { migrateTransferCategoryDedupe } from './migrate-transfer-category-dedupe.js';
import { migrateAccountInstitution } from './migrate-account-institution.js';
import { migrateTxnCategorize } from './migrate-txn-categorize.js';
import { migrateSyncStatus } from './migrate-sync-status.js';
import { migrateNotifications } from './migrate-notifications.js';
import { migrateTransfersCategory, enforceTransferBudgetExclusion } from './migrate-transfers-category.js';
import { migrateSplitMerchant } from './migrate-split-merchant.js';
import { migrateRecurringItems } from './migrate-recurring-items.js';
import { migrateBudgetOverride } from './migrate-budget-override.js';
import { migrateTransactionReviews } from './migrate-transaction-reviews.js';
import { migrateSettingsColumns } from './migrate-settings-columns.js';
import { migrateCategoryGroups } from './migrate-category-groups.js';
import { migrateFinancialInstitutions } from './migrate-financial-institutions.js';
import { migrateVendorLogos } from './migrate-vendor-logos.js';
import { migrateBankDescription } from './migrate-bank-description.js';
import { migrateInvestments } from './migrate-investments.js';
import { migrateNotificationCenter } from './migrate-notification-center.js';
import { migrateAutoImport } from './migrate-auto-import.js';
import { migrateCategoryFeedback } from './migrate-category-feedback.js';
import { migrateAmazon } from './migrate-amazon.js';
import { migrateDailySync } from './migrate-daily-sync.js';

export function runMigrations(sqlite: Database.Database): void {
  migrateAccountOwners(sqlite);
  migrateSimplefin(sqlite);
  migrateAssetsDepreciation(sqlite);
  migrateRolesPermissions(sqlite);
  migrateDevStorage(sqlite);
  migrate2FA(sqlite);
  migrateCategorySortOrder(sqlite);
  migrateTransactionSplits(sqlite);
  migrateBudgetTemplatesRecurring(sqlite);
  migrateDismissedTransfers(sqlite);
  migratePayCycles(sqlite);
  migrateMerchants(sqlite); // after splits — splits rebuilds the transactions table
  migrateSplitMerchant(sqlite); // after splits (table) + merchants (FK target)
  migrateAccountInstitution(sqlite);
  migrateTxnCategorize(sqlite);
  migrateSyncStatus(sqlite);
  migrateNotifications(sqlite);
  migrateSettingsColumns(sqlite);    // additive columns (category emoji/exclude, account avatar, merchant logo); after merchants
  migrateTransfersCategory(sqlite);  // after settings columns — its seed row sets emoji/exclude_from_budget
  migrateRecurringItems(sqlite); // after categories/merchants/accounts/users (FK targets)
  migrateBudgetOverride(sqlite);
  migrateTransactionReviews(sqlite); // last table-creating migration — FK target transactions must be stable
  migrateCategoryGroups(sqlite);     // first-class category_groups entity + backfill
  migrateFinancialInstitutions(sqlite); // financial_institutions table + accounts.institution_id + backfill
  migrateVendorLogos(sqlite);           // vendor_logos catalog + backfill merchant logos
  migrateBankDescription(sqlite);       // transactions.bank_description (verbatim statement text)
  migrateInvestments(sqlite);           // benchmark_prices + holdings_history (+seed) + symbol_meta
  migrateNotificationCenter(sqlite);    // review notifications → per-user aggregate + budget_alerts
  migrateAutoImport(sqlite);            // simplefin_links.auto_import (daily txn auto-import toggle)
  migrateCategoryFeedback(sqlite);      // category_feedback log + transactions.categorize_source
  migrateAmazon(sqlite);                // amazon_orders/items/charges/matches (order enrichment)
  migrateMerchantAliases(sqlite);       // merchant_aliases — merges keep routing future imports
  migrateMerchantRulePrefs(sqlite);     // merchants.suppress_rule_suggest ("never ask again")
  migrateTransferLinks(sqlite);         // transfer_links — the two legs of one money movement
  migrateDailySync(sqlite);             // simplefin_connections.sync_* (per-connection sync state)

  // Backfill/refresh transfer links on boot: cheap (bucketed by amount) and
  // self-healing, so history and anything imported outside a sync gets paired too.
  // Pairs the user has pulled apart are recorded as rejected and stay apart.
  try {
    const { linked } = linkTransfers(sqlite);
    if (linked > 0) console.log(`Linked ${linked} transfer pair(s).`);
  } catch (err) {
    console.error('Transfer linking failed:', err instanceof Error ? err.message : err);
  }
  migrateTransferCategoryDedupe(sqlite); // last — folds a duplicate Transfers > Transfer onto the canonical row
  enforceTransferBudgetExclusion(sqlite); // invariant: transfers are never budgeted
  migrateSavingsRetire(sqlite);         // fold the retired Savings section into Transfers
}
