import { describe, expect, it } from 'vitest';
import { formatMoney } from '@ledger/shared';
import { distinctAxisLabels, thinLabelIndices } from '../../client/src/lib/chartLabels';

describe('thinLabelIndices', () => {
  it('keeps every label when they all fit', () => {
    expect(thinLabelIndices(4, 5)).toEqual([0, 1, 2, 3]);
    expect(thinLabelIndices(5, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('counts back from the last label (Jan–Oct gives Feb, Apr, Jun, Aug, Oct)', () => {
    expect(thinLabelIndices(10, 5)).toEqual([1, 3, 5, 7, 9]);
  });

  it('always includes the last label and never exceeds the maximum', () => {
    for (let n = 1; n <= 60; n++) {
      const idx = thinLabelIndices(n, 5);
      expect(idx[idx.length - 1]).toBe(n - 1);
      expect(idx.length).toBeLessThanOrEqual(5);
      expect(new Set(idx).size).toBe(idx.length);
    }
  });

  it('handles empty and single-bucket charts', () => {
    expect(thinLabelIndices(0, 5)).toEqual([]);
    expect(thinLabelIndices(1, 5)).toEqual([0]);
    expect(thinLabelIndices(3, 0)).toEqual([]);
  });
});

describe('distinctAxisLabels', () => {
  const axis = (n: number) => formatMoney(n, { kind: 'balance', precision: 'axis' }).text;
  const compact = (n: number) => formatMoney(n, { kind: 'balance', precision: 'compact', showZero: true }).text.replace(/\.0(?=[kMB]$)/, '');
  const whole = (n: number) => formatMoney(n, { kind: 'balance', precision: 'whole', showZero: true }).text;
  const full = (n: number) => formatMoney(n, { kind: 'balance', precision: 'full', showZero: true }).text;
  const fmts = [axis, compact, whole, full];
  const spread = (lo: number, hi: number) => Array.from({ length: 5 }, (_, i) => lo + (i / 4) * (hi - lo));

  it('keeps compact labels for a wide range', () => {
    expect(distinctAxisLabels(spread(6900, 8000), fmts)).toEqual(spread(6900, 8000).map(axis));
  });

  it('never repeats a label for a narrow range', () => {
    const labels = distinctAxisLabels(spread(7886, 7961), fmts);
    expect(new Set(labels).size).toBe(5);
    expect(labels.some((l) => l === '$8k')).toBe(false);
  });

  // The chart widens a flat series by 1% of its value (or $1 at zero) before drawing gridlines.
  it.each([8000, 0, 123.45, -250])('gives a flat series of %d distinct labels', (value) => {
    const d = Math.abs(value) * 0.01 || 1;
    const labels = distinctAxisLabels(spread(value - d, value + d), fmts);
    expect(new Set(labels).size).toBe(5);
    expect(labels.every((l) => l !== '')).toBe(true);
  });

  it('goes to cents when whole dollars still repeat', () => {
    const labels = distinctAxisLabels(spread(100, 100.4), fmts);
    expect(new Set(labels).size).toBe(5);
  });

  it('blanks later repeats when ticks are indistinguishable', () => {
    expect(distinctAxisLabels([5, 5, 5], fmts)).toEqual(['$5.00', '', '']);
  });
});
