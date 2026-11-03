import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { LinkStepError, createAccountSaver, type LinkableSfAccount } from '../../lib/accounts';
import { useToast } from '../../context/ToastContext';
import type { AccountFormData } from '../settings/AccountForm';

/**
 * The save handler for `AccountForm`, shared by Settings and Accounts.
 * `existingId` null means "create". If the account is created but its
 * SimpleFIN link fails, the list is refreshed and the error goes back to the
 * form; saving again updates that account instead of creating a second one.
 * Call `reset()` when the form closes.
 */
export function useSaveAccount({ sfAccounts, reloadSf, onSaved }: {
  sfAccounts: LinkableSfAccount[];
  reloadSf: () => unknown;
  onSaved: (accountId: number) => unknown;
}) {
  const { addToast } = useToast();
  const [saver] = useState(() => createAccountSaver(apiFetch));

  const save = async (existingId: number | null, data: AccountFormData, linkKey: string | null | undefined) => {
    try {
      const res = await saver.save(existingId, data, linkKey, sfAccounts);
      if (linkKey !== undefined) reloadSf();
      addToast(res.created ? 'Account created' : 'Account saved');
      onSaved(res.accountId);
    } catch (err) {
      if (err instanceof LinkStepError) { reloadSf(); onSaved(err.accountId); }
      throw err;
    }
  };

  return { save, reset: saver.reset };
}
