import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { fmt, fmtTransaction } from '../lib/formatters';
import { getCategoryColor } from '../lib/categoryColors';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import ConfirmDeleteButton from '../components/ConfirmDeleteButton';
import CurrencyInput from '../components/CurrencyInput';
import PermissionGate from '../components/PermissionGate';
import SortableHeader from '../components/SortableHeader';
import { AccountBadge, CategoryBadge, OwnerBadge, SharedBadge, SplitBadge, ReimbursementBadge } from '../components/badges';
import InlineNotification from '../components/InlineNotification';
import ResponsiveModal from '../components/ResponsiveModal';
import SplitEditor from '../components/SplitEditor';
import type { SplitRow } from '../components/SplitEditor';
import { useIsMobile } from '../hooks/useIsMobile';

interface DuplicateMatch {
  id: number;
  date: string;
  description: string;
  amount: number;
  notes: string | null;
  accountName: string | null;
  category: string | null;
}

interface TransactionAccount {
  id: number;
  name: string;
  lastFour: string | null;
  owner: string;
  owners?: { id: number; displayName: string }[];
  isShared?: boolean;
}

interface TransactionCategory {
  id: number;
  groupName: string;
  subName: string;
  displayName: string;
  type: string;
}

interface TransactionSplit {
  id: number;
  categoryId: number;
  groupName: string;
  subName: string;
  displayName: string;
  type: string;
  amount: number;
}

interface Transaction {
  id: number;
  date: string;
  description: string;
  note: string | null;
  amount: number;
  account: TransactionAccount;
  category: TransactionCategory | null;
  splits: TransactionSplit[] | null;
}

interface Account {
  id: number;
  name: string;
  last_four: string | null;
  owner: string;
  owners?: { id: number; displayName: string }[];
  isShared?: boolean;
}

interface Category {
  id: number;
  group_name: string;
  sub_name: string;
  display_name: string;
  type: string;
}

// Field wrapper with validation error display
function Field({
  label,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">{label}</label>
      {children}
      {error && <span className="text-[10px] text-[#ef4444] mt-0.5 block">Required</span>}
    </div>
  );
}

function TransactionForm({
  transaction,
  accounts,
  categories,
  onSave,
  onDelete,
  onClose,
  duplicateMatch,
}: {
  transaction?: Transaction;
  accounts: Account[];
  categories: Category[];
  onSave: (data: Record<string, unknown>) => void;
  onDelete?: () => void;
  onClose: () => void;
  duplicateMatch?: DuplicateMatch | null;
}) {
  const [date, setDate] = useState(transaction?.date ?? new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState<number>(transaction?.account.id ?? (accounts[0]?.id ?? 0));
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [note, setNote] = useState(transaction?.note ?? '');
  const [categoryId, setCategoryId] = useState<number>(transaction?.category?.id ?? 0);
  const [splitMode, setSplitMode] = useState<boolean>(!!(transaction?.splits && transaction.splits.length > 0));
  const [splits, setSplits] = useState<SplitRow[] | null>(
    transaction?.splits?.map(s => ({
      categoryId: s.categoryId,
      amount: Math.abs(s.amount),
      // Detect reimbursement: split category type differs from first split's type
      isReimbursement: transaction?.splits && transaction.splits.length > 0
        ? s.type !== transaction.splits[0].type
        : false,
    })) ?? null
  );
  // Show user-facing amount: for income, negate stored value (stored -5000 → show 5000)
  // For reversals (positive+income or negative+expense), show as negative to indicate reversal
  const [amount, setAmount] = useState(() => {
    if (!transaction) return '';
    // For split transactions, determine type from first split's category
    const catType = transaction.category?.type ?? (transaction.splits?.[0]?.type) ?? 'expense';
    const stored = transaction.amount;
    if (catType === 'income') {
      return (-stored).toString();
    }
    return stored.toString();
  });
  const [txType, setTxType] = useState<'expense' | 'income'>(() => {
    if (transaction?.category?.type === 'income') return 'income';
    if (transaction?.splits?.[0]?.type === 'income') return 'income';
    return 'expense';
  });
  const [showErrors, setShowErrors] = useState(false);
  const [dupeExpanded, setDupeExpanded] = useState(false);
  const [splitNotification, setSplitNotification] = useState<string | null>(null);

  // Refs for focusing first invalid field
  const dateRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLSelectElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // Filter categories by current toggle type
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => c.type === txType);
  }, [categories, txType]);

  // Group filtered categories for the dropdown
  const groupedCategories = useMemo(() => {
    const groups: { group: string; cats: Category[] }[] = [];
    const groupMap = new Map<string, Category[]>();
    for (const c of filteredCategories) {
      if (!groupMap.has(c.group_name)) {
        const arr: Category[] = [];
        groupMap.set(c.group_name, arr);
        groups.push({ group: c.group_name, cats: arr });
      }
      groupMap.get(c.group_name)!.push(c);
    }
    return groups;
  }, [filteredCategories]);

  // Grouped accounts by owner
  const accountsByOwner = useMemo(() => {
    const map = new Map<string, Account[]>();
    for (const a of accounts) {
      if (a.isShared) {
        if (!map.has('Shared')) map.set('Shared', []);
        map.get('Shared')!.push(a);
      } else {
        const name = a.owners?.[0]?.displayName || a.owner;
        if (!map.has(name)) map.set(name, []);
        map.get(name)!.push(a);
      }
    }
    return map;
  }, [accounts]);

  // When category changes, auto-sync type toggle
  const handleCategoryChange = (id: number) => {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (cat) {
      setTxType(cat.type === 'income' ? 'income' : 'expense');
    }
  };

  // When toggle changes, clear category if it doesn't match
  const handleTypeChange = (newType: 'expense' | 'income') => {
    setTxType(newType);
    const current = categories.find((c) => c.id === categoryId);
    if (current && current.type !== newType) {
      setCategoryId(0);
    }
  };

  // Validation
  const parsedAmount = parseFloat(amount);
  const splitsValid = splitMode && splits
    ? splits.length >= 2 &&
      splits.every(s => s.categoryId && s.amount !== 0) &&
      Math.abs(Math.abs(parsedAmount) - splits.reduce((sum, s) => sum + s.amount, 0)) < 0.01
    : false;
  const hasCategoryOrSplits = splitMode ? splitsValid : categoryId > 0;
  const isValid = !!(
    date &&
    accountId > 0 &&
    description.trim() &&
    hasCategoryOrSplits &&
    amount !== '' &&
    !isNaN(parsedAmount)
  );

  const getFirstInvalidRef = () => {
    if (!date) return dateRef;
    if (accountId <= 0) return accountRef;
    if (!description.trim()) return descRef;
    if (!splitMode && categoryId <= 0) return categoryRef;
    if (amount === '' || isNaN(parsedAmount)) return amountRef;
    return null;
  };

  const handleSaveClick = () => {
    if (!isValid) {
      setShowErrors(true);
      const ref = getFirstInvalidRef();
      ref?.current?.focus();
      return;
    }

    // Sign logic: explicit negative takes priority and reverses the default
    let finalAmount: number;
    if (parsedAmount < 0) {
      finalAmount = txType === 'income' ? Math.abs(parsedAmount) : parsedAmount;
    } else {
      finalAmount = txType === 'income' ? -Math.abs(parsedAmount) : Math.abs(parsedAmount);
    }

    if (splitMode && splits) {
      // Splits are stored with absolute amounts in editor; apply sign from finalAmount
      const sign = finalAmount < 0 ? -1 : 1;
      const finalSplits = splits.map(s => ({
        categoryId: s.categoryId,
        amount: +(s.amount * sign).toFixed(2),
      }));
      onSave({ accountId, date, description, note: note || null, splits: finalSplits, amount: finalAmount });
    } else {
      onSave({ accountId, date, description, note: note || null, categoryId, amount: finalAmount });
    }
  };

  const handleSplitApply = (appliedSplits: SplitRow[]) => {
    const stored = appliedSplits.map(s => ({ categoryId: s.categoryId, amount: Math.abs(s.amount) }));
    setSplits(stored);
    setSplitNotification(`Split applied across ${stored.length} categories`);
  };

  const handleCancelSplit = () => {
    setSplitMode(false);
    setSplits(null);
    setSplitNotification(null);
    // Restore category if we had one before
    if (transaction?.category?.id) {
      setCategoryId(transaction.category.id);
    }
  };

  const handleEnterSplitMode = () => {
    const amt = parseFloat(amount) || 0;
    setSplitMode(true);
    if (!splits) {
      const initialSplits: SplitRow[] = categoryId > 0
        ? [{ categoryId, amount: Math.abs(amt) }, { categoryId: null, amount: 0 }]
        : [{ categoryId: null, amount: Math.abs(amt) }, { categoryId: null, amount: 0 }];
      setSplits(initialSplits);
    }
  };

  const errDate = showErrors && !date;
  const errAccount = showErrors && accountId <= 0;
  const errDesc = showErrors && !description.trim();
  const errCategory = showErrors && !splitMode && categoryId <= 0;
  const errAmount = showErrors && (amount === '' || isNaN(parsedAmount));

  const inputCls = (hasError: boolean) =>
    `w-full px-3 py-2 border rounded-lg text-[13px] outline-none text-[var(--text-body)] ${
      hasError ? 'border-[#ef4444] bg-[var(--bg-inline-error)]' : 'border-[var(--table-border)] bg-[var(--bg-input)]'
    }`;

  return (
    <ResponsiveModal isOpen={true} onClose={onClose} maxWidth="32rem">
      <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-4">
        {transaction ? 'Edit Transaction' : 'Add Transaction'}
      </h3>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" required error={errDate}>
            <input ref={dateRef} type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className={`${inputCls(!!errDate)} font-mono`} />
          </Field>
          <Field label="Account" required error={errAccount}>
            <select ref={accountRef} value={accountId} onChange={(e) => setAccountId(parseInt(e.target.value, 10))}
              className={inputCls(!!errAccount)}>
              <option value={0} disabled>Select account</option>
              {[...accountsByOwner.entries()].map(([owner, accts]) => (
                <optgroup key={owner} label={owner}>
                  {accts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.last_four ? ` (${a.last_four})` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description" required error={errDesc}>
          <input ref={descRef} value={description} onChange={(e) => setDescription(e.target.value)}
            className={inputCls(!!errDesc)} />
        </Field>
        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className={inputCls(false)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <div className="flex gap-2">
              {(['expense', 'income'] as const).map((t) => (
                <button key={t} onClick={() => handleTypeChange(t)}
                  disabled={splitMode}
                  className={`flex-1 py-2 text-[12px] font-semibold rounded-lg border-none cursor-pointer capitalize ${
                    txType === t ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] btn-primary' : 'bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] btn-secondary'
                  } ${splitMode ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
          {!splitMode ? (
            <div>
              <Field label="Category" required error={errCategory}>
                <select ref={categoryRef} value={categoryId} onChange={(e) => handleCategoryChange(parseInt(e.target.value, 10))}
                  className={inputCls(!!errCategory)}>
                  <option value={0} disabled>Select category</option>
                  {groupedCategories.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.cats.map((c) => (
                        <option key={c.id} value={c.id}>{c.sub_name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <button onClick={handleEnterSplitMode}
                className="text-[11px] text-[var(--color-accent)] bg-transparent border-none cursor-pointer mt-1 p-0 hover:underline">
                Split across categories
              </button>
            </div>
          ) : (
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-1">
                Category <span className="text-[var(--color-accent)] normal-case font-normal">(split mode)</span>
              </div>
              {splits && splits.length >= 2 ? (
                <div className="text-[12px] text-[var(--color-positive)] font-medium">
                  ✓ {splits.length} categories assigned
                  <button onClick={handleCancelSplit}
                    className="ml-2 text-[11px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer p-0 hover:underline">
                    Remove split
                  </button>
                </div>
              ) : (
                <div className="text-[12px] text-[var(--text-muted)]">
                  Configure splits below
                  <button onClick={handleCancelSplit}
                    className="ml-2 text-[11px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer p-0 hover:underline">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <Field label="Amount" required error={errAmount}>
          <CurrencyInput ref={amountRef} allowNegative value={amount}
            onChange={(val) => setAmount(val)}
            className={`${inputCls(!!errAmount)} font-mono`} />
        </Field>
        {splitMode && (
          <SplitEditor
            totalAmount={parseFloat(amount) || 0}
            initialSplits={splits ?? undefined}
            categories={filteredCategories}
            allCategories={categories}
            txType={txType}
            onApply={handleSplitApply}
            onCancel={handleCancelSplit}
            onChange={(current) => setSplits(current.map(s => ({ categoryId: s.categoryId, amount: Math.abs(s.amount), isReimbursement: s.isReimbursement })))}
          />
        )}
        {splitNotification && (
          <InlineNotification
            type="success"
            message={splitNotification}
            dismissible
            onDismiss={() => setSplitNotification(null)}
          />
        )}
      </div>

      {/* Duplicate Warning */}
      {duplicateMatch && (
        <div className="mt-4 rounded-lg border border-[var(--bg-inline-warning-border)] bg-[var(--bg-inline-warning)] p-3">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-[var(--color-warning)] mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-[var(--text-inline-warning)] m-0">
                  Possible duplicate detected — click Save again to confirm
                </p>
                <button onClick={() => setDupeExpanded(!dupeExpanded)}
                  className="bg-transparent border-none cursor-pointer p-0.5 text-[var(--text-inline-warning)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: dupeExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
              {dupeExpanded && (
                <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
                  <span className="text-[var(--text-inline-warning)]">Date</span>
                  <span className="font-mono text-[var(--text-inline-warning)]">{duplicateMatch.date}</span>
                  <span className="text-[var(--text-inline-warning)]">Description</span>
                  <span className="text-[var(--text-inline-warning)]">{duplicateMatch.description}</span>
                  <span className="text-[var(--text-inline-warning)]">Amount</span>
                  <span className="font-mono font-semibold text-[var(--text-inline-warning)]">{fmt(Math.abs(duplicateMatch.amount))}</span>
                  {duplicateMatch.accountName && <>
                    <span className="text-[var(--text-inline-warning)]">Account</span>
                    <span className="text-[var(--text-inline-warning)]">{duplicateMatch.accountName}</span>
                  </>}
                  {duplicateMatch.category && <>
                    <span className="text-[var(--text-inline-warning)]">Category</span>
                    <span className="text-[var(--text-inline-warning)]">{duplicateMatch.category}</span>
                  </>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-5 justify-end">
        {transaction && onDelete && (
          <div className="mr-auto">
            <ConfirmDeleteButton onConfirm={onDelete} />
          </div>
        )}
        <button onClick={onClose}
          className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] border-none cursor-pointer btn-secondary">
          Cancel
        </button>
        <button onClick={handleSaveClick}
          className={`px-4 py-2 text-[12px] font-semibold rounded-lg border-none ${
            isValid
              ? duplicateMatch
                ? 'bg-[var(--color-warning)] text-white cursor-pointer'
                : 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] cursor-pointer btn-primary'
              : 'bg-[var(--text-muted)] text-white cursor-not-allowed'
          }`}>
          {duplicateMatch ? 'Save Anyway' : 'Save'}
        </button>
      </div>
    </ResponsiveModal>
  );
}

export default function TransactionsPage() {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();
  const isMobile = useIsMobile();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const allGroupNames = useMemo(() => [...new Set(categories.map(c => c.group_name))], [categories]);
  const categoryGroups = useMemo(() => {
    const groups: { group: string; subs: { id: number; sub: string }[] }[] = [];
    const seen = new Set<string>();
    for (const c of categories) {
      if (!seen.has(c.group_name)) {
        seen.add(c.group_name);
        groups.push({ group: c.group_name, subs: categories.filter(x => x.group_name === c.group_name).map(x => ({ id: x.id, sub: x.sub_name })) });
      }
    }
    return groups;
  }, [categories]);
  const [pendingSave, setPendingSave] = useState<Record<string, unknown> | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<DuplicateMatch | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterAccount, setFilterAccount] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  const toggleCategoryFilter = (value: string) => {
    setFilterCategory(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  const categoryFilterLabel = useMemo(() => {
    if (filterCategory.length === 0) return 'All Categories';
    if (filterCategory.length === 1) {
      const v = filterCategory[0];
      if (v.startsWith('group:')) return v.slice(6);
      const cat = categories.find(c => c.id === parseInt(v.slice(4), 10));
      return cat?.sub_name ?? v;
    }
    return `${filterCategory.length} categories`;
  }, [filterCategory, categories]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const [datePreset, setDatePreset] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState(() => {
    const stored = localStorage.getItem('ledger-page-size');
    return stored ? parseInt(stored, 10) : 50;
  });

  const getDateRange = useCallback((): { startDate?: string; endDate?: string } => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const monthStart = (yr: number, mo: number) => `${yr}-${String(mo + 1).padStart(2, '0')}-01`;
    const monthEnd = (yr: number, mo: number) => fmt(new Date(yr, mo + 1, 0));
    const q = Math.floor(m / 3);
    switch (datePreset) {
      case 'all': return {};
      case 'this-month': return { startDate: monthStart(y, m), endDate: monthEnd(y, m) };
      case 'last-month': {
        const d = new Date(y, m - 1, 1);
        return { startDate: monthStart(d.getFullYear(), d.getMonth()), endDate: monthEnd(d.getFullYear(), d.getMonth()) };
      }
      case 'this-quarter': return { startDate: monthStart(y, q * 3), endDate: monthEnd(y, q * 3 + 2) };
      case 'last-quarter': {
        const pq = q === 0 ? 3 : q - 1;
        const py = q === 0 ? y - 1 : y;
        return { startDate: monthStart(py, pq * 3), endDate: monthEnd(py, pq * 3 + 2) };
      }
      case 'this-year': return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
      case 'last-year': return { startDate: `${y - 1}-01-01`, endDate: `${y - 1}-12-31` };
      case 'ytd': return { startDate: `${y}-01-01`, endDate: fmt(now) };
      case 'custom': return { startDate: customStart || undefined, endDate: customEnd || undefined };
      default: return {};
    }
  }, [datePreset, customStart, customEnd]);

  // Modal
  const [editing, setEditing] = useState<Transaction | null | 'new'>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Open add form from FAB (via URL param or custom event)
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setEditing('new');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const handler = () => setEditing('new');
    window.addEventListener('open-add-transaction', handler);
    return () => window.removeEventListener('open-add-transaction', handler);
  }, []);

  // Bulk edit mode
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [_bulkAction, setBulkAction] = useState<string | null>(null);
  const [bulkDate, setBulkDate] = useState('');
  const [bulkAccountId, setBulkAccountId] = useState<number | ''>('');
  const [bulkCategoryId, setBulkCategoryId] = useState<number | ''>('');
  const [bulkFind, setBulkFind] = useState('');
  const [bulkReplace, setBulkReplace] = useState('');
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);

  const loadTransactions = useCallback(async () => {
    const params = new URLSearchParams();
    const { startDate, endDate } = getDateRange();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    params.set('limit', pageSize.toString());
    params.set('offset', ((page - 1) * pageSize).toString());
    if (search) params.set('search', search);
    if (filterAccount !== 'All') params.set('accountId', filterAccount);
    if (filterType !== 'All') params.set('type', filterType.toLowerCase());
    if (filterCategory.length > 0) {
      const groupNames = filterCategory.filter(v => v.startsWith('group:')).map(v => v.slice(6));
      const catIds = filterCategory.filter(v => v.startsWith('sub:')).map(v => v.slice(4));
      if (groupNames.length) params.set('groupNames', groupNames.join(','));
      if (catIds.length) params.set('categoryIds', catIds.join(','));
    }
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);

    const res = await apiFetch<{ data: Transaction[]; total: number }>(`/transactions?${params.toString()}`);
    setTransactions(res.data);
    setTotal(res.total);
  }, [getDateRange, search, filterAccount, filterType, filterCategory, page, pageSize, sortBy, sortOrder]);

  const loadMeta = useCallback(async () => {
    const [acctRes, catRes] = await Promise.all([
      apiFetch<{ data: Account[] }>('/accounts'),
      apiFetch<{ data: Category[] }>('/categories'),
    ]);
    setAccounts(acctRes.data);
    setCategories(catRes.data);
  }, []);

  const handleSort = (key: string) => {
    if (key === sortBy) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
    setPage(1);
  };

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { setPage(1); }, [datePreset, customStart, customEnd, search, filterAccount, filterType, filterCategory]);
  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const handleSave = async (data: Record<string, unknown>) => {
    try {
      // On new transactions, check for duplicates before saving
      if (editing === 'new' && !pendingSave) {
        try {
          const dupeRes = await apiFetch<{ data: { status: string; match?: DuplicateMatch } }>(
            '/transactions/check-duplicate',
            { method: 'POST', body: JSON.stringify({ date: data.date, amount: data.amount, description: data.description }) }
          );
          if (dupeRes.data.status !== 'none' && dupeRes.data.match) {
            setPendingSave(data);
            setDuplicateMatch(dupeRes.data.match);
            return;
          }
        } catch {
          // Duplicate check failed — proceed with save
        }
      }
      setPendingSave(null);
      setDuplicateMatch(null);

      if (editing === 'new') {
        await apiFetch('/transactions', { method: 'POST', body: JSON.stringify(data) });
      } else if (editing) {
        await apiFetch(`/transactions/${editing.id}`, { method: 'PUT', body: JSON.stringify(data) });
      }
      setEditing(null);
      addToast('Transaction saved');
      loadTransactions();
    } catch {
      addToast('Failed to save transaction', 'error');
    }
  };

  const handleDelete = async () => {
    if (editing && editing !== 'new') {
      try {
        await apiFetch(`/transactions/${editing.id}`, { method: 'DELETE' });
        setEditing(null);
        addToast('Transaction deleted');
        loadTransactions();
      } catch {
        addToast('Failed to delete transaction', 'error');
      }
    }
  };


  const accountLabel = (a: { name: string; last_four?: string | null; lastFour?: string | null }) => {
    const lf = a.lastFour ?? a.last_four;
    return lf ? `${a.name} (${lf})` : a.name;
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedIds(new Set());
    setBulkAction(null);
    setBulkConfirmDelete(false);
  };

  const applyBulkAction = async (action: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      if (action === 'date' && bulkDate) {
        await apiFetch('/transactions/bulk-update', { method: 'POST', body: JSON.stringify({ ids, updates: { date: bulkDate } }) });
      } else if (action === 'account' && bulkAccountId) {
        await apiFetch('/transactions/bulk-update', { method: 'POST', body: JSON.stringify({ ids, updates: { accountId: bulkAccountId } }) });
      } else if (action === 'category' && bulkCategoryId) {
        await apiFetch('/transactions/bulk-update', { method: 'POST', body: JSON.stringify({ ids, updates: { categoryId: bulkCategoryId } }) });
      } else if (action === 'findReplace' && bulkFind) {
        await apiFetch('/transactions/bulk-update', { method: 'POST', body: JSON.stringify({ ids, updates: { description: { find: bulkFind, replace: bulkReplace } } }) });
      } else if (action === 'delete') {
        if (!bulkConfirmDelete) { setBulkConfirmDelete(true); setTimeout(() => setBulkConfirmDelete(false), 3000); return; }
        await apiFetch('/transactions/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
      } else { return; }
      setBulkAction(null);
      setBulkConfirmDelete(false);
      const msg = action === 'delete' ? `Deleted ${ids.length} transactions` : `Updated ${ids.length} transactions`;
      addToast(msg);
      setSelectedIds(new Set());
      loadTransactions();
    } catch (_err) {
      addToast('Bulk operation failed', 'error');
    }
  };

  // Group categories for bulk dropdown
  const expenseCats = categories.filter((c) => c.type === 'expense');
  const incomeCats = categories.filter((c) => c.type === 'income');
  const catGroupsForBulk = new Map<string, Category[]>();
  for (const c of [...expenseCats, ...incomeCats]) {
    if (!catGroupsForBulk.has(c.group_name)) catGroupsForBulk.set(c.group_name, []);
    catGroupsForBulk.get(c.group_name)!.push(c);
  }

  const hasActiveFilters = search !== '' || filterAccount !== 'All' || filterType !== 'All' || filterCategory.length > 0 || datePreset !== 'all';

  const resetFilters = () => {
    setSearch('');
    setFilterAccount('All');
    setFilterType('All');
    setFilterCategory([]);
    setDatePreset('all');
    setCustomStart('');
    setCustomEnd('');
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showTo = Math.min(page * pageSize, total);

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="page-title text-[22px] font-bold text-[var(--text-primary)] m-0">Transactions</h1>
          <p className="page-subtitle text-[var(--text-secondary)] text-[13px] mt-1">{total} transactions</p>
        </div>
        <div className="flex gap-2 desktop-only">
          {bulkMode ? (
            <button onClick={exitBulkMode}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer btn-secondary">
              Exit Bulk Edit
            </button>
          ) : (
            <PermissionGate permission="transactions.bulk_edit" fallback="hidden">
              <button onClick={() => setBulkMode(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer btn-secondary">
                Bulk Edit
              </button>
            </PermissionGate>
          )}
          <PermissionGate permission="transactions.create" fallback="disabled">
            <button onClick={() => setEditing('new')}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer btn-secondary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Transaction
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Filter Bar */}
      <div className={`bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] mb-5 px-4 py-3 ${isMobile ? 'flex flex-col gap-3' : 'flex gap-3 items-center'}`}>
        <div className={`relative ${isMobile ? 'w-full' : 'flex-1'}`}>
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..." autoCapitalize="off"
            className="w-full py-2 pl-[34px] pr-2 border border-[var(--table-border)] rounded-lg text-[13px] outline-none bg-[var(--bg-input)] text-[var(--text-secondary)]" />
        </div>
        {isMobile ? (
          <>
            <div className="flex gap-2 items-center">
              <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)}
                className="flex-1 px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)]">
                <option value="all">All Time</option>
                <option value="this-month">This Month</option>
                <option value="last-month">Last Month</option>
                <option value="this-quarter">This Quarter</option>
                <option value="last-quarter">Last Quarter</option>
                <option value="this-year">This Year</option>
                <option value="last-year">Last Year</option>
                <option value="ytd">Year to Date</option>
                <option value="custom">Custom Range...</option>
              </select>
              <button onClick={() => setShowMobileFilters(!showMobileFilters)}
                className={`px-3 py-2 border rounded-lg text-[13px] font-medium cursor-pointer ${
                  showMobileFilters || filterAccount !== 'All' || filterType !== 'All' || filterCategory.length > 0
                    ? 'border-[#3b82f6] text-[#3b82f6] bg-[var(--bg-input)]'
                    : 'border-[var(--table-border)] text-[var(--text-secondary)] bg-[var(--bg-input)]'
                }`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
              </button>
              {hasActiveFilters && (
                <button onClick={resetFilters}
                  className="px-2 py-2 text-[12px] text-[var(--text-secondary)] bg-transparent border-none cursor-pointer btn-ghost">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  className="flex-1 px-2 py-2 border border-[var(--table-border)] rounded-lg text-[12px] outline-none bg-[var(--bg-input)] font-mono text-[var(--text-secondary)]" />
                <span className="text-[var(--text-muted)] text-[11px]">to</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  className="flex-1 px-2 py-2 border border-[var(--table-border)] rounded-lg text-[12px] outline-none bg-[var(--bg-input)] font-mono text-[var(--text-secondary)]" />
              </div>
            )}
            {showMobileFilters && (
              <div className="flex flex-col gap-2">
                <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)]">
                  <option value="All">All Accounts</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id.toString()}>{accountLabel(a)}</option>
                  ))}
                </select>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)]">
                  <option value="All">All Types</option>
                  <option value="Income">Income</option>
                  <option value="Expense">Expense</option>
                </select>
                <div className="relative" ref={isMobile ? categoryDropdownRef : undefined}>
                  <button type="button" onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)] cursor-pointer">
                    <span className="truncate">{categoryFilterLabel}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`ml-2 flex-shrink-0 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {showCategoryDropdown && (
                    <div className="absolute z-50 mt-1 left-0 right-0 bg-[var(--bg-card)] border border-[var(--table-border)] rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {categoryGroups.map((g) => (
                        <div key={g.group}>
                          <label className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)] cursor-pointer hover:bg-[var(--bg-hover)]">
                            <input type="checkbox" checked={filterCategory.includes(`group:${g.group}`)} onChange={() => toggleCategoryFilter(`group:${g.group}`)}
                              className="accent-[var(--color-accent)]" />
                            {g.group}
                          </label>
                          {g.subs.map((s) => (
                            <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 pl-7 text-[13px] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)]">
                              <input type="checkbox" checked={filterCategory.includes(`sub:${s.id}`)} onChange={() => toggleCategoryFilter(`sub:${s.id}`)}
                                className="accent-[var(--color-accent)]" />
                              {s.sub}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}
              className="px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)]">
              <option value="All">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id.toString()}>{accountLabel(a)}</option>
              ))}
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)]">
              <option value="All">All</option>
              <option value="Income">Income</option>
              <option value="Expense">Expense</option>
            </select>
            <div className="relative" ref={!isMobile ? categoryDropdownRef : undefined}>
              <button type="button" onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                className="flex items-center justify-between px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)] cursor-pointer min-w-[160px]">
                <span className="truncate">{categoryFilterLabel}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`ml-2 flex-shrink-0 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {showCategoryDropdown && (
                <div className="absolute z-50 mt-1 left-0 bg-[var(--bg-card)] border border-[var(--table-border)] rounded-lg shadow-lg max-h-72 overflow-y-auto min-w-[220px]">
                  {categoryGroups.map((g) => (
                    <div key={g.group}>
                      <label className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)] cursor-pointer hover:bg-[var(--bg-hover)]">
                        <input type="checkbox" checked={filterCategory.includes(`group:${g.group}`)} onChange={() => toggleCategoryFilter(`group:${g.group}`)}
                          className="accent-[var(--color-accent)]" />
                        {g.group}
                      </label>
                      {g.subs.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 pl-7 text-[13px] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)]">
                          <input type="checkbox" checked={filterCategory.includes(`sub:${s.id}`)} onChange={() => toggleCategoryFilter(`sub:${s.id}`)}
                            className="accent-[var(--color-accent)]" />
                          {s.sub}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)}
              className="px-3 py-2 border border-[var(--table-border)] rounded-lg text-[13px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)]">
              <option value="all">All Time</option>
              <option value="this-month">This Month</option>
              <option value="last-month">Last Month</option>
              <option value="this-quarter">This Quarter</option>
              <option value="last-quarter">Last Quarter</option>
              <option value="this-year">This Year</option>
              <option value="last-year">Last Year</option>
              <option value="ytd">Year to Date</option>
              <option value="custom">Custom Range...</option>
            </select>
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2 py-2 border border-[var(--table-border)] rounded-lg text-[12px] outline-none bg-[var(--bg-input)] font-mono text-[var(--text-secondary)]" />
                <span className="text-[var(--text-muted)] text-[11px]">to</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2 py-2 border border-[var(--table-border)] rounded-lg text-[12px] outline-none bg-[var(--bg-input)] font-mono text-[var(--text-secondary)]" />
              </div>
            )}
            {hasActiveFilters && (
              <button onClick={resetFilters}
                className="text-[12px] text-[var(--text-secondary)] bg-transparent border-none cursor-pointer btn-ghost whitespace-nowrap flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Reset Filters
              </button>
            )}
          </>
        )}
      </div>

      {/* Bulk Actions Toolbar */}
      {bulkMode && !isMobile && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] px-4 py-3 mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">{selectedIds.size} selected</span>
            <div className="h-4 w-px bg-[var(--table-border)]" />
            {/* Set Date */}
            <div className="flex items-center gap-1">
              <input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)}
                className="px-2 py-1.5 border border-[var(--table-border)] rounded-lg text-[12px] outline-none bg-[var(--bg-input)] font-mono text-[var(--text-secondary)]" />
              <button onClick={() => applyBulkAction('date')} disabled={!bulkDate || selectedIds.size === 0}
                className="px-2.5 py-1.5 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[11px] font-semibold border-none cursor-pointer disabled:opacity-40 btn-secondary">Set Date</button>
            </div>
            {/* Set Account */}
            <div className="flex items-center gap-1">
              <select value={bulkAccountId} onChange={(e) => setBulkAccountId(e.target.value ? parseInt(e.target.value) : '')}
                className="px-2 py-1.5 border border-[var(--table-border)] rounded-lg text-[12px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)]">
                <option value="">Account...</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
              </select>
              <button onClick={() => applyBulkAction('account')} disabled={!bulkAccountId || selectedIds.size === 0}
                className="px-2.5 py-1.5 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[11px] font-semibold border-none cursor-pointer disabled:opacity-40 btn-secondary">Set</button>
            </div>
            {/* Set Category */}
            <div className="flex items-center gap-1">
              <select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value ? parseInt(e.target.value) : '')}
                className="px-2 py-1.5 border border-[var(--table-border)] rounded-lg text-[12px] bg-[var(--bg-input)] outline-none max-w-[180px] text-[var(--text-secondary)]">
                <option value="">Category...</option>
                {Array.from(catGroupsForBulk.entries()).map(([group, subs]) => (
                  <optgroup key={group} label={group}>
                    {subs.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}
                  </optgroup>
                ))}
              </select>
              <button onClick={() => applyBulkAction('category')} disabled={!bulkCategoryId || selectedIds.size === 0}
                className="px-2.5 py-1.5 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[11px] font-semibold border-none cursor-pointer disabled:opacity-40 btn-secondary">Set</button>
            </div>
            {/* Find & Replace */}
            <div className="flex items-center gap-1">
              <input value={bulkFind} onChange={(e) => setBulkFind(e.target.value)} placeholder="Find..."
                className="px-2 py-1.5 border border-[var(--table-border)] rounded-lg text-[12px] outline-none bg-[var(--bg-input)] w-[100px] text-[var(--text-secondary)]" />
              <input value={bulkReplace} onChange={(e) => setBulkReplace(e.target.value)} placeholder="Replace..."
                className="px-2 py-1.5 border border-[var(--table-border)] rounded-lg text-[12px] outline-none bg-[var(--bg-input)] w-[100px] text-[var(--text-secondary)]" />
              <button onClick={() => applyBulkAction('findReplace')} disabled={!bulkFind || selectedIds.size === 0}
                className="px-2.5 py-1.5 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded-lg text-[11px] font-semibold border-none cursor-pointer disabled:opacity-40 btn-secondary">Replace</button>
            </div>
            <div className="h-4 w-px bg-[var(--table-border)]" />
            {/* Delete */}
            <button onClick={() => applyBulkAction('delete')} disabled={selectedIds.size === 0}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border-none cursor-pointer disabled:opacity-40 ${
                bulkConfirmDelete ? 'bg-[var(--btn-destructive-bg)] text-[var(--btn-destructive-text)] btn-destructive' : 'bg-[var(--btn-destructive-light-bg)] text-[var(--btn-destructive-light-text)] btn-destructive-light'
              }`}>
              {bulkConfirmDelete ? 'Confirm Delete?' : 'Delete Selected'}
            </button>
            {bulkConfirmDelete && (
              <button onClick={() => setBulkConfirmDelete(false)}
                className="text-[11px] text-[var(--text-secondary)] bg-transparent border-none cursor-pointer underline btn-ghost">Cancel</button>
            )}
          </div>
        </div>
      )}
      {isMobile ? (
        /* Mobile: Standalone cards */
        <div className="flex flex-col gap-1.5">
          {transactions.map((t) => {
            const catType = t.category?.type ?? t.splits?.[0]?.type ?? 'expense';
            const { text: amtText, className: amtClass } = fmtTransaction(t.amount, catType);
            const isSplit = t.splits && t.splits.length > 0;
            const hasReimbursement = isSplit && t.splits!.some(s => s.type !== t.splits![0].type);
            return (
              <div key={t.id}
                onClick={() => { if (hasPermission('transactions.edit')) setEditing(t); }}
                className={`bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] px-3.5 py-2.5 flex justify-between items-center ${hasPermission('transactions.edit') ? 'cursor-pointer active:bg-[var(--bg-hover)]' : ''}`}>
                <div className="flex-1 min-w-0 mr-3">
                  <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">{t.description}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{t.date}</span>
                    <span className="text-[var(--text-muted)]">·</span>
                    {isSplit ? (
                      <>
                        <SplitBadge
                          colors={t.splits!.map(s => getCategoryColor(s.groupName, allGroupNames))}
                          count={t.splits!.length}
                          compact
                        />
                        {hasReimbursement && <ReimbursementBadge />}
                      </>
                    ) : t.category ? (
                      <CategoryBadge name={t.category.subName} color={getCategoryColor(t.category.groupName, allGroupNames)} />
                    ) : null}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-[14px] font-mono font-semibold ${amtClass}`}>{amtText}</div>
                  <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{accountLabel(t.account)}</div>
                </div>
              </div>
            );
          })}
          {transactions.length === 0 && (
            <p className="text-center py-8 text-[var(--text-muted)] text-[13px]">No transactions found for this period</p>
          )}
        </div>
      ) : (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)]">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {bulkMode && (
                  <th className="w-8 px-2 py-2 border-b-2 border-[var(--table-border)]">
                    <input type="checkbox" checked={selectedIds.size === transactions.length && transactions.length > 0}
                      onChange={toggleSelectAll} className="cursor-pointer" />
                  </th>
                )}
                <SortableHeader label="Date" sortKey="date" activeSortKey={sortBy} sortDir={sortOrder} onSort={handleSort} />
                <SortableHeader label="Description" sortKey="description" activeSortKey={sortBy} sortDir={sortOrder} onSort={handleSort} />
                <SortableHeader label="Account" sortKey="account" activeSortKey={sortBy} sortDir={sortOrder} onSort={handleSort} />
                <SortableHeader label="Category" sortKey="category" activeSortKey={sortBy} sortDir={sortOrder} onSort={handleSort} />
                <SortableHeader label="Sub-Category" sortKey="subcategory" activeSortKey={sortBy} sortDir={sortOrder} onSort={handleSort} />
                <SortableHeader label="Amount" sortKey="amount" activeSortKey={sortBy} sortDir={sortOrder} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const catType = t.category?.type ?? t.splits?.[0]?.type ?? 'expense';
                const { text: amtText, className: amtClass } = fmtTransaction(t.amount, catType);
                const isSplit = t.splits && t.splits.length > 0;
                const hasReimbursement = isSplit && t.splits!.some(s => s.type !== t.splits![0].type);
                return (
                  <tr key={t.id}
                    onClick={() => { if (!bulkMode && hasPermission('transactions.edit')) { setEditing(t); } }}
                    className={`border-b border-[var(--table-row-border)] transition-colors ${!bulkMode && hasPermission('transactions.edit') ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'}`}>
                    {bulkMode && (
                      <td className="w-8 px-2 py-2">
                        <input type="checkbox" checked={selectedIds.has(t.id)}
                          onChange={() => toggleSelect(t.id)} className="cursor-pointer" />
                      </td>
                    )}
                    <td className="px-2.5 py-2 font-mono text-[12px] text-[var(--text-body)]">{t.date}</td>
                    <td className="px-2.5 py-2 text-[var(--text-primary)] font-medium">{t.description}</td>
                    <td className="px-2.5 py-2">
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <AccountBadge name={accountLabel(t.account)} />
                        {t.account.isShared ? (
                          <SharedBadge />
                        ) : t.account.owners?.length === 1 ? (
                          <OwnerBadge user={t.account.owners[0]} />
                        ) : null}
                      </span>
                    </td>
                    <td className="px-2.5 py-2">
                      {isSplit ? (
                        <div className="flex flex-col gap-0.5">
                          {[...new Map(t.splits!.map(s => [s.groupName, s])).values()].map((s, gi) => (
                            <div key={gi} className="flex items-center gap-1.5">
                              <span style={{
                                width: 7, height: 7, borderRadius: '50%',
                                background: getCategoryColor(s.groupName, allGroupNames),
                                display: 'inline-block', flexShrink: 0,
                              }} />
                              <span className="text-[11px] text-[var(--text-secondary)]">{s.groupName}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {t.category && (
                            <span style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: getCategoryColor(t.category.groupName, allGroupNames),
                              display: 'inline-block', flexShrink: 0,
                            }} />
                          )}
                          <span className="text-[11px] text-[var(--text-secondary)]">{t.category?.groupName ?? '—'}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-2.5 py-2">
                      {isSplit ? (
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <SplitBadge
                            colors={t.splits!.map(s => getCategoryColor(s.groupName, allGroupNames))}
                            count={t.splits!.length}
                          />
                          {hasReimbursement && <ReimbursementBadge />}
                        </span>
                      ) : t.category ? (
                        <CategoryBadge name={t.category.subName} color={getCategoryColor(t.category.groupName, allGroupNames)} />
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className={`px-2.5 py-2 text-right font-mono font-semibold ${amtClass}`}>
                      {amtText}
                    </td>
                  </tr>
                );
              })}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={bulkMode ? 7 : 6} className="text-center py-8 text-[var(--text-muted)] text-[13px]">
                    No transactions found for this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </div>
      )}

      {/* Pagination */}
      <div className={`mt-3 text-[13px] text-[var(--text-secondary)] ${isMobile ? 'flex flex-col items-center gap-2 pb-16' : 'flex justify-between items-center'}`}>
        {!isMobile && (
          <span className="font-mono text-[12px]">
            {total > 0 ? `${showFrom}–${showTo} of ${total}` : 'No transactions'}
          </span>
        )}
        <div className={`flex items-center ${isMobile ? 'justify-center' : 'gap-3'}`}>
          {!isMobile && (
            <div className="flex items-center gap-1.5">
              <select value={pageSize} onChange={(e) => { const v = parseInt(e.target.value, 10); setPageSize(v); localStorage.setItem('ledger-page-size', v.toString()); setPage(1); }}
                className="px-2 py-1 border border-[var(--table-border)] rounded text-[12px] bg-[var(--bg-input)] outline-none text-[var(--text-secondary)]">
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
              <span className="text-[12px] text-[var(--text-muted)]">per page</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-2.5 py-1 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded text-[12px] font-medium border-none cursor-pointer disabled:opacity-40 disabled:cursor-default btn-secondary">
              ← Prev
            </button>
            <span className="font-mono text-[12px] text-[var(--text-muted)]">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-2.5 py-1 bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] rounded text-[12px] font-medium border-none cursor-pointer disabled:opacity-40 disabled:cursor-default btn-secondary">
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {editing !== null && (
        <TransactionForm
          transaction={editing === 'new' ? undefined : editing}
          accounts={accounts}
          categories={categories}
          onSave={handleSave}
          onDelete={editing !== 'new' && hasPermission('transactions.delete') ? handleDelete : undefined}
          onClose={() => { setEditing(null); setPendingSave(null); setDuplicateMatch(null); }}
          duplicateMatch={duplicateMatch}
        />
      )}
    </div>
  );
}
