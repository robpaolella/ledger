import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCachedApi } from '../useCachedApi';
import DashboardCard, { CardSection, CardSkeleton, CardError, CardHeaderControl } from '../DashboardCard';
import type { DashboardCardProps } from '../cardRegistry';

interface Counts { open: number; assignedToMe: number }

export default function ReviewsCard({ dragHandleProps }: DashboardCardProps) {
  const navigate = useNavigate();
  const { data, error, refresh } = useCachedApi<{ data: Counts }>('/reviews/count');
  const counts = data?.data ?? null;

  useEffect(() => {
    window.addEventListener('reviews-changed', refresh);
    return () => window.removeEventListener('reviews-changed', refresh);
  }, [refresh]);

  return (
    <DashboardCard
      title="Reviews"
      subtitle={<span className="text-[15px] font-semibold text-content-3">Needs your attention</span>}
      headerRight={<CardHeaderControl small onClick={() => navigate('/reviews')}>Open queue</CardHeaderControl>}
      dragHandleProps={dragHandleProps}
    >
      {error && !counts ? (
        <CardError message="Couldn't load reviews." />
      ) : !counts ? (
        <CardSkeleton lines={2} />
      ) : counts.open > 0 ? (
        <CardSection>
          <div className="flex items-baseline gap-3">
            <span className="text-[22px] font-extrabold tabular-nums">{counts.open}</span>
            <span className="text-[15px] text-content-3">transaction{counts.open === 1 ? '' : 's'} need{counts.open === 1 ? 's' : ''} review</span>
          </div>
          {counts.assignedToMe > 0 && (
            <button
              type="button"
              onClick={() => navigate('/reviews?assignee=me')}
              className="mt-2 text-[13px] font-semibold text-primary"
            >
              {counts.assignedToMe} assigned to you →
            </button>
          )}
        </CardSection>
      ) : (
        <CardError message="All caught up." />
      )}
    </DashboardCard>
  );
}
