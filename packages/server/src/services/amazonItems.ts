/**
 * Pure item math + note formatting for the Amazon pipeline. No DB, no LLM, no
 * I/O — so the allocation and subset rules can be self-tested in isolation and
 * shared by the note writer (amazonNotes.ts) and the enricher (amazonEnrich.ts).
 */

/** Split-leg notes stay tight; the transaction note gets its own, larger budget. */
export const NOTE_MAX = 120;
/** Above this item count, subset search is skipped (2^n) — such orders are rare. */
const SUBSET_MAX_ITEMS = 14;
/** Longer than the split-leg budget: this note exists to be read and checked. */
export const TXN_NOTE_MAX = 400;

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

/**
 * Human-readable item list for a note field. `max` caps the result: split legs
 * keep the tight 120-char budget; the transaction note gets a longer one because
 * it exists to verify the purchase.
 */
export function itemNote(items: { title: string; quantity: number }[], max: number = NOTE_MAX): string {
  const joined = items
    .map((it) => (it.quantity > 1 ? `${it.quantity}× ${it.title}` : it.title))
    .join('; ');
  return joined.length > max ? `${joined.slice(0, max - 1)}…` : joined;
}

/**
 * The transaction-note body for a matched order. `partial` means the charge paid
 * for only part of the order and the subset search couldn't say which part — the
 * full item list is still worth showing, as long as the note says so.
 */
export function composeOrderNote(
  orderNumber: string,
  items: { title: string; quantity: number }[],
  partial: boolean,
): string {
  const head = partial
    ? `Amazon #${orderNumber} (part of a ${items.length}-item order)`
    : `Amazon #${orderNumber}`;
  return `${head}: ${itemNote(items, Math.max(40, TXN_NOTE_MAX - head.length - 2))}`;
}
