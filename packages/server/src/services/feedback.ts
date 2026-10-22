import Database from 'better-sqlite3';

export type FeedbackKind = 'correction' | 'confirmation' | 'split_leg';

/**
 * Record a categorization decision into category_feedback.
 *
 * Snapshots the transaction's CURRENT row as the "prior" — so callers MUST
 * invoke this BEFORE writing the new category, inside their own
 * sqlite.transaction where applicable.
 *
 * No-ops when kind='correction'/'confirmation' and the category is unchanged…
 * except confirmations, which are the point: confirming an auto-suggestion IS
 * the signal, so those are recorded even when newCategoryId === current.
 * Corrections that don't change anything are skipped.
 */
export function recordCategoryFeedback(sqlite: Database.Database, opts: {
  txnId: number;
  newCategoryId: number;
  kind: FeedbackKind;
  userId: number | null;
  /** Split legs: record the leg amount instead of the parent's. */
  amountOverride?: number;
}): void {
  const { txnId, newCategoryId, kind, userId, amountOverride } = opts;
  if (!newCategoryId) return;

  const txn = sqlite.prepare(`
    SELECT description, bank_description, merchant_id, account_id, amount, date,
           category_id, categorize_source, categorize_confidence
    FROM transactions WHERE id = ?
  `).get(txnId) as {
    description: string; bank_description: string | null; merchant_id: number | null;
    account_id: number; amount: number; date: string;
    category_id: number | null; categorize_source: string | null; categorize_confidence: number | null;
  } | undefined;
  if (!txn) return;

  if (kind === 'correction' && txn.category_id === newCategoryId) return;

  sqlite.prepare(`
    INSERT INTO category_feedback (
      transaction_id, description, bank_description, merchant_id, account_id,
      amount, txn_date, prior_category_id, prior_source, prior_confidence,
      corrected_category_id, kind, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    txnId,
    txn.description,
    txn.bank_description,
    txn.merchant_id,
    txn.account_id,
    amountOverride ?? txn.amount,
    txn.date,
    txn.category_id,
    txn.categorize_source,
    txn.categorize_confidence,
    newCategoryId,
    kind,
    userId,
  );
}
