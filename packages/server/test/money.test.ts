import { describe, expect, it } from 'vitest';
import { formatMoney } from '@ledger/shared';

// Stored amounts: positive = money out, negative = money in (PRODUCT.md → Money rules).
describe('formatMoney: transactions', () => {
  it('shows money in (a paycheck) as green +$X', () => {
    expect(formatMoney(-3618.21)).toEqual({ text: '+$3,618.21', tone: 'positive' });
  });

  it('shows money out as plain $X with no minus', () => {
    expect(formatMoney(50)).toEqual({ text: '$50.00', tone: 'neutral' });
  });

  it('shows a refund (negative expense) as money in', () => {
    expect(formatMoney(-18.75)).toEqual({ text: '+$18.75', tone: 'positive' });
  });

  it('shows an income reversal (positive income) as plain money out, never a red minus', () => {
    expect(formatMoney(500)).toEqual({ text: '$500.00', tone: 'neutral' });
  });

  it('shows transfers in grey with the same sign rule', () => {
    expect(formatMoney(-250, { transfer: true })).toEqual({ text: '+$250.00', tone: 'muted' });
    expect(formatMoney(250, { transfer: true })).toEqual({ text: '$250.00', tone: 'muted' });
  });

  it('decides an uncategorized row by its sign alone', () => {
    expect(formatMoney(-12)).toEqual({ text: '+$12.00', tone: 'positive' });
    expect(formatMoney(12)).toEqual({ text: '$12.00', tone: 'neutral' });
  });

  it('shows zero, and amounts that round to zero, as a dash', () => {
    expect(formatMoney(0)).toEqual({ text: '—', tone: 'neutral' });
    expect(formatMoney(-0)).toEqual({ text: '—', tone: 'neutral' });
    expect(formatMoney(-0.004)).toEqual({ text: '—', tone: 'neutral' });
    expect(formatMoney(0.4, { precision: 'whole' })).toEqual({ text: '—', tone: 'neutral' });
    expect(formatMoney(0, { transfer: true })).toEqual({ text: '—', tone: 'muted' });
    expect(formatMoney(Number.NaN)).toEqual({ text: '—', tone: 'neutral' });
  });

  it('formats very large values with separators', () => {
    expect(formatMoney(-1234567890.5)).toEqual({ text: '+$1,234,567,890.50', tone: 'positive' });
    expect(formatMoney(1234567890.5)).toEqual({ text: '$1,234,567,890.50', tone: 'neutral' });
  });

  it('applies the same sign and tone to whole-dollar amounts', () => {
    expect(formatMoney(-1234.56, { precision: 'whole' })).toEqual({ text: '+$1,235', tone: 'positive' });
    expect(formatMoney(1234.49, { precision: 'whole' })).toEqual({ text: '$1,234', tone: 'neutral' });
    expect(formatMoney(-99.5, { precision: 'whole', transfer: true })).toEqual({ text: '+$100', tone: 'muted' });
  });

  it('applies the same sign and tone to compact amounts', () => {
    expect(formatMoney(-1234, { precision: 'compact' })).toEqual({ text: '+$1.2k', tone: 'positive' });
    expect(formatMoney(1234, { precision: 'compact' })).toEqual({ text: '$1.2k', tone: 'neutral' });
    expect(formatMoney(-999.5, { precision: 'compact' })).toEqual({ text: '+$999.50', tone: 'positive' });
    expect(formatMoney(2500, { precision: 'compact', transfer: true })).toEqual({ text: '$2.5k', tone: 'muted' });
  });
});

describe('formatMoney: compact sizes', () => {
  it('steps through k, M and B without showing 1000 of a smaller unit', () => {
    expect(formatMoney(1000, { precision: 'compact' }).text).toBe('$1.0k');
    expect(formatMoney(999.996, { precision: 'compact' }).text).toBe('$1.0k');
    expect(formatMoney(999_960, { precision: 'compact' }).text).toBe('$1.0M');
    expect(formatMoney(3_400_000, { precision: 'compact' }).text).toBe('$3.4M');
    expect(formatMoney(5_600_000_000, { precision: 'compact' }).text).toBe('$5.6B');
    expect(formatMoney(2_500_000_000_000, { precision: 'compact' }).text).toBe('$2,500.0B');
  });
});

describe('formatMoney: signed totals', () => {
  it('colours a positive total good, without a plus', () => {
    expect(formatMoney(420.5, { kind: 'total' })).toEqual({ text: '$420.50', tone: 'positive' });
  });

  it('shows a negative total with a real minus, coloured bad', () => {
    expect(formatMoney(-420.5, { kind: 'total' })).toEqual({ text: '-$420.50', tone: 'negative' });
  });

  it('keeps the rule for whole-dollar and compact totals', () => {
    expect(formatMoney(-1500.4, { kind: 'total', precision: 'whole' })).toEqual({ text: '-$1,500', tone: 'negative' });
    expect(formatMoney(1500.4, { kind: 'total', precision: 'whole' })).toEqual({ text: '$1,500', tone: 'positive' });
    expect(formatMoney(-2_400_000, { kind: 'total', precision: 'compact' })).toEqual({ text: '-$2.4M', tone: 'negative' });
    expect(formatMoney(2_400_000, { kind: 'total', precision: 'compact' })).toEqual({ text: '$2.4M', tone: 'positive' });
  });

  it('shows a zero total as a plain dash', () => {
    expect(formatMoney(0, { kind: 'total' })).toEqual({ text: '—', tone: 'neutral' });
  });

  it('lets a zero total take a given tone (Budget keeps zero remaining good)', () => {
    expect(formatMoney(0, { kind: 'total', precision: 'whole', zeroTone: 'positive' })).toEqual({ text: '—', tone: 'positive' });
    expect(formatMoney(0.4, { kind: 'total', precision: 'whole', zeroTone: 'positive' })).toEqual({ text: '—', tone: 'positive' });
    expect(formatMoney(-0.4, { kind: 'total', precision: 'whole', zeroTone: 'positive' })).toEqual({ text: '—', tone: 'positive' });
    // Only zero is affected: non-zero totals keep their good or bad tone.
    expect(formatMoney(-12, { kind: 'total', precision: 'whole', zeroTone: 'positive' })).toEqual({ text: '-$12', tone: 'negative' });
    expect(formatMoney(12, { kind: 'total', precision: 'whole', zeroTone: 'positive' })).toEqual({ text: '$12', tone: 'positive' });
  });
});

describe('formatMoney: balances', () => {
  it('shows a negative balance with a real minus and no colour', () => {
    expect(formatMoney(-2500.75, { kind: 'balance' })).toEqual({ text: '-$2,500.75', tone: 'neutral' });
  });

  it('shows a positive balance plainly', () => {
    expect(formatMoney(2500.75, { kind: 'balance' })).toEqual({ text: '$2,500.75', tone: 'neutral' });
  });

  it('ignores the transfer flag, which only applies to transactions', () => {
    expect(formatMoney(-10, { kind: 'balance', transfer: true })).toEqual({ text: '-$10.00', tone: 'neutral' });
  });

  it('keeps the rule for whole-dollar, compact and very large balances', () => {
    expect(formatMoney(-1234.5, { kind: 'balance', precision: 'whole' })).toEqual({ text: '-$1,235', tone: 'neutral' });
    expect(formatMoney(-48_200, { kind: 'balance', precision: 'compact' })).toEqual({ text: '-$48.2k', tone: 'neutral' });
    expect(formatMoney(987_654_321.09, { kind: 'balance' })).toEqual({ text: '$987,654,321.09', tone: 'neutral' });
    expect(formatMoney(0, { kind: 'balance' })).toEqual({ text: '—', tone: 'neutral' });
  });
});

describe('formatMoney: showZero', () => {
  it('shows zero as $0 instead of a dash when asked', () => {
    expect(formatMoney(0, { kind: 'balance', precision: 'whole', showZero: true })).toEqual({ text: '$0', tone: 'neutral' });
    expect(formatMoney(0.4, { kind: 'balance', precision: 'whole', showZero: true })).toEqual({ text: '$0', tone: 'neutral' });
    expect(formatMoney(-0.4, { kind: 'total', precision: 'whole', showZero: true })).toEqual({ text: '$0', tone: 'neutral' });
    expect(formatMoney(0, { kind: 'balance', showZero: true })).toEqual({ text: '$0.00', tone: 'neutral' });
  });

  it('leaves non-zero amounts unchanged', () => {
    expect(formatMoney(-1234.5, { kind: 'balance', precision: 'whole', showZero: true })).toEqual({ text: '-$1,235', tone: 'neutral' });
    expect(formatMoney(-12, { kind: 'total', precision: 'whole', showZero: true })).toEqual({ text: '-$12', tone: 'negative' });
  });
});

describe('formatMoney: chart axis labels', () => {
  const axis = (n: number) => formatMoney(n, { kind: 'balance', precision: 'axis' });

  it('shows whole dollars below $1,000 and $0 at zero', () => {
    expect(axis(0)).toEqual({ text: '$0', tone: 'neutral' });
    expect(axis(0.4).text).toBe('$0');
    expect(axis(250).text).toBe('$250');
    expect(axis(249.6).text).toBe('$250');
  });

  it('uses a lowercase k with no trailing .0', () => {
    expect(axis(1000).text).toBe('$1k');
    expect(axis(999.6).text).toBe('$1k');
    expect(axis(1200).text).toBe('$1.2k');
    expect(axis(12_000).text).toBe('$12k');
    expect(axis(12_500).text).toBe('$13k');
    expect(axis(250_000).text).toBe('$250k');
  });

  it('steps up to M and B without showing 1000 of a smaller unit', () => {
    expect(axis(999_600).text).toBe('$1M');
    expect(axis(1_500_000).text).toBe('$1.5M');
    expect(axis(2_000_000_000).text).toBe('$2B');
  });

  it('shows negatives with a real minus and no colour', () => {
    expect(axis(-250)).toEqual({ text: '-$250', tone: 'neutral' });
    expect(axis(-1200)).toEqual({ text: '-$1.2k', tone: 'neutral' });
    expect(axis(-12_000)).toEqual({ text: '-$12k', tone: 'neutral' });
  });
});
