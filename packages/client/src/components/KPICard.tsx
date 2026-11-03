interface KPICardProps {
  label: string;
  value: string;
  valueColor?: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendDirection?: 'up' | 'down';
  onClick?: () => void;
}

export default function KPICard({ label, value, valueColor, subtitle, trend, trendDirection, onClick }: KPICardProps) {
  const trendColor =
    trend === 'up' ? 'text-positive' :
    trend === 'down' ? 'text-negative' :
    'text-content-3';

  const arrowDir = trendDirection ?? trend;

  return (
    <div
      className={`bg-surface rounded-card border border-line px-5 py-4 shadow-sm${onClick ? ' cursor-pointer transition-shadow duration-150 hover:shadow-md hover:border-line-strong' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <p className="font-mono text-[11px] text-content-3 uppercase tracking-wide font-medium m-0">
        {label}
      </p>
      <p
        className="text-[30px] font-extrabold tabular-nums tracking-tight mt-1 m-0 text-content"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>
      {subtitle && (
        <p className={`text-sm font-semibold mt-1 m-0 flex items-center gap-0.5 ${trendColor}`}>
          {arrowDir === 'up' && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
          )}
          {arrowDir === 'down' && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          )}
          {subtitle}
        </p>
      )}
    </div>
  );
}
