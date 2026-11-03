import { formatMoney } from '@ledger/shared';
import DonutChart, { type DonutSegment } from '../charts/DonutChart';

export interface AllocationGroup {
  assetClass: string;
  value: number;
  weightPct: number;
}

// Design order: teal + violet first, then the remaining --c-* tokens.
const ALLOC_COLORS = ['var(--c-teal)', 'var(--c-violet)', 'var(--c-blue)', 'var(--c-indigo)', 'var(--c-green)', 'var(--c-fuchsia)', 'var(--c-orange)', 'var(--c-amber)', 'var(--c-rose)'];

const balance = (n: number) => formatMoney(n, { kind: 'balance', showZero: true }).text;

/** Allocation tab: asset-class donut + Asset class / Percent / Value table. */
export default function AllocationView({ groups, totalValue }: { groups: AllocationGroup[]; totalValue: number }) {
  const segments: DonutSegment[] = groups.map((g, i) => ({ label: g.assetClass, value: g.value, color: ALLOC_COLORS[i % ALLOC_COLORS.length] }));
  return (
    <div className="grid lg:grid-cols-2 gap-10 items-center border-t border-line px-[26px] pt-2 pb-[34px]">
      <div className="flex justify-center">
        <DonutChart segments={segments} size={280} thickness={30} centerLabel="Total value" centerValue={balance(totalValue)} formatValue={balance} />
      </div>
      <div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-10 pb-3.5 border-b border-line text-[14px] text-content-3">
          <span>Asset class</span>
          <span className="text-right">Percent</span>
          <span className="text-right">Value</span>
        </div>
        {groups.map((g, i) => (
          <div key={g.assetClass} className="grid grid-cols-[1fr_auto_auto] gap-x-10 py-[18px] border-b border-line items-center text-[16px]">
            <span className="flex items-center gap-[11px] font-semibold">
              <span className="w-[11px] h-[11px] shrink-0 rounded-full" style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
              {g.assetClass}
            </span>
            <span className="text-right tabular-nums text-content-2">{g.weightPct.toFixed(1)}%</span>
            <span className="text-right tabular-nums font-semibold">{balance(g.value)}</span>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-10 pt-[18px] items-center text-[16px] font-bold">
          <span>Total</span>
          <span className="text-right tabular-nums">100.0%</span>
          <span className="text-right tabular-nums">{balance(totalValue)}</span>
        </div>
      </div>
    </div>
  );
}
