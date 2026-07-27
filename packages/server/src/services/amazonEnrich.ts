import type Database from 'better-sqlite3';
import { REVIEW_THRESHOLD } from './categorize.js';
import { llmConfig, llmCategorizeItems } from './llmCategorize.js';
import { validateSplits, saveSplits, type SplitInput } from './splits.js';
import { flagReview, resolveReview, defaultAssigneeForTxn } from './reviews.js';

/**
 * Enrich matched Amazon transactions with item-level LLM categorization.
 * One category across all items → recategorize the transaction. Multiple →
 * auto-split by category (item titles in leg notes, legs inherit the Amazon
 * parent merchant). Never touches transactions the user has already handled.
 */

export interface EnrichResult {
  enriched: number;
  split: number;
  skipped: number;
}

const NOTE_MAX = 120;
/** Above this item count, subset search is skipped (2^n) — such orders are rare. */
const SUBSET_MAX_ITEMS = 14;

export interface EnrichItem { title: string; unitPrice: number | null; quantity: number }

/**
 * Amazon bills PER SHIPMENT, so one charge often covers only part of an order.
 * Find the unique subset of items whose price (grossed up by the order's tax
 * rate) matches the charge. Returns null when nothing fits or when two
 * different subsets fit equally well — better to skip than to mis-split.
 */
export function pickItemSubset(
  items: EnrichItem[],
  chargeAmount: number,
  taxRate: number,
): EnrichItem[] | null {
  if (items.length === 0 || items.length > SUBSET_MAX_ITEMS) return null;
  const prices = items.map((it) => (it.unitPrice ?? 0) * it.quantity);
  if (prices.some((p) => p <= 0)) return null;

  const target = chargeAmount / (1 + taxRate);
  const tolerance = Math.max(0.5, target * 0.02);
  let best: { mask: number; diff: number } | null = null;
  let secondDiff = Infinity;

  for (let mask = 1; mask < (1 << items.length); mask++) {
    let sum = 0;
    for (let i = 0; i < items.length; i++) if (mask & (1 << i)) sum += prices[i];
    const diff = Math.abs(sum - target);
    if (best == null || diff < best.diff) {
      secondDiff = best?.diff ?? Infinity;
      best = { mask, diff };
    } else if (diff < secondDiff) {
      secondDiff = diff;
    }
  }
  if (!best || best.diff > tolerance) return null;
  if (secondDiff <= tolerance) return null; // two subsets fit — ambiguous
  return items.filter((_, i) => best!.mask & (1 << i));
}

/** Cent-safe proportional allocation of the txn total across category buckets. */
export function allocateAmounts(total: number, bases: number[]): number[] {
  const baseSum = bases.reduce((s, b) => s + b, 0);
  if (baseSum <= 0) return bases.map(() => 0);
  const raw = bases.map((b) => Math.round((total * b / baseSum) * 100) / 100);
  // Rounding residue → largest bucket, so legs always sum to the exact total.
  const drift = Math.round((total - raw.reduce((s, r) => s + r, 0)) * 100) / 100;
  if (drift !== 0) {
    const largest = bases.indexOf(Math.max(...bases));
    raw[largest] = Math.round((raw[largest] + drift) * 100) / 100;
  }
  return raw;
}

function itemNote(items: { title: string; quantity: number }[]): string {
  const joined = items
    .map((it) => (it.quantity > 1 ? `${it.quantity}× ${it.title}` : it.title))
    .join('; ');
  return joined.length > NOTE_MAX ? `${joined.slice(0, NOTE_MAX - 1)}…` : joined;
}

export async function enrichMatchedTransactions(sqlite: Database.Database): Promise<EnrichResult> {
  const result: EnrichResult = { enriched: 0, split: 0, skipped: 0 };
  if (!llmConfig(sqlite)) return result;

  const pending = sqlite.prepare(`
    SELECT am.transaction_id, am.order_number,
           t.amount, t.category_id, t.categorize_confidence, t.merchant_id
    FROM amazon_matches am
    JOIN transactions t ON t.id = am.transaction_id
    WHERE am.enriched_at IS NULL
    ORDER BY am.created_at
    LIMIT 50
  `).all() as {
    transaction_id: number; order_number: string;
    amount: number; category_id: number | null; categorize_confidence: number | null; merchant_id: number | null;
  }[];

  const markEnriched = sqlite.prepare(
    "UPDATE amazon_matches SET enriched_at = datetime('now') WHERE transaction_id = ?"
  );

  for (const match of pending) {
    // Skip guards: the user already made a call on this txn — don't overwrite.
    const userTouched = sqlite.prepare(
      'SELECT 1 FROM category_feedback WHERE transaction_id = ? LIMIT 1'
    ).get(match.transaction_id);
    // Manual = categorized with NO confidence recorded. (categorize_source is
    // null on all pre-source-column rows, so it can't distinguish manual.)
    const manualCategory = match.category_id != null && match.categorize_confidence == null;
    const hasSplits = sqlite.prepare(
      'SELECT 1 FROM transaction_splits WHERE transaction_id = ? LIMIT 1'
    ).get(match.transaction_id);
    if (userTouched || manualCategory || hasSplits) {
      markEnriched.run(match.transaction_id);
      result.skipped++;
      continue;
    }

    const rawItems = sqlite.prepare(
      'SELECT title, unit_price, quantity FROM amazon_order_items WHERE order_number = ?'
    ).all(match.order_number) as { title: string; unit_price: number | null; quantity: number | null }[];
    if (rawItems.length === 0) {
      markEnriched.run(match.transaction_id);
      result.skipped++;
      continue;
    }
    const allItems: EnrichItem[] = rawItems.map((it) => ({
      title: it.title, unitPrice: it.unit_price, quantity: it.quantity ?? 1,
    }));

    // Does this charge cover the whole order, or just one shipment of it?
    const itemsTotal = allItems.reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0);
    let items = allItems;
    if (itemsTotal > 0 && match.amount < itemsTotal * 0.95) {
      const order = sqlite.prepare(
        'SELECT subtotal, tax FROM amazon_orders WHERE order_number = ?'
      ).get(match.order_number) as { subtotal: number | null; tax: number | null } | undefined;
      const taxRate = order?.subtotal && order.tax ? order.tax / order.subtotal : 0.08;
      const subset = pickItemSubset(allItems, match.amount, taxRate);
      if (!subset) {
        // Can't tell which items this shipment paid for — leave the txn alone
        // rather than split it wrongly. The order link is still recorded.
        markEnriched.run(match.transaction_id);
        result.skipped++;
        continue;
      }
      items = subset;
    }

    const llmItems = items.map((it, i) => ({
      key: i, title: it.title, unitPrice: it.unitPrice, quantity: it.quantity,
    }));
    const verdicts = await llmCategorizeItems(sqlite, {
      orderNumber: match.order_number, merchantName: 'Amazon', items: llmItems,
    });

    // Every item needs a verdict — a partial answer would misallocate amounts.
    if (verdicts.size < llmItems.length || [...verdicts.values()].some((v) => v.categoryId == null)) {
      // Leave enriched_at NULL: retried next run (model may be down today).
      result.skipped++;
      continue;
    }

    // Group items by category.
    const buckets = new Map<number, { items: typeof llmItems; base: number; minConf: number }>();
    for (const it of llmItems) {
      const v = verdicts.get(it.key)!;
      const catId = v.categoryId!;
      let b = buckets.get(catId);
      if (!b) { b = { items: [], base: 0, minConf: 1 }; buckets.set(catId, b); }
      b.items.push(it);
      b.base += (it.unitPrice ?? 0) * it.quantity;
      b.minConf = Math.min(b.minConf, v.confidence);
    }
    const minConf = Math.min(...[...buckets.values()].map((b) => b.minConf));
    // A user-flagged (manual) review must survive enrichment — only auto flags
    // are ours to resolve.
    const openManual = !!sqlite.prepare(
      "SELECT 1 FROM transaction_reviews WHERE transaction_id = ? AND status = 'open' AND reason = 'manual'"
    ).get(match.transaction_id);
    const needsReview = minConf < REVIEW_THRESHOLD || openManual;
    const resolveIfConfident = () => {
      if (!needsReview) resolveReview(sqlite, { txnId: match.transaction_id, resolvedBy: null });
    };
    const flagIfNeeded = (note?: string) => {
      if (needsReview && !openManual) {
        flagReview(sqlite, {
          txnId: match.transaction_id,
          reason: 'auto_low_confidence',
          assigneeId: defaultAssigneeForTxn(sqlite, match.transaction_id),
          ...(note ? { note } : {}),
        });
      }
    };

    if (buckets.size === 1) {
      const catId = [...buckets.keys()][0];
      sqlite.transaction(() => {
        sqlite.prepare(`
          UPDATE transactions
          SET category_id = ?, categorize_confidence = ?, categorize_source = 'llm', needs_review = ?
          WHERE id = ?
        `).run(catId, minConf, needsReview ? 1 : 0, match.transaction_id);
        flagIfNeeded();
        resolveIfConfident();
        markEnriched.run(match.transaction_id);
      })();
      result.enriched++;
      continue;
    }

    // Multi-category → split legs. Bases from item prices; tax/shipping/discount
    // remainder is inside allocateAmounts' proportional scale-to-total.
    const catIds = [...buckets.keys()];
    const bases = catIds.map((id) => buckets.get(id)!.base);
    if (bases.every((b) => b <= 0)) {
      markEnriched.run(match.transaction_id);
      result.skipped++;
      continue;
    }
    const amounts = allocateAmounts(match.amount, bases);
    const legs: SplitInput[] = catIds.map((catId, i) => ({
      categoryId: catId,
      amount: amounts[i],
      note: itemNote(buckets.get(catId)!.items),
    })).filter((l) => l.amount !== 0);

    if (legs.length < 2 || validateSplits(legs, match.amount) != null) {
      // Allocation degenerated (e.g. a zero-priced bucket) — fall back to the
      // dominant category with a review flag rather than writing bad legs.
      const domCat = catIds[bases.indexOf(Math.max(...bases))];
      sqlite.transaction(() => {
        sqlite.prepare(`
          UPDATE transactions
          SET category_id = ?, categorize_confidence = ?, categorize_source = 'llm', needs_review = 1
          WHERE id = ?
        `).run(domCat, Math.min(minConf, 0.6), match.transaction_id);
        if (!openManual) {
          flagReview(sqlite, {
            txnId: match.transaction_id,
            reason: 'auto_low_confidence',
            assigneeId: defaultAssigneeForTxn(sqlite, match.transaction_id),
            note: 'Amazon: could not allocate item prices into splits — check manually',
          });
        }
        markEnriched.run(match.transaction_id);
      })();
      result.enriched++;
      continue;
    }

    sqlite.transaction(() => {
      sqlite.prepare(`
        UPDATE transactions
        SET category_id = NULL, categorize_confidence = NULL, categorize_source = 'llm', needs_review = ?
        WHERE id = ?
      `).run(needsReview ? 1 : 0, match.transaction_id);
      saveSplits(match.transaction_id, legs, match.merchant_id);
      flagIfNeeded();
      resolveIfConfident();
      markEnriched.run(match.transaction_id);
    })();
    result.enriched++;
    result.split++;
  }

  return result;
}
