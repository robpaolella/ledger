import { Router, Request, Response } from 'express';
import { sqlite } from '../db/index.js';
import { requirePermission } from '../middleware/permissions.js';
import multer from 'multer';
import { saveImage, deleteImage } from '../services/uploads.js';
import { fetchInstitutionLogo, logoDevConfigured } from '../services/institutionLogos.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const LOGO_KEY_REJECTED_MESSAGE = "The logo service isn't accepting this app's key. Check the key and try again.";

interface InstitutionRow {
  id: number;
  name: string;
  domain: string | null;
  logo_url: string | null;
  color: string | null;
  is_system: number;
  sort_order: number | null;
  created_at: string;
  account_count: number;
}

/** List all institutions with a count of accounts referencing each. */
function listInstitutions(): InstitutionRow[] {
  return sqlite.prepare(`
    SELECT fi.*, (
      SELECT COUNT(*) FROM accounts a WHERE a.institution_id = fi.id AND a.is_active = 1
    ) AS account_count
    FROM financial_institutions fi
    ORDER BY fi.name COLLATE NOCASE ASC
  `).all() as InstitutionRow[];
}

function getInstitution(id: number): InstitutionRow | undefined {
  return sqlite.prepare(`
    SELECT fi.*, (
      SELECT COUNT(*) FROM accounts a WHERE a.institution_id = fi.id AND a.is_active = 1
    ) AS account_count
    FROM financial_institutions fi WHERE fi.id = ?
  `).get(id) as InstitutionRow | undefined;
}

// GET /api/financial-institutions
router.get('/', (_req: Request, res: Response): void => {
  try {
    res.json({ data: listInstitutions(), logoServiceConfigured: logoDevConfigured() });
  } catch (err) {
    console.error('List institutions failed:', err);
    res.status(500).json({ error: 'Failed to list institutions' });
  }
});

// POST /api/financial-institutions
router.post('/', requirePermission('accounts.create'), (req: Request, res: Response): void => {
  try {
    const name = (req.body?.name ?? '').toString().trim();
    const domain = req.body?.domain ? req.body.domain.toString().trim() : null;
    const color = req.body?.color ? req.body.color.toString().trim() : null;
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    const existing = sqlite.prepare('SELECT id FROM financial_institutions WHERE LOWER(name) = LOWER(?)').get(name);
    if (existing) { res.status(409).json({ error: 'An institution with that name already exists' }); return; }
    const result = sqlite.prepare(
      'INSERT INTO financial_institutions (name, domain, color, is_system) VALUES (?, ?, ?, 0)'
    ).run(name, domain, color);
    res.status(201).json({ data: getInstitution(Number(result.lastInsertRowid)) });
  } catch (err) {
    console.error('Create institution failed:', err);
    res.status(500).json({ error: 'Failed to create institution' });
  }
});

// PUT /api/financial-institutions/:id
router.put('/:id', requirePermission('accounts.edit'), (req: Request, res: Response): void => {
  try {
    const id = Number(req.params.id);
    const existing = sqlite.prepare('SELECT * FROM financial_institutions WHERE id = ?').get(id);
    if (!existing) { res.status(404).json({ error: 'Institution not found' }); return; }
    const updates: string[] = [];
    const values: unknown[] = [];
    if (req.body?.name !== undefined) {
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) { res.status(400).json({ error: 'name cannot be empty' }); return; }
      const dup = sqlite.prepare('SELECT id FROM financial_institutions WHERE LOWER(name) = LOWER(?) AND id <> ?').get(name, id);
      if (dup) { res.status(409).json({ error: 'An institution with that name already exists' }); return; }
      updates.push('name = ?'); values.push(name);
    }
    if (req.body?.domain !== undefined) { updates.push('domain = ?'); values.push(req.body.domain ? req.body.domain.toString().trim() : null); }
    if (req.body?.color !== undefined) { updates.push('color = ?'); values.push(req.body.color ? req.body.color.toString().trim() : null); }
    if (updates.length > 0) {
      values.push(id);
      sqlite.prepare(`UPDATE financial_institutions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
    res.json({ data: getInstitution(id) });
  } catch (err) {
    console.error('Update institution failed:', err);
    res.status(500).json({ error: 'Failed to update institution' });
  }
});

// DELETE /api/financial-institutions/:id — blocked while any account references it
router.delete('/:id', requirePermission('accounts.delete'), (req: Request, res: Response): void => {
  try {
    const id = Number(req.params.id);
    const row = sqlite.prepare('SELECT logo_url FROM financial_institutions WHERE id = ?').get(id) as { logo_url: string | null } | undefined;
    if (!row) { res.status(404).json({ error: 'Institution not found' }); return; }
    // Block only on ACTIVE accounts (matches the account_count shown in the UI).
    const inUse = sqlite.prepare('SELECT COUNT(*) as cnt FROM accounts WHERE institution_id = ? AND is_active = 1').get(id) as { cnt: number };
    if (inUse.cnt > 0) {
      res.status(400).json({ error: `Cannot delete — ${inUse.cnt} account(s) still use this institution` });
      return;
    }
    deleteImage(row.logo_url);
    // Clear the FK on any inactive (soft-deleted) accounts first so the delete
    // doesn't trip the foreign_keys constraint, then remove the institution.
    sqlite.transaction(() => {
      sqlite.prepare('UPDATE accounts SET institution_id = NULL WHERE institution_id = ?').run(id);
      sqlite.prepare('DELETE FROM financial_institutions WHERE id = ?').run(id);
    })();
    res.json({ data: { message: 'Institution deleted' } });
  } catch (err) {
    console.error('Delete institution failed:', err);
    res.status(500).json({ error: 'Failed to delete institution' });
  }
});

// POST /api/financial-institutions/:id/logo — upload/replace a logo (client sends a cropped WebP)
router.post('/:id/logo', requirePermission('accounts.edit'), upload.single('file'), (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  const row = sqlite.prepare('SELECT id FROM financial_institutions WHERE id = ?').get(id);
  if (!row) { res.status(404).json({ error: 'Institution not found' }); return; }
  const file = (req as unknown as { file?: { mimetype: string; buffer: Buffer } }).file;
  if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  let url: string;
  try { url = saveImage('institution', id, file); } catch { res.status(400).json({ error: 'Unsupported image type' }); return; }
  sqlite.prepare('UPDATE financial_institutions SET logo_url = ? WHERE id = ?').run(url, id);
  res.json({ data: getInstitution(id) });
});

// DELETE /api/financial-institutions/:id/logo
router.delete('/:id/logo', requirePermission('accounts.edit'), (req: Request, res: Response): void => {
  const id = Number(req.params.id);
  const row = sqlite.prepare('SELECT logo_url FROM financial_institutions WHERE id = ?').get(id) as { logo_url: string | null } | undefined;
  if (!row) { res.status(404).json({ error: 'Institution not found' }); return; }
  deleteImage(row.logo_url);
  sqlite.prepare('UPDATE financial_institutions SET logo_url = NULL WHERE id = ?').run(id);
  res.json({ data: getInstitution(id) });
});

// POST /api/financial-institutions/:id/refresh-logo — (re)fetch from logo.dev by domain
router.post('/:id/refresh-logo', requirePermission('accounts.edit'), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const row = sqlite.prepare('SELECT id, domain, logo_url FROM financial_institutions WHERE id = ?').get(id) as { id: number; domain: string | null; logo_url: string | null } | undefined;
  if (!row) { res.status(404).json({ error: 'Institution not found' }); return; }
  if (!logoDevConfigured()) { res.status(400).json({ error: 'Logo service not configured (set LOGODEV_TOKEN)' }); return; }
  if (!row.domain) { res.status(400).json({ error: 'Institution has no domain to look up' }); return; }
  const result = await fetchInstitutionLogo(id, row.domain);
  if (result.keyRejected) { res.status(502).json({ error: LOGO_KEY_REJECTED_MESSAGE }); return; }
  if (!result.url) { res.status(404).json({ error: 'No logo found for that domain' }); return; }
  sqlite.prepare('UPDATE financial_institutions SET logo_url = ? WHERE id = ?').run(result.url, id);
  res.json({ data: getInstitution(id) });
});

// POST /api/financial-institutions/hydrate-logos — fetch every missing logo from logo.dev
router.post('/hydrate-logos', requirePermission('accounts.edit'), async (_req: Request, res: Response): Promise<void> => {
  if (!logoDevConfigured()) { res.status(400).json({ error: 'Logo service not configured (set LOGODEV_TOKEN)' }); return; }
  const rows = sqlite.prepare(
    "SELECT id, domain FROM financial_institutions WHERE logo_url IS NULL AND domain IS NOT NULL AND TRIM(domain) <> ''"
  ).all() as { id: number; domain: string }[];
  const setLogo = sqlite.prepare('UPDATE financial_institutions SET logo_url = ? WHERE id = ?');
  let updated = 0;
  for (const r of rows) {
    const result = await fetchInstitutionLogo(r.id, r.domain);
    if (result.keyRejected) { res.status(502).json({ error: LOGO_KEY_REJECTED_MESSAGE }); return; }
    if (result.url) { setLogo.run(result.url, r.id); updated++; }
  }
  res.json({ data: { attempted: rows.length, updated } });
});

export default router;
