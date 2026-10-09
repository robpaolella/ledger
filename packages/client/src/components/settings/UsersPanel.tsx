import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import InlineNotification from '../InlineNotification';
import ResponsiveModal from '../ResponsiveModal';
import Spinner from '../Spinner';
import { Switch } from '../primitives';
import { ownerColor } from '../badges';
import { ACCESS_PRESETS, presetPermissions, type AccessPreset } from '@ledger/shared';
import PersonView, { PersonBadges } from './users/PersonView';
import { ROLE_LABEL, roleLine, type CallerRole, type ManagedUser } from './users/people';
import { COMPOUND_PERMISSIONS } from './users/permissionSwitches';
import { LoadError, Card, CardHeader, Caption, Field, PanelHeader, Pill, SelectShell, InitialsAvatar, inputCls, selectCls, btnPrimary, btnSecondary, btnDanger, ICON } from './ui';

const chevronRight = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;

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
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [requireAdmin2FA, setRequireAdmin2FA] = useState(false);
  const [requireMember2FA, setRequireMember2FA] = useState(false);

  const callerRole = (user?.role || 'member') as CallerRole;
  const canManage = isAdmin();

  const loadUsers = useCallback(async () => {
    if (!canManage) { setLoaded(true); return; }
    try {
      const res = await apiFetch<{ users: ManagedUser[] }>('/users');
      setManagedUsers(res.users);
      setLoadFailed(false);
    } catch { setLoadFailed(true); }
    finally { setLoaded(true); }
  }, [canManage]);


  const load2FA = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: { requireAdmin: boolean; requireMember: boolean } }>('/auth/2fa/requirements');
      setRequireAdmin2FA(res.data.requireAdmin); setRequireMember2FA(res.data.requireMember);
    } catch { /* owner-only */ }
  }, []);

  useEffect(() => { loadUsers(); load2FA(); }, [loadUsers, load2FA]);

  const retryLoad = () => { setLoaded(false); setLoadFailed(false); loadUsers(); load2FA(); };

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

  // Saves at once, like the edit window's own switch; a failed save puts the switch back.
  const setActive = async (mu: ManagedUser, isActive: boolean) => {
    const patch = (value: boolean) => setManagedUsers((prev) => prev.map((u) => (u.id === mu.id ? { ...u, isActive: value } : u)));
    patch(isActive);
    try {
      await apiFetch(`/users/${mu.id}`, { method: 'PUT', body: JSON.stringify({ isActive }) });
      addToast(isActive ? `${mu.displayName} can sign in` : `${mu.displayName} can no longer sign in`);
    } catch (err) {
      patch(!isActive);
      addToast(err instanceof Error ? err.message : 'Failed to update user', 'error');
    }
  };

  const resetTwoStep = async (mu: ManagedUser) => {
    try { await apiFetch(`/auth/2fa/reset/${mu.id}`, { method: 'POST' }); addToast(`Two-step sign-in reset for ${mu.displayName}`); loadUsers(); }
    catch (err) { addToast(err instanceof Error ? err.message : 'Failed to reset two-step sign-in', 'error'); }
  };

  // Saves permission changes optimistically; a failed save puts back the values from before.
  const savePermissions = async (userId: number, changes: Record<string, boolean>, before: Record<string, boolean>, success?: string) => {
    const patch = (values: Record<string, boolean>) => setManagedUsers((prev) => prev.map((u) => (
      u.id === userId && u.permissions ? { ...u, permissions: { ...u.permissions, ...values } } : u)));
    patch(changes);
    try {
      await apiFetch(`/users/${userId}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: changes }) });
      if (success) addToast(success);
    } catch {
      patch(before);
      addToast('Failed to update access', 'error');
    }
  };

  // The values to put back if a save fails: each key as stored, even inside a compound switch.
  const storedValues = (mu: ManagedUser, keys: string[]) => Object.fromEntries(keys.map((k) => [k, mu.permissions?.[k] ?? false]));

  const togglePermission = (mu: ManagedUser, permKey: string, current: boolean) => {
    const keys = COMPOUND_PERMISSIONS[permKey] || [permKey];
    savePermissions(mu.id, Object.fromEntries(keys.map((k) => [k, !current])), storedValues(mu, keys));
  };

  const applyPreset = (mu: ManagedUser, preset: AccessPreset) => {
    const changes = presetPermissions(preset);
    savePermissions(mu.id, changes, storedValues(mu, Object.keys(changes)), `${mu.displayName.trim().split(/\s+/)[0]} now has ${ACCESS_PRESETS[preset].label}`);
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

  const openUser = openId === null ? undefined : managedUsers.find((u) => u.id === openId);

  return (
    <div className="flex flex-col gap-[22px]">
      <PanelHeader
        title="Users & permissions"
        description="Everyone who can sign in to this household. Admins manage people; each member gets View only, Everyday, Everything except managing people, or switches you choose."
        actions={<Pill color="var(--primary)" className="h-[30px] px-3">{ICON.shield}You are {ROLE_LABEL[callerRole]}</Pill>}
      />

      {loadFailed ? <LoadError onRetry={retryLoad} /> : (
      <Card>
        <CardHeader title="Household members" meta={loaded ? `${managedUsers.length} ${managedUsers.length === 1 ? 'user' : 'users'}` : undefined} />
        {!loaded ? <Spinner /> : managedUsers.map((mu) => (
          <button key={mu.id} type="button" onClick={() => setOpenId(mu.id)} aria-haspopup="dialog"
            className="w-full flex items-center gap-3 md:gap-4 px-4 md:px-6 min-h-[64px] py-2.5 border-t border-line text-left hover:bg-surface-2 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            <InitialsAvatar name={mu.displayName} color={ownerColor(mu.id)} size={40} />
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-[15px] font-bold text-content truncate">{mu.displayName}</span>
                <PersonBadges mu={mu} isSelf={mu.id === user?.id} />
              </span>
              <span className="block text-[12.5px] text-content-3 truncate">{roleLine(mu)}</span>
            </span>
            <span className="hidden md:block font-mono text-[12.5px] text-content-3 truncate max-w-[160px]">@{mu.username}</span>
            <span className="shrink-0 text-content-3">{chevronRight}</span>
          </button>
        ))}
        {loaded && <button type="button" onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 border-t border-line bg-surface-2 text-content-2 text-sm font-bold hover:text-content hover:bg-elevated transition-colors">
          {ICON.plus}Add user
        </button>}
      </Card>
      )}

      {loaded && !loadFailed && callerRole === 'owner' && (
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
      {openUser && (
        <PersonView mu={openUser} callerRole={callerRole} currentUserId={user?.id} onClose={() => setOpenId(null)}
          onSetRole={(role) => setRole(openUser, role)}
          onSetActive={(next) => setActive(openUser, next)}
          onResetTwoStep={() => resetTwoStep(openUser)}
          onApplyPreset={(preset) => applyPreset(openUser, preset)}
          onTogglePermission={(key, current) => togglePermission(openUser, key, current)}
          onEdit={() => setEditing(openUser)}
          onDelete={() => setDeleting(openUser)} />
      )}
      {editing && <EditUserModal managedUser={editing} currentUserId={user!.id} onClose={() => setEditing(null)} onUpdated={loadUsers} />}
      {deleting && <DeleteUserModal userId={deleting.id} onClose={() => setDeleting(null)} onDeleted={() => { setOpenId(null); loadUsers(); }} />}
    </div>
  );
}
