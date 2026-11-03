import { describe, expect, it } from 'vitest';
import { reviewSheetMeta } from '../../client/src/lib/reviewSheetMeta';

describe('reviewSheetMeta', () => {
  it('keeps the date · account (last four) text for the tooltip', () => {
    const m = reviewSheetMeta('October 10, 2026', 'Checking', '1234');
    expect(m.account).toBe('Checking (1234)');
    expect(m.tooltip).toBe('October 10, 2026 · Checking (1234)');
  });

  it('leaves off the last four when the account has none', () => {
    expect(reviewSheetMeta('October 10, 2026', 'Savings').tooltip).toBe('October 10, 2026 · Savings');
    expect(reviewSheetMeta('October 10, 2026', 'Savings', null).account).toBe('Savings');
  });
});
