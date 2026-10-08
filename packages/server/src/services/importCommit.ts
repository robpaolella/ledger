import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { resolveMerchantId } from '../db/merchants.js';
import { REVIEW_THRESHOLD } from './categorize.js';
import { flagReview, defaultAssigneeForTxn } from './reviews.js';
import { checkBudgetExceededForMonths } from './budgetAlerts.js';

export interface ImportCommitRow {
  date: string; description: string; note?: string;
  categoryId?: number; amount: number;
  // Auto-suggestion metadata (null/absent = the user picked the category
  // manually in the wizard). Mirrors the bank-sync commit path.
  confidence?: number | null; source?: string | null;
  splits?: { categoryId: number; amount: number }[];
}

export interface ImportCommitInput {
  accountId: number;
  transactions: ImportCommitRow[];
}

export type ImportCommitResult =
  | { ok: true; imported: number }
  | { ok: false; status: 400 | 500; error: string };

export const IMPORT_FAILED_MESSAGE = 'Import failed. Nothing was imported.';

const isAmount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Check the request before anything is written. Returns the first problem as a
 * plain message naming the row, or null when the import can go ahead.
 */
function validate(sqlite: Database.Database, input: ImportCommitInput): string | null {
  const { accountId, transactions: txns } = input ?? {};
  if (!accountId || !txns || !Array.isArray(txns) || txns.length === 0) {
    return 'accountId and transactions array are required';
  }
  if (!sqlite.prepare('SELECT 1 FROM accounts WHERE id = ?').get(accountId)) {
    return "The selected account doesn't exist. Nothing was imported.";
  }

  const categoryExists = sqlite.prepare('SELECT 1 FROM categories WHERE id = ?');
  for (const t of txns) {
    if (!t || typeof t.date !== 'string' || !t.date || typeof t.description !== 'string' || !t.description || t.amount == null) {
      return 'Each transaction requires date, description, and amount';
    }
    if (!isAmount(t.amount)) {
      return `The amount for "${t.description}" isn't a valid number. Nothing was imported.`;
    }
    const hasSplits = Array.isArray(t.splits) && t.splits.length >= 2;
    if (!t.categoryId && !hasSplits) {
      return 'Each transaction requires categoryId or splits';
    }
    if (hasSplits) {
      for (const s of t.splits!) {
        if (!s || !isAmount(s.amount)) {
          return `A split amount for "${t.description}" isn't a valid number. Nothing was imported.`;
        }
        if (!categoryExists.get(s.categoryId)) {
          return `A split category for "${t.description}" doesn't exist. Nothing was imported.`;
        }
      }
      const splitSum = t.splits!.reduce((s, r) => s + r.amount, 0);
      if (Math.abs(splitSum - t.amount) > 0.01) {
        return `Split amounts must equal transaction amount for "${t.description}"`;
      }
    } else if (!categoryExists.get(t.categoryId)) {
      return `The category for "${t.description}" doesn't exist. Nothing was imported.`;
    }
  }
  return null;
}

/**
 * Commit a reviewed CSV import: validate, then write every transaction, split
 * and review flag in ONE database transaction so a failure part-way imports
 * nothing. Budget-exceeded notifications run only after the commit, since a
 * notification can't be rolled back with the import.
 */
export function commitImport(sqlite: Database.Database, input: ImportCommitInput): ImportCommitResult {
  const problem = validate(sqlite, input);
  if (problem) return { ok: false, status: 400, error: problem };

  const { accountId, transactions: txns } = input;
  const db = drizzle(sqlite, { schema });

  // Auto-suggested rows carry confidence/source and land in the review queue
  // below the threshold — same contract as bank sync.
  const insertAll = sqlite.transaction(() => {
    let count = 0;
    for (const t of txns) {
      const hasSplits = t.splits && t.splits.length >= 2;
      const conf = hasSplits ? null : (t.confidence ?? null);
      const needsReview = !hasSplits && conf != null && conf < REVIEW_THRESHOLD ? 1 : 0;
      const result = db.insert(schema.transactions).values({
        account_id: accountId,
        category_id: hasSplits ? null : t.categoryId!,
        date: t.date,
        description: t.description,
        // CSV description IS the raw statement text — preserve it verbatim
        // even if the user later renames the merchant/description.
        bank_description: t.description,
        note: t.note || null,
        merchant_id: resolveMerchantId(t.description, sqlite),
        amount: t.amount,
        categorize_confidence: conf,
        needs_review: needsReview,
        categorize_source: hasSplits || conf == null ? null : (t.source ?? null),
      }).run();
      const txnId = Number(result.lastInsertRowid);

      if (hasSplits) {
        for (const s of t.splits!) {
          db.insert(schema.transactionSplits).values({
            transaction_id: txnId,
            category_id: s.categoryId,
            amount: s.amount,
          }).run();
        }
      }
      if (needsReview === 1) {
        flagReview(sqlite, {
          txnId,
          reason: 'auto_low_confidence',
          assigneeId: defaultAssigneeForTxn(sqlite, txnId),
        });
      }
      count++;
    }
    return count;
  });

  let count: number;
  try {
    count = insertAll();
  } catch (err) {
    console.error('CSV import commit rolled back:', err);
    return { ok: false, status: 500, error: IMPORT_FAILED_MESSAGE };
  }

  // Imported spending may push categories over budget (internally try/catch).
  checkBudgetExceededForMonths(sqlite, txns.map((t) => t.date.slice(0, 7)));

  return { ok: true, imported: count };
}
