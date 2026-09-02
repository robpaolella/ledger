import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { Stepper, vendorColor, type ImpCategory } from '../components/import/cells';
import { SegmentedControl } from '../components/primitives';
import { MobileBar } from '../components/PageHeader';
import BankSyncSelect from '../components/import/BankSyncSelect';
import SyncReview from '../components/import/SyncReview';
import CsvUpload from '../components/import/CsvUpload';
import CsvMap, { type CsvPreviewRow } from '../components/import/CsvMap';
import CsvReview from '../components/import/CsvReview';
import type { SyncAccount, ImpSyncRow, ImpCsvRow, AccountMeta } from '../components/import/types';

// ── Data shapes ─────────────────────────────────────────────────────────────
interface EnrichedAccount {
  id: number;
  name: string;
  last_four: string | null;
  type: string;
  classification: 'liquid' | 'investment' | 'liability';
  avatar_url: string | null;
  institutionRef: { id: number; name: string; logo_url: string | null; color: string | null } | null;
  owners: { id: number; displayName: string }[];
  isShared: boolean;
}
interface Merchant { id: number; name: string; logo_url: string | null }
interface LinkedAccountGroup {
  connectionId: number;
  connectionLabel: string;
  accounts: {
    account_id: number;
    simplefin_account_name: string;
    simplefin_org_name: string | null;
    last_synced_at: string | null;
    auto_import: number;
  }[];
}
interface ParseResult {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  detectedFormat: string;
  suggestedMapping: { date: number; description: number; amount: number };
  headerRowIndex: number;
}

// ── CSV helpers (ported from the previous ImportPage) ────────────────────────
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function normalizeAmount(raw: string): number {
  let s = (raw ?? '').trim().replace(/"/g, '');
  const paren = /^\(.*\)$/.test(s);
  s = s.replace(/[($,+\s)]/g, '');
  const v = parseFloat(s);
  if (isNaN(v)) return 0;
  return paren ? -v : v;
}
function parseDate(s: string): string {
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}
function isImportableVenmoRow(type: string, status: string, from: string, to: string): boolean {
  const t = type.trim().toLowerCase();
  const st = status.trim().toLowerCase();
  if (st && /incomplete|declined|expired|cancelled/.test(st)) return false;
  if (/transfer|add funds/.test(t)) return false;
  if (!from.trim() && !to.trim()) return false;
  return t === 'payment' || t === 'charge';
}
function buildVenmoDescription(type: string, from: string, to: string, note: string, amount: number): string {
  const t = type.trim().toLowerCase();
  const moneyIn = amount >= 0;
  const cp = t === 'charge' ? (moneyIn ? to : from) : (moneyIn ? from : to);
  const prefix = `${moneyIn ? 'From' : 'To'} ${cp || from || to || 'Venmo'}`;
  return note ? `${prefix}: ${note}` : prefix;
}

export default function ImportPage() {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [mode, setMode] = useState<'csv' | 'sync'>(searchParams.get('tab') === 'csv' ? 'csv' : 'sync');

  // shared data
  const [accounts, setAccounts] = useState<EnrichedAccount[]>([]);
  const [categories, setCategories] = useState<ImpCategory[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [linkedGroups, setLinkedGroups] = useState<LinkedAccountGroup[]>([]);

  // csv state
  const [csvStep, setCsvStep] = useState(1);
  const [csvAccountId, setCsvAccountId] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState({ date: 0, description: 1, amount: 2 });
  const [venmoMapping, setVenmoMapping] = useState({ from: -1, to: -1, note: -1 });
  const [sign, setSign] = useState<'bank' | 'credit'>('bank');
  const [csvRows, setCsvRows] = useState<ImpCsvRow[]>([]);
  const [csvSelected, setCsvSelected] = useState<Set<number>>(new Set());
  const [csvImporting, setCsvImporting] = useState(false);

  // sync state
  const [syncStep, setSyncStep] = useState(1);
  const [syncRows, setSyncRows] = useState<ImpSyncRow[]>([]);
  const [syncSelected, setSyncSelected] = useState<Set<number>>(new Set());
  const [fetching, setFetching] = useState(false);
  const [syncImporting, setSyncImporting] = useState(false);
  const [fetchedRange, setFetchedRange] = useState<{ startDate: string; endDate: string } | null>(null);

  useEffect(() => {
    apiFetch<{ data: EnrichedAccount[] }>('/accounts').then((r) => setAccounts(r.data)).catch(() => {});
    apiFetch<{ data: ImpCategory[] }>('/categories').then((r) => setCategories(r.data)).catch(() => {});
    apiFetch<{ data: Merchant[] }>('/merchants').then((r) => setMerchants(r.data)).catch(() => {});
    apiFetch<{ data: LinkedAccountGroup[] }>('/simplefin/linked-accounts').then((r) => setLinkedGroups(r.data)).catch(() => {});
    // Default tab: Bank Sync when the user has linked accounts, unless ?tab set.
    if (!searchParams.get('tab')) {
      apiFetch<{ data: { id: number }[] }>('/simplefin/connections')
        .then((r) => { if (r.data.length === 0) setMode('csv'); })
        .catch(() => setMode('csv'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = (m: 'csv' | 'sync') => {
    setMode(m);
    setSearchParams(m === 'csv' ? { tab: 'csv' } : {}, { replace: true });
  };

  // ── Derived lookups ──────────────────────────────────────────────────────────
  const accountsById = useMemo(() => {
    const m = new Map<number, AccountMeta>();
    for (const a of accounts) {
      m.set(a.id, {
        name: a.name,
        lastFour: a.last_four,
        logoSrc: a.avatar_url || a.institutionRef?.logo_url || undefined,
        color: a.institutionRef?.color || vendorColor(a.name),
      });
    }
    return m;
  }, [accounts]);

  const syncAccounts: SyncAccount[] = useMemo(() => {
    const linked = new Map<number, LinkedAccountGroup['accounts'][number]>();
    for (const g of linkedGroups) for (const a of g.accounts) linked.set(a.account_id, a);
    return accounts.filter((a) => linked.has(a.id)).map((a) => {
      const l = linked.get(a.id)!;
      return {
        id: a.id,
        name: a.name,
        lastFour: a.last_four,
        bucket: (['liquid', 'investment', 'liability'].includes(a.classification) ? a.classification : 'liquid') as SyncAccount['bucket'],
        owners: a.owners,
        isShared: a.isShared,
        logoSrc: a.avatar_url || a.institutionRef?.logo_url || undefined,
        color: a.institutionRef?.color || vendorColor(a.institutionRef?.name || a.name),
        institutionName: a.institutionRef?.name || l.simplefin_org_name || '',
        sfinName: l.simplefin_account_name,
        syncedAt: l.last_synced_at,
        autoImport: l.auto_import === 1,
      };
    });
  }, [accounts, linkedGroups]);

  const vendorOptions = useMemo(() => [...new Set(merchants.map((m) => m.name))].sort((a, b) => a.localeCompare(b)), [merchants]);
  const merchantLogos = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of merchants) if (x.logo_url) m.set(x.name.trim().toLowerCase(), x.logo_url);
    return m;
  }, [merchants]);

  // ── CSV: preview (recomputed on mapping/sign/account) ────────────────────────
  const csvPreview: CsvPreviewRow[] = useMemo(() => {
    if (!parseResult) return [];
    const acct = accounts.find((a) => a.id === csvAccountId);
    const acctLabel = acct ? `${acct.name}${acct.last_four ? ` ····${acct.last_four}` : ''}` : '—';
    const ownerLabel = acct ? (acct.isShared ? 'Shared' : acct.owners[0]?.displayName ?? '—') : '—';
    return allRows.slice(0, 5).map((row) => {
      const amt = normalizeAmount(row[mapping.amount] || '0');
      return {
        date: parseDate(row[mapping.date] || ''),
        merchant: row[mapping.description] || '',
        category: '—',
        account: acctLabel,
        stmt: row[mapping.description] || '',
        amount: sign === 'bank' ? -amt : amt,
        owner: ownerLabel,
      };
    });
  }, [parseResult, allRows, mapping, sign, csvAccountId, accounts]);

  // ── CSV handlers ─────────────────────────────────────────────────────────────
  const handleCsvFile = async (f: File) => {
    if (!csvAccountId) { addToast('Select an account before uploading.', 'error'); return; }
    setFile(f);
    const fd = new FormData();
    fd.append('file', f);
    try {
      const res = await apiFetch<{ data: ParseResult }>('/import/parse', { method: 'POST', body: fd });
      setParseResult(res.data);
      setMapping(res.data.suggestedMapping);
      if (res.data.detectedFormat === 'venmo') {
        const h = res.data.headers.map((x) => x.toLowerCase());
        setVenmoMapping({ from: h.findIndex((x) => /^from$/i.test(x)), to: h.findIndex((x) => /^to$/i.test(x)), note: h.findIndex((x) => /note/i.test(x)) });
      } else {
        setVenmoMapping({ from: -1, to: -1, note: -1 });
      }
      // Re-parse locally to hold all rows.
      const text = await f.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const hri = res.data.headerRowIndex ?? 0;
      let rows = lines.slice(hri + 1).map(parseLine).filter((r) => r.some((c) => c.trim()));
      if (res.data.detectedFormat === 'venmo') {
        const hLower = res.data.headers.map((x) => x.toLowerCase());
        const typeIdx = hLower.findIndex((x) => /^type$/i.test(x));
        const statusIdx = hLower.findIndex((x) => /^status$/i.test(x));
        const dateIdx = hLower.findIndex((x) => /datetime|date/i.test(x));
        const fromIdx = hLower.findIndex((x) => /^from$/i.test(x));
        const toIdx = hLower.findIndex((x) => /^to$/i.test(x));
        rows = rows.filter((row) => {
          const type = typeIdx >= 0 ? row[typeIdx]?.trim() || '' : '';
          const status = statusIdx >= 0 ? row[statusIdx]?.trim() || '' : '';
          const from = fromIdx >= 0 ? row[fromIdx]?.trim() || '' : '';
          const to = toIdx >= 0 ? row[toIdx]?.trim() || '' : '';
          if (!isImportableVenmoRow(type, status, from, to)) return false;
          if (dateIdx >= 0) { const dv = row[dateIdx]?.trim() || ''; if (!dv || isNaN(new Date(dv).getTime())) return false; }
          return true;
        });
      }
      setAllRows(rows);
      setCsvStep(2);
    } catch (err) {
      console.error('CSV parse failed', err);
      addToast('Failed to parse CSV file.', 'error');
      setFile(null);
    }
  };

  const handleAutoCategorize = async () => {
    if (!parseResult || !csvAccountId) return;
    const acct = accounts.find((a) => a.id === csvAccountId);
    const isVenmo = parseResult.detectedFormat === 'venmo' || acct?.type === 'venmo';
    const hLower = parseResult.headers.map((x) => x.toLowerCase());
    const venmoTypeIdx = hLower.findIndex((x) => /^type$/i.test(x));

    const items = allRows.map((row, rowIdx) => {
      let description = row[mapping.description] || '';
      let venmoNote: string | undefined;
      if (isVenmo && venmoMapping.from >= 0 && venmoMapping.to >= 0) {
        const from = row[venmoMapping.from]?.trim() || '';
        const to = row[venmoMapping.to]?.trim() || '';
        const note = venmoMapping.note >= 0 ? row[venmoMapping.note]?.trim() || '' : '';
        venmoNote = note || undefined;
        const rawAmt = normalizeAmount(row[mapping.amount] || '0');
        const type = venmoTypeIdx >= 0 ? row[venmoTypeIdx]?.trim() || '' : '';
        description = buildVenmoDescription(type, from, to, note, rawAmt);
      }
      return { description, amount: normalizeAmount(row[mapping.amount] || '0'), venmoNote, rowIdx };
    }).filter((it) => it.description.trim());

    try {
      const res = await apiFetch<{ data: { description: string; suggestedCategoryId: number | null; confidence: number; source?: string }[] }>(
        '/import/categorize',
        {
          method: 'POST',
          body: JSON.stringify({
            accountId: csvAccountId,
            // Ledger sign (positive = money out), matching what the row will be
            // imported as. The resolver reads direction to tell a card payment
            // from a card refund, so an unflipped amount would mislead it.
            items: items.map((it) => ({
              description: it.description,
              amount: sign === 'bank' ? -it.amount : it.amount,
              venmoNote: it.venmoNote,
            })),
          }),
        },
      );
      const rows: ImpCsvRow[] = res.data.map((cat, i) => {
        const src = items[i];
        const row = allRows[src.rowIdx];
        const amt = normalizeAmount(row[mapping.amount] || '0');
        return {
          date: parseDate(row[mapping.date] || ''),
          description: cat.description,
          note: src.venmoNote,
          amount: sign === 'bank' ? -amt : amt,
          confidence: cat.confidence,
          categoryId: cat.suggestedCategoryId,
          source: cat.source ?? null,
          duplicateStatus: 'none',
          isLikelyTransfer: false,
          isDismissedTransfer: false,
        };
      });

      // Duplicate detection (batch).
      try {
        const dupRes = await apiFetch<{ data: { index: number; status: 'exact' | 'possible' | 'none' }[] }>(
          '/import/check-duplicates',
          { method: 'POST', body: JSON.stringify({ items: rows.map((r) => ({ date: r.date, amount: r.amount, description: r.description })) }) },
        );
        for (const d of dupRes.data) if (d.status !== 'none' && rows[d.index]) rows[d.index].duplicateStatus = d.status;
      } catch { /* ignore */ }

      // Previously-dismissed transfers → auto-unselect.
      try {
        const dis = await apiFetch<{ data: boolean[] }>(
          '/import/check-dismissed-transfers',
          { method: 'POST', body: JSON.stringify({ accountId: csvAccountId, items: rows.map((r) => ({ date: r.date, amount: r.amount, description: r.description })) }) },
        );
        dis.data.forEach((d, i) => { if (d && rows[i]) { rows[i].isLikelyTransfer = true; rows[i].isDismissedTransfer = true; } });
      } catch { /* ignore */ }

      const sel = new Set(rows.map((_, i) => i));
      rows.forEach((r, i) => { if (r.duplicateStatus === 'exact' || r.categoryId == null || r.isDismissedTransfer) sel.delete(i); });
      setCsvRows(rows);
      setCsvSelected(sel);
      setCsvStep(3);
    } catch (err) {
      console.error('Auto-categorize failed', err);
      addToast('Failed to categorize transactions.', 'error');
    }
  };

  const handleCsvImport = async () => {
    if (!csvAccountId) return;
    const valid = csvRows.filter((r, i) => csvSelected.has(i) && r.categoryId != null);
    if (valid.length === 0) { addToast('No categorized transactions selected.', 'error'); return; }
    setCsvImporting(true);
    try {
      await apiFetch('/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          accountId: csvAccountId,
          // User-picked rows (source null) commit as manual — no confidence, no
          // review flag; auto-suggested rows keep confidence/source so low ones
          // land in the review queue (same contract as bank sync).
          transactions: valid.map((r) => ({
            date: r.date, description: r.description, note: r.note, categoryId: r.categoryId, amount: r.amount,
            confidence: r.source ? r.confidence : null, source: r.source ?? null,
          })),
        }),
      });
      addToast(`Import complete — ${valid.length} transactions imported`);
      navigate('/transactions');
    } catch {
      addToast('Import failed', 'error');
    } finally {
      setCsvImporting(false);
    }
  };

  const onCsvAccountChange = (id: number | '') => {
    setCsvAccountId(id);
    if (id) { const a = accounts.find((x) => x.id === id); setSign(a?.type === 'credit' ? 'credit' : 'bank'); }
  };

  // ── Bank Sync handlers ───────────────────────────────────────────────────────
  const handleFetch = useCallback(async ({ accountIds, startDate, endDate }: { accountIds: number[]; startDate: string; endDate: string }) => {
    setFetching(true);
    setFetchedRange({ startDate, endDate });
    try {
      const res = await apiFetch<{ data: { transactions: (ImpSyncRow & { suggestedCategoryId: number | null; suggestedSource?: string })[] } }>(
        '/simplefin/sync',
        { method: 'POST', body: JSON.stringify({ accountIds, startDate, endDate }) },
      );
      const rows: ImpSyncRow[] = res.data.transactions.map((t) => ({
        simplefinId: t.simplefinId,
        accountId: t.accountId,
        accountName: t.accountName,
        date: t.date,
        description: t.description,
        rawDescription: t.rawDescription,
        amount: t.amount,
        confidence: t.confidence,
        categoryId: t.suggestedCategoryId,
        source: t.suggestedSource ?? null,
        duplicateStatus: t.duplicateStatus,
        isLikelyTransfer: t.isLikelyTransfer,
        isDismissedTransfer: false,
      }));

      // Previously-dismissed transfers → auto-unselect (per account). The check
      // endpoint is gated by import.csv, so skip it for bank-sync-only users
      // (avoids a spurious 403/permission toast).
      if (hasPermission('import.csv')) {
        const byAccount = new Map<number, number[]>();
        rows.forEach((t, i) => { if (!byAccount.has(t.accountId)) byAccount.set(t.accountId, []); byAccount.get(t.accountId)!.push(i); });
        for (const [accountId, idxs] of byAccount.entries()) {
          try {
            const check = await apiFetch<{ data: boolean[] }>('/import/check-dismissed-transfers', {
              method: 'POST',
              body: JSON.stringify({ accountId, items: idxs.map((i) => ({ date: rows[i].date, amount: rows[i].amount, description: rows[i].description })) }),
            });
            check.data.forEach((d, j) => { if (d) { rows[idxs[j]].isLikelyTransfer = true; rows[idxs[j]].isDismissedTransfer = true; } });
          } catch { /* ignore */ }
        }
      }

      const sel = new Set(rows.map((_, i) => i));
      rows.forEach((t, i) => { if (t.duplicateStatus === 'exact' || t.categoryId == null || t.isDismissedTransfer) sel.delete(i); });
      setSyncRows(rows);
      setSyncSelected(sel);
      setSyncStep(2);
    } catch {
      addToast('Failed to fetch from SimpleFIN. Check your connection in Settings.', 'error');
    } finally {
      setFetching(false);
    }
  }, [addToast, hasPermission]);

  const handleSyncImport = async () => {
    const valid = syncRows.filter((r, i) => syncSelected.has(i) && r.categoryId != null);
    if (valid.length === 0) return;
    setSyncImporting(true);
    try {
      const res = await apiFetch<{ data: { transactionsImported: number } }>('/simplefin/commit', {
        method: 'POST',
        body: JSON.stringify({
          transactions: valid.map((r) => ({
            simplefinId: r.simplefinId, accountId: r.accountId, date: r.date,
            description: r.description, rawDescription: r.rawDescription, amount: r.amount,
            categoryId: r.categoryId, confidence: r.confidence ?? null, source: r.source ?? null,
          })),
          balanceUpdates: [],
          holdingsUpdates: [],
        }),
      });
      addToast(`Imported ${res.data.transactionsImported} transactions`);
      const r = fetchedRange;
      navigate(r ? `/transactions?startDate=${r.startDate}&endDate=${r.endDate}` : '/transactions');
    } catch {
      addToast('Import failed', 'error');
    } finally {
      setSyncImporting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const stepLabels = mode === 'csv' ? ['Upload File', 'Map Columns', 'Review & Categorize'] : ['Select & Fetch', 'Review & Import'];
  const activeIndex = mode === 'csv' ? csvStep - 1 : syncStep - 1;
  const subtitle = mode === 'csv' ? 'Import a CSV from your bank, credit card, or Venmo.' : 'Pull new transactions directly from your connected accounts.';

  const toggle = (
    <SegmentedControl
      className="flex-none"
      value={mode}
      onChange={(m) => switchMode(m)}
      options={[{ value: 'csv', label: 'CSV Import' }, { value: 'sync', label: 'Bank Sync' }]}
    />
  );

  const csvOk = hasPermission('import.csv');
  const syncOk = hasPermission('import.bank_sync');
  const permMsg = (
    <div className="bg-surface rounded-[16px] border border-line px-6 py-8 text-center text-content-3 text-[13px]">
      You don't have permission to use this. Contact an admin to request access.
    </div>
  );

  return (
    <div className="font-sans">
      <MobileBar title="Import" />
      {/* header (phones: the title is in the app bar) */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-5 mb-5 md:mb-[22px]">
        <div className="min-w-0">
          <h1 className="hidden md:block text-[28px] font-extrabold tracking-[-0.02em] m-0 text-content">Import Transactions</h1>
          <p className="text-sm text-content-3 md:mt-1.5 m-0">{subtitle}</p>
        </div>
        {toggle}
      </div>

      <Stepper labels={stepLabels} activeIndex={activeIndex} />

      {mode === 'sync' && (!syncOk ? permMsg : (
        syncStep === 1
          ? <BankSyncSelect accounts={syncAccounts} fetching={fetching} onFetch={handleFetch} />
          : <SyncReview rows={syncRows} setRows={setSyncRows} selected={syncSelected} setSelected={setSyncSelected} categories={categories} accountsById={accountsById} vendorOptions={vendorOptions} merchantLogos={merchantLogos} onBack={() => setSyncStep(1)} onImport={handleSyncImport} importing={syncImporting} />
      ))}

      {mode === 'csv' && (!csvOk ? permMsg : (
        <>
          {csvStep === 1 && (
            <CsvUpload accounts={accounts} accountId={csvAccountId} onAccountChange={onCsvAccountChange} onFile={handleCsvFile} />
          )}
          {csvStep === 2 && parseResult && (
            <CsvMap
              fileName={file?.name ?? 'Uploaded file'}
              metaLine={`${accounts.find((a) => a.id === csvAccountId)?.name ?? ''} · ${allRows.length.toLocaleString()} transactions · Format: ${parseResult.detectedFormat}`}
              headers={parseResult.headers}
              mapping={mapping}
              onMappingChange={(field, idx) => setMapping((m) => ({ ...m, [field]: idx }))}
              sign={sign}
              onSignChange={setSign}
              preview={csvPreview}
              onBack={() => setCsvStep(1)}
              onNext={handleAutoCategorize}
            />
          )}
          {csvStep === 3 && (
            <CsvReview rows={csvRows} setRows={setCsvRows} selected={csvSelected} setSelected={setCsvSelected} categories={categories} vendorOptions={vendorOptions} merchantLogos={merchantLogos} onBack={() => setCsvStep(2)} onImport={handleCsvImport} importing={csvImporting} />
          )}
        </>
      ))}
    </div>
  );
}
