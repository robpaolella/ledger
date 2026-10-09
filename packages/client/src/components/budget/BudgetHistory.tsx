import { useEffect, useState } from 'react';
import { buildHistory, formatMoney, monthBefore, type HistoryPoint } from '@ledger/shared';
import { apiFetch } from '../../lib/api';
import Spinner from '../Spinner';

// A zero reads "$0" here (the shared balance format shows "—").
const whole = (n: number) => (Math.round(n) === 0 ? '$0' : formatMoney(n, { kind: 'balance', precision: 'whole' }).text);

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
        <div className="h-[222px] flex items-center justify-center"><Spinner inline /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-[12px] bg-surface-2 border border-line px-4 py-3.5">
                <div className="text-[20px] font-extrabold tabular-nums">{whole(t.value)}</div>
                <div className="text-[13px] text-content-3 mt-0.5">{t.label}</div>
              </div>
            ))}
          </div>
          <div className="relative mt-3 rounded-[12px] bg-surface-2 border border-line p-4">
            <div className="flex items-end gap-2.5 h-24">
              {(h.months.length ? h.months : Array.from({ length: 6 }, () => null)).map((m, i) => (
                <div key={m?.month ?? i} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-2" title={m ? `${m.label}: ${whole(m.value)}` : undefined}>
                  <div className="flex-1 w-full min-h-0 flex items-end justify-center">
                    <div className="w-full max-w-[26px] rounded-t-[5px]" style={{ height: `${(m?.height ?? 0) * 100}%`, minHeight: m && m.height > 0 ? 3 : 0, background: 'var(--primary)' }} />
                  </div>
                  <span className="font-mono text-[10px] text-content-3">{m?.label}</span>
                </div>
              ))}
            </div>
            {h.empty && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-elevated border border-line-strong px-4 py-2 text-[13px] font-semibold text-content-2">No history available</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
