import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Dropdown from '../components/Dropdown';
import { apiFetch } from '../lib/api';
import Spinner from '../components/Spinner';
import { SegmentedControl } from '../components/primitives';
import BenchmarkStrip, { type BenchmarkId } from '../components/investments/BenchmarkStrip';
import PerformanceChart, { type PerfSeries } from '../components/investments/PerformanceChart';
import AllocationView from '../components/investments/AllocationView';
import HoldingsTable, { type HoldingsGroup } from '../components/investments/HoldingsTable';

type RangeKey = '1M' | '3M' | '6M' | '1Y' | 'YTD';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '1M', label: '1 Month' },
  { key: '3M', label: '3 Months' },
  { key: '6M', label: '6 Months' },
  { key: '1Y', label: '1 Year' },
  { key: 'YTD', label: 'YTD' },
];

interface PerfBenchmark { id: BenchmarkId; name: string; symbol: string; series: number[]; rangePct: number | null; todayPct: number | null }
interface PerfData {
  range: string;
  dates: string[];
  portfolio: { series: number[]; rangePct: number | null; todayPct: number | null; currentValue: number } | null;
  benchmarks: PerfBenchmark[];
  backfilling: boolean;
}
interface HoldingsData {
  range: string;
  totalValue: number;
  total: { value: number; rangePct: number | null };
  groups: HoldingsGroup[];
}
interface AcctMeta { id: number; name: string; classification: string }


// "By asset class" — the only grouping offered, so it reads as a label, not a control.
const StaticControl = ({ label }: { label: string }) => (
  <div className="flex items-center h-10 px-3.5 rounded-[11px] bg-surface-2 border border-line text-sm font-semibold text-content-2 select-none">
    {label}
  </div>
);

const Notice = ({ children }: { children: ReactNode }) => (
  <div className="rounded-[11px] bg-surface-2 border border-line px-4 py-3 text-[13px] text-content-2 mb-4">{children}</div>
);

const chkbox = (checked: boolean) => (
  <span className="w-[18px] h-[18px] shrink-0 rounded-[6px] border-[1.5px] flex items-center justify-center" style={{ borderColor: checked ? 'var(--primary)' : 'var(--line-strong)', background: checked ? 'var(--primary)' : 'transparent' }}>
    {checked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--on-primary)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}
  </span>
);

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export default function InvestmentsPage() {
  const [range, setRange] = useState<RangeKey>('3M');
  const [tab, setTab] = useState<'market' | 'allocation'>('market');
  const [benchmark, setBenchmark] = useState<BenchmarkId>('sp500');
  // undefined = first load in flight; null = fetch failed
  const [perf, setPerf] = useState<PerfData | null | undefined>(undefined);
  const [holdings, setHoldings] = useState<HoldingsData | null | undefined>(undefined);
  const [accounts, setAccounts] = useState<AcctMeta[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  const rangeLabel = RANGE_OPTIONS.find((o) => o.key === range)!.label;
  const accountIdsParam = useMemo(() => [...selectedIds].sort((a, b) => a - b).join(','), [selectedIds]);

  useEffect(() => {
    apiFetch<{ data: AcctMeta[] }>('/accounts')
      .then((r) => setAccounts(r.data.filter((a) => a.classification === 'investment')))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const qs = `?range=${range}${accountIdsParam ? `&accountIds=${accountIdsParam}` : ''}`;
    apiFetch<{ data: PerfData }>(`/investments/performance${qs}`)
      .then((r) => { if (!cancelled) setPerf(r.data); })
      .catch(() => { if (!cancelled) setPerf(null); });
    apiFetch<{ data: HoldingsData }>(`/investments/holdings-blended${qs}`)
      .then((r) => { if (!cancelled) setHoldings(r.data); })
      .catch(() => { if (!cancelled) setHoldings(null); });
    return () => { cancelled = true; };
  }, [range, accountIdsParam]);

  const toggleAccount = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Portfolio (primary) + selected benchmark (violet); benchmark switch is client-side.
  const chartSeries = useMemo<PerfSeries[]>(() => {
    if (!perf) return [];
    const sel = perf.benchmarks.find((b) => b.id === benchmark);
    return [
      ...(perf.portfolio && perf.portfolio.series.length ? [{ name: 'Portfolio', color: 'var(--primary)', values: perf.portfolio.series }] : []),
      ...(sel && sel.series.length ? [{ name: sel.name, color: 'var(--c-violet)', values: sel.series }] : []),
    ];
  }, [perf, benchmark]);

  const exportCsv = () => {
    let csv: string;
    let name: string;
    if (tab === 'market') {
      if (!perf) return;
      const cols = [
        ...(perf.portfolio ? [{ label: 'Portfolio', series: perf.portfolio.series }] : []),
        ...perf.benchmarks.map((b) => ({ label: b.name, series: b.series })),
      ];
      const header = ['Date', ...cols.map((c) => csvCell(c.label))].join(',');
      const rows = perf.dates.map((d, i) => [d, ...cols.map((c) => c.series[i] ?? '')].join(','));
      csv = [header, ...rows].join('\n');
      name = `investments-market-${range}.csv`;
    } else {
      if (!holdings) return;
      const rows = holdings.groups.map((g) => [csvCell(g.assetClass), g.weightPct, g.value].join(','));
      csv = ['Asset class,Percent,Value', ...rows, `Total,100,${holdings.totalValue}`].join('\n');
      name = `investments-allocation-${range}.csv`;
    }
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (perf === undefined || holdings === undefined) return <Spinner />;

  const empty = holdings != null && holdings.groups.length === 0 && selectedIds.size === 0;

  return (
    <div className="pb-16">
      {/* top bar */}
      <div className="sticky top-0 z-20 -mt-4 md:-mt-7 -mx-4 md:-mx-8 px-4 md:px-8 py-4 mb-6 flex items-center justify-between gap-4 bg-bg border-b border-line">
        <div className="flex items-baseline gap-3">
          <h1 className="page-title text-[22px] font-extrabold text-content tracking-tight leading-tight m-0">Investments</h1>
          <span className="text-sm font-semibold text-primary border-b-2 border-primary pb-0.5">Holdings</span>
        </div>
        {accounts.length > 0 && (
          <div className="relative">
            <button onClick={() => setFilterOpen((o) => !o)}
              className="flex items-center gap-2 h-10 px-3.5 rounded-[11px] bg-surface-2 border text-sm font-semibold text-content"
              style={{ borderColor: filterOpen || selectedIds.size > 0 ? 'var(--primary)' : 'var(--line-strong)' }}>
              Accounts
              {selectedIds.size > 0 && <span className="min-w-5 h-5 px-1 inline-flex items-center justify-center rounded-full bg-primary text-on-primary text-[11px] font-bold">{selectedIds.size}</span>}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                <div className="absolute top-12 right-0 z-50 w-[300px] bg-elevated border border-line-strong rounded-[16px] shadow-md overflow-hidden">
                  <div className="max-h-[340px] overflow-y-auto p-1.5">
                    <div onClick={() => setSelectedIds(new Set())} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-2 cursor-pointer text-sm font-semibold">
                      {chkbox(selectedIds.size === 0)}All accounts
                    </div>
                    {accounts.map((a) => (
                      <div key={a.id} onClick={() => toggleAccount(a.id)} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-2 cursor-pointer text-sm">
                        {chkbox(selectedIds.has(a.id))}<span className="flex-1 truncate">{a.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {empty ? (
        <div className="bg-surface border border-line rounded-card shadow-sm p-12 text-center">
          <div className="text-[15px] font-semibold mb-1">No holdings yet</div>
          <p className="text-content-3 text-sm max-w-md mx-auto">Link an investment or retirement account in <span className="font-semibold text-content-2">Settings → Bank Sync</span>. Holdings sync automatically and appear here.</p>
        </div>
      ) : (
        <>
          {/* performance / allocation card */}
          <div className="bg-surface border border-line rounded-card shadow-sm overflow-hidden mb-6">
            <div className="flex items-center justify-between gap-4 px-[26px] pt-[22px] pb-[18px]">
              <div className="flex items-center gap-2.5">
                <span className="text-[19px] font-extrabold tracking-tight">{tab === 'market' ? 'Backtested performance' : 'Portfolio allocation'}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
              </div>
              <div className="flex items-center gap-3.5">
                <StaticControl label="By asset class" />
                <Dropdown value={range} options={RANGE_OPTIONS} onChange={(k) => setRange(k as RangeKey)} />
                <button onClick={exportCsv} title="Download CSV"
                  className="w-10 h-10 shrink-0 flex items-center justify-center bg-surface-2 border border-line rounded-[11px] text-content-2 hover:text-content">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
                </button>
              </div>
            </div>

            {/* tab pills */}
            <div className="flex items-center px-[26px] pb-[18px]">
              <SegmentedControl value={tab} onChange={(t) => setTab(t)} options={[{ value: 'market', label: 'Market' }, { value: 'allocation', label: 'Allocation' }]} />
            </div>

            {tab === 'market' ? (
              <div className="px-[26px] pb-[26px]">
                {perf === null ? (
                  <Notice>Performance data unavailable.</Notice>
                ) : (
                  <>
                    <BenchmarkStrip rangeLabel={rangeLabel} portfolio={perf.portfolio} benchmarks={perf.benchmarks} selected={benchmark} onSelect={setBenchmark} />
                    {perf.backfilling && <Notice>Benchmark data is still backfilling — returns will appear once history finishes loading.</Notice>}
                    <PerformanceChart dates={perf.dates} series={chartSeries} />
                  </>
                )}
              </div>
            ) : holdings === null ? (
              <div className="px-[26px] pb-[26px]"><Notice>Holdings data unavailable.</Notice></div>
            ) : (
              <AllocationView groups={holdings.groups} totalValue={holdings.totalValue} />
            )}
          </div>

          {/* holdings table */}
          {holdings === null ? (
            <div className="bg-surface border border-line rounded-card shadow-sm p-6">
              <Notice>Holdings data unavailable.</Notice>
            </div>
          ) : (
            <HoldingsTable
              groups={holdings.groups}
              total={holdings.total}
              rangeLabel={rangeLabel}
              controls={
                <>
                  <StaticControl label="By asset class" />
                  <Dropdown value={range} options={RANGE_OPTIONS} onChange={(k) => setRange(k as RangeKey)} />
                </>
              }
            />
          )}
        </>
      )}
    </div>
  );
}
