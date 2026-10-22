import { useState } from 'react';
import { formatMoney } from '@ledger/shared';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;   // small top label in the hole (falls back to hovered segment)
  centerValue?: string;   // big value in the hole (falls back to hovered segment value)
  formatValue?: (n: number) => string;
}

const defaultValue = (n: number) => formatMoney(n, { kind: 'balance', precision: 'whole', showZero: true }).text;

/**
 * Reusable inline-SVG donut chart. Hovering a segment highlights it and shows
 * its label/value in the hole. Theme-token colored via the caller's segment colors.
 */
export default function DonutChart({
  segments,
  size = 200,
  thickness = 22,
  centerLabel,
  centerValue,
  formatValue = defaultValue,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  const lenOf = (v: number) => (total > 0 ? Math.max(0, v) / total : 0) * c;
  const arcs = segments.map((seg, i) => ({
    seg, i,
    len: lenOf(seg.value),
    offset: segments.slice(0, i).reduce((s, x) => s + lenOf(x.value), 0),
    frac: total > 0 ? Math.max(0, seg.value) / total : 0,
  }));

  const hv = hover != null ? segments[hover] : null;
  const topLabel = hv ? hv.label : (centerLabel ?? 'Total');
  const bigValue = hv ? formatValue(hv.value) : (centerValue ?? formatValue(total));
  const pct = hv && total > 0 ? `${Math.round((hv.value / total) * 100)}%` : '';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {total === 0 && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
          )}
          {arcs.map((a) => (
            <circle
              key={a.i}
              cx={size / 2} cy={size / 2} r={r}
              fill="none"
              stroke={a.seg.color}
              strokeWidth={hover === a.i ? thickness + 4 : thickness}
              strokeDasharray={`${a.len} ${c - a.len}`}
              strokeDashoffset={-a.offset}
              opacity={hover == null || hover === a.i ? 1 : 0.4}
              onMouseEnter={() => setHover(a.i)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: 'opacity .12s, stroke-width .12s', cursor: 'pointer' }}
            />
          ))}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
        <div className="text-[11px] font-mono uppercase tracking-wide text-content-3 truncate max-w-full">{topLabel}</div>
        <div className="text-[22px] font-extrabold tabular-nums leading-tight">{bigValue}</div>
        {pct && <div className="text-[12px] text-content-3 tabular-nums">{pct}</div>}
      </div>
    </div>
  );
}
