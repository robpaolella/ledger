import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { useToast } from '../context/ToastContext';
import ResponsiveModal from './ResponsiveModal';

/* Manual, on-demand SimpleFIN pull for a date range. Fetches candidate
 * transactions via /simplefin/sync (all accessible linked accounts) and commits
 * every non-duplicate one via /simplefin/commit — uncategorized rows land in the
 * Needs-review queue, exact duplicates are skipped. Balances/holdings returned by
 * the sync are refreshed too. A heavier review-before-import wizard lives on the
 * Import page (BankSyncPanel); this is the quick path. */

interface SyncCandidate {
  simplefinId: string;
  accountId: number;
  date: string;
  description: string;
  rawDescription: string;
  amount: number;
  suggestedCategoryId: number | null;
  suggestedSource?: string;
  confidence: number;
  duplicateStatus: 'exact' | 'possible' | 'none';
}
interface BalanceUpdate { accountId: number; currentBalance: number; balanceDate: string }
interface HoldingsUpdate { accountId: number; holdings: { symbol: string; description: string; shares: number; costBasis: number; marketValue: number }[] }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

type PresetKey = '30' | '60' | '90' | 'month' | 'custom';
const PRESETS: { key: PresetKey; label: string }[] = [
  { key: '30', label: 'Last 30 days' },
  { key: '60', label: 'Last 60 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
];

export default function ManualImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { addToast } = useToast();
  const [preset, setPreset] = useState<PresetKey>('30');
  const [customStart, setCustomStart] = useState(daysAgo(30));
  const [customEnd, setCustomEnd] = useState(iso(new Date()));
  const [busy, setBusy] = useState(false);

  const range = (): { startDate: string; endDate: string } => {
    const today = iso(new Date());
    switch (preset) {
      case '30': return { startDate: daysAgo(30), endDate: today };
      case '60': return { startDate: daysAgo(60), endDate: today };
      case '90': return { startDate: daysAgo(90), endDate: today };
      case 'month': return { startDate: monthStart(), endDate: today };
      case 'custom': return { startDate: customStart, endDate: customEnd };
    }
  };

  const runImport = async () => {
    const { startDate, endDate } = range();
    if (!startDate || !endDate) { addToast('Pick a start and end date', 'error'); return; }
    if (startDate > endDate) { addToast('Start date must be on or before the end date', 'error'); return; }

    setBusy(true);
    try {
      const sync = await apiFetch<{ data: { transactions: SyncCandidate[]; balanceUpdates: BalanceUpdate[]; holdingsUpdates: HoldingsUpdate[] } }>(
        '/simplefin/sync',
        { method: 'POST', body: JSON.stringify({ startDate, endDate }) },
      );
      const candidates = sync.data.transactions;
      // Skip exact duplicates (already imported); import everything else. Rows the
      // categorizer couldn't place come in uncategorized and get flagged for review.
      const fresh = candidates.filter((t) => t.duplicateStatus !== 'exact');
      const skipped = candidates.length - fresh.length;

      const commit = await apiFetch<{ data: { transactionsImported: number; balancesUpdated: number; holdingsUpdated: number } }>(
        '/simplefin/commit',
        {
          method: 'POST',
          body: JSON.stringify({
            transactions: fresh.map((t) => ({
              simplefinId: t.simplefinId,
              accountId: t.accountId,
              date: t.date,
              description: t.description,
              rawDescription: t.rawDescription,
              amount: t.amount,
              categoryId: t.suggestedCategoryId ?? undefined,
              confidence: t.confidence ?? null,
              source: t.suggestedSource ?? null,
            })),
            balanceUpdates: sync.data.balanceUpdates.map((b) => ({ accountId: b.accountId, balance: b.currentBalance, date: b.balanceDate })),
            holdingsUpdates: sync.data.holdingsUpdates.map((h) => ({ accountId: h.accountId, holdings: h.holdings })),
          }),
        },
      );

      const parts: string[] = [];
      if (commit.data.transactionsImported > 0) parts.push(`${commit.data.transactionsImported} transaction${commit.data.transactionsImported === 1 ? '' : 's'}`);
      if (commit.data.balancesUpdated > 0) parts.push(`${commit.data.balancesUpdated} balance${commit.data.balancesUpdated === 1 ? '' : 's'}`);
      const dupeNote = skipped > 0 ? ` (${skipped} duplicate${skipped === 1 ? '' : 's'} skipped)` : '';
      addToast(parts.length ? `Imported ${parts.join(' + ')}${dupeNote}` : `No new transactions in that range${dupeNote}`);
      onImported();
      onClose();
    } catch {
      addToast('Import failed. Check your SimpleFIN connection in Settings.', 'error');
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal isOpen={true} onClose={busy ? () => {} : onClose} title="Manual Import" maxWidth="30rem">
      <div className="p-5 md:p-6">
        <div className="hidden md:flex items-start justify-between mb-1">
          <h2 className="text-[20px] font-extrabold tracking-tight text-content m-0">Manual Import</h2>
          <button onClick={onClose} disabled={busy} className="w-9 h-9 -mt-1 -mr-1 flex items-center justify-center rounded-[9px] text-content-2 hover:bg-surface-2 disabled:opacity-40">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <p className="text-[13px] text-content-3 mb-5 leading-snug">Pull transactions from all linked bank accounts for a date range. Duplicates are skipped; anything we can’t auto-categorize goes to your review queue.</p>

        <div className="text-[12px] font-bold uppercase tracking-wide text-content-3 mb-2">Date range</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`h-9 px-3.5 rounded-[10px] text-sm font-semibold border transition-colors ${preset === p.key ? 'bg-primary text-on-primary border-primary' : 'bg-surface border-line-strong text-content-2 hover:bg-surface-2'}`}>
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-3 mb-2">
            <label className="flex-1">
              <span className="block text-[12px] font-semibold text-content-3 mb-1">Start</span>
              <input type="date" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)}
                className="w-full h-11 px-3 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none focus:border-primary" />
            </label>
            <label className="flex-1">
              <span className="block text-[12px] font-semibold text-content-3 mb-1">End</span>
              <input type="date" value={customEnd} min={customStart} max={iso(new Date())} onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full h-11 px-3 rounded-[11px] bg-surface-2 border border-line text-content text-sm outline-none focus:border-primary" />
            </label>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 mt-6">
          <button onClick={onClose} disabled={busy} className="h-11 px-4 rounded-[11px] border border-line-strong bg-surface-2 text-content font-semibold text-sm disabled:opacity-40">Cancel</button>
          <button onClick={runImport} disabled={busy}
            className="h-11 px-5 rounded-[11px] bg-primary text-on-primary font-bold text-sm shadow-sm hover:bg-primary-hover disabled:opacity-60 inline-flex items-center gap-2">
            {busy && <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>}
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
