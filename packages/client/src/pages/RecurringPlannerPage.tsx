import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { fmtWhole } from '../lib/formatters';
import KPICard from '../components/KPICard';
import Spinner from '../components/Spinner';
import ConfirmDeleteButton from '../components/ConfirmDeleteButton';
import ResponsiveModal from '../components/ResponsiveModal';
import PermissionGate from '../components/PermissionGate';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../context/ToastContext';

/* ─── Types ─── */
interface RecurringItem {
  id: number;
  label: string;
  category_id: number;
  amount: number | null;
  months: number[];
  created_at: string;
  updated_at: string;
  group_name: string;
  sub_name: string;
  display_name: string;
  type: string;
}

interface Category {
  id: number;
  group_name: string;
  sub_name: string;
  display_name: string;
  type: string;
  is_deductible: number;
  sort_order: number;
}

/* ─── Constants ─── */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ─── Helpers ─── */
function nextUpcomingMonth(months: number[]): number {
  const current = new Date().getMonth() + 1;
  const upcoming = months.filter(m => m >= current);
  if (upcoming.length > 0) return upcoming[0];
  return months[0];
}

/* ─── Month Chips (read-only) ─── */
function MonthChips({ months }: { months: number[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {months.map(m => (
        <span
          key={m}
          className="text-[11px] font-semibold rounded"
          style={{
            padding: '2px 8px',
            background: 'rgba(59,130,246,0.1)',
            color: 'var(--color-accent)',
          }}
        >
          {MONTH_NAMES[m - 1]}
        </span>
      ))}
    </div>
  );
}

/* ─── Month Multi-Select ─── */
function MonthSelector({ selected, onChange }: { selected: number[]; onChange: (m: number[]) => void }) {
  const toggle = (m: number) => {
    onChange(
      selected.includes(m)
        ? selected.filter(x => x !== m)
        : [...selected, m].sort((a, b) => a - b)
    );
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {MONTH_NAMES.map((name, i) => {
        const month = i + 1;
        const active = selected.includes(month);
        return (
          <button
            key={month}
            type="button"
            onClick={() => toggle(month)}
            className="text-[12px] font-semibold rounded-md cursor-pointer transition-all duration-150"
            style={{
              padding: '4px 10px',
              border: active ? '1.5px solid var(--color-accent)' : '1px solid var(--bg-card-border)',
              background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
              color: active ? 'var(--color-accent)' : 'var(--text-muted)',
            }}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Add/Edit Form ─── */
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

  return (
    <div style={{ padding: 4 }}>
      {error && (
        <div
          className="text-[13px] rounded-lg mb-3"
          style={{
            padding: '8px 12px',
            background: 'var(--bg-inline-error)',
            border: '1px solid var(--bg-inline-error-border)',
            color: 'var(--text-inline-error)',
          }}
        >
          {error}
        </div>
      )}

      {/* Label */}
      <div className="mb-3.5">
        <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
          Label
        </label>
        <input
          type="text"
          value={label}
          onChange={e => { setLabel(e.target.value); setError(''); }}
          placeholder="e.g., Car Registration"
          className="w-full text-[13px] rounded-lg outline-none"
          style={{
            padding: '8px 12px',
            border: '1px solid var(--bg-input-border)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Category */}
      <div className="mb-3.5">
        <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
          Category
        </label>
        <select
          value={categoryId}
          onChange={e => setCategoryId(Number(e.target.value))}
          className="w-full text-[13px] rounded-lg outline-none"
          style={{
            padding: '8px 12px',
            border: '1px solid var(--bg-input-border)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
          }}
        >
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, cats]) => (
            <optgroup key={group} label={group}>
              {cats.map(c => (
                <option key={c.id} value={c.id}>{c.sub_name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Amount */}
      <div className="mb-3.5">
        <label className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
          Amount{' '}
          <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
            (optional — enter during import if blank)
          </span>
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Leave blank to set at import"
          className="w-full text-[13px] rounded-lg outline-none font-['DM_Mono',monospace]"
          style={{
            padding: '8px 12px',
            border: '1px solid var(--bg-input-border)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Months */}
      <div className="mb-5">
        <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Months
        </label>
        <MonthSelector selected={months} onChange={m => { setMonths(m); setError(''); }} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary text-[13px] font-semibold rounded-lg cursor-pointer"
          style={{
            padding: '8px 16px',
            background: 'var(--btn-secondary-bg)',
            color: 'var(--btn-secondary-text)',
            border: 'none',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="btn-primary text-[13px] font-semibold rounded-lg cursor-pointer"
          style={{
            padding: '8px 16px',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-text)',
            border: 'none',
          }}
        >
          {item ? 'Save Changes' : 'Add Item'}
        </button>
      </div>
    </div>
  );
}

/* ─── Calendar View ─── */
function CalendarView({ items, categories, isMobile }: {
  items: RecurringItem[];
  categories: Category[];
  isMobile: boolean;
}) {
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
      <div
        className="text-[13px] text-center rounded-xl"
        style={{
          padding: 32,
          color: 'var(--text-muted)',
          background: 'var(--bg-card)',
          border: '1px solid var(--bg-card-border)',
        }}
      >
        No recurring items yet.
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--bg-card-border)',
      }}
    >
      {monthsWithItems.map((m, mi) => (
        <div key={m.month}>
          {/* Month header row */}
          <div
            className="flex justify-between items-center"
            style={{
              padding: isMobile ? '8px 12px' : '10px 16px',
              background: 'var(--bg-hover)',
              borderTop: mi > 0 ? '1px solid var(--table-border)' : 'none',
              borderBottom: '1px solid var(--table-border)',
            }}
          >
            <span className="text-[12px] font-bold uppercase tracking-[0.04em]" style={{ color: 'var(--text-primary)' }}>
              {m.name}
            </span>
            <span className="text-[12px] font-bold font-['DM_Mono',monospace]" style={{ color: 'var(--text-secondary)' }}>
              {fmtWhole(m.total)}
            </span>
          </div>
          {/* Item rows */}
          {m.monthItems.map((it, ii) => (
            <div
              key={it.id}
              className="flex justify-between items-center"
              style={{
                padding: isMobile ? '8px 12px 8px 24px' : '8px 16px 8px 28px',
                borderBottom: ii < m.monthItems.length - 1 ? '1px solid var(--table-row-border)' : 'none',
              }}
            >
              <div className="min-w-0 flex-1">
                <span className="text-[13px]" style={{ color: 'var(--text-body)' }}>{it.label}</span>
                <span className="text-[11px] ml-2" style={{ color: 'var(--text-muted)' }}>
                  {getCatSub(it.category_id)}
                </span>
              </div>
              <span
                className="text-[13px] font-semibold font-['DM_Mono',monospace] whitespace-nowrap ml-3"
                style={{
                  color: it.amount != null ? 'var(--text-primary)' : 'var(--color-warning)',
                }}
              >
                {it.amount != null ? fmtWhole(it.amount) : '—'}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ─── */
export default function RecurringPlannerPage() {
  usePageTitle('Recurring Planner');
  const isMobile = useIsMobile();
  const { addToast } = useToast();

  const [items, setItems] = useState<RecurringItem[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [viewTab, setViewTab] = useState<'list' | 'calendar'>('list');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringItem | null>(null);

  const catMap = new Map(categories.map(c => [c.id, c]));
  const getCatSub = (id: number) => catMap.get(id)?.sub_name ?? 'Unknown';

  const loadData = useCallback(async () => {
    try {
      const [itemsRes, catsRes] = await Promise.all([
        apiFetch<{ data: RecurringItem[] }>('/budget-recurring'),
        apiFetch<{ data: Category[] }>('/categories'),
      ]);
      setItems(itemsRes.data);
      setCategories(catsRes.data);
    } catch {
      addToast('Failed to load recurring items', 'error');
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const sorted = items
    ? [...items].sort((a, b) => {
        const aNext = nextUpcomingMonth(a.months);
        const bNext = nextUpcomingMonth(b.months);
        return aNext - bNext || a.label.localeCompare(b.label);
      })
    : [];

  const annualTotal = items
    ? items.reduce((s, it) => s + (it.amount ?? 0) * it.months.length, 0)
    : 0;

  const handleSave = async (data: { label: string; categoryId: number; amount: number | null; months: number[] }) => {
    try {
      if (editingItem) {
        await apiFetch(`/budget-recurring/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        addToast('Item updated', 'success');
      } else {
        await apiFetch('/budget-recurring', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        addToast('Item added', 'success');
      }
      setModalOpen(false);
      setEditingItem(null);
      await loadData();
    } catch {
      addToast('Failed to save item', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/budget-recurring/${id}`, { method: 'DELETE' });
      addToast('Item deleted', 'success');
      await loadData();
    } catch {
      addToast('Failed to delete item', 'error');
    }
  };

  if (!items) return <Spinner />;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-5 flex-shrink-0">
        <div>
          <h1
            className="page-title font-bold m-0"
            style={{ fontSize: isMobile ? 17 : 22, color: 'var(--text-primary)' }}
          >
            Recurring Planner
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Annual, semi-annual, and other non-monthly charges
          </p>
        </div>
        <PermissionGate permission="budgets.edit" fallback="disabled">
          <button
            onClick={() => { setEditingItem(null); setModalOpen(true); }}
            className="btn-primary text-[13px] font-semibold rounded-lg cursor-pointer whitespace-nowrap"
            style={{
              padding: '8px 14px',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              border: 'none',
            }}
          >
            + Add Item
          </button>
        </PermissionGate>
      </div>

      {/* Annual total KPI */}
      <div
        className="flex justify-between items-center rounded-xl mb-5"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--bg-card-border)',
          boxShadow: 'var(--bg-card-shadow)',
          padding: isMobile ? '12px 16px' : '14px 20px',
        }}
      >
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.04em]"
          style={{ color: 'var(--text-muted)' }}
        >
          Annual Recurring Total
        </span>
        <span
          className="text-[18px] font-extrabold font-['DM_Mono',monospace]"
          style={{ color: 'var(--text-primary)' }}
        >
          {annualTotal === 0 ? '$0' : fmtWhole(annualTotal)}
        </span>
      </div>

      {/* View toggle */}
      <div
        className="flex gap-1 rounded-lg w-fit"
        style={{
          background: 'var(--toggle-container-bg)',
          padding: 3,
          marginBottom: isMobile ? 12 : 16,
        }}
      >
        {(['list', 'calendar'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setViewTab(tab)}
            className="text-[12px] font-semibold rounded-md cursor-pointer"
            style={{
              padding: '6px 14px',
              border: 'none',
              background: viewTab === tab ? 'var(--toggle-active-bg)' : 'transparent',
              color: viewTab === tab ? 'var(--toggle-active-text)' : 'var(--toggle-inactive-text)',
              boxShadow: viewTab === tab ? 'var(--toggle-active-shadow)' : 'none',
            }}
          >
            {tab === 'list' ? 'List' : 'Calendar'}
          </button>
        ))}
      </div>

      {/* Content */}
      {viewTab === 'list' ? (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--bg-card-border)',
            boxShadow: 'var(--bg-card-shadow)',
          }}
        >
          {/* Table header (desktop) */}
          {!isMobile && (
            <div
              className="grid text-[11px] font-semibold uppercase tracking-[0.04em]"
              style={{
                gridTemplateColumns: '1.5fr 1fr 0.7fr 1fr 0.5fr',
                padding: '10px 20px',
                borderBottom: '1px solid var(--table-border)',
                color: 'var(--text-muted)',
              }}
            >
              <span>Label</span>
              <span>Category</span>
              <span className="text-right">Amount</span>
              <span className="pl-3">Months</span>
              <span />
            </div>
          )}

          {sorted.map((item, i) =>
            isMobile ? (
              /* Mobile card layout */
              <div
                key={item.id}
                style={{
                  padding: '12px 14px',
                  borderBottom: i < sorted.length - 1 ? '1px solid var(--table-row-border)' : 'none',
                }}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <div>
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {item.label}
                    </div>
                    <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {getCatSub(item.category_id)}
                    </div>
                  </div>
                  <span
                    className="font-bold font-['DM_Mono',monospace]"
                    style={{
                      fontSize: 14,
                      color: item.amount != null ? 'var(--text-primary)' : 'var(--color-warning)',
                    }}
                  >
                    {item.amount != null ? fmtWhole(item.amount) : 'Set at import'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <MonthChips months={item.months} />
                  <PermissionGate permission="budgets.edit" fallback="hidden">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setEditingItem(item); setModalOpen(true); }}
                        className="btn-secondary text-[11px] font-semibold rounded-md cursor-pointer"
                        style={{
                          padding: '4px 8px',
                          background: 'var(--btn-secondary-bg)',
                          color: 'var(--btn-secondary-text)',
                          border: 'none',
                        }}
                      >
                        Edit
                      </button>
                      <ConfirmDeleteButton onConfirm={() => handleDelete(item.id)} />
                    </div>
                  </PermissionGate>
                </div>
              </div>
            ) : (
              /* Desktop row */
              <div
                key={item.id}
                className="grid items-center transition-colors duration-150 hover:bg-[var(--bg-hover)]"
                style={{
                  gridTemplateColumns: '1.5fr 1fr 0.7fr 1fr 0.5fr',
                  padding: '10px 20px',
                  borderBottom: i < sorted.length - 1 ? '1px solid var(--table-row-border)' : 'none',
                }}
              >
                <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {item.label}
                </span>
                <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                  {getCatSub(item.category_id)}
                </span>
                <span
                  className="font-['DM_Mono',monospace] text-right"
                  style={{
                    fontSize: item.amount != null ? 13 : 11,
                    color: item.amount != null ? 'var(--text-primary)' : 'var(--color-warning)',
                    fontWeight: item.amount != null ? 500 : 600,
                  }}
                >
                  {item.amount != null ? fmtWhole(item.amount) : 'Set at import'}
                </span>
                <div className="pl-3">
                  <MonthChips months={item.months} />
                </div>
                <PermissionGate permission="budgets.edit" fallback="hidden">
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => { setEditingItem(item); setModalOpen(true); }}
                      className="btn-secondary text-[11px] font-semibold rounded-md cursor-pointer"
                      style={{
                        padding: '4px 8px',
                        background: 'var(--btn-secondary-bg)',
                        color: 'var(--btn-secondary-text)',
                        border: 'none',
                      }}
                    >
                      Edit
                    </button>
                    <ConfirmDeleteButton onConfirm={() => handleDelete(item.id)} />
                  </div>
                </PermissionGate>
              </div>
            )
          )}

          {sorted.length === 0 && (
            <div className="text-[13px] text-center" style={{ padding: 32, color: 'var(--text-muted)' }}>
              No recurring items yet. Click "+ Add Item" to get started.
            </div>
          )}
        </div>
      ) : (
        <CalendarView items={items} categories={categories} isMobile={isMobile} />
      )}

      {/* Add/Edit Modal */}
      <ResponsiveModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingItem(null); }}
        title={editingItem ? 'Edit Recurring Item' : 'Add Recurring Item'}
        maxWidth="28rem"
      >
        <ItemForm
          item={editingItem}
          categories={categories}
          onSave={handleSave}
          onCancel={() => { setModalOpen(false); setEditingItem(null); }}
        />
      </ResponsiveModal>
    </div>
  );
}
