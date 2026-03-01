import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { transactions, accounts, categories, budgets, balanceSnapshots, assets } from '../db/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import { calculateCurrentValue } from '../utils/depreciation.js';

const router = Router();

function getAccountOwnersDash(accountIds: number[]): Map<number, { id: number; displayName: string }[]> {
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

function monthRange(month: string): { startDate: string; endDate: string } {
  const [year, m] = month.split('-').map(Number);
  const startDate = `${year}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

function priorMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// GET /api/dashboard/summary?month=YYYY-MM
router.get('/summary', (req: Request, res: Response) => {
  try {
    const month = (req.query.month as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { startDate, endDate } = monthRange(month);
    const prior = priorMonth(month);
    const { startDate: priorStart, endDate: priorEnd } = monthRange(prior);

    // Net worth: latest balance per account + current asset values
    const balances = db.select({
      account_id: balanceSnapshots.account_id,
      balance: balanceSnapshots.balance,
      classification: accounts.classification,
    }).from(balanceSnapshots)
      .innerJoin(accounts, eq(balanceSnapshots.account_id, accounts.id))
      .where(eq(accounts.is_active, 1))
      .orderBy(desc(balanceSnapshots.date), desc(balanceSnapshots.id))
      .all();

    // Deduplicate: keep latest per account
    const latestByAccount = new Map<number, { balance: number; classification: string }>();
    for (const b of balances) {
      if (!latestByAccount.has(b.account_id)) {
        latestByAccount.set(b.account_id, { balance: b.balance, classification: b.classification });
      }
    }

    let totalBalances = 0;
    let liquidAssets = 0;
    let liabilityTotal = 0;
    for (const { balance, classification } of latestByAccount.values()) {
      if (classification === 'liability') {
        liabilityTotal += Math.abs(balance);
      } else {
        totalBalances += balance;
      }
      if (classification === 'liquid') liquidAssets += balance;
    }

    // Asset depreciation values
    const allAssets = db.select().from(assets).all();
    let totalAssetValue = 0;
    for (const a of allAssets) {
      totalAssetValue += calculateCurrentValue({
        cost: a.cost,
        salvageValue: a.salvage_value,
        lifespanYears: a.lifespan_years,
        purchaseDate: a.purchase_date,
        depreciationMethod: a.depreciation_method as 'straight_line' | 'declining_balance',
        decliningRate: a.declining_rate,
      });
    }

    const netWorth = totalBalances + totalAssetValue - liabilityTotal;

    // Month income/expenses — includes split transactions
    const monthRows = sqlite.prepare(`
      SELECT
        coalesce(sum(CASE WHEN c.type = 'income' THEN abs(amt) ELSE 0 END), 0) as income,
        coalesce(sum(CASE WHEN c.type = 'expense' THEN amt ELSE 0 END), 0) as expenses
      FROM (
        SELECT t.category_id as cat_id, t.amount as amt
        FROM transactions t
        WHERE t.category_id IS NOT NULL AND t.date >= ? AND t.date <= ?
        UNION ALL
        SELECT ts.category_id as cat_id, ts.amount as amt
        FROM transaction_splits ts
        JOIN transactions t ON ts.transaction_id = t.id
        WHERE t.category_id IS NULL AND t.date >= ? AND t.date <= ?
      ) combined
      JOIN categories c ON combined.cat_id = c.id
    `).get(startDate, endDate, startDate, endDate) as { income: number; expenses: number };
    const monthTotals = monthRows ?? { income: 0, expenses: 0 };

    // Prior month income/expenses — includes split transactions
    const priorRows = sqlite.prepare(`
      SELECT
        coalesce(sum(CASE WHEN c.type = 'income' THEN abs(amt) ELSE 0 END), 0) as income,
        coalesce(sum(CASE WHEN c.type = 'expense' THEN amt ELSE 0 END), 0) as expenses
      FROM (
        SELECT t.category_id as cat_id, t.amount as amt
        FROM transactions t
        WHERE t.category_id IS NOT NULL AND t.date >= ? AND t.date <= ?
        UNION ALL
        SELECT ts.category_id as cat_id, ts.amount as amt
        FROM transaction_splits ts
        JOIN transactions t ON ts.transaction_id = t.id
        WHERE t.category_id IS NULL AND t.date >= ? AND t.date <= ?
      ) combined
      JOIN categories c ON combined.cat_id = c.id
    `).get(priorStart, priorEnd, priorStart, priorEnd) as { income: number; expenses: number };
    const priorTotals = priorRows ?? { income: 0, expenses: 0 };

    // Total budgeted expenses for month
    const [budgetTotal] = db.select({
      total: sql<number>`coalesce(sum(${budgets.amount}), 0)`,
    }).from(budgets)
      .where(eq(budgets.month, month))
      .all();

    res.json({
      data: {
        netWorth,
        liquidAssets,
        monthIncome: monthTotals.income,
        monthExpenses: monthTotals.expenses,
        totalBudgetedExpenses: budgetTotal.total,
        priorMonthIncome: priorTotals.income,
        priorMonthExpenses: priorTotals.expenses,
      },
    });
  } catch (err) {
    console.error('GET /dashboard/summary error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

// GET /api/dashboard/spending-by-category?month=YYYY-MM
router.get('/spending-by-category', (req: Request, res: Response) => {
  try {
    const month = (req.query.month as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { startDate, endDate } = monthRange(month);

    const spending = sqlite.prepare(`
      SELECT c.group_name as groupName, coalesce(sum(amt), 0) as totalSpent
      FROM (
        SELECT t.category_id as cat_id, t.amount as amt
        FROM transactions t
        WHERE t.category_id IS NOT NULL AND t.date >= ? AND t.date <= ?
        UNION ALL
        SELECT ts.category_id as cat_id, ts.amount as amt
        FROM transaction_splits ts
        JOIN transactions t ON ts.transaction_id = t.id
        WHERE t.category_id IS NULL AND t.date >= ? AND t.date <= ?
      ) combined
      JOIN categories c ON combined.cat_id = c.id
      WHERE c.type = 'expense'
      GROUP BY c.group_name
    `).all(startDate, endDate, startDate, endDate) as { groupName: string; totalSpent: number }[];

    // Get budgets for each group
    const groupBudgets = db.select({
      groupName: categories.group_name,
      totalBudgeted: sql<number>`coalesce(sum(${budgets.amount}), 0)`,
    }).from(budgets)
      .innerJoin(categories, eq(budgets.category_id, categories.id))
      .where(and(eq(budgets.month, month), eq(categories.type, 'expense')))
      .groupBy(categories.group_name)
      .all();

    const budgetMap = new Map(groupBudgets.map((b) => [b.groupName, b.totalBudgeted]));

    const data = spending
      .filter((s) => s.totalSpent > 0)
      .map((s) => ({
        groupName: s.groupName,
        totalSpent: s.totalSpent,
        totalBudgeted: budgetMap.get(s.groupName) || 0,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    res.json({ data });
  } catch (err) {
    console.error('GET /dashboard/spending-by-category error:', err);
    res.status(500).json({ error: 'Failed to fetch spending by category' });
  }
});

// GET /api/dashboard/income-vs-expenses?year=YYYY
router.get('/income-vs-expenses', (req: Request, res: Response) => {
  try {
    const year = (req.query.year as string) || String(new Date().getFullYear());

    const monthly = sqlite.prepare(`
      SELECT cast(substr(date, 6, 2) as integer) as month,
        coalesce(sum(CASE WHEN c.type = 'income' THEN abs(amt) ELSE 0 END), 0) as totalIncome,
        coalesce(sum(CASE WHEN c.type = 'expense' THEN amt ELSE 0 END), 0) as totalExpenses
      FROM (
        SELECT t.category_id as cat_id, t.date, t.amount as amt
        FROM transactions t
        WHERE t.category_id IS NOT NULL AND substr(t.date, 1, 4) = ?
        UNION ALL
        SELECT ts.category_id as cat_id, t.date, ts.amount as amt
        FROM transaction_splits ts
        JOIN transactions t ON ts.transaction_id = t.id
        WHERE t.category_id IS NULL AND substr(t.date, 1, 4) = ?
      ) combined
      JOIN categories c ON combined.cat_id = c.id
      GROUP BY month
    `).all(year, year) as { month: number; totalIncome: number; totalExpenses: number }[];

    const monthMap = new Map(monthly.map((m) => [m.month, m]));
    const data = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      totalIncome: monthMap.get(i + 1)?.totalIncome ?? 0,
      totalExpenses: monthMap.get(i + 1)?.totalExpenses ?? 0,
    }));

    res.json({ data });
  } catch (err) {
    console.error('GET /dashboard/income-vs-expenses error:', err);
    res.status(500).json({ error: 'Failed to fetch income vs expenses' });
  }
});

// GET /api/dashboard/recent-transactions?limit=8
router.get('/recent-transactions', (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '8', 10);

    const rows = db.select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      note: transactions.note,
      amount: transactions.amount,
      account_id: accounts.id,
      account_name: accounts.name,
      account_last_four: accounts.last_four,
      account_owner: accounts.owner,
      category_id: categories.id,
      category_group_name: categories.group_name,
      category_sub_name: categories.sub_name,
      category_display_name: categories.display_name,
      category_type: categories.type,
    }).from(transactions)
      .innerJoin(accounts, eq(transactions.account_id, accounts.id))
      .leftJoin(categories, eq(transactions.category_id, categories.id))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit)
      .all();

    const ownerMap = getAccountOwnersDash([...new Set(rows.map((r) => r.account_id))]);

    // Fetch splits for any split transactions
    const splitTxnIds = rows.filter(r => !r.category_id).map(r => r.id);
    const splitsMap = new Map<number, { categoryId: number; groupName: string; subName: string; displayName: string; type: string; amount: number }[]>();
    if (splitTxnIds.length > 0) {
      const splitRows = sqlite.prepare(`
        SELECT ts.transaction_id, ts.category_id, ts.amount,
               c.group_name, c.sub_name, c.display_name, c.type
        FROM transaction_splits ts
        JOIN categories c ON ts.category_id = c.id
        WHERE ts.transaction_id IN (${splitTxnIds.map(() => '?').join(',')})
        ORDER BY ts.id
      `).all(...splitTxnIds) as {
        transaction_id: number; category_id: number; amount: number;
        group_name: string; sub_name: string; display_name: string; type: string;
      }[];
      for (const sr of splitRows) {
        if (!splitsMap.has(sr.transaction_id)) splitsMap.set(sr.transaction_id, []);
        splitsMap.get(sr.transaction_id)!.push({
          categoryId: sr.category_id, groupName: sr.group_name, subName: sr.sub_name,
          displayName: sr.display_name, type: sr.type, amount: sr.amount,
        });
      }
    }

    const data = rows.map((r) => {
      const owners = ownerMap.get(r.account_id) || [];
      const splits = splitsMap.get(r.id) || null;
      return {
        id: r.id,
        date: r.date,
        description: r.description,
        note: r.note,
        amount: r.amount,
        account: { id: r.account_id, name: r.account_name, lastFour: r.account_last_four, owner: r.account_owner, owners, isShared: owners.length > 1 },
        category: r.category_id ? { id: r.category_id, groupName: r.category_group_name, subName: r.category_sub_name, displayName: r.category_display_name, type: r.category_type } : null,
        splits,
      };
    });

    res.json({ data });
  } catch (err) {
    console.error('GET /dashboard/recent-transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch recent transactions' });
  }
});

export default router;
