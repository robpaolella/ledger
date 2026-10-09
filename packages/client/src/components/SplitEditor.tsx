import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { formatMoney } from '@ledger/shared';
import CurrencyInput from './CurrencyInput';
import { ReimbursementBadge } from './badges';

export interface SplitRow {
  categoryId: number | null;
  amount: number;
  isReimbursement?: boolean;
}

export interface SplitCategory {
  id: number;
  group_name: string;
  sub_name: string;
  type: string;
}

interface SplitEditorProps {
  totalAmount: number;
  initialSplits?: SplitRow[];
  categories: SplitCategory[];
  allCategories?: SplitCategory[];
  txType?: 'income' | 'expense';
  onApply: (splits: SplitRow[]) => void;
  onCancel: () => void;
  onChange?: (splits: SplitRow[]) => void;
  compact?: boolean;
}

function groupCategories(cats: SplitCategory[]) {
  const groups: { group: string; cats: SplitCategory[] }[] = [];
  const map = new Map<string, SplitCategory[]>();
  for (const c of cats) {
    if (!map.has(c.group_name)) {
      const arr: SplitCategory[] = [];
      map.set(c.group_name, arr);
      groups.push({ group: c.group_name, cats: arr });
    }
    map.get(c.group_name)!.push(c);
  }
  return groups;
}

export default function SplitEditor({
  totalAmount,
  initialSplits,
  categories,
  allCategories,
  txType,
  onApply,
  onCancel,
  onChange,
  compact = false,
}: SplitEditorProps) {
  const [mode, setMode] = useState<'$' | '%'>('$');
  const [splits, setSplits] = useState<SplitRow[]>(
    initialSplits?.length
      ? initialSplits
      : [
          { categoryId: null, amount: totalAmount },
          { categoryId: null, amount: 0 },
        ]
  );
  // Track raw input strings so trailing decimals/zeros aren't lost during typing
  const [rawAmounts, setRawAmounts] = useState<string[]>(
    () => (initialSplits?.length ? initialSplits : [{ amount: totalAmount }, { amount: 0 }])
      .map(s => s.amount ? s.amount.toString() : '')
  );

  // Reimbursement mode: enabled when txType is income and allCategories provided
  const reimbursementEnabled = txType === 'income' && !!allCategories;

  // Expense categories for reimbursement rows
  const expenseCategories = useMemo(() => {
    if (!allCategories) return [];
    return allCategories.filter(c => c.type === 'expense');
  }, [allCategories]);

  const allocated = useMemo(
    () => splits.reduce((s, r) => s + r.amount, 0),
    [splits]
  );
  const remaining = +((Math.abs(totalAmount) - allocated).toFixed(2));
  const absTotalAmount = Math.abs(totalAmount);

  // Keep parent in sync with current split state. Only `splits` drives the
  // effect: the parent hands us a fresh onChange on every render, and depending
  // on it looped (onChange → parent setState → new onChange → effect …).
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    onChangeRef.current?.(splits);
  }, [splits]);

  const isValid =
    Math.abs(remaining) < 0.01 &&
    splits.every((s) => s.categoryId && s.amount !== 0) &&
    splits.length >= 2;

  // Group categories for dropdown (default — used for non-reimbursement rows)
  const groupedCategories = useMemo(() => groupCategories(categories), [categories]);

  // Grouped expense categories for reimbursement rows
  const groupedExpenseCategories = useMemo(() => groupCategories(expenseCategories), [expenseCategories]);

  const updateSplit = useCallback(
    (idx: number, field: keyof SplitRow, val: number | null | boolean) => {
      setSplits((prev) =>
        prev.map((s, i) => {
          if (i !== idx) return s;
          if (field === 'isReimbursement') {
            // Clear category when toggling reimbursement since category set changes
            return { ...s, isReimbursement: val as boolean, categoryId: null };
          }
          return { ...s, [field]: val };
        })
      );
    },
    []
  );

  const removeSplit = useCallback(
    (idx: number) => {
      setSplits((prev) => {
        if (prev.length <= 2) return prev;
        return prev.filter((_, i) => i !== idx);
      });
      setRawAmounts((prev) => {
        if (prev.length <= 2) return prev;
        return prev.filter((_, i) => i !== idx);
      });
    },
    []
  );

  const addSplit = useCallback(() => {
    setSplits((prev) => {
      const alloc = prev.reduce((s, r) => s + r.amount, 0);
      const rem = +(Math.abs(totalAmount) - alloc).toFixed(2);
      return [...prev, { categoryId: null, amount: rem > 0 ? rem : 0 }];
    });
    setRawAmounts((prev) => {
      const alloc = splits.reduce((s, r) => s + r.amount, 0);
      const rem = +(Math.abs(totalAmount) - alloc).toFixed(2);
      return [...prev, rem > 0 ? rem.toString() : ''];
    });
  }, [totalAmount, splits]);

  const handlePctChange = useCallback(
    (idx: number, pctStr: string) => {
      const pct = parseFloat(pctStr) || 0;
      const amt = +(absTotalAmount * pct / 100).toFixed(2);
      updateSplit(idx, 'amount', amt);
      setRawAmounts(prev => prev.map((r, i) => i === idx ? amt.toString() : r));
    },
    [absTotalAmount, updateSplit]
  );

  const handleAmountChange = useCallback(
    (idx: number, raw: string) => {
      setRawAmounts(prev => prev.map((r, i) => i === idx ? raw : r));
      const val = parseFloat(raw) || 0;
      updateSplit(idx, 'amount', +(Math.abs(val).toFixed(2)));
    },
    [updateSplit]
  );

  const handleApply = () => {
    if (!isValid) return;
    // Apply sign from parent amount to each split
    const sign = totalAmount < 0 ? -1 : 1;
    const finalSplits = splits.map((s) => ({
      categoryId: s.categoryId,
      amount: +(s.amount * sign).toFixed(2),
      ...(s.isReimbursement ? { isReimbursement: true } : {}),
    }));
    onApply(finalSplits);
  };

  // The editor works in magnitudes; the parent's sign is applied on save.
  const balance = (n: number) => formatMoney(n, { kind: 'balance', showZero: true }).text;

  const inputCls = 'w-full h-10 px-3 rounded-[10px] bg-surface border border-line-strong text-content text-sm outline-none';
  const selectCls = `${inputCls} pr-9 appearance-none cursor-pointer`;
  const chevron = <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-content-3" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
  const balanced = Math.abs(remaining) < 0.01;

  return (
    <div className={`rounded-[12px] border border-line bg-surface-2 ${compact ? 'p-3' : 'p-4'}`}>
      {/* Header */}
      <div className="flex justify-between items-center gap-3 mb-3">
        <span className="font-mono text-[11px] uppercase tracking-wide text-content-3">Split · {balance(Math.abs(totalAmount))}</span>
        <button
          type="button"
          onClick={() => setMode((m) => (m === '$' ? '%' : '$'))}
          className="h-7 px-2.5 rounded-lg text-[12px] font-semibold font-mono border border-line-strong bg-surface text-content-2 hover:text-content"
          title={mode === '$' ? 'Enter percentages instead' : 'Enter amounts instead'}
        >
          {mode === '$' ? '$ → %' : '% → $'}
        </button>
      </div>

      {/* Split rows */}
      <div className="flex flex-col gap-2">
        {splits.map((s, i) => {
          const isReimb = !!s.isReimbursement;
          const rowCategories = isReimb ? groupedExpenseCategories : groupedCategories;
          const isLastRow = i === splits.length - 1;
          return (
            <div key={i}>
              <div className="flex gap-2 items-center">
                <div className="relative flex-1 min-w-0">
                  <select
                    value={s.categoryId ?? ''}
                    onChange={(e) => updateSplit(i, 'categoryId', parseInt(e.target.value))}
                    aria-label={`Split ${i + 1} category`}
                    className={selectCls}
                  >
                    <option value="" disabled>Select category…</option>
                    {rowCategories.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.cats.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {chevron}
                </div>
                <div className={compact ? 'w-[96px]' : 'w-[120px]'}>
                  {mode === '$' ? (
                    <CurrencyInput
                      value={rawAmounts[i] ?? (s.amount ? s.amount.toString() : '')}
                      onChange={(val) => handleAmountChange(i, val)}
                      className={`${inputCls} font-mono text-right tabular-nums`}
                      placeholder="0.00"
                    />
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Split ${i + 1} percent`}
                        value={absTotalAmount ? (() => { const pct = (s.amount / absTotalAmount) * 100; return Number.isInteger(Math.round(pct * 10) / 10) ? Math.round(pct).toString() : pct.toFixed(1); })() : ''}
                        onChange={(e) => handlePctChange(i, e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="0"
                        className={`${inputCls} font-mono text-right tabular-nums pr-7`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-3 font-mono pointer-events-none">%</span>
                    </div>
                  )}
                </div>
                {splits.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeSplit(i)}
                    aria-label="Remove split"
                    className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 text-content-3 hover:text-negative hover:bg-surface"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                )}
              </div>
              {isReimb && (
                <div className="flex items-center gap-2.5 mt-1.5 ml-0.5">
                  <ReimbursementBadge />
                  <button type="button" onClick={() => updateSplit(i, 'isReimbursement', false)} className="text-[12px] font-semibold text-content-3 hover:text-content">Reset</button>
                </div>
              )}
              {reimbursementEnabled && isLastRow && !isReimb && (
                <button type="button" onClick={() => updateSplit(i, 'isReimbursement', true)} className="text-[12px] font-semibold text-primary mt-1.5 ml-0.5">
                  Mark as reimbursement
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add split */}
      <button
        type="button"
        onClick={addSplit}
        className="mt-2 w-full h-9 rounded-[10px] text-[13px] font-semibold border border-dashed border-line-strong bg-transparent text-primary hover:bg-surface"
      >
        + Add split
      </button>

      {/* Footer */}
      <div className="mt-3 flex justify-between items-center flex-wrap gap-2">
        <div className="font-mono text-[12px] tabular-nums">
          <span className="text-content-3">Allocated </span>
          <span className={`font-semibold ${balanced ? 'text-positive' : remaining < 0 ? 'text-negative' : 'text-content'}`}>{balance(allocated)}</span>
          {!balanced && (
            <span className={`ml-1.5 ${remaining < 0 ? 'text-negative' : 'text-warning'}`}>
              ({balance(Math.abs(remaining))} {remaining > 0 ? 'remaining' : 'over'})
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="h-9 px-3.5 rounded-[10px] text-[13px] font-semibold border border-line-strong bg-surface text-content hover:bg-elevated">
            Cancel
          </button>
          <button type="button" onClick={handleApply} disabled={!isValid} className="h-9 px-4 rounded-[10px] text-[13px] font-bold bg-primary text-on-primary disabled:opacity-50 disabled:cursor-not-allowed">
            Apply split
          </button>
        </div>
      </div>
    </div>
  );
}
