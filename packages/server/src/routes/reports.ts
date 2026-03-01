import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { transactions } from '../db/schema.js';
import { sql } from 'drizzle-orm';

const router = Router();

// GET /api/reports/available-years
router.get('/available-years', (_req: Request, res: Response) => {
  try {
    const rows = db.select({
      year: sql<number>`distinct cast(substr(${transactions.date}, 1, 4) as integer)`,
    }).from(transactions)
      .orderBy(sql`cast(substr(${transactions.date}, 1, 4) as integer) desc`)
      .all();

    res.json({ data: rows.map((r) => r.year) });
  } catch (err) {
    console.error('GET /reports/available-years error:', err);
    res.status(500).json({ error: 'Failed to fetch available years' });
  }
});

// GET /api/reports/annual?year=YYYY&owner=all|Robert|Kathleen
router.get('/annual', (req: Request, res: Response) => {
  try {
    const year = (req.query.year as string) || String(new Date().getFullYear());
    const owner = (req.query.owner as string) || 'all';

    const ownerClause = owner !== 'all'
      ? `AND EXISTS (SELECT 1 FROM account_owners ao JOIN users u ON ao.user_id = u.id WHERE ao.account_id = a.id AND u.display_name = ?)`
      : '';
    const params: string[] = [year];
    if (owner !== 'all') params.push(owner);
    params.push(year);
    if (owner !== 'all') params.push(owner);

    // Get monthly totals per category — UNION of non-split + split transactions
    const rows = sqlite.prepare(`
      SELECT category_id, c.group_name, c.sub_name, c.type, c.sort_order,
             cast(substr(date, 6, 2) as integer) as month,
             coalesce(sum(amount), 0) as total
      FROM (
        SELECT t.category_id, t.date, t.amount
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE t.category_id IS NOT NULL
          AND substr(t.date, 1, 4) = ? ${ownerClause}
        UNION ALL
        SELECT ts.category_id, t.date, ts.amount
        FROM transaction_splits ts
        JOIN transactions t ON ts.transaction_id = t.id
        JOIN accounts a ON t.account_id = a.id
        WHERE t.category_id IS NULL
          AND substr(t.date, 1, 4) = ? ${ownerClause}
      ) combined
      JOIN categories c ON combined.category_id = c.id
      GROUP BY combined.category_id, month
      ORDER BY c.sort_order, c.sub_name
    `).all(...params) as {
      category_id: number; group_name: string; sub_name: string; type: string;
      sort_order: number; month: number; total: number;
    }[];

    // Build income data: keyed by sub_name → 12 monthly totals
    // Income is stored as negative, so we take abs
    const incomeByCategory: Record<string, number[]> = {};
    const expensesByGroup: Record<string, Record<string, number[]>> = {};

    for (const row of rows) {
      const monthIdx = row.month - 1;
      if (row.type === 'income') {
        if (!incomeByCategory[row.sub_name]) {
          incomeByCategory[row.sub_name] = new Array(12).fill(0);
        }
        incomeByCategory[row.sub_name][monthIdx] += Math.abs(row.total);
      } else {
        if (!expensesByGroup[row.group_name]) {
          expensesByGroup[row.group_name] = {};
        }
        if (!expensesByGroup[row.group_name][row.sub_name]) {
          expensesByGroup[row.group_name][row.sub_name] = new Array(12).fill(0);
        }
        // Net expenses including refunds (negative amounts reduce the total)
        expensesByGroup[row.group_name][row.sub_name][monthIdx] += row.total;
      }
    }

    // Compute monthly totals
    const monthlyIncomeTotals = new Array(12).fill(0);
    for (const vals of Object.values(incomeByCategory)) {
      for (let i = 0; i < 12; i++) monthlyIncomeTotals[i] += vals[i];
    }

    const monthlyExpenseTotals = new Array(12).fill(0);
    for (const group of Object.values(expensesByGroup)) {
      for (const vals of Object.values(group)) {
        for (let i = 0; i < 12; i++) monthlyExpenseTotals[i] += vals[i];
      }
    }

    const monthlyNetTotals = monthlyIncomeTotals.map((inc, i) => inc - monthlyExpenseTotals[i]);

    res.json({
      data: {
        incomeByCategory,
        expensesByGroup,
        monthlyIncomeTotals,
        monthlyExpenseTotals,
        monthlyNetTotals,
      },
    });
  } catch (err) {
    console.error('GET /reports/annual error:', err);
    res.status(500).json({ error: 'Failed to fetch annual report' });
  }
});

export default router;
