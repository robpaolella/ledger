import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { budgets, categories } from '../db/schema.js';
import { eq, and, asc, sql } from 'drizzle-orm';
import { requirePermission } from '../middleware/permissions.js';
import { getRecurringFloors, effectiveBudgetedAmount } from '../services/recurringBudget.js';

const router = Router();

function monthRange(month: string): { startDate: string; endDate: string } {
  const [year, m] = month.split('-').map(Number);
  const startDate = `${year}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

// GET /api/budgets?month=YYYY-MM
router.get('/', (req: Request, res: Response) => {
  try {
    const month = req.query.month as string;
    if (!month) {
      res.status(400).json({ error: 'month query parameter is required' });
      return;
    }

    const rows = db.select({
      id: budgets.id,
      category_id: budgets.category_id,
      month: budgets.month,
      amount: budgets.amount,
      group_name: categories.group_name,
      sub_name: categories.sub_name,
      display_name: categories.display_name,
      type: categories.type,
    }).from(budgets)
      .innerJoin(categories, eq(budgets.category_id, categories.id))
      .where(eq(budgets.month, month))
      .all();

    res.json({ data: rows });
  } catch (err) {
    console.error('GET /budgets error:', err);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

// POST /api/budgets — upsert
router.post('/', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const { categoryId, month, amount } = req.body;
    if (!categoryId || !month || amount == null) {
      res.status(400).json({ error: 'categoryId, month, and amount are required' });
      return;
    }
    const override = req.body.override ? 1 : 0; // per-month sub-floor override

    // Check if exists
    const existing = db.select().from(budgets)
      .where(and(eq(budgets.category_id, categoryId), eq(budgets.month, month)))
      .get();

    if (existing) {
      db.update(budgets)
        .set({ amount, override })
        .where(eq(budgets.id, existing.id))
        .run();
      res.json({ data: { ...existing, amount, override } });
    } else {
      const result = db.insert(budgets)
        .values({ category_id: categoryId, month, amount, override })
        .run();
      res.status(201).json({ data: { id: result.lastInsertRowid, category_id: categoryId, month, amount, override } });
    }
  } catch (err) {
    console.error('POST /budgets error:', err);
    res.status(500).json({ error: 'Failed to save budget' });
  }
});

// PUT /api/budgets/:id
router.put('/:id', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { amount } = req.body;
    if (amount == null) {
      res.status(400).json({ error: 'amount is required' });
      return;
    }

    const existing = db.select().from(budgets).where(eq(budgets.id, id)).get();
    if (!existing) {
      res.status(404).json({ error: 'Budget not found' });
      return;
    }

    db.update(budgets).set({ amount }).where(eq(budgets.id, id)).run();
    res.json({ data: { ...existing, amount } });
  } catch (err) {
    console.error('PUT /budgets/:id error:', err);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// DELETE /api/budgets/:id
router.delete('/:id', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = db.select().from(budgets).where(eq(budgets.id, id)).get();
    if (!existing) {
      res.status(404).json({ error: 'Budget not found' });
      return;
    }

    db.delete(budgets).where(eq(budgets.id, id)).run();
    res.json({ data: { success: true } });
  } catch (err) {
    console.error('DELETE /budgets/:id error:', err);
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

// GET /api/budgets/summary?month=YYYY-MM&owner=all|Robert|Kathleen
router.get('/summary', (req: Request, res: Response) => {
  try {
    const month = req.query.month as string;
    if (!month) {
      res.status(400).json({ error: 'month query parameter is required' });
      return;
    }
    const owner = (req.query.owner as string) || 'all';
    const { startDate, endDate } = monthRange(month);

    // Get all categories
    const allCategories = db.select().from(categories)
      .where(sql`COALESCE(${categories.exclude_from_budget}, 0) = 0 AND ${categories.type} <> 'transfer'`)
      .orderBy(asc(categories.sort_order), asc(categories.sub_name))
      .all();

    // Get budgets for this month
    const monthBudgets = db.select().from(budgets)
      .where(eq(budgets.month, month))
      .all();
    const budgetMap = new Map(monthBudgets.map((b) => [b.category_id, b]));

    // Recurring overlay: each category's recurring total for the month folds into
    // its budget — 'set' = floor (max of manual & recurring), 'add' = manual +
    // recurring. `manual` is the raw stored amount (for editing); `budgeted` is the
    // effective amount used for display + all totals.
    const floors = getRecurringFloors(month);
    type RecMeta = { amount: number; itemCount: number; items: { label: string; cadence: string }[] };
    // Floor-only model: recurring is the minimum. override bypasses it for one month.
    const foldBudget = (c: { id: number }, stored: number, overridden: boolean): { budgeted: number; manual: number; recurring: RecMeta | null; overridden: boolean } => {
      const f = floors.get(c.id);
      if (!f) return { budgeted: stored, manual: stored, recurring: null, overridden: false };
      const budgeted = effectiveBudgetedAmount(stored, overridden, f.amount);
      return { budgeted, manual: stored, recurring: { amount: f.amount, itemCount: f.itemCount, items: f.items }, overridden };
    };

    // Get actuals from transactions — optionally filtered by owner
    // Uses UNION to combine non-split transactions with split amounts
    const ownerClause = owner !== 'all'
      ? `AND EXISTS (SELECT 1 FROM account_owners ao JOIN users u ON ao.user_id = u.id WHERE ao.account_id = a.id AND u.display_name = ?)`
      : '';
    const params: (string)[] = [startDate, endDate];
    if (owner !== 'all') params.push(owner);
    params.push(startDate, endDate);
    if (owner !== 'all') params.push(owner);

    const actuals = sqlite.prepare(`
      SELECT category_id, coalesce(sum(amount), 0) as total
      FROM (
        SELECT t.category_id, t.amount
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE t.category_id IS NOT NULL
          AND t.date >= ? AND t.date <= ? ${ownerClause}
        UNION ALL
        SELECT ts.category_id, ts.amount
        FROM transaction_splits ts
        JOIN transactions t ON ts.transaction_id = t.id
        JOIN accounts a ON t.account_id = a.id
        WHERE t.category_id IS NULL
          AND t.date >= ? AND t.date <= ? ${ownerClause}
      )
      GROUP BY category_id
    `).all(...params) as { category_id: number; total: number }[];
    const actualMap = new Map(actuals.map((a) => [a.category_id, a.total]));

    // Build income summary (group_name = "Income")
    const incomeCategories = allCategories.filter((c) => c.type === 'income');
    const incomeRows = incomeCategories.map((c) => {
      const budget = budgetMap.get(c.id);
      const actual = actualMap.get(c.id) ?? 0;
      // Income transactions are stored negative, so actual income = abs(negative total)
      const actualIncome = actual < 0 ? Math.abs(actual) : 0;
      const fold = foldBudget(c, budget?.amount ?? 0, !!budget?.override);
      return {
        categoryId: c.id,
        subName: c.sub_name,
        budgeted: fold.budgeted,
        manual: fold.manual,
        recurring: fold.recurring,
        overridden: fold.overridden,
        budgetId: budget?.id ?? null,
        actual: actualIncome,
      };
    });

    // Build expense summary grouped by parent
    const expenseCategories = allCategories.filter((c) => c.type === 'expense');
    type SubRow = { categoryId: number; subName: string; budgeted: number; manual: number; recurring: RecMeta | null; overridden: boolean; budgetId: number | null; actual: number };
    const groupMap = new Map<string, { groupName: string; subs: SubRow[] }>();

    for (const c of expenseCategories) {
      if (!groupMap.has(c.group_name)) {
        groupMap.set(c.group_name, { groupName: c.group_name, subs: [] });
      }
      const budget = budgetMap.get(c.id);
      const actual = actualMap.get(c.id) ?? 0;
      // Net expense amount (refunds reduce the total)
      const actualExpense = actual;
      const fold = foldBudget(c, budget?.amount ?? 0, !!budget?.override);
      groupMap.get(c.group_name)!.subs.push({
        categoryId: c.id,
        subName: c.sub_name,
        budgeted: fold.budgeted,
        manual: fold.manual,
        recurring: fold.recurring,
        overridden: fold.overridden,
        budgetId: budget?.id ?? null,
        actual: actualExpense,
      });
    }

    const expenseGroups = Array.from(groupMap.values()).sort((a, b) =>
      a.groupName.localeCompare(b.groupName)
    );

    // Build savings summary grouped by parent. Savings contributions are
    // outflows (positive), same sign/handling as expenses, but their own section.
    const savingsCategories = allCategories.filter((c) => c.type === 'savings');
    const savingsGroupMap = new Map<string, { groupName: string; subs: SubRow[] }>();
    for (const c of savingsCategories) {
      if (!savingsGroupMap.has(c.group_name)) {
        savingsGroupMap.set(c.group_name, { groupName: c.group_name, subs: [] });
      }
      const budget = budgetMap.get(c.id);
      const actual = actualMap.get(c.id) ?? 0;
      const fold = foldBudget(c, budget?.amount ?? 0, !!budget?.override);
      savingsGroupMap.get(c.group_name)!.subs.push({
        categoryId: c.id,
        subName: c.sub_name,
        budgeted: fold.budgeted,
        manual: fold.manual,
        recurring: fold.recurring,
        overridden: fold.overridden,
        budgetId: budget?.id ?? null,
        actual,
      });
    }
    const savingsGroups = Array.from(savingsGroupMap.values()).sort((a, b) =>
      a.groupName.localeCompare(b.groupName)
    );

    // Totals
    const totalBudgetedIncome = incomeRows.reduce((s, r) => s + r.budgeted, 0);
    const totalActualIncome = incomeRows.reduce((s, r) => s + r.actual, 0);
    const totalBudgetedExpenses = expenseGroups.reduce(
      (s, g) => s + g.subs.reduce((s2, sub) => s2 + sub.budgeted, 0), 0
    );
    const totalActualExpenses = expenseGroups.reduce(
      (s, g) => s + g.subs.reduce((s2, sub) => s2 + sub.actual, 0), 0
    );
    const totalBudgetedSavings = savingsGroups.reduce(
      (s, g) => s + g.subs.reduce((s2, sub) => s2 + sub.budgeted, 0), 0
    );
    const totalActualSavings = savingsGroups.reduce(
      (s, g) => s + g.subs.reduce((s2, sub) => s2 + sub.actual, 0), 0
    );
    // Left to budget: planned income not yet allocated to expenses or savings.
    const leftToBudget = totalBudgetedIncome - totalBudgetedExpenses - totalBudgetedSavings;

    res.json({
      data: {
        income: incomeRows,
        expenseGroups,
        savingsGroups,
        totals: {
          budgetedIncome: totalBudgetedIncome,
          actualIncome: totalActualIncome,
          budgetedExpenses: totalBudgetedExpenses,
          actualExpenses: totalActualExpenses,
          budgetedSavings: totalBudgetedSavings,
          actualSavings: totalActualSavings,
          leftToBudget,
        },
      },
    });
  } catch (err) {
    console.error('GET /budgets/summary error:', err);
    res.status(500).json({ error: 'Failed to fetch budget summary' });
  }
});

// GET /api/budgets/annual?year=YYYY — planned amounts per category for all 12 months
router.get('/annual', (req: Request, res: Response) => {
  try {
    const year = String(req.query.year || new Date().getFullYear());

    const allCategories = db.select().from(categories)
      .where(sql`COALESCE(${categories.exclude_from_budget}, 0) = 0 AND ${categories.type} <> 'transfer'`)
      .orderBy(asc(categories.sort_order), asc(categories.sub_name))
      .all();

    const yearBudgets = sqlite.prepare(
      'SELECT category_id, month, amount, override FROM budgets WHERE month LIKE ?'
    ).all(`${year}-%`) as { category_id: number; month: string; amount: number; override: number }[];

    const plannedMap = new Map<number, number[]>();
    const overrideMap = new Map<number, boolean[]>();
    for (const b of yearBudgets) {
      const mi = parseInt(b.month.slice(5, 7), 10) - 1;
      if (mi < 0 || mi > 11) continue;
      if (!plannedMap.has(b.category_id)) plannedMap.set(b.category_id, new Array(12).fill(0));
      if (!overrideMap.has(b.category_id)) overrideMap.set(b.category_id, new Array(12).fill(false));
      plannedMap.get(b.category_id)![mi] = b.amount;
      overrideMap.get(b.category_id)![mi] = !!b.override;
    }
    const plannedFor = (id: number) => plannedMap.get(id) ?? new Array(12).fill(0);
    const overrideFor = (id: number) => overrideMap.get(id) ?? new Array(12).fill(false);

    // Recurring overlay, per month, so the year view agrees with the month view.
    const monthFloors = Array.from({ length: 12 }, (_, i) => getRecurringFloors(`${year}-${String(i + 1).padStart(2, '0')}`));
    const effectivePlannedFor = (c: { id: number }): number[] => {
      const raw = plannedFor(c.id);
      const ovr = overrideFor(c.id);
      return raw.map((v, m) => {
        const f = monthFloors[m].get(c.id)?.amount ?? 0;
        if (!f || ovr[m]) return v; // no floor, or override bypasses it this month
        return Math.max(v, f);
      });
    };

    // Per-category, per-month meta so the year view's edit modal has the same
    // recurring floor / manual / override data the month view gets from /summary.
    type AnnualSub = {
      categoryId: number; subName: string; planned: number[]; manual: number[];
      overridden: boolean[]; recurring: ({ amount: number; itemCount: number; items: { label: string; cadence: string }[] } | null)[];
    };
    const buildSub = (c: { id: number; sub_name: string }): AnnualSub => ({
      categoryId: c.id,
      subName: c.sub_name,
      planned: effectivePlannedFor(c),
      manual: plannedFor(c.id),
      overridden: overrideFor(c.id),
      recurring: Array.from({ length: 12 }, (_, m) => {
        const f = monthFloors[m].get(c.id);
        return f ? { amount: f.amount, itemCount: f.itemCount, items: f.items } : null;
      }),
    });

    const income = allCategories.filter((c) => c.type === 'income').map(buildSub);

    const buildGroups = (type: string) => {
      const gm = new Map<string, { groupName: string; subs: AnnualSub[] }>();
      for (const c of allCategories.filter((c) => c.type === type)) {
        if (!gm.has(c.group_name)) gm.set(c.group_name, { groupName: c.group_name, subs: [] });
        gm.get(c.group_name)!.subs.push(buildSub(c));
      }
      return Array.from(gm.values()).sort((a, b) => a.groupName.localeCompare(b.groupName));
    };

    res.json({
      data: {
        year,
        income,
        expenseGroups: buildGroups('expense'),
        savingsGroups: buildGroups('savings'),
      },
    });
  } catch (err) {
    console.error('GET /budgets/annual error:', err);
    res.status(500).json({ error: 'Failed to fetch annual budget' });
  }
});

// GET /api/budgets/category-detail?categoryId=42
//   or /api/budgets/category-detail?group=Income&type=income[&end=YYYY-MM]
// Monthly actual series (split-aware) for one leaf sub-category (categoryId) or a
// whole group (group + DB type), plus the category's current effective monthly
// plan (floor model). Drives the Budget Category Detail drill-down page.
router.get('/category-detail', (req: Request, res: Response) => {
  try {
    const categoryIdParam = req.query.categoryId != null ? Number(req.query.categoryId) : null;
    const groupParam = (req.query.group as string) || null;
    const typeParam = (req.query.type as string) || null;

    // Resolve the target category set + breadcrumb identity.
    let cats: { id: number; group_name: string; sub_name: string; display_name: string; type: string }[];
    let category: { groupName: string; subName: string | null; displayName: string; type: string };

    if (categoryIdParam != null && !Number.isNaN(categoryIdParam)) {
      const c = db.select().from(categories).where(eq(categories.id, categoryIdParam)).all()[0];
      if (!c) { res.status(404).json({ error: 'Category not found' }); return; }
      cats = [c];
      category = { groupName: c.group_name, subName: c.sub_name, displayName: c.display_name, type: c.type };
    } else if (groupParam) {
      const rows = typeParam
        ? db.select().from(categories).where(and(eq(categories.group_name, groupParam), eq(categories.type, typeParam))).all()
        : db.select().from(categories).where(eq(categories.group_name, groupParam)).all();
      if (rows.length === 0) { res.status(404).json({ error: 'Group not found' }); return; }
      cats = rows;
      category = { groupName: groupParam, subName: null, displayName: groupParam, type: rows[0].type };
    } else {
      res.status(400).json({ error: 'categoryId or group query parameter is required' });
      return;
    }

    const ids = cats.map((c) => c.id);
    const isIncome = category.type === 'income';
    const placeholders = ids.map(() => '?').join(',');

    // ---- month window: ends at the current month (or ?end), clamped to [12, 36]
    // months so the chart always has a readable span. ----
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const endMonth = (req.query.end as string) || curMonth;
    const addMonths = (ym: string, delta: number): string => {
      const [y, m] = ym.split('-').map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    const monthsBetween = (a: string, b: string): number => {
      const [ay, am] = a.split('-').map(Number);
      const [by, bm] = b.split('-').map(Number);
      return (by - ay) * 12 + (bm - am);
    };

    // Earliest activity month across the set (parent txns or split legs).
    const earliest = (sqlite.prepare(`
      SELECT min(ym) as ym FROM (
        SELECT substr(t.date,1,7) as ym FROM transactions t
          WHERE t.category_id IN (${placeholders})
        UNION ALL
        SELECT substr(t.date,1,7) as ym FROM transaction_splits ts
          JOIN transactions t ON ts.transaction_id = t.id
          WHERE t.category_id IS NULL AND ts.category_id IN (${placeholders})
      )
    `).get(...ids, ...ids) as { ym: string | null }).ym;

    let startMonth = earliest || endMonth;
    if (monthsBetween(startMonth, endMonth) > 35) startMonth = addMonths(endMonth, -35); // cap ≤36 bars
    if (monthsBetween(startMonth, endMonth) < 11) startMonth = addMonths(endMonth, -11); // ≥12 bars
    const months: string[] = [];
    for (let ym = startMonth; monthsBetween(ym, endMonth) >= 0; ym = addMonths(ym, 1)) months.push(ym);

    const startDate = `${startMonth}-01`;
    const [ey, em] = endMonth.split('-').map(Number);
    const endDate = `${endMonth}-${String(new Date(ey, em, 0).getDate()).padStart(2, '0')}`;

    // ---- actual series (split-aware, mirrors /summary's UNION) ----
    // Group by (ym, category_id) so income can clamp each sub-category's monthly
    // net independently (net<0 ? -net : 0) BEFORE summing the group — matching how
    // /summary aggregates income. Group-net-then-clamp would understate a group
    // whose subs mix money-in and money-out.
    const rows = sqlite.prepare(`
      SELECT ym, category_id, coalesce(sum(amount), 0) as total FROM (
        SELECT substr(t.date,1,7) as ym, t.category_id as category_id, t.amount as amount
        FROM transactions t
        WHERE t.category_id IN (${placeholders})
          AND t.date >= ? AND t.date <= ?
        UNION ALL
        SELECT substr(t.date,1,7) as ym, ts.category_id as category_id, ts.amount as amount
        FROM transaction_splits ts
        JOIN transactions t ON ts.transaction_id = t.id
        WHERE t.category_id IS NULL AND ts.category_id IN (${placeholders})
          AND t.date >= ? AND t.date <= ?
      )
      GROUP BY ym, category_id
    `).all(...ids, startDate, endDate, ...ids, startDate, endDate) as { ym: string; category_id: number; total: number }[];
    // Income is stored negative (money in); expenses/savings positive (money out).
    // Return a positive magnitude for the bars, matching the Budget page's actuals.
    const monthTotals = new Map<string, number>();
    for (const r of rows) {
      const contrib = isIncome ? (r.total < 0 ? -r.total : 0) : r.total;
      monthTotals.set(r.ym, (monthTotals.get(r.ym) ?? 0) + contrib);
    }
    const series = months.map((m) => ({ month: m, actual: monthTotals.get(m) ?? 0 }));

    // ---- current effective monthly plan (floor model), summed over the set ----
    const floors = getRecurringFloors(curMonth);
    const curBudgets = sqlite.prepare(
      `SELECT category_id, amount, override FROM budgets WHERE month = ? AND category_id IN (${placeholders})`
    ).all(curMonth, ...ids) as { category_id: number; amount: number; override: number }[];
    const bMap = new Map(curBudgets.map((b) => [b.category_id, b]));
    let plannedPerMonth = 0;
    for (const id of ids) {
      const b = bMap.get(id);
      const stored = b?.amount ?? 0;
      const floor = floors.get(id)?.amount ?? 0;
      plannedPerMonth += b?.override ? stored : Math.max(stored, floor);
    }

    res.json({ data: { category, plannedPerMonth, series } });
  } catch (err) {
    console.error('GET /budgets/category-detail error:', err);
    res.status(500).json({ error: 'Failed to fetch category detail' });
  }
});

export default router;
