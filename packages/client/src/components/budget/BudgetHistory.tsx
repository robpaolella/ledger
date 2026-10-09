import { useEffect, useState } from 'react';
import { formatMoney } from '@ledger/shared';
import { apiFetch } from '../../lib/api';
import Spinner from '../Spinner';
import { buildHistory, monthBefore, type HistoryPoint } from './historyModel';

const whole = (n: number) => formatMoney(n, { kind: 'balance', precision: 'whole' }).text;

/** Editor "History": last month, monthly average and the six months before `targetMonth`. */
export default function BudgetHistory({ categoryId, targetMonth, income }: { categoryId: number; targetMonth: string; income: boolean }) {
  const [series, setSeries] = useState<HistoryPoint[] | null>(null);

  useEffect(() => {
    let live = true;
    setSeries(null);
    apiFetch<{ data: { series: HistoryPoint[] } }>(`/budgets/category-detail?categoryId=${categoryId}&end=${monthBefore(targetMonth)}`)
      .then((res) => { if (live) setSeries(res.data.series); })
      .catch(() => { if (live) setSeries([]); }); // a failed fetch reads as no history
    return () => { live = false; };
  }, [categoryId, targetMonth]);

  const h = buildHistory(series ?? []);
  const tiles = [
    { label: income ? 'Earned last month' : 'Spent last month', value: h.lastMonth },
    { label: 'Monthly average', value: h.average },
  ];

  return (
    <div className="mt-5">
      <div className="text-[12px] font-bold uppercase tracking-[0.05em] text-content-3 mb-[9px]">History</div>
      {series === null ? (
        <div className="h-[150px] flex items-center justify-center"><Spinner /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-[12px] bg-surface border border-line px-3.5 py-3">
                <div className="text-[12px] text-content-3">{t.label}</div>
                <div className="text-[18px] font-extrabold tabular-nums mt-0.5">{whole(t.value)}</div>
              </div>
            ))}
          </div>
          <div className="relative mt-3 flex items-end gap-2 h-[72px]">
            {(h.months.length ? h.months : Array.from({ length: 6 }, () => null)).map((m, i) => (
              <div key={m?.month ?? i} className="flex-1 min-w-0 h-full flex flex-col justify-end items-stretch gap-1.5" title={m ? `${m.label}: ${whole(m.value)}` : undefined}>
                <div className="flex-1 flex items-end border-b border-line">
                  <div className="w-full rounded-[5px]" style={{ height: `${(m?.height ?? 0) * 100}%`, minHeight: m && m.height > 0 ? 3 : 0, background: 'var(--primary)' }} />
                </div>
                <div className="text-center font-mono text-[10px] uppercase tracking-wide text-content-3 h-3">{m?.label}</div>
              </div>
            ))}
            {h.empty && (
              <span className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-surface-2 border border-line-strong px-3 py-1 text-[12px] font-semibold text-content-2">No history available</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
