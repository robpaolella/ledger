/**
 * Bespoke cumulative spending comparison chart (Dashboard.dc.html):
 * this-month primary line (3.5px) + soft gradient area + endpoint dot vs.
 * last month's full line in --text-3 (3px); 5 gridlines with $ y-labels,
 * Day-N x labels, hover crosshair. ResizeObserver pattern from AreaLineChart.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '@ledger/shared';

interface Props {
  thisMonth: number[]; // cumulative $ per day, day 1..today
  lastMonth: number[]; // cumulative $ per day, full prior month
  height?: number;
}

const full = (n: number) => formatMoney(n, { kind: 'balance', showZero: true }).text;
const axisLabel = (n: number) => formatMoney(n, { kind: 'balance', precision: 'axis' }).text;

export default function SpendingTrendChart({ thisMonth, lastMonth, height = 240 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 720);
    return () => ro.disconnect();
  }, []);

  const pad = { left: 54, right: 14, top: 12, bottom: 24 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);

  const dayCount = Math.max(thisMonth.length, lastMonth.length, 2);
  const { min, max } = useMemo(() => {
    let hi = 0, lo = 0;
    for (const v of thisMonth) { if (v > hi) hi = v; if (v < lo) lo = v; }
    for (const v of lastMonth) { if (v > hi) hi = v; if (v < lo) lo = v; }
    // 10% headroom; floor pinned at $0 unless refunds dip a cumulative below it.
    return { min: lo < 0 ? lo * 1.1 : 0, max: hi > 0 ? hi * 1.1 : 1 };
  }, [thisMonth, lastMonth]);

  const xFor = (day: number) => pad.left + ((day - 1) / (dayCount - 1)) * plotW;
  const yFor = (v: number) => pad.top + (1 - (v - min) / (max - min)) * plotH;
  const toPts = (series: number[]) => series.map((v, i) => `${xFor(i + 1).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');

  const thisPts = toPts(thisMonth);
  const lastPts = toPts(lastMonth);
  const areaPts = thisMonth.length
    ? `${xFor(1).toFixed(1)},${(pad.top + plotH).toFixed(1)} ${thisPts} ${xFor(thisMonth.length).toFixed(1)},${(pad.top + plotH).toFixed(1)}`
    : '';

  const ticks = Array.from({ length: 5 }, (_, i) => min + (i / 4) * (max - min));
  // Day 1, 4, 7, … then the final day (skipping any tick within 2 days of it).
  // Narrow charts (phones) label every 6th day so labels never collide.
  const step = width < 480 ? 6 : 3;
  const xLabels: number[] = [];
  for (let d = 1; d <= dayCount; d += step) if (dayCount - d >= step) xLabels.push(d);
  xLabels.push(dayCount);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const day = Math.round(((x - pad.left) / plotW) * (dayCount - 1)) + 1;
    setHover(Math.max(1, Math.min(dayCount, day)));
  };

  const hoverThis = hover != null && hover <= thisMonth.length ? thisMonth[hover - 1] : null;
  const hoverLast = hover != null && hover <= lastMonth.length ? lastMonth[hover - 1] : null;
  const hoverY = hoverThis ?? hoverLast ?? 0;

  return (
    <div>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block">
            <defs>
              <linearGradient id="spend-trend-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.34" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* gridlines + $ y-labels */}
            {ticks.map((t, i) => {
              const y = yFor(t);
              return (
                <g key={i}>
                  <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke="var(--line)" strokeWidth="1" />
                  <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="11" fontWeight="500" fill="var(--text-3)" className="tabular-nums">
                    {axisLabel(t)}
                  </text>
                </g>
              );
            })}

            {thisMonth.length > 0 && <polygon points={areaPts} fill="url(#spend-trend-grad)" />}
            {lastMonth.length > 1 && (
              <polyline points={lastPts} fill="none" stroke="var(--text-3)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            )}
            {thisMonth.length > 1 && (
              <polyline points={thisPts} fill="none" stroke="var(--primary)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            )}
            {thisMonth.length > 0 && (
              <circle
                cx={xFor(thisMonth.length)} cy={yFor(thisMonth[thisMonth.length - 1])}
                r="6" fill="var(--primary)" stroke="var(--surface)" strokeWidth="2.5"
              />
            )}

            {/* Day-N x labels */}
            {xLabels.map((d) => (
              <text key={d} x={xFor(d)} y={height - 6} textAnchor="middle" fontSize="11" fontWeight="500" fill="var(--text-3)">
                Day {d}
              </text>
            ))}

            {/* hover crosshair + dots */}
            {hover != null && (
              <>
                <line x1={xFor(hover)} y1={pad.top} x2={xFor(hover)} y2={pad.top + plotH} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 3" />
                {hoverLast != null && <circle cx={xFor(hover)} cy={yFor(hoverLast)} r="4" fill="var(--text-3)" stroke="var(--surface)" strokeWidth="2" />}
                {hoverThis != null && <circle cx={xFor(hover)} cy={yFor(hoverThis)} r="4.5" fill="var(--primary)" stroke="var(--surface)" strokeWidth="2" />}
              </>
            )}
          </svg>
        )}

        {/* tooltip */}
        {hover != null && (hoverThis != null || hoverLast != null) && (
          <div
            className="pointer-events-none absolute z-10 px-2.5 py-1.5 rounded-lg bg-elevated border border-line-strong shadow-md text-xs whitespace-nowrap"
            style={{
              left: Math.min(Math.max(xFor(hover) - 60, 0), width - 140),
              top: Math.max(yFor(hoverY) - (hoverThis != null && hoverLast != null ? 70 : 52), 0),
            }}
          >
            <div className="font-semibold text-content-3 mb-0.5">Day {hover}</div>
            {hoverThis != null && (
              <div className="flex items-center gap-1.5 font-bold tabular-nums text-content">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--primary)' }} />
                {full(hoverThis)}
              </div>
            )}
            {hoverLast != null && (
              <div className="flex items-center gap-1.5 tabular-nums text-content-2">
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--text-3)' }} />
                {full(hoverLast)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* centered swatch legend */}
      <div className="flex items-center justify-center gap-[26px] pt-3 pb-1 text-sm font-semibold">
        <span className="flex items-center gap-2 text-content-2">
          <span className="w-4 h-[3px] rounded-[2px]" style={{ background: 'var(--text-3)' }} />
          Last month
        </span>
        <span className="flex items-center gap-2" style={{ color: 'var(--primary)' }}>
          <span className="w-4 h-[3px] rounded-[2px]" style={{ background: 'var(--primary)' }} />
          This month
        </span>
      </div>
    </div>
  );
}
