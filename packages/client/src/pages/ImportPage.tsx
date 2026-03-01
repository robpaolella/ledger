import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { fmt } from '../lib/formatters';
import { getCategoryColor } from '../lib/categoryColors';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import DuplicateComparison from '../components/DuplicateComparison';
import BankSyncPanel from '../components/BankSyncPanel';
import SortableHeader from '../components/SortableHeader';
import InlineNotification from '../components/InlineNotification';
import ResponsiveModal from '../components/ResponsiveModal';
import SplitEditor from '../components/SplitEditor';
import type { SplitRow } from '../components/SplitEditor';
import { useIsMobile } from '../hooks/useIsMobile';

interface Account {
  id: number;
  name: string;
  last_four: string | null;
  owner: string;
  owners?: { id: number; displayName: string }[];
  isShared?: boolean;
  type: string;
}

interface Category {
  id: number;
  group_name: string;
  sub_name: string;
  display_name: string;
  type: string;
}

interface ParseResult {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  detectedFormat: string;
  suggestedMapping: { date: number; description: number; amount: number };
}

interface CategorizedRow {
  date: string;
  description: string;
  amount: number;
  suggestedCategoryId: number | null;
  suggestedGroupName: string | null;
  suggestedSubName: string | null;
  confidence: number;
  // User overrides
  categoryId: number | null;
  groupName: string | null;
  subName: string | null;
  // Split support
  splits: SplitRow[] | null;
  // Duplicate detection
  duplicateStatus: 'exact' | 'possible' | 'none';
  duplicateMatch: {
    id: number;
    date: string;
    description: string;
    amount: number;
    accountName: string | null;
    category: string | null;
  } | null;
  // Transfer detection
  isLikelyTransfer: boolean;
  transferTooltip?: string;
}

const STEPS = ['Upload File', 'Map Columns', 'Review & Categorize'];

function normalizeAmount(raw: string): number {
  let s = raw.trim().replace(/"/g, '');
  const isParenthesized = /^\(.*\)$/.test(s);
  s = s.replace(/[($,+\s)]/g, '');
  const val = parseFloat(s);
  if (isNaN(val)) return 0;
  return isParenthesized ? -val : val;
}

export default function ImportPage() {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'csv' | 'sync'>(searchParams.get('tab') === 'csv' ? 'csv' : searchParams.get('tab') === 'sync' ? 'sync' : 'csv');
  const [mobileFlowActive, setMobileFlowActive] = useState(false);
  const [hasConnections, setHasConnections] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState({ date: 0, description: 1, amount: 2 });
  const [venmoMapping, setVenmoMapping] = useState({ from: -1, to: -1, note: -1 });
  const [categorizedRows, setCategorizedRows] = useState<CategorizedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [selectedImportRows, setSelectedImportRows] = useState<Set<number>>(new Set());
  const [signConvention, setSignConvention] = useState<'bank' | 'credit'>('bank');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [modalAccountId, setModalAccountId] = useState<number | ''>('');
  const [expandedDupeRow, setExpandedDupeRow] = useState<number | null>(null);
  const [csvSortBy, setCsvSortBy] = useState('date');
  const [csvSortDir, setCsvSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (notification) { const t = setTimeout(() => setNotification(null), 5000); return () => clearTimeout(t); }
  }, [notification]);

  useEffect(() => {
    apiFetch<{ data: Account[] }>('/accounts').then((r) => setAccounts(r.data));
    apiFetch<{ data: Category[] }>('/categories').then((r) => setCategories(r.data));
    // Check if SimpleFIN connections exist to set default tab
    apiFetch<{ data: { id: number }[] }>('/simplefin/connections').then((r) => {
      const has = r.data.length > 0;
      setHasConnections(has);
      // Set default tab if not specified in URL
      if (!searchParams.get('tab') && has) setActiveTab('sync');
    }).catch(() => setHasConnections(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCsvSort = (key: string) => {
    if (key === csvSortBy) setCsvSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setCsvSortBy(key); setCsvSortDir('asc'); }
  };

  const sortedCsvIndices = React.useMemo(() => {
    const indices = categorizedRows.map((_, i) => i);
    const dir = csvSortDir === 'asc' ? 1 : -1;
    indices.sort((a, b) => {
      const ra = categorizedRows[a], rb = categorizedRows[b];
      switch (csvSortBy) {
        case 'date': return dir * ra.date.localeCompare(rb.date);
        case 'description': return dir * ra.description.localeCompare(rb.description);
        case 'amount': return dir * (ra.amount - rb.amount);
        case 'category': {
          const ca = categories.find(c => c.id === ra.categoryId)?.display_name || '';
          const cb = categories.find(c => c.id === rb.categoryId)?.display_name || '';
          return dir * ca.localeCompare(cb);
        }
        case 'confidence': return dir * ((ra.confidence || 0) - (rb.confidence || 0));
        default: return 0;
      }
    });
    return indices;
  }, [categorizedRows, csvSortBy, csvSortDir, categories]);

  const handleFile = async (f: File) => {
    if (!selectedAccountId) {
      setPendingFile(f);
      setModalAccountId('');
      setShowAccountModal(true);
      return;
    }
    await processFile(f);
  };

  const handleAccountModalContinue = async () => {
    if (!modalAccountId || !pendingFile) return;
    setSelectedAccountId(modalAccountId);
    const acct = accounts.find(a => a.id === modalAccountId);
    setSignConvention(acct?.type === 'credit' ? 'credit' : 'bank');
    setShowAccountModal(false);
    await processFile(pendingFile);
    setPendingFile(null);
  };

  const handleAccountModalCancel = () => {
    setShowAccountModal(false);
    setPendingFile(null);
    setModalAccountId('');
  };

  const processFile = async (f: File) => {
    setFile(f);
    const formData = new FormData();
    formData.append('file', f);

    try {
      const res = await apiFetch<{ data: ParseResult }>('/import/parse', {
        method: 'POST',
        body: formData,
      });

      setParseResult(res.data);
      setMapping(res.data.suggestedMapping);

      // Auto-map Venmo columns
      if (res.data.detectedFormat === 'venmo') {
        const h = res.data.headers.map(x => x.toLowerCase());
        setVenmoMapping({
          from: h.findIndex(x => /^from$/i.test(x)),
          to: h.findIndex(x => /^to$/i.test(x)),
          note: h.findIndex(x => /note/i.test(x)),
        });
      }
    } catch (err) {
      console.error('Failed to parse CSV:', err);
      setNotification({ type: 'error', message: 'Failed to parse CSV file. Check console for details.' });
      setFile(null);
      return;
    }

    // Store all rows (we'll need them for step 3)
    // Re-parse locally to get all rows
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const parsedRows = lines.slice(1).map((line) => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    }).filter((r) => r.some((c) => c.trim()));

    setAllRows(parsedRows);
    setStep(1);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleAutoCategorize = async () => {
    if (!parseResult) return;

    const acct = accounts.find(a => a.id === selectedAccountId);
    const isVenmo = parseResult?.detectedFormat === 'venmo' || acct?.type === 'venmo';
    const ownerName = acct?.owners?.[0]?.displayName || acct?.owner || '';

    const items = allRows.map((row) => {
      let description = row[mapping.description] || '';
      // Build Venmo description from From/To + Note
      if (isVenmo && venmoMapping.from >= 0 && venmoMapping.to >= 0) {
        const from = row[venmoMapping.from]?.trim() || '';
        const to = row[venmoMapping.to]?.trim() || '';
        const note = venmoMapping.note >= 0 ? row[venmoMapping.note]?.trim() || '' : '';
        const isOutbound = from.toLowerCase() === ownerName.toLowerCase();
        const name = isOutbound ? to : from;
        const prefix = isOutbound ? `To ${name}` : name;
        description = note ? `${prefix}: "${note}"` : prefix;
      }
      return {
        description,
        amount: normalizeAmount(row[mapping.amount] || '0'),
      };
    }).filter((item) => item.description.trim());

    const res = await apiFetch<{ data: CategorizedRow[] }>('/import/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });

    // Merge with row data (date + amount)
    const merged = res.data.map((cat, i) => {
      const row = allRows[i];
      const dateStr = row?.[mapping.date] || '';
      const rawAmt = row?.[mapping.amount] || '0';
      const amt = normalizeAmount(rawAmt);

      // Parse date
      let date = dateStr;
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        date = parsed.toISOString().slice(0, 10);
      }

      // Convert amount based on sign convention
      // Bank: positive CSV = money in (income) = negative stored; negative CSV = money out (expense) = positive stored
      // Credit: positive CSV = charge (expense) = positive stored; negative CSV = credit (refund) = negative stored
      const amount = signConvention === 'bank' ? -amt : amt;

      return {
        date,
        description: cat.description,
        amount,
        suggestedCategoryId: cat.suggestedCategoryId,
        suggestedGroupName: cat.suggestedGroupName,
        suggestedSubName: cat.suggestedSubName,
        confidence: cat.confidence,
        categoryId: cat.suggestedCategoryId,
        groupName: cat.suggestedGroupName,
        subName: cat.suggestedSubName,
        duplicateStatus: 'none' as CategorizedRow['duplicateStatus'],
        duplicateMatch: null as CategorizedRow['duplicateMatch'],
        isLikelyTransfer: false,
        splits: null,
      };
    });

    // Run duplicate detection in batch
    try {
      const dupeCheckItems = merged.map((r) => ({ date: r.date, amount: r.amount, description: r.description }));
      const dupeRes = await apiFetch<{ data: { index: number; status: 'exact' | 'possible' | 'none'; matchId: number | null; matchDescription?: string; matchDate?: string; matchAmount?: number; matchAccountName?: string }[] }>(
        '/import/check-duplicates',
        { method: 'POST', body: JSON.stringify({ items: dupeCheckItems }) }
      );
      for (const d of dupeRes.data) {
        if (d.status !== 'none' && merged[d.index]) {
          merged[d.index].duplicateStatus = d.status;
          if (d.matchId) {
            merged[d.index].duplicateMatch = {
              id: d.matchId,
              date: d.matchDate || '',
              description: d.matchDescription || '',
              amount: d.matchAmount ?? merged[d.index].amount,
              accountName: d.matchAccountName || null,
              category: null,
            };
          }
        }
      }
    } catch {
      // Duplicate detection failed — continue without it
    }

    // Run transfer detection in batch
    try {
      const transferItems = merged.map((r) => ({ description: r.description, amount: r.amount }));
      const transferRes = await apiFetch<{ data: boolean[] }>(
        '/import/check-transfers',
        { method: 'POST', body: JSON.stringify({ items: transferItems }) }
      );
      transferRes.data.forEach((isTransfer, i) => {
        if (isTransfer && merged[i]) {
          merged[i].isLikelyTransfer = true;
        }
      });
    } catch {
      // Transfer detection failed — continue without it
    }

    setCategorizedRows(merged);
    // Auto-uncheck exact duplicates
    const selected = new Set(merged.map((_, i) => i));
    merged.forEach((r, i) => { if (r.duplicateStatus === 'exact' || !r.categoryId) selected.delete(i); });
    setSelectedImportRows(selected);
    setStep(2);
  };

  const handleImport = async () => {
    if (!selectedAccountId) return;
    const validRows = categorizedRows.filter((r, i) => selectedImportRows.has(i) && (r.categoryId != null || (r.splits && r.splits.length >= 2)));
    if (validRows.length === 0) { setNotification({ type: 'error', message: 'No transactions with assigned categories to import.' }); return; }

    setImporting(true);
    try {
      await apiFetch('/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          transactions: validRows.map((r) => ({
            date: r.date,
            description: r.description,
            categoryId: r.splits ? null : r.categoryId,
            amount: r.amount,
            ...(r.splits ? { splits: r.splits } : {}),
          })),
        }),
      });
      addToast(`Import complete — ${validRows.length} transactions imported`);
      navigate('/transactions');
    } catch (_err) {
      addToast('Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  const updateRowCategory = (idx: number, catId: number) => {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;
    setCategorizedRows((prev) => prev.map((r, i) => i === idx ? {
      ...r,
      categoryId: catId,
      groupName: cat.group_name,
      subName: cat.sub_name,
      confidence: 1.0,
    } : r));
    setSelectedImportRows(prev => { const next = new Set(prev); next.add(idx); return next; });
  };


  // Group ALL categories for grouped dropdown
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

  const validImportCount = categorizedRows.filter((r, i) => selectedImportRows.has(i) && (r.categoryId != null || (r.splits && r.splits.length >= 2))).length;

  // Split editor modal state for import rows
  const [splitEditingIdx, setSplitEditingIdx] = useState<number | null>(null);

  const handleSplitApply = (idx: number, appliedSplits: SplitRow[]) => {
    setCategorizedRows((prev) => prev.map((r, i) => i === idx ? {
      ...r,
      categoryId: null,
      groupName: null,
      subName: null,
      splits: appliedSplits,
    } : r));
    setSelectedImportRows(prev => { const next = new Set(prev); next.add(idx); return next; });
    setSplitEditingIdx(null);
    addToast(`Split applied across ${appliedSplits.length} categories`, 'success');
  };

  const handleSplitCancel = (idx: number) => {
    // If there were already splits, keep them; otherwise just close modal
    setSplitEditingIdx(null);
    // If row has no category and no splits, keep it unchecked
    const row = categorizedRows[idx];
    if (!row.categoryId && (!row.splits || row.splits.length < 2)) {
      setSelectedImportRows(prev => { const next = new Set(prev); next.delete(idx); return next; });
    }
  };

  const switchTab = (tab: 'csv' | 'sync') => {
    setActiveTab(tab);
    setSearchParams(tab === 'csv' ? {} : { tab: 'sync' });
  };

  return (
    <div>
      {isMobile && !mobileFlowActive ? (
        /* Mobile: Two stacked action cards */
        <div>
          <div className="mb-4">
            <h1 className="page-title text-[22px] font-bold text-[var(--text-primary)] m-0">Import</h1>
          </div>

          {/* Bank Sync Card */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] px-5 py-6 mb-4 text-center">
            <div className="text-[32px] mb-2">🏦</div>
            <div className="text-[15px] font-bold text-[var(--text-primary)] mb-1">Bank Sync</div>
            <div className="text-[12px] text-[var(--text-secondary)] mb-4">Pull transactions from your connected bank accounts</div>
            <button
              onClick={() => { switchTab('sync'); setMobileFlowActive(true); }}
              disabled={!hasPermission('import.bank_sync')}
              className="w-full py-2.5 rounded-lg border-none cursor-pointer text-[13px] font-semibold bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] disabled:opacity-50 btn-primary"
            >
              Sync Now
            </button>
            {hasConnections && (
              <div className="text-[10px] text-[var(--text-muted)] mt-2">
                Bank accounts linked
              </div>
            )}
          </div>

          {/* CSV Import Card */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] shadow-[var(--bg-card-shadow)] px-5 py-6 text-center">
            <div className="text-[32px] mb-2">📄</div>
            <div className="text-[15px] font-bold text-[var(--text-primary)] mb-1">CSV Import</div>
            <div className="text-[12px] text-[var(--text-secondary)] mb-4">Upload a CSV file from your bank or credit card</div>
            <button
              onClick={() => { switchTab('csv'); setMobileFlowActive(true); }}
              disabled={!hasPermission('import.csv')}
              className="w-full py-2.5 rounded-lg border-none cursor-pointer text-[13px] font-semibold bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] disabled:opacity-50 btn-secondary"
            >
              Upload File
            </button>
          </div>
        </div>
      ) : (
      <div>
      {/* Header */}
      <div className="mb-4">
        <h1 className="page-title text-[22px] font-bold text-[var(--text-primary)] m-0">Import Transactions</h1>
        <p className="page-subtitle text-[var(--text-secondary)] text-[13px] mt-1">
          {activeTab === 'csv' ? 'Import CSV from your bank, credit card, or Venmo' : 'Pull transactions directly from your connected bank accounts'}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="inline-flex bg-[var(--btn-secondary-bg)] rounded-lg p-0.5 mb-6">
        {[
          { id: 'csv' as const, label: 'CSV Import' },
          { id: 'sync' as const, label: 'Bank Sync' },
        ].map((tab) => (
          <button key={tab.id} onClick={() => switchTab(tab.id)}
            className={`px-4 py-1.5 text-[13px] font-semibold rounded-md border-none cursor-pointer transition-all ${
              activeTab === tab.id
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs'
                : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bank Sync Tab */}
      {activeTab === 'sync' && (
        hasPermission('import.bank_sync')
          ? <BankSyncPanel categories={categories} />
          : <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-6 py-8 text-center text-[var(--text-muted)] text-[13px]">You don't have permission to use Bank Sync. Contact an admin to request access.</div>
      )}

      {/* CSV Import Tab */}
      {activeTab === 'csv' && !hasPermission('import.csv') && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-6 py-8 text-center text-[var(--text-muted)] text-[13px]">You don't have permission to import CSV files. Contact an admin to request access.</div>
      )}
      {activeTab === 'csv' && hasPermission('import.csv') && (
        <>
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

      {/* Inline notification banner */}
      {notification && (
        <InlineNotification
          type={notification.type}
          message={notification.message}
          dismissible
          onDismiss={() => setNotification(null)}
          className="mb-4"
        />
      )}

      {/* Step 1: Upload */}
      {step === 0 && (
        <div>
          {/* Account selector */}
          <div className="mb-4">
            <label className="text-[12px] text-[var(--text-secondary)] font-medium block mb-1">Import to Account</label>
            <select
              value={selectedAccountId}
              onChange={(e) => {
                const id = e.target.value ? parseInt(e.target.value) : '';
                setSelectedAccountId(id);
                if (id) {
                  const acct = accounts.find(a => a.id === id);
                  setSignConvention(acct?.type === 'credit' ? 'credit' : 'bank');
                }
              }}
              className="border border-[var(--table-border)] rounded-lg bg-[var(--bg-input)] px-3 py-2 text-[13px] outline-none w-[300px] text-[var(--text-body)]"
            >
              <option value="">Select an account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.last_four ? ` (${a.last_four})` : ''} — {(a.owners || []).map(o => o.displayName).join(', ') || a.owner}
                </option>
              ))}
            </select>
          </div>

          {/* Drop zone */}
          <div
            className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] p-10 text-center shadow-[var(--bg-card-shadow)]"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className={`border-2 border-dashed rounded-2xl py-12 px-6 ${dragOver ? 'border-[#3b82f6] bg-[var(--bg-inline-info)]' : 'border-[var(--text-muted)] bg-transparent'}`}>
              <div className={`mb-3 ${dragOver ? 'text-[var(--badge-category-text)]' : 'text-[var(--text-muted)]'}`}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="mx-auto">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <p className="font-semibold text-[var(--btn-secondary-text)] text-[15px] mb-1">Drop your CSV file here</p>
              <p className="text-[var(--text-muted)] text-[13px]">
                or <span className="text-[var(--badge-category-text)] cursor-pointer font-medium" onClick={() => fileInputRef.current?.click()}>browse files</span>
              </p>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }} />
              <div className="flex gap-2 justify-center mt-4">
                {['Chase', 'Venmo', 'Generic CSV'].map((t) => (
                  <span key={t} className="text-[11px] px-2.5 py-0.5 bg-[var(--btn-secondary-bg)] rounded-full text-[var(--text-secondary)]">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Map Columns */}
      {step === 1 && parseResult && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)]">
          <div className={`flex justify-between items-center mb-2 ${isMobile ? 'flex-col gap-3 items-stretch' : ''}`}>
            <button
              onClick={() => setStep(0)}
              className="text-[12px] text-[var(--badge-category-text)] bg-transparent border-none cursor-pointer btn-ghost hover:underline"
            >
              ← Back
            </button>
            <button
              onClick={handleAutoCategorize}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-lg text-[13px] font-semibold border-none cursor-pointer btn-primary"
            >
              Next →
            </button>
          </div>
          <div className="mb-4">
            <p className="font-semibold text-[var(--text-primary)] m-0">{file?.name}</p>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1 m-0">
              Account: {accounts.find((a) => a.id === selectedAccountId)?.name} · {parseResult.totalRows} transactions · Format: {parseResult.detectedFormat}
            </p>
          </div>

          {/* Column mapping */}
          <div className="bg-[var(--bg-input)] rounded-lg p-4 mb-4">
            <p className="text-[12px] font-medium text-[var(--text-body)] m-0 mb-2">Column Mapping</p>
            <div className={isMobile ? 'flex flex-col gap-3' : 'flex gap-4'}>
              {(['date', 'description', 'amount'] as const).map((field) => (
                <div key={field} className="flex-1">
                  <label className="text-[11px] text-[var(--text-secondary)] block mb-1 capitalize">{field}</label>
                  <select
                    value={mapping[field]}
                    onChange={(e) => setMapping({ ...mapping, [field]: parseInt(e.target.value) })}
                    className="w-full border border-[var(--table-border)] rounded-md bg-[var(--bg-card)] px-2 py-1.5 text-[12px] outline-none text-[var(--text-body)]"
                  >
                    {parseResult.headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Venmo-specific mapping */}
          {(parseResult.detectedFormat === 'venmo' || accounts.find(a => a.id === selectedAccountId)?.type === 'venmo') && (
            <div className="bg-[var(--bg-input)] rounded-lg p-4 mb-4">
              <p className="text-[12px] font-medium text-[var(--text-body)] m-0 mb-2">Venmo Column Mapping</p>
              <div className={isMobile ? 'flex flex-col gap-3' : 'flex gap-4'}>
                {(['from', 'to', 'note'] as const).map((field) => (
                  <div key={field} className="flex-1">
                    <label className="text-[11px] text-[var(--text-secondary)] block mb-1 capitalize">{field === 'from' ? 'From' : field === 'to' ? 'To' : 'Note'}</label>
                    <select
                      value={venmoMapping[field]}
                      onChange={(e) => setVenmoMapping({ ...venmoMapping, [field]: parseInt(e.target.value) })}
                      className="w-full border border-[var(--table-border)] rounded-md bg-[var(--bg-card)] px-2 py-1.5 text-[12px] outline-none text-[var(--text-body)]"
                    >
                      <option value={-1}>— Not mapped —</option>
                      {parseResult.headers.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sign convention */}
          <div className="bg-[var(--bg-input)] rounded-lg p-4 mb-4">
            <p className="text-[12px] font-medium text-[var(--text-body)] m-0 mb-2">Amount Sign Convention</p>
            <div className={`flex gap-2 ${isMobile ? 'flex-col' : ''}`}>
              <button
                onClick={() => setSignConvention('bank')}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border cursor-pointer transition-colors ${signConvention === 'bank' ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-[var(--btn-primary-bg)] btn-primary' : 'bg-[var(--bg-card)] text-[var(--text-body)] border-[var(--table-border)] btn-secondary'}`}
              >
                Positive = money in, Negative = money out
              </button>
              <button
                onClick={() => setSignConvention('credit')}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border cursor-pointer transition-colors ${signConvention === 'credit' ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-[var(--btn-primary-bg)] btn-primary' : 'bg-[var(--bg-card)] text-[var(--text-body)] border-[var(--table-border)] btn-secondary'}`}
              >
                Positive = money out, Negative = money in
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] m-0 mt-1.5">
              {signConvention === 'bank' ? 'Standard for bank accounts (checking, savings)' : 'Standard for credit card statements'}
            </p>
          </div>

          {/* Sample preview */}
          <p className="text-[11px] text-[var(--text-muted)] m-0 mb-2">
            {isMobile ? 'Preview (first 5 rows — mapped columns only)' : 'Preview (first 5 rows)'}
          </p>
          {isMobile ? (
            <div className="flex flex-col gap-1.5">
              {parseResult.sampleRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5" style={{ borderBottom: i < parseResult.sampleRows.length - 1 ? '1px solid var(--bg-card-border)' : 'none' }}>
                  <span className="text-[11px] font-mono text-[var(--text-muted)] flex-shrink-0 w-[72px]">
                    {row[mapping.date]}
                  </span>
                  <span className="text-[11px] text-[var(--text-body)] flex-1 min-w-0 truncate">
                    {row[mapping.description]}
                  </span>
                  <span className="text-[11px] font-mono font-semibold flex-shrink-0 text-[var(--text-primary)]">
                    {row[mapping.amount]}
                  </span>
                </div>
              ))}
            </div>
          ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {parseResult.headers.map((h, i) => (
                  <th key={i} className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] px-2 py-1.5 border-b border-[var(--table-border)] text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parseResult.sampleRows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--table-row-border)]">
                  {row.map((cell, j) => (
                    <td key={j} className="px-2 py-1.5 text-[var(--text-body)] font-mono text-[11px]">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      )}

      {/* Step 3: Review & Categorize */}
      {step === 2 && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--bg-card-border)] px-5 py-4 shadow-[var(--bg-card-shadow)]">
          <div className={`flex justify-between items-center mb-4 ${isMobile ? 'flex-col gap-3 items-stretch' : ''}`}>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep(1)}
                className="text-[12px] text-[var(--badge-category-text)] bg-transparent border-none cursor-pointer btn-ghost hover:underline"
              >
                ← Back
              </button>
              <span className="flex items-center gap-1 px-2.5 py-1 bg-[var(--badge-category-bg)] rounded-lg text-[11px] text-[var(--badge-category-text)] font-semibold">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
                </svg>
                Auto-categorized
              </span>
              {!isMobile && <span className="text-[12px] text-[var(--text-secondary)]">Click any category to change it</span>}
            </div>
            <button
              onClick={handleImport}
              disabled={importing || validImportCount === 0}
              className={`px-4 py-2 bg-[var(--color-positive)] text-white rounded-lg text-[13px] font-semibold border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed btn-success ${isMobile ? 'w-full' : ''}`}
            >
              {importing ? 'Importing...' : `Import ${validImportCount} of ${categorizedRows.length} Transactions`}
            </button>
          </div>

          {isMobile ? (
            /* Mobile: card-based layout */
            <div className="flex flex-col gap-2">
              {sortedCsvIndices.map((i) => {
                const r = categorizedRows[i];
                return (
                  <React.Fragment key={i}>
                    <div className={`rounded-xl border px-3 py-2.5 transition-opacity ${
                      !selectedImportRows.has(i) ? 'opacity-50 border-[var(--bg-card-border)]' :
                      !r.categoryId ? 'border-[var(--bg-card-border)] bg-[var(--bg-needs-attention)]' :
                      'border-[var(--bg-card-border)] bg-[var(--bg-card)]'
                    }`}>
                      <div className="flex items-start gap-2.5">
                        <input type="checkbox" checked={selectedImportRows.has(i)}
                          onChange={() => {
                            setSelectedImportRows(prev => {
                              const next = new Set(prev);
                              if (next.has(i)) next.delete(i); else next.add(i);
                              return next;
                            });
                          }}
                          className="cursor-pointer mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          {/* Description + Amount */}
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                              {r.description}
                            </span>
                            <span className={`text-[13px] font-mono font-semibold flex-shrink-0 ${r.amount < 0 ? 'text-[#10b981]' : 'text-[var(--text-primary)]'}`}>
                              {r.amount < 0 ? '+' : ''}{fmt(Math.abs(r.amount))}
                            </span>
                          </div>
                          {/* Date + Confidence */}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[11px] font-mono text-[var(--text-muted)]">{r.date}</span>
                            <span className={`text-[10px] font-semibold font-mono ml-auto ${
                              r.confidence > 0.9 ? 'text-[#10b981]' : r.confidence > 0.6 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
                            }`}>
                              {Math.round(r.confidence * 100)}%
                            </span>
                          </div>
                          {/* Category dropdown */}
                          <div className="mt-2">
                            {r.splits && r.splits.length >= 2 ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1">
                                  <span className="inline-flex" style={{ gap: 0 }}>
                                    {getSplitColors(r.splits).map((color, ci) => (
                                      <span key={ci} style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: color,
                                        border: '1.5px solid var(--bg-card)',
                                        marginLeft: ci > 0 ? -3 : 0,
                                        zIndex: r.splits!.length - ci,
                                        display: 'inline-block',
                                      }} />
                                    ))}
                                  </span>
                                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Split ({r.splits.length})</span>
                                </span>
                                <button onClick={() => setSplitEditingIdx(i)}
                                  className="text-[11px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer p-0 hover:underline">Edit</button>
                              </div>
                            ) : (
                              <>
                                {r.groupName && r.categoryId && (
                                  <div className="text-[10px] text-[var(--text-muted)] mb-0.5">{r.groupName}</div>
                                )}
                                <div className="flex items-center gap-1">
                                  <select
                                    className="flex-1 text-[12px] border border-[var(--table-border)] rounded-md px-2 py-1.5 outline-none bg-[var(--bg-card)] text-[var(--text-body)]"
                                    value={r.categoryId || ''}
                                    onChange={(e) => updateRowCategory(i, parseInt(e.target.value))}
                                  >
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
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="5 12 12 5 19 12" />
                                      <line x1="5" y1="19" x2="19" y2="19" />
                                    </svg>
                                  </button>
                                </div>
                              </>
                            )}
                            {(r.duplicateStatus !== 'none' || r.isLikelyTransfer) && (
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                {r.duplicateStatus !== 'none' && (
                                  <button
                                    onClick={() => setExpandedDupeRow(expandedDupeRow === i ? null : i)}
                                    className="text-[11px] font-medium border-none cursor-pointer px-2 py-0.5 rounded-full hover:opacity-80"
                                    style={{
                                      background: r.duplicateStatus === 'exact' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                                      color: r.duplicateStatus === 'exact' ? 'var(--color-negative)' : 'var(--color-warning)',
                                    }}>
                                    ⚠ {r.duplicateStatus === 'exact' ? 'Likely Duplicate' : 'Possible Duplicate'}
                                  </button>
                                )}
                                {r.isLikelyTransfer && (
                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                                    style={{ background: 'var(--badge-transfer-bg)', color: 'var(--badge-transfer-text)' }}>↔ Likely Transfer</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {expandedDupeRow === i && r.duplicateMatch && (
                      <div className="px-2 -mt-1 mb-1">
                        <DuplicateComparison
                          incoming={{ date: r.date, description: r.description, amount: r.amount,
                            accountName: accounts.find(a => a.id === selectedAccountId)?.name || null }}
                          existing={{ date: r.duplicateMatch.date, description: r.duplicateMatch.description,
                            amount: r.duplicateMatch.amount, accountName: r.duplicateMatch.accountName,
                            category: r.duplicateMatch.category }}
                          onImportAnyway={() => {
                            setSelectedImportRows(prev => { const next = new Set(prev); next.add(i); return next; });
                            setExpandedDupeRow(null);
                          }}
                          onSkip={() => {
                            setSelectedImportRows(prev => { const next = new Set(prev); next.delete(i); return next; });
                            setExpandedDupeRow(null);
                          }}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            /* Desktop: table layout */
            <table className="w-full border-collapse text-[13px]">
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: '100px' }} />
                <col />
                <col style={{ width: '100px' }} />
                <col style={{ minWidth: '220px' }} />
                <col style={{ width: '60px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="px-2 py-2 border-b-2 border-[var(--table-border)]">
                    <input type="checkbox"
                      checked={selectedImportRows.size === categorizedRows.length && categorizedRows.length > 0}
                      onChange={() => {
                        if (selectedImportRows.size === categorizedRows.length) setSelectedImportRows(new Set());
                        else setSelectedImportRows(new Set(categorizedRows.map((_, i) => i)));
                      }}
                      className="cursor-pointer" />
                  </th>
                  <SortableHeader label="Date" sortKey="date" activeSortKey={csvSortBy} sortDir={csvSortDir} onSort={handleCsvSort} />
                  <SortableHeader label="Description" sortKey="description" activeSortKey={csvSortBy} sortDir={csvSortDir} onSort={handleCsvSort} />
                  <SortableHeader label="Amount" sortKey="amount" activeSortKey={csvSortBy} sortDir={csvSortDir} onSort={handleCsvSort} align="right" />
                  <SortableHeader label="Category" sortKey="category" activeSortKey={csvSortBy} sortDir={csvSortDir} onSort={handleCsvSort} />
                  <SortableHeader label="Conf." sortKey="confidence" activeSortKey={csvSortBy} sortDir={csvSortDir} onSort={handleCsvSort} align="center" />
                </tr>
              </thead>
              <tbody>
                {sortedCsvIndices.map((i) => {
                  const r = categorizedRows[i];
                  return (
                  <React.Fragment key={i}>
                    <tr className={`border-b border-[var(--table-row-border)] ${!selectedImportRows.has(i) ? 'opacity-50' : ''} ${!r.categoryId && selectedImportRows.has(i) ? 'bg-[var(--bg-needs-attention)]' : ''}`}>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={selectedImportRows.has(i)}
                          onChange={() => {
                            setSelectedImportRows(prev => {
                              const next = new Set(prev);
                              if (next.has(i)) next.delete(i); else next.add(i);
                              return next;
                            });
                          }}
                          className="cursor-pointer" />
                      </td>
                      <td className="px-2.5 py-2 font-mono text-[12px] text-[var(--text-body)] truncate">{r.date}</td>
                      <td className="px-2.5 py-2 font-medium text-[var(--text-primary)] truncate">{r.description}</td>
                      <td className={`px-2.5 py-2 text-right font-mono font-semibold ${r.amount < 0 ? 'text-[#10b981]' : 'text-[var(--text-primary)]'}`}>
                        {r.amount < 0 ? '+' : ''}{fmt(Math.abs(r.amount))}
                      </td>
                      <td className="px-2.5 py-1.5">
                        {r.splits && r.splits.length >= 2 ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-flex" style={{ gap: 0 }}>
                                {getSplitColors(r.splits).map((color, ci) => (
                                  <span key={ci} style={{
                                    width: 10, height: 10, borderRadius: '50%',
                                    background: color,
                                    border: '1.5px solid var(--bg-card)',
                                    marginLeft: ci > 0 ? -3 : 0,
                                    zIndex: r.splits!.length - ci,
                                    display: 'inline-block',
                                  }} />
                                ))}
                              </span>
                              <span className="text-[10px] font-semibold text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] whitespace-nowrap">Split ({r.splits.length})</span>
                            </span>
                            <button onClick={() => setSplitEditingIdx(i)}
                              className="ml-1 text-[10px] text-[var(--text-muted)] bg-transparent border-none cursor-pointer p-0 hover:underline">Edit</button>
                          </div>
                        ) : (
                          <>
                            {r.groupName && r.categoryId && (
                              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">{r.groupName}</div>
                            )}
                            <div className="flex items-center gap-1">
                              <select
                                className="flex-1 text-[11px] border border-[var(--table-border)] rounded-md px-1.5 py-1 outline-none bg-[var(--bg-card)] text-[var(--text-body)]"
                                value={r.categoryId || ''}
                                onChange={(e) => updateRowCategory(i, parseInt(e.target.value))}
                              >
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
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="12" y1="5" x2="12" y2="19" /><polyline points="5 12 12 5 19 12" />
                                  <line x1="5" y1="19" x2="19" y2="19" />
                                </svg>
                              </button>
                            </div>
                          </>
                        )}
                        {(r.duplicateStatus !== 'none' || r.isLikelyTransfer) && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {r.duplicateStatus !== 'none' && (
                              <button
                                onClick={() => setExpandedDupeRow(expandedDupeRow === i ? null : i)}
                                className="text-[11px] font-medium border-none cursor-pointer px-2 py-0.5 rounded-full hover:opacity-80"
                                style={{
                                  background: r.duplicateStatus === 'exact' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                                  color: r.duplicateStatus === 'exact' ? 'var(--color-negative)' : 'var(--color-warning)',
                                }}>
                                ⚠ {r.duplicateStatus === 'exact' ? 'Likely Duplicate' : 'Possible Duplicate'}
                              </button>
                            )}
                            {r.isLikelyTransfer && (
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                                style={{ background: 'var(--badge-transfer-bg)', color: 'var(--badge-transfer-text)' }}>↔ Likely Transfer</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <span className={`text-[11px] font-semibold font-mono ${
                          r.confidence > 0.9 ? 'text-[#10b981]' : r.confidence > 0.6 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
                        }`}>
                          {Math.round(r.confidence * 100)}%
                        </span>
                      </td>
                    </tr>
                    {expandedDupeRow === i && r.duplicateMatch && (
                      <tr>
                        <td colSpan={6} className="px-2.5 py-1">
                          <DuplicateComparison
                            incoming={{ date: r.date, description: r.description, amount: r.amount,
                              accountName: accounts.find(a => a.id === selectedAccountId)?.name || null }}
                            existing={{ date: r.duplicateMatch.date, description: r.duplicateMatch.description,
                              amount: r.duplicateMatch.amount, accountName: r.duplicateMatch.accountName,
                              category: r.duplicateMatch.category }}
                            onImportAnyway={() => {
                              setSelectedImportRows(prev => { const next = new Set(prev); next.add(i); return next; });
                              setExpandedDupeRow(null);
                            }}
                            onSkip={() => {
                              setSelectedImportRows(prev => { const next = new Set(prev); next.delete(i); return next; });
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

      {/* Account selection modal */}
      <ResponsiveModal isOpen={showAccountModal} onClose={handleAccountModalCancel} maxWidth="420px">
            <h2 className="text-[16px] font-bold text-[var(--text-primary)] m-0 mb-1">Select Account</h2>
            <p className="text-[13px] text-[var(--text-secondary)] m-0 mb-4">Which account is this import for?</p>
            <select
              value={modalAccountId}
              onChange={(e) => setModalAccountId(e.target.value ? parseInt(e.target.value) : '')}
              className="w-full border border-[var(--table-border)] rounded-lg bg-[var(--bg-input)] px-3 py-2 text-[13px] outline-none mb-4 text-[var(--text-body)]"
            >
              <option value="">Select an account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.last_four ? ` (${a.last_four})` : ''} — {(a.owners || []).map(o => o.displayName).join(', ') || a.owner}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={handleAccountModalCancel} className="px-4 py-2 text-[13px] font-medium text-[var(--text-body)] bg-[var(--btn-secondary-bg)] rounded-lg border-none cursor-pointer btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleAccountModalContinue}
                disabled={!modalAccountId}
                className="px-4 py-2 text-[13px] font-semibold text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] rounded-lg border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed btn-primary"
              >
                Continue
              </button>
            </div>
      </ResponsiveModal>
      </>
      )}

      {/* Split Editor Modal */}
      {splitEditingIdx !== null && (
        <ResponsiveModal isOpen={true} onClose={() => handleSplitCancel(splitEditingIdx)} maxWidth="32rem">
          <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-3">Split Transaction</h3>
          <div className="text-[12px] text-[var(--text-muted)] mb-3 font-mono">
            {categorizedRows[splitEditingIdx].description} — {fmt(Math.abs(categorizedRows[splitEditingIdx].amount))}
          </div>
          <SplitEditor
            totalAmount={categorizedRows[splitEditingIdx].amount}
            initialSplits={categorizedRows[splitEditingIdx].splits ?? undefined}
            categories={categories}
            onApply={(splits) => handleSplitApply(splitEditingIdx, splits)}
            onCancel={() => handleSplitCancel(splitEditingIdx)}
            compact
          />
        </ResponsiveModal>
      )}
    </div>
    )}
    </div>
  );
}
