/** The one-line pointer shown where a household with no accounts has nowhere to go. Pure so the server tests can import it. */

export type NoAccountsPlace = 'add' | 'import' | 'empty';

export interface NoAccountsCopy {
  before: string;
  /** Bold link to the Accounts page; null when the viewer can't add accounts. */
  link: string | null;
  after: string;
}

/**
 * Null unless the accounts list loaded successfully and is empty (loading or failed
 * shows nothing). People who can't add accounts are told to ask an owner or admin;
 * the bank-sync pointer is for people who can link a bank.
 */
export function noAccountsPointer(i: {
  loaded: boolean;
  count: number;
  place: NoAccountsPlace;
  canAdd: boolean;
  canLinkBank: boolean;
}): NoAccountsCopy | null {
  if (!i.loaded || i.count > 0) return null;
  const bank = i.canLinkBank ? 'Settings → Bank Sync' : null;
  if (i.place !== 'empty') {
    const task = i.place === 'add' ? 'adding a transaction' : 'importing';
    return i.canAdd
      ? { before: 'Add an account on ', link: 'Accounts', after: ` before ${task}.` }
      : { before: `Ask the household owner or an admin to add an account before ${task}.`, link: null, after: '' };
  }
  if (i.canAdd) {
    return { before: 'Add an account on ', link: 'Accounts', after: bank ? `, or connect a bank in ${bank}, to get started.` : ' to get started.' };
  }
  return { before: `Ask the household owner or an admin to add an account${bank ? `, or connect a bank in ${bank}` : ''}.`, link: null, after: '' };
}
