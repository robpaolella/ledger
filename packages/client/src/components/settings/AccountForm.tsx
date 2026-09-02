import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteButton from '../ConfirmDeleteButton';
import InlineNotification from '../InlineNotification';
import { Switch } from '../primitives';
import ResponsiveModal from '../ResponsiveModal';
import ImageCropModal from '../ImageCropModal';
import InstitutionPicker from '../InstitutionPicker';
import { Field, SelectShell, CheckBox, inputCls, selectCls, btnPrimary, btnSecondary } from './ui';
import { ACCOUNT_TYPES, TYPE_LABEL, CLASSIFICATIONS, CLASSIFICATION_LABEL, classificationForType, sfLabel, type SfAccount } from './simplefin';

export interface AccountOwner { id: number; displayName: string }

export interface Account {
  id: number;
  name: string;
  last_four: string | null;
  type: string;
  classification: string;
  owner: string;
  owners: AccountOwner[];
  isShared: boolean;
  is_active: number;
  avatar_url?: string | null;
  institution_id?: number | null;
  institutionRef?: { id: number; name: string; logo_url: string | null; color: string | null } | null;
}

export interface AccountFormData {
  name: string;
  lastFour: string | null;
  type: string;
  classification: string;
  ownerIds: number[];
  institutionId: number | null;
}

/**
 * Add / edit account modal (docs/Settings handoff): photo, name, institution,
 * type, last four, classification, owners, linked SimpleFIN account, import
 * toggle, and — when editing — a Remove card.
 */
export default function AccountForm({
  account,
  users,
  sfAccounts,
  syncLink,
  onToggleAutoImport,
  onSave,
  onDelete,
  onClose,
  onAvatarChanged,
}: {
  account?: Account;
  users: AccountOwner[];
  /** Every account SimpleFIN exposes (all connections) — for the link select. */
  sfAccounts: SfAccount[];
  syncLink?: { linkId: number; autoImport: number };
  onToggleAutoImport?: (next: boolean) => void;
  /** `linkKey`: the chosen SimpleFIN account key, `null` = Not linked, `undefined` = unchanged. */
  onSave: (data: AccountFormData, linkKey: string | null | undefined) => Promise<void> | void;
  onDelete?: () => Promise<string | null>;
  onClose: () => void;
  onAvatarChanged?: () => void;
}) {
  const { hasPermission } = useAuth();
  const canManageSync = hasPermission('simplefin.manage');
  const [name, setName] = useState(account?.name ?? '');
  const [lastFour, setLastFour] = useState(account?.last_four ?? '');
  const [type, setType] = useState(account?.type ?? 'checking');
  const [classification, setClassification] = useState(account?.classification ?? 'liquid');
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<Set<number>>(() => new Set(account?.owners?.map((o) => o.id) ?? (users.length === 1 ? [users[0].id] : [])));
  const [institutionId, setInstitutionId] = useState<number | null>(account?.institution_id ?? account?.institutionRef?.id ?? null);
  const [institution, setInstitution] = useState<{ id: number; name: string; logo_url: string | null; color: string | null } | null>(account?.institutionRef ?? null);
  const currentLinkKey = account ? (sfAccounts.find((s) => s.link?.accountId === account.id)?.key ?? null) : null;
  const [linkKey, setLinkKey] = useState<string | null>(currentLinkKey);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(account?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 6000); return () => clearTimeout(t); }
  }, [error]);

  const uploadAvatar = async (blob: Blob) => {
    if (!account) return;
    const fd = new FormData();
    fd.append('file', blob, 'avatar.webp');
    setUploading(true);
    try {
      const res = await apiFetch<{ data: { avatar_url: string } }>(`/accounts/${account.id}/avatar`, { method: 'POST', body: fd });
      setAvatarUrl(res.data.avatar_url);
      onAvatarChanged?.();
    } catch {
      setError('Failed to upload photo');
    } finally { setUploading(false); }
  };

  const removeAvatar = async () => {
    if (!account) return;
    try {
      await apiFetch(`/accounts/${account.id}/avatar`, { method: 'DELETE' });
      setAvatarUrl(null);
      onAvatarChanged?.();
    } catch {
      setError('Failed to remove photo');
    }
  };

  // Preview precedence: per-account override → institution logo → monogram.
  const previewSrc = avatarUrl || institution?.logo_url || null;
  const monogram = ((institution?.name || name).trim()[0] || '?').toUpperCase();

  const toggleOwner = (id: number) => {
    setSelectedOwnerIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const submit = async () => {
    if (!name.trim()) { setError('Account name is required'); return; }
    if (selectedOwnerIds.size === 0) { setError('Choose at least one owner'); return; }
    setSaving(true);
    try {
      await onSave(
        { name: name.trim(), lastFour: lastFour.trim() || null, type, classification, ownerIds: Array.from(selectedOwnerIds), institutionId },
        linkKey === currentLinkKey ? undefined : linkKey,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account');
    } finally { setSaving(false); }
  };

  const handleDeleteConfirm = async () => {
    if (!onDelete) return;
    const err = await onDelete();
    if (err) setError(err);
  };

  // Group SimpleFIN accounts by institution for the select; accounts already
  // linked to a DIFFERENT Ledger account are shown but disabled.
  const sfByOrg = new Map<string, SfAccount[]>();
  for (const s of sfAccounts) { if (!sfByOrg.has(s.org)) sfByOrg.set(s.org, []); sfByOrg.get(s.org)!.push(s); }

  return (
    <ResponsiveModal
      isOpen
      onClose={onClose}
      title={account ? 'Edit account' : 'Add account'}
      maxWidth="480px"
      footer={(
        <div className="flex items-center justify-end gap-2.5">
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
            {saving ? 'Saving…' : account ? 'Save changes' : 'Create account'}
          </button>
        </div>
      )}
    >
      {error && <InlineNotification type="error" message={error} dismissible onDismiss={() => setError(null)} className="mb-4" />}
      <div className="flex flex-col gap-5">
        {/* Photo */}
        <div className="flex items-center gap-4">
          {previewSrc
            ? <img src={previewSrc} alt="" className="flex-none rounded-full object-cover w-14 h-14" />
            : <span className="flex-none w-14 h-14 rounded-full inline-flex items-center justify-center font-bold text-[22px]"
                style={{ background: institution?.color ? `color-mix(in srgb, ${institution.color} 16%, transparent)` : 'var(--surface-2)', color: institution?.color || 'var(--text-2)' }}>
                {monogram}
              </span>}
          <div className="min-w-0">
            {account ? (
              <div className="flex items-center gap-3">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = ''; }} />
                <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="text-[13px] font-semibold text-primary disabled:opacity-60">
                  {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload photo'}
                </button>
                {avatarUrl && <button type="button" onClick={removeAvatar} className="text-[13px] font-semibold text-negative">Remove</button>}
              </div>
            ) : null}
            <div className="text-[13px] text-content-3 leading-snug mt-0.5">
              {account
                ? (avatarUrl ? 'Shown wherever this account appears.' : institution?.logo_url ? 'Using the institution logo. Upload a photo to override it.' : 'Add a photo, or pick an institution to use its logo.')
                : 'A photo can be added after the account is created; the institution logo is used until then.'}
            </div>
          </div>
        </div>

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" className={inputCls} autoFocus={!account} />
        </Field>

        <Field label="Institution">
          <InstitutionPicker value={institutionId} onChange={(id, inst) => { setInstitutionId(id); setInstitution(inst ?? null); }} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <SelectShell>
              <select value={type} onChange={(e) => { setType(e.target.value); setClassification(classificationForType(e.target.value)); }} className={selectCls}>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </SelectShell>
          </Field>
          <Field label="Last four">
            <input value={lastFour} onChange={(e) => setLastFour(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" maxLength={5} placeholder="Optional" className={`${inputCls} font-mono`} />
          </Field>
        </div>

        <Field label="Classification" hint="Groups the account on the Accounts page and in net worth.">
          <SelectShell>
            <select value={classification} onChange={(e) => setClassification(e.target.value)} className={selectCls}>
              {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{CLASSIFICATION_LABEL[c]}</option>)}
            </select>
          </SelectShell>
        </Field>

        <Field label={selectedOwnerIds.size > 1 ? 'Owners' : 'Owner'} hint={users.length > 1 ? 'Pick more than one to make the account shared.' : undefined}>
          <div className="rounded-[11px] border border-line-strong bg-surface-2 overflow-hidden">
            {users.map((u, i) => {
              const on = selectedOwnerIds.has(u.id);
              return (
                <button key={u.id} type="button" onClick={() => toggleOwner(u.id)} role="checkbox" aria-checked={on}
                  className={`w-full flex items-center gap-3 px-3.5 h-11 text-left text-sm font-semibold text-content hover:bg-elevated transition-colors ${i > 0 ? 'border-t border-line' : ''}`}>
                  <CheckBox checked={on} />
                  {u.displayName}
                </button>
              );
            })}
            {users.length === 0 && <div className="px-3.5 h-11 flex items-center text-sm text-content-3">No users yet</div>}
          </div>
        </Field>

        {sfAccounts.length > 0 && (
          <Field
            label="Linked SimpleFIN account"
            hint={canManageSync ? 'Balances and transactions sync from the linked SimpleFIN account.' : 'Only users who can manage connections may change the link.'}
          >
            <SelectShell>
              <select value={linkKey ?? ''} onChange={(e) => setLinkKey(e.target.value || null)} disabled={!canManageSync} className={selectCls}>
                <option value="">Not linked</option>
                {[...sfByOrg.entries()].map(([org, list]) => (
                  <optgroup key={org} label={org}>
                    {list.map((s) => {
                      const takenByOther = s.link != null && s.link.accountId !== account?.id;
                      return <option key={s.key} value={s.key} disabled={takenByOther}>{sfLabel(s)}{takenByOther ? ' — linked elsewhere' : ''}</option>;
                    })}
                  </optgroup>
                ))}
              </select>
            </SelectShell>
          </Field>
        )}

        {account && syncLink && linkKey === currentLinkKey && (
          <div className="flex items-center justify-between gap-4 px-4 py-3.5 rounded-[12px] bg-surface-2 border border-line">
            <div className="min-w-0">
              <div className="text-sm font-bold text-content">Import transactions</div>
              <div className="text-[12.5px] text-content-3 leading-snug mt-0.5">Pulled on every sync, daily and manual. Balances always update.</div>
            </div>
            <Switch checked={syncLink.autoImport === 1} onChange={(next) => onToggleAutoImport?.(next)} disabled={!canManageSync} title="Import transactions" />
          </div>
        )}

        {account && onDelete && (
          <div className="flex items-center justify-between gap-4 px-4 py-3.5 rounded-[12px]"
            style={{ background: 'color-mix(in srgb, var(--negative) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--negative) 30%, transparent)' }}>
            <div className="min-w-0">
              <div className="text-sm font-bold text-content">Remove account</div>
              <div className="text-[12.5px] text-content-3 leading-snug mt-0.5">Deactivates this account in Ledger. Its transaction history is kept.</div>
            </div>
            <ConfirmDeleteButton label="Remove" confirmLabel="Confirm remove?" onConfirm={handleDeleteConfirm} />
          </div>
        )}
      </div>

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          title="Crop account photo"
          onCancel={() => setCropFile(null)}
          onCropped={async (blob) => { await uploadAvatar(blob); setCropFile(null); }}
        />
      )}
    </ResponsiveModal>
  );
}
