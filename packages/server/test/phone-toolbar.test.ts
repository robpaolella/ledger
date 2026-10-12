import { describe, expect, it } from 'vitest';
import { phoneToolbarMode, reviewChipLabel, showClearAll } from '../../client/src/lib/toolbar';

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

  it('keeps the full wording as the chip name, with thousands separators', () => {
    expect(reviewChipLabel(45)).toBe('45 to review');
    expect(reviewChipLabel(1234)).toBe('1,234 to review');
  });
});
