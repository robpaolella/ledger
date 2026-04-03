import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { budgetRecurring, categories } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

// GET /api/budget-recurring?month=N (optional filter)
router.get('/', (req: Request, res: Response) => {
  try {
    const rows = db.select({
      id: budgetRecurring.id,
      label: budgetRecurring.label,
      category_id: budgetRecurring.category_id,
      amount: budgetRecurring.amount,
      months: budgetRecurring.months,
      created_at: budgetRecurring.created_at,
      updated_at: budgetRecurring.updated_at,
      group_name: categories.group_name,
      sub_name: categories.sub_name,
      display_name: categories.display_name,
      type: categories.type,
    })
      .from(budgetRecurring)
      .innerJoin(categories, eq(budgetRecurring.category_id, categories.id))
      .orderBy(asc(budgetRecurring.label))
      .all();

    // Parse months JSON and optionally filter by month
    const monthFilter = req.query.month ? parseInt(req.query.month as string, 10) : null;

    const parsed = rows.map((r) => ({
      ...r,
      months: JSON.parse(r.months as string) as number[],
    }));

    const filtered = monthFilter
      ? parsed.filter((r) => r.months.includes(monthFilter))
      : parsed;

    res.json({ data: filtered });
  } catch (err) {
    console.error('GET /budget-recurring error:', err);
    res.status(500).json({ error: 'Failed to fetch recurring items' });
  }
});

// POST /api/budget-recurring
router.post('/', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const { label, categoryId, amount, months } = req.body;
    if (!label || !categoryId || !months || !Array.isArray(months) || months.length === 0) {
      res.status(400).json({ error: 'label, categoryId, and months (non-empty array) are required' });
      return;
    }

    const now = new Date().toISOString();
    const result = db.insert(budgetRecurring)
      .values({
        label,
        category_id: categoryId,
        amount: amount ?? null,
        months: JSON.stringify(months),
        created_at: now,
        updated_at: now,
      })
      .run();

    res.status(201).json({
      data: {
        id: Number(result.lastInsertRowid),
        label,
        category_id: categoryId,
        amount: amount ?? null,
        months,
        created_at: now,
        updated_at: now,
      },
    });
  } catch (err) {
    console.error('POST /budget-recurring error:', err);
    res.status(500).json({ error: 'Failed to create recurring item' });
  }
});

// PUT /api/budget-recurring/:id
router.put('/:id', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { label, categoryId, amount, months } = req.body;

    const existing = db.select()
      .from(budgetRecurring)
      .where(eq(budgetRecurring.id, id))
      .get();

    if (!existing) {
      res.status(404).json({ error: 'Recurring item not found' });
      return;
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (label !== undefined) updates.label = label;
    if (categoryId !== undefined) updates.category_id = categoryId;
    if (amount !== undefined) updates.amount = amount;
    if (months !== undefined) updates.months = JSON.stringify(months);

    db.update(budgetRecurring)
      .set(updates)
      .where(eq(budgetRecurring.id, id))
      .run();

    // Return updated record
    const updated = db.select({
      id: budgetRecurring.id,
      label: budgetRecurring.label,
      category_id: budgetRecurring.category_id,
      amount: budgetRecurring.amount,
      months: budgetRecurring.months,
      created_at: budgetRecurring.created_at,
      updated_at: budgetRecurring.updated_at,
      group_name: categories.group_name,
      sub_name: categories.sub_name,
      display_name: categories.display_name,
      type: categories.type,
    })
      .from(budgetRecurring)
      .innerJoin(categories, eq(budgetRecurring.category_id, categories.id))
      .where(eq(budgetRecurring.id, id))
      .get();

    res.json({
      data: updated ? { ...updated, months: JSON.parse(updated.months as string) } : null,
    });
  } catch (err) {
    console.error('PUT /budget-recurring/:id error:', err);
    res.status(500).json({ error: 'Failed to update recurring item' });
  }
});

// DELETE /api/budget-recurring/:id
router.delete('/:id', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = db.select()
      .from(budgetRecurring)
      .where(eq(budgetRecurring.id, id))
      .get();

    if (!existing) {
      res.status(404).json({ error: 'Recurring item not found' });
      return;
    }

    db.delete(budgetRecurring).where(eq(budgetRecurring.id, id)).run();
    res.json({ data: { success: true } });
  } catch (err) {
    console.error('DELETE /budget-recurring/:id error:', err);
    res.status(500).json({ error: 'Failed to delete recurring item' });
  }
});

export default router;
