import { formatMoney } from '@ledger/shared';
import { useCachedApi } from '../useCachedApi';
import DashboardCard, { CardSection, CardSkeleton, CardError } from '../DashboardCard';
import { BudgetBar } from '../../primitives';
import type { DashboardCardProps } from '../cardRegistry';

interface Totals {
  budgetedIncome: number; actualIncome: number;
  budgetedExpenses: number; actualExpenses: number;
}

// Design shows "$0 earned", so zero reads "$0", not "—".
const whole = (n: number) => formatMoney(n, { kind: 'balance', precision: 'whole', showZero: true }).text;

function BudgetBlock({ label, verb, budgeted, actual, positive = false }: { label: string; verb: string; budgeted: number; actual: number; positive?: boolean }) {
  const remaining = budgeted - actual;
  return (
    <CardSection>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[17px] font-semibold">{label}</span>
        <span className="text-[15px] text-content-3 tabular-nums">{whole(budgeted)} planned</span>
      </div>
      {/* Same tri-state ramp as the Budget page (green / amber ≥80% / red over);
          income progress is never an over-state, so it stays green. */}
      <BudgetBar value={actual} max={budgeted} positive={positive} className="mb-3" />
      <div className="flex items-center justify-between text-[15px]">
        <span className="font-bold">{whole(actual)} {verb}</span>
        {remaining >= 0 ? (
          <span className="text-content-3">
            <span className="font-bold tabular-nums text-positive">{whole(remaining)}</span> remaining
          </span>
        ) : (
          <span className="text-content-3">
            {/* Exceeding plan is only bad for expenses — earning/saving past it stays green. */}
            <span className={`font-bold tabular-nums ${positive ? 'text-positive' : 'text-negative'}`}>{whole(-remaining)}</span> over
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
          <BudgetBlock label="Income" verb="earned" budgeted={totals.budgetedIncome} actual={totals.actualIncome} positive />
          <BudgetBlock label="Expenses" verb="spent" budgeted={totals.budgetedExpenses} actual={totals.actualExpenses} />
        </>
      )}
    </DashboardCard>
  );
}
