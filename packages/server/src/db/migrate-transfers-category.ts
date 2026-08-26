import Database from 'better-sqlite3';

/**
 * Migration: seed the Transfers category section.
 *
 * Transfers are a fourth category `type` (alongside income/expense/savings) —
 * a distinct value so existing type-filtered rollups exclude them by default
 * (same safe-by-default pattern as savings). Detected inter-account transfers
 * are auto-labeled with this category so both legs stay visible but net to zero
 * in income/expense/savings & budget math.
 *
 * Idempotent — seeds only when no transfer category exists yet. NOTE that this
 * guard cannot see a hand-made `Transfers > Transfer` filed under an expense
 * group, which is how a duplicate pair arose once; migrateTransferCategoryDedupe
 * folds any such twin onto the canonical transfer-typed row after the fact.
 */
export function migrateTransfersCategory(sqlite: Database.Database): void {
  const tableExists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='categories'"
  ).get() as { cnt: number };
  if (tableExists.cnt === 0) return;

  const existing = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM categories WHERE type = 'transfer'"
  ).get() as { cnt: number };
  if (existing.cnt > 0) return;

  const maxSort = sqlite.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM categories').get() as { m: number };
  sqlite.prepare(
    'INSERT INTO categories (group_name, sub_name, display_name, type, is_deductible, sort_order) VALUES (?, ?, ?, ?, 0, ?)'
  ).run('Transfers', 'Transfer', 'Transfers: Transfer', 'transfer', maxSort.m + 1);
  console.log('Seeded Transfers category.');
}
