import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { transactions, categories } from '../db/schema.js';
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
      } else if (row.type === 'transfer') {
        // Money between the user's own accounts is not spending. Unlike /period
        // this endpoint has no exclude_from_budget filter, so without this branch
        // every transfer would land in expensesByGroup below.
        continue;
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

// GET /api/reports/period
// Filtered, split-aware, date-bucketed aggregation that powers the whole Reports
// page (KPIs, flow bar, trends, category breakdown, timeline, drill-down).
// Query: start, end (YYYY-MM-DD, required); owner; and the filter set —
// accountIds, merchantIds, categoryIds, groupNames (comma-separated),
// amountOp (gt|lt|eq|bt) + amountValue|amountMin|amountMax, txnType (debits|credits).
router.get('/period', (req: Request, res: Response) => {
  try {
    const start = req.query.start as string;
    const end = req.query.end as string;
    if (!start || !end) { res.status(400).json({ error: 'start and end are required' }); return; }
    const owner = (req.query.owner as string) || 'all';

    const csvInts = (v: unknown) => String(v ?? '').split(',').map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
    const csvStrs = (v: unknown) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const accountIds = req.query.accountIds ? csvInts(req.query.accountIds) : [];
    const merchantIds = req.query.merchantIds ? csvInts(req.query.merchantIds) : [];
    const categoryIds = req.query.categoryIds ? csvInts(req.query.categoryIds) : [];
    const groupNames = req.query.groupNames ? csvStrs(req.query.groupNames) : [];
    const amountOp = req.query.amountOp as string | undefined;
    const txnType = req.query.txnType as string | undefined; // debits | credits (by sign)
    const catType = req.query.catType as string | undefined; // income | expense (by category type)

    const conditions: string[] = ['l.date >= ?', 'l.date <= ?'];
    const params: (string | number)[] = [start, end];
    if (owner !== 'all') {
      conditions.push('EXISTS (SELECT 1 FROM account_owners ao JOIN users u ON ao.user_id = u.id WHERE ao.account_id = l.account_id AND u.display_name = ?)');
      params.push(owner);
    }
    if (accountIds.length) { conditions.push(`l.account_id IN (${accountIds.map(() => '?').join(',')})`); params.push(...accountIds); }
    if (merchantIds.length) { conditions.push(`l.merchant_id IN (${merchantIds.map(() => '?').join(',')})`); params.push(...merchantIds); }
    // Categories dimension: sub-category ids OR whole groups (OR-combined).
    if (categoryIds.length || groupNames.length) {
      const parts: string[] = [];
      if (categoryIds.length) { parts.push(`l.category_id IN (${categoryIds.map(() => '?').join(',')})`); params.push(...categoryIds); }
      if (groupNames.length) { parts.push(`c.group_name IN (${groupNames.map(() => '?').join(',')})`); params.push(...groupNames); }
      conditions.push(`(${parts.join(' OR ')})`);
    }
    if (amountOp === 'bt') {
      const min = parseFloat(req.query.amountMin as string);
      const max = parseFloat(req.query.amountMax as string);
      if (!Number.isNaN(min)) { conditions.push('ABS(l.amount) >= ?'); params.push(min); }
      if (!Number.isNaN(max)) { conditions.push('ABS(l.amount) <= ?'); params.push(max); }
    } else if (amountOp === 'gt' || amountOp === 'lt' || amountOp === 'eq') {
      const val = parseFloat(req.query.amountValue as string);
      if (!Number.isNaN(val)) { conditions.push(`ABS(l.amount) ${amountOp === 'gt' ? '>' : amountOp === 'lt' ? '<' : '='} ?`); params.push(val); }
    }
    // Sign convention: positive stored = money out (debit), negative = money in (credit).
    if (txnType === 'debits') conditions.push('l.amount > 0');
    else if (txnType === 'credits') conditions.push('l.amount < 0');
    if (catType === 'income' || catType === 'expense') { conditions.push('c.type = ?'); params.push(catType); }
    // Categories flagged "hidden from budget" are excluded from every Reports
    // rollup (KPIs, flow, breakdown, timeline). A group whose categories are all
    // hidden then has no rows and won't render. Only the Transactions page shows
    // these. (DEFAULT 0; COALESCE guards any legacy NULLs.)
    conditions.push('COALESCE(c.exclude_from_budget, 0) = 0');

    const rows = sqlite.prepare(`
      WITH legs AS (
        SELECT t.category_id AS category_id, t.merchant_id AS merchant_id, t.account_id AS account_id, t.date AS date, t.amount AS amount
        FROM transactions t
        WHERE t.category_id IS NOT NULL
        UNION ALL
        SELECT ts.category_id AS category_id, COALESCE(ts.merchant_id, t.merchant_id) AS merchant_id, t.account_id AS account_id, t.date AS date, ts.amount AS amount
        FROM transaction_splits ts
        JOIN transactions t ON ts.transaction_id = t.id
        WHERE t.category_id IS NULL
      )
      SELECT l.category_id, l.date, coalesce(sum(l.amount), 0) as total
      FROM legs l
      JOIN categories c ON c.id = l.category_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY l.category_id, l.date
    `).all(...params) as { category_id: number; date: string; total: number }[];

    // Category metadata.
    const cats = db.select().from(categories).all();
    const catMeta = new Map(cats.map((c) => [c.id, c]));

    // ---- buckets: weekly for a short (<= 31 day) span, else one per calendar month ----
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const MSHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    const DAY = 86400000;
    const spanDays = Math.round((e.getTime() - s.getTime()) / DAY) + 1;
    const buckets: { label: string; start: string; end: string }[] = [];
    if (spanDays <= 31) {
      let cur = new Date(s);
      let i = 0;
      while (cur.getTime() <= e.getTime()) {
        const bEnd = new Date(Math.min(cur.getTime() + 6 * DAY, e.getTime()));
        buckets.push({ label: `Wk ${i + 1}`, start: ymd(cur), end: ymd(bEnd) });
        cur = new Date(bEnd.getTime() + DAY);
        i++;
      }
    } else {
      let y = s.getFullYear();
      let m = s.getMonth();
      const multiYear = s.getFullYear() !== e.getFullYear();
      while (y < e.getFullYear() || (y === e.getFullYear() && m <= e.getMonth())) {
        const mStart = new Date(y, m, 1);
        const mEnd = new Date(y, m + 1, 0);
        const bs = mStart < s ? s : mStart;
        const be = mEnd > e ? e : mEnd;
        buckets.push({ label: multiYear ? `${MSHORT[m]} '${pad2(y % 100)}` : MSHORT[m], start: ymd(bs), end: ymd(be) });
        m++; if (m > 11) { m = 0; y++; }
      }
    }
    const bucketOf = (date: string) => {
      for (let i = 0; i < buckets.length; i++) if (date >= buckets[i].start && date <= buckets[i].end) return i;
      return -1;
    };

    // ---- roll rows into per-category bucketed series ----
    type CatAgg = { categoryId: number; groupName: string; subName: string; type: string; sortOrder: number; buckets: number[]; total: number };
    const aggMap = new Map<number, CatAgg>();
    for (const r of rows) {
      const meta = catMeta.get(r.category_id);
      if (!meta) continue;
      let a = aggMap.get(r.category_id);
      if (!a) {
        a = { categoryId: r.category_id, groupName: meta.group_name, subName: meta.sub_name, type: meta.type, sortOrder: meta.sort_order ?? 0, buckets: new Array(buckets.length).fill(0), total: 0 };
        aggMap.set(r.category_id, a);
      }
      const bi = bucketOf(r.date);
      if (bi < 0) continue;
      a.buckets[bi] += r.total;
    }
    // Sign per type: income stored negative → positive magnitude (clamp per bucket);
    // expenses keep raw net (outflow positive).
    const categoriesOut = Array.from(aggMap.values()).map((a) => {
      const isIncome = a.type === 'income';
      const b = a.buckets.map((v) => (isIncome ? (v < 0 ? -v : 0) : v));
      return { categoryId: a.categoryId, groupName: a.groupName, subName: a.subName, type: a.type, sortOrder: a.sortOrder, buckets: b, total: b.reduce((x, y) => x + y, 0) };
    }).filter((c) => c.total !== 0 || c.buckets.some((v) => v !== 0));

    // ---- KPIs ----
    const sumType = (t: string) => categoriesOut.filter((c) => c.type === t).reduce((x, c) => x + c.total, 0);
    const income = sumType('income');
    const expenses = sumType('expense');
    const net = income - expenses;
    // What you kept: income you did not spend. Money moved into a savings account
    // is a transfer and is excluded from both terms, so it simply stays in `net`.
    // Goes negative when you outspend your income — that is worth showing.
    const savingsRate = income > 0 ? net / income : 0;
    const incomeSourceCount = categoriesOut.filter((c) => c.type === 'income' && c.total > 0).length;
    // Distinct calendar months the range touches (for avg/mo figures).
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;

    res.json({
      data: {
        range: { start, end, months },
        buckets,
        categories: categoriesOut,
        kpis: { income, expenses, net, savingsRate, incomeSourceCount },
      },
    });
  } catch (err) {
    console.error('GET /reports/period error:', err);
    res.status(500).json({ error: 'Failed to fetch period report' });
  }
});

export default router;
