import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteButton from '../ConfirmDeleteButton';
import InlineNotification from '../InlineNotification';
import ResponsiveModal from '../ResponsiveModal';
import Spinner from '../Spinner';
import { Switch } from '../primitives';
import { ownerColor } from '../badges';
import { Card, CardHeader, Caption, Field, PanelHeader, Pill, CheckBox, SelectShell, InitialsAvatar, inputCls, selectCls, btnPrimary, btnSecondary, btnDanger, btnRow, ICON } from './ui';

// --- Permission catalogue: what a member may do, grouped for the checkbox cards ---
const PERMISSION_GROUPS: { label: string; permissions: { key: string; label: string; desc: string }[] }[] = [
  {
    label: 'Transactions',
    permissions: [
      { key: 'transactions.create', label: 'Add transactions', desc: 'Enter transactions by hand' },
      { key: 'transactions.edit', label: 'Edit transactions', desc: 'Change merchant, category, notes, splits' },
      { key: 'transactions.delete', label: 'Delete transactions', desc: 'Remove transactions for good' },
      { key: 'transactions.bulk_edit', label: 'Edit in bulk', desc: 'Multi-select and change many at once' },
    ],
  },
  {
    label: 'Household',
    permissions: [
      { key: 'accounts.create', label: 'Manage accounts', desc: 'Add, edit, and remove accounts' },
      { key: 'categories.create', label: 'Manage categories', desc: 'Groups, categories, emoji, budget exclusion' },
      { key: 'simplefin.manage', label: 'Manage connections', desc: 'SimpleFIN connections and account links' },
    ],
  },
  {
    label: 'Finance',
    permissions: [
      { key: 'budgets.edit', label: 'Edit budgets', desc: 'Planned amounts and overrides' },
      { key: 'balances.update', label: 'Update balances', desc: 'Record and refresh account balances' },
      { key: 'assets.create', label: 'Manage assets', desc: 'Physical assets and depreciation' },
      { key: 'import.csv', label: 'Import CSV files', desc: 'Upload statements' },
      { key: 'import.bank_sync', label: 'Run bank sync', desc: 'Pull transactions from SimpleFIN' },
    ],
  },
];

// Compound permissions: one card sets create/edit/delete together.
const COMPOUND_PERMISSIONS: Record<string, string[]> = {
  'accounts.create': ['accounts.create', 'accounts.edit', 'accounts.delete'],
  'categories.create': ['categories.create', 'categories.edit', 'categories.delete'],
  'assets.create': ['assets.create', 'assets.edit', 'assets.delete'],
};

export interface ManagedUser {
  id: number;
  username: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  isActive: boolean;
  twofaEnabled: boolean;
  createdAt: string;
  permissions: Record<string, boolean> | null;
}

const ROLE_TONE: Record<string, string> = { owner: 'var(--c-orange)', admin: 'var(--positive)', member: 'var(--c-blue)' };
const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

// --- Add user ---
function AddUserModal({ onClose, onCreated, callerRole }: { onClose: () => void; onCreated: () => void; callerRole: string }) {
  const { addToast } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const canCreateAdmin = callerRole === 'owner';
  const ready = displayName.trim() && username && password && confirmPassword;

  const submit = async () => {
    setError('');
    if (!/^[a-z0-9]{3,20}$/.test(username)) { setError('Username must be 3–20 lowercase letters or numbers'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await apiFetch('/users', { method: 'POST', body: JSON.stringify({ username, password, displayName: displayName.trim(), role }) });
      addToast('User added');
      onCreated(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add user');
    } finally { setLoading(false); }
  };

  return (
    <ResponsiveModal isOpen onClose={onClose} title="Add user" description="They sign in with their own username and password. Ledger has no per-seat cost." maxWidth="460px"
      footer={(
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button type="button" onClick={submit} disabled={!ready || loading} className={btnPrimary}>{loading ? 'Adding…' : 'Add user'}</button>
        </div>
      )}>
      {error && <InlineNotification type="error" message={error} dismissible onDismiss={() => setError('')} className="mb-4" />}
      <div className="flex flex-col gap-5">
        <Field label="Name"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Full name" autoFocus className={inputCls} /></Field>
        <Field label="Username" hint="Lowercase letters and numbers only, 3–20 characters.">
          <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} autoCapitalize="off" placeholder="username" className={`${inputCls} font-mono`} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Password" hint="At least 8 characters."><input type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} className={inputCls} /></Field>
          <Field label="Confirm password"><input type="password" value={confirmPassword} autoComplete="new-password" onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Role" hint={canCreateAdmin ? 'Admins can manage users and settings. Members have limited access you control per user.' : 'Only the owner can create admin accounts.'}>
          <SelectShell>
            <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')} className={selectCls}>
              <option value="member">Member</option>
              <option value="admin" disabled={!canCreateAdmin}>Admin</option>
            </select>
          </SelectShell>
        </Field>
      </div>
    </ResponsiveModal>
  );
}

// --- Edit user (name, active, password reset) ---
function EditUserModal({ managedUser, currentUserId, onClose, onUpdated }: { managedUser: ManagedUser; currentUserId: number; onClose: () => void; onUpdated: () => void }) {
  const { addToast } = useToast();
  const [displayName, setDisplayName] = useState(managedUser.displayName);
  const [isActive, setIsActive] = useState(managedUser.isActive);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isSelf = managedUser.id === currentUserId;

  const save = async () => {
    setError('');
    if (!displayName.trim()) { setError('Name is required'); return; }
    if (newPassword) {
      if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
      if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    }
    setLoading(true);
    try {
      await apiFetch(`/users/${managedUser.id}`, { method: 'PUT', body: JSON.stringify({ displayName: displayName.trim(), isActive }) });
      if (newPassword) await apiFetch(`/users/${managedUser.id}/password`, { method: 'PUT', body: JSON.stringify({ password: newPassword }) });
      addToast('User updated');
      onUpdated(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally { setLoading(false); }
  };

  return (
    <ResponsiveModal isOpen onClose={onClose} title="Edit user" description={`@${managedUser.username} · ${ROLE_LABEL[managedUser.role]}`} maxWidth="460px"
      footer={(
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button type="button" onClick={save} disabled={loading} className={btnPrimary}>{loading ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}>
      {error && <InlineNotification type="error" message={error} dismissible onDismiss={() => setError('')} className="mb-4" />}
      <div className="flex flex-col gap-5">
        <Field label="Name"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} /></Field>
        {!isSelf && (
          <div className="flex items-center justify-between gap-4 px-4 py-3.5 rounded-[12px] bg-surface-2 border border-line">
            <div className="min-w-0">
              <div className="text-sm font-bold text-content">Active</div>
              <div className="text-[12.5px] text-content-3 leading-snug mt-0.5">{isActive ? 'Can sign in.' : 'Sign-in is blocked until re-activated.'}</div>
            </div>
            <Switch checked={isActive} onChange={setIsActive} title="Active" />
          </div>
        )}
        <div>
          <Caption className="mb-3">Reset password</Caption>
          <div className="grid grid-cols-2 gap-4">
            <Field label="New password" hint="Leave blank to keep the current one."><input type="password" value={newPassword} autoComplete="new-password" onChange={(e) => setNewPassword(e.target.value)} className={inputCls} /></Field>
            <Field label="Confirm"><input type="password" value={confirmPassword} autoComplete="new-password" onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} /></Field>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}

// --- Delete user (two-step) ---
interface DeletePreview {
  user: { id: number; displayName: string; username: string; role: string };
  soleOwnedAccounts: { id: number; name: string; lastFour: string | null; type: string; classification: string }[];
  coOwnedAccounts: { id: number; name: string; lastFour: string | null; remainingOwners: string[] }[];
  personalConnections: number;
  payCyclesOwned: number;
  availableOwners: { id: number; displayName: string }[];
}

function DeleteUserModal({ userId, onClose, onDeleted }: { userId: number; onClose: () => void; onDeleted: () => void }) {
  const { addToast } = useToast();
  const [step, setStep] = useState<'preview' | 'confirm'>('preview');
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignments, setAssignments] = useState<Record<number, number>>({});
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiFetch<{ data: DeletePreview }>(`/users/${userId}/delete-preview`)
      .then((res) => {
        setPreview(res.data);
        if (res.data.availableOwners.length === 1) {
          const auto: Record<number, number> = {};
          for (const a of res.data.soleOwnedAccounts) auto[a.id] = res.data.availableOwners[0].id;
          setAssignments(auto);
        }
      })
      .catch((err) => { addToast(err instanceof Error ? err.message : 'Failed to load delete preview', 'error'); onClose(); })
      .finally(() => setLoading(false));
  }, [userId, addToast, onClose]);

  const allAssigned = !preview || preview.soleOwnedAccounts.length === 0 || preview.soleOwnedAccounts.every((a) => assignments[a.id]);
  const confirmReady = !!preview && confirmText === preview.user.username;

  const summaryLines: string[] = [];
  if (preview) {
    const reassigned = Object.keys(assignments).length;
    if (reassigned > 0) {
      const names = [...new Set(Object.values(assignments).map((oid) => preview.availableOwners.find((o) => o.id === oid)?.displayName || ''))];
      summaryLines.push(`${reassigned} account${reassigned !== 1 ? 's' : ''} will be reassigned to ${names.join(', ')}.`);
    }
    if (preview.coOwnedAccounts.length > 0) summaryLines.push(`${preview.user.displayName} will be removed from ${preview.coOwnedAccounts.length} co-owned account${preview.coOwnedAccounts.length !== 1 ? 's' : ''}.`);
    if (preview.personalConnections > 0) summaryLines.push(`${preview.personalConnections} personal SimpleFIN connection${preview.personalConnections !== 1 ? 's' : ''} will be deleted.`);
  }

  const doDelete = async () => {
    setError(''); setDeleting(true);
    try {
      await apiFetch(`/users/${userId}/permanent`, {
        method: 'DELETE',
        body: JSON.stringify({ reassignments: Object.entries(assignments).map(([accountId, newOwnerId]) => ({ accountId: Number(accountId), newOwnerId })), confirmUsername: confirmText }),
      });
      addToast('User deleted');
      onDeleted(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally { setDeleting(false); }
  };

  const title = step === 'preview' ? `Delete ${preview?.user.displayName ?? 'user'}?` : 'Confirm deletion';
  const footer = loading ? null : step === 'preview' ? (
    <div className="flex justify-end gap-2.5">
      <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
      <button type="button" onClick={() => allAssigned && setStep('confirm')} disabled={!allAssigned} className={btnDanger}>Continue</button>
    </div>
  ) : (
    <div className="flex justify-between gap-2.5">
      <button type="button" onClick={() => setStep('preview')} className={btnSecondary}>Back</button>
      <button type="button" onClick={doDelete} disabled={!confirmReady || deleting} className={`${btnPrimary} bg-negative hover:bg-negative`}>{deleting ? 'Deleting…' : 'Delete user'}</button>
    </div>
  );

  return (
    <ResponsiveModal isOpen onClose={onClose} title={title} maxWidth="520px" footer={footer}>
      {loading || !preview ? <Spinner /> : step === 'preview' ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <InitialsAvatar name={preview.user.displayName} color={ownerColor(preview.user.id)} size={40} />
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-content truncate">{preview.user.displayName}</div>
              <div className="text-[13px] text-content-3">@{preview.user.username} · {ROLE_LABEL[preview.user.role] ?? preview.user.role}</div>
            </div>
          </div>
          <InlineNotification type="error" message="This is permanent. The login, its permissions, and personal connections are removed. Transactions, budgets, and balance history belong to accounts, so no financial data is lost." />

          {preview.soleOwnedAccounts.length > 0 && (
            <div>
              <Caption className="mb-1">Reassign accounts</Caption>
              <div className="text-[13px] text-content-3 mb-3 leading-snug">These accounts belong only to {preview.user.displayName}. Choose who takes them over.</div>
              <div className="rounded-[12px] border border-line overflow-hidden">
                {preview.soleOwnedAccounts.map((a, i) => (
                  <div key={a.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${i > 0 ? 'border-t border-line' : ''}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-content truncate">{a.name}{a.lastFour && <span className="font-mono text-[12px] text-content-3 ml-1.5">…{a.lastFour}</span>}</div>
                      <div className="text-[12px] text-content-3 capitalize">{a.type} · {a.classification}</div>
                    </div>
                    <SelectShell className="w-[180px] shrink-0">
                      <select value={assignments[a.id] || ''} onChange={(e) => setAssignments((prev) => ({ ...prev, [a.id]: Number(e.target.value) }))} className={`${selectCls} h-10`}>
                        <option value="">New owner…</option>
                        {preview.availableOwners.map((o) => <option key={o.id} value={o.id}>{o.displayName}</option>)}
                      </select>
                    </SelectShell>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.coOwnedAccounts.length > 0 && (
            <div>
              <Caption className="mb-1">Co-owned accounts</Caption>
              <div className="text-[13px] text-content-3 mb-3 leading-snug">{preview.user.displayName} is removed as a co-owner; the other owners keep these.</div>
              <div className="rounded-[12px] border border-line overflow-hidden">
                {preview.coOwnedAccounts.map((a, i) => (
                  <div key={a.id} className={`px-4 py-3 text-sm ${i > 0 ? 'border-t border-line' : ''}`}>
                    <span className="font-semibold text-content">{a.name}</span>
                    {a.lastFour && <span className="font-mono text-[12px] text-content-3 ml-1.5">…{a.lastFour}</span>}
                    <span className="text-[12.5px] text-content-3"> — {a.remainingOwners.join(', ')} remain{a.remainingOwners.length === 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && <InlineNotification type="error" message={error} />}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <InlineNotification type="error" message={`You are about to permanently delete ${preview.user.displayName}.${summaryLines.length ? ' ' + summaryLines.join(' ') : ''}`} />
          <Field label={<span>Type <code className="font-mono text-[13px] bg-surface-2 px-1.5 py-0.5 rounded-md">{preview.user.username}</code> to confirm</span>}>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="off" autoFocus placeholder={preview.user.username} className={`${inputCls} font-mono`} />
          </Field>
          {error && <InlineNotification type="error" message={error} />}
        </div>
      )}
    </ResponsiveModal>
  );
}

// --- Panel ---
export default function UsersPanel() {
  const { user, isAdmin } = useAuth();
  const { addToast } = useToast();
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [requireAdmin2FA, setRequireAdmin2FA] = useState(false);
  const [requireMember2FA, setRequireMember2FA] = useState(false);

  const callerRole = user?.role || 'member';
  const canManage = isAdmin();

  const loadUsers = useCallback(async () => {
    if (!canManage) { setLoaded(true); return; }
    try {
      const res = await apiFetch<{ users: ManagedUser[] }>('/users');
      setManagedUsers(res.users);
    } catch { addToast('Failed to load users', 'error'); }
    finally { setLoaded(true); }
  }, [addToast, canManage]);

  const load2FA = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: { requireAdmin: boolean; requireMember: boolean } }>('/auth/2fa/requirements');
      setRequireAdmin2FA(res.data.requireAdmin); setRequireMember2FA(res.data.requireMember);
    } catch { /* owner-only */ }
  }, []);

  useEffect(() => { loadUsers(); load2FA(); }, [loadUsers, load2FA]);

  if (!canManage) {
    return (
      <div className="flex flex-col gap-[22px]">
        <PanelHeader title="Users" actions={<Pill color="var(--primary)" className="h-[30px] px-3">{ICON.shield}You are {ROLE_LABEL[callerRole]}</Pill>} />
        <Card>
          <div className="flex flex-col items-center text-center px-6 py-14 gap-3">
            <span className="w-14 h-14 rounded-full bg-surface-2 text-content-3 flex items-center justify-center">{ICON.lock}</span>
            <div className="text-[18px] font-extrabold tracking-tight text-content">Restricted setting</div>
            <div className="text-sm text-content-3 max-w-[360px] leading-snug">Only the app owner or an admin can manage users and permissions. Ask an admin to change your access.</div>
          </div>
        </Card>
      </div>
    );
  }

  const canTouch = (mu: ManagedUser) => mu.role !== 'owner' && (callerRole === 'owner' || (callerRole === 'admin' && mu.role === 'member'));

  const setRole = async (mu: ManagedUser, role: 'admin' | 'member') => {
    if (role === mu.role) return;
    setManagedUsers((prev) => prev.map((u) => (u.id === mu.id ? { ...u, role } : u)));
    try {
      await apiFetch(`/users/${mu.id}`, { method: 'PUT', body: JSON.stringify({ role }) });
      addToast(`${mu.displayName} is now ${role === 'admin' ? 'an admin' : 'a member'}`);
      loadUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to change role', 'error');
      loadUsers();
    }
  };

  const togglePermission = async (userId: number, permKey: string, current: boolean) => {
    const keys = COMPOUND_PERMISSIONS[permKey] || [permKey];
    const next = !current;
    setManagedUsers((prev) => prev.map((u) => {
      if (u.id !== userId || !u.permissions) return u;
      const perms = { ...u.permissions };
      for (const k of keys) perms[k] = next;
      return { ...u, permissions: perms };
    }));
    try {
      const permissions: Record<string, boolean> = {};
      for (const k of keys) permissions[k] = next;
      await apiFetch(`/users/${userId}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) });
    } catch {
      addToast('Failed to update permission', 'error');
      loadUsers();
    }
  };

  const setRequirement = async (which: 'admin' | 'member', next: boolean) => {
    const set = which === 'admin' ? setRequireAdmin2FA : setRequireMember2FA;
    set(next);
    try {
      await apiFetch('/auth/2fa/requirements', { method: 'PUT', body: JSON.stringify(which === 'admin' ? { requireAdmin: next } : { requireMember: next }) });
      addToast(next ? `Two-factor now required for ${which}s` : `Two-factor no longer required for ${which}s`);
    } catch {
      set(!next);
      addToast('Failed to update requirement', 'error');
    }
  };

  const toggleExpanded = (id: number) => setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="flex flex-col gap-[22px]">
      <PanelHeader
        title="Users"
        description="Everyone who can sign in to this household. Admins manage settings; members get exactly the permissions you tick."
        actions={<Pill color="var(--primary)" className="h-[30px] px-3">{ICON.shield}You are {ROLE_LABEL[callerRole]}</Pill>}
      />

      <Card>
        <CardHeader title="Household members" meta={loaded ? `${managedUsers.length} ${managedUsers.length === 1 ? 'user' : 'users'}` : undefined} />
        {!loaded ? <Spinner /> : managedUsers.map((mu) => {
          const color = ownerColor(mu.id);
          const isOpen = expanded.has(mu.id);
          return (
            <div key={mu.id} className="border-t border-line">
              <div className="flex items-center gap-4 px-6 py-[18px]">
                <InitialsAvatar name={mu.displayName} color={color} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[15px] font-bold text-content truncate">{mu.displayName}</span>
                    {mu.id === user?.id && <span className="text-[12px] text-content-3">(you)</span>}
                    {!mu.isActive && <Pill color="var(--negative)" className="h-[22px] px-2 text-[11px]">Inactive</Pill>}
                    {mu.twofaEnabled && <Pill color="var(--positive)" className="h-[22px] px-2 text-[11px]" title="Two-factor authentication is on">2FA</Pill>}
                  </div>
                  <div className="text-[13px] text-content-3 font-mono truncate">@{mu.username}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {mu.role === 'owner' ? (
                    <Pill color="var(--c-orange)" className="h-[26px] rounded-[7px]">Owner</Pill>
                  ) : callerRole === 'owner' ? (
                    <div className="relative">
                      <select value={mu.role} onChange={(e) => setRole(mu, e.target.value as 'admin' | 'member')} aria-label={`Role for ${mu.displayName}`}
                        className="h-[34px] pl-3 pr-8 rounded-[8px] border border-line-strong text-[12.5px] font-bold appearance-none cursor-pointer outline-none"
                        style={mu.role === 'admin'
                          ? { background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }
                          : { background: 'var(--surface-2)', color: 'var(--c-blue)' }}>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                      <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: mu.role === 'admin' ? 'var(--primary)' : 'var(--c-blue)' }}><path d="m6 9 6 6 6-6" /></svg>
                    </div>
                  ) : (
                    <Pill color={ROLE_TONE[mu.role]} className="h-[26px] rounded-[7px]">{ROLE_LABEL[mu.role]}</Pill>
                  )}
                  {canTouch(mu) && (
                    <button type="button" onClick={() => setEditing(mu)} className={btnRow} title="Edit name, password, or active state">{ICON.pencil}Edit</button>
                  )}
                  {canTouch(mu) && mu.twofaEnabled && mu.id !== user?.id && (
                    <ConfirmDeleteButton
                      label="Reset 2FA"
                      confirmLabel="Confirm reset?"
                      onConfirm={async () => {
                        try { await apiFetch(`/auth/2fa/reset/${mu.id}`, { method: 'POST' }); addToast(`Two-factor reset for ${mu.displayName}`); loadUsers(); }
                        catch (err) { addToast(err instanceof Error ? err.message : 'Failed to reset 2FA', 'error'); }
                      }}
                    />
                  )}
                  {canTouch(mu) && mu.id !== user?.id && (
                    <button type="button" onClick={() => setDeleting(mu)} title="Remove user"
                      className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[8px] border border-line-strong bg-transparent text-negative text-[12.5px] font-bold hover:bg-negative/8 transition-colors">
                      {ICON.trash}Delete
                    </button>
                  )}
                </div>
              </div>

              {mu.role === 'owner' ? (
                <div className="px-6 pb-4 text-[12.5px] italic text-content-3" style={{ paddingLeft: 80 }}>App owner. Cannot be restricted or removed.</div>
              ) : mu.role === 'admin' ? (
                <div className="px-6 pb-4 text-[12.5px] italic text-content-3" style={{ paddingLeft: 80 }}>Admins have every permission{callerRole !== 'owner' ? ' and can only be changed by the owner' : ''}.</div>
              ) : mu.permissions && (
                <div className="pb-4" style={{ paddingLeft: 80, paddingRight: 24 }}>
                  <button type="button" onClick={() => toggleExpanded(mu.id)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-content-2 hover:text-content">
                    <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>{ICON.chevron}</span>
                    {isOpen ? 'Hide permissions' : 'Show permissions'}
                  </button>
                  {isOpen && (
                    <div className="mt-3 flex flex-col gap-4">
                      {PERMISSION_GROUPS.map((group) => (
                        <div key={group.label}>
                          <Caption className="mb-2">{group.label}</Caption>
                          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                            {group.permissions.map((p) => {
                              const granted = mu.permissions![p.key] ?? false;
                              return (
                                <button key={p.key} type="button" role="checkbox" aria-checked={granted} onClick={() => togglePermission(mu.id, p.key, granted)}
                                  className="flex items-start gap-3 px-3.5 py-[11px] rounded-[11px] border border-line bg-surface-2 text-left hover:border-line-strong transition-colors">
                                  <CheckBox checked={granted} className="mt-0.5" />
                                  <span className="min-w-0">
                                    <span className="block text-[13.5px] font-semibold text-content">{p.label}</span>
                                    <span className="block text-[12px] text-content-3 leading-snug">{p.desc}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 border-t border-line bg-surface-2 text-content-2 text-sm font-bold hover:text-content hover:bg-elevated transition-colors">
          {ICON.plus}Add user
        </button>
      </Card>

      {callerRole === 'owner' && (
        <Card>
          <div className="px-6 py-3.5 border-b border-line"><Caption>Two-factor authentication requirements</Caption></div>
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <div className="min-w-0">
              <div className="text-[14.5px] font-semibold text-content">Require two-factor for admins</div>
              <div className="text-[12.5px] text-content-3 mt-0.5">Admins must set up two-factor authentication before they can use Ledger.</div>
            </div>
            <Switch checked={requireAdmin2FA} onChange={(v) => setRequirement('admin', v)} title="Require two-factor for admins" />
          </div>
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-line">
            <div className="min-w-0">
              <div className="text-[14.5px] font-semibold text-content">Require two-factor for members</div>
              <div className="text-[12.5px] text-content-3 mt-0.5">All members must set up two-factor authentication.</div>
            </div>
            <Switch checked={requireMember2FA} onChange={(v) => setRequirement('member', v)} title="Require two-factor for members" />
          </div>
        </Card>
      )}

      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={loadUsers} callerRole={callerRole} />}
      {editing && <EditUserModal managedUser={editing} currentUserId={user!.id} onClose={() => setEditing(null)} onUpdated={loadUsers} />}
      {deleting && <DeleteUserModal userId={deleting.id} onClose={() => setDeleting(null)} onDeleted={loadUsers} />}
    </div>
  );
}
