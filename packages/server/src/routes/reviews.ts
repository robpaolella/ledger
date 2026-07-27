import { Router, Request, Response } from 'express';
import { sqlite } from '../db/index.js';
import { requirePermission } from '../middleware/permissions.js';
import { flagReview, resolveReview, assignReview, setReviewNote, reopenReview } from '../services/reviews.js';
import { recordCategoryFeedback } from '../services/feedback.js';

/** Resolving a review on a categorized txn = confirming its category — a
 *  positive learning signal. Skipped for big bulk resolves (queue-clearing). */
function recordConfirmation(txnId: number, userId: number): void {
  const row = sqlite.prepare('SELECT category_id FROM transactions WHERE id = ?').get(txnId) as { category_id: number | null } | undefined;
  if (row?.category_id != null) {
    recordCategoryFeedback(sqlite, { txnId, newCategoryId: row.category_id, kind: 'confirmation', userId });
  }
}

const router = Router();

interface QueueRow {
  review_id: number; status: string; reason: string; note: string | null; created_at: string; resolved_at: string | null;
  assignee_id: number | null; assignee_name: string | null;
  flagged_by: number | null; flagged_by_name: string | null;
  txn_id: number; date: string; description: string; amount: number;
  merchant_id: number | null; merchant_name: string | null; merchant_logo: string | null;
  account_id: number; account_name: string; account_last_four: string | null;
  account_avatar: string | null; account_inst_logo: string | null; account_inst_color: string | null;
  category_id: number | null; category_group_name: string | null; category_sub_name: string | null;
  category_display_name: string | null; category_type: string | null;
}

const mapRow = (r: QueueRow) => ({
  reviewId: r.review_id,
  status: r.status,
  reason: r.reason,
  note: r.note,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
  assignee: r.assignee_id != null ? { id: r.assignee_id, displayName: r.assignee_name } : null,
  flaggedBy: r.flagged_by != null ? { id: r.flagged_by, displayName: r.flagged_by_name } : null,
  transaction: {
    id: r.txn_id, date: r.date, description: r.description, amount: r.amount,
    merchant: r.merchant_id != null ? { id: r.merchant_id, name: r.merchant_name, logoUrl: r.merchant_logo ?? null } : null,
    account: { id: r.account_id, name: r.account_name, lastFour: r.account_last_four, logoUrl: r.account_avatar || r.account_inst_logo || null, color: r.account_inst_color ?? null },
    category: r.category_id != null ? {
      id: r.category_id, groupName: r.category_group_name, subName: r.category_sub_name,
      displayName: r.category_display_name, type: r.category_type,
    } : null,
  },
});

// GET /api/reviews?status=open|resolved|all&assignee=me|unassigned|<id>&limit&offset
router.get('/', (req: Request, res: Response) => {
  try {
    const { status = 'open', assignee, limit: limitStr, offset: offsetStr } = req.query as Record<string, string | undefined>;
    const limit = Math.max(1, Math.min(parseInt(limitStr || '200', 10) || 200, 500));
    const offset = Math.max(0, parseInt(offsetStr || '0', 10) || 0);

    const where: string[] = [];
    const params: (string | number)[] = [];
    if (status === 'open' || status === 'resolved') { where.push('r.status = ?'); params.push(status); }
    if (assignee === 'me') { where.push('r.assignee_id = ?'); params.push(req.user!.userId); }
    else if (assignee === 'unassigned') { where.push('r.assignee_id IS NULL'); }
    else if (assignee && !isNaN(Number(assignee))) { where.push('r.assignee_id = ?'); params.push(Number(assignee)); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const base = `
      FROM transaction_reviews r
      JOIN transactions t ON r.transaction_id = t.id
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN financial_institutions afi ON a.institution_id = afi.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN merchants m ON t.merchant_id = m.id
      LEFT JOIN users ua ON r.assignee_id = ua.id
      LEFT JOIN users uf ON r.flagged_by = uf.id
      ${whereSql}
    `;
    const rows = sqlite.prepare(`
      SELECT r.id AS review_id, r.status, r.reason, r.note, r.created_at, r.resolved_at,
             r.assignee_id, ua.display_name AS assignee_name,
             r.flagged_by, uf.display_name AS flagged_by_name,
             t.id AS txn_id, t.date, t.description, t.amount,
             t.merchant_id, m.name AS merchant_name, m.logo_url AS merchant_logo,
             a.id AS account_id, a.name AS account_name, a.last_four AS account_last_four,
             a.avatar_url AS account_avatar, afi.logo_url AS account_inst_logo, afi.color AS account_inst_color,
             c.id AS category_id, c.group_name AS category_group_name, c.sub_name AS category_sub_name,
             c.display_name AS category_display_name, c.type AS category_type
      ${base}
      ORDER BY (r.status = 'open') DESC, t.date DESC, r.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as QueueRow[];
    const { n } = sqlite.prepare(`SELECT COUNT(*) AS n ${base}`).get(...params) as { n: number };

    res.json({ data: rows.map(mapRow), total: n });
  } catch (err) {
    console.error('GET /reviews error:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// GET /api/reviews/count → { open, assignedToMe, unassigned }
router.get('/count', (req: Request, res: Response) => {
  try {
    const open = (sqlite.prepare("SELECT COUNT(*) AS n FROM transaction_reviews WHERE status='open'").get() as { n: number }).n;
    const assignedToMe = (sqlite.prepare("SELECT COUNT(*) AS n FROM transaction_reviews WHERE status='open' AND assignee_id = ?").get(req.user!.userId) as { n: number }).n;
    const unassigned = (sqlite.prepare("SELECT COUNT(*) AS n FROM transaction_reviews WHERE status='open' AND assignee_id IS NULL").get() as { n: number }).n;
    res.json({ data: { open, assignedToMe, unassigned } });
  } catch (err) {
    console.error('GET /reviews/count error:', err);
    res.status(500).json({ error: 'Failed to count reviews' });
  }
});

const selectReview = (txnId: number) => {
  const r = sqlite.prepare(`
    SELECT r.id AS review_id, r.status, r.reason, r.note, r.created_at, r.resolved_at,
           r.assignee_id, ua.display_name AS assignee_name, r.flagged_by, uf.display_name AS flagged_by_name,
           t.id AS txn_id, t.date, t.description, t.amount, t.merchant_id, m.name AS merchant_name, m.logo_url AS merchant_logo,
           a.id AS account_id, a.name AS account_name, a.last_four AS account_last_four,
           a.avatar_url AS account_avatar, afi.logo_url AS account_inst_logo, afi.color AS account_inst_color,
           c.id AS category_id, c.group_name AS category_group_name, c.sub_name AS category_sub_name,
           c.display_name AS category_display_name, c.type AS category_type
    FROM transaction_reviews r
    JOIN transactions t ON r.transaction_id = t.id
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN financial_institutions afi ON a.institution_id = afi.id
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN merchants m ON t.merchant_id = m.id
    LEFT JOIN users ua ON r.assignee_id = ua.id
    LEFT JOIN users uf ON r.flagged_by = uf.id
    WHERE r.transaction_id = ?
  `).get(txnId) as QueueRow | undefined;
  return r ? mapRow(r) : null;
};

// POST /api/reviews/flag { transactionId, assigneeId?, note? }
router.post('/flag', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const { transactionId, assigneeId, note } = req.body as { transactionId?: number; assigneeId?: number | null; note?: string | null };
    if (!transactionId) return res.status(400).json({ error: 'transactionId is required' });
    const txn = sqlite.prepare('SELECT id FROM transactions WHERE id = ?').get(transactionId);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });
    sqlite.transaction(() => {
      // A user-created review with no explicit assignee goes to the creator.
      flagReview(sqlite, { txnId: transactionId, reason: 'manual', flaggedBy: req.user!.userId, assigneeId: assigneeId ?? req.user!.userId, note: note ?? null });
    })();
    res.status(201).json({ data: selectReview(transactionId) });
  } catch (err) {
    console.error('POST /reviews/flag error:', err);
    res.status(500).json({ error: 'Failed to flag transaction' });
  }
});

// POST /api/reviews/resolve { transactionId } | { transactionIds: [] }  (= mark reviewed / unflag / bulk)
router.post('/resolve', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const { transactionId, transactionIds } = req.body as { transactionId?: number; transactionIds?: number[] };
    const ids = transactionIds && Array.isArray(transactionIds) ? transactionIds : (transactionId ? [transactionId] : []);
    if (ids.length === 0) return res.status(400).json({ error: 'transactionId or transactionIds required' });
    sqlite.transaction(() => {
      for (const id of ids) {
        if (ids.length <= 20) recordConfirmation(id, req.user!.userId);
        resolveReview(sqlite, { txnId: id, resolvedBy: req.user!.userId });
      }
    })();
    res.json({ data: { resolved: ids.length } });
  } catch (err) {
    console.error('POST /reviews/resolve error:', err);
    res.status(500).json({ error: 'Failed to resolve reviews' });
  }
});

// PATCH /api/reviews/:transactionId { assigneeId?, note?, status? }
router.patch('/:transactionId', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const txnId = parseInt(req.params.transactionId as string, 10);
    const existing = sqlite.prepare('SELECT status FROM transaction_reviews WHERE transaction_id = ?').get(txnId) as { status: string } | undefined;
    if (!existing) return res.status(404).json({ error: 'Review not found' });
    const { assigneeId, note, status } = req.body as { assigneeId?: number | null; note?: string | null; status?: string };

    sqlite.transaction(() => {
      if (status === 'resolved' && existing.status === 'open') recordConfirmation(txnId, req.user!.userId);
      if (status === 'resolved') resolveReview(sqlite, { txnId, resolvedBy: req.user!.userId });
      else if (status === 'open') reopenReview(sqlite, txnId);
      if (note !== undefined) setReviewNote(sqlite, txnId, note && note.trim() ? note.trim() : null);
      if (assigneeId !== undefined) assignReview(sqlite, txnId, assigneeId ?? null);
    })();
    res.json({ data: selectReview(txnId) });
  } catch (err) {
    console.error('PATCH /reviews/:transactionId error:', err);
    res.status(500).json({ error: 'Failed to update review' });
  }
});

export default router;
