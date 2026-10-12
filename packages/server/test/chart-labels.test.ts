import { describe, expect, it } from 'vitest';
import { thinLabelIndices } from '../../client/src/lib/chartLabels';

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
