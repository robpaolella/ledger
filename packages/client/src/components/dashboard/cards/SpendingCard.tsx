import { useCachedApi } from '../useCachedApi';
import DashboardCard, { CardSection, CardSkeleton, CardError, CardHeaderControl } from '../DashboardCard';
import SpendingTrendChart from '../SpendingTrendChart';
import { Link } from 'react-router-dom';
import { formatMoney, monthPeriod, type UncategorizedTotals } from '@ledger/shared';
import type { DashboardCardProps } from '../cardRegistry';

interface SeriesDay { day: number; date: string; cumulative: number }
interface SpendingSeries { month: string; days: SeriesDay[]; prior: { month: string; days: SeriesDay[] }; uncategorized: UncategorizedTotals }

export default function SpendingCard({ dragHandleProps }: DashboardCardProps) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data, error } = useCachedApi<{ data: SpendingSeries }>(`/dashboard/spending-series?month=${month}`);
  const series = data?.data ?? null;

  // Headline = the series' final cumulative point (matches the chart endpoint).
  const total = series && series.days.length > 0 ? series.days[series.days.length - 1].cumulative : 0;
  // A sum of transactions (money rule), but neutral keeps the subtitle's grey.
  const spent = formatMoney(total, { showZero: true });

  // The headline counts money out only, so the note does too (hidden when only money came in).
  const uncategorizedOut = series?.uncategorized.moneyOut ?? 0;
  const { from, to } = monthPeriod(now.getFullYear(), now.getMonth());

  return (
    <DashboardCard
      title="Spending"
      subtitle={<>
        {series && <span className="text-[20px] font-semibold text-content-2 tabular-nums"><span className={spent.tone === 'positive' ? 'text-positive' : ''}>{spent.text}</span> this month</span>}
        <span className="md:hidden text-[13px] font-medium text-content-3">This month vs. last month</span>
      </>}
      headerRight={<CardHeaderControl>This month vs. last month</CardHeaderControl>}
      hideRightOnPhone
      dragHandleProps={dragHandleProps}
    >
      {error && !series ? (
        <CardError message="Couldn't load spending." />
      ) : !series ? (
        <CardSkeleton lines={4} />
      ) : (
        <>
          {uncategorizedOut > 0 && (
            <div className="px-4 md:px-6 -mt-3 md:-mt-2 pb-3 md:pb-4 text-[13px] font-medium text-content-3">
              Includes <span className="tabular-nums">{formatMoney(uncategorizedOut, { precision: 'whole', showZero: true }).text}</span> uncategorized
              {' · '}
              <Link
                to={`/reviews?from=${from}&to=${to}`}
                className="tap-area inline-flex items-center font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                style={{ color: 'var(--primary)' }}
              >
                Review
              </Link>
            </div>
          )}
          <CardSection className="px-4 md:px-6 pt-4 md:pt-[22px] pb-3">
            <SpendingTrendChart
              thisMonth={series.days.map((d) => d.cumulative)}
              lastMonth={series.prior.days.map((d) => d.cumulative)}
            />
          </CardSection>
        </>
      )}
    </DashboardCard>
  );
}
