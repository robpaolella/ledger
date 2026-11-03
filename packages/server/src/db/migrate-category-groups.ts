import type BetterSqlite3 from 'better-sqlite3';

/**
 * Introduce a first-class `category_groups` entity so groups can be created,
 * renamed, reordered, and deleted independently of their categories (empty
 * groups persist). Backfills one group per distinct (type, group_name) already
 * present and links each category via the new `categories.group_id` column.
 * `categories.group_name` is kept as a denormalized mirror by the routes, so
 * budget/report/transaction readers are unaffected. Idempotent.
 */
export function migrateCategoryGroups(sqlite: BetterSqlite3.Database): void {
  const tableExists = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='category_groups'`)
    .get();
  if (!tableExists) {
    sqlite.exec(`
      CREATE TABLE category_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  const groupCols = new Set(
    (sqlite.prepare(`PRAGMA table_info(category_groups)`).all() as { name: string }[]).map((c) => c.name),
  );
  if (!groupCols.has('color')) {
    sqlite.exec(`ALTER TABLE category_groups ADD COLUMN color TEXT`);
  }

  const cols = new Set(
    (sqlite.prepare(`PRAGMA table_info(categories)`).all() as { name: string }[]).map((c) => c.name),
  );
  if (!cols.has('group_id')) {
    sqlite.exec(`ALTER TABLE categories ADD COLUMN group_id INTEGER REFERENCES category_groups(id)`);
  }

  // Backfill groups + link any category still missing a group_id.
  const distinct = sqlite
    .prepare(`SELECT DISTINCT type, group_name FROM categories WHERE group_id IS NULL`)
    .all() as { type: string; group_name: string }[];
  if (distinct.length === 0) return;

  const findGroup = sqlite.prepare(`SELECT id FROM category_groups WHERE type = ? AND name = ?`);
  const insGroup = sqlite.prepare(`INSERT INTO category_groups (type, name, sort_order) VALUES (?, ?, ?)`);
  const maxOrder = sqlite.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM category_groups WHERE type = ?`);
  const linkCats = sqlite.prepare(`UPDATE categories SET group_id = ? WHERE type = ? AND group_name = ? AND group_id IS NULL`);

  const run = sqlite.transaction(() => {
    for (const d of distinct) {
      let g = findGroup.get(d.type, d.group_name) as { id: number } | undefined;
      if (!g) {
        const next = (maxOrder.get(d.type) as { m: number }).m + 1;
        const r = insGroup.run(d.type, d.group_name, next);
        g = { id: Number(r.lastInsertRowid) };
      }
      linkCats.run(g.id, d.type, d.group_name);
    }
  });
  run();
}
