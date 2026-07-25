import { useCachedApi } from '../useCachedApi';
import DashboardCard, { CardSection, CardSkeleton, CardError } from '../DashboardCard';
import type { DashboardCardProps } from '../cardRegistry';

interface Totals {
  budgetedIncome: number; actualIncome: number;
  budgetedExpenses: number; actualExpenses: number;
  budgetedSavings: number; actualSavings: number;
}

// Design shows "$0 earned" — render zero, don't use fmtWhole's "—".
const usd0 = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

function BudgetBlock({ label, verb, budgeted, actual }: { label: string; verb: string; budgeted: number; actual: number }) {
  const pct = budgeted > 0 ? Math.min(100, Math.max(0, (actual / budgeted) * 100)) : 0;
  const remaining = budgeted - actual;
  return (
    <CardSection>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[17px] font-semibold">{label}</span>
        <span className="text-[15px] text-content-3 tabular-nums">{usd0(budgeted)} planned</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden mb-3">
        <div className="h-full rounded-full bg-positive" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[15px]">
        <span className="font-bold">{usd0(actual)} {verb}</span>
        {remaining >= 0 ? (
          <span className="text-content-3">
            <span className="font-bold tabular-nums text-positive">{usd0(remaining)}</span> remaining
          </span>
        ) : (
          <span className="text-content-3">
            <span className="font-bold tabular-nums text-negative">{usd0(-remaining)}</span> over
          </span>
        )}
      </div>
    </CardSection>
  );
}

export default function BudgetCard({ dragHandleProps }: DashboardCardProps) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data, error } = useCachedApi<{ data: { totals: Totals } }>(`/budgets/summary?month=${month}`);
  const totals = data?.data.totals ?? null;

  return (
    <DashboardCard
      title="Budget"
      subtitle={<span className="text-[16px] font-semibold text-content-3">{now.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>}
      dragHandleProps={dragHandleProps}
    >
      {error && !totals ? (
        <CardError message="Couldn't load your budget." />
      ) : !totals ? (
        <CardSkeleton lines={3} />
      ) : (
        <>
          <BudgetBlock label="Income" verb="earned" budgeted={totals.budgetedIncome} actual={totals.actualIncome} />
          <BudgetBlock label="Expenses" verb="spent" budgeted={totals.budgetedExpenses} actual={totals.actualExpenses} />
          <BudgetBlock label="Savings" verb="saved" budgeted={totals.budgetedSavings} actual={totals.actualSavings} />
        </>
      )}
    </DashboardCard>
  );
}
