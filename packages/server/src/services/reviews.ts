import type Database from 'better-sqlite3';

/**
 * Review-task lifecycle helpers. Single source of the invariant:
 *   transactions.needs_review = 1  ⟺  an OPEN transaction_reviews row exists.
 *
 * Every fn takes the `sqlite` handle so callers can compose inside their own
 * `sqlite.transaction(...)` (e.g. the SimpleFIN commit block). Assignment writes a
 * row into the `notifications` table (this feature is its first real driver).
 */

import { upsertNotification, deleteByDedupeKey } from './notifications.js';

export type ReviewReason = 'auto_uncategorized' | 'auto_low_confidence' | 'manual';

/**
 * ONE aggregate notification per user ("N transactions assigned to you need
 * review") — not one per transaction. Increases re-ping (unread); decreases
 * refresh the count silently; zero deletes the row.
 */
export const REVIEW_AGG_DEDUPE = 'review:aggregate';

/**
 * Default assignee for a SYSTEM-created review: the transaction's account owner.
 * If the account is shared (multiple owners), the most-privileged owner
 * (owner > admin > member). Falls back to the most-privileged active household
 * user if the account has no explicit owners. Returns null only if there are no
 * active users at all.
 */
export function defaultAssigneeForTxn(sqlite: Database.Database, txnId: number): number | null {
  const rank = (r: string) => (r === 'owner' ? 0 : r === 'admin' ? 1 : 2);
  const pick = (list: { id: number; role: string }[]) =>
    list.length ? [...list].sort((a, b) => rank(a.role) - rank(b.role) || a.id - b.id)[0].id : null;
  const owners = sqlite.prepare(`
    SELECT u.id AS id, u.role AS role
    FROM transactions t
    JOIN account_owners ao ON ao.account_id = t.account_id
    JOIN users u ON ao.user_id = u.id
    WHERE t.id = ? AND u.is_active = 1
  `).all(txnId) as { id: number; role: string }[];
  if (owners.length) return pick(owners);
  const anyUser = sqlite.prepare('SELECT id, role FROM users WHERE is_active = 1').all() as { id: number; role: string }[];
  return pick(anyUser);
}

/** Flag (or reopen) a transaction for review + set needs_review=1. Upsert by txn. */
export function flagReview(
  sqlite: Database.Database,
  opts: { txnId: number; reason: ReviewReason; flaggedBy?: number | null; assigneeId?: number | null; note?: string | null },
): void {
  const { txnId, reason, flaggedBy = null, assigneeId = null, note = null } = opts;
  const prior = sqlite.prepare(
    "SELECT assignee_id, status FROM transaction_reviews WHERE transaction_id = ?",
  ).get(txnId) as { assignee_id: number | null; status: string } | undefined;
  sqlite.prepare(`
    INSERT INTO transaction_reviews (transaction_id, status, reason, assignee_id, note, flagged_by, resolved_by, resolved_at)
    VALUES (?, 'open', ?, ?, ?, ?, NULL, NULL)
    ON CONFLICT(transaction_id) DO UPDATE SET
      status = 'open',
      reason = excluded.reason,
      assignee_id = excluded.assignee_id,
      note = COALESCE(excluded.note, transaction_reviews.note),
      flagged_by = excluded.flagged_by,
      resolved_by = NULL,
      resolved_at = NULL
  `).run(txnId, reason, assigneeId, note, flaggedBy);
  sqlite.prepare('UPDATE transactions SET needs_review = 1 WHERE id = ?').run(txnId);
  // Aggregate maintenance: a re-flag can change or drop the assignee. Ping the
  // new assignee only when their queue actually grew (fresh/reopened review, or
  // the review moved to them); refresh a displaced prior assignee silently.
  if (prior?.assignee_id != null && prior.assignee_id !== assigneeId) {
    syncReviewNotification(sqlite, prior.assignee_id, { ping: false });
  }
  if (assigneeId != null) {
    const grew = prior?.status !== 'open' || prior?.assignee_id !== assigneeId;
    syncReviewNotification(sqlite, assigneeId, { ping: grew });
  }
}

/** Resolve an open review (mark reviewed / unflag) + set needs_review=0. No-op if none open. */
export function resolveReview(
  sqlite: Database.Database,
  opts: { txnId: number; resolvedBy?: number | null },
): void {
  const { txnId, resolvedBy = null } = opts;
  const prior = sqlite.prepare(
    'SELECT assignee_id FROM transaction_reviews WHERE transaction_id = ? AND status = \'open\'',
  ).get(txnId) as { assignee_id: number | null } | undefined;
  const res = sqlite.prepare(`
    UPDATE transaction_reviews
    SET status = 'resolved', resolved_by = ?, resolved_at = ?
    WHERE transaction_id = ? AND status = 'open'
  `).run(resolvedBy, new Date().toISOString(), txnId);
  // Always clear the cache flag (cheap, keeps state consistent even if the row
  // was already resolved).
  sqlite.prepare('UPDATE transactions SET needs_review = 0 WHERE id = ?').run(txnId);
  // Clearing your own queue never re-pings you — silent count refresh.
  if (res.changes > 0 && prior?.assignee_id != null) {
    syncReviewNotification(sqlite, prior.assignee_id, { ping: false });
  }
}

/** Reopen a resolved review (status back to open) + needs_review=1. */
export function reopenReview(sqlite: Database.Database, txnId: number): void {
  const res = sqlite.prepare(`
    UPDATE transaction_reviews SET status = 'open', resolved_by = NULL, resolved_at = NULL
    WHERE transaction_id = ? AND status = 'resolved'
  `).run(txnId);
  if (res.changes > 0) {
    sqlite.prepare('UPDATE transactions SET needs_review = 1 WHERE id = ?').run(txnId);
    const r = sqlite.prepare('SELECT assignee_id FROM transaction_reviews WHERE transaction_id = ?').get(txnId) as { assignee_id: number | null } | undefined;
    if (r?.assignee_id != null) syncReviewNotification(sqlite, r.assignee_id, { ping: true });
  }
}

/** Set (or clear, with null) the assignee on an existing review + move the notification. */
export function assignReview(sqlite: Database.Database, txnId: number, assigneeId: number | null): void {
  const prior = sqlite.prepare(
    'SELECT assignee_id, status FROM transaction_reviews WHERE transaction_id = ?',
  ).get(txnId) as { assignee_id: number | null; status: string } | undefined;
  sqlite.prepare('UPDATE transaction_reviews SET assignee_id = ? WHERE transaction_id = ?').run(assigneeId, txnId);
  if (prior?.assignee_id != null && prior.assignee_id !== assigneeId) {
    syncReviewNotification(sqlite, prior.assignee_id, { ping: false }); // assigned away — silent
  }
  // Only ping the new assignee while the review is still open.
  if (assigneeId != null && assigneeId !== prior?.assignee_id && prior?.status === 'open') {
    syncReviewNotification(sqlite, assigneeId, { ping: true });
  }
}

export function setReviewNote(sqlite: Database.Database, txnId: number, note: string | null): void {
  sqlite.prepare('UPDATE transaction_reviews SET note = ? WHERE transaction_id = ?').run(note, txnId);
}

/**
 * Recompute a user's aggregate review notification from their open-review
 * count: 0 → delete the row; N → upsert "N transactions assigned to you need
 * review". `ping` controls whether the row flips back to unread.
 */
export function syncReviewNotification(
  sqlite: Database.Database,
  userId: number | null,
  opts?: { ping?: boolean },
): void {
  if (userId == null) return;
  const { cnt } = sqlite.prepare(
    "SELECT COUNT(*) AS cnt FROM transaction_reviews WHERE status = 'open' AND assignee_id = ?",
  ).get(userId) as { cnt: number };
  if (cnt === 0) {
    deleteByDedupeKey(sqlite, REVIEW_AGG_DEDUPE, userId);
    return;
  }
  upsertNotification(sqlite, userId, {
    type: 'needs_review',
    severity: 'info',
    title: 'Transactions need review',
    body: cnt === 1
      ? '1 transaction assigned to you needs review'
      : `${cnt} transactions assigned to you need review`,
    actionLabel: 'Review',
    actionTarget: '/reviews?assignee=me',
    dedupeKey: REVIEW_AGG_DEDUPE,
    ping: opts?.ping ?? true,
  });
}

/** Distinct assignees holding OPEN reviews among txnIds — capture BEFORE deleting rows. */
export function openReviewAssignees(sqlite: Database.Database, txnIds: number[]): number[] {
  if (txnIds.length === 0) return [];
  const rows = sqlite.prepare(`
    SELECT DISTINCT assignee_id FROM transaction_reviews
    WHERE status = 'open' AND assignee_id IS NOT NULL
      AND transaction_id IN (${txnIds.map(() => '?').join(',')})
  `).all(...txnIds) as { assignee_id: number }[];
  return rows.map((r) => r.assignee_id);
}
