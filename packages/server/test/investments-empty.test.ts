import { describe, expect, it } from 'vitest';
import { canLinkAccounts, holdingsEmpty } from '../../client/src/components/investments/emptyState';

describe('investments empty state', () => {
  it('shows nothing when there are holdings', () => {
    expect(holdingsEmpty(3, 0, false)).toBeNull();
    expect(holdingsEmpty(1, 2, true)).toBeNull();
  });

  it('only owners, admins and people who can manage bank connections can link an account', () => {
    expect(canLinkAccounts({ role: 'owner', permissions: {} })).toBe(true);
    expect(canLinkAccounts({ role: 'admin', permissions: {} })).toBe(true);
    expect(canLinkAccounts({ role: 'member', permissions: { 'simplefin.manage': true } })).toBe(true);
    // A default member can run a sync but not link an account.
    expect(canLinkAccounts({ role: 'member', permissions: { 'import.bank_sync': true } })).toBe(false);
    expect(canLinkAccounts({ role: 'member', permissions: { 'simplefin.manage': false, 'import.bank_sync': true } })).toBe(false);
    expect(canLinkAccounts({ role: 'member', permissions: {} })).toBe(false);
    expect(canLinkAccounts(null)).toBe(false);
  });

  it('a member with only "Run bank sync" gets no pointer; a manager and an admin do', () => {
    const copy = (user: Parameters<typeof canLinkAccounts>[0]) => holdingsEmpty(0, 0, canLinkAccounts(user))!.copy;
    expect(copy({ role: 'member', permissions: { 'import.bank_sync': true } }).link).toBeNull();
    expect(copy({ role: 'member', permissions: { 'simplefin.manage': true } }).link).toBe('Settings → Bank Sync');
    expect(copy({ role: 'admin', permissions: {} }).link).toBe('Settings → Bank Sync');
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
