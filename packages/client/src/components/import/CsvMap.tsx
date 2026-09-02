/** CSV Import · Step 2 — Map Columns (docs/Import Flow §CSV IMPORT step 2). */
import { money, amountParts } from './cells';

export interface CsvPreviewRow {
  date: string;
  merchant: string;
  category: string;
  account: string;
  stmt: string;
  amount: number;   // ledger sign (money-out positive)
  owner: string;
}

type MapField = 'date' | 'description' | 'amount';

export default function CsvMap({
  fileName, metaLine, headers, mapping, onMappingChange, sign, onSignChange, preview, onBack, onNext,
}: {
  fileName: string;
  metaLine: string;
  headers: string[];
  mapping: Record<MapField, number>;
  onMappingChange: (field: MapField, idx: number) => void;
  sign: 'bank' | 'credit';
  onSignChange: (v: 'bank' | 'credit') => void;
  preview: CsvPreviewRow[];
  onBack: () => void;
  onNext: () => void;
}) {
  const fields: { key: MapField; label: string }[] = [
    { key: 'date', label: 'Date' },
    { key: 'description', label: 'Description' },
    { key: 'amount', label: 'Amount' },
  ];
  const signTiles: { key: 'bank' | 'credit'; label: string }[] = [
    { key: 'bank', label: 'Positive = money in, negative = money out' },
    { key: 'credit', label: 'Positive = money out, negative = money in' },
  ];

  return (
    <div className="border border-line rounded-[16px] bg-surface p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-1.5">
        <div onClick={onBack} className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-primary cursor-pointer">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>Back
        </div>
        <button onClick={onNext} className="h-12 px-[22px] border-none rounded-[11px] bg-primary text-on-primary font-sans font-bold text-sm cursor-pointer flex items-center gap-2">
          Next<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
      <div className="text-[19px] font-extrabold tracking-[-0.01em] text-content">{fileName}</div>
      <div className="font-mono text-[12.5px] text-content-3 mt-1">{metaLine}</div>

      {/* column mapping */}
      <div className="border border-line rounded-[14px] bg-surface-2 p-5 mt-[22px]">
        <div className="font-bold text-sm mb-4 text-content">Column mapping</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {fields.map((f) => (
            <div key={f.key}>
              <div className="text-xs text-content-3 mb-1.5">{f.label}</div>
              <div className="relative">
                <select value={mapping[f.key]} onChange={(e) => onMappingChange(f.key, parseInt(e.target.value, 10))} className="w-full h-11 pl-3.5 pr-[38px] bg-elevated border border-line-strong rounded-[11px] text-content font-sans font-semibold text-sm cursor-pointer appearance-none">
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="absolute right-[13px] top-1/2 -translate-y-1/2 pointer-events-none"><path d="m6 9 6 6 6-6" /></svg>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* sign convention */}
      <div className="border border-line rounded-[14px] bg-surface-2 p-5 mt-4">
        <div className="font-bold text-sm mb-3.5 text-content">Amount sign convention</div>
        <div className="flex gap-2.5 flex-wrap">
          {signTiles.map((o) => {
            const on = sign === o.key;
            return (
              <div key={o.key} onClick={() => onSignChange(o.key)} className="h-10 px-[18px] rounded-[11px] flex items-center text-[13.5px] font-semibold cursor-pointer"
                style={{ background: on ? 'var(--primary)' : 'var(--elevated)', color: on ? 'var(--on-primary)' : 'var(--text-2)', border: `1px solid ${on ? 'var(--primary)' : 'var(--line-strong)'}` }}>
                {o.label}
              </div>
            );
          })}
        </div>
        <div className="text-[12.5px] text-content-3 mt-3">{sign === 'bank' ? 'Standard for bank accounts (checking, savings).' : 'Common for credit-card exports.'}</div>
      </div>

      {/* preview */}
      <div className="font-mono text-[11px] tracking-[0.06em] uppercase text-content-3 mt-6 mb-2.5">Preview · first 5 rows</div>
      <div className="imp-scroll overflow-x-auto border border-line rounded-[12px]">
        <div className="min-w-[900px]">
          <div className="flex items-center gap-3.5 px-4 py-[11px] border-b border-line bg-surface-2 font-mono text-[10.5px] tracking-[0.05em] uppercase text-content-3">
            <span className="w-[88px] flex-none">Date</span>
            <span className="w-[150px] flex-none">Merchant</span>
            <span className="w-[130px] flex-none">Category</span>
            <span className="w-[150px] flex-none">Account</span>
            <span className="flex-1 min-w-0">Original statement</span>
            <span className="w-[100px] flex-none text-right">Amount</span>
            <span className="w-[70px] flex-none">Owner</span>
          </div>
          {preview.map((p, i) => {
            const { sign, moneyIn } = amountParts(p.amount);
            return (
              <div key={i} className="flex items-center gap-3.5 px-4 py-3 border-b border-line text-[12.5px] last:border-b-0">
                <span className="w-[88px] flex-none font-mono text-content-3">{p.date}</span>
                <span className="w-[150px] flex-none font-semibold truncate text-content">{p.merchant}</span>
                <span className="w-[130px] flex-none text-content-2 truncate">{p.category}</span>
                <span className="w-[150px] flex-none font-mono text-[11px] text-content-3 truncate">{p.account}</span>
                <span className="flex-1 min-w-0 font-mono text-[11px] text-content-3 truncate">{p.stmt}</span>
                <span className="w-[100px] flex-none text-right font-mono font-semibold" style={{ color: moneyIn ? 'var(--positive)' : 'var(--text)' }}>{sign}{money(p.amount)}</span>
                <span className="w-[70px] flex-none text-content-3 truncate">{p.owner}</span>
              </div>
            );
          })}
          {preview.length === 0 && <div className="px-4 py-6 text-content-3 text-sm">No preview rows.</div>}
        </div>
      </div>
    </div>
  );
}
