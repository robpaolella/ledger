import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateCurrentValue, type DepreciationParams } from '../src/utils/depreciation.js';

const base: DepreciationParams = {
  cost: 1000,
  salvageValue: 100,
  lifespanYears: 5,
  purchaseDate: '2020-01-01',
  depreciationMethod: 'straight_line',
  decliningRate: null,
};

// 365.25-day years, matching the implementation.
const yearsAfterPurchase = (n: number) =>
  new Date(new Date('2020-01-01').getTime() + n * 365.25 * 24 * 60 * 60 * 1000);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('calculateCurrentValue', () => {
  it('depreciates straight-line by (cost - salvage) / lifespan per year', () => {
    vi.setSystemTime(yearsAfterPurchase(2));
    expect(calculateCurrentValue(base)).toBeCloseTo(640);
  });

  it('never drops below salvage value after the lifespan ends', () => {
    vi.setSystemTime(yearsAfterPurchase(10));
    expect(calculateCurrentValue(base)).toBe(100);
  });

  it('applies declining balance at the given annual rate', () => {
    vi.setSystemTime(yearsAfterPurchase(1));
    const value = calculateCurrentValue({ ...base, depreciationMethod: 'declining_balance', decliningRate: 20 });
    expect(value).toBeCloseTo(800);
  });

  it('falls back to straight-line when declining balance has no rate', () => {
    vi.setSystemTime(yearsAfterPurchase(2));
    const value = calculateCurrentValue({ ...base, depreciationMethod: 'declining_balance' });
    expect(value).toBeCloseTo(640);
  });
});
