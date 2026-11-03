import { useLayoutEffect, useEffect, useRef, useState, useMemo } from 'react';
import { formatMoney } from '@ledger/shared';

export interface Series {
  label: string;
  color: string;
  values: number[];
  bold?: boolean;
  total?: number; // true period total for the legend chip (values may be cumulative)
}

interface Props {
  series: Series[];
  labels: string[];               // x-axis bucket labels (aligned to values index)
  height?: number;
  formatValue?: (n: number) => string;
  yTicks?: number;
}

const defaultValue = (n: number) => formatMoney(n, { kind: 'balance', precision: 'axis' }).text;

/**
 * Reusable multi-line time-series chart (inline SVG): gridlines, axis labels,
 * hover crosshair with a multi-series tooltip, and clickable legend chips that
 * isolate a line. Bold series render thicker.
 */
export default function MultiLineChart({ series, labels, height = 300, formatValue = defaultValue, yTicks = 5 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  const [hover, setHover] = useState<number | null>(null);
  const [isolated, setIsolated] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => { const w = e[0]?.contentRect.width; if (w) setWidth(w); });
    ro.observe(el);
    setWidth(el.clientWidth || 760);
    return () => ro.disconnect();
  }, []);

  const pad = { left: 52, right: 14, top: 12, bottom: 26 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);
  const n = labels.length;

  // Reset an isolated line if it's no longer present (e.g. Expenses↔Income flip).
  useEffect(() => {
    if (isolated && !series.some((s) => s.label === isolated)) setIsolated(null);
  }, [series, isolated]);

  const visible = isolated ? series.filter((s) => s.label === isolated) : series;
  const { min, max } = useMemo(() => {
    let lo = 0, hi = 0;
    for (const s of visible) for (const v of s.values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    return { min: lo, max: hi > lo ? hi * 1.1 : lo + 1 };
  }, [visible]);

  const xFor = (i: number) => pad.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yFor = (v: number) => pad.top + (1 - (v - min) / (max - min)) * plotH;
  const ticks = Array.from({ length: yTicks }, (_, i) => min + (i / (yTicks - 1)) * (max - min));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const idx = Math.round(((x - pad.left) / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  };

  return (
    <div>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block">
            {ticks.map((t, i) => {
              const y = yFor(t);
              return (
                <g key={i}>
                  <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke="var(--line)" strokeWidth="1" />
                  <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--text-3)" className="tabular-nums">{formatValue(t)}</text>
                </g>
              );
            })}
            {labels.map((lb, i) => (
              (n <= 8 || i % Math.ceil(n / 8) === 0 || i === n - 1) && (
                <text key={i} x={xFor(i)} y={height - 8} textAnchor="middle" fontSize="10" fill="var(--text-3)">{lb}</text>
              )
            ))}

            {visible.map((s) => (
              <polyline key={s.label}
                points={s.values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ')}
                fill="none" stroke={s.color} strokeWidth={s.bold ? 3 : 1.75}
                strokeLinejoin="round" strokeLinecap="round"
                opacity={isolated && s.label !== isolated ? 0.15 : 1} />
            ))}

            {hover != null && (
              <>
                <line x1={xFor(hover)} y1={pad.top} x2={xFor(hover)} y2={pad.top + plotH} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 3" />
                {visible.map((s) => <circle key={s.label} cx={xFor(hover)} cy={yFor(s.values[hover] ?? 0)} r="3.5" fill={s.color} stroke="var(--surface)" strokeWidth="1.5" />)}
              </>
            )}
          </svg>
        )}

        {hover != null && (
          <div className="pointer-events-none absolute z-10 px-2.5 py-2 rounded-lg bg-elevated border border-line-strong shadow-md text-xs"
            style={{ left: Math.min(xFor(hover) + 8, width - 150), top: pad.top }}>
            <div className="font-bold text-content mb-1">{labels[hover]}</div>
            {visible.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="text-content-3 flex-1">{s.label}</span>
                <span className="tabular-nums font-semibold text-content">{formatValue(s.values[hover] ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* legend chips (click to isolate) */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {series.map((s) => {
          const active = isolated === s.label;
          const tot = s.total ?? (s.values.length ? s.values[s.values.length - 1] : 0);
          return (
            <button key={s.label} onClick={() => setIsolated(active ? null : s.label)}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[12px] font-semibold transition-opacity"
              style={{ borderColor: active ? s.color : 'var(--line)', background: active ? `color-mix(in srgb, ${s.color} 14%, transparent)` : 'var(--surface-2)', opacity: isolated && !active ? 0.5 : 1 }}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-content">{s.label}</span>
              <span className="tabular-nums text-content-3">{formatValue(tot)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
