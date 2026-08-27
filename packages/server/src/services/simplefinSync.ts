import { sqlite } from '../db/index.js';
import { simplefinConnections, simplefinLinks } from '../db/schema.js';
import { fetchAccounts } from './simplefin.js';
import { convertToLedgerSign } from './signConversion.js';
import { detectDuplicates } from './duplicateDetector.js';
import { detectTransfers } from './transferDetector.js';
import { linkTransfers } from './transferLinker.js';
import { WINDOW_DAYS } from './transferMatch.js';
import { buildCategorizer, REVIEW_THRESHOLD, type CategorizeResult } from './categorize.js';
import { llmConfig, llmCategorizeBatch, mergeLlmResult, type LlmTxnInput } from './llmCategorize.js';
import { normalizeMerchantName } from './merchantNormalize.js';
import { flagReview, defaultAssigneeForTxn } from './reviews.js';
import { clearSyncFailureNotification } from './notifications.js';
import { checkBudgetExceededForMonths } from './budgetAlerts.js';
import { resolveMerchantId } from '../db/merchants.js';
import type {
  AccountClassification,
  SyncTransaction,
  SyncBalanceUpdate,
  SyncHoldingsUpdate,
} from '@ledger/shared/src/types.js';

/**
 * SimpleFIN sync pipeline + commit, shared by the manual routes
 * (POST /simplefin/sync|commit) and the daily scheduler. Extracted verbatim
 * from routes/simplefin.ts with these deltas:
 *  - per-connection fetch failures are RECORDED (not swallowed) and the
 *    dormant simplefin_links.last_sync_* columns are written;
 *  - commit is idempotent: txn insert = ON CONFLICT DO NOTHING, balance
 *    snapshots upsert-per-day, holdings history INSERT OR REPLACE;
 *  - commit writes transactions.bank_description and leaves `note` NULL
 *    (notes are user-only now);
 *  - holdings history is captured around the delete+reinsert so day-over-day
 *    change survives.
 */

export interface ConnectionFailure {
  connectionId: number;
  label: string;
  message: string;
  kind: 'auth' | 'rate_limit' | 'other';
}

export interface SyncPipelineResult {
  transactions: SyncTransaction[];
  balanceUpdates: SyncBalanceUpdate[];
  holdingsUpdates: SyncHoldingsUpdate[];
  failures: ConnectionFailure[];
  succeededConnectionIds: number[];
  connectionCount: number;
}

export interface CommitTransaction {
  simplefinId: string;
  accountId: number;
  date: string;
  description: string;
  rawDescription: string;
  amount: number;
  categoryId?: number;
  confidence?: number | null;
  source?: string | null;
  splits?: { categoryId: number; amount: number }[];
}

export interface CommitPayload {
  transactions?: CommitTransaction[];
  balanceUpdates?: { accountId: number; balance: number; date: string }[];
  holdingsUpdates?: {
    accountId: number;
    holdings: { symbol: string; description: string; shares: number; costBasis: number; marketValue: number }[];
  }[];
}

export interface CommitResult {
  transactionsImported: number;
  balancesUpdated: number;
  holdingsUpdated: number;
}

const unixToDate = (unix: number): string => new Date(unix * 1000).toISOString().slice(0, 10);

function classifyFailure(message: string): ConnectionFailure['kind'] {
  const m = message.toLowerCase();
  if (m.includes('authentication failed')) return 'auth';
  if (m.includes('rate limit')) return 'rate_limit';
  return 'other';
}

/* ------ Fetch-phase mutex (FIFO promise chain) ------ */
// better-sqlite3 writes already serialize; this guards the async FETCH phase so
// the scheduler and a manual sync don't burn the SimpleFIN request budget
// concurrently or interleave status writes.
let syncChain: Promise<unknown> = Promise.resolve();
let inFlight = 0;

export function isSyncInFlight(): boolean {
  return inFlight > 0;
}

export function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = syncChain.then(async () => {
    inFlight++;
    try {
      return await fn();
    } finally {
      inFlight--;
    }
  });
  // Keep the chain alive even when a run rejects.
  syncChain = run.catch(() => {});
  return run;
}

/**
 * Fetch + analyze (categorize / dedupe / transfer-detect) across connections.
 * Persists NOTHING except sync-status bookkeeping on simplefin_links.
 * userId null/undefined = system scope (scheduler): every connection.
 */
export async function runSyncPipeline(opts: {
  userId?: number | null;
  connectionIds?: number[];
  accountIds?: number[];
  startDate: string;
  endDate: string;
}): Promise<SyncPipelineResult> {
  const { userId = null, connectionIds, accountIds, startDate, endDate } = opts;
  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(endDate).getTime() / 1000);

  // Accessible connections: user scope = shared + own; system scope = all.
  const userFilter = userId != null ? '(user_id IS NULL OR user_id = ?)' : '1=1';
  const userParams = userId != null ? [userId] : [];
  let connections: (typeof simplefinConnections.$inferSelect)[];
  if (connectionIds && connectionIds.length > 0) {
    connections = sqlite.prepare(`
      SELECT * FROM simplefin_connections
      WHERE id IN (${connectionIds.map(() => '?').join(',')}) AND ${userFilter}
    `).all(...connectionIds, ...userParams) as (typeof simplefinConnections.$inferSelect)[];
  } else {
    connections = sqlite.prepare(
      `SELECT * FROM simplefin_connections WHERE ${userFilter}`,
    ).all(...userParams) as (typeof simplefinConnections.$inferSelect)[];
  }

  const result: SyncPipelineResult = {
    transactions: [],
    balanceUpdates: [],
    holdingsUpdates: [],
    failures: [],
    succeededConnectionIds: [],
    connectionCount: connections.length,
  };
  if (connections.length === 0) return result;

  const connIds = connections.map((c) => c.id);
  let allLinks = sqlite.prepare(`
    SELECT sl.*, a.name as ledger_account_name, a.classification, a.type as account_type
    FROM simplefin_links sl
    JOIN accounts a ON sl.account_id = a.id
    WHERE sl.simplefin_connection_id IN (${connIds.map(() => '?').join(',')})
  `).all(...connIds) as (typeof simplefinLinks.$inferSelect & {
    ledger_account_name: string;
    classification: AccountClassification;
    account_type: string;
  })[];

  if (accountIds && accountIds.length > 0) {
    allLinks = allLinks.filter((l) => accountIds.includes(l.account_id));
  }
  if (allLinks.length === 0) return result;

  const linkMap = new Map(allLinks.map((l) => [l.simplefin_account_id, l]));

  // Build the categorizer once (loads rules + history + merchants once).
  const categorizer = buildCategorizer(sqlite);

  const markStatus = sqlite.prepare(`
    UPDATE simplefin_links SET last_sync_status = ?, last_sync_error = ?, last_sync_attempt_at = ?
    WHERE simplefin_connection_id = ?
  `);

  for (const conn of connections) {
    const attemptAt = new Date().toISOString();
    let response;
    try {
      response = await fetchAccounts(conn.access_url, startTs, endTs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to fetch from connection ${conn.id}:`, message);
      markStatus.run('error', message, attemptAt, conn.id);
      result.failures.push({ connectionId: conn.id, label: conn.label, message, kind: classifyFailure(message) });
      continue;
    }
    markStatus.run('ok', null, attemptAt, conn.id);
    clearSyncFailureNotification(sqlite, conn.id);
    result.succeededConnectionIds.push(conn.id);

    for (const sfAccount of response.accounts) {
      const link = linkMap.get(sfAccount.id);
      if (!link) continue; // Not linked, skip

      const classification = link.classification as AccountClassification;

      // Process transactions. The per-link auto_import flag is the ONLY gate, and
      // it applies to EVERY sync path — the nightly scheduler and manual runs
      // alike — so the toggle in the account editor means one thing everywhere.
      // Investment links default auto_import=0 (their activity is mostly the
      // mirror side of contributions already imported from the liquid source,
      // plus market noise) but can opt in. All accounts contribute balances +
      // holdings regardless.
      const importTxns = link.auto_import === 1;
      if (importTxns && sfAccount.transactions.length > 0) {
        // Filter out already-imported transactions by SimpleFIN ID
        const sfTxnIds = sfAccount.transactions.map((t) => t.id);
        const existingIds = new Set<string>();
        // Check in batches to avoid SQLite parameter limits
        for (let i = 0; i < sfTxnIds.length; i += 100) {
          const batch = sfTxnIds.slice(i, i + 100);
          const rows = sqlite.prepare(`
            SELECT simplefin_transaction_id FROM transactions
            WHERE simplefin_transaction_id IN (${batch.map(() => '?').join(',')})
          `).all(...batch) as { simplefin_transaction_id: string }[];
          for (const r of rows) existingIds.add(r.simplefin_transaction_id);
        }

        const newTxns = sfAccount.transactions.filter((t) => !existingIds.has(t.id));

        if (newTxns.length > 0) {
          const catItems = newTxns.map((t) => ({
            description: t.payee || t.description,
            payee: t.payee || undefined,
            // The raw statement line carries the transfer signal — account
            // numbers, "Online Transfer to CHK ...3732" — that the cleaned
            // payee has already thrown away.
            bankDescription: t.description,
            amount: convertToLedgerSign(parseFloat(t.amount), classification),
            accountClassification: classification,
            accountType: link.account_type,
          }));
          const catResponse = catItems.map((it) => categorizer.categorize(it));

          const dupItems = newTxns.map((t) => ({
            date: unixToDate(t.transacted_at),
            amount: convertToLedgerSign(parseFloat(t.amount), classification),
            description: t.payee || t.description,
            accountId: link.account_id,
          }));
          const dupResults = detectDuplicates(dupItems);

          const transferResults = detectTransfers(
            newTxns.map((t) => ({
              payee: t.payee || '',
              description: t.description,
              amount: convertToLedgerSign(parseFloat(t.amount), classification),
            })),
          );

          for (let i = 0; i < newTxns.length; i++) {
            const t = newTxns[i];
            const cat = catResponse[i];
            const dup = dupResults[i];
            const isTransfer = transferResults[i];

            result.transactions.push({
              simplefinId: t.id,
              accountId: link.account_id,
              accountName: link.ledger_account_name,
              date: unixToDate(t.transacted_at),
              description: t.payee || t.description,
              rawDescription: t.description,
              amount: convertToLedgerSign(parseFloat(t.amount), classification),
              suggestedCategoryId: cat.categoryId,
              suggestedGroupName: cat.groupName,
              suggestedSubName: cat.subName,
              suggestedSource: cat.source,
              confidence: cat.confidence,
              duplicateStatus: dup.status,
              duplicateMatchId: dup.matchId,
              duplicateMatchDescription: dup.matchDescription,
              duplicateMatchDate: dup.matchDate,
              duplicateMatchAmount: dup.matchAmount,
              duplicateMatchAccountName: dup.matchAccountName,
              isLikelyTransfer: isTransfer,
            });
          }
        }
      }

      // Balance updates
      const sfBalance = parseFloat(sfAccount.balance);
      const balanceDate = unixToDate(sfAccount['balance-date']);
      const latestSnapshot = sqlite.prepare(`
        SELECT balance FROM balance_snapshots
        WHERE account_id = ?
        ORDER BY date DESC, id DESC
        LIMIT 1
      `).get(link.account_id) as { balance: number } | undefined;

      result.balanceUpdates.push({
        accountId: link.account_id,
        accountName: link.ledger_account_name,
        currentBalance: sfBalance,
        previousBalance: latestSnapshot?.balance ?? null,
        balanceDate,
      });

      // Holdings updates
      if (sfAccount.holdings.length > 0) {
        result.holdingsUpdates.push({
          accountId: link.account_id,
          accountName: link.ledger_account_name,
          holdings: sfAccount.holdings.map((h) => ({
            symbol: h.symbol,
            description: h.description,
            shares: parseFloat(h.shares),
            costBasis: parseFloat(h.cost_basis),
            marketValue: parseFloat(h.market_value),
          })),
        });
      }
    }
  }

  // LLM second opinion for everything the deterministic chain isn't certain
  // about (rules stay absolute). Failure-proof: any error, timeout, or
  // disabled config leaves the deterministic results untouched.
  try {
    const candidates = result.transactions
      .filter((t) => t.confidence < 1 && t.duplicateStatus !== 'exact')
      .slice(0, 200); // defensive cap — keeps a large backfill's sync bounded
    if (candidates.length > 0 && llmConfig(sqlite)) {
      const typeByAccount = new Map(allLinks.map((l) => [l.account_id, l.account_type]));
      const items: LlmTxnInput[] = candidates.map((t, i) => ({
        key: i,
        date: t.date,
        amount: t.amount,
        accountName: t.accountName,
        accountType: typeByAccount.get(t.accountId),
        merchantName: normalizeMerchantName(t.description) || null,
        description: t.description,
        bankDescription: t.rawDescription,
        prior: {
          categoryId: t.suggestedCategoryId,
          groupName: t.suggestedGroupName,
          subName: t.suggestedSubName,
          confidence: t.confidence,
          source: (t.suggestedSource ?? 'none') as CategorizeResult['source'],
        },
      }));
      const verdicts = await llmCategorizeBatch(sqlite, items);
      if (verdicts.size > 0) {
        const catMeta = new Map((sqlite.prepare('SELECT id, group_name, sub_name FROM categories').all() as
          { id: number; group_name: string; sub_name: string }[]).map((c) => [c.id, c]));
        for (const item of items) {
          const merged = mergeLlmResult(item.prior, verdicts.get(item.key));
          if (merged === item.prior) continue;
          const t = candidates[item.key];
          const meta = merged.categoryId != null ? catMeta.get(merged.categoryId) : undefined;
          t.suggestedCategoryId = merged.categoryId;
          t.suggestedGroupName = merged.groupName ?? meta?.group_name ?? null;
          t.suggestedSubName = merged.subName ?? meta?.sub_name ?? null;
          t.suggestedSource = merged.source;
          t.confidence = merged.confidence;
        }
      }
    }
  } catch (err) {
    console.error('[llm-categorize] enrichment pass failed:', err instanceof Error ? err.message : err);
  }

  // Sort transactions by date descending
  result.transactions.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

/** Persist a sync payload in one transaction. Safe to repeat (idempotent). */
export function commitSync(payload: CommitPayload): CommitResult {
  const { transactions: txns, balanceUpdates, holdingsUpdates } = payload;
  let txnCount = 0;
  let balanceCount = 0;
  let holdingsCount = 0;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const commitTxn = sqlite.transaction(() => {
    // Insert transactions
    if (txns && txns.length > 0) {
      const insertTxn = sqlite.prepare(`
        INSERT INTO transactions (account_id, date, description, bank_description, note, category_id, merchant_id, amount, simplefin_transaction_id, categorize_confidence, needs_review, categorize_source)
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(simplefin_transaction_id) WHERE simplefin_transaction_id IS NOT NULL DO NOTHING
      `);
      const insertSplit = sqlite.prepare(`
        INSERT INTO transaction_splits (transaction_id, category_id, amount)
        VALUES (?, ?, ?)
      `);

      for (const t of txns) {
        const hasSplits = t.splits && t.splits.length >= 2;
        // Resolve merchant from the payee-preferred description (same handle → atomic).
        const merchantId = resolveMerchantId(t.description, sqlite);
        const catId = hasSplits ? null : (t.categoryId ?? null);
        const conf = hasSplits ? null : (t.confidence ?? null);
        // Flag for review when uncategorized, or auto-categorized below the
        // confidence threshold. Split parents are considered categorized (via legs).
        const needsReview = hasSplits ? 0 : (catId == null || (conf != null && conf < REVIEW_THRESHOLD) ? 1 : 0);
        const source = catId == null ? null : (t.source ?? null);
        const result = insertTxn.run(
          t.accountId,
          t.date,
          t.description,
          t.rawDescription ?? t.description,
          catId,
          merchantId,
          t.amount,
          t.simplefinId,
          conf,
          needsReview,
          source,
        );
        // ON CONFLICT DO NOTHING → changes 0 when the scheduler and a manual
        // commit race on the same simplefinId; only the winner counts/flag.
        if (result.changes === 0) continue;
        const newTxnId = Number(result.lastInsertRowid);
        if (hasSplits) {
          for (const s of t.splits!) {
            insertSplit.run(newTxnId, s.categoryId, s.amount);
          }
        }
        // Auto-flagged rows open a review assigned to the account owner (the most-
        // privileged owner if the account is shared), and notify them.
        if (needsReview === 1) {
          flagReview(sqlite, {
            txnId: newTxnId,
            reason: catId == null ? 'auto_uncategorized' : 'auto_low_confidence',
            assigneeId: defaultAssigneeForTxn(sqlite, newTxnId),
          });
        }
        txnCount++;
      }
    }

    // Balance snapshots — delete + reinsert per (account, date) so a retried
    // day never stacks rows, while the fresh row still takes the HIGHEST id:
    // "current balance" readers tiebreak same-date rows by id, so a later sync
    // must outrank a same-day manual snapshot (which stays untouched).
    if (balanceUpdates && balanceUpdates.length > 0) {
      const deleteBalance = sqlite.prepare(`
        DELETE FROM balance_snapshots
        WHERE account_id = ? AND date = ? AND note = 'SimpleFIN bank sync'
      `);
      const insertBalance = sqlite.prepare(`
        INSERT INTO balance_snapshots (account_id, date, balance, note)
        VALUES (?, ?, ?, 'SimpleFIN bank sync')
      `);
      for (const b of balanceUpdates) {
        deleteBalance.run(b.accountId, b.date);
        insertBalance.run(b.accountId, b.date, b.balance);
        balanceCount++;
      }
    }

    // Holdings: snapshot outgoing rows to history, replace the current table,
    // snapshot the fresh rows under today.
    if (holdingsUpdates && holdingsUpdates.length > 0) {
      const snapshotExisting = sqlite.prepare(`
        INSERT OR REPLACE INTO holdings_history (simplefin_link_id, symbol, date, shares, cost_basis, market_value)
        SELECT simplefin_link_id, UPPER(symbol), substr(updated_at, 1, 10), shares, cost_basis, market_value
        FROM simplefin_holdings WHERE simplefin_link_id = ?
      `);
      const snapshotNew = sqlite.prepare(`
        INSERT OR REPLACE INTO holdings_history (simplefin_link_id, symbol, date, shares, cost_basis, market_value)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertHolding = sqlite.prepare(`
        INSERT INTO simplefin_holdings (simplefin_link_id, symbol, description, shares, cost_basis, market_value, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const hu of holdingsUpdates) {
        const link = sqlite.prepare(
          'SELECT id FROM simplefin_links WHERE account_id = ? LIMIT 1',
        ).get(hu.accountId) as { id: number } | undefined;
        if (!link) continue;

        snapshotExisting.run(link.id);
        sqlite.prepare('DELETE FROM simplefin_holdings WHERE simplefin_link_id = ?').run(link.id);
        for (const h of hu.holdings) {
          insertHolding.run(link.id, h.symbol, h.description, h.shares, h.costBasis, h.marketValue, now);
          snapshotNew.run(link.id, h.symbol.toUpperCase(), today, h.shares, h.costBasis, h.marketValue);
          holdingsCount++;
        }
      }
    }

    // Update last_synced_at on links
    const accountIds = new Set<number>();
    if (txns) txns.forEach((t) => accountIds.add(t.accountId));
    if (balanceUpdates) balanceUpdates.forEach((b) => accountIds.add(b.accountId));
    if (holdingsUpdates) holdingsUpdates.forEach((h) => accountIds.add(h.accountId));

    if (accountIds.size > 0) {
      const updateSync = sqlite.prepare('UPDATE simplefin_links SET last_synced_at = ? WHERE account_id = ?');
      for (const accountId of accountIds) {
        updateSync.run(now, accountId);
      }
    }
  });

  commitTxn();

  // Fresh spending may push categories over budget — sweep the touched months.
  // (Internally per-month try/catch: an alert failure never fails the commit.)
  if (txns && txns.length > 0) {
    checkBudgetExceededForMonths(sqlite, txns.map((t) => t.date.slice(0, 7)));
    // Pair the two legs of any transfer that just landed, so it shows as one row.
    // Never fail the commit over it — the rows are already safely stored.
    try {
      const earliest = txns.map((t) => t.date).sort()[0];
      const since = new Date(new Date(`${earliest}T00:00:00`).getTime() - WINDOW_DAYS * 86400000)
        .toISOString().slice(0, 10);
      const linked = linkTransfers(sqlite, { since }).linked;
      if (linked > 0) console.log(`[transfers] linked ${linked} transfer pair(s)`);
    } catch (err) {
      console.error('[transfers] linking failed:', err instanceof Error ? err.message : err);
    }
  }

  return { transactionsImported: txnCount, balancesUpdated: balanceCount, holdingsUpdated: holdingsCount };
}
