// @ts-nocheck
import { useState, useRef, useEffect } from 'react';

/* ─── Data ─── */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const CATEGORIES = [
  { id: 1, group_name: 'Income', sub_name: 'Take Home Pay', display_name: 'Income: Take Home Pay', type: 'income' },
  { id: 2, group_name: 'Income', sub_name: 'Side Income', display_name: 'Income: Side Income', type: 'income' },
  { id: 10, group_name: 'Auto/Transportation', sub_name: 'Car Payment', display_name: 'Auto/Transportation: Car Payment', type: 'expense' },
  { id: 11, group_name: 'Auto/Transportation', sub_name: 'Car Insurance', display_name: 'Auto/Transportation: Car Insurance', type: 'expense' },
  { id: 12, group_name: 'Auto/Transportation', sub_name: 'Fuel', display_name: 'Auto/Transportation: Fuel', type: 'expense' },
  { id: 13, group_name: 'Auto/Transportation', sub_name: 'Registration', display_name: 'Auto/Transportation: Registration', type: 'expense' },
  { id: 20, group_name: 'Daily Living', sub_name: 'Dining Out', display_name: 'Daily Living: Dining Out', type: 'expense' },
  { id: 21, group_name: 'Daily Living', sub_name: 'Groceries', display_name: 'Daily Living: Groceries', type: 'expense' },
  { id: 30, group_name: 'Health', sub_name: 'Medical', display_name: 'Health: Medical', type: 'expense' },
  { id: 40, group_name: 'Household', sub_name: 'HOA', display_name: 'Household: HOA', type: 'expense' },
  { id: 41, group_name: 'Household', sub_name: 'Home Insurance', display_name: 'Household: Home Insurance', type: 'expense' },
  { id: 42, group_name: 'Household', sub_name: 'Mortgage', display_name: 'Household: Mortgage', type: 'expense' },
  { id: 50, group_name: 'Personal', sub_name: 'Clothing', display_name: 'Personal: Clothing', type: 'expense' },
  { id: 51, group_name: 'Personal', sub_name: 'Subscriptions', display_name: 'Personal: Subscriptions', type: 'expense' },
  { id: 60, group_name: 'Savings', sub_name: 'Emergency Fund', display_name: 'Savings: Emergency Fund', type: 'expense' },
  { id: 61, group_name: 'Savings', sub_name: 'Investments', display_name: 'Savings: Investments', type: 'expense' },
  { id: 70, group_name: 'Utilities', sub_name: 'Internet', display_name: 'Utilities: Internet', type: 'expense' },
  { id: 71, group_name: 'Utilities', sub_name: 'Power', display_name: 'Utilities: Power', type: 'expense' },
];

const catMap = new Map(CATEGORIES.map(c => [c.id, c]));

// Template amounts
const TEMPLATE: Record<number, number> = {
  1: 8500, 2: 500, 10: 450, 11: 160, 12: 200,
  20: 200, 21: 800, 30: 100, 40: 350, 41: 150, 42: 2200,
  50: 100, 51: 50, 60: 500, 61: 400, 70: 80, 71: 200,
};

// Existing budget for July (some categories already have values = conflicts)
const EXISTING_BUDGET: Record<number, number> = {
  1: 8500, 42: 2200, 21: 750, 12: 180, 70: 80,
};

// Recurring items for July
const RECURRING_JULY = [
  { id: 1, label: 'Car Insurance Semi-Annual', category_id: 11, amount: 960, months: [1, 7] },
  { id: 2, label: 'Car Registration', category_id: 13, amount: 350, months: [7] },
  { id: 3, label: 'Roadside Assist Renewal', category_id: 11, amount: null, months: [7] },
];

/* ─── Helpers ─── */
const fmt = (n: number) => n === 0 ? '—' : '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtSigned = (n: number) => (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type ConflictAction = 'overwrite' | 'add' | 'skip';

interface TemplateRow {
  categoryId: number;
  templateAmount: number;
  existingAmount: number | null;
  hasConflict: boolean;
  action: ConflictAction;
}

interface RecurringRow {
  id: number;
  label: string;
  categoryId: number;
  presetAmount: number | null;
  importAmount: string;
  included: boolean;
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

/* ─── Step Indicator ─── */
function StepBar({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
      {steps.map((label, i) => (
        <div key={label} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{
            height: 3, borderRadius: 2, marginBottom: 6,
            background: i <= current ? 'var(--color-accent)' : 'var(--table-border)',
            transition: 'background 200ms',
          }} />
          <span style={{
            fontSize: 11,
            fontWeight: i === current ? 700 : 400,
            color: i === current ? 'var(--text-primary)' : i < current ? 'var(--text-secondary)' : 'var(--text-muted)',
          }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Conflict Action Dropdown ─── */
function ActionDropdown({ value, onChange }: { value: ConflictAction; onChange: (a: ConflictAction) => void }) {
  const color = value === 'overwrite' ? 'var(--color-warning)' : value === 'add' ? 'var(--color-positive)' : 'var(--text-secondary)';
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as ConflictAction)}
      style={{
        padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
        border: '1px solid var(--bg-input-border)', background: 'var(--bg-input)',
        color, cursor: 'pointer', outline: 'none',
      }}
    >
      <option value="skip">Skip</option>
      <option value="overwrite">Overwrite</option>
      <option value="add">Add</option>
    </select>
  );
}

/* ─── Step 1: Template Review ─── */
function Step1({ rows, setRows, onNext, onCancel, mobile }: {
  rows: TemplateRow[];
  setRows: (r: TemplateRow[]) => void;
  onNext: () => void;
  onCancel: () => void;
  mobile: boolean;
}) {
  const conflicts = rows.filter(r => r.hasConflict);
  const adds = rows.filter(r => !r.hasConflict);
  const skipCount = conflicts.filter(r => r.action === 'skip').length;
  const overwriteCount = conflicts.filter(r => r.action === 'overwrite').length;
  const addCount = adds.length + conflicts.filter(r => r.action === 'add').length;

  const setBulkAction = (action: ConflictAction) => {
    setRows(rows.map(r => r.hasConflict ? { ...r, action } : r));
  };

  const setAction = (categoryId: number, action: ConflictAction) => {
    setRows(rows.map(r => r.categoryId === categoryId ? { ...r, action } : r));
  };

  // Group by category group
  const grouped = new Map<string, TemplateRow[]>();
  rows.forEach(r => {
    const cat = catMap.get(r.categoryId);
    if (!cat) return;
    const group = cat.type === 'income' ? 'Income' : cat.group_name;
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(r);
  });

  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
        Step 1 of 3 — Import Monthly Template
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Importing into: <strong style={{ color: 'var(--text-primary)' }}>July 2026</strong>
      </p>

      {/* Bulk action for conflicts */}
      {conflicts.length > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 14,
          background: 'var(--bg-inline-warning)', border: '1px solid var(--bg-inline-warning-border)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-inline-warning)', fontWeight: 600 }}>
            {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} found — default all to:
          </span>
          <select
            onChange={e => setBulkAction(e.target.value as ConflictAction)}
            defaultValue=""
            style={{
              padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: '1px solid var(--bg-inline-warning-border)', background: 'var(--bg-inline-warning)',
              color: 'var(--text-inline-warning)', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="" disabled>Choose…</option>
            <option value="skip">Skip</option>
            <option value="overwrite">Overwrite</option>
            <option value="add">Add</option>
          </select>
        </div>
      )}

      {/* Category rows grouped */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        border: '1px solid var(--bg-card-border)', overflow: 'hidden',
        marginBottom: 16,
      }}>
        {/* Column headers (desktop only) */}
        {!mobile && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1.5fr 0.8fr 0.8fr 0.7fr',
            padding: '10px 16px', borderBottom: '1px solid var(--table-border)',
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.04em', color: 'var(--text-muted)',
          }}>
            <span>Category</span>
            <span style={{ textAlign: 'right' }}>Template</span>
            <span style={{ textAlign: 'right' }}>Current</span>
            <span style={{ textAlign: 'right' }}>Action</span>
          </div>
        )}
        {[...grouped.entries()].map(([groupName, groupRows], gi) => (
          <div key={groupName}>
            {/* Group header */}
            <div style={{
              padding: mobile ? '8px 12px' : '8px 16px',
              background: 'var(--bg-hover)',
              borderTop: gi > 0 ? '1px solid var(--table-border)' : 'none',
              borderBottom: '1px solid var(--table-border)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                {groupName}
              </span>
            </div>

            {groupRows.map((row, ri) => {
              const cat = catMap.get(row.categoryId);
              if (!cat) return null;
              return mobile ? (
                /* Mobile layout */
                <div key={row.categoryId} style={{
                  padding: '10px 12px',
                  borderBottom: ri < groupRows.length - 1 ? '1px solid var(--table-row-border)' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{cat.sub_name}</span>
                    <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: 'var(--text-primary)' }}>
                      {fmt(row.templateAmount)}
                    </span>
                  </div>
                  {row.hasConflict && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Current: <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(row.existingAmount!)}</span>
                      </span>
                      <ActionDropdown value={row.action} onChange={a => setAction(row.categoryId, a)} />
                    </div>
                  )}
                  {!row.hasConflict && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--color-positive)',
                      background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 4,
                    }}>
                      Add
                    </span>
                  )}
                </div>
              ) : (
                /* Desktop layout */
                <div key={row.categoryId} style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 0.8fr 0.8fr 0.7fr',
                  padding: '8px 16px', alignItems: 'center',
                  borderBottom: ri < groupRows.length - 1 ? '1px solid var(--table-row-border)' : 'none',
                }}>
                  <span style={{ fontSize: 13, color: 'var(--text-body)' }}>{cat.sub_name}</span>
                  <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", textAlign: 'right', color: 'var(--text-primary)' }}>
                    {fmt(row.templateAmount)}
                  </span>
                  <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", textAlign: 'right', color: row.existingAmount != null ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {row.existingAmount != null ? fmt(row.existingAmount) : '—'}
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {row.hasConflict ? (
                      <ActionDropdown value={row.action} onChange={a => setAction(row.categoryId, a)} />
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--color-positive)',
                        background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 4,
                      }}>
                        Add
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div style={{
        padding: '10px 14px', borderRadius: 8, marginBottom: 16,
        background: 'var(--bg-inline-info)', border: '1px solid var(--bg-inline-info-border)',
        fontSize: 12, color: 'var(--text-inline-info)',
      }}>
        <strong>{addCount}</strong> categories will be added
        {overwriteCount > 0 && <>, <strong>{overwriteCount}</strong> will be overwritten</>}
        {skipCount > 0 && <>, <strong>{skipCount}</strong> will be skipped</>}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onCancel} style={{
          padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-text)',
          border: 'none', cursor: 'pointer',
        }} className="btn-secondary">Cancel</button>
        <button onClick={onNext} style={{
          padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)',
          border: 'none', cursor: 'pointer',
        }} className="btn-primary">Next →</button>
      </div>
    </div>
  );
}

/* ─── Step 2: Recurring Items ─── */
function Step2({ rows, setRows, onNext, onBack, mobile }: {
  rows: RecurringRow[];
  setRows: (r: RecurringRow[]) => void;
  onNext: () => void;
  onBack: () => void;
  mobile: boolean;
}) {
  const toggleInclude = (id: number) => {
    setRows(rows.map(r => r.id === id ? { ...r, included: !r.included } : r));
  };

  const setAmount = (id: number, val: string) => {
    setRows(rows.map(r => r.id === id ? { ...r, importAmount: val } : r));
  };

  // Group by category for subtotals
  const byCategory = new Map<number, { items: RecurringRow[]; total: number }>();
  rows.filter(r => r.included).forEach(r => {
    const amt = parseFloat(r.importAmount) || 0;
    if (!byCategory.has(r.categoryId)) byCategory.set(r.categoryId, { items: [], total: 0 });
    const entry = byCategory.get(r.categoryId)!;
    entry.items.push(r);
    entry.total += amt;
  });

  const hasEmptyRequired = rows.some(r => r.included && r.importAmount.trim() === '');

  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
        Step 2 of 3 — Recurring Items for July 2026
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Review and confirm amounts for recurring charges this month.
      </p>

      {rows.length === 0 ? (
        <div style={{
          padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
          background: 'var(--bg-card)', borderRadius: 12,
          border: '1px solid var(--bg-card-border)', marginBottom: 16,
        }}>
          No recurring items scheduled for July. Click Next to review your final budget.
        </div>
      ) : (
        <>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 12,
            border: '1px solid var(--bg-card-border)', overflow: 'hidden',
            marginBottom: 12,
          }}>
            {rows.map((row, i) => {
              const cat = catMap.get(row.categoryId);
              const isEmpty = row.included && row.importAmount.trim() === '';
              return (
                <div key={row.id} style={{
                  padding: mobile ? '10px 12px' : '10px 16px',
                  borderBottom: i < rows.length - 1 ? '1px solid var(--table-row-border)' : 'none',
                  opacity: row.included ? 1 : 0.5,
                  transition: 'opacity 150ms',
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      {/* Include toggle */}
                      <button onClick={() => toggleInclude(row.id)} style={{
                        width: 20, height: 20, borderRadius: 4, border: '2px solid',
                        borderColor: row.included ? 'var(--color-accent)' : 'var(--text-muted)',
                        background: row.included ? 'var(--color-accent)' : 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {row.included && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                      </button>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{row.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cat?.sub_name}</div>
                      </div>
                    </div>
                    {row.presetAmount != null && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace", marginRight: 8 }}>
                        Preset: {fmt(row.presetAmount)}
                      </span>
                    )}
                  </div>
                  {/* Amount input */}
                  {row.included && (
                    <div style={{ paddingLeft: 28 }}>
                      <input
                        type="text" inputMode="decimal"
                        value={row.importAmount}
                        onChange={e => setAmount(row.id, e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="Enter amount"
                        style={{
                          width: mobile ? '100%' : 140, padding: '6px 10px', borderRadius: 6, fontSize: 13,
                          fontFamily: "'DM Mono', monospace",
                          border: `1px solid ${isEmpty ? 'var(--color-warning)' : 'var(--bg-input-border)'}`,
                          background: isEmpty ? 'var(--bg-inline-warning)' : 'var(--bg-input)',
                          color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Category subtotals */}
          {[...byCategory.entries()].filter(([, v]) => v.items.length > 1).map(([catId, { items, total }]) => {
            const cat = catMap.get(catId);
            return (
              <div key={catId} style={{
                padding: '8px 14px', borderRadius: 8, marginBottom: 8,
                background: 'var(--bg-inline-info)', border: '1px solid var(--bg-inline-info-border)',
                fontSize: 12, color: 'var(--text-inline-info)',
              }}>
                <strong>{cat?.sub_name}:</strong>{' '}
                {items.map((it, i) => (
                  <span key={it.id}>
                    {i > 0 && ' + '}
                    {fmt(parseFloat(it.importAmount) || 0)}
                  </span>
                ))}
                {' = '}<strong>{fmt(total)}</strong> will be added
              </div>
            );
          })}

          {/* Note */}
          <div style={{
            padding: '8px 14px', borderRadius: 8, marginBottom: 16,
            background: 'var(--bg-inline-info)', border: '1px solid var(--bg-inline-info-border)',
            fontSize: 12, color: 'var(--text-inline-info)',
          }}>
            Recurring amounts will be added to your budget for their category. If multiple items share a category, their amounts will be combined.
          </div>
        </>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} className="btn-ghost" style={{
          padding: '8px 16px', fontSize: 13, fontWeight: 600,
          background: 'transparent', color: 'var(--text-secondary)',
          border: 'none', cursor: 'pointer',
        }}>← Back</button>
        <button onClick={onNext} style={{
          padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)',
          border: 'none', cursor: 'pointer',
        }} className="btn-primary">Next →</button>
      </div>
    </div>
  );
}

/* ─── Step 3: Final Review ─── */
function Step3({ templateRows, recurringRows, onBack, onApply, applied, mobile }: {
  templateRows: TemplateRow[];
  recurringRows: RecurringRow[];
  onBack: () => void;
  onApply: () => void;
  applied: boolean;
  mobile: boolean;
}) {
  if (applied) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
          Budget Updated!
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px' }}>
          Your budget for July 2026 has been updated successfully.
        </p>
        <button onClick={onBack} style={{
          padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)',
          border: 'none', cursor: 'pointer',
        }} className="btn-primary">Done</button>
      </div>
    );
  }

  // Build final amounts
  interface FinalRow {
    categoryId: number;
    previous: number;
    templateChange: number | null;
    recurringChange: number | null;
    final: number;
    changeType: 'new' | 'overwrite' | 'add' | 'recurring-only' | 'unchanged';
  }

  const finalRows: FinalRow[] = [];
  const processed = new Set<number>();

  // Template contributions
  templateRows.forEach(tr => {
    processed.add(tr.categoryId);
    const prev = tr.existingAmount ?? 0;
    let templateDelta: number | null = null;
    let finalAmount = prev;

    if (!tr.hasConflict) {
      templateDelta = tr.templateAmount;
      finalAmount = tr.templateAmount;
    } else if (tr.action === 'overwrite') {
      templateDelta = tr.templateAmount;
      finalAmount = tr.templateAmount;
    } else if (tr.action === 'add') {
      templateDelta = tr.templateAmount;
      finalAmount = prev + tr.templateAmount;
    }
    // skip: no change

    finalRows.push({
      categoryId: tr.categoryId,
      previous: prev,
      templateChange: templateDelta,
      recurringChange: null,
      final: finalAmount,
      changeType: !tr.hasConflict ? 'new' : tr.action === 'skip' ? 'unchanged' : tr.action,
    });
  });

  // Recurring contributions
  recurringRows.filter(r => r.included).forEach(rr => {
    const amt = parseFloat(rr.importAmount) || 0;
    if (amt === 0) return;
    const existing = finalRows.find(f => f.categoryId === rr.categoryId);
    if (existing) {
      existing.recurringChange = (existing.recurringChange ?? 0) + amt;
      existing.final += amt;
      if (existing.changeType === 'unchanged') existing.changeType = 'recurring-only';
    } else {
      processed.add(rr.categoryId);
      const prev = EXISTING_BUDGET[rr.categoryId] ?? 0;
      finalRows.push({
        categoryId: rr.categoryId,
        previous: prev,
        templateChange: null,
        recurringChange: amt,
        final: prev + amt,
        changeType: 'recurring-only',
      });
    }
  });

  // Filter out rows with no change and zero final
  const visibleRows = finalRows.filter(r => r.final > 0 || r.changeType !== 'unchanged');

  // Group
  const grouped = new Map<string, FinalRow[]>();
  visibleRows.forEach(r => {
    const cat = catMap.get(r.categoryId);
    if (!cat) return;
    const group = cat.type === 'income' ? 'Income' : cat.group_name;
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(r);
  });

  // Totals
  const incomeRows = visibleRows.filter(r => catMap.get(r.categoryId)?.type === 'income');
  const expenseRows = visibleRows.filter(r => catMap.get(r.categoryId)?.type === 'expense');
  const totalIncome = incomeRows.reduce((s, r) => s + r.final, 0);
  const totalExpenses = expenseRows.reduce((s, r) => s + r.final, 0);
  const prevExpenses = expenseRows.reduce((s, r) => s + r.previous, 0);
  const prevIncome = incomeRows.reduce((s, r) => s + r.previous, 0);
  const deltaExpenses = totalExpenses - prevExpenses;
  const deltaIncome = totalIncome - prevIncome;

  const changeColor = (type: string) => {
    if (type === 'new') return 'var(--color-positive)';
    if (type === 'overwrite') return 'var(--color-warning)';
    if (type === 'add' || type === 'recurring-only') return 'var(--color-accent)';
    return 'var(--text-body)';
  };

  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
        Step 3 of 3 — Review Final Budget
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Review the final budget that will be saved for July 2026.
      </p>

      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        border: '1px solid var(--bg-card-border)', overflow: 'hidden',
        marginBottom: 16,
      }}>
        {/* Desktop column headers */}
        {!mobile && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 0.7fr 0.7fr 0.7fr',
            padding: '8px 16px', borderBottom: '1px solid var(--table-border)',
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.04em', color: 'var(--text-muted)',
          }}>
            <span>Category</span>
            <span style={{ textAlign: 'right' }}>Previous</span>
            <span style={{ textAlign: 'right' }}>Template</span>
            <span style={{ textAlign: 'right' }}>Recurring</span>
            <span style={{ textAlign: 'right' }}>Final</span>
          </div>
        )}

        {[...grouped.entries()].map(([groupName, groupRows], gi) => (
          <div key={groupName}>
            <div style={{
              padding: mobile ? '8px 12px' : '8px 16px',
              background: 'var(--bg-hover)',
              borderTop: gi > 0 ? '1px solid var(--table-border)' : 'none',
              borderBottom: '1px solid var(--table-border)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                {groupName}
              </span>
            </div>
            {groupRows.map((row, ri) => {
              const cat = catMap.get(row.categoryId);
              return mobile ? (
                <div key={row.categoryId} style={{
                  padding: '10px 12px',
                  borderBottom: ri < groupRows.length - 1 ? '1px solid var(--table-row-border)' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: changeColor(row.changeType), fontWeight: 600 }}>{cat?.sub_name}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: changeColor(row.changeType) }}>
                      {fmt(row.final)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                    {row.previous > 0 && <span>Was: <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(row.previous)}</span></span>}
                    {row.templateChange != null && <span>Tmpl: <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmtSigned(row.templateChange)}</span></span>}
                    {row.recurringChange != null && <span>Rec: <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmtSigned(row.recurringChange)}</span></span>}
                  </div>
                </div>
              ) : (
                <div key={row.categoryId} style={{
                  display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 0.7fr 0.7fr 0.7fr',
                  padding: '8px 16px', alignItems: 'center',
                  borderBottom: ri < groupRows.length - 1 ? '1px solid var(--table-row-border)' : 'none',
                }}>
                  <span style={{ fontSize: 13, color: changeColor(row.changeType), fontWeight: row.changeType !== 'unchanged' ? 600 : 400 }}>
                    {cat?.sub_name}
                  </span>
                  <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", textAlign: 'right', color: 'var(--text-muted)' }}>
                    {row.previous > 0 ? fmt(row.previous) : '—'}
                  </span>
                  <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", textAlign: 'right', color: row.templateChange != null ? changeColor(row.changeType) : 'var(--text-muted)' }}>
                    {row.templateChange != null ? fmtSigned(row.templateChange) : '—'}
                  </span>
                  <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", textAlign: 'right', color: row.recurringChange != null ? 'var(--color-accent)' : 'var(--text-muted)' }}>
                    {row.recurringChange != null ? fmtSigned(row.recurringChange) : '—'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", textAlign: 'right', color: changeColor(row.changeType) }}>
                    {fmt(row.final)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Summary KPIs */}
      <div style={{
        display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 10,
        marginBottom: 12,
      }}>
        <div style={{
          background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--bg-card-border)', padding: '12px 14px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 4 }}>Income</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: 'var(--color-positive)' }}>{fmt(totalIncome)}</div>
        </div>
        <div style={{
          background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--bg-card-border)', padding: '12px 14px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 4 }}>Expenses</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: 'var(--text-primary)' }}>{fmt(totalExpenses)}</div>
        </div>
        <div style={{
          background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--bg-card-border)', padding: '12px 14px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 4 }}>Net</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: totalIncome - totalExpenses >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
            {fmtSigned(totalIncome - totalExpenses)}
          </div>
        </div>
      </div>

      {/* Delta */}
      <div style={{
        padding: '10px 14px', borderRadius: 8, marginBottom: 16,
        background: 'var(--bg-inline-info)', border: '1px solid var(--bg-inline-info-border)',
        fontSize: 12, color: 'var(--text-inline-info)',
      }}>
        This import changes your budget by <strong>{fmtSigned(deltaExpenses)}</strong> in expenses
        {deltaIncome !== 0 && <> and <strong>{fmtSigned(deltaIncome)}</strong> in income</>}.
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} className="btn-ghost" style={{
          padding: '8px 16px', fontSize: 13, fontWeight: 600,
          background: 'transparent', color: 'var(--text-secondary)',
          border: 'none', cursor: 'pointer',
        }}>← Back</button>
        <button onClick={onApply} style={{
          padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: '#10b981', color: '#ffffff',
          border: 'none', cursor: 'pointer',
        }} className="btn-success">Apply Budget</button>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function BudgetImportWizardMockup() {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [applied, setApplied] = useState(false);

  // Step 1 state
  const [templateRows, setTemplateRows] = useState<TemplateRow[]>(() =>
    Object.entries(TEMPLATE).map(([catIdStr, amount]) => {
      const catId = Number(catIdStr);
      const existing = EXISTING_BUDGET[catId] ?? null;
      return {
        categoryId: catId,
        templateAmount: amount,
        existingAmount: existing,
        hasConflict: existing != null,
        action: 'skip' as ConflictAction,
      };
    })
  );

  // Step 2 state
  const [recurringRows, setRecurringRows] = useState<RecurringRow[]>(() =>
    RECURRING_JULY.map(r => ({
      id: r.id,
      label: r.label,
      categoryId: r.category_id,
      presetAmount: r.amount,
      importAmount: r.amount != null ? String(r.amount) : '',
      included: true,
    }))
  );

  const resetWizard = () => {
    setStep(0);
    setApplied(false);
    setTemplateRows(Object.entries(TEMPLATE).map(([catIdStr, amount]) => {
      const catId = Number(catIdStr);
      const existing = EXISTING_BUDGET[catId] ?? null;
      return { categoryId: catId, templateAmount: amount, existingAmount: existing, hasConflict: existing != null, action: 'skip' as ConflictAction };
    }));
    setRecurringRows(RECURRING_JULY.map(r => ({
      id: r.id, label: r.label, categoryId: r.category_id,
      presetAmount: r.amount, importAmount: r.amount != null ? String(r.amount) : '', included: true,
    })));
  };

  const openWizard = () => { resetWizard(); setWizardOpen(true); };
  const closeWizard = () => { setWizardOpen(false); };

  const STEPS = ['Template', 'Recurring', 'Review'];
  const mobile = viewMode === 'mobile';

  const wizardContent = (
    <div style={{
      padding: mobile ? 16 : 24,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <StepBar current={step} steps={STEPS} />
      {step === 0 && (
        <Step1
          rows={templateRows} setRows={setTemplateRows}
          onNext={() => setStep(1)} onCancel={closeWizard} mobile={mobile}
        />
      )}
      {step === 1 && (
        <Step2
          rows={recurringRows} setRows={setRecurringRows}
          onNext={() => setStep(2)} onBack={() => setStep(0)} mobile={mobile}
        />
      )}
      {step === 2 && (
        <Step3
          templateRows={templateRows} recurringRows={recurringRows}
          onBack={() => setStep(1)} onApply={() => setApplied(true)}
          applied={applied} mobile={mobile}
        />
      )}
    </div>
  );

  // Simulated budget page
  const simulatedPage = (mob: boolean) => (
    <div style={{
      padding: mob ? 16 : '28px 36px',
      fontFamily: "'DM Sans', sans-serif",
      background: 'var(--bg-main)', minHeight: mob ? 760 : '100vh',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
      }}>
        <div>
          <h1 style={{ fontSize: mob ? 17 : 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Budget
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>July 2026</p>
        </div>
        <button onClick={openWizard} style={{
          padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: 'var(--color-accent)', color: '#fff',
          border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          ⬇ Import from Template
        </button>
      </div>

      {/* Placeholder KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        {['Budgeted Income', 'Actual Income', 'Budgeted Expenses', 'Actual Expenses'].map(label => (
          <div key={label} style={{
            background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bg-card-border)',
            padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: 'var(--text-muted)' }}>—</div>
          </div>
        ))}
      </div>

      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bg-card-border)',
        padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
      }}>
        Click "Import from Template" to populate this month's budget from your template and recurring items.
      </div>
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

      {mobile ? (
        <PhoneFrame>
          {simulatedPage(true)}
        </PhoneFrame>
      ) : (
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          {simulatedPage(false)}
        </div>
      )}

      {/* Wizard modal */}
      {wizardOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--bg-modal)', zIndex: 50,
          display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center',
        }} onClick={closeWizard}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card)',
            borderRadius: mobile ? '16px 16px 0 0' : 12,
            maxWidth: mobile ? '100%' : 640,
            width: mobile ? '100%' : '90%',
            maxHeight: mobile ? '92vh' : '85vh',
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} className="hide-scrollbar">
            {/* Modal header with close */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: mobile ? '12px 16px 0' : '16px 24px 0',
              ...(mobile ? {} : {}),
            }}>
              {mobile && (
                <div style={{
                  width: 36, height: 4, borderRadius: 2, background: 'var(--text-muted)',
                  margin: '0 auto 12px', opacity: 0.3,
                }} />
              )}
            </div>
            {wizardContent}
          </div>
        </div>
      )}

      <ThemeToggle />
    </div>
  );
}
