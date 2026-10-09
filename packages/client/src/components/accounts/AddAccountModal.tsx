import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import AccountForm, { type AccountOwner } from '../settings/AccountForm';
import { useSimpleFin } from '../settings/useSimpleFin';
import { useSaveAccount } from './useSaveAccount';

/** Add account from the Accounts page: the Settings account form in a modal. */
export default function AddAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { addToast } = useToast();
  const sf = useSimpleFin();
  const [users, setUsers] = useState<AccountOwner[] | null>(null);
  const { save } = useSaveAccount({ sfAccounts: sf.sfAccounts, reloadSf: sf.reload, onSaved: onCreated });

  useEffect(() => {
    apiFetch<{ data: { id: number; display_name: string }[] }>('/users')
      .then((r) => setUsers(r.data.map((u) => ({ id: u.id, displayName: u.display_name }))))
      .catch(() => { addToast('Failed to load owners', 'error'); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!users) return null;
  return (
    <AccountForm
      users={users}
      sfAccounts={sf.sfAccounts}
      onSave={async (data, linkKey) => { await save(null, data, linkKey); onClose(); }}
      onClose={onClose}
    />
  );
}
