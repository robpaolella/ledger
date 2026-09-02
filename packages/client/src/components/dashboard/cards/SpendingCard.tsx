import { useCachedApi } from '../useCachedApi';
import DashboardCard, { CardSection, CardSkeleton, CardError, CardHeaderControl } from '../DashboardCard';
import SpendingTrendChart from '../SpendingTrendChart';
import type { DashboardCardProps } from '../cardRegistry';

interface SeriesDay { day: number; date: string; cumulative: number }
interface SpendingSeries { month: string; days: SeriesDay[]; prior: { month: string; days: SeriesDay[] } }

const usd2 = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SpendingCard({ dragHandleProps }: DashboardCardProps) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data, error } = useCachedApi<{ data: SpendingSeries }>(`/dashboard/spending-series?month=${month}`);
  const series = data?.data ?? null;

  // Headline = the series' final cumulative point (matches the chart endpoint).
  const total = series && series.days.length > 0 ? series.days[series.days.length - 1].cumulative : 0;

  return (
    <DashboardCard
      title="Spending"
      subtitle={<>
        {series && <span className="text-[20px] font-semibold text-content-2 tabular-nums">{usd2(total)} this month</span>}
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
        <CardSection className="px-4 md:px-6 pt-4 md:pt-[22px] pb-3">
          <SpendingTrendChart
            thisMonth={series.days.map((d) => d.cumulative)}
            lastMonth={series.prior.days.map((d) => d.cumulative)}
          />
        </CardSection>
      )}
    </DashboardCard>
  );
}
