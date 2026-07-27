import { Router, Request, Response } from 'express';
import multer from 'multer';
import { db, sqlite } from '../db/index.js';
import { transactions, transactionSplits, dismissedTransfers } from '../db/schema.js';
import { resolveMerchantId } from '../db/merchants.js';
import { buildCategorizer, REVIEW_THRESHOLD } from '../services/categorize.js';
import { llmConfig, llmCategorizeBatch, mergeLlmResult, type LlmTxnInput } from '../services/llmCategorize.js';
import { normalizeMerchantName } from '../services/merchantNormalize.js';
import { flagReview, defaultAssigneeForTxn } from '../services/reviews.js';
import { eq } from 'drizzle-orm';
import { requirePermission } from '../middleware/permissions.js';
import { detectDuplicates } from '../services/duplicateDetector.js';
import { detectTransfers } from '../services/transferDetector.js';
import { checkBudgetExceededForMonths } from '../services/budgetAlerts.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const HEADER_PATTERNS = [
  /^date$/i, /datetime/i, /posting\s?date/i, /trans(action)?\s?date/i,
  /^amount$/i, /amount.*total/i,
  /description/i, /memo/i, /payee/i, /merchant/i,
  /^type$/i, /^status$/i, /^note$/i,
  /^from$/i, /^to$/i, /^category$/i,
  /funding\s?source/i, /destination/i, /balance/i,
];

// Scan rows for the one most likely to be column headers
function findHeaderRow(parsedLines: string[][]): number {
  let bestIdx = 0;
  let bestScore = 0;
  const limit = Math.min(parsedLines.length, 20);
  for (let i = 0; i < limit; i++) {
    let score = 0;
    for (const cell of parsedLines[i]) {
      const lower = cell.toLowerCase().trim();
      if (!lower) continue;
      for (const pattern of HEADER_PATTERNS) {
        if (pattern.test(lower)) { score++; break; }
      }
    }
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestIdx;
}

function parseCSV(text: string): { headers: string[]; rows: string[][]; headerRowIndex: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [], headerRowIndex: 0 };

  const parsedLines = lines.map(parseLine);
  const headerRowIndex = findHeaderRow(parsedLines);
  const headers = parsedLines[headerRowIndex];
  const rows = parsedLines.slice(headerRowIndex + 1).filter((r) => r.some((c) => c.trim()));
  return { headers, rows, headerRowIndex };
}

function detectFormat(headers: string[]): 'chase' | 'venmo' | 'generic' {
  const h = headers.map((x) => x.toLowerCase());
  if (h.some((x) => x.includes('posting date') || x.includes('transaction date')) && h.some((x) => x.includes('description'))) return 'chase';
  if (h.some((x) => x.includes('datetime')) && h.some((x) => x.includes('note') || x.includes('from'))) return 'venmo';
  return 'generic';
}

function suggestMapping(headers: string[], format: 'chase' | 'venmo' | 'generic'): { date: number; description: number; amount: number } {
  const h = headers.map((x) => x.toLowerCase());
  let date = h.findIndex((x) => /posting\s?date|trans(action)?\s?date|^date$/i.test(x));
  if (date < 0) date = h.findIndex((x) => x.includes('date'));
  let description = format === 'venmo' ? h.findIndex((x) => /^note$/i.test(x)) : -1;
  if (description < 0) description = h.findIndex((x) => /description|memo|payee|merchant/i.test(x));
  if (description < 0) description = h.findIndex((x) => x.includes('desc'));
  let amount = h.findIndex((x) => /^amount$|^amount.*total/i.test(x));
  if (amount < 0) amount = h.findIndex((x) => x.includes('amount'));
  return { date: date >= 0 ? date : 0, description: description >= 0 ? description : 1, amount: amount >= 0 ? amount : 2 };
}

// POST /api/import/parse
router.post('/parse', requirePermission('import.csv'), upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const text = req.file.buffer.toString('utf-8');
    const { headers, rows, headerRowIndex } = parseCSV(text);

    if (headers.length === 0) {
      res.status(400).json({ error: 'Could not parse CSV headers' });
      return;
    }

    const detectedFormat = detectFormat(headers);
    const suggestedMappingResult = suggestMapping(headers, detectedFormat);

    res.json({
      data: {
        headers,
        sampleRows: rows.slice(0, 5),
        totalRows: rows.length,
        detectedFormat,
        suggestedMapping: suggestedMappingResult,
        headerRowIndex,
      },
    });
  } catch (err) {
    console.error('POST /import/parse error:', err);
    res.status(500).json({ error: 'Failed to parse CSV' });
  }
});

// POST /api/import/categorize
router.post('/categorize', requirePermission('import.csv'), async (req: Request, res: Response) => {
  try {
    const { items } = req.body as { items: { description: string; amount: number; payee?: string }[] };
    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: 'items array is required' });
      return;
    }

    // Unified resolver (shared with bank sync): user rules → per-merchant majority
    // vote → text-history → skip-unresolved heuristic → none.
    const categorizer = buildCategorizer(sqlite);
    const priors = items.map((item) =>
      categorizer.categorize({ description: item.description, payee: item.payee, amount: item.amount }));

    // LLM second opinion on everything below rule-certainty (same stage as bank
    // sync; no account context in the CSV wizard). Failure → priors stand.
    const merged = [...priors];
    try {
      const idxs = priors.map((p, i) => (p.confidence < 1 ? i : -1)).filter((i) => i >= 0).slice(0, 200);
      if (idxs.length > 0 && llmConfig(sqlite)) {
        const llmItems: LlmTxnInput[] = idxs.map((i, k) => ({
          key: k,
          date: '',
          amount: items[i].amount,
          merchantName: normalizeMerchantName(items[i].payee || items[i].description) || null,
          description: items[i].description,
          prior: priors[i],
        }));
        const verdicts = await llmCategorizeBatch(sqlite, llmItems);
        const catMeta = new Map((sqlite.prepare('SELECT id, group_name, sub_name FROM categories').all() as
          { id: number; group_name: string; sub_name: string }[]).map((c) => [c.id, c]));
        idxs.forEach((i, k) => {
          const m = mergeLlmResult(priors[i], verdicts.get(k));
          if (m === priors[i]) return;
          const meta = m.categoryId != null ? catMeta.get(m.categoryId) : undefined;
          merged[i] = { ...m, groupName: m.groupName ?? meta?.group_name ?? null, subName: m.subName ?? meta?.sub_name ?? null };
        });
      }
    } catch (err) {
      console.error('[llm-categorize] CSV pass failed:', err instanceof Error ? err.message : err);
    }

    const results = items.map((item, i) => ({
      description: item.description,
      payee: item.payee,
      suggestedCategoryId: merged[i].categoryId,
      suggestedGroupName: merged[i].groupName,
      suggestedSubName: merged[i].subName,
      confidence: merged[i].confidence,
      source: merged[i].source,
    }));

    res.json({ data: results });
  } catch (err) {
    console.error('POST /import/categorize error:', err);
    res.status(500).json({ error: 'Failed to categorize' });
  }
});

// POST /api/import/commit
router.post('/commit', requirePermission('import.csv'), (req: Request, res: Response) => {
  try {
    const { accountId, transactions: txns } = req.body as {
      accountId: number;
      transactions: {
        date: string; description: string; note?: string;
        categoryId?: number; amount: number;
        // Auto-suggestion metadata (null/absent = the user picked the category
        // manually in the wizard). Mirrors the bank-sync commit path.
        confidence?: number | null; source?: string | null;
        splits?: { categoryId: number; amount: number }[];
      }[];
    };

    if (!accountId || !txns || !Array.isArray(txns) || txns.length === 0) {
      res.status(400).json({ error: 'accountId and transactions array are required' });
      return;
    }

    // Validate all required fields
    for (const t of txns) {
      if (!t.date || !t.description || t.amount == null) {
        res.status(400).json({ error: 'Each transaction requires date, description, and amount' });
        return;
      }
      if (!t.categoryId && (!t.splits || t.splits.length < 2)) {
        res.status(400).json({ error: 'Each transaction requires categoryId or splits' });
        return;
      }
      if (t.splits && t.splits.length >= 2) {
        const splitSum = t.splits.reduce((s, r) => s + r.amount, 0);
        if (Math.abs(splitSum - t.amount) > 0.01) {
          res.status(400).json({ error: `Split amounts must equal transaction amount for "${t.description}"` });
          return;
        }
      }
    }

    // Insert all transactions. Auto-suggested rows carry confidence/source and
    // land in the review queue below the threshold — same contract as bank sync.
    let count = 0;
    for (const t of txns) {
      const hasSplits = t.splits && t.splits.length >= 2;
      const conf = hasSplits ? null : (t.confidence ?? null);
      const needsReview = !hasSplits && conf != null && conf < REVIEW_THRESHOLD ? 1 : 0;
      const result = db.insert(transactions).values({
        account_id: accountId,
        category_id: hasSplits ? null : t.categoryId!,
        date: t.date,
        description: t.description,
        // CSV description IS the raw statement text — preserve it verbatim
        // even if the user later renames the merchant/description.
        bank_description: t.description,
        note: t.note || null,
        merchant_id: resolveMerchantId(t.description),
        amount: t.amount,
        categorize_confidence: conf,
        needs_review: needsReview,
        categorize_source: hasSplits || conf == null ? null : (t.source ?? null),
      }).run();
      const txnId = Number(result.lastInsertRowid);

      if (hasSplits) {
        for (const s of t.splits!) {
          db.insert(transactionSplits).values({
            transaction_id: txnId,
            category_id: s.categoryId,
            amount: s.amount,
          }).run();
        }
      }
      if (needsReview === 1) {
        flagReview(sqlite, {
          txnId,
          reason: 'auto_low_confidence',
          assigneeId: defaultAssigneeForTxn(sqlite, txnId),
        });
      }
      count++;
    }

    // Imported spending may push categories over budget (internally try/catch).
    checkBudgetExceededForMonths(sqlite, txns.map((t) => t.date.slice(0, 7)));

    res.status(201).json({ data: { imported: count } });
  } catch (err) {
    console.error('POST /import/commit error:', err);
    res.status(500).json({ error: 'Failed to import transactions' });
  }
});

// POST /api/import/check-duplicates — batch duplicate check for CSV import
router.post('/check-duplicates', requirePermission('import.csv'), (req: Request, res: Response) => {
  try {
    const { items } = req.body as { items: { date: string; amount: number; description: string }[] };
    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: 'items array is required' });
      return;
    }
    const results = detectDuplicates(items);
    res.json({ data: results });
  } catch (err) {
    console.error('POST /import/check-duplicates error:', err);
    res.status(500).json({ error: 'Duplicate check failed' });
  }
});

// POST /api/import/check-transfers — batch transfer detection for CSV import
router.post('/check-transfers', requirePermission('import.csv'), (req: Request, res: Response) => {
  try {
    const { items } = req.body as { items: { description: string; amount: number }[] };
    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: 'items array is required' });
      return;
    }
    const results = detectTransfers(items.map((i) => ({ payee: i.description, description: i.description, amount: i.amount })));
    res.json({ data: results });
  } catch (err) {
    console.error('POST /import/check-transfers error:', err);
    res.status(500).json({ error: 'Transfer check failed' });
  }
});

// Generate a stable signature for matching transfers across imports
function transferSignature(date: string, amount: number, description: string): string {
  const normDesc = description.toLowerCase().trim().replace(/\s+/g, ' ');
  const normAmt = Math.round(amount * 100) / 100;
  return `${date}|${normAmt}|${normDesc}`;
}

// POST /api/import/dismiss-transfers — record transfers as "seen" so they collapse on next import
router.post('/dismiss-transfers', requirePermission('import.csv'), (req: Request, res: Response) => {
  try {
    const { accountId, items } = req.body as {
      accountId: number;
      items: { date: string; amount: number; description: string }[];
    };
    if (!accountId || !items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'accountId and items array are required' });
      return;
    }

    const insert = sqlite.prepare(
      `INSERT OR IGNORE INTO dismissed_transfers (account_id, signature, date, amount, description, dismissed_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    );
    const batch = sqlite.transaction(() => {
      for (const item of items) {
        const sig = transferSignature(item.date, item.amount, item.description);
        insert.run(accountId, sig, item.date, item.amount, item.description);
      }
    });
    batch();

    res.json({ data: { dismissed: items.length } });
  } catch (err) {
    console.error('POST /import/dismiss-transfers error:', err);
    res.status(500).json({ error: 'Failed to dismiss transfers' });
  }
});

// POST /api/import/check-dismissed-transfers — check which items were previously dismissed
router.post('/check-dismissed-transfers', requirePermission('import.csv'), (req: Request, res: Response) => {
  try {
    const { accountId, items } = req.body as {
      accountId: number;
      items: { date: string; amount: number; description: string }[];
    };
    if (!accountId || !items || !Array.isArray(items)) {
      res.status(400).json({ error: 'accountId and items array are required' });
      return;
    }

    // Build set of dismissed signatures for this account
    const dismissed = db.select({ signature: dismissedTransfers.signature })
      .from(dismissedTransfers)
      .where(eq(dismissedTransfers.account_id, accountId))
      .all();
    const dismissedSet = new Set(dismissed.map((d) => d.signature));

    const results = items.map((item) => {
      const sig = transferSignature(item.date, item.amount, item.description);
      return dismissedSet.has(sig);
    });

    res.json({ data: results });
  } catch (err) {
    console.error('POST /import/check-dismissed-transfers error:', err);
    res.status(500).json({ error: 'Failed to check dismissed transfers' });
  }
});

export default router;
