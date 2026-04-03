// @ts-nocheck
import { useState, useRef, useEffect } from 'react';

/* ─── Sample Data ─── */
const CATEGORIES = [
  // Income
  { id: 1, group_name: 'Income', sub_name: 'Take Home Pay', display_name: 'Income: Take Home Pay', type: 'income' },
  { id: 2, group_name: 'Income', sub_name: 'Side Income', display_name: 'Income: Side Income', type: 'income' },
  // Expenses
  { id: 10, group_name: 'Auto/Transportation', sub_name: 'Car Payment', display_name: 'Auto/Transportation: Car Payment', type: 'expense' },
  { id: 11, group_name: 'Auto/Transportation', sub_name: 'Car Insurance', display_name: 'Auto/Transportation: Car Insurance', type: 'expense' },
  { id: 12, group_name: 'Auto/Transportation', sub_name: 'Fuel', display_name: 'Auto/Transportation: Fuel', type: 'expense' },
  { id: 20, group_name: 'Daily Living', sub_name: 'Dining Out', display_name: 'Daily Living: Dining Out', type: 'expense' },
  { id: 21, group_name: 'Daily Living', sub_name: 'Groceries', display_name: 'Daily Living: Groceries', type: 'expense' },
  { id: 30, group_name: 'Health', sub_name: 'Medical', display_name: 'Health: Medical', type: 'expense' },
  { id: 40, group_name: 'Household', sub_name: 'HOA', display_name: 'Household: HOA', type: 'expense' },
  { id: 41, group_name: 'Household', sub_name: 'Home Insurance', display_name: 'Household: Home Insurance', type: 'expense' },
  { id: 42, group_name: 'Household', sub_name: 'Mortgage', display_name: 'Household: Mortgage', type: 'expense' },
  { id: 50, group_name: 'Insurance', sub_name: 'Auto', display_name: 'Insurance: Auto', type: 'expense' },
  { id: 60, group_name: 'Personal', sub_name: 'Clothing', display_name: 'Personal: Clothing', type: 'expense' },
  { id: 61, group_name: 'Personal', sub_name: 'Personal Care', display_name: 'Personal: Personal Care', type: 'expense' },
  { id: 62, group_name: 'Personal', sub_name: 'Subscriptions', display_name: 'Personal: Subscriptions', type: 'expense' },
  { id: 70, group_name: 'Savings', sub_name: 'Emergency Fund', display_name: 'Savings: Emergency Fund', type: 'expense' },
  { id: 71, group_name: 'Savings', sub_name: 'Investments', display_name: 'Savings: Investments', type: 'expense' },
  { id: 80, group_name: 'Utilities', sub_name: 'Internet', display_name: 'Utilities: Internet', type: 'expense' },
  { id: 81, group_name: 'Utilities', sub_name: 'Power', display_name: 'Utilities: Power', type: 'expense' },
];

const INITIAL_TEMPLATE: Record<number, number> = {
  1: 8500, 2: 500,
  10: 450, 11: 160, 12: 200,
  20: 200, 21: 800,
  30: 100,
  40: 350, 41: 150, 42: 2200,
  50: 160,
  60: 100, 61: 50, 62: 50,
  70: 500, 71: 400,
  80: 80, 81: 200,
};

const PALETTE = [
  '#3b82f6', '#ec4899', '#a855f7', '#8b5cf6', '#6366f1',
  '#06b6d4', '#14b8a6', '#10b981', '#22c55e', '#84cc16',
  '#f59e0b', '#f97316', '#e11d48', '#0ea5e9', '#d946ef', '#ef4444',
];

function getGroupColor(groupName: string, allGroups: string[]) {
  const sorted = [...new Set(allGroups)].sort();
  const idx = sorted.indexOf(groupName);
  return PALETTE[idx % PALETTE.length];
}

/* ─── Helpers ─── */
const fmt = (n: number) => n === 0 ? '—' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtFull = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  items.forEach(item => {
    const k = key(item);
    if (!result[k]) result[k] = [];
    result[k].push(item);
  });
  return result;
}

/* ─── Inline Currency Input ─── */
function InlineCurrency({ value, onChange, placeholder = '' }: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setRaw(value != null ? String(value) : '');
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const cleaned = raw.replace(/[^0-9.]/g, '');
    if (cleaned === '' || cleaned === '0') {
      onChange(null);
    } else {
      const n = parseFloat(cleaned);
      onChange(isNaN(n) ? null : Math.round(n * 100) / 100);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={raw}
        onChange={e => setRaw(e.target.value.replace(/[^0-9.]/g, ''))}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        style={{
          width: 90, textAlign: 'right', fontFamily: "'DM Mono', monospace",
          fontSize: 13, padding: '4px 8px', borderRadius: 6,
          border: '1px solid var(--color-accent)',
          boxShadow: '0 0 0 3px rgba(59,130,246,0.2)',
          background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none',
        }}
      />
    );
  }

  return (
    <span
      onClick={startEdit}
      style={{
        display: 'inline-block', width: 90, textAlign: 'right', cursor: 'pointer',
        fontFamily: "'DM Mono', monospace", fontSize: 13, padding: '4px 8px',
        borderRadius: 6, color: value != null ? 'var(--text-primary)' : 'var(--text-muted)',
        transition: 'background 150ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {value != null ? fmt(value) : placeholder || '—'}
    </span>
  );
}

/* ─── KPI Card ─── */
function KPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12,
      border: '1px solid var(--bg-card-border)',
      boxShadow: 'var(--bg-card-shadow)', padding: '16px 20px',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono', monospace",
        color: color || 'var(--text-primary)',
      }}>
        {value}
      </div>
    </div>
  );
}

/* ─── Theme Toggle ─── */
function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('ledger-theme', next ? 'dark' : 'light');
  };
  return (
    <button onClick={toggle} style={{
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

/* ─── Mobile Frame ─── */
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

/* ─── Main Component ─── */
export default function BudgetTemplateMockup() {
  const [template, setTemplate] = useState<Record<number, number | null>>({ ...INITIAL_TEMPLATE });
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

  const updateAmount = (catId: number, amount: number | null) => {
    setTemplate(prev => {
      const next = { ...prev };
      if (amount == null) {
        delete next[catId];
      } else {
        next[catId] = amount;
      }
      return next;
    });
  };

  const incomeCategories = CATEGORIES.filter(c => c.type === 'income');
  const expenseCategories = CATEGORIES.filter(c => c.type === 'expense');
  const expenseGroups = groupBy(expenseCategories, c => c.group_name);
  const allGroupNames = Object.keys(expenseGroups).sort();

  const totalIncome = incomeCategories.reduce((s, c) => s + (template[c.id] ?? 0), 0);
  const totalExpenses = expenseCategories.reduce((s, c) => s + (template[c.id] ?? 0), 0);
  const net = totalIncome - totalExpenses;

  const content = (mobile: boolean) => (
    <div style={{
      padding: mobile ? '16px' : '28px 36px',
      fontFamily: "'DM Sans', sans-serif",
      minHeight: '100%',
      background: 'var(--bg-main)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: mobile ? 16 : 24 }}>
        <h1 style={{
          fontSize: mobile ? 17 : 22, fontWeight: 700,
          color: 'var(--text-primary)', margin: 0,
        }}>
          Budget Template
        </h1>
        <p style={{
          fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0',
        }}>
          Your default monthly starting point
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? '1fr 1fr' : '1fr 1fr 1fr',
        gap: mobile ? 10 : 16,
        marginBottom: mobile ? 16 : 24,
      }}>
        <KPI label="Template Income" value={fmt(totalIncome)} color="var(--color-positive)" />
        <KPI label="Template Expenses" value={fmt(totalExpenses)} />
        <KPI
          label="Net"
          value={(net >= 0 ? '+' : '-') + fmt(Math.abs(net))}
          color={net >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'}
        />
      </div>

      {/* Income Section */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        border: '1px solid var(--bg-card-border)',
        boxShadow: 'var(--bg-card-shadow)',
        marginBottom: mobile ? 12 : 20, overflow: 'hidden',
      }}>
        <div style={{
          padding: mobile ? '12px 14px' : '12px 20px',
          borderBottom: '1px solid var(--table-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{
            fontSize: 13, fontWeight: 700, color: 'var(--color-positive)',
          }}>
            Income
          </span>
          <span style={{
            fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace",
            color: 'var(--color-positive)',
          }}>
            {fmt(totalIncome)}
          </span>
        </div>
        {incomeCategories.map((cat, i) => (
          <div key={cat.id} style={{
            padding: mobile ? '10px 14px' : '8px 20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: i < incomeCategories.length - 1 ? '1px solid var(--table-row-border)' : 'none',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-body)' }}>{cat.sub_name}</span>
            <InlineCurrency
              value={template[cat.id] ?? null}
              onChange={v => updateAmount(cat.id, v)}
              placeholder="Click to set"
            />
          </div>
        ))}
      </div>

      {/* Expense Groups */}
      {allGroupNames.map(groupName => {
        const cats = expenseGroups[groupName];
        const color = getGroupColor(groupName, allGroupNames);
        const groupTotal = cats.reduce((s, c) => s + (template[c.id] ?? 0), 0);
        return (
          <div key={groupName} style={{
            background: 'var(--bg-card)', borderRadius: 12,
            border: '1px solid var(--bg-card-border)',
            boxShadow: 'var(--bg-card-shadow)',
            marginBottom: mobile ? 12 : 16, overflow: 'hidden',
          }}>
            {/* Group header */}
            <div style={{
              padding: mobile ? '12px 14px' : '12px 20px',
              borderBottom: '1px solid var(--table-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
                }}>
                  {groupName}
                </span>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace",
                color: groupTotal > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
                {groupTotal > 0 ? fmt(groupTotal) : '—'}
              </span>
            </div>
            {/* Sub-categories */}
            {cats.map((cat, i) => (
              <div key={cat.id} style={{
                padding: mobile ? '10px 14px' : '8px 20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: i < cats.length - 1 ? '1px solid var(--table-row-border)' : 'none',
              }}>
                <span style={{
                  fontSize: 13, color: 'var(--text-body)', paddingLeft: mobile ? 0 : 18,
                }}>
                  {cat.sub_name}
                </span>
                <InlineCurrency
                  value={template[cat.id] ?? null}
                  onChange={v => updateAmount(cat.id, v)}
                  placeholder="Click to set"
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ background: 'var(--bg-main)', minHeight: '100vh', paddingBottom: 60 }}>
      {/* View mode toggle */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 0 8px',
      }}>
        {(['desktop', 'mobile'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: '1px solid var(--bg-card-border)', cursor: 'pointer',
              background: viewMode === mode ? 'var(--toggle-active-bg)' : 'transparent',
              color: viewMode === mode ? 'var(--toggle-active-text)' : 'var(--toggle-inactive-text)',
              boxShadow: viewMode === mode ? 'var(--toggle-active-shadow)' : 'none',
            }}
          >
            {mode === 'desktop' ? '🖥 Desktop' : '📱 Mobile'}
          </button>
        ))}
      </div>

      {viewMode === 'desktop' ? (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {content(false)}
        </div>
      ) : (
        <PhoneFrame>{content(true)}</PhoneFrame>
      )}

      <ThemeToggle />
    </div>
  );
}
