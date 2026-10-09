import { useMemo, useState, type ReactNode } from 'react';
import { formatMoney } from '@ledger/shared';

export interface HoldingRow {
  symbol: string;
  name: string;
  assetClass: string;
  price: number | null;
  quantity: number;
  value: number;
  weightPct: number;
  rangePct: number | null;
  todayPct: number | null;
}

export interface HoldingsGroup {
  assetClass: string;
  value: number;
  weightPct: number;
  holdings: HoldingRow[];
}

const PALETTE = ['var(--c-teal)', 'var(--c-blue)', 'var(--c-indigo)', 'var(--c-violet)', 'var(--c-fuchsia)', 'var(--c-green)', 'var(--c-orange)', 'var(--c-amber)', 'var(--c-rose)'];
const GRID = { gridTemplateColumns: '2.4fr 1fr 1.1fr 1.2fr 0.9fr 1.2fr' };

const balance = (n: number) => formatMoney(n, { kind: 'balance', showZero: true }).text;
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 });

function RangePill({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="inline-flex items-center h-7 px-[11px] rounded-full bg-surface-2 text-content-3 font-bold text-[13px]">—</span>;
  }
  const color = pct < 0 ? 'var(--negative)' : 'var(--positive)';
  return (
    <span
      className="inline-flex items-center gap-1 h-7 px-[11px] rounded-full font-bold text-[13px] tabular-nums"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        {pct < 0 ? <path d="M12 5v14M6 13l6 6 6-6" /> : <path d="M12 19V5M6 11l6-6 6 6" />}
      </svg>
      {pct.toFixed(2)}%
    </span>
  );
}

interface Props {
  groups: HoldingsGroup[];
  total: { value: number; rangePct: number | null };
  rangeLabel: string;      // e.g. "3 Months" — drives the "Past {range}" column
  controls?: ReactNode;    // header-right controls (shared range dropdown etc.)
}

/** Blended holdings card: one row per symbol, collapsible asset-class groups + TOTAL row. */
export default function HoldingsTable({ groups, total, rangeLabel, controls }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (assetClass: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(assetClass)) next.delete(assetClass); else next.add(assetClass);
    return next;
  });

  // Stable per-symbol dot color by flattened row order.
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    let i = 0;
    for (const g of groups) for (const h of g.holdings) { m.set(h.symbol, PALETTE[i % PALETTE.length]); i++; }
    return m;
  }, [groups]);

  return (
    <div className="bg-surface border border-line rounded-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-[26px] pt-[22px] pb-[18px]">
        <span className="text-[19px] font-extrabold tracking-tight">Holdings</span>
        {controls && <div className="flex items-center gap-3">{controls}</div>}
      </div>

      {/* Six columns need ~700px; on phones the table scrolls sideways inside the card. */}
      <div className="overflow-x-auto">
      <div className="min-w-[700px]">
      {/* column headers */}
      <div className="grid gap-4 px-[26px] py-3 border-y border-line text-[13px] text-content-3 font-semibold" style={GRID}>
        <span>Security</span>
        <span className="text-right">Price</span>
        <span className="text-right">Quantity</span>
        <span className="text-right">Value</span>
        <span className="text-right">Weight</span>
        <span className="text-right">Past {rangeLabel}</span>
      </div>

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.assetClass);
        return (
          <div key={g.assetClass}>
            <div
              onClick={() => toggle(g.assetClass)}
              className="flex items-center gap-2.5 px-[26px] py-3 bg-surface-2 border-b border-line text-[14px] font-semibold text-content-2 cursor-pointer select-none"
            >
              <svg
                width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ transform: isCollapsed ? 'rotate(-90deg)' : undefined, transition: 'transform .15s' }}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
              {g.assetClass}
            </div>
            {!isCollapsed && g.holdings.map((h) => (
              <div key={h.symbol} className="grid gap-4 items-center px-[26px] py-4 border-b border-line" style={GRID}>
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="w-[9px] h-[9px] shrink-0 rounded-full" style={{ background: colorOf.get(h.symbol) }} />
                  <div className="min-w-0">
                    <div className="font-bold text-[15px]">{h.symbol}</div>
                    <div className="text-[13px] text-content-3 truncate">{h.name}</div>
                  </div>
                </div>
                <div className="text-right font-semibold text-[14px] tabular-nums">{h.price == null ? '—' : balance(h.price)}</div>
                <div className="text-right text-[14px] text-content-2 tabular-nums">{qty(h.quantity)}</div>
                <div className="text-right font-semibold text-[14px] tabular-nums">{balance(h.value)}</div>
                <div className="text-right text-[14px] text-content-2 tabular-nums">{h.weightPct.toFixed(2)}%</div>
                <div className="flex justify-end"><RangePill pct={h.rangePct} /></div>
              </div>
            ))}
          </div>
        );
      })}

      {/* total row */}
      <div className="grid gap-4 items-center px-[26px] py-5 bg-surface-2" style={GRID}>
        <div className="font-extrabold text-[16px]">Total</div>
        <div />
        <div />
        <div className="text-right font-extrabold text-[15px] tabular-nums">{balance(total.value)}</div>
        <div className="text-right font-bold text-[14px] text-content-2 tabular-nums">100.00%</div>
        <div className="flex justify-end"><RangePill pct={total.rangePct} /></div>
      </div>
      </div>
      </div>
    </div>
  );
}
