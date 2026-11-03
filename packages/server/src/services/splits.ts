import { db, sqlite } from '../db/index.js';
import { transactionSplits } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { sanitizeString } from '../utils/sanitize.js';
import { findOrCreateMerchant } from '../db/merchants.js';

/**
 * Split-leg helpers, extracted verbatim from routes/transactions.ts so
 * server-side writers (Amazon enrichment) share the exact same validation and
 * persistence as the API route.
 */

export interface SplitInput {
  id?: number;
  categoryId: number;
  amount: number;
  merchant?: string;
  note?: string | null;
}

// Resolve a split leg's stored merchant_id. A leg whose merchant matches the
// parent's is stored as NULL (= inherit parent), so a later parent rename keeps
// propagating; only a genuinely different merchant is stored explicitly.
export function resolveLegMerchantId(merchant: string | undefined, parentMerchantId: number | null): number | null {
  const clean = merchant ? sanitizeString(merchant) : '';
  if (!clean) return null;
  const legId = findOrCreateMerchant(clean);
  return legId != null && legId !== parentMerchantId ? legId : null;
}

export function validateSplits(splits: SplitInput[], totalAmount: number): string | null {
  if (splits.length < 2) return 'At least 2 splits are required';
  for (const s of splits) {
    if (!s.categoryId) return 'Each split must have a category';
    if (typeof s.amount !== 'number' || !Number.isFinite(s.amount)) return 'Split amounts must be numbers';
    if (s.amount === 0) return 'Split amounts cannot be zero';
  }
  const sum = splits.reduce((s, r) => s + r.amount, 0);
  if (Math.abs(sum - totalAmount) > 0.01) {
    return `Split amounts (${sum.toFixed(2)}) must equal transaction total (${totalAmount.toFixed(2)})`;
  }
  return null;
}

// Upsert splits by id (stable ids across saves so a split-child detail panel
// stays open on the same leg, and per-leg merchant/note survive parent-field
// edits). Rows with a known id are updated; rows without are inserted; existing
// legs absent from the incoming set are deleted.
export function saveSplits(transactionId: number, splits: SplitInput[], parentMerchantId: number | null): void {
  const existing = sqlite.prepare(
    'SELECT id FROM transaction_splits WHERE transaction_id = ?'
  ).all(transactionId) as { id: number }[];
  const existingIds = new Set(existing.map((r) => r.id));
  const kept = new Set<number>();

  for (const s of splits) {
    const merchantId = resolveLegMerchantId(s.merchant, parentMerchantId);
    const noteClean = s.note != null ? sanitizeString(s.note) : '';
    const note = noteClean ? noteClean : null;
    if (s.id && existingIds.has(s.id)) {
      db.update(transactionSplits).set({
        category_id: s.categoryId,
        amount: s.amount,
        merchant_id: merchantId,
        note,
      }).where(eq(transactionSplits.id, s.id)).run();
      kept.add(s.id);
    } else {
      const res = db.insert(transactionSplits).values({
        transaction_id: transactionId,
        category_id: s.categoryId,
        amount: s.amount,
        merchant_id: merchantId,
        note,
      }).run();
      kept.add(Number(res.lastInsertRowid));
    }
  }

  for (const id of existingIds) {
    if (!kept.has(id)) db.delete(transactionSplits).where(eq(transactionSplits.id, id)).run();
  }
}
