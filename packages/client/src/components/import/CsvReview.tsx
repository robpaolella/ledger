/** CSV Import · Step 3 — Review & Categorize (docs/Import Flow §CSV IMPORT step 3). */
import type { Dispatch, SetStateAction } from 'react';
import { ImpCheckbox, VendorCell, CategoryCell, ConfidenceLabel, AmountText, DuplicateIcon, type ImpCategory } from './cells';
import type { ImpCsvRow } from './types';

export default function CsvReview({
  rows, setRows, selected, setSelected, categories, vendorOptions, merchantLogos, onBack, onImport, importing,
}: {
  rows: ImpCsvRow[];
  setRows: Dispatch<SetStateAction<ImpCsvRow[]>>;
  selected: Set<number>;
  setSelected: Dispatch<SetStateAction<Set<number>>>;
  categories: ImpCategory[];
  vendorOptions: string[];
  merchantLogos: Map<string, string>;
  onBack: () => void;
  onImport: () => void;
  importing: boolean;
}) {
  const selectedCount = selected.size;
  const importable = rows.filter((r, i) => selected.has(i) && r.categoryId != null).length;
  const dupCount = rows.filter((r, i) => selected.has(i) && r.categoryId != null && r.duplicateStatus !== 'none').length;
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
      <div className="flex items-center gap-3.5 mb-4 flex-wrap">
        <div onClick={onBack} className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-primary cursor-pointer">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>Back
        </div>
        <span className="h-[26px] px-[11px] rounded-full inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold"
          style={{ background: 'color-mix(in srgb, var(--c-amber) 15%, transparent)', color: 'var(--c-amber)', border: '1px solid color-mix(in srgb, var(--c-amber) 35%, transparent)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z" /></svg>
          Auto-categorized
        </span>
        <span className="text-[13px] text-content-3">Click any category to change it.</span>
      </div>

      <div className="border border-line rounded-[16px] bg-surface overflow-visible shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="font-bold text-base text-content">New transactions <span className="text-content-3 font-semibold">· {selectedCount} of {rows.length} selected</span></div>
        </div>

        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-line font-mono text-[10.5px] tracking-[0.06em] uppercase text-content-3">
          <ImpCheckbox checked={allOn} indeterminate={someOn} onClick={toggleAll} title="Select all" />
          <span className="w-[74px] flex-none">Date</span>
          <span className="flex-1 min-w-0">Description</span>
          <span className="w-[300px] flex-none">Category</span>
          <span className="w-[110px] flex-none text-right">Amount</span>
        </div>

        {rows.map((r, i) => {
          const on = selected.has(i);
          return (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-line" style={{ background: on ? 'transparent' : 'color-mix(in srgb, var(--bg) 40%, transparent)' }}>
              <ImpCheckbox checked={on} onClick={() => toggle(i)} />
              <span className="w-[74px] flex-none font-mono text-xs text-content-3">{r.date}</span>
              <VendorCell
                value={r.description}
                options={vendorOptions}
                onSelect={(v) => setVendor(i, v)}
                logoSrc={logoFor(r.description)}
                dupIcon={r.duplicateStatus !== 'none' ? <DuplicateIcon status={r.duplicateStatus} /> : undefined}
              />
              <div className="w-[300px] flex-none flex items-center gap-2">
                <CategoryCell categoryId={r.categoryId} categories={categories} grouped onSelect={(c) => setCategory(i, c)} />
                <ConfidenceLabel confidence={r.confidence} variant="csv" />
              </div>
              <AmountText amount={r.amount} />
            </div>
          );
        })}
        {rows.length === 0 && <div className="px-5 py-10 text-center text-content-3 text-sm">No transactions to review.</div>}
      </div>

      <div className="flex items-center justify-between gap-4 mt-5 px-5 py-4 border border-line rounded-[16px] bg-surface shadow-sm sticky bottom-4">
        <div className="text-[13.5px] text-content-2"><strong className="text-content">{importable} transactions</strong> will be imported{dupCount > 0 ? ` (${dupCount} flagged as duplicates)` : ''}.</div>
        <div className="flex gap-2.5">
          <button onClick={onBack} className="h-[46px] px-5 border border-line-strong rounded-[12px] bg-surface-2 text-content font-sans font-semibold text-sm cursor-pointer">Back</button>
          <button onClick={onImport} disabled={importable === 0 || importing}
            className="h-[46px] px-[26px] border-none rounded-[12px] text-on-primary font-sans font-bold text-sm shadow-sm"
            style={{ background: importable === 0 ? 'var(--surface-2)' : 'var(--primary)', cursor: importable === 0 ? 'not-allowed' : 'pointer', opacity: importable === 0 ? 0.6 : importing ? 0.7 : 1 }}>
            {importing ? 'Importing…' : importable === 0 ? 'Nothing selected' : `Import ${importable} transactions`}
          </button>
        </div>
      </div>
    </div>
  );
}
