import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import {
  simplefinConnections,
  simplefinLinks,
  simplefinHoldings,
  accounts,
} from '../db/schema.js';
import { eq, or, isNull } from 'drizzle-orm';
import { claimAccessUrl, fetchAccounts } from '../services/simplefin.js';
import { runSyncPipeline, commitSync, withSyncLock, type CommitPayload } from '../services/simplefinSync.js';
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

    // Give the linked account an institution identity from the SimpleFIN org
    // (name, and domain if the client passed it). Never override an existing pick.
    if (simplefinOrgName) {
      const acct = sqlite.prepare('SELECT institution_id FROM accounts WHERE id = ?').get(accountId) as { institution_id: number | null } | undefined;
      if (acct && acct.institution_id == null) {
        const orgName = String(simplefinOrgName).trim();
        const orgDomain = req.body.simplefinOrgDomain
          ? String(req.body.simplefinOrgDomain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
          : null;
        let inst = sqlite.prepare('SELECT id FROM financial_institutions WHERE LOWER(name) = LOWER(?)').get(orgName) as { id: number } | undefined;
        if (!inst && orgDomain) {
          inst = sqlite.prepare('SELECT id FROM financial_institutions WHERE LOWER(domain) = LOWER(?)').get(orgDomain) as { id: number } | undefined;
        }
        if (!inst && orgName) {
          sqlite.prepare('INSERT OR IGNORE INTO financial_institutions (name, domain, is_system) VALUES (?, ?, 0)').run(orgName, orgDomain);
          inst = sqlite.prepare('SELECT id FROM financial_institutions WHERE LOWER(name) = LOWER(?)').get(orgName) as { id: number } | undefined;
        }
        if (inst) sqlite.prepare('UPDATE accounts SET institution_id = ? WHERE id = ?').run(inst.id, accountId);
      }
    }

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

    // Shared pipeline (also used by the daily scheduler). The lock serializes
    // the fetch phase with any in-flight scheduled run — we wait, not 409.
    const result = await withSyncLock(() =>
      runSyncPipeline({ userId: req.user!.userId, connectionIds, accountIds, startDate, endDate }),
    );

    if (result.connectionCount === 0) {
      res.status(400).json({ error: 'No accessible connections found' });
      return;
    }

    res.json({
      data: {
        transactions: result.transactions,
        balanceUpdates: result.balanceUpdates,
        holdingsUpdates: result.holdingsUpdates,
        failures: result.failures,
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
    const result = commitSync(req.body as CommitPayload);
    res.json({ data: result });
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

export default router;
