import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { categories, transactions } from '../db/schema.js';
import { eq, asc, sql } from 'drizzle-orm';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

type GroupRow = { id: number; type: string; name: string; color: string | null; sort_order: number };

function getGroup(id: number): GroupRow | undefined {
  return sqlite.prepare('SELECT id, type, name, color, sort_order FROM category_groups WHERE id = ?').get(id) as GroupRow | undefined;
}

function findOrCreateGroup(type: string, name: string): GroupRow {
  const existing = sqlite.prepare('SELECT id, type, name, color, sort_order FROM category_groups WHERE type = ? AND name = ?').get(type, name) as GroupRow | undefined;
  if (existing) return existing;
  const next = (sqlite.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM category_groups WHERE type = ?').get(type) as { n: number }).n;
  const r = sqlite.prepare('INSERT INTO category_groups (type, name, sort_order) VALUES (?, ?, ?)').run(type, name, next);
  return { id: Number(r.lastInsertRowid), type, name, color: null, sort_order: next };
}

const displayFor = (type: string, groupName: string, subName: string) =>
  type === 'income' ? subName : `${groupName}: ${subName}`;

// GET /api/categories
router.get('/', (_req: Request, res: Response): void => {
  const rows = db.select().from(categories)
    .orderBy(asc(categories.type), asc(categories.sort_order), asc(categories.group_name), asc(categories.sub_name))
    .all();
  res.json({ data: rows });
});

// GET /api/categories/groups — first-class groups with member counts
router.get('/groups', (_req: Request, res: Response): void => {
  const rows = sqlite.prepare(`
    SELECT g.id, g.type, g.name, g.color, g.sort_order,
      (SELECT COUNT(*) FROM categories c WHERE c.group_id = g.id) AS count
    FROM category_groups g
    ORDER BY g.type ASC, g.sort_order ASC, g.name ASC
  `).all();
  res.json({ data: rows });
});

// POST /api/categories/groups — create an (empty) group
router.post('/groups', requirePermission('categories.create'), (req: Request, res: Response): void => {
  const { type, name, color } = req.body as { type?: string; name?: string; color?: string };
  const clean = (name ?? '').trim();
  if (!type || !clean) {
    res.status(400).json({ error: 'type and name are required' });
    return;
  }
  const dupe = sqlite.prepare('SELECT id FROM category_groups WHERE type = ? AND name = ?').get(type, clean);
  if (dupe) {
    res.status(409).json({ error: 'A group with that name already exists in this section' });
    return;
  }
  const group = findOrCreateGroup(type, clean);
  if (color) {
    sqlite.prepare('UPDATE category_groups SET color = ? WHERE id = ?').run(color, group.id);
    group.color = color;
  }
  res.status(201).json({ data: { ...group, count: 0 } });
});

// PUT /api/categories/groups/reorder — must precede /groups/:id
router.put('/groups/reorder', requirePermission('categories.edit'), (req: Request, res: Response): void => {
  const { items } = req.body as { items?: { id: number; sort_order: number }[] };
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'items array is required' });
    return;
  }
  const stmt = sqlite.prepare('UPDATE category_groups SET sort_order = ? WHERE id = ?');
  const run = sqlite.transaction(() => {
    for (const it of items) {
      if (typeof it.id !== 'number' || typeof it.sort_order !== 'number') continue;
      stmt.run(it.sort_order, it.id);
    }
  });
  run();
  res.json({ data: { message: 'Group order updated' } });
});

// PUT /api/categories/groups/:id — rename a group (syncs member categories)
router.put('/groups/:id', requirePermission('categories.edit'), (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  const group = getGroup(id);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }
  const body = req.body as { name?: string; color?: string };
  const clean = (body.name ?? '').trim();
  if (!clean) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const dupe = sqlite.prepare('SELECT id FROM category_groups WHERE type = ? AND name = ? AND id != ?').get(group.type, clean, id);
  if (dupe) {
    res.status(409).json({ error: 'A group with that name already exists in this section' });
    return;
  }
  const members = sqlite.prepare('SELECT id, sub_name FROM categories WHERE group_id = ?').all(id) as { id: number; sub_name: string }[];
  const renameGroup = sqlite.prepare('UPDATE category_groups SET name = ?, color = ? WHERE id = ?');
  const updCat = sqlite.prepare('UPDATE categories SET group_name = ?, display_name = ? WHERE id = ?');
  const newColor = body.color !== undefined ? (body.color || null) : group.color;
  const run = sqlite.transaction(() => {
    renameGroup.run(clean, newColor, id);
    for (const m of members) updCat.run(clean, displayFor(group.type, clean, m.sub_name), m.id);
  });
  run();
  res.json({ data: { id, name: clean, color: newColor, renamed: members.length } });
});

// DELETE /api/categories/groups/:id — only when the group is empty
router.delete('/groups/:id', requirePermission('categories.delete'), (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  const group = getGroup(id);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }
  const count = (sqlite.prepare('SELECT COUNT(*) AS n FROM categories WHERE group_id = ?').get(id) as { n: number }).n;
  if (count > 0) {
    res.status(400).json({ error: 'Cannot delete a group that still has categories' });
    return;
  }
  sqlite.prepare('DELETE FROM category_groups WHERE id = ?').run(id);
  res.json({ data: { id } });
});

// POST /api/categories — create a category inside a group
router.post('/', requirePermission('categories.create'), (req: Request, res: Response): void => {
  const { groupId, groupName, subName, type, isDeductible, emoji, excludeFromBudget } = req.body;
  if (!subName) {
    res.status(400).json({ error: 'subName is required' });
    return;
  }
  let group: GroupRow | undefined;
  if (groupId) group = getGroup(Number(groupId));
  else if (groupName && type) group = findOrCreateGroup(type, groupName);
  if (!group) {
    res.status(400).json({ error: 'groupId (or groupName + type) is required' });
    return;
  }

  const displayName = displayFor(group.type, group.name, subName);
  // Append after existing siblings; drag-reorder handles ordering afterward.
  const nextOrder = (sqlite.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM categories WHERE group_id = ?').get(group.id) as { n: number }).n;

  const result = db.insert(categories).values({
    group_id: group.id,
    group_name: group.name,
    sub_name: subName,
    display_name: displayName,
    type: group.type,
    is_deductible: isDeductible ? 1 : 0,
    sort_order: nextOrder,
    emoji: emoji ?? null,
    // Transfers are money moving between the user's own accounts — never
    // spending. Their budget exclusion is an invariant of the section, not a
    // per-category preference, so the request's value is ignored.
    exclude_from_budget: group.type === 'transfer' || excludeFromBudget ? 1 : 0,
  }).run();
  const created = db.select().from(categories).where(eq(categories.id, Number(result.lastInsertRowid))).get();
  res.status(201).json({ data: created });
});

// PUT /api/categories/reorder
router.put('/reorder', requirePermission('categories.edit'), (req: Request, res: Response): void => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'items array is required' });
    return;
  }
  const stmt = sqlite.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
  const runAll = sqlite.transaction(() => {
    for (const item of items) {
      if (typeof item.id !== 'number' || typeof item.sort_order !== 'number') continue;
      stmt.run(item.sort_order, item.id);
    }
  });
  runAll();
  res.json({ data: { message: 'Sort order updated' } });
});

// PUT /api/categories/:id — edit a category (incl. moving it between groups)
router.put('/:id', requirePermission('categories.edit'), (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  const existing = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }
  const { groupId, subName, isDeductible, emoji, excludeFromBudget } = req.body;

  // Target group: an explicit move, or keep the current group.
  let group: GroupRow | undefined;
  if (groupId !== undefined && groupId !== null) {
    group = getGroup(Number(groupId));
    if (!group) {
      res.status(400).json({ error: 'Group not found' });
      return;
    }
  }
  const newType = group ? group.type : existing.type;
  const newGroupName = group ? group.name : existing.group_name;
  const newGroupId = group ? group.id : existing.group_id;
  const newSub = subName ?? existing.sub_name;
  const displayName = displayFor(newType, newGroupName, newSub);

  db.update(categories).set({
    group_id: newGroupId,
    group_name: newGroupName,
    sub_name: newSub,
    display_name: displayName,
    type: newType,
    ...(isDeductible !== undefined && { is_deductible: isDeductible ? 1 : 0 }),
    ...(emoji !== undefined && { emoji: emoji || null }),
    // See POST: the transfer section's budget exclusion is permanent. Moving a
    // category INTO it also flips the flag on, and out of it hands control back.
    ...(newType === 'transfer'
      ? { exclude_from_budget: 1 }
      : excludeFromBudget !== undefined && { exclude_from_budget: excludeFromBudget ? 1 : 0 }),
  }).where(eq(categories.id, id)).run();
  const updated = db.select().from(categories).where(eq(categories.id, id)).get();
  res.json({ data: updated });
});

// DELETE /api/categories/:id
router.delete('/:id', requirePermission('categories.delete'), (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  const existing = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }
  const txCount = db.select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(eq(transactions.category_id, id))
    .get();
  if (txCount && txCount.count > 0) {
    res.status(400).json({ error: 'Cannot delete category with existing transactions' });
    return;
  }
  db.delete(categories).where(eq(categories.id, id)).run();
  res.json({ data: { message: 'Category deleted' } });
});

export default router;
