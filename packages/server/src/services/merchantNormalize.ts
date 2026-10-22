import { matchAlias } from './merchantAliases.js';

/**
 * Clean a raw bank/statement payee string into a stable, dedup-friendly merchant
 * display name. Two-stage: (1) a curated brand alias wins outright (AMZN MKTP →
 * Amazon); (2) otherwise a conservative cleanup pipeline strips card-network
 * prefixes, trailing store#/state/ZIP/date/phone noise, collapses whitespace, and
 * title-cases.
 *
 * MUST be idempotent — normalizeMerchantName(normalizeMerchantName(x)) === the
 * first result — because the merchant de-fragment relies on that. Never returns
 * '' for a non-empty input (falls back to the trimmed raw).
 */
export function normalizeMerchantName(raw: string | null | undefined): string {
  const input = (raw ?? '').trim();
  if (!input) return '';

  // 1. Curated brand alias wins (handles brand-mapping normalization can't).
  const alias = matchAlias(input);
  if (alias) return alias;

  let s = input;

  // 2a. Strip leading card-network / processor prefixes.
  //   - "SQ *", "TST*", "PP*", "CKE*" and the generic "<2-4 alnum> *" form.
  s = s.replace(/^\s*[A-Z0-9]{2,4}\s*\*\s*/i, '');
  //   - "PAYPAL *", "PAYPAL "
  s = s.replace(/^\s*paypal\s*\*?\s*/i, '');
  //   - "POS DEBIT ", "POS PURCHASE ", "POS "
  s = s.replace(/^\s*pos\s+(debit|purchase|pur)\s+/i, '');
  s = s.replace(/^\s*pos\s+/i, '');
  //   - "DEBIT/CREDIT CARD PURCHASE " — requires the "card" token, so real names
  //     like "Credit One Bank" (no "card") are never truncated. Bare words
  //     (payment/purchase/ach/recurring) are intentionally NOT stripped.
  s = s.replace(/^\s*(debit|credit)\s+card\s+(purchase\s+|payment\s+)?/i, '');

  // 2b. Strip trailing noise (order: most-specific first).
  //   - store number token: "#1234"
  s = s.replace(/\s*#\s*\d+\b/g, ' ');
  //   - trailing state + ZIP: " CA 92101" / " CA 92101-1234"
  s = s.replace(/\s+[A-Za-z]{2}\s+\d{5}(-\d{4})?\s*$/, '');
  //   - trailing ZIP alone
  s = s.replace(/\s+\d{5}(-\d{4})?\s*$/, '');
  //   - trailing phone: " 800-555-1234" / " 8005551234"
  s = s.replace(/\s+\+?\d[\d\s().-]{6,}\d\s*$/, '');
  //   - trailing date: " 12/31" / " 12/31/24" / " 2024-12-31"
  s = s.replace(/\s+\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*$/, '');
  s = s.replace(/\s+\d{4}-\d{2}-\d{2}\s*$/, '');
  //   - trailing long digit run (transaction/store id): " 0001234567"
  s = s.replace(/\s+\d{4,}\s*$/, '');
  //   - trailing country markers
  s = s.replace(/\s+(usa?|us)\s*$/i, '');
  // NOTE: a bare trailing 2-letter token is deliberately NOT stripped — "CO", "IN",
  // etc. are ambiguous (Colorado vs "Coffee Co."); the safe state+ZIP rule above
  // already removes real "CITY ST 92101" tails. Conservative here avoids corrupting
  // clean/hand-entered names.

  // 2c. Collapse whitespace + punctuation runs, then title-case.
  s = s.replace(/\s{2,}/g, ' ').trim();
  s = titleCase(s);

  // Never blank out a non-empty input.
  return s || titleCase(input);
}

/** Title-case a string, preserving `&` and intra-word apostrophes/hyphens. */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])([a-z0-9'’-]*)/g, (_, first: string, rest: string) => first.toUpperCase() + rest);
}
