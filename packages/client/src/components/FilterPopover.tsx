import { getCategoryEmoji, useCategoryEmojis } from '../lib/categoryMeta';
import { VendorAvatar } from './primitives';
import { type FilterDraft, filterDraftCount } from './filterModel';

interface AccountOpt { id: number | string; name: string; last_four?: string | null; lastFour?: string | null; avatar_url?: string | null; classification?: string | null; institutionRef?: { logo_url: string | null; color: string | null } | null }
interface MerchantOpt { id: number; name: string; txn_count?: number; logo_url?: string | null }
interface CategoryGroup { group: string; subs: { id: number; sub: string }[] }
interface CategoryRow { id: number; group_name: string; sub_name: string }

const NAV_ALL = ['Categories', 'Merchants', 'Accounts', 'Amount', 'Other'];
const accountLabel = (a: AccountOpt) => { const lf = a.lastFour ?? a.last_four; return lf ? `${a.name} (${lf})` : a.name; };
// Same order and wording as the rest of the app (see components/import/types.ts).
const ACCOUNT_SECTIONS: { key: string; label: string }[] = [
  { key: 'liquid', label: 'Liquid' },
  { key: 'investment', label: 'Investments' },
  { key: 'liability', label: 'Liabilities' },
];
const sectionOf = (a: AccountOpt) => (ACCOUNT_SECTIONS.some((s) => s.key === a.classification) ? a.classification! : 'liquid');
const Chk = ({ on }: { on: boolean }) => (
  <span className="w-[19px] h-[19px] shrink-0 rounded-[6px] border-[1.5px] flex items-center justify-center" style={{ borderColor: on ? 'var(--primary)' : 'var(--line-strong)', background: on ? 'var(--primary)' : 'transparent' }}>
    {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--on-primary)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}
  </span>
);
const RemoveBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="text-content-3 hover:text-content shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></svg></button>
);

/**
 * The app-wide filter popover. Renders a backdrop + the popover positioned
 * `absolute top-12 right-0`; wrap the trigger button in a `relative` element.
 * Controlled via `draft` / `setDraft` (the canonical FilterDraft); the caller
 * maps the applied draft to its own query params on Apply.
 */
export default function FilterPopover({
  draft, setDraft, categoryGroups, accounts, merchants, categories,
  search, setSearch, tab, setTab, onClear, onCancel, onApply, showNeedsReview = false,
}: {
  draft: FilterDraft;
  setDraft: React.Dispatch<React.SetStateAction<FilterDraft>>;
  categoryGroups: CategoryGroup[];
  accounts: AccountOpt[];
  merchants: MerchantOpt[];
  categories: CategoryRow[];
  search: string; setSearch: (s: string) => void;
  tab: string; setTab: (t: string) => void;
  onClear: () => void; onCancel: () => void; onApply: () => void;
  showNeedsReview?: boolean; // Transactions opts in to the "Needs review" dimension
}) {
  useCategoryEmojis(); // re-render when stored category emojis load/change
  // Reports has nothing under "Other" — only Transactions offers the needs-review flag.
  const NAV = showNeedsReview ? NAV_ALL : NAV_ALL.filter((n) => n !== 'Other');
  const toggleCategory = (token: string) => setDraft((d) => ({ ...d, category: d.category.includes(token) ? d.category.filter((v) => v !== token) : [...d.category, token] }));
  const toggleGroup = (subs: { id: number }[]) => setDraft((d) => {
    const tokens = subs.map((s) => `sub:${s.id}`);
    const all = tokens.length > 0 && tokens.every((t) => d.category.includes(t));
    return { ...d, category: all ? d.category.filter((c) => !tokens.includes(c)) : [...new Set([...d.category, ...tokens])] };
  });
  const toggleMerchant = (id: string) => setDraft((d) => ({ ...d, merchant: d.merchant.includes(id) ? d.merchant.filter((v) => v !== id) : [...d.merchant, id] }));
  const toggleAccount = (id: string) => setDraft((d) => ({ ...d, account: d.account.includes(id) ? d.account.filter((v) => v !== id) : [...d.account, id] }));
  /** Group checkbox: check the whole section, or clear it when it's already full. */
  const toggleAccountSection = (ids: string[]) => setDraft((d) => {
    const all = ids.length > 0 && ids.every((id) => d.account.includes(id));
    return { ...d, account: all ? d.account.filter((id) => !ids.includes(id)) : [...new Set([...d.account, ...ids])] };
  });
  const q = search.toLowerCase();
  const count = filterDraftCount(draft);

  // "Select all" bulk toggles for the multi-select checklists.
  const visibleCatTokens = categoryGroups.flatMap((g) => (q ? g.subs.filter((s) => `${s.sub} ${g.group}`.toLowerCase().includes(q)) : g.subs)).map((s) => `sub:${s.id}`);
  const visibleMerchantIds = merchants.filter((m) => !q || m.name.toLowerCase().includes(q)).map((m) => m.id.toString());
  const catAllChecked = visibleCatTokens.length > 0 && visibleCatTokens.every((t) => draft.category.includes(t));
  const merAllChecked = visibleMerchantIds.length > 0 && visibleMerchantIds.every((id) => draft.merchant.includes(id));
  const toggleAllCategories = () => setDraft((d) => ({ ...d, category: catAllChecked ? d.category.filter((x) => !visibleCatTokens.includes(x)) : [...new Set([...d.category, ...visibleCatTokens])] }));
  const toggleAllMerchants = () => setDraft((d) => ({ ...d, merchant: merAllChecked ? d.merchant.filter((x) => !visibleMerchantIds.includes(x)) : [...new Set([...d.merchant, ...visibleMerchantIds])] }));

  // Accounts, bucketed by classification. Search filters the members; a section
  // with no surviving member is dropped so its group checkbox can't select rows
  // that aren't on screen.
  const visibleAccounts = accounts.filter((a) => !q || accountLabel(a).toLowerCase().includes(q));
  const accountSections = ACCOUNT_SECTIONS
    .map((sec) => ({ ...sec, rows: visibleAccounts.filter((a) => sectionOf(a) === sec.key) }))
    .filter((sec) => sec.rows.length > 0);
  const visibleAccountIds = visibleAccounts.map((a) => a.id.toString());
  const acctAllChecked = visibleAccountIds.length > 0 && visibleAccountIds.every((id) => draft.account.includes(id));

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <div className="absolute top-12 right-0 z-50 w-[820px] max-w-[calc(100vw-64px)] bg-elevated border border-line-strong rounded-[16px] shadow-md overflow-hidden flex flex-col">
        {/* header */}
        <div className="flex border-b border-line">
          <div className="w-[170px] shrink-0 px-5 py-[18px] text-base font-extrabold tracking-tight border-r border-line">Filters</div>
          <div className="flex-1 flex items-center gap-2.5 px-5 border-r border-line">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab.toLowerCase()}…`} className="flex-1 h-12 bg-transparent outline-none text-sm text-content" />
          </div>
          <div className="w-[240px] shrink-0 px-5 flex items-center text-sm font-semibold text-content-2">{count} filter{count === 1 ? '' : 's'} selected</div>
        </div>
        {/* body: nav · checklist · selected summary */}
        <div className="flex" style={{ minHeight: 380 }}>
          <div className="w-[170px] shrink-0 p-3 border-r border-line flex flex-col gap-0.5">
            {NAV.map((n) => {
              const active = tab === n;
              return <button key={n} onClick={() => { setTab(n); setSearch(''); }} className="px-3.5 py-2.5 rounded-[9px] text-sm font-semibold text-left" style={{ color: active ? 'var(--primary)' : 'var(--text)', background: active ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent' }}>{n}</button>;
            })}
          </div>
          <div className="flex-1 p-3 border-r border-line overflow-auto" style={{ maxHeight: 440 }}>
            {tab === 'Categories' && visibleCatTokens.length > 0 && (
              <div onClick={toggleAllCategories} className="flex items-center gap-3 px-1 py-2 mb-1 border-b border-line rounded-lg hover:bg-surface-2 text-sm font-semibold text-content-2 cursor-pointer"><Chk on={catAllChecked} />Select all</div>
            )}
            {tab === 'Merchants' && visibleMerchantIds.length > 0 && (
              <div onClick={toggleAllMerchants} className="flex items-center gap-3 px-1 py-2 mb-1 border-b border-line rounded-lg hover:bg-surface-2 text-sm font-semibold text-content-2 cursor-pointer"><Chk on={merAllChecked} />Select all</div>
            )}
            {tab === 'Categories' && categoryGroups.map((g) => {
              const gChecked = g.subs.length > 0 && g.subs.every((s) => draft.category.includes(`sub:${s.id}`));
              const subs = q ? g.subs.filter((s) => `${s.sub} ${g.group}`.toLowerCase().includes(q)) : g.subs;
              if (q && subs.length === 0 && !g.group.toLowerCase().includes(q)) return null;
              return (
                <div key={g.group} className="mb-1">
                  <div onClick={() => toggleGroup(g.subs)} className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-surface-2 text-sm font-semibold cursor-pointer"><Chk on={gChecked} />{g.group}</div>
                  {subs.map((s) => (
                    <div key={s.id} onClick={() => toggleCategory(`sub:${s.id}`)} className="flex items-center gap-3 pl-8 pr-1 py-2 rounded-lg hover:bg-surface-2 text-[13px] cursor-pointer"><Chk on={draft.category.includes(`sub:${s.id}`)} />{s.sub}</div>
                  ))}
                </div>
              );
            })}
            {tab === 'Accounts' && (
              accountSections.length === 0 ? (
                <div className="flex items-center justify-center h-full min-h-[320px] text-content-3 text-sm">No accounts match</div>
              ) : (
                <>
                  <div onClick={() => setDraft((d) => ({ ...d, account: acctAllChecked ? d.account.filter((id) => !visibleAccountIds.includes(id)) : [...new Set([...d.account, ...visibleAccountIds])] }))}
                    className="flex items-center gap-3 px-1 py-2 mb-1 border-b border-line rounded-lg hover:bg-surface-2 text-sm font-semibold text-content-2 cursor-pointer"><Chk on={acctAllChecked} />Select all</div>
                  {accountSections.map((sec) => {
                    const ids = sec.rows.map((a) => a.id.toString());
                    const secChecked = ids.every((id) => draft.account.includes(id));
                    return (
                      <div key={sec.key} className="mb-1">
                        <div onClick={() => toggleAccountSection(ids)} className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-surface-2 text-sm font-semibold cursor-pointer">
                          <Chk on={secChecked} />
                          <span className="flex-1">{sec.label}</span>
                          <span className="text-content-3 text-[13px] tabular-nums shrink-0">{sec.rows.length}</span>
                        </div>
                        {sec.rows.map((a) => (
                          <div key={a.id} onClick={() => toggleAccount(a.id.toString())} className="flex items-center gap-3 pl-8 pr-1 py-2 rounded-lg hover:bg-surface-2 text-[13px] cursor-pointer">
                            <Chk on={draft.account.includes(a.id.toString())} />
                            <VendorAvatar name={a.name} src={(a.avatar_url || a.institutionRef?.logo_url) || undefined} color={a.institutionRef?.color || 'var(--c-blue)'} size={18} />
                            <span className="flex-1 truncate">{accountLabel(a)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </>
              )
            )}
            {tab === 'Amount' && (
              <div className="px-1">
                <div className="font-mono text-[11px] uppercase tracking-wide text-content-3 mb-1.5">Amount</div>
                {([['gt', 'Greater than…'], ['lt', 'Less than…'], ['eq', 'Equal to…'], ['bt', 'Between…']] as [string, string][]).map(([op, label]) => (
                  <div key={op}>
                    <div onClick={() => setDraft((d) => ({ ...d, op: d.op === op ? '' : op }))} className="flex items-center gap-3 py-2 cursor-pointer text-[15px]"><Chk on={draft.op === op} />{label}</div>
                    {draft.op === op && op !== 'bt' && (
                      <div className="pl-8 pb-2"><input value={draft.val} onChange={(e) => setDraft((d) => ({ ...d, val: e.target.value.replace(/[^0-9.]/g, '') }))} inputMode="decimal" placeholder="$10" className="w-full h-[46px] px-4 rounded-[11px] bg-surface border border-line text-content text-[15px] tabular-nums outline-none" /></div>
                    )}
                    {draft.op === op && op === 'bt' && (
                      <div className="flex items-center gap-2.5 pl-8 pb-2">
                        <input value={draft.min} onChange={(e) => setDraft((d) => ({ ...d, min: e.target.value.replace(/[^0-9.]/g, '') }))} inputMode="decimal" placeholder="Min" className="flex-1 min-w-0 h-[46px] px-4 rounded-[11px] bg-surface border border-line text-content text-[15px] tabular-nums outline-none" />
                        <span className="text-content-3 text-sm">to</span>
                        <input value={draft.max} onChange={(e) => setDraft((d) => ({ ...d, max: e.target.value.replace(/[^0-9.]/g, '') }))} inputMode="decimal" placeholder="Max" className="flex-1 min-w-0 h-[46px] px-4 rounded-[11px] bg-surface border border-line text-content text-[15px] tabular-nums outline-none" />
                      </div>
                    )}
                  </div>
                ))}
                <div className="font-mono text-[11px] uppercase tracking-wide text-content-3 mt-3.5 mb-1.5">Type</div>
                {([['Expense', 'Debits only'], ['Income', 'Credits only']] as [string, string][]).map(([val, label]) => (
                  <div key={val} onClick={() => setDraft((d) => ({ ...d, type: d.type === val ? 'All' : val }))} className="flex items-center gap-3 py-2 cursor-pointer text-[15px]"><Chk on={draft.type === val} />{label}</div>
                ))}
              </div>
            )}
            {tab === 'Merchants' && (
              merchants.length === 0 ? (
                <div className="flex items-center justify-center h-full min-h-[320px] text-content-3 text-sm">No merchants yet</div>
              ) : (
                merchants.filter((m) => !q || m.name.toLowerCase().includes(q)).map((m) => (
                  <div key={m.id} onClick={() => toggleMerchant(m.id.toString())} className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-surface-2 text-[15px] cursor-pointer">
                    <Chk on={draft.merchant.includes(m.id.toString())} />
                    <VendorAvatar name={m.name} src={m.logo_url || undefined} color={'var(--c-blue)'} size={18} />
                    <span className="flex-1 truncate">{m.name}</span>
                    {m.txn_count !== undefined && <span className="text-content-3 text-[13px] tabular-nums shrink-0">{m.txn_count}</span>}
                  </div>
                ))
              )
            )}
            {tab === 'Other' && showNeedsReview && (
              <div className="py-2">
                <button type="button" role="checkbox" aria-checked={!!draft.needsReview} onClick={() => setDraft((d) => ({ ...d, needsReview: !d.needsReview }))} className="flex items-center gap-3 w-full text-left px-1 py-2 rounded-lg hover:bg-surface-2 text-[15px]">
                  <Chk on={!!draft.needsReview} /><span className="flex-1">Needs review only</span>
                </button>
                <p className="px-1 pt-1 text-[13px] text-content-3 leading-snug">Transactions auto-categorized with low confidence, or left uncategorized on import.</p>
              </div>
            )}
          </div>
          {/* selected filters — ALL dimensions */}
          <div className="w-[240px] shrink-0 p-4 overflow-auto" style={{ maxHeight: 440 }}>
            {count === 0 ? (
              <div className="text-content-3 text-sm">No filters selected yet.</div>
            ) : (
              <div className="flex flex-col gap-4">
                {draft.category.filter((c) => c.startsWith('sub:')).length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5"><span className="text-[13px] font-semibold text-content-3">Categories</span><button onClick={() => setDraft((d) => ({ ...d, category: [] }))} className="text-[13px] font-semibold text-primary">Clear</button></div>
                    {draft.category.filter((c) => c.startsWith('sub:')).map((c) => {
                      const cat = categories.find((x) => x.id === Number(c.slice(4)));
                      return (
                        <div key={c} className="flex items-center gap-2 py-1.5 text-sm">
                          <span className="text-[15px] leading-none">{getCategoryEmoji(cat?.sub_name)}</span>
                          <span className="flex-1 truncate">{cat?.sub_name ?? c}</span>
                          <RemoveBtn onClick={() => toggleCategory(c)} />
                        </div>
                      );
                    })}
                  </div>
                )}
                {draft.merchant.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5"><span className="text-[13px] font-semibold text-content-3">Merchants</span><button onClick={() => setDraft((d) => ({ ...d, merchant: [] }))} className="text-[13px] font-semibold text-primary">Clear</button></div>
                    {draft.merchant.map((mid) => {
                      const m = merchants.find((x) => x.id.toString() === mid);
                      return (
                        <div key={mid} className="flex items-center gap-2 py-1.5 text-sm">
                          <span className="flex-1 truncate">{m?.name ?? mid}</span>
                          <RemoveBtn onClick={() => toggleMerchant(mid)} />
                        </div>
                      );
                    })}
                  </div>
                )}
                {draft.account.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5"><span className="text-[13px] font-semibold text-content-3">Accounts</span><button onClick={() => setDraft((d) => ({ ...d, account: [] }))} className="text-[13px] font-semibold text-primary">Clear</button></div>
                    {draft.account.map((aid) => {
                      const a = accounts.find((x) => x.id.toString() === aid);
                      return (
                        <div key={aid} className="flex items-center gap-2 py-1.5 text-sm">
                          <span className="flex-1 truncate">{a ? accountLabel(a) : aid}</span>
                          <RemoveBtn onClick={() => toggleAccount(aid)} />
                        </div>
                      );
                    })}
                  </div>
                )}
                {draft.op && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5"><span className="text-[13px] font-semibold text-content-3">Amount</span><button onClick={() => setDraft((d) => ({ ...d, op: '', val: '', min: '', max: '' }))} className="text-[13px] font-semibold text-primary">Clear</button></div>
                    <div className="flex items-center gap-2 py-1.5 text-sm"><span className="flex-1 truncate">{draft.op === 'gt' ? `Greater than $${draft.val || '0'}` : draft.op === 'lt' ? `Less than $${draft.val || '0'}` : draft.op === 'eq' ? `Equal to $${draft.val || '0'}` : `$${draft.min || '0'} – $${draft.max || '0'}`}</span><RemoveBtn onClick={() => setDraft((d) => ({ ...d, op: '', val: '', min: '', max: '' }))} /></div>
                  </div>
                )}
                {draft.type !== 'All' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5"><span className="text-[13px] font-semibold text-content-3">Type</span><button onClick={() => setDraft((d) => ({ ...d, type: 'All' }))} className="text-[13px] font-semibold text-primary">Clear</button></div>
                    <div className="flex items-center gap-2 py-1.5 text-sm"><span className="flex-1 truncate">{draft.type === 'Expense' ? 'Debits only' : 'Credits only'}</span><RemoveBtn onClick={() => setDraft((d) => ({ ...d, type: 'All' }))} /></div>
                  </div>
                )}
                {draft.needsReview && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5"><span className="text-[13px] font-semibold text-content-3">Review</span><button onClick={() => setDraft((d) => ({ ...d, needsReview: false }))} className="text-[13px] font-semibold text-primary">Clear</button></div>
                    <div className="flex items-center gap-2 py-1.5 text-sm"><span className="flex-1 truncate">Needs review only</span><RemoveBtn onClick={() => setDraft((d) => ({ ...d, needsReview: false }))} /></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {/* footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-line">
          <button onClick={onClear} className="h-10 px-[18px] rounded-[10px] border border-line-strong bg-surface-2 text-content font-semibold text-sm">Clear</button>
          <div className="flex gap-2.5">
            <button onClick={onCancel} className="h-10 px-[18px] rounded-[10px] border border-line-strong bg-surface-2 text-content font-semibold text-sm">Cancel</button>
            <button onClick={onApply} className="h-10 px-5 rounded-[10px] bg-primary text-on-primary font-bold text-sm shadow-sm">Apply</button>
          </div>
        </div>
      </div>
    </>
  );
}
