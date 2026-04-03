// @ts-nocheck
import { useState, useRef, useEffect } from 'react';

/* ─── Category Data ─── */
const CATEGORIES = [
  { id: 10, group_name: 'Auto/Transportation', sub_name: 'Car Insurance', display_name: 'Auto/Transportation: Car Insurance', type: 'expense' },
  { id: 11, group_name: 'Auto/Transportation', sub_name: 'Registration', display_name: 'Auto/Transportation: Registration', type: 'expense' },
  { id: 12, group_name: 'Auto/Transportation', sub_name: 'Other', display_name: 'Auto/Transportation: Other', type: 'expense' },
  { id: 20, group_name: 'Health', sub_name: 'Fitness', display_name: 'Health: Fitness', type: 'expense' },
  { id: 30, group_name: 'Household', sub_name: 'Home Insurance', display_name: 'Household: Home Insurance', type: 'expense' },
  { id: 31, group_name: 'Household', sub_name: 'Property Tax', display_name: 'Household: Property Tax', type: 'expense' },
  { id: 40, group_name: 'Personal', sub_name: 'Gifts', display_name: 'Personal: Gifts', type: 'expense' },
  { id: 41, group_name: 'Personal', sub_name: 'Pet Care', display_name: 'Personal: Pet Care', type: 'expense' },
  { id: 42, group_name: 'Personal', sub_name: 'Subscriptions', display_name: 'Personal: Subscriptions', type: 'expense' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface RecurringItem {
  id: number;
  label: string;
  category_id: number;
  amount: number | null;
  months: number[];
}

const INITIAL_ITEMS: RecurringItem[] = [
  { id: 1, label: 'Car Insurance Semi-Annual', category_id: 10, amount: 960, months: [1, 7] },
  { id: 2, label: 'Car Registration', category_id: 11, amount: 350, months: [7] },
  { id: 3, label: 'Amazon Prime Annual', category_id: 42, amount: 139, months: [3] },
  { id: 4, label: 'Home Insurance Annual', category_id: 30, amount: 1800, months: [6] },
  { id: 5, label: 'Gym Annual Membership', category_id: 20, amount: 480, months: [2] },
  { id: 6, label: 'Property Tax', category_id: 31, amount: 2400, months: [4, 10] },
  { id: 7, label: 'Christmas Gifts', category_id: 40, amount: 800, months: [12] },
  { id: 8, label: 'Vet Annual Checkup', category_id: 41, amount: 300, months: [5] },
  { id: 9, label: 'AAA Membership', category_id: 12, amount: 120, months: [9] },
];

/* ─── Helpers ─── */
const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const catMap = new Map(CATEGORIES.map(c => [c.id, c]));
const getCatName = (id: number) => catMap.get(id)?.display_name ?? 'Unknown';
const getCatSub = (id: number) => catMap.get(id)?.sub_name ?? 'Unknown';

function nextUpcomingMonth(months: number[], currentMonth = 4): number {
  const upcoming = months.filter(m => m >= currentMonth);
  if (upcoming.length > 0) return upcoming[0];
  return months[0];
}

/* ─── Shared UI ─── */
function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  return (
    <button onClick={() => {
      const next = !dark; setDark(next);
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('ledger-theme', next ? 'dark' : 'light');
    }} style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 200,
      width: 40, height: 40, borderRadius: 20,
      background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)',
      border: 'none', cursor: 'pointer', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontSize: 18,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    }}>
      {dark ? '☀' : '🌙'}
    </button>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: 390, margin: '0 auto', borderRadius: 24,
      border: '3px solid var(--bg-card-border)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      overflow: 'hidden', background: 'var(--bg-main)',
      height: 760, overflowY: 'auto',
    }} className="hide-scrollbar">
      {children}
    </div>
  );
}

/* ─── Month Multi-Select ─── */
function MonthSelector({ selected, onChange }: { selected: number[]; onChange: (m: number[]) => void }) {
  const toggle = (m: number) => {
    onChange(selected.includes(m) ? selected.filter(x => x !== m) : [...selected, m].sort((a, b) => a - b));
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {MONTH_NAMES.map((name, i) => {
        const month = i + 1;
        const active = selected.includes(month);
        return (
          <button key={month} onClick={() => toggle(month)} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: active ? '1.5px solid var(--color-accent)' : '1px solid var(--bg-card-border)',
            background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
            color: active ? 'var(--color-accent)' : 'var(--text-muted)',
            cursor: 'pointer', transition: 'all 150ms',
          }}>
            {name}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Month Chips (read-only) ─── */
function MonthChips({ months }: { months: number[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {months.map(m => (
        <span key={m} style={{
          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
          background: 'rgba(59,130,246,0.1)', color: 'var(--color-accent)',
        }}>
          {MONTH_NAMES[m - 1]}
        </span>
      ))}
    </div>
  );
}

/* ─── Add/Edit Modal ─── */
function ItemForm({ item, onSave, onCancel }: {
  item: RecurringItem | null;
  onSave: (item: Omit<RecurringItem, 'id'>) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(item?.label ?? '');
  const [categoryId, setCategoryId] = useState<number>(item?.category_id ?? CATEGORIES[0].id);
  const [amount, setAmount] = useState(item?.amount != null ? String(item.amount) : '');
  const [months, setMonths] = useState<number[]>(item?.months ?? []);
  const [error, setError] = useState('');

  const grouped = CATEGORIES.reduce<Record<string, typeof CATEGORIES>>((acc, c) => {
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
      category_id: categoryId,
      amount: parsedAmount && !isNaN(parsedAmount) ? parsedAmount : null,
      months,
    });
  };

  return (
    <div style={{ padding: 4 }}>
      <h3 style={{
        fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px',
      }}>
        {item ? 'Edit Recurring Item' : 'Add Recurring Item'}
      </h3>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: 'var(--bg-inline-error)', border: '1px solid var(--bg-inline-error-border)',
          color: 'var(--text-inline-error)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Label */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
          Label
        </label>
        <input
          type="text" value={label} onChange={e => { setLabel(e.target.value); setError(''); }}
          placeholder="e.g., Car Registration"
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
            border: '1px solid var(--bg-input-border)', background: 'var(--bg-input)',
            color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Category */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
          Category
        </label>
        <select
          value={categoryId} onChange={e => setCategoryId(Number(e.target.value))}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
            border: '1px solid var(--bg-input-border)', background: 'var(--bg-input)',
            color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
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
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
          Amount <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional — enter during import if blank)</span>
        </label>
        <input
          type="text" inputMode="decimal" value={amount}
          onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Leave blank to set at import"
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
            border: '1px solid var(--bg-input-border)', background: 'var(--bg-input)',
            color: 'var(--text-primary)', outline: 'none', fontFamily: "'DM Mono', monospace",
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Months */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
          Months
        </label>
        <MonthSelector selected={months} onChange={m => { setMonths(m); setError(''); }} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{
          padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)',
          border: 'none', cursor: 'pointer',
        }} className="btn-secondary">
          Cancel
        </button>
        <button onClick={handleSubmit} style={{
          padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)',
          border: 'none', cursor: 'pointer',
        }} className="btn-primary">
          {item ? 'Save Changes' : 'Add Item'}
        </button>
      </div>
    </div>
  );
}

/* ─── Delete Confirmation Button ─── */
function DeleteBtn({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const handleClick = () => {
    if (confirming) { onConfirm(); setConfirming(false); }
    else { setConfirming(true); timer.current = setTimeout(() => setConfirming(false), 3000); }
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {confirming && (
        <button onClick={() => setConfirming(false)} style={{
          padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
          background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)',
          border: 'none', cursor: 'pointer',
        }}>
          Cancel
        </button>
      )}
      <button onClick={handleClick} style={{
        padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
        background: confirming ? 'var(--btn-destructive-bg)' : 'var(--btn-destructive-light-bg)',
        color: confirming ? 'var(--btn-destructive-text)' : 'var(--btn-destructive-light-text)',
        border: 'none', cursor: 'pointer',
      }}>
        {confirming ? 'Confirm?' : 'Delete'}
      </button>
    </div>
  );
}

/* ─── Calendar View (Vertical Ledger) ─── */
function CalendarView({ items, mobile }: { items: RecurringItem[]; mobile: boolean }) {
  // Only show months that have items
  const monthsWithItems = MONTH_FULL.map((name, i) => {
    const month = i + 1;
    const monthItems = items.filter(item => item.months.includes(month));
    const total = monthItems.reduce((s, it) => s + (it.amount ?? 0), 0);
    return { month, name, shortName: MONTH_NAMES[i], monthItems, total };
  }).filter(m => m.monthItems.length > 0);

  if (monthsWithItems.length === 0) {
    return (
      <div style={{
        padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
        background: 'var(--bg-card)', borderRadius: 12,
        border: '1px solid var(--bg-card-border)',
      }}>
        No recurring items yet.
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12,
      border: '1px solid var(--bg-card-border)', overflow: 'hidden',
    }}>
      {monthsWithItems.map((m, mi) => (
        <div key={m.month} style={{
          borderBottom: mi < monthsWithItems.length - 1 ? '1px solid var(--table-border)' : 'none',
        }}>
          {m.monthItems.map((it, ii) => (
            <div key={it.id} style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '60px 1fr auto' : '80px 1fr auto',
              padding: mobile ? '8px 12px' : '8px 16px',
              alignItems: 'center',
              borderBottom: ii < m.monthItems.length - 1 ? '1px solid var(--table-row-border)' : 'none',
            }}>
              {/* Month label — only on first row of each month */}
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: ii === 0 ? 'var(--text-primary)' : 'transparent',
              }}>
                {mobile ? m.shortName : m.name}
              </span>
              {/* Item label + category */}
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13, color: 'var(--text-body)' }}>{it.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                  {getCatSub(it.category_id)}
                </span>
              </div>
              {/* Amount */}
              <span style={{
                fontSize: 13, fontWeight: 600, fontFamily: "'DM Mono', monospace",
                color: it.amount != null ? 'var(--text-primary)' : 'var(--color-warning)',
                textAlign: 'right', whiteSpace: 'nowrap',
              }}>
                {it.amount != null ? fmt(it.amount) : '—'}
              </span>
            </div>
          ))}
          {/* Month total row if multiple items */}
          {m.monthItems.length > 1 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '60px 1fr auto' : '80px 1fr auto',
              padding: mobile ? '6px 12px 8px' : '6px 16px 8px',
              borderBottom: mi < monthsWithItems.length - 1 ? 'none' : 'none',
            }}>
              <span />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>
                Month total
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                color: 'var(--text-secondary)', textAlign: 'right', whiteSpace: 'nowrap',
              }}>
                {fmt(m.total)}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Main Component ─── */
export default function RecurringPlannerMockup() {
  const [items, setItems] = useState<RecurringItem[]>(INITIAL_ITEMS);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [viewTab, setViewTab] = useState<'list' | 'calendar'>('list');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringItem | null>(null);
  let nextId = useRef(Math.max(...INITIAL_ITEMS.map(i => i.id)) + 1);

  const sorted = [...items].sort((a, b) => {
    const aNext = nextUpcomingMonth(a.months);
    const bNext = nextUpcomingMonth(b.months);
    return aNext - bNext || a.label.localeCompare(b.label);
  });

  const annualTotal = items.reduce((s, it) => s + (it.amount ?? 0) * it.months.length, 0);

  const handleSave = (data: Omit<RecurringItem, 'id'>) => {
    if (editingItem) {
      setItems(prev => prev.map(it => it.id === editingItem.id ? { ...it, ...data } : it));
    } else {
      setItems(prev => [...prev, { id: nextId.current++, ...data }]);
    }
    setModalOpen(false);
    setEditingItem(null);
  };

  const handleDelete = (id: number) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const content = (mobile: boolean) => (
    <div style={{
      padding: mobile ? '16px' : '28px 36px',
      fontFamily: "'DM Sans', sans-serif",
      minHeight: '100%', background: 'var(--bg-main)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: mobile ? 16 : 20,
      }}>
        <div>
          <h1 style={{
            fontSize: mobile ? 17 : 22, fontWeight: 700,
            color: 'var(--text-primary)', margin: 0,
          }}>
            Recurring Planner
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Annual, semi-annual, and other non-monthly charges
          </p>
        </div>
        <button onClick={() => { setEditingItem(null); setModalOpen(true); }} style={{
          padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)',
          border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
        }} className="btn-primary">
          + Add Item
        </button>
      </div>

      {/* Annual total KPI */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        border: '1px solid var(--bg-card-border)', boxShadow: 'var(--bg-card-shadow)',
        padding: '14px 20px', marginBottom: mobile ? 12 : 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Annual Recurring Total
        </span>
        <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: 'var(--text-primary)' }}>
          {fmt(annualTotal)}
        </span>
      </div>

      {/* View toggle */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: mobile ? 12 : 16,
        background: 'var(--toggle-container-bg)', borderRadius: 8, padding: 3,
        width: 'fit-content',
      }}>
        {(['list', 'calendar'] as const).map(tab => (
          <button key={tab} onClick={() => setViewTab(tab)} style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: 'none', cursor: 'pointer',
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
        <div style={{
          background: 'var(--bg-card)', borderRadius: 12,
          border: '1px solid var(--bg-card-border)',
          boxShadow: 'var(--bg-card-shadow)', overflow: 'hidden',
        }}>
          {/* Table header (desktop only) */}
          {!mobile && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.7fr 1fr 0.5fr',
              padding: '10px 20px', borderBottom: '1px solid var(--table-border)',
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.04em', color: 'var(--text-muted)',
            }}>
              <span>Label</span>
              <span>Category</span>
              <span style={{ textAlign: 'right' }}>Amount</span>
              <span style={{ paddingLeft: 12 }}>Months</span>
              <span />
            </div>
          )}

          {sorted.map((item, i) => mobile ? (
            /* Mobile card layout */
            <div key={item.id} style={{
              padding: '12px 14px',
              borderBottom: i < sorted.length - 1 ? '1px solid var(--table-row-border)' : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{getCatSub(item.category_id)}</div>
                </div>
                <span style={{
                  fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                  color: item.amount != null ? 'var(--text-primary)' : 'var(--color-warning)',
                }}>
                  {item.amount != null ? fmt(item.amount) : 'Set at import'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <MonthChips months={item.months} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setEditingItem(item); setModalOpen(true); }} style={{
                    padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)',
                    border: 'none', cursor: 'pointer',
                  }}>
                    Edit
                  </button>
                  <DeleteBtn onConfirm={() => handleDelete(item.id)} />
                </div>
              </div>
            </div>
          ) : (
            /* Desktop row */
            <div key={item.id} style={{
              display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.7fr 1fr 0.5fr',
              padding: '10px 20px', alignItems: 'center',
              borderBottom: i < sorted.length - 1 ? '1px solid var(--table-row-border)' : 'none',
              transition: 'background 150ms',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {item.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {getCatSub(item.category_id)}
              </span>
              <span style={{
                fontSize: item.amount != null ? 13 : 11, fontFamily: "'DM Mono', monospace", textAlign: 'right',
                color: item.amount != null ? 'var(--text-primary)' : 'var(--color-warning)',
                fontWeight: item.amount != null ? 500 : 600,
              }}>
                {item.amount != null ? fmt(item.amount) : 'Set at import'}
              </span>
              <div style={{ paddingLeft: 12 }}>
                <MonthChips months={item.months} />
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => { setEditingItem(item); setModalOpen(true); }} style={{
                  padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)',
                  border: 'none', cursor: 'pointer',
                }} className="btn-secondary">
                  Edit
                </button>
                <DeleteBtn onConfirm={() => handleDelete(item.id)} />
              </div>
            </div>
          ))}

          {sorted.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No recurring items yet. Click "Add Item" to get started.
            </div>
          )}
        </div>
      ) : (
        <CalendarView items={items} mobile={mobile} />
      )}

      {/* Modal overlay */}
      {modalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--bg-modal)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => { setModalOpen(false); setEditingItem(null); }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: 24,
            maxWidth: 440, width: '90%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <ItemForm
              item={editingItem}
              onSave={handleSave}
              onCancel={() => { setModalOpen(false); setEditingItem(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ background: 'var(--bg-main)', minHeight: '100vh', paddingBottom: 60 }}>
      {/* View mode toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 0 8px' }}>
        {(['desktop', 'mobile'] as const).map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: '1px solid var(--bg-card-border)', cursor: 'pointer',
            background: viewMode === mode ? 'var(--toggle-active-bg)' : 'transparent',
            color: viewMode === mode ? 'var(--toggle-active-text)' : 'var(--toggle-inactive-text)',
            boxShadow: viewMode === mode ? 'var(--toggle-active-shadow)' : 'none',
          }}>
            {mode === 'desktop' ? '🖥 Desktop' : '📱 Mobile'}
          </button>
        ))}
      </div>

      {viewMode === 'desktop' ? (
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          {content(false)}
        </div>
      ) : (
        <PhoneFrame>{content(true)}</PhoneFrame>
      )}

      <ThemeToggle />
    </div>
  );
}
