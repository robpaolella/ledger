import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { accounts, transactions } from '../db/schema.js';
import { eq, asc, sql } from 'drizzle-orm';
import { requirePermission } from '../middleware/permissions.js';
import multer from 'multer';
import { saveImage, deleteImage } from '../services/uploads.js';

import { deleteLinksCascade, linkIdsForAccount } from '../services/simplefinLinks.js';
import { toId } from '../utils/validate.js';

const ACCOUNT_TYPES = new Set(['checking', 'savings', 'credit', 'investment', 'retirement', 'venmo', 'cash']);
const CLASSIFICATIONS = new Set(['liquid', 'investment', 'liability']);

/** Every id must be an active user; returns the bad id or null. */
function invalidOwnerId(ids: number[]): number | null {
  const stmt = sqlite.prepare('SELECT 1 FROM users WHERE id = ? AND is_active = 1');
  for (const id of ids) if (!stmt.get(id)) return id;
  return null;
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

interface AccountInstitution {
  id: number;
  name: string;
  logo_url: string | null;
  color: string | null;
}

/** Enrich raw account rows with owners (account_owners junction) and the linked
 *  financial institution (id, name, logo_url, color) so the client can render
 *  the account's avatar from the institution logo. */
function enrichWithOwners(rows: typeof accounts.$inferSelect[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const ownerRows = sqlite.prepare(`
    SELECT ao.account_id, u.id as user_id, u.display_name
    FROM account_owners ao
    JOIN users u ON ao.user_id = u.id
    WHERE ao.account_id IN (${ids.map(() => '?').join(',')})
    ORDER BY u.display_name
  `).all(...ids) as { account_id: number; user_id: number; display_name: string }[];

  const ownerMap = new Map<number, { id: number; displayName: string }[]>();
  for (const o of ownerRows) {
    if (!ownerMap.has(o.account_id)) ownerMap.set(o.account_id, []);
    ownerMap.get(o.account_id)!.push({ id: o.user_id, displayName: o.display_name });
  }

  // Resolve linked institutions in one query.
  const instIds = [...new Set(rows.map((r) => r.institution_id).filter((v): v is number => v != null))];
  const instMap = new Map<number, AccountInstitution>();
  if (instIds.length > 0) {
    const instRows = sqlite.prepare(
      `SELECT id, name, logo_url, color FROM financial_institutions WHERE id IN (${instIds.map(() => '?').join(',')})`
    ).all(...instIds) as AccountInstitution[];
    for (const i of instRows) instMap.set(i.id, i);
  }

  return rows.map((r) => {
    const owners = ownerMap.get(r.id) || [];
    return {
      ...r,
      owners,
      isShared: owners.length > 1,
      institutionRef: r.institution_id != null ? instMap.get(r.institution_id) ?? null : null,
    };
  });
}

/** Validate an institution_id from a request body. Returns the numeric id,
 *  null (explicitly cleared / not provided), or throws a 400-worthy message. */
function resolveInstitutionId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const id = Number(raw);
  if (!Number.isInteger(id)) throw new Error('institutionId must be an integer');
  const exists = sqlite.prepare('SELECT id FROM financial_institutions WHERE id = ?').get(id);
  if (!exists) throw new Error('institution not found');
  return id;
}

// GET /api/accounts
router.get('/', (_req: Request, res: Response): void => {
  const rows = db.select().from(accounts)
    .where(eq(accounts.is_active, 1))
    .orderBy(asc(accounts.owner), asc(accounts.type))
    .all();
  res.json({ data: enrichWithOwners(rows) });
});

// GET /api/accounts/:id
router.get('/:id', (req: Request, res: Response): void => {
  const row = db.select().from(accounts)
    .where(eq(accounts.id, Number(req.params.id)))
    .get();
  if (!row) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json({ data: enrichWithOwners([row])[0] });
});

// POST /api/accounts
router.post('/', requirePermission('accounts.create'), (req: Request, res: Response): void => {
  const { name, lastFour, type, classification, ownerIds, institutionId } = req.body;
  const ids: number[] = Array.isArray(ownerIds) ? ownerIds.map((v: unknown) => toId(v)).filter((v: number | null): v is number => v != null) : [];
  if (!name || typeof name !== 'string' || !name.trim() || !type || !classification || ids.length === 0) {
    res.status(400).json({ error: 'name, type, classification, and at least one owner are required' });
    return;
  }
  if (!ACCOUNT_TYPES.has(type)) { res.status(400).json({ error: `type must be one of ${[...ACCOUNT_TYPES].join(', ')}` }); return; }
  if (!CLASSIFICATIONS.has(classification)) { res.status(400).json({ error: 'classification must be liquid, investment, or liability' }); return; }
  const badOwner = invalidOwnerId(ids);
  if (badOwner != null) { res.status(400).json({ error: `Unknown owner id ${badOwner}` }); return; }
  let instId: number | null;
  try { instId = resolveInstitutionId(institutionId); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); return; }
  // Look up first owner display_name for legacy column
  const firstUser = sqlite.prepare('SELECT display_name FROM users WHERE id = ?').get(ids[0]) as { display_name: string } | undefined;
  const accountId = sqlite.transaction(() => {
    const result = db.insert(accounts).values({
      name: name.trim(),
      last_four: lastFour || null,
      type,
      classification,
      institution_id: instId,
      owner: firstUser?.display_name || '',
    }).run();
    const newId = Number(result.lastInsertRowid);
    const insertOwner = sqlite.prepare('INSERT OR IGNORE INTO account_owners (account_id, user_id) VALUES (?, ?)');
    for (const uid of ids) insertOwner.run(newId, uid);
    return newId;
  })();

  const created = db.select().from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  res.status(201).json({ data: enrichWithOwners([created!])[0] });
});

// PUT /api/accounts/:id
router.put('/:id', requirePermission('accounts.edit'), (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  const existing = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  const { name, lastFour, type, classification, ownerIds, institutionId } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) { res.status(400).json({ error: 'name cannot be empty' }); return; }
    updates.name = name.trim();
  }
  if (lastFour !== undefined) updates.last_four = lastFour || null;
  if (type !== undefined) {
    if (!ACCOUNT_TYPES.has(type)) { res.status(400).json({ error: `type must be one of ${[...ACCOUNT_TYPES].join(', ')}` }); return; }
    updates.type = type;
  }
  if (classification !== undefined) {
    if (!CLASSIFICATIONS.has(classification)) { res.status(400).json({ error: 'classification must be liquid, investment, or liability' }); return; }
    updates.classification = classification;
  }
  if (institutionId !== undefined) {
    try { updates.institution_id = resolveInstitutionId(institutionId); }
    catch (e) { res.status(400).json({ error: (e as Error).message }); return; }
  }

  let ids: number[] | null = null;
  if (ownerIds !== undefined) {
    ids = Array.isArray(ownerIds) ? ownerIds.map((v: unknown) => toId(v)).filter((v: number | null): v is number => v != null) : [];
    if (ids.length === 0) {
      res.status(400).json({ error: 'At least one owner is required' });
      return;
    }
    const badOwner = invalidOwnerId(ids);
    if (badOwner != null) { res.status(400).json({ error: `Unknown owner id ${badOwner}` }); return; }
    // Update legacy owner column
    const firstUser = sqlite.prepare('SELECT display_name FROM users WHERE id = ?').get(ids[0]) as { display_name: string } | undefined;
    if (firstUser) updates.owner = firstUser.display_name;
  }

  // Owner rows and the account row change together or not at all.
  sqlite.transaction(() => {
    if (ids) {
      sqlite.prepare('DELETE FROM account_owners WHERE account_id = ?').run(id);
      const insertOwner = sqlite.prepare('INSERT OR IGNORE INTO account_owners (account_id, user_id) VALUES (?, ?)');
      for (const uid of ids) insertOwner.run(id, uid);
    }
    if (Object.keys(updates).length > 0) {
      db.update(accounts).set(updates as typeof accounts.$inferInsert).where(eq(accounts.id, id)).run();
    }
  })();
  const updated = db.select().from(accounts).where(eq(accounts.id, id)).get();
  res.json({ data: enrichWithOwners([updated!])[0] });
});

// DELETE /api/accounts/:id (soft delete)
router.delete('/:id', requirePermission('accounts.delete'), (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  const existing = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  // Check for transactions
  const txCount = db.select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(eq(transactions.account_id, id))
    .get();
  if (txCount && txCount.count > 0) {
    res.status(400).json({ error: 'Cannot delete account with existing transactions' });
    return;
  }
  // Deactivate + drop its SimpleFIN links (with their holdings) together.
  sqlite.transaction(() => {
    db.update(accounts).set({ is_active: 0 }).where(eq(accounts.id, id)).run();
    deleteLinksCascade(sqlite, linkIdsForAccount(sqlite, id));
  })();
  res.json({ data: { message: 'Account deactivated' } });
});

// POST /api/accounts/:id/avatar — upload an account image
router.post('/:id/avatar', requirePermission('accounts.edit'), upload.single('file'), (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  const row = sqlite.prepare('SELECT avatar_url FROM accounts WHERE id = ?').get(id) as { avatar_url: string | null } | undefined;
  if (!row) { res.status(404).json({ error: 'Account not found' }); return; }
  const file = (req as unknown as { file?: { mimetype: string; buffer: Buffer } }).file;
  if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  let url: string;
  try { url = saveImage('account', id, file); } catch { res.status(400).json({ error: 'Unsupported image type' }); return; }
  sqlite.prepare('UPDATE accounts SET avatar_url = ? WHERE id = ?').run(url, id);
  res.json({ data: { avatar_url: url } });
});

// DELETE /api/accounts/:id/avatar — remove the account image
router.delete('/:id/avatar', requirePermission('accounts.edit'), (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  const row = sqlite.prepare('SELECT avatar_url FROM accounts WHERE id = ?').get(id) as { avatar_url: string | null } | undefined;
  if (!row) { res.status(404).json({ error: 'Account not found' }); return; }
  deleteImage(row.avatar_url);
  sqlite.prepare('UPDATE accounts SET avatar_url = NULL WHERE id = ?').run(id);
  res.json({ data: { avatar_url: null } });
});

export default router;
