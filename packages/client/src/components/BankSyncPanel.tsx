import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { fmt } from '../lib/formatters';
import { getCategoryColor } from '../lib/categoryColors';
import { useToast } from '../context/ToastContext';
import { useIsMobile } from '../hooks/useIsMobile';
import DuplicateComparison from '../components/DuplicateComparison';
import SortableHeader from '../components/SortableHeader';
import InlineNotification from '../components/InlineNotification';
import ResponsiveModal from '../components/ResponsiveModal';
import SplitEditor from '../components/SplitEditor';
import type { SplitRow } from '../components/SplitEditor';

interface Category {
  id: number;
  group_name: string;
  sub_name: string;
  display_name: string;
  type: string;
}

interface LinkedAccountGroup {
  connectionId: number;
  connectionLabel: string;
  accounts: {
    link_id: number;
    account_id: number;
    simplefin_account_id: string;
    simplefin_account_name: string;
    simplefin_org_name: string | null;
    last_synced_at: string | null;
    ledger_account_name: string;
  }[];
}

interface SyncTransaction {
  simplefinId: string;
  accountId: number;
  accountName: string;
  date: string;
  description: string;
  rawDescription: string;
  amount: number;
  suggestedCategoryId: number | null;
  suggestedGroupName: string | null;
  suggestedSubName: string | null;
  confidence: number;
  duplicateStatus: 'exact' | 'possible' | 'none';
  duplicateMatchId: number | null;
  duplicateMatchDescription?: string;
  duplicateMatchDate?: string;
  duplicateMatchAmount?: number;
  duplicateMatchAccountName?: string;
  isLikelyTransfer: boolean;
  // User overrides
  categoryId: number | null;
  groupName: string | null;
  subName: string | null;
  // Split support
  splits: SplitRow[] | null;
  // Dismissed transfer tracking
  isDismissedTransfer: boolean;
}

interface SyncBalanceUpdate {
  accountId: number;
  accountName: string;
  currentBalance: number;
  previousBalance: number | null;
  balanceDate: string;
  selected: boolean;
}

interface SyncHoldingsUpdate {
  accountId: number;
  accountName: string;
  holdings: { symbol: string; description: string; shares: number; costBasis: number; marketValue: number }[];
  selected: boolean;
}

const DATE_PRESETS = [
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 14 Days', days: 14 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Last 60 Days', days: 60 },
  { label: 'Custom Range', days: 0 },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STEPS = ['Select & Fetch', 'Review & Import'];

export default function BankSyncPanel({ categories }: { categories: Category[] }) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [step, setStep] = useState(0);

  // Step 1 state
  const [linkedGroups, setLinkedGroups] = useState<LinkedAccountGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());
  const [datePreset, setDatePreset] = useState(30);
  const [customStart, setCustomStart] = useState(daysAgo(30));
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().slice(0, 10));
  const [fetching, setFetching] = useState(false);

  // Step 2 state
  const [syncTxns, setSyncTxns] = useState<SyncTransaction[]>([]);
  const [balanceUpdates, setBalanceUpdates] = useState<SyncBalanceUpdate[]>([]);
  const [holdingsUpdates, setHoldingsUpdates] = useState<SyncHoldingsUpdate[]>([]);
  const [selectedTxnRows, setSelectedTxnRows] = useState<Set<number>>(new Set());
  const [expandedDupeRow, setExpandedDupeRow] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [reviewSortBy, setReviewSortBy] = useState('date');
  const [reviewSortDir, setReviewSortDir] = useState<'asc' | 'desc'>('desc');

  // Category grouping
  const expenseCats = categories.filter((c) => c.type === 'expense');
  const incomeCats = categories.filter((c) => c.type === 'income');
  const catGroups = new Map<string, Category[]>();
  for (const c of expenseCats) {
    if (!catGroups.has(c.group_name)) catGroups.set(c.group_name, []);
    catGroups.get(c.group_name)!.push(c);
  }

  const allGroupNames = [...new Set(categories.map(c => c.group_name))];
  const getSplitColors = (splits: SplitRow[]) =>
    splits.map(s => {
      const cat = categories.find(c => c.id === s.categoryId);
      return getCategoryColor(cat?.group_name ?? '', allGroupNames);
    });

  const handleReviewSort = (key: string) => {
    if (key === reviewSortBy) setReviewSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setReviewSortBy(key); setReviewSortDir('asc'); }
  };

  // Build sorted index for review table
  const sortedTxnIndices = React.useMemo(() => {
    const indices = syncTxns.map((_, i) => i);
    const dir = reviewSortDir === 'asc' ? 1 : -1;
    indices.sort((a, b) => {
      const ta = syncTxns[a], tb = syncTxns[b];
      switch (reviewSortBy) {
        case 'date': return dir * ta.date.localeCompare(tb.date);
        case 'payee': return dir * (ta.description || '').localeCompare(tb.description || '');
        case 'amount': return dir * (ta.amount - tb.amount);
        case 'category': {
          const ca = categories.find(c => c.id === ta.categoryId)?.display_name || '';
          const cb = categories.find(c => c.id === tb.categoryId)?.display_name || '';
          return dir * ca.localeCompare(cb);
        }
        case 'confidence': return dir * ((ta.confidence || 0) - (tb.confidence || 0));
        default: return 0;
      }
    });
    return indices;
  }, [syncTxns, reviewSortBy, reviewSortDir, categories]);

  const mainTxnIndices = React.useMemo(() => sortedTxnIndices.filter(i => !syncTxns[i].isDismissedTransfer), [sortedTxnIndices, syncTxns]);
  const dismissedTxnIndices = React.useMemo(() => sortedTxnIndices.filter(i => syncTxns[i].isDismissedTransfer), [sortedTxnIndices, syncTxns]);

  const loadLinkedAccounts = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: LinkedAccountGroup[] }>('/simplefin/linked-accounts');
      setLinkedGroups(res.data);
      // Select all by default
      const allIds = new Set<number>();
      for (const g of res.data) {
        for (const a of g.accounts) allIds.add(a.account_id);
      }
      setSelectedAccountIds(allIds);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLinkedAccounts(); }, [loadLinkedAccounts]);

  const totalLinkedAccounts = linkedGroups.reduce((sum, g) => sum + g.accounts.length, 0);

  const getDateRange = () => {
    if (datePreset === 0) return { startDate: customStart, endDate: customEnd };
    return { startDate: daysAgo(datePreset), endDate: new Date().toISOString().slice(0, 10) };
  };

  const handleFetch = async () => {
    setFetching(true);
    try {
      const { startDate, endDate } = getDateRange();
      const res = await apiFetch<{
        data: {
          transactions: Omit<SyncTransaction, 'categoryId' | 'groupName' | 'subName'>[];
          balanceUpdates: Omit<SyncBalanceUpdate, 'selected'>[];
          holdingsUpdates: Omit<SyncHoldingsUpdate, 'selected'>[];
        };
      }>('/simplefin/sync', {
        method: 'POST',
        body: JSON.stringify({
          accountIds: Array.from(selectedAccountIds),
          startDate,
          endDate,
        }),
      });

      const txns: SyncTransaction[] = res.data.transactions.map((t) => ({
        ...t,
        categoryId: t.suggestedCategoryId,
        groupName: t.suggestedGroupName,
        subName: t.suggestedSubName,
        splits: null,
        isDismissedTransfer: false,
      }));

      // Check dismissed status for transfer-flagged rows
      const transferIndices = txns.map((t, i) => t.isLikelyTransfer ? i : -1).filter(i => i >= 0);
      if (transferIndices.length > 0) {
        // Group by accountId for the check
        const byAccount = new Map<number, { idx: number; date: string; amount: number; description: string }[]>();
        for (const idx of transferIndices) {
          const t = txns[idx];
          if (!byAccount.has(t.accountId)) byAccount.set(t.accountId, []);
          byAccount.get(t.accountId)!.push({ idx, date: t.date, amount: t.amount, description: t.description });
        }
        for (const [accountId, items] of byAccount.entries()) {
          try {
            const checkRes = await apiFetch<{ data: boolean[] }>('/import/check-dismissed-transfers', {
              method: 'POST',
              body: JSON.stringify({ accountId, items: items.map(it => ({ date: it.date, amount: it.amount, description: it.description })) }),
            });
            checkRes.data.forEach((isDismissed, j) => {
              if (isDismissed) txns[items[j].idx].isDismissedTransfer = true;
            });
          } catch { /* ignore */ }
        }
      }

      setSyncTxns(txns);
      setBalanceUpdates(res.data.balanceUpdates.map((b) => ({ ...b, selected: true })));
      setHoldingsUpdates(res.data.holdingsUpdates.map((h) => ({ ...h, selected: true })));

      // Auto-select: uncheck exact duplicates and dismissed transfers
      const selected = new Set(txns.map((_, i) => i));
      txns.forEach((t, i) => { if (t.duplicateStatus === 'exact' || !t.categoryId || t.isDismissedTransfer) selected.delete(i); });
      setSelectedTxnRows(selected);

      setStep(1);
    } catch (_err) {
      addToast('Failed to fetch from SimpleFIN. Check your connection in Settings.', 'error');
    } finally {
      setFetching(false);
    }
  };

  const updateTxnCategory = (idx: number, catId: number) => {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;
    setSyncTxns((prev) => prev.map((t, i) => i === idx ? {
      ...t,
      categoryId: catId,
      groupName: cat.group_name,
      subName: cat.sub_name,
      confidence: 1.0,
    } : t));
    setSelectedTxnRows(prev => { const next = new Set(prev); next.add(idx); return next; });
  };

  const handleImport = async () => {
    const selectedTxns = syncTxns.filter((_, i) => selectedTxnRows.has(i) && (syncTxns[i].categoryId != null || (syncTxns[i].splits && syncTxns[i].splits!.length >= 2)));
    const selectedBalances = balanceUpdates.filter((b) => b.selected);
    const selectedHoldings = holdingsUpdates.filter((h) => h.selected);

    if (selectedTxns.length === 0 && selectedBalances.length === 0 && selectedHoldings.length === 0) return;

    setImporting(true);
    try {
      // Auto-dismiss unselected transfers
      const transfersToDismiss = syncTxns.filter((t, i) => t.isLikelyTransfer && !selectedTxnRows.has(i));
      if (transfersToDismiss.length > 0) {
        const byAccount = new Map<number, { date: string; amount: number; description: string }[]>();
        for (const t of transfersToDismiss) {
          if (!byAccount.has(t.accountId)) byAccount.set(t.accountId, []);
          byAccount.get(t.accountId)!.push({ date: t.date, amount: t.amount, description: t.description });
        }
        for (const [accountId, items] of byAccount.entries()) {
          try {
            await apiFetch('/import/dismiss-transfers', {
              method: 'POST',
              body: JSON.stringify({ accountId, items }),
            });
          } catch { /* ignore */ }
        }
      }

      const res = await apiFetch<{ data: { transactionsImported: number; balancesUpdated: number; holdingsUpdated: number } }>(
        '/simplefin/commit',
        {
          method: 'POST',
          body: JSON.stringify({
            transactions: selectedTxns.map((t) => ({
              simplefinId: t.simplefinId,
              accountId: t.accountId,
              date: t.date,
              description: t.description,
              rawDescription: t.rawDescription,
              amount: t.amount,
              categoryId: t.splits ? null : t.categoryId,
              ...(t.splits ? { splits: t.splits } : {}),
            })),
            balanceUpdates: selectedBalances.map((b) => ({
              accountId: b.accountId,
              balance: b.currentBalance,
              date: b.balanceDate,
            })),
            holdingsUpdates: selectedHoldings.map((h) => ({
              accountId: h.accountId,
              holdings: h.holdings,
            })),
          }),
        }
      );

      const parts = [];
      if (res.data.transactionsImported > 0) parts.push(`${res.data.transactionsImported} transactions`);
      if (res.data.balancesUpdated > 0) parts.push(`${res.data.balancesUpdated} balances`);
      addToast(`Imported ${parts.join(', updated ')}`);

      const { startDate, endDate } = getDateRange();
      navigate(`/transactions?startDate=${startDate}&endDate=${endDate}`);
    } catch {
      addToast('Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  // Split editor modal state
  const [splitEditingIdx, setSplitEditingIdx] = useState<number | null>(null);

  const handleSplitApply = (idx: number, appliedSplits: SplitRow[]) => {
    setSyncTxns((prev) => prev.map((t, i) => i === idx ? {
      ...t,
      categoryId: null,
      groupName: null,
      subName: null,
      splits: appliedSplits,
    } : t));
    setSelectedTxnRows(prev => { const next = new Set(prev); next.add(idx); return next; });
    setSplitEditingIdx(null);
    addToast(`Split applied across ${appliedSplits.length} categories`, 'success');
  };

  const handleSplitCancel = (idx: number) => {
    setSplitEditingIdx(null);
    const row = syncTxns[idx];
    if (!row.categoryId && (!row.splits || row.splits.length < 2)) {
      setSelectedTxnRows(prev => { const next = new Set(prev); next.delete(idx); return next; });
    }
  };

  const toggleTransferFlag = (idx: number) => {
    setSyncTxns(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      const nowTransfer = !t.isLikelyTransfer;
      return { ...t, isLikelyTransfer: nowTransfer, isDismissedTransfer: false };
    }));
    // Uncheck if newly flagged as transfer
    const t = syncTxns[idx];
    if (!t.isLikelyTransfer) {
      setSelectedTxnRows(prev => { const next = new Set(prev); next.delete(idx); return next; });
    }
  };

  const [dismissedExpanded, setDismissedExpanded] = useState(false);

  if (loading) return null;

  // No linked accounts — not configured
  if (totalLinkedAccounts === 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] p-10 text-center shadow-[var(--bg-card-shadow)]">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="mx-auto text-[var(--text-muted)] mb-3">
          <path d="M3 21h18" /><path d="M3 10h18" /><path d="M5 6l7-3 7 3" /><path d="M4 10v11" /><path d="M20 10v11" /><path d="M8 14v4" /><path d="M12 14v4" /><path d="M16 14v4" />
        </svg>
        <h3 className="text-[16px] font-bold text-[var(--text-primary)] mb-1">Bank Sync Not Configured</h3>
        <p className="text-[13px] text-[var(--text-secondary)] mb-4 max-w-md mx-auto">
          Connect your bank accounts via SimpleFIN to automatically pull transactions and balances
        </p>
        <Link to="/settings"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-lg text-[13px] font-semibold no-underline">
          Set Up in Settings →
        </Link>
        <p className="text-[11px] text-[var(--text-muted)] mt-3">
          SimpleFIN connects to 16,000+ financial institutions for $1.50/month
        </p>
      </div>
    );
  }

  const validTxnCount = syncTxns.filter((t, i) => selectedTxnRows.has(i) && (t.categoryId != null || (t.splits && t.splits.length >= 2))).length;
  const selectedBalanceCount = balanceUpdates.filter((b) => b.selected).length;
  const selectedHoldingsCount = holdingsUpdates.filter((h) => h.selected).length;

  return (
    <>
    <div>
      {/* Step Indicator */}
      <div className="flex gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1 text-center">
            <div className={`h-[3px] rounded-sm mb-1.5 ${i <= step ? 'bg-[#3b82f6]' : 'bg-[var(--table-border)]'}`} />
            <span className={`text-[11px] ${i === step ? 'text-[var(--badge-category-text)] font-bold' : i < step ? 'text-[var(--badge-category-text)]' : 'text-[var(--text-muted)]'}`}>
              {s}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Select & Fetch */}
      {step === 0 && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)]">
          <div className={isMobile ? 'flex flex-col gap-4' : 'grid grid-cols-[1fr_300px] gap-6'}>
            {/* Date Range — shown first on mobile */}
            {isMobile && (
              <div>
                <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-3">Date Range</h3>
                <select
                  value={datePreset}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setDatePreset(v);
                    if (v > 0) {
                      setCustomStart(daysAgo(v));
                      setCustomEnd(new Date().toISOString().slice(0, 10));
                    }
                  }}
                  className="w-full border border-[var(--table-border)] rounded-lg bg-[var(--bg-input)] px-3 py-2 text-[13px] outline-none mb-3 text-[var(--text-body)]">
                  {DATE_PRESETS.map((p) => (
                    <option key={p.days} value={p.days}>{p.label}</option>
                  ))}
                </select>
                {datePreset === 0 && (
                  <div className="flex gap-2 mb-2">
                    <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                      className="flex-1 border border-[var(--table-border)] rounded-lg bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] outline-none text-[var(--text-body)]" />
                    <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                      className="flex-1 border border-[var(--table-border)] rounded-lg bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] outline-none text-[var(--text-body)]" />
                  </div>
                )}
                {datePreset === 0 && customStart && customEnd && (() => {
                  const diffDays = Math.round((new Date(customEnd).getTime() - new Date(customStart).getTime()) / (1000 * 60 * 60 * 24));
                  return diffDays > 60 ? (
                    <InlineNotification type="warning" message="SimpleFIN limits data to 60 days per request. Only the most recent 60 days of your range will be fetched." className="mb-2" />
                  ) : null;
                })()}
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed m-0">
                  SimpleFIN updates data once per day. Maximum range: 60 days per request.
                </p>
              </div>
            )}
            {/* Account Selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Select Accounts</h3>
                <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] cursor-pointer">
                  <input type="checkbox"
                    checked={selectedAccountIds.size === totalLinkedAccounts && totalLinkedAccounts > 0}
                    onChange={() => {
                      if (selectedAccountIds.size === totalLinkedAccounts) {
                        setSelectedAccountIds(new Set());
                      } else {
                        const all = new Set<number>();
                        for (const g of linkedGroups) for (const a of g.accounts) all.add(a.account_id);
                        setSelectedAccountIds(all);
                      }
                    }}
                    className="cursor-pointer" />
                  Select All
                </label>
              </div>
              {linkedGroups.map((group) => (
                <div key={group.connectionId} className="mb-3">
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-1.5">
                    {group.connectionLabel}
                  </div>
                  {group.accounts.map((acct) => (
                    <label key={acct.link_id}
                      className="flex items-center gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-[var(--bg-hover)]">
                      <input type="checkbox"
                        checked={selectedAccountIds.has(acct.account_id)}
                        onChange={() => {
                          setSelectedAccountIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(acct.account_id)) next.delete(acct.account_id);
                            else next.add(acct.account_id);
                            return next;
                          });
                        }}
                        className="cursor-pointer" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-[13px] text-[var(--text-primary)]">
                          {acct.simplefin_account_name}
                        </span>
                        <div className={`flex items-center gap-1.5 mt-0.5 ${isMobile ? '' : 'mt-0'}`}>
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--badge-account-bg)] text-[var(--badge-account-text)] font-mono">
                            {acct.ledger_account_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] mt-0.5">
                          {acct.simplefin_org_name && <span>{acct.simplefin_org_name}</span>}
                          <span>·</span>
                          <span>Last synced: {formatDate(acct.last_synced_at)}</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </div>

            {/* Date Range — desktop only (mobile renders above) */}
            {!isMobile && (
            <div>
              <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-3">Date Range</h3>
              <select
                value={datePreset}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setDatePreset(v);
                  if (v > 0) {
                    setCustomStart(daysAgo(v));
                    setCustomEnd(new Date().toISOString().slice(0, 10));
                  }
                }}
                className="w-full border border-[var(--table-border)] rounded-lg bg-[var(--bg-input)] px-3 py-2 text-[13px] outline-none mb-3 text-[var(--text-body)]">
                {DATE_PRESETS.map((p) => (
                  <option key={p.days} value={p.days}>{p.label}</option>
                ))}
              </select>
              {datePreset === 0 && (
                <div className="flex gap-2 mb-2">
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                    className="flex-1 border border-[var(--table-border)] rounded-lg bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] outline-none text-[var(--text-body)]" />
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                    className="flex-1 border border-[var(--table-border)] rounded-lg bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] outline-none text-[var(--text-body)]" />
                </div>
              )}
              {datePreset === 0 && customStart && customEnd && (() => {
                const diffDays = Math.round((new Date(customEnd).getTime() - new Date(customStart).getTime()) / (1000 * 60 * 60 * 24));
                return diffDays > 60 ? (
                  <InlineNotification type="warning" message="SimpleFIN limits data to 60 days per request. Only the most recent 60 days of your range will be fetched." className="mb-2" />
                ) : null;
              })()}
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                SimpleFIN updates data once per day. Maximum range: 60 days per request.
              </p>
            </div>
            )}
          </div>

          {/* Fetch Button */}
          <button
            onClick={handleFetch}
            disabled={fetching || selectedAccountIds.size === 0}
            className="w-full mt-4 py-2.5 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 btn-primary">
            {fetching ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Fetching...
              </>
            ) : (
              `Fetch Transactions (${selectedAccountIds.size} account${selectedAccountIds.size !== 1 ? 's' : ''})`
            )}
          </button>
        </div>
      )}

      {/* Step 2: Review & Import */}
      {step === 1 && (
        <div>
          {/* Back link */}
          <button onClick={() => setStep(0)}
            className="text-[12px] text-[var(--badge-category-text)] bg-transparent border-none cursor-pointer mb-4 btn-ghost hover:underline">
            ← Back to Selection
          </button>

          {/* Transaction Review */}
          {syncTxns.length === 0 ? (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] p-8 text-center shadow-[var(--bg-card-shadow)]">
              <p className="text-[14px] font-medium text-[var(--text-primary)] mb-1">No new transactions found</p>
              <p className="text-[13px] text-[var(--text-secondary)]">
                All transactions have already been imported for the selected date range.
              </p>
            </div>
          ) : (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)] mb-4">
              <div className={`flex justify-between items-center mb-3 ${isMobile ? 'flex-col gap-2 items-stretch' : ''}`}>
                <span className="text-[13px] text-[var(--text-secondary)]">
                  {validTxnCount} of {mainTxnIndices.length} transactions selected for import
                </span>
              </div>

              {isMobile ? (
                /* Mobile: Card-based transaction review */
                <div className="flex flex-col gap-2">
                  {mainTxnIndices.map((i) => {
                    const t = syncTxns[i];
                    return (
                      <div key={i} className={`rounded-lg border px-3 py-2.5 ${!selectedTxnRows.has(i) ? 'opacity-50 border-[var(--bg-card-border)]' : !t.categoryId && !(t.splits && t.splits.length >= 2) ? 'border-[var(--bg-card-border)] bg-[var(--bg-needs-attention)]' : 'border-[var(--bg-card-border)]'}`}>
                        <div className="flex items-start gap-2.5">
                          <input type="checkbox" checked={selectedTxnRows.has(i)}
                            onChange={() => {
                              setSelectedTxnRows((prev) => {
                                const next = new Set(prev);
                                if (next.has(i)) next.delete(i); else next.add(i);
                                return next;
                              });
                            }}
                            className="cursor-pointer mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">{t.description}</span>
                              <span className={`text-[13px] font-mono font-semibold flex-shrink-0 ${t.amount < 0 ? 'text-[#10b981]' : 'text-[var(--text-primary)]'}`}>
                                {t.amount < 0 ? '+' : ''}{fmt(Math.abs(t.amount))}
                              </span>
                            </div>
                            {t.rawDescription && t.rawDescription !== t.description && (
                              <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{t.rawDescription}</div>
                            )}
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[11px] font-mono text-[var(--text-muted)]">{t.date}</span>
                              <span className="text-[var(--text-muted)]">·</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--badge-account-bg)] text-[var(--badge-account-text)] font-mono truncate max-w-[120px]">
                                {t.accountName}
                              </span>
                              <span className={`text-[10px] font-semibold font-mono ${
                                t.confidence > 0.9 ? 'text-[#10b981]' : t.confidence > 0.6 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
                              }`}>
                                {Math.round(t.confidence * 100)}%
                              </span>
                            </div>
                            <div className="mt-2">
                              {t.splits && t.splits.length >= 2 ? (
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1">
                                    <span className="inline-flex" style={{ gap: 0 }}>
                                      {getSplitColors(t.splits).map((color, ci) => (
                                        <span key={ci} style={{
                                          width: 8, height: 8, borderRadius: '50%',
                                          background: color,
                                          border: '1.5px solid var(--bg-card)',
                                          marginLeft: ci > 0 ? -3 : 0,
                                          zIndex: t.splits!.length - ci,
                                          display: 'inline-block',
                                        }} />
                                      ))}
                                    </span>
                                    <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Split ({t.splits.length})</span>
                                  </span>
                                  <button onClick={() => setSplitEditingIdx(i)}
                                    className="text-[11px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer p-0 hover:underline">Edit</button>
                                </div>
                              ) : (
                                <>
                                  {t.groupName && t.categoryId && (
                                    <div className="text-[10px] text-[var(--text-muted)] mb-0.5">{t.groupName}</div>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <select
                                      className="flex-1 text-[12px] border border-[var(--table-border)] rounded-md px-2 py-1.5 outline-none bg-[var(--bg-card)] text-[var(--text-body)]"
                                      value={t.categoryId || ''}
                                      onChange={(e) => updateTxnCategory(i, parseInt(e.target.value))}>
                                      <option value="">Select category...</option>
                                      {Array.from(catGroups.entries()).map(([group, cats]) => (
                                        <optgroup key={group} label={group}>
                                          {cats.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}
                                        </optgroup>
                                      ))}
                                      <optgroup label="Income">
                                        {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}
                                      </optgroup>
                                    </select>
                                    <button onClick={() => setSplitEditingIdx(i)}
                                      title="Split"
                                      className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center border-none bg-transparent text-[var(--text-muted)] cursor-pointer hover:text-[var(--color-accent)]">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 4v8m0 0l-6 8m6-8l6 8" />
                                      </svg>
                                    </button>
                                  </div>
                                </>
                              )}
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  {t.duplicateStatus !== 'none' && (
                                    <button
                                      onClick={() => setExpandedDupeRow(expandedDupeRow === i ? null : i)}
                                      className="text-[11px] font-medium border-none cursor-pointer px-2 py-0.5 rounded-full hover:opacity-80"
                                      style={{
                                        background: t.duplicateStatus === 'exact' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                                        color: t.duplicateStatus === 'exact' ? 'var(--color-negative)' : 'var(--color-warning)',
                                      }}>
                                      ⚠ {t.duplicateStatus === 'exact' ? 'Likely Duplicate' : 'Possible Duplicate'}
                                    </button>
                                  )}
                                  {t.isLikelyTransfer ? (
                                    <button onClick={() => toggleTransferFlag(i)}
                                      className="text-[11px] font-medium border-none cursor-pointer px-2 py-0.5 rounded-full hover:opacity-80"
                                      style={{ background: 'var(--badge-transfer-bg)', color: 'var(--badge-transfer-text)' }}>↔ Transfer ✕</button>
                                  ) : (
                                    <button onClick={() => toggleTransferFlag(i)}
                                      className="text-[11px] font-medium border-none cursor-pointer px-2 py-0.5 rounded-full opacity-50 hover:opacity-80"
                                      style={{ background: 'var(--badge-transfer-bg)', color: 'var(--badge-transfer-text)' }}>↔ Mark as Transfer</button>
                                  )}
                                </div>
                            </div>
                          </div>
                        </div>
                        {expandedDupeRow === i && t.duplicateMatchId && (
                          <div className="mt-2 -mx-1">
                            <DuplicateComparison
                              incoming={{ date: t.date, description: t.description, amount: t.amount, accountName: t.accountName }}
                              existing={{ date: t.duplicateMatchDate || t.date, description: t.duplicateMatchDescription || '', amount: t.duplicateMatchAmount ?? t.amount, accountName: t.duplicateMatchAccountName || null }}
                              onImportAnyway={() => {
                                setSelectedTxnRows((prev) => { const next = new Set(prev); next.add(i); return next; });
                                setExpandedDupeRow(null);
                              }}
                              onSkip={() => {
                                setSelectedTxnRows((prev) => { const next = new Set(prev); next.delete(i); return next; });
                                setExpandedDupeRow(null);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
              <table className="w-full border-collapse text-[13px]" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '40px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '20%' }} />
                  <col />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '95px' }} />
                  <col style={{ width: '200px' }} />
                  <col style={{ width: '50px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-2 py-2 border-b-2 border-[var(--table-border)]">
                      <input type="checkbox"
                        checked={mainTxnIndices.length > 0 && mainTxnIndices.every(i => selectedTxnRows.has(i))}
                        onChange={() => {
                          if (mainTxnIndices.every(i => selectedTxnRows.has(i))) {
                            setSelectedTxnRows(prev => { const next = new Set(prev); mainTxnIndices.forEach(i => next.delete(i)); return next; });
                          } else {
                            setSelectedTxnRows(prev => { const next = new Set(prev); mainTxnIndices.forEach(i => next.add(i)); return next; });
                          }
                        }}
                        className="cursor-pointer" />
                    </th>
                    <SortableHeader label="Date" sortKey="date" activeSortKey={reviewSortBy} sortDir={reviewSortDir} onSort={handleReviewSort} />
                    <SortableHeader label="Payee" sortKey="payee" activeSortKey={reviewSortBy} sortDir={reviewSortDir} onSort={handleReviewSort} />
                    <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Note</th>
                    <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Account</th>
                    <SortableHeader label="Amount" sortKey="amount" activeSortKey={reviewSortBy} sortDir={reviewSortDir} onSort={handleReviewSort} align="right" />
                    <SortableHeader label="Category" sortKey="category" activeSortKey={reviewSortBy} sortDir={reviewSortDir} onSort={handleReviewSort} />
                    <SortableHeader label="Conf." sortKey="confidence" activeSortKey={reviewSortBy} sortDir={reviewSortDir} onSort={handleReviewSort} align="center" />
                  </tr>
                </thead>
                <tbody>
                  {mainTxnIndices.map((i) => {
                    const t = syncTxns[i];
                    return (
                    <React.Fragment key={i}>
                      <tr className={`border-b border-[var(--table-row-border)] ${!selectedTxnRows.has(i) ? 'opacity-50' : ''} ${!t.categoryId && !(t.splits && t.splits.length >= 2) && selectedTxnRows.has(i) ? 'bg-[var(--bg-needs-attention)]' : ''}`}>
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" checked={selectedTxnRows.has(i)}
                            onChange={() => {
                              setSelectedTxnRows((prev) => {
                                const next = new Set(prev);
                                if (next.has(i)) next.delete(i); else next.add(i);
                                return next;
                              });
                            }}
                            className="cursor-pointer" />
                        </td>
                        <td className="px-2.5 py-2 font-mono text-[12px] text-[var(--text-body)] truncate">{t.date}</td>
                        <td className="px-2.5 py-2 font-medium text-[var(--text-primary)] truncate" title={t.rawDescription !== t.description ? t.rawDescription : undefined}>
                          {t.description}
                        </td>
                        <td className="px-2.5 py-2 text-[12px] text-[var(--text-secondary)] truncate" title={t.rawDescription !== t.description ? t.rawDescription : undefined}>
                          {t.rawDescription !== t.description ? t.rawDescription : ''}
                        </td>
                        <td className="px-2.5 py-2">
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--badge-account-bg)] text-[var(--badge-account-text)] font-mono inline-block max-w-full truncate" title={t.accountName}>
                            {t.accountName}
                          </span>
                        </td>
                        <td className={`px-2.5 py-2 text-right font-mono font-semibold ${t.amount < 0 ? 'text-[#10b981]' : 'text-[var(--text-primary)]'}`}>
                          {t.amount < 0 ? '+' : ''}{fmt(Math.abs(t.amount))}
                        </td>
                        <td className="px-2.5 py-1.5 overflow-hidden">
                          {t.splits && t.splits.length >= 2 ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1">
                                <span className="inline-flex" style={{ gap: 0 }}>
                                  {getSplitColors(t.splits).map((color, ci) => (
                                    <span key={ci} style={{
                                      width: 10, height: 10, borderRadius: '50%',
                                      background: color,
                                      border: '1.5px solid var(--bg-card)',
                                      marginLeft: ci > 0 ? -3 : 0,
                                      zIndex: t.splits!.length - ci,
                                      display: 'inline-block',
                                    }} />
                                  ))}
                                </span>
                                <span className="text-[10px] font-semibold text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] whitespace-nowrap">Split ({t.splits.length})</span>
                              </span>
                              <button onClick={() => setSplitEditingIdx(i)}
                                className="ml-1 text-[10px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer p-0 hover:underline">Edit</button>
                            </div>
                          ) : (
                            <>
                              {t.groupName && t.categoryId && (
                                <div className="text-[10px] text-[var(--text-muted)] mb-0.5 truncate">{t.groupName}</div>
                              )}
                              <div className="flex items-center gap-1">
                                <select
                                  className="flex-1 min-w-0 text-[11px] border border-[var(--table-border)] rounded-md px-1.5 py-1 outline-none bg-[var(--bg-card)] text-[var(--text-body)]"
                                  value={t.categoryId || ''}
                                  onChange={(e) => updateTxnCategory(i, parseInt(e.target.value))}>
                                  <option value="">Select...</option>
                                  {Array.from(catGroups.entries()).map(([group, cats]) => (
                                    <optgroup key={group} label={group}>
                                      {cats.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}
                                    </optgroup>
                                  ))}
                                  <optgroup label="Income">
                                    {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}
                                  </optgroup>
                                </select>
                                <button onClick={() => setSplitEditingIdx(i)}
                                  title="Split across categories"
                                  className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center border-none bg-transparent text-[var(--text-muted)] cursor-pointer hover:text-[var(--color-accent)] hover:bg-[var(--bg-hover)]">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 4v8m0 0l-6 8m6-8l6 8" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {t.duplicateStatus !== 'none' && (
                                <button
                                  onClick={() => setExpandedDupeRow(expandedDupeRow === i ? null : i)}
                                  className="text-[11px] font-medium border-none cursor-pointer px-2 py-0.5 rounded-full hover:opacity-80"
                                  style={{
                                    background: t.duplicateStatus === 'exact' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                                    color: t.duplicateStatus === 'exact' ? 'var(--color-negative)' : 'var(--color-warning)',
                                  }}>
                                  ⚠ {t.duplicateStatus === 'exact' ? 'Likely Duplicate' : 'Possible Duplicate'}
                                </button>
                              )}
                              {t.isLikelyTransfer ? (
                                <button onClick={() => toggleTransferFlag(i)}
                                  className="text-[11px] font-medium border-none cursor-pointer px-2 py-0.5 rounded-full hover:opacity-80"
                                  style={{ background: 'var(--badge-transfer-bg)', color: 'var(--badge-transfer-text)' }}>↔ Transfer ✕</button>
                              ) : (
                                <button onClick={() => toggleTransferFlag(i)}
                                  className="text-[11px] font-medium border-none cursor-pointer px-2 py-0.5 rounded-full opacity-50 hover:opacity-80"
                                  style={{ background: 'var(--badge-transfer-bg)', color: 'var(--badge-transfer-text)' }}>↔ Mark as Transfer</button>
                              )}
                            </div>
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <span className={`text-[11px] font-semibold font-mono ${
                            t.confidence > 0.9 ? 'text-[#10b981]' : t.confidence > 0.6 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
                          }`}>
                            {Math.round(t.confidence * 100)}%
                          </span>
                        </td>
                      </tr>
                      {expandedDupeRow === i && t.duplicateMatchId && (
                        <tr>
                          <td colSpan={8} className="px-2.5 py-1">
                            <DuplicateComparison
                              incoming={{ date: t.date, description: t.description, amount: t.amount, accountName: t.accountName }}
                              existing={{ date: t.duplicateMatchDate || t.date, description: t.duplicateMatchDescription || '', amount: t.duplicateMatchAmount ?? t.amount, accountName: t.duplicateMatchAccountName || null }}
                              onImportAnyway={() => {
                                setSelectedTxnRows((prev) => { const next = new Set(prev); next.add(i); return next; });
                                setExpandedDupeRow(null);
                              }}
                              onSkip={() => {
                                setSelectedTxnRows((prev) => { const next = new Set(prev); next.delete(i); return next; });
                                setExpandedDupeRow(null);
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              )}
            </div>
          )}

          {/* Dismissed Transfers Collapsible Section */}
          {dismissedTxnIndices.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] mb-4 overflow-hidden">
              <button
                onClick={() => setDismissedExpanded(!dismissedExpanded)}
                className="w-full flex items-center justify-between px-5 py-3 border-none bg-transparent cursor-pointer text-left"
              >
                <span className="text-[13px] font-semibold text-[var(--text-secondary)]">
                  ↔ Previously Seen Transfers ({dismissedTxnIndices.length})
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  className={`text-[var(--text-muted)] transition-transform ${dismissedExpanded ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {dismissedExpanded && (
                <div className="border-t border-[var(--table-border)] px-5 py-3">
                  {isMobile ? (
                    <div className="flex flex-col gap-2">
                      {dismissedTxnIndices.map((i) => {
                        const t = syncTxns[i];
                        return (
                          <div key={i} className={`rounded-lg border px-3 py-2.5 ${!selectedTxnRows.has(i) ? 'opacity-50 border-[var(--bg-card-border)]' : 'border-[var(--bg-card-border)]'}`}>
                            <div className="flex items-start gap-2.5">
                              <input type="checkbox" checked={selectedTxnRows.has(i)}
                                onChange={() => {
                                  setSelectedTxnRows((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(i)) next.delete(i); else next.add(i);
                                    return next;
                                  });
                                }}
                                className="cursor-pointer mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">{t.description}</span>
                                  <span className={`text-[13px] font-mono font-semibold flex-shrink-0 ${t.amount < 0 ? 'text-[#10b981]' : 'text-[var(--text-primary)]'}`}>
                                    {t.amount < 0 ? '+' : ''}{fmt(Math.abs(t.amount))}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-[11px] font-mono text-[var(--text-muted)]">{t.date}</span>
                                  <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--badge-account-bg)] text-[var(--badge-account-text)] font-mono">{t.accountName}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  <button onClick={() => toggleTransferFlag(i)}
                                    className="text-[11px] font-medium border-none cursor-pointer px-2 py-0.5 rounded-full hover:opacity-80"
                                    style={{ background: 'var(--badge-transfer-bg)', color: 'var(--badge-transfer-text)' }}>↔ Transfer ✕</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-[13px]" style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '40px' }} />
                        <col style={{ width: '110px' }} />
                        <col />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '95px' }} />
                        <col style={{ width: '80px' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="px-2 py-2 border-b-2 border-[var(--table-border)]" />
                          <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Date</th>
                          <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Description</th>
                          <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Account</th>
                          <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-right">Amount</th>
                          <th className="px-2 py-2 border-b-2 border-[var(--table-border)]" />
                        </tr>
                      </thead>
                      <tbody>
                        {dismissedTxnIndices.map((i) => {
                          const t = syncTxns[i];
                          return (
                            <tr key={i} className={`border-b border-[var(--table-row-border)] ${!selectedTxnRows.has(i) ? 'opacity-50' : ''}`}>
                              <td className="px-2 py-2 text-center">
                                <input type="checkbox" checked={selectedTxnRows.has(i)}
                                  onChange={() => {
                                    setSelectedTxnRows((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(i)) next.delete(i); else next.add(i);
                                      return next;
                                    });
                                  }}
                                  className="cursor-pointer" />
                              </td>
                              <td className="px-2.5 py-2 font-mono text-[12px] text-[var(--text-body)] truncate">{t.date}</td>
                              <td className="px-2.5 py-2">
                                <div className="font-medium text-[var(--text-primary)] truncate">{t.description}</div>
                                <button onClick={() => toggleTransferFlag(i)}
                                  className="text-[11px] font-medium border-none cursor-pointer px-2 py-0.5 rounded-full hover:opacity-80 mt-1"
                                  style={{ background: 'var(--badge-transfer-bg)', color: 'var(--badge-transfer-text)' }}>↔ Transfer ✕</button>
                              </td>
                              <td className="px-2.5 py-2">
                                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--badge-account-bg)] text-[var(--badge-account-text)] font-mono inline-block max-w-full truncate" title={t.accountName}>
                                  {t.accountName}
                                </span>
                              </td>
                              <td className={`px-2.5 py-2 text-right font-mono font-semibold ${t.amount < 0 ? 'text-[#10b981]' : 'text-[var(--text-primary)]'}`}>
                                {t.amount < 0 ? '+' : ''}{fmt(Math.abs(t.amount))}
                              </td>
                              <td />
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Balance Updates */}
          {balanceUpdates.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)] mb-4">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-1">Balance Updates</h3>
              <p className="text-[13px] text-[var(--text-secondary)] mb-3">Approving updates will create new balance snapshots on the Net Worth page</p>
              {isMobile ? (
                /* Mobile: Card layout for balance updates */
                <div className="flex flex-col gap-2">
                  {balanceUpdates.map((b, i) => {
                    const change = b.previousBalance !== null ? b.currentBalance - b.previousBalance : null;
                    const noChange = change !== null && Math.abs(change) < 0.005;
                    const pct = b.previousBalance && b.previousBalance !== 0 && change !== null
                      ? ((change / Math.abs(b.previousBalance)) * 100) : null;
                    return (
                      <div key={i} className={`rounded-lg border border-[var(--bg-card-border)] px-3 py-2.5 ${noChange ? 'opacity-60' : ''}`}>
                        <div className="flex items-center gap-2.5">
                          <input type="checkbox" checked={b.selected}
                            onChange={() => setBalanceUpdates((prev) => prev.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                            className="cursor-pointer flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-[var(--text-primary)]">{b.accountName}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                                {b.previousBalance !== null ? fmt(b.previousBalance) : '—'}
                              </span>
                              <span className="text-[var(--text-muted)]">→</span>
                              <span className="text-[12px] font-mono font-semibold text-[var(--text-primary)]">
                                {fmt(b.currentBalance)}
                              </span>
                              {noChange ? (
                                <span className="text-[10px] text-[var(--text-muted)]">No change</span>
                              ) : change !== null && (
                                <span className={`text-[11px] font-mono ${change >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                                  {change >= 0 ? '+' : ''}{fmt(change)}
                                  {pct !== null && ` (${change >= 0 ? '+' : ''}${pct.toFixed(1)}%)`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className="w-[40px] px-2 py-2 border-b-2 border-[var(--table-border)]" />
                    <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-left">Account</th>
                    <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-right">Previous</th>
                    <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-right">New Balance</th>
                    <th className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2.5 py-2 border-b-2 border-[var(--table-border)] text-right">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {balanceUpdates.map((b, i) => {
                    const change = b.previousBalance !== null ? b.currentBalance - b.previousBalance : null;
                    const noChange = change !== null && Math.abs(change) < 0.005;
                    const pct = b.previousBalance && b.previousBalance !== 0 && change !== null
                      ? ((change / Math.abs(b.previousBalance)) * 100) : null;
                    return (
                      <tr key={i} className={`border-b border-[var(--table-row-border)] ${noChange ? 'opacity-60' : ''}`}>
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" checked={b.selected}
                            onChange={() => setBalanceUpdates((prev) => prev.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                            className="cursor-pointer" />
                        </td>
                        <td className="px-2.5 py-2 font-medium text-[var(--text-primary)]">{b.accountName}</td>
                        <td className="px-2.5 py-2 text-right font-mono text-[var(--text-body)]">
                          {b.previousBalance !== null ? fmt(b.previousBalance) : '—'}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono font-semibold text-[var(--text-primary)]">
                          {fmt(b.currentBalance)}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono text-[12px]">
                          {noChange ? (
                            <span className="text-[var(--text-muted)]">No change</span>
                          ) : change !== null ? (
                            <span className={change >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}>
                              {change >= 0 ? '+' : ''}{fmt(change)}
                              {pct !== null && <span className="text-[11px]"> ({change >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">New</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </div>
          )}

          {/* Holdings Updates */}
          {holdingsUpdates.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)] mb-4">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-3">Holdings Updates</h3>
              {holdingsUpdates.map((hu, hi) => (
                <div key={hi} className="mb-3">
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input type="checkbox" checked={hu.selected}
                      onChange={() => setHoldingsUpdates((prev) => prev.map((x, j) => j === hi ? { ...x, selected: !x.selected } : x))}
                      className="cursor-pointer" />
                    <span className="font-semibold text-[13px] text-[var(--text-primary)]">{hu.accountName}</span>
                  </label>
                  {isMobile ? (
                    /* Mobile: Compact card layout for holdings */
                    <div className="flex flex-col gap-1.5 pl-6">
                      {hu.holdings.map((h, j) => (
                        <div key={j} className="flex items-center justify-between py-1" style={{ borderBottom: j < hu.holdings.length - 1 ? '1px solid var(--bg-card-border)' : 'none' }}>
                          <div className="min-w-0">
                            <span className="text-[11px] font-mono font-semibold text-[var(--text-primary)]">{h.symbol}</span>
                            <span className="text-[10px] text-[var(--text-muted)] ml-1.5 truncate">{h.shares.toFixed(2)} shares</span>
                          </div>
                          <span className="text-[12px] font-mono font-semibold text-[var(--text-primary)] flex-shrink-0 ml-2">{fmt(h.marketValue)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                  <table className="w-full border-collapse text-[12px] ml-6" style={{ width: 'calc(100% - 24px)' }}>
                    <thead>
                      <tr>
                        <th className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase px-2 py-1 border-b border-[var(--table-border)] text-left">Symbol</th>
                        <th className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase px-2 py-1 border-b border-[var(--table-border)] text-left">Fund</th>
                        <th className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase px-2 py-1 border-b border-[var(--table-border)] text-right">Shares</th>
                        <th className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase px-2 py-1 border-b border-[var(--table-border)] text-right">Cost Basis</th>
                        <th className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase px-2 py-1 border-b border-[var(--table-border)] text-right">Market Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hu.holdings.map((h, j) => (
                        <tr key={j} className="border-b border-[var(--table-row-border)]">
                          <td className="px-2 py-1 font-mono font-semibold text-[var(--text-primary)]">{h.symbol}</td>
                          <td className="px-2 py-1 text-[var(--text-secondary)] truncate">{h.description}</td>
                          <td className="px-2 py-1 text-right font-mono text-[var(--text-body)]">{h.shares.toFixed(2)}</td>
                          <td className="px-2 py-1 text-right font-mono text-[var(--text-muted)]">{fmt(h.costBasis)}</td>
                          <td className="px-2 py-1 text-right font-mono font-semibold text-[var(--text-primary)]">{fmt(h.marketValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Import Button */}
          {(syncTxns.length > 0 || balanceUpdates.length > 0 || holdingsUpdates.length > 0) && (
            <button
              onClick={handleImport}
              disabled={importing || (validTxnCount === 0 && selectedBalanceCount === 0 && selectedHoldingsCount === 0)}
              className="w-full py-2.5 bg-[var(--color-positive)] text-white rounded-lg text-[13px] font-semibold border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed btn-success">
              {importing ? 'Importing...' : (() => {
                const parts = [];
                if (validTxnCount > 0) parts.push(`${validTxnCount} Transaction${validTxnCount !== 1 ? 's' : ''}`);
                if (selectedBalanceCount > 0) parts.push(`${selectedBalanceCount} Balance${selectedBalanceCount !== 1 ? 's' : ''}`);
                if (selectedHoldingsCount > 0) parts.push('Holdings');
                return `Import ${parts.join(' & Update ')}`;
              })()}
            </button>
          )}
        </div>
      )}
    </div>

    {/* Split Editor Modal */}
    {splitEditingIdx !== null && (
      <ResponsiveModal isOpen={true} onClose={() => handleSplitCancel(splitEditingIdx)} maxWidth="32rem">
        <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-3">Split Transaction</h3>
        <div className="text-[12px] text-[var(--text-muted)] mb-3 font-mono">
          {syncTxns[splitEditingIdx].description} — {fmt(Math.abs(syncTxns[splitEditingIdx].amount))}
        </div>
        <SplitEditor
          totalAmount={syncTxns[splitEditingIdx].amount}
          initialSplits={syncTxns[splitEditingIdx].splits ?? undefined}
          categories={categories}
          onApply={(splits) => handleSplitApply(splitEditingIdx, splits)}
          onCancel={() => handleSplitCancel(splitEditingIdx)}
          compact
        />
      </ResponsiveModal>
    )}
    </>
  );
}
