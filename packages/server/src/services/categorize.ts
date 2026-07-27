import type Database from 'better-sqlite3';
import { normalizeMerchantName } from './merchantNormalize.js';

/**
 * Unified auto-categorization resolver. Replaces the two divergent, buggy copies
 * that lived inline in routes/simplefin.ts and routes/import.ts.
 *
 * Precedence (highest → lowest), with a confidence in [0,1]:
 *   1. User category_rules (merchant | contains | regex)          conf 1.0
 *   2. Per-merchant majority vote from history (dominance-scaled) conf = share*
 *   3. Text-history majority vote (legacy / merchant-less rows)   conf = share*0.9
 *   4. Bundled heuristic keyword rules, SKIPPING any (group,sub)
 *      that doesn't resolve to a real category in this DB         conf 0.6
 *   5. Nothing                                                    conf 0.0
 *
 * (*) single-sample history is capped below the review threshold so a one-off
 * doesn't masquerade as certain. `buildCategorizer` loads everything ONCE; the
 * returned `categorize` closure is O(rules) per item with O(1) history lookups.
 */

export interface CategorizeInput {
  description: string;
  payee?: string | null;
  amount: number;
}

export interface CategorizeResult {
  categoryId: number | null;
  groupName: string | null;
  subName: string | null;
  confidence: number;
  source: 'rule' | 'merchant-history' | 'text-history' | 'heuristic' | 'llm' | 'none';
}

// Heuristic keyword rules, keyed to (group, sub). Any pair that doesn't resolve
// to a real category in the current DB is skipped at build time (fresh installs
// and custom taxonomies both stay safe). Confidence is deliberately 0.6 so a
// keyword-only guess is always flagged for review.
interface HeuristicRule { pattern: RegExp; groupName: string; subName: string; }
const HEURISTIC_RULES: HeuristicRule[] = [
  { pattern: /\b(shell|chevron|exxon|mobil|sunoco|valero|citgo|arco|marathon|gas station|fuel)\b/i, groupName: 'Auto/Transportation', subName: 'Fuel' },
  { pattern: /\b(grocery|groceries|supermarket|safeway|kroger|publix|aldi|trader joe|whole foods|wegmans|food lion|sprouts|ralphs|vons|giant)\b/i, groupName: 'Daily Living', subName: 'Groceries' },
  { pattern: /\b(restaurant|cafe|coffee|starbucks|dunkin|mcdonald|chipotle|panera|pizza|taco|burger|grill|diner|kitchen|eatery|bistro|doordash|uber eats|grubhub)\b/i, groupName: 'Daily Living', subName: 'Dining/Eating Out' },
  { pattern: /\b(uber|lyft|taxi|transit|parking|metro|toll|amtrak)\b/i, groupName: 'Auto/Transportation', subName: 'Transportation' },
  { pattern: /\b(netflix|hulu|disney\+?|spotify|hbo|paramount\+?|peacock|youtube premium|itunes)\b|apple\.com\/bill/i, groupName: 'Entertainment', subName: 'Other Entertainment' },
  { pattern: /\b(at&t|verizon|t-mobile|sprint|mint mobile|cricket|wireless|cellphone)\b/i, groupName: 'Utilities', subName: 'Phone' },
  { pattern: /\b(comcast|xfinity|spectrum|internet|broadband|fios|centurylink)\b/i, groupName: 'Utilities', subName: 'Internet' },
  { pattern: /\b(electric|energy|pg&e|edison|duke energy|ppl|con ed|power co)\b/i, groupName: 'Utilities', subName: 'Power' },
  { pattern: /\b(water|sewer|water district|municipal water)\b/i, groupName: 'Utilities', subName: 'Water' },
  { pattern: /\b(home depot|lowe'?s|ace hardware|hardware)\b/i, groupName: 'Household', subName: 'Improvements' },
  { pattern: /\b(cvs|walgreens|rite aid|pharmacy|drugstore)\b/i, groupName: 'Health', subName: 'Medicine/Drug' },
  { pattern: /\b(doctor|dental|dentist|clinic|medical|hospital|urgent care|optometr)\b/i, groupName: 'Health', subName: 'Doctor/Dentist/Optometrist' },
  { pattern: /\b(payroll|direct dep(osit)?|salary|wages)\b/i, groupName: 'Income', subName: 'Take Home Pay' },
  { pattern: /\binterest (paid|earned|income)\b/i, groupName: 'Income', subName: 'Interest Income' },
  { pattern: /\b(airlines?|air lines|hotel|marriott|hilton|airbnb|expedia|delta air|southwest air|united air)\b/i, groupName: 'Other', subName: 'Vacation/Travel' },
  { pattern: /\b(newspaper|nytimes|new york times|wsj|wall street journal|washington post)\b/i, groupName: 'Entertainment', subName: 'Books/Magazine' },
  { pattern: /\b(petco|petsmart|chewy|veterinar|\bpet\b)\b/i, groupName: 'Daily Living', subName: 'Pets' },
  { pattern: /\b(bookstore|barnes & noble|kindle)\b/i, groupName: 'Entertainment', subName: 'Books/Magazine' },
  { pattern: /\bvenmo\b/i, groupName: 'Other', subName: 'Venmo Transaction' },
];

const REVIEW_THRESHOLD = 0.8;
export { REVIEW_THRESHOLD };

interface CatMeta { groupName: string; subName: string; }
interface LoadedRule {
  matchType: 'merchant' | 'contains' | 'regex';
  pattern: string;
  categoryId: number;
  meta: CatMeta;
  regex?: RegExp; // pre-compiled for regex rules (invalid patterns dropped)
}

export interface Categorizer {
  categorize(input: CategorizeInput): CategorizeResult;
}

export function buildCategorizer(sqlite: Database.Database): Categorizer {
  // --- categories: id ↔ (group, sub) ---
  const cats = sqlite.prepare('SELECT id, group_name, sub_name FROM categories').all() as
    { id: number; group_name: string; sub_name: string }[];
  const catById = new Map<number, CatMeta>();
  const catLookup = new Map<string, number>(); // `${group}:${sub}` → id
  for (const c of cats) {
    catById.set(c.id, { groupName: c.group_name, subName: c.sub_name });
    catLookup.set(`${c.group_name}:${c.sub_name}`, c.id);
  }

  // --- user rules (highest priority first) ---
  const ruleRows = sqlite.prepare(
    'SELECT match_type, pattern, category_id FROM category_rules ORDER BY priority DESC, id ASC'
  ).all() as { match_type: string; pattern: string; category_id: number }[];
  const rules: LoadedRule[] = [];
  for (const r of ruleRows) {
    const meta = catById.get(r.category_id);
    if (!meta) continue; // rule points at a deleted category — skip
    const mt = (r.match_type === 'contains' || r.match_type === 'regex') ? r.match_type : 'merchant';
    let regex: RegExp | undefined;
    if (mt === 'regex') {
      try { regex = new RegExp(r.pattern, 'i'); } catch { continue; } // drop invalid regex
    }
    rules.push({ matchType: mt, pattern: r.pattern, categoryId: r.category_id, meta, regex });
  }

  // --- merchant name → id (existing only; never creates) ---
  const merchantsByName = new Map<string, number>();
  for (const m of sqlite.prepare('SELECT id, name FROM merchants').all() as { id: number; name: string }[]) {
    merchantsByName.set(m.name, m.id);
  }

  // --- per-merchant category distribution (split parents excluded: category_id NULL;
  //     rows still awaiting review excluded so unconfirmed guesses can't vote for
  //     themselves — anti-feedback-amplification) ---
  const merchantHist = new Map<number, Map<number, number>>();
  for (const row of sqlite.prepare(
    'SELECT merchant_id, category_id, COUNT(*) AS cnt FROM transactions WHERE merchant_id IS NOT NULL AND category_id IS NOT NULL AND needs_review = 0 GROUP BY merchant_id, category_id'
  ).all() as { merchant_id: number; category_id: number; cnt: number }[]) {
    let m = merchantHist.get(row.merchant_id);
    if (!m) { m = new Map(); merchantHist.set(row.merchant_id, m); }
    m.set(row.category_id, row.cnt);
  }

  // --- text-history distribution (fallback for merchant-less / legacy rows) ---
  const textHist = new Map<string, Map<number, number>>();
  for (const row of sqlite.prepare(
    'SELECT description, category_id, COUNT(*) AS cnt FROM transactions WHERE category_id IS NOT NULL AND needs_review = 0 GROUP BY description, category_id'
  ).all() as { description: string; category_id: number; cnt: number }[]) {
    const key = row.description.toLowerCase().trim();
    if (!key) continue;
    let m = textHist.get(key);
    if (!m) { m = new Map(); textHist.set(key, m); }
    m.set(row.category_id, (m.get(row.category_id) ?? 0) + row.cnt);
  }

  // pick the dominant (categoryId, share, total) from a distribution map
  function dominant(dist: Map<number, number>): { categoryId: number; share: number; total: number } | null {
    let total = 0, topId = -1, topCount = -1;
    for (const [id, cnt] of dist) {
      total += cnt;
      if (cnt > topCount || (cnt === topCount && id < topId)) { topCount = cnt; topId = id; }
    }
    if (topId < 0 || total === 0) return null;
    return { categoryId: topId, share: topCount / total, total };
  }

  function result(categoryId: number, confidence: number, source: CategorizeResult['source']): CategorizeResult {
    const meta = catById.get(categoryId);
    return { categoryId, groupName: meta?.groupName ?? null, subName: meta?.subName ?? null, confidence, source };
  }

  return {
    categorize(input: CategorizeInput): CategorizeResult {
      const primary = (input.payee || input.description || '').trim();
      const descLower = (input.description || '').toLowerCase().trim();
      const primaryLower = primary.toLowerCase().trim();
      const canonical = normalizeMerchantName(primary);
      const merchantId = canonical ? merchantsByName.get(canonical) ?? null : null;

      // 1. User rules (first match by priority wins) — conf 1.0
      for (const r of rules) {
        let hit: boolean;
        if (r.matchType === 'merchant') {
          hit = merchantId != null && r.pattern === String(merchantId);
        } else if (r.matchType === 'contains') {
          const needle = r.pattern.toLowerCase();
          hit = !!needle && (primaryLower.includes(needle) || descLower.includes(needle));
        } else {
          hit = !!r.regex && (r.regex.test(primary) || r.regex.test(input.description));
        }
        if (hit) return result(r.categoryId, 1.0, 'rule');
      }

      // 2. Per-merchant majority vote — conf = dominance (single-sample capped < threshold)
      if (merchantId != null) {
        const dist = merchantHist.get(merchantId);
        const dom = dist && dominant(dist);
        if (dom) {
          const conf = dom.total >= 2 ? dom.share : Math.min(dom.share, 0.75);
          return result(dom.categoryId, conf, 'merchant-history');
        }
      }

      // 3. Text-history majority vote (legacy / merchant-less) — conf = dominance * 0.9
      const textDist = textHist.get(descLower) || (primaryLower !== descLower ? textHist.get(primaryLower) : undefined);
      const textDom = textDist && dominant(textDist);
      if (textDom) {
        const base = textDom.total >= 2 ? textDom.share : Math.min(textDom.share, 0.75);
        return result(textDom.categoryId, base * 0.9, 'text-history');
      }

      // 4. Heuristic keyword rules (skip unresolved (group,sub)) — conf 0.6
      for (const h of HEURISTIC_RULES) {
        if (h.pattern.test(primary) || h.pattern.test(input.description)) {
          const catId = catLookup.get(`${h.groupName}:${h.subName}`);
          if (catId != null) return result(catId, 0.6, 'heuristic');
          // unresolved in this DB → keep looking for another rule that resolves
        }
      }

      // 5. Nothing
      return { categoryId: null, groupName: null, subName: null, confidence: 0, source: 'none' };
    },
  };
}
