import { describe, expect, it } from 'vitest';
import { noAccountsPointer, type NoAccountsPlace } from '../../client/src/lib/noAccounts';

const base = { loaded: true, count: 0, place: 'empty' as NoAccountsPlace, canAdd: true, canLinkBank: false };
const text = (c: ReturnType<typeof noAccountsPointer>) => (c ? `${c.before}${c.link ?? ''}${c.after}` : null);

describe('no-accounts pointer', () => {
  it('shows nothing while loading, after a failed load, or once an account exists', () => {
    expect(noAccountsPointer({ ...base, loaded: false })).toBeNull();
    expect(noAccountsPointer({ ...base, count: 1 })).toBeNull();
    for (const place of ['add', 'import', 'empty'] as const) {
      expect(noAccountsPointer({ ...base, place, count: 3, canLinkBank: true })).toBeNull();
    }
  });

  it('links to Accounts for someone who can add one', () => {
    expect(noAccountsPointer({ ...base, place: 'add' })).toEqual({ before: 'Add an account on ', link: 'Accounts', after: ' before adding a transaction.' });
    expect(text(noAccountsPointer({ ...base, place: 'import' }))).toBe('Add an account on Accounts before importing.');
    expect(text(noAccountsPointer(base))).toBe('Add an account on Accounts to get started.');
  });

  it('mentions Bank Sync in empty states only for people who can link a bank', () => {
    expect(text(noAccountsPointer({ ...base, canLinkBank: true }))).toBe('Add an account on Accounts, or connect a bank in Settings → Bank Sync, to get started.');
    expect(text(noAccountsPointer({ ...base, place: 'add', canLinkBank: true }))).not.toContain('Bank Sync');
  });

  it('sends someone who cannot add accounts to an owner or admin, with no link', () => {
    for (const place of ['add', 'import', 'empty'] as const) {
      const c = noAccountsPointer({ ...base, place, canAdd: false });
      expect(c?.link).toBeNull();
      expect(text(c)).toContain('Ask the household owner or an admin');
    }
    expect(text(noAccountsPointer({ ...base, canAdd: false, canLinkBank: true }))).toBe('Ask the household owner or an admin to add an account, or connect a bank in Settings → Bank Sync.');
    expect(text(noAccountsPointer({ ...base, canAdd: false }))).not.toContain('Bank Sync');
  });
});
