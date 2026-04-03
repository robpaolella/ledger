interface KPICardProps {
  label: string;
  value: string;
  valueColor?: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  onClick?: () => void;
}

export default function KPICard({ label, value, valueColor, subtitle, trend, onClick }: KPICardProps) {
  const trendColor =
    trend === 'up' ? 'text-[#10b981]' :
    trend === 'down' ? 'text-[#ef4444]' :
    'text-[var(--text-secondary)]';

  return (
    <div
      className={`bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)]${onClick ? ' cursor-pointer transition-shadow duration-150 hover:shadow-md hover:border-[var(--text-muted)]' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <p className="text-[11px] text-[var(--text-secondary)] uppercase tracking-[0.05em] font-medium m-0">
        {label}
      </p>
      <p className="text-[22px] font-extrabold font-mono tracking-[-0.02em] mt-1 m-0" style={{ color: valueColor || 'var(--text-primary)' }}>
        {value}
      </p>
      {subtitle && (
        <p className={`text-[11px] mt-1 m-0 flex items-center gap-0.5 ${trendColor}`}>
          {trend === 'up' && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
          )}
          {trend === 'down' && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          )}
          {subtitle}
        </p>
      )}
    </div>
  );
}
