import { useEffect, useMemo, useRef, useState } from 'react';
import ResponsiveModal from './ResponsiveModal';
import Spinner from './Spinner';
import ImageCropModal from './ImageCropModal';
import { VendorAvatar } from './primitives';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { type Institution, invalidateInstitutions } from './InstitutionPicker';

export default function InstitutionManager({ canEdit, onClose }: { canEdit: boolean; onClose: () => void }) {
  const { addToast } = useToast();
  const [list, setList] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Institution | 'new' | null>(null);
  const [hydrating, setHydrating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Institution[]; logoServiceConfigured?: boolean }>('/financial-institutions');
      setList(res.data);
      setConfigured(!!res.logoServiceConfigured);
    } catch { addToast('Failed to load institutions', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = async () => { invalidateInstitutions(); await load(); };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? list.filter((i) => i.name.toLowerCase().includes(q) || (i.domain || '').toLowerCase().includes(q)) : list;
  }, [list, search]);

  const hydrateMissing = async () => {
    if (hydrating) return;
    setHydrating(true);
    try {
      const res = await apiFetch<{ data: { attempted: number; updated: number } }>('/financial-institutions/hydrate-logos', { method: 'POST' });
      addToast(`Fetched ${res.data.updated} of ${res.data.attempted} logo(s)`, 'success');
      await refreshAll();
    } catch (e) { addToast(e instanceof Error ? e.message : 'Fetch failed', 'error'); }
    finally { setHydrating(false); }
  };

  if (editing !== null) {
    return (
      <InstitutionEditor
        institution={editing === 'new' ? null : editing}
        configured={configured}
        onBack={() => setEditing(null)}
        onDone={async () => { setEditing(null); await refreshAll(); }}
        onChanged={refreshAll}
      />
    );
  }

  return (
    <ResponsiveModal isOpen onClose={onClose} title="Financial institutions" maxWidth="34rem">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search institutions…"
            className="flex-1 h-10 px-3 rounded-[10px] bg-surface-2 border border-line text-content text-sm outline-none" />
          {canEdit && <button onClick={() => setEditing('new')} className="h-10 px-3.5 rounded-[10px] bg-primary text-on-primary font-bold text-[13px] whitespace-nowrap">Add</button>}
        </div>
        {canEdit && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-content-3">{configured ? 'Logos are fetched from logo.dev.' : 'Set LOGODEV_TOKEN on the server to fetch logos automatically.'}</span>
            <button onClick={hydrateMissing} disabled={!configured || hydrating}
              className="h-8 px-3 rounded-[9px] bg-surface-2 border border-line-strong text-content font-semibold text-[12px] disabled:opacity-40 whitespace-nowrap">
              {hydrating ? 'Fetching…' : 'Fetch missing logos'}
            </button>
          </div>
        )}
        <div className="flex flex-col rounded-[12px] border border-line overflow-hidden" style={{ maxHeight: 420, overflowY: 'auto' }}>
          {loading ? (
            <Spinner size={24} className="py-8" />
          ) : shown.length === 0 ? (
            <div className="px-4 py-6 text-sm text-content-3 text-center">No institutions.</div>
          ) : shown.map((i) => (
            <button key={i.id} type="button" onClick={() => (canEdit ? setEditing(i) : undefined)}
              className={`flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-b-0 text-left ${canEdit ? 'hover:bg-surface-2 cursor-pointer' : 'cursor-default'}`}>
              <VendorAvatar name={i.name} src={i.logo_url || undefined} color={i.color || 'var(--c-blue)'} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-content truncate">
                  {i.name}{!i.is_system && <span className="ml-1.5 text-[11px] text-content-3 font-normal">· custom</span>}
                </div>
                {i.domain && <div className="text-[12px] text-content-3 truncate">{i.domain}</div>}
              </div>
              {typeof i.account_count === 'number' && i.account_count > 0 && (
                <span className="text-[11px] text-content-3 whitespace-nowrap">{i.account_count} acct{i.account_count === 1 ? '' : 's'}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="h-10 px-4 rounded-[10px] border border-line-strong bg-surface-2 text-content font-semibold text-sm">Done</button>
        </div>
      </div>
    </ResponsiveModal>
  );
}

function InstitutionEditor({
  institution, configured, onBack, onDone, onChanged,
}: {
  institution: Institution | null;
  configured: boolean;
  onBack: () => void;
  onDone: () => void | Promise<void>;
  onChanged: () => void | Promise<void>;
}) {
  const { addToast } = useToast();
  const isNew = institution === null;
  const [id, setId] = useState<number | null>(institution?.id ?? null);
  const [name, setName] = useState(institution?.name ?? '');
  const [domain, setDomain] = useState(institution?.domain ?? '');
  const [savedDomain, setSavedDomain] = useState(institution?.domain ?? ''); // persisted value /refresh-logo uses
  const [color, setColor] = useState(institution?.color ?? '#64748b');
  const [logoUrl, setLogoUrl] = useState<string | null>(institution?.logo_url ?? null);
  const [busy, setBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    const nm = name.trim();
    if (!nm || busy) return;
    setBusy(true);
    try {
      if (id == null) {
        const res = await apiFetch<{ data: Institution }>('/financial-institutions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nm, domain: domain.trim() || null, color }),
        });
        setId(res.data.id);
        setLogoUrl(res.data.logo_url);
        setSavedDomain(res.data.domain ?? '');
        invalidateInstitutions();
        await onChanged();
        addToast('Created — add a logo or go back', 'success');
        setBusy(false);
      } else {
        await apiFetch(`/financial-institutions/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nm, domain: domain.trim() || null, color }),
        });
        invalidateInstitutions();
        addToast('Saved', 'success');
        await onDone();
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Save failed', 'error');
      setBusy(false);
    }
  };

  const uploadLogo = async (blob: Blob) => {
    if (id == null) return;
    const fd = new FormData();
    fd.append('file', blob, 'logo.webp');
    setBusy(true);
    try {
      const res = await apiFetch<{ data: Institution }>(`/financial-institutions/${id}/logo`, { method: 'POST', body: fd });
      setLogoUrl(res.data.logo_url);
      invalidateInstitutions();
      await onChanged();
    } catch { addToast('Failed to upload logo', 'error'); }
    finally { setBusy(false); }
  };

  const removeLogo = async () => {
    if (id == null) return;
    setBusy(true);
    try {
      await apiFetch(`/financial-institutions/${id}/logo`, { method: 'DELETE' });
      setLogoUrl(null);
      invalidateInstitutions();
      await onChanged();
    } catch { addToast('Failed to remove logo', 'error'); }
    finally { setBusy(false); }
  };

  const fetchLogo = async () => {
    if (id == null || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ data: Institution }>(`/financial-institutions/${id}/refresh-logo`, { method: 'POST' });
      setLogoUrl(res.data.logo_url);
      invalidateInstitutions();
      await onChanged();
      addToast('Logo updated', 'success');
    } catch (e) { addToast(e instanceof Error ? e.message : 'No logo found for that domain', 'error'); }
    finally { setBusy(false); }
  };

  const del = async () => {
    if (id == null || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/financial-institutions/${id}`, { method: 'DELETE' });
      invalidateInstitutions();
      addToast('Institution deleted', 'success');
      await onDone();
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Delete failed', 'error');
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <ResponsiveModal isOpen onClose={busy ? () => {} : onBack} title={isNew ? 'Add institution' : 'Edit institution'} maxWidth="24rem">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <VendorAvatar name={name || '?'} src={logoUrl || undefined} color={color || 'var(--c-blue)'} size={56} />
          <div className="flex flex-col gap-1">
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = ''; }} />
            {id == null ? (
              <span className="text-[12px] text-content-3">Save first to add a logo</span>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="text-[12px] font-semibold text-primary text-left disabled:opacity-60">{logoUrl ? 'Change logo' : 'Upload logo'}</button>
                {configured && domain.trim() && (
                  domain.trim().toLowerCase() === savedDomain.trim().toLowerCase()
                    ? <button type="button" disabled={busy} onClick={fetchLogo} className="text-[12px] font-semibold text-content-2 text-left disabled:opacity-60">Fetch from logo.dev</button>
                    : <span className="text-[11px] text-content-3">Save to fetch the new domain’s logo</span>
                )}
                {logoUrl && <button type="button" disabled={busy} onClick={removeLogo} className="text-[12px] font-semibold text-negative text-left disabled:opacity-60">Remove</button>}
              </>
            )}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-content-2 mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full h-11 px-3 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-content-2 mb-1">Domain (for logo lookup)</label>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. chase.com"
            className="w-full h-11 px-3 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-content-2 mb-1">Brand color (monogram fallback)</label>
          <div className="flex items-center gap-2">
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#64748b'} onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 rounded-md border border-line bg-surface-2 cursor-pointer" />
            <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#64748b"
              className="flex-1 h-11 px-3 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none" />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-1">
          {!isNew && (
            confirmDelete ? (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-[12px] text-content-2">Delete?</span>
                <button onClick={del} disabled={busy} className="h-9 px-3 rounded-[10px] bg-negative text-white font-bold text-[12px] disabled:opacity-50">Confirm</button>
                <button onClick={() => setConfirmDelete(false)} className="h-9 px-3 rounded-[10px] bg-surface-2 border border-line-strong text-content font-semibold text-[12px]">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="mr-auto text-[13px] font-semibold text-negative">Delete</button>
            )
          )}
          <button onClick={onBack} disabled={busy} className="h-11 px-4 rounded-[11px] border border-line-strong bg-surface-2 text-content font-semibold text-sm disabled:opacity-40">Back</button>
          <button onClick={save} disabled={!name.trim() || busy} className="h-11 px-5 rounded-[11px] bg-primary text-on-primary font-bold text-sm disabled:opacity-60">
            {isNew && id == null ? 'Create' : 'Save'}
          </button>
        </div>
      </div>

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          title="Crop institution logo"
          onCancel={() => setCropFile(null)}
          onCropped={async (blob) => { await uploadLogo(blob); setCropFile(null); }}
        />
      )}
    </ResponsiveModal>
  );
}
