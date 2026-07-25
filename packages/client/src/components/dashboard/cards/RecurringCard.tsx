import { useNavigate } from 'react-router-dom';
import { useCachedApi } from '../useCachedApi';
import { VendorAvatar } from '../../primitives';
import DashboardCard, { CardSkeleton, CardError, CardHeaderControl } from '../DashboardCard';
import type { DashboardCardProps } from '../cardRegistry';

interface Occurrence {
  itemId: number;
  label: string;
  merchantName: string | null;
  merchantLogoUrl: string | null;
  date: string;
  amount: number;
  type: 'income' | 'expense';
  frequency: string;
  status: 'paid' | 'due' | 'upcoming';
}
interface MonthView {
  month: string;
  occurrences: Occurrence[];
  expense: { total: number; paid: number; remaining: number };
}

const FREQ: Record<string, string> = {
  weekly: 'Every week', biweekly: 'Every 2 weeks', semi_monthly: 'Twice a month',
  monthly: 'Every month', every_n_months: 'Every few months', custom_months: 'Custom months',
};

const usd = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded)
    ? `$${Math.abs(rounded).toLocaleString('en-US')}`
    : `$${Math.abs(rounded).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function dueLabel(date: string): string {
  const today = new Date();
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.round((new Date(date + 'T00:00:00').getTime() - todayMs) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export default function RecurringCard({ dragHandleProps }: DashboardCardProps) {
  const navigate = useNavigate();
  const now = new Date();
  const cur = useCachedApi<{ data: MonthView }>(`/recurring/occurrences?month=${monthKey(now)}`);
  const view = cur.data?.data ?? null;
  const upcoming = view ? view.occurrences.filter((o) => o.status !== 'paid') : null;

  // Month exhausted — look ahead to next month's first occurrence.
  const nm = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const needAhead = upcoming != null && upcoming.length === 0;
  const ahead = useCachedApi<{ data: MonthView }>(needAhead ? `/recurring/occurrences?month=${monthKey(nm)}` : null);

  const remaining = view?.expense.remaining ?? null;
  const next: Occurrence | null = upcoming && upcoming.length > 0
    ? upcoming[0]
    : (ahead.data?.data.occurrences[0] ?? null);
  const error = (cur.error && !view) || (needAhead && ahead.error && !ahead.data);
  const loading = !view || (needAhead && !ahead.data);

  return (
    <DashboardCard
      title="Recurring"
      subtitle={remaining != null ? <span className="text-[15px] font-semibold text-content-3 tabular-nums">{usd(remaining)} remaining due</span> : undefined}
      headerRight={<CardHeaderControl small>This month</CardHeaderControl>}
      dragHandleProps={dragHandleProps}
    >
      {error ? (
        <CardError message="Couldn't load recurring items." />
      ) : loading ? (
        <CardSkeleton lines={2} />
      ) : !next ? (
        <CardError message="Nothing upcoming." />
      ) : (
        <div
          onClick={() => navigate('/recurring')}
          className="flex items-center gap-3.5 px-6 h-[78px] border-t border-line cursor-pointer hover:bg-surface-2/40"
        >
          <span className="relative w-11 h-11 flex-none">
            <VendorAvatar name={next.merchantName ?? next.label} src={next.merchantLogoUrl || undefined} size={44} />
            <span className="absolute -right-0.5 -bottom-0.5 w-[18px] h-[18px] rounded-full bg-primary border-2 border-[var(--surface)] flex items-center justify-center">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--on-primary)" strokeWidth="3">
                <path d="M4 4h7v7H4zM13 13h7v7h-7z" />
              </svg>
            </span>
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[16px] truncate">{next.label}</div>
            <div className="text-sm text-content-3 mt-0.5">{next.merchantName ?? 'Merchant'} · {FREQ[next.frequency] ?? next.frequency}</div>
          </div>
          <div className="flex-none text-right">
            <div className={`font-bold text-[16px] tabular-nums ${next.type === 'income' ? 'text-positive' : ''}`}>
              {next.type === 'income' ? '+' : ''}${Math.abs(next.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[13px] text-content-3 mt-0.5">{dueLabel(next.date)}</div>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
