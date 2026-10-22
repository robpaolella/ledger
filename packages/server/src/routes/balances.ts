import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { balanceSnapshots, accounts } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requirePermission } from '../middleware/permissions.js';
import { isValidYmd, toFinite, toId } from '../utils/validate.js';

const router = Router();

// GET /api/balances/latest — most recent balance snapshot per active account
router.get('/latest', (_req: Request, res: Response) => {
  try {
    const rows = db.select({
      id: balanceSnapshots.id,
      account_id: balanceSnapshots.account_id,
      date: balanceSnapshots.date,
      balance: balanceSnapshots.balance,
      note: balanceSnapshots.note,
      account_name: accounts.name,
      account_last_four: accounts.last_four,
      account_owner: accounts.owner,
      account_classification: accounts.classification,
    }).from(balanceSnapshots)
      .innerJoin(accounts, eq(balanceSnapshots.account_id, accounts.id))
      .where(eq(accounts.is_active, 1))
      .orderBy(desc(balanceSnapshots.date), desc(balanceSnapshots.id))
      .all();

    // Deduplicate: keep latest per account
    const seen = new Set<number>();
    const latest = [];
    for (const r of rows) {
      if (!seen.has(r.account_id)) {
        seen.add(r.account_id);
        latest.push(r);
      }
    }

    res.json({ data: latest });
  } catch (err) {
    console.error('GET /balances/latest error:', err);
    res.status(500).json({ error: 'Failed to fetch latest balances' });
  }
});

// POST /api/balances — create new snapshot
router.post('/', requirePermission('balances.update'), (req: Request, res: Response) => {
  try {
    const accountId = toId(req.body.accountId);
    const { date, note } = req.body;
    const balance = toFinite(req.body.balance);
    if (!accountId || !date || balance == null) {
      res.status(400).json({ error: 'accountId, date (YYYY-MM-DD), and a numeric balance are required' });
      return;
    }
    if (!isValidYmd(date)) { res.status(400).json({ error: 'date must be YYYY-MM-DD' }); return; }
    if (!sqlite.prepare('SELECT 1 FROM accounts WHERE id = ?').get(accountId)) { res.status(400).json({ error: 'accountId does not exist' }); return; }

    const result = db.insert(balanceSnapshots)
      .values({ account_id: accountId, date, balance, note: note || null })
      .run();

    res.status(201).json({ data: { id: result.lastInsertRowid, accountId, date, balance, note } });
  } catch (err) {
    console.error('POST /balances error:', err);
    res.status(500).json({ error: 'Failed to create balance snapshot' });
  }
});

// GET /api/balances/history?accountId=X
router.get('/history', (req: Request, res: Response) => {
  try {
    const accountId = parseInt(req.query.accountId as string, 10);
    if (isNaN(accountId)) {
      res.status(400).json({ error: 'accountId query parameter is required' });
      return;
    }

    const rows = db.select().from(balanceSnapshots)
      .where(eq(balanceSnapshots.account_id, accountId))
      .orderBy(desc(balanceSnapshots.date))
      .all();

    res.json({ data: rows });
  } catch (err) {
    console.error('GET /balances/history error:', err);
    res.status(500).json({ error: 'Failed to fetch balance history' });
  }
});

export default router;
