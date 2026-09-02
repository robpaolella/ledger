/** Bank Sync · Step 2 — Review & Import (docs/Import Flow §BANK SYNC step 2). */
import type { Dispatch, SetStateAction } from 'react';
import { VendorAvatar } from '../primitives';
import { ImpCheckbox, VendorCell, CategoryCell, ConfidenceLabel, AmountText, vendorColor, type ImpCategory } from './cells';
import type { ImpSyncRow, AccountMeta } from './types';

export default function SyncReview({
  rows, setRows, selected, setSelected, categories, accountsById, vendorOptions, merchantLogos, onBack, onImport, importing,
}: {
  rows: ImpSyncRow[];
  setRows: Dispatch<SetStateAction<ImpSyncRow[]>>;
  selected: Set<number>;
  setSelected: Dispatch<SetStateAction<Set<number>>>;
  categories: ImpCategory[];
  accountsById: Map<number, AccountMeta>;
  vendorOptions: string[];
  merchantLogos: Map<string, string>;
  onBack: () => void;
  onImport: () => void;
  importing: boolean;
}) {
  const selectedCount = selected.size;
  const importable = rows.filter((r, i) => selected.has(i) && r.categoryId != null).length;
  const allOn = rows.length > 0 && selected.size === rows.length;
  const someOn = selected.size > 0 && !allOn;

  const toggle = (i: number) => setSelected((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const toggleAll = () => setSelected(() => (allOn ? new Set<number>() : new Set(rows.map((_, i) => i))));
  const setCategory = (i: number, catId: number) => {
    setRows((prev) => prev.map((r, j) => j === i ? { ...r, categoryId: catId, confidence: 1, source: null } : r));
    // Categorizing arms the row for import — except don't re-arm auto-skipped duplicates.
    if (rows[i]?.duplicateStatus !== 'exact') setSelected((prev) => new Set(prev).add(i));
  };
  const setVendor = (i: number, name: string) => setRows((prev) => prev.map((r, j) => j === i ? { ...r, description: name } : r));
  const logoFor = (name: string) => merchantLogos.get(name.trim().toLowerCase());

  return (
    <div>
      <div onClick={onBack} className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-content-2 cursor-pointer mb-4 hover:text-content transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
        Back to selection
      </div>

      <div className="border border-line rounded-[16px] bg-surface overflow-visible shadow-sm" style={{ marginTop: 18 }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="font-bold text-base text-content">New transactions <span className="text-content-3 font-semibold">· {selectedCount} of {rows.length} selected</span></div>
        </div>

        {/* column head */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-line font-mono text-[10.5px] tracking-[0.06em] uppercase text-content-3">
          <ImpCheckbox checked={allOn} indeterminate={someOn} onClick={toggleAll} title="Select all" />
          <span className="w-[74px] flex-none">Date</span>
          <span className="flex-[1.2] min-w-0">Vendor</span>
          <span className="flex-1 min-w-0">Account</span>
          <span className="w-[300px] flex-none">Category</span>
          <span className="w-[110px] flex-none text-right">Amount</span>
        </div>

        {rows.map((r, i) => {
          const on = selected.has(i);
          const acct = accountsById.get(r.accountId);
          const acctName = acct?.name ?? r.accountName;
          const acctLabel = acct?.lastFour ? `${acctName} (${acct.lastFour})` : acctName;
          return (
            <div key={r.simplefinId} className="flex items-center gap-4 px-5 py-3.5 border-b border-line" style={{ background: on ? 'transparent' : 'color-mix(in srgb, var(--bg) 40%, transparent)' }}>
              <ImpCheckbox checked={on} onClick={() => toggle(i)} />
              <span className="w-[74px] flex-none font-mono text-xs text-content-3">{r.date}</span>
              <VendorCell value={r.description} note={r.rawDescription && r.rawDescription !== r.description ? r.rawDescription : undefined} options={vendorOptions} onSelect={(v) => setVendor(i, v)} logoSrc={logoFor(r.description)} />
              <div className="flex-1 min-w-0 flex items-center gap-2.5">
                <VendorAvatar name={acctName} src={acct?.logoSrc} color={acct?.color ?? vendorColor(acctName)} size={22} />
                <span className="min-w-0 font-mono text-[11.5px] text-content-2 truncate">{acctLabel}</span>
              </div>
              <div className="w-[300px] flex-none flex items-center gap-2">
                <CategoryCell categoryId={r.categoryId} categories={categories} grouped={false} onSelect={(c) => setCategory(i, c)} />
                <ConfidenceLabel confidence={r.confidence} variant="sync" />
              </div>
              <AmountText amount={r.amount} />
            </div>
          );
        })}
        {rows.length === 0 && <div className="px-5 py-10 text-center text-content-3 text-sm">No new transactions in this window.</div>}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between gap-4 mt-5 px-5 py-4 border border-line rounded-[16px] bg-surface shadow-sm sticky bottom-4">
        <div className="text-[13.5px] text-content-2"><strong className="text-content">{importable} transactions</strong> will be added to your ledger.</div>
        <div className="flex gap-2.5">
          <button onClick={onBack} className="h-12 px-5 border border-line-strong rounded-[11px] bg-surface-2 text-content font-sans font-semibold text-sm cursor-pointer">Back</button>
          <button onClick={onImport} disabled={importable === 0 || importing}
            className="h-12 px-[26px] border-none rounded-[11px] text-on-primary font-sans font-bold text-sm shadow-sm"
            style={{ background: importable === 0 ? 'var(--surface-2)' : 'var(--primary)', cursor: importable === 0 ? 'not-allowed' : 'pointer', opacity: importable === 0 ? 0.6 : importing ? 0.7 : 1 }}>
            {importing ? 'Importing…' : importable === 0 ? 'Nothing selected' : `Import ${importable} transactions`}
          </button>
        </div>
      </div>
    </div>
  );
}
