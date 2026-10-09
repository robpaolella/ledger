import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import ImageCropModal from './ImageCropModal';
import ResponsiveModal from './ResponsiveModal';
import Spinner from './Spinner';
import Button from './Button';
import { PanelHeader, Field, SelectShell, CheckBox, inputCls, selectCls, ICON } from './settings/ui';

interface Merchant {
  id: number; name: string; logo_url: string | null; txn_count: number;
  suppress_rule_suggest: number;
  // The merchant's "always categorize as" rule (at most one), null when unset.
  rule_id: number | null; rule_category_id: number | null;
  rule_sub_name: string | null; rule_group_name: string | null;
}
interface CategoryOption { id: number; sub_name: string; group_name: string; type: string }
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
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setMerchants((await apiFetch<{ data: Merchant[] }>('/merchants')).data); }
    catch { addToast('Failed to load merchants', 'error'); }
    finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { load(); }, [load]);

  // Rule targets: transfers are applied by categorization, not chosen per merchant.
  useEffect(() => {
    apiFetch<{ data: CategoryOption[] }>('/categories')
      .then((r) => setCategoryOptions(r.data.filter((c) => c.type !== 'transfer')))
      .catch(() => setCategoryOptions([]));
  }, []);

  /** Set / replace the merchant's always-categorize rule. */
  const setRule = async (categoryId: number) => {
    if (!edit || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ data: { affected: number } }>('/category-rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchType: 'merchant', pattern: String(edit.id), categoryId, applyToExisting: true }),
      });
      const n = res.data.affected;
      addToast(`Rule saved — ${n} transaction${n === 1 ? '' : 's'} updated`, 'success');
      await load();
      setEdit((prev) => (prev ? { ...prev, rule_category_id: categoryId } : prev));
    } catch { addToast('Failed to save rule', 'error'); }
    finally { setBusy(false); }
  };

  /** Remove it — existing transactions keep whatever category they already have. */
  const clearRule = async () => {
    if (!edit?.rule_id || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/category-rules/${edit.rule_id}`, { method: 'DELETE' });
      addToast('Rule removed', 'success');
      await load();
      setEdit((prev) => (prev ? { ...prev, rule_id: null, rule_category_id: null, rule_sub_name: null, rule_group_name: null } : prev));
    } catch { addToast('Failed to remove rule', 'error'); }
    finally { setBusy(false); }
  };

  const toggleSuppress = async (next: boolean) => {
    if (!edit) return;
    setEdit((prev) => (prev ? { ...prev, suppress_rule_suggest: next ? 1 : 0 } : prev));
    try {
      await apiFetch(`/merchants/${edit.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suppressRuleSuggest: next }),
      });
      await load();
    } catch {
      setEdit((prev) => (prev ? { ...prev, suppress_rule_suggest: next ? 0 : 1 } : prev));
      addToast('Failed to update merchant', 'error');
    }
  };

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
      <div className="mb-[22px]">
        <PanelHeader title="Merchants" description="Every merchant from your transaction history. Edit how one displays throughout Ledger, set a rule for how it’s categorized, or merge merchants you don’t need." />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="relative">
          <Button variant="outline" size="sm" onClick={() => setSortOpen((o) => !o)} active={sortOpen}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
            {sort === 'count' ? 'Transaction count' : 'Name (A–Z)'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </Button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSortOpen(false)} />
              <div className="absolute top-12 left-0 z-40 w-[210px] bg-elevated border border-line-strong rounded-[12px] shadow-md p-1.5">
                {([['count', 'Transaction count'], ['name', 'Name (A–Z)']] as const).map(([v, label]) => (
                  <div key={v} onClick={() => { setSort(v); setSortOpen(false); }} className="flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] text-sm font-medium cursor-pointer hover:bg-surface-2"
                    style={{ background: sort === v ? 'var(--surface-2)' : undefined, color: sort === v ? 'var(--text)' : 'var(--text-2)' }}>
                    <span className="w-4">{sort === v && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}</span>{label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="h-10 flex items-center gap-2 rounded-[11px] bg-surface border border-line-strong px-3.5 w-[320px] max-w-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${merchants.length} merchants…`} className="flex-1 bg-transparent outline-none text-sm text-content" />
        </div>
      </div>

      <div className="bg-surface border border-line rounded-[18px] shadow-sm overflow-hidden">
        <div className="px-6 py-[18px] flex items-baseline gap-2.5">
          <span className="text-[17px] font-extrabold tracking-tight text-content">{search ? 'Matching merchants' : 'All merchants'}</span>
          <span className="font-mono text-[13px] text-content-3">{shown.length}{search ? ` of ${merchants.length}` : ''}</span>
        </div>
        {loading ? <Spinner />
          : shown.length === 0 ? <div className="px-6 py-14 text-center text-sm text-content-3 border-t border-line">{search ? `No merchants match “${search.trim()}”.` : 'No merchants yet — they appear as transactions are added or imported.'}</div>
          : shown.map((m) => (
            <div key={m.id} onClick={canEdit ? () => openEdit(m) : undefined}
              className={`group flex items-center gap-4 px-6 h-[68px] border-t border-line ${canEdit ? 'cursor-pointer hover:bg-surface-2' : ''} transition-colors`}>
              <Avatar m={m} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[15px] truncate">{m.name}</div>
                <div className="text-[13px] text-primary mt-0.5">{m.txn_count} transaction{m.txn_count === 1 ? '' : 's'}</div>
              </div>
              {canEdit && <Button variant="secondary" size="row" onClick={(e) => { e.stopPropagation(); openEdit(m); }} className="opacity-60 group-hover:opacity-100 transition-opacity">{ICON.pencil}Edit</Button>}
            </div>
          ))}
      </div>

      {/* Edit merchant modal */}
      {edit && (
        <ResponsiveModal isOpen onClose={() => setEdit(null)} title="Edit merchant" maxWidth="460px"
          footer={(
            <div className="flex items-center gap-2.5">
              <Button variant="danger" onClick={() => { setDel(edit); setMergeInto(''); setKeepAlias(true); }}>Merge &amp; delete</Button>
              <div className="ml-auto flex items-center gap-2.5">
                <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
                <Button onClick={saveName} loading={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
              </div>
            </div>
          )}>
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <Avatar m={edit} size={56} />
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => fileRef.current?.click()} className="text-[13px] font-semibold text-primary">{edit.logo_url ? 'Change logo' : 'Upload logo'}</button>
                  {edit.logo_url && <button type="button" onClick={removeLogo} className="text-[13px] font-semibold text-negative">Remove</button>}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = ''; }} />
                </div>
                <div className="text-[13px] text-content-3 mt-0.5">Shown wherever this merchant appears.</div>
              </div>
            </div>
            <Field label="Merchant name">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Merchant name" className={inputCls} onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }} />
            </Field>
            {/* Always categorize as — the merchant's durable rule, set from here or
                from the prompt after recategorizing a transaction. */}
            <Field
              label="Always categorize as"
              hint={edit.rule_id != null
                ? 'New and existing transactions from this merchant use this category. Clear it to choose per transaction again.'
                : 'Pick a category to apply it to this merchant’s transactions from now on.'}
            >
              <div className="flex items-center gap-2">
                <SelectShell className="flex-1 min-w-0">
                  <select value={edit.rule_category_id ?? ''} disabled={!canEdit || busy} onChange={(e) => { if (e.target.value) void setRule(Number(e.target.value)); }} className={selectCls}>
                    <option value="">No rule — categorize each time</option>
                    {Object.entries(categoryOptions.reduce<Record<string, CategoryOption[]>>((m, c) => { (m[c.group_name] ||= []).push(c); return m; }, {})).map(([group, subs]) => (
                      <optgroup key={group} label={group}>{subs.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}</optgroup>
                    ))}
                  </select>
                </SelectShell>
                {edit.rule_id != null && canEdit && (
                  <button type="button" onClick={clearRule} disabled={busy} title="Remove this rule"
                    className="w-11 h-11 flex-none flex items-center justify-center rounded-[11px] border border-line-strong bg-surface-2 text-negative disabled:opacity-50">
                    {ICON.x}
                  </button>
                )}
              </div>
            </Field>
            <button type="button" role="checkbox" aria-checked={edit.suppress_rule_suggest === 1} disabled={!canEdit} onClick={() => void toggleSuppress(edit.suppress_rule_suggest !== 1)}
              className="flex items-center gap-3 text-left disabled:opacity-60">
              <CheckBox checked={edit.suppress_rule_suggest === 1} />
              <span className="text-sm text-content-2">Don’t ask about this merchant when I change a category</span>
            </button>
            {aliases.length > 0 && (
              <Field label="Also matches" hint="Imported transactions with these statement names land on this merchant.">
                <div className="flex flex-col gap-1.5">
                  {aliases.map((a) => (
                    <div key={a.alias_name} className="flex items-center gap-2 h-10 pl-3.5 pr-1.5 rounded-[10px] bg-surface-2 border border-line">
                      <span className="flex-1 min-w-0 truncate text-[13px] font-mono text-content">{a.alias_name}</span>
                      {canEdit && (
                        <button type="button" onClick={() => removeAlias(a.alias_name)} title={`Stop routing “${a.alias_name}” here`}
                          className="w-7 h-7 flex-none flex items-center justify-center rounded-[8px] text-content-3 hover:text-content hover:bg-surface">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Field>
            )}
          </div>
        </ResponsiveModal>
      )}

      {/* Merge & delete modal */}
      {del && (
        <ResponsiveModal isOpen onClose={() => setDel(null)} title="Delete merchant" maxWidth="460px"
          footer={(
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setDel(null)}>Cancel</Button>
              <Button onClick={doMerge} disabled={!mergeInto} loading={busy} className="bg-negative hover:bg-negative">{busy ? 'Deleting…' : 'Delete merchant'}</Button>
            </div>
          )}>
          <div className="flex flex-col gap-5">
            <p className="text-sm text-content-2 m-0 leading-relaxed">
              There {del.txn_count === 1 ? 'is' : 'are'} <span className="font-bold text-content">{del.txn_count} transaction{del.txn_count === 1 ? '' : 's'}</span> tied to <span className="font-bold text-content">{del.name}</span>. Choose a merchant to reassign them to before deleting.
            </p>
            <Field label="Reassign transactions to">
              <SelectShell>
                <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className={selectCls}>
                  <option value="">Select a merchant…</option>
                  {merchants.filter((x) => x.id !== del.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </SelectShell>
            </Field>
            <button type="button" role="checkbox" aria-checked={keepAlias} onClick={() => setKeepAlias((v) => !v)} className="flex items-start gap-3 text-left">
              <CheckBox checked={keepAlias} className="mt-0.5" />
              <span className="text-sm text-content-2 leading-snug">
                Keep routing future transactions
                <span className="block text-[12.5px] text-content-3">Imports that would have become <span className="font-semibold">{del.name}</span> go to the merchant above instead.</span>
              </span>
            </button>
          </div>
        </ResponsiveModal>
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
