import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { fmt, fmtTransaction } from '../lib/formatters';
import { getCategoryColorHex, getCategoryEmoji, useCategoryEmojis } from '../lib/categoryMeta';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import ConfirmDeleteButton from '../components/ConfirmDeleteButton';
import CurrencyInput from '../components/CurrencyInput';
import Calendar from '../components/Calendar';
import PermissionGate from '../components/PermissionGate';
import { NeedsReviewBadge, NEEDS_REVIEW_HINT } from '../components/badges';
import { SegmentedControl, VendorAvatar } from '../components/primitives';
import InlineNotification from '../components/InlineNotification';
import ResponsiveModal from '../components/ResponsiveModal';
import SplitEditor from '../components/SplitEditor';
import type { SplitRow } from '../components/SplitEditor';
import FilterPopover from '../components/FilterPopover';
import type { FilterDraft } from '../components/filterModel';
import DateRangePopover from '../components/DateRangePopover';
import ManualImportModal from '../components/ManualImportModal';
import MerchantPicker from '../components/MerchantPicker';
import { chevronIcon, btnPrimary, btnSecondary } from '../components/settings/ui';
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
  logoUrl?: string | null;
  color?: string | null;
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
  // Per-split (full-Monarch model): the leg's OWN merchant (null = inherit
  // parent) and its own note.
  merchant: TransactionMerchant | null;
  note: string | null;
}

interface TransactionMerchant {
  id: number;
  name: string;
  logoUrl?: string | null;
}

interface Transaction {
  id: number;
  date: string;
  description: string; // payee-preferred statement text
  bankDescription?: string | null; // raw bank statement text (SimpleFIN/CSV rows)
  note: string | null;
  amount: number;
  merchant: TransactionMerchant | null;
  account: TransactionAccount;
  category: TransactionCategory | null;
  splits: TransactionSplit[] | null;
  needsReview?: boolean;
  confidence?: number | null;
  review?: {
    status: string;
    reason: string;
    note: string | null;
    assignee: { id: number; displayName: string } | null;
  } | null;
  // Present when this row is the OUT leg of a linked transfer: the in leg is
  // hidden from the list and its account is shown here as the destination.
  transfer?: {
    linkId: number;
    confidence: number | null;
    linkedBy: string; // auto | manual
    toTransactionId: number;
    toAccount: { id: number; name: string; lastFour: string | null };
    toDate: string;
  } | null;
}

interface HouseholdUser { id: number; displayName: string }

interface Merchant {
  id: number;
  name: string;
  logo_url?: string | null;
  suppress_rule_suggest?: number;
  txn_count?: number;
}

/** Display label for a transaction's vendor: merchant name, or raw statement as fallback. */
function vendorLabel(t: { merchant?: TransactionMerchant | null; description: string }): string {
  return t.merchant?.name ?? t.description;
}

/** Vendor label for a split leg: its own merchant, else the parent's, else raw statement. */
function splitVendorLabel(t: Transaction, split: TransactionSplit): string {
  return split.merchant?.name ?? t.merchant?.name ?? t.description;
}

/**
 * Merchant name to SEED an editable split field: own merchant, else the parent's,
 * else empty. Unlike splitVendorLabel it never falls back to the raw statement, so
 * re-saving an inheriting leg (parent merchant null) sends '' → stays inherited
 * rather than creating a merchant named after the statement text.
 */
function legMerchantSeed(t: Transaction, split: TransactionSplit): string {
  return split.merchant?.name ?? t.merchant?.name ?? '';
}

interface Account {
  id: number;
  name: string;
  last_four: string | null;
  classification?: string | null; // groups the Accounts filter tab
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
  exclude_from_budget?: number;
}

// Field wrapper with validation error display
function Field({
  label,
  required,
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
      <label className="block text-[13px] font-bold text-content mb-[7px]">{label}{required && <span className="text-content-3 font-medium"> *</span>}</label>
      {children}
      {error && <span className="text-[12px] font-medium text-negative mt-1.5 block">Required</span>}
    </div>
  );
}

function TransactionForm({
  transaction,
  accounts,
  categories,
  merchants,
  onSave,
  onDelete,
  onClose,
  duplicateMatch,
}: {
  transaction?: Transaction;
  accounts: Account[];
  categories: Category[];
  merchants: Merchant[];
  onSave: (data: Record<string, unknown>) => void;
  onDelete?: () => void;
  onClose: () => void;
  duplicateMatch?: DuplicateMatch | null;
}) {
  const [date, setDate] = useState(transaction?.date ?? new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState<number>(transaction?.account.id ?? (accounts[0]?.id ?? 0));
  const [merchant, setMerchant] = useState(transaction ? vendorLabel(transaction) : '');
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
  const [showErrors, setShowErrors] = useState(false);
  const [dupeExpanded, setDupeExpanded] = useState(false);
  const [splitNotification, setSplitNotification] = useState<string | null>(null);

  // Refs for focusing first invalid field
  const dateRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLSelectElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // Income and expense are both selectable; sign is derived from the chosen
  // category's type (no manual Type toggle). Transfers are auto-labeled by sync,
  // not hand-picked, so they're excluded from the manual picker.
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => c.type !== 'transfer');
  }, [categories]);

  // Base direction for split mode (which has no single category) + the
  // SplitEditor's reimbursement affordance: derive from the selected category,
  // else the first split's category, else expense.
  const derivedType: 'expense' | 'income' = (() => {
    const sel = categories.find((c) => c.id === categoryId);
    if (sel) return sel.type === 'income' ? 'income' : 'expense';
    const firstSplitCat = splits?.[0] ? categories.find((c) => c.id === splits[0].categoryId) : undefined;
    return firstSplitCat?.type === 'income' ? 'income' : 'expense';
  })();

  // Split legs inherit the parent's single sign, so only offer categories in the
  // SAME direction (income → income; expense → expense).
  // Offering a cross-type category would persist a leg whose stored sign
  // contradicts its category (e.g. an income leg stored positive). The opposite
  // direction is reached only through SplitEditor's dedicated reimbursement row.
  const splitLegCategories = useMemo(
    () => filteredCategories.filter((c) => (derivedType === 'income' ? c.type === 'income' : c.type !== 'income')),
    [filteredCategories, derivedType],
  );

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

  const handleCategoryChange = (id: number) => setCategoryId(id);

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
    merchant.trim() &&
    hasCategoryOrSplits &&
    amount !== '' &&
    !isNaN(parsedAmount)
  );

  const getFirstInvalidRef = () => {
    if (!date) return dateRef;
    if (accountId <= 0) return accountRef;
    // Merchant is a picker (no focusable input) — its error renders inline.
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

    // Sign derives from the category type (income stored negative, expenses
    // positive), preserving the user's entered sign so refunds/reversals
    // survive. In split mode there's no single category → use derivedType.
    const catType = splitMode ? derivedType : (categories.find((c) => c.id === categoryId)?.type ?? 'expense');
    const finalAmount = catType === 'income' ? -parsedAmount : parsedAmount;

    // Statement (raw description): use the edited value; if left blank, preserve the
    // existing raw statement on edits, and fall back to the merchant name for new entries.
    const finalDescription = description.trim() || transaction?.description || merchant.trim();
    if (splitMode && splits) {
      // Splits are stored with absolute amounts in editor; apply sign from finalAmount
      const sign = finalAmount < 0 ? -1 : 1;
      const finalSplits = splits.map(s => ({
        categoryId: s.categoryId,
        amount: +(s.amount * sign).toFixed(2),
      }));
      onSave({ accountId, date, description: finalDescription, merchant: merchant.trim(), note: note || null, splits: finalSplits, amount: finalAmount });
    } else {
      onSave({ accountId, date, description: finalDescription, merchant: merchant.trim(), note: note || null, categoryId, amount: finalAmount });
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
  const errMerchant = showErrors && !merchant.trim();
  const errCategory = showErrors && !splitMode && categoryId <= 0;
  const errAmount = showErrors && (amount === '' || isNaN(parsedAmount));

  const inputCls = (hasError: boolean) =>
    `w-full h-11 px-3.5 rounded-[11px] bg-surface-2 border text-content text-sm outline-none placeholder:text-content-3 ${
      hasError ? 'border-negative' : 'border-line-strong'
    }`;
  const selectCls = (hasError: boolean) => `${inputCls(hasError)} pr-10 appearance-none cursor-pointer`;

  return (
    <ResponsiveModal
      isOpen={true}
      onClose={onClose}
      title={transaction ? 'Edit transaction' : 'Add transaction'}
      maxWidth="32rem"
      footer={(
        <div className="flex items-center gap-2.5">
          {transaction && onDelete && <ConfirmDeleteButton onConfirm={onDelete} />}
          <div className="ml-auto flex items-center gap-2.5">
            <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
            <button type="button" onClick={handleSaveClick} aria-disabled={!isValid}
              className={`${btnPrimary} ${!isValid ? 'opacity-50' : ''} ${duplicateMatch && isValid ? 'bg-warning hover:bg-warning' : ''}`}>
              {duplicateMatch ? 'Save anyway' : transaction ? 'Save changes' : 'Add transaction'}
            </button>
          </div>
        </div>
      )}
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" required error={errDate}>
            <input ref={dateRef} type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className={`${inputCls(!!errDate)} font-mono`} />
          </Field>
          <Field label="Account" required error={errAccount}>
            <div className="relative">
            <select ref={accountRef} value={accountId} onChange={(e) => setAccountId(parseInt(e.target.value, 10))}
              className={selectCls(!!errAccount)}>
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
            {chevronIcon}
            </div>
          </Field>
        </div>
        <Field label="Merchant" required error={errMerchant}>
          <MerchantPicker value={merchant} merchants={merchants} onSelect={setMerchant}
            placeholder="Who was paid?" triggerClassName={inputCls(!!errMerchant)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Statement">
            <input ref={descRef} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Raw bank text (optional)" className={inputCls(false)} />
          </Field>
          <Field label="Note">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional"
              className={inputCls(false)} />
          </Field>
        </div>
        <div>
          {!splitMode ? (
            <div>
              <Field label="Category" required error={errCategory}>
                <div className="relative">
                <select ref={categoryRef} value={categoryId} onChange={(e) => handleCategoryChange(parseInt(e.target.value, 10))}
                  className={selectCls(!!errCategory)}>
                  <option value={0} disabled>Select category</option>
                  {groupedCategories.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.cats.map((c) => (
                        <option key={c.id} value={c.id}>{c.sub_name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {chevronIcon}
                </div>
              </Field>
              <button type="button" onClick={handleEnterSplitMode}
                className="text-[13px] font-semibold text-primary mt-2">
                Split across categories
              </button>
            </div>
          ) : (
            <div>
              <div className="text-[13px] font-bold text-content mb-[7px]">
                Category <span className="text-primary font-semibold">· split</span>
              </div>
              {splits && splits.length >= 2 ? (
                <div className="text-[13px] text-positive font-semibold">
                  {splits.length} categories assigned
                  <button type="button" onClick={handleCancelSplit} className="ml-2.5 text-[13px] font-semibold text-content-3 hover:text-content">Remove split</button>
                </div>
              ) : (
                <div className="text-[13px] text-content-3">
                  Configure the split below
                  <button type="button" onClick={handleCancelSplit} className="ml-2.5 text-[13px] font-semibold text-content-3 hover:text-content">Cancel</button>
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
            categories={splitLegCategories}
            allCategories={categories}
            txType={derivedType}
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
        <div className="mt-5 rounded-[12px] border p-3.5" style={{ background: 'color-mix(in srgb, var(--warning) 12%, var(--surface))', borderColor: 'color-mix(in srgb, var(--warning) 35%, transparent)' }}>
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-warning m-0">
                  Possible duplicate — save again to confirm
                </p>
                <button onClick={() => setDupeExpanded(!dupeExpanded)}
                  className="bg-transparent border-none cursor-pointer p-0.5 text-warning">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: dupeExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
              {dupeExpanded && (
                <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
                  <span className="text-warning">Date</span>
                  <span className="font-mono text-warning">{duplicateMatch.date}</span>
                  <span className="text-warning">Description</span>
                  <span className="text-warning">{duplicateMatch.description}</span>
                  <span className="text-warning">Amount</span>
                  <span className="font-mono font-semibold text-warning">{fmt(Math.abs(duplicateMatch.amount))}</span>
                  {duplicateMatch.accountName && <>
                    <span className="text-warning">Account</span>
                    <span className="text-warning">{duplicateMatch.accountName}</span>
                  </>}
                  {duplicateMatch.category && <>
                    <span className="text-warning">Category</span>
                    <span className="text-warning">{duplicateMatch.category}</span>
                  </>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </ResponsiveModal>
  );
}

export default function TransactionsPage() {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();
  const isMobile = useIsMobile();
  useCategoryEmojis(); // re-render when stored category emojis load/change
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
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
  // After a user recategorizes a merchant's transaction, offer to learn a durable rule.
  const [ruleSuggest, setRuleSuggest] = useState<{ merchantId: number; merchantName: string; categoryId: number; categoryName: string } | null>(null);
  const [reviewCount, setReviewCount] = useState(0); // # transactions flagged needs_review
  const [detailReviewNote, setDetailReviewNote] = useState('');
  const [householdUsers, setHouseholdUsers] = useState<HouseholdUser[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [filterAccount, setFilterAccount] = useState<string[]>([]);
  const [filterType, setFilterType] = useState('All');
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterMerchant, setFilterMerchant] = useState<string[]>([]); // merchant ids as strings
  const [amountOp, setAmountOp] = useState('');   // '' | 'gt' | 'lt' | 'eq' | 'bt'
  const [amountValue, setAmountValue] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [filterNeedsReview, setFilterNeedsReview] = useState(false);

  const [datePreset, setDatePreset] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const PAGE = 50; // infinite-scroll increment
  const [limit, setLimit] = useState(PAGE); // rows currently loaded; grows on scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [sortOpen, setSortOpen] = useState(false);
  const [sortTouched, setSortTouched] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [filterTab, setFilterTab] = useState('Categories');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDraft, setFilterDraft] = useState<FilterDraft>({ account: [], type: 'All', category: [], merchant: [], op: '', val: '', min: '', max: '', needsReview: false });
  const [editCell, setEditCell] = useState<{ id: number; field: 'vendor' | 'category' } | null>(null);
  // Row whose Review badge has its quick-action popover open.
  const [reviewPopId, setReviewPopId] = useState<number | null>(null);
  // The page header sticks at the top of the scroll container; the card toolbar
  // ("N transactions" + Edit multiple) stacks directly under it, so it needs the
  // header's live height rather than a hardcoded offset — the header wraps on
  // narrow viewports and changes height.
  const pageHeaderRef = useRef<HTMLDivElement>(null);
  const toolbarSentinelRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(0);
  const [toolbarStuck, setToolbarStuck] = useState(false);
  const [cellSearch, setCellSearch] = useState('');
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [detailNote, setDetailNote] = useState('');
  // Click-to-edit header amount: the buffer is seeded only when editing starts,
  // so concurrent commits can't clobber live typing.
  const [detailAmount, setDetailAmount] = useState('');
  const [amountEditing, setAmountEditing] = useState(false);
  // Set by Escape so the blur that follows skips the commit.
  const amountCancelled = useRef(false);
  const [detailCalOpen, setDetailCalOpen] = useState(false);
  // When a split leg is open in the detail panel, this is its split id (the
  // panel still holds the parent `detail`); null = viewing the parent itself.
  const [detailSplitId, setDetailSplitId] = useState<number | null>(null);
  // Mirror of detailSplitId that's always current, so an in-flight refreshDetail
  // re-seeds the leg that's open NOW (not the one open when the PATCH fired).
  const detailSplitIdRef = useRef<number | null>(null);
  // True while the split-child note field has focus, so a concurrent PATCH's
  // refresh doesn't clobber an in-progress edit.
  const splitFieldFocused = useRef<'note' | null>(null);
  const [detailSplitNote, setDetailSplitNote] = useState('');
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitMode, setSplitMode] = useState<'$' | '%'>('$');
  const [splitOrigExpanded, setSplitOrigExpanded] = useState(false);
  const [splitDraft, setSplitDraft] = useState<{ id?: number; categoryId: number | ''; amount: string; merchant: string; note?: string; pctRaw?: string }[]>([]);

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

  // Open add form from FAB (via URL param or custom event), deep-link a merchant
  // filter (/transactions?merchantId=12) or account filter (?accountId=5), or open
  // a transaction's detail panel from the Reviews page (/transactions?review=34).
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setEditing('new');
      setSearchParams({}, { replace: true });
      return;
    }
    const mid = searchParams.get('merchantId');
    if (mid) {
      setFilterMerchant([mid]);
      setSearchParams({}, { replace: true });
      return;
    }
    const aid = searchParams.get('accountId');
    if (aid) {
      setFilterAccount([aid]);
      setSearchParams({}, { replace: true });
      return;
    }
    const rev = searchParams.get('review');
    if (rev) {
      const id = parseInt(rev, 10);
      setSearchParams({}, { replace: true });
      apiFetch<{ data: Transaction }>(`/transactions/${id}`).then((r) => openDetail(r.data)).catch(() => {});
    }
    // openDetail is intentionally omitted (stable enough; guarded one-shot via param clear)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const handler = () => setEditing('new');
    window.addEventListener('open-add-transaction', handler);
    return () => window.removeEventListener('open-add-transaction', handler);
  }, []);

  // Bulk edit mode
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Anchor for shift-click range selection: the last row clicked WITHOUT shift,
  // or the far end of the last range. Ranges extend from here, so an earlier
  // selection made before a gap is never swallowed by the range.
  const selectionAnchor = useRef<number | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkMerchant, setBulkMerchant] = useState('');
  const [bulkDate, setBulkDate] = useState('');
  const [bulkCalOpen, setBulkCalOpen] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState<number | ''>('');
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);

  const loadTransactions = useCallback(async () => {
    const params = new URLSearchParams();
    const { startDate, endDate } = getDateRange();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    // Infinite scroll: always fetch from the top up to the current `limit`, so
    // growing `limit` extends the list and edits/deletes preserve the window.
    params.set('limit', limit.toString());
    params.set('offset', '0');
    if (search) params.set('search', search);
    if (filterAccount.length) params.set('accountIds', filterAccount.join(','));
    if (filterType !== 'All') params.set('type', filterType.toLowerCase());
    if (filterCategory.length > 0) {
      const groupNames = filterCategory.filter(v => v.startsWith('group:')).map(v => v.slice(6));
      const catIds = filterCategory.filter(v => v.startsWith('sub:')).map(v => v.slice(4));
      if (groupNames.length) params.set('groupNames', groupNames.join(','));
      if (catIds.length) params.set('categoryIds', catIds.join(','));
    }
    if (filterMerchant.length > 0) params.set('merchantIds', filterMerchant.join(','));
    if (amountOp) {
      params.set('amountOp', amountOp);
      if (amountOp === 'bt') { if (amountMin) params.set('amountMin', amountMin); if (amountMax) params.set('amountMax', amountMax); }
      else if (amountValue) params.set('amountValue', amountValue);
    }
    if (filterNeedsReview) params.set('needsReview', '1');
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);

    const res = await apiFetch<{ data: Transaction[]; total: number }>(`/transactions?${params.toString()}`);
    setTransactions(res.data);
    setTotal(res.total);
  }, [getDateRange, search, filterAccount, filterType, filterCategory, filterMerchant, amountOp, amountValue, amountMin, amountMax, filterNeedsReview, limit, sortBy, sortOrder]);

  useEffect(() => {
    const el = pageHeaderRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile]);

  // Stuck-state for the toolbar's separator: a 1px sentinel above it leaves the
  // viewport (inset by the header) exactly when the toolbar pins. IntersectionObserver
  // rather than a scroll listener because the page scrolls in an ancestor container,
  // not the window.
  useEffect(() => {
    const el = toolbarSentinelRef.current;
    if (!el || headerH === 0) return;
    const io = new IntersectionObserver(
      ([entry]) => setToolbarStuck(!entry.isIntersecting),
      { threshold: 0, rootMargin: `-${Math.round(headerH)}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [headerH, isMobile]);

  const loadMerchants = useCallback(async () => {
    const res = await apiFetch<{ data: Merchant[] }>('/merchants');
    setMerchants(res.data);
  }, []);

  const loadReviewCount = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Transaction[]; total: number }>('/transactions?needsReview=1&limit=1');
      setReviewCount(res.total);
    } catch { /* non-critical */ }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      // GET /users `data` is the basic dropdown list: { id, username, display_name }.
      const res = await apiFetch<{ data: { id: number; display_name: string }[] }>('/users');
      setHouseholdUsers(res.data.map((u) => ({ id: u.id, displayName: u.display_name })));
    } catch { /* non-critical — assignee picker just shows nobody */ }
  }, []);

  const loadMeta = useCallback(async () => {
    const [acctRes, catRes, merchRes] = await Promise.all([
      apiFetch<{ data: Account[] }>('/accounts'),
      apiFetch<{ data: Category[] }>('/categories'),
      apiFetch<{ data: Merchant[] }>('/merchants'),
    ]);
    setAccounts(acctRes.data);
    setCategories(catRes.data);
    setMerchants(merchRes.data);
  }, []);

  const SORT_OPTIONS: { by: string; order: 'asc' | 'desc'; label: string }[] = [
    { by: 'date', order: 'desc', label: 'Date (new → old)' },
    { by: 'date', order: 'asc', label: 'Date (old → new)' },
    { by: 'merchant', order: 'asc', label: 'Merchant (A → Z)' },
    { by: 'amount', order: 'desc', label: 'Amount (high → low)' },
    { by: 'amount', order: 'asc', label: 'Amount (low → high)' },
  ];
  const applySort = (by: string, order: 'asc' | 'desc') => {
    setSortBy(by); setSortOrder(order); setSortTouched(true); setSortOpen(false); setLimit(PAGE);
  };

  // Date / Filters overlays — edits are staged in a draft, committed on Apply.
  const openFilterPopover = () => { setFilterDraft({ account: [...filterAccount], type: filterType, category: [...filterCategory], merchant: [...filterMerchant], op: amountOp, val: amountValue, min: amountMin, max: amountMax, needsReview: filterNeedsReview }); setFilterTab('Categories'); setFilterSearch(''); setSortOpen(false); setFilterOpen(true); };
  const applyFilters = () => {
    setFilterAccount(filterDraft.account); setFilterType(filterDraft.type); setFilterCategory(filterDraft.category); setFilterMerchant(filterDraft.merchant);
    setAmountOp(filterDraft.op); setAmountValue(filterDraft.val); setAmountMin(filterDraft.min); setAmountMax(filterDraft.max);
    setFilterNeedsReview(!!filterDraft.needsReview);
    setFilterOpen(false);
  };
  const clearDate = () => { setDatePreset('all'); setCustomStart(''); setCustomEnd(''); };
  const clearFilters = () => {
    setFilterDraft({ account: [], type: 'All', category: [], merchant: [], op: '', val: '', min: '', max: '', needsReview: false });
    setFilterAccount([]); setFilterType('All'); setFilterCategory([]); setFilterMerchant([]);
    setAmountOp(''); setAmountValue(''); setAmountMin(''); setAmountMax(''); setFilterNeedsReview(false);
  };
  // Clear every active filter (search + date + filters) without opening a popover.
  const clearAll = () => { setSearch(''); setSearchOpen(false); clearDate(); clearFilters(); };

  // Persist "always categorize {merchant} as {category}" + back-apply to existing rows.
  const applyMerchantRule = async () => {
    if (!ruleSuggest) return;
    const { merchantId, categoryId } = ruleSuggest;
    setRuleSuggest(null);
    try {
      const res = await apiFetch<{ data: { affected: number } }>('/category-rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchType: 'merchant', pattern: String(merchantId), categoryId, applyToExisting: true }),
      });
      const n = res.data.affected;
      addToast(`Rule saved — ${n} matching transaction${n === 1 ? '' : 's'} updated`, 'success');
      await loadTransactions();
    } catch {
      addToast('Failed to save rule', 'error');
    }
  };

  // "Never for this merchant" — mute the prompt rather than answering it. Undone
  // from Settings ▸ Merchants, so it is never a one-way door.
  const muteMerchantRule = async () => {
    if (!ruleSuggest) return;
    const { merchantId, merchantName } = ruleSuggest;
    setRuleSuggest(null);
    try {
      await apiFetch(`/merchants/${merchantId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suppressRuleSuggest: true }),
      });
      await loadMerchants();
      addToast(`Won't ask about ${merchantName} again — change it in Settings ▸ Merchants`, 'success');
    } catch {
      addToast('Failed to update merchant', 'error');
    }
  };

  // Inline/panel edit — rebuilds the txn body (preserving splits) and PUTs.
  const updateTxnField = async (t: Transaction, changes: { description?: string; merchant?: string; categoryId?: number; date?: string; note?: string | null; amount?: number }) => {
    const isSplit = !!(t.splits && t.splits.length > 0);
    let newAmount = t.amount;
    const body: Record<string, unknown> = {
      accountId: t.account.id,
      date: changes.date ?? t.date,
      description: changes.description ?? t.description,
      note: changes.note !== undefined ? changes.note : t.note,
    };
    if (changes.merchant !== undefined) body.merchant = changes.merchant;
    if (isSplit) {
      // Amount + splits are driven by the split modal; other fields still edit.
      // Carry each leg's id + merchant + note so an upsert-by-id save preserves
      // per-leg data (and stable ids) when a parent field is edited.
      body.splits = t.splits!.map((s) => ({ id: s.id, categoryId: s.categoryId, amount: s.amount, merchant: s.merchant?.name, note: s.note }));
      body.amount = t.amount;
    } else {
      const categoryId = changes.categoryId ?? t.category?.id ?? null;
      const catType = categories.find((c) => c.id === categoryId)?.type ?? t.category?.type ?? 'expense';
      if (changes.amount !== undefined) {
        // Entered (display) amount → stored sign from category, preserving the
        // user's entered sign so refunds/reversals survive.
        newAmount = catType === 'income' ? -changes.amount : changes.amount;
      }
      // A category-only change is a relabel, not a re-sign: the stored sign
      // already encodes money direction (positive = out, negative = in)
      // independent of category, so the amount is left untouched. This keeps
      // refunds/reversals/withdrawals intact when recategorized.
      body.categoryId = categoryId;
      body.amount = newAmount;
    }
    try {
      await apiFetch(`/transactions/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setEditCell(null); setCellSearch('');
      if (changes.merchant !== undefined) loadMerchants(); // pick up any newly-created merchant
      // Merge the committed change into the open panel LOCALLY (no refetch) so an
      // in-progress edit the user may have started in another field isn't
      // clobbered by a whole-panel reseed.
      if (detail && detail.id === t.id) {
        const newCat = (!isSplit && changes.categoryId != null)
          ? categories.find((c) => c.id === changes.categoryId)
          : undefined;
        setDetail((prev) => {
          if (!prev || prev.id !== t.id) return prev;
          // The server resolves an open review when the category actually changes
          // (or on any split save) — mirror that here so the panel's Review section
          // doesn't stay stale after categorizing a flagged transaction.
          const reviewResolved = isSplit || (changes.categoryId != null && changes.categoryId !== prev.category?.id);
          return {
            ...prev,
            amount: isSplit ? prev.amount : newAmount,
            date: changes.date ?? prev.date,
            note: changes.note !== undefined ? changes.note : prev.note,
            description: changes.description ?? prev.description,
            merchant: changes.merchant !== undefined
              ? (changes.merchant.trim() ? { id: prev.merchant?.id ?? -1, name: changes.merchant.trim() } : null)
              : prev.merchant,
            category: (!isSplit && changes.categoryId != null)
              ? (newCat ? { id: newCat.id, groupName: newCat.group_name, subName: newCat.sub_name, displayName: newCat.display_name, type: newCat.type } : null)
              : prev.category,
            needsReview: reviewResolved ? false : prev.needsReview,
            review: reviewResolved ? null : prev.review,
          };
        });
      }
      await loadTransactions();
      // Offer to learn a durable merchant→category rule when the category changed —
      // unless the user has muted suggestions for this merchant.
      if (!isSplit && changes.categoryId != null && changes.categoryId !== t.category?.id && t.merchant && t.merchant.id > 0) {
        const muted = merchants.find((m) => m.id === t.merchant!.id)?.suppress_rule_suggest === 1;
        const cat = categories.find((c) => c.id === changes.categoryId);
        if (cat && !muted) setRuleSuggest({ merchantId: t.merchant.id, merchantName: t.merchant.name, categoryId: cat.id, categoryName: cat.sub_name });
      }
    } catch {
      addToast('Failed to update transaction', 'error');
    }
  };

  // Display form of a stored amount for editing (income is stored negative).
  const displayAmount = (t: Transaction) => {
    const catType = t.category?.type ?? t.splits?.[0]?.type ?? 'expense';
    return String(catType === 'income' ? -t.amount : t.amount);
  };
  const seedDetail = (t: Transaction) => { setDetail(t); setDetailNote(t.note ?? ''); setDetailReviewNote(t.review?.note ?? ''); };
  const refreshDetail = async (id: number) => {
    try {
      const res = await apiFetch<{ data: Transaction }>(`/transactions/${id}`);
      seedDetail(res.data);
      // Re-seed the leg that's open NOW (via the ref), and skip the note field if
      // the user is editing it so an in-flight refresh can't clobber live typing.
      const activeId = detailSplitIdRef.current;
      const active = activeId != null ? (res.data.splits ?? []).find((s) => s.id === activeId) : undefined;
      if (active) {
        if (splitFieldFocused.current !== 'note') setDetailSplitNote(active.note ?? '');
      } else if (activeId != null) {
        setDetailSplitId(null); // leg gone (unsplit/merged) → fall back to parent view
        detailSplitIdRef.current = null;
      }
    } catch { /* leave panel as-is */ }
  };
  const openDetail = (t: Transaction, split?: TransactionSplit) => {
    setDetailSplitId(split?.id ?? null);
    detailSplitIdRef.current = split?.id ?? null;
    setAmountEditing(false);
    setDetailCalOpen(false);
    seedDetail(t);
    if (split) setDetailSplitNote(split.note ?? '');
    // List rows carry no review data — fetch the full record so the panel shows it.
    void refreshDetail(t.id);
  };

  // Review-task actions from the detail panel; keep badge/pill/queue in sync after each.
  const afterReviewChange = async (id: number) => { await refreshDetail(id); loadTransactions(); loadReviewCount(); window.dispatchEvent(new CustomEvent('reviews-changed')); };
  const flagForReview = async () => {
    if (!detail) return;
    try { await apiFetch('/reviews/flag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactionId: detail.id }) }); afterReviewChange(detail.id); }
    catch { addToast('Failed to flag for review', 'error'); }
  };
  /** Resolve a review by id — used by the detail panel and by the row badge popover. */
  const markReviewedById = async (id: number) => {
    try {
      await apiFetch('/reviews/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactionId: id }) });
      // Refresh the open panel only when it's this transaction; the list, the
      // header count and the sidebar badge always resync.
      if (detail?.id === id) await refreshDetail(id);
      loadTransactions();
      loadReviewCount();
      window.dispatchEvent(new CustomEvent('reviews-changed'));
    } catch { addToast('Failed to mark reviewed', 'error'); }
  };
  const markReviewed = async () => {
    if (!detail) return;
    await markReviewedById(detail.id);
  };
  // Split a linked transfer back into its two rows. The pair is remembered as
  // rejected server-side, so the detector won't immediately re-pair them.
  const unlinkTransfer = async (id: number) => {
    try {
      await apiFetch(`/transactions/${id}/transfer-link`, { method: 'DELETE' });
      addToast('Transfer unlinked — the two transactions are separate again', 'success');
      if (detail?.id === id) await refreshDetail(id);
      loadTransactions();
    } catch { addToast('Failed to unlink transfer', 'error'); }
  };
  const patchReview = async (body: Record<string, unknown>) => {
    if (!detail) return;
    try { await apiFetch(`/reviews/${detail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); afterReviewChange(detail.id); }
    catch { addToast('Failed to update review', 'error'); }
  };
  const closeDetail = () => { setDetail(null); setDetailSplitId(null); detailSplitIdRef.current = null; setAmountEditing(false); setDetailCalOpen(false); };

  const deleteFromDetail = async () => {
    if (!detail) return;
    try {
      await apiFetch(`/transactions/${detail.id}`, { method: 'DELETE' });
      closeDetail();
      addToast('Transaction deleted');
      await loadTransactions();
    } catch { addToast('Failed to delete transaction', 'error'); }
  };

  const openSplit = () => {
    if (!detail) return;
    const parentMerch = detail.merchant?.name ?? '';
    const rows = (detail.splits && detail.splits.length > 0)
      ? detail.splits.map((s) => ({ id: s.id, categoryId: s.categoryId as number | '', amount: Math.abs(s.amount).toFixed(2), merchant: splitVendorLabel(detail, s), note: s.note ?? '' }))
      // New split: start every row at $0 (nothing pre-filled) and default each
      // leg's merchant to the parent's (Monarch-style), which the user can change.
      : [
          { categoryId: (detail.category?.id ?? '') as number | '', amount: '', merchant: parentMerch, note: '' },
          { categoryId: '' as number | '', amount: '', merchant: parentMerch, note: '' },
        ];
    setSplitMode('$');
    setSplitOrigExpanded(false);
    setSplitDraft(rows);
    setSplitOpen(true);
  };

  const saveSplit = async () => {
    if (!detail) return;
    const sign = detail.amount < 0 ? -1 : 1;
    const rows = splitDraft.filter((r) => r.categoryId !== '' && parseFloat(r.amount) > 0);
    // Omit `merchant` so the parent merchant is untouched; the server uses it as
    // the baseline for the NULL-inherit rule on each leg.
    const body = {
      accountId: detail.account.id,
      date: detail.date,
      description: detail.description,
      note: detail.note,
      amount: detail.amount,
      splits: rows.map((r) => ({ id: r.id, categoryId: r.categoryId, amount: +(Math.abs(parseFloat(r.amount)) * sign).toFixed(2), merchant: r.merchant, note: r.note })),
    };
    try {
      await apiFetch(`/transactions/${detail.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setSplitOpen(false);
      addToast('Split saved');
      await refreshDetail(detail.id); // keep the panel open, showing the new split
      await loadTransactions();
    } catch { addToast('Failed to save split', 'error'); }
  };

  // Convert a split transaction back to a single category (the only editor is the
  // detail panel now, so this is the un-split path). The parent amount is kept
  // as-is; the category becomes the first assigned split's category, which the
  // user can then re-pick from the (now single) category select.
  const removeSplitFromDetail = async () => {
    if (!detail || !detail.splits?.length) return;
    const catId = detail.splits.find((s) => s.categoryId)?.categoryId ?? detail.splits[0].categoryId;
    try {
      await apiFetch(`/transactions/${detail.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: detail.account.id, date: detail.date, description: detail.description, note: detail.note, amount: detail.amount, categoryId: catId }),
      });
      setSplitOpen(false);
      setDetailSplitId(null); detailSplitIdRef.current = null; // back to the single-category parent view
      addToast('Split removed');
      await refreshDetail(detail.id);
      await loadTransactions();
    } catch { addToast('Failed to remove split', 'error'); }
  };

  // Edit ONE split leg's category / merchant / note from the split-child detail
  // panel (amount is managed only in the modal). PATCHes just that leg.
  const patchSplitField = async (changes: { categoryId?: number; merchant?: string; note?: string | null }) => {
    if (!detail || detailSplitId == null) return;
    try {
      await apiFetch(`/transactions/${detail.id}/splits/${detailSplitId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
      });
      await refreshDetail(detail.id);
      await loadTransactions();
    } catch { addToast('Failed to update split', 'error'); }
  };

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { setLimit(PAGE); }, [datePreset, customStart, customEnd, search, filterAccount, filterType, filterCategory, filterMerchant, amountOp, amountValue, amountMin, amountMax, filterNeedsReview]);
  useEffect(() => { loadTransactions(); }, [loadTransactions]);
  useEffect(() => { loadReviewCount(); }, [loadReviewCount, transactions]);
  useEffect(() => { detailSplitIdRef.current = detailSplitId; }, [detailSplitId]);

  // Infinite scroll: when the sentinel nears the viewport, load one more batch.
  // Re-arms after each fetch (transactions.length changes); stops when all loaded.
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || transactions.length >= total) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { io.disconnect(); setLimit((l) => l + PAGE); }
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [transactions.length, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editCell) { setEditCell(null); setCellSearch(''); }
      else if (bulkMode) { setBulkMode(false); setSelectedIds(new Set()); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editCell, bulkMode]);

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
      loadMerchants(); // a new merchant may have been created
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
    selectionAnchor.current = null;
    setBulkEditOpen(false);
    setBulkConfirmDelete(false);
  };
  const openBulkEdit = () => { if (selectedIds.size > 0) setBulkEditOpen(true); };

  // Net of the selected rows, in the list's sign convention (positive = money
  // out). Only loaded transactions count — a stale id from a since-changed filter
  // contributes nothing rather than a wrong figure.
  const selectedTotal = transactions.reduce((sum, t) => (selectedIds.has(t.id) ? sum + t.amount : sum), 0);

  // Apply all set fields (merchant / category / date) in a single bulk update.
  const applyBulkEdit = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const updates: Record<string, unknown> = {};
    if (bulkMerchant.trim()) updates.merchant = bulkMerchant.trim();
    if (bulkCategoryId) updates.categoryId = bulkCategoryId;
    if (bulkDate) updates.date = bulkDate;
    if (Object.keys(updates).length === 0) return;
    try {
      await apiFetch('/transactions/bulk-update', { method: 'POST', body: JSON.stringify({ ids, updates }) });
      addToast(`Updated ${ids.length} transactions`);
      setBulkMerchant(''); setBulkCategoryId(''); setBulkDate(''); setBulkCalOpen(false);
      setBulkEditOpen(false);
      if (updates.merchant) loadMerchants(); // a new merchant may have been created
      loadTransactions();
    } catch (_err) {
      addToast('Bulk operation failed', 'error');
    }
  };

  const deleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!bulkConfirmDelete) { setBulkConfirmDelete(true); setTimeout(() => setBulkConfirmDelete(false), 3000); return; }
    try {
      await apiFetch('/transactions/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
      setBulkConfirmDelete(false);
      addToast(`Deleted ${ids.length} transactions`);
      setSelectedIds(new Set()); setBulkMode(false); setBulkEditOpen(false);
      loadTransactions();
    } catch (_err) {
      addToast('Bulk operation failed', 'error');
    }
  };

  const hasMore = transactions.length < total;

  const canEdit = hasPermission('transactions.edit');
  // Rounded-square checkbox indicator (never a circle — circles read as radios).
  const formatDateHeader = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  // Merchant name suggestions for the inline vendor picker — the real merchant list.
  const vendorOptions = merchants.map((m) => m.name).sort((a, b) => a.localeCompare(b));
  const sortLabel = !sortTouched ? 'Sort' : (SORT_OPTIONS.find((o) => o.by === sortBy && o.order === sortOrder)?.label ?? 'Sort');
  const DATE_PRESETS: { value: string; label: string }[] = [
    { value: 'all', label: 'All time' }, { value: 'this-month', label: 'This month' }, { value: 'last-month', label: 'Last month' },
    { value: 'this-quarter', label: 'This quarter' }, { value: 'last-quarter', label: 'Last quarter' },
    { value: 'this-year', label: 'This year' }, { value: 'last-year', label: 'Last year' }, { value: 'ytd', label: 'Year to date' },
    { value: 'custom', label: 'Custom range…' },
  ];
  const shortDate = (s: string) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const dateLabel = datePreset === 'all' ? 'Date'
    : datePreset === 'custom'
      ? (customStart && customEnd ? `${shortDate(customStart)} – ${shortDate(customEnd)}` : customStart ? `From ${shortDate(customStart)}` : customEnd ? `Until ${shortDate(customEnd)}` : 'Custom')
      : (DATE_PRESETS.find((p) => p.value === datePreset)?.label ?? 'Date');
  const filterCount = filterAccount.length + (filterType !== 'All' ? 1 : 0) + filterCategory.length + filterMerchant.length + (amountOp ? 1 : 0) + (filterNeedsReview ? 1 : 0);
  const anyActive = search !== '' || datePreset !== 'all' || filterCount > 0;
  const groupedAll = Array.from(
    categories.reduce((m, c) => { if (!m.has(c.group_name)) m.set(c.group_name, []); m.get(c.group_name)!.push(c); return m; }, new Map<string, Category[]>()).entries()
  );
  // The detail split modal applies one sign to every leg, so its category picker
  // must offer only same-direction categories (income → income;
  // expense → expense) — otherwise a leg is stored with a sign
  // that contradicts its category. Direction comes from the transaction's
  // category type (not its money-sign, so refunds/reversals stay in-family).
  const detailBaseType: 'income' | 'expense' =
    ((detail?.category?.type ?? detail?.splits?.[0]?.type) === 'income') ? 'income' : 'expense';
  // Always keep any category already assigned to a split leg selectable — a
  // reimbursement/expense leg on an income split (created via the Add form's
  // reimbursement row) or legacy mixed data would otherwise render as a blank,
  // un-reselectable dropdown and could be silently converted on save.
  const draftCatIds = new Set(splitDraft.map((r) => r.categoryId).filter((v): v is number => v !== ''));
  const splitModalGroups = groupedAll
    .map(([group, subs]) => [
      group,
      subs.filter((c) => c.type !== 'transfer' && ((detailBaseType === 'income' ? c.type === 'income' : c.type !== 'income') || draftCatIds.has(c.id))),
    ] as [string, Category[]])
    .filter(([, subs]) => subs.length > 0);
  const splitAlloc = splitDraft.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const splitRemainingVal = detail ? Math.abs(detail.amount) - splitAlloc : 0;
  const splitValid = splitDraft.filter((r) => r.categoryId !== '' && parseFloat(r.amount) > 0).length >= 2 && Math.abs(splitRemainingVal) < 0.01;
  // A split transaction renders as one row PER split (each with its own category
  // + amount + a split marker); non-split txns render as a single row.
  type DisplayRow = { t: Transaction; split?: TransactionSplit };
  // Transactions in "hidden from budget" categories are shown for visibility but
  // must not count toward the daily total (only the Transactions list displays
  // them at all). For split txns, count only the non-hidden legs.
  const excludedCatIds = new Set(categories.filter((c) => c.exclude_from_budget).map((c) => c.id));
  const dayNet = (t: Transaction): number => {
    if (t.splits && t.splits.length > 0) {
      return t.splits.reduce((s, sp) => s + (excludedCatIds.has(sp.categoryId) ? 0 : sp.amount), 0);
    }
    return t.category && excludedCatIds.has(t.category.id) ? 0 : t.amount;
  };
  const dateGroups: { date: string; rows: DisplayRow[]; net: number }[] = [];
  for (const t of transactions) {
    const rows: DisplayRow[] = (t.splits && t.splits.length > 0) ? t.splits.map((s) => ({ t, split: s })) : [{ t }];
    const last = dateGroups[dateGroups.length - 1];
    if (last && last.date === t.date) { last.rows.push(...rows); last.net += dayNet(t); }
    else dateGroups.push({ date: t.date, rows, net: dayNet(t) });
  }
  const displayRows = dateGroups.flatMap((g) => g.rows); // flat, split-expanded (mobile)
  // Visual order, one entry per transaction: a split parent renders one row per
  // leg but is a single selectable item, so ranges must not count it twice.
  const orderedTxnIds: number[] = [];
  {
    const seen = new Set<number>();
    for (const r of displayRows) if (!seen.has(r.t.id)) { seen.add(r.t.id); orderedTxnIds.push(r.t.id); }
  }

  /**
   * Row click in bulk mode. Shift extends from the anchor to the clicked row and
   * ADDS that span — anything selected before the anchor stays put, so selecting
   * 1–2, then 7, then shift-clicking 10 gives 1, 2, 7, 8, 9, 10.
   * Falls back to a plain toggle when there is no anchor, or when the anchor has
   * scrolled out of the current result set (filter or date change).
   */
  const selectRow = (id: number, shiftKey: boolean) => {
    const anchor = selectionAnchor.current;
    const from = anchor == null ? -1 : orderedTxnIds.indexOf(anchor);
    const to = orderedTxnIds.indexOf(id);
    if (!shiftKey || from < 0 || to < 0 || from === to) {
      toggleSelect(id);
      selectionAnchor.current = id;
      return;
    }
    const [lo, hi] = from < to ? [from, to] : [to, from];
    const span = orderedTxnIds.slice(lo, hi + 1);
    setSelectedIds((prev) => new Set([...prev, ...span]));
    // The far end becomes the new anchor so a further shift-click keeps extending.
    selectionAnchor.current = id;
  };

  // Fork glyph: one trunk in from the left splitting into two arrowed branches
  // (visually distinct from the toolbar Sort icon's opposed vertical arrows).
  const splitIcon = (size = 12) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h6c2.4 0 3.6-1.1 5-2.5L18 6" />
      <path d="M3 12h6c2.4 0 3.6 1.1 5 2.5L18 18" />
      <path d="M14 6h4v4" />
      <path d="M14 18h4v-4" />
    </svg>
  );

  const renderRow = (t: Transaction, split?: TransactionSplit) => {
    const checked = selectedIds.has(t.id);
    // Split sub-row: parent merchant + this split's own category + amount + marker.
    if (split) {
      const scolor = getCategoryColorHex(split.groupName);
      const sinitial = (splitVendorLabel(t, split)?.trim()?.[0] ?? '?').toUpperCase();
      const { text: sAmt, className: sClass } = fmtTransaction(split.amount, split.type);
      return (
        <div key={`${t.id}-split-${split.id}`}
          onClick={(e) => { if (bulkMode) selectRow(t.id, e.shiftKey); else if (canEdit) openDetail(t, split); }}
          className={`flex items-center gap-3.5 px-6 border-b border-line cursor-pointer hover:bg-surface-2/40 ${bulkMode ? 'select-none' : ''}`}
          style={{ height: 44, background: checked ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : undefined, boxShadow: 'inset 3px 0 0 color-mix(in srgb, var(--primary) 30%, transparent)' }}>
          {bulkMode && (
            <span className="w-5 h-5 shrink-0 rounded-[6px] flex items-center justify-center border-[1.5px]" style={{ borderColor: checked ? 'var(--primary)' : 'var(--line-strong)', background: checked ? 'var(--primary)' : 'transparent' }}>
              {checked && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>}
            </span>
          )}
          <div className="flex-[1.4] min-w-0 flex items-center gap-2.5 pl-1">
            {(split.merchant ?? t.merchant)?.logoUrl
              ? <img src={((split.merchant ?? t.merchant)?.logoUrl) as string} alt="" className="w-[26px] h-[26px] shrink-0 rounded-full object-cover" />
              : <span className="w-[26px] h-[26px] shrink-0 rounded-full flex items-center justify-center font-bold text-xs" style={{ background: `color-mix(in srgb, ${scolor} 16%, transparent)`, color: scolor }}>{sinitial}</span>}
            <span className="font-semibold text-[15px] truncate">{splitVendorLabel(t, split)}</span>
            <span className="shrink-0 inline-flex items-center justify-center w-[18px] h-[18px] rounded-md" style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }} title="Part of a split transaction">{splitIcon(11)}</span>
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2 text-[13px] text-content-2 px-2">
            <span className="text-[15px] leading-none">{getCategoryEmoji(split.subName)}</span>
            <span className="truncate">{split.subName}</span>
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2 text-[13px] text-content-3"><VendorAvatar name={t.account.name} src={t.account.logoUrl || undefined} color={t.account.color || 'var(--c-blue)'} size={18} /><span className="truncate">{accountLabel(t.account)}</span></div>
          <div className={`w-[128px] shrink-0 text-right font-bold text-[15px] tabular-nums ${sClass}`}>{sAmt}</div>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-content-3 shrink-0"><path d="m9 6 6 6-6 6"/></svg>
        </div>
      );
    }
    const catType = t.category?.type ?? t.splits?.[0]?.type ?? 'expense';
    const { text: amtText, className: amtClass } = fmtTransaction(t.amount, catType);
    const isSplit = !!(t.splits && t.splits.length > 0);
    const emoji = isSplit ? '🔀' : getCategoryEmoji(t.category?.subName ?? t.category?.groupName);
    const color = getCategoryColorHex(t.category?.groupName);
    const initial = (vendorLabel(t)?.trim()?.[0] ?? '?').toUpperCase();
    const vendorEditing = editCell?.id === t.id && editCell.field === 'vendor';
    const categoryEditing = editCell?.id === t.id && editCell.field === 'category';
    const vendorMatches = vendorOptions.filter((v) => v.toLowerCase().includes(cellSearch.toLowerCase())).slice(0, 40);
    const catMatches = categories.filter((c) => `${c.sub_name} ${c.group_name}`.toLowerCase().includes(cellSearch.toLowerCase())).slice(0, 60);
    return (
      <div key={t.id}
        onClick={(e) => { if (bulkMode) selectRow(t.id, e.shiftKey); else if (canEdit) openDetail(t); }}
        className={`flex items-center gap-3.5 px-6 border-b border-line cursor-pointer hover:bg-surface-2/40 ${bulkMode ? 'select-none' : ''}`}
        style={{ height: 44, background: checked ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : undefined }}>
        {bulkMode && (
          <span className="w-5 h-5 shrink-0 rounded-[6px] flex items-center justify-center border-[1.5px]" style={{ borderColor: checked ? 'var(--primary)' : 'var(--line-strong)', background: checked ? 'var(--primary)' : 'transparent' }}>
            {checked && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>}
          </span>
        )}
        {/* vendor cell (avatar + name), inline edit — outline encompasses the logo */}
        <div className="relative flex-[1.4] min-w-0" onClick={(e) => { if (!bulkMode && canEdit) { e.stopPropagation(); setReviewPopId(null); setEditCell({ id: t.id, field: 'vendor' }); setCellSearch(''); } }}>
          <div className={`group flex items-center gap-2.5 h-9 pl-1 pr-2 rounded-[8px] border transition-colors ${vendorEditing ? 'border-primary' : 'border-transparent hover:border-line-strong'}`}>
            {t.merchant?.logoUrl
              ? <img src={t.merchant.logoUrl} alt="" className="w-[26px] h-[26px] shrink-0 rounded-full object-cover" />
              : <span className="w-[26px] h-[26px] shrink-0 rounded-full flex items-center justify-center font-bold text-xs" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>{initial}</span>}
            <span className="font-semibold text-[15px] truncate flex-1">{vendorLabel(t)}</span>
            {canEdit && !bulkMode && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className={`shrink-0 transition-opacity ${vendorEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}><path d="m6 9 6 6 6-6"/></svg>}
          </div>
          {vendorEditing && (
            <div onClick={(e) => e.stopPropagation()} className="absolute top-9 left-0 z-[60] w-64 bg-elevated border border-line-strong rounded-[12px] shadow-md overflow-hidden">
              <div className="p-2 border-b border-line"><input autoFocus value={cellSearch} onChange={(e) => setCellSearch(e.target.value)} placeholder="Search merchants…" className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-line text-content text-sm outline-none" /></div>
              <div className="max-h-60 overflow-y-auto p-1.5">
                {cellSearch.trim() && !vendorMatches.some((v) => v.toLowerCase() === cellSearch.trim().toLowerCase()) && (
                  <button onClick={() => updateTxnField(t, { merchant: cellSearch.trim() })} className="block w-full text-left px-3 py-2 rounded-lg text-sm text-primary font-medium hover:bg-surface-2">Create “{cellSearch.trim()}”</button>
                )}
                {vendorMatches.map((v) => (
                  <button key={v} onClick={() => updateTxnField(t, { merchant: v })} className="block w-full text-left px-3 py-2 rounded-lg text-sm text-content hover:bg-surface-2 truncate">{v}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* category cell (inline edit; disabled for splits) */}
        <div className="relative flex-1 min-w-0" onClick={(e) => { if (!bulkMode && !isSplit && canEdit) { e.stopPropagation(); setReviewPopId(null); setEditCell({ id: t.id, field: 'category' }); setCellSearch(''); } }}>
          <div className={`group flex items-center gap-2 h-9 px-2 rounded-[8px] border transition-colors text-[13px] text-content-2 ${categoryEditing ? 'border-primary' : isSplit ? 'border-transparent' : 'border-transparent hover:border-line-strong'}`}>
            <span className="text-[15px] leading-none">{emoji}</span>
            <span className="truncate flex-1">{isSplit ? `Split (${t.splits!.length})` : (t.category?.subName ?? 'Uncategorized')}</span>
            {t.needsReview && !isSplit && (
              canEdit && !bulkMode
                ? <NeedsReviewBadge onClick={() => { setEditCell(null); setReviewPopId((id) => (id === t.id ? null : t.id)); }} />
                : <NeedsReviewBadge />
            )}
            {canEdit && !bulkMode && !isSplit && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className={`shrink-0 transition-opacity ${categoryEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}><path d="m6 9 6 6 6-6"/></svg>}
          </div>
          {reviewPopId === t.id && (
            <div onClick={(e) => e.stopPropagation()} className="absolute top-9 right-0 z-[60] w-[248px] bg-elevated border border-line-strong rounded-[12px] shadow-md p-3">
              <div className="text-[13px] font-bold text-content">Needs review</div>
              <p className="text-[12px] text-content-3 leading-snug mt-1 mb-2.5">{NEEDS_REVIEW_HINT}</p>
              <button onClick={() => { setReviewPopId(null); void markReviewedById(t.id); }}
                className="w-full h-9 rounded-[10px] bg-primary text-on-primary font-bold text-[13px] border-none cursor-pointer">
                Mark reviewed
              </button>
              <button onClick={() => { setReviewPopId(null); openDetail(t); }}
                className="w-full h-8 mt-1.5 rounded-[10px] bg-transparent text-content-2 font-semibold text-[12px] border-none cursor-pointer hover:bg-surface-2">
                Open details
              </button>
            </div>
          )}
          {categoryEditing && (
            <div onClick={(e) => e.stopPropagation()} className="absolute top-9 left-0 z-[60] w-64 bg-elevated border border-line-strong rounded-[12px] shadow-md overflow-hidden">
              <div className="p-2 border-b border-line"><input autoFocus value={cellSearch} onChange={(e) => setCellSearch(e.target.value)} placeholder="Search categories…" className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-line text-content text-sm outline-none" /></div>
              <div className="max-h-60 overflow-y-auto p-1.5">
                {catMatches.map((c) => (
                  <button key={c.id} onClick={() => updateTxnField(t, { categoryId: c.id })} className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-sm text-content hover:bg-surface-2">
                    <span className="text-[15px] leading-none">{getCategoryEmoji(c.sub_name)}</span>
                    <span className="truncate">{c.sub_name}</span>
                    <span className="ml-auto text-xs text-content-3 truncate">{c.group_name}</span>
                  </button>
                ))}
                {catMatches.length === 0 && <div className="px-3 py-2 text-sm text-content-3">No matches</div>}
              </div>
            </div>
          )}
        </div>
        {/* account — a linked transfer reads as one movement: from → to */}
        <div className="flex-1 min-w-0 flex items-center gap-2 text-[13px] text-content-3">
          <VendorAvatar name={t.account.name} src={t.account.logoUrl || undefined} color={t.account.color || 'var(--c-blue)'} size={18} />
          {t.transfer ? (
            <span className="truncate flex items-center gap-1.5" title={`${accountLabel(t.account)} → ${accountLabel(t.transfer.toAccount)}`}>
              <span className="truncate">{accountLabel(t.account)}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              <span className="truncate">{accountLabel(t.transfer.toAccount)}</span>
            </span>
          ) : (
            <span className="truncate flex items-center gap-1.5">
              {/* An unpaired transfer leg still has to say which way the money went —
                  the amount column renders transfers as a bare magnitude. */}
              {t.category?.type === 'transfer' && (
                <span title={t.amount > 0 ? 'Money out' : 'Money in'} className="shrink-0 leading-none" style={{ color: 'var(--text-3)' }}>
                  {t.amount > 0
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M17 7L7 17M15 17H7V9" /></svg>}
                </span>
              )}
              <span className="truncate">{accountLabel(t.account)}</span>
            </span>
          )}
        </div>
        {/* amount */}
        <div className={`w-[128px] shrink-0 text-right font-bold text-[15px] tabular-nums ${amtClass}`}>{amtText}</div>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-content-3 shrink-0"><path d="m9 6 6 6-6 6"/></svg>
      </div>
    );
  };

  return (
    <div>
      {/* Learn-a-rule prompt after recategorizing a merchant */}
      {ruleSuggest && (
        <div className="fixed left-1/2 bottom-7 z-[100] flex items-center gap-3 rounded-full bg-elevated px-4 py-2.5 shadow-md" style={{ transform: 'translateX(-50%)', border: '2px solid var(--primary)', maxWidth: 'calc(100vw - 48px)' }}>
          <span className="text-sm text-content">Always categorize <span className="font-bold">{ruleSuggest.merchantName}</span> as <span className="font-bold">{ruleSuggest.categoryName}</span>?</span>
          <button onClick={applyMerchantRule} className="h-9 px-4 rounded-[10px] bg-primary text-on-primary font-bold text-sm shadow-sm shrink-0">Always</button>
          <button onClick={() => setRuleSuggest(null)} className="h-9 px-3 rounded-[10px] text-content-2 font-semibold text-sm hover:bg-surface-2 shrink-0">Not now</button>
          <button onClick={muteMerchantRule} title={`Stop asking about ${ruleSuggest.merchantName}`}
            className="h-9 px-3 rounded-[10px] text-content-3 font-semibold text-sm hover:bg-surface-2 shrink-0">Never</button>
        </div>
      )}
      {/* Header + consolidated top-right controls */}
      <div ref={pageHeaderRef} className="sticky top-0 z-20 -mt-4 md:-mt-7 -mx-4 md:-mx-8 px-4 md:px-8 py-4 mb-6 bg-bg border-b border-line flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-6">
          <h1 className="page-title text-[22px] font-extrabold text-content tracking-tight leading-tight m-0">Transactions</h1>
          <div className="hidden md:flex items-center gap-5 text-[15px] font-semibold">
            <span className="text-primary border-b-2 border-primary pb-0.5">All</span>
            <Link to="/recurring" className="text-content-3 hover:text-content pb-0.5">Recurring</Link>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Needs-review nudge — jumps to the needs-review filter */}
          {reviewCount > 0 && (
            <Link
              to="/reviews"
              className="flex items-center gap-1.5 h-10 px-3 rounded-[11px] font-semibold text-sm"
              style={{ background: 'color-mix(in srgb, var(--warning) 16%, transparent)', color: 'var(--warning)' }}
              title="Open the Review queue"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
              {reviewCount} to review
            </Link>
          )}
          {/* Clear all — shows whenever any filter/search/date is active */}
          {anyActive && (
            <button onClick={clearAll} className="h-10 px-2.5 text-primary hover:text-primary-hover font-semibold text-sm">
              Clear
            </button>
          )}
          {/* Search */}
          {searchOpen ? (
            <div className="flex items-center h-10 rounded-[11px] bg-surface border border-line-strong px-3 gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-content-3"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" autoCapitalize="off"
                onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setSearchOpen(false); } }}
                className="w-44 bg-transparent outline-none text-sm text-content" />
              <button onClick={() => { setSearch(''); setSearchOpen(false); }} className="text-content-3 hover:text-content"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
            </div>
          ) : (
            <button onClick={() => setSearchOpen(true)} title="Search"
              className={`w-10 h-10 flex items-center justify-center rounded-[11px] bg-surface border ${search ? 'border-primary' : 'border-line-strong'} text-content-2 hover:bg-surface-2`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            </button>
          )}
          {/* Date range overlay (shared DateRangePopover) */}
          <DateRangePopover
            presets={DATE_PRESETS.filter((p) => p.value !== 'custom')}
            value={{ preset: datePreset, start: customStart, end: customEnd }}
            label={dateLabel}
            active={datePreset !== 'all'}
            clearValue={{ preset: 'all', start: '', end: '' }}
            onOpen={() => { setSortOpen(false); setFilterOpen(false); setSearchOpen(false); }}
            onApply={(v) => { setDatePreset(v.preset); setCustomStart(v.start); setCustomEnd(v.end); }}
          />
          {/* Filters overlay (design system) */}
          <div className="relative">
            <button onClick={openFilterPopover}
              className={`flex items-center gap-2 h-10 px-3.5 rounded-[11px] bg-surface border-2 ${filterOpen || filterCount ? 'border-primary' : 'border-line-strong'} text-content font-semibold text-sm hover:bg-surface-2`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
              Filters
              {filterCount > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center">{filterCount}</span>}
            </button>
            {filterOpen && (
              <FilterPopover
                draft={filterDraft} setDraft={setFilterDraft}
                categoryGroups={categoryGroups} accounts={accounts} merchants={merchants} categories={categories}
                search={filterSearch} setSearch={setFilterSearch} tab={filterTab} setTab={setFilterTab}
                onClear={clearFilters} onCancel={() => setFilterOpen(false)} onApply={applyFilters}
                showNeedsReview
              />
            )}
          </div>
          {/* Sort */}
          <div className="relative">
            <button onClick={() => { setSortOpen((o) => !o); setFilterOpen(false); }}
              className={`flex items-center gap-2 h-10 px-3.5 rounded-[11px] bg-surface border ${sortTouched ? 'border-primary' : 'border-line-strong'} text-content font-semibold text-sm hover:bg-surface-2`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>
              {sortLabel}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute top-12 right-0 z-50 w-60 bg-elevated border border-line-strong rounded-[12px] shadow-md p-1.5">
                  {SORT_OPTIONS.map((o) => {
                    const active = sortTouched && o.by === sortBy && o.order === sortOrder;
                    return (
                      <button key={o.label} onClick={() => applySort(o.by, o.order)} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-content hover:bg-surface-2">
                        <span className="w-4 flex justify-center">{active && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>}</span>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {/* Manual Import — on-demand SimpleFIN pull for a date range */}
          <PermissionGate permission="import.bank_sync">
            <button onClick={() => setImportOpen(true)} title="Pull transactions from your bank for a date range"
              className="flex items-center gap-2 h-10 px-3.5 rounded-[11px] bg-surface border border-line-strong text-content font-semibold text-sm hover:bg-surface-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
              Manual Import
            </button>
          </PermissionGate>
          {/* Add (desktop — phones use the floating button) */}
          <PermissionGate permission="transactions.create" fallback="disabled">
            <button onClick={() => setEditing('new')}
              className="desktop-only flex items-center gap-2 h-10 px-4 rounded-[11px] bg-primary text-on-primary font-bold text-sm shadow-sm hover:bg-primary-hover">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Add
            </button>
          </PermissionGate>
        </div>
      </div>

      {isMobile ? (
        /* Mobile: one card of 64px rows (same anatomy as the desktop list) */
        <div className="bg-surface rounded-card border border-line shadow-sm overflow-hidden">
          {displayRows.map(({ t, split }, idx) => {
            const catType = split ? split.type : (t.category?.type ?? t.splits?.[0]?.type ?? 'expense');
            const { text: amtText, className: amtClass } = fmtTransaction(split ? split.amount : t.amount, catType);
            const label = split ? splitVendorLabel(t, split) : vendorLabel(t);
            const catName = split ? split.subName : t.category?.subName;
            const catGroup = split ? split.groupName : t.category?.groupName;
            return (
              <div key={split ? `${t.id}-split-${split.id}` : t.id}
                onClick={() => { if (hasPermission('transactions.edit')) openDetail(t, split); }}
                className={`flex items-center gap-3 px-4 h-16 ${idx > 0 ? 'border-t border-line' : ''} ${hasPermission('transactions.edit') ? 'cursor-pointer active:bg-surface-2' : ''}`}>
                <VendorAvatar name={label} src={t.merchant?.logoUrl || undefined} color={catGroup ? getCategoryColorHex(catGroup) : 'var(--c-blue)'} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[15px] font-semibold text-content truncate">{label}</span>
                    {split && <span className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-md" style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }} title="Part of a split transaction">{splitIcon(10)}</span>}
                    {t.needsReview && !split && <NeedsReviewBadge />}
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px] text-content-3 min-w-0">
                    {catName && (
                      <span className="inline-flex items-center gap-1 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: catGroup ? getCategoryColorHex(catGroup) : 'var(--text-3)' }} />
                        <span className="truncate">{catName}</span>
                      </span>
                    )}
                    <span className="font-mono shrink-0">{shortDate(t.date)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[15px] font-bold tabular-nums ${amtClass}`}>{amtText}</div>
                  <div className="font-mono text-[11px] text-content-3 mt-0.5 max-w-[120px] truncate">{accountLabel(t.account)}</div>
                </div>
              </div>
            );
          })}
          {transactions.length === 0 && (
            <p className="text-center py-10 text-content-3 text-sm m-0">No transactions found for this period</p>
          )}
        </div>
      ) : (
      <div className="bg-surface rounded-card border border-line shadow-sm">
        {/* 1px sentinel: drives the sticky toolbar's separator (see the observer above) */}
        <div ref={toolbarSentinelRef} aria-hidden className="h-px -mb-px" />
        {/* card toolbar — pinned under the page header so "Edit multiple" and the
            selection controls stay reachable however far the list is scrolled */}
        <div
          className={`sticky z-10 bg-surface rounded-t-card ${toolbarStuck ? 'border-b border-line' : ''}`}
          style={{ top: headerH }}
        >
        {!bulkMode ? (
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <span className="text-[15px] font-bold tabular-nums">{total.toLocaleString()} transactions</span>
            <div className="flex items-center gap-2.5">
              <PermissionGate permission="transactions.bulk_edit" fallback="hidden">
                <button onClick={() => setBulkMode(true)} className="flex items-center gap-2 h-10 px-4 rounded-[11px] bg-surface-2 border border-line text-content font-semibold text-sm hover:bg-surface">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>
                  Edit multiple
                </button>
              </PermissionGate>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-3">
              <button onClick={toggleSelectAll} className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center border-[1.5px]" style={{ borderColor: selectedIds.size ? 'var(--primary)' : 'var(--line-strong)', background: selectedIds.size ? 'var(--primary)' : 'transparent' }}>
                {selectedIds.size > 0 && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M5 12h14"/></svg>}
              </button>
              <span className="text-base font-bold">{selectedIds.size} selected</span>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-content-3">·</span>
                  {/* Same convention as the date-group net: money in reads as +$X. */}
                  <span className="font-mono text-[15px] font-bold tabular-nums"
                    style={{ color: selectedTotal < 0 ? 'var(--positive)' : 'var(--text)' }}>
                    {selectedTotal < 0 ? `+${fmt(Math.abs(selectedTotal))}` : fmt(selectedTotal)}
                  </span>
                </>
              )}
              <span className="text-[13px] text-content-3">(ESC)</span>
            </div>
            <div className="flex items-center gap-2.5">
              <button onClick={exitBulkMode} className="h-10 px-4 rounded-[11px] bg-surface-2 border border-line-strong text-content font-semibold text-sm">Cancel</button>
              <button onClick={openBulkEdit} disabled={selectedIds.size === 0}
                className="flex items-center gap-2 h-10 px-4 rounded-[11px] bg-primary text-on-primary font-bold text-sm shadow-sm disabled:opacity-50">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                Edit {selectedIds.size}
              </button>
              <button onClick={deleteSelected} disabled={selectedIds.size === 0}
                className="h-10 px-4 rounded-[11px] font-bold text-sm disabled:opacity-50"
                style={bulkConfirmDelete
                  ? { background: 'var(--negative)', color: '#fff' }
                  : { color: 'var(--negative)', background: 'color-mix(in srgb, var(--negative) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--negative) 40%, transparent)' }}>
                {bulkConfirmDelete ? 'Confirm delete?' : 'Delete selected'}
              </button>
            </div>
          </div>
        )}
        </div>
        {/* date-grouped rows */}
        {dateGroups.map((g) => (
          <div key={g.date}>
            <div className="flex items-center justify-between px-6 py-2.5 bg-surface-2 border-t border-b border-line">
              <span className="text-[13px] font-semibold text-content-2">{formatDateHeader(g.date)}</span>
              <span className="font-mono text-xs tabular-nums" style={{ color: g.net < 0 ? 'var(--positive)' : 'var(--text-3)' }}>{g.net < 0 ? `+${fmt(Math.abs(g.net))}` : fmt(g.net)}</span>
            </div>
            {g.rows.map((r) => renderRow(r.t, r.split))}
          </div>
        ))}
        {transactions.length === 0 && <div className="text-center py-10 text-content-3 text-sm">No transactions found for this period</div>}
      </div>
      )}
      {(editCell || reviewPopId != null) && <div className="fixed inset-0 z-[55]" onClick={() => { setEditCell(null); setCellSearch(''); setReviewPopId(null); }} />}

      {/* ===== Bulk-edit sidebar (multi-select) ===== */}
      {bulkEditOpen && (
        <>
          <div onClick={() => setBulkEditOpen(false)} className="fixed inset-0 z-[70]" style={{ background: 'var(--bg-modal)' }} />
          <div className="fixed top-0 right-0 bottom-0 z-[71] w-[440px] max-w-full bg-surface border-l border-line-strong shadow-md flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <div>
                <div className="text-lg font-extrabold tracking-tight">Edit transactions</div>
                <div className="text-[13px] text-content-3">{selectedIds.size} selected</div>
              </div>
              <button onClick={() => setBulkEditOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-[9px] text-content-2 hover:bg-surface-2"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
              <p className="text-[13px] text-content-3 -mt-2">Set any of the fields below. Changes apply to all {selectedIds.size} selected transactions.</p>
              {/* Merchant */}
              <div>
                <div className="text-[13px] font-semibold text-content-2 mb-2">Merchant</div>
                <MerchantPicker value={bulkMerchant} merchants={merchants} onSelect={setBulkMerchant} allowClear
                  placeholder="Choose a merchant…"
                  triggerClassName="w-full h-11 px-3.5 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none" />
              </div>
              {/* Category */}
              <div>
                <div className="text-[13px] font-semibold text-content-2 mb-2">Category</div>
                <div className="relative">
                  <select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value ? parseInt(e.target.value) : '')} className="w-full h-11 pl-3.5 pr-9 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none appearance-none cursor-pointer">
                    <option value="">Choose category…</option>
                    {groupedAll.map(([group, subs]) => <optgroup key={group} label={group}>{subs.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}</optgroup>)}
                  </select>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="absolute right-3 top-3.5 pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
              {/* Date */}
              <div>
                <div className="text-[13px] font-semibold text-content-2 mb-2">Date</div>
                <div className="relative">
                  <button type="button" onClick={() => setBulkCalOpen((o) => !o)} className="w-full flex items-center justify-between h-11 px-3.5 rounded-[11px] bg-surface-2 border border-line text-sm"
                    style={{ borderColor: bulkCalOpen ? 'var(--primary)' : 'var(--line)' }}>
                    <span className={bulkDate ? 'text-content tabular-nums' : 'text-content-3'}>{bulkDate ? new Date(bulkDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : 'Choose date…'}</span>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>
                  </button>
                  {bulkCalOpen && (
                    <div className="absolute top-12 left-0 z-[60] w-[320px] bg-elevated border border-line-strong rounded-[14px] shadow-md p-3">
                      <Calendar value={bulkDate} onChange={(d) => { setBulkDate(d); setBulkCalOpen(false); }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-6 py-4 border-t border-line">
              <button onClick={() => setBulkEditOpen(false)} className="flex-1 h-11 rounded-[11px] bg-surface-2 border border-line-strong text-content font-semibold text-sm">Cancel</button>
              <button onClick={applyBulkEdit} disabled={!(bulkMerchant.trim() || bulkCategoryId || bulkDate)} className="flex-1 h-11 rounded-[11px] bg-primary text-on-primary font-bold text-sm shadow-sm disabled:opacity-50">Apply changes</button>
            </div>
          </div>
        </>
      )}

      {/* ===== Detail side panel ===== */}
      {detail && (
        <>
          <div onClick={closeDetail} className="fixed inset-0 z-[70]" style={{ background: 'var(--bg-modal)' }} />
          <div className="fixed top-0 right-0 bottom-0 z-[71] w-[440px] max-w-full bg-surface border-l border-line-strong shadow-md flex flex-col">
            <div className="flex items-center justify-between gap-1.5 px-5 py-3 border-b border-line">
              <span className="text-[15px] font-extrabold tracking-tight">Transaction</span>
              <button onClick={closeDetail} className="w-9 h-9 flex items-center justify-center rounded-[9px] text-content-2 hover:bg-surface-2"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {(() => {
                const catType = detail.category?.type ?? detail.splits?.[0]?.type ?? 'expense';
                const { text: amtText, className: amtClass } = fmtTransaction(detail.amount, catType);
                const color = getCategoryColorHex(detail.category?.groupName);
                const initial = (vendorLabel(detail)?.trim()?.[0] ?? '?').toUpperCase();
                const isSplit = !!(detail.splits && detail.splits.length > 0);
                const fieldCls = 'w-full h-12 px-3.5 rounded-[11px] bg-surface-2 border border-line text-content text-[15px] outline-none';
                const labelCls = 'text-[13px] font-semibold text-content-2 mb-2';
                // Click-to-edit header amount: seeded on click, committed on blur/Enter,
                // Escape cancels (amountCancelled skips the commit on the ensuing blur).
                const commitAmount = () => {
                  setAmountEditing(false);
                  if (amountCancelled.current) { amountCancelled.current = false; return; }
                  if (isSplit) return;
                  const entered = parseFloat(detailAmount);
                  if (isNaN(entered) || entered === parseFloat(displayAmount(detail))) return;
                  updateTxnField(detail, { amount: entered });
                };
                const statementText = detail.bankDescription ?? detail.description;
                const copyStatement = () => {
                  navigator.clipboard.writeText(statementText ?? '')
                    .then(() => addToast('Statement copied'))
                    .catch(() => addToast('Copy failed', 'error'));
                };
                const copyGlyph = (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                );

                // ===== Split-CHILD view: one leg opened as its own transaction =====
                const activeSplit = detailSplitId != null ? (detail.splits?.find((s) => s.id === detailSplitId) ?? null) : null;
                if (activeSplit) {
                  const scolor = getCategoryColorHex(activeSplit.groupName);
                  const { text: sAmt, className: sClass } = fmtTransaction(activeSplit.amount, activeSplit.type);
                  const sLabel = splitVendorLabel(detail, activeSplit);
                  const sInitial = (sLabel?.trim()?.[0] ?? '?').toUpperCase();
                  const childDir: 'income' | 'expense' = activeSplit.type === 'income' ? 'income' : 'expense';
                  // Same-direction categories only (+ always keep the current one), so a
                  // PATCH can't leave the leg's sign contradicting its category.
                  const childGroups = groupedAll
                    .map(([g, subs]) => [g, subs.filter((c) => c.type !== 'transfer' && ((childDir === 'income' ? c.type === 'income' : c.type !== 'income') || c.id === activeSplit.categoryId))] as [string, Category[]])
                    .filter(([, subs]) => subs.length > 0);
                  const mSeed = legMerchantSeed(detail, activeSplit);
                  const commitSplitNote = () => { splitFieldFocused.current = null; if ((activeSplit.note ?? '') !== detailSplitNote) patchSplitField({ note: detailSplitNote }); };
                  const roCls = `${fieldCls} mb-6 flex items-center text-content-2`;
                  const dateLabel = new Date(detail.date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                  return (
                    <>
                      <div className="flex items-start justify-between gap-4 mb-6">
                        {(activeSplit.merchant ?? detail.merchant)?.logoUrl
                          ? <img src={((activeSplit.merchant ?? detail.merchant)?.logoUrl) as string} alt="" className="shrink-0 rounded-full object-cover" style={{ width: 52, height: 52 }} />
                          : <span className="shrink-0 rounded-full flex items-center justify-center font-bold text-xl" style={{ width: 52, height: 52, background: `color-mix(in srgb, ${scolor} 16%, transparent)`, color: scolor }}>{sInitial}</span>}
                        <div className="min-w-0 text-right">
                          <div className={`text-[28px] font-extrabold tracking-tight tabular-nums leading-none ${sClass}`}>{sAmt}</div>
                          <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[12px] text-content-3">
                            <VendorAvatar name={detail.account.name} src={detail.account.logoUrl || undefined} color={detail.account.color || 'var(--c-blue)'} size={16} />
                            <span className="truncate">{accountLabel(detail.account)}</span>
                          </div>
                        </div>
                      </div>

                      {/* This-is-a-split callout */}
                      <div className="mb-6 rounded-[12px] border p-4 flex items-start gap-3" style={{ borderColor: 'color-mix(in srgb, var(--primary) 30%, var(--line))', background: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}>
                        <span className="shrink-0 mt-0.5" style={{ color: 'var(--primary)' }}>{splitIcon(16)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-content-2 leading-snug">
                            This is a split of <span className="font-bold text-content">{fmt(Math.abs(detail.amount))}</span> from <span className="font-bold text-content">{vendorLabel(detail)}</span> on {dateLabel}.
                          </div>
                          <button onClick={openSplit} className="mt-2.5 h-9 px-3.5 rounded-[9px] bg-primary text-on-primary font-bold text-[13px] shadow-sm">Open splits</button>
                        </div>
                      </div>

                      <div className={labelCls}>Statement <span className="font-normal text-content-3">(from original)</span></div>
                      <div className="mb-6 flex items-start gap-2">
                        <span className="flex-1 text-[13px] text-content-2 leading-snug break-words">{statementText || '—'}</span>
                        <button onClick={copyStatement} title="Copy statement"
                          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-[8px] text-content-3 hover:bg-surface-2 hover:text-content">
                          {copyGlyph}
                        </button>
                      </div>

                      <div className={labelCls}>Merchant</div>
                      <div className="mb-6">
                        <MerchantPicker value={mSeed} merchants={merchants} allowClear
                          onSelect={(name) => { if (name !== mSeed) patchSplitField({ merchant: name }); }}
                          triggerClassName={`${fieldCls} font-semibold`} />
                      </div>

                      <div className={labelCls}>Category</div>
                      <div className="relative mb-6">
                        <select value={activeSplit.categoryId} onChange={(e) => e.target.value && patchSplitField({ categoryId: parseInt(e.target.value) })}
                          className="w-full h-12 pl-3.5 pr-9 rounded-[11px] bg-surface-2 border border-line text-content text-[15px] outline-none appearance-none cursor-pointer">
                          {childGroups.map(([group, subs]) => (
                            <optgroup key={group} label={group}>{subs.map((c) => <option key={c.id} value={c.id}>{getCategoryEmoji(c.sub_name)} {c.sub_name}</option>)}</optgroup>
                          ))}
                        </select>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="absolute right-3 top-4 pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
                      </div>

                      <div className={labelCls}>Date <span className="font-normal text-content-3">(from original)</span></div>
                      <div className={`${roCls} tabular-nums`}>{dateLabel}</div>

                      <div className={labelCls}>Notes</div>
                      <textarea value={detailSplitNote} onChange={(e) => setDetailSplitNote(e.target.value)} onFocus={() => { splitFieldFocused.current = 'note'; }} onBlur={commitSplitNote}
                        placeholder="Add notes to this split…"
                        className="w-full min-h-[76px] resize-y p-3 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none mb-2" />
                    </>
                  );
                }

                return (
                  <>
                    <div className="flex items-start justify-between gap-4 mb-6">
                      {detail.merchant?.logoUrl
                        ? <img src={detail.merchant.logoUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: 52, height: 52 }} />
                        : <span className="shrink-0 rounded-full flex items-center justify-center font-bold text-xl" style={{ width: 52, height: 52, background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>{initial}</span>}
                      <div className="min-w-0 text-right">
                        {!isSplit && canEdit && amountEditing ? (
                          <CurrencyInput allowNegative autoFocus value={detailAmount} onChange={setDetailAmount} onBlur={commitAmount}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                              else if (e.key === 'Escape') { amountCancelled.current = true; e.currentTarget.blur(); }
                            }}
                            className="w-44 h-11 px-3 rounded-[11px] bg-surface-2 border border-primary text-content text-[22px] font-extrabold tabular-nums text-right outline-none" />
                        ) : (
                          <div
                            className={`text-[28px] font-extrabold tracking-tight tabular-nums leading-none ${amtClass} ${!isSplit && canEdit ? 'cursor-pointer hover:opacity-80' : ''}`}
                            title={!isSplit && canEdit ? 'Click to edit amount' : undefined}
                            onClick={() => { if (!isSplit && canEdit) { setDetailAmount(displayAmount(detail)); amountCancelled.current = false; setAmountEditing(true); } }}>
                            {amtText}
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[12px] text-content-3">
                          <VendorAvatar name={detail.account.name} src={detail.account.logoUrl || undefined} color={detail.account.color || 'var(--c-blue)'} size={16} />
                          <span className="truncate">{accountLabel(detail.account)}</span>
                        </div>
                      </div>
                    </div>

                    <div className={labelCls}>Statement</div>
                    <div className="mb-6 flex items-start gap-2">
                      <span className="flex-1 text-[13px] text-content-2 leading-snug break-words">{statementText || '—'}</span>
                      <button onClick={copyStatement} title="Copy statement"
                        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-[8px] text-content-3 hover:bg-surface-2 hover:text-content">
                        {copyGlyph}
                      </button>
                    </div>

                    <div className={labelCls}>Merchant</div>
                    <div className="mb-6">
                      <MerchantPicker value={vendorLabel(detail)} merchants={merchants}
                        onSelect={(name) => { if (name && name !== vendorLabel(detail)) updateTxnField(detail, { merchant: name }); }}
                        triggerClassName={`${fieldCls} font-semibold`} />
                    </div>

                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-semibold text-content-2">Category</span>
                      {!isSplit && <button onClick={openSplit} className="text-[13px] font-semibold text-primary inline-flex items-center gap-1.5">{splitIcon(13)}Split</button>}
                    </div>
                    {isSplit ? (
                      <div className="mb-6 rounded-[12px] border p-4" style={{ borderColor: 'color-mix(in srgb, var(--primary) 30%, var(--line))', background: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}>
                        <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--primary)' }}>
                          {splitIcon(15)}
                          <span className="text-[13px] font-bold">Split across {detail.splits!.length} categories</span>
                        </div>
                        <div className="flex flex-col gap-1 mb-3.5">
                          {detail.splits!.map((s) => {
                            const { text, className } = fmtTransaction(s.amount, s.type);
                            return (
                              <button key={s.id} onClick={() => openDetail(detail, s)}
                                className="flex items-center gap-2 text-sm text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-surface-2">
                                <span className="text-[15px] leading-none">{getCategoryEmoji(s.subName)}</span>
                                <span className="flex-1 truncate text-content">{splitVendorLabel(detail, s)} · {s.subName}</span>
                                <span className={`tabular-nums font-semibold ${className}`}>{text}</span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-content-3 shrink-0"><path d="m9 6 6 6-6 6"/></svg>
                              </button>
                            );
                          })}
                        </div>
                        <button onClick={openSplit} className="w-full h-10 rounded-[10px] bg-primary text-on-primary font-bold text-sm shadow-sm">Open splits</button>
                      </div>
                    ) : (
                      <div className="relative mb-6">
                        <select value={detail.category?.id ?? ''} onChange={(e) => e.target.value && updateTxnField(detail, { categoryId: parseInt(e.target.value) })}
                          className="w-full h-12 pl-3.5 pr-9 rounded-[11px] bg-surface-2 border border-line text-content text-[15px] outline-none appearance-none cursor-pointer">
                          <option value="">🏷️ Uncategorized</option>
                          {groupedAll.map(([group, subs]) => (
                            <optgroup key={group} label={group}>
                              {subs.map((c) => <option key={c.id} value={c.id}>{getCategoryEmoji(c.sub_name)} {c.sub_name}</option>)}
                            </optgroup>
                          ))}
                        </select>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="absolute right-3 top-4 pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                    )}

                    <div className={labelCls}>Date</div>
                    <div className="relative mb-6">
                      <button type="button" onClick={() => setDetailCalOpen((o) => !o)}
                        className={`${fieldCls} flex items-center justify-between cursor-pointer`}
                        style={{ borderColor: detailCalOpen ? 'var(--primary)' : undefined }}>
                        <span className="tabular-nums">{new Date(detail.date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>
                      </button>
                      {detailCalOpen && (
                        <>
                          <div className="fixed inset-0 z-[74]" onClick={() => setDetailCalOpen(false)} />
                          <div className="absolute top-[52px] left-0 z-[75] w-[320px] bg-elevated border border-line-strong rounded-[14px] shadow-md p-3">
                            <Calendar value={detail.date} onChange={(d) => { updateTxnField(detail, { date: d }); setDetailCalOpen(false); }} />
                          </div>
                        </>
                      )}
                    </div>

                    {detail.transfer && (
                      <div className="mb-8">
                        <div className={labelCls}>Transfer</div>
                        <div className="rounded-[11px] border border-line p-3 bg-surface-2">
                          <div className="flex items-center gap-2 text-[13px] text-content mb-1.5">
                            <span className="truncate font-semibold">{accountLabel(detail.account)}</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                            <span className="truncate font-semibold">{accountLabel(detail.transfer.toAccount)}</span>
                          </div>
                          <p className="text-[12px] text-content-3 m-0">
                            Shown as one transaction. The receiving row posted {detail.transfer.toDate}
                            {detail.transfer.linkedBy === 'auto' ? ' · matched automatically' : ' · linked by hand'}.
                          </p>
                          {canEdit && (
                            <button onClick={() => unlinkTransfer(detail.id)}
                              className="mt-2.5 h-8 px-3 rounded-[9px] border border-line-strong bg-surface text-content-2 font-semibold text-[12.5px] cursor-pointer hover:text-content">
                              Unlink — show as two transactions
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className={labelCls}>Notes</div>
                    <textarea value={detailNote} onChange={(e) => setDetailNote(e.target.value)}
                      onBlur={() => { if ((detail.note ?? '') !== detailNote) updateTxnField(detail, { note: detailNote }); }}
                      placeholder="Add notes to this transaction…"
                      className="w-full min-h-[76px] resize-y p-3 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none mb-8" />

                    {/* Review task */}
                    {canEdit && (
                      <div className="mb-8">
                        <div className={labelCls}>Review</div>
                        {detail.needsReview ? (
                          <div className="rounded-[11px] border p-3" style={{ borderColor: 'color-mix(in srgb, var(--warning) 45%, var(--line))', background: 'color-mix(in srgb, var(--warning) 8%, transparent)' }}>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <span className="text-[13px] font-semibold" style={{ color: 'var(--warning)' }}>
                                {detail.review?.reason === 'auto_uncategorized' ? 'Uncategorized on import'
                                  : detail.review?.reason === 'auto_low_confidence' ? 'Low-confidence auto-category'
                                  : 'Flagged for review'}
                              </span>
                              <button onClick={markReviewed} className="h-8 px-3 rounded-lg bg-primary text-on-primary font-bold text-[13px] shrink-0">Mark reviewed</button>
                            </div>
                            <div className="text-[12px] font-semibold text-content-3 mb-1">Assign to</div>
                            <select value={detail.review?.assignee?.id ?? ''} onChange={(e) => e.target.value && patchReview({ assigneeId: parseInt(e.target.value, 10) })}
                              className="w-full h-10 px-3 rounded-[10px] bg-surface-2 border border-line text-content text-sm outline-none mb-3">
                              {!detail.review?.assignee && <option value="" disabled>Select assignee…</option>}
                              {householdUsers.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
                            </select>
                            <div className="text-[12px] font-semibold text-content-3 mb-1">Review note</div>
                            <textarea value={detailReviewNote} onChange={(e) => setDetailReviewNote(e.target.value)}
                              onBlur={() => { if ((detail.review?.note ?? '') !== detailReviewNote) patchReview({ note: detailReviewNote }); }}
                              placeholder="Why does this need review? What should happen?"
                              className="w-full min-h-[60px] resize-y p-3 rounded-[10px] bg-surface-2 border border-line text-content text-sm outline-none" />
                          </div>
                        ) : (
                          <button onClick={flagForReview} className="w-full h-11 rounded-[11px] border border-line-strong bg-surface-2 text-content font-semibold text-sm hover:bg-surface">
                            Flag for review
                          </button>
                        )}
                      </div>
                    )}

                    {canEdit && (
                      <ConfirmDeleteButton variant="block" onConfirm={deleteFromDetail}
                        label="Delete transaction" confirmLabel="Delete permanently?" />
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* ===== Split modal ===== */}
      {splitOpen && detail && (() => {
        const absTotal = Math.abs(detail.amount);
        const balanced = Math.abs(splitRemainingVal) < 0.01;
        const isExistingSplit = !!(detail.splits && detail.splits.length > 0);
        const oColor = getCategoryColorHex(detail.category?.groupName);
        const oInitial = (vendorLabel(detail)?.trim()?.[0] ?? '?').toUpperCase();
        const pctOf = (amt: string) => {
          const a = parseFloat(amt);
          if (!a || !absTotal) return '';
          const p = (a / absTotal) * 100;
          return Number.isInteger(Math.round(p * 10) / 10) ? String(Math.round(p)) : p.toFixed(1);
        };
        const setRow = (i: number, patch: Partial<{ categoryId: number | ''; amount: string; merchant: string; pctRaw: string }>) =>
          setSplitDraft((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
        <div onClick={() => setSplitOpen(false)} className="fixed inset-0 z-[80] flex items-center justify-center p-6" style={{ background: 'var(--bg-modal)', backdropFilter: 'blur(3px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-[620px] max-w-full max-h-[90vh] bg-surface border border-line-strong rounded-card shadow-md overflow-hidden flex flex-col">
            <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-line">
              <div>
                <div className="text-[19px] font-extrabold tracking-tight">Split transaction</div>
                <div className="text-[13px] text-content-3 mt-0.5">Splitting creates individual transactions you can categorize and manage separately.</div>
              </div>
              <button onClick={() => setSplitOpen(false)} className="w-9 h-9 shrink-0 flex items-center justify-center rounded-[9px] text-content-2 hover:bg-surface-2"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* ORIGINAL — expandable card */}
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-content-3 mb-2">Original</div>
              <div className="rounded-[12px] border border-line bg-surface-2 mb-5">
                <button onClick={() => setSplitOrigExpanded((v) => !v)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 transition-transform" style={{ transform: splitOrigExpanded ? 'rotate(90deg)' : 'none' }}><path d="m9 6 6 6-6 6"/></svg>
                  <span className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-[13px]" style={{ background: `color-mix(in srgb, ${oColor} 16%, transparent)`, color: oColor }}>{oInitial}</span>
                  <span className="font-semibold text-[15px] truncate flex-1">{vendorLabel(detail)}</span>
                  <span className="flex items-center gap-1.5 text-[13px] text-content-2 shrink-0">
                    {detail.category && <><span className="text-[15px] leading-none">{getCategoryEmoji(detail.category.subName ?? detail.category.groupName)}</span><span className="truncate max-w-[120px]">{detail.category.subName}</span></>}
                  </span>
                  <span className="font-bold tabular-nums text-[15px] shrink-0 ml-2">{fmt(absTotal)}</span>
                </button>
                {splitOrigExpanded && (
                  <div className="px-3.5 pb-3.5 pt-1 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line">
                    <div><div className="text-[11px] font-semibold text-content-3 mb-0.5">Original statement</div><div className="text-[13px] text-content-2 break-words">{detail.description || '—'}</div></div>
                    <div><div className="text-[11px] font-semibold text-content-3 mb-0.5">Notes</div><div className="text-[13px] text-content-2 break-words">{detail.note || 'No notes'}</div></div>
                  </div>
                )}
              </div>

              {/* SPLITS header + $/% toggle */}
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-content-3">Splits</span>
                <SegmentedControl
                  options={[{ label: 'By Amount', value: '$' }, { label: 'By Percent', value: '%' }]}
                  value={splitMode}
                  onChange={(v) => { setSplitMode(v as '$' | '%'); setSplitDraft((d) => d.map((x) => ({ ...x, pctRaw: undefined }))); }}
                />
              </div>

              <datalist id="split-merchant-list">{merchants.map((m) => <option key={m.id} value={m.name} />)}</datalist>
              {splitDraft.map((r, i) => (
                <div key={r.id ?? `new-${i}`} className="flex items-center gap-2 mb-2.5">
                  {/* Merchant */}
                  <input value={r.merchant} onChange={(e) => setRow(i, { merchant: e.target.value })}
                    list="split-merchant-list" placeholder="Merchant"
                    className="w-[150px] shrink-0 h-11 px-3 rounded-[10px] bg-surface-2 border border-line text-content text-[14px] font-medium outline-none" />
                  {/* Category */}
                  <div className="relative flex-1 min-w-0">
                    <select value={r.categoryId} onChange={(e) => setRow(i, { categoryId: e.target.value ? parseInt(e.target.value) : '' })}
                      className="w-full h-11 pl-3 pr-8 rounded-[10px] bg-surface-2 border border-line text-content text-[14px] font-medium outline-none appearance-none cursor-pointer">
                      <option value="">Category…</option>
                      {splitModalGroups.map(([group, subs]) => (<optgroup key={group} label={group}>{subs.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}</optgroup>))}
                    </select>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="absolute right-2.5 top-3 pointer-events-none"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                  {/* Amount ($ or %) */}
                  <div className="relative w-[104px] shrink-0">
                    {splitMode === '$' ? (
                      <>
                        <span className="absolute left-3 top-3 text-[14px] text-content-3 font-semibold">$</span>
                        <input value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value.replace(/[^0-9.]/g, ''), pctRaw: undefined })} inputMode="decimal" placeholder="0.00"
                          className="w-full h-11 pl-6 pr-2.5 rounded-[10px] bg-surface-2 border border-line text-content text-[14px] font-semibold text-right tabular-nums outline-none" />
                      </>
                    ) : (
                      <>
                        {/* Keep the raw keystrokes (pctRaw) so a decimal point / leading zero
                            isn't swallowed by re-deriving the value from the rounded amount. */}
                        <input value={r.pctRaw ?? pctOf(r.amount)} onChange={(e) => { const raw = e.target.value.replace(/[^0-9.]/g, ''); const p = parseFloat(raw) || 0; setRow(i, { pctRaw: raw, amount: (absTotal * p / 100).toFixed(2) }); }} inputMode="decimal" placeholder="0"
                          className="w-full h-11 pl-3 pr-6 rounded-[10px] bg-surface-2 border border-line text-content text-[14px] font-semibold text-right tabular-nums outline-none" />
                        <span className="absolute right-2.5 top-3 text-[14px] text-content-3 font-semibold pointer-events-none">%</span>
                      </>
                    )}
                  </div>
                  {splitDraft.length > 2 ? (
                    <button onClick={() => setSplitDraft((d) => d.filter((_, j) => j !== i))} className="w-9 h-9 shrink-0 flex items-center justify-center rounded-[10px] text-content-3 hover:bg-surface-2 hover:text-negative"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button>
                  ) : <span className="w-9 shrink-0" />}
                </div>
              ))}
              {/* Add-a-split pill + LEFT TO SPLIT indicator */}
              <div className="flex items-center justify-between mt-2">
                <button onClick={() => setSplitDraft((d) => [...d, { categoryId: '', amount: '', merchant: detail.merchant?.name ?? '' }])} className="inline-flex items-center gap-2 h-10 px-3.5 rounded-[11px] border border-dashed border-line-strong text-primary text-sm font-bold">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>Add a split
                </button>
                <div className="flex items-center gap-2">
                  {balanced && <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--positive)' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg></span>}
                  <div className="text-right leading-tight">
                    <div className="text-[17px] font-extrabold tabular-nums" style={{ color: balanced ? 'var(--positive)' : 'var(--negative)' }}>{fmt(Math.abs(splitRemainingVal))}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-content-3">{splitRemainingVal < -0.005 ? 'Over by' : 'Left to split'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-line">
              {isExistingSplit && canEdit ? (
                <button onClick={removeSplitFromDetail} className="h-[42px] px-[16px] rounded-[11px] font-bold text-sm" style={{ color: 'var(--negative)', background: 'transparent' }}>Unsplit</button>
              ) : <span />}
              <div className="flex items-center gap-2.5">
                <button onClick={() => setSplitOpen(false)} className="h-[42px] px-[18px] rounded-[11px] border border-line-strong bg-surface-2 text-content font-semibold text-sm">Cancel</button>
                <button onClick={saveSplit} disabled={!splitValid} className="h-[42px] px-[22px] rounded-[11px] bg-primary text-on-primary font-bold text-sm shadow-sm disabled:opacity-50">Save</button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Infinite scroll: sentinel loads the next batch as it nears the viewport */}
      <div ref={loadMoreRef} />
      <div className={`mt-3 mb-16 text-center font-mono text-[12px] text-content-3`}>
        {total > 0 ? (hasMore ? `Showing ${transactions.length} of ${total} — scroll for more` : `All ${total} transactions`) : 'No transactions'}
      </div>

      {/* Modal */}
      {editing !== null && (
        <TransactionForm
          transaction={editing === 'new' ? undefined : editing}
          accounts={accounts}
          categories={categories}
          merchants={merchants}
          onSave={handleSave}
          onDelete={editing !== 'new' && hasPermission('transactions.delete') ? handleDelete : undefined}
          onClose={() => { setEditing(null); setPendingSave(null); setDuplicateMatch(null); }}
          duplicateMatch={duplicateMatch}
        />
      )}

      {importOpen && (
        <ManualImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => { loadTransactions(); loadReviewCount(); loadMerchants(); }}
        />
      )}
    </div>
  );
}
