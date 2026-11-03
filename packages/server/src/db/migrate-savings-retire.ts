import Database from 'better-sqlite3';

/**
 * Migration: retire the Savings category section.
 *
 * Savings was a third category type alongside income/expense. It made the ledger
 * harder to read — moving money into savings debited the spending account AND
 * recorded a contribution, and taking it back out debited savings again — while
 * the reconciliation it existed for (Income − Expenses − Savings) was never
 * actually computed anywhere. Money between accounts the user owns is simply a
 * transfer, and how much they saved is what they did not spend.
 *
 * Everything on a savings category folds onto the canonical Transfers > Transfer
 * leaf. Budget-shaped rows are DELETED rather than repointed: a transfer category
 * is never budgeted (see enforceTransferBudgetExclusion), and repointing would
 * collide with the unique (category_id, month) indexes.
 *
 * Idempotent — with no savings categories left it returns immediately, so it is a
 * no-op on every later boot.
 */
export function migrateSavingsRetire(sqlite: Database.Database): void {
  const hasTable = (name: string): boolean =>
    (sqlite.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name = ?").get(name) as { cnt: number }).cnt > 0;
  if (!hasTable('categories')) return;

  const doomed = sqlite.prepare("SELECT id FROM categories WHERE type = 'savings'").all() as { id: number }[];
  if (doomed.length === 0) return;

  // Fold onto the canonical transfer leaf. Without it there is nowhere safe to
  // put these rows, so leave everything alone rather than orphan it.
  const target = sqlite.prepare(`
    SELECT id FROM categories
    WHERE type = 'transfer' AND group_name = 'Transfers' AND sub_name = 'Transfer'
    ORDER BY id LIMIT 1
  `).get() as { id: number } | undefined;
  if (!target) {
    console.warn('Savings retire skipped: no Transfers > Transfer category to fold onto.');
    return;
  }

  const repoint: [string, string][] = [
    ['transactions', 'category_id'],
    ['transaction_splits', 'category_id'],
    ['category_rules', 'category_id'],
    ['category_feedback', 'prior_category_id'],
    ['category_feedback', 'corrected_category_id'],
  ];
  // Budget-shaped rows: a transfer category can hold none of these.
  const drop: [string, string][] = [
    ['budgets', 'category_id'],
    ['budget_templates', 'category_id'],
    ['budget_recurring', 'category_id'],
    ['budget_alerts', 'category_id'],
    ['pay_cycles', 'category_id'],
    ['recurring_items', 'category_id'],
  ];

  const ids = doomed.map((d) => d.id);
  const list = ids.map(() => '?').join(',');
  let moved = 0;
  let dropped = 0;

  sqlite.transaction(() => {
    for (const [table, col] of repoint) {
      if (!hasTable(table)) continue;
      moved += sqlite.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${col} IN (${list})`).run(target.id, ...ids).changes;
    }
    for (const [table, col] of drop) {
      if (!hasTable(table)) continue;
      dropped += sqlite.prepare(`DELETE FROM ${table} WHERE ${col} IN (${list})`).run(...ids).changes;
    }
    sqlite.prepare(`DELETE FROM categories WHERE id IN (${list})`).run(...ids);
    // The section's groups go once nothing lives in them.
    if (hasTable('category_groups')) {
      sqlite.exec(`
        DELETE FROM category_groups
        WHERE type = 'savings'
          AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.group_id = category_groups.id)
      `);
    }
  })();

  console.log(
    `Retired ${doomed.length} savings categories → Transfers > Transfer #${target.id} `
    + `(${moved} row(s) repointed, ${dropped} budget row(s) removed).`,
  );
}
