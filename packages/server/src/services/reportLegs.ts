import type Database from 'better-sqlite3';
import type { ContributionSetupAccount, ReportContribution, ReportContributionTransaction } from '@ledger/shared/src/types.js';

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
 * Owner and account filters on the account a leg sits on (alias `l`).
 * Contributions use contributionAccountFilters instead.
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
  /** The account the money went to or came from, when Ledger knows it (see contributionLegs). */
  destination_account_id: number | null;
  date: string;
  amount: number;
}

/**
 * A counted leg's destination (alias `l` for the leg, `s` for its setup): the
 * account of its linked transfer partner (either side of the link), or else,
 * when only its side is in Ledger, the setup's one Ledger account if it names
 * exactly one and not "an account not in Ledger". A rejected link is no link.
 */
const DESTINATION_SQL = `COALESCE(
  (SELECT p.account_id FROM transfer_links tl
     JOIN transactions p ON p.id = CASE WHEN tl.from_transaction_id = l.transaction_id THEN tl.to_transaction_id ELSE tl.from_transaction_id END
   WHERE tl.status = 'linked' AND (tl.from_transaction_id = l.transaction_id OR tl.to_transaction_id = l.transaction_id)
   ORDER BY tl.id LIMIT 1),
  CASE WHEN s.includes_external = 0 AND (SELECT COUNT(*) FROM contribution_setup_accounts sa WHERE sa.setup_id = s.id) = 1
    THEN (SELECT sa.account_id FROM contribution_setup_accounts sa WHERE sa.setup_id = s.id) END
)`;

/**
 * Owner and account filters for a counted contribution leg, like a card
 * payment: it matches on the account it sits on or its destination, and on
 * either account's owners. One row per leg, so it still counts once.
 */
function contributionAccountFilters(f: ReportFilters): Where {
  const w: Where = { conditions: [], params: [] };
  if (f.owner !== 'all') {
    w.conditions.push('EXISTS (SELECT 1 FROM account_owners ao JOIN users u ON ao.user_id = u.id WHERE ao.account_id IN (l.account_id, l.destination_account_id) AND u.display_name = ?)');
    w.params.push(f.owner);
  }
  if (f.accountIds.length) {
    w.conditions.push(`(l.account_id IN (${marks(f.accountIds.length)}) OR l.destination_account_id IN (${marks(f.accountIds.length)}))`);
    w.params.push(...f.accountIds, ...f.accountIds);
  }
  return w;
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
 * - The account and person filters find a leg under its paying account or its
 *   destination (DESTINATION_SQL), and that account's owners.
 *
 * Callers split each leg by sign: positive (money out) is put in, negative
 * (money in) is taken out.
 */
export function contributionLegs(sqlite: Database.Database, f: ReportFilters): ContributionLeg[] {
  if (f.catType === 'income' || f.catType === 'expense') return [];
  const w = joinWhere(
    { conditions: ['l.date >= ?', 'l.date <= ?'], params: [f.start, f.end] },
    contributionAccountFilters(f),
    legFilters(f),
  );
  return sqlite.prepare(`
    WITH legs AS (${CATEGORIZED_LEGS_SQL}),
    counted AS (
      SELECT l.*, ${DESTINATION_SQL} AS destination_account_id
      FROM legs l
      JOIN contribution_setups s ON s.category_id = l.category_id
      WHERE NOT EXISTS (SELECT 1 FROM contribution_setup_accounts sa WHERE sa.setup_id = s.id AND sa.account_id = l.account_id)
    )
    SELECT l.transaction_id, l.split_id, l.category_id, l.account_id, l.destination_account_id, l.date, l.amount
    FROM counted l
    JOIN categories c ON c.id = l.category_id
    WHERE ${w.conditions.join(' AND ')}
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
  const setup = sqlite.prepare('SELECT id, includes_external FROM contribution_setups WHERE category_id = ?');
  const setupAccounts = sqlite.prepare(`
    SELECT a.id, a.name, a.type, a.is_active
    FROM contribution_setup_accounts sa JOIN accounts a ON a.id = sa.account_id
    WHERE sa.setup_id = ? ORDER BY a.name, a.id`);
  for (const leg of contributionLegs(sqlite, f)) {
    const bi = bucketOf(leg.date);
    if (bi < 0 || leg.amount === 0) continue;
    let entry = byCategory.get(leg.category_id);
    if (!entry) {
      const c = meta.get(leg.category_id) as { group_name: string; sub_name: string };
      const st = setup.get(leg.category_id) as { id: number; includes_external: number };
      const accounts = (setupAccounts.all(st.id) as { id: number; name: string; type: ContributionSetupAccount['type']; is_active: number | null }[])
        .map((a) => ({ id: a.id, name: a.name, type: a.type, isActive: a.is_active !== 0 }));
      entry = {
        categoryId: leg.category_id, groupName: c.group_name, name: c.sub_name,
        putIn: new Array(bucketCount).fill(0), takenOut: new Array(bucketCount).fill(0),
        totalPutIn: 0, totalTakenOut: 0,
        accounts, external: st.includes_external === 1,
      };
      byCategory.set(leg.category_id, entry);
    }
    if (leg.amount > 0) { entry.putIn[bi] += leg.amount; entry.totalPutIn += leg.amount; }
    else { entry.takenOut[bi] -= leg.amount; entry.totalTakenOut -= leg.amount; }
  }
  return Array.from(byCategory.values())
    .sort((a, b) => a.groupName.localeCompare(b.groupName) || a.name.localeCompare(b.name));
}

export interface ContributionListOptions {
  sortBy?: string; // date | amount
  sortOrder?: string; // asc | desc
  thenBy?: string; // absAmount
  thenOrder?: string; // asc | desc
  limit: number;
  offset: number;
}

/** Whether a category has a contribution setup (is tracked). */
export function isTrackedCategory(sqlite: Database.Database, categoryId: number): boolean {
  return !!sqlite.prepare('SELECT 1 FROM contribution_setups WHERE category_id = ?').get(categoryId);
}

/**
 * The transactions behind one tracked category's figures: exactly the legs
 * contributionFigures counts (same contributionLegs call, zero-amount legs
 * skipped), with display fields added. `amount` is the counted magnitude, so
 * sorting by amount orders by it; ties keep transaction then split id order.
 */
export function contributionTransactions(
  sqlite: Database.Database,
  f: ReportFilters,
  categoryId: number,
  o: ContributionListOptions,
): { data: ReportContributionTransaction[]; total: number } {
  const legs = contributionLegs(sqlite, f).filter((l) => l.category_id === categoryId && l.amount !== 0);
  const dir = (order: string | undefined) => (order === 'asc' ? 1 : -1);
  const primary = o.sortBy === 'amount'
    ? (a: ContributionLeg, b: ContributionLeg) => (Math.abs(a.amount) - Math.abs(b.amount)) * dir(o.sortOrder)
    : (a: ContributionLeg, b: ContributionLeg) => a.date.localeCompare(b.date) * dir(o.sortOrder);
  const secondary = o.thenBy === 'absAmount'
    ? (a: ContributionLeg, b: ContributionLeg) => (Math.abs(a.amount) - Math.abs(b.amount)) * dir(o.thenOrder)
    : () => 0;
  legs.sort((a, b) => primary(a, b) || secondary(a, b)
    || a.transaction_id - b.transaction_id || (a.split_id ?? 0) - (b.split_id ?? 0));

  const detail = sqlite.prepare(`
    SELECT t.description AS description, m.name AS merchant, a.name AS accountName
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN transaction_splits ts ON ts.id = ?
    LEFT JOIN merchants m ON m.id = COALESCE(ts.merchant_id, t.merchant_id)
    WHERE t.id = ?`);
  const accountName = sqlite.prepare('SELECT name FROM accounts WHERE id = ?');
  const data = legs.slice(o.offset, o.offset + o.limit).map((l) => {
    const d = detail.get(l.split_id, l.transaction_id) as { description: string; merchant: string | null; accountName: string };
    const dest = l.destination_account_id == null ? null : (accountName.get(l.destination_account_id) as { name: string }).name;
    return {
      transactionId: l.transaction_id,
      splitId: l.split_id,
      date: l.date,
      merchant: d.merchant,
      description: d.description,
      accountId: l.account_id,
      accountName: d.accountName,
      destinationAccountId: l.destination_account_id,
      destinationAccountName: dest,
      amount: Math.abs(l.amount),
      direction: l.amount > 0 ? 'putIn' : 'takenOut',
    } as ReportContributionTransaction;
  });
  return { data, total: legs.length };
}
