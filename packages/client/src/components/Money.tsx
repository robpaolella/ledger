import { formatMoney, type MoneyPrecision, type MoneyTone } from '@ledger/shared';

// Thin wrappers over the shared money rule (PRODUCT.md → Money rules → Display).
// Balances need no colour, so they use formatMoney(n, { kind: 'balance' }).text directly.

const TONE_CLASS: Record<MoneyTone, string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  neutral: 'text-content',
  muted: 'text-content-2',
};

/**
 * A transaction amount, or a sum of transactions (day and selection totals), in
 * stored sign: negative = money in (green "+$X"), positive = money out (plain "$X").
 */
export function Money({ amount, transfer = false, precision, showZero, className = '' }: {
  amount: number;
  transfer?: boolean;
  precision?: MoneyPrecision;
  /** Show zero as "$0.00" instead of "—". */
  showZero?: boolean;
  className?: string;
}) {
  const { text, tone } = formatMoney(amount, { transfer, precision, showZero });
  return <span className={`tabular-nums ${TONE_CLASS[tone]} ${className}`}>{text}</span>;
}

/**
 * A total that can go either way (Net, remaining, a change), oriented so positive is
 * good: a real minus when negative, coloured good or bad.
 */
export function Change({ value, precision, zeroTone, showZero, className = '' }: {
  value: number;
  precision?: MoneyPrecision;
  /** Tone for a zero ("—"); neutral by default. */
  zeroTone?: MoneyTone;
  /** Show zero as "$0" instead of "—". */
  showZero?: boolean;
  className?: string;
}) {
  const { text, tone } = formatMoney(value, { kind: 'total', precision, zeroTone, showZero });
  return <span className={`tabular-nums ${TONE_CLASS[tone]} ${className}`}>{text}</span>;
}
