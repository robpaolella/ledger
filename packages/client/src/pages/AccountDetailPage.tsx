import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import ResponsiveModal from '../components/ResponsiveModal';
import CurrencyInput from '../components/CurrencyInput';
import Dropdown from '../components/Dropdown';
import { VendorAvatar } from '../components/primitives';
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
// dates, and negate the plotted values for liabilities.
function buildSeries(snapshots: Snapshot[], rangeKey: string, negate: boolean): ChartPoint[] {
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
    points.push({ date: dateStr, value: negate ? -Math.abs(last) : last });
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

export default function AccountDetailPage() {
  const { id: idParam } = useParams();
  const id = parseInt(idParam ?? '', 10);
  const { addToast } = useToast();
  const { hasPermission } = useAuth();

  const [meta, setMeta] = useState<AccountMeta | null>(null);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [txnTotal, setTxnTotal] = useState(0);
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
  const loadTxns = useCallback(async (alive: () => boolean = () => true) => {
    try {
      const res = await apiFetch<{ data: Txn[]; total: number }>(`/transactions?accountIds=${id}&limit=14`);
      if (alive()) { setTxns(res.data); setTxnTotal(res.total); }
    } catch { if (alive()) { setTxns([]); setTxnTotal(0); } }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const alive = () => !cancelled;
    setMetaLoaded(false); loadMeta(alive); loadHistory(alive); loadTxns(alive);
    return () => { cancelled = true; };
  }, [loadMeta, loadHistory, loadTxns]);

  const isLiability = meta?.classification === 'liability';
  const points = useMemo(() => buildSeries(snapshots, range, isLiability), [snapshots, range, isLiability]);

  // Range delta on the plotted series. Liabilities are plotted negated, so the
  // sign already carries the inverted polarity (debt paid down → delta ≥ 0 → green).
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
    const balance = parseFloat(balanceInput);
    if (isNaN(balance)) { addToast('Enter a valid balance', 'error'); return; }
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

  const displayBalance = isLiability ? -Math.abs(meta.balance) : meta.balance;
  const canBalance = hasPermission('balances.update');

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
        <Link to={`/transactions?accountId=${meta.accountId}`}
          className="flex items-center gap-2 h-10 px-3.5 rounded-[11px] bg-surface border border-line-strong text-sm font-semibold text-content shrink-0 hover:bg-surface-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
          <span className="hidden md:inline">Filters</span>
        </Link>,
        `${meta.name}${meta.lastFour ? ` (…${meta.lastFour})` : ''}`
      )}

      {/* balance trend */}
      <div className="bg-surface border border-line rounded-card shadow-sm mb-[22px]">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4 px-4 md:px-[26px] pt-4 md:pt-[22px] pb-1">
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[.1em] text-content-3 mb-2 md:mb-2.5">Current balance</div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[30px] font-extrabold tracking-tight tabular-nums">{formatMoney(displayBalance, { kind: 'balance', showZero: true }).text}</span>
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
        {/* transactions */}
        <div className="flex-[2_1_460px] min-w-0 bg-surface border border-line rounded-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-4 md:py-[18px]">
            <span className="text-[17px] font-extrabold tracking-tight">Transactions</span>
            <span className="text-[13px] font-semibold text-content-3 tabular-nums">{txns.length} most recent</span>
          </div>
          {txns.length === 0 ? (
            <div className="px-6 py-8 border-t border-line text-center text-sm text-content-3">No transactions for this account.</div>
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
                    subtitle={<><span className="shrink-0 text-[13px] leading-none">{getCategoryEmoji(cat.subName)}</span><span className="truncate">{cat.label}</span></>}
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
                    <span className="shrink-0 text-[15px] leading-none">{getCategoryEmoji(cat.subName)}</span>
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

        {/* summary (right, per the design pack) */}
        <div className="flex-[1_1_300px] min-w-[280px] md:sticky md:top-[88px] bg-surface border border-line rounded-card shadow-sm px-4 md:px-6 pt-4 md:pt-[22px] pb-4">
          <div className="text-[17px] font-extrabold tracking-tight mb-2">Summary</div>
          {summaryRow('Institution', meta.institution ?? '—')}
          {summaryRow('Account type', SUBTYPE[meta.type] ?? meta.type)}
          {summaryRow('Total transactions', txnTotal.toLocaleString())}
          {summaryRow('Last update', timeAgo(meta.lastUpdated) || '—', true)}
          {canBalance && (
            <button onClick={() => { setBalanceInput(meta.balance ? String(meta.balance) : ''); setBalanceOpen(true); }}
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
              <CurrencyInput value={balanceInput} onChange={setBalanceInput} autoFocus allowNegative />
              <p className="text-[12px] text-content-3 mt-1.5">Records a balance snapshot dated today. For liabilities, enter the amount owed as a positive number.</p>
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
