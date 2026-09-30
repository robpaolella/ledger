import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { payCycles, categories, users } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { requirePermission } from '../middleware/permissions.js';
import { projectPayCycles, type PayCycleForMath } from '../utils/payCycleMath.js';
import type { PayFrequency } from '@ledger/shared/src/types.js';

const router = Router();

const FREQUENCIES: PayFrequency[] = ['weekly', 'biweekly', 'semi_monthly', 'monthly'];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** True only for a real calendar date in 'YYYY-MM-DD' form (rejects e.g. 2026-02-31). */
function isValidYmd(s: unknown): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Enriched select used by list, projection, and single-row fetch. */
function baseSelect() {
  return db.select({
    id: payCycles.id,
    label: payCycles.label,
    category_id: payCycles.category_id,
    user_id: payCycles.user_id,
    frequency: payCycles.frequency,
    amount: payCycles.amount,
    anchor_date: payCycles.anchor_date,
    day_of_month_1: payCycles.day_of_month_1,
    day_of_month_2: payCycles.day_of_month_2,
    day_of_month: payCycles.day_of_month,
    effective_start: payCycles.effective_start,
    effective_end: payCycles.effective_end,
    is_active: payCycles.is_active,
    created_at: payCycles.created_at,
    updated_at: payCycles.updated_at,
    group_name: categories.group_name,
    sub_name: categories.sub_name,
    display_name: categories.display_name,
    type: categories.type,
    ownerName: users.display_name,
  })
    .from(payCycles)
    .innerJoin(categories, eq(payCycles.category_id, categories.id))
    .leftJoin(users, eq(payCycles.user_id, users.id));
}

function toMath(r: {
  id: number; label: string; user_id: number | null; ownerName: string | null;
  category_id: number; sub_name: string; group_name: string; frequency: string; amount: number;
  anchor_date: string | null; day_of_month_1: number | null; day_of_month_2: number | null;
  day_of_month: number | null; effective_start: string | null; effective_end: string | null; is_active: number;
}): PayCycleForMath {
  return {
    id: r.id, label: r.label, user_id: r.user_id, ownerName: r.ownerName,
    category_id: r.category_id, sub_name: r.sub_name, group_name: r.group_name,
    frequency: r.frequency as PayFrequency, amount: r.amount,
    anchor_date: r.anchor_date, day_of_month_1: r.day_of_month_1,
    day_of_month_2: r.day_of_month_2, day_of_month: r.day_of_month,
    effective_start: r.effective_start, effective_end: r.effective_end, is_active: r.is_active,
  };
}

interface ValidatedCycle {
  label: string; category_id: number; user_id: number | null; frequency: string; amount: number;
  anchor_date: string | null; day_of_month_1: number | null; day_of_month_2: number | null;
  day_of_month: number | null; effective_start: string | null; effective_end: string | null; is_active: number;
}

/**
 * Validate a create/update body. PUT sends the full cycle (the edit form submits
 * every field), so both paths validate identically — this avoids partial updates
 * leaving frequency and its day/anchor fields inconsistent.
 */
function validate(body: Record<string, unknown>): { error: string } | { value: ValidatedCycle } {
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return { error: 'label is required' };

  const categoryId = body.categoryId;
  if (!Number.isInteger(categoryId)) return { error: 'categoryId is required' };
  const cat = db.select().from(categories).where(eq(categories.id, categoryId as number)).get();
  if (!cat) return { error: 'category not found' };
  if (cat.type !== 'income') return { error: 'pay cycles must target an income category' };

  const frequency = body.frequency as string;
  if (!FREQUENCIES.includes(frequency as PayFrequency)) return { error: 'invalid frequency' };

  const amount = Number(body.amount);
  if (!(amount > 0)) return { error: 'amount must be greater than 0' };

  let user_id: number | null = null;
  if (body.userId !== undefined && body.userId !== null) {
    if (!Number.isInteger(body.userId)) return { error: 'invalid userId' };
    const u = db.select().from(users).where(eq(users.id, body.userId as number)).get();
    if (!u) return { error: 'user not found' };
    user_id = body.userId as number;
  }

  let anchor_date: string | null = null;
  let day_of_month_1: number | null = null;
  let day_of_month_2: number | null = null;
  let day_of_month: number | null = null;

  if (frequency === 'weekly' || frequency === 'biweekly') {
    if (!isValidYmd(body.anchorDate)) {
      return { error: 'anchorDate (a valid YYYY-MM-DD date) is required for weekly/biweekly cycles' };
    }
    anchor_date = body.anchorDate as string;
  } else if (frequency === 'semi_monthly') {
    day_of_month_1 = Number(body.dayOfMonth1);
    day_of_month_2 = Number(body.dayOfMonth2);
    if (!Number.isInteger(day_of_month_1) || day_of_month_1 < 0 || day_of_month_1 > 31) return { error: 'dayOfMonth1 must be 0-31 (0 = last day)' };
    if (!Number.isInteger(day_of_month_2) || day_of_month_2 < 0 || day_of_month_2 > 31) return { error: 'dayOfMonth2 must be 0-31 (0 = last day)' };
    if (day_of_month_1 === day_of_month_2) return { error: 'The two semi-monthly paydays must be different' };
  } else {
    day_of_month = Number(body.dayOfMonth);
    if (!Number.isInteger(day_of_month) || day_of_month < 0 || day_of_month > 31) return { error: 'dayOfMonth must be 0-31 (0 = last day)' };
  }

  const effective_start = body.effectiveStart ? String(body.effectiveStart) : null;
  const effective_end = body.effectiveEnd ? String(body.effectiveEnd) : null;
  if (effective_start && !isValidYmd(effective_start)) return { error: 'effectiveStart must be a valid YYYY-MM-DD date' };
  if (effective_end && !isValidYmd(effective_end)) return { error: 'effectiveEnd must be a valid YYYY-MM-DD date' };
  if (effective_start && effective_end && effective_start > effective_end) return { error: 'effectiveStart must be on or before effectiveEnd' };

  const is_active = body.isActive === undefined ? 1 : (body.isActive ? 1 : 0);

  return { value: { label, category_id: categoryId as number, user_id, frequency, amount, anchor_date, day_of_month_1, day_of_month_2, day_of_month, effective_start, effective_end, is_active } };
}

// GET /api/pay-cycles — list all cycles with category + owner metadata
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = baseSelect().orderBy(asc(payCycles.label)).all();
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /pay-cycles error:', err);
    res.status(500).json({ error: 'Failed to fetch pay cycles' });
  }
});

// GET /api/pay-cycles/projection?month=YYYY-MM — expected income for the month
router.get('/projection', (req: Request, res: Response) => {
  try {
    const month = req.query.month as string;
    if (!month || !MONTH_RE.test(month)) {
      res.status(400).json({ error: 'month (YYYY-MM) query param is required' });
      return;
    }
    const rows = baseSelect().all();
    const projection = projectPayCycles(rows.map(toMath), month);
    res.json({ data: projection });
  } catch (err) {
    console.error('GET /pay-cycles/projection error:', err);
    res.status(500).json({ error: 'Failed to compute projection' });
  }
});

// POST /api/pay-cycles
router.post('/', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const result = validate(req.body);
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    const now = new Date().toISOString();
    const inserted = db.insert(payCycles).values({ ...result.value, created_at: now, updated_at: now }).run();
    const row = baseSelect().where(eq(payCycles.id, Number(inserted.lastInsertRowid))).get();
    res.status(201).json({ data: row });
  } catch (err) {
    console.error('POST /pay-cycles error:', err);
    res.status(500).json({ error: 'Failed to create pay cycle' });
  }
});

// PUT /api/pay-cycles/:id
router.put('/:id', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const existing = db.select().from(payCycles).where(eq(payCycles.id, id)).get();
    if (!existing) {
      res.status(404).json({ error: 'Pay cycle not found' });
      return;
    }
    const result = validate(req.body);
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    db.update(payCycles).set({ ...result.value, updated_at: new Date().toISOString() }).where(eq(payCycles.id, id)).run();
    const row = baseSelect().where(eq(payCycles.id, id)).get();
    res.json({ data: row });
  } catch (err) {
    console.error('PUT /pay-cycles/:id error:', err);
    res.status(500).json({ error: 'Failed to update pay cycle' });
  }
});

// DELETE /api/pay-cycles/:id
router.delete('/:id', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = db.select().from(payCycles).where(eq(payCycles.id, id)).get();
    if (!existing) {
      res.status(404).json({ error: 'Pay cycle not found' });
      return;
    }
    db.delete(payCycles).where(eq(payCycles.id, id)).run();
    res.json({ data: { success: true } });
  } catch (err) {
    console.error('DELETE /pay-cycles/:id error:', err);
    res.status(500).json({ error: 'Failed to delete pay cycle' });
  }
});

export default router;
