import Database from 'better-sqlite3';

export function migrateCategorySortOrder(sqlite: Database.Database): void {
  // One-time migration: assign initial alphabetical sort_order values.
  // After this runs once, manual reordering via /api/categories/reorder is preserved.
  const flag = sqlite.prepare(
    `SELECT value FROM app_config WHERE key = 'category_sort_order_migrated'`
  ).get() as { value: string } | undefined;

  if (flag?.value === 'true') return;

  const groups = sqlite.prepare(
    `SELECT DISTINCT type, group_name FROM categories ORDER BY type, group_name`
  ).all() as { type: string; group_name: string }[];

  const update = sqlite.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
  const selectSubs = sqlite.prepare(
    `SELECT id, sub_name FROM categories WHERE type = ? AND group_name = ? ORDER BY sub_name COLLATE NOCASE ASC`
  );

  const runAll = sqlite.transaction(() => {
    for (const g of groups) {
      const subs = selectSubs.all(g.type, g.group_name) as { id: number; sub_name: string }[];
      for (let i = 0; i < subs.length; i++) {
        update.run(i, subs[i].id);
      }
    }
    sqlite.prepare(
      `INSERT OR REPLACE INTO app_config (key, value) VALUES ('category_sort_order_migrated', 'true')`
    ).run();
  });
  runAll();
}
