import type Database from 'better-sqlite3';
import { composeOrderNote, pickItemSubset, type EnrichItem } from './amazonItems.js';

/**
 * Write the purchased item titles of a matched Amazon order into the ledger
 * transaction's note, so a charge can be verified inside Ledger without opening
 * amazon.com.
 *
 * Deliberately independent of the LLM enrichment stage: item titles are plain
 * scraped data, so they land even when no local model is configured. Runs before
 * enrichment in the pipeline.
 *
 * Two rules keep it out of the user's way:
 *   1. the note is only filled when it holds nothing of the user's — blank, or a
 *      bare Amazon statement code an earlier import parked there (see
 *      isStatementCode). Anything typed wins;
 *   2. every processed match is stamped `note_written_at`, so a note the user
 *      later clears is never silently refilled on the next run.
 */

export interface NotesResult {
  written: number;
  skipped: number;
}

/**
 * True when a note is just the raw Amazon statement string an earlier import
 * copied in — machine text with no information the item list doesn't carry
 * better. A single token: the brand, then the payment-processor reference.
 * Anything with prose in it (spaces beyond the brand, other words) is the user's
 * and is never touched.
 */
export function isStatementCode(note: string): boolean {
  // Brand, optional processor qualifiers, then the reference itself — which must
  // mix letters and digits, so ordinary words ("Amazon return pending") can't
  // pass for one.
  return /^(?:amazon(?:\.com)?|amzn)(?:\s*[.*]?\s*(?:mktpl?|marketplace|digital|prime|retail|payments?|services?|us|ca|uk))*\s*\*?\s*(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{6,}$/i
    .test(note.trim());
}

export function writeAmazonItemNotes(sqlite: Database.Database): NotesResult {
  const result: NotesResult = { written: 0, skipped: 0 };

  const pending = sqlite.prepare(`
    SELECT am.transaction_id, am.order_number, am.amount,
           t.note
    FROM amazon_matches am
    JOIN transactions t ON t.id = am.transaction_id
    WHERE am.note_written_at IS NULL
    ORDER BY am.created_at
    LIMIT 200
  `).all() as {
    transaction_id: number; order_number: string; amount: number; note: string | null;
  }[];
  if (pending.length === 0) return result;

  const markWritten = sqlite.prepare(
    "UPDATE amazon_matches SET note_written_at = datetime('now') WHERE transaction_id = ?"
  );
  const setNote = sqlite.prepare('UPDATE transactions SET note = ? WHERE id = ?');

  for (const match of pending) {
    // The user already said something here — record that we looked, move on.
    if (match.note != null && match.note.trim() !== '' && !isStatementCode(match.note)) {
      markWritten.run(match.transaction_id);
      result.skipped++;
      continue;
    }

    const rawItems = sqlite.prepare(
      'SELECT title, unit_price, quantity FROM amazon_order_items WHERE order_number = ?'
    ).all(match.order_number) as { title: string; unit_price: number | null; quantity: number | null }[];
    if (rawItems.length === 0) {
      markWritten.run(match.transaction_id);
      result.skipped++;
      continue;
    }
    const allItems: EnrichItem[] = rawItems.map((it) => ({
      title: it.title, unitPrice: it.unit_price, quantity: it.quantity ?? 1,
    }));

    // Amazon bills per shipment, so a charge often covers part of an order. Same
    // subset logic the enrichment stage uses; when it can't tell which items this
    // charge paid for, list the whole order and say so rather than guess wrong.
    const itemsTotal = allItems.reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0);
    let items = allItems;
    let partial = false;
    if (itemsTotal > 0 && match.amount < itemsTotal * 0.95) {
      const order = sqlite.prepare(
        'SELECT subtotal, tax FROM amazon_orders WHERE order_number = ?'
      ).get(match.order_number) as { subtotal: number | null; tax: number | null } | undefined;
      const taxRate = order?.subtotal && order.tax ? order.tax / order.subtotal : 0.08;
      const subset = pickItemSubset(allItems, match.amount, taxRate);
      if (subset) items = subset;
      else partial = true;
    }

    const note = composeOrderNote(match.order_number, items, partial);
    sqlite.transaction(() => {
      setNote.run(note, match.transaction_id);
      markWritten.run(match.transaction_id);
    })();
    result.written++;
  }

  return result;
}
