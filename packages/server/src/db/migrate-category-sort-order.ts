import Database from 'better-sqlite3';
import { getConfig, setConfig } from '../services/appConfig.js';

// app_config marker: categories have their order, so the alphabetical backfill never runs again.
const MARKER = 'categories.sort_order_set';

/**
 * Records that categories already have a deliberate order. The fresh-database seed calls
 * this after inserting its default categories in their intended order (e.g. "Other …" last).
 */
export function markCategorySortOrderSet(sqlite: Database.Database): void {
  setConfig(sqlite, MARKER, 'true');
}

export function migrateCategorySortOrder(sqlite: Database.Database): void {
  // Runs once per database: assign sequential sort_order within each (type, group_name) group,
  // ordered alphabetically by sub_name, then set the marker. Later boots keep the order the
  // household saved (Settings → Categories) instead of re-sorting it.
  if (getConfig(sqlite, MARKER)) return;

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
    markCategorySortOrderSet(sqlite);
  });
  runAll();
}
