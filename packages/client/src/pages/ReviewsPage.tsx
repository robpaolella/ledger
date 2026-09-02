import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { VendorAvatar } from '../components/primitives';
import { fmtTransaction } from '../lib/formatters';
import { getCategoryEmoji, useCategoryEmojis } from '../lib/categoryMeta';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

interface Txn {
  id: number; date: string; description: string; amount: number;
  merchant: { id: number; name: string; logoUrl?: string | null } | null;
  account: { id: number; name: string; lastFour: string | null; logoUrl?: string | null; color?: string | null };
  category: { id: number; groupName: string; subName: string; displayName: string; type: string } | null;
}
interface ReviewRow {
  reviewId: number; reason: string; note: string | null;
  assignee: { id: number; displayName: string } | null;
  transaction: Txn;
}
interface DetailTxn extends Txn {
  note: string | null;
  needsReview?: boolean;
  review?: { status: string; reason: string; note: string | null; assignee: { id: number; displayName: string } | null } | null;
}
interface HUser { id: number; displayName: string }
interface Category { id: number; group_name: string; sub_name: string; display_name: string; type: string }
type DateFilter = 'all' | '7' | '30' | 'month' | 'older';

const DATE_DEFS: [DateFilter, string][] = [['all', 'All dates'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['month', 'This month'], ['older', 'Older than 30 days']];
const REASON_LABEL: Record<string, string> = { auto_uncategorized: 'Uncategorized merchant', auto_low_confidence: 'Low-confidence category', manual: 'Flagged for review' };
const AV_COLOR: Record<string, string> = {
  A: '--c-orange', J: '--c-violet', M: '--c-amber', C: '--c-blue', H: '--c-amber', D: '--c-violet',
  N: '--c-teal', L: '--c-teal', S: '--c-amber', W: '--c-blue', V: '--c-blue', B: '--c-violet',
  I: '--c-rose', P: '--c-green', K: '--c-amber', U: '--c-indigo', F: '--c-fuchsia', G: '--c-green', T: '--c-rose',
};
const initialOf = (s: string) => (s.trim()[0] || '?').toUpperCase();
const colorVar = (s: string) => `var(${AV_COLOR[initialOf(s)] || '--c-blue'})`;
// Household users get a stable hue by id (not by initial — two "J"s would collide).
const USER_COLORS = ['--c-blue', '--c-violet', '--c-teal', '--c-amber', '--c-rose', '--c-green', '--c-indigo', '--c-orange', '--c-fuchsia'];
const userColor = (id: number) => `var(${USER_COLORS[Math.abs(id) % USER_COLORS.length]})`;
/** Sentinel id for the "Unassigned" bucket in the Users filter. */
const UNASSIGNED = 0;
const tint = (v: string) => `color-mix(in srgb, ${v} 16%, transparent)`;
const money = (v: number) => '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseDate = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const friendlyDate = (ymd: string) => parseDate(ymd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

function Avatar({ seed, color, size = 24, font = 11 }: { seed: string; color?: string; size?: number; font?: number }) {
  const c = color ?? colorVar(seed);
  return <span className="flex-none rounded-full inline-flex items-center justify-center font-bold" style={{ width: size, height: size, fontSize: font, background: tint(c), color: c }}>{initialOf(seed)}</span>;
}

export default function ReviewsPage() {
  const { user, hasPermission } = useAuth();
  const canEdit = hasPermission('transactions.edit');
  const { addToast } = useToast();
  useCategoryEmojis(); // re-render when stored category emojis load/change
  const [searchParams] = useSearchParams();

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [openTotal, setOpenTotal] = useState(0); // server-side open count (the list itself is capped)
  const [users, setUsers] = useState<HUser[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [initialLoading, setInitialLoading] = useState(true); // only ever set on first mount
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  // ?assignee=<id> | me | unassigned — deep links from the dashboard card + notifications.
  const assigneeParam = searchParams.get('assignee');
  const paramToUsers = useCallback((raw: string | null): Set<number> => {
    if (!raw) return new Set();
    if (raw === 'me') return user ? new Set([user.id]) : new Set();
    if (raw === 'unassigned') return new Set([UNASSIGNED]);
    return !isNaN(Number(raw)) ? new Set([Number(raw)]) : new Set();
  }, [user]);
  const [selUsers, setSelUsers] = useState<Set<number>>(() => paramToUsers(assigneeParam));
  useEffect(() => { setSelUsers(paramToUsers(assigneeParam)); }, [assigneeParam, paramToUsers]);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menu, setMenu] = useState<'date' | 'users' | null>(null);
  const [editAssign, setEditAssign] = useState<number | null>(null);
  const [editCat, setEditCat] = useState<number | null>(null); // txnId whose inline category picker is open
  const [catSearch, setCatSearch] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);

  // in-page detail panel
  const [detail, setDetail] = useState<DetailTxn | null>(null);
  const [detailNote, setDetailNote] = useState('');
  const [detailReviewNote, setDetailReviewNote] = useState('');

  const closeAll = useCallback(() => { setMenu(null); setEditAssign(null); setEditCat(null); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (detail) setDetail(null); else closeAll(); } };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [closeAll, detail]);

  const loadSeqRef = useRef(0);
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setInitialLoading(true); else setRefreshing(true);
    const seq = ++loadSeqRef.current; // drop out-of-order responses so a stale list can't resurrect removed rows
    try {
      const res = await apiFetch<{ data: ReviewRow[]; total: number }>('/reviews?status=open&limit=500');
      if (seq === loadSeqRef.current) { setRows(res.data); setOpenTotal(res.total ?? res.data.length); }
    } catch { addToast('Failed to load reviews', 'error'); }
    finally { setInitialLoading(false); setRefreshing(false); }
  }, [addToast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiFetch<{ data: { id: number; display_name: string }[] }>('/users').then((r) => setUsers(r.data.map((u) => ({ id: u.id, displayName: u.display_name })))).catch(() => {});
    apiFetch<{ data: Category[] }>('/categories').then((r) => setCategories(r.data)).catch(() => {});
  }, []);

  const notifyChanged = () => window.dispatchEvent(new CustomEvent('reviews-changed'));

  // ---- filters ----
  const passDate = useCallback((ymd: string) => {
    if (dateFilter === 'all') return true;
    // Presets are whole days: compare against local midnight so a transaction
    // dated exactly N days ago stays in "Last N days" all day.
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const d = parseDate(ymd); const ts = d.getTime(); const DAY = 86400000;
    if (dateFilter === '7') return ts >= now.getTime() - 7 * DAY;
    if (dateFilter === '30') return ts >= now.getTime() - 30 * DAY;
    if (dateFilter === 'older') return ts < now.getTime() - 30 * DAY;
    if (dateFilter === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return true;
  }, [dateFilter]);
  const q = search.trim().toLowerCase();
  const passSearch = (r: ReviewRow) => !q || (r.transaction.merchant?.name || r.transaction.description).toLowerCase().includes(q) || (r.transaction.category?.subName ?? '').toLowerCase().includes(q);
  const passUser = (r: ReviewRow) => selUsers.size === 0 || (r.assignee ? selUsers.has(r.assignee.id) : selUsers.has(UNASSIGNED));

  const shown = rows.filter((r) => passDate(r.transaction.date) && passUser(r) && passSearch(r));
  const anyFilter = dateFilter !== 'all' || selUsers.size > 0 || q !== '';
  const shownTotal = shown.reduce((s, r) => s + Math.abs(r.transaction.amount), 0);
  const userCount = useMemo(() => { const m = new Map<number, number>(); for (const r of rows) { const k = r.assignee?.id ?? UNASSIGNED; m.set(k, (m.get(k) ?? 0) + 1); } return m; }, [rows]);
  const unassignedCount = userCount.get(UNASSIGNED) ?? 0;
  const groups = useMemo(() => {
    const by = new Map<string, ReviewRow[]>();
    for (const r of shown) { const k = r.transaction.date; if (!by.has(k)) by.set(k, []); by.get(k)!.push(r); }
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, rs]) => ({ date, header: friendlyDate(date), rows: rs }));
  }, [shown]);
  const catGroups = useMemo(() => {
    const g = new Map<string, Category[]>();
    for (const c of categories) { if (!g.has(c.group_name)) g.set(c.group_name, []); g.get(c.group_name)!.push(c); }
    return [...g.entries()];
  }, [categories]);
  const catMatches = useMemo(() => {
    const s = catSearch.trim().toLowerCase();
    return s ? categories.filter((c) => c.sub_name.toLowerCase().includes(s) || c.group_name.toLowerCase().includes(s)) : categories;
  }, [categories, catSearch]);

  // ---- mutations ----
  // Optimistic in-place updates: the grouped list must never unmount wholesale (the shell
  // scroll container clamps scrollTop to 0 when it does). Patch rows locally; on API failure
  // reconcile with a silent reload (server is source of truth — a whole-list snapshot rollback
  // would clobber other in-flight optimistic updates).
  // A category-only change is a relabel: keep account/date/description/amount, omit note
  // so the server preserves it. Changing the category resolves the open review server-side.
  const setTxnCategory = async (base: Txn, categoryId: number) => {
    setEditCat(null); setCatSearch('');
    setRows((rs) => rs.filter((r) => r.transaction.id !== base.id));
    const cat = categories.find((c) => c.id === categoryId);
    if (cat) setDetail((d) => (d && d.id === base.id ? { ...d, category: { id: cat.id, groupName: cat.group_name, subName: cat.sub_name, displayName: cat.display_name, type: cat.type } } : d));
    try {
      await apiFetch(`/transactions/${base.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: base.account.id, date: base.date, description: base.description, amount: base.amount, categoryId }) });
      notifyChanged(); load({ silent: true });
      if (detail && detail.id === base.id) await refetchDetail(base.id);
    } catch {
      load({ silent: true });
      if (detail && detail.id === base.id) refetchDetail(base.id); // undo the optimistic detail patch
      addToast('Failed to set category', 'error');
    }
  };
  const resolve = async (ids: number[]) => {
    if (busy || ids.length === 0) return;
    setBusy(true);
    setRows((rs) => rs.filter((r) => !ids.includes(r.transaction.id)));
    try {
      await apiFetch('/reviews/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids.length === 1 ? { transactionId: ids[0] } : { transactionIds: ids }) });
      notifyChanged(); load({ silent: true });
      if (detail && ids.includes(detail.id)) await refetchDetail(detail.id);
    } catch { load({ silent: true }); addToast('Failed to approve', 'error'); }
    finally { setBusy(false); }
  };
  const reassign = async (txnId: number, assigneeId: number) => {
    setEditAssign(null);
    const nextAssignee = users.find((u) => u.id === assigneeId);
    if (nextAssignee) {
      setRows((rs) => rs.map((r) => (r.transaction.id === txnId ? { ...r, assignee: nextAssignee } : r)));
      setDetail((d) => (d && d.id === txnId && d.review ? { ...d, review: { ...d.review, assignee: nextAssignee } } : d));
    }
    try {
      await apiFetch(`/reviews/${txnId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigneeId }) });
      notifyChanged(); load({ silent: true });
      if (detail && detail.id === txnId) await refetchDetail(txnId);
    } catch {
      load({ silent: true });
      if (detail && detail.id === txnId) refetchDetail(txnId); // undo the optimistic detail patch
      addToast('Failed to reassign', 'error');
    }
  };
  const saveReviewNote = async (txnId: number, note: string) => {
    setRows((rs) => rs.map((r) => (r.transaction.id === txnId ? { ...r, note } : r)));
    try { await apiFetch(`/reviews/${txnId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) }); }
    catch { load({ silent: true }); addToast('Failed to save note', 'error'); }
  };
  const saveTxnNote = async (base: DetailTxn, note: string) => {
    try {
      await apiFetch(`/transactions/${base.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: base.account.id, date: base.date, description: base.description, amount: base.amount, ...(base.category ? { categoryId: base.category.id } : {}), note }) });
    } catch { addToast('Failed to save note', 'error'); }
  };

  const refetchDetail = async (id: number) => {
    try {
      const r = await apiFetch<{ data: DetailTxn }>(`/transactions/${id}`);
      setDetail(r.data); setDetailNote(r.data.note ?? ''); setDetailReviewNote(r.data.review?.note ?? '');
    } catch { /* leave panel */ }
  };
  const openPanel = (id: number) => { setDetail({ id } as DetailTxn); refetchDetail(id); };

  const resetFilters = () => { setDateFilter('all'); setSelUsers(new Set()); setSearch(''); setSearchOpen(false); };
  const dateLabel = dateFilter === 'all' ? 'Date' : DATE_DEFS.find(([v]) => v === dateFilter)![1];
  const usersLabel = selUsers.size === 1
    ? (selUsers.has(UNASSIGNED) ? 'Unassigned' : (users.find((u) => selUsers.has(u.id))?.displayName ?? 'Users'))
    : 'Users';
  // One overlay at a time: opening a header menu closes any row popover.
  const toggleMenu = (which: 'date' | 'users') => { setEditAssign(null); setEditCat(null); setMenu((m) => (m === which ? null : which)); };
  const ctrl = 'h-10 flex items-center gap-2 rounded-[11px] bg-surface border text-sm font-semibold whitespace-nowrap';
  const anyOverlay = menu !== null || editAssign !== null || editCat !== null;

  return (
    <div>
      {/* top bar */}
      <div className="sticky top-0 z-20 -mt-4 md:-mt-7 -mx-4 md:-mx-8 px-4 md:px-8 py-4 mb-0 flex items-center justify-between gap-5 flex-wrap bg-bg border-b border-line">
        <div className="flex items-center gap-3.5">
          <span className="page-title text-[22px] font-extrabold text-content tracking-tight leading-tight m-0">Review</span>
          <span className="inline-flex items-center gap-1.5 h-[26px] px-[11px] rounded-full text-[12px] font-bold" style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
            {openTotal} flagged
          </span>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {searchOpen ? (
            <div className="h-10 flex items-center gap-2 rounded-[11px] bg-surface border border-line-strong px-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setSearchOpen(false); } }} placeholder="Search…" className="w-40 bg-transparent outline-none text-sm text-content" />
              <button onClick={() => { setSearch(''); setSearchOpen(false); }} className="text-content-3 hover:text-content"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
            </div>
          ) : (
            <button onClick={() => setSearchOpen(true)} className="w-10 h-10 flex-none flex items-center justify-center rounded-[11px] bg-surface border border-line-strong text-content-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></button>
          )}
          {/* date filter */}
          <div className="relative">
            <button onClick={() => toggleMenu('date')} className={`${ctrl} px-3.5`} style={{ borderColor: menu === 'date' ? 'var(--primary)' : 'var(--line-strong)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
              {dateLabel}
              {dateFilter !== 'all' && <span className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--primary)' }} />}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {menu === 'date' && (
              <div className="absolute top-[46px] right-0 z-40 w-[220px] bg-elevated border border-line-strong rounded-[12px] shadow-md p-1.5">
                {DATE_DEFS.map(([v, label]) => {
                  const on = dateFilter === v;
                  return (
                    <div key={v} onClick={() => { setDateFilter(v); setMenu(null); }} className="flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] text-sm font-medium cursor-pointer" style={{ color: on ? 'var(--text)' : 'var(--text-2)', background: on ? 'var(--surface-2)' : 'transparent' }}>
                      <span className="w-4 flex-none flex items-center justify-center">{on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}</span>
                      {label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* users filter */}
          <div className="relative">
            <button onClick={() => toggleMenu('users')} className={`${ctrl} px-3.5`} style={{ borderColor: menu === 'users' ? 'var(--primary)' : 'var(--line-strong)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg>
              {usersLabel}
              {selUsers.size > 0 && <span className="min-w-[18px] h-[18px] px-[5px] rounded-full text-[11px] font-bold inline-flex items-center justify-center bg-primary text-on-primary">{selUsers.size}</span>}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {menu === 'users' && (
              <div className="absolute top-[46px] right-0 z-40 w-[250px] bg-elevated border border-line-strong rounded-[12px] shadow-md p-1.5">
                <div className="flex items-center justify-between px-2 pt-1 pb-2">
                  <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-content-3">Assigned to</span>
                  <span onClick={() => setSelUsers(new Set())} className="text-[12px] font-semibold cursor-pointer" style={{ color: selUsers.size > 0 ? 'var(--primary)' : 'var(--text-3)' }}>Clear</span>
                </div>
                {users.map((u) => {
                  const on = selUsers.has(u.id);
                  return (
                    <div key={u.id} onClick={() => setSelUsers((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} className="flex items-center gap-[11px] px-2.5 py-2 rounded-[9px] cursor-pointer" style={{ background: on ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent' }}>
                      <span className="w-[19px] h-[19px] flex-none rounded-[6px] border-[1.5px] flex items-center justify-center" style={{ borderColor: on ? 'var(--primary)' : 'var(--line-strong)', background: on ? 'var(--primary)' : 'var(--surface)' }}>
                        {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}
                      </span>
                      <Avatar seed={u.displayName} color={userColor(u.id)} />
                      <span className="flex-1 text-sm font-semibold text-content">{u.displayName}</span>
                      <span className="font-mono text-[12px] text-content-3">{userCount.get(u.id) ?? 0}</span>
                    </div>
                  );
                })}
                {unassignedCount > 0 && (() => {
                  const on = selUsers.has(UNASSIGNED);
                  return (
                    <div onClick={() => setSelUsers((s) => { const n = new Set(s); if (n.has(UNASSIGNED)) n.delete(UNASSIGNED); else n.add(UNASSIGNED); return n; })} className="flex items-center gap-[11px] px-2.5 py-2 rounded-[9px] cursor-pointer" style={{ background: on ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent' }}>
                      <span className="w-[19px] h-[19px] flex-none rounded-[6px] border-[1.5px] flex items-center justify-center" style={{ borderColor: on ? 'var(--primary)' : 'var(--line-strong)', background: on ? 'var(--primary)' : 'var(--surface)' }}>
                        {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}
                      </span>
                      <span className="w-6 h-6 flex-none rounded-full border border-dashed border-line-strong" />
                      <span className="flex-1 text-sm font-semibold text-content-2">Unassigned</span>
                      <span className="font-mono text-[12px] text-content-3">{unassignedCount}</span>
                    </div>
                  );
                })()}
                {users.length === 0 && <div className="px-2.5 py-3 text-sm text-content-3">No users</div>}
              </div>
            )}
          </div>
          {canEdit && (
            <button onClick={() => shown.length > 0 && setConfirmAll(true)} disabled={shown.length === 0} className="h-10 px-4 flex items-center gap-2 rounded-[11px] font-bold text-sm shadow-sm disabled:cursor-not-allowed"
              style={shown.length > 0 ? { background: 'var(--primary)', color: 'var(--on-primary)' } : { background: 'var(--surface)', color: 'var(--text-3)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>
              Approve all
            </button>
          )}
        </div>
      </div>

      {/* body card */}
      <div className="pt-6 pb-16">
        <div className="border border-line rounded-[18px] bg-surface shadow-sm" style={{ overflow: 'visible' }}>
          <div className="flex items-center justify-between gap-4 px-6 py-[18px]">
            <div className="flex items-baseline gap-2.5">
              <span className="text-[15px] font-bold tabular-nums text-content">{shown.length} need review</span>
              {anyFilter && <span onClick={resetFilters} className="text-[13px] font-semibold text-primary cursor-pointer">Reset filters</span>}
              {refreshing && <span className="text-[12px] text-content-3 animate-pulse">Refreshing…</span>}
            </div>
            <span className="font-mono text-[13px] text-content-2 tabular-nums">{money(shownTotal)} pending</span>
          </div>

          {initialLoading ? (
            <div className="px-6 py-10 text-center text-content-3 text-sm border-t border-line">Loading…</div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3.5 px-6 pt-16 pb-[72px] text-center">
              <div className="w-[60px] h-[60px] rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--positive) 15%, transparent)', color: 'var(--positive)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>
              </div>
              <div className="text-[18px] font-extrabold tracking-tight">{anyFilter ? 'No matches' : "You're all caught up"}</div>
              <div className="text-sm text-content-3 max-w-[320px]">{anyFilter ? 'No transactions match the current filters.' : 'Every flagged transaction has been reviewed. Nice work.'}</div>
              {anyFilter && <button onClick={resetFilters} className="mt-1 h-10 px-[18px] rounded-[11px] border border-line-strong bg-surface-2 text-content font-semibold text-sm">Clear filters</button>}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.date}>
                <div className="flex items-center justify-between px-6 py-[9px] bg-surface-2 border-t border-b border-line">
                  <span className="text-[13px] font-semibold text-content-2">{g.header}</span>
                  <span className="font-mono text-[12px] text-content-3 tabular-nums">{g.rows.length} {g.rows.length === 1 ? 'item' : 'items'}</span>
                </div>
                {g.rows.map((r) => {
                  const t = r.transaction;
                  const mLabel = t.merchant?.name || t.description;
                  const reasonText = REASON_LABEL[r.reason] || 'Flagged for review';
                  const noteText = r.note?.trim() || '';
                  const amt = fmtTransaction(t.amount, t.category?.type ?? 'expense');
                  return (
                    <div key={r.reviewId} onClick={() => openPanel(t.id)} className="group flex items-center gap-3.5 px-6 h-[60px] border-b border-line cursor-pointer hover:bg-surface-2 transition-colors">
                      <VendorAvatar name={mLabel} src={t.merchant?.logoUrl || undefined} color={colorVar(mLabel)} size={30} />
                      <div className="flex-[1.5] min-w-0">
                        <div className="font-semibold text-[15px] truncate">{mLabel}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
                          <span className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--warning)' }}>{reasonText}</span>
                          {noteText && <span className="text-[12.5px] text-content-3 truncate min-w-0" title={noteText}>· {noteText}</span>}
                        </div>
                      </div>
                      {/* category (inline-editable) */}
                      <div className="flex-1 min-w-0 relative" onClick={(e) => { if (canEdit) { e.stopPropagation(); setEditCat((v) => (v === t.id ? null : t.id)); setCatSearch(''); setMenu(null); setEditAssign(null); } }}>
                        <div className="flex items-center gap-2.5 h-9 px-2 -mx-2 rounded-[8px] text-[13px] text-content-2 border border-transparent hover:border-line-strong transition-colors" style={{ cursor: canEdit ? 'pointer' : 'default' }}>
                          <span className="flex-none text-[15px] leading-none">{t.category ? getCategoryEmoji(t.category.subName ?? t.category.groupName) : '🏷️'}</span>
                          <span className="truncate flex-1">{t.category?.subName ?? 'Uncategorized'}</span>
                          {canEdit && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="flex-none opacity-0 group-hover:opacity-100 transition-opacity"><path d="m6 9 6 6 6-6" /></svg>}
                        </div>
                        {editCat === t.id && (
                          <div onClick={(e) => e.stopPropagation()} className="absolute top-9 left-0 z-[60] w-64 bg-elevated border border-line-strong rounded-[12px] shadow-md overflow-hidden">
                            <div className="p-2 border-b border-line"><input autoFocus value={catSearch} onChange={(e) => setCatSearch(e.target.value)} placeholder="Search categories…" className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-line text-content text-sm outline-none" /></div>
                            <div className="max-h-60 overflow-y-auto p-1.5">
                              {catMatches.map((c) => (
                                <button key={c.id} onClick={() => setTxnCategory(t, c.id)} className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-sm text-content hover:bg-surface-2">
                                  <span className="text-[15px] leading-none">{getCategoryEmoji(c.sub_name)}</span>
                                  <span className="truncate">{c.sub_name}</span>
                                  <span className="ml-auto text-xs text-content-3 truncate">{c.group_name}</span>
                                </button>
                              ))}
                              {catMatches.length === 0 && <div className="px-3 py-2 text-sm text-content-3">No matches</div>}
                            </div>
                          </div>
                        )}
                      </div>
                      {/* assignee / reassign */}
                      <div onClick={(e) => { e.stopPropagation(); if (canEdit) setEditAssign((v) => (v === t.id ? null : t.id)); setMenu(null); setEditCat(null); }}
                        className="flex-1 min-w-0 relative flex items-center gap-2.5 h-[38px] px-2.5 rounded-[9px] border border-transparent hover:border-line-strong hover:bg-elevated transition-colors" style={{ cursor: canEdit ? 'pointer' : 'default' }}>
                        {r.assignee ? <Avatar seed={r.assignee.displayName} color={userColor(r.assignee.id)} /> : <span className="w-6 h-6 flex-none rounded-full border border-dashed border-line-strong" />}
                        <span className="text-[13.5px] font-semibold text-content-2 truncate">{r.assignee?.displayName ?? 'Unassigned'}</span>
                        {canEdit && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="flex-none"><path d="m6 9 6 6 6-6" /></svg>}
                        {editAssign === t.id && (
                          <div onClick={(e) => e.stopPropagation()} className="absolute top-[42px] left-0 z-[60] w-[210px] bg-elevated border border-line-strong rounded-[12px] shadow-md p-1.5">
                            <div className="px-2 pt-1 pb-1.5 font-mono text-[10px] tracking-[0.08em] uppercase text-content-3">Reassign to</div>
                            {users.map((u) => {
                              const cur = r.assignee?.id === u.id;
                              return (
                                <div key={u.id} onClick={() => reassign(t.id, u.id)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-sm font-semibold cursor-pointer" style={{ color: cur ? 'var(--primary)' : 'var(--text)', background: cur ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent' }}>
                                  <Avatar seed={u.displayName} color={userColor(u.id)} size={22} font={10} />{u.displayName}
                                </div>
                              );
                            })}
                            {users.length === 0 && <div className="px-2.5 py-2 text-sm text-content-3">No users</div>}
                          </div>
                        )}
                      </div>
                      <div className={`w-[112px] flex-none text-right font-bold text-[15px] tabular-nums ${amt.className}`}>{amt.text}</div>
                      {canEdit && (
                        <div onClick={(e) => { e.stopPropagation(); resolve([t.id]); }} className="w-9 h-9 flex-none flex items-center justify-center rounded-[10px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" title="Mark reviewed"
                          style={{ background: 'color-mix(in srgb, var(--positive) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--positive) 40%, transparent)', color: 'var(--positive)' }}>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {anyOverlay && <div onClick={closeAll} className="fixed inset-0 z-[35]" />}

      {/* approve-all confirm */}
      {confirmAll && (
        <>
          <div className="fixed inset-0 z-[80]" style={{ background: 'var(--bg-modal)', backdropFilter: 'blur(3px)' }} onClick={() => setConfirmAll(false)} />
          <div className="fixed left-1/2 top-1/2 z-[90] w-[400px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 bg-elevated border border-line-strong rounded-[16px] shadow-md p-5">
            <h2 className="text-[17px] font-extrabold m-0 mb-1">Approve {shown.length} transaction{shown.length === 1 ? '' : 's'}?</h2>
            <p className="text-sm text-content-2 mb-5">This marks every transaction in the current view reviewed and clears it from the queue.</p>
            <div className="flex justify-end gap-2.5">
              <button onClick={() => setConfirmAll(false)} className="h-10 px-4 rounded-[11px] border border-line-strong bg-surface-2 text-content font-semibold text-sm">Cancel</button>
              <button onClick={() => { const ids = shown.map((r) => r.transaction.id); setConfirmAll(false); resolve(ids); }} disabled={busy} className="h-10 px-5 rounded-[11px] bg-primary text-on-primary font-bold text-sm disabled:opacity-50">Approve all</button>
            </div>
          </div>
        </>
      )}

      {/* in-page transaction detail panel */}
      {detail && (
        <>
          <div className="fixed inset-0 z-[70]" style={{ background: 'var(--bg-modal)' }} onClick={() => setDetail(null)} />
          <div className="fixed top-0 right-0 bottom-0 z-[80] w-[420px] max-w-[calc(100vw-24px)] bg-surface border-l border-line shadow-md overflow-y-auto">
            {(() => {
              const d = detail;
              const loaded = d.account !== undefined;
              const amt = loaded ? fmtTransaction(d.amount, d.category?.type ?? 'expense') : null;
              const label = d.merchant?.name || d.description || '';
              const fieldCls = 'w-full h-11 pl-3.5 pr-9 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none appearance-none cursor-pointer disabled:cursor-default';
              const chevron = <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>;
              const labelCls = 'text-[11px] font-semibold text-content-3 mb-1.5';
              return (
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div className="flex items-center gap-3 min-w-0">
                      {loaded && <VendorAvatar name={label} src={d.merchant?.logoUrl || undefined} color={colorVar(label)} size={38} />}
                      <div className="min-w-0">
                        <div className="font-extrabold text-[17px] truncate">{loaded ? label : 'Loading…'}</div>
                        {loaded && (
                          <div className="text-[13px] text-content-3 flex items-center gap-1.5">
                            <span>{parseDate(d.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} ·</span>
                            <VendorAvatar name={d.account.name} src={d.account.logoUrl || undefined} color={d.account.color || 'var(--c-blue)'} size={16} />
                            <span>{d.account.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button onClick={() => setDetail(null)} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 border border-line-strong text-content-2"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
                  </div>

                  {!loaded ? <div className="text-content-3 text-sm">Loading…</div> : (
                    <>
                      <div className={`text-right font-extrabold text-[22px] tabular-nums mb-5 ${amt!.className}`}>{amt!.text}</div>

                      {d.review?.status === 'resolved' && (
                        <div className="mb-4 text-[13px] font-semibold px-3 py-2 rounded-[10px]" style={{ background: 'color-mix(in srgb, var(--positive) 12%, transparent)', color: 'var(--positive)' }}>Reviewed</div>
                      )}

                      <div className={labelCls}>Category</div>
                      <div className="relative mb-4">
                        <select value={d.category?.id ?? ''} onChange={(e) => e.target.value && setTxnCategory(d, parseInt(e.target.value, 10))} className={fieldCls} disabled={!canEdit}>
                          <option value="">Uncategorized</option>
                          {catGroups.map(([grp, cats]) => (
                            <optgroup key={grp} label={grp}>{cats.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}</optgroup>
                          ))}
                        </select>
                        {chevron}
                      </div>

                      <div className={labelCls}>Transaction note</div>
                      <textarea value={detailNote} onChange={(e) => setDetailNote(e.target.value)} disabled={!canEdit}
                        onBlur={() => { if (canEdit && (d.note ?? '') !== detailNote) { saveTxnNote(d, detailNote).then(() => refetchDetail(d.id)); } }}
                        placeholder="Add a note…" className="w-full min-h-[64px] resize-y p-3 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none mb-5" />

                      {canEdit && (
                        <div className="rounded-[12px] border p-3 mb-5" style={{ borderColor: d.needsReview ? 'color-mix(in srgb, var(--warning) 45%, var(--line))' : 'var(--line)', background: d.needsReview ? 'color-mix(in srgb, var(--warning) 8%, transparent)' : 'transparent' }}>
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <span className="text-[13px] font-semibold" style={{ color: d.needsReview ? 'var(--warning)' : 'var(--text-2)' }}>{d.needsReview ? (REASON_LABEL[d.review?.reason ?? ''] ?? 'Flagged for review') : 'Not flagged'}</span>
                            {d.needsReview && <button onClick={() => resolve([d.id])} className="h-8 px-3 rounded-lg bg-primary text-on-primary font-bold text-[13px] shrink-0">Mark reviewed</button>}
                          </div>
                          {d.needsReview && (
                            <>
                              <div className={labelCls}>Assign to</div>
                              <div className="relative mb-3">
                                <select value={d.review?.assignee?.id ?? ''} onChange={(e) => e.target.value && reassign(d.id, parseInt(e.target.value, 10))} className={fieldCls}>
                                  {!d.review?.assignee && <option value="" disabled>Select assignee…</option>}
                                  {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
                                </select>
                                {chevron}
                              </div>
                              <div className={labelCls}>Review note</div>
                              <textarea value={detailReviewNote} onChange={(e) => setDetailReviewNote(e.target.value)}
                                onBlur={() => { if ((d.review?.note ?? '') !== detailReviewNote) saveReviewNote(d.id, detailReviewNote).then(() => refetchDetail(d.id)); }}
                                placeholder="Why does this need review?" className="w-full min-h-[56px] resize-y p-3 rounded-[10px] bg-surface-2 border border-line text-content text-sm outline-none" />
                            </>
                          )}
                        </div>
                      )}

                      <Link to={`/transactions?review=${d.id}`} className="text-[13px] font-semibold text-primary">Open in Transactions →</Link>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
