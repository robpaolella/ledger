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
    'INSERT INTO categories (group_name, sub_name, display_name, type, is_deductible, sort_order, emoji, exclude_from_budget) VALUES (?, ?, ?, ?, 0, ?, ?, 1)'
  ).run('Transfers', 'Transfer', 'Transfers: Transfer', 'transfer', maxSort.m + 1, '🔁');
  console.log('Seeded Transfers category.');
}

/**
 * Enforce the section invariant: a transfer category is NEVER budgeted. Unlike
 * `exclude_from_budget` on an income/expense/savings category — a user
 * preference — this one is permanent, so it is re-asserted on every boot rather
 * than set once. routes/categories.ts forces the same on create/update, and the
 * budget queries carry a `type <> 'transfer'` guard on top.
 *
 * Runs after migrateSettingsColumns, which adds the column.
 */
export function enforceTransferBudgetExclusion(sqlite: Database.Database): void {
  const tableExists = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='categories'"
  ).get() as { cnt: number };
  if (tableExists.cnt === 0) return;
  const cols = new Set(
    (sqlite.prepare("PRAGMA table_info('categories')").all() as { name: string }[]).map((c) => c.name),
  );
  if (!cols.has('exclude_from_budget')) return;
  const out = sqlite.prepare(
    "UPDATE categories SET exclude_from_budget = 1 WHERE type = 'transfer' AND COALESCE(exclude_from_budget, 0) = 0"
  ).run();
  if (out.changes > 0) console.log(`Locked ${out.changes} transfer categor${out.changes === 1 ? 'y' : 'ies'} out of the budget.`);
}
