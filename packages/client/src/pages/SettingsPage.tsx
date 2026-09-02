import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import PageHeader from '../components/PageHeader';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { setCategoryEmojiOverrides } from '../lib/categoryMeta';
import { initOwnerSlots, OwnerBadge, SharedBadge } from '../components/badges';
import { VendorAvatar } from '../components/primitives';
import Spinner from '../components/Spinner';
import PermissionGate from '../components/PermissionGate';
import InstitutionManager from '../components/InstitutionManager';
import ManualImportModal from '../components/ManualImportModal';
import MerchantsPanel from '../components/MerchantsPanel';
import AccountForm, { type Account, type AccountOwner, type AccountFormData } from '../components/settings/AccountForm';
import SimpleFinCard from '../components/settings/SimpleFinCard';
import { useSimpleFin } from '../components/settings/useSimpleFin';
import CategoriesPanel, { type Category, type Group } from '../components/settings/CategoriesPanel';
import ProfilePanel from '../components/settings/ProfilePanel';
import SecurityPanel from '../components/settings/SecurityPanel';
import UsersPanel from '../components/settings/UsersPanel';
import AiPanel from '../components/settings/AiPanel';
import { Card, CardHeader, PanelHeader, btnPrimarySm, btnSecondarySm, btnRow, ICON } from '../components/settings/ui';
import { TYPE_LABEL, sfLabel } from '../components/settings/simplefin';

type PanelId = 'profile' | 'security' | 'accounts' | 'categories' | 'merchants' | 'users' | 'ai';

const NAV_ICON: Record<PanelId, ReactNode> = {
  profile: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
  security: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" /></svg>,
  accounts: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4h-4Z" /></svg>,
  categories: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>,
  merchants: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6" /></svg>,
  users: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg>,
  ai: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="4" /></svg>,
};

export default function SettingsPage() {
  const { addToast } = useToast();
  const { isAdmin, hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [userList, setUserList] = useState<AccountOwner[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null | 'new'>(null);
  const [showInstitutions, setShowInstitutions] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const sf = useSimpleFin();

  const rawPanel = searchParams.get('panel');
  const legacyTab = searchParams.get('tab');
  const panel = (rawPanel || (legacyTab === 'preferences' ? 'profile' : 'accounts')) as PanelId;
  const setPanel = (p: PanelId) => setSearchParams({ panel: p });
  // Phones: /settings is an index of sections; picking one shows that panel
  // full-width with a back link. Desktop keeps the two-column layout.
  const isMobile = useIsMobile();
  const showIndex = isMobile && !rawPanel && !legacyTab;
  const showNav = !isMobile || showIndex;
  const showPanel = !isMobile || !showIndex;

  const loadData = useCallback(async () => {
    try {
      const [acctRes, catRes, groupRes, userRes] = await Promise.all([
        apiFetch<{ data: Account[] }>('/accounts'),
        apiFetch<{ data: Category[] }>('/categories'),
        apiFetch<{ data: Group[] }>('/categories/groups'),
        apiFetch<{ data: { id: number; display_name: string }[] }>('/users'),
      ]);
      setAccounts(acctRes.data);
      setCategories(catRes.data);
      setGroups(groupRes.data);
      // Publish stored emoji to the app-wide override map so every other page
      // (Transactions, Reports, Recurring, …) reflects edits immediately.
      setCategoryEmojiOverrides(catRes.data);
      setUserList(userRes.data.map((u) => ({ id: u.id, displayName: u.display_name })));
      initOwnerSlots(userRes.data.map((u) => u.id));
    } catch {
      addToast('Failed to load settings', 'error');
    } finally {
      setLoaded(true);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // accountId → its SimpleFIN link (drives the link pill + the import toggle)
  const sfByAccount = new Map(sf.sfAccounts.filter((s) => s.link).map((s) => [s.link!.accountId, s]));

  const saveAccount = async (data: AccountFormData, linkKey: string | null | undefined) => {
    let accountId: number;
    if (editingAccount === 'new') {
      const res = await apiFetch<{ data: { id: number } }>('/accounts', { method: 'POST', body: JSON.stringify(data) });
      accountId = res.data.id;
    } else if (editingAccount) {
      await apiFetch(`/accounts/${editingAccount.id}`, { method: 'PUT', body: JSON.stringify(data) });
      accountId = editingAccount.id;
    } else return;

    // Link change: drop the previous link on this account (and on the target
    // SimpleFIN account, if it was linked elsewhere), then create the new one.
    if (linkKey !== undefined) {
      const previous = sfByAccount.get(accountId);
      if (previous?.link) await apiFetch(`/simplefin/links/${previous.link.id}`, { method: 'DELETE' });
      if (linkKey) {
        const target = sf.sfAccounts.find((s) => s.key === linkKey);
        if (target) {
          if (target.link && target.link.accountId !== accountId) await apiFetch(`/simplefin/links/${target.link.id}`, { method: 'DELETE' });
          await apiFetch('/simplefin/links', { method: 'POST', body: JSON.stringify({ simplefinConnectionId: target.connectionId, simplefinAccountId: target.simplefinAccountId, accountId, simplefinAccountName: target.name, simplefinOrgName: target.org }) });
        }
      }
      sf.reload();
    }
    setEditingAccount(null);
    addToast(editingAccount === 'new' ? 'Account created' : 'Account saved');
    loadData();
  };

  const toggleAutoImport = async (accountId: number, next: boolean) => {
    const link = sfByAccount.get(accountId)?.link;
    if (!link) return;
    try {
      await apiFetch(`/simplefin/links/${link.id}`, { method: 'PATCH', body: JSON.stringify({ autoImport: next }) });
      await sf.reload();
    } catch {
      addToast('Failed to update transaction import', 'error');
    }
  };

  const deleteAccount = async (): Promise<string | null> => {
    if (!editingAccount || editingAccount === 'new') return null;
    try {
      await apiFetch(`/accounts/${editingAccount.id}`, { method: 'DELETE' });
      setEditingAccount(null);
      addToast('Account removed');
      loadData();
      sf.reload();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Failed to remove account';
    }
  };

  const refreshAll = async () => { await Promise.all([loadData(), sf.reload()]); addToast('Refreshed'); };

  const navSections: { title: string; items: { id: PanelId; label: string }[] }[] = [
    { title: 'Account', items: [{ id: 'profile', label: 'Profile' }, { id: 'security', label: 'Security' }] },
    { title: 'Household', items: [
      { id: 'accounts', label: 'Accounts' },
      { id: 'categories', label: 'Categories' },
      { id: 'merchants', label: 'Merchants' },
      { id: 'users', label: 'Users' },
      ...(isAdmin() ? [{ id: 'ai' as PanelId, label: 'AI' }] : []),
    ] },
  ];

  const activeAccounts = accounts.filter((a) => a.is_active);

  return (
    <div>
      <PageHeader
        mobileTitle={showIndex ? 'Settings' : (navSections.flatMap((sec) => sec.items).find((it) => it.id === panel)?.label ?? 'Settings')}
        mobileBack={showIndex ? undefined : '/settings'}
        left={!isMobile && (
          <div className="flex items-center gap-2.5">
            <span className="text-content-3"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg></span>
            <h1 className="page-title text-[22px] font-extrabold text-content tracking-tight leading-tight m-0">Settings</h1>
          </div>
        )} />

      <div className="flex flex-col md:flex-row gap-7 items-start">
        {/* settings nav (phones: the index) */}
        {showNav && (
        <nav className="w-full md:w-[268px] md:shrink-0 flex flex-col gap-4 md:gap-[22px] md:sticky md:top-24" aria-label="Settings sections">
          {navSections.map((sec) => (
            <div key={sec.title} className="bg-surface border border-line rounded-[16px] shadow-sm">
              <div className="px-[18px] pt-4 pb-2 font-mono text-[12px] tracking-[0.1em] uppercase text-content-3">{sec.title}</div>
              <div className="px-2 pb-2.5 flex flex-col gap-0.5">
                {sec.items.map((it) => {
                  const active = panel === it.id;
                  return (
                    <button key={it.id} type="button" onClick={() => setPanel(it.id)} aria-current={active ? 'page' : undefined}
                      className="flex items-center gap-[11px] w-full text-left h-12 md:h-10 px-3 rounded-[10px] text-[15px] md:text-sm font-semibold transition-colors hover:bg-surface-2 active:bg-surface-2"
                      style={{ color: active && !isMobile ? 'var(--primary)' : 'var(--text)', background: active && !isMobile ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : undefined }}>
                      <span className={active && !isMobile ? 'text-primary' : 'text-content-3'}>{NAV_ICON[it.id]}</span>
                      <span className="flex-1">{it.label}</span>
                      {isMobile && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="shrink-0"><path d="m9 6 6 6-6 6" /></svg>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        )}

        {/* content pane */}
        {showPanel && (
        <div className="flex-1 min-w-0 w-full">
          {panel === 'profile' && <ProfilePanel />}
          {panel === 'security' && <SecurityPanel />}
          {panel === 'merchants' && <MerchantsPanel />}
          {panel === 'users' && <UsersPanel />}
          {panel === 'ai' && isAdmin() && <AiPanel />}
          {panel === 'categories' && (loaded ? <CategoriesPanel categories={categories} groups={groups} onChanged={loadData} /> : <Spinner />)}

          {panel === 'accounts' && (
            <div className="flex flex-col gap-[22px]">
              <PanelHeader
                title="Accounts"
                description="Create the accounts you want to track in Ledger, then link each one to a SimpleFIN account to sync balances and transactions automatically."
                actions={(
                  <>
                    <button type="button" onClick={refreshAll} className={btnSecondarySm}>{ICON.refresh}Refresh all</button>
                    <PermissionGate permission="accounts.create" fallback="disabled">
                      <button type="button" onClick={() => setEditingAccount('new')} className={btnPrimarySm}>{ICON.plus}Add account</button>
                    </PermissionGate>
                  </>
                )}
              />

              <SimpleFinCard
                accounts={accounts}
                users={userList}
                connections={sf.connections}
                sfAccounts={sf.sfAccounts}
                failures={sf.failures}
                loading={sf.loading}
                accountsLoading={sf.accountsLoading}
                onReload={sf.reload}
                onAccountCreated={loadData}
                onOpenAccount={(a) => { if (hasPermission('accounts.edit')) setEditingAccount(a); }}
                onSyncNow={() => setSyncOpen(true)}
              />

              <Card>
                <CardHeader
                  title="Your accounts"
                  meta={loaded ? `${activeAccounts.length} ${activeAccounts.length === 1 ? 'account' : 'accounts'}` : undefined}
                  actions={<button type="button" onClick={() => setShowInstitutions(true)} className={btnRow}>Institutions</button>}
                />
                {!loaded ? <Spinner /> : activeAccounts.map((a) => {
                  const link = sfByAccount.get(a.id);
                  const canEdit = hasPermission('accounts.edit');
                  return (
                    <div key={a.id} onClick={() => { if (canEdit) setEditingAccount(a); }}
                      className={`group/acct flex items-center gap-3 md:gap-4 px-4 md:px-6 min-h-[72px] py-2.5 border-t border-line transition-colors ${canEdit ? 'cursor-pointer hover:bg-surface-2 active:bg-surface-2' : ''}`}>
                      <VendorAvatar name={a.institutionRef?.name || a.name} src={a.avatar_url || a.institutionRef?.logo_url || undefined} color={a.institutionRef?.color || 'var(--c-blue)'} size={38} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[15px] font-bold text-content truncate">{a.name}</span>
                          {a.last_four && <span className="font-mono text-[12px] text-content-3">…{a.last_four}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 min-w-0">
                          <span className="text-[13px] text-content-3 truncate">{TYPE_LABEL[a.type] ?? a.type}</span>
                          {a.isShared ? <SharedBadge /> : (a.owners || []).map((o) => <OwnerBadge key={o.id} user={o} />)}
                        </div>
                        {/* phones: sync status reads as a caption under the name */}
                        <div className="md:hidden flex items-center gap-1.5 mt-1 text-[12px] font-semibold min-w-0" style={{ color: link ? 'var(--positive)' : 'var(--text-3)' }}>
                          {link ? ICON.link : ICON.unlink}<span className="truncate">{link ? sfLabel(link) : 'Not linked'}</span>
                        </div>
                      </div>
                      {link ? (
                        <span className="hidden md:inline-flex items-center gap-1.5 h-7 px-[11px] rounded-lg text-[12.5px] font-semibold max-w-[320px]" style={{ background: 'color-mix(in srgb, var(--positive) 12%, transparent)', color: 'var(--positive)' }} title={sfLabel(link)}>
                          {ICON.link}<span className="truncate">{sfLabel(link)}</span>
                        </span>
                      ) : (
                        <span className="hidden md:inline-flex items-center gap-1.5 h-7 px-[11px] rounded-lg text-[12.5px] font-semibold bg-surface-2 border border-line text-content-3">
                          {ICON.unlink}Not linked
                        </span>
                      )}
                      {canEdit && !isMobile && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setEditingAccount(a); }}
                          className={`${btnRow} opacity-60 group-hover/acct:opacity-100 transition-opacity`}>{ICON.pencil}Edit</button>
                      )}
                      {canEdit && isMobile && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="shrink-0"><path d="m9 6 6 6-6 6" /></svg>}
                    </div>
                  );
                })}
                {loaded && activeAccounts.length === 0 && (
                  <div className="border-t border-line px-6 py-10 text-center">
                    <div className="text-[15px] font-bold text-content">No accounts yet</div>
                    <div className="text-sm text-content-3 mt-1">Add an account by hand, or link one from SimpleFIN above.</div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
        )}
      </div>

      {editingAccount !== null && (
        <AccountForm
          account={editingAccount === 'new' ? undefined : editingAccount}
          users={userList}
          sfAccounts={sf.sfAccounts}
          syncLink={editingAccount !== 'new' && sfByAccount.get(editingAccount.id)?.link ? { linkId: sfByAccount.get(editingAccount.id)!.link!.id, autoImport: sfByAccount.get(editingAccount.id)!.link!.autoImport } : undefined}
          onToggleAutoImport={editingAccount !== 'new' ? (next) => toggleAutoImport(editingAccount.id, next) : undefined}
          onSave={saveAccount}
          onDelete={editingAccount !== 'new' && hasPermission('accounts.delete') ? deleteAccount : undefined}
          onClose={() => setEditingAccount(null)}
          onAvatarChanged={loadData}
        />
      )}
      {showInstitutions && (
        <InstitutionManager canEdit={hasPermission('accounts.edit')} onClose={() => { setShowInstitutions(false); loadData(); }} />
      )}
      {syncOpen && (
        <ManualImportModal onClose={() => setSyncOpen(false)} onImported={() => { loadData(); sf.reload(); }} />
      )}
    </div>
  );
}
