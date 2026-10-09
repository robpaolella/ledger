import { useNavigate } from 'react-router-dom';
import { formatMoney } from '@ledger/shared';
import { useCachedApi } from '../useCachedApi';
import DashboardCard, { CardSkeleton, CardError } from '../DashboardCard';
import type { DashboardCardProps } from '../cardRegistry';

interface Movers {
  asOf: string | null;
  portfolio: { value: number; dayChangeValue: number; dayChangePct: number } | null;
  movers: { symbol: string; name: string; price: number; dayChangePct: number; dayChangeValue: number }[];
}

const whole = (n: number) => formatMoney(n, { kind: 'balance', precision: 'whole', showZero: true }).text;
const full = (n: number) => formatMoney(n, { kind: 'balance', showZero: true }).text;

/** Diagonal change arrow from the design (up-right / mirrored down-right). */
function DiagArrow({ up }: { up: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {up ? <path d="M7 17 17 7M9 7h8v8" /> : <path d="M7 7 17 17M17 9v8H9" />}
    </svg>
  );
}

function MoversStrip() {
  return (
    <div className="px-6 py-[11px] bg-surface-2 border-t border-b border-line text-[13px] font-semibold text-content-3 uppercase tracking-[.06em]">
      Top movers today
    </div>
  );
}

export default function InvestmentsCard({ dragHandleProps }: DashboardCardProps) {
  const navigate = useNavigate();
  const { data: res, error } = useCachedApi<{ data: Movers }>('/investments/movers');
  const data = res?.data ?? null;

  const portfolio = data?.portfolio ?? null;
  // A day change: real minus when down; zero keeps today's green "$0.00".
  const dayChange = formatMoney(portfolio?.dayChangeValue ?? 0, { kind: 'total', showZero: true, zeroTone: 'positive' });
  const up = dayChange.tone !== 'negative';

  return (
    <DashboardCard
      headline={
        <>
          <span className="text-[22px] font-extrabold tracking-[-0.01em] tabular-nums">
            {portfolio ? `${whole(portfolio.value)} investments` : 'Investments'}
          </span>
          {portfolio && (
            <>
              <span
                className="inline-flex items-center gap-[5px] text-[16px] font-bold tabular-nums"
                style={{ color: up ? 'var(--positive)' : 'var(--negative)' }}
              >
                <DiagArrow up={up} />
                {dayChange.text} ({Math.abs(portfolio.dayChangePct).toFixed(1)}%)
              </span>
              <span className="text-[15px] font-semibold text-content-3">Today</span>
            </>
          )}
        </>
      }
      dragHandleProps={dragHandleProps}
    >
      {error && !data ? (
        <CardError message="Couldn't load investments." />
      ) : !data ? (
        <CardSkeleton lines={4} />
      ) : data.asOf == null ? (
        <CardError message="Link an investment account to track holdings here." />
      ) : data.movers.length === 0 ? (
        <>
          <MoversStrip />
          <div className="px-6 py-[22px] text-sm text-content-3">Day change appears after tomorrow's sync.</div>
        </>
      ) : (
        <>
          <MoversStrip />
          <div className="divide-y divide-line">
            {data.movers.map((m) => {
              const pos = m.dayChangePct >= 0;
              const color = pos ? 'var(--positive)' : 'var(--negative)';
              return (
                <div
                  key={m.symbol}
                  onClick={() => navigate('/investments')}
                  className="flex items-center gap-3.5 px-6 h-[72px] cursor-pointer hover:bg-surface-2/40"
                >
                  <div className="flex-1 min-w-0 flex items-baseline gap-2.5">
                    <span className="flex-none font-bold text-[16px] tracking-[.01em]">{m.symbol}</span>
                    <span className="text-sm text-content-3 truncate">{m.name}</span>
                  </div>
                  <div className="flex-none font-bold text-[16px] tabular-nums">{full(m.price)}</div>
                  <div
                    className="flex-none inline-flex items-center gap-1 h-[30px] px-3 rounded-full font-bold text-sm tabular-nums"
                    style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      {pos ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
                    </svg>
                    {Math.abs(m.dayChangePct).toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </DashboardCard>
  );
}
