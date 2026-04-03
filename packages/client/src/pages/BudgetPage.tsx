import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { fmt, fmtWhole } from '../lib/formatters';
import KPICard from '../components/KPICard';
import OwnerFilter from '../components/OwnerFilter';
import Spinner from '../components/Spinner';
import InlineNotification from '../components/InlineNotification';
import ResponsiveModal from '../components/ResponsiveModal';
import PermissionGate from '../components/PermissionGate';
import { getCategoryColor } from '../lib/categoryColors';
import ScrollableList from '../components/ScrollableList';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useIsMobile } from '../hooks/useIsMobile';

interface IncomeRow {
  categoryId: number;
  subName: string;
  budgeted: number;
  budgetId: number | null;
  actual: number;
}

interface ExpenseSub {
  categoryId: number;
  subName: string;
  budgeted: number;
  budgetId: number | null;
  actual: number;
}

interface ExpenseGroup {
  groupName: string;
  subs: ExpenseSub[];
}

interface Totals {
  budgetedIncome: number;
  actualIncome: number;
  budgetedExpenses: number;
  actualExpenses: number;
}

interface BudgetSummary {
  income: IncomeRow[];
  expenseGroups: ExpenseGroup[];
  totals: Totals;
}

type ConflictAction = 'skip' | 'overwrite' | 'add';

interface TemplateImportRow {
  categoryId: number;
  subName: string;
  groupName: string;
  categoryType: string;
  templateAmount: number;
  existingAmount: number | null;
  hasConflict: boolean;
  action: ConflictAction;
}

interface RecurringImportRow {
  id: number;
  label: string;
  categoryId: number;
  subName: string;
  presetAmount: number | null;
  importAmount: string;
  included: boolean;
}

function monthStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function shortMonth(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short' });
}

function prevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function nextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export default function BudgetPage() {
  const { hasPermission } = useAuth();
  const isMobile = useIsMobile();
  const { addToast } = useToast();
  const canEditBudgets = hasPermission('budgets.edit');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [owner, setOwner] = useState('All');
  const [data, setData] = useState<BudgetSummary | null>(null);
  const [editingCell, setEditingCell] = useState<{ categoryId: number; value: string } | null>(null);
  const [users, setUsers] = useState<{ id: number; displayName: string }[]>([]);

  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState(0);
  const [templateRows, setTemplateRows] = useState<TemplateImportRow[]>([]);
  const [recurringRows, setRecurringRows] = useState<RecurringImportRow[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    apiFetch<{ data: { id: number; display_name: string }[] }>('/users').then((res) =>
      setUsers(res.data.map((u) => ({ id: u.id, displayName: u.display_name })))
    );
  }, []);

  const loadData = useCallback(async () => {
    const res = await apiFetch<{ data: BudgetSummary }>(
      `/budgets/summary?month=${monthStr(month)}&owner=${owner === 'All' ? 'all' : owner}`
    );
    setData(res.data);
  }, [month, owner]);

  useEffect(() => { loadData(); }, [loadData]);

  const saveBudget = async (categoryId: number, amount: number) => {
    await apiFetch('/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId, month: monthStr(month), amount }),
    });
    await loadData();
  };

  const handleBudgetKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, categoryId: number) => {
    if (e.key === 'Enter') {
      const val = parseFloat(editingCell?.value || '0');
      if (!isNaN(val) && val >= 0) {
        saveBudget(categoryId, val);
      }
      setEditingCell(null);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const handleBudgetBlur = (categoryId: number) => {
    const val = parseFloat(editingCell?.value || '0');
    if (!isNaN(val) && val >= 0) {
      saveBudget(categoryId, val);
    }
    setEditingCell(null);
  };

  const openImportWizard = async () => {
    try {
      const currentMonth = monthStr(month);
      const monthNum = month.getMonth() + 1;

      const [tplRes, recurRes, budgetRes] = await Promise.all([
        apiFetch<{ data: any[] }>('/budget-templates'),
        apiFetch<{ data: any[] }>(`/budget-recurring?month=${monthNum}`),
        apiFetch<{ data: any[] }>(`/budgets?month=${currentMonth}`),
      ]);

      const existingMap = new Map<number, number>();
      for (const b of budgetRes.data) {
        existingMap.set(b.category_id, b.amount);
      }

      const tRows: TemplateImportRow[] = tplRes.data.map((t: any) => {
        const existing = existingMap.get(t.category_id) ?? null;
        return {
          categoryId: t.category_id,
          subName: t.sub_name,
          groupName: t.type === 'income' ? 'Income' : t.group_name,
          categoryType: t.type,
          templateAmount: t.amount,
          existingAmount: existing,
          hasConflict: existing !== null,
          action: 'skip' as ConflictAction,
        };
      });

      const rRows: RecurringImportRow[] = recurRes.data.map((r: any) => ({
        id: r.id,
        label: r.label,
        categoryId: r.category_id,
        subName: r.sub_name,
        presetAmount: r.amount,
        importAmount: r.amount != null ? String(r.amount) : '',
        included: true,
      }));

      setTemplateRows(tRows);
      setRecurringRows(rRows);
      setImportStep(0);
      setImportOpen(true);
    } catch {
      addToast('Failed to load import data', 'error');
    }
  };

  const handleApply = async () => {
    setImporting(true);
    try {
      const items: { categoryId: number; amount: number; source: string; action: string }[] = [];

      for (const row of templateRows) {
        if (row.hasConflict && row.action === 'skip') continue;
        items.push({
          categoryId: row.categoryId,
          amount: row.templateAmount,
          source: 'template',
          action: row.hasConflict ? row.action : 'overwrite',
        });
      }

      for (const row of recurringRows) {
        if (!row.included) continue;
        const amt = parseFloat(row.importAmount);
        if (isNaN(amt) || amt <= 0) continue;
        items.push({
          categoryId: row.categoryId,
          amount: amt,
          source: 'recurring',
          action: 'add',
        });
      }

      const res = await apiFetch<{ data: { created: number; updated: number; skipped: number } }>('/budgets/import', {
        method: 'POST',
        body: JSON.stringify({ month: monthStr(month), items }),
      });

      addToast(`Budget imported: ${res.data.created} created, ${res.data.updated} updated`, 'success');
      setImportOpen(false);
      await loadData();
    } catch {
      addToast('Failed to import budget', 'error');
    } finally {
      setImporting(false);
    }
  };

  if (!data) {
    return <Spinner />;
  }

  const { income, expenseGroups, totals } = data;
  const incDiff = totals.actualIncome - totals.budgetedIncome;
  const expRemaining = totals.budgetedExpenses - totals.actualExpenses;

  return (
    <div className={isMobile ? '' : 'flex flex-col'} style={isMobile ? undefined : { height: 'calc(100vh - 56px)' }}>
      {/* Header */}
      {isMobile ? (
        <div className="mb-4 flex-shrink-0">
          {/* Centered month nav */}
          <div className="flex justify-center items-center gap-4 mb-3">
            <button onClick={() => setMonth(prevMonth(month))}
              className="text-[20px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer p-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
              ←
            </button>
            <span className="text-[15px] font-bold text-[var(--text-primary)]">
              {monthLabel(month)}
            </span>
            <button onClick={() => setMonth(nextMonth(month))}
              className="text-[20px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer p-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
              →
            </button>
          </div>
          {/* Nav links */}
          <div className="flex justify-center items-center gap-3 mb-3">
            <Link to="/budget/template" className="text-[12px] text-[var(--color-accent)] hover:underline no-underline">Template</Link>
            <span className="text-[var(--text-muted)]">·</span>
            <Link to="/budget/recurring" className="text-[12px] text-[var(--color-accent)] hover:underline no-underline">Recurring</Link>
          </div>
          {/* Scrollable owner chip row */}
          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {[{ name: 'All', id: 0 }, ...users.map(u => ({ name: u.displayName, id: u.id }))].map((o) => (
              <button key={o.id} onClick={() => setOwner(o.name === 'All' ? 'All' : o.name)}
                className="flex-shrink-0 border-none cursor-pointer rounded-2xl text-[11px] px-3.5 py-1.5"
                style={{
                  background: (o.name === 'All' ? owner === 'All' : owner === o.name) ? 'var(--color-accent)' : 'var(--bg-card)',
                  color: (o.name === 'All' ? owner === 'All' : owner === o.name) ? '#fff' : 'var(--text-secondary)',
                  fontWeight: (o.name === 'All' ? owner === 'All' : owner === o.name) ? 600 : 400,
                  boxShadow: (o.name === 'All' ? owner === 'All' : owner === o.name) ? 'none' : 'inset 0 0 0 1px var(--bg-card-border)',
                }}>
                {o.name}
              </button>
            ))}
          </div>
          {/* Import from Template button */}
          <PermissionGate permission="budgets.edit" fallback="disabled">
            <button
              onClick={openImportWizard}
              className="w-full mt-2 text-[12px] text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] border-none rounded-lg px-3 py-2 cursor-pointer font-semibold btn-primary min-h-[44px]"
            >
              Import from Template
            </button>
          </PermissionGate>
        </div>
      ) : (
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="page-title text-[22px] font-bold text-[var(--text-primary)] m-0">Monthly Budget</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="page-subtitle text-[var(--text-secondary)] text-[13px] m-0">{monthLabel(month)}</p>
            <span className="text-[var(--text-muted)]">·</span>
            <Link to="/budget/template" className="text-[12px] text-[var(--color-accent)] hover:underline no-underline">Template</Link>
            <Link to="/budget/recurring" className="text-[12px] text-[var(--color-accent)] hover:underline no-underline">Recurring</Link>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <PermissionGate permission="budgets.edit" fallback="disabled">
            <button
              onClick={openImportWizard}
              className="text-[12px] text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] border-none rounded-lg px-3 py-1.5 cursor-pointer font-semibold btn-primary"
            >
              Import from Template
            </button>
          </PermissionGate>
          <OwnerFilter value={owner} onChange={setOwner} users={users} />
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setMonth(prevMonth(month))}
              className="text-[12px] text-[var(--btn-secondary-text)] bg-[var(--btn-secondary-bg)] border-none rounded-md px-2.5 py-1.5 cursor-pointer font-medium btn-secondary"
            >
              ← {shortMonth(prevMonth(month))}
            </button>
            <span className="text-[13px] font-semibold text-[var(--text-primary)] px-2">
              {shortMonth(month)} {month.getFullYear()}
            </span>
            <button
              onClick={() => setMonth(nextMonth(month))}
              className="text-[12px] text-[var(--btn-secondary-text)] bg-[var(--btn-secondary-bg)] border-none rounded-md px-2.5 py-1.5 cursor-pointer font-medium btn-secondary"
            >
              {shortMonth(nextMonth(month))} →
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Owner Info Bar */}
      {owner !== 'All' && (
        <InlineNotification type="info" message={`Showing data from ${owner}'s accounts (including shared accounts)`} className="mb-4" />
      )}

      {/* KPI Cards */}
      <div className="kpi-grid grid grid-cols-4 gap-4 mb-6 flex-shrink-0">
        <KPICard label="Budgeted Income" value={fmtWhole(totals.budgetedIncome)} />
        <KPICard
          label="Actual Income"
          value={fmtWhole(totals.actualIncome)}
          subtitle={totals.budgetedIncome > 0
            ? (totals.actualIncome >= totals.budgetedIncome ? 'On track' : `${fmtWhole(totals.budgetedIncome - totals.actualIncome)} remaining`)
            : undefined}
          trend={totals.actualIncome >= totals.budgetedIncome ? 'up' : 'down'}
        />
        <KPICard label="Budgeted Expenses" value={fmtWhole(totals.budgetedExpenses)} />
        <KPICard
          label="Actual Expenses"
          value={fmtWhole(totals.actualExpenses)}
          subtitle={totals.budgetedExpenses > 0 ? `${fmtWhole(expRemaining)} remaining` : undefined}
          trend="up"
        />
      </div>

      {/* Income + Expenses */}
      {isMobile ? (
        /* Mobile: Card-based layout */
        <div className="flex flex-col gap-3">
          {/* Income Card */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-4 py-3 shadow-[var(--bg-card-shadow)]">
            <div className="text-[13px] font-bold text-[var(--text-primary)] mb-2.5">Income</div>
            {income.map((r, i) => {
              const isEditing = editingCell?.categoryId === r.categoryId;
              return (
                <div key={r.categoryId} className="flex items-center py-1.5"
                  style={{ borderBottom: i < income.length - 1 ? '1px solid var(--bg-card-border)' : 'none' }}>
                  <span className="flex-1 min-w-0 truncate text-[12px] text-[var(--text-body)]">{r.subName}</span>
                  <div className="flex gap-3 flex-shrink-0 ml-2">
                    <div className="w-[70px]">
                      <div
                        className={`flex items-center w-full rounded ${
                          isEditing
                            ? 'ring-1 ring-[#3b82f6] bg-[var(--bg-input)]'
                            : canEditBudgets ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : ''
                        }`}
                        onClick={() => !isEditing && canEditBudgets && setEditingCell({ categoryId: r.categoryId, value: String(r.budgeted || '') })}
                      >
                        <span className="pl-1 text-[12px] font-mono text-[var(--text-muted)] flex-shrink-0 select-none">$</span>
                        {isEditing ? (
                          <input type="text" inputMode="decimal" autoFocus
                            className="flex-1 min-w-0 text-right font-mono text-[12px] py-0.5 pr-1 no-focus-ring bg-transparent outline-none border-none text-[var(--text-body)]"
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ categoryId: r.categoryId, value: e.target.value.replace(/[^0-9]/g, '') })}
                            onKeyDown={(e) => handleBudgetKeyDown(e, r.categoryId)}
                            onBlur={() => handleBudgetBlur(r.categoryId)}
                          />
                        ) : (
                          <span className="flex-1 text-right font-mono text-[12px] py-0.5 pr-1 text-[var(--text-muted)]">
                            {r.budgeted > 0 ? r.budgeted.toLocaleString('en-US') : '0'}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="w-[70px] text-right text-[12px] font-mono font-semibold text-[var(--text-primary)] flex items-center justify-end">
                      {r.actual > 0 ? fmt(r.actual) : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expense Group Cards */}
          {expenseGroups.map((g) => {
            const allGroups = expenseGroups.map((x) => x.groupName);
            const color = getCategoryColor(g.groupName, allGroups);
            return (
              <div key={g.groupName} className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-4 py-3 shadow-[var(--bg-card-shadow)]">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: color }} />
                  <span className="text-[13px] font-bold text-[var(--text-primary)]">{g.groupName}</span>
                </div>
                {g.subs.map((sub, si) => {
                  const pct = sub.budgeted > 0 ? Math.min(100, (sub.actual / sub.budgeted) * 100) : 0;
                  const overBudget = sub.budgeted > 0 && sub.actual > sub.budgeted;
                  const isEditing = editingCell?.categoryId === sub.categoryId;
                  return (
                    <div key={sub.categoryId} style={{ marginBottom: si < g.subs.length - 1 ? 10 : 0 }}>
                      <div className="flex items-center mb-0.5">
                        <span className="flex-1 min-w-0 truncate text-[12px] text-[var(--text-body)]">{sub.subName}</span>
                        <div className="flex items-center flex-shrink-0 ml-2">
                          <span className="text-[11px] font-mono text-[var(--text-muted)]">
                            {sub.actual !== 0 ? fmt(sub.actual) : '—'} /
                          </span>
                          <div className="w-[55px] flex-shrink-0 ml-1">
                            <div
                              className={`flex items-center w-full rounded ${
                                isEditing
                                  ? 'ring-1 ring-[#3b82f6] bg-[var(--bg-input)]'
                                  : canEditBudgets ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : ''
                              }`}
                              onClick={() => !isEditing && canEditBudgets && setEditingCell({ categoryId: sub.categoryId, value: String(sub.budgeted || '') })}
                            >
                              <span className="pl-0.5 text-[11px] font-mono text-[var(--text-muted)] flex-shrink-0 select-none">$</span>
                              {isEditing ? (
                                <input type="text" inputMode="decimal" autoFocus
                                  className="flex-1 min-w-0 text-right text-[11px] font-mono py-0.5 pr-0.5 no-focus-ring bg-transparent outline-none border-none text-[var(--text-body)]"
                                  value={editingCell.value}
                                  onChange={(e) => setEditingCell({ categoryId: sub.categoryId, value: e.target.value.replace(/[^0-9]/g, '') })}
                                  onKeyDown={(e) => handleBudgetKeyDown(e, sub.categoryId)}
                                  onBlur={() => handleBudgetBlur(sub.categoryId)}
                                />
                              ) : (
                                <span className={`flex-1 text-right text-[11px] font-mono py-0.5 pr-0.5 ${overBudget ? 'text-[#ef4444]' : 'text-[var(--text-body)]'}`}>
                                  {sub.budgeted > 0 ? sub.budgeted.toLocaleString('en-US') : '0'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      {sub.budgeted > 0 && (
                        <div className="h-[5px] rounded-sm overflow-hidden" style={{ background: 'var(--progress-track)' }}>
                          <div className="h-full rounded-sm" style={{
                            width: `${pct}%`,
                            background: overBudget ? '#ef4444' : color,
                          }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
      /* Desktop: Two Column Income + Expenses */
      <div className="grid gap-5 grid-cols-2 flex-1 min-h-[300px]">
        {/* Income */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)] flex flex-col min-h-0">
          <h3 className="text-[14px] font-bold text-[#10b981] m-0">Income</h3>
          <div className="flex-1 min-h-0 mt-2">
            <ScrollableList maxHeight="100%">
              <table className="w-full border-collapse table-fixed">
                <thead>
                  <tr>
                    <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Category</th>
                    <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-right w-[80px]">Budget</th>
                    <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-right w-[90px]">Actual</th>
                    <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-right w-[100px]">Diff</th>
                  </tr>
                </thead>
            <tbody>
              {income.map((r) => {
                const diff = r.actual - r.budgeted;
                const isEditing = editingCell?.categoryId === r.categoryId;
                return (
                  <tr key={r.categoryId} className="border-b border-[var(--table-row-border)]">
                    <td className="px-2.5 py-1.5 text-[13px] font-medium text-[var(--text-primary)]">{r.subName}</td>
                    <td className="px-1 py-1">
                      <div
                        className={`flex items-center w-full rounded ${
                          isEditing
                            ? 'ring-1 ring-[#3b82f6] bg-[var(--bg-input)]'
                            : canEditBudgets ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : ''
                        }`}
                        onClick={() => !isEditing && canEditBudgets && setEditingCell({ categoryId: r.categoryId, value: String(r.budgeted || '') })}
                      >
                        <span className="pl-1.5 text-[11px] font-mono text-[var(--text-muted)] flex-shrink-0 select-none">$</span>
                        {isEditing ? (
                          <input
                            type="text"
                            autoFocus
                            inputMode="decimal"
                            className="flex-1 min-w-0 text-right text-[11px] font-mono py-1 pr-1.5 no-focus-ring bg-transparent outline-none border-none text-[var(--text-body)]"
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ categoryId: r.categoryId, value: e.target.value.replace(/[^0-9]/g, '') })}
                            onKeyDown={(e) => handleBudgetKeyDown(e, r.categoryId)}
                            onBlur={() => handleBudgetBlur(r.categoryId)}
                          />
                        ) : (
                          <span className="flex-1 text-right text-[11px] font-mono py-1 pr-1.5 text-[var(--text-body)]">
                            {r.budgeted > 0 ? r.budgeted.toLocaleString('en-US') : '0'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                      {r.actual > 0 ? fmt(r.actual) : '—'}
                    </td>
                    <td className={`px-2.5 py-1.5 text-right font-mono text-[11px] ${
                      (r.budgeted > 0 || r.actual > 0) ? (diff >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]') : 'text-[var(--text-muted)]'
                    }`}>
                      {(r.budgeted > 0 || r.actual > 0) ? `${diff >= 0 ? '+' : ''}${fmt(diff)}` : '—'}
                    </td>
                  </tr>
                );
              })}
              {/* Total Row */}
              <tr className="bg-[var(--bg-hover)]">
                <td className="px-2.5 py-2 text-[13px] font-bold text-[var(--text-primary)]">Total</td>
                <td className="px-2.5 py-2 text-right font-mono text-[11px] font-bold text-[var(--text-primary)]">{fmt(totals.budgetedIncome)}</td>
                <td className="px-2.5 py-2 text-right font-mono text-[11px] font-bold text-[var(--text-primary)]">{fmt(totals.actualIncome)}</td>
                <td className={`px-2.5 py-2 text-right font-mono text-[11px] font-bold ${incDiff >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                  {incDiff >= 0 ? '+' : ''}{fmt(incDiff)}
                </td>
              </tr>
            </tbody>
          </table>
            </ScrollableList>
          </div>
        </div>

        {/* Expenses */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)] flex flex-col min-h-0">
          <h3 className="text-[14px] font-bold text-[#f97316] m-0">Expenses</h3>
          <div className="flex-1 min-h-0 mt-2">
            <ScrollableList maxHeight="100%">
            {expenseGroups.map((g) => {
              const gBudgeted = g.subs.reduce((s, sub) => s + sub.budgeted, 0);
              const gActual = g.subs.reduce((s, sub) => s + sub.actual, 0);
              const allGroups = expenseGroups.map((x) => x.groupName);
              const color = getCategoryColor(g.groupName, allGroups);
              return (
                <div key={g.groupName} className="mb-3.5">
                  {/* Group Header */}
                  <div className="flex justify-between py-1.5" style={{ borderBottom: `2px solid ${color}30` }}>
                    <span className="font-bold text-[12px] text-[var(--btn-secondary-text)] uppercase tracking-[0.05em] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm inline-block" style={{ background: color }} />
                      {g.groupName}
                    </span>
                    <span className={`font-semibold text-[12px] font-mono ${gBudgeted > 0 && gActual > gBudgeted ? 'text-[#ef4444]' : 'text-[var(--text-secondary)]'}`}>
                      {gActual !== 0 ? fmt(gActual) : '—'} / {gBudgeted > 0 ? fmt(gBudgeted) : '—'}
                    </span>
                  </div>
                  {/* Sub-category rows */}
                  {g.subs.map((sub) => {
                    const pct = sub.budgeted > 0 ? Math.min(100, (sub.actual / sub.budgeted) * 100) : (sub.actual !== 0 ? 100 : 0);
                    const overBudget = sub.budgeted > 0 && sub.actual > sub.budgeted;
                    const isEditing = editingCell?.categoryId === sub.categoryId;
                    return (
                      <div key={sub.categoryId} className="flex items-center py-1 pl-3.5 gap-2">
                        <span className="flex-1 text-[12px] text-[var(--text-body)]">{sub.subName}</span>
                        <div className="w-[50px] h-1 bg-[var(--progress-track)] rounded-sm overflow-hidden">
                          <div className="h-full rounded-sm" style={{
                            width: `${pct}%`,
                            background: sub.budgeted > 0 && sub.actual > sub.budgeted ? '#ef4444' : color,
                          }} />
                        </div>
                        <span className="w-[80px] text-right text-[11px] font-mono text-[var(--text-secondary)]">
                          {sub.actual !== 0 ? fmt(sub.actual) : '—'}
                        </span>
                        <div className="w-[80px] flex-shrink-0">
                          <div
                            className={`flex items-center w-full rounded ${
                              isEditing
                                ? 'ring-1 ring-[#3b82f6] bg-[var(--bg-input)]'
                                : canEditBudgets ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : ''
                            }`}
                            onClick={() => !isEditing && canEditBudgets && setEditingCell({ categoryId: sub.categoryId, value: String(sub.budgeted || '') })}
                          >
                            <span className="pl-1 text-[11px] font-mono text-[var(--text-muted)] flex-shrink-0 select-none">$</span>
                            {isEditing ? (
                              <input
                                type="text"
                                autoFocus
                                inputMode="decimal"
                                className="flex-1 min-w-0 text-right text-[11px] font-mono py-0.5 pr-1 no-focus-ring bg-transparent outline-none border-none text-[var(--text-body)]"
                                value={editingCell.value}
                                onChange={(e) => setEditingCell({ categoryId: sub.categoryId, value: e.target.value.replace(/[^0-9]/g, '') })}
                                onKeyDown={(e) => handleBudgetKeyDown(e, sub.categoryId)}
                                onBlur={() => handleBudgetBlur(sub.categoryId)}
                              />
                            ) : (
                              <span className={`flex-1 text-right text-[11px] font-mono py-0.5 pr-1 ${overBudget ? 'text-[#ef4444]' : 'text-[var(--text-muted)]'}`}>
                                {sub.budgeted > 0 ? sub.budgeted.toLocaleString('en-US') : '0'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            </ScrollableList>
          </div>
        </div>
      </div>
      )}

      {/* Import Wizard Modal */}
      <ResponsiveModal
        title="Import Budget"
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        maxWidth="600px"
      >
        {importStep === 0 && (
          <div>
            <div className="mb-1">
              <p className="text-[14px] font-bold text-[var(--text-primary)] m-0">Step 1 of 3 — Import Monthly Template</p>
              <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 mb-3">Importing into: {monthLabel(month)}</p>
            </div>

            {templateRows.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[13px] text-[var(--text-muted)] mb-2">No template entries found.</p>
                <Link to="/budget/template" className="text-[13px] text-[var(--color-accent)] hover:underline no-underline"
                  onClick={() => setImportOpen(false)}>
                  Set up your template first →
                </Link>
              </div>
            ) : (
              <>
                {templateRows.some(r => r.hasConflict) && (
                  <div className="bg-[var(--bg-inline-warning)] border border-[var(--bg-inline-warning-border)] rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
                    <span className="text-[12px] text-[var(--text-primary)]">
                      {templateRows.filter(r => r.hasConflict).length} categories already have budget values
                    </span>
                    <select
                      className="text-[12px] font-semibold rounded-md px-2 py-1 border border-[var(--bg-input-border)] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none cursor-pointer"
                      value=""
                      onChange={(e) => {
                        const action = e.target.value as ConflictAction;
                        if (!action) return;
                        setTemplateRows(prev => prev.map(r => r.hasConflict ? { ...r, action } : r));
                      }}
                    >
                      <option value="">Set all conflicts…</option>
                      <option value="skip">Skip</option>
                      <option value="overwrite">Overwrite</option>
                      <option value="add">Add to existing</option>
                    </select>
                  </div>
                )}

                {(() => {
                  const groups = new Map<string, TemplateImportRow[]>();
                  for (const row of templateRows) {
                    const g = groups.get(row.groupName) || [];
                    g.push(row);
                    groups.set(row.groupName, g);
                  }
                  return Array.from(groups.entries()).map(([groupName, rows]) => (
                    <div key={groupName} className="mb-3">
                      <div className="bg-[var(--bg-hover)] px-3 py-1.5 rounded-md mb-1">
                        <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em]">{groupName}</span>
                      </div>
                      <div className="grid grid-cols-[1fr_70px_70px_100px] gap-x-2 px-3 py-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em]">
                        <span>Category</span>
                        <span className="text-right">Template</span>
                        <span className="text-right">Current</span>
                        <span className="text-right">Action</span>
                      </div>
                      {rows.map(row => (
                        <div key={row.categoryId} className="grid grid-cols-[1fr_70px_70px_100px] gap-x-2 px-3 py-1.5 items-center border-b border-[var(--table-row-border)]">
                          <span className="text-[12px] text-[var(--text-body)] truncate">{row.subName}</span>
                          <span className="text-right text-[12px] font-mono text-[var(--text-primary)]">{fmt(row.templateAmount)}</span>
                          <span className="text-right text-[12px] font-mono text-[var(--text-muted)]">
                            {row.existingAmount !== null ? fmt(row.existingAmount) : '—'}
                          </span>
                          <div className="text-right">
                            {row.hasConflict ? (
                              <select
                                className="text-[12px] font-semibold rounded-md px-2 py-1 border border-[var(--bg-input-border)] bg-[var(--bg-input)] text-[var(--text-primary)] outline-none cursor-pointer"
                                value={row.action}
                                onChange={(e) => setTemplateRows(prev => prev.map(r =>
                                  r.categoryId === row.categoryId ? { ...r, action: e.target.value as ConflictAction } : r
                                ))}
                              >
                                <option value="skip">Skip</option>
                                <option value="overwrite">Overwrite</option>
                                <option value="add">Add</option>
                              </select>
                            ) : (
                              <span className="inline-block text-[11px] font-semibold text-[#10b981] bg-[#10b98118] rounded px-2 py-0.5">Add</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ));
                })()}
              </>
            )}

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[var(--bg-card-border)]">
              <button
                onClick={() => setImportOpen(false)}
                className="text-[12px] text-[var(--btn-secondary-text)] bg-[var(--btn-secondary-bg)] border-none rounded-lg px-4 py-2 cursor-pointer font-semibold btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => setImportStep(1)}
                disabled={templateRows.length === 0}
                className="text-[12px] text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] border-none rounded-lg px-4 py-2 cursor-pointer font-semibold btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {importStep === 1 && (
          <div>
            <div className="mb-1">
              <p className="text-[14px] font-bold text-[var(--text-primary)] m-0">Step 2 of 3 — Recurring Items for {month.toLocaleString('en-US', { month: 'long' })}</p>
              <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 mb-3">Select recurring items to include in this month's budget.</p>
            </div>

            {recurringRows.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[13px] text-[var(--text-muted)] mb-2">No recurring items for {month.toLocaleString('en-US', { month: 'long' })}.</p>
                <Link to="/budget/recurring" className="text-[13px] text-[var(--color-accent)] hover:underline no-underline"
                  onClick={() => setImportOpen(false)}>
                  Set up recurring items →
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {recurringRows.map((row, idx) => (
                  <div key={row.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg border-b border-[var(--table-row-border)]"
                  >
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={() => setRecurringRows(prev => prev.map((r, i) =>
                        i === idx ? { ...r, included: !r.included } : r
                      ))}
                      className="w-4 h-4 cursor-pointer flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-medium text-[var(--text-primary)] block truncate">{row.label}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{row.subName}</span>
                    </div>
                    <div className="w-[90px] flex-shrink-0">
                      <div className="flex items-center rounded border border-[var(--bg-input-border)] bg-[var(--bg-input)]">
                        <span className="pl-2 text-[12px] font-mono text-[var(--text-muted)] flex-shrink-0 select-none">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Enter amount"
                          value={row.importAmount}
                          disabled={!row.included}
                          onChange={(e) => setRecurringRows(prev => prev.map((r, i) =>
                            i === idx ? { ...r, importAmount: e.target.value.replace(/[^0-9.]/g, '') } : r
                          ))}
                          className="flex-1 min-w-0 text-right text-[12px] font-mono py-1.5 pr-2 bg-transparent outline-none border-none text-[var(--text-body)] disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[var(--bg-card-border)]">
              <button
                onClick={() => setImportStep(0)}
                className="text-[12px] text-[var(--btn-secondary-text)] bg-[var(--btn-secondary-bg)] border-none rounded-lg px-4 py-2 cursor-pointer font-semibold btn-secondary"
              >
                ← Back
              </button>
              <button
                onClick={() => setImportStep(2)}
                className="text-[12px] text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] border-none rounded-lg px-4 py-2 cursor-pointer font-semibold btn-primary"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {importStep === 2 && (() => {
          const tplAdds = templateRows.filter(r => !r.hasConflict);
          const tplOverwrites = templateRows.filter(r => r.hasConflict && r.action === 'overwrite');
          const tplAddToExisting = templateRows.filter(r => r.hasConflict && r.action === 'add');
          const tplSkips = templateRows.filter(r => r.hasConflict && r.action === 'skip');
          const includedRecurring = recurringRows.filter(r => r.included && parseFloat(r.importAmount) > 0);
          const excludedRecurring = recurringRows.filter(r => !r.included);
          const totalChanges = tplAdds.length + tplOverwrites.length + tplAddToExisting.length + includedRecurring.length;

          return (
            <div>
              <div className="mb-1">
                <p className="text-[14px] font-bold text-[var(--text-primary)] m-0">Step 3 of 3 — Review Changes</p>
                <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 mb-3">Review the changes that will be applied to {monthLabel(month)}.</p>
              </div>

              {/* Summary */}
              <div className="bg-[var(--bg-hover)] rounded-lg px-4 py-3 mb-4">
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <span className="text-[var(--text-muted)]">Template — new entries:</span>
                  <span className="text-right font-semibold text-[#10b981]">{tplAdds.length}</span>
                  <span className="text-[var(--text-muted)]">Template — overwrites:</span>
                  <span className="text-right font-semibold text-[#f59e0b]">{tplOverwrites.length + tplAddToExisting.length}</span>
                  <span className="text-[var(--text-muted)]">Template — skipped:</span>
                  <span className="text-right font-semibold text-[var(--text-muted)]">{tplSkips.length}</span>
                  <span className="text-[var(--text-muted)]">Recurring — included:</span>
                  <span className="text-right font-semibold text-[var(--text-primary)]">{includedRecurring.length}</span>
                  <span className="text-[var(--text-muted)]">Recurring — excluded:</span>
                  <span className="text-right font-semibold text-[var(--text-muted)]">{excludedRecurring.length}</span>
                  <span className="text-[var(--text-primary)] font-semibold border-t border-[var(--bg-card-border)] pt-2 mt-1">Total changes:</span>
                  <span className="text-right font-bold text-[var(--text-primary)] border-t border-[var(--bg-card-border)] pt-2 mt-1">{totalChanges}</span>
                </div>
              </div>

              {/* Detail lists */}
              {tplAdds.length > 0 && (
                <div className="mb-3">
                  <p className="text-[11px] font-semibold text-[#10b981] uppercase tracking-[0.04em] mb-1">New Entries</p>
                  {tplAdds.map(row => (
                    <div key={row.categoryId} className="flex justify-between px-3 py-1 text-[12px]">
                      <span className="text-[var(--text-body)]">{row.subName}</span>
                      <span className="font-mono text-[#10b981]">{fmt(row.templateAmount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {(tplOverwrites.length > 0 || tplAddToExisting.length > 0) && (
                <div className="mb-3">
                  <p className="text-[11px] font-semibold text-[#f59e0b] uppercase tracking-[0.04em] mb-1">Overwrites / Additions</p>
                  {[...tplOverwrites, ...tplAddToExisting].map(row => (
                    <div key={row.categoryId} className="flex justify-between px-3 py-1 text-[12px]">
                      <span className="text-[var(--text-body)]">
                        {row.subName}
                        <span className="text-[10px] text-[var(--text-muted)] ml-1">({row.action})</span>
                      </span>
                      <span className="font-mono text-[#f59e0b]">{fmt(row.templateAmount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {includedRecurring.length > 0 && (
                <div className="mb-3">
                  <p className="text-[11px] font-semibold text-[var(--color-accent)] uppercase tracking-[0.04em] mb-1">Recurring Items</p>
                  {includedRecurring.map(row => (
                    <div key={row.id} className="flex justify-between px-3 py-1 text-[12px]">
                      <span className="text-[var(--text-body)]">{row.label}</span>
                      <span className="font-mono text-[var(--color-accent)]">{fmt(parseFloat(row.importAmount))}</span>
                    </div>
                  ))}
                </div>
              )}

              {totalChanges === 0 && (
                <div className="text-center py-4">
                  <p className="text-[13px] text-[var(--text-muted)]">No changes to apply. All template items were skipped and no recurring items were included.</p>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[var(--bg-card-border)]">
                <button
                  onClick={() => setImportStep(1)}
                  className="text-[12px] text-[var(--btn-secondary-text)] bg-[var(--btn-secondary-bg)] border-none rounded-lg px-4 py-2 cursor-pointer font-semibold btn-secondary"
                >
                  ← Back
                </button>
                <button
                  onClick={handleApply}
                  disabled={importing || totalChanges === 0}
                  className="text-[12px] text-white bg-[#10b981] border-none rounded-lg px-4 py-2 cursor-pointer font-semibold hover:bg-[#059669] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? 'Applying…' : 'Apply Changes'}
                </button>
              </div>
            </div>
          );
        })()}
      </ResponsiveModal>
    </div>
  );
}
