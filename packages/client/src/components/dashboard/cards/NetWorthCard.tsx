import { useEffect, useRef, useState } from 'react';
import { useCachedApi } from '../useCachedApi';
import AreaLineChart, { type ChartPoint } from '../../charts/AreaLineChart';
import DashboardCard, { CardSection, CardSkeleton, CardError, CardHeaderControl } from '../DashboardCard';
import type { DashboardCardProps } from '../cardRegistry';

interface HistoryPoint { date: string; netWorth: number }

const RANGE_OPTIONS = [
  { value: '1m', label: '1 month' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All time' },
] as const;
type Range = typeof RANGE_OPTIONS[number]['value'];

const usd0 = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const usd2 = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kFmt = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`);

function RangeDropdown({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <CardHeaderControl onClick={() => setOpen((o) => !o)}>
        <span className="min-w-[92px] text-left">{RANGE_OPTIONS.find((o) => o.value === value)!.label}</span>
      </CardHeaderControl>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[160px] py-1 bg-elevated border border-line rounded-[12px] shadow-md overflow-hidden">
          {RANGE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2 text-sm font-semibold hover:bg-surface-2 ${o.value === value ? 'text-content' : 'text-content-2'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NetWorthCard({ dragHandleProps }: DashboardCardProps) {
  const [range, setRange] = useState<Range>('1m');
  // useCachedApi clears stale data on an uncached range change (skeleton, not
  // the previous range's points) and seeds instantly from cache otherwise.
  const { data, error } = useCachedApi<{ data: { points: HistoryPoint[] } }>(`/networth/history?range=${range}`);
  const points = data?.data.points ?? null;

  const last = points?.[points.length - 1];
  const delta = points && points.length > 1 ? points[points.length - 1].netWorth - points[0].netWorth : 0;
  const chart: ChartPoint[] = (points ?? []).map((p) => ({ date: p.date, value: p.netWorth }));

  return (
    <DashboardCard
      headline={
        <>
          <span className="text-[22px] font-extrabold tracking-[-0.01em] tabular-nums">
            {last ? `${usd0(last.netWorth)} net worth` : 'Net worth'}
          </span>
          {last && (
            <span
              className="text-[18px] font-semibold tabular-nums"
              style={{ color: delta > 0 ? 'var(--positive)' : delta < 0 ? 'var(--negative)' : 'var(--text-3)' }}
            >
              {usd2(delta)}
            </span>
          )}
        </>
      }
      headerRight={<RangeDropdown value={range} onChange={setRange} />}
      dragHandleProps={dragHandleProps}
    >
      {error && !points ? (
        <CardError message="Couldn't load net worth history." />
      ) : !points ? (
        <CardSkeleton lines={4} />
      ) : points.length < 2 ? (
        <CardSection className="px-6 py-[22px] text-sm text-content-3 text-center">Not enough history yet.</CardSection>
      ) : (
        <CardSection className="px-6 pt-[22px] pb-3">
          <AreaLineChart points={chart} height={220} formatValue={kFmt} highlightLast lastLabel="date" />
        </CardSection>
      )}
    </DashboardCard>
  );
}
