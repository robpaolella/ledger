import { useState, useEffect, useCallback } from 'react';
import type { ContributionSetup, ContributionSetupCreate } from '@ledger/shared/src/types.js';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { getCategoryEmoji } from '../../lib/categoryMeta';
import Spinner from '../Spinner';
import type { Account } from './AccountForm';
import type { Category, Group } from './CategoriesPanel';
import ContributionForm from './contributions/ContributionForm';
import { HowItCounts } from './contributions/HowItCounts';
import { Card, CardHeader, ICON, LoadError, PanelHeader, btnPrimarySm, btnRow } from './ui';

const DESCRIPTION = 'Track money you move into accounts like a 529, a retirement account or a brokerage account. Reports shows it in its own Contributions section. It never counts as income or spending.';

const EXTERNAL = 'An account not in Ledger';

function PaysInto({ setup }: { setup: ContributionSetup }) {
  const parts = [
    ...setup.accounts.map((a) => <span key={a.id}><b className="font-semibold text-content-2">{a.name}</b>{!a.isActive && ' (Inactive)'}</span>),
    ...(setup.external ? [<b key="ext" className="font-semibold text-content-2">{EXTERNAL}</b>] : []),
  ];
  return <>Pays into {parts.map((p, i) => <span key={i}>{i > 0 && ', '}{p}</span>)}</>;
}

export default function ContributionsPanel({ categories, groups, accounts, onChanged }: {
  categories: Category[];
  groups: Group[];
  accounts: Account[];
  onChanged: () => Promise<void> | void;
}) {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();
  const [setups, setSetups] = useState<ContributionSetup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<ContributionSetup | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: ContributionSetup[] }>('/contributions/setups');
      setSetups(res.data);
      setFailed(false);
    } catch { setFailed(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => { await Promise.all([load(), onChanged()]); };

  const save = async (body: Pick<ContributionSetupCreate, 'accountIds' | 'external'> & Partial<ContributionSetupCreate>) => {
    if (editing === 'new') await apiFetch('/contributions/setups', { method: 'POST', body: JSON.stringify(body) });
    else if (editing) await apiFetch(`/contributions/setups/${editing.id}`, { method: 'PUT', body: JSON.stringify({ accountIds: body.accountIds, external: body.external }) });
    addToast(editing === 'new' ? 'Contribution added' : 'Contribution saved');
    setEditing(null);
    await refresh();
  };

  const stop = async () => {
    if (!editing || editing === 'new') return;
    await apiFetch(`/contributions/setups/${editing.id}`, { method: 'DELETE' });
    addToast(`Stopped tracking ${editing.category.name}`);
    setEditing(null);
    await refresh();
  };

  return (
    <div className="flex flex-col gap-[22px]">
      <PanelHeader title="Contributions" description={DESCRIPTION}
        actions={!failed && setups && <button type="button" onClick={() => setEditing('new')} className={btnPrimarySm}>{ICON.plus}Add contribution</button>} />

      {failed ? <LoadError onRetry={() => { setFailed(false); load(); }} /> : !setups ? <Spinner /> : (
        <>
          <Card>
            <CardHeader title="Tracked categories" meta={`${setups.length} ${setups.length === 1 ? 'category' : 'categories'}`} />
            {setups.length === 0 ? (
              <div className="border-t border-line px-6 py-10 text-center">
                <div className="text-[15px] font-bold text-content">No contributions tracked yet</div>
                <div className="text-sm text-content-3 mt-1 max-w-[460px] mx-auto leading-snug">Put money into a 529, a retirement account or a brokerage account? Track it here to see how much went in over any period on Reports. Contributions are moves between your own accounts, so they never count as income or spending.</div>
              </div>
            ) : setups.map((s) => (
              <div key={s.id} onClick={() => setEditing(s)}
                className="group/row flex items-center gap-3 md:gap-4 px-4 md:px-6 min-h-[64px] py-2.5 border-t border-line cursor-pointer hover:bg-surface-2 active:bg-surface-2 transition-colors">
                <span aria-hidden="true" className="w-[34px] h-[34px] rounded-full bg-surface-2 flex items-center justify-center text-[17px] shrink-0">{s.category.emoji || getCategoryEmoji(s.category.name, s.category.groupName)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-bold text-content">{s.category.name}</div>
                  <div className="text-[12.5px] text-content-3 mt-0.5 leading-snug"><PaysInto setup={s} /></div>
                </div>
                <span className="hidden md:block">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(s); }} className={btnRow}>{ICON.pencil}Edit</button>
                </span>
                <svg className="md:hidden shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
              </div>
            ))}
          </Card>
          <HowItCounts />
        </>
      )}

      {editing !== null && (
        <ContributionForm
          setup={editing === 'new' ? undefined : editing}
          trackedIds={new Set((setups ?? []).map((s) => s.category.id))}
          categories={categories} groups={groups} accounts={accounts}
          canCreateCategory={hasPermission('categories.create')}
          onSave={save} onStop={editing === 'new' ? undefined : stop} onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
