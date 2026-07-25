/**
 * Format a number as full currency: $1,234.56
 * Returns "—" for zero values.
 */
export function fmt(n: number): string {
  if (n === 0) return '—';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${formatted}`;
}

/**
 * Format a number abbreviated: $1.2k for values >= 1000
 * Returns "—" for zero values.
 */
export function fmtShort(n: number): string {
  if (n === 0) return '—';
  const abs = Math.abs(n);
  if (abs >= 1000) {
    return `${n < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`;
  }
  return fmt(n);
}

/**
 * Format a number as whole currency: $1,235
 * Returns "—" for zero values.
 */
export function fmtWhole(n: number): string {
  if (n === 0) return '—';
  const abs = Math.abs(Math.round(n));
  return `${n < 0 ? '-' : ''}$${abs.toLocaleString()}`;
}

/**
 * Relative timestamp: "Just now", "5m ago", "3h ago", "2d ago".
 * Accepts ISO strings and bare SQLite CURRENT_TIMESTAMP values
 * ("YYYY-MM-DD HH:MM:SS"), which are UTC despite lacking a zone marker.
 */
export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso)
    ? `${iso.replace(' ', 'T')}Z`
    : iso;
  const then = new Date(normalized).getTime();
  if (isNaN(then)) return '';
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Display logic for transaction amounts considering both sign and category type.
 * Savings contributions are outflows and behave like expenses (positive = money
 * out to savings), so they share the expense treatment.
 *
 * 1. Positive + expense/savings (regular outflow): neutral, no prefix → "$50.00"
 * 2. Negative + income (regular income): green, "+" prefix → "+$3,618.21"
 * 3. Negative + expense/savings (refund/credit): green, "-" prefix → "-$50.00"
 * 4. Positive + income (income reversal): red, "-" prefix → "-$500.00"
 */
export function fmtTransaction(amount: number, categoryType: string): { text: string; className: string } {
  const abs = Math.abs(amount);
  const formatted = fmt(abs);
  const isOutflow = categoryType === 'expense' || categoryType === 'savings';

  if (categoryType === 'transfer') {
    // Transfers are neutral (both legs net to zero) — show the magnitude, no color.
    return { text: formatted, className: 'text-content-2' };
  }
  if (amount >= 0 && isOutflow) {
    // Case 1: regular expense / savings contribution — neutral, no prefix
    return { text: formatted, className: 'text-content' };
  }
  if (amount < 0 && categoryType === 'income') {
    // Case 2: regular income — green, "+"
    return { text: `+${formatted}`, className: 'text-positive' };
  }
  if (amount < 0 && isOutflow) {
    // Case 3: refund/credit against an expense or savings — green, "-"
    return { text: `-${formatted}`, className: 'text-positive' };
  }
  // Case 4: positive + income (income reversal) — red, "-"
  return { text: `-${formatted}`, className: 'text-negative' };
}
