import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { budgetTemplates, categories } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

// GET /api/budget-templates
router.get('/', (req: Request, res: Response) => {
  try {
    const rows = db.select({
      id: budgetTemplates.id,
      category_id: budgetTemplates.category_id,
      amount: budgetTemplates.amount,
      created_at: budgetTemplates.created_at,
      updated_at: budgetTemplates.updated_at,
      group_name: categories.group_name,
      sub_name: categories.sub_name,
      display_name: categories.display_name,
      type: categories.type,
      sort_order: categories.sort_order,
    })
      .from(budgetTemplates)
      .innerJoin(categories, eq(budgetTemplates.category_id, categories.id))
      .orderBy(asc(categories.sort_order), asc(categories.sub_name))
      .all();

    res.json({ data: rows });
  } catch (err) {
    console.error('GET /budget-templates error:', err);
    res.status(500).json({ error: 'Failed to fetch budget templates' });
  }
});

// POST /api/budget-templates — upsert (one template per category)
router.post('/', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const { categoryId, amount } = req.body;
    if (!categoryId || amount == null) {
      res.status(400).json({ error: 'categoryId and amount are required' });
      return;
    }

    const existing = db.select()
      .from(budgetTemplates)
      .where(eq(budgetTemplates.category_id, categoryId))
      .get();

    const now = new Date().toISOString();

    if (existing) {
      db.update(budgetTemplates)
        .set({ amount, updated_at: now })
        .where(eq(budgetTemplates.id, existing.id))
        .run();
      res.json({ data: { ...existing, amount, updated_at: now } });
    } else {
      const result = db.insert(budgetTemplates)
        .values({ category_id: categoryId, amount, created_at: now, updated_at: now })
        .run();
      res.status(201).json({
        data: {
          id: Number(result.lastInsertRowid),
          category_id: categoryId,
          amount,
          created_at: now,
          updated_at: now,
        },
      });
    }
  } catch (err) {
    console.error('POST /budget-templates error:', err);
    res.status(500).json({ error: 'Failed to save budget template' });
  }
});

// DELETE /api/budget-templates/:id
router.delete('/:id', requirePermission('budgets.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = db.select()
      .from(budgetTemplates)
      .where(eq(budgetTemplates.id, id))
      .get();

    if (!existing) {
      res.status(404).json({ error: 'Budget template not found' });
      return;
    }

    db.delete(budgetTemplates).where(eq(budgetTemplates.id, id)).run();
    res.json({ data: { success: true } });
  } catch (err) {
    console.error('DELETE /budget-templates/:id error:', err);
    res.status(500).json({ error: 'Failed to delete budget template' });
  }
});

export default router;
