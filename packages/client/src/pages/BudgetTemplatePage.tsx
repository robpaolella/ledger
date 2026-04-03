import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { fmtWhole } from '../lib/formatters';
import KPICard from '../components/KPICard';
import Spinner from '../components/Spinner';
import PermissionGate from '../components/PermissionGate';
import { getCategoryColor } from '../lib/categoryColors';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../context/ToastContext';

interface Category {
  id: number;
  group_name: string;
  sub_name: string;
  display_name: string;
  type: string;
  is_deductible: boolean;
  sort_order: number;
}

interface TemplateEntry {
  id: number;
  category_id: number;
  amount: number;
  created_at: string;
  updated_at: string;
  group_name: string;
  sub_name: string;
  display_name: string;
  type: string;
  sort_order: number;
}

interface CategoryRow {
  categoryId: number;
  subName: string;
  templateId: number | null;
  amount: number;
}

interface ExpenseGroup {
  groupName: string;
  rows: CategoryRow[];
}

export default function BudgetTemplatePage() {
  usePageTitle('Budget Template');
  const { hasPermission } = useAuth();
  const isMobile = useIsMobile();
  const { addToast } = useToast();
  const canEdit = hasPermission('budgets.edit');

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [templates, setTemplates] = useState<TemplateEntry[] | null>(null);
  const [editingCell, setEditingCell] = useState<{ categoryId: number; value: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
      const [catRes, tplRes] = await Promise.all([
        apiFetch<{ data: Category[] }>('/categories'),
        apiFetch<{ data: TemplateEntry[] }>('/budget-templates'),
      ]);
      setCategories(catRes.data);
      setTemplates(tplRes.data);
    } catch {
      addToast('Failed to load budget template data', 'error');
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  if (!categories || !templates) return <Spinner />;

  // Build a map of categoryId → template entry
  const templateMap = new Map<number, TemplateEntry>();
  for (const t of templates) {
    templateMap.set(t.category_id, t);
  }

  // Split categories
  const incomeCategories = categories.filter(c => c.type === 'income');
  const expenseCategories = categories.filter(c => c.type === 'expense');

  // Build income rows
  const incomeRows: CategoryRow[] = incomeCategories.map(c => {
    const tpl = templateMap.get(c.id);
    return { categoryId: c.id, subName: c.sub_name, templateId: tpl?.id ?? null, amount: tpl?.amount ?? 0 };
  });

  // Build expense groups
  const expenseGroupMap = new Map<string, CategoryRow[]>();
  for (const c of expenseCategories) {
    const tpl = templateMap.get(c.id);
    const row: CategoryRow = { categoryId: c.id, subName: c.sub_name, templateId: tpl?.id ?? null, amount: tpl?.amount ?? 0 };
    if (!expenseGroupMap.has(c.group_name)) expenseGroupMap.set(c.group_name, []);
    expenseGroupMap.get(c.group_name)!.push(row);
  }
  const expenseGroups: ExpenseGroup[] = [...expenseGroupMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupName, rows]) => ({ groupName, rows }));
  const allGroupNames = expenseGroups.map(g => g.groupName);

  // Totals
  const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenseGroups.reduce((s, g) => s + g.rows.reduce((gs, r) => gs + r.amount, 0), 0);
  const net = totalIncome - totalExpenses;

  // Format net for display
  const fmtNet = (n: number): string => {
    if (n === 0) return '—';
    const prefix = n > 0 ? '+' : '-';
    return prefix + fmtWhole(Math.abs(n));
  };

  // Save / delete template entry
  const saveTemplate = async (categoryId: number, value: number) => {
    const existing = templateMap.get(categoryId);
    if (value === 0 && existing) {
      // Delete the template entry
      try {
        await apiFetch(`/budget-templates/${existing.id}`, { method: 'DELETE' });
        addToast('Template entry removed', 'success');
      } catch {
        addToast('Failed to remove template entry', 'error');
      }
    } else if (value > 0) {
      // Upsert
      try {
        await apiFetch('/budget-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId, amount: value }),
        });
        addToast('Template updated', 'success');
      } catch {
        addToast('Failed to update template', 'error');
      }
    }
    await loadData();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, categoryId: number) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const handleBlur = (categoryId: number) => {
    if (!editingCell) return;
    const cleaned = editingCell.value.replace(/[^0-9.]/g, '');
    const val = cleaned === '' ? 0 : parseFloat(cleaned);
    if (!isNaN(val) && val >= 0) {
      saveTemplate(categoryId, Math.round(val));
    }
    setEditingCell(null);
  };

  const startEdit = (categoryId: number, currentAmount: number) => {
    if (!canEdit) return;
    setEditingCell({ categoryId, value: currentAmount > 0 ? String(currentAmount) : '' });
  };

  // Render an inline-editable amount cell
  const renderAmount = (row: CategoryRow) => {
    const isEditing = editingCell?.categoryId === row.categoryId;

    if (isEditing) {
      return (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={editingCell!.value}
          onChange={e => setEditingCell({ categoryId: row.categoryId, value: e.target.value.replace(/[^0-9.]/g, '') })}
          onKeyDown={e => handleKeyDown(e, row.categoryId)}
          onBlur={() => handleBlur(row.categoryId)}
          className="font-['DM_Mono',monospace]"
          style={{
            width: 90, textAlign: 'right', fontSize: 13, padding: '4px 8px', borderRadius: 6,
            border: '1px solid var(--color-accent)',
            boxShadow: '0 0 0 3px rgba(59,130,246,0.2)',
            background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none',
          }}
        />
      );
    }

    return (
      <PermissionGate permission="budgets.edit" fallback="disabled">
        <span
          onClick={() => startEdit(row.categoryId, row.amount)}
          className="font-['DM_Mono',monospace]"
          style={{
            display: 'inline-block', width: 90, textAlign: 'right', cursor: canEdit ? 'pointer' : 'default',
            fontSize: 13, padding: '4px 8px', borderRadius: 6,
            color: row.amount > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          {row.amount > 0 ? fmtWhole(row.amount) : '—'}
        </span>
      </PermissionGate>
    );
  };

  const cardClass = 'bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] overflow-hidden';

  return (
    <div style={{ padding: isMobile ? '16px' : '28px 36px' }}>
      {/* Header */}
      <div className={isMobile ? 'mb-4' : 'mb-6'}>
        <h1 className={`font-bold text-[var(--text-primary)] m-0 ${isMobile ? 'text-[17px]' : 'text-[22px]'}`}>
          Budget Template
        </h1>
        <p className="text-[13px] text-[var(--text-muted)] mt-1 m-0">
          Your default monthly starting point
        </p>
      </div>

      {/* KPI Cards */}
      <div className={`grid gap-4 ${isMobile ? 'grid-cols-2 mb-4' : 'grid-cols-3 mb-6'}`}>
        <KPICard label="Template Income" value={fmtWhole(totalIncome)} valueColor="var(--color-positive)" />
        <KPICard label="Template Expenses" value={fmtWhole(totalExpenses)} />
        <KPICard
          label="Net"
          value={fmtNet(net)}
          valueColor={net >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'}
        />
      </div>

      {/* Income Section */}
      <div className={`${cardClass} ${isMobile ? 'mb-3' : 'mb-5'}`}>
        <div
          className="flex justify-between items-center"
          style={{
            padding: isMobile ? '12px 14px' : '12px 20px',
            borderBottom: '1px solid var(--table-border)',
          }}
        >
          <span className="text-[13px] font-bold text-[var(--color-positive)]">Income</span>
          <span className="text-[12px] font-semibold font-['DM_Mono',monospace] text-[var(--color-positive)]">
            {totalIncome > 0 ? fmtWhole(totalIncome) : '—'}
          </span>
        </div>
        {incomeRows.map((row, i) => (
          <div
            key={row.categoryId}
            className="flex justify-between items-center"
            style={{
              padding: isMobile ? '10px 14px' : '8px 20px',
              borderBottom: i < incomeRows.length - 1 ? '1px solid var(--table-row-border)' : 'none',
            }}
          >
            <span className="text-[13px] text-[var(--text-body)]">{row.subName}</span>
            {renderAmount(row)}
          </div>
        ))}
      </div>

      {/* Expense Groups */}
      {expenseGroups.map(group => {
        const color = getCategoryColor(group.groupName, allGroupNames);
        const groupTotal = group.rows.reduce((s, r) => s + r.amount, 0);
        return (
          <div key={group.groupName} className={`${cardClass} ${isMobile ? 'mb-3' : 'mb-4'}`}>
            {/* Group header */}
            <div
              className="flex justify-between items-center"
              style={{
                padding: isMobile ? '12px 14px' : '12px 20px',
                borderBottom: '1px solid var(--table-border)',
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-[10px] h-[10px] rounded-[3px] flex-shrink-0" style={{ background: color }} />
                <span className="text-[13px] font-bold text-[var(--text-primary)]">{group.groupName}</span>
              </div>
              <span
                className="text-[12px] font-semibold font-['DM_Mono',monospace]"
                style={{ color: groupTotal > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}
              >
                {groupTotal > 0 ? fmtWhole(groupTotal) : '—'}
              </span>
            </div>
            {/* Sub-category rows */}
            {group.rows.map((row, i) => (
              <div
                key={row.categoryId}
                className="flex justify-between items-center"
                style={{
                  padding: isMobile ? '10px 14px' : '8px 20px',
                  borderBottom: i < group.rows.length - 1 ? '1px solid var(--table-row-border)' : 'none',
                }}
              >
                <span className="text-[13px] text-[var(--text-body)]" style={{ paddingLeft: isMobile ? 0 : 18 }}>
                  {row.subName}
                </span>
                {renderAmount(row)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
