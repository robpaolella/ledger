import Database from 'better-sqlite3';

/**
 * Migration: collapse duplicate "Transfers > Transfer" categories onto the one
 * canonical `type = 'transfer'` row.
 *
 * How the duplicate happened: migrateTransfersCategory seeds its category when
 * no `type='transfer'` row exists — a guard that can't see a hand-made
 * `Transfers > Transfer` sitting under an *expense* group. A user who created
 * one before that migration shipped ended up with two entries that look
 * identical in every picker, and the expense-typed one kept counting its
 * transactions as spending in the income/expense rollups (which filter on
 * `c.type = 'expense'`, not on exclude_from_budget).
 *
 * Runs late — after every category-referencing table exists — and is idempotent:
 * with zero or one match it does nothing, so it also self-heals a fresh install
 * where someone re-creates the twin by hand.
 */
export function migrateTransferCategoryDedupe(sqlite: Database.Database): void {
  const hasTable = (name: string): boolean =>
    (sqlite.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name = ?").get(name) as { cnt: number }).cnt > 0;
  if (!hasTable('categories')) return;

  // Canonical = the transfer-typed row (lowest id if somehow several exist).
  const canonical = sqlite.prepare(
    "SELECT id FROM categories WHERE type = 'transfer' ORDER BY id LIMIT 1"
  ).get() as { id: number } | undefined;
  if (!canonical) return; // nothing to fold onto — migrateTransfersCategory seeds it

  // Same leaf under the same group name, any type, that isn't the canonical row.
  const dupes = sqlite.prepare(`
    SELECT id FROM categories
    WHERE group_name = 'Transfers' AND sub_name = 'Transfer' AND id <> ?
  `).all(canonical.id) as { id: number }[];
  if (dupes.length === 0) return;

  // Plain repoints, and repoints onto tables with a UNIQUE(category_id, …) key —
  // there OR IGNORE keeps the canonical row's own entry and the loser is dropped
  // rather than colliding.
  const plain: [string, string][] = [
    ['transactions', 'category_id'],
    ['transaction_splits', 'category_id'],
    ['category_rules', 'category_id'],
    ['category_feedback', 'prior_category_id'],
    ['category_feedback', 'corrected_category_id'],
    ['budget_recurring', 'category_id'],
    ['pay_cycles', 'category_id'],
    ['recurring_items', 'category_id'],
  ];
  const unique: [string, string][] = [
    ['budgets', 'category_id'],
    ['budget_templates', 'category_id'],
    ['budget_alerts', 'category_id'],
  ];

  // Presentation the canonical row lacks is worth keeping: the hand-made twin is
  // the one the user actually dressed up (emoji, colour), and losing its icon on
  // the fold reads as the category having changed identity.
  const carryOver = (dupeId: number): void => {
    const src = sqlite.prepare('SELECT emoji FROM categories WHERE id = ?').get(dupeId) as { emoji: string | null } | undefined;
    if (src?.emoji) {
      sqlite.prepare('UPDATE categories SET emoji = ? WHERE id = ? AND (emoji IS NULL OR emoji = \'\')')
        .run(src.emoji, canonical.id);
    }
  };

  const run = sqlite.transaction(() => {
    for (const d of dupes) {
      carryOver(d.id);
      for (const [table, col] of plain) {
        if (hasTable(table)) sqlite.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`).run(canonical.id, d.id);
      }
      for (const [table, col] of unique) {
        if (!hasTable(table)) continue;
        sqlite.prepare(`UPDATE OR IGNORE ${table} SET ${col} = ? WHERE ${col} = ?`).run(canonical.id, d.id);
        sqlite.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).run(d.id);
      }
      sqlite.prepare('DELETE FROM categories WHERE id = ?').run(d.id);
    }
    // A group left with no categories is dead weight — but only drop it if this
    // fold is what emptied it (Transfers also holds Credit Card Payment etc.).
    if (hasTable('category_groups')) {
      sqlite.exec(`
        DELETE FROM category_groups
        WHERE name = 'Transfers'
          AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.group_id = category_groups.id)
      `);
    }
  });
  run();
  console.log(`Folded ${dupes.length} duplicate Transfers > Transfer categor${dupes.length === 1 ? 'y' : 'ies'} into #${canonical.id}.`);
}
