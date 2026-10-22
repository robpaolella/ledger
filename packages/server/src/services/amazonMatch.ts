import type Database from 'better-sqlite3';
import { flagReview, defaultAssigneeForTxn } from './reviews.js';

/**
 * Match ledger transactions (merchant = Amazon / Amazon Prime) to Amazon
 * charges/orders by amount + date window.
 *
 * Primary key = amazon_charges rows (the Amazon Transactions page): Amazon
 * bills PER SHIPMENT, so charge amounts — not order totals — are what appear
 * on the card statement. Fallback for orders with no charge rows: the order's
 * grand total.
 *
 * Ambiguity (several same-amount candidates on either side of a window) →
 * match nothing, flag the txns for manual review once. Idempotent: matched
 * txns are keyed by PK; consumed charges tracked per run and via prior matches.
 */

const AMOUNT_EPS = 0.005;
const CHARGE_WINDOW_BEFORE = 3; // txn may post up to 3 days before charge_date…
const CHARGE_WINDOW_AFTER = 4;  // …or up to 4 days after
const ORDER_WINDOW_AFTER = 7;   // order fallback: [order_date, +7d]

export interface MatchResult {
  matched: number;
  ambiguous: number;
  flagged: number;
}

interface TxnRow { id: number; date: string; amount: number }
interface ChargeRow { id: number; charge_date: string; amount: number; order_number: string | null }
interface OrderRow { order_number: string; order_date: string; total: number }

const dayDiff = (a: string, b: string): number =>
  Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

const inWindow = (txnDate: string, anchorDate: string, before: number, after: number): boolean => {
  const diff = (new Date(txnDate).getTime() - new Date(anchorDate).getTime()) / 86_400_000;
  return diff >= -before && diff <= after;
};

export function matchAmazonCharges(sqlite: Database.Database): MatchResult {
  const result: MatchResult = { matched: 0, ambiguous: 0, flagged: 0 };

  // Candidate ledger txns: Amazon merchants, positive (money out), unmatched.
  const txns = sqlite.prepare(`
    SELECT t.id, t.date, t.amount
    FROM transactions t
    JOIN merchants m ON m.id = t.merchant_id
    WHERE m.name IN ('Amazon', 'Amazon Prime')
      AND t.amount > 0
      AND t.id NOT IN (SELECT transaction_id FROM amazon_matches)
    ORDER BY t.date DESC
  `).all() as TxnRow[];
  if (txns.length === 0) return result;

  const charges = sqlite.prepare(`
    SELECT c.id, c.charge_date, c.amount, c.order_number
    FROM amazon_charges c
    WHERE c.is_refund = 0
      AND c.id NOT IN (SELECT charge_id FROM amazon_matches WHERE charge_id IS NOT NULL)
  `).all() as ChargeRow[];

  // Orders with no charge rows at all (older scrapes / gaps) — total fallback.
  const bareOrders = sqlite.prepare(`
    SELECT o.order_number, o.order_date, o.total
    FROM amazon_orders o
    WHERE o.total IS NOT NULL
      AND o.order_number NOT IN (SELECT order_number FROM amazon_charges WHERE order_number IS NOT NULL)
      AND o.order_number NOT IN (SELECT order_number FROM amazon_matches)
  `).all() as OrderRow[];

  const insertMatch = sqlite.prepare(`
    INSERT INTO amazon_matches (transaction_id, order_number, charge_id, amount, matched_by, confidence)
    VALUES (?, ?, ?, ?, 'auto', ?)
  `);

  const consumedCharges = new Set<number>();
  const consumedOrders = new Set<string>();
  const matchedTxns = new Set<number>();
  const ambiguousTxns = new Set<number>();

  // Pass 1: charges (per-shipment amounts). Greedy by date distance.
  for (const txn of txns) {
    const cands = charges.filter((c) =>
      !consumedCharges.has(c.id)
      && c.order_number != null
      && Math.abs(c.amount - txn.amount) <= AMOUNT_EPS
      && inWindow(txn.date, c.charge_date, CHARGE_WINDOW_BEFORE, CHARGE_WINDOW_AFTER));
    if (cands.length === 0) continue;

    // Ambiguity check both directions: several charges fit this txn, or the
    // best charge also fits another unmatched txn at the same amount.
    if (cands.length > 1) {
      ambiguousTxns.add(txn.id);
      continue;
    }
    const charge = cands[0];
    const rivalTxns = txns.filter((t) =>
      t.id !== txn.id && !matchedTxns.has(t.id)
      && Math.abs(t.amount - charge.amount) <= AMOUNT_EPS
      && inWindow(t.date, charge.charge_date, CHARGE_WINDOW_BEFORE, CHARGE_WINDOW_AFTER));
    if (rivalTxns.length > 0) {
      ambiguousTxns.add(txn.id);
      for (const r of rivalTxns) ambiguousTxns.add(r.id);
      continue;
    }

    insertMatch.run(txn.id, charge.order_number, charge.id, txn.amount, 0.95);
    consumedCharges.add(charge.id);
    matchedTxns.add(txn.id);
    result.matched++;
  }

  // Pass 2: order-total fallback for txns still unmatched.
  for (const txn of txns) {
    if (matchedTxns.has(txn.id) || ambiguousTxns.has(txn.id)) continue;
    const cands = bareOrders.filter((o) =>
      !consumedOrders.has(o.order_number)
      && Math.abs(o.total - txn.amount) <= AMOUNT_EPS
      && inWindow(txn.date, o.order_date, 0, ORDER_WINDOW_AFTER));
    if (cands.length === 0) continue;
    if (cands.length > 1) { ambiguousTxns.add(txn.id); continue; }
    const order = cands[0];
    const rivalTxns = txns.filter((t) =>
      t.id !== txn.id && !matchedTxns.has(t.id)
      && Math.abs(t.amount - order.total) <= AMOUNT_EPS
      && inWindow(t.date, order.order_date, 0, ORDER_WINDOW_AFTER));
    if (rivalTxns.length > 0) {
      ambiguousTxns.add(txn.id);
      for (const r of rivalTxns) ambiguousTxns.add(r.id);
      continue;
    }
    // Prefer the closest-dated order if ever needed; single candidate here.
    void dayDiff;
    insertMatch.run(txn.id, order.order_number, null, txn.amount, 0.8);
    consumedOrders.add(order.order_number);
    matchedTxns.add(txn.id);
    result.matched++;
  }

  // Flag ambiguous txns once (skip any with an open review already).
  result.ambiguous = ambiguousTxns.size;
  for (const txnId of ambiguousTxns) {
    const open = sqlite.prepare(
      "SELECT 1 FROM transaction_reviews WHERE transaction_id = ? AND status = 'open'"
    ).get(txnId);
    if (open) continue;
    flagReview(sqlite, {
      txnId,
      reason: 'manual',
      assigneeId: defaultAssigneeForTxn(sqlite, txnId),
      note: 'Amazon: multiple orders match this amount — link manually',
    });
    result.flagged++;
  }

  return result;
}
