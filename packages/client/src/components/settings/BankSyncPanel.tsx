import { useCallback, useEffect, useState } from 'react';
import type { DailySyncInfo } from '@ledger/shared';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import ManualImportModal from '../ManualImportModal';
import SimpleFinCard from './SimpleFinCard';
import type { useSimpleFin } from './useSimpleFin';
import type { Account, AccountOwner } from './AccountForm';
import { PanelHeader, ICON } from './ui';

/** Settings → Bank sync: every SimpleFIN connection with one honest status each. */
export default function BankSyncPanel({ sf, accounts, users, onAccountsChanged, onOpenAccount }: {
  sf: ReturnType<typeof useSimpleFin>;
  accounts: Account[];
  users: AccountOwner[];
  onAccountsChanged: () => void;
  onOpenAccount: (account: Account) => void;
}) {
  const { hasPermission } = useAuth();
  const [daily, setDaily] = useState<DailySyncInfo | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);

  // Only read to know whether daily sync is off (Paused wording); if it can't load, connections read as on.
  const loadDaily = useCallback(async () => {
    try { setDaily((await apiFetch<{ data: DailySyncInfo }>('/simplefin/daily-sync')).data); } catch { setDaily(null); }
  }, []);
  useEffect(() => { loadDaily(); }, [loadDaily]);

  return (
    <div className="flex flex-col gap-[22px]">
      <PanelHeader title="Bank sync" description="Your SimpleFIN connections bring in transactions and balances." />
      {!hasPermission('simplefin.manage') && (
        <div className="flex items-center gap-2 text-[13px] text-content-3">{ICON.info}<span>An admin manages connections.</span></div>
      )}
      <SimpleFinCard
        accounts={accounts}
        users={users}
        connections={sf.connections}
        sfAccounts={sf.sfAccounts}
        failures={sf.failures}
        loading={sf.loading}
        accountsLoading={sf.accountsLoading}
        loadFailed={sf.loadFailed}
        daily={daily}
        onReload={async () => { await Promise.all([sf.reload(), loadDaily()]); }}
        onAccountCreated={onAccountsChanged}
        onOpenAccount={onOpenAccount}
        onSyncNow={() => setSyncOpen(true)}
      />
      {syncOpen && <ManualImportModal onClose={() => setSyncOpen(false)} onImported={() => { onAccountsChanged(); sf.reload(); }} />}
    </div>
  );
}
