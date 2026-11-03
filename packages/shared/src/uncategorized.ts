import { formatMoney } from './money.js';
import type { UncategorizedTotals } from './types.js';

export interface UncategorizedNoticeText {
  /** The bold lead-in: "7 transactions have no category yet". */
  lead: string;
  /** The amounts, in brackets: "($412 out, +$85 in)". */
  amounts: string;
}

// Whole dollars, but a sub-dollar amount keeps its cents rather than rounding away to "—".
const amountText = (stored: number) =>
  formatMoney(stored, { precision: Math.abs(stored) < 0.5 ? 'full' : 'whole' }).text;

/**
 * The wording of the "no category yet" notice (Budget, Reports), or null when
 * nothing is uncategorized. A side with no money is left out. Totals are positive
 * magnitudes; money in is shown as "+$X" by the money rule.
 */
export function uncategorizedNoticeText(totals: UncategorizedTotals): UncategorizedNoticeText | null {
  const { count, moneyOut, moneyIn } = totals;
  if (count <= 0) return null;
  const parts: string[] = [];
  if (moneyOut > 0) parts.push(`${amountText(moneyOut)} out`);
  if (moneyIn > 0) parts.push(`${amountText(-moneyIn)} in`);
  return {
    lead: `${count.toLocaleString('en-US')} ${count === 1 ? 'transaction has' : 'transactions have'} no category yet`,
    amounts: parts.length > 0 ? `(${parts.join(', ')})` : '',
  };
}

/** First and last day of a month (`monthIndex` 0–11) as inclusive YYYY-MM-DD, for Review's `from`/`to`. */
export function monthPeriod(year: number, monthIndex: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return { from: `${year}-${pad(monthIndex + 1)}-01`, to: `${year}-${pad(monthIndex + 1)}-${pad(last)}` };
}
