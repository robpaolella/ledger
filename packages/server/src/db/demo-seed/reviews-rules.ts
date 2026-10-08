/** Deterministic learned-category, feedback, and review-task sample fixtures. */
import type { Helpers } from './helpers.js';
import type { PeopleAccounts } from './people-accounts.js';

type Transaction = {
  id: number;
  account_id: number;
  date: string;
  description: string;
  category_id: number | null;
  merchant_id: number;
  amount: number;
};

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  let state = 58;
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Seed the categorization data only after all synthetic transactions exist. */
export function seedReviewsRules({ db, rel }: Helpers, { johnId, janeId }: PeopleAccounts) {
  const dateFor = (index: number) => {
    const month = 7 + index % 8;
    const year = month > 12 ? 2026 : 2025;
    return rel(`${year}-${String(month > 12 ? month - 12 : month).padStart(2, '0')}-${String(2 + index % 25).padStart(2, '0')}`);
  };
  const transactions = db.prepare(`
    SELECT id, account_id, date, description, category_id, merchant_id, amount
    FROM transactions ORDER BY id
  `).all() as Transaction[];
  const categorized = transactions.filter(t => t.category_id != null);
  const venmo = transactions.filter(t => t.description === 'Venmo' && t.category_id == null);
  const splitLegs = db.prepare(`
    SELECT t.id, t.account_id, t.date, t.description, ts.category_id, t.merchant_id, ts.amount
    FROM transaction_splits ts JOIN transactions t ON t.id = ts.transaction_id
    ORDER BY ts.id LIMIT 2
  `).all() as Transaction[];
  if (transactions.length < 300 || splitLegs.length !== 2) {
    throw new Error('Synthetic transactions are incomplete for review fixtures');
  }

  db.transaction(() => {
    // Explicit merchant rules are the categorizer's highest-confidence layer.
    // Pick the 25 busiest categorized merchants, using each merchant's dominant
    // existing category so every rule reflects real sample activity.
    const ruleCandidates = db.prepare(`
      SELECT t.merchant_id, t.category_id, COUNT(*) AS count
      FROM transactions t
      WHERE t.category_id IS NOT NULL
      GROUP BY t.merchant_id, t.category_id
      ORDER BY count DESC, t.merchant_id ASC, t.category_id ASC
    `).all() as Array<{ merchant_id: number; category_id: number }>;
    const ruleRows = ruleCandidates.filter((row, index, rows) =>
      rows.findIndex(candidate => candidate.merchant_id === row.merchant_id) === index,
    ).slice(0, 25);
    if (ruleRows.length !== 25) throw new Error('Synthetic transactions have too few categorized merchants for learned rules');
    for (const [index, row] of ruleRows.entries()) {
      db.prepare(`
        INSERT INTO category_rules (match_type, pattern, category_id, priority, created_at)
        VALUES ('merchant', ?, ?, 0, ?)
      `).run(String(row.merchant_id), row.category_id, dateFor(index));
    }

    // The feedback log contains an even mix of genuine corrections and confirmed
    // categorization, plus two real split legs for split-aware UI states.
    const feedbackRows = shuffled(categorized).slice(0, 248);
    const categoryIds = db.prepare('SELECT id FROM categories ORDER BY id').all() as { id: number }[];
    for (const [index, txn] of feedbackRows.entries()) {
      const confirmation = index % 2 === 1;
      const correctedCategoryId = txn.category_id!;
      const priorCategoryId = confirmation
        ? correctedCategoryId
        : categoryIds.find(c => c.id !== correctedCategoryId)?.id ?? null;
      db.prepare(`
        INSERT INTO category_feedback (
          transaction_id, description, merchant_id, account_id, amount, txn_date,
          prior_category_id, prior_source, prior_confidence, corrected_category_id,
          kind, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        txn.id, txn.description, txn.merchant_id, txn.account_id, txn.amount, txn.date,
        priorCategoryId, confirmation ? 'merchant-history' : 'heuristic', confirmation ? 0.92 : 0.6,
        correctedCategoryId, confirmation ? 'confirmation' : 'correction',
        index % 2 === 0 ? johnId : janeId, txn.date,
      );
    }
    for (const [index, leg] of splitLegs.entries()) {
      db.prepare(`
        INSERT INTO category_feedback (
          transaction_id, description, merchant_id, account_id, amount, txn_date,
          corrected_category_id, kind, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'split_leg', ?, ?)
      `).run(
        leg.id, leg.description, leg.merchant_id, leg.account_id, leg.amount, leg.date,
        leg.category_id!, index === 0 ? johnId : janeId, leg.date,
      );
    }

    const open = [...venmo, ...shuffled(categorized).filter(t => !venmo.some(v => v.id === t.id)).slice(0, 45 - venmo.length)];
    const openIds = new Set(open.map(t => t.id));
    const resolved = shuffled(categorized.filter(t => !openIds.has(t.id))).slice(0, 255);
    for (const [index, txn] of [...open, ...resolved].entries()) {
      const isOpen = index < open.length;
      const assigneeId = index % 2 === 0 ? johnId : janeId;
      const reason = txn.category_id == null ? 'auto_uncategorized'
        : index % 11 === 0 ? 'manual' : 'auto_low_confidence';
      const createdAt = txn.date;
      db.prepare(`
        INSERT INTO transaction_reviews (
          transaction_id, status, reason, assignee_id, note, flagged_by,
          resolved_by, created_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        txn.id, isOpen ? 'open' : 'resolved', reason, assigneeId,
        isOpen ? 'Check this transaction' : 'Reviewed sample transaction',
        reason === 'manual' ? assigneeId : null,
        isOpen ? null : assigneeId, createdAt, isOpen ? null : `${createdAt}T12:00:00.000Z`,
      );
      if (isOpen) db.prepare('UPDATE transactions SET needs_review = 1 WHERE id = ?').run(txn.id);
    }

    for (const userId of [johnId, janeId]) {
      const count = (db.prepare(`
        SELECT COUNT(*) AS count FROM transaction_reviews
        WHERE status = 'open' AND assignee_id = ?
      `).get(userId) as { count: number }).count;
      db.prepare(`
        INSERT INTO notifications (user_id, type, severity, title, body, action_label, action_target, dedupe_key, is_read, created_at)
        VALUES (?, 'needs_review', 'info', 'Transactions need review', ?, 'Review', '/reviews?assignee=me', 'review:aggregate', 0, ?)
      `).run(userId, `${count} transactions assigned to you need review`, dateFor(299 + userId));
    }
  })();

  console.log('  Created 25 learned rules, 250 feedback entries, and 300 review tasks');
}
