import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import ConfirmDeleteButton from '../components/ConfirmDeleteButton';
import BankSyncSection from '../components/BankSyncSection';
import InlineNotification from '../components/InlineNotification';
import TotpCodeInput from '../components/TotpCodeInput';
import { OwnerBadge, SharedBadge, ClassificationBadge, initOwnerSlots, type AccountClassification } from '../components/badges';
import { getCategoryColor } from '../lib/categoryColors';
import ScrollableList from '../components/ScrollableList';
import PermissionGate from '../components/PermissionGate';
import ResponsiveModal from '../components/ResponsiveModal';
import Tooltip from '../components/Tooltip';
import { useIsMobile } from '../hooks/useIsMobile';

const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'investment', 'retirement', 'venmo', 'cash'];
const CLASSIFICATIONS = ['liquid', 'investment', 'liability'];

function classificationForType(type: string): string {
  if (['checking', 'savings', 'venmo', 'cash'].includes(type)) return 'liquid';
  if (['investment', 'retirement'].includes(type)) return 'investment';
  if (type === 'credit') return 'liability';
  return 'liquid';
}

interface AccountOwner {
  id: number;
  displayName: string;
}

interface Account {
  id: number;
  name: string;
  last_four: string | null;
  type: string;
  classification: string;
  owner: string;
  owners: AccountOwner[];
  isShared: boolean;
  is_active: number;
}

interface Category {
  id: number;
  group_name: string;
  sub_name: string;
  display_name: string;
  type: string;
  is_deductible: number;
  sort_order: number;
}

interface GroupedCategory {
  group: string;
  type: string;
  subs: Category[];
}

// Sortable sub-category row for desktop
function SortableDesktopSub({ cat, canEdit, onEdit }: { cat: Category; canEdit: boolean; onEdit: (c: Category) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const restrictedTransform = transform ? { ...transform, x: 0 } : transform;
  const style = {
    transform: CSS.Transform.toString(restrictedTransform),
    transition,
    ...(isDragging ? { zIndex: 10, position: 'relative' as const } : {}),
  };
  return (
    <div ref={setNodeRef} style={style}
      {...(canEdit ? { ...attributes, ...listeners } : {})}
      onClick={() => canEdit ? onEdit(cat) : null}
      className={`relative flex items-center py-1 pl-[18px] text-[12px] text-[var(--text-secondary)] ${canEdit ? 'cursor-pointer hover:text-[var(--btn-secondary-text)] hover:bg-[var(--bg-hover)]' : ''} ${isDragging ? 'rounded-md bg-[var(--bg-hover)] border border-[var(--color-accent)] shadow-sm' : ''}`}>
      {isDragging && (
        <>
          <span className="absolute left-1/2 -top-2.5 -translate-x-1/2 text-[var(--color-accent)]">
            <svg width="10" height="6" viewBox="0 0 10 6"><path d="M5 0L10 6H0Z" fill="currentColor"/></svg>
          </span>
          <span className="absolute left-1/2 -bottom-2.5 -translate-x-1/2 text-[var(--color-accent)]">
            <svg width="10" height="6" viewBox="0 0 10 6"><path d="M5 6L0 0H10Z" fill="currentColor"/></svg>
          </span>
        </>
      )}
      <span>{cat.sub_name}</span>
    </div>
  );
}

// Sortable sub-category row for mobile
function SortableMobileSub({ cat, canEdit, onEdit }: { cat: Category; canEdit: boolean; onEdit: (c: Category) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const restrictedTransform = transform ? { ...transform, x: 0 } : transform;
  const style = {
    transform: CSS.Transform.toString(restrictedTransform),
    transition,
    ...(isDragging ? { zIndex: 10, position: 'relative' as const } : {}),
  };
  return (
    <div ref={setNodeRef} style={style}
      {...(canEdit ? { ...attributes, ...listeners } : {})}
      onClick={() => canEdit ? onEdit(cat) : null}
      className={`relative flex items-center py-1.5 pl-4 text-[12px] text-[var(--text-secondary)] border-b border-[var(--table-row-border)] last:border-b-0 ${canEdit ? 'active:text-[var(--btn-secondary-text)]' : ''} ${isDragging ? 'rounded-md bg-[var(--bg-hover)] border-[var(--color-accent)] shadow-sm' : ''}`}>
      {isDragging && (
        <>
          <span className="absolute left-1/2 -top-2.5 -translate-x-1/2 text-[var(--color-accent)]">
            <svg width="10" height="6" viewBox="0 0 10 6"><path d="M5 0L10 6H0Z" fill="currentColor"/></svg>
          </span>
          <span className="absolute left-1/2 -bottom-2.5 -translate-x-1/2 text-[var(--color-accent)]">
            <svg width="10" height="6" viewBox="0 0 10 6"><path d="M5 6L0 0H10Z" fill="currentColor"/></svg>
          </span>
        </>
      )}
      <span>{cat.sub_name}</span>
    </div>
  );
}

// --- Account Form ---
function AccountForm({
  account,
  users,
  onSave,
  onDelete,
  onClose,
}: {
  account?: Account;
  users: { id: number; displayName: string }[];
  onSave: (data: Record<string, unknown>) => void;
  onDelete?: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const [lastFour, setLastFour] = useState(account?.last_four ?? '');
  const [type, setType] = useState(account?.type ?? 'checking');
  const [classification, setClassification] = useState(account?.classification ?? 'liquid');
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<Set<number>>(() => {
    if (account?.owners?.length) return new Set(account.owners.map((o) => o.id));
    return new Set();
  });
  const [error, setError] = useState<string | null>(null);
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const ownerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t); }
  }, [error]);

  useEffect(() => {
    if (!ownerDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(e.target as Node)) {
        setOwnerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ownerDropdownOpen]);

  const toggleOwner = (id: number) => {
    setSelectedOwnerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteConfirm = async () => {
    if (onDelete) {
      const err = await onDelete();
      if (err) { setError(err); }
    }
  };

  return (
    <ResponsiveModal isOpen={true} onClose={onClose}>
      <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-4">
        {account ? 'Edit Account' : 'Add Account'}
      </h3>
      {error && (
        <InlineNotification type="error" message={error} dismissible onDismiss={() => setError(null)} className="mb-3" />
      )}
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Account Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Last Four (optional)</label>
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
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
            Owner{selectedOwnerIds.size > 1 ? 's' : ''}
          </label>
          <div className="relative" ref={ownerDropdownRef}>
            <button type="button" onClick={() => setOwnerDropdownOpen((v) => !v)}
              className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-left flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-1.5">
                {selectedOwnerIds.size === 0 ? (
                  <span className="text-[var(--text-muted)]">Select owners...</span>
                ) : (
                  users.filter((u) => selectedOwnerIds.has(u.id)).map((u) => (
                    <OwnerBadge key={u.id} user={u} />
                  ))
                )}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={`text-[var(--text-muted)] transition-transform duration-150 ${ownerDropdownOpen ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {ownerDropdownOpen && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-[var(--bg-card)] border border-[var(--bg-card-border)] rounded-lg overflow-hidden" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto' }}>
                {users.map((u, i) => {
                  const checked = selectedOwnerIds.has(u.id);
                  return (
                    <button key={u.id} type="button" onClick={() => toggleOwner(u.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-[13px] text-left cursor-pointer border-none transition-colors duration-150 ${
                        checked ? 'bg-[var(--badge-category-bg)]' : 'bg-transparent hover:bg-[var(--bg-hover)]'
                      } ${i < users.length - 1 ? 'border-b border-[var(--bg-card-border)]' : ''}`}
                      style={i < users.length - 1 ? { borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--bg-card-border)' } : undefined}>
                      <OwnerBadge user={u} />
                      <span className={`flex items-center justify-center rounded-full transition-all duration-150 ${
                        checked ? 'bg-[#3b82f6] border-2 border-[#3b82f6]' : 'bg-transparent border-2 border-[var(--text-very-muted)]'
                      }`} style={{ width: 18, height: 18 }}>
                        {checked && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-5 justify-end">
        {account && onDelete && (
          <div className="mr-auto">
            <ConfirmDeleteButton onConfirm={handleDeleteConfirm} />
          </div>
        )}
        <button onClick={onClose}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] border-none cursor-pointer btn-secondary">
          Cancel
        </button>
        <button onClick={() => {
          if (selectedOwnerIds.size === 0) { setError('At least one owner is required'); return; }
          onSave({ name, lastFour: lastFour || null, type, classification, ownerIds: Array.from(selectedOwnerIds) });
        }}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-none cursor-pointer btn-primary">
          Save
        </button>
      </div>
    </ResponsiveModal>
  );
}

// --- Category Form ---
function CategoryForm({
  category,
  existingGroups,
  onSave,
  onDelete,
  onClose,
}: {
  category?: Category;
  existingGroups: string[];
  onSave: (data: Record<string, unknown>) => void;
  onDelete?: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [catType, setCatType] = useState(category?.type ?? 'expense');
  const [groupName, setGroupName] = useState(category?.group_name ?? '');
  const [subName, setSubName] = useState(category?.sub_name ?? '');
  const [isDeductible, setIsDeductible] = useState(category?.is_deductible === 1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t); }
  }, [error]);

  const handleDeleteConfirm = async () => {
    if (onDelete) {
      const err = await onDelete();
      if (err) { setError(err); }
    }
  };

  return (
    <ResponsiveModal isOpen={true} onClose={onClose}>
      <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-4">
        {category ? 'Edit Category' : 'Add Category'}
      </h3>
      {error && (
        <InlineNotification type="error" message={error} dismissible onDismiss={() => setError(null)} className="mb-3" />
      )}
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Type</label>
          <div className="flex gap-2">
            {['income', 'expense'].map((t) => (
              <button key={t} onClick={() => setCatType(t)}
                className={`flex-1 py-2 text-[12px] font-semibold rounded-lg border-none cursor-pointer capitalize ${
                  catType === t ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] btn-primary' : 'bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] btn-secondary'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Group Name</label>
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} list="group-list"
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
          <datalist id="group-list">
            {existingGroups.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Sub-Category Name</label>
          <input value={subName} onChange={(e) => setSubName(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
        </div>
        {catType === 'expense' && (
          <label className="flex items-center gap-2 text-[13px] text-[var(--text-body)]">
            <input type="checkbox" checked={isDeductible} onChange={(e) => setIsDeductible(e.target.checked)} />
            Tax deductible
          </label>
        )}
      </div>
      <div className="flex gap-2 mt-5 justify-end">
        {category && onDelete && (
          <div className="mr-auto">
            <ConfirmDeleteButton onConfirm={handleDeleteConfirm} />
          </div>
        )}
        <button onClick={onClose}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] border-none cursor-pointer btn-secondary">
          Cancel
        </button>
        <button onClick={() => onSave({ groupName, subName, type: catType, isDeductible })}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-none cursor-pointer btn-primary">
          Save
        </button>
      </div>
    </ResponsiveModal>
  );
}

// --- Permission toggle labels mapped to permission keys ---
const PERMISSION_GROUPS = [
  {
    label: 'TRANSACTIONS',
    permissions: [
      { key: 'transactions.create', label: 'Create' },
      { key: 'transactions.edit', label: 'Edit' },
      { key: 'transactions.delete', label: 'Delete' },
      { key: 'transactions.bulk_edit', label: 'Bulk Edit' },
    ],
  },
  {
    label: 'SETTINGS',
    permissions: [
      { key: 'accounts.create', label: 'Manage Accounts' },
      { key: 'categories.create', label: 'Manage Categories' },
      { key: 'simplefin.manage', label: 'Manage Connections' },
    ],
  },
  {
    label: 'FINANCE',
    permissions: [
      { key: 'budgets.edit', label: 'Edit Budgets' },
      { key: 'balances.update', label: 'Update Balances' },
      { key: 'assets.create', label: 'Manage Assets' },
      { key: 'import.csv', label: 'CSV Import' },
      { key: 'import.bank_sync', label: 'Bank Sync Import' },
    ],
  },
];

// Map compound permissions: toggling "Manage Accounts" sets create/edit/delete together
const COMPOUND_PERMISSIONS: Record<string, string[]> = {
  'accounts.create': ['accounts.create', 'accounts.edit', 'accounts.delete'],
  'categories.create': ['categories.create', 'categories.edit', 'categories.delete'],
  'assets.create': ['assets.create', 'assets.edit', 'assets.delete'],
};

interface ManagedUser {
  id: number;
  username: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  isActive: boolean;
  twofaEnabled: boolean;
  createdAt: string;
  permissions: Record<string, boolean> | null;
}

// --- Preferences Tab ---
function PreferencesTab() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const isMobile = useIsMobile();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  // 2FA state
  const [twofaEnabled, setTwofaEnabled] = useState(!!user?.twofaEnabled);
  const [twofaStep, setTwofaStep] = useState<'idle' | 'scan' | 'backup' | 'disable' | 'regenerate'>('idle');
  const [setupData, setSetupData] = useState<{ qrCodeUrl: string; secret: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [twofaPassword, setTwofaPassword] = useState('');
  const [twofaError, setTwofaError] = useState('');
  const [twofaLoading, setTwofaLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('ledger-theme', next);
  };

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    try {
      await apiFetch('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ displayName }),
      });
      await refreshUser();
      addToast('Profile updated');
    } catch {
      addToast('Failed to update profile', 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return; }

    setPwLoading(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      addToast('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const hasPwInput = currentPassword || newPassword || confirmPassword;

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)]">
      <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-1">My Preferences</h3>
      <p className="text-[13px] text-[var(--text-secondary)] mb-4">Manage your profile and display settings.</p>

      {/* Appearance */}
      <div className="mb-5">
        <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">Appearance</label>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2.5 px-3 py-2 border border-[var(--table-border)] rounded-lg bg-[var(--bg-input)] text-[13px] cursor-pointer text-[var(--text-body)]"
        >
          <span className="text-[16px]">{theme === 'dark' ? '☀️' : '🌙'}</span>
          {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        </button>
      </div>

      {/* Profile section */}
      <div className={`${isMobile ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-4'} mb-5`}>
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Display Name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Username</label>
          <input value={user?.username ?? ''} disabled
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-muted)]" />
        </div>
      </div>

      <button onClick={handleSaveProfile} disabled={profileLoading}
        className={`px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-none cursor-pointer btn-primary disabled:opacity-60 mb-5 ${isMobile ? 'w-full' : ''}`}>
        Save Profile
      </button>

      {/* Password section */}
      <div className="mb-5">
        <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Change Password</label>
        {pwError && <InlineNotification type="error" message={pwError} dismissible onDismiss={() => setPwError('')} className="mb-2" />}
        <div className={isMobile ? 'flex flex-col gap-3' : 'grid grid-cols-3 gap-3'}>
          <input type="password" placeholder="Current password" value={currentPassword} autoComplete="current-password"
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
          <input type="password" placeholder="New password" value={newPassword} autoComplete="new-password"
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
          <input type="password" placeholder="Confirm new" value={confirmPassword} autoComplete="new-password"
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
        </div>
        {hasPwInput && (
          <button onClick={handleChangePassword} disabled={pwLoading}
            className={`mt-3 px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] border-none cursor-pointer btn-secondary disabled:opacity-60 ${isMobile ? 'w-full' : ''}`}>
            Change Password
          </button>
        )}
      </div>

      {/* Role */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-[12px] text-[var(--text-secondary)]">Role:</span>
        {user?.role === 'owner' ? (
          <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: 'var(--badge-owner-bg)', color: 'var(--badge-owner-text)' }}>Owner</span>
        ) : user?.role === 'admin' ? (
          <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-[var(--badge-admin-bg)] text-[var(--badge-admin-text)]">Admin</span>
        ) : (
          <>
            <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-[var(--badge-member-bg)] text-[var(--badge-member-text)]">Member</span>
            <span className="text-[11px] text-[var(--text-muted)]">Permissions managed by admin</span>
          </>
        )}
      </div>

      {/* Two-Factor Authentication */}
      <div className="pt-4 border-t border-[var(--table-border)]">
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-0.5">Two-Factor Authentication</label>
            <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${twofaEnabled ? 'bg-[#10b98122] text-[var(--color-positive)]' : 'bg-[var(--badge-member-bg)] text-[var(--text-muted)]'}`}>
              {twofaEnabled ? '✓ Enabled' : 'Disabled'}
            </span>
          </div>
        </div>

        {/* Idle state */}
        {!twofaEnabled && (
          <button
            onClick={async () => {
              setTwofaError('');
              setTwofaLoading(true);
              try {
                const res = await apiFetch<{ data: { qrCodeUrl: string; secret: string } }>('/auth/2fa/setup', { method: 'POST' });
                setSetupData(res.data);
                setTwofaStep('scan');
              } catch (err) {
                setTwofaError(err instanceof Error ? err.message : 'Failed to start setup');
              } finally {
                setTwofaLoading(false);
              }
            }}
            disabled={twofaLoading}
            className={`mt-2 px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-none cursor-pointer btn-primary disabled:opacity-60 ${isMobile ? 'w-full' : ''}`}
          >
            {twofaLoading ? 'Setting up...' : 'Enable 2FA'}
          </button>
        )}

        {twofaEnabled && (
          <div className={`flex ${isMobile ? 'flex-col' : ''} gap-2 mt-2`}>
            <button
              onClick={() => { setTwofaStep('regenerate'); setTwofaPassword(''); setTwofaError(''); }}
              className={`px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] border-none cursor-pointer btn-secondary ${isMobile ? 'w-full' : ''}`}
            >
              Regenerate Backup Codes
            </button>
            <button
              onClick={() => { setTwofaStep('disable'); setTwofaPassword(''); setTwofaError(''); }}
              className={`px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--color-negative)] text-white border-none cursor-pointer hover:brightness-110 transition-all ${isMobile ? 'w-full' : ''}`}
            >
              Disable 2FA
            </button>
          </div>
        )}

        {/* QR Scan step — in modal */}
        <ResponsiveModal
          title={twofaStep === 'scan' ? 'Enable Two-Factor Authentication' : twofaStep === 'backup' ? '2FA Enabled' : twofaStep === 'disable' ? 'Disable 2FA' : twofaStep === 'regenerate' ? 'Regenerate Backup Codes' : ''}
          isOpen={twofaStep !== 'idle'}
          onClose={() => { setTwofaStep('idle'); setSetupData(null); setVerifyCode(''); setShowSecret(false); setSecretCopied(false); setTwofaPassword(''); setTwofaError(''); }}
          maxWidth="420px"
        >
          {twofaError && <InlineNotification type="error" message={twofaError} dismissible onDismiss={() => setTwofaError('')} className="mb-3" />}

          {twofaStep === 'scan' && setupData && (
          <div>
            <p className="text-[13px] text-[var(--text-secondary)] mb-3">
              Scan this QR code with your authenticator app, then enter the code below.
            </p>
            <div className="flex justify-center mb-3">
              <div className="bg-white p-2 rounded-lg">
                <img src={setupData.qrCodeUrl} alt="2FA QR Code" className="w-40 h-40" />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="text-[11px] text-[var(--color-accent)] hover:underline bg-transparent border-none cursor-pointer mb-2 w-full text-center"
            >
              {showSecret ? 'Hide secret key' : "Can't scan? Enter manually"}
            </button>
            {showSecret && (
              <div className="flex justify-center mb-2">
              <Tooltip content={secretCopied ? '✓ Copied to clipboard' : 'Click to copy'}>
                <div
                  className="bg-[var(--bg-input)] border border-[var(--bg-input-border)] rounded-lg px-4 py-2 text-center w-fit cursor-pointer hover:border-[var(--color-accent)] transition-colors"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(setupData.secret);
                    } catch {
                      const ta = document.createElement('textarea');
                      ta.value = setupData.secret;
                      ta.style.position = 'fixed';
                      ta.style.opacity = '0';
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand('copy');
                      document.body.removeChild(ta);
                    }
                    setSecretCopied(true);
                    setTimeout(() => setSecretCopied(false), 2000);
                  }}
                >
                  <code className="text-[11px] font-mono text-[var(--text-primary)] break-all select-all">{setupData.secret}</code>
                </div>
              </Tooltip>
              </div>
            )}
            <div className="mb-3">
              <TotpCodeInput
                value={verifyCode}
                onChange={setVerifyCode}
                autoFocus
              />
            </div>
              <button
                onClick={async () => {
                  setTwofaError('');
                  setTwofaLoading(true);
                  try {
                    const res = await apiFetch<{ data: { backupCodes: string[] } }>('/auth/2fa/confirm', {
                      method: 'POST',
                      body: JSON.stringify({ token: verifyCode, secret: setupData.secret }),
                    });
                    setBackupCodes(res.data.backupCodes);
                    setTwofaEnabled(true);
                    setTwofaStep('backup');
                    setVerifyCode('');
                    await refreshUser();
                    addToast('2FA enabled');
                  } catch (err) {
                    setTwofaError(err instanceof Error ? err.message : 'Verification failed');
                  } finally {
                    setTwofaLoading(false);
                  }
                }}
                disabled={twofaLoading || verifyCode.length !== 6}
                className="w-full px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-none cursor-pointer btn-primary disabled:opacity-60"
              >
                {twofaLoading ? 'Verifying...' : 'Verify'}
              </button>
          </div>
        )}

        {twofaStep === 'backup' && (
          <div>
            <p className="text-[13px] text-[var(--text-secondary)] mb-1">Save these backup codes — each can only be used once.</p>
            <p className="text-[11px] text-[var(--color-negative)] font-medium mb-3">⚠ These codes won't be shown again.</p>
            <div className="bg-[var(--bg-input)] border border-[var(--bg-input-border)] rounded-lg p-3 mb-3">
              <div className="grid grid-cols-2 gap-1">
                {backupCodes.map((code, i) => (
                  <code key={i} className="text-[12px] font-mono text-[var(--text-primary)] text-center py-0.5">{code}</code>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(backupCodes.join('\n'));
                  } catch {
                    // Fallback for when clipboard API is blocked (e.g. inside modals)
                    const ta = document.createElement('textarea');
                    ta.value = backupCodes.join('\n');
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                  }
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className={`flex-1 py-2 rounded-lg text-[11px] font-semibold border border-[var(--bg-card-border)] bg-[var(--btn-secondary-bg)] text-[var(--text-primary)] cursor-pointer`}
              >
                {copied ? '✓ Copied!' : 'Copy All'}
              </button>
              <button
                onClick={() => setTwofaStep('idle')}
                className="flex-1 py-2 rounded-lg text-[11px] font-semibold bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-none cursor-pointer btn-primary"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {twofaStep === 'disable' && (
          <div>
            <p className="text-[13px] text-[var(--text-secondary)] mb-3">Enter your password to disable two-factor authentication.</p>
            <input
              type="password"
              value={twofaPassword}
              onChange={(e) => setTwofaPassword(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)] mb-3"
              placeholder="Current password"
              autoComplete="current-password"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setTwofaStep('idle'); setTwofaPassword(''); }}
                className="flex-1 px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] border-none cursor-pointer btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setTwofaError('');
                  setTwofaLoading(true);
                  try {
                    await apiFetch('/auth/2fa/disable', {
                      method: 'POST',
                      body: JSON.stringify({ password: twofaPassword }),
                    });
                    setTwofaEnabled(false);
                    setTwofaStep('idle');
                    setTwofaPassword('');
                    await refreshUser();
                    addToast('2FA disabled');
                  } catch (err) {
                    setTwofaError(err instanceof Error ? err.message : 'Failed to disable 2FA');
                  } finally {
                    setTwofaLoading(false);
                  }
                }}
                disabled={twofaLoading || !twofaPassword}
                className="flex-1 px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--color-negative)] text-white border-none cursor-pointer hover:brightness-110 disabled:opacity-60"
              >
                {twofaLoading ? 'Disabling...' : 'Disable'}
              </button>
            </div>
          </div>
        )}

        {twofaStep === 'regenerate' && (
          <div>
            <p className="text-[13px] text-[var(--text-secondary)] mb-3">Enter your password to regenerate backup codes. This will invalidate all previous codes.</p>
            <input
              type="password"
              value={twofaPassword}
              onChange={(e) => setTwofaPassword(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)] mb-3"
              placeholder="Current password"
              autoComplete="current-password"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setTwofaStep('idle'); setTwofaPassword(''); }}
                className="flex-1 px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] border-none cursor-pointer btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setTwofaError('');
                  setTwofaLoading(true);
                  try {
                    const res = await apiFetch<{ data: { backupCodes: string[] } }>('/auth/2fa/regenerate-backup-codes', {
                      method: 'POST',
                      body: JSON.stringify({ password: twofaPassword }),
                    });
                    setBackupCodes(res.data.backupCodes);
                    setTwofaStep('backup');
                    setTwofaPassword('');
                    addToast('Backup codes regenerated');
                  } catch (err) {
                    setTwofaError(err instanceof Error ? err.message : 'Failed to regenerate codes');
                  } finally {
                    setTwofaLoading(false);
                  }
                }}
                disabled={twofaLoading || !twofaPassword}
                className="flex-1 px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-none cursor-pointer btn-primary disabled:opacity-60"
              >
                {twofaLoading ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>
          </div>
        )}
        </ResponsiveModal>
      </div>
    </div>
  );
}

// --- Add User Modal ---
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

  const handleSubmit = async () => {
    setError('');
    if (!displayName.trim()) { setError('Display name is required'); return; }
    if (!/^[a-z0-9]{3,20}$/.test(username)) { setError('Username must be 3-20 lowercase alphanumeric characters'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, displayName, role }),
      });
      addToast('User created');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveModal isOpen={true} onClose={onClose}>
      <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-4">Add User</h3>
      {error && <InlineNotification type="error" message={error} dismissible onDismiss={() => setError('')} className="mb-3" />}
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Display Name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="off"
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
          <p className="text-[10px] text-[var(--text-muted)] mt-1">Lowercase letters and numbers only</p>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
          <p className="text-[10px] text-[var(--text-muted)] mt-1">Minimum 8 characters</p>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Confirm Password</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password"
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Role</label>
          <div className="flex gap-2">
            {(['member', 'admin'] as const).map((r) => (
              <button key={r} onClick={() => (r === 'admin' && !canCreateAdmin) ? null : setRole(r)}
                disabled={r === 'admin' && !canCreateAdmin}
                className={`flex-1 py-2 text-[12px] font-semibold rounded-lg border-none cursor-pointer capitalize ${
                  role === r ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] btn-primary' : 'bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] btn-secondary'
                } disabled:opacity-40 disabled:cursor-not-allowed`}>
                {r}
              </button>
            ))}
          </div>
          {!canCreateAdmin && <p className="text-[10px] text-[var(--text-muted)] mt-1">Only the owner can create admin accounts</p>}
        </div>
      </div>
      <div className="flex gap-2 mt-5 justify-end">
        <button onClick={onClose}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] border-none cursor-pointer btn-secondary">
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={loading}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-none cursor-pointer btn-primary disabled:opacity-60">
          Create User
        </button>
      </div>
    </ResponsiveModal>
  );
}

// --- Edit User Modal ---
function EditUserModal({ managedUser, currentUserId, callerRole, onClose, onUpdated }: {
  managedUser: ManagedUser;
  currentUserId: number;
  callerRole: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { addToast } = useToast();
  const [displayName, setDisplayName] = useState(managedUser.displayName);
  const [role, setRole] = useState<'admin' | 'member'>(managedUser.role === 'owner' ? 'admin' : managedUser.role as 'admin' | 'member');
  const [isActive, setIsActive] = useState(managedUser.isActive);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isSelf = managedUser.id === currentUserId;
  const canChangeRole = callerRole === 'owner' && managedUser.role !== 'owner';

  const handleSave = async () => {
    setError('');
    setLoading(true);
    try {
      // Update profile
      await apiFetch(`/users/${managedUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({ displayName, role, isActive }),
      });

      // Reset password if provided
      if (newPassword) {
        if (newPassword.length < 8) { setError('Password must be at least 8 characters'); setLoading(false); return; }
        if (newPassword !== confirmPassword) { setError('Passwords do not match'); setLoading(false); return; }
        await apiFetch(`/users/${managedUser.id}/password`, {
          method: 'PUT',
          body: JSON.stringify({ password: newPassword }),
        });
      }

      addToast('User updated');
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await apiFetch(`/users/${managedUser.id}`, { method: 'DELETE' });
      addToast('User deactivated');
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate user');
    }
  };

  return (
    <ResponsiveModal isOpen={true} onClose={onClose}>
      <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-4">Edit User</h3>
      {error && <InlineNotification type="error" message={error} dismissible onDismiss={() => setError('')} className="mb-3" />}
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Display Name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Role</label>
          {canChangeRole ? (
            <>
              <div className="flex gap-2">
                {(['member', 'admin'] as const).map((r) => (
                  <button key={r} onClick={() => setRole(r)}
                    className={`flex-1 py-2 text-[12px] font-semibold rounded-lg border-none cursor-pointer capitalize ${
                      role === r ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] btn-primary' : 'bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] btn-secondary'
                    }`}>
                    {r}
                  </button>
                ))}
              </div>
              {role === 'admin' && managedUser.role === 'member' && (
                <p className="text-[10px] text-[var(--color-negative)] mt-1">This will grant full access to all features.</p>
              )}
              {role === 'member' && managedUser.role === 'admin' && (
                <p className="text-[10px] text-[var(--color-negative)] mt-1">This will restrict the user to member permissions.</p>
              )}
            </>
          ) : (
            <div className="text-[13px] text-[var(--text-secondary)] py-2 capitalize">{managedUser.role}</div>
          )}
        </div>
        {!isSelf && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">Active</label>
            <button onClick={() => setIsActive(!isActive)}
              className="relative w-9 h-5 rounded-full border-none cursor-pointer transition-colors"
              style={{ background: isActive ? 'var(--color-positive)' : 'var(--bg-hover)' }}>
              <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: isActive ? 17 : 2 }} />
            </button>
            {!isActive && <span className="text-[10px] text-[var(--color-negative)]">This user will not be able to log in.</span>}
          </div>
        )}
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Reset Password (optional)</label>
          <div className="grid grid-cols-2 gap-2">
            <input type="password" placeholder="New password" value={newPassword} autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)}
              className="px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
            <input type="password" placeholder="Confirm" value={confirmPassword} autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-body)]" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-5 justify-end">
        {!isSelf && managedUser.isActive && (
          <div className="mr-auto">
            <ConfirmDeleteButton onConfirm={handleDeactivate} label="Deactivate" confirmLabel="Confirm Deactivate?" />
          </div>
        )}
        <button onClick={onClose}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] border-none cursor-pointer btn-secondary">
          Cancel
        </button>
        <button onClick={handleSave} disabled={loading}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-none cursor-pointer btn-primary disabled:opacity-60">
          Save Changes
        </button>
      </div>
    </ResponsiveModal>
  );
}

// --- Delete User Modal (Two-Step) ---
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
      .then(res => {
        setPreview(res.data);
        // Auto-select if only one available owner
        if (res.data.availableOwners.length === 1) {
          const autoAssign: Record<number, number> = {};
          for (const acct of res.data.soleOwnedAccounts) {
            autoAssign[acct.id] = res.data.availableOwners[0].id;
          }
          setAssignments(autoAssign);
        }
      })
      .catch(err => {
        addToast(err instanceof Error ? err.message : 'Failed to load delete preview', 'error');
        onClose();
      })
      .finally(() => setLoading(false));
  }, [userId, addToast, onClose]);

  if (loading || !preview) {
    return (
      <ResponsiveModal isOpen={true} onClose={onClose} maxWidth="520px">
        <div className="text-[13px] text-[var(--text-secondary)]">Loading...</div>
      </ResponsiveModal>
    );
  }

  const allAssigned = preview.soleOwnedAccounts.length === 0 ||
    preview.soleOwnedAccounts.every(a => assignments[a.id]);
  const confirmReady = confirmText === preview.user.username;

  // Build summary lines for step 2
  const summaryLines: string[] = [];
  const reassignedCount = Object.keys(assignments).length;
  if (reassignedCount > 0) {
    const ownerNames = [...new Set(Object.values(assignments).map(oid => preview.availableOwners.find(o => o.id === oid)?.displayName || ''))];
    summaryLines.push(`${reassignedCount} account${reassignedCount !== 1 ? 's' : ''} will be reassigned to ${ownerNames.join(', ')}.`);
  }
  if (preview.coOwnedAccounts.length > 0) {
    summaryLines.push(`${preview.coOwnedAccounts.length} co-owned account${preview.coOwnedAccounts.length !== 1 ? 's' : ''} will have ${preview.user.displayName} removed.`);
  }
  if (preview.personalConnections > 0) {
    summaryLines.push(`${preview.personalConnections} personal SimpleFIN connection${preview.personalConnections !== 1 ? 's' : ''} will be deleted.`);
  }
  if (preview.payCyclesOwned > 0) {
    summaryLines.push(`${preview.payCyclesOwned} pay cycle${preview.payCyclesOwned !== 1 ? 's' : ''} will be unassigned (not deleted).`);
  }

  const handleDelete = async () => {
    setError('');
    setDeleting(true);
    try {
      await apiFetch(`/users/${userId}/permanent`, {
        method: 'DELETE',
        body: JSON.stringify({
          reassignments: Object.entries(assignments).map(([accountId, newOwnerId]) => ({
            accountId: Number(accountId),
            newOwnerId,
          })),
          confirmUsername: confirmText,
        }),
      });
      addToast('User permanently deleted', 'success');
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const OWNER_COLORS = [
    { bg: 'var(--badge-owner-1-bg)', text: 'var(--badge-owner-1-text)' },
    { bg: 'var(--badge-owner-2-bg)', text: 'var(--badge-owner-2-text)' },
  ];

  const roleBadge = preview.user.role === 'admin'
    ? { bg: 'var(--badge-admin-bg)', text: 'var(--badge-admin-text)', label: 'Admin' }
    : { bg: 'var(--badge-member-bg)', text: 'var(--badge-member-text)', label: 'Member' };

  return (
    <ResponsiveModal isOpen={true} onClose={onClose} maxWidth="520px">
      <div style={{ padding: '0' }}>

        {step === 'preview' && (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[16px] flex-shrink-0"
                style={{ background: OWNER_COLORS[1]?.bg || '#4a1942', color: OWNER_COLORS[1]?.text || '#f472b6' }}>
                {preview.user.displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-[18px] font-bold text-[var(--text-primary)] m-0">Permanently Delete {preview.user.displayName}?</h2>
                <span className="text-[12px] text-[var(--text-secondary)]">
                  @{preview.user.username} · <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: roleBadge.bg, color: roleBadge.text }}>{roleBadge.label}</span>
                </span>
              </div>
            </div>

            {/* Destructive warning */}
            <div className="rounded-lg p-3 mb-4 text-[13px] leading-relaxed bg-[var(--bg-inline-error)] border border-[var(--bg-inline-error-border)] text-[var(--text-inline-error)]">
              <strong>This action is permanent and cannot be undone.</strong> The user account will be completely removed from the system. All permissions will be deleted. The user will no longer appear in the app.
            </div>

            {/* What will be preserved */}
            <div className="mb-5">
              <div className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-2">What Will Be Preserved</div>
              <div className="text-[13px] text-[var(--text-body)] leading-relaxed">
                Transactions, budgets, balance history, and all other financial data are tied to accounts — not users. Deleting this user will <strong className="text-[var(--text-primary)]">not</strong> remove any financial data.
              </div>
            </div>

            {/* What will be removed */}
            <div className="mb-5">
              <div className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-2">What Will Be Removed</div>
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2 text-[13px] text-[var(--text-body)]">
                  <span className="text-[var(--color-negative)]">✗</span> User account and login credentials
                </div>
                <div className="flex gap-2 text-[13px] text-[var(--text-body)]">
                  <span className="text-[var(--color-negative)]">✗</span> All permission settings
                </div>
                {preview.personalConnections > 0 && (
                  <div className="flex gap-2 text-[13px] text-[var(--text-body)]">
                    <span className="text-[var(--color-negative)]">✗</span> {preview.personalConnections} personal SimpleFIN connection{preview.personalConnections !== 1 ? 's' : ''} and linked accounts
                  </div>
                )}
              </div>
            </div>

            {/* Account reassignment */}
            {preview.soleOwnedAccounts.length > 0 && (
              <div className="mb-5">
                <div className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-1">Account Reassignment Required</div>
                <div className="text-[12px] text-[var(--text-muted)] mb-3">The following accounts are solely owned by {preview.user.displayName} and must be reassigned to another user before deletion.</div>
                <div className="flex flex-col gap-2">
                  {preview.soleOwnedAccounts.map(acct => (
                    <div key={acct.id} className="flex items-center justify-between p-2.5 bg-[var(--bg-hover)] rounded-lg">
                      <div>
                        <span className="text-[13px] font-medium text-[var(--text-primary)]">{acct.name}</span>
                        {acct.lastFour && <span className="text-[11px] text-[var(--text-muted)] font-mono ml-1.5">({acct.lastFour})</span>}
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5 capitalize">{acct.type} · {acct.classification}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--text-muted)]">→</span>
                        <select
                          value={assignments[acct.id] || ''}
                          onChange={e => setAssignments(prev => ({ ...prev, [acct.id]: Number(e.target.value) }))}
                          className="px-2.5 py-1.5 border border-[var(--table-border)] rounded-md text-[12px] bg-[var(--bg-input)] text-[var(--text-primary)] cursor-pointer min-w-[140px]"
                        >
                          <option value="">Select new owner</option>
                          {preview.availableOwners.map(o => (
                            <option key={o.id} value={o.id}>{o.displayName}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Co-owned accounts */}
            {preview.coOwnedAccounts.length > 0 && (
              <div className="mb-5">
                <div className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-1">Co-Owned Accounts</div>
                <div className="text-[12px] text-[var(--text-muted)] mb-2">{preview.user.displayName} will be removed as co-owner. Other owners are unaffected.</div>
                <div className="flex flex-col gap-1.5">
                  {preview.coOwnedAccounts.map(acct => (
                    <div key={acct.id} className="p-2 bg-[var(--bg-hover)] rounded-lg text-[13px] text-[var(--text-body)]">
                      {acct.name} {acct.lastFour && <span className="font-mono text-[11px] text-[var(--text-muted)]">({acct.lastFour})</span>}
                      <span className="text-[11px] text-[var(--text-muted)]"> — {acct.remainingOwners.join(', ')} remain{acct.remainingOwners.length === 1 ? 's' : ''} as owner</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="rounded-lg p-3 mb-4 text-[13px] bg-[var(--bg-inline-error)] border border-[var(--bg-inline-error-border)] text-[var(--text-inline-error)]">{error}</div>}

            {/* Buttons */}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={onClose}
                className="px-4 py-2 rounded-lg border-none text-[13px] font-semibold cursor-pointer bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] btn-secondary">
                Cancel
              </button>
              <button onClick={() => allAssigned && setStep('confirm')}
                disabled={!allAssigned}
                className="px-4 py-2 rounded-lg border-none text-[13px] font-semibold cursor-pointer disabled:cursor-not-allowed"
                style={{ background: allAssigned ? 'var(--color-negative)' : 'var(--btn-secondary-bg)', color: allAssigned ? '#fff' : 'var(--text-muted)', opacity: allAssigned ? 1 : 0.5 }}>
                Continue to Confirmation
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            {/* Header */}
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-4">Final Confirmation</h2>

            {/* Big red warning */}
            <div className="rounded-lg p-4 mb-5 text-center bg-[var(--bg-inline-error)] border border-[var(--bg-inline-error-border)] text-[var(--text-inline-error)]">
              <div className="text-[20px] mb-2">⚠️</div>
              <strong className="text-[13px]">You are about to permanently delete the user &ldquo;{preview.user.displayName}&rdquo;.</strong>
              {summaryLines.length > 0 && (
                <div className="mt-2 text-[12px]" style={{ color: 'var(--text-inline-error)', opacity: 0.9 }}>
                  {summaryLines.map((line, i) => <div key={i}>{line}</div>)}
                </div>
              )}
            </div>

            {/* Type to confirm */}
            <div className="mb-5">
              <label className="text-[13px] text-[var(--text-body)] block mb-2">
                Type <strong className="text-[var(--text-primary)] font-mono">{preview.user.username}</strong> to confirm deletion:
              </label>
              <input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Type username here..."
                autoCapitalize="off"
                className="w-full px-3 py-2.5 rounded-lg text-[14px] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none font-mono"
                style={{ border: `1px solid ${confirmReady ? 'var(--color-negative)' : 'var(--table-border)'}` }}
              />
            </div>

            {error && <div className="rounded-lg p-3 mb-4 text-[13px] bg-[var(--bg-inline-error)] border border-[var(--bg-inline-error-border)] text-[var(--text-inline-error)]">{error}</div>}

            {/* Buttons */}
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep('preview')}
                className="px-4 py-2 rounded-lg border-none text-[13px] font-semibold cursor-pointer bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] btn-secondary">
                ← Back
              </button>
              <button onClick={handleDelete}
                disabled={!confirmReady || deleting}
                className="px-5 py-2 rounded-lg border-none text-[13px] font-semibold cursor-pointer disabled:cursor-not-allowed"
                style={{ background: confirmReady ? 'var(--color-negative)' : 'var(--btn-secondary-bg)', color: confirmReady ? '#fff' : 'var(--text-muted)', opacity: confirmReady ? 1 : 0.5 }}>
                {deleting ? 'Deleting...' : 'Permanently Delete User'}
              </button>
            </div>
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}

// --- Users & Permissions Section ---
function UsersPermissionsSection() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set());
  const [requireAdmin2FA, setRequireAdmin2FA] = useState(false);
  const [requireMember2FA, setRequireMember2FA] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiFetch<{ users: ManagedUser[] }>('/users');
      setManagedUsers(res.users);
    } catch {
      addToast('Failed to load users', 'error');
    }
  }, [addToast]);

  const load2FARequirements = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: { requireAdmin: boolean; requireMember: boolean } }>('/auth/2fa/requirements');
      setRequireAdmin2FA(res.data.requireAdmin);
      setRequireMember2FA(res.data.requireMember);
    } catch {
      // Silent fail — requirements are owner-only
    }
  }, []);

  useEffect(() => { loadUsers(); load2FARequirements(); }, [loadUsers, load2FARequirements]);

  const callerRole = user?.role || 'member';

  const toggleUserExpanded = (userId: number) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const handleTogglePermission = async (userId: number, permKey: string, currentValue: boolean) => {
    const compound = COMPOUND_PERMISSIONS[permKey];
    const keysToUpdate = compound || [permKey];
    const newValue = !currentValue;

    // Optimistic update
    setManagedUsers(prev => prev.map(u => {
      if (u.id !== userId || !u.permissions) return u;
      const perms = { ...u.permissions };
      for (const k of keysToUpdate) perms[k] = newValue;
      return { ...u, permissions: perms };
    }));

    try {
      const permissions: Record<string, boolean> = {};
      for (const k of keysToUpdate) permissions[k] = newValue;
      await apiFetch(`/users/${userId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      });
    } catch {
      addToast('Failed to update permission', 'error');
      loadUsers(); // Revert on error
    }
  };

  const OWNER_COLORS = [
    { bg: 'var(--badge-owner-1-bg)', text: 'var(--badge-owner-1-text)' },
    { bg: 'var(--badge-owner-2-bg)', text: 'var(--badge-owner-2-text)' },
    { bg: '#ddd6fe', text: '#7c3aed' },
    { bg: '#d1fae5', text: '#059669' },
  ];

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)]">
      <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-1">Users & Permissions</h3>
      <p className="text-[13px] text-[var(--text-secondary)] mb-4">Manage household members and their access levels.</p>

      <div className="flex flex-col gap-3">
        {managedUsers.map((mu, idx) => (
          <div key={mu.id} className="p-3 bg-[var(--bg-hover)] rounded-lg">
            {/* User header */}
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px]"
                  style={{ background: OWNER_COLORS[idx % OWNER_COLORS.length].bg, color: OWNER_COLORS[idx % OWNER_COLORS.length].text }}>
                  {mu.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-[13px] text-[var(--text-primary)] flex items-center gap-1.5">
                    {mu.displayName}
                    {!mu.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--badge-negative-bg)] text-[var(--badge-negative-text)]">Inactive</span>}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">{mu.username}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {mu.role === 'owner' ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: 'var(--badge-owner-bg)', color: 'var(--badge-owner-text)' }}>Owner</span>
                ) : mu.role === 'admin' ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-[var(--badge-admin-bg)] text-[var(--badge-admin-text)]">Admin</span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-[var(--badge-member-bg)] text-[var(--badge-member-text)]">Member</span>
                )}
                {mu.twofaEnabled && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-[#10b98122] text-[var(--color-positive)]">2FA</span>
                )}
                {/* Edit button: owner can edit anyone except self-role; admin can edit members only */}
                {mu.role !== 'owner' && (callerRole === 'owner' || (callerRole === 'admin' && mu.role === 'member')) && (
                  <button onClick={() => setEditingUser(mu)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-transparent border-none cursor-pointer text-[13px]">
                    ✎
                  </button>
                )}
                {/* Reset 2FA: visible if target has 2FA and caller can manage them */}
                {mu.twofaEnabled && mu.id !== user?.id && mu.role !== 'owner' && (callerRole === 'owner' || (callerRole === 'admin' && mu.role === 'member')) && (
                  <ConfirmDeleteButton
                    onConfirm={async () => {
                      try {
                        await apiFetch(`/auth/2fa/reset/${mu.id}`, { method: 'POST' });
                        addToast(`2FA reset for ${mu.displayName}`);
                        loadUsers();
                      } catch (err) {
                        addToast(err instanceof Error ? err.message : 'Failed to reset 2FA', 'error');
                      }
                    }}
                    label="Reset 2FA"
                    confirmLabel="Confirm Reset"
                  />
                )}
                {/* Delete button: same visibility as edit, but not on self */}
                {mu.id !== user?.id && mu.role !== 'owner' && (callerRole === 'owner' || (callerRole === 'admin' && mu.role === 'member')) && (
                  <button onClick={() => setDeletingUser(mu)}
                    className="text-[var(--color-negative)] hover:opacity-80 bg-transparent border-none cursor-pointer text-[11px] font-medium">
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Owner/Admin info or member permissions */}
            {mu.role === 'owner' ? (
              <div className="text-[11px] text-[var(--text-muted)] italic py-1">App owner. Cannot be restricted or removed.</div>
            ) : mu.role === 'admin' ? (
              <div className="text-[11px] text-[var(--text-muted)] italic py-1">Admins have all permissions.{callerRole !== 'owner' && ' Cannot be restricted.'}</div>
            ) : mu.permissions && (
              <>
                <button
                  onClick={() => toggleUserExpanded(mu.id)}
                  className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-transparent border-none cursor-pointer mt-1 px-0 transition-colors"
                >
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="transition-transform"
                    style={{ transform: expandedUsers.has(mu.id) ? 'rotate(90deg)' : 'rotate(0deg)', transitionDuration: '150ms' }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  {expandedUsers.has(mu.id) ? 'Hide Permissions' : 'Show Permissions'}
                </button>
                <div
                  className="overflow-hidden transition-all"
                  style={{
                    maxHeight: expandedUsers.has(mu.id) ? '500px' : '0px',
                    transitionDuration: '150ms',
                    transitionTimingFunction: 'ease',
                  }}
                >
                  <div className="grid grid-cols-3 mt-2" style={{ gap: 0 }}>
                    {PERMISSION_GROUPS.map((group, gi) => (
                      <div key={group.label} className={`${gi < 2 ? 'border-r border-[var(--bg-card-border)]' : ''} ${gi === 0 ? 'pr-4' : gi === 1 ? 'px-4' : 'pl-4'}`}>
                        <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] pb-2 mb-2 border-b border-[var(--bg-card-border)]">{group.label}</div>
                        {group.permissions.map((p) => {
                          const granted = mu.permissions![p.key] ?? false;
                          return (
                            <div key={p.key} className="flex justify-between items-center py-1.5 border-b border-[var(--bg-card-border)]" style={{ borderBottomWidth: '1px' }}>
                              <span className="text-[12px] text-[var(--text-secondary)]">{p.label}</span>
                              <button onClick={() => handleTogglePermission(mu.id, p.key, granted)}
                                className="relative w-9 h-5 rounded-full border-none cursor-pointer transition-colors"
                                style={{ background: granted ? 'var(--color-positive)' : 'var(--bg-card-border)' }}>
                                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: granted ? 17 : 2 }} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ))}

        <button onClick={() => setShowAddModal(true)}
          className="w-full py-2.5 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer flex items-center justify-center gap-1.5 btn-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add User
        </button>
      </div>

      {/* 2FA Requirements — Owner only */}
      {user?.role === 'owner' && (
        <div className="mt-4 pt-4 border-t border-[var(--bg-card-border)]">
          <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-3">Two-Factor Authentication Requirements</h4>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center py-1.5">
              <span className="text-[12px] text-[var(--text-secondary)]">Require 2FA for Admins</span>
              <button
                onClick={async () => {
                  const newVal = !requireAdmin2FA;
                  setRequireAdmin2FA(newVal);
                  try {
                    await apiFetch('/auth/2fa/requirements', {
                      method: 'PUT',
                      body: JSON.stringify({ requireAdmin: newVal }),
                    });
                    addToast(newVal ? '2FA now required for admins' : '2FA no longer required for admins');
                  } catch {
                    setRequireAdmin2FA(!newVal);
                    addToast('Failed to update requirement', 'error');
                  }
                }}
                className="relative w-9 h-5 rounded-full border-none cursor-pointer transition-colors"
                style={{ background: requireAdmin2FA ? 'var(--color-positive)' : 'var(--bg-card-border)' }}
              >
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: requireAdmin2FA ? 17 : 2 }} />
              </button>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-[12px] text-[var(--text-secondary)]">Require 2FA for Members</span>
              <button
                onClick={async () => {
                  const newVal = !requireMember2FA;
                  setRequireMember2FA(newVal);
                  try {
                    await apiFetch('/auth/2fa/requirements', {
                      method: 'PUT',
                      body: JSON.stringify({ requireMember: newVal }),
                    });
                    addToast(newVal ? '2FA now required for members' : '2FA no longer required for members');
                  } catch {
                    setRequireMember2FA(!newVal);
                    addToast('Failed to update requirement', 'error');
                  }
                }}
                className="relative w-9 h-5 rounded-full border-none cursor-pointer transition-colors"
                style={{ background: requireMember2FA ? 'var(--color-positive)' : 'var(--bg-card-border)' }}
              >
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: requireMember2FA ? 17 : 2 }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && <AddUserModal onClose={() => setShowAddModal(false)} onCreated={loadUsers} callerRole={callerRole} />}
      {editingUser && (
        <EditUserModal
          managedUser={editingUser}
          currentUserId={user!.id}
          callerRole={callerRole}
          onClose={() => setEditingUser(null)}
          onUpdated={loadUsers}
        />
      )}
      {deletingUser && (
        <DeleteUserModal
          userId={deletingUser.id}
          onClose={() => setDeletingUser(null)}
          onDeleted={loadUsers}
        />
      )}
    </div>
  );
}

function StickyAddButton({ permission, label, onClick }: { permission: string; label: string; onClick: () => void }) {
  return (
    <PermissionGate permission={permission} fallback="disabled">
      <div className="fixed z-10" style={{
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
      }}>
        <button onClick={onClick}
          className="flex items-center gap-1 cursor-pointer border-none"
          style={{
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-text)',
            padding: '10px 24px',
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            whiteSpace: 'nowrap',
          }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> {label}
        </button>
      </div>
    </PermissionGate>
  );
}

// --- Expand/Contract Icons ---
const ExpandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9" />
    <line x1="14" y1="10" x2="21" y2="3" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="10" y1="14" x2="3" y2="21" />
  </svg>
);
const ContractIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 14 10 14 10 20" />
    <line x1="3" y1="21" x2="10" y2="14" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="21" y1="3" x2="14" y2="10" />
  </svg>
);

// --- Expandable Card Wrapper ---
function ExpandableCard({ title, subtitle, expanded, onToggle, children }: {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const header = (
    <>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[14px] font-bold text-[var(--text-primary)] m-0">{title}</h3>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="bg-transparent border-none cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-md hover:bg-[var(--bg-hover)]"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ContractIcon /> : <ExpandIcon />}
        </button>
      </div>
      <p className="text-[13px] text-[var(--text-secondary)] mb-3">{subtitle}</p>
    </>
  );

  return (
    <>
      {/* Always render inline card to preserve grid layout */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)] flex flex-col h-[420px]"
        style={expanded ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
        {header}
        {children}
      </div>

      {/* Expanded modal via portal */}
      {expanded && createPortal(
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40" onClick={onToggle}>
          <div style={{ width: 'calc((100vw - 220px - 72px - 20px) / 2)' }} onClick={(e) => e.stopPropagation()}>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)] flex flex-col"
              style={{ height: '80vh', maxHeight: '80vh' }}>
              {header}
              {children}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default function SettingsPage() {
  const { addToast } = useToast();
  const { isAdmin, hasPermission, user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'settings';
  const [mobileSubPage, setMobileSubPage] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [userList, setUserList] = useState<{ id: number; displayName: string }[]>([]);
  const [editingAccount, setEditingAccount] = useState<Account | null | 'new'>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null | 'new'>(null);
  const [expandedAccounts, setExpandedAccounts] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState(false);

  const switchTab = (tab: string) => {
    setSearchParams({ tab });
  };

  const loadData = useCallback(async () => {
    const [acctRes, catRes, userRes] = await Promise.all([
      apiFetch<{ data: Account[] }>('/accounts'),
      apiFetch<{ data: Category[] }>('/categories'),
      apiFetch<{ data: { id: number; display_name: string }[] }>('/users'),
    ]);
    setAccounts(acctRes.data);
    setCategories(catRes.data);
    setUserList(userRes.data.map((u) => ({ id: u.id, displayName: u.display_name })));
    initOwnerSlots(userRes.data.map((u) => u.id));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Group categories
  const grouped: GroupedCategory[] = [];
  const groupMap = new Map<string, GroupedCategory>();
  for (const cat of categories) {
    const key = `${cat.type}:${cat.group_name}`;
    if (!groupMap.has(key)) {
      const g = { group: cat.group_name, type: cat.type, subs: [] as Category[] };
      groupMap.set(key, g);
      grouped.push(g);
    }
    groupMap.get(key)!.subs.push(cat);
  }
  // Sort sub-categories within each group by sort_order
  for (const g of grouped) {
    g.subs.sort((a, b) => a.sort_order - b.sort_order);
  }

  const expenseGroups = grouped.filter((g) => g.type === 'expense').sort((a, b) => a.group.localeCompare(b.group));
  const incomeGroups = grouped.filter((g) => g.type === 'income').sort((a, b) => a.group.localeCompare(b.group));
  const allGroups = [...incomeGroups, ...expenseGroups];
  const existingGroupNames = [...new Set(categories.filter((c) => c.type === 'expense').map((c) => c.group_name))];
  existingGroupNames.push('Income');

  const handleSaveAccount = async (data: Record<string, unknown>) => {
    try {
      if (editingAccount === 'new') {
        await apiFetch('/accounts', { method: 'POST', body: JSON.stringify(data) });
      } else if (editingAccount) {
        await apiFetch(`/accounts/${editingAccount.id}`, { method: 'PUT', body: JSON.stringify(data) });
      }
      setEditingAccount(null);
      addToast('Account saved');
      loadData();
    } catch {
      addToast('Failed to save account', 'error');
    }
  };

  const handleDeleteAccount = async (): Promise<string | null> => {
    if (editingAccount && editingAccount !== 'new') {
      try {
        await apiFetch(`/accounts/${editingAccount.id}`, { method: 'DELETE' });
        setEditingAccount(null);
        addToast('Account deleted');
        loadData();
        return null;
      } catch (err) {
        addToast('Failed to delete account', 'error');
        return err instanceof Error ? err.message : 'Delete failed';
      }
    }
    return null;
  };

  const handleSaveCategory = async (data: Record<string, unknown>) => {
    try {
      if (editingCategory === 'new') {
        await apiFetch('/categories', { method: 'POST', body: JSON.stringify(data) });
      } else if (editingCategory) {
        await apiFetch(`/categories/${editingCategory.id}`, { method: 'PUT', body: JSON.stringify(data) });
      }
      setEditingCategory(null);
      addToast('Category saved');
      loadData();
    } catch {
      addToast('Failed to save category', 'error');
    }
  };

  const handleDeleteCategory = async (): Promise<string | null> => {
    if (editingCategory && editingCategory !== 'new') {
      try {
        await apiFetch(`/categories/${editingCategory.id}`, { method: 'DELETE' });
        setEditingCategory(null);
        addToast('Category deleted');
        loadData();
        return null;
      } catch (err) {
        addToast('Failed to delete category', 'error');
        return err instanceof Error ? err.message : 'Delete failed';
      }
    }
    return null;
  };

  // Drag-and-drop sensors and handler for category reorder
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } });
  const dndSensors = useSensors(pointerSensor, touchSensor);

  const handleCategoryDragEnd = async (event: DragEndEvent, groupSubs: Category[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groupSubs.findIndex((s) => s.id === active.id);
    const newIndex = groupSubs.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(groupSubs, oldIndex, newIndex);
    const items = reordered.map((s, i) => ({ id: s.id, sort_order: i }));
    // Optimistic update
    setCategories((prev) => {
      const updated = [...prev];
      for (const item of items) {
        const cat = updated.find((c) => c.id === item.id);
        if (cat) cat.sort_order = item.sort_order;
      }
      return updated;
    });
    try {
      await apiFetch('/categories/reorder', { method: 'PUT', body: JSON.stringify({ items }) });
    } catch {
      addToast('Failed to save sort order', 'error');
      loadData();
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        {isMobile && mobileSubPage ? (
          <button onClick={() => setMobileSubPage(null)}
            className="flex items-center gap-1 text-[13px] text-[var(--text-secondary)] bg-transparent border-none cursor-pointer font-medium">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            Settings
          </button>
        ) : (
          <h1 className="page-title text-[22px] font-bold text-[var(--text-primary)]">Settings</h1>
        )}
      </div>

      {/* Tab Navigation — desktop only when no sub-page */}
      {!(isMobile && mobileSubPage) && (
        <div className={`flex bg-[var(--bg-hover)] rounded-lg p-0.5 ${isMobile ? 'w-full' : 'w-fit'}`}>
          {[{ id: 'settings', label: 'Settings' }, { id: 'preferences', label: 'Preferences' }].map((tab) => (
            <button key={tab.id} onClick={() => switchTab(tab.id)}
              className={`px-5 py-[7px] text-[13px] border-none cursor-pointer rounded-md transition-colors ${isMobile ? 'flex-1' : ''} ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold shadow-xs'
                  : 'bg-transparent text-[var(--text-secondary)] font-normal'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'preferences' ? (
        <PreferencesTab />
      ) : isMobile ? (
        /* Mobile: drill-through navigation */
        mobileSubPage === 'accounts' ? (
          <>
            <h2 className="text-[16px] font-bold text-[var(--text-primary)] m-0">Accounts</h2>
            <div className="flex flex-col gap-2">
              {accounts.map((a) => (
                <div key={a.id}
                  onClick={() => hasPermission('accounts.edit') ? setEditingAccount(a) : null}
                  className={`bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-4 py-3 shadow-[var(--bg-card-shadow)] ${hasPermission('accounts.edit') ? 'cursor-pointer active:bg-[var(--bg-hover)]' : ''}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-[13px] font-medium text-[var(--text-primary)]">
                        {a.name} {a.last_four && <span className="text-[var(--text-muted)] text-[11px]">({a.last_four})</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {(a.owners || []).map((o) => <OwnerBadge key={o.id} user={o} />)}
                        {a.isShared && <SharedBadge />}
                        <span className="text-[11px] text-[var(--text-muted)] capitalize">{a.type}</span>
                      </div>
                    </div>
                    <ClassificationBadge classification={a.classification as AccountClassification} />
                  </div>
                </div>
              ))}
            </div>
            <PermissionGate permission="accounts.create" fallback="disabled">
              <button onClick={() => setEditingAccount('new')}
                className="w-full py-2.5 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer flex items-center justify-center gap-1.5 btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Account
              </button>
            </PermissionGate>
          </>
        ) : mobileSubPage === 'categories' ? (
          <>
            <h2 className="text-[16px] font-bold text-[var(--text-primary)] m-0">Categories</h2>
            <div className="flex flex-col gap-3 pb-16">
              {allGroups.map((g, idx) => {
                const allGroupNames = allGroups.map((x) => x.group);
                const color = getCategoryColor(g.group, allGroupNames);
                const isFirstOfType = idx === 0 || allGroups[idx - 1].type !== g.type;
                return (
                  <div key={`${g.type}:${g.group}`}>
                    {isFirstOfType && (
                      <div className={`flex items-center gap-2 ${idx > 0 ? 'mt-2' : ''} mb-2`}>
                        <div className="h-[2px] flex-1" style={{ background: g.type === 'income' ? 'var(--color-positive)' : 'var(--color-negative)' }} />
                        <span className="text-[10px] font-bold uppercase tracking-[0.06em] whitespace-nowrap" style={{ color: g.type === 'income' ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                          {g.type === 'income' ? 'Income Categories' : 'Expense Categories'}
                        </span>
                        <div className="h-[2px] flex-1" style={{ background: g.type === 'income' ? 'var(--color-positive)' : 'var(--color-negative)' }} />
                      </div>
                    )}
                    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-4 py-3 shadow-[var(--bg-card-shadow)]">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-[12px] text-[var(--btn-secondary-text)] flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm" style={{ background: color }} />{g.group}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">{g.subs.length} subs</span>
                    </div>
                    <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e) => handleCategoryDragEnd(e, g.subs)}>
                      <SortableContext items={g.subs.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                        {g.subs.map((s) => (
                          <SortableMobileSub key={s.id} cat={s} canEdit={hasPermission('categories.edit')} onEdit={(c) => setEditingCategory(c)} />
                        ))}
                      </SortableContext>
                    </DndContext>
                    </div>
                  </div>
                );
              })}
            </div>
            <StickyAddButton permission="categories.create" label="Add Category" onClick={() => setEditingCategory('new')} />
          </>
        ) : mobileSubPage === 'users' ? (
          <>
            <h2 className="text-[16px] font-bold text-[var(--text-primary)] m-0">Users & Permissions</h2>
            {isAdmin() && <UsersPermissionsSection />}
          </>
        ) : mobileSubPage === 'banksync' ? (
          <>
            <h2 className="text-[16px] font-bold text-[var(--text-primary)] m-0">Bank Sync</h2>
            <BankSyncSection accounts={accounts} users={userList} onAccountCreated={loadData} />
          </>
        ) : (
          /* Mobile navigation list */
          <>
          <div className="flex flex-col gap-3">
            {[
              { id: 'accounts', icon: '🏦', label: 'Accounts', desc: `${accounts.length} accounts configured`, show: true },
              { id: 'categories', icon: '📂', label: 'Categories', desc: `${categories.length} categories`, show: true },
              { id: 'users', icon: '👥', label: 'Users & Permissions', desc: 'Manage users and roles', show: isAdmin() },
              { id: 'banksync', icon: '🔗', label: 'Bank Sync', desc: 'SimpleFIN connections', show: true },
            ].filter(item => item.show).map((item) => (
              <button key={item.id} onClick={() => setMobileSubPage(item.id)}
                className="w-full bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-4 py-3.5 shadow-[var(--bg-card-shadow)] flex items-center gap-3 text-left cursor-pointer active:bg-[var(--bg-hover)]">
                <span className="text-[20px]">{item.icon}</span>
                <div className="flex-1">
                  <div className="text-[14px] font-semibold text-[var(--text-primary)]">{item.label}</div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">{item.desc}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </div>

          {/* My Profile Card */}
          {user && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] px-4 py-4 mt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[16px] font-bold text-white flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #10b981)' }}>
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-[var(--text-primary)]">{user.displayName}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] text-[var(--text-secondary)]">@{user.username}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${
                      user.role === 'owner' ? 'bg-[var(--badge-owner-bg)] text-[var(--badge-owner-text)]' :
                      user.role === 'admin' ? 'bg-[var(--badge-investment-bg)] text-[var(--badge-investment-text)]' :
                      'bg-[var(--badge-account-bg)] text-[var(--badge-account-text)]'
                    }`}>{user.role}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => switchTab('preferences')}
                className="w-full mt-3 py-2 rounded-lg border-none cursor-pointer text-[12px] font-semibold bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] btn-secondary"
              >
                Edit Profile & Password
              </button>
            </div>
          )}

          {/* App Info Card */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] px-4 py-4 mt-3 mb-20">
            <div className="flex justify-between items-center text-[12px] text-[var(--text-secondary)]">
              <span>Ledger</span>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">v1.0.0</span>
            </div>
            <button
              onClick={logout}
              className="w-full mt-3 py-2 bg-transparent border-none cursor-pointer text-[13px] font-semibold text-[#ef4444] text-center"
            >
              Sign Out
            </button>
          </div>
          </>
        )
      ) : (
        <>
          {/* Bank Sync Section */}
          <div>
            <BankSyncSection accounts={accounts} users={userList} onAccountCreated={loadData} />
          </div>

          <div className="grid grid-cols-2 gap-5">
            {/* Accounts */}
            <ExpandableCard
              title="Accounts"
              subtitle="Each account has an owner and classification for filtering and net worth."
              expanded={expandedAccounts}
              onToggle={() => setExpandedAccounts(!expandedAccounts)}
            >
              <div className="flex-1 min-h-0">
                <ScrollableList maxHeight="100%">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr>
                        <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Account</th>
                        <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Owner</th>
                        <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Type</th>
                        <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((a) => (
                        <tr key={a.id}
                          onClick={() => hasPermission('accounts.edit') ? setEditingAccount(a) : null}
                          className={`border-b border-[var(--table-row-border)] transition-colors ${hasPermission('accounts.edit') ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : ''}`}>
                          <td className="px-2.5 py-2 text-[13px] text-[var(--text-body)] font-medium">
                            {a.name} {a.last_four && <span className="text-[var(--text-muted)] text-[11px]">({a.last_four})</span>}
                          </td>
                          <td className="px-2.5 py-2">
                            <div className="flex items-center gap-1 flex-wrap">
                              {(a.owners || []).map((o) => (
                                <OwnerBadge key={o.id} user={o} />
                              ))}
                              {a.isShared && <SharedBadge />}
                            </div>
                          </td>
                          <td className="px-2.5 py-2 text-[12px] text-[var(--text-secondary)] capitalize">{a.type}</td>
                          <td className="px-2.5 py-2">
                            <ClassificationBadge classification={a.classification as AccountClassification} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableList>
              </div>
              <PermissionGate permission="accounts.create" fallback="disabled">
                <button onClick={() => { setEditingAccount('new'); }}
                  className="w-full mt-3 py-2 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer flex items-center justify-center gap-1.5 flex-shrink-0 btn-secondary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Account
                </button>
              </PermissionGate>
            </ExpandableCard>

            {/* Categories */}
            <ExpandableCard
              title="Categories"
              subtitle="Parent categories group sub-categories for budgets and reports."
              expanded={expandedCategories}
              onToggle={() => setExpandedCategories(!expandedCategories)}
            >
              <div className="flex-1 min-h-0">
                <ScrollableList maxHeight="100%">
                  {allGroups.map((g, idx) => {
                  const allGroupNames = allGroups.map((x) => x.group);
                  const color = getCategoryColor(g.group, allGroupNames);
                  const isFirstOfType = idx === 0 || allGroups[idx - 1].type !== g.type;
                  return (
                    <div key={`${g.type}:${g.group}`}>
                      {isFirstOfType && (
                        <div className={`flex items-center gap-2 ${idx > 0 ? 'mt-3' : ''} mb-2`}>
                          <div className="h-[2px] flex-1" style={{ background: g.type === 'income' ? 'var(--color-positive)' : 'var(--color-negative)' }} />
                          <span className="text-[10px] font-bold uppercase tracking-[0.06em] whitespace-nowrap" style={{ color: g.type === 'income' ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                            {g.type === 'income' ? 'Income Categories' : 'Expense Categories'}
                          </span>
                          <div className="h-[2px] flex-1" style={{ background: g.type === 'income' ? 'var(--color-positive)' : 'var(--color-negative)' }} />
                        </div>
                      )}
                      <div className="mb-2">
                      <div className="flex justify-between items-center py-1.5" style={{ borderBottom: `2px solid ${color}30` }}>
                        <span className="font-bold text-[12px] text-[var(--btn-secondary-text)] flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-sm" style={{ background: color }} />{g.group}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">{g.subs.length} subs</span>
                      </div>
                      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e) => handleCategoryDragEnd(e, g.subs)}>
                        <SortableContext items={g.subs.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                          {g.subs.map((s) => (
                            <SortableDesktopSub key={s.id} cat={s} canEdit={hasPermission('categories.edit')} onEdit={(c) => { setEditingCategory(c); }} />
                          ))}
                        </SortableContext>
                      </DndContext>
                      </div>
                    </div>
                  );
                })}
                </ScrollableList>
              </div>
              <PermissionGate permission="categories.create" fallback="disabled">
                <button onClick={() => { setEditingCategory('new'); }}
                  className="w-full mt-3 py-2 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer flex items-center justify-center gap-1.5 flex-shrink-0 btn-secondary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Category
                </button>
              </PermissionGate>
            </ExpandableCard>
          </div>

          {/* Users & Permissions — Admin only */}
          {isAdmin() && (
            <div>
              <UsersPermissionsSection />
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {editingAccount !== null && (
        <AccountForm
          account={editingAccount === 'new' ? undefined : editingAccount}
          users={userList}
          onSave={handleSaveAccount}
          onDelete={editingAccount !== 'new' && hasPermission('accounts.delete') ? handleDeleteAccount : undefined}
          onClose={() => setEditingAccount(null)}
        />
      )}
      {editingCategory !== null && (
        <CategoryForm
          category={editingCategory === 'new' ? undefined : editingCategory}
          existingGroups={existingGroupNames}
          onSave={handleSaveCategory}
          onDelete={editingCategory !== 'new' && hasPermission('categories.delete') ? handleDeleteCategory : undefined}
          onClose={() => setEditingCategory(null)}
        />
      )}
    </div>
  );
}
