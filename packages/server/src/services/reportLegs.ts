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
