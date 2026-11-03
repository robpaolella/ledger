import type Database from 'better-sqlite3';
import { detectTransfer } from './transferDetector.js';
import { pairTransfers, AUTO_LINK_MIN, type LinkCandidate } from './transferMatch.js';

/**
 * Find the two legs of one movement of money between the user's own accounts and
 * record them in `transfer_links`, so the pair can be shown as a single
 * from → to transaction.
 *
 * Candidates are deliberately narrow: a row must already be categorized as a
 * transfer, or read like one (services/transferDetector.ts). Comparing every
 * transaction against every other would pair two unrelated same-amount charges
 * that happen to fall in the same week.
 *
 * Rows the user has pulled apart are kept as `status='rejected'` and never
 * re-linked to that same partner.
 */
export interface LinkResult { scanned: number; linked: number; ambiguous: number }

interface Row {
  id: number; account_id: number; last_four: string | null;
  date: string; amount: number; description: string; bank_description: string | null;
  is_transfer_category: number;
}

export function linkTransfers(
  sqlite: Database.Database,
  opts?: { since?: string; dryRun?: boolean },
): LinkResult & { pairs: { fromId: number; toId: number; amount: number; confidence: number }[] } {
  const since = opts?.since ?? '1900-01-01';
  const rows = sqlite.prepare(`
    SELECT t.id, t.account_id, a.last_four, t.date, t.amount, t.description, t.bank_description,
           CASE WHEN c.type = 'transfer' THEN 1 ELSE 0 END AS is_transfer_category
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.date >= ?
      -- a split parent is spread across categories; it is not one movement of money
      AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id)
      AND NOT EXISTS (
        SELECT 1 FROM transfer_links tl
        WHERE tl.status = 'linked' AND (tl.from_transaction_id = t.id OR tl.to_transaction_id = t.id))
    ORDER BY t.date, t.id
  `).all(since) as Row[];

  const candidates: LinkCandidate[] = rows
    .filter((r) => r.is_transfer_category === 1
      || detectTransfer(r.description, r.bank_description ?? r.description, r.amount))
    .map((r) => ({
      id: r.id,
      accountId: r.account_id,
      accountLastFour: r.last_four,
      date: r.date,
      amount: r.amount,
      text: r.bank_description ?? r.description,
    }));

  // Bucket by absolute amount: only equal-magnitude rows can ever pair, and this
  // keeps the comparison out of O(n²) on a long history.
  const buckets = new Map<string, LinkCandidate[]>();
  for (const c of candidates) {
    const key = Math.abs(c.amount).toFixed(2);
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(c);
  }

  // A pair the user has already pulled apart must not come back.
  const rejected = new Set(
    (sqlite.prepare("SELECT from_transaction_id f, to_transaction_id t FROM transfer_links WHERE status = 'rejected'")
      .all() as { f: number; t: number }[]).map((r) => `${r.f}:${r.t}`),
  );

  const result: LinkResult & { pairs: { fromId: number; toId: number; amount: number; confidence: number }[] } =
    { scanned: candidates.length, linked: 0, ambiguous: 0, pairs: [] };

  const insert = sqlite.prepare(`
    INSERT INTO transfer_links (from_transaction_id, to_transaction_id, amount, confidence, linked_by, status)
    VALUES (?, ?, ?, ?, 'auto', 'linked')
    ON CONFLICT(from_transaction_id, to_transaction_id) DO UPDATE SET
      status = 'linked', confidence = excluded.confidence, unlinked_at = NULL
  `);

  for (const pool of buckets.values()) {
    if (pool.length < 2) continue;
    const { pairs, ambiguous } = pairTransfers(pool);
    result.ambiguous += ambiguous.length;
    for (const p of pairs) {
      if (p.confidence < AUTO_LINK_MIN) continue;          // reported, not linked
      if (rejected.has(`${p.out.id}:${p.inc.id}`)) continue;
      result.pairs.push({ fromId: p.out.id, toId: p.inc.id, amount: Math.abs(p.out.amount), confidence: Math.min(p.confidence, 0.99) });
      result.linked++;
    }
  }

  if (!opts?.dryRun && result.pairs.length > 0) {
    sqlite.transaction(() => {
      for (const p of result.pairs) insert.run(p.fromId, p.toId, p.amount, p.confidence);
    })();
  }
  return result;
}
