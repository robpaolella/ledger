import { useLayoutEffect, useRef, useState, useMemo } from 'react';

export interface ChartPoint {
  date: string;   // 'YYYY-MM-DD' (or any label)
  value: number;
}

interface Props {
  points: ChartPoint[];
  height?: number;
  color?: string;                     // line/area color (default --primary)
  formatValue?: (n: number) => string;
  formatDate?: (d: string) => string;
  yTicks?: number;
  /** Enlarged end-point dot (r=7, stroke 3) per the dashboard net-worth design. */
  highlightLast?: boolean;
  /** X-label mode: 'auto' = first/mid/last (default), 'date' = only the last
   *  point's date centered under the dot, 'none' = no x labels. */
  lastLabel?: 'auto' | 'date' | 'none';
  /** In 'auto' mode: render this many evenly-spaced x labels instead of 3. */
  xTicks?: number;
}

const defaultDate = (d: string) => {
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const defaultValue = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
};

/**
 * Reusable inline-SVG area+line chart with gridlines, axis labels, and a hover
 * crosshair + tooltip. Renders at real pixel width (ResizeObserver) so strokes
 * and text aren't distorted. Theme-token colored.
 */
export default function AreaLineChart({
  points: rawPoints,
  height = 240,
  color = 'var(--primary)',
  formatValue = defaultValue,
  formatDate = defaultDate,
  yTicks = 5,
  highlightLast = false,
  lastLabel = 'auto',
  xTicks,
}: Props) {
  // Guard against non-finite values (NaN/Infinity) breaking SVG coordinates.
  const points = useMemo(() => rawPoints.filter((p) => Number.isFinite(p.value)), [rawPoints]);
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

  const { min, max } = useMemo(() => {
    if (points.length === 0) return { min: 0, max: 1 };
    let lo = Infinity, hi = -Infinity;
    for (const p of points) { if (p.value < lo) lo = p.value; if (p.value > hi) hi = p.value; }
    if (lo === hi) { const d = Math.abs(lo) * 0.01 || 1; lo -= d; hi += d; }
    else { const padY = (hi - lo) * 0.12; lo -= padY; hi += padY; }
    return { min: lo, max: hi };
  }, [points]);

  const xFor = (i: number) => pad.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yFor = (v: number) => pad.top + (1 - (v - min) / (max - min)) * plotH;

  const linePts = points.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`).join(' ');
  const areaPts = points.length
    ? `${pad.left},${pad.top + plotH} ${linePts} ${pad.left + plotW},${pad.top + plotH}`
    : '';

  const ticks = Array.from({ length: yTicks }, (_, i) => min + (i / (yTicks - 1)) * (max - min));
  const gid = 'nw-area-grad';

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const rel = (x - pad.left) / plotW;
    const idx = Math.round(rel * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, idx)));
  };

  const hp = hover != null ? points[hover] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.20" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* gridlines + y labels */}
          {ticks.map((t, i) => {
            const y = yFor(t);
            return (
              <g key={i}>
                <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke="var(--line)" strokeWidth="1" />
                <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--text-3)" className="tabular-nums">
                  {formatValue(t)}
                </text>
              </g>
            );
          })}

          {points.length > 0 && (
            <>
              <polygon points={areaPts} fill={`url(#${gid})`} />
              <polyline points={linePts} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
              {/* end marker */}
              <circle
                cx={xFor(points.length - 1)} cy={yFor(points[points.length - 1].value)}
                r={highlightLast ? 7 : 4.5} fill={color} stroke="var(--surface)" strokeWidth={highlightLast ? 3 : 2}
              />

              {/* x labels: first/middle/last (or xTicks evenly spaced), or only the last point's date */}
              {lastLabel === 'auto' && (
                xTicks && points.length > 1
                  ? Array.from({ length: Math.min(xTicks, points.length) }, (_, k) =>
                      Math.round((k * (points.length - 1)) / (Math.min(xTicks, points.length) - 1)))
                  : [0, Math.floor((points.length - 1) / 2), points.length - 1]
              )
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((i) => (
                  <text key={i} x={xFor(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--text-3)">
                    {formatDate(points[i].date)}
                  </text>
                ))}
              {lastLabel === 'date' && (
                // Centered under the end dot, clamped so it never clips the edge.
                <text
                  x={Math.min(Math.max(xFor(points.length - 1), pad.left + 20), width - 24)}
                  y={height - 6} textAnchor="middle" fontSize="11" fontWeight="500" fill="var(--text-3)"
                >
                  {formatDate(points[points.length - 1].date)}
                </text>
              )}

              {/* hover crosshair + dot */}
              {hp && (
                <>
                  <line x1={xFor(hover!)} y1={pad.top} x2={xFor(hover!)} y2={pad.top + plotH} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 3" />
                  <circle cx={xFor(hover!)} cy={yFor(hp.value)} r="4.5" fill={color} stroke="var(--surface)" strokeWidth="2" />
                </>
              )}
            </>
          )}
        </svg>
      )}

      {/* tooltip */}
      {hp && (
        <div
          className="pointer-events-none absolute z-10 px-2.5 py-1.5 rounded-lg bg-elevated border border-line-strong shadow-md text-xs whitespace-nowrap"
          style={{
            left: Math.min(Math.max(xFor(hover!) - 50, 0), width - 110),
            top: Math.max(yFor(hp.value) - 52, 0),
          }}
        >
          <div className="font-bold tabular-nums text-content">{formatValue(hp.value)}</div>
          <div className="text-content-3">{formatDate(hp.date)}</div>
        </div>
      )}
    </div>
  );
}
