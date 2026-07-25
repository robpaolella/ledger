import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import ResponsiveModal from '../components/ResponsiveModal';
import CurrencyInput from '../components/CurrencyInput';
import Dropdown from '../components/Dropdown';
import { OwnerBadge, SharedBadge, initOwnerSlots } from '../components/badges';
import { VendorAvatar, SegmentedControl } from '../components/primitives';
import AreaLineChart, { type ChartPoint } from '../components/charts/AreaLineChart';
import { timeAgo } from '../lib/formatters';

// ---- types ----
interface Account {
  accountId: number; name: string; lastFour: string | null; type: string;
  institution: string | null; owner: string; owners: { id: number; displayName: string }[];
  isShared: boolean; classification: string; balance: number; date: string; lastUpdated: string | null;
  logoUrl?: string | null; institutionColor?: string | null;
}
interface Asset {
  id: number; name: string; purchaseDate: string; cost: number; lifespanYears: number;
  salvageValue: number; depreciationMethod: 'straight_line' | 'declining_balance';
  decliningRate: number | null; currentValue: number;
}
interface NetWorthData {
  liquidTotal: number; investmentTotal: number; liabilityTotal: number;
  physicalAssetTotal: number; netWorth: number; accounts: Account[]; assets: Asset[];
}
interface HistoryPoint {
  date: string; netWorth: number; liquid: number; investment: number; liability: number; physical: number; assets: number;
}

// ---- helpers ----
const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SUBTYPE: Record<string, string> = {
  checking: 'Checking', savings: 'Savings', credit: 'Credit Card', investment: 'Brokerage',
  retirement: 'Retirement', venmo: 'Venmo', cash: 'Cash',
};
const RANGES: { key: string; label: string }[] = [
  { key: '1m', label: '1 month' }, { key: '3m', label: '3 months' }, { key: '6m', label: '6 months' },
  { key: '1y', label: '1 year' }, { key: 'all', label: 'All time' },
];
const PERF: { key: 'netWorth' | 'assets' | 'liability'; label: string }[] = [
  { key: 'netWorth', label: 'Net worth' }, { key: 'assets', label: 'Assets' }, { key: 'liability', label: 'Liabilities' },
];
const GROUPS: { key: string; name: string; color: string }[] = [
  { key: 'liquid', name: 'Liquid', color: 'var(--positive)' },
  { key: 'investment', name: 'Investments', color: 'var(--c-teal)' },
  { key: 'liability', name: 'Liabilities', color: 'var(--negative)' },
];

// Client mirror of server depreciation (for the modal live preview).
function depreciate(cost: number, salvage: number, purchaseDate: string, method: string, rate: number, life: number): { value: number; years: number } {
  const years = Math.max(0, (Date.now() - new Date(purchaseDate).getTime()) / (365.25 * 864e5));
  if (method === 'declining_balance') return { value: Math.max(salvage, cost * Math.pow(1 - rate / 100, years)), years };
  const annual = (cost - salvage) / (life || 1);
  return { value: Math.max(salvage, cost - annual * Math.min(years, life)), years };
}

const chkbox = (checked: boolean) => (
  <span className="w-[18px] h-[18px] shrink-0 rounded-[6px] border-[1.5px] flex items-center justify-center" style={{ borderColor: checked ? 'var(--primary)' : 'var(--line-strong)', background: checked ? 'var(--primary)' : 'transparent' }}>
    {checked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}
  </span>
);

export default function AccountsPage() {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<NetWorthData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [range, setRange] = useState('1m');
  const [perf, setPerf] = useState<'netWorth' | 'assets' | 'liability'>('netWorth');
  const [summaryMode, setSummaryMode] = useState<'totals' | 'percent'>('totals');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // account filter
  const [selected, setSelected] = useState<Set<number> | null>(null); // null = all
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<Set<number>>(new Set());
  const [filterSearch, setFilterSearch] = useState('');

  // asset modal
  const [assetModal, setAssetModal] = useState<Asset | 'new' | null>(null);
  const [af, setAf] = useState({ name: '', purchaseDate: '', cost: '', salvageValue: '', method: 'declining_balance' as 'straight_line' | 'declining_balance', rate: '20', life: '5' });

  // refresh (bank sync) + add-account modals
  const [showRefresh, setShowRefresh] = useState(false);
  const [hasSimplefin, setHasSimplefin] = useState(false);
  type SyncBal = { accountId: number; accountName: string; currentBalance: number; simplefinBalance: number; balanceDate: string; holdings?: unknown[] };
  const [syncBalances, setSyncBalances] = useState<SyncBal[]>([]);
  const [syncSel, setSyncSel] = useState<Set<number>>(new Set());
  const [syncLoading, setSyncLoading] = useState(false);

  const loadData = useCallback(async () => {
    const res = await apiFetch<{ data: NetWorthData }>('/networth/summary');
    setData(res.data);
  }, []);
  const loadHistory = useCallback(async (r: string, sel: Set<number> | null) => {
    const q = sel ? `&accountIds=${Array.from(sel).join(',')}` : '';
    const res = await apiFetch<{ data: { points: HistoryPoint[] } }>(`/networth/history?range=${r}${q}`);
    setHistory(res.data.points);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadHistory(range, selected); }, [range, selected, loadHistory]);
  useEffect(() => {
    apiFetch<{ data: { id: number }[] }>('/simplefin/connections').then((r) => setHasSimplefin(r.data.length > 0)).catch(() => {});
    apiFetch<{ data: { id: number }[] }>('/users').then((r) => {
      initOwnerSlots(r.data.map((u) => u.id));
    }).catch(() => {});
  }, []);

  // ---- derived ----
  const visibleAccounts = useMemo(
    () => (data ? data.accounts.filter((a) => !selected || selected.has(a.accountId)) : []),
    [data, selected]
  );
  const groupTotals = useMemo(() => {
    const t: Record<string, number> = { liquid: 0, investment: 0, liability: 0 };
    for (const a of visibleAccounts) {
      if (a.classification === 'liability') t.liability += Math.abs(a.balance);
      else t[a.classification] = (t[a.classification] ?? 0) + a.balance;
    }
    return t;
  }, [visibleAccounts]);

  const physicalTotal = data?.physicalAssetTotal ?? 0;
  const assetsTotal = groupTotals.liquid + groupTotals.investment + physicalTotal;
  const liabilitiesTotal = groupTotals.liability;
  const netWorth = assetsTotal - liabilitiesTotal;

  // change over the selected range (from history first vs last point)
  const change = useMemo(() => {
    if (history.length < 2) return { netWorth: 0, liquid: 0, investment: 0, liability: 0 };
    const a = history[0], b = history[history.length - 1];
    return { netWorth: b.netWorth - a.netWorth, liquid: b.liquid - a.liquid, investment: b.investment - a.investment, liability: b.liability - a.liability };
  }, [history]);

  const rangeLabel = RANGES.find((r) => r.key === range)?.label.toLowerCase() ?? range;
  const chartPoints: ChartPoint[] = history.map((p) => ({ date: p.date, value: p[perf] }));

  if (!data) return <Spinner />;

  // ---- filter popover handlers ----
  const openFilter = () => { setFilterDraft(new Set(selected ?? data.accounts.map((a) => a.accountId))); setFilterSearch(''); setFilterOpen(true); };
  const applyFilter = () => { setSelected(filterDraft.size === data.accounts.length ? null : new Set(filterDraft)); setFilterOpen(false); };
  const clearFilter = () => { setFilterDraft(new Set(data.accounts.map((a) => a.accountId))); };
  const toggleDraft = (id: number) => setFilterDraft((d) => { const n = new Set(d); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const filterActive = selected != null; // any subset (even empty) is an active filter
  const filterCount = selected ? selected.size : 0;

  // ---- asset modal ----
  const openAsset = (a: Asset | 'new') => {
    setAssetModal(a);
    if (a === 'new') setAf({ name: '', purchaseDate: new Date().toISOString().slice(0, 10), cost: '', salvageValue: '0', method: 'declining_balance', rate: '20', life: '5' });
    else setAf({ name: a.name, purchaseDate: a.purchaseDate, cost: String(a.cost), salvageValue: String(a.salvageValue), method: a.depreciationMethod, rate: a.decliningRate != null ? String(a.decliningRate) : '20', life: String(a.lifespanYears || 5) });
  };
  const saveAsset = async () => {
    const body = {
      name: af.name, purchaseDate: af.purchaseDate, cost: parseFloat(af.cost) || 0,
      salvageValue: parseFloat(af.salvageValue) || 0,
      lifespanYears: af.method === 'straight_line' ? parseInt(af.life) || 1 : 0,
      depreciationMethod: af.method,
      decliningRate: af.method === 'declining_balance' ? parseFloat(af.rate) || 0 : null,
    };
    try {
      if (assetModal === 'new') await apiFetch('/assets', { method: 'POST', body: JSON.stringify(body) });
      else if (assetModal) await apiFetch(`/assets/${assetModal.id}`, { method: 'PUT', body: JSON.stringify(body) });
      setAssetModal(null); addToast('Asset saved'); await loadData(); loadHistory(range, selected);
    } catch { addToast('Failed to save asset', 'error'); }
  };
  const deleteAsset = async () => {
    if (assetModal === 'new' || !assetModal) return;
    try { await apiFetch(`/assets/${assetModal.id}`, { method: 'DELETE' }); setAssetModal(null); addToast('Asset deleted'); await loadData(); loadHistory(range, selected); }
    catch { addToast('Failed to delete asset', 'error'); }
  };

  // ---- refresh (bank balances) ----
  const openRefresh = async () => {
    setShowRefresh(true); setSyncLoading(true);
    try {
      const res = await apiFetch<{ data: SyncBal[] }>('/simplefin/balances');
      setSyncBalances(res.data); setSyncSel(new Set(res.data.map((b) => b.accountId)));
    } catch (e) { addToast(e instanceof Error ? e.message : 'Failed to fetch balances', 'error'); }
    finally { setSyncLoading(false); }
  };
  const applyRefresh = async () => {
    const sel = syncBalances.filter((b) => syncSel.has(b.accountId));
    await apiFetch('/simplefin/commit', { method: 'POST', body: JSON.stringify({ transactions: [], balanceUpdates: sel.map((b) => ({ accountId: b.accountId, balance: b.simplefinBalance, date: b.balanceDate })), holdingsUpdates: [] }) });
    addToast(`Updated ${sel.length} balance${sel.length !== 1 ? 's' : ''}`); setShowRefresh(false); await loadData(); loadHistory(range, selected);
  };

  const canEdit = hasPermission('accounts.edit');
  const acctColor = (cls: string) => cls === 'liability' ? 'var(--negative)' : cls === 'investment' ? 'var(--c-teal)' : 'var(--c-blue)';

  const ChangeText = ({ v }: { v: number }) => (
    <span className="text-[13px] tabular-nums" style={{ color: v > 0 ? 'var(--positive)' : v < 0 ? 'var(--negative)' : 'var(--text-3)' }}>
      {signed(v)} <span className="text-content-3">{rangeLabel} change</span>
    </span>
  );

  const seg = (label: number, total: number) => summaryMode === 'percent' ? `${total ? Math.round((label / total) * 100) : 0}%` : money(label);

  return (
    <div className="pb-16">
      {/* top bar */}
      <div className="sticky top-0 z-20 -mt-4 md:-mt-7 -mx-4 md:-mx-8 px-4 md:px-8 py-4 mb-6 flex items-center justify-between gap-4 bg-bg border-b border-line">
        <h1 className="page-title text-[22px] font-extrabold text-content tracking-tight leading-tight m-0">Accounts</h1>
        <div className="flex items-center gap-2.5">
          {/* Filters */}
          <div className="relative">
            <button onClick={openFilter}
              className="flex items-center gap-2 h-10 px-4 rounded-[11px] bg-surface-2 border-2 text-sm font-semibold text-content"
              style={{ borderColor: filterOpen || filterActive ? 'var(--primary)' : 'var(--line-strong)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
              Filters
              {filterActive && <span className="min-w-5 h-5 px-1 inline-flex items-center justify-center rounded-full bg-primary text-on-primary text-[11px] font-bold">{filterCount}</span>}
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                <div className="absolute top-12 right-0 z-50 w-[360px] bg-elevated border border-line-strong rounded-[16px] shadow-md">
                  <div className="p-3 border-b border-line">
                    <input autoFocus value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Search accounts…" className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-line text-content text-sm outline-none" />
                  </div>
                  <div className="max-h-[340px] overflow-y-auto p-1.5">
                    <div onClick={() => setFilterDraft(filterDraft.size === data.accounts.length ? new Set() : new Set(data.accounts.map((a) => a.accountId)))} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-2 cursor-pointer text-sm font-semibold">
                      {chkbox(filterDraft.size === data.accounts.length)}Select all
                    </div>
                    {data.accounts.filter((a) => !filterSearch || a.name.toLowerCase().includes(filterSearch.toLowerCase())).map((a) => (
                      <div key={a.accountId} onClick={() => toggleDraft(a.accountId)} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-2 cursor-pointer text-sm">
                        {chkbox(filterDraft.has(a.accountId))}<span className="flex-1 truncate">{a.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-3 py-3 border-t border-line">
                    <button onClick={clearFilter} className="text-sm font-semibold text-primary">Clear</button>
                    <div className="flex gap-2">
                      <button onClick={() => setFilterOpen(false)} className="h-9 px-4 rounded-[10px] bg-surface-2 border border-line-strong text-sm font-semibold">Cancel</button>
                      <button onClick={applyFilter} className="h-9 px-4 rounded-[10px] bg-primary text-on-primary text-sm font-bold">Apply</button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          {hasSimplefin && (
            <button onClick={openRefresh} className="flex items-center gap-2 h-10 px-4 rounded-[11px] bg-surface-2 border border-line-strong text-sm font-semibold text-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
              Refresh all
            </button>
          )}
        </div>
      </div>

      {/* net worth card */}
      <div className="bg-surface border border-line rounded-card shadow-sm p-6 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wide text-content-3 mb-1">Net worth</div>
            <div className="text-[30px] font-extrabold tracking-tight tabular-nums leading-none">{money(netWorth)}</div>
            <div className="mt-1.5"><ChangeText v={change.netWorth} /></div>
          </div>
          <div className="flex items-center gap-2.5">
            <Dropdown value={perf} options={PERF} onChange={(k) => setPerf(k as typeof perf)} minWidth={130} />
            <Dropdown value={range} options={RANGES.map((r) => ({ key: r.key, label: r.label }))} onChange={setRange} minWidth={120} />
          </div>
        </div>
        <AreaLineChart points={chartPoints} height={240} formatValue={(n) => { const a = Math.abs(n); return a >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`; }} />
      </div>

      {/* two-column */}
      <div className="flex flex-wrap gap-5 items-start">
        {/* left: groups + assets */}
        <div className="flex-[2_1_460px] min-w-0 flex flex-col gap-5">
          {GROUPS.map((g) => {
            const rows = visibleAccounts.filter((a) => a.classification === g.key);
            if (rows.length === 0) return null;
            const isCollapsed = collapsed.has(g.key);
            const total = groupTotals[g.key];
            // For liabilities, paying down debt (magnitude ↓) is the "good" direction, so negate.
            const chg = g.key === 'liquid' ? change.liquid : g.key === 'investment' ? change.investment : -change.liability;
            return (
              <div key={g.key} className="bg-surface border border-line rounded-card shadow-sm overflow-hidden">
                <button onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-2/40">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.2" className="transition-transform" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}><path d="m6 9 6 6 6-6" /></svg>
                  <span className="text-[17px] font-extrabold">{g.name}</span>
                  <ChangeText v={chg} />
                  <span className="ml-auto text-[17px] font-extrabold tabular-nums">{money(total)}</span>
                </button>
                {!isCollapsed && rows.map((a) => (
                  <div key={a.accountId} onClick={() => navigate(`/accounts/${a.accountId}`)}
                    className="flex items-center gap-3.5 px-5 h-[74px] border-t border-line cursor-pointer hover:bg-surface-2/40">
                    <VendorAvatar name={a.institution || a.name} src={a.logoUrl || undefined} color={a.institutionColor || acctColor(a.classification)} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[15px] truncate">{a.name}{a.lastFour ? ` (…${a.lastFour})` : ''}</span>
                        {a.isShared ? <SharedBadge /> : a.owners[0] && <OwnerBadge user={a.owners[0]} />}
                      </div>
                      <div className="text-[13px] text-content-3">{a.institution ? `${a.institution} · ` : ''}{SUBTYPE[a.type] ?? a.type}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-[15px] tabular-nums">{money(a.classification === 'liability' ? -Math.abs(a.balance) : a.balance)}</div>
                      {a.lastUpdated && <div className="text-[12px] text-content-3">{timeAgo(a.lastUpdated)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* right: summary */}
        <div className="flex-[1_1_300px] min-w-[280px] md:sticky md:top-[76px]">
          <div className="bg-surface border border-line rounded-card shadow-sm p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[17px] font-extrabold">Summary</span>
              <SegmentedControl value={summaryMode} onChange={(v) => setSummaryMode(v)} options={[{ value: 'totals', label: 'Totals' }, { value: 'percent', label: 'Percent' }]} />
            </div>

            <div className="flex items-baseline justify-between mb-2.5">
              <span className="font-bold">Assets</span>
              <span className="font-extrabold tabular-nums">{money(assetsTotal)}</span>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-2 mb-3">
              <div style={{ width: `${assetsTotal ? (groupTotals.investment / assetsTotal) * 100 : 0}%`, background: 'var(--c-teal)' }} />
              <div style={{ width: `${assetsTotal ? (groupTotals.liquid / assetsTotal) * 100 : 0}%`, background: 'var(--positive)' }} />
              <div style={{ width: `${assetsTotal ? (physicalTotal / assetsTotal) * 100 : 0}%`, background: 'var(--c-amber)' }} />
            </div>
            {[
              { c: 'var(--c-teal)', label: 'Investments', v: groupTotals.investment },
              { c: 'var(--positive)', label: 'Liquid', v: groupTotals.liquid },
              { c: 'var(--c-amber)', label: 'Physical assets', v: physicalTotal },
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-2 py-1 text-sm">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.c }} />
                <span className="flex-1 text-content-2">{r.label}</span>
                <span className="tabular-nums font-semibold">{seg(r.v, assetsTotal)}</span>
              </div>
            ))}

            <div className="border-t border-line my-4" />

            <div className="flex items-baseline justify-between mb-2.5">
              <span className="font-bold">Liabilities</span>
              <span className="font-extrabold tabular-nums">{money(liabilitiesTotal)}</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden bg-surface-2 mb-3">
              <div className="h-full" style={{ width: liabilitiesTotal ? '100%' : '0%', background: 'var(--negative)' }} />
            </div>
            <div className="flex items-center gap-2 py-1 text-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: 'var(--negative)' }} />
              <span className="flex-1 text-content-2">Total liabilities</span>
              <span className="tabular-nums font-semibold">{seg(liabilitiesTotal, liabilitiesTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Physical Assets — full width (nothing flanks it on the right) */}
      <div className="mt-5 bg-surface border border-line rounded-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="text-[17px] font-extrabold">Physical Assets</span>
          <span className="ml-auto text-[17px] font-extrabold tabular-nums">{money(physicalTotal)}</span>
          {canEdit && <button onClick={() => openAsset('new')} className="h-8 px-3 rounded-lg bg-surface-2 border border-line-strong text-sm font-semibold">Add</button>}
        </div>
        {data.assets.length === 0 ? (
          <div className="px-5 pb-5 text-content-3 text-sm">No physical assets tracked.</div>
        ) : data.assets.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-5 h-[62px] border-t border-line">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[15px] truncate">{a.name}</div>
              <div className="font-mono text-[12px] text-content-3">Acquired {a.purchaseDate} · cost {money(a.cost)}</div>
            </div>
            <span className="text-[12px] font-semibold px-2 py-0.5 rounded-md shrink-0" style={{ background: 'color-mix(in srgb, var(--c-amber) 16%, transparent)', color: 'var(--c-amber)' }}>
              {a.depreciationMethod === 'declining_balance' ? `DB ${a.decliningRate}%` : `SL ${a.lifespanYears}y`}
            </span>
            <div className="w-28 text-right font-bold text-[15px] tabular-nums">{money(a.currentValue)}</div>
            {canEdit && (
              <button onClick={() => openAsset(a)} className="w-8 h-8 flex items-center justify-center rounded-lg text-content-2 hover:bg-surface-2 shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* asset edit modal */}
      {assetModal && (() => {
        const cost = parseFloat(af.cost) || 0, salv = parseFloat(af.salvageValue) || 0;
        const rate = parseFloat(af.rate) || 0, life = parseInt(af.life) || 1;
        const prev = af.purchaseDate ? depreciate(cost, salv, af.purchaseDate, af.method, rate, life) : { value: cost, years: 0 };
        return (
          <ResponsiveModal isOpen onClose={() => setAssetModal(null)} title={assetModal === 'new' ? 'Add asset' : 'Edit depreciation'}>
            <div className="flex flex-col gap-4 p-1">
              <div>
                <label className="block text-[13px] font-semibold text-content-2 mb-1.5">Name</label>
                <input value={af.name} onChange={(e) => setAf({ ...af, name: e.target.value })} className="w-full h-11 px-3.5 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-semibold text-content-2 mb-1.5">Acquired</label>
                  <input type="date" value={af.purchaseDate} onChange={(e) => setAf({ ...af, purchaseDate: e.target.value })} className="w-full h-11 px-3.5 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-content-2 mb-1.5">Cost</label>
                  <CurrencyInput value={af.cost} onChange={(v) => setAf({ ...af, cost: v })} />
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-content-2 mb-1.5">Salvage value</label>
                <CurrencyInput value={af.salvageValue} onChange={(v) => setAf({ ...af, salvageValue: v })} />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-content-2 mb-2">Method</label>
                <SegmentedControl value={af.method} onChange={(v) => setAf({ ...af, method: v })} options={[{ value: 'declining_balance', label: 'Declining balance' }, { value: 'straight_line', label: 'Straight line' }]} />
              </div>
              {af.method === 'declining_balance' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5"><label className="text-[13px] font-semibold text-content-2">Annual rate</label><span className="tabular-nums font-bold">{rate}%</span></div>
                  <input type="range" min={5} max={60} step={1} value={af.rate} onChange={(e) => setAf({ ...af, rate: e.target.value })} className="w-full accent-[var(--primary)]" />
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1.5"><label className="text-[13px] font-semibold text-content-2">Useful life</label><span className="tabular-nums font-bold">{life} yrs</span></div>
                  <input type="range" min={1} max={30} step={1} value={af.life} onChange={(e) => setAf({ ...af, life: e.target.value })} className="w-full accent-[var(--primary)]" />
                </div>
              )}
              <div className="rounded-[12px] bg-surface-2 border border-line px-4 py-3">
                <div className="text-[11px] font-mono uppercase tracking-wide text-content-3 mb-1">Current value</div>
                <div className="text-[26px] font-extrabold tabular-nums leading-none">{money(prev.value)}</div>
                <div className="text-[12px] text-content-3 mt-1">after {prev.years.toFixed(1)} yrs</div>
              </div>
              <div className="flex items-center gap-2.5 pt-1">
                {assetModal !== 'new' && <button onClick={deleteAsset} className="h-11 px-4 rounded-[11px] font-bold text-sm" style={{ color: 'var(--negative)', border: '1px solid color-mix(in srgb, var(--negative) 40%, var(--line))' }}>Delete</button>}
                <button onClick={() => setAssetModal(null)} className="ml-auto h-11 px-4 rounded-[11px] bg-surface-2 border border-line-strong font-semibold text-sm">Cancel</button>
                <button onClick={saveAsset} disabled={!af.name || !af.purchaseDate} className="h-11 px-5 rounded-[11px] bg-primary text-on-primary font-bold text-sm disabled:opacity-50">Save changes</button>
              </div>
            </div>
          </ResponsiveModal>
        );
      })()}

      {/* refresh (bank balances) modal */}
      {showRefresh && (
        <ResponsiveModal isOpen onClose={() => setShowRefresh(false)} title="Refresh balances">
          {syncLoading ? <div className="py-8"><Spinner /></div> : syncBalances.length === 0 ? (
            <div className="py-6 text-center text-content-3 text-sm">No balances available from your linked banks.</div>
          ) : (
            <div className="flex flex-col gap-1 p-1">
              {syncBalances.map((b) => (
                <div key={b.accountId} onClick={() => setSyncSel((s) => { const n = new Set(s); if (n.has(b.accountId)) n.delete(b.accountId); else n.add(b.accountId); return n; })}
                  className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-surface-2 cursor-pointer">
                  {chkbox(syncSel.has(b.accountId))}
                  <span className="flex-1 truncate text-sm font-medium">{b.accountName}</span>
                  <span className="text-sm text-content-3 tabular-nums">{money(b.currentBalance)}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  <span className="text-sm font-semibold tabular-nums">{money(b.simplefinBalance)}</span>
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-3">
                <button onClick={() => setShowRefresh(false)} className="h-10 px-4 rounded-[11px] bg-surface-2 border border-line-strong font-semibold text-sm">Cancel</button>
                <button onClick={applyRefresh} disabled={syncSel.size === 0} className="h-10 px-4 rounded-[11px] bg-primary text-on-primary font-bold text-sm disabled:opacity-50">Apply {syncSel.size} update{syncSel.size !== 1 ? 's' : ''}</button>
              </div>
            </div>
          )}
        </ResponsiveModal>
      )}

    </div>
  );
}
