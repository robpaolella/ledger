/**
 * One display rule for every amount in Ledger (PRODUCT.md → Money rules → Display).
 *
 * Stored transaction amounts mean positive = money out, negative = money in, for
 * every category type, so the sign alone decides direction:
 * - `transaction`: money in is "+$X" (positive tone); money out is "$X" (neutral),
 *   never with a minus. Transfers follow the same sign rule in the muted tone.
 * - `total`: a figure that can go either way (Net, remaining, a change). A real
 *   minus when negative; positive is good, negative is bad. Pass it oriented so that
 *   positive means good.
 * - `balance`: a plain figure (balances, net worth, holdings, chart axes). A real
 *   minus when negative, no colour.
 *
 * Zero (and anything that rounds to zero at the chosen precision) shows "—".
 */
export type MoneyKind = 'transaction' | 'total' | 'balance';

/** full: $1,234.56 · whole: $1,235 · compact: $1.2k, $3.4M, $5.6B (below 1,000 shows full). */
export type MoneyPrecision = 'full' | 'whole' | 'compact';

/** positive = money in / good, negative = bad, neutral = normal text, muted = transfers. */
export type MoneyTone = 'positive' | 'negative' | 'neutral' | 'muted';

export interface MoneyOptions {
  kind?: MoneyKind;
  precision?: MoneyPrecision;
  /** A transaction between the user's own accounts (category type `transfer`). */
  transfer?: boolean;
}

export interface MoneyDisplay {
  text: string;
  tone: MoneyTone;
}

const COMPACT_UNITS: [number, string][] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']];

/** The magnitude as text, or '' when it rounds to zero at this precision. */
function magnitude(abs: number, precision: MoneyPrecision): string {
  if (precision === 'compact') {
    for (let i = 0; i < COMPACT_UNITS.length; i++) {
      const [size, suffix] = COMPACT_UNITS[i];
      if (abs < size) continue;
      const scaled = (abs / size).toFixed(1);
      // 999,960 rounds to "1000.0k"; show it as "1.0M" instead.
      if (Number(scaled) >= 1000 && i > 0) {
        const [bigger, biggerSuffix] = COMPACT_UNITS[i - 1];
        return `$${(abs / bigger).toFixed(1)}${biggerSuffix}`;
      }
      return `$${Number(scaled).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}`;
    }
    // 999.996 rounds to $1,000.00 at full precision; keep it in compact form.
    if (Number(abs.toFixed(2)) >= 1000) return '$1.0k';
    return magnitude(abs, 'full');
  }
  const digits = precision === 'whole' ? 0 : 2;
  const text = abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return /[1-9]/.test(text) ? `$${text}` : '';
}

export function formatMoney(amount: number, options: MoneyOptions = {}): MoneyDisplay {
  const { kind = 'transaction', precision = 'full', transfer = false } = options;
  const mag = Number.isFinite(amount) ? magnitude(Math.abs(amount), precision) : '';
  if (!mag) return { text: '—', tone: kind === 'transaction' && transfer ? 'muted' : 'neutral' };
  const negative = amount < 0;

  if (kind === 'balance') return { text: negative ? `-${mag}` : mag, tone: 'neutral' };
  if (kind === 'total') return { text: negative ? `-${mag}` : mag, tone: negative ? 'negative' : 'positive' };

  // Transaction: negative is money in.
  const text = negative ? `+${mag}` : mag;
  if (transfer) return { text, tone: 'muted' };
  return { text, tone: negative ? 'positive' : 'neutral' };
}
