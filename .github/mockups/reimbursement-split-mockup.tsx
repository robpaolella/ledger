// @ts-nocheck
import { useState, useMemo } from 'react';

/* ─── Sample Data ─── */

const INCOME_CATS = [
  { id: 101, group_name: 'Income', sub_name: 'Salary', type: 'income' },
  { id: 102, group_name: 'Income', sub_name: 'Bonus', type: 'income' },
  { id: 103, group_name: 'Income', sub_name: 'Reimbursement', type: 'income' },
];

const EXPENSE_CATS = [
  { id: 1, group_name: 'Shopping', sub_name: 'Groceries', type: 'expense' },
  { id: 2, group_name: 'Shopping', sub_name: 'Household', type: 'expense' },
  { id: 3, group_name: 'Shopping', sub_name: 'Online Shopping', type: 'expense' },
  { id: 5, group_name: 'Transportation', sub_name: 'Fuel', type: 'expense' },
  { id: 6, group_name: 'Transportation', sub_name: 'Auto Insurance', type: 'expense' },
  { id: 7, group_name: 'Dining', sub_name: 'Restaurants', type: 'expense' },
  { id: 8, group_name: 'Dining', sub_name: 'Coffee', type: 'expense' },
  { id: 10, group_name: 'Entertainment', sub_name: 'Subscriptions', type: 'expense' },
  { id: 11, group_name: 'Bills & Utilities', sub_name: 'Electric', type: 'expense' },
  { id: 14, group_name: 'Travel', sub_name: 'Hotels', type: 'expense' },
  { id: 15, group_name: 'Travel', sub_name: 'Flights', type: 'expense' },
  { id: 16, group_name: 'Travel', sub_name: 'Meals (Business)', type: 'expense' },
];

const ALL_CATS = [...INCOME_CATS, ...EXPENSE_CATS];

const CAT_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16','#6366f1','#d946ef','#0ea5e9','#eab308','#22c55e','#e11d48'];

function getCatColor(groupName: string) {
  const groups = [...new Set(ALL_CATS.map(c => c.group_name))];
  const idx = groups.indexOf(groupName);
  return CAT_COLORS[idx >= 0 ? idx % CAT_COLORS.length : 0];
}

function groupCats(cats: typeof ALL_CATS) {
  const groups: { group: string; cats: typeof ALL_CATS }[] = [];
  const map = new Map<string, typeof ALL_CATS>();
  for (const c of cats) {
    if (!map.has(c.group_name)) {
      const arr: typeof ALL_CATS = [];
      map.set(c.group_name, arr);
      groups.push({ group: c.group_name, cats: arr });
    }
    map.get(c.group_name)!.push(c);
  }
  return groups;
}

function fmt(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function findCat(id: number | null) {
  return ALL_CATS.find(c => c.id === id) ?? null;
}

/* ─── Reusable UI (matching Ledger patterns) ─── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border rounded-lg text-[13px] outline-none text-[var(--text-body)] border-[var(--table-border)] bg-[var(--bg-input)]';
const splitInputCls = 'w-full px-2 py-1.5 border rounded-md text-[12px] outline-none text-[var(--text-body)] border-[var(--table-border)] bg-[var(--bg-input)]';

/* ─── Reimbursement Badge ─── */
function ReimbursementBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--bg-inline-info)] text-[var(--text-inline-info)] border border-[var(--bg-inline-info-border)]">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
      Reimbursement
    </span>
  );
}

/* ═══════════════════════════════════════
   SPLIT EDITOR — OPTION B (Per-Row Toggle)
   Matches real SplitEditor.tsx patterns
   ═══════════════════════════════════════ */

interface Split {
  catId: number | null;
  amount: number;
  isReimbursement: boolean;
}

function SplitEditorB({ totalAmount, initialSplits, compact = false }: {
  totalAmount: number;
  initialSplits: Split[];
  compact?: boolean;
}) {
  const [mode, setMode] = useState<'$' | '%'>('$');
  const [splits, setSplits] = useState<Split[]>(initialSplits);

  const allocated = splits.reduce((s, r) => s + r.amount, 0);
  const remaining = +((Math.abs(totalAmount) - allocated).toFixed(2));
  const isValid = Math.abs(remaining) < 0.01 && splits.every(s => s.catId && s.amount > 0) && splits.length >= 2;

  const updateSplit = (idx: number, field: string, val: any) => {
    setSplits(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      if (field === 'isReimbursement') {
        // When toggling reimbursement, clear category since type changes
        return { ...s, isReimbursement: val, catId: null };
      }
      return { ...s, [field]: val };
    }));
  };

  const removeSplit = (idx: number) => {
    if (splits.length <= 2) return;
    setSplits(prev => prev.filter((_, i) => i !== idx));
  };

  const addSplit = () => {
    const rem = +(Math.abs(totalAmount) - allocated).toFixed(2);
    setSplits(prev => [...prev, { catId: null, amount: rem > 0 ? rem : 0, isReimbursement: false }]);
  };

  // Build grouped categories for each row based on its toggle
  const getGrouped = (isReimb: boolean) => {
    const cats = isReimb ? EXPENSE_CATS : INCOME_CATS;
    return groupCats(cats);
  };

  return (
    <div className={`rounded-lg border border-[var(--bg-card-border)] bg-[var(--bg-hover)] ${compact ? 'p-2' : 'p-3'}`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-secondary)]">
          Split Transaction — {fmt(totalAmount)}
        </span>
        <button
          onClick={() => setMode(m => m === '$' ? '%' : '$')}
          className="px-2 py-0.5 rounded text-[11px] font-semibold font-mono border border-[var(--bg-card-border)] bg-[var(--bg-card)] text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-hover)]"
        >
          {mode === '$' ? '$ → %' : '% → $'}
        </button>
      </div>

      {/* Split rows */}
      <div className="flex flex-col gap-1.5">
        {splits.map((s, i) => {
          const grouped = getGrouped(s.isReimbursement);
          return (
            <div key={i}>
              <div className="flex gap-1.5 items-center">
                <div className="flex-1 min-w-0">
                  <select
                    value={s.catId ?? ''}
                    onChange={(e) => updateSplit(i, 'catId', parseInt(e.target.value))}
                    className={`${splitInputCls} ${compact ? 'text-[11px]' : ''}`}
                  >
                    <option value="" disabled>Select category...</option>
                    {grouped.map(g => (
                      <optgroup key={g.group} label={g.group}>
                        {g.cats.map(c => (
                          <option key={c.id} value={c.id}>{c.sub_name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className={compact ? 'w-[80px]' : 'w-[100px]'}>
                  {mode === '$' ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={s.amount || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0;
                        updateSplit(i, 'amount', val);
                      }}
                      placeholder="0.00"
                      className={`${splitInputCls} font-mono text-right ${compact ? 'text-[11px]' : ''}`}
                    />
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={Math.abs(totalAmount) ? Math.round((s.amount / Math.abs(totalAmount)) * 100) : ''}
                        onChange={(e) => {
                          const pct = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0;
                          updateSplit(i, 'amount', +(Math.abs(totalAmount) * pct / 100).toFixed(2));
                        }}
                        placeholder="0"
                        className={`${splitInputCls} font-mono text-right pr-5 ${compact ? 'text-[11px]' : ''}`}
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)] font-mono pointer-events-none">%</span>
                    </div>
                  )}
                </div>
                {splits.length > 2 && (
                  <button
                    onClick={() => removeSplit(i)}
                    className="w-6 h-6 rounded flex items-center justify-center border-none bg-transparent text-[var(--text-muted)] cursor-pointer text-[16px] flex-shrink-0 hover:text-[var(--color-negative)] hover:bg-[var(--bg-card)]"
                  >
                    ×
                  </button>
                )}
              </div>
              {/* Reimbursement toggle — only on last row; once set, stays but link moves to new last row */}
              {i === splits.length - 1 && !s.isReimbursement ? (
                <button
                  onClick={() => updateSplit(i, 'isReimbursement', true)}
                  className="text-[11px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer mt-1 ml-0.5 p-0 btn-ghost"
                >
                  Reimbursement
                </button>
              ) : s.isReimbursement ? (
                <div className="flex items-center gap-1.5 mt-1 ml-0.5">
                  <ReimbursementBadge />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Add split */}
      <button
        onClick={addSplit}
        className="mt-1.5 w-full py-1 rounded-md text-[12px] border border-dashed border-[var(--bg-card-border)] bg-transparent text-[var(--color-accent)] cursor-pointer hover:bg-[var(--bg-card)]"
      >
        + Add Split
      </button>

      {/* Footer */}
      <div className="mt-2 flex justify-between items-center flex-wrap gap-2">
        <div className="font-mono text-[12px]">
          <span className="text-[var(--text-muted)]">Allocated: </span>
          <span className={`font-semibold ${
            Math.abs(remaining) < 0.01 ? 'text-[var(--color-positive)]'
              : remaining < 0 ? 'text-[var(--color-negative)]'
              : 'text-[var(--text-primary)]'
          }`}>
            {fmt(allocated)}
          </span>
          {Math.abs(remaining) >= 0.01 && (
            <span className={`ml-1.5 text-[11px] ${remaining < 0 ? 'text-[var(--color-negative)]' : 'text-[var(--color-warning)]'}`}>
              ({remaining > 0 ? '+' : ''}{fmt(Math.abs(remaining))} {remaining > 0 ? 'remaining' : 'over'})
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button className="px-3 py-1.5 rounded-md text-[12px] font-medium border border-[var(--bg-card-border)] bg-[var(--btn-secondary-bg)] text-[var(--text-primary)] cursor-pointer btn-secondary">
            Cancel
          </button>
          <button className={`px-3 py-1.5 rounded-md text-[12px] font-semibold border-none ${
            isValid ? 'bg-[var(--color-accent)] text-white cursor-pointer' : 'bg-[var(--bg-card-border)] text-[var(--text-muted)] cursor-not-allowed opacity-60'
          }`}>
            Apply Split
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   BUDGET IMPACT PREVIEW
   ═══════════════════════════════════════ */

function BudgetImpactPreview({ splits }: { splits: Split[] }) {
  const incomeSplits = splits.filter(s => !s.isReimbursement && s.catId);
  const expenseSplits = splits.filter(s => s.isReimbursement && s.catId);

  return (
    <div className="rounded-lg border border-[var(--bg-card-border)] bg-[var(--bg-card)] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-secondary)] mb-2">
        How this affects your budget
      </div>
      <div className="flex flex-col gap-2">
        {incomeSplits.map((s, i) => {
          const cat = findCat(s.catId);
          return (
            <div key={i} className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: getCatColor(cat?.group_name ?? '') }} />
                <span className="text-[var(--text-body)]">{cat?.sub_name}</span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono bg-[var(--bg-hover)] px-1 rounded">income</span>
              </div>
              <span className="font-mono font-semibold text-[var(--color-positive)]">+{fmt(s.amount)}</span>
            </div>
          );
        })}
        {expenseSplits.map((s, i) => {
          const cat = findCat(s.catId);
          return (
            <div key={i} className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: getCatColor(cat?.group_name ?? '') }} />
                <span className="text-[var(--text-body)]">{cat?.sub_name}</span>
                <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--text-inline-info)] font-mono bg-[var(--bg-inline-info)] px-1 rounded">reimb.</span>
              </div>
              <span className="font-mono font-semibold text-[var(--color-negative)]">−{fmt(s.amount)}</span>
            </div>
          );
        })}
        {expenseSplits.length > 0 && (
          <div className="border-t border-[var(--table-row-border)] pt-1.5 mt-0.5">
            <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Reimbursement splits reduce the matching expense category total — if you previously recorded a ${fmt(expenseSplits.reduce((s, r) => s + r.amount, 0))} expense, 
              this cancels it out in your budget.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   DESKTOP TRANSACTION MODAL
   (Matches real TransactionForm exactly)
   ═══════════════════════════════════════ */

function TransactionModal({ onClose }: { onClose: () => void }) {
  const [txType] = useState<'income'>('income');
  const [splitMode, setSplitMode] = useState(true);
  const [showImpact, setShowImpact] = useState(true);

  const defaultSplits: Split[] = [
    { catId: 101, amount: 4450.00, isReimbursement: false },
    { catId: 14, amount: 349.68, isReimbursement: true },
    { catId: 16, amount: 200.00, isReimbursement: true },
  ];

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--bg-card)] rounded-xl p-6 w-full shadow-xl" style={{ maxWidth: '32rem' }} onClick={e => e.stopPropagation()}>
        <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-4">Edit Transaction</h3>
        <div className="flex flex-col gap-3">
          {/* Date / Account row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" defaultValue="2026-02-28" className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Account">
              <select className={inputCls}>
                <option>Chase Checking (...4829)</option>
                <option>Capital One Venture (...7291)</option>
              </select>
            </Field>
          </div>
          {/* Description */}
          <Field label="Description">
            <input defaultValue="INSIGHTSOFTWARE PAYROLL" className={inputCls} />
          </Field>
          {/* Note */}
          <Field label="Note (optional)">
            <input defaultValue="Feb 2026 paycheck — includes hotel & meals reimbursement" className={inputCls} />
          </Field>
          {/* Type / Category row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <div className="flex gap-2">
                <button className="flex-1 py-2 text-[12px] font-semibold rounded-lg border-none cursor-pointer capitalize bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] btn-secondary opacity-50 cursor-not-allowed">
                  expense
                </button>
                <button className="flex-1 py-2 text-[12px] font-semibold rounded-lg border-none cursor-pointer capitalize bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] btn-primary opacity-50 cursor-not-allowed">
                  income
                </button>
              </div>
            </Field>
            <div>
              {splitMode ? (
                <>
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-1">
                    Category <span className="text-[var(--color-accent)] normal-case font-normal">(split mode)</span>
                  </div>
                  <div className="text-[12px] text-[var(--color-positive)] font-medium">
                    ✓ 3 categories assigned
                    <button onClick={() => setSplitMode(false)}
                      className="ml-2 text-[11px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer p-0 hover:underline">
                      Remove split
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Field label="Category">
                    <select className={inputCls}>
                      <option>Select category</option>
                      <optgroup label="Income">
                        <option selected>Salary</option>
                        <option>Bonus</option>
                        <option>Reimbursement</option>
                      </optgroup>
                    </select>
                  </Field>
                  <button onClick={() => setSplitMode(true)}
                    className="text-[11px] text-[var(--color-accent)] bg-transparent border-none cursor-pointer mt-1 p-0 hover:underline">
                    Split across categories
                  </button>
                </>
              )}
            </div>
          </div>
          {/* Amount */}
          <Field label="Amount">
            <input defaultValue="4,999.68" className={`${inputCls} font-mono`} />
          </Field>
          {/* Split Editor */}
          {splitMode && (
            <SplitEditorB totalAmount={4999.68} initialSplits={defaultSplits} />
          )}
          {/* Budget Impact */}
          {splitMode && showImpact && (
            <div>
              <button onClick={() => setShowImpact(!showImpact)}
                className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer p-0 mb-1.5 hover:underline">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  style={{ transform: showImpact ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Budget impact
              </button>
              <BudgetImpactPreview splits={defaultSplits} />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-5 justify-end">
          <div className="mr-auto">
            <button className="px-3 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-destructive-light-bg)] text-[var(--btn-destructive-light-text)] border-none cursor-pointer btn-destructive-light">
              Delete
            </button>
          </div>
          <button onClick={onClose}
            className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] border-none cursor-pointer btn-secondary">
            Cancel
          </button>
          <button className="px-4 py-2 text-[12px] font-semibold rounded-lg border-none bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] cursor-pointer btn-primary">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MOBILE BOTTOM SHEET MODAL
   (Matches real BottomSheet patterns)
   ═══════════════════════════════════════ */

function MobileTransactionSheet({ onClose }: { onClose: () => void }) {
  const [splitMode, setSplitMode] = useState(true);
  const [showImpact, setShowImpact] = useState(true);

  const defaultSplits: Split[] = [
    { catId: 101, amount: 4450.00, isReimbursement: false },
    { catId: 14, amount: 349.68, isReimbursement: true },
    { catId: 16, amount: 200.00, isReimbursement: true },
  ];

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--bg-modal)]" onClick={onClose} />
      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-[var(--bg-card)] rounded-t-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
        {/* Drag handle */}
        <div className="flex justify-center shrink-0" style={{ padding: '14px 0 10px' }}>
          <div className="w-9 h-1 rounded-full bg-[var(--bg-card-border)]" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 px-5 pt-1 pb-3">
          <span className="text-[16px] font-bold text-[var(--text-primary)]">Edit Transaction</span>
          <button onClick={onClose} className="text-[20px] leading-none text-[var(--text-muted)] cursor-pointer bg-transparent border-none p-1">×</button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-6" style={{ scrollbarWidth: 'none' }}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input type="date" defaultValue="2026-02-28" className={`${inputCls} font-mono`} />
              </Field>
              <Field label="Account">
                <select className={inputCls}>
                  <option>Chase (...4829)</option>
                </select>
              </Field>
            </div>
            <Field label="Description">
              <input defaultValue="INSIGHTSOFTWARE PAYROLL" className={inputCls} />
            </Field>
            <Field label="Note (optional)">
              <input defaultValue="Feb paycheck w/ reimbursement" className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <div className="flex gap-2">
                  <button className="flex-1 py-2 text-[12px] font-semibold rounded-lg border-none capitalize bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] opacity-50">
                    expense
                  </button>
                  <button className="flex-1 py-2 text-[12px] font-semibold rounded-lg border-none capitalize bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] opacity-50">
                    income
                  </button>
                </div>
              </Field>
              <div>
                {splitMode ? (
                  <>
                    <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-1">
                      Category <span className="text-[var(--color-accent)] normal-case font-normal">(split mode)</span>
                    </div>
                    <div className="text-[12px] text-[var(--color-positive)] font-medium">
                      ✓ 3 categories
                      <button onClick={() => setSplitMode(false)}
                        className="ml-2 text-[11px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer p-0 hover:underline">
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <Field label="Category">
                      <select className={inputCls}><option>Salary</option></select>
                    </Field>
                    <button onClick={() => setSplitMode(true)}
                      className="text-[11px] text-[var(--color-accent)] bg-transparent border-none cursor-pointer mt-1 p-0 hover:underline">
                      Split across categories
                    </button>
                  </>
                )}
              </div>
            </div>
            <Field label="Amount">
              <input defaultValue="4,999.68" className={`${inputCls} font-mono`} inputMode="decimal" />
            </Field>
            {splitMode && (
              <SplitEditorB totalAmount={4999.68} initialSplits={defaultSplits} compact />
            )}
            {splitMode && (
              <div>
                <button onClick={() => setShowImpact(!showImpact)}
                  className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer p-0 mb-1.5 hover:underline">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    style={{ transform: showImpact ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  Budget impact
                </button>
                {showImpact && <BudgetImpactPreview splits={defaultSplits} />}
              </div>
            )}
          </div>
          {/* Action buttons */}
          <div className="flex gap-2 mt-5">
            <button className="px-3 py-2.5 text-[13px] font-semibold rounded-lg bg-[var(--btn-destructive-light-bg)] text-[var(--btn-destructive-light-text)] border-none cursor-pointer btn-destructive-light">
              Delete
            </button>
            <div className="flex-1" />
            <button onClick={onClose}
              className="px-4 py-2.5 text-[13px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] border-none cursor-pointer btn-secondary">
              Cancel
            </button>
            <button className="px-4 py-2.5 text-[13px] font-semibold rounded-lg border-none bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] cursor-pointer btn-primary">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN MOCKUP PAGE
   ═══════════════════════════════════════ */

export default function ReimbursementSplitMockup() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [showDesktopModal, setShowDesktopModal] = useState(false);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop');

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(!isDark);
  };

  // Sample transaction table data
  const TABLE_DATA = [
    { id: 1, date: '2026-02-28', desc: 'INSIGHTSOFTWARE PAYROLL', note: 'Feb paycheck w/ reimbursement', account: 'Chase (...4829)', type: 'income', group: 'Income', sub: 'Salary', amount: -4999.68,
      isSplit: true, splits: [
        { group: 'Income', sub: 'Salary', type: 'income', amount: -4450.00 },
        { group: 'Travel', sub: 'Hotels', type: 'expense', amount: -349.68, isReimbursement: true },
        { group: 'Travel', sub: 'Meals (Business)', type: 'expense', amount: -200.00, isReimbursement: true },
      ]
    },
    { id: 2, date: '2026-02-27', desc: 'WHOLE FOODS MARKET', note: null, account: 'Capital One (...7291)', type: 'expense', group: 'Shopping', sub: 'Groceries', amount: 127.43, isSplit: false, splits: null },
    { id: 3, date: '2026-02-26', desc: 'SHELL OIL', note: null, account: 'Chase (...4829)', type: 'expense', group: 'Transportation', sub: 'Fuel', amount: 52.18, isSplit: false, splits: null },
    { id: 4, date: '2026-02-25', desc: 'NETFLIX.COM', note: null, account: 'Capital One (...7291)', type: 'expense', group: 'Entertainment', sub: 'Subscriptions', amount: 15.99, isSplit: false, splits: null },
    { id: 5, date: '2026-02-24', desc: 'MARRIOTT HOTELS', note: 'Business trip - Chicago', account: 'Capital One (...7291)', type: 'expense', group: 'Travel', sub: 'Hotels', amount: 349.68, isSplit: false, splits: null },
    { id: 6, date: '2026-02-24', desc: 'UBER EATS', note: null, account: 'Capital One (...7291)', type: 'expense', group: 'Dining', sub: 'Restaurants', amount: 38.50, isSplit: false, splits: null },
  ];

  const allGroupNames = useMemo(() => [...new Set(TABLE_DATA.flatMap(t => t.splits ? t.splits.map(s => s.group) : [t.group]))], []);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--bg-card-border)]">
        <div>
          <h1 className="text-[18px] font-bold text-[var(--text-primary)] m-0">Reimbursement Split — Option B</h1>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5 m-0">Per-row "Reimbursement" toggle that switches the category dropdown to expense categories</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-[var(--bg-card-border)]">
            <button onClick={() => setView('desktop')}
              className={`px-3 py-1.5 text-[12px] font-medium border-none cursor-pointer ${view === 'desktop' ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]' : 'bg-[var(--bg-card)] text-[var(--text-secondary)]'}`}>
              Desktop
            </button>
            <button onClick={() => setView('mobile')}
              className={`px-3 py-1.5 text-[12px] font-medium border-none cursor-pointer ${view === 'mobile' ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]' : 'bg-[var(--bg-card)] text-[var(--text-secondary)]'}`}>
              Mobile
            </button>
          </div>
          {/* Theme toggle */}
          <button onClick={toggleTheme}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] border-none cursor-pointer btn-secondary">
            {isDark ? '☀ Light' : '🌙 Dark'}
          </button>
        </div>
      </div>

      {view === 'desktop' ? (
        /* ─── DESKTOP VIEW ─── */
        <div className="p-6">
          {/* Page header mimicking TransactionsPage */}
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-[22px] font-bold text-[var(--text-primary)] m-0">Transactions</h2>
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 px-4 py-2 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer btn-secondary">
                Bulk Edit
              </button>
              <button onClick={() => setShowDesktopModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Transaction
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] mb-5 px-4 py-3 flex gap-3 items-center">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input placeholder="Search transactions..." className="w-full py-2 pl-[34px] pr-2 border border-[var(--table-border)] rounded-lg text-[13px] outline-none bg-[var(--bg-input)] text-[var(--text-secondary)]" />
            </div>
            <select className="px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)]">
              <option>All Accounts</option>
            </select>
            <select className="px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)]">
              <option>All</option>
              <option>Income</option>
              <option>Expense</option>
            </select>
            <select className="px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)]">
              <option>This Month</option>
            </select>
          </div>

          {/* Transaction table */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)]">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="px-2.5 py-2 text-left text-[11px] uppercase font-semibold tracking-[0.04em] text-[var(--text-muted)] border-b-2 border-[var(--table-border)]">Date</th>
                  <th className="px-2.5 py-2 text-left text-[11px] uppercase font-semibold tracking-[0.04em] text-[var(--text-muted)] border-b-2 border-[var(--table-border)]">Description</th>
                  <th className="px-2.5 py-2 text-left text-[11px] uppercase font-semibold tracking-[0.04em] text-[var(--text-muted)] border-b-2 border-[var(--table-border)]">Account</th>
                  <th className="px-2.5 py-2 text-left text-[11px] uppercase font-semibold tracking-[0.04em] text-[var(--text-muted)] border-b-2 border-[var(--table-border)]">Category</th>
                  <th className="px-2.5 py-2 text-left text-[11px] uppercase font-semibold tracking-[0.04em] text-[var(--text-muted)] border-b-2 border-[var(--table-border)]">Sub-Category</th>
                  <th className="px-2.5 py-2 text-right text-[11px] uppercase font-semibold tracking-[0.04em] text-[var(--text-muted)] border-b-2 border-[var(--table-border)]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {TABLE_DATA.map(t => {
                  const isIncome = t.type === 'income';
                  const isSplit = t.isSplit && t.splits;
                  const amtColor = isIncome ? 'text-[var(--color-positive)]' : '';
                  const amtText = isIncome
                    ? `+${fmt(Math.abs(t.amount))}`
                    : fmt(Math.abs(t.amount));

                  // For split rows: get unique groups
                  const splitGroups = isSplit
                    ? Array.from(new Map(t.splits!.map(s => [s.group, s])).values())
                    : [];

                  // For split sub-categories: show overlapping colored dots + "Split (N)"
                  const splitColors = isSplit
                    ? t.splits!.map(s => getCatColor(s.group))
                    : [];

                  return (
                    <tr key={t.id}
                      onClick={() => { if (t.id === 1) setShowDesktopModal(true); }}
                      className="border-b border-[var(--table-row-border)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="px-2.5 py-2 font-mono text-[12px] text-[var(--text-body)]">{t.date}</td>
                      <td className="px-2.5 py-2 text-[var(--text-primary)] font-medium">
                        {t.desc}
                        {isSplit && t.splits!.some((s: any) => s.isReimbursement) && (
                          <span className="ml-2"><ReimbursementBadge /></span>
                        )}
                      </td>
                      <td className="px-2.5 py-2">
                        <span className="inline-block text-[11px] font-mono bg-[var(--badge-account-bg)] text-[var(--badge-account-text)] px-2 py-0.5 rounded-md">
                          {t.account}
                        </span>
                      </td>
                      <td className="px-2.5 py-2">
                        {isSplit ? (
                          <div className="flex flex-col gap-0.5">
                            {splitGroups.map((s: any, gi: number) => (
                              <div key={gi} className="flex items-center gap-1.5">
                                <span className="inline-block w-[7px] h-[7px] rounded-full flex-shrink-0"
                                  style={{ background: getCatColor(s.group) }} />
                                <span className="text-[11px] text-[var(--text-secondary)]">{s.group}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block w-[7px] h-[7px] rounded-full flex-shrink-0"
                              style={{ background: getCatColor(t.group) }} />
                            <span className="text-[11px] text-[var(--text-secondary)]">{t.group}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-2">
                        {isSplit ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-flex" style={{ gap: 0 }}>
                              {splitColors.map((color, ci) => (
                                <span key={ci} style={{
                                  width: 10, height: 10, borderRadius: '50%',
                                  background: color,
                                  border: '1.5px solid var(--bg-card)',
                                  marginLeft: ci > 0 ? -3 : 0,
                                  zIndex: splitColors.length - ci,
                                  display: 'inline-block', flexShrink: 0,
                                }} />
                              ))}
                            </span>
                            <span className="text-[10px] font-semibold text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] whitespace-nowrap">
                              Split ({t.splits!.length})
                            </span>
                          </span>
                        ) : (
                          <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: `${getCatColor(t.group)}18`, color: getCatColor(t.group) }}>
                            {t.sub}
                          </span>
                        )}
                      </td>
                      <td className={`px-2.5 py-2 text-right font-mono font-semibold ${amtColor}`}>
                        {amtText}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Annotation callout */}
          <div className="mt-6 bg-[var(--bg-inline-info)] border border-[var(--bg-inline-info-border)] rounded-lg p-4">
            <div className="text-[13px] font-semibold text-[var(--text-inline-info)] mb-2">How it works</div>
            <ul className="text-[12px] text-[var(--text-inline-info)] m-0 pl-4 flex flex-col gap-1.5">
              <li>Click the payroll row (first row) to see the split editor in action</li>
              <li>The last split row shows a <strong>"Reimbursement"</strong> link (underlines on hover)</li>
              <li>Clicking it switches that row's dropdown from income to expense categories</li>
              <li>Once toggled, the row shows a <ReimbursementBadge /> badge — the link moves to the next new row</li>
              <li>To undo a reimbursement split, delete the row and re-add it</li>
              <li>Budget impact: reimbursement splits <em>reduce</em> the matching expense category — canceling out original out-of-pocket expenses</li>
            </ul>
          </div>
        </div>
      ) : (
        /* ─── MOBILE VIEW ─── */
        <div className="flex justify-center p-6">
          <div className="relative bg-[var(--bg-main)] rounded-[2rem] border-4 border-[var(--text-muted)] shadow-2xl overflow-hidden" style={{ width: 390, height: 844 }}>
            {/* Status bar */}
            <div className="flex justify-between items-center px-6 pt-3 pb-1">
              <span className="font-mono text-[12px] font-semibold text-[var(--text-primary)]">9:41</span>
              <div className="flex items-center gap-1">
                <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" className="text-[var(--text-primary)]">
                  <rect x="0" y="8" width="3" height="4" rx="0.5" /><rect x="4" y="5" width="3" height="7" rx="0.5" /><rect x="8" y="2" width="3" height="10" rx="0.5" /><rect x="12" y="0" width="3" height="12" rx="0.5" />
                </svg>
                <svg width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="currentColor" strokeWidth="1" className="text-[var(--text-primary)]">
                  <rect x="0.5" y="0.5" width="19" height="11" rx="2" /><rect x="20" y="3.5" width="1.5" height="5" rx="0.5" fill="currentColor" />
                  <rect x="1.5" y="1.5" width="14" height="9" rx="1" fill="currentColor" />
                </svg>
              </div>
            </div>

            {/* Page header */}
            <div className="px-4 pt-2 pb-3">
              <h2 className="text-[17px] font-bold text-[var(--text-primary)] m-0">Transactions</h2>
            </div>

            {/* Search & filters */}
            <div className="px-4 mb-3">
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] px-3 py-2.5 flex flex-col gap-2">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </span>
                  <input placeholder="Search transactions..." className="w-full py-1.5 pl-7 pr-2 border border-[var(--table-border)] rounded-lg text-[12px] outline-none bg-[var(--bg-input)] text-[var(--text-secondary)]" />
                </div>
                <div className="flex gap-2">
                  <select className="flex-1 px-2 py-1.5 border border-[var(--table-border)] rounded-lg text-[12px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)]">
                    <option>This Month</option>
                  </select>
                  <button className="px-2.5 py-1.5 border border-[var(--table-border)] rounded-lg text-[12px] font-medium text-[var(--text-secondary)] bg-[var(--bg-input)]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Transaction cards */}
            <div className="px-4 flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 560, scrollbarWidth: 'none' }}>
              {TABLE_DATA.map(t => {
                const isIncome = t.type === 'income';
                const isSplit = t.isSplit && t.splits;
                const amtColor = isIncome ? 'text-[var(--color-positive)]' : '';
                const amtText = isIncome ? `+${fmt(Math.abs(t.amount))}` : fmt(Math.abs(t.amount));
                const splitColors = isSplit ? t.splits!.map(s => getCatColor(s.group)) : [];

                return (
                  <div key={t.id}
                    onClick={() => { if (t.id === 1) setShowMobileSheet(true); }}
                    className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] px-3.5 py-2.5 flex justify-between items-center cursor-pointer active:bg-[var(--bg-hover)]">
                    <div className="flex-1 min-w-0 mr-3">
                      <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">{t.desc}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">{t.date}</span>
                        <span className="text-[var(--text-muted)]">·</span>
                        {isSplit ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-flex" style={{ gap: 0 }}>
                              {splitColors.map((color, ci) => (
                                <span key={ci} style={{
                                  width: 8, height: 8, borderRadius: '50%',
                                  background: color,
                                  border: '1.5px solid var(--bg-card)',
                                  marginLeft: ci > 0 ? -3 : 0,
                                  zIndex: splitColors.length - ci,
                                  display: 'inline-block', flexShrink: 0,
                                }} />
                              ))}
                            </span>
                            <span className="text-[10px] font-semibold text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] whitespace-nowrap">
                              Split ({t.splits!.length})
                            </span>
                          </span>
                        ) : (
                          <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: `${getCatColor(t.group)}18`, color: getCatColor(t.group) }}>
                            {t.sub}
                          </span>
                        )}
                        {isSplit && t.splits!.some((s: any) => s.isReimbursement) && (
                          <ReimbursementBadge />
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`text-[14px] font-mono font-semibold ${amtColor}`}>{amtText}</div>
                      <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{t.account}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Floating pill button */}
            <div className="absolute bottom-[70px] left-1/2 -translate-x-1/2">
              <button onClick={() => setShowMobileSheet(true)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-full shadow-lg text-[13px] font-semibold border-none cursor-pointer bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] btn-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Transaction
              </button>
            </div>

            {/* Bottom tab bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-[var(--bg-card)] border-t border-[var(--bg-card-border)] px-4 py-2 flex justify-around">
              {['Home', 'Transactions', 'Budget', 'More'].map((tab, i) => (
                <button key={tab} className={`flex flex-col items-center gap-0.5 bg-transparent border-none text-[10px] font-medium ${i === 1 ? 'text-[var(--color-accent)]' : 'text-[var(--text-muted)]'} cursor-pointer`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    {i === 0 && <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>}
                    {i === 1 && <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>}
                    {i === 2 && <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></>}
                    {i === 3 && <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>}
                  </svg>
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showDesktopModal && <TransactionModal onClose={() => setShowDesktopModal(false)} />}
      {showMobileSheet && <MobileTransactionSheet onClose={() => setShowMobileSheet(false)} />}
    </div>
  );
}
