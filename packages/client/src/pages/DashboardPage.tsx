import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { fmtWhole, fmtTransaction } from '../lib/formatters';
import KPICard from '../components/KPICard';
import Spinner from '../components/Spinner';
import { AccountBadge, CategoryBadge, OwnerBadge, SharedBadge, SplitBadge } from '../components/badges';
import { getCategoryColor } from '../lib/categoryColors';
import PermissionGate from '../components/PermissionGate';
import { useIsMobile } from '../hooks/useIsMobile';


const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Summary {
  netWorth: number;
  liquidAssets: number;
  monthIncome: number;
  monthExpenses: number;
  totalBudgetedExpenses: number;
  priorMonthIncome: number;
  priorMonthExpenses: number;
}

interface SpendingGroup {
  groupName: string;
  totalSpent: number;
  totalBudgeted: number;
}

interface MonthlyData {
  month: number;
  totalIncome: number;
  totalExpenses: number;
}

interface Transaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  account: { id: number; name: string; lastFour: string | null; owner: string; owners?: { id: number; displayName: string }[]; isShared?: boolean };
  category: { id: number; groupName: string; subName: string; displayName: string; type: string } | null;
  splits?: { categoryId: number; groupName: string; subName: string; displayName: string; type: string; amount: number }[];
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentYear = String(now.getFullYear());
  const currentMonthIdx = now.getMonth();

  const monthName = now.toLocaleString('en-US', { month: 'long' });

  const [summary, setSummary] = useState<Summary | null>(null);
  const [spending, setSpending] = useState<SpendingGroup[]>([]);
  const [monthlyChart, setMonthlyChart] = useState<MonthlyData[]>([]);
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const allGroupNames = useMemo(() => spending.map(s => s.groupName), [spending]);

  const loadData = useCallback(async () => {
    const [sumRes, spendRes, chartRes, txnRes] = await Promise.all([
      apiFetch<{ data: Summary }>(`/dashboard/summary?month=${currentMonth}`),
      apiFetch<{ data: SpendingGroup[] }>(`/dashboard/spending-by-category?month=${currentMonth}`),
      apiFetch<{ data: MonthlyData[] }>(`/dashboard/income-vs-expenses?year=${currentYear}`),
      apiFetch<{ data: Transaction[] }>('/dashboard/recent-transactions?limit=8'),
    ]);
    setSummary(sumRes.data);
    setSpending(spendRes.data);
    setMonthlyChart(chartRes.data);
    setRecentTxns(txnRes.data);
  }, [currentMonth, currentYear]);

  useEffect(() => { loadData(); }, [loadData]);

  // Chart scaling
  const maxChartVal = useMemo(() => {
    let max = 1;
    for (const m of monthlyChart) {
      if (m.totalIncome > max) max = m.totalIncome;
      if (m.totalExpenses > max) max = m.totalExpenses;
    }
    return max;
  }, [monthlyChart]);

  const accountLabel = (a: { name: string; lastFour: string | null }) =>
    a.lastFour ? `${a.name} (${a.lastFour})` : a.name;

  if (!summary) {
    return <Spinner />;
  }

  const budgetPct = summary.totalBudgetedExpenses > 0
    ? Math.round((summary.monthExpenses / summary.totalBudgetedExpenses) * 100)
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-7">
        <div>
          <h1 className="page-title text-[22px] font-bold text-[var(--text-primary)] m-0">Dashboard</h1>
          <p className="page-subtitle text-[var(--text-secondary)] text-[13px] mt-1">{monthName} {now.getFullYear()} Overview</p>
        </div>
        <div className="flex gap-2 desktop-only">
          <PermissionGate permission="transactions.create" fallback="disabled">
            <button onClick={() => navigate('/transactions')}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Transaction
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid grid grid-cols-4 gap-4 mb-7">
        <KPICard label="Net Worth" value={fmtWhole(summary.netWorth)} onClick={() => navigate('/net-worth')} />
        <KPICard label="Liquid Assets" value={fmtWhole(summary.liquidAssets)} onClick={() => navigate('/net-worth')} />
        <KPICard
          label={`${monthName.slice(0, 3)} Income`}
          value={fmtWhole(summary.monthIncome)}
          subtitle={summary.monthIncome >= summary.priorMonthIncome && summary.priorMonthIncome > 0 ? 'On track' : undefined}
          trend={summary.monthIncome >= summary.priorMonthIncome ? 'up' : 'down'}
          onClick={() => navigate('/reports')}
        />
        <KPICard
          label={`${monthName.slice(0, 3)} Expenses`}
          value={fmtWhole(summary.monthExpenses)}
          subtitle={summary.totalBudgetedExpenses > 0 ? `${budgetPct}% of budget` : undefined}
          trend="neutral"
          onClick={() => navigate('/reports')}
        />
      </div>

      {/* Two-Column: Spending + Chart */}
      <div className={`grid gap-5 mb-7 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {/* Spending by Category */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)]">
          <h3 className="text-[14px] font-bold text-[var(--text-primary)] m-0">Spending by Category</h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 mb-3">Parent categories total all sub-categories</p>
          <div className="flex flex-col gap-3.5">
            {spending.map((s) => {
              const allGroups = spending.map((x) => x.groupName);
              const color = getCategoryColor(s.groupName, allGroups);
              const pct = s.totalBudgeted > 0 ? Math.min(100, (s.totalSpent / s.totalBudgeted) * 100) : 100;
              const overBudget = s.totalBudgeted > 0 && s.totalSpent > s.totalBudgeted;
              return (
                <div key={s.groupName}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="font-semibold text-[var(--btn-secondary-text)] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm inline-block" style={{ background: color }} />{s.groupName}
                    </span>
                    <span className="text-[var(--text-secondary)] font-mono text-[11px]">
                      {fmtWhole(s.totalSpent)}{s.totalBudgeted > 0 ? ` / ${fmtWhole(s.totalBudgeted)}` : ''}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--badge-account-bg)] rounded-sm overflow-hidden">
                    <div className="h-full rounded-sm" style={{
                      width: `${pct}%`,
                      background: overBudget ? '#ef4444' : color,
                    }} />
                  </div>
                </div>
              );
            })}
            {spending.length === 0 && (
              <p className="text-[12px] text-[var(--text-muted)] py-4 text-center">No spending this month</p>
            )}
          </div>
        </div>

        {/* Income vs Expenses Chart */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)]">
          <h3 className="text-[14px] font-bold text-[var(--text-primary)] m-0">Income vs Expenses ({currentYear})</h3>
          <div className="flex items-end gap-1.5 mt-4 h-[160px] pb-5">
            {monthlyChart.map((m, i) => {
              const isFuture = i > currentMonthIdx;
              const incH = maxChartVal > 0 ? (m.totalIncome / maxChartVal) * 130 : 0;
              const expH = maxChartVal > 0 ? (m.totalExpenses / maxChartVal) * 130 : 0;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="flex gap-0.5 items-end h-[130px]">
                    <div className="w-2 rounded-t-sm" style={{
                      height: `${isFuture ? 40 : Math.max(incH, 2)}px`,
                      background: isFuture ? 'var(--table-border)' : (m.totalIncome > 0 ? '#3b82f6' : 'var(--table-border)'),
                    }} />
                    <div className="w-2 rounded-t-sm" style={{
                      height: `${isFuture ? 30 : Math.max(expH, 2)}px`,
                      background: isFuture ? 'var(--table-border)' : (m.totalExpenses > 0 ? '#f97316' : 'var(--table-border)'),
                    }} />
                  </div>
                  <span className={`text-[10px] font-mono font-medium ${isFuture ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`}>
                    {MONTH_LABELS[i]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 justify-center mt-1">
            {[{ c: '#3b82f6', l: 'Income' }, { c: '#f97316', l: 'Expenses' }].map((x) => (
              <span key={x.l} className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                <span className="w-2 h-2 rounded-sm inline-block" style={{ background: x.c }} />{x.l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      {isMobile ? (
        /* Mobile: Standalone cards */
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[14px] font-bold text-[var(--text-primary)] m-0">Recent Transactions</h3>
            <button onClick={() => navigate('/transactions')}
              className="text-[12px] text-[#3b82f6] font-medium bg-transparent border-none cursor-pointer px-2 py-1 rounded-md btn-ghost">
              View All →
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {(recentTxns.length > 5 ? recentTxns.slice(0, 5) : recentTxns).map((t) => {
              const catType = t.category?.type || t.splits?.[0]?.type || 'expense';
              const { text: amtText, className: amtClass } = fmtTransaction(t.amount, catType);
              return (
                <div key={t.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] px-3.5 py-2.5 flex justify-between items-center">
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">{t.description}</div>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[var(--text-muted)]">
                      <span className="font-mono text-[10px]">{t.date}</span>
                      <span>·</span>
                      {t.splits && t.splits.length > 0 ? (
                        <SplitBadge colors={t.splits.map(s => getCategoryColor(s.groupName, allGroupNames))} count={t.splits.length} compact />
                      ) : t.category ? (
                        <CategoryBadge name={t.category.subName} color={getCategoryColor(t.category.groupName, allGroupNames)} />
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)]">—</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-[14px] font-mono font-semibold ${amtClass}`}>{amtText}</div>
                    <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{accountLabel(t.account)}</div>
                  </div>
                </div>
              );
            })}
            {recentTxns.length === 0 && (
              <p className="text-center py-8 text-[var(--text-muted)] text-[13px]">No transactions yet</p>
            )}
          </div>
        </div>
      ) : (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)]">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-[14px] font-bold text-[var(--text-primary)] m-0">Recent Transactions</h3>
          <button onClick={() => navigate('/transactions')}
            className="text-[12px] text-[#3b82f6] font-medium bg-transparent border-none cursor-pointer px-2 py-1 rounded-md btn-ghost">
            View All →
          </button>
        </div>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Date</th>
                <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Description</th>
                <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Account</th>
                <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Category</th>
                <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Sub-Category</th>
                <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentTxns.map((t) => {
                const catType = t.category?.type || t.splits?.[0]?.type || 'expense';
                const { text: amtText, className: amtClass } = fmtTransaction(t.amount, catType);
                return (
                  <tr key={t.id} className="border-b border-[var(--table-row-border)]">
                    <td className="px-2.5 py-2 font-mono text-[12px] text-[var(--text-body)]">{t.date}</td>
                    <td className="px-2.5 py-2 text-[var(--text-primary)] font-medium">{t.description}</td>
                    <td className="px-2.5 py-2">
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <AccountBadge name={accountLabel(t.account)} />
                        {t.account.isShared ? (
                          <SharedBadge />
                        ) : t.account.owners?.length === 1 ? (
                          <OwnerBadge user={t.account.owners[0]} />
                        ) : null}
                      </span>
                    </td>
                    <td className="px-2.5 py-2">
                      {t.splits && t.splits.length > 0 ? (
                        <span className="text-[11px] text-[var(--text-muted)] italic">Split</span>
                      ) : t.category ? (
                        <div className="flex items-center gap-1.5">
                          <span style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: getCategoryColor(t.category.groupName, allGroupNames),
                            display: 'inline-block', flexShrink: 0,
                          }} />
                          <span className="text-[11px] text-[var(--text-secondary)]">{t.category.groupName}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2">
                      {t.splits && t.splits.length > 0 ? (
                        <SplitBadge colors={t.splits.map(s => getCategoryColor(s.groupName, allGroupNames))} count={t.splits.length} compact />
                      ) : t.category ? (
                        <CategoryBadge name={t.category.subName} color={getCategoryColor(t.category.groupName, allGroupNames)} />
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className={`px-2.5 py-2 text-right font-mono font-semibold ${amtClass}`}>{amtText}</td>
                  </tr>
                );
              })}
              {recentTxns.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-[var(--text-muted)] text-[13px]">No transactions yet</td>
                </tr>
              )}
            </tbody>
          </table>
      </div>
      )}
    </div>
  );
}
