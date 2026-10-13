import { describe, expect, it } from 'vitest';
import { holdingsEmpty } from '../../client/src/components/investments/emptyState';

describe('investments empty state', () => {
  it('shows nothing when there are holdings', () => {
    expect(holdingsEmpty(3, 0, false)).toBeNull();
    expect(holdingsEmpty(1, 2, true)).toBeNull();
  });

  it('points people who can manage bank sync to Settings → Bank Sync', () => {
    const r = holdingsEmpty(0, 0, true)!;
    expect(r.scope).toBe('page');
    expect(r.copy.link).toBe('Settings → Bank Sync');
  });

  it('gives everyone else wording with no action', () => {
    const r = holdingsEmpty(0, 0, false)!;
    expect(r.scope).toBe('page');
    expect(r.copy.link).toBeNull();
    expect(r.copy.before).toBe('Holdings appear here once an owner or admin links an investment account.');
  });

  it('replaces the table for a selection with no holdings, for every viewer', () => {
    for (const can of [true, false]) {
      const r = holdingsEmpty(0, 2, can)!;
      expect(r.scope).toBe('selection');
      expect(r.copy.before).toBe('No holdings for the selected accounts.');
      expect(r.copy.link).toBeNull();
    }
  });
});
