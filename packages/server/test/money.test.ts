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
