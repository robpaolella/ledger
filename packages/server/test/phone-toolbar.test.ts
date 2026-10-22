import { describe, expect, it } from 'vitest';
import { filtersButtonLabel, phoneToolbarMode, showClearAll } from '../../client/src/lib/toolbar';

describe('phone toolbar rules', () => {
  it('is one row unless searching or selecting', () => {
    expect(phoneToolbarMode(false, false)).toBe('row');
    expect(phoneToolbarMode(false, true)).toBe('search');
  });

  it('Select mode wins over an open search', () => {
    expect(phoneToolbarMode(true, false)).toBe('select');
    expect(phoneToolbarMode(true, true)).toBe('select');
  });

  it('shows Clear all only while something is active and not selecting', () => {
    expect(showClearAll(false, false)).toBe(false);
    expect(showClearAll(true, false)).toBe(true);
    expect(showClearAll(true, true)).toBe(false);
    expect(showClearAll(false, true)).toBe(false);
  });

  it('names the Filters button with the applied count', () => {
    expect(filtersButtonLabel(0)).toBe('Filters');
    expect(filtersButtonLabel(2)).toBe('Filters, 2 applied');
  });
});
