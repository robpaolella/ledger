import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { merchants, transactions, transactionSplits } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { sanitize } from '../utils/sanitize.js';
import { requirePermission } from '../middleware/permissions.js';
import multer from 'multer';
import { saveImage, deleteImage } from '../services/uploads.js';
import { normalizeMerchantName } from '../services/merchantNormalize.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/** A user-uploaded merchant logo is stored as `merchant-<id>.<ext>`; catalog logos
 *  are SHARED `vendor-<id>.<ext>` files that other merchants + the vendor_logos
 *  catalog reference, so we must never delete those from a merchant operation. */
const isOwnedMerchantLogo = (url: string | null | undefined): boolean =>
  !!url && /\/merchant-\d+\.[a-z0-9]+$/i.test(url);

// GET /api/merchants — all merchants with transaction counts, A→Z.
// txn_count counts DISPLAYED rows: non-split transactions with this merchant,
// plus split legs whose effective merchant (own, or the parent's when inherited)
// is this merchant — so a merchant that appears only on a leg still counts.
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = sqlite.prepare(`
      SELECT m.id, m.name, m.logo_url, m.created_at, m.suppress_rule_suggest,
        (SELECT COUNT(*) FROM transactions t
           WHERE t.merchant_id = m.id
             AND NOT EXISTS (SELECT 1 FROM transaction_splits s WHERE s.transaction_id = t.id))
        +
        (SELECT COUNT(*) FROM transaction_splits ts
           JOIN transactions tp ON ts.transaction_id = tp.id
           WHERE COALESCE(ts.merchant_id, tp.merchant_id) = m.id)
        AS txn_count,
        -- The merchant's "always categorize as" rule, if it has one. At most one
        -- exists: POST /category-rules replaces a merchant's rule rather than
        -- stacking (see routes/categoryRules.ts).
        cr.id AS rule_id, cr.category_id AS rule_category_id,
        c.sub_name AS rule_sub_name, c.group_name AS rule_group_name
      FROM merchants m
      LEFT JOIN category_rules cr ON cr.match_type = 'merchant' AND cr.pattern = CAST(m.id AS TEXT)
      LEFT JOIN categories c ON c.id = cr.category_id
      ORDER BY m.name ASC
    `).all();
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /merchants error:', err);
    res.status(500).json({ error: 'Failed to fetch merchants' });
  }
});

// PATCH /api/merchants/:id — rename and/or set the "never suggest a rule here" flag
router.patch('/:id', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { name, suppressRuleSuggest } = sanitize(req.body) as { name?: unknown; suppressRuleSuggest?: unknown };
    // Both fields are optional, but a no-op request is a caller bug worth surfacing.
    const wantsRename = name !== undefined;
    const wantsSuppress = suppressRuleSuggest !== undefined;
    if (!wantsRename && !wantsSuppress) return res.status(400).json({ error: 'name or suppressRuleSuggest is required' });
    if (wantsRename && (typeof name !== 'string' || !name.trim())) return res.status(400).json({ error: 'name must be a non-empty string' });

    const existing = db.select().from(merchants).where(eq(merchants.id, id)).all();
    if (existing.length === 0) return res.status(404).json({ error: 'Merchant not found' });

    const clean = wantsRename ? (name as string).trim() : existing[0].name;
    if (wantsRename) {
      // Renaming onto an existing name would violate UNIQUE — merge instead.
      const clash = db.select().from(merchants).where(eq(merchants.name, clean)).all();
      if (clash.length > 0 && clash[0].id !== id) {
        return res.status(409).json({ error: 'A merchant with that name already exists — merge instead' });
      }
    }

    db.update(merchants).set({
      ...(wantsRename && { name: clean }),
      ...(wantsSuppress && { suppress_rule_suggest: suppressRuleSuggest ? 1 : 0 }),
    }).where(eq(merchants.id, id)).run();
    res.json({ data: { id, name: clean, suppressRuleSuggest: wantsSuppress ? (suppressRuleSuggest ? 1 : 0) : existing[0].suppress_rule_suggest } });
  } catch (err) {
    console.error('PATCH /merchants/:id error:', err);
    res.status(500).json({ error: 'Failed to rename merchant' });
  }
});

// POST /api/merchants/merge — repoint all of source's transactions to target, delete source
// `keepAlias` (default true) also records source.name → target in merchant_aliases,
// so imports that normalize to the merged-away name keep landing on the target
// instead of recreating it (see db/merchants.ts resolveMerchantId).
router.post('/merge', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const { sourceId, targetId, keepAlias } = req.body as { sourceId?: number; targetId?: number; keepAlias?: boolean };
    if (!sourceId || !targetId || sourceId === targetId) {
      return res.status(400).json({ error: 'distinct sourceId and targetId are required' });
    }
    const both = db.select().from(merchants).where(sql`${merchants.id} IN (${sourceId}, ${targetId})`).all();
    if (both.length < 2) return res.status(404).json({ error: 'Merchant not found' });
    // Alias keys are stored normalized, because that is what ingestion will
    // produce for a future transaction (normalization is idempotent, so a name
    // that came from ingestion round-trips unchanged).
    const aliasKey = normalizeMerchantName(both.find((m) => m.id === sourceId)!.name);
    const targetKey = normalizeMerchantName(both.find((m) => m.id === targetId)!.name);

    const run = sqlite.transaction(() => {
      db.update(transactions).set({ merchant_id: targetId }).where(eq(transactions.merchant_id, sourceId)).run();
      // Repoint split legs too, or the FK (foreign_keys=ON) blocks the delete.
      db.update(transactionSplits).set({ merchant_id: targetId }).where(eq(transactionSplits.merchant_id, sourceId)).run();
      // Alias bookkeeping — all of it BEFORE the source row goes, or ON DELETE
      // CASCADE takes the rows with it.
      if (keepAlias !== false && aliasKey && aliasKey !== targetKey) {
        sqlite.prepare('INSERT OR REPLACE INTO merchant_aliases (alias_name, merchant_id) VALUES (?, ?)')
          .run(aliasKey, targetId);
      }
      // Aliases that pointed at the source follow it to the target (A→B→C stays
      // resolvable); OR REPLACE settles a collision with an alias target already has.
      sqlite.prepare('UPDATE OR REPLACE merchant_aliases SET merchant_id = ? WHERE merchant_id = ?')
        .run(targetId, sourceId);
      // A merchant is never an alias of itself. Scoped to this merchant: the same
      // name may legitimately be an alias of some OTHER merchant.
      sqlite.prepare('DELETE FROM merchant_aliases WHERE alias_name = ? AND merchant_id = ?')
        .run(targetKey, targetId);
      // Repoint the source's merchant rule so learning survives the merge — but if
      // the target already has one, drop the source's instead (keep one rule/merchant).
      const targetHasRule = sqlite.prepare("SELECT 1 FROM category_rules WHERE match_type = 'merchant' AND pattern = ?").get(String(targetId));
      if (targetHasRule) {
        sqlite.prepare("DELETE FROM category_rules WHERE match_type = 'merchant' AND pattern = ?").run(String(sourceId));
      } else {
        sqlite.prepare("UPDATE category_rules SET pattern = ? WHERE match_type = 'merchant' AND pattern = ?").run(String(targetId), String(sourceId));
      }
      db.delete(merchants).where(eq(merchants.id, sourceId)).run();
    });
    run();
    // Drop the removed merchant's logo file (if it owns one) so it doesn't orphan
    // on disk — but never a shared catalog (vendor-*) file.
    const srcLogo = both.find((m) => m.id === sourceId)?.logo_url;
    if (isOwnedMerchantLogo(srcLogo)) deleteImage(srcLogo);
    res.json({ data: { merged: true, targetId } });
  } catch (err) {
    console.error('POST /merchants/merge error:', err);
    res.status(500).json({ error: 'Failed to merge merchants' });
  }
});

// DELETE /api/merchants/:id — unlink from transactions, then remove
router.delete('/:id', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = db.select().from(merchants).where(eq(merchants.id, id)).all();
    if (existing.length === 0) return res.status(404).json({ error: 'Merchant not found' });

    const run = sqlite.transaction(() => {
      db.update(transactions).set({ merchant_id: null }).where(eq(transactions.merchant_id, id)).run();
      // Unlink split legs too (they'd otherwise dangle / block the FK delete).
      db.update(transactionSplits).set({ merchant_id: null }).where(eq(transactionSplits.merchant_id, id)).run();
      // Drop any merchant rule pointing at this id so it doesn't dangle.
      sqlite.prepare("DELETE FROM category_rules WHERE match_type = 'merchant' AND pattern = ?").run(String(id));
      db.delete(merchants).where(eq(merchants.id, id)).run();
    });
    run();
    if (isOwnedMerchantLogo(existing[0].logo_url)) deleteImage(existing[0].logo_url);
    res.json({ data: { id } });
  } catch (err) {
    console.error('DELETE /merchants/:id error:', err);
    res.status(500).json({ error: 'Failed to delete merchant' });
  }
});

// POST /api/merchants/:id/logo — upload a logo image
router.post('/:id/logo', requirePermission('transactions.edit'), upload.single('file'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const m = sqlite.prepare('SELECT logo_url FROM merchants WHERE id = ?').get(id) as { logo_url: string | null } | undefined;
    if (!m) return res.status(404).json({ error: 'Merchant not found' });
    const file = (req as unknown as { file?: { mimetype: string; buffer: Buffer } }).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    let url: string;
    try { url = saveImage('merchant', id, file); } catch { return res.status(400).json({ error: 'Unsupported image type' }); }
    sqlite.prepare('UPDATE merchants SET logo_url = ? WHERE id = ?').run(url, id);
    res.json({ data: { logo_url: url } });
  } catch (err) {
    console.error('POST /merchants/:id/logo error:', err);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// DELETE /api/merchants/:id/logo — remove the logo
router.delete('/:id/logo', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const m = sqlite.prepare('SELECT logo_url FROM merchants WHERE id = ?').get(id) as { logo_url: string | null } | undefined;
    if (!m) return res.status(404).json({ error: 'Merchant not found' });
    // Only remove the file if the merchant owns it (not a shared catalog logo).
    if (isOwnedMerchantLogo(m.logo_url)) deleteImage(m.logo_url);
    // Set '' (explicitly cleared) rather than NULL so the vendor-catalog backfill
    // won't silently re-attach a logo the user removed on the next startup.
    sqlite.prepare("UPDATE merchants SET logo_url = '' WHERE id = ?").run(id);
    res.json({ data: { logo_url: null } });
  } catch (err) {
    console.error('DELETE /merchants/:id/logo error:', err);
    res.status(500).json({ error: 'Failed to remove logo' });
  }
});

// GET /api/merchants/:id/aliases — statement names that route to this merchant.
router.get('/:id/aliases', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const rows = sqlite.prepare(
      'SELECT alias_name, created_at FROM merchant_aliases WHERE merchant_id = ? ORDER BY alias_name'
    ).all(id) as { alias_name: string; created_at: string | null }[];
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /merchants/:id/aliases error:', err);
    res.status(500).json({ error: 'Failed to load merchant aliases' });
  }
});

// DELETE /api/merchants/:id/aliases?name=... — stop routing that name here.
// Future imports create the name as its own merchant again. The name travels as a
// query param, not a path segment: merchant names can contain '/' (CVS/pharmacy).
router.delete('/:id/aliases', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const name = typeof req.query.name === 'string' ? req.query.name : '';
    if (!name) return res.status(400).json({ error: 'name is required' });
    const out = sqlite.prepare('DELETE FROM merchant_aliases WHERE merchant_id = ? AND alias_name = ?').run(id, name);
    if (out.changes === 0) return res.status(404).json({ error: 'Alias not found' });
    res.json({ data: { aliasName: name } });
  } catch (err) {
    console.error('DELETE /merchants/:id/aliases error:', err);
    res.status(500).json({ error: 'Failed to remove merchant alias' });
  }
});

export default router;
