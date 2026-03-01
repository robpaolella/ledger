import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import {
  simplefinConnections,
  simplefinLinks,
  simplefinHoldings,
  transactions,
  accounts,
  categories,
} from '../db/schema.js';
import { eq, or, isNull } from 'drizzle-orm';
import { claimAccessUrl, fetchAccounts } from '../services/simplefin.js';
import { convertToLedgerSign } from '../services/signConversion.js';
import { detectDuplicates } from '../services/duplicateDetector.js';
import { detectTransfers } from '../services/transferDetector.js';
import type { AccountClassification, SyncTransaction, SyncBalanceUpdate, SyncHoldingsUpdate } from '@ledger/shared/src/types.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

// === Connection CRUD ===

// POST /api/simplefin/connections
router.post('/connections', requirePermission('simplefin.manage'), async (req: Request, res: Response) => {
  try {
    const { setupToken, accessUrl: rawAccessUrl, label, shared } = req.body as {
      setupToken?: string;
      accessUrl?: string;
      label: string;
      shared: boolean;
    };

    if (!label) {
      res.status(400).json({ error: 'Label is required' });
      return;
    }
    if (!setupToken && !rawAccessUrl) {
      res.status(400).json({ error: 'Either setupToken or accessUrl is required' });
      return;
    }

    let accessUrl = rawAccessUrl?.trim() || '';
    if (setupToken) {
      try {
        accessUrl = await claimAccessUrl(setupToken);
      } catch (err: unknown) {
        res.status(400).json({ error: (err instanceof Error ? err.message : 'Failed to claim setup token') });
        return;
      }
    }

    const userId = shared ? null : req.user!.userId;
    const now = new Date().toISOString();

    const result = db.insert(simplefinConnections).values({
      user_id: userId,
      access_url: accessUrl,
      label,
      created_at: now,
      updated_at: now,
    }).run();

    res.status(201).json({
      data: {
        id: Number(result.lastInsertRowid),
        label,
        isShared: shared,
        linkedAccountCount: 0,
        lastSyncedAt: null,
      },
    });
  } catch (err) {
    console.error('POST /simplefin/connections error:', err);
    res.status(500).json({ error: 'Failed to create connection' });
  }
});

// GET /api/simplefin/connections
router.get('/connections', (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Get all accessible connections: shared (user_id IS NULL) + user's own
    const rows = sqlite.prepare(`
      SELECT
        sc.id,
        sc.user_id,
        sc.label,
        sc.created_at,
        sc.updated_at,
        COUNT(a.id) as linked_account_count,
        MAX(sl.last_synced_at) as last_synced_at
      FROM simplefin_connections sc
      LEFT JOIN simplefin_links sl ON sl.simplefin_connection_id = sc.id
      LEFT JOIN accounts a ON sl.account_id = a.id AND a.is_active = 1
      WHERE sc.user_id IS NULL OR sc.user_id = ?
      GROUP BY sc.id
      ORDER BY sc.created_at
    `).all(userId) as {
      id: number;
      user_id: number | null;
      label: string;
      created_at: string;
      updated_at: string;
      linked_account_count: number;
      last_synced_at: string | null;
    }[];

    const data = rows.map((r) => ({
      id: r.id,
      label: r.label,
      isShared: r.user_id === null,
      linkedAccountCount: r.linked_account_count,
      lastSyncedAt: r.last_synced_at,
    }));

    res.json({ data });
  } catch (err) {
    console.error('GET /simplefin/connections error:', err);
    res.status(500).json({ error: 'Failed to fetch connections' });
  }
});

// PUT /api/simplefin/connections/:id
router.put('/connections/:id', requirePermission('simplefin.manage'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user!.userId;

    const conn = db.select().from(simplefinConnections).where(eq(simplefinConnections.id, id)).get();
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    if (conn.user_id !== null && conn.user_id !== userId) {
      res.status(403).json({ error: 'Not authorized to edit this connection' });
      return;
    }

    const { label, accessUrl, setupToken } = req.body;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (label !== undefined) updates.label = label;
    if (accessUrl !== undefined) updates.access_url = accessUrl;
    if (setupToken) {
      try {
        updates.access_url = await claimAccessUrl(setupToken);
      } catch (err: unknown) {
        res.status(400).json({ error: (err instanceof Error ? err.message : 'Failed to claim setup token') });
        return;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.update(simplefinConnections).set(updates as any).where(eq(simplefinConnections.id, id)).run();

    res.json({ data: { id, label: (updates.label as string) || conn.label } });
  } catch (err) {
    console.error('PUT /simplefin/connections/:id error:', err);
    res.status(500).json({ error: 'Failed to update connection' });
  }
});

// DELETE /api/simplefin/connections/:id
router.delete('/connections/:id', requirePermission('simplefin.manage'), (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user!.userId;

    const conn = db.select().from(simplefinConnections).where(eq(simplefinConnections.id, id)).get();
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    if (conn.user_id !== null && conn.user_id !== userId) {
      res.status(403).json({ error: 'Not authorized to delete this connection' });
      return;
    }

    // Delete holdings for links under this connection
    const links = db.select({ id: simplefinLinks.id })
      .from(simplefinLinks)
      .where(eq(simplefinLinks.simplefin_connection_id, id))
      .all();
    const linkIds = links.map((l) => l.id);

    if (linkIds.length > 0) {
      for (const linkId of linkIds) {
        db.delete(simplefinHoldings).where(eq(simplefinHoldings.simplefin_link_id, linkId)).run();
      }
    }

    // Delete links
    db.delete(simplefinLinks).where(eq(simplefinLinks.simplefin_connection_id, id)).run();

    // Delete connection
    db.delete(simplefinConnections).where(eq(simplefinConnections.id, id)).run();

    res.json({ data: { message: 'Connection removed' } });
  } catch (err) {
    console.error('DELETE /simplefin/connections/:id error:', err);
    res.status(500).json({ error: 'Failed to delete connection' });
  }
});

// GET /api/simplefin/connections/:id/accounts
router.get('/connections/:id/accounts', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user!.userId;

    const conn = db.select().from(simplefinConnections).where(eq(simplefinConnections.id, id)).get();
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    if (conn.user_id !== null && conn.user_id !== userId) {
      res.status(403).json({ error: 'Not authorized to access this connection' });
      return;
    }

    // Fetch accounts from SimpleFIN (no transactions needed for listing)
    const response = await fetchAccounts(conn.access_url);

    // Get existing links for this connection, filtering out links to inactive accounts
    const existingLinks = sqlite.prepare(`
      SELECT sl.* FROM simplefin_links sl
      JOIN accounts a ON sl.account_id = a.id AND a.is_active = 1
      WHERE sl.simplefin_connection_id = ?
    `).all(id) as (typeof simplefinLinks.$inferSelect)[];
    const linkMap = new Map(existingLinks.map((l) => [l.simplefin_account_id, l]));

    // Clean up any orphaned links (pointing to inactive accounts)
    sqlite.prepare(`
      DELETE FROM simplefin_links
      WHERE simplefin_connection_id = ?
        AND account_id IN (SELECT id FROM accounts WHERE is_active = 0)
    `).run(id);

    const data = response.accounts.map((acct) => {
      const link = linkMap.get(acct.id);
      return {
        simplefinAccountId: acct.id,
        name: acct.name,
        balance: parseFloat(acct.balance),
        currency: acct.currency,
        org: acct.org.name,
        link: link ? {
          id: link.id,
          accountId: link.account_id,
          lastSyncedAt: link.last_synced_at,
        } : null,
      };
    });

    res.json({ data });
  } catch (err: unknown) {
    console.error('GET /simplefin/connections/:id/accounts error:', err);
    res.status(500).json({ error: (err instanceof Error ? err.message : 'Failed to fetch SimpleFIN accounts') });
  }
});

// === Link CRUD ===

// GET /api/simplefin/linked-accounts — all linked accounts grouped by connection
router.get('/linked-accounts', (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rows = sqlite.prepare(`
      SELECT
        sc.id as connection_id,
        sc.label as connection_label,
        sl.id as link_id,
        sl.account_id,
        sl.simplefin_account_id,
        sl.simplefin_account_name,
        sl.simplefin_org_name,
        sl.last_synced_at,
        a.name as ledger_account_name
      FROM simplefin_connections sc
      JOIN simplefin_links sl ON sl.simplefin_connection_id = sc.id
      JOIN accounts a ON sl.account_id = a.id
      WHERE sc.user_id IS NULL OR sc.user_id = ?
      ORDER BY sc.label, sl.simplefin_account_name
    `).all(userId) as {
      connection_id: number;
      connection_label: string;
      link_id: number;
      account_id: number;
      simplefin_account_id: string;
      simplefin_account_name: string;
      simplefin_org_name: string | null;
      last_synced_at: string | null;
      ledger_account_name: string;
    }[];

    // Group by connection
    const grouped = new Map<number, {
      connectionId: number;
      connectionLabel: string;
      accounts: typeof rows;
    }>();

    for (const r of rows) {
      if (!grouped.has(r.connection_id)) {
        grouped.set(r.connection_id, {
          connectionId: r.connection_id,
          connectionLabel: r.connection_label,
          accounts: [],
        });
      }
      grouped.get(r.connection_id)!.accounts.push(r);
    }

    res.json({ data: Array.from(grouped.values()) });
  } catch (err) {
    console.error('GET /simplefin/linked-accounts error:', err);
    res.status(500).json({ error: 'Failed to fetch linked accounts' });
  }
});

// POST /api/simplefin/links
router.post('/links', requirePermission('simplefin.manage'), (req: Request, res: Response) => {
  try {
    const { simplefinConnectionId, simplefinAccountId, accountId, simplefinAccountName, simplefinOrgName } = req.body;

    if (!simplefinConnectionId || !simplefinAccountId || !accountId || !simplefinAccountName) {
      res.status(400).json({ error: 'simplefinConnectionId, simplefinAccountId, accountId, and simplefinAccountName are required' });
      return;
    }

    const result = db.insert(simplefinLinks).values({
      simplefin_connection_id: simplefinConnectionId,
      simplefin_account_id: simplefinAccountId,
      account_id: accountId,
      simplefin_account_name: simplefinAccountName,
      simplefin_org_name: simplefinOrgName || null,
    }).run();

    res.status(201).json({
      data: {
        id: Number(result.lastInsertRowid),
        simplefinConnectionId,
        simplefinAccountId,
        accountId,
        simplefinAccountName,
      },
    });
  } catch (err) {
    console.error('POST /simplefin/links error:', err);
    res.status(500).json({ error: 'Failed to create link' });
  }
});

// DELETE /api/simplefin/links/:id
router.delete('/links/:id', requirePermission('simplefin.manage'), (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const link = db.select().from(simplefinLinks).where(eq(simplefinLinks.id, id)).get();
    if (!link) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }

    // Delete associated holdings
    db.delete(simplefinHoldings).where(eq(simplefinHoldings.simplefin_link_id, id)).run();
    // Delete the link
    db.delete(simplefinLinks).where(eq(simplefinLinks.id, id)).run();

    res.json({ data: { message: 'Link removed' } });
  } catch (err) {
    console.error('DELETE /simplefin/links/:id error:', err);
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// === Sync & Commit ===

// POST /api/simplefin/sync
router.post('/sync', requirePermission('import.bank_sync'), async (req: Request, res: Response) => {
  try {
    const { connectionIds, accountIds, startDate, endDate } = req.body as {
      connectionIds?: number[];
      accountIds?: number[];
      startDate: string;
      endDate: string;
    };

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    const userId = req.user!.userId;
    const startTs = Math.floor(new Date(startDate).getTime() / 1000);
    const endTs = Math.floor(new Date(endDate).getTime() / 1000);

    // Get accessible connections
    let connections;
    if (connectionIds && connectionIds.length > 0) {
      connections = sqlite.prepare(`
        SELECT * FROM simplefin_connections
        WHERE id IN (${connectionIds.map(() => '?').join(',')})
        AND (user_id IS NULL OR user_id = ?)
      `).all(...connectionIds, userId) as (typeof simplefinConnections.$inferSelect)[];
    } else {
      connections = sqlite.prepare(`
        SELECT * FROM simplefin_connections
        WHERE user_id IS NULL OR user_id = ?
      `).all(userId) as (typeof simplefinConnections.$inferSelect)[];
    }

    if (connections.length === 0) {
      res.status(400).json({ error: 'No accessible connections found' });
      return;
    }

    // Get all linked accounts for these connections
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

    // Filter by accountIds if specified
    if (accountIds && accountIds.length > 0) {
      allLinks = allLinks.filter((l) => accountIds.includes(l.account_id));
    }

    if (allLinks.length === 0) {
      res.json({ data: { transactions: [], balanceUpdates: [], holdingsUpdates: [] } });
      return;
    }

    // Build link lookup by SimpleFIN account ID
    const linkMap = new Map(allLinks.map((l) => [l.simplefin_account_id, l]));

    // Fetch from each connection
    const allSyncTransactions: SyncTransaction[] = [];
    const allBalanceUpdates: SyncBalanceUpdate[] = [];
    const allHoldingsUpdates: SyncHoldingsUpdate[] = [];

    for (const conn of connections) {
      let response;
      try {
        response = await fetchAccounts(conn.access_url, startTs, endTs);
      } catch (err: unknown) {
        console.error(`Failed to fetch from connection ${conn.id}:`, err instanceof Error ? err.message : err);
        continue;
      }

      for (const sfAccount of response.accounts) {
        const link = linkMap.get(sfAccount.id);
        if (!link) continue; // Not linked, skip

        const classification = link.classification as AccountClassification;

        // Process transactions
        if (sfAccount.transactions.length > 0) {
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
            // Convert amounts and build categorization items
            const catItems = newTxns.map((t) => ({
              description: t.payee || t.description,
              payee: t.payee || undefined,
              amount: convertToLedgerSign(parseFloat(t.amount), classification),
            }));

            // Auto-categorize
            const catResponse = autoCategorize(catItems);

            // Detect duplicates
            const dupItems = newTxns.map((t) => ({
              date: unixToDate(t.transacted_at),
              amount: convertToLedgerSign(parseFloat(t.amount), classification),
              description: t.payee || t.description,
              accountId: link.account_id,
            }));
            const dupResults = detectDuplicates(dupItems);

            // Detect transfers
            const transferResults = detectTransfers(
              newTxns.map((t) => ({
                payee: t.payee || '',
                description: t.description,
                amount: convertToLedgerSign(parseFloat(t.amount), classification),
              }))
            );

            for (let i = 0; i < newTxns.length; i++) {
              const t = newTxns[i];
              const cat = catResponse[i];
              const dup = dupResults[i];
              const isTransfer = transferResults[i];

              allSyncTransactions.push({
                simplefinId: t.id,
                accountId: link.account_id,
                accountName: link.ledger_account_name,
                date: unixToDate(t.transacted_at),
                description: t.payee || t.description,
                rawDescription: t.description,
                amount: convertToLedgerSign(parseFloat(t.amount), classification),
                suggestedCategoryId: cat.suggestedCategoryId,
                suggestedGroupName: cat.suggestedGroupName,
                suggestedSubName: cat.suggestedSubName,
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

        // Get latest balance snapshot for this account
        const latestSnapshot = sqlite.prepare(`
          SELECT balance FROM balance_snapshots
          WHERE account_id = ?
          ORDER BY date DESC, id DESC
          LIMIT 1
        `).get(link.account_id) as { balance: number } | undefined;

        allBalanceUpdates.push({
          accountId: link.account_id,
          accountName: link.ledger_account_name,
          currentBalance: sfBalance,
          previousBalance: latestSnapshot?.balance ?? null,
          balanceDate,
        });

        // Holdings updates
        if (sfAccount.holdings.length > 0) {
          allHoldingsUpdates.push({
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

    // Sort transactions by date descending
    allSyncTransactions.sort((a, b) => b.date.localeCompare(a.date));

    res.json({
      data: {
        transactions: allSyncTransactions,
        balanceUpdates: allBalanceUpdates,
        holdingsUpdates: allHoldingsUpdates,
      },
    });
  } catch (err) {
    console.error('POST /simplefin/sync error:', err);
    res.status(500).json({ error: 'Failed to sync with SimpleFIN' });
  }
});

// POST /api/simplefin/commit
router.post('/commit', requirePermission('import.bank_sync'), (req: Request, res: Response) => {
  try {
    const { transactions: txns, balanceUpdates, holdingsUpdates } = req.body as {
      transactions: {
        simplefinId: string;
        accountId: number;
        date: string;
        description: string;
        rawDescription: string;
        amount: number;
        categoryId?: number;
        splits?: { categoryId: number; amount: number }[];
      }[];
      balanceUpdates: {
        accountId: number;
        balance: number;
        date: string;
      }[];
      holdingsUpdates: {
        accountId: number;
        holdings: {
          symbol: string;
          description: string;
          shares: number;
          costBasis: number;
          marketValue: number;
        }[];
      }[];
    };

    let txnCount = 0;
    let balanceCount = 0;
    let holdingsCount = 0;
    const now = new Date().toISOString();

    const commitTxn = sqlite.transaction(() => {
      // Insert transactions
      if (txns && txns.length > 0) {
        const insertTxn = sqlite.prepare(`
          INSERT INTO transactions (account_id, date, description, note, category_id, amount, simplefin_transaction_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const insertSplit = sqlite.prepare(`
          INSERT INTO transaction_splits (transaction_id, category_id, amount)
          VALUES (?, ?, ?)
        `);

        for (const t of txns) {
          const hasSplits = t.splits && t.splits.length >= 2;
          // Store payee as description, raw bank description as note
          const result = insertTxn.run(
            t.accountId,
            t.date,
            t.description,
            t.rawDescription !== t.description ? t.rawDescription : null,
            hasSplits ? null : (t.categoryId ?? null),
            t.amount,
            t.simplefinId
          );
          if (hasSplits) {
            const txnId = Number(result.lastInsertRowid);
            for (const s of t.splits!) {
              insertSplit.run(txnId, s.categoryId, s.amount);
            }
          }
          txnCount++;
        }
      }

      // Create balance snapshots
      if (balanceUpdates && balanceUpdates.length > 0) {
        const insertBalance = sqlite.prepare(`
          INSERT INTO balance_snapshots (account_id, date, balance, note)
          VALUES (?, ?, ?, ?)
        `);

        for (const b of balanceUpdates) {
          insertBalance.run(b.accountId, b.date, b.balance, 'SimpleFIN bank sync');
          balanceCount++;
        }
      }

      // Upsert holdings
      if (holdingsUpdates && holdingsUpdates.length > 0) {
        for (const hu of holdingsUpdates) {
          // Find the link for this account
          const link = sqlite.prepare(`
            SELECT id FROM simplefin_links WHERE account_id = ? LIMIT 1
          `).get(hu.accountId) as { id: number } | undefined;

          if (!link) continue;

          // Delete existing holdings for this link
          sqlite.prepare('DELETE FROM simplefin_holdings WHERE simplefin_link_id = ?').run(link.id);

          // Insert new holdings
          const insertHolding = sqlite.prepare(`
            INSERT INTO simplefin_holdings (simplefin_link_id, symbol, description, shares, cost_basis, market_value, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          for (const h of hu.holdings) {
            insertHolding.run(link.id, h.symbol, h.description, h.shares, h.costBasis, h.marketValue, now);
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

    res.json({
      data: {
        transactionsImported: txnCount,
        balancesUpdated: balanceCount,
        holdingsUpdated: holdingsCount,
      },
    });
  } catch (err) {
    console.error('POST /simplefin/commit error:', err);
    res.status(500).json({ error: 'Failed to commit sync data' });
  }
});

// GET /api/simplefin/balances — lightweight balance fetch for all linked accounts
router.get('/balances', requirePermission('balances.update'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Get all connections this user can access (shared + personal)
    const connections = db.select().from(simplefinConnections)
      .where(
        or(
          isNull(simplefinConnections.user_id),
          eq(simplefinConnections.user_id, userId),
        )!
      ).all();

    if (connections.length === 0) {
      res.json({ data: [] });
      return;
    }

    const results: { accountId: number; accountName: string; simplefinBalance: number; balanceDate: string; classification: string; holdings: { symbol: string; description: string; shares: number; costBasis: number; marketValue: number }[] }[] = [];

    for (const conn of connections) {
      const response = await fetchAccounts(conn.access_url);

      // Get links for this connection
      const links = db.select({
        id: simplefinLinks.id,
        simplefin_account_id: simplefinLinks.simplefin_account_id,
        account_id: simplefinLinks.account_id,
      }).from(simplefinLinks)
        .where(eq(simplefinLinks.simplefin_connection_id, conn.id))
        .all();
      const linkMap = new Map(links.map(l => [l.simplefin_account_id, l]));

      for (const sfAcct of response.accounts) {
        const link = linkMap.get(sfAcct.id);
        if (!link) continue;

        // Get account name
        const acct = db.select({ name: accounts.name, classification: accounts.classification })
          .from(accounts).where(eq(accounts.id, link.account_id)).get();
        if (!acct) continue;

        // Balances are NOT sign-converted — they already use real-world convention
        // (positive = asset, negative = liability)
        const balance = parseFloat(sfAcct.balance);

        // Include holdings for investment accounts
        const rawHoldings = Array.isArray(sfAcct.holdings) ? sfAcct.holdings : [];
        const holdings = rawHoldings.map(h => ({
          symbol: h.symbol || '',
          description: h.description || '',
          shares: parseFloat(String(h.shares ?? 0)) || 0,
          costBasis: parseFloat(String(h.cost_basis ?? 0)) || 0,
          marketValue: parseFloat(String(h.market_value ?? 0)) || 0,
        }));

        results.push({
          accountId: link.account_id,
          accountName: acct.name,
          simplefinBalance: balance,
          balanceDate: sfAcct['balance-date'] ? new Date(sfAcct['balance-date'] * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          classification: acct.classification,
          holdings,
        });
      }
    }

    res.json({ data: results });
  } catch (err: unknown) {
    console.error('GET /simplefin/balances error:', err);
    res.status(500).json({ error: (err instanceof Error ? err.message : 'Failed to fetch balances') });
  }
});

// GET /api/simplefin/holdings — holdings grouped by account for Net Worth
router.get('/holdings', (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rows = sqlite.prepare(`
      SELECT
        sl.account_id,
        a.name as account_name,
        sh.symbol, sh.description, sh.shares, sh.cost_basis, sh.market_value, sh.updated_at
      FROM simplefin_holdings sh
      JOIN simplefin_links sl ON sh.simplefin_link_id = sl.id
      JOIN simplefin_connections sc ON sl.simplefin_connection_id = sc.id
      JOIN accounts a ON sl.account_id = a.id
      WHERE sc.user_id IS NULL OR sc.user_id = ?
      ORDER BY a.name, sh.symbol
    `).all(userId) as {
      account_id: number;
      account_name: string;
      symbol: string;
      description: string;
      shares: number;
      cost_basis: number;
      market_value: number;
      updated_at: string;
    }[];

    const grouped = new Map<number, {
      accountId: number;
      accountName: string;
      holdings: { symbol: string; description: string; shares: number; costBasis: number; marketValue: number }[];
      updatedAt: string | null;
    }>();

    for (const r of rows) {
      if (!grouped.has(r.account_id)) {
        grouped.set(r.account_id, {
          accountId: r.account_id,
          accountName: r.account_name,
          holdings: [],
          updatedAt: r.updated_at,
        });
      }
      grouped.get(r.account_id)!.holdings.push({
        symbol: r.symbol,
        description: r.description,
        shares: r.shares,
        costBasis: r.cost_basis,
        marketValue: r.market_value,
      });
    }

    res.json({ data: { accountHoldings: Array.from(grouped.values()) } });
  } catch (err) {
    console.error('GET /simplefin/holdings error:', err);
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
});

// === Helpers ===

function unixToDate(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

/**
 * Inline auto-categorization (reuses the same logic as the import/categorize endpoint).
 */
function autoCategorize(items: { description: string; payee?: string; amount: number }[]): {
  suggestedCategoryId: number | null;
  suggestedGroupName: string | null;
  suggestedSubName: string | null;
  confidence: number;
}[] {
  // Build history map
  const history = db.select({
    description: transactions.description,
    category_id: transactions.category_id,
    group_name: categories.group_name,
    sub_name: categories.sub_name,
  }).from(transactions)
    .innerJoin(categories, eq(transactions.category_id, categories.id))
    .all();

  const descCatMap = new Map<string, { categoryId: number; groupName: string; subName: string; count: number }>();
  for (const h of history) {
    const key = h.description.toLowerCase().trim();
    const existing = descCatMap.get(key);
    if (!existing || existing.count < 1) {
      descCatMap.set(key, {
        categoryId: h.category_id!,
        groupName: h.group_name,
        subName: h.sub_name,
        count: (existing?.count || 0) + 1,
      });
    }
  }

  const RULES: { pattern: RegExp; groupName: string; subName: string }[] = [
    { pattern: /shell|chevron|exxon|mobil|bp |sunoco|gas|fuel|wawa.*gas/i, groupName: 'Auto/Transportation', subName: 'Fuel' },
    { pattern: /costco gas/i, groupName: 'Auto/Transportation', subName: 'Fuel' },
    { pattern: /costco|giant|groceries|grocery|aldi|trader joe|whole foods|safeway|kroger|publix|wegmans|food lion|jimbo/i, groupName: 'Daily Living', subName: 'Groceries' },
    { pattern: /amazon|amzn/i, groupName: 'Daily Living', subName: 'Online Shopping' },
    { pattern: /walmart|target|dollar/i, groupName: 'Daily Living', subName: 'General Merchandise' },
    { pattern: /netflix|hulu|disney|spotify|apple.*music|hbo|paramount|peacock/i, groupName: 'Dues/Subscriptions', subName: 'Streaming Services' },
    { pattern: /restaurant|mcdonald|wendy|burger|chick-fil|chipotle|panera|starbucks|dunkin|coffee|pizza|taco bell|diner|jersey mike|in-n-out|del taco|subway|on the border|chili|peet/i, groupName: 'Daily Living', subName: 'Dining/Eating Out' },
    { pattern: /uber eats|doordash|grubhub|postmates/i, groupName: 'Daily Living', subName: 'Dining/Eating Out' },
    { pattern: /uber|lyft|taxi|cab/i, groupName: 'Auto/Transportation', subName: 'Ride Share' },
    { pattern: /geico|progressive|allstate|state farm|insurance/i, groupName: 'Insurance', subName: 'Auto Insurance' },
    { pattern: /at&t|verizon|t-mobile|sprint|comcast|xfinity|internet|wifi/i, groupName: 'Utilities', subName: 'Cellphone' },
    { pattern: /electric|power|energy|ppl|duke energy|sd gas|sdge/i, groupName: 'Utilities', subName: 'Electric' },
    { pattern: /water.*sewer|water bill|sewer/i, groupName: 'Utilities', subName: 'Water/Sewer' },
    { pattern: /home depot|lowes|hardware/i, groupName: 'Household', subName: 'Improvements' },
    { pattern: /cvs|walgreens|pharmacy|rx|doctor|dr\.|medical|hospital|urgent care/i, groupName: 'Health', subName: 'Medical' },
    { pattern: /gym|fitness|planet fitness|equinox|yoga/i, groupName: 'Health', subName: 'Gym/Fitness' },
    { pattern: /payroll|direct deposit|salary|wages/i, groupName: 'Income', subName: 'Take Home Pay' },
    { pattern: /interest.*payment|interest.*earned|interest paid|interest$/i, groupName: 'Income', subName: 'Interest Income' },
    { pattern: /cloudflare|github|namecheap|elevenlabs|steam/i, groupName: 'Dues/Subscriptions', subName: 'Online Services' },
    { pattern: /southwest|american airlines|united airlines|delta|frontier/i, groupName: 'Discretionary', subName: 'Travel' },
  ];

  const allCats = db.select().from(categories).all();
  const catLookup = new Map(allCats.map((c) => [`${c.group_name}:${c.sub_name}`, c.id]));

  return items.map((item) => {
    const primaryText = item.payee || item.description;
    const primaryLower = primaryText.toLowerCase().trim();
    const descLower = item.description.toLowerCase().trim();

    // 1. Exact match from history
    const exactPayee = descCatMap.get(primaryLower);
    if (exactPayee) {
      return { suggestedCategoryId: exactPayee.categoryId, suggestedGroupName: exactPayee.groupName, suggestedSubName: exactPayee.subName, confidence: 1.0 };
    }
    if (item.payee) {
      const exactDesc = descCatMap.get(descLower);
      if (exactDesc) {
        return { suggestedCategoryId: exactDesc.categoryId, suggestedGroupName: exactDesc.groupName, suggestedSubName: exactDesc.subName, confidence: 0.9 };
      }
    }

    // 2. Partial match
    for (const [key, val] of descCatMap.entries()) {
      if (primaryLower.includes(key) || key.includes(primaryLower) ||
          (item.payee && (descLower.includes(key) || key.includes(descLower)))) {
        return { suggestedCategoryId: val.categoryId, suggestedGroupName: val.groupName, suggestedSubName: val.subName, confidence: 0.7 };
      }
    }

    // 3. Rule-based
    for (const rule of RULES) {
      if (rule.pattern.test(primaryText) || (item.payee && rule.pattern.test(item.description))) {
        const catId = catLookup.get(`${rule.groupName}:${rule.subName}`);
        return { suggestedCategoryId: catId || null, suggestedGroupName: rule.groupName, suggestedSubName: rule.subName, confidence: 0.7 };
      }
    }

    return { suggestedCategoryId: null, suggestedGroupName: null, suggestedSubName: null, confidence: 0.0 };
  });
}

export default router;
