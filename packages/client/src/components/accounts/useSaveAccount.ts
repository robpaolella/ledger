import { useRef } from 'react';
import { apiFetch } from '../../lib/api';
import { LinkStepError, saveAccountWithLink, type LinkableSfAccount } from '../../lib/accounts';
import { useToast } from '../../context/ToastContext';
import type { AccountFormData } from '../settings/AccountForm';

/**
 * The save handler for `AccountForm`, shared by Settings and Accounts.
 * `existingId` null means "create". If the account is created but its
 * SimpleFIN link fails, the list is refreshed and the error goes back to the
 * form; a retry then updates that account instead of creating a second one.
 * Call `reset()` when the form closes.
 */
export function useSaveAccount({ sfAccounts, reloadSf, onSaved }: {
  sfAccounts: LinkableSfAccount[];
  reloadSf: () => unknown;
  onSaved: () => unknown;
}) {
  const { addToast } = useToast();
  const createdId = useRef<number | null>(null);

  const save = async (existingId: number | null, data: AccountFormData, linkKey: string | null | undefined) => {
    const accountId = existingId ?? createdId.current;
    try {
      const res = await saveAccountWithLink(apiFetch, { accountId, data, linkKey, sfAccounts });
      createdId.current = null;
      if (linkKey !== undefined) reloadSf();
      addToast(res.created ? 'Account created' : 'Account saved');
      onSaved();
    } catch (err) {
      if (err instanceof LinkStepError) {
        if (existingId === null) createdId.current = err.accountId;
        reloadSf();
        onSaved();
      }
      throw err;
    }
  };

  return { save, reset: () => { createdId.current = null; } };
}
