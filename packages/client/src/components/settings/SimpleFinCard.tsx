import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import type { DailySyncInfo } from '@ledger/shared';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteButton from '../ConfirmDeleteButton';
import InlineNotification from '../InlineNotification';
import ResponsiveModal from '../ResponsiveModal';
import Spinner from '../Spinner';
import InstitutionPicker from '../InstitutionPicker';
import { SegmentedControl } from '../primitives';
import { Card, Caption, Pill, LoadError, Field, SelectShell, CheckBox, InitialsAvatar, paletteColor, inputCls, selectCls, textareaCls, btnPrimary, btnSecondary, btnSecondarySm, btnRow, ICON } from './ui';
import { ACCOUNT_TYPES, TYPE_LABEL, CLASSIFICATIONS, CLASSIFICATION_LABEL, classificationForType, guessAccountType, parseNameAndLastFour, sfMask, type Connection, type SfAccount } from './simplefin';
import type { Account, AccountOwner } from './AccountForm';
import { STATUS_META, SUMMARY, dailyIsOff, statusLine, statusOf, worstStatus } from './banksync/status';

// --- Connect / edit connection modal ---
function ConnectionModal({ connection, onSave, onClose }: {
  connection?: Connection;
  onSave: (data: { label: string; shared: boolean; setupToken?: string; accessUrl?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(connection?.label ?? '');
  const [shared, setShared] = useState(connection?.isShared ?? true);
  const [mode, setMode] = useState<'token' | 'url'>('token');
  const [token, setToken] = useState('');
  const [accessUrl, setAccessUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 6000); return () => clearTimeout(t); } }, [error]);

  const credential = mode === 'token' ? token.trim() : accessUrl.trim();
  const ready = label.trim() && (connection || credential);

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      await onSave({ label: label.trim(), shared, ...(mode === 'token' && token.trim() ? { setupToken: token.trim() } : {}), ...(mode === 'url' && accessUrl.trim() ? { accessUrl: accessUrl.trim() } : {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save connection');
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal isOpen onClose={onClose} title={connection ? 'Edit connection' : 'Connect SimpleFIN'} maxWidth="480px"
      footer={(
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button type="button" onClick={submit} disabled={!ready || saving} className={btnPrimary}>{saving ? (connection ? 'Saving…' : 'Connecting…') : connection ? 'Save changes' : 'Connect'}</button>
        </div>
      )}>
      {error && <InlineNotification type="error" message={error} dismissible onDismiss={() => setError(null)} className="mb-4" />}
      <div className="flex flex-col gap-5">
        {!connection && (
          <ol className="flex flex-col gap-2.5 m-0 p-0 list-none">
            {[
              <>Sign in to <a href="https://beta-bridge.simplefin.org" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold">SimpleFIN</a> and connect your banks on their platform.</>,
              <>Generate a setup token and paste it below. Ledger claims it once and keeps the resulting access URL.</>,
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-3 text-[13.5px] text-content-2 leading-snug">
                <span className="flex-none w-[22px] h-[22px] rounded-full bg-surface-2 border border-line-strong text-[12px] font-bold text-content flex items-center justify-center">{i + 1}</span>
                <span className="pt-0.5">{text}</span>
              </li>
            ))}
          </ol>
        )}
        <Field label="Label" hint="How this connection appears in Ledger, e.g. “Household banks”.">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Household banks" autoFocus className={inputCls} />
        </Field>
        <Field label="Who can use it" hint={connection ? 'Scope can’t change after the connection is created.' : shared ? 'Any household user can sync from this connection.' : 'Only you can see and sync from this connection.'}>
          <SegmentedControl value={shared ? 'shared' : 'personal'} onChange={(v) => { if (!connection) setShared(v === 'shared'); }} className="w-full"
            options={[{ value: 'shared', label: 'Shared' }, { value: 'personal', label: 'Personal' }]} />
        </Field>
        <Field
          label={(
            <span className="flex items-center justify-between">
              <span>{mode === 'token' ? 'Setup token' : 'Access URL'}{connection ? ' (optional)' : ''}</span>
              <button type="button" onClick={() => setMode(mode === 'token' ? 'url' : 'token')} className="text-[12.5px] font-semibold text-primary">{mode === 'token' ? 'I have an access URL' : 'I have a setup token'}</button>
            </span>
          )}
          hint={connection ? 'Paste a new token or URL only if the bank connection needs re-authorizing.' : undefined}
        >
          {mode === 'token'
            ? <textarea value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your SimpleFIN setup token…" rows={3} className={`${textareaCls} font-mono text-[13px]`} />
            : <input value={accessUrl} onChange={(e) => setAccessUrl(e.target.value)} placeholder="https://…" className={`${inputCls} font-mono text-[13px]`} />}
        </Field>
      </div>
    </ResponsiveModal>
  );
}

// --- Create a Ledger account from a SimpleFIN account, then link it ---
function CreateAndLinkModal({ sf, users, currentUserId, onSave, onClose }: {
  sf: SfAccount;
  users: AccountOwner[];
  currentUserId: number;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const parsed = parseNameAndLastFour(sf.name);
  const guessedType = guessAccountType(sf.name, sf.balance);
  const [name, setName] = useState(parsed.name);
  const [lastFour, setLastFour] = useState(parsed.lastFour);
  const [type, setType] = useState(guessedType);
  const [classification, setClassification] = useState(classificationForType(guessedType));
  const [owners, setOwners] = useState<Set<number>>(new Set([currentUserId]));
  const [institutionId, setInstitutionId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 6000); return () => clearTimeout(t); } }, [error]);

  const submit = async () => {
    if (!name.trim()) { setError('Account name is required'); return; }
    if (owners.size === 0) { setError('Choose at least one owner'); return; }
    setSaving(true);
    try { await onSave({ name: name.trim(), lastFour: lastFour || null, type, classification, ownerIds: Array.from(owners), institutionId }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to create account'); setSaving(false); }
  };

  return (
    <ResponsiveModal isOpen onClose={onClose} title="Create and link account" description={`${sf.org} · ${sf.name}`} maxWidth="460px"
      footer={(
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>{saving ? 'Creating…' : 'Create and link'}</button>
        </div>
      )}>
      {error && <InlineNotification type="error" message={error} className="mb-4" />}
      <div className="flex flex-col gap-5">
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus className={inputCls} /></Field>
        <Field label="Institution"><InstitutionPicker value={institutionId} onChange={(id) => setInstitutionId(id)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <SelectShell>
              <select value={type} onChange={(e) => { setType(e.target.value); setClassification(classificationForType(e.target.value)); }} className={selectCls}>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </SelectShell>
          </Field>
          <Field label="Last four"><input value={lastFour} onChange={(e) => setLastFour(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" maxLength={5} className={`${inputCls} font-mono`} /></Field>
        </div>
        <Field label="Classification">
          <SelectShell>
            <select value={classification} onChange={(e) => setClassification(e.target.value)} className={selectCls}>
              {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{CLASSIFICATION_LABEL[c]}</option>)}
            </select>
          </SelectShell>
        </Field>
        <Field label={owners.size > 1 ? 'Owners' : 'Owner'}>
          <div className="rounded-[11px] border border-line-strong bg-surface-2 overflow-hidden">
            {users.map((u, i) => {
              const on = owners.has(u.id);
              return (
                <button key={u.id} type="button" role="checkbox" aria-checked={on} onClick={() => setOwners((p) => { const n = new Set(p); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}
                  className={`w-full flex items-center gap-3 px-3.5 h-11 text-left text-sm font-semibold text-content hover:bg-elevated ${i > 0 ? 'border-t border-line' : ''}`}>
                  <CheckBox checked={on} />{u.displayName}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </ResponsiveModal>
  );
}

function StatusPill({ status }: { status: keyof typeof STATUS_META }) {
  const { color, label } = STATUS_META[status];
  return <Pill color={color}><span className="w-[7px] h-[7px] rounded-full" style={{ background: 'currentColor' }} />{label}</Pill>;
}

// --- The card ---
export default function SimpleFinCard({
  accounts, users, connections, sfAccounts, failures, loading, accountsLoading, loadFailed, daily,
  onReload, onAccountCreated, onOpenAccount, onSyncNow,
}: {
  accounts: Account[];
  users: AccountOwner[];
  connections: Connection[];
  sfAccounts: SfAccount[];
  failures: { connectionId: number; label: string; error: string }[];
  loading: boolean;
  accountsLoading: boolean;
  loadFailed: boolean;
  daily: DailySyncInfo | null;
  onReload: () => Promise<void> | void;
  onAccountCreated: () => Promise<void> | void;
  onOpenAccount: (account: Account) => void;
  onSyncNow: () => void;
}) {
  const { addToast } = useToast();
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission('simplefin.manage');
  const canSync = hasPermission('import.bank_sync');
  const [listOpen, setListOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [openOrgs, setOpenOrgs] = useState<Set<string> | null>(null); // null = default (all collapsed)
  const [connectOpen, setConnectOpen] = useState(false);
  const [editingConn, setEditingConn] = useState<Connection | null>(null);
  const [creatingFor, setCreatingFor] = useState<SfAccount | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const by = new Map<string, SfAccount[]>();
    for (const a of sfAccounts) {
      if (q && !(a.name.toLowerCase().includes(q) || a.org.toLowerCase().includes(q) || sfMask(a).includes(q))) continue;
      if (!by.has(a.org)) by.set(a.org, []);
      by.get(a.org)!.push(a);
    }
    return [...by.entries()].map(([org, list]) => ({ org, list, linked: list.filter((a) => a.link).length }));
  }, [sfAccounts, q]);
  const allOpen = openOrgs !== null && groups.every((g) => openOrgs.has(g.org));
  const isOpen = (org: string) => q !== '' || (openOrgs?.has(org) ?? false);
  const toggleOrg = (org: string) => setOpenOrgs((prev) => { const n = new Set(prev ?? []); if (n.has(org)) n.delete(org); else n.add(org); return n; });
  const off = dailyIsOff(daily);
  const worst = worstStatus(connections, off);
  const worstColor = STATUS_META[worst].color;
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const addConnection = async (data: { label: string; shared: boolean; setupToken?: string; accessUrl?: string }) => {
    await apiFetch('/simplefin/connections', { method: 'POST', body: JSON.stringify(data) });
    setConnectOpen(false);
    addToast('SimpleFIN connected');
    await onReload();
  };
  const editConnection = async (id: number, data: { label: string; setupToken?: string; accessUrl?: string }) => {
    await apiFetch(`/simplefin/connections/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    setEditingConn(null);
    addToast('Connection updated');
    await onReload();
  };
  const deleteConnection = async (id: number) => {
    try {
      await apiFetch(`/simplefin/connections/${id}`, { method: 'DELETE' });
      addToast('Connection removed');
      await onReload();
    } catch { addToast('Failed to remove connection', 'error'); }
  };

  const setLink = async (sf: SfAccount, value: string) => {
    if (value === 'create') { setCreatingFor(sf); return; }
    setLinking(sf.key);
    try {
      if (sf.link) await apiFetch(`/simplefin/links/${sf.link.id}`, { method: 'DELETE' });
      if (value) {
        const accountId = Number(value);
        await apiFetch('/simplefin/links', { method: 'POST', body: JSON.stringify({ simplefinConnectionId: sf.connectionId, simplefinAccountId: sf.simplefinAccountId, accountId, simplefinAccountName: sf.name, simplefinOrgName: sf.org }) });
        addToast(`Linked to ${accountById.get(accountId)?.name ?? 'account'}`);
      } else {
        addToast('Account unlinked');
      }
      await onReload();
    } catch { addToast('Failed to update link', 'error'); }
    finally { setLinking(null); }
  };

  const createAndLink = async (sf: SfAccount, data: Record<string, unknown>) => {
    const res = await apiFetch<{ data: { id: number } }>('/accounts', { method: 'POST', body: JSON.stringify(data) });
    await apiFetch('/simplefin/links', { method: 'POST', body: JSON.stringify({ simplefinConnectionId: sf.connectionId, simplefinAccountId: sf.simplefinAccountId, accountId: res.data.id, simplefinAccountName: sf.name, simplefinOrgName: sf.org }) });
    setCreatingFor(null);
    addToast(`Created and linked ${data.name as string}`);
    await onAccountCreated();
    await onReload();
  };

  if (loading) return <Card><Spinner /></Card>;
  if (loadFailed) return <LoadError onRetry={() => { onReload(); }} />;

  // ---- Disconnected ----
  if (connections.length === 0) {
    return (
      <>
        <div className="rounded-[18px] border border-dashed border-line-strong bg-surface px-5 md:px-[26px] py-6 flex items-center gap-5 flex-wrap">
          <span className="flex-none w-[46px] h-[46px] rounded-[12px] bg-surface-2 text-content-3 flex items-center justify-center">{ICON.wifi}</span>
          <div className="flex-1 min-w-[220px]">
            <div className="text-[17px] font-extrabold tracking-tight text-content">Connect your SimpleFIN account</div>
            <div className="text-[13.5px] text-content-3 mt-1 leading-snug max-w-[560px]">
              Set up your bank connections on SimpleFIN, then paste your setup token here. SimpleFIN will populate the accounts you can link to. Plans start at $1.50/month.
            </div>
          </div>
          {canManage ? (
            <button type="button" onClick={() => setConnectOpen(true)} className={btnPrimary}>Connect SimpleFIN</button>
          ) : (
            <span className="text-[13px] text-content-3">An admin manages connections.</span>
          )}
        </div>
        {connectOpen && <ConnectionModal onSave={addConnection} onClose={() => setConnectOpen(false)} />}
      </>
    );
  }

  // ---- Connected ----
  return (
    <Card>
      <div className="flex items-center gap-4 px-4 md:px-6 py-5 flex-wrap">
        <span className="flex-none w-[46px] h-[46px] rounded-[12px] flex items-center justify-center" style={{ background: `color-mix(in srgb, ${worstColor} 15%, transparent)`, color: worstColor }}>{ICON.wifi}</span>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[17px] font-extrabold tracking-tight text-content">SimpleFIN</span>
            <StatusPill status={worst} />
          </div>
          <div className="text-[13px] text-content-3 mt-0.5">{SUMMARY[worst]}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {canSync && <button type="button" onClick={onSyncNow} className={btnSecondarySm}>{ICON.refresh}Sync now</button>}
          {canManage && <button type="button" onClick={() => setConnectOpen(true)} className={btnSecondarySm}>{ICON.plus}Add connection</button>}
        </div>
      </div>

      {/* connections */}
      <div className="border-t border-line px-4 md:px-6 py-3.5">
        <Caption className="mb-1">Connections</Caption>
        <div className="flex flex-col">
          {connections.map((c, i) => {
            const status = statusOf(c, off);
            const reconnect = status === 'reconnect' && <button type="button" onClick={() => setEditingConn(c)} className={btnRow} style={{ color: 'var(--primary)' }}>Reconnect</button>;
            const disconnect = <ConfirmDeleteButton label="Disconnect" confirmLabel="Confirm disconnect?" onConfirm={() => deleteConnection(c.id)} />;
            return (
              <div key={c.id} className={`py-3 ${i > 0 ? 'border-t border-line' : ''}`}>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm font-semibold text-content">{c.label}</span>
                  <span className="h-[22px] px-2 rounded-md text-[11px] font-semibold inline-flex items-center bg-surface-2 text-content-2">{c.isShared ? 'Shared' : 'Personal'}</span>
                  <StatusPill status={status} />
                  {canManage && (
                    <span className="ml-auto hidden md:flex items-center gap-1.5">
                      {reconnect}
                      <button type="button" onClick={() => setEditingConn(c)} title="Edit connection" aria-label={`Edit ${c.label}`} className="w-8 h-8 rounded-[8px] flex items-center justify-center text-content-3 hover:text-content hover:bg-surface-2">{ICON.pencil}</button>
                      {disconnect}
                    </span>
                  )}
                </div>
                <div className="text-[13px] mt-1 leading-snug" style={{ color: status === 'working' || status === 'paused' ? 'var(--text-3)' : STATUS_META[status].color }}>{statusLine(c, off, canManage, daily)}</div>
                <div className="font-mono text-[12px] text-content-3 mt-1">{c.linkedAccountCount} {c.linkedAccountCount === 1 ? 'account' : 'accounts'} linked</div>
                {canManage && (
                  <div className="md:hidden flex items-center gap-1.5 mt-2.5">
                    {reconnect}
                    <button type="button" onClick={() => setEditingConn(c)} className={btnRow}>{ICON.pencil}Edit</button>
                    {disconnect}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* accounts from SimpleFIN */}
      {canManage && <div className="border-t border-line">
        <div className="flex items-center gap-3 px-4 md:px-6 py-3.5 flex-wrap">
          <button type="button" onClick={() => setListOpen((v) => !v)} className="flex items-center gap-2 text-left" aria-expanded={listOpen}>
            <span className={`text-content-3 transition-transform ${listOpen ? 'rotate-90' : ''}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg></span>
            <Caption className="tracking-[0.08em]">Accounts from SimpleFIN</Caption>
            <span className="font-mono text-[12px] text-content-3">· {accountsLoading ? 'loading…' : `${sfAccounts.length} ${sfAccounts.length === 1 ? 'account' : 'accounts'}`}</span>
          </button>
          {listOpen && (
            <div className="ml-auto flex items-center gap-3">
              <label className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-3">{ICON.search}</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SimpleFIN accounts…"
                  className="h-[38px] w-[240px] pl-9 pr-3 rounded-[10px] bg-surface-2 border border-line-strong text-[13.5px] text-content outline-none placeholder:text-content-3" />
              </label>
              <button type="button" onClick={() => setOpenOrgs(allOpen ? new Set() : new Set(groups.map((g) => g.org)))} className="text-[13px] font-semibold text-primary whitespace-nowrap">
                {allOpen ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
          )}
        </div>
        {listOpen && (
          <div className="px-4 md:px-6 pb-5 flex flex-col gap-2.5">
            {accountsLoading && sfAccounts.length === 0 && <Spinner />}
            {!accountsLoading && sfAccounts.length === 0 && failures.length === 0 && <div className="text-sm text-content-3 py-4">SimpleFIN returned no accounts. Add banks on the SimpleFIN side, then refresh.</div>}
            {failures.length > 0 && sfAccounts.length === 0 && <InlineNotification type="error" message={`Couldn’t reach SimpleFIN for ${failures.map((f) => f.label).join(', ')}: ${failures[0].error}`} />}
            {q && groups.length === 0 && sfAccounts.length > 0 && <div className="text-sm text-content-3 py-4">No SimpleFIN accounts match “{search.trim()}”.</div>}
            {groups.map((g) => {
              const open = isOpen(g.org);
              return (
                <div key={g.org} className="rounded-[11px] bg-surface-2 overflow-hidden">
                  <button type="button" onClick={() => toggleOrg(g.org)} className="w-full flex items-center gap-3 px-3.5 py-[11px] text-left" aria-expanded={open}>
                    <InitialsAvatar name={g.org} color={paletteColor(g.org)} size={28} className="!rounded-[8px]" />
                    <span className="text-sm font-bold text-content flex-1 min-w-0 truncate">{g.org}</span>
                    <span className="font-mono text-[12px] text-content-3">{g.list.length} · {g.linked} linked</span>
                    <span className={`text-content-3 transition-transform ${open ? 'rotate-180' : ''}`}>{ICON.chevron}</span>
                  </button>
                  {open && g.list.map((a) => {
                    const mask = sfMask(a);
                    const linked = a.link ? accountById.get(a.link.accountId) : undefined;
                    const busy = linking === a.key;
                    return (
                      <div key={a.key} className="flex items-center gap-3 pl-5 pr-3.5 py-[9px] border-t border-line">
                        <span className="text-[13.5px] font-semibold text-content flex-1 min-w-0 truncate">{parseNameAndLastFour(a.name).name}</span>
                        {mask && <span className="font-mono text-[12px] text-content-3">…{mask}</span>}
                        {a.link ? (
                          <button type="button" onClick={() => linked && onOpenAccount(linked)} title={linked ? 'Open account' : undefined}
                            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12.5px] font-semibold max-w-[260px]" style={{ background: 'color-mix(in srgb, var(--positive) 12%, transparent)', color: 'var(--positive)' }}>
                            {ICON.link}<span className="truncate">{linked?.name ?? 'Linked'}</span>
                          </button>
                        ) : canManage ? (
                          <div className="relative">
                            <select value="" disabled={busy} onChange={(e) => setLink(a, e.target.value)} aria-label={`Link ${a.name}`}
                              className="h-8 pl-3 pr-8 rounded-[8px] bg-surface border border-line-strong text-[12.5px] font-semibold text-content-2 appearance-none cursor-pointer outline-none disabled:opacity-50">
                              <option value="">{busy ? 'Linking…' : 'Link to…'}</option>
                              {(['liquid', 'investment', 'liability'] as const).map((cls) => {
                                const list = accounts.filter((x) => x.is_active && x.classification === cls && !sfAccounts.some((s) => s.link?.accountId === x.id));
                                if (list.length === 0) return null;
                                return <optgroup key={cls} label={CLASSIFICATION_LABEL[cls]}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}{x.last_four ? ` (…${x.last_four})` : ''}</option>)}</optgroup>;
                              })}
                              <option value="create">＋ Create new account…</option>
                            </select>
                            <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-content-3" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                          </div>
                        ) : (
                          <span className="text-content-3">·</span>
                        )}
                        {a.link && canManage && (
                          <button type="button" disabled={busy} onClick={() => setLink(a, '')} title="Unlink" className="w-7 h-7 rounded-[7px] flex items-center justify-center text-content-3 hover:text-negative hover:bg-surface disabled:opacity-50">{ICON.unlink}</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {connectOpen && <ConnectionModal onSave={addConnection} onClose={() => setConnectOpen(false)} />}
      {editingConn && <ConnectionModal connection={editingConn} onSave={(d) => editConnection(editingConn.id, d)} onClose={() => setEditingConn(null)} />}
      {creatingFor && <CreateAndLinkModal sf={creatingFor} users={users} currentUserId={user?.id ?? 0} onSave={(d) => createAndLink(creatingFor, d)} onClose={() => setCreatingFor(null)} />}
    </Card>
  );
}
