import { useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface PerfSeries {
  name: string;
  color: string;
  values: number[];   // cumulative %, aligned with `dates`
}

const fmtDate = (d: string) => {
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Bespoke dual-line cumulative-% performance chart per the Investments design:
 * horizontal gridlines with LEFT-anchored % labels, 3px round polylines, evenly
 * spaced date x-labels, and a centered dot legend below. No hover crosshair
 * (design fidelity). Renders at real pixel width via ResizeObserver.
 */
export default function PerformanceChart({ dates, series, height = 400 }: { dates: string[]; series: PerfSeries[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 960);
    return () => ro.disconnect();
  }, []);

  // Only series that align with the axis are drawable.
  const drawn = useMemo(
    () => series.filter((s) => s.values.length === dates.length && s.values.length >= 2),
    [series, dates],
  );

  const pad = { left: 70, right: 8, top: 12, bottom: 36 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);

  // Nice-rounded ticks over both series (always including 0).
  const { ticks, lo, hi } = useMemo(() => {
    let lo = 0, hi = 0;
    for (const s of drawn) for (const v of s.values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi === lo) hi = lo + 1;
    const rawStep = (hi - lo) / 4;
    const mag = 10 ** Math.floor(Math.log10(rawStep));
    const norm = rawStep / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const start = Math.floor(lo / step) * step;
    const count = Math.round((Math.ceil(hi / step) * step - start) / step);
    const ticks = Array.from({ length: count + 1 }, (_, i) => start + i * step);
    return { ticks, lo: start, hi: start + count * step };
  }, [drawn]);

  const xFor = (i: number) => pad.left + (dates.length <= 1 ? plotW / 2 : (i / (dates.length - 1)) * plotW);
  const yFor = (v: number) => pad.top + (1 - (v - lo) / (hi - lo)) * plotH;

  // ~8-13 evenly spaced date labels depending on available width.
  const xIdx = useMemo(() => {
    const n = dates.length;
    if (n === 0) return [];
    const count = Math.min(n, Math.max(2, Math.min(13, Math.round(plotW / 115) + 1)));
    const idx = Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / (count - 1)));
    return [...new Set(idx)];
  }, [dates, plotW]);

  if (dates.length === 0 || drawn.length === 0) return null;

  return (
    <div>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} className="block">
            {ticks.map((t, i) => {
              const y = yFor(t);
              return (
                <g key={i}>
                  <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="var(--line)" strokeWidth="1" />
                  <text x={pad.left - 14} y={y + 5} textAnchor="end" fontSize="14" fontWeight="500" fill="var(--text-3)" className="tabular-nums">
                    {`${parseFloat(t.toFixed(2))}%`}
                  </text>
                </g>
              );
            })}
            {/* draw reversed so the first series (Portfolio) paints on top */}
            {[...drawn].reverse().map((s) => (
              <polyline
                key={s.name}
                points={s.values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ')}
                fill="none" stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              />
            ))}
            {xIdx.map((i) => (
              <text key={i} x={xFor(i)} y={height - 8} textAnchor="middle" fontSize="13" fontWeight="500" fill="var(--text-3)">
                {fmtDate(dates[i])}
              </text>
            ))}
          </svg>
        )}
      </div>
      <div className="flex items-center justify-center gap-[26px] pt-3.5 text-[14px] font-semibold">
        {drawn.map((s) => (
          <span key={s.name} className="flex items-center gap-2 text-content-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
