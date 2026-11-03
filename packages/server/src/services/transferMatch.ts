/**
 * Pure pairing rules for "these two rows are the same movement of money".
 * No DB, no I/O — the thresholds and the corroboration signals live here so they
 * can be self-tested against the shapes real banks actually send.
 *
 * The primitive is the ledger sign: positive = money out, negative = money in, on
 * every account classification (see services/signConversion.ts). Everything else
 * — counterparty last-four, direction wording — only raises confidence.
 */

export interface LinkCandidate {
  id: number;
  accountId: number;
  accountLastFour: string | null;
  date: string;   // YYYY-MM-DD
  amount: number; // ledger sign
  text: string;   // bank_description ?? description
}

/** Legs post on different days — 734.11 landed 07-26 and 07-27, 1073.41 on 08-08 and 08-10. */
export const WINDOW_DAYS = 5;
export const AMOUNT_EPS = 0.005;
/** Below this a pair is reported but never linked automatically. */
export const AUTO_LINK_MIN = 0.8;

const OUT_WORDS = /\b(withdrawal|transfer to|payment to|pmt|ach pmt|outgoing|sent)\b/i;
const IN_WORDS = /\b(deposit|transfer from|thank you|incoming|received)\b/i;

export const dayDiff = (a: string, b: string): number =>
  Math.abs((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86400000);

/** A last-four is only a signal when it isn't the account's own number. */
function namesCounterparty(text: string, counterpartyLastFour: string | null, ownLastFour: string | null): boolean {
  if (!counterpartyLastFour || counterpartyLastFour === ownLastFour) return false;
  return new RegExp(`(?<!\\d)${counterpartyLastFour}(?!\\d)`).test(text);
}

/**
 * Confidence that `out` (money leaving) and `inc` (money arriving) are one
 * transfer, or null when they cannot be. Hard rules first — they are what keeps a
 * "$28 LATE FEE" and its "$28 LATE FEE REVERSAL" on the SAME card from pairing.
 *
 * The score is a sum of corroborations and can exceed 1; it is a ranking value,
 * not a probability. Ranking is the whole point — a capped score made a strong
 * pair tie with a weaker one and both were then refused as ambiguous.
 */
export function pairConfidence(out: LinkCandidate, inc: LinkCandidate): number | null {
  if (out.accountId === inc.accountId) return null;          // same account is never a transfer
  if (!(out.amount > 0) || !(inc.amount < 0)) return null;    // must be one out leg and one in leg
  if (Math.abs(Math.abs(out.amount) - Math.abs(inc.amount)) > AMOUNT_EPS) return null;
  if (dayDiff(out.date, inc.date) > WINDOW_DAYS) return null;

  let score = 0.7;
  // Either side naming the other's last four is the strongest corroboration:
  // "Mobile Banking Transfer Withdrawal 8490" on the 2214 account.
  if (namesCounterparty(out.text, inc.accountLastFour, out.accountLastFour)
    || namesCounterparty(inc.text, out.accountLastFour, inc.accountLastFour)) score += 0.2;
  if (OUT_WORDS.test(out.text)) score += 0.05;
  if (IN_WORDS.test(inc.text)) score += 0.05;
  // Same-day posting is weak evidence on its own but breaks ties sensibly.
  if (dayDiff(out.date, inc.date) === 0) score += 0.05;
  // Deliberately NOT clamped: clamping collapsed distinct scores into ties, which
  // the ambiguity rule then refused to link at all. Callers clamp for storage.
  return score;
}

export interface PairResult { out: LinkCandidate; inc: LinkCandidate; confidence: number }

/**
 * Greedy best-first pairing over a candidate pool. Ties are refused rather than
 * guessed: if the runner-up for a leg scores within `ambiguityMargin`, neither is
 * linked, because picking the wrong partner is worse than leaving two rows.
 */
export function pairTransfers(
  candidates: LinkCandidate[],
  opts?: { ambiguityMargin?: number },
): { pairs: PairResult[]; ambiguous: LinkCandidate[] } {
  const margin = opts?.ambiguityMargin ?? 0.0001;
  const outs = candidates.filter((c) => c.amount > 0);
  const ins = candidates.filter((c) => c.amount < 0);

  const scored: PairResult[] = [];
  for (const o of outs) {
    for (const i of ins) {
      const c = pairConfidence(o, i);
      if (c != null) scored.push({ out: o, inc: i, confidence: c });
    }
  }
  // Best first, then by tighter date gap so an equal-confidence same-day pair wins.
  scored.sort((a, b) => b.confidence - a.confidence
    || dayDiff(a.out.date, a.inc.date) - dayDiff(b.out.date, b.inc.date)
    || a.out.id - b.out.id);

  const takenOut = new Set<number>();
  const takenIn = new Set<number>();
  const pairs: PairResult[] = [];
  const ambiguous: LinkCandidate[] = [];

  for (const p of scored) {
    if (takenOut.has(p.out.id) || takenIn.has(p.inc.id)) continue;
    // A rival is any other still-free partner for either leg scoring as well.
    const rival = scored.find((o) =>
      o !== p && !takenOut.has(o.out.id) && !takenIn.has(o.inc.id)
      && (o.out.id === p.out.id || o.inc.id === p.inc.id)
      && o.confidence >= p.confidence - margin
      && !(o.out.id === p.out.id && o.inc.id === p.inc.id));
    if (rival) {
      takenOut.add(p.out.id); takenIn.add(p.inc.id);
      takenOut.add(rival.out.id); takenIn.add(rival.inc.id);
      ambiguous.push(p.out, p.inc);
      continue;
    }
    takenOut.add(p.out.id); takenIn.add(p.inc.id);
    pairs.push(p);
  }
  return { pairs, ambiguous };
}
