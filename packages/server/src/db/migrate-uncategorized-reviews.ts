import type Database from 'better-sqlite3';
import { ensureUncategorizedReviews } from '../services/reviews.js';

/**
 * Backfill: every uncategorized transaction has an open Review item, including
 * one marked reviewed before that was refused. Reopens the existing row rather
 * than adding a second, deletes nothing, and does nothing on a second run.
 * Runs after transfer linking, so linked transfer legs are left out.
 */
export function migrateUncategorizedReviews(sqlite: Database.Database): void {
  const opened = sqlite.transaction(() => ensureUncategorizedReviews(sqlite))();
  if (opened > 0) console.log(`Opened ${opened} Review item(s) for uncategorized transactions.`);
}
