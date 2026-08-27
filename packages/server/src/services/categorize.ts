import type Database from 'better-sqlite3';
import { normalizeMerchantName } from './merchantNormalize.js';
import { detectTransferSignal, type AccountTokens } from './transferSignal.js';

/**
 * Unified auto-categorization resolver. Replaces the two divergent, buggy copies
 * that lived inline in routes/simplefin.ts and routes/import.ts.
 *
 * Precedence (highest → lowest), with a confidence in [0,1]:
 *   1. User category_rules (merchant | contains | regex)          conf 1.0
 *   2. Strong transfer / card-payment signal (transferSignal.ts)  conf 0.9
 *   3. Per-merchant majority vote from history (dominance-scaled) conf = share*
 *   4. Text-history majority vote (legacy / merchant-less rows)   conf = share*0.9
 *   5. Bundled heuristic keyword rules, SKIPPING any (group,sub)
 *      that doesn't resolve to a real category in this DB         conf 0.6
 *   6. Weak transfer / card-payment signal                        conf 0.6
 *   7. Nothing                                                    conf 0.0
 *
 * The transfer signal sits on BOTH sides of history on purpose. Structural bank
 * phrasing ("online transfer to CHK ...3732") is better evidence than anything
 * history holds, and at 0.9 it clears REVIEW_THRESHOLD so a correct answer stops
 * queueing for confirmation. A bare "payment" is not, so it waits until every
 * learned source has passed. See services/transferSignal.ts.
 *
 * (*) single-sample history is capped below the review threshold so a one-off
 * doesn't masquerade as certain. `buildCategorizer` loads everything ONCE; the
 * returned `categorize` closure is O(rules) per item with O(1) history lookups.
 */

export interface CategorizeInput {
  description: string;
  payee?: string | null;
  /** Ledger sign: positive = money out. Used by the transfer signal for direction. */
  amount: number;
  /** Raw statement text where the source kept it — carries most of the transfer signal. */
  bankDescription?: string | null;
  /** Destination account context, when the caller knows it. */
  accountClassification?: string | null;
  accountType?: string | null;
}

export interface CategorizeResult {
  categoryId: number | null;
  groupName: string | null;
  subName: string | null;
  confidence: number;
  source: 'rule' | 'transfer-signal' | 'merchant-history' | 'text-history' | 'heuristic' | 'llm' | 'none';
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

/** Above REVIEW_THRESHOLD: a structural transfer signal is acted on unattended. */
const STRONG_TRANSFER_CONFIDENCE = 0.9;
/** Below it, and equal to the heuristic tier: a weak signal always gets reviewed. */
const WEAK_TRANSFER_CONFIDENCE = 0.6;

/**
 * When merchant history is this consistent, it outranks a strong TRANSFER
 * signal. Bank phrasing can only say that money moved in a transfer's shape —
 * it cannot say whose account it landed in. Rent wired to a landlord every
 * month reads identically to a move between the user's own accounts, and the
 * only thing that knows the difference is the user having filed that merchant
 * the same way before.
 *
 * Card payments are exempt: money arriving on a credit card under a payment
 * word has no competing reading, and letting history overrule it is precisely
 * how a card payment once got filed as Dining/Eating Out.
 */
const HISTORY_OVERRIDE_MIN_SAMPLES = 2;
const HISTORY_OVERRIDE_MIN_SHARE = 0.8;

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

  // --- transfer signal targets: resolved by (type, sub_name) so a group rename
  //     doesn't silently disable the stage. Missing → the stage is skipped
  //     entirely, the same skip-unresolved discipline the heuristics use. ---
  const transferCats = sqlite.prepare(
    "SELECT id, sub_name FROM categories WHERE type = 'transfer'"
  ).all() as { id: number; sub_name: string }[];
  const transferCatId = transferCats.find((c) => c.sub_name === 'Transfer')?.id ?? null;
  // A ledger without a dedicated card-payment leaf files them under Transfer.
  const cardPaymentCatId = transferCats.find((c) => c.sub_name === 'Credit Card Payment')?.id ?? transferCatId;

  // --- the user's own account numbers, for corroborating a weak signal ---
  const acctRows = sqlite.prepare(
    'SELECT name, last_four, classification, type FROM accounts WHERE is_active = 1'
  ).all() as { name: string | null; last_four: string | null; classification: string | null; type: string | null }[];
  const accountTokens: AccountTokens = { all: [], cards: [], names: [] };
  for (const a of acctRows) {
    const name = (a.name ?? '').trim().toLowerCase();
    if (name && !accountTokens.names.includes(name)) accountTokens.names.push(name);
    // Four digits exactly: anything else (a plan number like '3184C') can't be
    // matched safely against free-form statement text.
    if (!a.last_four || !/^\d{4}$/.test(a.last_four)) continue;
    accountTokens.all.push(a.last_four);
    if (a.classification === 'liability' && a.type === 'credit') accountTokens.cards.push(a.last_four);
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

      const signal = transferCatId == null ? null : detectTransferSignal({
        description: primary,
        bankDescription: input.bankDescription ?? (input.description !== primary ? input.description : null),
        amount: input.amount,
        accountClassification: input.accountClassification,
        accountType: input.accountType,
      }, accountTokens);
      const signalCatId = signal?.kind === 'card-payment' ? cardPaymentCatId : transferCatId;

      const merchantDist = merchantId != null ? merchantHist.get(merchantId) : undefined;
      const merchantDom = merchantDist ? dominant(merchantDist) : null;

      // 2. Strong transfer / card-payment signal — conf 0.9, above the review bar
      if (signal?.strength === 'strong' && signalCatId != null) {
        const settledElsewhere = signal.kind === 'transfer'
          && merchantDom != null
          && merchantDom.categoryId !== signalCatId
          && merchantDom.total >= HISTORY_OVERRIDE_MIN_SAMPLES
          && merchantDom.share >= HISTORY_OVERRIDE_MIN_SHARE;
        if (!settledElsewhere) return result(signalCatId, STRONG_TRANSFER_CONFIDENCE, 'transfer-signal');
      }

      // 3. Per-merchant majority vote — conf = dominance (single-sample capped < threshold)
      if (merchantDom) {
        const conf = merchantDom.total >= 2 ? merchantDom.share : Math.min(merchantDom.share, 0.75);
        return result(merchantDom.categoryId, conf, 'merchant-history');
      }

      // 4. Text-history majority vote (legacy / merchant-less) — conf = dominance * 0.9
      const textDist = textHist.get(descLower) || (primaryLower !== descLower ? textHist.get(primaryLower) : undefined);
      const textDom = textDist && dominant(textDist);
      if (textDom) {
        const base = textDom.total >= 2 ? textDom.share : Math.min(textDom.share, 0.75);
        return result(textDom.categoryId, base * 0.9, 'text-history');
      }

      // 5. Heuristic keyword rules (skip unresolved (group,sub)) — conf 0.6
      for (const h of HEURISTIC_RULES) {
        if (h.pattern.test(primary) || h.pattern.test(input.description)) {
          const catId = catLookup.get(`${h.groupName}:${h.subName}`);
          if (catId != null) return result(catId, 0.6, 'heuristic');
          // unresolved in this DB → keep looking for another rule that resolves
        }
      }

      // 6. Weak transfer / card-payment signal — conf 0.6, always reviewed
      if (signal?.strength === 'weak' && signalCatId != null) {
        return result(signalCatId, WEAK_TRANSFER_CONFIDENCE, 'transfer-signal');
      }

      // 7. Nothing
      return { categoryId: null, groupName: null, subName: null, confidence: 0, source: 'none' };
    },
  };
}
