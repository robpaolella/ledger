import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { fmt, timeAgo } from '../lib/formatters';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import ConfirmDeleteButton from './ConfirmDeleteButton';
import PermissionGate from './PermissionGate';
import Tooltip from './Tooltip';
import { ConnectedBadge } from './badges';
import InlineNotification from './InlineNotification';
import ResponsiveModal from './ResponsiveModal';
import InstitutionPicker from './InstitutionPicker';

interface Connection {
  id: number;
  label: string;
  isShared: boolean;
  linkedAccountCount: number;
  lastSyncedAt: string | null;
}

interface SimpleFINAccount {
  simplefinAccountId: string;
  name: string;
  balance: number;
  currency: string;
  org: string;
  link: { id: number; accountId: number; lastSyncedAt: string | null; autoImport: number } | null;
}

interface LedgerAccount {
  id: number;
  name: string;
  last_four: string | null;
  type: string;
  classification: string;
  owner: string;
  owners: { id: number; displayName: string }[];
  isShared: boolean;
  is_active: number;
}

const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'investment', 'retirement', 'venmo', 'cash'];
const CLASSIFICATIONS = ['liquid', 'investment', 'liability'];

function classificationForType(type: string): string {
  if (['checking', 'savings', 'venmo', 'cash'].includes(type)) return 'liquid';
  if (['investment', 'retirement'].includes(type)) return 'investment';
  if (type === 'credit') return 'liability';
  return 'liquid';
}

function guessAccountType(sfName: string, balance: number): string {
  const lower = sfName.toLowerCase();
  if (balance < 0) return 'credit';
  if (/savings/.test(lower)) return 'savings';
  if (/checking/.test(lower)) return 'checking';
  if (/ira|roth|401k/.test(lower)) return 'retirement';
  return 'checking';
}

function parseNameAndLastFour(sfName: string): { name: string; lastFour: string } {
  const match = sfName.match(/^(.+?)\s*\((\d{4,5})\)\s*$/);
  if (match) return { name: match[1].trim(), lastFour: match[2] };
  return { name: sfName, lastFour: '' };
}

// --- New Account Form (simplified, for creating from SF linking) ---
function NewAccountForm({
  defaults,
  users,
  currentUserId,
  isShared,
  onSave,
  onClose,
}: {
  defaults: { name: string; lastFour: string; type: string; classification: string };
  users: { id: number; displayName: string }[];
  currentUserId: number;
  isShared: boolean;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaults.name);
  const [lastFour, setLastFour] = useState(defaults.lastFour);
  const [type, setType] = useState(defaults.type);
  const [classification, setClassification] = useState(defaults.classification);
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<Set<number>>(new Set(isShared ? [] : [currentUserId]));
  const [institutionId, setInstitutionId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t); }
  }, [error]);

  return (
    <ResponsiveModal isOpen={true} onClose={onClose}>
      <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-4">Create & Link Account</h3>
      {error && (
        <InlineNotification type="error" message={error} className="mb-3" />
      )}
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Account Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Last Four</label>
          <input value={lastFour} onChange={(e) => setLastFour(e.target.value)} inputMode="numeric"
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" maxLength={5} />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Type</label>
          <select value={type} onChange={(e) => { setType(e.target.value); setClassification(classificationForType(e.target.value)); }}
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none capitalize text-[var(--text-body)]">
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Classification</label>
          <select value={classification} onChange={(e) => setClassification(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none capitalize text-[var(--text-body)]">
            {CLASSIFICATIONS.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Institution</label>
          <InstitutionPicker value={institutionId} onChange={(id) => setInstitutionId(id)} />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Owner</label>
          <div className="flex gap-2">
            {users.map((u) => (
              <button key={u.id} type="button"
                onClick={() => {
                  setSelectedOwnerIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(u.id)) { if (next.size > 1) next.delete(u.id); }
                    else next.add(u.id);
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border cursor-pointer transition-colors ${
                  selectedOwnerIds.has(u.id)
                    ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-[var(--btn-primary-bg)] btn-primary'
                    : 'bg-[var(--bg-card)] text-[var(--text-body)] border-[var(--table-border)] btn-secondary'
                }`}>
                {u.displayName}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-5 justify-end">
        <button onClick={onClose}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] border-none cursor-pointer btn-secondary">
          Cancel
        </button>
        <button disabled={saving} onClick={async () => {
          if (!name.trim()) { setError('Account name is required'); return; }
          if (selectedOwnerIds.size === 0) { setError('At least one owner is required'); return; }
          setSaving(true);
          try {
            await onSave({ name, lastFour: lastFour || null, type, classification, ownerIds: Array.from(selectedOwnerIds), institutionId });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create account');
            setSaving(false);
          }
        }}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-none cursor-pointer disabled:opacity-50 btn-primary">
          {saving ? 'Creating...' : 'Create & Link'}
        </button>
      </div>
    </ResponsiveModal>
  );
}

// --- Account Linking Table ---
function AccountLinkingTable({
  connectionId,
  isShared,
  accounts,
  users,
  currentUserId,
  onAccountCreated,
}: {
  connectionId: number;
  isShared: boolean;
  accounts: LedgerAccount[];
  users: { id: number; displayName: string }[];
  currentUserId: number;
  onAccountCreated: () => void;
}) {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('simplefin.manage');
  const [sfAccounts, setSfAccounts] = useState<SimpleFINAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingForSfId, setCreatingForSfId] = useState<string | null>(null);
  const [savingLink, setSavingLink] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: SimpleFINAccount[] }>(`/simplefin/connections/${connectionId}/accounts`);
      setSfAccounts(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch accounts');
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const linkedCount = sfAccounts.filter((a) => a.link).length;

  const handleLinkChange = async (sfAcct: SimpleFINAccount, ledgerAccountId: string) => {
    setSavingLink(sfAcct.simplefinAccountId);
    try {
      if (ledgerAccountId === '' || ledgerAccountId === 'unlinked') {
        // Unlink
        if (sfAcct.link) {
          await apiFetch(`/simplefin/links/${sfAcct.link.id}`, { method: 'DELETE' });
          addToast(`Account unlinked: ${sfAcct.name}`);
          setSfAccounts((prev) =>
            prev.map((a) => a.simplefinAccountId === sfAcct.simplefinAccountId ? { ...a, link: null } : a)
          );
        }
      } else if (ledgerAccountId === 'create-new') {
        setCreatingForSfId(sfAcct.simplefinAccountId);
      } else {
        // Link to existing account
        const accountId = parseInt(ledgerAccountId);
        const ledgerAcct = accounts.find((a) => a.id === accountId);

        // Delete existing link first
        if (sfAcct.link) {
          await apiFetch(`/simplefin/links/${sfAcct.link.id}`, { method: 'DELETE' });
        }

        const res = await apiFetch<{ data: { id: number; autoImport: number } }>('/simplefin/links', {
          method: 'POST',
          body: JSON.stringify({
            simplefinConnectionId: connectionId,
            simplefinAccountId: sfAcct.simplefinAccountId,
            accountId,
            simplefinAccountName: sfAcct.name,
            simplefinOrgName: sfAcct.org,
          }),
        });

        addToast(`Account linked: ${ledgerAcct?.name ?? 'Account'} → ${sfAcct.name}`);
        setSfAccounts((prev) =>
          prev.map((a) =>
            a.simplefinAccountId === sfAcct.simplefinAccountId
              ? { ...a, link: { id: res.data.id, accountId, lastSyncedAt: null, autoImport: res.data.autoImport } }
              : a
          )
        );
      }
    } catch (_err) {
      addToast('Failed to update link', 'error');
    } finally {
      setSavingLink(null);
    }
  };

  const handleCreateAndLink = async (sfAcctId: string, data: Record<string, unknown>) => {
    const sfAcct = sfAccounts.find((a) => a.simplefinAccountId === sfAcctId);
    if (!sfAcct) return;

    // Create account
    const res = await apiFetch<{ data: { id: number } }>('/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const newAccountId = res.data.id;

    // Link it
    const linkRes = await apiFetch<{ data: { id: number; autoImport: number } }>('/simplefin/links', {
      method: 'POST',
      body: JSON.stringify({
        simplefinConnectionId: connectionId,
        simplefinAccountId: sfAcctId,
        accountId: newAccountId,
        simplefinAccountName: sfAcct.name,
        simplefinOrgName: sfAcct.org,
      }),
    });

    addToast(`Created & linked: ${data.name} → ${sfAcct.name}`);
    setSfAccounts((prev) =>
      prev.map((a) =>
        a.simplefinAccountId === sfAcctId
          ? { ...a, link: { id: linkRes.data.id, accountId: newAccountId, lastSyncedAt: null, autoImport: linkRes.data.autoImport } }
          : a
      )
    );
    setCreatingForSfId(null);
    onAccountCreated();
  };

  // Group accounts by classification
  const grouped = new Map<string, LedgerAccount[]>();
  for (const acct of accounts.filter((a) => a.is_active)) {
    const cls = acct.classification;
    if (!grouped.has(cls)) grouped.set(cls, []);
    grouped.get(cls)!.push(acct);
  }

  if (loading) {
    return (
      <div className="py-4 text-center text-[13px] text-[var(--text-muted)]">
        Loading SimpleFIN accounts...
      </div>
    );
  }
  if (error) {
    return (
      <InlineNotification type="error" message={error} />
    );
  }
  if (sfAccounts.length === 0) {
    return (
      <div className="py-4 text-center text-[13px] text-[var(--text-muted)]">
        No accounts found for this connection.
      </div>
    );
  }

  return (
    <div className="mt-2">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">SimpleFIN Account</th>
            <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-right">Balance</th>
            <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left" style={{ width: '260px' }}>Ledger Account</th>
          </tr>
        </thead>
        <tbody>
          {sfAccounts.map((sfAcct) => (
            <tr key={sfAcct.simplefinAccountId}
              className={`border-b border-[var(--table-row-border)] ${!sfAcct.link ? 'bg-[var(--bg-needs-attention)]' : ''}`}>
              <td className="px-2.5 py-2">
                <div className="font-medium text-[var(--text-primary)] text-[13px]">{sfAcct.name}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{sfAcct.org}</div>
              </td>
              <td className="px-2.5 py-2 text-right font-mono text-[13px]">
                <span className={sfAcct.balance < 0 ? 'text-[#ef4444]' : 'text-[var(--text-body)]'}>
                  {sfAcct.balance < 0 ? `(${fmt(Math.abs(sfAcct.balance))})` : fmt(sfAcct.balance)}
                </span>
              </td>
              <td className="px-2.5 py-1.5">
                <select
                  value={sfAcct.link ? String(sfAcct.link.accountId) : 'unlinked'}
                  onChange={(e) => handleLinkChange(sfAcct, e.target.value)}
                  disabled={!canManage || savingLink === sfAcct.simplefinAccountId}
                  className="w-full text-[12px] border border-[var(--table-border)] rounded-md px-2 py-1.5 outline-none bg-[var(--bg-card)] text-[var(--text-body)] disabled:opacity-50">
                  <option value="unlinked">— Not Linked —</option>
                  {['liquid', 'investment', 'liability'].map((cls) => {
                    const group = grouped.get(cls);
                    if (!group || group.length === 0) return null;
                    return (
                      <optgroup key={cls} label={cls.charAt(0).toUpperCase() + cls.slice(1)}>
                        {group.map((a) => (
                          <option key={a.id} value={String(a.id)}>
                            {a.name}{a.last_four ? ` (${a.last_four})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                  <option value="create-new">+ Create New Account</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 px-2.5 flex items-center justify-between gap-3 flex-wrap">
        <span className={`text-[12px] font-medium ${linkedCount === sfAccounts.length ? 'text-[#10b981]' : 'text-[#f59e0b]'}`}>
          {linkedCount} of {sfAccounts.length} accounts linked
        </span>
        <span className="text-[11px] text-[var(--text-muted)]">
          Balances update daily for all linked accounts · auto-import is set per account in Your accounts
        </span>
      </div>

      {/* Create New Account Modal */}
      {creatingForSfId && (() => {
        const sfAcct = sfAccounts.find((a) => a.simplefinAccountId === creatingForSfId);
        if (!sfAcct) return null;
        const { name, lastFour } = parseNameAndLastFour(sfAcct.name);
        const type = guessAccountType(sfAcct.name, sfAcct.balance);
        return (
          <NewAccountForm
            defaults={{ name, lastFour, type, classification: classificationForType(type) }}
            users={users}
            currentUserId={currentUserId}
            isShared={isShared}
            onSave={(data) => handleCreateAndLink(creatingForSfId, data)}
            onClose={() => setCreatingForSfId(null)}
          />
        );
      })()}
    </div>
  );
}

// --- Main BankSyncSection ---
export default function BankSyncSection({
  accounts,
  users,
  onAccountCreated,
}: {
  accounts: LedgerAccount[];
  users: { id: number; displayName: string }[];
  onAccountCreated: () => void;
}) {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Connection[] }>('/simplefin/connections');
      setConnections(res.data);
    } catch {
      // silently fail on initial load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const handleAddConnection = async (data: { label: string; shared: boolean; setupToken?: string; accessUrl?: string }) => {
    const res = await apiFetch<{ data: Connection }>('/simplefin/connections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setConnections((prev) => [...prev, res.data]);
    setShowAddModal(false);
    setExpandedId(res.data.id);
    addToast('Connection added');
  };

  const handleEditConnection = async (id: number, data: { label?: string; setupToken?: string; accessUrl?: string }) => {
    await apiFetch(`/simplefin/connections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    setEditingConnection(null);
    addToast('Connection updated');
    loadConnections();
  };

  const handleDeleteConnection = async (id: number) => {
    await apiFetch(`/simplefin/connections/${id}`, { method: 'DELETE' });
    setConnections((prev) => prev.filter((c) => c.id !== id));
    if (expandedId === id) setExpandedId(null);
    addToast('Connection removed');
  };

  if (loading) return null;

  const sharedConnections = connections.filter((c) => c.isShared);
  const personalConnections = connections.filter((c) => !c.isShared);
  const hasConnections = connections.length > 0;

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)] mb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Bank Sync</h3>
          {hasConnections && (
            <ConnectedBadge />
          )}
        </div>
        {hasConnections && (
          <PermissionGate permission="simplefin.manage" fallback="disabled">
            <button onClick={() => setShowAddModal(true)}
              className="text-[12px] font-semibold text-[var(--badge-category-text)] bg-transparent border-none cursor-pointer btn-ghost hover:underline">
              + Add Connection
            </button>
          </PermissionGate>
        )}
      </div>
      <p className="text-[13px] text-[var(--text-secondary)] mb-4">
        Connect your bank accounts via SimpleFIN for automatic transaction import
      </p>

      {!hasConnections ? (
        <div className="text-center py-6">
          <PermissionGate permission="simplefin.manage" fallback="disabled">
            <button onClick={() => setShowAddModal(true)}
              className="px-5 py-2.5 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer btn-primary">
              Add Connection
            </button>
          </PermissionGate>
          <p className="text-[11px] text-[var(--text-muted)] mt-3">
            Sign up at{' '}
            <a href="https://beta-bridge.simplefin.org" target="_blank" rel="noopener noreferrer"
              className="text-[var(--badge-category-text)] hover:underline">beta-bridge.simplefin.org</a>
            {' '}· $1.50/month or $15/year
          </p>
        </div>
      ) : (
        <div>
          {/* Shared Connections */}
          {sharedConnections.length > 0 && (
            <div className="mb-3">
              {personalConnections.length > 0 && (
                <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-2">
                  Shared Connections
                </div>
              )}
              {sharedConnections.map((conn) => (
                <ConnectionRow key={conn.id} connection={conn}
                  expanded={expandedId === conn.id}
                  onToggle={() => setExpandedId(expandedId === conn.id ? null : conn.id)}
                  onEdit={() => setEditingConnection(conn)}
                  onDelete={() => handleDeleteConnection(conn.id)}
                  accounts={accounts} users={users} currentUserId={user?.id ?? 0}
                  onAccountCreated={onAccountCreated} />
              ))}
            </div>
          )}

          {/* Personal Connections */}
          {personalConnections.length > 0 && (
            <div>
              {sharedConnections.length > 0 && (
                <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-2">
                  My Connections
                </div>
              )}
              {personalConnections.map((conn) => (
                <ConnectionRow key={conn.id} connection={conn}
                  expanded={expandedId === conn.id}
                  onToggle={() => setExpandedId(expandedId === conn.id ? null : conn.id)}
                  onEdit={() => setEditingConnection(conn)}
                  onDelete={() => handleDeleteConnection(conn.id)}
                  accounts={accounts} users={users} currentUserId={user?.id ?? 0}
                  onAccountCreated={onAccountCreated} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Connection Modal */}
      {showAddModal && (
        <ConnectionFormModal
          onSave={handleAddConnection}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit Connection Modal */}
      {editingConnection && (
        <ConnectionFormModal
          connection={editingConnection}
          onSave={(data) => handleEditConnection(editingConnection.id, data)}
          onClose={() => setEditingConnection(null)}
        />
      )}
    </div>
  );
}

// --- Connection Row ---
function ConnectionRow({
  connection,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  accounts,
  users,
  currentUserId,
  onAccountCreated,
}: {
  connection: Connection;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  accounts: LedgerAccount[];
  users: { id: number; displayName: string }[];
  currentUserId: number;
  onAccountCreated: () => void;
}) {
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);

  useEffect(() => {
    if (!showDeleteWarning) return;
    const t = setTimeout(() => setShowDeleteWarning(false), 3000);
    return () => clearTimeout(t);
  }, [showDeleteWarning]);

  return (
    <div className="border border-[var(--table-border)] rounded-lg mb-2 overflow-hidden transition-all duration-200 hover:border-[var(--card-hover-border)] hover:shadow-[var(--card-hover-shadow)]">
      {/* Delete Warning */}
      {showDeleteWarning && (
        <InlineNotification type="warning" message="This will remove all account links for this connection. Previously imported transactions will not be affected." className="mx-3 my-2" />
      )}
      <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={onToggle}>
        {/* Chevron */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          className={`text-[var(--text-muted)] transition-transform duration-150 shrink-0 ${expanded ? 'rotate-90' : ''}`}>
          <polyline points="9 18 15 12 9 6" />
        </svg>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[13px] text-[var(--text-primary)]">{connection.label}</span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium ${
              connection.isShared
                ? 'bg-[var(--badge-account-bg)] text-[var(--badge-account-text)]'
                : 'bg-[var(--badge-category-bg)] text-[var(--badge-category-text)]'
            }`}>
              {connection.isShared ? 'Shared' : 'Personal'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] mt-0.5">
            <span>{connection.linkedAccountCount} account{connection.linkedAccountCount !== 1 ? 's' : ''} linked</span>
            <span>·</span>
            <span>{connection.lastSyncedAt ? `Last synced ${timeAgo(connection.lastSyncedAt)}` : 'Never synced'}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <PermissionGate permission="simplefin.manage" fallback="disabled">
            <Tooltip content="Edit connection">
              <button onClick={onEdit}
                className="p-1.5 bg-transparent border-none cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-body)] rounded-md hover:bg-[var(--bg-hover)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </Tooltip>
          </PermissionGate>
          <PermissionGate permission="simplefin.manage" fallback="hidden">
            <ConfirmDeleteButton
              onConfirm={onDelete}
              onFirstClick={() => setShowDeleteWarning(true)}
            />
          </PermissionGate>
        </div>
      </div>

      {/* Expanded: Account Linking */}
      {expanded && (
        <div className="border-t border-[var(--table-border)] px-3 py-2 bg-[var(--bg-input)]">
          <AccountLinkingTable
            connectionId={connection.id}
            isShared={connection.isShared}
            accounts={accounts}
            users={users}
            currentUserId={currentUserId}
            onAccountCreated={onAccountCreated}
          />
        </div>
      )}
    </div>
  );
}

// --- Connection Form Modal ---
function ConnectionFormModal({
  connection,
  onSave,
  onClose,
}: {
  connection?: Connection;
  onSave: (data: { label: string; shared: boolean; setupToken?: string; accessUrl?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(connection?.label ?? '');
  const [shared, setShared] = useState(connection?.isShared ?? true);
  const [inputMode, setInputMode] = useState<'token' | 'url'>('token');
  const [token, setToken] = useState('');
  const [accessUrl, setAccessUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t); }
  }, [error]);

  const handleSubmit = async () => {
    if (!label.trim()) { setError('Label is required'); return; }
    if (!connection && !token.trim() && !accessUrl.trim()) {
      setError(inputMode === 'token' ? 'Setup token is required' : 'Access URL is required');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        label: label.trim(),
        shared,
        ...(inputMode === 'token' && token.trim() ? { setupToken: token.trim() } : {}),
        ...(inputMode === 'url' && accessUrl.trim() ? { accessUrl: accessUrl.trim() } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save connection');
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal isOpen={true} onClose={onClose}>
      <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-4">
        {connection ? 'Edit Connection' : 'Add Bank Connection'}
      </h3>
      {error && (
        <InlineNotification type="error" message={error} className="mb-3" />
      )}
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g., Household Banks"
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Scope</label>
          <div className="flex gap-2">
            {[
              { value: true, label: 'Shared', sub: 'Any user can sync from this connection' },
              { value: false, label: 'Personal', sub: 'Only you can see and sync from this connection' },
            ].map((opt) => (
              <button key={String(opt.value)} type="button"
                onClick={() => !connection && setShared(opt.value)}
                disabled={!!connection}
                className={`flex-1 py-2 px-3 rounded-lg text-left border cursor-pointer transition-colors ${
                  shared === opt.value
                    ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-[var(--btn-primary-bg)] btn-primary'
                    : 'bg-[var(--bg-card)] text-[var(--text-body)] border-[var(--table-border)] btn-secondary'
                } ${connection ? 'opacity-60 cursor-not-allowed' : ''}`}>
                <div className="text-[12px] font-semibold">{opt.label}</div>
                <div className={`text-[10px] mt-0.5 ${shared === opt.value ? '' : 'text-[var(--text-muted)]'}`}
                  style={shared === opt.value ? { color: 'var(--btn-primary-text)', opacity: 0.7 } : undefined}>
                  {opt.sub}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">
              {inputMode === 'token' ? 'Setup Token' : 'Access URL'}
            </label>
            <button type="button" onClick={() => setInputMode(inputMode === 'token' ? 'url' : 'token')}
              className="text-[11px] text-[var(--badge-category-text)] bg-transparent border-none cursor-pointer btn-ghost hover:underline">
              {inputMode === 'token' ? 'I have an Access URL instead' : 'I have a Setup Token'}
            </button>
          </div>
          {inputMode === 'token' ? (
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your setup token"
              className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none font-mono text-[var(--text-body)]" />
          ) : (
            <input value={accessUrl} onChange={(e) => setAccessUrl(e.target.value)} placeholder="https://..."
              className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none font-mono text-[var(--text-body)]" />
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-5 justify-end">
        <button onClick={onClose}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] border-none cursor-pointer btn-secondary">
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={saving}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-none cursor-pointer disabled:opacity-50 btn-primary">
          {saving ? 'Connecting...' : connection ? 'Save' : 'Connect'}
        </button>
      </div>
    </ResponsiveModal>
  );
}
