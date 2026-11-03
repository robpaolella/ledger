import { describe, expect, it } from 'vitest';
import { monthPeriod, uncategorizedNoticeText } from '@ledger/shared';

describe('uncategorizedNoticeText', () => {
  it('shows both sides', () => {
    expect(uncategorizedNoticeText({ count: 7, moneyOut: 412.37, moneyIn: 85 })).toEqual({
      lead: '7 transactions have no category yet',
      amounts: '($412 out, +$85 in)',
    });
  });

  it('drops money in when there is none', () => {
    expect(uncategorizedNoticeText({ count: 6, moneyOut: 412.37, moneyIn: 0 })?.amounts).toBe('($412 out)');
  });

  it('drops money out when there is none', () => {
    expect(uncategorizedNoticeText({ count: 2, moneyOut: 0, moneyIn: 85 })?.amounts).toBe('(+$85 in)');
  });

  it('uses the singular for one transaction', () => {
    expect(uncategorizedNoticeText({ count: 1, moneyOut: 12, moneyIn: 0 })?.lead).toBe('1 transaction has no category yet');
  });

  it('shows counts of 1,000 or more in full', () => {
    const text = uncategorizedNoticeText({ count: 1048, moneyOut: 3906.18, moneyIn: 1240 });
    expect(text?.lead).toBe('1,048 transactions have no category yet');
    expect(text?.amounts).toBe('($3,906 out, +$1,240 in)');
  });

  it('keeps cents on a sub-dollar amount instead of showing a dash', () => {
    expect(uncategorizedNoticeText({ count: 1, moneyOut: 0.4, moneyIn: 0 })?.amounts).toBe('($0.40 out)');
  });

  it('is null when nothing is uncategorized', () => {
    expect(uncategorizedNoticeText({ count: 0, moneyOut: 0, moneyIn: 0 })).toBeNull();
  });
});

describe('monthPeriod', () => {
  it('gives the first and last day', () => {
    expect(monthPeriod(2026, 9)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthPeriod(2026, 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthPeriod(2028, 1)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthPeriod(2026, 11)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});
