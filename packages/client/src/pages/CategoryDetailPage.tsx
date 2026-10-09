import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { scopeTxnsToCategory, type ScopeLeg } from '../lib/categoryScope';
import { formatMoney } from '@ledger/shared';
import { Money } from '../components/Money';
import { getCategoryEmoji, getCategoryColorVar, useCategoryEmojis } from '../lib/categoryMeta';
import PageHeader from '../components/PageHeader';
import { ListRow } from '../components/ListRow';
import { useIsMobile } from '../hooks/useIsMobile';
import { SegmentedControl, VendorAvatar } from '../components/primitives';
import Spinner from '../components/Spinner';

// ── Types (mirror GET /api/budgets/category-detail + GET /api/transactions) ──
interface SeriesPoint { month: string; actual: number }
interface CategoryDetail {
  category: { groupName: string; subName: string | null; displayName: string; type: string };
  plannedPerMonth: number;
  series: SeriesPoint[];
}
interface Txn {
  id: number;
  date: string;
  description: string | null;
  amount: number;
  merchant: { id: number; name: string; logoUrl?: string | null } | null;
  account: { id: number; name: string; lastFour: string | null; logoUrl?: string | null; color?: string | null } | null;
  category: { id: number; groupName: string; subName: string; displayName: string; type: string } | null;
  splits?: ScopeLeg[] | null;
}

type Period = 'month' | 'quarter' | 'year';

const MSHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MFULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Deterministic vendor-avatar hue (matches the design's per-vendor coloring).
const HUES = ['--c-teal', '--c-green', '--c-blue', '--c-indigo', '--c-violet', '--c-fuchsia', '--c-rose', '--c-orange', '--c-amber'];
const hueOf = (name: string) => `var(${HUES[(name.charCodeAt(0) || 0) % HUES.length]})`;

const parseYm = (ym: string) => { const [y, m] = ym.split('-').map(Number); return { y, m: m - 1 }; };
const lastDayOf = (ym: string) => { const { y, m } = parseYm(ym); return `${ym}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`; };
// Budget tile figures: plain whole dollars, "$0" at zero (as before).
const wholeDollars = (v: number) => formatMoney(v, { kind: 'balance', precision: 'whole', showZero: true }).text;
const axis = (v: number) => formatMoney(v, { kind: 'balance', precision: 'axis' }).text;

interface Bucket {
  monthIdx: number[];
  barLabel: string;
  periodLabel: string;
  yearLabel: string;
  total: number;
  startMonth: string;
  endMonth: string;
}

function buildBuckets(series: SeriesPoint[], period: Period): Bucket[] {
  if (series.length === 0) return [];
  if (period === 'month') {
    return series.map((p, i) => {
      const { y, m } = parseYm(p.month);
      return { monthIdx: [i], barLabel: MSHORT[m], periodLabel: `${MFULL[m]} ${y}`, yearLabel: String(y), total: p.actual, startMonth: p.month, endMonth: p.month };
    });
  }
  const map = new Map<string, Bucket>();
  const order: string[] = [];
  series.forEach((p, i) => {
    const { y, m } = parseYm(p.month);
    let key: string;
    let base: Omit<Bucket, 'total' | 'monthIdx' | 'startMonth' | 'endMonth'>;
    if (period === 'quarter') {
      const q = Math.floor(m / 3);
      key = `${y}-${q}`;
      base = { barLabel: `Q${q + 1}`, periodLabel: `Q${q + 1} ${y}`, yearLabel: String(y) };
    } else {
      key = String(y);
      base = { barLabel: String(y), periodLabel: String(y), yearLabel: String(y) };
    }
    let b = map.get(key);
    if (!b) { b = { ...base, monthIdx: [], total: 0, startMonth: p.month, endMonth: p.month }; map.set(key, b); order.push(key); }
    b.monthIdx.push(i);
    b.total += p.actual;
    b.endMonth = p.month; // series is chronological
  });
  return order.map((k) => map.get(k)!);
}

export default function CategoryDetailPage() {
  useCategoryEmojis(); // re-render when stored category emojis load/change
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const categoryId = searchParams.get('categoryId');
  const group = searchParams.get('group');
  const type = searchParams.get('type');

  const [detail, setDetail] = useState<CategoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriodState] = useState<Period>('month');
  const isMobile = useIsMobile();
  const yAxisW = isMobile ? 44 : 56;
  const [sel, setSel] = useState<number | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [txnsLoading, setTxnsLoading] = useState(false);

  const TXN_LIMIT = 1000;

  const detailQuery = useMemo(() => {
    if (categoryId) return `categoryId=${encodeURIComponent(categoryId)}`;
    if (group) return `group=${encodeURIComponent(group)}${type ? `&type=${encodeURIComponent(type)}` : ''}`;
    return null;
  }, [categoryId, group, type]);

  // ── Load the category series ──
  useEffect(() => {
    if (!detailQuery) { setError('No category specified'); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<{ data: CategoryDetail }>(`/budgets/category-detail?${detailQuery}`)
      .then((r) => { if (!cancelled) { setDetail(r.data); setSel(null); } })
      .catch(() => { if (!cancelled) setError('Failed to load category'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [detailQuery]);

  const cfg = detail?.category;
  const isIncome = cfg?.type === 'income';
  const catColor = !cfg ? 'var(--primary)' : isIncome ? 'var(--positive)' : getCategoryColorVar(cfg.groupName);
  const catEmoji = cfg ? getCategoryEmoji(cfg.subName ?? cfg.groupName) : '🏷️';
  const catName = cfg ? (cfg.subName ?? cfg.groupName) : '';

  const buckets = useMemo(() => (detail ? buildBuckets(detail.series, period) : []), [detail, period]);

  // Default selection = the bucket containing the current month, else the last.
  const defaultSel = useMemo(() => {
    if (!detail || buckets.length === 0) return 0;
    const now = new Date();
    const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const seriesIdx = detail.series.findIndex((p) => p.month === curYm);
    if (seriesIdx >= 0) {
      const bi = buckets.findIndex((b) => b.monthIdx.includes(seriesIdx));
      if (bi >= 0) return bi;
    }
    return buckets.length - 1;
  }, [detail, buckets]);

  const selIdx = sel != null && sel < buckets.length ? sel : defaultSel;
  const selBucket = buckets[selIdx];

  const setPeriod = useCallback((p: string) => { setPeriodState(p as Period); setSel(null); }, []);

  // ── Load transactions for the selected bucket ──
  const bucketKey = selBucket ? `${selBucket.startMonth}:${selBucket.endMonth}` : '';
  useEffect(() => {
    if (!selBucket || !detailQuery) return;
    let cancelled = false;
    setTxnsLoading(true);
    const qs = new URLSearchParams();
    qs.set('startDate', `${selBucket.startMonth}-01`);
    qs.set('endDate', lastDayOf(selBucket.endMonth));
    qs.set('limit', String(TXN_LIMIT));
    if (categoryId) qs.set('categoryId', categoryId);
    else if (group) { qs.set('groupName', group); if (type) qs.set('type', type); }
    const scope = categoryId ? { categoryIds: [Number(categoryId)] } : group ? { groupNames: [group] } : {};
    apiFetch<{ data: Txn[]; total: number }>(`/transactions?${qs.toString()}`)
      .then((r) => { if (!cancelled) { setTxns(scopeTxnsToCategory(r.data, scope)); setTxnTotal(r.total ?? r.data.length); } })
      .catch(() => { if (!cancelled) { setTxns([]); setTxnTotal(0); } })
      .finally(() => { if (!cancelled) setTxnsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketKey, detailQuery]);

  // ── Chart derivations ──
  const chart = useMemo(() => {
    const maxV = Math.max(1, ...buckets.map((b) => b.total));
    const top = maxV * 1.08;
    const ticks = [0, 1 / 3, 2 / 3, 1].map((frac) => ({ bottom: `${(frac * 100).toFixed(1)}%`, label: axis(top * frac) }));
    const bars = buckets.map((b, i) => ({
      barLabel: b.barLabel,
      value: axis(b.total),
      selected: i === selIdx,
      height: `${Math.max((b.total / top) * 100, 1.5).toFixed(2)}%`,
    }));
    // Year bands (consecutive buckets sharing a year).
    const bands: { label: string; count: number }[] = [];
    buckets.forEach((b) => {
      const last = bands[bands.length - 1];
      if (last && last.label === b.yearLabel) last.count++;
      else bands.push({ label: b.yearLabel, count: 1 });
    });
    return { ticks, bars, bands };
  }, [buckets, selIdx]);

  // ── Transaction list grouped by day + summary ──
  const { days, summary } = useMemo(() => {
    const ctype = cfg?.type ?? 'expense';
    const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date));
    const groups: { key: string; label: string; rawTotal: number; rows: Txn[] }[] = [];
    for (const t of sorted) {
      let g = groups.find((x) => x.key === t.date);
      if (!g) {
        const { y, m } = parseYm(t.date.slice(0, 7));
        const day = Number(t.date.slice(8, 10));
        g = { key: t.date, label: `${MFULL[m]} ${day}, ${y}`, rawTotal: 0, rows: [] };
        groups.push(g);
      }
      g.rawTotal += t.amount;
      g.rows.push(t);
    }
    const n = txns.length;
    const rawTotal = txns.reduce((s, t) => s + t.amount, 0);
    const avg = n ? rawTotal / n : 0;
    // Largest by magnitude, keeping its stored sign for correct coloring.
    const largest = n ? txns.reduce((a, t) => (Math.abs(t.amount) > Math.abs(a) ? t.amount : a), txns[0].amount) : 0;
    return {
      days: groups.map((g) => ({ label: g.label, total: g.rawTotal, rows: g.rows })),
      summary: { count: n, avg, largest, total: rawTotal, transfer: ctype === 'transfer' },
    };
  }, [txns, cfg]);

  // ── Budget card figures ──
  const budget = useMemo(() => {
    if (!detail || !selBucket) return null;
    const planned = detail.plannedPerMonth * selBucket.monthIdx.length;
    const actual = selBucket.total;
    let thirdLabel: string, thirdVal: string, thirdNeg = false;
    if (isIncome) {
      const over = actual - planned;
      if (over >= 0) { thirdLabel = 'Over plan'; thirdVal = wholeDollars(over); }
      else { thirdLabel = 'Under plan'; thirdVal = wholeDollars(-over); thirdNeg = true; }
    } else {
      const rem = planned - actual;
      if (rem >= 0) { thirdLabel = 'Remaining'; thirdVal = wholeDollars(rem); }
      else { thirdLabel = 'Over budget'; thirdVal = wholeDollars(-rem); thirdNeg = true; }
    }
    return { planned: wholeDollars(planned), actual: wholeDollars(actual), thirdLabel, thirdVal, thirdNeg };
  }, [detail, selBucket, isIncome]);

  // ── Render ──
  if (loading) {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }
  if (error || !detail || !cfg) {
    return (
      <div className="text-center py-24 text-content-3">
        <p className="mb-4">{error ?? 'Category not found.'}</p>
        <button onClick={() => navigate('/budget')} className="h-10 px-4 rounded-[11px] bg-surface border border-line-strong text-content font-semibold text-sm hover:bg-surface-2">Back to budget</button>
      </div>
    );
  }

  return (
    <div>
      {/* Sticky breadcrumb bar */}
      <PageHeader mobileTitle={`${catEmoji} ${catName}`} mobileBack="/budget" left={!isMobile && (
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={() => navigate('/budget')} className="text-xl font-bold text-content-3 hover:text-content transition-colors shrink-0">Budget</button>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="m9 6 6 6-6 6" /></svg>
            <span className="w-[30px] h-[30px] shrink-0 rounded-[8px] bg-surface-2 border border-line flex items-center justify-center text-[15px] leading-none">{catEmoji}</span>
            <span className="text-xl font-extrabold tracking-tight truncate">{catName}</span>
          </div>
        )} right={
          <SegmentedControl value={period} onChange={setPeriod}
            options={[{ value: 'month', label: 'Monthly' }, { value: 'quarter', label: 'Quarterly' }, { value: 'year', label: 'Yearly' }]} />
        } />

      {/* Chart card */}
      <div className="border border-line rounded-card bg-surface shadow-sm mb-6 md:mb-[30px] pt-4 px-3 pb-3.5 md:pt-[22px] md:px-7 md:pb-[18px]">
        {/* Year bands */}
        <div className="flex" style={{ paddingLeft: yAxisW, marginBottom: 10 }}>
          {chart.bands.map((band, i) => (
            <div key={`${band.label}-${i}`} className="font-mono text-[11px] text-content-3" style={{ flex: band.count, paddingLeft: 10, borderLeft: '1px solid var(--line)', letterSpacing: '.05em' }}>{band.label}</div>
          ))}
        </div>
        {/* Plot */}
        <div className="flex" style={{ height: isMobile ? 220 : 290 }}>
          <div className="relative shrink-0" style={{ width: yAxisW }}>
            {chart.ticks.map((t, i) => (
              <div key={i} className="absolute font-mono text-[11px] text-content-3" style={{ right: 12, bottom: t.bottom, transform: 'translateY(50%)' }}>{t.label}</div>
            ))}
          </div>
          <div className="relative" style={{ flex: 1 }}>
            {chart.ticks.map((t, i) => (
              <div key={i} className="absolute" style={{ left: 0, right: 0, bottom: t.bottom, height: 1, background: 'var(--line)' }} />
            ))}
            <div className="absolute flex items-end" style={{ inset: 0, gap: 4 }}>
              {chart.bars.map((b, i) => (
                <div key={i} onClick={() => setSel(i)} className="relative cursor-pointer" title={`${buckets[i].periodLabel}: ${b.value}`}
                  style={{ flex: 1, minWidth: 0, height: b.height, borderRadius: '4px 4px 0 0', transition: 'background .12s', background: b.selected ? catColor : `color-mix(in srgb, ${catColor} 34%, var(--surface-2))` }}>
                  {b.selected && (
                    <div className="absolute font-bold text-[12px] tabular-nums whitespace-nowrap" style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 7, padding: '3px 9px', borderRadius: 7, background: 'var(--elevated)', border: '1px solid var(--line-strong)', boxShadow: 'var(--shadow-sm)', color: catColor }}>{b.value}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* X labels */}
        {/* Phones can't fit a label under every bar: keep every 3rd plus the selected one. */}
        <div className="flex" style={{ paddingLeft: yAxisW, marginTop: 9, gap: 4 }}>
          {chart.bars.map((b, i) => (
            <div key={i} className="text-center text-[11px] whitespace-nowrap overflow-visible" style={{ flex: 1, minWidth: 0, color: b.selected ? 'var(--text)' : 'var(--text-3)', fontWeight: b.selected ? 700 : 500 }}>
              {!isMobile || chart.bars.length <= 6 || b.selected || (i % 3 === 0 && !chart.bars[i + 1]?.selected && !chart.bars[i - 1]?.selected) ? b.barLabel : ''}
            </div>
          ))}
        </div>
      </div>

      {/* Period heading */}
      <div className="text-[22px] md:text-[26px] font-extrabold mb-4 md:mb-[18px]" style={{ letterSpacing: '-.02em' }}>{selBucket?.periodLabel}</div>

      <div className="grid gap-[22px] items-start grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Transactions */}
        <div className="border border-line rounded-card bg-surface overflow-hidden shadow-sm">
          <div className="text-[17px] font-bold px-4 md:px-6 pt-4 md:pt-5 pb-3 md:pb-4">Transactions</div>
          {txnsLoading ? (
            <div className="flex justify-center py-12 border-t border-line"><Spinner /></div>
          ) : days.length === 0 ? (
            <div className="text-center text-sm text-content-3 border-t border-line" style={{ padding: '44px 24px' }}>No transactions in this period.</div>
          ) : <>
            {txns.length < txnTotal && (
              <div className="text-[13px] text-content-2 border-t border-line" style={{ padding: '11px 24px', background: 'color-mix(in srgb, var(--warning) 12%, var(--surface-2))' }}>
                Showing the {txns.length.toLocaleString()} most recent of {txnTotal.toLocaleString()} transactions — the Summary below reflects only these.
              </div>
            )}
            {days.map((d) => (
            <div key={d.label}>
              <div className="flex items-center justify-between bg-surface-2 border-t border-b border-line px-4 md:px-6 py-2 md:py-[11px]">
                <span className="text-[13px] font-semibold text-content-2">{d.label}</span>
                <Money amount={d.total} transfer={summary.transfer} className="text-[13px] font-semibold" />
              </div>
              {d.rows.map((t) => {
                const vendor = t.merchant?.name || t.description || '—';
                const hue = hueOf(vendor);
                const subName = t.category?.subName ?? 'Uncategorized';
                const amt = <Money amount={t.amount} transfer={(t.category?.type ?? cfg.type) === 'transfer'} />;
                if (isMobile) {
                  return (
                    <ListRow key={t.id}
                      avatar={{ name: vendor, src: t.merchant?.logoUrl, color: t.merchant?.logoUrl ? undefined : hue, size: 34 }}
                      title={vendor}
                      subtitle={<><span className="shrink-0 text-[13px] leading-none">{getCategoryEmoji(subName)}</span><span className="truncate">{subName}</span></>}
                      amount={amt}
                      meta={t.account ? <span className="font-mono">{t.account.name}{t.account.lastFour ? ` (…${t.account.lastFour})` : ''}</span> : undefined}
                      className="border-t-0 border-b" />
                  );
                }
                return (
                  <div key={t.id} className="grid items-center border-b border-line" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr) minmax(0,1.3fr) minmax(max-content,0.7fr)', gap: 16, padding: '13px 24px' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <VendorAvatar name={vendor} src={t.merchant?.logoUrl || undefined} color={t.merchant?.logoUrl ? undefined : hue} size={32} />
                      <span className="font-semibold text-[15px] truncate">{vendor}</span>
                    </div>
                    <div className="flex items-center gap-2 text-content-2 text-sm min-w-0">
                      <span className="text-[15px] leading-none shrink-0">{getCategoryEmoji(subName)}</span>
                      <span className="truncate">{subName}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-content-2 text-[13px] min-w-0">
                      {t.account && <VendorAvatar name={t.account.name} src={t.account.logoUrl || undefined} color={t.account.color || 'var(--c-blue)'} size={16} />}
                      <span className="font-mono truncate">{t.account ? `${t.account.name}${t.account.lastFour ? ` (…${t.account.lastFour})` : ''}` : '—'}</span>
                    </div>
                    <div className="flex items-center justify-end">
                      <span className="font-bold text-[15px]">{amt}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            ))}
          </>}
        </div>

        {/* Right column */}
        <div className="sticky flex flex-col gap-[18px]" style={{ top: 88 }}>
          {/* Budget card */}
          <div className="border border-line rounded-card bg-surface overflow-hidden shadow-sm">
            <div className="text-[17px] font-bold" style={{ padding: '20px 24px 4px' }}>Budget</div>
            <div className="text-[13px] text-content-3" style={{ padding: '0 24px 16px' }}>{selBucket?.periodLabel}</div>
            <div className="flex items-center justify-between border-t border-line" style={{ padding: '15px 24px' }}>
              <span className="text-sm text-content-2">Planned</span>
              <span className="text-[15px] font-semibold tabular-nums">{budget?.planned}</span>
            </div>
            <div className="flex items-center justify-between border-t border-line" style={{ padding: '15px 24px' }}>
              <span className="text-sm text-content-2">Actual</span>
              <span className="text-[15px] font-semibold tabular-nums">{budget?.actual}</span>
            </div>
            <div className="flex items-center justify-between border-t border-line" style={{ padding: '15px 24px' }}>
              <span className="text-sm text-content-2">{budget?.thirdLabel}</span>
              <span className="text-[15px] font-bold tabular-nums" style={{ color: budget?.thirdNeg ? 'var(--negative)' : 'var(--positive)' }}>{budget?.thirdVal}</span>
            </div>
          </div>

          {/* Summary card */}
          <div className="border border-line rounded-card bg-surface overflow-hidden shadow-sm">
            <div className="text-[17px] font-bold" style={{ padding: '20px 24px 16px' }}>Summary</div>
            <div className="flex items-center justify-between border-t border-line" style={{ padding: '15px 24px' }}>
              <span className="text-sm text-content-2">Total transactions</span>
              <span className="text-[15px] font-semibold tabular-nums">{summary.count}</span>
            </div>
            <div className="flex items-center justify-between border-t border-line" style={{ padding: '15px 24px' }}>
              <span className="text-sm text-content-2">Average transaction</span>
              <Money amount={summary.avg} transfer={summary.transfer} className="text-[15px] font-semibold" />
            </div>
            <div className="flex items-center justify-between border-t border-line" style={{ padding: '15px 24px' }}>
              <span className="text-sm text-content-2">Largest transaction</span>
              <Money amount={summary.largest} transfer={summary.transfer} className="text-[15px] font-semibold" />
            </div>
            <div className="flex items-center justify-between border-t border-line" style={{ padding: '15px 24px' }}>
              <span className="text-sm text-content-2">Total amount</span>
              <Money amount={summary.total} transfer={summary.transfer} className="text-[15px] font-bold" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
