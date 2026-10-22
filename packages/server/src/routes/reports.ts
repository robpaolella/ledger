import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { transactions, categories } from '../db/schema.js';
import { sql } from 'drizzle-orm';
import { isUncategorizedSql } from '../services/reviews.js';
import { CATEGORIZED_LEGS_SQL, contributionFigures, contributionTransactions, isTrackedCategory, joinWhere, legAccountFilters, legFilters, parseReportFilters } from '../services/reportLegs.js';
import { clampInt, isValidYmd } from '../utils/validate.js';
import type { UncategorizedBucketed } from '@ledger/shared/src/types.js';

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

// GET /api/reports/period
// Filtered, split-aware, date-bucketed aggregation that powers the whole Reports
// page (KPIs, flow bar, trends, category breakdown, timeline, drill-down).
// Query: start, end (YYYY-MM-DD, required); owner; and the filter set —
// accountIds, merchantIds, categoryIds, groupNames (comma-separated),
// amountOp (gt|lt|eq|bt) + amountValue|amountMin|amountMax, txnType (debits|credits),
// catType (income|expense). Also returns `contributions` (ReportContribution[]).
router.get('/period', (req: Request, res: Response) => {
  try {
    const f = parseReportFilters(req.query);
    const { start, end, catType } = f;
    if (!start || !end) { res.status(400).json({ error: 'start and end are required' }); return; }

    const { conditions, params } = joinWhere(
      { conditions: ['l.date >= ?', 'l.date <= ?'], params: [start, end] },
      legAccountFilters(f),
      legFilters(f),
    );
    // Uncategorized legs (category_id NULL) take their side from direction, and
    // drop out under any category filter above (NULL never matches IN).
    if (catType === 'income' || catType === 'expense') {
      conditions.push(`(c.type = ? OR (l.category_id IS NULL AND l.amount ${catType === 'income' ? '<' : '>'} 0))`);
      params.push(catType);
    }
    // Categories flagged "hidden from budget" are excluded from every Reports
    // rollup (KPIs, flow, breakdown, timeline). A group whose categories are all
    // hidden then has no rows and won't render. Only the Transactions page shows
    // these. (DEFAULT 0; COALESCE guards any legacy NULLs.)
    conditions.push('COALESCE(c.exclude_from_budget, 0) = 0');

    const rows = sqlite.prepare(`
      WITH legs AS (${CATEGORIZED_LEGS_SQL}
        UNION ALL
        SELECT t.id AS transaction_id, NULL AS split_id, NULL AS category_id, t.merchant_id AS merchant_id, t.account_id AS account_id, t.date AS date, t.amount AS amount
        FROM transactions t
        WHERE ${isUncategorizedSql('t')}
      )
      SELECT l.category_id, l.date, coalesce(sum(l.amount), 0) as total, count(*) as n,
             CASE WHEN l.category_id IS NULL THEN l.amount > 0 END AS out
      FROM legs l
      LEFT JOIN categories c ON c.id = l.category_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY l.category_id, l.date, out
    `).all(...params) as { category_id: number | null; date: string; total: number; n: number; out: number | null }[];

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
    // Uncategorized: positive magnitudes by direction, per bucket and in total.
    const uncategorized: UncategorizedBucketed = {
      count: 0, moneyOut: 0, moneyIn: 0,
      buckets: buckets.map(() => ({ count: 0, moneyOut: 0, moneyIn: 0 })),
    };
    for (const r of rows) {
      if (r.category_id == null) {
        const bi = bucketOf(r.date);
        if (bi < 0) continue;
        const b = uncategorized.buckets[bi];
        b.count += r.n; uncategorized.count += r.n;
        if (r.out) { b.moneyOut += r.total; uncategorized.moneyOut += r.total; }
        else { b.moneyIn -= r.total; uncategorized.moneyIn -= r.total; }
        continue;
      }
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
    const income = sumType('income') + uncategorized.moneyIn;
    const expenses = sumType('expense') + uncategorized.moneyOut;
    const net = income - expenses;
    // What you kept: income you did not spend. Money moved into a savings account
    // is a transfer and is excluded from both terms, so it simply stays in `net`.
    // Goes negative when you outspend your income — that is worth showing.
    const savingsRate = income > 0 ? net / income : 0;
    const incomeSourceCount = categoriesOut.filter((c) => c.type === 'income' && c.total > 0).length;
    // Distinct calendar months the range touches (for avg/mo figures).
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;

    // Contributions: a separate view of tracked transfers. They never feed the
    // figures above (Transfers stay excluded from every rollup).
    const contributions = contributionFigures(sqlite, f, bucketOf, buckets.length);

    res.json({
      data: {
        range: { start, end, months },
        buckets,
        categories: categoriesOut,
        kpis: { income, expenses, net, savingsRate, incomeSourceCount },
        uncategorized,
        contributions,
      },
    });
  } catch (err) {
    console.error('GET /reports/period error:', err);
    res.status(500).json({ error: 'Failed to fetch period report' });
  }
});

// GET /api/reports/contributions/:categoryId/transactions
// The transactions behind one tracked category's contribution figures, under
// the same filters as /period. Paging and sort like GET /api/transactions
// (sortBy date|amount, thenBy=absAmount); returns { data, total }.
router.get('/contributions/:categoryId/transactions', (req: Request, res: Response) => {
  try {
    const rawId = req.params.categoryId as string;
    const categoryId = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
    if (Number.isNaN(categoryId) || !isTrackedCategory(sqlite, categoryId)) {
      return res.status(404).json({ error: 'This category is not set up for contribution tracking.' });
    }
    const f = parseReportFilters(req.query);
    if (!isValidYmd(f.start) || !isValidYmd(f.end)) {
      return res.status(400).json({ error: 'Choose a start and end date.' });
    }
    const q = req.query;
    res.json(contributionTransactions(sqlite, f, categoryId, {
      sortBy: q.sortBy as string | undefined,
      sortOrder: q.sortOrder as string | undefined,
      thenBy: q.thenBy as string | undefined,
      thenOrder: q.thenOrder as string | undefined,
      limit: clampInt(q.limit as string | undefined, 50, 1, 1000),
      offset: clampInt(q.offset as string | undefined, 0, 0, 1_000_000),
    }));
  } catch (err) {
    console.error('GET /reports/contributions transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch contribution transactions' });
  }
});

export default router;
