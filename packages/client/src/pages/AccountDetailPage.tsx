import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import ResponsiveModal from '../components/ResponsiveModal';
import CurrencyInput from '../components/CurrencyInput';
import Dropdown from '../components/Dropdown';
import { VendorAvatar } from '../components/primitives';
import Button from '../components/Button';
import FilterPopover from '../components/FilterPopover';
import DateRangePopover, { type DateRangeValue } from '../components/DateRangePopover';
import { EMPTY_FILTER, filterDraftCount, type FilterDraft, type FilterSection } from '../components/filterModel';
import AreaLineChart, { type ChartPoint } from '../components/charts/AreaLineChart';
import { formatMoney } from '@ledger/shared';
import { timeAgo, todayYmd } from '../lib/formatters';
import { Money } from '../components/Money';
import { useIsMobile } from '../hooks/useIsMobile';
import { ListRow } from '../components/ListRow';
import PageHeader from '../components/PageHeader';
import { getCategoryEmoji, getCategoryColorHex } from '../lib/categoryMeta';

// ---- types ----
interface AccountMeta {
  accountId: number; name: string; lastFour: string | null; type: string;
  institution: string | null; classification: string; balance: number; lastUpdated: string | null;
  logoUrl?: string | null; institutionColor?: string | null;
}
interface Snapshot { id: number; account_id: number; date: string; balance: number; note: string | null }
interface TxnCategory { id: number; groupName: string; subName: string; displayName: string | null; type: string }
interface Txn {
  id: number; date: string; description: string; amount: number;
  merchant: { id: number; name: string; logoUrl: string | null } | null;
  category: TxnCategory | null;
  splits: { categoryId: number; groupName: string; subName: string; displayName: string | null; type: string; amount: number }[] | null;
}

// ---- helpers ----
const SUBTYPE: Record<string, string> = {
  checking: 'Checking', savings: 'Savings', credit: 'Credit Card', investment: 'Brokerage',
  retirement: 'Retirement', venmo: 'Venmo', cash: 'Cash',
};

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '1m', label: '1 month', days: 30 },
  { key: '3m', label: '3 months', days: 91 },
  { key: '6m', label: '6 months', days: 182 },
  { key: 'ytd', label: 'Year to date', days: null },
  { key: '1y', label: '1 year', days: 365 },
  { key: 'all', label: 'All time', days: null },
];

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Build the range series from raw snapshots: sort asc, clamp the window to
// [rangeStart, today], carry the latest snapshot forward across ~90 sampled
// dates. Balances plot with their stored sign (a liability owed is negative).
function buildSeries(snapshots: Snapshot[], rangeKey: string): ChartPoint[] {
  if (snapshots.length === 0) return [];
  const asc = [...snapshots].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  const today = new Date();
  const endMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const firstMs = new Date(asc[0].date + 'T00:00:00').getTime();
  const def = RANGES.find((r) => r.key === rangeKey);
  let startMs: number;
  if (rangeKey === 'ytd') startMs = new Date(today.getFullYear(), 0, 1).getTime();
  else if (def?.days != null) startMs = endMs - def.days * 86400000;
  else startMs = firstMs; // all time
  startMs = Math.min(Math.max(startMs, firstMs), endMs);

  const spanDays = Math.round((endMs - startMs) / 86400000);
  const n = Math.max(1, Math.min(90, spanDays + 1));
  const points: ChartPoint[] = [];
  let k = 0;
  let last: number | null = null;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? endMs : startMs + ((endMs - startMs) * i) / (n - 1);
    const dateStr = isoOf(new Date(t));
    while (k < asc.length && asc[k].date <= dateStr) { last = asc[k].balance; k++; }
    if (last == null) continue; // sampled date precedes the first snapshot
    points.push({ date: dateStr, value: last });
  }
  return points;
}

// Category label for a row: own category, or the first split leg (+N extras).
function categoryOf(t: Txn): { label: string; subName: string | undefined; groupName: string | undefined; type: string } {
  if (t.category) return { label: t.category.displayName ?? t.category.subName, subName: t.category.subName, groupName: t.category.groupName, type: t.category.type };
  if (t.splits && t.splits.length > 0) {
    const first = t.splits[0];
    const extra = t.splits.length - 1;
    return { label: `${first.displayName ?? first.subName}${extra > 0 ? ` +${extra}` : ''}`, subName: first.subName, groupName: first.groupName, type: first.type };
  }
  return { label: 'Uncategorized', subName: undefined, groupName: undefined, type: 'expense' };
}

// ---- transaction list filters ----
const LIMIT = 14;
const SECTIONS: FilterSection[] = ['Categories', 'Merchants', 'Amount', 'Other']; // no Accounts: the list is pinned to this account
const DATE_PRESETS = [
  { value: 'all', label: 'All time' }, { value: 'this-month', label: 'This month' }, { value: 'last-month', label: 'Last month' },
  { value: 'this-quarter', label: 'This quarter' }, { value: 'last-quarter', label: 'Last quarter' },
  { value: 'this-year', label: 'This year' }, { value: 'last-year', label: 'Last year' }, { value: 'ytd', label: 'Year to date' },
];
const ALL_TIME: DateRangeValue = { preset: 'all', start: '', end: '' };
const SECONDARY_BTN = 'h-10 px-[18px] rounded-[10px] border border-line-strong bg-surface-2 text-content font-semibold text-sm hover:bg-elevated';
interface CategoryOpt { id: number; group_name: string; sub_name: string }
interface MerchantOpt { id: number; name: string }

// Same presets and boundaries as the Transactions page.
function dateRangeOf({ preset, start, end }: DateRangeValue): { startDate?: string; endDate?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthStart = (yr: number, mo: number) => `${yr}-${String(mo + 1).padStart(2, '0')}-01`;
  const monthEnd = (yr: number, mo: number) => todayYmd(new Date(yr, mo + 1, 0));
  const q = Math.floor(m / 3);
  switch (preset) {
    case 'this-month': return { startDate: monthStart(y, m), endDate: monthEnd(y, m) };
    case 'last-month': { const d = new Date(y, m - 1, 1); return { startDate: monthStart(d.getFullYear(), d.getMonth()), endDate: monthEnd(d.getFullYear(), d.getMonth()) }; }
    case 'this-quarter': return { startDate: monthStart(y, q * 3), endDate: monthEnd(y, q * 3 + 2) };
    case 'last-quarter': { const pq = q === 0 ? 3 : q - 1; const py = q === 0 ? y - 1 : y; return { startDate: monthStart(py, pq * 3), endDate: monthEnd(py, pq * 3 + 2) }; }
    case 'this-year': return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
    case 'last-year': return { startDate: `${y - 1}-01-01`, endDate: `${y - 1}-12-31` };
    case 'ytd': return { startDate: `${y}-01-01`, endDate: todayYmd(now) };
    case 'custom': return { startDate: start || undefined, endDate: end || undefined };
    default: return {};
  }
}

const shortDate = (s: string) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const dateLabelOf = (d: DateRangeValue) => d.preset === 'all' ? 'Date'
  : d.preset === 'custom'
    ? (d.start && d.end ? `${shortDate(d.start)} – ${shortDate(d.end)}` : d.start ? `From ${shortDate(d.start)}` : d.end ? `Until ${shortDate(d.end)}` : 'Custom')
    : (DATE_PRESETS.find((p) => p.value === d.preset)?.label ?? 'Date');

// The /transactions query for this account's list. A fully ticked category group also sends its `groupNames`, as the Transactions page does.
function listQuery(accountId: number, search: string, date: DateRangeValue, f: FilterDraft, groups: { group: string; subs: { id: number }[] }[]): string {
  const params = new URLSearchParams({ accountIds: String(accountId), limit: String(LIMIT) });
  const { startDate, endDate } = dateRangeOf(date);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (search) params.set('search', search);
  if (f.type !== 'All') params.set('type', f.type.toLowerCase());
  const wholeGroups = groups.filter((g) => g.subs.length > 0 && g.subs.every((s) => f.category.includes(`sub:${s.id}`))).map((g) => g.group);
  const groupNames = [...new Set([...f.category.filter((v) => v.startsWith('group:')).map((v) => v.slice(6)), ...wholeGroups])];
  const catIds = f.category.filter((v) => v.startsWith('sub:')).map((v) => v.slice(4));
  if (groupNames.length) params.set('groupNames', groupNames.join(','));
  if (catIds.length) params.set('categoryIds', catIds.join(','));
  if (f.merchant.length) params.set('merchantIds', f.merchant.join(','));
  if (f.op) {
    params.set('amountOp', f.op);
    if (f.op === 'bt') { if (f.min) params.set('amountMin', f.min); if (f.max) params.set('amountMax', f.max); }
    else if (f.val) params.set('amountValue', f.val);
  }
  if (f.needsReview) params.set('needsReview', '1');
  return params.toString();
}

export default function AccountDetailPage() {
  const { id } = useParams();
  // Keyed by account so search, date and filters never carry over to another account.
  return <AccountDetail key={id} />;
}

function AccountDetail() {
  const { id: idParam } = useParams();
  const id = parseInt(idParam ?? '', 10);
  const { addToast } = useToast();
  const { hasPermission } = useAuth();

  const [meta, setMeta] = useState<AccountMeta | null>(null);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [matchTotal, setMatchTotal] = useState(0); // transactions matching the filters
  const [txnTotal, setTxnTotal] = useState<number | null>(null); // the account's full count, whatever the filters
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryKey, setRetryKey] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // search, debounced: the list loads on this
  const [searchOpen, setSearchOpen] = useState(false);
  const [applied, setApplied] = useState<FilterDraft>(EMPTY_FILTER);
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTER);
  const [date, setDate] = useState<DateRangeValue>(ALL_TIME);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState('Categories');
  const [filterSearch, setFilterSearch] = useState('');
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const [merchants, setMerchants] = useState<MerchantOpt[]>([]);
  const loadSeq = useRef(0);
  const [range, setRange] = useState('1m');

  // manual balance entry (moved from AccountsPage — rows there now navigate here)
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');
  const isMobile = useIsMobile();

  // Each loader takes an `alive` probe so a response for a previous account id
  // (fast navigation between accounts) can't land on top of the current one.
  const loadMeta = useCallback(async (alive: () => boolean = () => true) => {
    try {
      const res = await apiFetch<{ data: { accounts: AccountMeta[] } }>('/networth/summary');
      if (!alive()) return;
      setMeta(res.data.accounts.find((a) => a.accountId === id) ?? null);
    } catch { if (alive()) setMeta(null); }
    finally { if (alive()) setMetaLoaded(true); }
  }, [id]);
  const loadHistory = useCallback(async (alive: () => boolean = () => true) => {
    try {
      const res = await apiFetch<{ data: Snapshot[] }>(`/balances/history?accountId=${id}`);
      if (alive()) setSnapshots(res.data);
    } catch { if (alive()) setSnapshots([]); }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const alive = () => !cancelled;
    setMetaLoaded(false); loadMeta(alive); loadHistory(alive);
    return () => { cancelled = true; };
  }, [loadMeta, loadHistory]);

  // Summary's "Total transactions" and the filter panel's choices don't depend on the filters.
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ total: number }>(`/transactions?accountIds=${id}&limit=1`).then((r) => { if (!cancelled) setTxnTotal(r.total); }).catch(() => {});
    apiFetch<{ data: CategoryOpt[] }>('/categories').then((r) => { if (!cancelled) setCategories(r.data); }).catch(() => {});
    apiFetch<{ data: MerchantOpt[] }>('/merchants').then((r) => { if (!cancelled) setMerchants(r.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const categoryGroups = useMemo(() => {
    const groups = new Map<string, { id: number; sub: string }[]>();
    for (const c of categories) groups.set(c.group_name, [...(groups.get(c.group_name) ?? []), { id: c.id, sub: c.sub_name }]);
    return [...groups].map(([group, subs]) => ({ group, subs }));
  }, [categories]);
  const groupsRef = useRef(categoryGroups); // read at request time: the panel can't apply category filters before they load
  groupsRef.current = categoryGroups;

  // Only the newest request may write the list: a slow older response must not overwrite it.
  useEffect(() => {
    const seq = ++loadSeq.current;
    setListState('loading');
    apiFetch<{ data: Txn[]; total: number }>(`/transactions?${listQuery(id, query, date, applied, groupsRef.current)}`)
      .then((res) => { if (seq === loadSeq.current) { setTxns(res.data); setMatchTotal(res.total); setListState('ready'); } })
      .catch(() => { if (seq === loadSeq.current) setListState('error'); });
  }, [id, query, date, applied, retryKey]);

  const filterCount = filterDraftCount(applied);
  const anyActive = query !== '' || date.preset !== 'all' || filterCount > 0;
  const clearAll = () => { setSearch(''); setQuery(''); setSearchOpen(false); setDate(ALL_TIME); setApplied(EMPTY_FILTER); setDraft(EMPTY_FILTER); };
  const openFilters = () => { setDraft(applied); setFilterTab('Categories'); setFilterSearch(''); if (!search) setSearchOpen(false); setFilterOpen(true); };
  const applyFilters = () => { setApplied(draft); setFilterOpen(false); };
  const clearFilters = () => { setDraft(EMPTY_FILTER); setApplied(EMPTY_FILTER); };

  // What is applied, in words: "Dining/Eating Out, Fuel · Last month". The search term comes last, quoted.
  const summaryText = (() => {
    const parts: string[] = [];
    const names = [
      ...applied.category.map((c) => c.startsWith('group:') ? c.slice(6) : categories.find((x) => `sub:${x.id}` === c)?.sub_name),
      ...applied.merchant.map((m) => merchants.find((x) => String(x.id) === m)?.name),
    ].filter((n): n is string => !!n);
    if (names.length) parts.push(names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2} more` : names.join(', '));
    const usd = (v: string) => formatMoney(Number(v) || 0, { kind: 'balance', showZero: true }).text;
    if (applied.op) parts.push(applied.op === 'gt' ? `Over ${usd(applied.val)}` : applied.op === 'lt' ? `Under ${usd(applied.val)}` : applied.op === 'eq' ? `Exactly ${usd(applied.val)}` : `${usd(applied.min)}–${usd(applied.max)}`);
    if (applied.type !== 'All') parts.push(applied.type === 'Expense' ? 'Debits only' : 'Credits only');
    if (applied.needsReview) parts.push('To review');
    if (date.preset !== 'all') parts.push(dateLabelOf(date));
    return parts.join(' · ');
  })();

  const isLiability = meta?.classification === 'liability';
  const points = useMemo(() => buildSeries(snapshots, range), [snapshots, range]);

  // Range delta on the plotted series. Owed liabilities are stored negative, so
  // the sign already carries the inverted polarity (debt paid down → delta ≥ 0 → green).
  const delta = points.length >= 2 ? points[points.length - 1].value - points[0].value : null;
  // No percentage when the range-start balance is 0 — dividing by it yields a bogus +0.0%.
  const deltaPct = delta != null && points[0].value !== 0 ? (delta / Math.abs(points[0].value)) * 100 : null;
  // Oriented so up is good (liabilities are plotted negative); zero shows "$0.00" in green.
  const change = delta != null ? formatMoney(delta, { kind: 'total', showZero: true, zeroTone: 'positive' }) : null;
  const up = change?.tone !== 'negative';
  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? range;

  // Axis date format tracks the plotted span: ≤3m "Jun 12", ≤1y "Mar", all "Mar '24".
  const spanDays = points.length >= 2
    ? Math.round((new Date(points[points.length - 1].date + 'T00:00:00').getTime() - new Date(points[0].date + 'T00:00:00').getTime()) / 86400000)
    : 0;
  const fmtAxisDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return d;
    if (spanDays <= 95) return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (spanDays <= 400) return dt.toLocaleDateString('en-US', { month: 'short' });
    return `${dt.toLocaleDateString('en-US', { month: 'short' })} '${String(dt.getFullYear()).slice(2)}`;
  };

  const saveBalance = async () => {
    if (!meta) return;
    const entered = parseFloat(balanceInput);
    if (isNaN(entered)) { addToast('Enter a valid balance', 'error'); return; }
    // Liabilities are typed as the amount owed and stored negative (owed lowers net worth).
    const balance = isLiability && entered !== 0 ? -entered : entered;
    try {
      await apiFetch('/balances', { method: 'POST', body: JSON.stringify({ accountId: meta.accountId, date: todayYmd(), balance }) });
      setBalanceOpen(false); addToast('Balance updated');
      await Promise.all([loadMeta(), loadHistory()]);
    } catch { addToast('Failed to update balance', 'error'); }
  };

  // Desktop: "Accounts › [avatar] Name" in the page header. Phones: the name is
  // the app-bar title with a back chevron, and the action sits in the bar.
  const topBar = (title: ReactNode, right?: ReactNode, barTitle?: string) => (
    <PageHeader mobileTitle={barTitle ?? 'Account'} mobileBack="/accounts" mobileActions={right}
      left={!isMobile && (
        <div className="flex items-center gap-[11px] min-w-0">
          <Link to="/accounts" className="text-[20px] font-extrabold tracking-tight text-content-3 hover:text-content-2 whitespace-nowrap">Accounts</Link>
          <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
          {title}
        </div>
      )}
      right={isMobile ? undefined : right} stackRight={false} />
  );

  if (!metaLoaded) return <Spinner />;

  if (!meta) {
    return (
      <div className="pb-16">
        {topBar(<span className="text-[20px] font-extrabold tracking-tight truncate">Account not found</span>, undefined, 'Account not found')}
        <div className="bg-surface border border-line rounded-card shadow-sm p-8 text-center">
          <div className="text-[15px] font-semibold text-content mb-1.5">This account doesn't exist</div>
          <div className="text-sm text-content-3 mb-4">It may have been removed, or the link is out of date.</div>
          <Link to="/accounts" className="inline-flex items-center h-10 px-4 rounded-[11px] bg-surface-2 border border-line-strong text-sm font-semibold text-content">Back to accounts</Link>
        </div>
      </div>
    );
  }

  const canBalance = hasPermission('balances.update');

  // Without transactions there is nothing to search or filter, so the controls go.
  const hasTxns = txnTotal !== 0;
  const countText = listState !== 'ready' || txns.length === 0 ? ''
    : !anyActive ? `${txns.length} most recent`
    : matchTotal > LIMIT ? `${LIMIT} of ${matchTotal} matching` : `${matchTotal} matching`;
  const dateEl = (
    <DateRangePopover
      presets={DATE_PRESETS}
      value={date}
      label={dateLabelOf(date)}
      active={date.preset !== 'all'}
      clearValue={ALL_TIME}
      onOpen={() => { setFilterOpen(false); if (!search) setSearchOpen(false); }}
      onApply={setDate}
    />
  );

  const summaryRow = (label: string, value: React.ReactNode, last = false) => (
    <div className={`flex items-center justify-between gap-3.5 py-3.5 ${last ? '' : 'border-b border-line'}`}>
      <span className="text-sm text-content-3">{label}</span>
      <span className="text-sm font-semibold text-right tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="pb-16">
      {topBar(
        <>
          <VendorAvatar name={meta.institution || meta.name} src={meta.logoUrl || undefined} color={meta.institutionColor || 'var(--c-blue)'} size={26} />
          <span className="text-[20px] font-extrabold tracking-tight truncate">{meta.name}{meta.lastFour ? ` (…${meta.lastFour})` : ''}</span>
        </>,
        undefined,
        `${meta.name}${meta.lastFour ? ` (…${meta.lastFour})` : ''}`
      )}

      {/* balance trend */}
      <div className="bg-surface border border-line rounded-card shadow-sm mb-[22px]">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4 px-4 md:px-[26px] pt-4 md:pt-[22px] pb-1">
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[.1em] text-content-3 mb-2 md:mb-2.5">Current balance</div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[30px] font-extrabold tracking-tight tabular-nums">{formatMoney(meta.balance, { kind: 'balance', showZero: true }).text}</span>
              {change != null && (
                <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold tabular-nums"
                  style={{ color: up ? 'var(--positive)' : 'var(--negative)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={up ? 'M7 17 17 7M9 7h8v8' : 'M7 7l10 10M17 9v8H9'} />
                  </svg>
                  {`${change.text}${deltaPct != null ? ` (${up ? '+' : '-'}${Math.abs(deltaPct).toFixed(1)}%)` : ''}`}
                </span>
              )}
              <span className="text-[15px] font-medium text-content-3">{rangeLabel} change</span>
            </div>
          </div>
          <div className="shrink-0">
            <Dropdown value={range} options={RANGES.map((r) => ({ key: r.key, label: r.label }))} onChange={setRange} minWidth={140} />
          </div>
        </div>
        <div className="px-3 md:px-[26px] pt-2 pb-3.5">
          {points.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-sm text-content-3">No balance history yet.</div>
          ) : (
            <AreaLineChart points={points} height={260} formatDate={fmtAxisDate} highlightLast xTicks={6} />
          )}
        </div>
      </div>

      {/* two-column: transactions + summary */}
      <div className="flex flex-wrap gap-[22px] items-start">
        {/* transactions. The panels open outside the card, from its left edge on desktop. */}
        <div className="relative flex-[2_1_460px] min-w-0 md:[&_[role=dialog]]:top-[84px] md:[&_[role=dialog]]:left-0 md:[&_[role=dialog]]:right-auto">
        <div className="bg-surface border border-line rounded-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-4 md:py-[18px]">
            <div className="flex items-baseline gap-3 min-w-0">
              <span className="text-[17px] font-extrabold tracking-tight">Transactions</span>
              {countText && <span className="text-[13px] font-semibold text-content-3 tabular-nums whitespace-nowrap">{countText}</span>}
            </div>
            {hasTxns && !isMobile && (
              <div className="flex items-center gap-2">
                {searchOpen || search ? (
                  <div className="flex items-center h-10 rounded-[11px] bg-surface border border-line-strong px-3 gap-2 w-[clamp(9rem,10vw,15rem)]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-content-3 shrink-0"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                    <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" autoCapitalize="off" aria-label="Search this account's transactions"
                      onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setSearchOpen(false); } }}
                      className="flex-1 min-w-0 bg-transparent outline-none text-sm text-content" />
                    <button onClick={() => { setSearch(''); setSearchOpen(false); }} aria-label="Close search" className="shrink-0 text-content-3 hover:text-content"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" iconOnly aria-label="Search" title="Search" onClick={() => setSearchOpen(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                  </Button>
                )}
                {dateEl}
                <Button variant="outline" size="sm" onClick={openFilters} active={filterOpen || filterCount > 0} aria-haspopup="dialog" aria-expanded={filterOpen}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
                  Filters
                  {filterCount > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center">{filterCount}</span>}
                </Button>
              </div>
            )}
          </div>
          {hasTxns && isMobile && (
            <div className="px-4 pb-3 flex flex-col gap-2">
              <div className="flex items-center h-11 rounded-[12px] bg-surface border border-line-strong pl-3 pr-1 gap-2">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transactions" autoCapitalize="off" aria-label="Search this account's transactions"
                  className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-content placeholder:text-content-3" />
                {search && (
                  <button onClick={() => setSearch('')} aria-label="Clear search" className="w-8 h-8 flex items-center justify-center text-content-3">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
                  </button>
                )}
                <button onClick={openFilters} aria-label="Filters" aria-haspopup="dialog" aria-expanded={filterOpen} className={`relative w-9 h-9 rounded-[9px] flex items-center justify-center ${filterOpen || filterCount ? 'text-primary' : 'text-content-2'}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
                  {filterCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">{filterCount}</span>}
                </button>
              </div>
              <div className="flex">{dateEl}</div>
            </div>
          )}
          {hasTxns && anyActive && (
            <div className="flex items-center gap-3 px-4 md:px-6 py-2.5 border-t border-line bg-surface-2">
              <span className="flex flex-1 min-w-0 text-sm text-content-2 whitespace-nowrap">
                <span className="sr-only">Showing </span>
                {summaryText && <span className="truncate">{summaryText}</span>}
                {query && (
                  <>
                    {summaryText && <span className="shrink-0">&nbsp;·&nbsp;</span>}
                    <span className="shrink-0">“</span><span className="truncate">{query}</span><span className="shrink-0">”</span>
                  </>
                )}
              </span>
              <button onClick={clearAll} className="shrink-0 text-primary hover:text-primary-hover font-semibold text-sm">Clear</button>
            </div>
          )}
          {listState === 'loading' ? (
            <div className="border-t border-line"><Spinner /></div>
          ) : listState === 'error' ? (
            <div className="px-6 py-8 border-t border-line text-center text-sm text-content-3">
              <div className="mb-3">Couldn't load transactions.</div>
              <button onClick={() => setRetryKey((k) => k + 1)} className={SECONDARY_BTN}>Try again</button>
            </div>
          ) : txns.length === 0 ? (
            <div className="px-6 py-8 border-t border-line text-center text-sm text-content-3">
              {!hasTxns ? 'No transactions for this account.' : (
                <>
                  {query ? (
                    <div className="flex items-center justify-center min-w-0 mb-3"><span className="shrink-0">Nothing matches “</span><span className="truncate">{query}</span><span className="shrink-0">”</span></div>
                  ) : <div className="mb-3">No transactions match these filters</div>}
                  <button onClick={clearAll} className={SECONDARY_BTN}>Clear</button>
                </>
              )}
            </div>
          ) : (
            txns.map((t) => {
              const cat = categoryOf(t);
              const color = getCategoryColorHex(cat.groupName);
              const vendor = t.merchant?.name ?? t.description;
              const amt = <Money amount={t.amount} transfer={cat.type === 'transfer'} />;
              if (isMobile) {
                return (
                  <ListRow key={t.id}
                    avatar={{ name: vendor, src: t.merchant?.logoUrl, color }}
                    title={vendor}
                    subtitle={<><span className="shrink-0 text-[13px] leading-none">{getCategoryEmoji(cat.subName, cat.groupName)}</span><span className="truncate">{cat.label}</span></>}
                    amount={amt}
                    meta={<span className="font-mono">{new Date(t.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                    className="border-t" />
                );
              }
              return (
                <div key={t.id} className="flex items-center gap-3.5 px-6 h-11 border-t border-line">
                  <span className="w-[84px] shrink-0 font-mono text-[12.5px] text-content-3">
                    {new Date(t.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <VendorAvatar name={vendor} src={t.merchant?.logoUrl || undefined} color={color} size={26} />
                  <span className="flex-[1.4] min-w-0 font-semibold text-[15px] truncate">{vendor}</span>
                  <span className="flex-1 min-w-0 flex items-center gap-2 text-[13px] text-content-2">
                    <span className="shrink-0 text-[15px] leading-none">{getCategoryEmoji(cat.subName, cat.groupName)}</span>
                    <span className="truncate">{cat.label}</span>
                  </span>
                  <span className="min-w-32 shrink-0 text-right font-bold text-[15px]">{amt}</span>
                </div>
              );
            })
          )}
          <Link to={`/transactions?accountId=${meta.accountId}`}
            className="flex items-center justify-center p-4 text-[13px] text-content-3 hover:text-content-2 border-t border-line">
            View all in Transactions
          </Link>
        </div>
        {filterOpen && (
          <FilterPopover
            draft={draft} setDraft={setDraft}
            categoryGroups={categoryGroups} accounts={[]} merchants={merchants} categories={categories}
            search={filterSearch} setSearch={setFilterSearch} tab={filterTab} setTab={setFilterTab}
            onClear={clearFilters} onCancel={() => setFilterOpen(false)} onApply={applyFilters}
            showNeedsReview sections={SECTIONS}
          />
        )}
        </div>

        {/* summary (right, per the design pack) */}
        <div className="flex-[1_1_300px] min-w-[280px] md:sticky md:top-[88px] bg-surface border border-line rounded-card shadow-sm px-4 md:px-6 pt-4 md:pt-[22px] pb-4">
          <div className="text-[17px] font-extrabold tracking-tight mb-2">Summary</div>
          {summaryRow('Institution', meta.institution ?? '—')}
          {summaryRow('Account type', SUBTYPE[meta.type] ?? meta.type)}
          {summaryRow('Total transactions', txnTotal == null ? '—' : txnTotal.toLocaleString())}
          {summaryRow('Last update', timeAgo(meta.lastUpdated) || '—', true)}
          {canBalance && (
            <button onClick={() => { setBalanceInput(meta.balance ? String(isLiability ? -meta.balance : meta.balance) : ''); setBalanceOpen(true); }}
              className="w-full h-11 mt-1.5 mb-1.5 rounded-[11px] bg-surface-2 border border-line-strong font-semibold text-sm text-content hover:bg-elevated">
              Update balance
            </button>
          )}
        </div>
      </div>

      {/* manual balance modal */}
      {balanceOpen && (
        <ResponsiveModal isOpen onClose={() => setBalanceOpen(false)} title={`Update balance — ${meta.name}`}>
          <div className="flex flex-col gap-4 p-1">
            <div>
              <label className="block text-[13px] font-semibold text-content-2 mb-1.5">New balance (as of today)</label>
              <CurrencyInput value={balanceInput} onChange={setBalanceInput} autoFocus allowNegative className="w-full h-11 px-3.5 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none" />
              <p className="text-[12px] text-content-3 mt-1.5">Records a balance snapshot dated today. For liabilities, enter the amount owed as a positive number. Enter a negative amount if the card is in credit.</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setBalanceOpen(false)} className="h-11 px-4 rounded-[11px] bg-surface-2 border border-line-strong font-semibold text-sm">Cancel</button>
              <button onClick={saveBalance} className="h-11 px-5 rounded-[11px] bg-primary text-on-primary font-bold text-sm">Save balance</button>
            </div>
          </div>
        </ResponsiveModal>
      )}
    </div>
  );
}
