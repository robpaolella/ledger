import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import ImageCropModal from './ImageCropModal';

interface Merchant { id: number; name: string; logo_url: string | null; txn_count: number }
interface MerchantAlias { alias_name: string; created_at: string | null }

const AV_COLOR = ['--c-teal', '--c-green', '--c-blue', '--c-indigo', '--c-violet', '--c-fuchsia', '--c-rose', '--c-orange', '--c-amber'];
const colorFor = (name: string) => `var(${AV_COLOR[(name.charCodeAt(0) || 0) % AV_COLOR.length]})`;

function Avatar({ m, size = 40 }: { m: Merchant; size?: number }) {
  if (m.logo_url) return <img src={m.logo_url} alt="" className="flex-none rounded-full object-cover" style={{ width: size, height: size }} />;
  const c = colorFor(m.name);
  return <span className="flex-none rounded-full inline-flex items-center justify-center font-bold" style={{ width: size, height: size, fontSize: size * 0.4, background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}>{(m.name.trim()[0] || '?').toUpperCase()}</span>;
}

/** Settings > Household > Merchants panel (replaces the standalone /merchants page). */
export default function MerchantsPanel() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('transactions.edit');
  const { addToast } = useToast();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'count' | 'name'>('count');
  const [sortOpen, setSortOpen] = useState(false);
  const [edit, setEdit] = useState<Merchant | null>(null);
  const [editName, setEditName] = useState('');
  const [del, setDel] = useState<Merchant | null>(null);
  const [mergeInto, setMergeInto] = useState('');
  const [keepAlias, setKeepAlias] = useState(true);
  // Statement names routed to the merchant open in the edit modal.
  const [aliases, setAliases] = useState<MerchantAlias[]>([]);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setMerchants((await apiFetch<{ data: Merchant[] }>('/merchants')).data); }
    catch { addToast('Failed to load merchants', 'error'); }
    finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? merchants.filter((m) => m.name.toLowerCase().includes(q)) : merchants.slice();
    list.sort(sort === 'count' ? (a, b) => b.txn_count - a.txn_count || a.name.localeCompare(b.name) : (a, b) => a.name.localeCompare(b.name));
    return list;
  }, [merchants, search, sort]);

  const loadAliases = useCallback(async (merchantId: number) => {
    try { setAliases((await apiFetch<{ data: MerchantAlias[] }>(`/merchants/${merchantId}/aliases`)).data); }
    catch { setAliases([]); }
  }, []);
  const openEdit = (m: Merchant) => { setEdit(m); setEditName(m.name); setAliases([]); void loadAliases(m.id); };
  const removeAlias = async (name: string) => {
    if (!edit) return;
    try {
      await apiFetch(`/merchants/${edit.id}/aliases?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      setAliases((prev) => prev.filter((a) => a.alias_name !== name));
    } catch { addToast('Failed to remove alias', 'error'); }
  };
  const saveName = async () => {
    if (!edit || busy) return;
    const name = editName.trim();
    if (!name || name === edit.name) { setEdit(null); return; }
    setBusy(true);
    try { await apiFetch(`/merchants/${edit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); setEdit(null); addToast('Merchant renamed', 'success'); await load(); }
    catch (e) { addToast(e instanceof Error ? e.message : 'Rename failed (name may exist — merge instead)', 'error'); }
    finally { setBusy(false); }
  };
  const uploadLogo = async (blob: Blob) => {
    if (!edit) return;
    const fd = new FormData(); fd.append('file', blob, 'logo.webp');
    try {
      const res = await apiFetch<{ data: { logo_url: string } }>(`/merchants/${edit.id}/logo`, { method: 'POST', body: fd });
      setEdit({ ...edit, logo_url: res.data.logo_url }); await load();
    } catch { addToast('Failed to upload logo', 'error'); }
  };
  const removeLogo = async () => {
    if (!edit) return;
    try { await apiFetch(`/merchants/${edit.id}/logo`, { method: 'DELETE' }); setEdit({ ...edit, logo_url: null }); await load(); }
    catch { addToast('Failed to remove logo', 'error'); }
  };
  const doMerge = async () => {
    if (!del || !mergeInto || busy) return;
    setBusy(true);
    try { await apiFetch('/merchants/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId: del.id, targetId: Number(mergeInto), keepAlias }) }); setDel(null); setEdit(null); setMergeInto(''); setKeepAlias(true); addToast('Merged', 'success'); await load(); }
    catch { addToast('Merge failed', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <h1 className="text-[22px] font-extrabold tracking-tight m-0">Merchants</h1>
      <p className="text-[14px] text-content-3 mt-1 mb-5">Rename, merge, and set logos for your merchants.</p>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="relative">
          <button onClick={() => setSortOpen((o) => !o)} className="h-10 px-3.5 flex items-center gap-2 rounded-[11px] bg-surface border text-sm font-semibold" style={{ borderColor: sortOpen ? 'var(--primary)' : 'var(--line-strong)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
            {sort === 'count' ? 'Transaction count' : 'Name (A–Z)'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSortOpen(false)} />
              <div className="absolute top-12 left-0 z-40 w-[210px] bg-elevated border border-line-strong rounded-[12px] shadow-md p-1.5">
                {([['count', 'Transaction count'], ['name', 'Name (A–Z)']] as const).map(([v, label]) => (
                  <div key={v} onClick={() => { setSort(v); setSortOpen(false); }} className="flex items-center gap-2.5 px-3 py-2 rounded-[9px] text-sm font-medium cursor-pointer hover:bg-surface-2">
                    <span className="w-4">{sort === v && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}</span>{label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="h-10 flex items-center gap-2 rounded-[11px] bg-surface border border-line-strong px-3 w-[320px] max-w-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${merchants.length} merchants…`} className="flex-1 bg-transparent outline-none text-sm text-content" />
        </div>
      </div>

      <div className="bg-surface border border-line rounded-[18px] shadow-sm overflow-hidden">
        <div className="px-6 py-4 text-[15px] font-bold border-b border-line">{shown.length} merchants</div>
        {loading ? <div className="p-8 text-center text-content-3 text-sm">Loading…</div>
          : shown.length === 0 ? <div className="p-8 text-center text-content-3 text-sm">{search ? `No merchants match "${search}"` : 'No merchants yet.'}</div>
          : shown.map((m, i) => (
            <div key={m.id} onClick={canEdit ? () => openEdit(m) : undefined}
              className={`group flex items-center gap-3 px-6 h-[68px] ${i > 0 ? 'border-t border-line' : ''} ${canEdit ? 'cursor-pointer hover:bg-surface-2' : ''} transition-colors`}>
              <Avatar m={m} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] truncate">{m.name}</div>
                <div className="text-[13px] font-semibold text-primary">{m.txn_count} transaction{m.txn_count === 1 ? '' : 's'}</div>
              </div>
              {canEdit && <button onClick={(e) => { e.stopPropagation(); openEdit(m); }} className="h-9 px-4 rounded-[10px] border border-line-strong bg-surface-2 text-content font-semibold text-[13px] opacity-60 group-hover:opacity-100 transition-opacity">Edit</button>}
            </div>
          ))}
      </div>

      {/* Edit merchant modal */}
      {edit && (
        <>
          <div className="fixed inset-0 z-[80]" style={{ background: 'rgba(6,8,12,.66)' }} onClick={() => setEdit(null)} />
          <div className="fixed left-1/2 top-1/2 z-[90] w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 bg-surface border border-line-strong rounded-[18px] shadow-md p-5">
            <div className="flex items-center justify-between mb-4"><h2 className="text-[18px] font-extrabold m-0">Edit merchant</h2><button onClick={() => setEdit(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 border border-line-strong text-content-2"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div>
            <div className="flex items-center gap-3 mb-4">
              <Avatar m={edit} size={56} />
              <div className="flex flex-col gap-1.5">
                <button onClick={() => fileRef.current?.click()} className="h-8 px-3 rounded-lg bg-surface-2 border border-line-strong text-content font-semibold text-[13px]">Upload logo</button>
                {edit.logo_url && <button onClick={removeLogo} className="text-[12px] text-negative font-semibold text-left">Remove</button>}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = ''; }} />
              </div>
            </div>
            <div className="text-[12px] font-semibold text-content-3 mb-1.5">Merchant name</div>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full h-11 px-3 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none mb-5" />
            {aliases.length > 0 && (
              <div className="mb-5">
                <div className="text-[12px] font-semibold text-content-3 mb-1.5">Also matches</div>
                <p className="text-[12px] text-content-3 mt-0 mb-2">Imported transactions with these names land on this merchant.</p>
                <div className="flex flex-col gap-1.5">
                  {aliases.map((a) => (
                    <div key={a.alias_name} className="flex items-center gap-2 h-9 pl-3 pr-1.5 rounded-[10px] bg-surface-2 border border-line">
                      <span className="flex-1 min-w-0 truncate text-[13px] text-content">{a.alias_name}</span>
                      {canEdit && (
                        <button onClick={() => removeAlias(a.alias_name)} title={`Stop routing “${a.alias_name}” here`}
                          className="w-7 h-7 flex-none flex items-center justify-center rounded-[8px] text-content-3 hover:text-content hover:bg-surface">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <button onClick={() => { setDel(edit); setMergeInto(''); setKeepAlias(true); }} className="text-[13px] font-semibold text-negative">Merge &amp; delete</button>
              <div className="flex gap-2.5">
                <button onClick={() => setEdit(null)} className="h-10 px-4 rounded-[10px] border border-line-strong bg-surface-2 text-content font-semibold text-sm">Cancel</button>
                <button onClick={saveName} disabled={busy} className="h-10 px-5 rounded-[10px] bg-primary text-on-primary font-bold text-sm disabled:opacity-50">Save</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Merge & delete modal */}
      {del && (
        <>
          <div className="fixed inset-0 z-[95]" style={{ background: 'rgba(6,8,12,.66)' }} onClick={() => setDel(null)} />
          <div className="fixed left-1/2 top-1/2 z-[100] w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 bg-surface border border-line-strong rounded-[18px] shadow-md p-5">
            <h2 className="text-[18px] font-extrabold m-0 mb-1">Merge &amp; delete</h2>
            <p className="text-sm text-content-2 mb-4">There are <span className="font-semibold">{del.txn_count} transaction{del.txn_count === 1 ? '' : 's'}</span> tied to <span className="font-semibold">{del.name}</span>. Choose a merchant to reassign them to before deleting.</p>
            <div className="text-[12px] font-semibold text-content-3 mb-1.5">Reassign transactions to</div>
            <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="w-full h-11 px-3 rounded-[10px] bg-surface-2 border border-line-strong text-content text-sm mb-4">
              <option value="">Select a merchant…</option>
              {merchants.filter((x) => x.id !== del.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <label className="flex items-start gap-2.5 mb-5 cursor-pointer select-none">
              <input type="checkbox" checked={keepAlias} onChange={(e) => setKeepAlias(e.target.checked)}
                className="mt-0.5 w-4 h-4 flex-none accent-[var(--primary)] cursor-pointer" />
              <span className="text-[13px] text-content-2 leading-snug">
                Keep routing future transactions
                <span className="block text-[12px] text-content-3">Imports that would have become <span className="font-semibold">{del.name}</span> go to the merchant above instead.</span>
              </span>
            </label>
            <div className="flex justify-end gap-2.5">
              <button onClick={() => setDel(null)} className="h-10 px-4 rounded-[10px] border border-line-strong bg-surface-2 text-content font-semibold text-sm">Cancel</button>
              <button onClick={doMerge} disabled={!mergeInto || busy} className="h-10 px-5 rounded-[10px] bg-negative text-white font-bold text-sm disabled:opacity-50">Delete</button>
            </div>
          </div>
        </>
      )}

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          title="Crop merchant logo"
          onCancel={() => setCropFile(null)}
          onCropped={async (blob) => { await uploadLogo(blob); setCropFile(null); }}
        />
      )}
    </div>
  );
}
