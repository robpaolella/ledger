import { Router, Request, Response } from 'express';
import type { ContributionSetup } from '@ledger/shared/src/types.js';
import { sqlite } from '../db/index.js';
import { hasPermission, requirePermission } from '../middleware/permissions.js';
import { getGroup, insertCategory } from './categories.js';

// Contributions: which Transfers categories are tracked, and the accounts each
// pays into. Managed by whoever can edit categories (Robert, Q18); creating the
// category in the same request also needs categories.create.
const router = Router();
router.use(requirePermission('categories.edit'));

type SetupRow = { id: number; category_id: number; includes_external: number; group_id: number | null; group_name: string; sub_name: string; emoji: string | null };
type AccountRow = { setup_id: number; id: number; name: string; type: string; is_active: number | null };

function listSetups(id?: number): ContributionSetup[] {
  const where = id === undefined ? '' : 'WHERE s.id = ?';
  const args = id === undefined ? [] : [id];
  const setups = sqlite.prepare(`
    SELECT s.id, s.category_id, s.includes_external, c.group_id, c.group_name, c.sub_name, c.emoji
    FROM contribution_setups s JOIN categories c ON c.id = s.category_id
    ${where}
    ORDER BY c.group_name, c.sort_order, c.sub_name
  `).all(...args) as SetupRow[];
  const accounts = sqlite.prepare(`
    SELECT sa.setup_id, a.id, a.name, a.type, a.is_active
    FROM contribution_setup_accounts sa JOIN accounts a ON a.id = sa.account_id
    ${id === undefined ? '' : 'WHERE sa.setup_id = ?'}
    ORDER BY a.name, a.id
  `).all(...args) as AccountRow[];
  return setups.map((s) => ({
    id: s.id,
    category: { id: s.category_id, groupId: s.group_id, groupName: s.group_name, name: s.sub_name, emoji: s.emoji },
    accounts: accounts.filter((a) => a.setup_id === s.id)
      .map((a) => ({ id: a.id, name: a.name, type: a.type as ContributionSetup['accounts'][number]['type'], isActive: a.is_active !== 0 })),
    external: s.includes_external === 1,
  }));
}

/** Checks a request's destinations; returns the error to send, or the clean list. */
function readDestinations(body: Record<string, unknown>, keep: Set<number>): { error: string } | { accountIds: number[]; external: boolean } {
  const raw = body.accountIds ?? [];
  const external = body.external === true;
  if (!Array.isArray(raw) || !raw.every((n) => Number.isInteger(n) && n > 0)) {
    return { error: 'Choose accounts from the list.' };
  }
  const accountIds = raw as number[];
  if (accountIds.length === 0 && !external) return { error: 'Choose at least one account.' };
  if (new Set(accountIds).size !== accountIds.length) return { error: 'Each account can only be chosen once.' };
  const find = sqlite.prepare('SELECT name, is_active FROM accounts WHERE id = ?');
  for (const id of accountIds) {
    const acct = find.get(id) as { name: string; is_active: number | null } | undefined;
    if (!acct) return { error: "One of the chosen accounts isn't in Ledger." };
    // A deactivated account may stay where it already is, but isn't offered anew.
    if (acct.is_active === 0 && !keep.has(id)) return { error: `${acct.name} is inactive. Choose an active account.` };
  }
  return { accountIds, external };
}

function writeDestinations(setupId: number, d: { accountIds: number[]; external: boolean }): void {
  sqlite.prepare("UPDATE contribution_setups SET includes_external = ?, updated_at = datetime('now') WHERE id = ?")
    .run(d.external ? 1 : 0, setupId);
  sqlite.prepare('DELETE FROM contribution_setup_accounts WHERE setup_id = ?').run(setupId);
  const add = sqlite.prepare('INSERT INTO contribution_setup_accounts (setup_id, account_id) VALUES (?, ?)');
  for (const a of d.accountIds) add.run(setupId, a);
}

// GET /api/contributions/setups
router.get('/setups', (_req: Request, res: Response): void => {
  res.json({ data: listSetups() });
});

// POST /api/contributions/setups — { categoryId } or { newCategory: { groupId, subName, emoji } },
// plus { accountIds, external }. A new category and its setup are created together or not at all.
router.post('/setups', (req: Request, res: Response): void => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const newCategory = body.newCategory as { groupId?: unknown; subName?: unknown; emoji?: unknown } | undefined;
  if ((body.categoryId === undefined) === (newCategory === undefined)) {
    res.status(400).json({ error: 'Choose a Transfers category, or name a new one.' });
    return;
  }

  let categoryId: number | undefined;
  let newName = '';
  let group: ReturnType<typeof getGroup>;
  if (newCategory) {
    if (!hasPermission(req.user!, 'categories.create')) {
      res.status(403).json({ error: "You don't have permission to create categories.", requiredPermission: 'categories.create' });
      return;
    }
    group = getGroup(Number(newCategory.groupId));
    if (!group || group.type !== 'transfer') {
      res.status(400).json({ error: 'Choose a group in Transfers for the new category.' });
      return;
    }
    newName = typeof newCategory.subName === 'string' ? newCategory.subName.trim() : '';
    if (!newName) {
      res.status(400).json({ error: 'Enter a name for the new category.' });
      return;
    }
    const clash = sqlite.prepare('SELECT 1 FROM categories WHERE group_id = ? AND lower(trim(sub_name)) = lower(?)').get(group.id, newName);
    if (clash) {
      res.status(409).json({ error: 'A category with that name already exists in this group.' });
      return;
    }
  } else {
    categoryId = Number(body.categoryId);
    const cat = sqlite.prepare('SELECT type FROM categories WHERE id = ?').get(categoryId) as { type: string } | undefined;
    if (!cat) {
      res.status(404).json({ error: "That category doesn't exist." });
      return;
    }
    if (cat.type !== 'transfer') {
      res.status(400).json({ error: 'Only a Transfers category can be tracked as a contribution.' });
      return;
    }
    if (sqlite.prepare('SELECT 1 FROM contribution_setups WHERE category_id = ?').get(categoryId)) {
      res.status(409).json({ error: 'This category is already tracked in Contributions.' });
      return;
    }
  }

  const dest = readDestinations(body, new Set());
  if ('error' in dest) {
    res.status(400).json({ error: dest.error });
    return;
  }

  const setupId = sqlite.transaction(() => {
    const catId = categoryId ?? insertCategory(group!, newName, { emoji: typeof newCategory?.emoji === 'string' ? newCategory.emoji : null });
    const id = Number(sqlite.prepare('INSERT INTO contribution_setups (category_id) VALUES (?)').run(catId).lastInsertRowid);
    writeDestinations(id, dest);
    return id;
  })();
  res.status(201).json({ data: listSetups(setupId)[0] });
});

// PUT /api/contributions/setups/:id — replace the destinations
router.put('/setups/:id', (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  if (!sqlite.prepare('SELECT 1 FROM contribution_setups WHERE id = ?').get(id)) {
    res.status(404).json({ error: "That contribution isn't tracked." });
    return;
  }
  const current = new Set((sqlite.prepare('SELECT account_id FROM contribution_setup_accounts WHERE setup_id = ?').all(id) as { account_id: number }[])
    .map((r) => r.account_id));
  const dest = readDestinations((req.body ?? {}) as Record<string, unknown>, current);
  if ('error' in dest) {
    res.status(400).json({ error: dest.error });
    return;
  }
  sqlite.transaction(() => writeDestinations(id, dest))();
  res.json({ data: listSetups(id)[0] });
});

// DELETE /api/contributions/setups/:id — stop tracking; the category, its
// transactions and rules are untouched.
router.delete('/setups/:id', (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  const result = sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM contribution_setup_accounts WHERE setup_id = ?').run(id);
    return sqlite.prepare('DELETE FROM contribution_setups WHERE id = ?').run(id);
  })();
  if (result.changes === 0) {
    res.status(404).json({ error: "That contribution isn't tracked." });
    return;
  }
  res.json({ data: { id } });
});

export default router;
