/**
 * Transfer / credit-card-payment recognition, as a pure function.
 *
 * The old `transferDetector.ts` produced a single boolean that only ever drove a
 * badge in the import preview — it never reached `categorize.ts`, so a transfer
 * could only be categorized once merchant- or text-history had learned it. This
 * module is the signal the resolver actually consumes.
 *
 * Two strengths, because the evidence really does come in two grades:
 *
 *   strong — structural, directional bank phrasing ("online transfer to CHK
 *            ...3732", "From: Savings *6863 To: Savings *8897", "Ext Trnsfr"),
 *            or money arriving on a credit card under a payment word. Slots in
 *            ABOVE merchant/text history and above the review threshold, so it
 *            overrides a bad learned guess and stops asking to be confirmed.
 *   weak   — a bare bank-operation word ("payment", "pmt", "autopay"). Slots in
 *            BELOW history and below the review threshold: it only speaks when
 *            nothing else knew, and it always lands in the review queue.
 *
 * The strong/weak split is what keeps the outbound leg of a card payment honest.
 * "Web Authorized Pmt Tjx Rew Mstrcrd" reads exactly like "Web Authorized Pmt
 * Chase Credit Crd", but the TJX card is not tracked in this ledger, so that
 * payment IS the spend and the user files it as an expense. Text alone cannot
 * tell the two apart — only whether the ledger holds the card being paid can.
 * So outbound is strong only when the text names a tracked card's last four,
 * and weak otherwise, where learned history outranks it.
 */

export type TransferKind = 'transfer' | 'card-payment';
export type SignalStrength = 'strong' | 'weak' | 'none';

export interface TransferSignal {
  kind: TransferKind;
  strength: SignalStrength;
  /** Which pattern fired — carried for logging and selftests, not for logic. */
  reason: string;
}

export interface TransferSignalInput {
  /** Cleaned description / payee. */
  description: string;
  /** Raw statement text, when the source kept it — most signal lives here. */
  bankDescription?: string | null;
  /** Ledger sign: positive = money out, negative = money in. */
  amount: number;
  accountClassification?: string | null;
  /** `accounts.type`: 'checking' | 'savings' | 'credit' | … */
  accountType?: string | null;
}

/** Identifiers for the user's own accounts. */
export interface AccountTokens {
  /** Every active account's 4-digit last four. */
  all: string[];
  /** Just the credit-card accounts' — the only ones that prove a payment is internal. */
  cards: string[];
  /** Active account names, lowercased and trimmed. Matched whole, never as a substring. */
  names: string[];
}

const NONE: TransferSignal = { kind: 'transfer', strength: 'none', reason: '' };

/**
 * Structural transfer phrasing. Deliberately directional or formatted — a bare
 * "transfer" is only a weak signal, because merchants use the word too.
 */
const STRONG_TRANSFER: [RegExp, string][] = [
  [/\bonline\s+(?:realtime\s+)?transfer\b/i, 'online-transfer'],
  [/\btransfer\s+(?:to|from|in|out)\b/i, 'transfer-direction'],
  [/\b(?:to|from)\s+(?:checking|savings|chk|sav|brokerage)\b/i, 'to-from-account-kind'],
  [/\b(?:ext|external|internal|intra|wire|book)\s*(?:trnsfr|transfer|xfer)\b/i, 'external-transfer'],
  [/\b(?:trnsfr|tfr|xfer)\b/i, 'abbreviated-transfer'],
  [/\bfrom:\s*\S+.*\bto:\s*\S+/i, 'from-to-pair'],
  [/\bmobile banking transfer\b/i, 'mobile-banking-transfer'],
  [/\btransfer\s+(?:withdrawal|deposit)\b/i, 'transfer-leg'],
  [/\b(?:incoming|outgoing)\s+payment/i, 'directional-payment'],
  [/\bach\s+contrib\b/i, 'ach-contribution'],
];

/** Bank-operation words. True of transfers, but also of plenty else. */
const WEAK_TRANSFER: [RegExp, string][] = [
  [/\bpayment\b/i, 'payment'],
  [/\bpmt\b/i, 'pmt'],
  [/\bthank\s*you\b/i, 'thank-you'],
  [/\bautopay\b/i, 'autopay'],
  [/\btransfer\b/i, 'bare-transfer'],
  [/\brtp\b/i, 'rtp'],
];
// "withdrawal" is deliberately absent: every one of the 16 rows carrying that
// word in this ledger is an ordinary expense ("Customer Withdrawal", "ATM
// Withdrawal"). The transfer sense of it is already covered by the strong
// `transfer withdrawal` pattern.

/** Payment wording, for the credit-card branch specifically. */
const PAYMENT_WORD = /\b(?:payment|pmt|thank\s*you|autopay)\b/i;

/** Text that names a card as the thing being paid. */
// Bare "visa" is deliberately absent — a travel visa fee is not a card payment.
// The brands listed only appear here spelled out as the thing being paid.
const CARD_TOKEN = /\b(?:credit\s+c(?:ar)?d|card\s+ending|ending\s+in\s+\d{4}|mastercard|mstrcrd|amex|american\s+express|discover\s+card)\b/i;

/**
 * Fees, reversals and other line items a card issuer posts against the balance.
 * These belong in Balance Adjustments, which text-history already gets right —
 * so this module declines them outright rather than sweeping them into Transfer.
 */
const BALANCE_ADJUSTMENT = /\b(?:reversal|reversed|adjustment|late\s+fee|interest\s+charge|finance\s+charge|annual\s+fee|foreign\s+transaction\s+fee|credit\s+balance\s+refund)\b/i;

/**
 * A four-digit account token, matched only where it stands alone. Requiring a
 * non-alphanumeric character before it is what separates "...3732" and "*8897"
 * and "ending in 3794" from the digits inside a masked reference number like
 * "transaction#: XXXXXXX8446".
 */
const lastFourRe = new Map<string, RegExp>();
function mentionsLastFour(text: string, lastFours: string[]): string | null {
  for (const four of lastFours) {
    let re = lastFourRe.get(four);
    // Compiled once and kept: a bulk import runs this per row, per account.
    if (!re) { re = new RegExp(`(?<![A-Za-z0-9])${four}(?![0-9])`); lastFourRe.set(four, re); }
    if (re.test(text)) return four;
  }
  return null;
}

export function detectTransferSignal(
  input: TransferSignalInput,
  tokens: AccountTokens,
): TransferSignal {
  const text = `${input.description} ${input.bankDescription ?? ''}`.trim();
  if (!text) return NONE;

  // Fees and reversals first: they carry payment-shaped wording but are neither
  // a transfer nor a payment, and history already categorizes them correctly.
  if (BALANCE_ADJUSTMENT.test(text)) return NONE;

  const isMoneyIn = input.amount < 0;
  const isCardAccount = input.accountClassification === 'liability' && input.accountType === 'credit';
  const hasPaymentWord = PAYMENT_WORD.test(text);

  // Money arriving on a credit card under a payment word is a payment of that
  // card. There is no competing reading — a refund says "refund", and a fee
  // reversal was already turned away above.
  if (isCardAccount && isMoneyIn && hasPaymentWord) {
    return { kind: 'card-payment', strength: 'strong', reason: 'card-inbound-payment' };
  }

  // The outbound leg. Strong only when the text names a card this ledger holds;
  // otherwise the payment may well be the user's actual spend (see the header).
  if (!isMoneyIn) {
    const four = hasPaymentWord ? mentionsLastFour(text, tokens.cards) : null;
    if (four) return { kind: 'card-payment', strength: 'strong', reason: `card-outbound-last-four:${four}` };
    // A card named with no payment word at all — "Chase Credit Card" is the whole
    // line on some statements. Same weak tier: still only a card being paid, and
    // still no way to tell a tracked card from an untracked one.
    if (CARD_TOKEN.test(text)) {
      return { kind: 'card-payment', strength: 'weak', reason: hasPaymentWord ? 'card-outbound-untracked' : 'card-named' };
    }
  }

  // The counterparty IS one of the user's accounts, named in full. Matched whole
  // rather than as a substring: "Venmo" is both an account here and a word that
  // appears in every Venmo purchase, and only the whole-line form means the
  // account itself was the other side of the move.
  const whole = input.description.trim().toLowerCase();
  if (whole && tokens.names.includes(whole)) {
    return { kind: 'transfer', strength: 'strong', reason: 'own-account-named' };
  }

  for (const [re, reason] of STRONG_TRANSFER) {
    if (re.test(text)) return { kind: 'transfer', strength: 'strong', reason };
  }

  const weak = WEAK_TRANSFER.find(([re]) => re.test(text));
  if (weak) {
    // A bank-operation word plus one of the user's own account numbers is the
    // pair of legs naming each other. Corroboration, never a signal on its own:
    // a last four alone shows up in reference numbers and store IDs.
    const four = mentionsLastFour(text, tokens.all);
    if (four) return { kind: 'transfer', strength: 'strong', reason: `${weak[1]}+last-four:${four}` };
    return { kind: 'transfer', strength: 'weak', reason: weak[1] };
  }

  return NONE;
}
