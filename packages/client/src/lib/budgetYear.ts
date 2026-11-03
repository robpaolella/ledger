import { formatMoney } from '@ledger/shared';

// Phone Budget · Year helpers: the year figures that sit under names, and which rows hide.

/** A year's twelve monthly plans added up. */
export const yearSum = (planned: number[]): number => planned.reduce((a, v) => a + (v || 0), 0);

/**
 * A row is "unbudgeted" when nothing is planned in any month of the selected year. A row
 * planned only in another month is not, so the count doesn't change as the month steps.
 */
export const isUnbudgetedYear = (planned: number[]): boolean => planned.every((v) => !v);

const whole = (n: number) => formatMoney(n, { kind: 'balance', precision: 'whole' }).text;

/** Second line under a group or category name: "$14,851 in 2026" or "Nothing in 2026". */
export const yearLine = (planned: number[], year: number): string => {
  const total = yearSum(planned);
  return total ? `${whole(total)} in ${year}` : `Nothing in ${year}`;
};

/** Second line under a section heading: "$97,968 planned in 2026" or "Nothing planned in 2027". */
export const sectionYearLine = (monthlyTotals: number[], year: number): string => {
  const total = yearSum(monthlyTotals);
  return total ? `${whole(total)} planned in ${year}` : `Nothing planned in ${year}`;
};
