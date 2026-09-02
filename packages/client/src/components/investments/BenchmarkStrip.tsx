export type BenchmarkId = 'sp500' | 'us_stocks' | 'us_bonds';

export interface BenchmarkCell {
  id: BenchmarkId;
  name: string;
  rangePct: number | null;
  todayPct: number | null;
}

interface Props {
  rangeLabel: string;                                            // e.g. "3 Months"
  portfolio: { rangePct: number | null; todayPct: number | null } | null;
  benchmarks: BenchmarkCell[];
  selected: BenchmarkId;
  onSelect: (id: BenchmarkId) => void;
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="text-[13px] text-content-3 mb-[5px]">{label}</div>
      <div
        className="text-[22px] font-bold tabular-nums"
        style={{ color: value == null ? 'var(--text-3)' : value < 0 ? 'var(--negative)' : 'var(--positive)' }}
      >
        {value == null ? '—' : `${value.toFixed(2)}%`}
      </div>
    </div>
  );
}

/** 4-cell strip: Your Portfolio (not selectable) + radio-select benchmark cells. */
export default function BenchmarkStrip({ rangeLabel, portfolio, benchmarks, selected, onSelect }: Props) {
  const cells: { id: BenchmarkId | 'portfolio'; name: string; rangePct: number | null; todayPct: number | null }[] = [
    { id: 'portfolio', name: 'Your Portfolio', rangePct: portfolio?.rangePct ?? null, todayPct: portfolio?.todayPct ?? null },
    ...benchmarks,
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border border-line rounded-[14px] overflow-hidden mb-[26px]">
      {cells.map((c, i) => {
        const selectable = c.id !== 'portfolio';
        const isSel = selectable && c.id === selected;
        return (
          <div
            key={c.id}
            onClick={selectable ? () => onSelect(c.id as BenchmarkId) : undefined}
            className={`px-[22px] py-5 border-line ${i % 2 === 1 ? 'border-l' : i > 0 ? 'md:border-l' : ''} ${i >= 2 ? 'border-t md:border-t-0' : ''} ${selectable ? 'cursor-pointer' : ''}`}
            style={{ background: isSel ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : undefined }}
          >
            <div className="flex items-center gap-[9px] mb-4">
              <span
                className="w-[17px] h-[17px] shrink-0 rounded-[5px] border-[1.5px] box-border flex items-center justify-center"
                style={{ borderColor: isSel ? 'var(--primary)' : selectable ? 'var(--line-strong)' : 'transparent', background: isSel ? 'var(--primary)' : selectable ? 'var(--surface)' : 'color-mix(in srgb, var(--primary) 16%, transparent)' }}
                aria-hidden="true"
              >
                {isSel && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--on-primary)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>}
                {!selectable && <span className="w-[7px] h-[7px] rounded-[2px]" style={{ background: 'var(--primary)' }} />}
              </span>
              <span className="text-[16px] font-bold">{c.name}</span>
            </div>
            <div className="flex gap-[34px]">
              <Stat label={rangeLabel} value={c.rangePct} />
              <Stat label="Today" value={c.todayPct} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
