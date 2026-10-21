import type Database from 'better-sqlite3';
import type { ReportContribution } from '@ledger/shared/src/types.js';

/**
 * Reports read "legs": an unsplit transaction, or one split leg of a
 * transaction with no category of its own. Columns: transaction_id, split_id
 * (NULL when unsplit), category_id, merchant_id, account_id, date, amount.
 */
export const CATEGORIZED_LEGS_SQL = `
  SELECT t.id AS transaction_id, NULL AS split_id, t.category_id AS category_id, t.merchant_id AS merchant_id, t.account_id AS account_id, t.date AS date, t.amount AS amount
  FROM transactions t
  WHERE t.category_id IS NOT NULL
  UNION ALL
  SELECT t.id AS transaction_id, ts.id AS split_id, ts.category_id AS category_id, COALESCE(ts.merchant_id, t.merchant_id) AS merchant_id, t.account_id AS account_id, t.date AS date, ts.amount AS amount
  FROM transaction_splits ts
  JOIN transactions t ON ts.transaction_id = t.id
  WHERE t.category_id IS NULL`;

/** The Reports filter set, as GET /api/reports/period takes it. */
export interface ReportFilters {
  start: string;
  end: string;
  owner: string; // display name, or 'all'
  accountIds: number[];
  merchantIds: number[];
  categoryIds: number[];
  groupNames: string[];
  amountOp?: string; // gt | lt | eq | bt
  amountValue: number;
  amountMin: number;
  amountMax: number;
  txnType?: string; // debits | credits (by sign)
  catType?: string; // income | expense (by category type)
}

export function parseReportFilters(q: Record<string, unknown>): ReportFilters {
  const csvInts = (v: unknown) => String(v ?? '').split(',').map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
  const csvStrs = (v: unknown) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return {
    start: q.start as string,
    end: q.end as string,
    owner: (q.owner as string) || 'all',
    accountIds: q.accountIds ? csvInts(q.accountIds) : [],
    merchantIds: q.merchantIds ? csvInts(q.merchantIds) : [],
    categoryIds: q.categoryIds ? csvInts(q.categoryIds) : [],
    groupNames: q.groupNames ? csvStrs(q.groupNames) : [],
    amountOp: q.amountOp as string | undefined,
    amountValue: parseFloat(q.amountValue as string),
    amountMin: parseFloat(q.amountMin as string),
    amountMax: parseFloat(q.amountMax as string),
    txnType: q.txnType as string | undefined,
    catType: q.catType as string | undefined,
  };
}

type Where = { conditions: string[]; params: (string | number)[] };
const marks = (n: number) => new Array(n).fill('?').join(',');

/**
 * Owner and account filters on the account a leg sits on (alias `l`). For a
 * contribution that is the paying side.
 */
export function legAccountFilters(f: ReportFilters): Where {
  const w: Where = { conditions: [], params: [] };
  if (f.owner !== 'all') {
    w.conditions.push('EXISTS (SELECT 1 FROM account_owners ao JOIN users u ON ao.user_id = u.id WHERE ao.account_id = l.account_id AND u.display_name = ?)');
    w.params.push(f.owner);
  }
  if (f.accountIds.length) { w.conditions.push(`l.account_id IN (${marks(f.accountIds.length)})`); w.params.push(...f.accountIds); }
  return w;
}

/**
 * Merchant, category (ids OR group names), amount and debit/credit filters on
 * a leg (alias `l`, its category `c`). Uncategorized legs (category_id NULL)
 * drop out under any category filter (NULL never matches IN).
 */
export function legFilters(f: ReportFilters): Where {
  const w: Where = { conditions: [], params: [] };
  if (f.merchantIds.length) { w.conditions.push(`l.merchant_id IN (${marks(f.merchantIds.length)})`); w.params.push(...f.merchantIds); }
  if (f.categoryIds.length || f.groupNames.length) {
    const parts: string[] = [];
    if (f.categoryIds.length) { parts.push(`l.category_id IN (${marks(f.categoryIds.length)})`); w.params.push(...f.categoryIds); }
    if (f.groupNames.length) { parts.push(`c.group_name IN (${marks(f.groupNames.length)})`); w.params.push(...f.groupNames); }
    w.conditions.push(`(${parts.join(' OR ')})`);
  }
  if (f.amountOp === 'bt') {
    if (!Number.isNaN(f.amountMin)) { w.conditions.push('ABS(l.amount) >= ?'); w.params.push(f.amountMin); }
    if (!Number.isNaN(f.amountMax)) { w.conditions.push('ABS(l.amount) <= ?'); w.params.push(f.amountMax); }
  } else if (f.amountOp === 'gt' || f.amountOp === 'lt' || f.amountOp === 'eq') {
    if (!Number.isNaN(f.amountValue)) {
      w.conditions.push(`ABS(l.amount) ${f.amountOp === 'gt' ? '>' : f.amountOp === 'lt' ? '<' : '='} ?`);
      w.params.push(f.amountValue);
    }
  }
  // Sign convention: positive stored = money out (debit), negative = money in (credit).
  if (f.txnType === 'debits') w.conditions.push('l.amount > 0');
  else if (f.txnType === 'credits') w.conditions.push('l.amount < 0');
  return w;
}

export const joinWhere = (...parts: Where[]): Where => ({
  conditions: parts.flatMap((p) => p.conditions),
  params: parts.flatMap((p) => p.params),
});

export interface ContributionLeg {
  transaction_id: number;
  split_id: number | null;
  category_id: number;
  account_id: number;
  date: string;
  amount: number;
}

/**
 * The contribution eligibility rules: the one place that decides which legs
 * count toward a tracked contribution, under the Reports filters.
 *
 * - A leg counts only when it is filed under a tracked category and sits on an
 *   account that is NOT one of that setup's chosen accounts (the paying side).
 *   A leg on a chosen account is the receiving copy, so it never counts; a move
 *   between two chosen accounts counts nothing, and so does a movement Ledger
 *   sees only on the receiving account.
 * - Split legs count by their own amount; other legs of the transaction don't.
 * - Untracked and uncategorized legs never count.
 * - The income/expense category-type filter leaves no contributions.
 *
 * Callers split each leg by sign: positive (money out) is put in, negative
 * (money in) is taken out.
 */
export function contributionLegs(sqlite: Database.Database, f: ReportFilters): ContributionLeg[] {
  if (f.catType === 'income' || f.catType === 'expense') return [];
  const w = joinWhere(
    { conditions: ['l.date >= ?', 'l.date <= ?'], params: [f.start, f.end] },
    // Paying side only for now. Matching the destination account and its
    // owners (#421) belongs here, in place of this one line.
    legAccountFilters(f),
    legFilters(f),
  );
  return sqlite.prepare(`
    WITH legs AS (${CATEGORIZED_LEGS_SQL})
    SELECT l.transaction_id, l.split_id, l.category_id, l.account_id, l.date, l.amount
    FROM legs l
    JOIN contribution_setups s ON s.category_id = l.category_id
    JOIN categories c ON c.id = l.category_id
    WHERE NOT EXISTS (SELECT 1 FROM contribution_setup_accounts sa WHERE sa.setup_id = s.id AND sa.account_id = l.account_id)
      AND ${w.conditions.join(' AND ')}
    ORDER BY l.date, l.transaction_id, l.split_id
  `).all(...w.params) as ContributionLeg[];
}

/** Put in and taken out per bucket for each tracked category with counted activity. */
export function contributionFigures(
  sqlite: Database.Database,
  f: ReportFilters,
  bucketOf: (date: string) => number,
  bucketCount: number,
): ReportContribution[] {
  const byCategory = new Map<number, ReportContribution>();
  const meta = sqlite.prepare('SELECT group_name, sub_name FROM categories WHERE id = ?');
  for (const leg of contributionLegs(sqlite, f)) {
    const bi = bucketOf(leg.date);
    if (bi < 0 || leg.amount === 0) continue;
    let entry = byCategory.get(leg.category_id);
    if (!entry) {
      const c = meta.get(leg.category_id) as { group_name: string; sub_name: string };
      entry = {
        categoryId: leg.category_id, groupName: c.group_name, name: c.sub_name,
        putIn: new Array(bucketCount).fill(0), takenOut: new Array(bucketCount).fill(0),
        totalPutIn: 0, totalTakenOut: 0,
      };
      byCategory.set(leg.category_id, entry);
    }
    if (leg.amount > 0) { entry.putIn[bi] += leg.amount; entry.totalPutIn += leg.amount; }
    else { entry.takenOut[bi] -= leg.amount; entry.totalTakenOut -= leg.amount; }
  }
  return Array.from(byCategory.values())
    .sort((a, b) => a.groupName.localeCompare(b.groupName) || a.name.localeCompare(b.name));
}
