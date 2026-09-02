import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { transactions, accounts, categories, transactionSplits, merchants } from '../db/schema.js';
import { eq, and, gte, lte, or, sql, desc, asc, inArray } from 'drizzle-orm';
import { sanitize, sanitizeString } from '../utils/sanitize.js';
import { requirePermission } from '../middleware/permissions.js';
import { detectDuplicates } from '../services/duplicateDetector.js';
import { findOrCreateMerchant } from '../db/merchants.js';
import { resolveReview, openReviewAssignees, syncReviewNotification } from '../services/reviews.js';
import { checkBudgetExceededForMonths } from '../services/budgetAlerts.js';
import { recordCategoryFeedback } from '../services/feedback.js';
import { validateSplits, saveSplits, resolveLegMerchantId } from '../services/splits.js';
import { isValidYmd, likeEscape, clampInt } from '../utils/validate.js';

const router = Router();

type SplitDto = {
  id: number; categoryId: number; groupName: string; subName: string; displayName: string;
  type: string; amount: number; merchant: { id: number; name: string; logoUrl: string | null } | null; note: string | null;
};

function getSplitsForTransactions(transactionIds: number[]): Map<number, SplitDto[]> {
  if (transactionIds.length === 0) return new Map();
  const rows = sqlite.prepare(`
    SELECT ts.id, ts.transaction_id, ts.category_id, ts.amount, ts.merchant_id, ts.note,
           c.group_name, c.sub_name, c.display_name, c.type,
           m.name AS merchant_name, m.logo_url AS merchant_logo
    FROM transaction_splits ts
    JOIN categories c ON ts.category_id = c.id
    LEFT JOIN merchants m ON ts.merchant_id = m.id
    WHERE ts.transaction_id IN (${transactionIds.map(() => '?').join(',')})
    ORDER BY ts.id
  `).all(...transactionIds) as {
    id: number; transaction_id: number; category_id: number; amount: number;
    merchant_id: number | null; note: string | null; merchant_name: string | null; merchant_logo: string | null;
    group_name: string; sub_name: string; display_name: string; type: string;
  }[];
  const map = new Map<number, SplitDto[]>();
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
      // Own merchant only (null = inherit parent); the client does the fallback.
      merchant: r.merchant_id != null ? { id: r.merchant_id, name: r.merchant_name ?? '', logoUrl: r.merchant_logo ?? null } : null,
      note: r.note,
    });
  }
  return map;
}

/**
 * The other side of a linked transfer, keyed by the OUT leg's transaction id.
 * Only the out leg is listed (see the collapse condition in GET /), so this is
 * what turns one row into "US Bank Checking → US Bank Savings".
 */
function getTransferLinks(fromIds: number[]): Map<number, {
  linkId: number; confidence: number | null; linkedBy: string;
  counterpartyTransactionId: number;
  counterpartyAccount: { id: number; name: string; lastFour: string | null };
  counterpartyDate: string;
}> {
  const map = new Map<number, ReturnType<typeof getTransferLinks> extends Map<number, infer V> ? V : never>();
  if (fromIds.length === 0) return map;
  const rows = sqlite.prepare(`
    SELECT tl.id AS link_id, tl.from_transaction_id, tl.to_transaction_id, tl.confidence, tl.linked_by,
           o.date AS other_date, a.id AS acct_id, a.name AS acct_name, a.last_four
    FROM transfer_links tl
    JOIN transactions o ON o.id = tl.to_transaction_id
    JOIN accounts a ON a.id = o.account_id
    WHERE tl.status = 'linked' AND tl.from_transaction_id IN (${fromIds.map(() => '?').join(',')})
  `).all(...fromIds) as {
    link_id: number; from_transaction_id: number; to_transaction_id: number;
    confidence: number | null; linked_by: string; other_date: string;
    acct_id: number; acct_name: string; last_four: string | null;
  }[];
  for (const r of rows) {
    map.set(r.from_transaction_id, {
      linkId: r.link_id,
      confidence: r.confidence,
      linkedBy: r.linked_by,
      counterpartyTransactionId: r.to_transaction_id,
      counterpartyAccount: { id: r.acct_id, name: r.acct_name, lastFour: r.last_four },
      counterpartyDate: r.other_date,
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

/** Batch-resolve linked-institution logo + color for a set of institution ids. */
function getInstitutionLogos(institutionIds: (number | null)[]): Map<number, { logo_url: string | null; color: string | null }> {
  const ids = [...new Set(institutionIds.filter((v): v is number => v != null))];
  const map = new Map<number, { logo_url: string | null; color: string | null }>();
  if (ids.length === 0) return map;
  const rows = sqlite.prepare(
    `SELECT id, logo_url, color FROM financial_institutions WHERE id IN (${ids.map(() => '?').join(',')})`
  ).all(...ids) as { id: number; logo_url: string | null; color: string | null }[];
  for (const r of rows) map.set(r.id, { logo_url: r.logo_url, color: r.color });
  return map;
}

// GET /api/transactions — list with filters, joins, pagination
router.get('/', (req: Request, res: Response) => {
  try {
    const {
      startDate, endDate,
      accountId, accountIds, categoryId, groupName, categoryIds, groupNames,
      merchantId, merchantIds,
      type, owner, search,
      amountOp, amountValue, amountMin, amountMax,
      needsReview,
      limit: limitStr, offset: offsetStr,
      sortBy = 'date', sortOrder = 'desc',
    } = req.query as Record<string, string | undefined>;

    const limit = clampInt(limitStr, 50, 1, 1000);
    const offset = clampInt(offsetStr, 0, 0, 1_000_000);

    const conditions = [];
    if (startDate) conditions.push(gte(transactions.date, startDate));
    if (endDate) conditions.push(lte(transactions.date, endDate));
    // `accountId` (single) is kept for deep links; `accountIds` (CSV) is what the
    // multi-select Accounts filter sends.
    if (accountId) conditions.push(eq(transactions.account_id, parseInt(accountId, 10)));
    if (accountIds) {
      const aIdList = accountIds.split(',').map(Number).filter((n) => !isNaN(n));
      if (aIdList.length) {
        // A linked transfer shows as ONE row (the out leg), so filtering by the
        // receiving account must still match it — otherwise the money you received
        // vanishes from that account's list.
        const ph = aIdList.map((n) => sql`${n}`);
        conditions.push(or(
          inArray(transactions.account_id, aIdList),
          sql`EXISTS (
            SELECT 1 FROM transfer_links tl JOIN transactions o ON o.id = tl.to_transaction_id
            WHERE tl.status = 'linked' AND tl.from_transaction_id = ${transactions.id}
              AND o.account_id IN (${sql.join(ph, sql`, `)}))`,
        )!);
      }
    }
    // A linked transfer collapses to its out leg; hide the in leg from the list so
    // one movement of money is one row. Both rows stay in the table — each
    // account's own balance and history depend on them.
    conditions.push(sql`NOT EXISTS (
      SELECT 1 FROM transfer_links tl
      WHERE tl.status = 'linked' AND tl.to_transaction_id = ${transactions.id})`);
    // Merchant filters match the parent's merchant OR any split leg's effective
    // merchant (own, or the parent's when the leg inherits) — so a merchant that
    // appears only on a split leg still filters, mirroring the one-row-per-leg list.
    // A split parent keeps a vestigial merchant_id that no displayed leg row may
    // resolve to, so the parent-merchant equality is restricted to NON-split rows;
    // split rows match only via each leg's effective (own-or-inherited) merchant.
    // This keeps the filter consistent with the merchants-page count + the display.
    if (merchantId) {
      const mId = parseInt(merchantId, 10);
      conditions.push(
        or(
          sql`(${transactions.merchant_id} = ${mId} AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = ${transactions.id}))`,
          sql`EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = ${transactions.id} AND COALESCE(ts.merchant_id, ${transactions.merchant_id}) = ${mId})`
        )!
      );
    }
    if (merchantIds) {
      const mIdList = merchantIds.split(',').map(Number).filter((n) => !isNaN(n));
      if (mIdList.length) {
        const mPlaceholders = mIdList.map((n) => sql`${n}`);
        conditions.push(
          or(
            sql`(${transactions.merchant_id} IN (${sql.join(mPlaceholders, sql`, `)}) AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = ${transactions.id}))`,
            sql`EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = ${transactions.id} AND COALESCE(ts.merchant_id, ${transactions.merchant_id}) IN (${sql.join(mPlaceholders, sql`, `)}))`
          )!
        );
      }
    }
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
    // Multi-value category filters (comma-separated)
    if (categoryIds || groupNames) {
      const catIdList = categoryIds ? categoryIds.split(',').map(Number).filter(n => !isNaN(n)) : [];
      const groupList = groupNames ? groupNames.split(',') : [];
      const orParts = [];
      if (catIdList.length) {
        const idPlaceholders = catIdList.map(id => sql`${id}`);
        orParts.push(sql`${transactions.category_id} IN (${sql.join(idPlaceholders, sql`, `)})`);
        orParts.push(sql`EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = ${transactions.id} AND ts.category_id IN (${sql.join(idPlaceholders, sql`, `)}))`);
      }
      if (groupList.length) {
        const groupPlaceholders = groupList.map(g => sql`${g}`);
        orParts.push(sql`${categories.group_name} IN (${sql.join(groupPlaceholders, sql`, `)})`);
        orParts.push(sql`EXISTS (SELECT 1 FROM transaction_splits ts JOIN categories c2 ON ts.category_id = c2.id WHERE ts.transaction_id = ${transactions.id} AND c2.group_name IN (${sql.join(groupPlaceholders, sql`, `)}))`);
      }
      conditions.push(sql`(${sql.join(orParts, sql` OR `)})`);
    }
    if (type === 'income' || type === 'expense') {
      conditions.push(
        or(
          eq(categories.type, type),
          sql`EXISTS (SELECT 1 FROM transaction_splits ts JOIN categories c2 ON ts.category_id = c2.id WHERE ts.transaction_id = ${transactions.id} AND c2.type = ${type})`
        )!
      );
    }
    if (owner) conditions.push(sql`EXISTS (SELECT 1 FROM account_owners ao JOIN users u ON ao.user_id = u.id WHERE ao.account_id = ${accounts.id} AND u.display_name = ${owner})`);
    if (search) {
      // Escape LIKE wildcards so "100%" or "_" search for the literal text.
      const needle = `%${likeEscape(search)}%`;
      conditions.push(
        or(
          sql`${transactions.description} LIKE ${needle} ESCAPE '\\'`,
          sql`${transactions.note} LIKE ${needle} ESCAPE '\\'`,
          sql`${merchants.name} LIKE ${needle} ESCAPE '\\'`,
          // Also match a split leg's OWN merchant, so search agrees with the
          // merchant filter (which resolves each leg's effective merchant).
          sql`EXISTS (SELECT 1 FROM transaction_splits ts JOIN merchants sm ON ts.merchant_id = sm.id WHERE ts.transaction_id = ${transactions.id} AND sm.name LIKE ${needle} ESCAPE '\\')`,
          sql`EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = ${transactions.id} AND ts.note LIKE ${needle} ESCAPE '\\')`,
        )!
      );
    }
    // Amount filter (by magnitude) — operators from the Filters popover
    const amtVal = amountValue ? parseFloat(amountValue) : NaN;
    if (amountOp === 'gt' && !isNaN(amtVal)) conditions.push(sql`ABS(${transactions.amount}) > ${amtVal}`);
    else if (amountOp === 'lt' && !isNaN(amtVal)) conditions.push(sql`ABS(${transactions.amount}) < ${amtVal}`);
    else if (amountOp === 'eq' && !isNaN(amtVal)) conditions.push(sql`ABS(${transactions.amount}) = ${amtVal}`);
    else if (amountOp === 'bt') {
      const mn = amountMin ? parseFloat(amountMin) : NaN;
      const mx = amountMax ? parseFloat(amountMax) : NaN;
      if (!isNaN(mn)) conditions.push(sql`ABS(${transactions.amount}) >= ${mn}`);
      if (!isNaN(mx)) conditions.push(sql`ABS(${transactions.amount}) <= ${mx}`);
    }

    if (needsReview === '1') conditions.push(eq(transactions.needs_review, 1));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumn =
      sortBy === 'amount' ? transactions.amount :
      sortBy === 'merchant' ? sql`COALESCE(${merchants.name}, ${transactions.description})` :
      sortBy === 'description' ? transactions.description :
      sortBy === 'account' ? accounts.name :
      sortBy === 'category' ? categories.group_name :
      sortBy === 'subcategory' ? categories.sub_name :
      transactions.date;
    const orderFn = sortOrder === 'asc' ? asc : desc;

    const rows = db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        bank_description: transactions.bank_description,
        note: transactions.note,
        amount: transactions.amount,
        created_at: transactions.created_at,
        needs_review: transactions.needs_review,
        categorize_confidence: transactions.categorize_confidence,
        merchant_id: transactions.merchant_id,
        merchant_name: merchants.name,
        merchant_logo: merchants.logo_url,
        account_id: accounts.id,
        account_name: accounts.name,
        account_last_four: accounts.last_four,
        account_owner: accounts.owner,
        account_avatar: accounts.avatar_url,
        account_institution_id: accounts.institution_id,
        category_id: categories.id,
        category_group_name: categories.group_name,
        category_sub_name: categories.sub_name,
        category_display_name: categories.display_name,
        category_type: categories.type,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.account_id, accounts.id))
      .leftJoin(categories, eq(transactions.category_id, categories.id))
      .leftJoin(merchants, eq(transactions.merchant_id, merchants.id))
      .where(where)
      .orderBy(orderFn(sortColumn), desc(transactions.id))
      .limit(limit)
      .offset(offset)
      .all();

    // Get total count (same joins so a merchant/search filter resolves)
    const [{ count }] = db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.account_id, accounts.id))
      .leftJoin(categories, eq(transactions.category_id, categories.id))
      .leftJoin(merchants, eq(transactions.merchant_id, merchants.id))
      .where(where)
      .all();

    const ownerMap = getAccountOwners([...new Set(rows.map((r) => r.account_id))]);
    const splitsMap = getSplitsForTransactions(rows.map(r => r.id));
    const acctInstMap = getInstitutionLogos(rows.map((r) => r.account_institution_id));
    const transferMap = getTransferLinks(rows.map((r) => r.id));

    const data = rows.map((r) => {
      const owners = ownerMap.get(r.account_id) || [];
      const splits = splitsMap.get(r.id) || null;
      const acctInst = r.account_institution_id != null ? acctInstMap.get(r.account_institution_id) : undefined;
      const link = transferMap.get(r.id);
      return {
        id: r.id,
        transfer: link ? {
          linkId: link.linkId,
          confidence: link.confidence,
          linkedBy: link.linkedBy,
          toTransactionId: link.counterpartyTransactionId,
          toAccount: link.counterpartyAccount,
          toDate: link.counterpartyDate,
        } : null,
        date: r.date,
        description: r.description,
        bankDescription: r.bank_description ?? null,
        note: r.note,
        amount: r.amount,
        created_at: r.created_at,
        needsReview: !!r.needs_review,
        confidence: r.categorize_confidence,
        merchant: r.merchant_id ? { id: r.merchant_id, name: r.merchant_name, logoUrl: r.merchant_logo ?? null } : null,
        account: {
          id: r.account_id,
          name: r.account_name,
          lastFour: r.account_last_four,
          owner: r.account_owner,
          owners,
          isShared: owners.length > 1,
          logoUrl: r.account_avatar || acctInst?.logo_url || null,
          color: acctInst?.color ?? null,
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
    const { startDate, endDate, accountId, accountIds, owner } = req.query as Record<string, string | undefined>;

    const conditions = [];
    if (startDate) conditions.push(gte(transactions.date, startDate));
    if (endDate) conditions.push(lte(transactions.date, endDate));
    if (accountId) conditions.push(eq(transactions.account_id, parseInt(accountId, 10)));
    if (accountIds) {
      const aIdList = accountIds.split(',').map(Number).filter((n) => !isNaN(n));
      if (aIdList.length) conditions.push(inArray(transactions.account_id, aIdList));
    }
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
        bank_description: transactions.bank_description,
        note: transactions.note,
        amount: transactions.amount,
        created_at: transactions.created_at,
        needs_review: transactions.needs_review,
        categorize_confidence: transactions.categorize_confidence,
        merchant_id: transactions.merchant_id,
        merchant_name: merchants.name,
        merchant_logo: merchants.logo_url,
        account_id: accounts.id,
        account_name: accounts.name,
        account_last_four: accounts.last_four,
        account_owner: accounts.owner,
        account_avatar: accounts.avatar_url,
        account_institution_id: accounts.institution_id,
        category_id: categories.id,
        category_group_name: categories.group_name,
        category_sub_name: categories.sub_name,
        category_display_name: categories.display_name,
        category_type: categories.type,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.account_id, accounts.id))
      .leftJoin(categories, eq(transactions.category_id, categories.id))
      .leftJoin(merchants, eq(transactions.merchant_id, merchants.id))
      .where(eq(transactions.id, id))
      .all();

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const r = rows[0];
    const owners = getAccountOwners([r.account_id]).get(r.account_id) || [];
    const splits = getSplitsForTransactions([id]).get(id) || null;
    const reviewRow = sqlite.prepare(`
      SELECT rv.status, rv.reason, rv.note, rv.assignee_id, u.display_name AS assignee_name
      FROM transaction_reviews rv LEFT JOIN users u ON rv.assignee_id = u.id
      WHERE rv.transaction_id = ?
    `).get(id) as { status: string; reason: string; note: string | null; assignee_id: number | null; assignee_name: string | null } | undefined;
    const link = getTransferLinks([id]).get(id);
    res.json({
      data: {
        id: r.id,
        transfer: link ? {
          linkId: link.linkId,
          confidence: link.confidence,
          linkedBy: link.linkedBy,
          toTransactionId: link.counterpartyTransactionId,
          toAccount: link.counterpartyAccount,
          toDate: link.counterpartyDate,
        } : null,
        date: r.date,
        description: r.description,
        bankDescription: r.bank_description ?? null,
        note: r.note,
        amount: r.amount,
        created_at: r.created_at,
        needsReview: !!r.needs_review,
        confidence: r.categorize_confidence,
        review: reviewRow ? {
          status: reviewRow.status,
          reason: reviewRow.reason,
          note: reviewRow.note,
          assignee: reviewRow.assignee_id != null ? { id: reviewRow.assignee_id, displayName: reviewRow.assignee_name } : null,
        } : null,
        merchant: r.merchant_id ? { id: r.merchant_id, name: r.merchant_name, logoUrl: r.merchant_logo ?? null } : null,
        account: (() => {
          const acctInst = getInstitutionLogos([r.account_institution_id]).get(r.account_institution_id ?? -1);
          return { id: r.account_id, name: r.account_name, lastFour: r.account_last_four, owner: r.account_owner, owners, isShared: owners.length > 1, logoUrl: r.account_avatar || acctInst?.logo_url || null, color: acctInst?.color ?? null };
        })(),
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
    const { accountId, date, description, note, categoryId, amount, splits, merchant } = sanitize(req.body);
    const parsedAmount = parseFloat(amount);

    if (!accountId || !date || !description || amount === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!isValidYmd(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (!Number.isFinite(parsedAmount)) return res.status(400).json({ error: 'amount must be a number' });
    if (!sqlite.prepare('SELECT 1 FROM accounts WHERE id = ?').get(accountId)) return res.status(400).json({ error: 'accountId does not exist' });
    if (categoryId && !sqlite.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) return res.status(400).json({ error: 'categoryId does not exist' });

    // Validate BEFORE any side effects, so a rejected request never creates an
    // orphan merchant row.
    if (splits && splits.length > 0) {
      const err = validateSplits(splits, parsedAmount);
      if (err) return res.status(400).json({ error: err });
    } else if (!categoryId) {
      return res.status(400).json({ error: 'categoryId or splits required' });
    }

    // Resolve the merchant: explicit name if given, else fall back to the
    // description (|| — an empty/blank merchant also falls back) so every
    // transaction is linked to a merchant.
    const merchantId = findOrCreateMerchant((merchant && merchant.trim()) ? merchant : description);

    if (splits && splits.length > 0) {
      // Parent + legs must be all-or-nothing, or a failed leg insert leaves an
      // orphaned category_id=NULL parent whose legs no longer sum to the total.
      const txnId = sqlite.transaction(() => {
        const result = db.insert(transactions).values({
          account_id: accountId,
          date,
          description,
          note: note || null,
          category_id: null,
          merchant_id: merchantId,
          amount: parsedAmount,
        }).run();
        const id = Number(result.lastInsertRowid);
        saveSplits(id, splits, merchantId);
        return id;
      })();
      checkBudgetExceededForMonths(sqlite, [date.slice(0, 7)]);
      res.status(201).json({ data: { id: txnId } });
    } else {
      const result = db.insert(transactions).values({
        account_id: accountId,
        date,
        description,
        note: note || null,
        category_id: categoryId,
        merchant_id: merchantId,
        amount: parsedAmount,
      }).run();

      checkBudgetExceededForMonths(sqlite, [date.slice(0, 7)]);
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
    const { accountId, date, description, note, categoryId, amount, splits, merchant } = sanitize(req.body);

    const existing = db.select().from(transactions).where(eq(transactions.id, id)).all();
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const newAmount = amount !== undefined ? parseFloat(amount) : existing[0].amount;
    if (!Number.isFinite(newAmount)) return res.status(400).json({ error: 'amount must be a number' });
    if (date !== undefined && !isValidYmd(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (accountId !== undefined && !sqlite.prepare('SELECT 1 FROM accounts WHERE id = ?').get(accountId)) return res.status(400).json({ error: 'accountId does not exist' });
    if (categoryId && !sqlite.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) return res.status(400).json({ error: 'categoryId does not exist' });

    // Validate before any side effects so a rejected request can't orphan a merchant.
    if (splits && splits.length > 0) {
      const err = validateSplits(splits, newAmount);
      if (err) return res.status(400).json({ error: err });
    } else if (!categoryId && Math.abs(newAmount - existing[0].amount) > 0.005) {
      // A split parent's amount is the sum of its legs: changing it without
      // resending the legs would leave them out of balance.
      const legs = sqlite.prepare('SELECT COUNT(*) AS n FROM transaction_splits WHERE transaction_id = ?').get(id) as { n: number };
      if (legs.n > 0) return res.status(400).json({ error: 'This transaction is split — edit the split to change its amount' });
    }

    // Re-resolve merchant only when a merchant name was supplied; otherwise keep the link.
    const merchantId = merchant !== undefined ? findOrCreateMerchant(merchant) : existing[0].merchant_id;

    if (splits && splits.length > 0) {
      // Switching to / staying in split mode — parent + legs are all-or-nothing.
      sqlite.transaction(() => {
        // Learning signal: record each NEW leg assignment (skip legs identical to
        // an existing one — re-saving the modal unchanged is not a decision).
        const existingLegs = sqlite.prepare(
          'SELECT category_id, amount FROM transaction_splits WHERE transaction_id = ?'
        ).all(id) as { category_id: number; amount: number }[];
        const existingKeys = new Set(existingLegs.map((l) => `${l.category_id}:${l.amount}`));
        for (const s of splits) {
          if (!existingKeys.has(`${s.categoryId}:${s.amount}`)) {
            recordCategoryFeedback(sqlite, { txnId: id, newCategoryId: s.categoryId, kind: 'split_leg', userId: req.user!.userId, amountOverride: s.amount });
          }
        }
        db.update(transactions)
          .set({
            account_id: accountId ?? existing[0].account_id,
            date: date ?? existing[0].date,
            description: description ?? existing[0].description,
            note: note !== undefined ? note : existing[0].note,
            category_id: null,
            merchant_id: merchantId,
            amount: newAmount,
            // User-confirmed via splits → clear any review flag.
            needs_review: 0,
            categorize_confidence: null,
          })
          .where(eq(transactions.id, id))
          .run();
        saveSplits(id, splits, merchantId);
        resolveReview(sqlite, { txnId: id, resolvedBy: req.user!.userId });
      })();
    } else if (categoryId) {
      // Only an actual category CHANGE clears review — editing an unrelated field
      // (note/date/amount) on an already-categorized txn must not resolve a manual review.
      const catChanged = categoryId !== existing[0].category_id;
      sqlite.transaction(() => {
        if (catChanged) {
          recordCategoryFeedback(sqlite, { txnId: id, newCategoryId: categoryId, kind: 'correction', userId: req.user!.userId });
        }
        // Switching to single category (or staying single) — clear any existing splits
        db.delete(transactionSplits).where(eq(transactionSplits.transaction_id, id)).run();
        db.update(transactions)
          .set({
            account_id: accountId ?? existing[0].account_id,
            date: date ?? existing[0].date,
            description: description ?? existing[0].description,
            note: note !== undefined ? note : existing[0].note,
            category_id: categoryId,
            merchant_id: merchantId,
            amount: newAmount,
            ...(catChanged ? { needs_review: 0, categorize_confidence: null } : {}),
          })
          .where(eq(transactions.id, id))
          .run();
        if (catChanged) resolveReview(sqlite, { txnId: id, resolvedBy: req.user!.userId });
      })();
    } else {
      // No category or splits change — just update other fields
      db.update(transactions)
        .set({
          account_id: accountId ?? existing[0].account_id,
          date: date ?? existing[0].date,
          description: description ?? existing[0].description,
          note: note !== undefined ? note : existing[0].note,
          category_id: existing[0].category_id,
          merchant_id: merchantId,
          amount: newAmount,
        })
        .where(eq(transactions.id, id))
        .run();
    }

    checkBudgetExceededForMonths(sqlite, [
      existing[0].date.slice(0, 7),
      (date ?? existing[0].date).slice(0, 7),
    ]);
    res.json({ data: { id } });
  } catch (err) {
    console.error('PUT /transactions/:id error:', err);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// PATCH /api/transactions/:txnId/splits/:splitId — edit ONE split leg's
// category / merchant / note. Amount is intentionally NOT editable here (it is
// managed in the split modal so the splits-sum-to-parent invariant holds); this
// backs the split-child detail panel and touches only the one leg.
router.patch('/:txnId/splits/:splitId', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const txnId = parseInt(req.params.txnId as string, 10);
    const splitId = parseInt(req.params.splitId as string, 10);
    const { categoryId, merchant, note } = req.body as { categoryId?: number; merchant?: string; note?: string | null };

    const leg = sqlite.prepare(
      'SELECT id FROM transaction_splits WHERE id = ? AND transaction_id = ?'
    ).get(splitId, txnId) as { id: number } | undefined;
    if (!leg) return res.status(404).json({ error: 'Split not found' });

    const parent = db.select().from(transactions).where(eq(transactions.id, txnId)).all();
    if (parent.length === 0) return res.status(404).json({ error: 'Transaction not found' });

    const set: { category_id?: number; merchant_id?: number | null; note?: string | null } = {};
    if (categoryId !== undefined) {
      if (!categoryId) return res.status(400).json({ error: 'categoryId cannot be empty' });
      set.category_id = categoryId;
    }
    if (merchant !== undefined) {
      set.merchant_id = resolveLegMerchantId(merchant, parent[0].merchant_id);
    }
    if (note !== undefined) {
      const clean = note != null ? sanitizeString(note) : '';
      set.note = clean ? clean : null;
    }
    if (Object.keys(set).length === 0) return res.json({ data: { id: splitId } });

    sqlite.transaction(() => {
      if (set.category_id !== undefined) {
        const legRow = sqlite.prepare('SELECT category_id, amount FROM transaction_splits WHERE id = ?').get(splitId) as { category_id: number; amount: number };
        if (legRow.category_id !== set.category_id) {
          recordCategoryFeedback(sqlite, { txnId, newCategoryId: set.category_id, kind: 'correction', userId: req.user!.userId, amountOverride: legRow.amount });
        }
      }
      db.update(transactionSplits).set(set).where(eq(transactionSplits.id, splitId)).run();
      // Confirming a leg's category is a user action → resolve any open review (atomically).
      if (set.category_id !== undefined) resolveReview(sqlite, { txnId, resolvedBy: req.user!.userId });
    })();
    if (set.category_id !== undefined) checkBudgetExceededForMonths(sqlite, [parent[0].date.slice(0, 7)]);
    res.json({ data: { id: splitId } });
  } catch (err) {
    console.error('PATCH /transactions/:txnId/splits/:splitId error:', err);
    res.status(500).json({ error: 'Failed to update split' });
  }
});

// POST /api/transactions/:id/transfer-link { otherId } — link two rows as one
// movement of money. Direction comes from the ledger sign, not the argument order.
router.post('/:id/transfer-link', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { otherId } = req.body as { otherId?: number };
    if (!otherId) return res.status(400).json({ error: 'otherId is required' });
    if (otherId === id) return res.status(400).json({ error: 'a transaction cannot link to itself' });

    const pair = sqlite.prepare(
      `SELECT id, account_id, amount FROM transactions WHERE id IN (?, ?)`
    ).all(id, otherId) as { id: number; account_id: number; amount: number }[];
    if (pair.length < 2) return res.status(404).json({ error: 'Transaction not found' });

    const out = pair.find((t) => t.amount > 0);
    const inc = pair.find((t) => t.amount < 0);
    if (!out || !inc) return res.status(400).json({ error: 'a transfer needs one outgoing and one incoming row' });
    if (out.account_id === inc.account_id) return res.status(400).json({ error: 'both rows are on the same account' });

    sqlite.transaction(() => {
      // Free either leg from an existing link first — a row belongs to one transfer.
      sqlite.prepare(`
        UPDATE transfer_links SET status = 'rejected', unlinked_at = datetime('now')
        WHERE status = 'linked' AND (from_transaction_id IN (?, ?) OR to_transaction_id IN (?, ?))
      `).run(out.id, inc.id, out.id, inc.id);
      sqlite.prepare(`
        INSERT INTO transfer_links (from_transaction_id, to_transaction_id, amount, confidence, linked_by, status)
        VALUES (?, ?, ?, 1.0, 'manual', 'linked')
        ON CONFLICT(from_transaction_id, to_transaction_id) DO UPDATE SET
          status = 'linked', linked_by = 'manual', confidence = 1.0, unlinked_at = NULL
      `).run(out.id, inc.id, Math.abs(out.amount));
    })();
    res.status(201).json({ data: { fromTransactionId: out.id, toTransactionId: inc.id } });
  } catch (err) {
    console.error('POST /transactions/:id/transfer-link error:', err);
    res.status(500).json({ error: 'Failed to link transfer' });
  }
});

// DELETE /api/transactions/:id/transfer-link — split the pair back into two rows.
// The row is kept as 'rejected' so the detector cannot immediately re-pair them.
router.delete('/:id/transfer-link', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const out = sqlite.prepare(`
      UPDATE transfer_links SET status = 'rejected', unlinked_at = datetime('now')
      WHERE status = 'linked' AND (from_transaction_id = ? OR to_transaction_id = ?)
    `).run(id, id);
    if (out.changes === 0) return res.status(404).json({ error: 'No transfer link on this transaction' });
    res.json({ data: { unlinked: out.changes } });
  } catch (err) {
    console.error('DELETE /transactions/:id/transfer-link error:', err);
    res.status(500).json({ error: 'Failed to unlink transfer' });
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

    // The transaction_reviews row cascades with the txn delete, so capture the
    // open review's assignee first and refresh their aggregate count after.
    sqlite.transaction(() => {
      const assignees = openReviewAssignees(sqlite, [id]);
      db.delete(transactions).where(eq(transactions.id, id)).run();
      for (const uid of assignees) syncReviewNotification(sqlite, uid, { ping: false });
    })();
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
      updates: { date?: string; categoryId?: number; merchant?: string; description?: { find: string; replace: string } };
    };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }
    if (!updates || typeof updates !== 'object') {
      res.status(400).json({ error: 'updates object is required' });
      return;
    }
    if (updates.date !== undefined && !isValidYmd(updates.date)) {
      res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      return;
    }
    if (updates.categoryId !== undefined && !sqlite.prepare('SELECT 1 FROM categories WHERE id = ?').get(updates.categoryId)) {
      res.status(400).json({ error: 'categoryId does not exist' });
      return;
    }

    let affected = 0;

    // Handle description find & replace separately (needs per-row logic)
    if (updates.description) {
      const { find, replace } = updates.description;
      if (typeof find !== 'string' || find === '' || typeof replace !== 'string') {
        res.status(400).json({ error: 'description.find must be non-empty text' });
        return;
      }
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
    if (updates.categoryId) { setFields.category_id = updates.categoryId; setFields.needs_review = 0; setFields.categorize_confidence = null; }
    // Merchant is a name → resolve to a merchant_id (leaves the raw description intact).
    if (updates.merchant && updates.merchant.trim()) setFields.merchant_id = findOrCreateMerchant(updates.merchant);

    if (Object.keys(setFields).length > 0) {
      sqlite.transaction(() => {
        // Learning signal per row (fn no-ops for rows already in that category).
        if (updates.categoryId) {
          for (const id of ids) {
            recordCategoryFeedback(sqlite, { txnId: id, newCategoryId: updates.categoryId, kind: 'correction', userId: req.user!.userId });
          }
        }
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
        // A bulk category assignment resolves each row's open review (atomically).
        if (updates.categoryId) {
          for (const id of ids) resolveReview(sqlite, { txnId: id, resolvedBy: req.user!.userId });
        }
      })();
    }

    if (updates.categoryId || updates.date) {
      const monthRows = sqlite.prepare(
        `SELECT DISTINCT substr(date, 1, 7) AS m FROM transactions WHERE id IN (${ids.map(() => '?').join(',')})`
      ).all(...ids) as { m: string }[];
      const months = monthRows.map((r) => r.m);
      if (updates.date) months.push(updates.date.slice(0, 7));
      checkBudgetExceededForMonths(sqlite, months);
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

    // Reviews cascade with the deletes; refresh affected assignees' aggregate
    // notifications afterwards (silent — a shrinking queue never re-pings).
    let affected = 0;
    sqlite.transaction(() => {
      const assignees = openReviewAssignees(sqlite, ids);
      affected = db.delete(transactions).where(inArray(transactions.id, ids)).run().changes;
      for (const uid of assignees) syncReviewNotification(sqlite, uid, { ping: false });
    })();

    res.json({ data: { affected } });
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
               m.name as merchant_name,
               c.group_name, c.sub_name
        FROM transactions t
        LEFT JOIN accounts a ON t.account_id = a.id
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN merchants m ON t.merchant_id = m.id
        WHERE t.id = ?
      `).get(result.matchId) as {
        id: number; date: string; description: string; amount: number; note: string | null;
        account_name: string | null; merchant_name: string | null; group_name: string | null; sub_name: string | null;
      } | undefined;
    }

    res.json({
      data: {
        status: result.status,
        match: match ? {
          id: match.id,
          date: match.date,
          description: match.description,
          merchant: match.merchant_name,
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
