import { describe, expect, it } from 'vitest';
import { isActiveSort, SORT_OPTIONS, sortButtonLabel } from '../../client/src/components/filterModel';

describe('Transactions Sort choices', () => {
  it('offers the five existing choices in order', () => {
    expect(SORT_OPTIONS.map((o) => o.label)).toEqual([
      'Date (new → old)', 'Date (old → new)', 'Merchant (A → Z)', 'Amount (high → low)', 'Amount (low → high)',
    ]);
  });

  it('ticks nothing until a sort has been picked', () => {
    expect(SORT_OPTIONS.some((o) => isActiveSort(o, false, 'date', 'desc'))).toBe(false);
    expect(sortButtonLabel(false, 'date', 'desc')).toBe('Sort');
  });

  it('ticks exactly the picked choice and shows it on the button', () => {
    for (const picked of SORT_OPTIONS) {
      const ticked = SORT_OPTIONS.filter((o) => isActiveSort(o, true, picked.by, picked.order));
      expect(ticked).toEqual([picked]);
      expect(sortButtonLabel(true, picked.by, picked.order)).toBe(picked.label);
    }
  });

  it('falls back to "Sort" for an unknown sort', () => {
    expect(sortButtonLabel(true, 'nope', 'asc')).toBe('Sort');
  });
});
