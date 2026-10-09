import { Router, Request, Response } from 'express';
import multer from 'multer';
import { db, sqlite } from '../db/index.js';
import { dismissedTransfers } from '../db/schema.js';
import { buildCategorizer } from '../services/categorize.js';
import { llmConfig, llmCategorizeBatch, mergeLlmResult, type LlmTxnInput } from '../services/llmCategorize.js';
import { normalizeMerchantName } from '../services/merchantNormalize.js';
import { eq } from 'drizzle-orm';
import { readCsv } from '@ledger/shared';
import { requirePermission } from '../middleware/permissions.js';
import { detectDuplicates } from '../services/duplicateDetector.js';
import { detectTransfers } from '../services/transferDetector.js';
import { commitImport, IMPORT_FAILED_MESSAGE, type ImportCommitInput } from '../services/importCommit.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

// headerRowIndex counts non-blank records, so the browser's readCsv slice agrees with it.
function parseCSV(text: string): { headers: string[]; rows: string[][]; headerRowIndex: number; unclosedQuoteLine: number | null } {
  const { records, unclosedQuoteLine } = readCsv(text);
  if (records.length === 0) return { headers: [], rows: [], headerRowIndex: 0, unclosedQuoteLine };

  const headerRowIndex = findHeaderRow(records);
  const headers = records[headerRowIndex];
  const rows = records.slice(headerRowIndex + 1);
  return { headers, rows, headerRowIndex, unclosedQuoteLine };
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
    const { headers, rows, headerRowIndex, unclosedQuoteLine } = parseCSV(text);

    if (unclosedQuoteLine !== null) {
      res.status(400).json({ error: `This file has a quote mark on line ${unclosedQuoteLine} that is never closed, so it can't be read safely. Fix the file and upload it again.` });
      return;
    }

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
    const { items, accountId } = req.body as {
      items: { description: string; amount: number; payee?: string }[];
      accountId?: number;
    };
    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: 'items array is required' });
      return;
    }

    // Account context is optional — the wizard sends it once the target account
    // is chosen. Without it the transfer signal still reads the text; it just
    // can't use direction, so a card payment stays a weak guess.
    const account = accountId
      ? sqlite.prepare('SELECT classification, type FROM accounts WHERE id = ?').get(accountId) as
        { classification: string | null; type: string | null } | undefined
      : undefined;

    // Unified resolver (shared with bank sync): user rules, strong transfer
    // signal, per-merchant majority vote, text-history, skip-unresolved
    // heuristic, weak transfer signal, none.
    const categorizer = buildCategorizer(sqlite);
    const priors = items.map((item) =>
      categorizer.categorize({
        description: item.description,
        payee: item.payee,
        amount: item.amount,
        accountClassification: account?.classification,
        accountType: account?.type,
      }));

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

// POST /api/import/commit — validation and the all-or-nothing write live in
// services/importCommit.ts.
router.post('/commit', requirePermission('import.csv'), (req: Request, res: Response) => {
  try {
    const result = commitImport(sqlite, req.body as ImportCommitInput);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({ data: { imported: result.imported } });
  } catch (err) {
    console.error('POST /import/commit error:', err);
    res.status(500).json({ error: IMPORT_FAILED_MESSAGE });
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
