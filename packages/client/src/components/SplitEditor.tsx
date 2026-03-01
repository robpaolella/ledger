import { useState, useCallback, useMemo } from 'react';
import CurrencyInput from './CurrencyInput';

export interface SplitRow {
  categoryId: number | null;
  amount: number;
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
  onApply: (splits: SplitRow[]) => void;
  onCancel: () => void;
  compact?: boolean;
}

export default function SplitEditor({
  totalAmount,
  initialSplits,
  categories,
  onApply,
  onCancel,
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

  const allocated = useMemo(
    () => splits.reduce((s, r) => s + r.amount, 0),
    [splits]
  );
  const remaining = +((Math.abs(totalAmount) - allocated).toFixed(2));
  const absTotalAmount = Math.abs(totalAmount);

  const isValid =
    Math.abs(remaining) < 0.01 &&
    splits.every((s) => s.categoryId && s.amount !== 0) &&
    splits.length >= 2;

  // Group categories for dropdown
  const groupedCategories = useMemo(() => {
    const groups: { group: string; cats: SplitCategory[] }[] = [];
    const map = new Map<string, SplitCategory[]>();
    for (const c of categories) {
      if (!map.has(c.group_name)) {
        const arr: SplitCategory[] = [];
        map.set(c.group_name, arr);
        groups.push({ group: c.group_name, cats: arr });
      }
      map.get(c.group_name)!.push(c);
    }
    return groups;
  }, [categories]);

  const updateSplit = useCallback(
    (idx: number, field: keyof SplitRow, val: number | null) => {
      setSplits((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s))
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
    }));
    onApply(finalSplits);
  };

  const fmt = (n: number) =>
    '$' +
    Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const inputCls =
    'w-full px-2 py-1.5 border rounded-md text-[12px] outline-none text-[var(--text-body)] border-[var(--table-border)] bg-[var(--bg-input)]';

  return (
    <div
      className={`rounded-lg border border-[var(--bg-card-border)] bg-[var(--bg-hover)] ${compact ? 'p-2' : 'p-3'}`}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-secondary)]">
          Split Transaction — {fmt(totalAmount)}
        </span>
        <button
          onClick={() => setMode((m) => (m === '$' ? '%' : '$'))}
          className="px-2 py-0.5 rounded text-[11px] font-semibold font-mono border border-[var(--bg-card-border)] bg-[var(--bg-card)] text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-hover)]"
        >
          {mode === '$' ? '$ → %' : '% → $'}
        </button>
      </div>

      {/* Split rows */}
      <div className="flex flex-col gap-1.5">
        {splits.map((s, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <div className="flex-1 min-w-0">
              <select
                value={s.categoryId ?? ''}
                onChange={(e) =>
                  updateSplit(i, 'categoryId', parseInt(e.target.value))
                }
                className={`${inputCls} ${compact ? 'text-[11px]' : ''}`}
              >
                <option value="" disabled>
                  Select category...
                </option>
                {groupedCategories.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sub_name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className={compact ? 'w-[80px]' : 'w-[100px]'}>
              {mode === '$' ? (
                <CurrencyInput
                  value={rawAmounts[i] ?? (s.amount ? s.amount.toString() : '')}
                  onChange={(val) => handleAmountChange(i, val)}
                  className={`${inputCls} font-mono text-right ${compact ? 'text-[11px]' : ''}`}
                  placeholder="0.00"
                />
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={
                      absTotalAmount
                        ? (() => {
                            const pct = (s.amount / absTotalAmount) * 100;
                            return Number.isInteger(Math.round(pct * 10) / 10) ? Math.round(pct).toString() : pct.toFixed(1);
                          })()
                        : ''
                    }
                    onChange={(e) =>
                      handlePctChange(
                        i,
                        e.target.value.replace(/[^0-9.]/g, '')
                      )
                    }
                    placeholder="0"
                    className={`${inputCls} font-mono text-right pr-5 ${compact ? 'text-[11px]' : ''}`}
                  />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)] font-mono pointer-events-none">
                    %
                  </span>
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
        ))}
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
          <span
            className={`font-semibold ${
              Math.abs(remaining) < 0.01
                ? 'text-[var(--color-positive)]'
                : remaining < 0
                  ? 'text-[var(--color-negative)]'
                  : 'text-[var(--text-primary)]'
            }`}
          >
            {fmt(allocated)}
          </span>
          {Math.abs(remaining) >= 0.01 && (
            <span
              className={`ml-1.5 text-[11px] ${
                remaining < 0
                  ? 'text-[var(--color-negative)]'
                  : 'text-[var(--color-warning)]'
              }`}
            >
              ({remaining > 0 ? '+' : ''}
              {fmt(Math.abs(remaining))}{' '}
              {remaining > 0 ? 'remaining' : 'over'})
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium border border-[var(--bg-card-border)] bg-[var(--btn-secondary-bg)] text-[var(--text-primary)] cursor-pointer btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className={`px-3 py-1.5 rounded-md text-[12px] font-semibold border-none ${
              isValid
                ? 'bg-[var(--color-accent)] text-white cursor-pointer'
                : 'bg-[var(--bg-card-border)] text-[var(--text-muted)] cursor-not-allowed opacity-60'
            }`}
          >
            Apply Split
          </button>
        </div>
      </div>
    </div>
  );
}
