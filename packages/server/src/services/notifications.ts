import type Database from 'better-sqlite3';

/**
 * Notification-center write helpers. One row per (user, dedupe_key); repeats
 * upsert in place. `ping: true` flips the row back to unread (the "something
 * new happened" signal); `ping: false` refreshes content silently so passive
 * updates never re-badge a user. Read/clear surface lives in
 * routes/notifications.ts; the client bell dropdown is the only UI.
 */

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export interface NotificationInput {
  type: string;
  severity: NotificationSeverity;
  title: string;
  body?: string | null;
  actionLabel?: string | null;
  actionTarget?: string | null;
  dedupeKey: string;
  ping?: boolean; // default true — flip is_read back to 0 on upsert
}

export function upsertNotification(sqlite: Database.Database, userId: number, n: NotificationInput): void {
  const ping = n.ping !== false;
  sqlite.prepare(`
    INSERT INTO notifications (user_id, type, severity, title, body, action_label, action_target, dedupe_key, is_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(user_id, dedupe_key) DO UPDATE SET
      type = excluded.type,
      severity = excluded.severity,
      title = excluded.title,
      body = excluded.body,
      action_label = excluded.action_label,
      action_target = excluded.action_target,
      is_read = CASE WHEN ? THEN 0 ELSE notifications.is_read END
  `).run(
    userId, n.type, n.severity, n.title, n.body ?? null,
    n.actionLabel ?? null, n.actionTarget ?? null, n.dedupeKey, ping ? 1 : 0,
  );
}

/** Delete by dedupe key — for one user, or every user when userId is omitted. */
export function deleteByDedupeKey(sqlite: Database.Database, dedupeKey: string, userId?: number): void {
  if (userId != null) {
    sqlite.prepare('DELETE FROM notifications WHERE dedupe_key = ? AND user_id = ?').run(dedupeKey, userId);
  } else {
    sqlite.prepare('DELETE FROM notifications WHERE dedupe_key = ?').run(dedupeKey);
  }
}

export function activeUserIds(sqlite: Database.Database): number[] {
  return (sqlite.prepare('SELECT id FROM users WHERE is_active = 1').all() as { id: number }[]).map((r) => r.id);
}

/* ------ SimpleFIN sync failures ------ */

const syncFailureKey = (connectionId: number) => `sync_failure:conn:${connectionId}`;

export interface SyncFailureInput {
  connectionId: number;
  label: string;          // connection label, e.g. 'Chase'
  message: string;        // human-readable error from the fetch layer
  kind: 'auth' | 'rate_limit' | 'other';
}

/**
 * Raise a sync-failure notification for a connection. Recipients: the
 * connection's user for personal connections, every active user for shared
 * ones (user_id NULL).
 */
export function notifySyncFailure(sqlite: Database.Database, f: SyncFailureInput): void {
  const conn = sqlite.prepare('SELECT user_id FROM simplefin_connections WHERE id = ?')
    .get(f.connectionId) as { user_id: number | null } | undefined;
  if (!conn) return;
  const recipients = conn.user_id != null ? [conn.user_id] : activeUserIds(sqlite);
  const body =
    f.kind === 'auth' ? `Authentication expired — reconnect ${f.label} in Settings to resume syncing.`
    : f.kind === 'rate_limit' ? `${f.label} hit the SimpleFIN rate limit. Syncing will retry automatically.`
    : `Couldn't reach ${f.label}: ${f.message}`;
  for (const userId of recipients) {
    upsertNotification(sqlite, userId, {
      type: 'sync_failure',
      severity: 'error',
      title: `Couldn't sync ${f.label}`,
      body,
      actionLabel: 'Open Settings',
      actionTarget: '/settings?tab=banksync',
      dedupeKey: syncFailureKey(f.connectionId),
    });
  }
}

/** A successful fetch of the connection clears its failure alert for everyone. */
export function clearSyncFailureNotification(sqlite: Database.Database, connectionId: number): void {
  deleteByDedupeKey(sqlite, syncFailureKey(connectionId));
}
