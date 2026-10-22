import Database from 'better-sqlite3';

/**
 * Migration: notification-center launch.
 *  - Review notifications move from one-row-per-transaction
 *    ('review:txn:{id}') to ONE aggregate row per user ('review:aggregate'
 *    showing the open count assigned to them) — sweep the old rows and build
 *    the aggregates from current open reviews. Insert-only (ON CONFLICT DO
 *    NOTHING) so reboots never flip a user's read state.
 *  - budget_alerts: crossing-state ledger for budget-exceeded notifications —
 *    one row per (category, month) marks "already alerted this month" so
 *    growth updates the notification body without re-pinging, and a cleared
 *    notification stays cleared until the next month.
 * Idempotent.
 */
export function migrateNotificationCenter(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS budget_alerts (
      category_id INTEGER NOT NULL REFERENCES categories(id),
      month TEXT NOT NULL,
      first_exceeded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (category_id, month)
    );
  `);

  sqlite.prepare("DELETE FROM notifications WHERE dedupe_key LIKE 'review:txn:%'").run();

  sqlite.prepare(`
    INSERT INTO notifications (user_id, type, severity, title, body, action_label, action_target, dedupe_key, is_read)
    SELECT
      assignee_id, 'needs_review', 'info', 'Transactions need review',
      CASE WHEN COUNT(*) = 1
        THEN '1 transaction assigned to you needs review'
        ELSE COUNT(*) || ' transactions assigned to you need review'
      END,
      'Review', '/reviews?assignee=me', 'review:aggregate', 0
    FROM transaction_reviews
    WHERE status = 'open' AND assignee_id IS NOT NULL
    GROUP BY assignee_id
    ON CONFLICT(user_id, dedupe_key) DO NOTHING
  `).run();
}
