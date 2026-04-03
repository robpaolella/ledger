import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { fmtWhole } from '../lib/formatters';
import ConfirmDeleteButton from './ConfirmDeleteButton';
import ResponsiveModal from './ResponsiveModal';
import PermissionGate from './PermissionGate';
import { getCategoryColor } from '../lib/categoryColors';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useToast } from '../context/ToastContext';

/* ─── Types ─── */
interface Category {
  id: number;
  group_name: string;
  sub_name: string;
  display_name: string;
  type: string;
  is_deductible: number;
  sort_order: number;
}

interface TemplateEntry {
  id: number;
  category_id: number;
  amount: number;
  group_name: string;
  sub_name: string;
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

interface RecurringItem {
  id: number;
  label: string;
  category_id: number;
  amount: number | null;
  months: number[];
  group_name: string;
  sub_name: string;
  display_name: string;
  type: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function nextUpcomingMonth(months: number[]): number {
  const current = new Date().getMonth() + 1;
  const upcoming = months.filter(m => m >= current);
  return upcoming.length > 0 ? upcoming[0] : months[0];
}

/* ─── Month Chips (read-only) ─── */
function MonthChips({ months }: { months: number[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {months.map(m => (
        <span key={m} className="text-[11px] font-semibold rounded"
          style={{ padding: '2px 8px', background: 'rgba(59,130,246,0.1)', color: 'var(--color-accent)' }}>
          {MONTH_NAMES[m - 1]}
        </span>
      ))}
    </div>
  );
}

/* ─── Month Multi-Select ─── */
function MonthSelector({ selected, onChange }: { selected: number[]; onChange: (m: number[]) => void }) {
  const toggle = (m: number) => {
    onChange(selected.includes(m) ? selected.filter(x => x !== m) : [...selected, m].sort((a, b) => a - b));
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {MONTH_NAMES.map((name, i) => {
        const month = i + 1;
        const active = selected.includes(month);
        return (
          <button key={month} type="button" onClick={() => toggle(month)}
            className="text-[12px] font-semibold rounded-md cursor-pointer transition-all duration-150"
            style={{
              padding: '4px 10px',
              border: active ? '1.5px solid var(--color-accent)' : '1px solid var(--bg-card-border)',
              background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
              color: active ? 'var(--color-accent)' : 'var(--text-muted)',
            }}>
            {name}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Recurring Item Form ─── */
function ItemForm({ item, categories, onSave, onCancel }: {
  item: RecurringItem | null;
  categories: Category[];
  onSave: (data: { label: string; categoryId: number; amount: number | null; months: number[] }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(item?.label ?? '');
  const [categoryId, setCategoryId] = useState<number>(item?.category_id ?? categories[0]?.id ?? 0);
  const [amount, setAmount] = useState(item?.amount != null ? String(item.amount) : '');
  const [months, setMonths] = useState<number[]>(item?.months ?? []);
  const [error, setError] = useState('');

  const grouped = categories.reduce<Record<string, Category[]>>((acc, c) => {
    if (!acc[c.group_name]) acc[c.group_name] = [];
    acc[c.group_name].push(c);
    return acc;
  }, {});

  const handleSubmit = () => {
    if (!label.trim()) { setError('Label is required'); return; }
    if (months.length === 0) { setError('Select at least one month'); return; }
    const parsedAmount = amount.trim() ? parseFloat(amount.replace(/[^0-9.]/g, '')) : null;
    onSave({
      label: label.trim(),
      categoryId,
      amount: parsedAmount && !isNaN(parsedAmount) ? parsedAmount : null,
      months,
    });
  };

  const inputStyle = {
    padding: '8px 12px',
    border: '1px solid var(--bg-input-border)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
  };

  return (
    <div>
      {error && (
        <div className="text-[13px] rounded-lg mb-3" style={{
          padding: '8px 12px', background: 'var(--bg-inline-error)',
          border: '1px solid var(--bg-inline-error-border)', color: 'var(--text-inline-error)',
        }}>
          {error}
        </div>
      )}

      <div className="mb-3.5">
        <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Label</label>
        <input type="text" value={label} onChange={e => { setLabel(e.target.value); setError(''); }}
          placeholder="e.g., Car Registration"
          className="w-full text-[13px] rounded-lg outline-none" style={inputStyle} />
      </div>

      <div className="mb-3.5">
        <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Category</label>
        <select value={categoryId} onChange={e => setCategoryId(Number(e.target.value))}
          className="w-full text-[13px] rounded-lg outline-none" style={inputStyle}>
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, cats]) => (
            <optgroup key={group} label={group}>
              {cats.map(c => <option key={c.id} value={c.id}>{c.sub_name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="mb-3.5">
        <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
          Amount <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span>
        </label>
        <input type="text" inputMode="decimal" value={amount}
          onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Leave blank to set at import"
          className="w-full text-[13px] rounded-lg outline-none font-['DM_Mono',monospace]" style={inputStyle} />
      </div>

      <div className="mb-5">
        <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Months</label>
        <MonthSelector selected={months} onChange={m => { setMonths(m); setError(''); }} />
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="btn-secondary text-[13px] font-semibold rounded-lg cursor-pointer"
          style={{ padding: '8px 16px', background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)', border: 'none' }}>
          Cancel
        </button>
        <button type="button" onClick={handleSubmit}
          className="btn-primary text-[13px] font-semibold rounded-lg cursor-pointer"
          style={{ padding: '8px 16px', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none' }}>
          {item ? 'Save Changes' : 'Add Item'}
        </button>
      </div>
    </div>
  );
}

/* ─── Calendar View ─── */
function CalendarView({ items, categories }: { items: RecurringItem[]; categories: Category[] }) {
  const catMap = new Map(categories.map(c => [c.id, c]));
  const getCatSub = (id: number) => catMap.get(id)?.sub_name ?? 'Unknown';

  const monthsWithItems = MONTH_FULL.map((name, i) => {
    const month = i + 1;
    const monthItems = items.filter(item => item.months.includes(month));
    const total = monthItems.reduce((s, it) => s + (it.amount ?? 0), 0);
    return { month, name, monthItems, total };
  }).filter(m => m.monthItems.length > 0);

  if (monthsWithItems.length === 0) {
    return (
      <div className="text-[13px] text-center rounded-xl"
        style={{ padding: 32, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--bg-card-border)' }}>
        No recurring items yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-card-border)' }}>
      {monthsWithItems.map((m, mi) => (
        <div key={m.month}>
          <div className="flex justify-between items-center" style={{
            padding: '8px 12px', background: 'var(--bg-hover)',
            borderTop: mi > 0 ? '1px solid var(--table-border)' : 'none',
            borderBottom: '1px solid var(--table-border)',
          }}>
            <span className="text-[12px] font-bold uppercase tracking-[0.04em]" style={{ color: 'var(--text-primary)' }}>{m.name}</span>
            <span className="text-[12px] font-bold font-['DM_Mono',monospace]" style={{ color: 'var(--text-secondary)' }}>{fmtWhole(m.total)}</span>
          </div>
          {m.monthItems.map((it, ii) => (
            <div key={it.id} className="flex justify-between items-center" style={{
              padding: '8px 12px 8px 24px',
              borderBottom: ii < m.monthItems.length - 1 ? '1px solid var(--table-row-border)' : 'none',
            }}>
              <div className="min-w-0 flex-1">
                <span className="text-[13px]" style={{ color: 'var(--text-body)' }}>{it.label}</span>
                <span className="text-[11px] ml-2" style={{ color: 'var(--text-muted)' }}>{getCatSub(it.category_id)}</span>
              </div>
              <span className="text-[13px] font-semibold font-['DM_Mono',monospace] whitespace-nowrap ml-3"
                style={{ color: it.amount != null ? 'var(--text-primary)' : 'var(--color-warning)' }}>
                {it.amount != null ? fmtWhole(it.amount) : '—'}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Template Tab ─── */
function TemplateTab({ categories, templates, onReload }: {
  categories: Category[];
  templates: TemplateEntry[];
  onReload: () => Promise<void>;
}) {
  const { hasPermission } = useAuth();
  const { addToast } = useToast();
  const canEdit = hasPermission('budgets.edit');
  const [editingCell, setEditingCell] = useState<{ categoryId: number; value: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const templateMap = new Map<number, TemplateEntry>();
  for (const t of templates) templateMap.set(t.category_id, t);

  const incomeCategories = categories.filter(c => c.type === 'income');
  const expenseCategories = categories.filter(c => c.type === 'expense');

  const incomeRows: CategoryRow[] = incomeCategories.map(c => {
    const tpl = templateMap.get(c.id);
    return { categoryId: c.id, subName: c.sub_name, templateId: tpl?.id ?? null, amount: tpl?.amount ?? 0 };
  });

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

  const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenseGroups.reduce((s, g) => s + g.rows.reduce((gs, r) => gs + r.amount, 0), 0);

  const saveTemplate = async (categoryId: number, value: number) => {
    const existing = templateMap.get(categoryId);
    if (value === 0 && existing) {
      try {
        await apiFetch(`/budget-templates/${existing.id}`, { method: 'DELETE' });
        addToast('Template entry removed', 'success');
      } catch { addToast('Failed to remove template entry', 'error'); }
    } else if (value > 0) {
      try {
        await apiFetch('/budget-templates', {
          method: 'POST',
          body: JSON.stringify({ categoryId, amount: value }),
        });
        addToast('Template updated', 'success');
      } catch { addToast('Failed to update template', 'error'); }
    }
    await onReload();
  };

  const handleBlur = (categoryId: number) => {
    if (!editingCell) return;
    const cleaned = editingCell.value.replace(/[^0-9.]/g, '');
    const val = cleaned === '' ? 0 : parseFloat(cleaned);
    if (!isNaN(val) && val >= 0) saveTemplate(categoryId, Math.round(val));
    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, categoryId: number) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    else if (e.key === 'Escape') setEditingCell(null);
  };

  const startEdit = (categoryId: number, currentAmount: number) => {
    if (!canEdit) return;
    setEditingCell({ categoryId, value: currentAmount > 0 ? String(currentAmount) : '' });
  };

  const renderAmount = (row: CategoryRow) => {
    const isEditing = editingCell?.categoryId === row.categoryId;

    if (isEditing) {
      return (
        <input ref={inputRef} type="text" inputMode="decimal"
          value={editingCell!.value}
          onChange={e => setEditingCell({ categoryId: row.categoryId, value: e.target.value.replace(/[^0-9.]/g, '') })}
          onKeyDown={e => handleKeyDown(e, row.categoryId)}
          onBlur={() => handleBlur(row.categoryId)}
          className="font-['DM_Mono',monospace]"
          style={{
            width: 90, textAlign: 'right', fontSize: 13, padding: '4px 8px', borderRadius: 6,
            border: '1px solid var(--color-accent)', boxShadow: '0 0 0 3px rgba(59,130,246,0.2)',
            background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none',
          }} />
      );
    }

    return (
      <PermissionGate permission="budgets.edit" fallback="disabled">
        <span onClick={() => startEdit(row.categoryId, row.amount)}
          className="font-['DM_Mono',monospace]"
          style={{
            display: 'inline-block', width: 90, textAlign: 'right',
            cursor: canEdit ? 'pointer' : 'default', fontSize: 13, padding: '4px 8px', borderRadius: 6,
            color: row.amount > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
          {row.amount > 0 ? fmtWhole(row.amount) : '—'}
        </span>
      </PermissionGate>
    );
  };

  const cardClass = 'rounded-xl border border-[var(--bg-card-border)] overflow-hidden';

  return (
    <div className="max-h-[60vh] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
      {/* Summary line */}
      <div className="flex justify-between items-center mb-3 text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
        <span>Income: <span style={{ color: 'var(--color-positive)' }}>{fmtWhole(totalIncome)}</span></span>
        <span>Expenses: <span style={{ color: 'var(--text-primary)' }}>{fmtWhole(totalExpenses)}</span></span>
        <span>Net: <span style={{ color: totalIncome - totalExpenses >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
          {totalIncome - totalExpenses >= 0 ? '+' : ''}{fmtWhole(totalIncome - totalExpenses)}
        </span></span>
      </div>

      {/* Income Section */}
      <div className={`${cardClass} mb-3`} style={{ background: 'var(--bg-card)' }}>
        <div className="flex justify-between items-center" style={{ padding: '10px 14px', borderBottom: '1px solid var(--table-border)' }}>
          <span className="text-[13px] font-bold" style={{ color: 'var(--color-positive)' }}>Income</span>
          <span className="text-[12px] font-semibold font-['DM_Mono',monospace]" style={{ color: 'var(--color-positive)' }}>
            {totalIncome > 0 ? fmtWhole(totalIncome) : '—'}
          </span>
        </div>
        {incomeRows.map((row, i) => (
          <div key={row.categoryId} className="flex justify-between items-center"
            style={{ padding: '8px 14px', borderBottom: i < incomeRows.length - 1 ? '1px solid var(--table-row-border)' : 'none' }}>
            <span className="text-[13px]" style={{ color: 'var(--text-body)' }}>{row.subName}</span>
            {renderAmount(row)}
          </div>
        ))}
      </div>

      {/* Expense Groups */}
      {expenseGroups.map(group => {
        const color = getCategoryColor(group.groupName, allGroupNames);
        const groupTotal = group.rows.reduce((s, r) => s + r.amount, 0);
        return (
          <div key={group.groupName} className={`${cardClass} mb-3`} style={{ background: 'var(--bg-card)' }}>
            <div className="flex justify-between items-center" style={{ padding: '10px 14px', borderBottom: '1px solid var(--table-border)' }}>
              <div className="flex items-center gap-2">
                <div className="w-[10px] h-[10px] rounded-[3px] flex-shrink-0" style={{ background: color }} />
                <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{group.groupName}</span>
              </div>
              <span className="text-[12px] font-semibold font-['DM_Mono',monospace]"
                style={{ color: groupTotal > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {groupTotal > 0 ? fmtWhole(groupTotal) : '—'}
              </span>
            </div>
            {group.rows.map((row, i) => (
              <div key={row.categoryId} className="flex justify-between items-center"
                style={{ padding: '8px 14px', borderBottom: i < group.rows.length - 1 ? '1px solid var(--table-row-border)' : 'none' }}>
                <span className="text-[13px]" style={{ color: 'var(--text-body)', paddingLeft: 16 }}>{row.subName}</span>
                {renderAmount(row)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Recurring Tab ─── */
function RecurringTab({ items, categories, onReload }: {
  items: RecurringItem[];
  categories: Category[];
  onReload: () => Promise<void>;
}) {
  const { addToast } = useToast();
  const [viewTab, setViewTab] = useState<'list' | 'calendar'>('list');
  const [formMode, setFormMode] = useState<'none' | 'add' | 'edit'>('none');
  const [editingItem, setEditingItem] = useState<RecurringItem | null>(null);

  const catMap = new Map(categories.map(c => [c.id, c]));
  const getCatSub = (id: number) => catMap.get(id)?.sub_name ?? 'Unknown';

  const sorted = [...items].sort((a, b) => {
    const aNext = nextUpcomingMonth(a.months);
    const bNext = nextUpcomingMonth(b.months);
    return aNext - bNext || a.label.localeCompare(b.label);
  });

  const annualTotal = items.reduce((s, it) => s + (it.amount ?? 0) * it.months.length, 0);

  const handleSave = async (data: { label: string; categoryId: number; amount: number | null; months: number[] }) => {
    try {
      if (editingItem) {
        await apiFetch(`/budget-recurring/${editingItem.id}`, { method: 'PUT', body: JSON.stringify(data) });
        addToast('Item updated', 'success');
      } else {
        await apiFetch('/budget-recurring', { method: 'POST', body: JSON.stringify(data) });
        addToast('Item added', 'success');
      }
      setFormMode('none');
      setEditingItem(null);
      await onReload();
    } catch { addToast('Failed to save item', 'error'); }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/budget-recurring/${id}`, { method: 'DELETE' });
      addToast('Item deleted', 'success');
      await onReload();
    } catch { addToast('Failed to delete item', 'error'); }
  };

  // Show inline form instead of list when adding/editing
  if (formMode !== 'none') {
    return (
      <div>
        <h4 className="text-[14px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          {formMode === 'edit' ? 'Edit Recurring Item' : 'Add Recurring Item'}
        </h4>
        <ItemForm
          item={editingItem}
          categories={categories}
          onSave={handleSave}
          onCancel={() => { setFormMode('none'); setEditingItem(null); }}
        />
      </div>
    );
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
      {/* Header row: annual total + add button */}
      <div className="flex justify-between items-center mb-3">
        <div className="text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Annual Total:{' '}
          <span className="font-['DM_Mono',monospace] font-bold" style={{ color: 'var(--text-primary)' }}>
            {annualTotal === 0 ? '$0' : fmtWhole(annualTotal)}
          </span>
        </div>
        <PermissionGate permission="budgets.edit" fallback="disabled">
          <button onClick={() => { setEditingItem(null); setFormMode('add'); }}
            className="btn-primary text-[12px] font-semibold rounded-lg cursor-pointer"
            style={{ padding: '6px 12px', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none' }}>
            + Add Item
          </button>
        </PermissionGate>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 rounded-lg w-fit mb-3" style={{ background: 'var(--toggle-container-bg)', padding: 3 }}>
        {(['list', 'calendar'] as const).map(tab => (
          <button key={tab} onClick={() => setViewTab(tab)}
            className="text-[12px] font-semibold rounded-md cursor-pointer"
            style={{
              padding: '5px 12px', border: 'none',
              background: viewTab === tab ? 'var(--toggle-active-bg)' : 'transparent',
              color: viewTab === tab ? 'var(--toggle-active-text)' : 'var(--toggle-inactive-text)',
              boxShadow: viewTab === tab ? 'var(--toggle-active-shadow)' : 'none',
            }}>
            {tab === 'list' ? 'List' : 'Calendar'}
          </button>
        ))}
      </div>

      {/* Content */}
      {viewTab === 'list' ? (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-card-border)' }}>
          {sorted.map((item, i) => (
            <div key={item.id} style={{ padding: '10px 14px', borderBottom: i < sorted.length - 1 ? '1px solid var(--table-row-border)' : 'none' }}>
              <div className="flex justify-between items-start mb-1">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{getCatSub(item.category_id)}</div>
                </div>
                <span className="font-semibold font-['DM_Mono',monospace] ml-2 flex-shrink-0"
                  style={{ fontSize: 13, color: item.amount != null ? 'var(--text-primary)' : 'var(--color-warning)' }}>
                  {item.amount != null ? fmtWhole(item.amount) : 'Set at import'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <MonthChips months={item.months} />
                <PermissionGate permission="budgets.edit" fallback="hidden">
                  <div className="flex gap-1.5">
                    <button onClick={() => { setEditingItem(item); setFormMode('edit'); }}
                      className="btn-secondary text-[11px] font-semibold rounded-md cursor-pointer"
                      style={{ padding: '4px 8px', background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)', border: 'none' }}>
                      Edit
                    </button>
                    <ConfirmDeleteButton onConfirm={() => handleDelete(item.id)} />
                  </div>
                </PermissionGate>
              </div>
            </div>
          ))}
          {sorted.length === 0 && (
            <div className="text-[13px] text-center" style={{ padding: 32, color: 'var(--text-muted)' }}>
              No recurring items yet. Click "+ Add Item" to get started.
            </div>
          )}
        </div>
      ) : (
        <CalendarView items={items} categories={categories} />
      )}
    </div>
  );
}

/* ─── Main Modal ─── */
interface BudgetTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BudgetTemplateModal({ isOpen, onClose }: BudgetTemplateModalProps) {
  const [activeTab, setActiveTab] = useState<'template' | 'recurring'>('template');
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [catRes, tplRes, recRes] = await Promise.all([
        apiFetch<{ data: Category[] }>('/categories'),
        apiFetch<{ data: TemplateEntry[] }>('/budget-templates'),
        apiFetch<{ data: RecurringItem[] }>('/budget-recurring'),
      ]);
      setCategories(catRes.data);
      setTemplates(tplRes.data);
      setRecurringItems(recRes.data);
    } catch {
      // Errors handled by individual tabs
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      loadData();
    }
  }, [isOpen, loadData]);

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title="Budget Template" maxWidth="700px">
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading...</div>
        </div>
      ) : (
        <>
          {/* Tab toggle */}
          <div className="flex gap-1 rounded-lg w-fit mb-4" style={{ background: 'var(--toggle-container-bg)', padding: 3 }}>
            {(['template', 'recurring'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="text-[12px] font-semibold rounded-md cursor-pointer"
                style={{
                  padding: '6px 14px', border: 'none',
                  background: activeTab === tab ? 'var(--toggle-active-bg)' : 'transparent',
                  color: activeTab === tab ? 'var(--toggle-active-text)' : 'var(--toggle-inactive-text)',
                  boxShadow: activeTab === tab ? 'var(--toggle-active-shadow)' : 'none',
                }}>
                {tab === 'template' ? 'Monthly Amounts' : 'Recurring Items'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'template' ? (
            <TemplateTab categories={categories} templates={templates} onReload={loadData} />
          ) : (
            <RecurringTab items={recurringItems} categories={categories} onReload={loadData} />
          )}
        </>
      )}
    </ResponsiveModal>
  );
}
