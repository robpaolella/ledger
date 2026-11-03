import { Router, Request, Response } from 'express';
import { sqlite } from '../db/index.js';
import { requirePermission } from '../middleware/permissions.js';
import { resolveReview } from '../services/reviews.js';
import { unsafeRegexReason } from '../utils/validate.js';

const router = Router();

/**
 * User-managed category rules — the highest-priority layer of auto-categorization
 * (see services/categorize.ts). A rule maps a match (a merchant id, a substring,
 * or a regex) to a category. Created when the user teaches "always categorize
 * {merchant} as {category}", and optionally back-applied to existing rows.
 */

type MatchType = 'merchant' | 'contains' | 'regex';
const isMatchType = (v: unknown): v is MatchType => v === 'merchant' || v === 'contains' || v === 'regex';

// GET /api/category-rules — list, with category + (for merchant rules) merchant names.
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = sqlite.prepare(`
      SELECT cr.id, cr.match_type, cr.pattern, cr.category_id, cr.priority,
             c.group_name, c.sub_name,
             m.name AS merchant_name
      FROM category_rules cr
      JOIN categories c ON cr.category_id = c.id
      LEFT JOIN merchants m ON cr.match_type = 'merchant' AND cr.pattern = CAST(m.id AS TEXT)
      ORDER BY cr.priority DESC, cr.id ASC
    `).all() as {
      id: number; match_type: MatchType; pattern: string; category_id: number;
      priority: number; group_name: string; sub_name: string; merchant_name: string | null;
    }[];
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        matchType: r.match_type,
        pattern: r.pattern,
        categoryId: r.category_id,
        priority: r.priority,
        groupName: r.group_name,
        subName: r.sub_name,
        merchantName: r.merchant_name,
      })),
    });
  } catch (err) {
    console.error('GET /category-rules error:', err);
    res.status(500).json({ error: 'Failed to list category rules' });
  }
});

// POST /api/category-rules — create a rule; optionally back-apply to existing rows.
router.post('/', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const { matchType, pattern, categoryId, priority, applyToExisting } = req.body as {
      matchType?: string; pattern?: string; categoryId?: number; priority?: number; applyToExisting?: boolean;
    };

    if (!isMatchType(matchType)) return res.status(400).json({ error: 'matchType must be merchant | contains | regex' });
    const pat = (pattern ?? '').toString().trim();
    if (!pat) return res.status(400).json({ error: 'pattern is required' });
    if (!categoryId) return res.status(400).json({ error: 'categoryId is required' });

    const cat = sqlite.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId) as { id: number } | undefined;
    if (!cat) return res.status(400).json({ error: 'categoryId does not exist' });

    // Validate a regex pattern up-front so a broken rule can't be stored.
    let regex: RegExp | null = null;
    if (matchType === 'regex') {
      const unsafe = unsafeRegexReason(pat);
      if (unsafe) return res.status(400).json({ error: unsafe });
      try { regex = new RegExp(pat, 'i'); } catch { return res.status(400).json({ error: 'Invalid regular expression' }); }
    }
    if (matchType === 'merchant' && isNaN(Number(pat))) {
      return res.status(400).json({ error: 'merchant rule pattern must be a merchant id' });
    }

    let affected = 0;
    const run = sqlite.transaction(() => {
      // A merchant already has a rule? Replace it so "always categorize X" stays single + current.
      if (matchType === 'merchant') {
        sqlite.prepare("DELETE FROM category_rules WHERE match_type = 'merchant' AND pattern = ?").run(pat);
      }
      sqlite.prepare(
        'INSERT INTO category_rules (match_type, pattern, category_id, priority) VALUES (?, ?, ?, ?)'
      ).run(matchType, pat, categoryId, priority ?? 0);

      if (applyToExisting) {
        // Candidate = non-split transactions (a split parent has legs → don't flatten it).
        const candidates = sqlite.prepare(`
          SELECT t.id, t.description, t.merchant_id, m.name AS merchant_name
          FROM transactions t
          LEFT JOIN merchants m ON t.merchant_id = m.id
          WHERE NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id)
        `).all() as { id: number; description: string; merchant_id: number | null; merchant_name: string | null }[];

        const matchIds: number[] = [];
        const needle = pat.toLowerCase();
        for (const t of candidates) {
          let hit: boolean;
          if (matchType === 'merchant') hit = t.merchant_id != null && String(t.merchant_id) === pat;
          else if (matchType === 'contains') hit = t.description.toLowerCase().includes(needle) || (t.merchant_name?.toLowerCase().includes(needle) ?? false);
          else hit = !!regex && (regex.test(t.description) || (t.merchant_name ? regex.test(t.merchant_name) : false));
          if (hit) matchIds.push(t.id);
        }

        if (matchIds.length) {
          const upd = sqlite.prepare('UPDATE transactions SET category_id = ? WHERE id = ?');
          for (const id of matchIds) {
            upd.run(categoryId, id);
            // Route the needs_review/confidence clear through the service so any open
            // review row is resolved + its notification cleared (keeps the invariant).
            resolveReview(sqlite, { txnId: id, resolvedBy: req.user!.userId });
          }
          affected = matchIds.length;
        }
      }
    });
    run();

    res.status(201).json({ data: { affected } });
  } catch (err) {
    console.error('POST /category-rules error:', err);
    res.status(500).json({ error: 'Failed to create category rule' });
  }
});

// DELETE /api/category-rules/:id
router.delete('/:id', requirePermission('transactions.edit'), (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid rule id' });
    const result = sqlite.prepare('DELETE FROM category_rules WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ data: { id } });
  } catch (err) {
    console.error('DELETE /category-rules/:id error:', err);
    res.status(500).json({ error: 'Failed to delete category rule' });
  }
});

export default router;
