import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { transactions, accounts, categories, transactionSplits } from '../db/schema.js';
import { eq, and, gte, lte, like, or, sql, desc, asc, inArray } from 'drizzle-orm';
import { sanitize } from '../utils/sanitize.js';
import { requirePermission } from '../middleware/permissions.js';
import { detectDuplicates } from '../services/duplicateDetector.js';

const router = Router();

interface SplitInput {
  categoryId: number;
  amount: number;
}

function validateSplits(splits: SplitInput[], totalAmount: number): string | null {
  if (splits.length < 2) return 'At least 2 splits are required';
  for (const s of splits) {
    if (!s.categoryId) return 'Each split must have a category';
    if (s.amount === 0) return 'Split amounts cannot be zero';
  }
  const sum = splits.reduce((s, r) => s + r.amount, 0);
  if (Math.abs(sum - totalAmount) > 0.01) {
    return `Split amounts (${sum.toFixed(2)}) must equal transaction total (${totalAmount.toFixed(2)})`;
  }
  return null;
}

function saveSplits(transactionId: number, splits: SplitInput[]): void {
  // Delete existing splits
  db.delete(transactionSplits).where(eq(transactionSplits.transaction_id, transactionId)).run();
  // Insert new splits
  for (const s of splits) {
    db.insert(transactionSplits).values({
      transaction_id: transactionId,
      category_id: s.categoryId,
      amount: s.amount,
    }).run();
  }
}

function getSplitsForTransactions(transactionIds: number[]): Map<number, { id: number; categoryId: number; groupName: string; subName: string; displayName: string; type: string; amount: number }[]> {
  if (transactionIds.length === 0) return new Map();
  const rows = sqlite.prepare(`
    SELECT ts.id, ts.transaction_id, ts.category_id, ts.amount,
           c.group_name, c.sub_name, c.display_name, c.type
    FROM transaction_splits ts
    JOIN categories c ON ts.category_id = c.id
    WHERE ts.transaction_id IN (${transactionIds.map(() => '?').join(',')})
    ORDER BY ts.id
  `).all(...transactionIds) as {
    id: number; transaction_id: number; category_id: number; amount: number;
    group_name: string; sub_name: string; display_name: string; type: string;
  }[];
  const map = new Map<number, { id: number; categoryId: number; groupName: string; subName: string; displayName: string; type: string; amount: number }[]>();
  for (const r of rows) {
    if (!map.has(r.transaction_id)) map.set(r.transaction_id, []);
    map.get(r.transaction_id)!.push({
      id: r.id,
      categoryId: r.category_id,
      groupName: r.group_name,
      subName: r.sub_name,
      displayName: r.display_name,
      type: r.type,
      amount: r.amount,
    });
  }
  return map;
}

function getAccountOwners(accountIds: number[]): Map<number, { id: number; displayName: string }[]> {
  if (accountIds.length === 0) return new Map();
  const rows = sqlite.prepare(`
    SELECT ao.account_id, u.id as user_id, u.display_name
    FROM account_owners ao JOIN users u ON ao.user_id = u.id
    WHERE ao.account_id IN (${accountIds.map(() => '?').join(',')})
    ORDER BY u.display_name
  `).all(...accountIds) as { account_id: number; user_id: number; display_name: string }[];
  const map = new Map<number, { id: number; displayName: string }[]>();
  for (const o of rows) {
    if (!map.has(o.account_id)) map.set(o.account_id, []);
    map.get(o.account_id)!.push({ id: o.user_id, displayName: o.display_name });
  }
  return map;
}

// GET /api/transactions — list with filters, joins, pagination
router.get('/', (req: Request, res: Response) => {
  try {
    const {
      startDate, endDate,
      accountId, categoryId, groupName,
      type, owner, search,
      limit: limitStr, offset: offsetStr,
      sortBy = 'date', sortOrder = 'desc',
    } = req.query as Record<string, string | undefined>;

    const limit = parseInt(limitStr || '50', 10);
    const offset = parseInt(offsetStr || '0', 10);

    const conditions = [];
    if (startDate) conditions.push(gte(transactions.date, startDate));
    if (endDate) conditions.push(lte(transactions.date, endDate));
    if (accountId) conditions.push(eq(transactions.account_id, parseInt(accountId, 10)));
    if (categoryId) {
      const catId = parseInt(categoryId, 10);
      conditions.push(
        or(
          eq(transactions.category_id, catId),
          sql`EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = ${transactions.id} AND ts.category_id = ${catId})`
        )!
      );
    }
    if (groupName) {
      conditions.push(
        or(
          eq(categories.group_name, groupName),
          sql`EXISTS (SELECT 1 FROM transaction_splits ts JOIN categories c2 ON ts.category_id = c2.id WHERE ts.transaction_id = ${transactions.id} AND c2.group_name = ${groupName})`
        )!
      );
    }
    if (type === 'income') {
      conditions.push(
        or(
          eq(categories.type, 'income'),
          sql`EXISTS (SELECT 1 FROM transaction_splits ts JOIN categories c2 ON ts.category_id = c2.id WHERE ts.transaction_id = ${transactions.id} AND c2.type = 'income')`
        )!
      );
    }
    if (type === 'expense') {
      conditions.push(
        or(
          eq(categories.type, 'expense'),
          sql`EXISTS (SELECT 1 FROM transaction_splits ts JOIN categories c2 ON ts.category_id = c2.id WHERE ts.transaction_id = ${transactions.id} AND c2.type = 'expense')`
        )!
      );
    }
    if (owner) conditions.push(sql`EXISTS (SELECT 1 FROM account_owners ao JOIN users u ON ao.user_id = u.id WHERE ao.account_id = ${accounts.id} AND u.display_name = ${owner})`);
    if (search) {
      conditions.push(
        or(
          like(transactions.description, `%${search}%`),
          like(transactions.note, `%${search}%`),
        )!
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumn =
      sortBy === 'amount' ? transactions.amount :
      sortBy === 'description' ? transactions.description :
      sortBy === 'account' ? accounts.name :
      sortBy === 'category' ? categories.group_name :
      transactions.date;
    const orderFn = sortOrder === 'asc' ? asc : desc;

    const rows = db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        note: transactions.note,
        amount: transactions.amount,
        created_at: transactions.created_at,
        account_id: accounts.id,
        account_name: accounts.name,
        account_last_four: accounts.last_four,
        account_owner: accounts.owner,
        category_id: categories.id,
        category_group_name: categories.group_name,
        category_sub_name: categories.sub_name,
        category_display_name: categories.display_name,
        category_type: categories.type,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.account_id, accounts.id))
      .leftJoin(categories, eq(transactions.category_id, categories.id))
      .where(where)
      .orderBy(orderFn(sortColumn), desc(transactions.id))
      .limit(limit)
      .offset(offset)
      .all();

    // Get total count
    const [{ count }] = db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.account_id, accounts.id))
      .leftJoin(categories, eq(transactions.category_id, categories.id))
      .where(where)
      .all();

    const ownerMap = getAccountOwners([...new Set(rows.map((r) => r.account_id))]);
    const splitsMap = getSplitsForTransactions(rows.map(r => r.id));

    const data = rows.map((r) => {
      const owners = ownerMap.get(r.account_id) || [];
      const splits = splitsMap.get(r.id) || null;
      return {
        id: r.id,
        date: r.date,
        description: r.description,
        note: r.note,
        amount: r.amount,
        created_at: r.created_at,
        account: {
          id: r.account_id,
          name: r.account_name,
          lastFour: r.account_last_four,
          owner: r.account_owner,
          owners,
          isShared: owners.length > 1,
        },
        category: r.category_id ? {
          id: r.category_id,
          groupName: r.category_group_name,
          subName: r.category_sub_name,
          displayName: r.category_display_name,
          type: r.category_type,
        } : null,
        splits,
      };
    });

    res.json({ data, total: count });
  } catch (err) {
    console.error('GET /transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET /api/transactions/summary — income/expense totals for filters
router.get('/summary', (req: Request, res: Response) => {
  try {
    const { startDate, endDate, accountId, owner } = req.query as Record<string, string | undefined>;

    const conditions = [];
    if (startDate) conditions.push(gte(transactions.date, startDate));
    if (endDate) conditions.push(lte(transactions.date, endDate));
    if (accountId) conditions.push(eq(transactions.account_id, parseInt(accountId, 10)));
    if (owner) conditions.push(sql`EXISTS (SELECT 1 FROM account_owners ao JOIN users u ON ao.user_id = u.id WHERE ao.account_id = ${accounts.id} AND u.display_name = ${owner})`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [result] = db
      .select({
        totalIncome: sql<number>`coalesce(sum(case when ${transactions.amount} < 0 then abs(${transactions.amount}) else 0 end), 0)`,
        totalExpenses: sql<number>`coalesce(sum(case when ${transactions.amount} >= 0 then ${transactions.amount} else 0 end), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.account_id, accounts.id))
      .where(where)
      .all();

    res.json({ data: result });
  } catch (err) {
    console.error('GET /transactions/summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /api/transactions/:id — single transaction
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const rows = db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        note: transactions.note,
        amount: transactions.amount,
        created_at: transactions.created_at,
        account_id: accounts.id,
        account_name: accounts.name,
        account_last_four: accounts.last_four,
        account_owner: accounts.owner,
        category_id: categories.id,
        category_group_name: categories.group_name,
        category_sub_name: categories.sub_name,
        category_display_name: categories.display_name,
        category_type: categories.type,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.account_id, accounts.id))
      .leftJoin(categories, eq(transactions.category_id, categories.id))
      .where(eq(transactions.id, id))
      .all();

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const r = rows[0];
    const owners = getAccountOwners([r.account_id]).get(r.account_id) || [];
    const splits = getSplitsForTransactions([id]).get(id) || null;
    res.json({
      data: {
        id: r.id,
        date: r.date,
        description: r.description,
        note: r.note,
        amount: r.amount,
        created_at: r.created_at,
        account: { id: r.account_id, name: r.account_name, lastFour: r.account_last_four, owner: r.account_owner, owners, isShared: owners.length > 1 },
        category: r.category_id ? { id: r.category_id, groupName: r.category_group_name, subName: r.category_sub_name, displayName: r.category_display_name, type: r.category_type } : null,
        splits,
      },
    });
  } catch (err) {
    console.error('GET /transactions/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// POST /api/transactions — create
router.post('/', requirePermission('transactions.create'), (req: Request, res: Response) => {
  try {
    const { accountId, date, description, note, categoryId, amount, splits } = sanitize(req.body);
    const parsedAmount = parseFloat(amount);

    if (!accountId || !date || !description || amount === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate: must have either categoryId or splits, not both
    if (splits && splits.length > 0) {
      const err = validateSplits(splits, parsedAmount);
      if (err) return res.status(400).json({ error: err });

      const result = db.insert(transactions).values({
        account_id: accountId,
        date,
        description,
        note: note || null,
        category_id: null,
        amount: parsedAmount,
      }).run();

      const txnId = Number(result.lastInsertRowid);
      saveSplits(txnId, splits);
      res.status(201).json({ data: { id: txnId } });
    } else {
      if (!categoryId) {
        return res.status(400).json({ error: 'categoryId or splits required' });
      }
      const result = db.insert(transactions).values({
        account_id: accountId,
        date,
        description,
        note: note || null,
        category_id: categoryId,
        amount: parsedAmount,
      }).run();

      res.status(201).json({ data: { id: result.lastInsertRowid } });
    }
  } catch (err) {
    console.error('POST /transactions error:', err);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT /api/transactions/:id — update
router.put('/:id', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { accountId, date, description, note, categoryId, amount, splits } = sanitize(req.body);

    const existing = db.select().from(transactions).where(eq(transactions.id, id)).all();
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const newAmount = amount !== undefined ? parseFloat(amount) : existing[0].amount;

    if (splits && splits.length > 0) {
      // Switching to split mode
      const err = validateSplits(splits, newAmount);
      if (err) return res.status(400).json({ error: err });

      db.update(transactions)
        .set({
          account_id: accountId ?? existing[0].account_id,
          date: date ?? existing[0].date,
          description: description ?? existing[0].description,
          note: note !== undefined ? note : existing[0].note,
          category_id: null,
          amount: newAmount,
        })
        .where(eq(transactions.id, id))
        .run();

      saveSplits(id, splits);
    } else if (categoryId) {
      // Switching to single category (or staying single) — clear any existing splits
      db.delete(transactionSplits).where(eq(transactionSplits.transaction_id, id)).run();

      db.update(transactions)
        .set({
          account_id: accountId ?? existing[0].account_id,
          date: date ?? existing[0].date,
          description: description ?? existing[0].description,
          note: note !== undefined ? note : existing[0].note,
          category_id: categoryId,
          amount: newAmount,
        })
        .where(eq(transactions.id, id))
        .run();
    } else {
      // No category or splits change — just update other fields
      db.update(transactions)
        .set({
          account_id: accountId ?? existing[0].account_id,
          date: date ?? existing[0].date,
          description: description ?? existing[0].description,
          note: note !== undefined ? note : existing[0].note,
          category_id: existing[0].category_id,
          amount: newAmount,
        })
        .where(eq(transactions.id, id))
        .run();
    }

    res.json({ data: { id } });
  } catch (err) {
    console.error('PUT /transactions/:id error:', err);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// DELETE /api/transactions/:id — delete
router.delete('/:id', requirePermission('transactions.delete'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = db.select().from(transactions).where(eq(transactions.id, id)).all();
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    db.delete(transactions).where(eq(transactions.id, id)).run();
    res.json({ data: { id } });
  } catch (err) {
    console.error('DELETE /transactions/:id error:', err);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// POST /api/transactions/bulk-update
router.post('/bulk-update', requirePermission('transactions.bulk_edit'), (req: Request, res: Response) => {
  try {
    const { ids, updates } = req.body as {
      ids: number[];
      updates: { date?: string; accountId?: number; categoryId?: number; description?: { find: string; replace: string } };
    };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }

    let affected = 0;

    // Handle description find & replace separately (needs per-row logic)
    if (updates.description) {
      const { find, replace } = updates.description;
      const rows = db.select({ id: transactions.id, description: transactions.description })
        .from(transactions)
        .where(inArray(transactions.id, ids))
        .all();
      for (const row of rows) {
        if (row.description.includes(find)) {
          db.update(transactions)
            .set({ description: row.description.replaceAll(find, replace) })
            .where(eq(transactions.id, row.id))
            .run();
          affected++;
        }
      }
    }

    // Handle simple field updates
    const setFields: Record<string, unknown> = {};
    if (updates.date) setFields.date = updates.date;
    if (updates.accountId) setFields.account_id = updates.accountId;
    if (updates.categoryId) setFields.category_id = updates.categoryId;

    if (Object.keys(setFields).length > 0) {
      // If changing category, clear any existing splits on these transactions
      if (updates.categoryId) {
        db.delete(transactionSplits)
          .where(inArray(transactionSplits.transaction_id, ids))
          .run();
      }

      const result = db.update(transactions)
        .set(setFields)
        .where(inArray(transactions.id, ids))
        .run();
      affected = result.changes;
    }

    res.json({ data: { affected } });
  } catch (err) {
    console.error('POST /transactions/bulk-update error:', err);
    res.status(500).json({ error: 'Bulk update failed' });
  }
});

// POST /api/transactions/bulk-delete
router.post('/bulk-delete', requirePermission('transactions.bulk_edit'), (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: number[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }

    const result = db.delete(transactions)
      .where(inArray(transactions.id, ids))
      .run();

    res.json({ data: { affected: result.changes } });
  } catch (err) {
    console.error('POST /transactions/bulk-delete error:', err);
    res.status(500).json({ error: 'Bulk delete failed' });
  }
});

// POST /api/transactions/check-duplicate — check if a transaction looks like a duplicate
router.post('/check-duplicate', (req: Request, res: Response) => {
  try {
    const { date, amount, description } = req.body as {
      date: string;
      amount: number;
      description: string;
    };

    if (!date || amount === undefined || !description) {
      res.status(400).json({ error: 'date, amount, and description are required' });
      return;
    }

    const results = detectDuplicates([{ date, amount, description }]);
    const result = results[0];

    if (result.status === 'none') {
      res.json({ data: { status: 'none' } });
      return;
    }

    // Fetch the matched transaction details for comparison
    let match = null;
    if (result.matchId) {
      match = sqlite.prepare(`
        SELECT t.id, t.date, t.description, t.amount, t.note,
               a.name as account_name,
               c.group_name, c.sub_name
        FROM transactions t
        LEFT JOIN accounts a ON t.account_id = a.id
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.id = ?
      `).get(result.matchId) as {
        id: number; date: string; description: string; amount: number; note: string | null;
        account_name: string | null; group_name: string | null; sub_name: string | null;
      } | undefined;
    }

    res.json({
      data: {
        status: result.status,
        match: match ? {
          id: match.id,
          date: match.date,
          description: match.description,
          amount: match.amount,
          notes: match.note,
          accountName: match.account_name,
          category: match.group_name && match.sub_name ? `${match.group_name} → ${match.sub_name}` : null,
        } : null,
      },
    });
  } catch (err) {
    console.error('POST /transactions/check-duplicate error:', err);
    res.status(500).json({ error: 'Duplicate check failed' });
  }
});

export default router;
