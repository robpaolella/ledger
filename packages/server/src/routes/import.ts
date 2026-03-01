import { Router, Request, Response } from 'express';
import multer from 'multer';
import { db } from '../db/index.js';
import { transactions, categories, transactionSplits } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requirePermission } from '../middleware/permissions.js';
import { detectDuplicates } from '../services/duplicateDetector.js';
import { detectTransfers } from '../services/transferDetector.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
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
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine).filter((r) => r.some((c) => c.trim()));
  return { headers, rows };
}

function detectFormat(headers: string[]): 'chase' | 'venmo' | 'generic' {
  const h = headers.map((x) => x.toLowerCase());
  if (h.some((x) => x.includes('posting date') || x.includes('transaction date')) && h.some((x) => x.includes('description'))) return 'chase';
  if (h.some((x) => x.includes('datetime')) && h.some((x) => x.includes('note') || x.includes('from'))) return 'venmo';
  return 'generic';
}

function suggestMapping(headers: string[]): { date: number; description: number; amount: number } {
  const h = headers.map((x) => x.toLowerCase());
  let date = h.findIndex((x) => /posting\s?date|trans(action)?\s?date|^date$/i.test(x));
  if (date < 0) date = h.findIndex((x) => x.includes('date'));
  let description = h.findIndex((x) => /description|memo|payee|merchant/i.test(x));
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
    const { headers, rows } = parseCSV(text);

    if (headers.length === 0) {
      res.status(400).json({ error: 'Could not parse CSV headers' });
      return;
    }

    const detectedFormat = detectFormat(headers);
    const suggestedMappingResult = suggestMapping(headers);

    res.json({
      data: {
        headers,
        sampleRows: rows.slice(0, 5),
        totalRows: rows.length,
        detectedFormat,
        suggestedMapping: suggestedMappingResult,
      },
    });
  } catch (err) {
    console.error('POST /import/parse error:', err);
    res.status(500).json({ error: 'Failed to parse CSV' });
  }
});

// POST /api/import/categorize
router.post('/categorize', requirePermission('import.csv'), (req: Request, res: Response) => {
  try {
    const { items } = req.body as { items: { description: string; amount: number; payee?: string }[] };
    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: 'items array is required' });
      return;
    }

    // Build pattern map from existing transaction history
    const history = db.select({
      description: transactions.description,
      category_id: transactions.category_id,
      group_name: categories.group_name,
      sub_name: categories.sub_name,
      type: categories.type,
    }).from(transactions)
      .innerJoin(categories, eq(transactions.category_id, categories.id))
      .all();

    // Build category distribution map: description → { categoryId → info + count }
    type CatInfo = { groupName: string; subName: string; type: string; count: number };
    const descCatDist = new Map<string, Map<number, CatInfo>>();
    for (const h of history) {
      const key = h.description.toLowerCase().trim();
      if (!descCatDist.has(key)) descCatDist.set(key, new Map());
      const catMap = descCatDist.get(key)!;
      const catId = h.category_id!;
      const existing = catMap.get(catId);
      if (existing) {
        existing.count++;
      } else {
        catMap.set(catId, {
          groupName: h.group_name,
          subName: h.sub_name,
          type: h.type,
          count: 1,
        });
      }
    }

    // Returns the dominant category if one exists with sufficient consistency.
    // With < 3 data points, always returns the most common (not enough data to measure variance).
    // With >= 3 data points, requires >= 75% dominance to suggest.
    const DOMINANCE_THRESHOLD = 0.75;
    const MIN_HISTORY_FOR_VARIANCE = 3;

    function getDominantCategory(catMap: Map<number, CatInfo>): { categoryId: number; groupName: string; subName: string; type: string } | null {
      let total = 0;
      let best: { categoryId: number; groupName: string; subName: string; type: string; count: number } | null = null;
      for (const [catId, info] of catMap) {
        total += info.count;
        if (!best || info.count > best.count) {
          best = { categoryId: catId, groupName: info.groupName, subName: info.subName, type: info.type, count: info.count };
        }
      }
      if (!best) return null;
      if (total < MIN_HISTORY_FOR_VARIANCE) return best;
      if (best.count / total >= DOMINANCE_THRESHOLD) return best;
      return null;
    }

    function getTotalCount(catMap: Map<number, CatInfo>): number {
      let total = 0;
      for (const info of catMap.values()) total += info.count;
      return total;
    }

    // Keyword rules for common merchants
    const RULES: { pattern: RegExp; groupName: string; subName: string }[] = [
      { pattern: /shell|chevron|exxon|\bmobil\b|bp |sunoco|gas|fuel|wawa.*gas/i, groupName: 'Auto/Transportation', subName: 'Fuel' },
      { pattern: /costco gas/i, groupName: 'Auto/Transportation', subName: 'Fuel' },
      { pattern: /costco|giant|groceries|grocery|aldi|trader joe|whole foods|safeway|kroger|publix|wegmans|food lion|jimbo/i, groupName: 'Daily Living', subName: 'Groceries' },
      { pattern: /amazon|amzn/i, groupName: 'Daily Living', subName: 'Online Shopping' },
      { pattern: /walmart|target|dollar/i, groupName: 'Daily Living', subName: 'General Merchandise' },
      { pattern: /netflix|hulu|disney|spotify|apple.*music|hbo|paramount|peacock/i, groupName: 'Dues/Subscriptions', subName: 'Streaming Services' },
      { pattern: /restaurant|mcdonald|wendy|burger|chick-fil|chipotle|panera|starbucks|dunkin|coffee|pizza|taco bell|diner|jersey mike|in-n-out|del taco|subway|on the border|chili|peet/i, groupName: 'Daily Living', subName: 'Dining/Eating Out' },
      { pattern: /uber eats|doordash|grubhub|postmates/i, groupName: 'Daily Living', subName: 'Dining/Eating Out' },
      { pattern: /uber|lyft|taxi|cab/i, groupName: 'Auto/Transportation', subName: 'Ride Share' },
      { pattern: /geico|progressive|allstate|state farm|insurance/i, groupName: 'Insurance', subName: 'Auto Insurance' },
      { pattern: /at&t|verizon|t-mobile|sprint|comcast|xfinity|internet|wifi/i, groupName: 'Utilities', subName: 'Cellphone' },
      { pattern: /electric|power|energy|ppl|duke energy|sd gas|sdge/i, groupName: 'Utilities', subName: 'Electric' },
      { pattern: /water.*sewer|water bill|sewer/i, groupName: 'Utilities', subName: 'Water/Sewer' },
      { pattern: /home depot|lowes|hardware/i, groupName: 'Household', subName: 'Improvements' },
      { pattern: /cvs|walgreens|pharmacy|rx|doctor|dr\.|medical|hospital|urgent care/i, groupName: 'Health', subName: 'Medical' },
      { pattern: /gym|fitness|planet fitness|equinox|yoga/i, groupName: 'Health', subName: 'Gym/Fitness' },
      { pattern: /payroll|direct deposit|salary|wages/i, groupName: 'Income', subName: 'Take Home Pay' },
      { pattern: /interest.*payment|interest.*earned|interest paid|interest$/i, groupName: 'Income', subName: 'Interest Income' },
      { pattern: /cloudflare|github|namecheap|elevenlabs|steam/i, groupName: 'Dues/Subscriptions', subName: 'Online Services' },
      { pattern: /southwest|american airlines|united airlines|delta|frontier/i, groupName: 'Discretionary', subName: 'Travel' },
    ];

    // Get all categories for ID lookup
    const allCats = db.select().from(categories).all();
    const catLookup = new Map(allCats.map((c) => [`${c.group_name}:${c.sub_name}`, c.id]));

    const results = items.map((item) => {
      // Use payee as primary match text when available (bank sync), fall back to description (CSV)
      const primaryText = item.payee || item.description;
      const primaryLower = primaryText.toLowerCase().trim();
      const descLower = item.description.toLowerCase().trim();

      const noSuggestion = {
        description: item.description,
        payee: item.payee,
        suggestedCategoryId: null,
        suggestedGroupName: null,
        suggestedSubName: null,
        confidence: 0.0,
      };

      let highVarianceVendor = false;

      // 1. Exact match from history — check payee first, then description
      const exactPayeeDist = descCatDist.get(primaryLower);
      if (exactPayeeDist) {
        const dominant = getDominantCategory(exactPayeeDist);
        if (dominant) {
          return {
            description: item.description,
            payee: item.payee,
            suggestedCategoryId: dominant.categoryId,
            suggestedGroupName: dominant.groupName,
            suggestedSubName: dominant.subName,
            confidence: 1.0,
          };
        }
        if (getTotalCount(exactPayeeDist) >= MIN_HISTORY_FOR_VARIANCE) highVarianceVendor = true;
      }

      if (!highVarianceVendor && item.payee) {
        const exactDescDist = descCatDist.get(descLower);
        if (exactDescDist) {
          const dominant = getDominantCategory(exactDescDist);
          if (dominant) {
            return {
              description: item.description,
              payee: item.payee,
              suggestedCategoryId: dominant.categoryId,
              suggestedGroupName: dominant.groupName,
              suggestedSubName: dominant.subName,
              confidence: 0.9,
            };
          }
          if (getTotalCount(exactDescDist) >= MIN_HISTORY_FOR_VARIANCE) highVarianceVendor = true;
        }
      }

      // 2. Partial match from history — check both payee and description
      if (!highVarianceVendor) {
        for (const [key, dist] of descCatDist.entries()) {
          if (primaryLower.includes(key) || key.includes(primaryLower) ||
              (item.payee && (descLower.includes(key) || key.includes(descLower)))) {
            const dominant = getDominantCategory(dist);
            if (dominant) {
              return {
                description: item.description,
                payee: item.payee,
                suggestedCategoryId: dominant.categoryId,
                suggestedGroupName: dominant.groupName,
                suggestedSubName: dominant.subName,
                confidence: 0.7,
              };
            }
            if (getTotalCount(dist) >= MIN_HISTORY_FOR_VARIANCE) {
              highVarianceVendor = true;
              break;
            }
          }
        }
      }

      // 3. Rule-based matching — skip if vendor has varied history
      if (!highVarianceVendor) {
        for (const rule of RULES) {
          if (rule.pattern.test(primaryText) || (item.payee && rule.pattern.test(item.description))) {
            const catId = catLookup.get(`${rule.groupName}:${rule.subName}`);
            return {
              description: item.description,
              payee: item.payee,
              suggestedCategoryId: catId || null,
              suggestedGroupName: rule.groupName,
              suggestedSubName: rule.subName,
              confidence: 0.7,
            };
          }
        }
      }

      // 4. No match (or high-variance vendor)
      return noSuggestion;
    });

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

    // Insert all transactions
    let count = 0;
    for (const t of txns) {
      const hasSplits = t.splits && t.splits.length >= 2;
      const result = db.insert(transactions).values({
        account_id: accountId,
        category_id: hasSplits ? null : t.categoryId!,
        date: t.date,
        description: t.description,
        note: t.note || null,
        amount: t.amount,
      }).run();

      if (hasSplits) {
        const txnId = Number(result.lastInsertRowid);
        for (const s of t.splits!) {
          db.insert(transactionSplits).values({
            transaction_id: txnId,
            category_id: s.categoryId,
            amount: s.amount,
          }).run();
        }
      }
      count++;
    }

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

export default router;
